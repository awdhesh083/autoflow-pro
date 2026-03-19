'use strict';
/**
 * Security Routes  —  /api/v1/security
 *
 * Endpoints:
 *   GET  /overview                     — security score + account health summary
 *   GET  /proxies                      — list active proxies
 *   POST /proxies                      — add + immediately health-check a proxy
 *   PUT  /proxies/:id                  — update proxy
 *   DELETE /proxies/:id                — remove proxy
 *   POST /proxies/health-check         — run health check on all proxies now
 *   POST /proxies/rotate/:accountId    — rotate proxy for a specific account
 *   GET  /accounts                     — all accounts with health
 *   POST /accounts/health-check        — recompute health for all accounts
 *   GET  /blocked                      — list blocked/warned accounts
 *   POST /accounts/:id/unblock         — mark account as active again
 *   GET  /webhook/:hookId/logs         — webhook delivery logs
 *   POST /webhook/:hookId/test         — send test ping to webhook
 */
const express = require('express');
const { Account, Proxy, Webhook } = require('../models');
const { authenticate }  = require('../middleware/auth');
const ProxyService      = require('../services/proxy.service');
const WebhookDispatcher = require('../services/webhook-dispatcher.service');
const { startProxyCron, runHealthCheck } = require('../workers/proxy.health');
const logger = require('../utils/logger');

const router = express.Router();
router.use(authenticate);

// ── GET /overview ─────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  const [accounts, proxies] = await Promise.all([
    Account.find({ userId: req.user._id }).select('platform username status health limits lastActive'),
    Proxy.find({ $or: [{ userId: req.user._id }, { userId: null }] }).select('country host port health isActive latencyMs lastChecked'),
  ]);

  const avgHealth    = accounts.length
    ? Math.round(accounts.reduce((s, a) => s + (a.health || 100), 0) / accounts.length)
    : 100;
  const blockedCount = accounts.filter(a => a.status === 'blocked').length;
  const warnCount    = accounts.filter(a => a.status === 'warning').length;
  const secScore     = Math.max(0, Math.min(100, Math.round(avgHealth - blockedCount * 10 - warnCount * 3)));

  res.json({
    success: true,
    data: {
      securityScore:  secScore,
      accounts:       accounts.length,
      blocked:        blockedCount,
      warning:        warnCount,
      avgHealth,
      healthyProxies: proxies.filter(p => p.isActive && p.health > 80).length,
      totalProxies:   proxies.length,
      antiDetection:  true,
      ipRotation:     proxies.length > 0,
      captchaSolver:  !!process.env.TWOCAPTCHA_API_KEY,
      proxies,
    },
  });
});

// ── Proxies ───────────────────────────────────────────────────────────────
router.get('/proxies', async (req, res) => {
  const { active } = req.query;
  const q = {};
  if (active === 'true') q.isActive = true;
  const proxies = await Proxy.find(q).select('-password').sort('-health');
  res.json({ success: true, data: proxies, count: proxies.length });
});

router.post('/proxies', async (req, res) => {
  const proxy   = await Proxy.create({ ...req.body, userId: req.user._id });
  const checked = await ProxyService.checkProxy(proxy);
  await Proxy.findByIdAndUpdate(proxy._id, {
    health:      checked.health,
    latencyMs:   checked.latencyMs,
    isActive:    checked.health > 0,
    lastChecked: new Date(),
  });
  res.status(201).json({ success: true, data: proxy, healthCheck: checked });
});

router.put('/proxies/:id', async (req, res) => {
  const proxy = await Proxy.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    req.body,
    { new: true }
  );
  if (!proxy) return res.status(404).json({ success: false, message: 'Proxy not found' });
  res.json({ success: true, data: proxy });
});

router.delete('/proxies/:id', async (req, res) => {
  await Proxy.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  res.json({ success: true, message: 'Proxy removed' });
});

