'use strict';
/**
 * Platforms Router  —  /api/v1/platforms
 * Unified endpoint for:
 *   - Listing all connected platform accounts + live health
 *   - Quick-posting to any platform in one call
 *   - Per-platform account CRUD
 *   - Platform rate-limit status
 */
const express = require('express');
const { Account, Campaign, MessageLog } = require('../models');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
router.use(authenticate);

// ── GET /  — all platform accounts with aggregated stats ─────────────────
router.get('/', async (req, res) => {
  const accounts = await Account.find({ userId: req.user._id })
    .select('-credentials.password -credentials.sessionData -credentials.apiKey')
    .lean();

  // Group by platform and add 30-day message count
  const platforms = {};
  for (const acc of accounts) {
    if (!platforms[acc.platform]) {
      platforms[acc.platform] = { platform: acc.platform, accounts: [], totalMessages: 0 };
    }
    platforms[acc.platform].accounts.push(acc);
  }

  // Add 30-day message counts per platform
  const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const msgStats = await MessageLog.aggregate([
    { $match: { userId: req.user._id, createdAt: { $gte: fromDate } } },
    { $group: { _id: '$platform', count: { $sum: 1 }, delivered: { $sum: { $cond: [{ $in: ['$status', ['delivered','read','opened']] }, 1, 0] } } } },
  ]);
  msgStats.forEach(s => {
    if (platforms[s._id]) {
      platforms[s._id].totalMessages  = s.count;
      platforms[s._id].deliveredCount = s.delivered;
    }
  });

  res.json({ success: true, data: Object.values(platforms) });
});

// ── GET /health  — health check all accounts ─────────────────────────────
router.get('/health', async (req, res) => {
  const accounts = await Account.find({ userId: req.user._id })
    .select('platform username status health limits lastActive')
    .lean();

  const summary = {
    total:    accounts.length,
    active:   accounts.filter(a => a.status === 'active').length,
    blocked:  accounts.filter(a => a.status === 'blocked').length,
    warning:  accounts.filter(a => a.status === 'warning').length,
    avgHealth: accounts.length
      ? Math.round(accounts.reduce((s, a) => s + (a.health || 100), 0) / accounts.length)
      : 100,
  };

  res.json({ success: true, data: { summary, accounts } });
});

// ── GET /:platform  — accounts for a specific platform ───────────────────
router.get('/:platform', async (req, res) => {
  const accounts = await Account.find({ userId: req.user._id, platform: req.params.platform })
    .select('-credentials.password -credentials.sessionData')
    .lean();
  res.json({ success: true, data: accounts, count: accounts.length });
});

// ── POST /:platform/post  — quick post to any platform ───────────────────
router.post('/:platform/post', async (req, res) => {
  const { accountId, text, media, scheduled } = req.body;
  const { platform } = req.params;

  if (!accountId) return res.status(400).json({ success: false, message: 'accountId required' });

  if (scheduled) {
    const campaign = await Campaign.create({
      userId:   req.user._id,
      name:     `${platform} Post — ${new Date().toLocaleDateString()}`,
      type:     platform,
      content:  { body: text, media: media || [] },
      status:   'scheduled',
      schedule: { sendAt: new Date(scheduled) },
    });
    return res.json({ success: true, message: 'Post scheduled', data: campaign });
  }

  const SocialService = require('../services/social.service');
  const result = await SocialService.post(platform, accountId, { text, media });
  res.json({ success: true, data: result });
});

// ── POST /:platform/accounts  — add a new account ────────────────────────
router.post('/:platform/accounts', async (req, res) => {
  const account = await Account.create({
    ...req.body,
    platform: req.params.platform,
    userId:   req.user._id,
  });
  res.status(201).json({ success: true, data: account });
});

// ── DELETE /:platform/accounts/:id  — remove an account ─────────────────
router.delete('/:platform/accounts/:id', async (req, res) => {
  const account = await Account.findOneAndDelete({
    _id:      req.params.id,
    userId:   req.user._id,
    platform: req.params.platform,
  });
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });
  res.json({ success: true, message: `${req.params.platform} account removed` });
});

// ── GET /rate-limits  — current send rates vs limits ─────────────────────
router.get('/rate-limits', async (req, res) => {
  const accounts = await Account.find({ userId: req.user._id })
    .select('platform username limits health status')
    .lean();

  const byPlatform = {};
  accounts.forEach(acc => {
    if (!byPlatform[acc.platform]) byPlatform[acc.platform] = [];
    byPlatform[acc.platform].push({
      id:         acc._id,
      username:   acc.username,
      dailySent:  acc.limits?.dailySent  || 0,
      dailyLimit: acc.limits?.dailyLimit || 1000,
      hourlySent: acc.limits?.hourlySent || 0,
      hourlyLimit:acc.limits?.hourlyLimit|| 100,
      usagePct:   Math.round(((acc.limits?.dailySent || 0) / (acc.limits?.dailyLimit || 1000)) * 100),
      status:     acc.status,
      health:     acc.health || 100,
    });
  });

  res.json({ success: true, data: byPlatform });
});

module.exports = router;
