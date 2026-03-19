'use strict';
/**
 * Webhook Dispatcher Service
 * Sends outbound webhook events to registered URLs.
 *
 * Features:
 *   - HMAC-SHA256 signature on every payload
 *   - Retry with exponential backoff (3 attempts)
 *   - Delivery log per webhook (last 50 deliveries)
 *   - Per-event filtering
 *   - Timeout: 10s per attempt
 *   - Alerts owner on persistent failure (via Socket.io)
 */
const axios  = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { Webhook } = require('../models');

const MAX_RETRIES   = 3;
const BASE_DELAY_MS = 2000;   // 2s → 4s → 8s

function getIO() {
  try { return require('../server').io; } catch { return null; }
}

const WebhookDispatcher = {

  /**
   * Dispatch an event to all matching webhooks for a user.
   * @param {ObjectId|string} userId
   * @param {string}          event   e.g. 'campaign.completed'
   * @param {object}          data    event payload
   */
  async dispatch(userId, event, data) {
    try {
      const hooks = await Webhook.find({
        userId,
        events: { $in: [event, '*'] },
        isActive: true,
      });

      if (!hooks.length) return;

      await Promise.allSettled(
        hooks.map(hook => this._deliverWithRetry(hook, event, data))
      );
    } catch (err) {
      logger.error(`WebhookDispatcher.dispatch error: ${err.message}`);
    }
  },

  /**
   * Deliver to a single webhook with retry logic.
   */
  async _deliverWithRetry(hook, event, data) {
    const payload = {
      id:        crypto.randomBytes(8).toString('hex'),
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this._send(hook, payload);
        await this._logDelivery(hook._id, event, payload.id, 'success', result.status, attempt);
        logger.debug(`Webhook delivered: ${hook.url} [event=${event}] attempt=${attempt}`);
        return;
      } catch (err) {
        lastError = err;
        logger.warn(`Webhook attempt ${attempt}/${MAX_RETRIES} failed for ${hook.url}: ${err.message}`);

        if (attempt < MAX_RETRIES) {
          const waitMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, waitMs));
        }
      }
    }

    // All retries exhausted
    await this._logDelivery(hook._id, event, payload.id, 'failed', 0, MAX_RETRIES, lastError?.message);
    logger.error(`Webhook permanently failed for ${hook.url} [event=${event}]: ${lastError?.message}`);

    // Alert owner
    try {
      const io = getIO();
      if (io?.emitToUser) {
        io.emitToUser(String(hook.userId), 'webhook:failed', {
          webhookId: hook._id,
          url:       hook.url,
          event,
          error:     lastError?.message,
        });
      }
    } catch {}
  },

  /**
   * Send a single HTTP POST to the webhook URL.
   */
  async _send(hook, payload) {
    const body = JSON.stringify(payload);
    const sig  = hook.secret
      ? crypto.createHmac('sha256', hook.secret).update(body).digest('hex')
      : '';

    const response = await axios.post(hook.url, payload, {
      headers: {
        'Content-Type':           'application/json',
        'X-AutoFlow-Event':       payload.event,
        'X-AutoFlow-Delivery':    payload.id,
        'X-AutoFlow-Signature':   `sha256=${sig}`,
        'X-AutoFlow-Timestamp':   payload.timestamp,
        'User-Agent':             'AutoFlow-Webhooks/4.0',
        ...hook.headers,
      },
      timeout: 10000,
      validateStatus: status => status >= 200 && status < 300,
    });

    // Update global stats
    await Webhook.findByIdAndUpdate(hook._id, {
      $inc: { 'stats.totalSent': 1 },
      'stats.lastSent':   new Date(),
      'stats.lastStatus': response.status,
    });

    return response;
  },

  /**
   * Append a delivery record to the hook's delivery log (capped at 50).
   */
  async _logDelivery(hookId, event, deliveryId, status, httpStatus, attempts, errorMsg = null) {
    try {
      await Webhook.findByIdAndUpdate(hookId, {
        $push: {
          deliveryLogs: {
            $each: [{ deliveryId, event, status, httpStatus, attempts, errorMsg, deliveredAt: new Date() }],
            $slice: -50,    // keep last 50
          },
        },
      });
    } catch {}
  },

  /**
   * Manually test a webhook (sends a ping event).
   */
  async test(hookId, userId) {
    const hook = await Webhook.findOne({ _id: hookId, userId });
    if (!hook) throw new Error('Webhook not found');
    await this._deliverWithRetry(hook, 'ping', { message: 'AutoFlow webhook test', hookId });
    return { success: true };
  },
};

module.exports = WebhookDispatcher;