// POST /proxies/health-check — run full check now
router.post('/proxies/health-check', async (req, res) => {
  const results = await runHealthCheck();
  res.json({ success: true, data: results });
});

// POST /proxies/rotate/:accountId
router.post('/proxies/rotate/:accountId', async (req, res) => {
  const account = await Account.findOne({ _id: req.params.accountId, userId: req.user._id });
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });
  const newProxy = await ProxyService.getHealthyProxy(account.proxy?.country);
  await Account.findByIdAndUpdate(account._id, { proxy: newProxy });
  res.json({ success: true, message: 'Proxy rotated', newProxy: `${newProxy.host}:${newProxy.port}` });
});

// ── Accounts ──────────────────────────────────────────────────────────────
router.get('/accounts', async (req, res) => {
  const { platform, status } = req.query;
  const q = { userId: req.user._id };
  if (platform) q.platform = platform;
  if (status)   q.status   = status;
  const accounts = await Account.find(q).select('-credentials').sort('platform');
  res.json({ success: true, data: accounts });
});

router.post('/accounts/health-check', async (req, res) => {
  const accounts = await Account.find({ userId: req.user._id });
  const results  = [];
  for (const acc of accounts) {
    let health = 100;
    const pct  = (acc.limits?.dailySent || 0) / (acc.limits?.dailyLimit || 1000);
    if (pct > 0.9) health = 60;
    if (pct > 1)   health = 20;
    if (acc.status === 'blocked') health = 0;
    await Account.findByIdAndUpdate(acc._id, { health, lastActive: new Date() });
    results.push({ id: acc._id, platform: acc.platform, health, status: acc.status });
  }
  res.json({ success: true, data: results, checked: results.length });
});

router.get('/blocked', async (req, res) => {
  const accounts = await Account.find({
    userId: req.user._id,
    status: { $in: ['blocked', 'warning', 'suspended'] },
  }).select('-credentials');
  res.json({ success: true, data: accounts, count: accounts.length });
});

router.post('/accounts/:id/unblock', async (req, res) => {
  const account = await Account.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { status: 'active', health: 100 },
    { new: true }
  );
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });
  res.json({ success: true, message: 'Account marked active', data: account });
});

// ── Webhooks ──────────────────────────────────────────────────────────────
router.get('/webhook/:hookId/logs', async (req, res) => {
  const hook = await Webhook.findOne({ _id: req.params.hookId, userId: req.user._id })
    .select('url events stats deliveryLogs');
  if (!hook) return res.status(404).json({ success: false, message: 'Webhook not found' });
  res.json({ success: true, data: hook });
});

router.post('/webhook/:hookId/test', async (req, res) => {
  const result = await WebhookDispatcher.test(req.params.hookId, req.user._id);
  res.json({ success: true, data: result });
});

// ── Anti-ban settings ─────────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  // Return per-platform recommended safe limits
  const limits = {
    whatsapp:  { dailyMsgs: 200,  delayMin: 2000,  delayMax: 8000 },
    instagram: { dailyActions: 300, delayMin: 4000, delayMax: 12000 },
    facebook:  { dailyPosts: 20,   delayMin: 5000,  delayMax: 15000 },
    twitter:   { dailyTweets: 50,  delayMin: 2000,  delayMax: 6000 },
    tiktok:    { dailyActions: 100, delayMin: 3000,  delayMax: 10000 },
    linkedin:  { dailyConnects: 20, delayMin: 10000, delayMax: 30000 },
  };
  res.json({ success: true, data: limits });
});

router.put('/settings', async (req, res) => {
  // Store custom per-account delay settings
  const { accountId, delayMin, delayMax, dailyLimit } = req.body;
  const account = await Account.findOneAndUpdate(
    { _id: accountId, userId: req.user._id },
    { $set: { 'limits.delayMin': delayMin, 'limits.delayMax': delayMax, 'limits.dailyLimit': dailyLimit } },
    { new: true }
  );
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });
  res.json({ success: true, data: account });
});

module.exports = router;
