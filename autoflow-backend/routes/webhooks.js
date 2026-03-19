'use strict';
/**
 * Webhooks Routes  —  /api/v1/webhooks
 *
 * Outbound webhook management (user-facing):
 *   GET    /                 list user's webhooks
 *   POST   /                 create webhook
 *   PUT    /:id              update webhook
 *   DELETE /:id              delete webhook
 *   GET    /:id/logs         delivery logs for a webhook (paginated)
 *   POST   /:id/logs/:logId/retry  retry a failed delivery
 *   POST   /:id/test         send a test event
 *
 * Inbound webhooks (public, no auth):
 *   POST   /inbound/email/bounce     SendGrid / Mailgun bounce events
 *   POST   /inbound/twilio/sms       Twilio inbound SMS
 */
const express = require('express');
const crypto  = require('crypto');
const { Webhook, MessageLog } = require('../models');
const { authenticate } = require('../middleware/auth');
const EmailService    = require('../services/email.service');
const WebhookService  = require('../services/webhook.service');

const router = express.Router();

// ── Inbound (public) ──────────────────────────────────────────────────────
router.post('/inbound/email/bounce', express.json(), async (req, res) => {
  const events = Array.isArray(req.body) ? req.body : [req.body];
  for (const ev of events) {
    if (['bounce','dropped'].includes(ev.event))
      await EmailService.handleBounce(ev.email, 'bounce').catch(() => {});
    if (['unsubscribe','spamreport'].includes(ev.event))
      await EmailService.handleBounce(ev.email, 'complaint').catch(() => {});
  }
  res.sendStatus(200);
});

router.post('/inbound/twilio/sms', express.urlencoded({ extended: false }), async (req, res) => {
  const { From, Body, MessageSid } = req.body;
  await MessageLog.create({
    platform: 'sms', direction: 'inbound',
    from: From, body: Body, externalId: MessageSid,
  }).catch(() => {});
  res.set('Content-Type', 'text/xml').send('<?xml version="1.0"?><Response></Response>');
});

// ── Authenticated routes ───────────────────────────────────────────────────
router.use(authenticate);

router.get('/', async (req, res) => {
  const hooks = await Webhook.find({ userId: req.user._id });
  res.json({ success: true, data: hooks });
});

router.post('/', async (req, res) => {
  const hook = await Webhook.create({
    ...req.body,
    userId: req.user._id,
    secret: crypto.randomBytes(16).toString('hex'),
  });
  res.status(201).json({ success: true, data: hook });
});

router.put('/:id', async (req, res) => {
  const allowed = ['url', 'events', 'isActive', 'headers', 'description'];
  const update  = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
  const hook = await Webhook.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id }, update, { new: true }
  );
  if (!hook) return res.status(404).json({ success: false, message: 'Webhook not found' });
  res.json({ success: true, data: hook });
});

router.delete('/:id', async (req, res) => {
  await Webhook.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  res.json({ success: true, message: 'Webhook deleted' });
});

// ── Delivery logs ─────────────────────────────────────────────────────────
router.get('/:id/logs', async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;

  // Verify ownership
  const hook = await Webhook.findOne({ _id: req.params.id, userId: req.user._id });
  if (!hook) return res.status(404).json({ success: false, message: 'Webhook not found' });

  const result = await WebhookService.getLogs(req.params.id, { page: +page, limit: +limit, status });
  res.json({ success: true, ...result });
});

// ── Retry a failed delivery ───────────────────────────────────────────────
router.post('/:id/logs/:logId/retry', async (req, res) => {
  const hook = await Webhook.findOne({ _id: req.params.id, userId: req.user._id });
  if (!hook) return res.status(404).json({ success: false, message: 'Webhook not found' });

  const result = await WebhookService.retry(req.params.logId);
  res.json({ success: true, data: result });
});

// ── Test webhook ───────────────────────────────────────────────────────────
router.post('/:id/test', async (req, res) => {
  const hook = await Webhook.findOne({ _id: req.params.id, userId: req.user._id });
  if (!hook) return res.status(404).json({ success: false, message: 'Webhook not found' });

  await WebhookService.dispatch(req.user._id, 'test.ping', {
    message:   'AutoFlow webhook test',
    timestamp: new Date().toISOString(),
    webhook:   { id: hook._id, url: hook.url },
  });

  res.json({ success: true, message: 'Test event dispatched — check delivery logs' });
});

module.exports = router;
