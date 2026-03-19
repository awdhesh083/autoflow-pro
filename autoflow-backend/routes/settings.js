'use strict';
/**
 * User Settings Routes — /api/v1/settings
 * Profile · notifications · timezone · API keys · send-time analysis · danger zone
 */
const express   = require('express');
const { body }  = require('express-validator');
const { authenticate, validate } = require('../middleware/auth');
const { User }  = require('../models');

const router = express.Router();
router.use(authenticate);

// ── GET full settings ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('-password -twoFactorSecret -passwordResetToken -emailVerifyToken')
    .lean();
  res.json({ success: true, data: user });
});

// ── UPDATE profile ────────────────────────────────────────────────────────
router.put('/profile',
  [
    body('name').optional().trim().isLength({ min: 2, max: 80 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('avatar').optional().isURL(),
  ],
  validate,
  async (req, res) => {
    const allowed = ['name', 'email', 'avatar'];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true })
      .select('-password -twoFactorSecret');
    res.json({ success: true, data: user });
  }
);

// ── UPDATE preferences / settings ────────────────────────────────────────
router.put('/preferences', async (req, res) => {
  const allowed = {
    'settings.timezone':              req.body.timezone,
    'settings.language':              req.body.language,
    'settings.notifications.email':   req.body.notifications?.email,
    'settings.notifications.push':    req.body.notifications?.push,
    'settings.notifications.sms':     req.body.notifications?.sms,
    'settings.theme':                 req.body.theme,
    'settings.dateFormat':            req.body.dateFormat,
    'settings.defaultPlatform':       req.body.defaultPlatform,
    'settings.campaignDefaults':      req.body.campaignDefaults,
  };

  const update = {};
  Object.entries(allowed).forEach(([k, v]) => { if (v !== undefined) update[k] = v; });

  const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true })
    .select('settings');
  res.json({ success: true, data: user.settings });
});

// ── NOTIFICATIONS config ──────────────────────────────────────────────────
router.put('/notifications', async (req, res) => {
  const { email, push, sms, events } = req.body;
  const update = {};
  if (email !== undefined) update['settings.notifications.email'] = email;
  if (push  !== undefined) update['settings.notifications.push']  = push;
  if (sms   !== undefined) update['settings.notifications.sms']   = sms;
  if (events)              update['settings.notifications.events'] = events;

  await User.findByIdAndUpdate(req.user._id, { $set: update });
  res.json({ success: true, message: 'Notification preferences updated' });
});

// ── Push notification subscription ────────────────────────────────────────
router.post('/push/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys) return res.status(400).json({ success: false, message: 'endpoint and keys required' });

  await User.findByIdAndUpdate(req.user._id, {
    $addToSet: {
      pushSubscriptions: { endpoint, keys, createdAt: new Date() },
    },
  });
  res.json({ success: true, message: 'Push subscription saved' });
});

router.delete('/push/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  await User.findByIdAndUpdate(req.user._id, {
    $pull: { pushSubscriptions: { endpoint } },
  });
  res.json({ success: true, message: 'Push subscription removed' });
});

// ── SEND-TIME analysis ────────────────────────────────────────────────────
router.get('/send-time/:platform', async (req, res) => {
  const SendTimeOptimizer = require('../services/send-time-optimizer');
  const { platform } = req.params;
  const industry  = SendTimeOptimizer.getIndustryBestTimes(platform);
  res.json({ success: true, data: industry });
});

router.post('/send-time/analyse', async (req, res) => {
  const { platforms = ['email', 'whatsapp'] } = req.body;
  const SendTimeOptimizer = require('../services/send-time-optimizer');
  SendTimeOptimizer.analyseForUser(req.user._id, platforms).catch(e =>
    require('../utils/logger').error(`Send-time: ${e.message}`)
  );
  const total = await require('../models').Contact.countDocuments({ userId: req.user._id });
  res.json({ success: true, message: `Analysing ${total} contacts for ${platforms.join(', ')}…` });
});

router.get('/send-time/contact/:contactId', async (req, res) => {
  const contact = await require('../models').Contact.findOne({ _id: req.params.contactId, userId: req.user._id });
  if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
  const SendTimeOptimizer = require('../services/send-time-optimizer');
  const platform = req.query.platform || 'email';
  const window   = await SendTimeOptimizer.analyseContact(contact._id, platform);
  const next     = await SendTimeOptimizer.nextSendTime(contact._id, platform);
  res.json({ success: true, data: { window, nextOptimalSend: next.sendAt } });
});

// ── PUSH NOTIFICATION VAPID KEY ──────────────────────────────────────────
router.get('/push/vapid-key', (_req, res) => {
  const PushService = require('../services/push.service');
  res.json({
    success:    true,
    configured: PushService.isConfigured(),
    publicKey:  PushService.getPublicKey(),
  });
});

// Send a test push to the current user
router.post('/push/test', async (req, res) => {
  const PushService = require('../services/push.service');
  if (!PushService.isConfigured())
    return res.status(400).json({ success: false, message: 'VAPID keys not configured in .env' });
  const result = await PushService.sendToUser(req.user._id, 'custom', {
    title: '🔔 AutoFlow Test Notification',
    body:  'Push notifications are working!',
    url:   '/',
  });
  res.json({ success: true, data: result });
});

// ── DANGER ZONE ───────────────────────────────────────────────────────────
router.delete('/account', async (req, res) => {
  // Require confirmation phrase
  if (req.body.confirmation !== 'DELETE MY ACCOUNT')
    return res.status(400).json({ success: false, message: 'Type "DELETE MY ACCOUNT" to confirm' });

  const { Contact, Campaign, Account, MessageLog } = require('../models');
  const userId = req.user._id;

  // Cascade delete all user data
  await Promise.all([
    Contact.deleteMany({ userId }),
    Campaign.deleteMany({ userId }),
    Account.deleteMany({ userId }),
    MessageLog.deleteMany({ userId }),
    User.findByIdAndDelete(userId),
  ]);

  // Log the erasure
  require('../routes/audit').AuditLog.create({
    userId, action: 'account.self_deleted', resource: 'User', resourceId: userId,
    details: { email: req.user.email }, ip: req.ip,
  }).catch(() => {});

  res.json({ success: true, message: 'Account and all data permanently deleted' });
});

module.exports = router;
