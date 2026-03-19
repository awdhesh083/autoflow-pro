'use strict';
/**
 * Admin Routes  —  /api/v1/admin
 * All routes require: authenticate + adminOnly middleware
 *
 * Endpoints:
 *   GET  /admin/users               list all users (paginated)
 *   GET  /admin/users/:id           user detail + stats
 *   PUT  /admin/users/:id           update user (plan, role)
 *   POST /admin/users/:id/toggle    activate / deactivate
 *   DELETE /admin/users/:id         hard delete
 *   GET  /admin/stats               platform-wide aggregate stats
 *   GET  /admin/campaigns           all campaigns across all users
 *   GET  /admin/logs                recent message logs (global)
 *   POST /admin/broadcast           send system announcement to all users
 *   GET  /admin/queue/stats         Bull queue depths
 *   POST /admin/queue/drain/:name   drain a queue (emergency)
 */
const express = require('express');
const { User, Campaign, MessageLog, Contact, Account } = require('../models');
const { authenticate } = require('../middleware/auth');
const { adminOnly }    = require('../middleware/admin');
const logger           = require('../utils/logger');

const router = express.Router();
router.use(authenticate);
router.use(adminOnly);

// ── GET /users ────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const { page = 1, limit = 20, search, plan, role } = req.query;
  const q = {};
  if (search) q.$or = [{ name: new RegExp(search,'i') }, { email: new RegExp(search,'i') }];
  if (plan)   q.plan = plan;
  if (role)   q.role = role;

  const [users, total] = await Promise.all([
    User.find(q)
      .select('-password')
      .skip((page-1)*+limit).limit(+limit)
      .sort('-createdAt'),
    User.countDocuments(q),
  ]);

  res.json({ success: true, data: users, total, page: +page, pages: Math.ceil(total/+limit) });
});

// ── GET /users/:id ────────────────────────────────────────────────────────
router.get('/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const [contacts, campaigns, accounts, msgCount] = await Promise.all([
    Contact.countDocuments({ userId: user._id }),
    Campaign.countDocuments({ userId: user._id }),
    Account.countDocuments({ userId: user._id }),
    MessageLog.countDocuments({ userId: user._id }),
  ]);

  res.json({ success: true, data: { user, stats: { contacts, campaigns, accounts, messages: msgCount } } });
});

// ── PUT /users/:id ────────────────────────────────────────────────────────
router.put('/users/:id', async (req, res) => {
  const allowed = ['plan', 'role', 'isActive', 'settings'];
  const update  = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  logger.info(`Admin ${req.user.email} updated user ${user.email}: ${JSON.stringify(update)}`);
  res.json({ success: true, data: user });
});

// ── POST /users/:id/toggle ────────────────────────────────────────────────
router.post('/users/:id/toggle', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (user._id.toString() === req.user._id.toString()) {
    return res.status(400).json({ success: false, message: 'Cannot toggle your own account' });
  }

  user.isActive = !user.isActive;
  await user.save();
  logger.info(`Admin ${req.user.email} ${user.isActive ? 'activated' : 'deactivated'} user ${user.email}`);
  res.json({ success: true, data: { id: user._id, isActive: user.isActive } });
});

// ── DELETE /users/:id ─────────────────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user._id.toString()) {
    return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
  }

  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  // Cascade delete user data
  await Promise.all([
    Contact.deleteMany({ userId: req.params.id }),
    Campaign.deleteMany({ userId: req.params.id }),
    Account.deleteMany({ userId: req.params.id }),
    MessageLog.deleteMany({ userId: req.params.id }),
  ]);

  logger.info(`Admin ${req.user.email} hard-deleted user ${user.email}`);
  res.json({ success: true, message: `User ${user.email} and all data deleted` });
});

// ── GET /stats ─────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers, activeUsers, newUsers30d,
    totalContacts, totalCampaigns, activeCampaigns,
    totalMessages, msgByPlatform,
    totalAccounts, byPlan,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ createdAt: { $gte: since30 } }),
    Contact.countDocuments(),
    Campaign.countDocuments(),
    Campaign.countDocuments({ status: 'running' }),
    MessageLog.countDocuments({ createdAt: { $gte: since30 } }),
    MessageLog.aggregate([
      { $match: { createdAt: { $gte: since30 } } },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
    ]),
    Account.countDocuments({ status: 'active' }),
    User.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]),
  ]);

  res.json({
    success: true,
    data: {
      users:    { total: totalUsers, active: activeUsers, new30d: newUsers30d },
      content:  { contacts: totalContacts, campaigns: totalCampaigns, activeCampaigns },
      messages: { total30d: totalMessages, byPlatform: msgByPlatform },
      accounts: { total: totalAccounts },
      revenue:  { byPlan },
    },
  });
});

