'use strict';
/**
 * Web Push Notification Service
 * Sends browser push notifications to subscribed users.
 *
 * Setup (one-time):
 *   node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k))"
 *   Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to .env
 *
 * Frontend: call POST /api/v1/settings/push/subscribe with the PushSubscription object.
 */
const webpush = require('web-push');
const logger  = require('../utils/logger');
const { User } = require('../models');

// Configure VAPID (lazy — only if keys are set)
let configured = false;
function configure() {
  if (configured) return true;
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const mail = process.env.VAPID_EMAIL || `mailto:${process.env.SMTP_FROM_EMAIL || 'admin@autoflow.io'}`;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(mail, pub, priv);
  configured = true;
  return true;
}

// Standard notification payloads
const TEMPLATES = {
  campaign_completed: (data) => ({
    title: `✅ ${data.name || 'Campaign'} complete`,
    body:  `${data.sent || 0} messages sent · ${data.failed || 0} failed`,
    icon:  '/icon-192.png',
    badge: '/badge-72.png',
    tag:   `campaign-${data.campaignId}`,
    data:  { url: '/campaigns', ...data },
  }),
  new_reply: (data) => ({
    title: `💬 New reply from ${data.contactName || 'a contact'}`,
    body:  data.preview || 'Tap to view',
    icon:  '/icon-192.png',
    tag:   `reply-${data.contactId}`,
    data:  { url: '/inbox', ...data },
  }),
  proxy_down: (data) => ({
    title: `⚠️ Proxy ${data.host} is down`,
    body:  'A proxy has failed. Check Security tab.',
    icon:  '/icon-192.png',
    tag:   `proxy-${data.host}`,
    data:  { url: '/security', ...data },
  }),
  account_blocked: (data) => ({
    title: `🚫 ${data.platform} account blocked`,
    body:  `${data.username || 'Account'} has been blocked. Review immediately.`,
    icon:  '/icon-192.png',
    tag:   `blocked-${data.accountId}`,
    data:  { url: '/accounts', ...data },
  }),
  custom: (data) => ({
    title: data.title || 'AutoFlow',
    body:  data.body  || '',
    icon:  '/icon-192.png',
    data:  { url: data.url || '/', ...data },
  }),
};

const PushService = {
  /**
   * Send a push notification to a specific user.
   * @param {string|ObjectId} userId
   * @param {string} type  — key of TEMPLATES
   * @param {object} data  — passed to template function
   */
  async sendToUser(userId, type = 'custom', data = {}) {
    if (!configure()) {
      logger.debug('Push notifications disabled (no VAPID keys configured)');
      return { sent: 0, reason: 'no_vapid_keys' };
    }

    const user = await User.findById(userId).select('pushSubscriptions').lean();
    if (!user?.pushSubscriptions?.length) return { sent: 0, reason: 'no_subscriptions' };

    const payload    = TEMPLATES[type] ? TEMPLATES[type](data) : TEMPLATES.custom(data);
    const payloadStr = JSON.stringify(payload);

    let sent = 0, failed = 0;
    const deadEndpoints = [];

    for (const sub of user.pushSubscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payloadStr,
          { TTL: 60 * 60 * 24 } // 24hr TTL
        );
        sent++;
      } catch (err) {
        failed++;
        // 410 Gone = subscription expired, clean it up
        if (err.statusCode === 410 || err.statusCode === 404) {
          deadEndpoints.push(sub.endpoint);
        }
        logger.warn(`Push failed for user ${userId}: ${err.message}`);
      }
    }

    // Remove expired subscriptions
    if (deadEndpoints.length) {
      await User.findByIdAndUpdate(userId, {
        $pull: { pushSubscriptions: { endpoint: { $in: deadEndpoints } } },
      }).catch(() => {});
    }

    return { sent, failed };
  },

  /**
   * Broadcast to all users (e.g. system announcement).
   */
  async broadcast(type = 'custom', data = {}) {
    if (!configure()) return { sent: 0, reason: 'no_vapid_keys' };
    const users = await User.find({ 'pushSubscriptions.0': { $exists: true } })
      .select('_id').lean();
    let total = 0;
    for (const u of users) {
      const r = await this.sendToUser(u._id, type, data);
      total += r.sent || 0;
    }
    return { sent: total, users: users.length };
  },

  /** Return the VAPID public key (sent to frontend for subscription). */
  getPublicKey() {
    return process.env.VAPID_PUBLIC_KEY || null;
  },

  isConfigured() {
    return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  },
};

module.exports = PushService;
