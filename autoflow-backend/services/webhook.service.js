'use strict';
/**
 * Webhook Dispatcher Service
 * ─────────────────────────────────────────────────────────────────────────
 * Sends outbound webhook events to registered URLs.
 * Backed by a Bull queue with retry + exponential backoff.
 * Stores per-delivery logs in MongoDB for the /webhooks/:id/logs endpoint.
 *
 * Usage (from anywhere in the codebase):
 *   const WebhookService = require('./webhook.service');
 *   await WebhookService.dispatch(userId, 'campaign.completed', { campaignId, sent, failed });
 */
const Bull   = require('bull');
const axios  = require('axios');
const crypto = require('crypto');
const mongoose = require('mongoose');
const logger   = require('../utils/logger');
const { Webhook } = require('../models');

// ── Delivery log schema ───────────────────────────────────────────────────
const deliveryLogSchema = new mongoose.Schema({
  webhookId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Webhook', index: true },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',    index: true },
  event:       { type: String, required: true },
  url:         { type: String, required: true },
  payload:     mongoose.Schema.Types.Mixed,
  statusCode:  Number,
  responseMs:  Number,
  status:      { type: String, enum: ['pending','success','failed','retrying'], default: 'pending' },
  attempts:    { type: Number, default: 0 },
  lastError:   String,
  deliveredAt: Date,
}, { timestamps: true });

deliveryLogSchema.index({ webhookId: 1, createdAt: -1 });
deliveryLogSchema.index({ userId: 1, event: 1 });

const DeliveryLog = mongoose.models.WebhookDeliveryLog
  || mongoose.model('WebhookDeliveryLog', deliveryLogSchema);

// ── Bull queue ────────────────────────────────────────────────────────────
function buildRedisConfig() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  return url.startsWith('rediss://')
    ? { redis: { url, tls: { rejectUnauthorized: false } } }
    : { redis: url };
}

const webhookQueue = process.env.NODE_ENV === 'test'
  ? { add: async () => ({ id: 'test-job' }), process: () => {}, on: () => {}, getWaitingCount: async () => 0, getActiveCount: async () => 0, getCompletedCount: async () => 0, getFailedCount: async () => 0 }
  : new Bull('webhooks', buildRedisConfig());

// ── Queue processor — retry up to 3× with exponential backoff ─────────────
webhookQueue.process(5, async (job) => {
  const { webhookId, url, event, payload, secret, logId } = job.data;

  const start    = Date.now();
  const attempts = (job.attemptsMade || 0) + 1;

  try {
    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
    const sig  = secret
      ? `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`
      : '';

    const resp = await axios.post(url, JSON.parse(body), {
      headers: {
        'Content-Type':           'application/json',
        'X-AutoFlow-Event':       event,
        'X-AutoFlow-Signature':   sig,
        'X-AutoFlow-Delivery-Id': logId || job.id,
      },
      timeout: 15000,
    });

    const ms = Date.now() - start;

    await DeliveryLog.findByIdAndUpdate(logId, {
      status:      'success',
      statusCode:  resp.status,
      responseMs:  ms,
      attempts,
      deliveredAt: new Date(),
    });

    await Webhook.findByIdAndUpdate(webhookId, {
      $inc: { 'stats.totalSent': 1, 'stats.totalSuccess': 1 },
      'stats.lastSent': new Date(),
      'stats.lastStatus': resp.status,
    });

    logger.info(`Webhook delivered [${event}] → ${url} (${resp.status}, ${ms}ms)`);
    return { status: resp.status, ms };

  } catch (err) {
    const ms = Date.now() - start;
    const isLastAttempt = attempts >= 3;

    await DeliveryLog.findByIdAndUpdate(logId, {
      status:     isLastAttempt ? 'failed' : 'retrying',
      attempts,
      lastError:  err.message,
      responseMs: ms,
      statusCode: err.response?.status || null,
    });

    if (isLastAttempt) {
      await Webhook.findByIdAndUpdate(webhookId, {
        $inc: { 'stats.totalSent': 1, 'stats.totalFailed': 1 },
        'stats.lastSent':   new Date(),
        'stats.lastStatus': err.response?.status || 0,
      });
    }

    logger.warn(`Webhook delivery failed attempt ${attempts}/3 [${event}] → ${url}: ${err.message}`);
    throw err; // Bull will retry
  }
});

// ── Queue events ──────────────────────────────────────────────────────────
webhookQueue.on('failed', (job, err) => {
  if (job.attemptsMade >= 3) {
    logger.error(`Webhook permanently failed after 3 attempts: ${job.data.url} — ${err.message}`);
  }
});

// ── Public API ────────────────────────────────────────────────────────────
const WebhookService = {
  /**
   * Find all matching webhooks for this user+event and enqueue delivery jobs.
   */
  async dispatch(userId, event, data) {
    try {
      const hooks = await Webhook.find({
        userId,
        events:   { $in: [event, '*'] },
        isActive: true,
      });

      for (const hook of hooks) {
        const log = await DeliveryLog.create({
          webhookId: hook._id,
          userId,
          event,
          url:       hook.url,
          payload:   data,
          status:    'pending',
        });

        await webhookQueue.add(
          { webhookId: hook._id, url: hook.url, event, payload: data, secret: hook.secret, logId: log._id.toString() },
          {
            attempts:        3,
            backoff:         { type: 'exponential', delay: 10000 }, // 10s, 20s, 40s
            removeOnComplete: 100,
            removeOnFail:     50,
          }
        );
      }

      if (hooks.length) logger.info(`Dispatching [${event}] to ${hooks.length} webhook(s) for user ${userId}`);
    } catch (err) {
      logger.error(`WebhookService.dispatch error: ${err.message}`);
    }
  },

  /**
   * Get delivery logs for a webhook (paginated).
   */
  async getLogs(webhookId, { page = 1, limit = 20, status } = {}) {
    const q = { webhookId };
    if (status) q.status = status;
    const [logs, total] = await Promise.all([
      DeliveryLog.find(q).sort('-createdAt').skip((page-1)*+limit).limit(+limit),
      DeliveryLog.countDocuments(q),
    ]);
    return { logs, total, page: +page, pages: Math.ceil(total / +limit) };
  },

  /**
   * Retry a specific failed delivery.
   */
  async retry(logId) {
    const log = await DeliveryLog.findById(logId);
    if (!log) throw new Error('Delivery log not found');
    const hook = await Webhook.findById(log.webhookId);
    if (!hook) throw new Error('Webhook not found');

    await DeliveryLog.findByIdAndUpdate(logId, { status: 'retrying', attempts: 0 });

    await webhookQueue.add(
      { webhookId: hook._id, url: hook.url, event: log.event, payload: log.payload, secret: hook.secret, logId: logId.toString() },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
    );

    return { queued: true, logId };
  },

  DeliveryLog,
  webhookQueue,
};

module.exports = WebhookService;