// ── GET /campaigns ────────────────────────────────────────────────────────
router.get('/campaigns', async (req, res) => {
  const { page = 1, limit = 20, status, type, userId } = req.query;
  const q = {};
  if (status) q.status = status;
  if (type)   q.type   = type;
  if (userId) q.userId = userId;

  const [campaigns, total] = await Promise.all([
    Campaign.find(q)
      .populate('userId', 'name email plan')
      .sort('-createdAt').skip((page-1)*+limit).limit(+limit),
    Campaign.countDocuments(q),
  ]);

  res.json({ success: true, data: campaigns, total, page: +page });
});

// ── GET /logs ─────────────────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  const { page = 1, limit = 50, platform, status, userId } = req.query;
  const q = {};
  if (platform) q.platform = platform;
  if (status)   q.status   = status;
  if (userId)   q.userId   = userId;

  const [logs, total] = await Promise.all([
    MessageLog.find(q)
      .populate('userId', 'name email')
      .sort('-createdAt').skip((page-1)*+limit).limit(+limit),
    MessageLog.countDocuments(q),
  ]);

  res.json({ success: true, data: logs, total, page: +page });
});

// ── POST /broadcast ───────────────────────────────────────────────────────
router.post('/broadcast', async (req, res) => {
  const { subject, message, channels = ['email'] } = req.body;
  if (!message) return res.status(400).json({ success: false, message: 'message required' });

  const users = await User.find({ isActive: true }).select('name email');

  if (channels.includes('email') && process.env.SMTP_FROM_EMAIL) {
    const EmailService = require('../services/email.service');
    let sent = 0;
    for (const u of users) {
      try {
        await EmailService.sendEmail({
          to: u.email, from: process.env.SMTP_FROM_EMAIL,
          fromName: 'AutoFlow System', subject: subject || 'System Announcement',
          html: `<p>Hi ${u.name},</p><p>${message}</p>`,
        });
        sent++;
      } catch {}
    }
    logger.info(`Admin system broadcast sent to ${sent}/${users.length} users`);
    return res.json({ success: true, sent, total: users.length });
  }

  res.json({ success: true, message: 'Broadcast queued', total: users.length });
});

// ── GET /queue/stats ──────────────────────────────────────────────────────
router.get('/queue/stats', async (req, res) => {
  try {
    const { waQueue, emailQueue, smsQueue, socialQueue } = require('../workers/campaign.worker');
    const { mediaQueue, downloadQueue } = require('../workers/media.worker');
    const { webhookQueue } = require('../services/webhook.service');

    const queues = [
      { name: 'whatsapp',  q: waQueue },
      { name: 'email',     q: emailQueue },
      { name: 'sms',       q: smsQueue },
      { name: 'social',    q: socialQueue },
      { name: 'media',     q: mediaQueue },
      { name: 'downloads', q: downloadQueue },
      { name: 'webhooks',  q: webhookQueue },
    ];

    const stats = await Promise.all(
      queues.map(async ({ name, q }) => {
        const [waiting, active, completed, failed] = await Promise.all([
          q.getWaitingCount(), q.getActiveCount(), q.getCompletedCount(), q.getFailedCount(),
        ]);
        return { name, waiting, active, completed, failed };
      })
    );

    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /queue/drain/:name ───────────────────────────────────────────────
router.post('/queue/drain/:name', async (req, res) => {
  const { waQueue, emailQueue, smsQueue } = require('../workers/campaign.worker');
  const queueMap = { whatsapp: waQueue, email: emailQueue, sms: smsQueue };

  const q = queueMap[req.params.name];
  if (!q) return res.status(404).json({ success: false, message: 'Queue not found' });

  await q.empty();
  await q.clean(0, 'failed');
  logger.warn(`Admin ${req.user.email} drained queue: ${req.params.name}`);
  res.json({ success: true, message: `Queue '${req.params.name}' drained` });
});

module.exports = router;
