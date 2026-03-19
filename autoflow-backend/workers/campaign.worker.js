'use strict';
/**
 * AutoFlow Campaign Worker v4
 * ─────────────────────────────────────────────────────────────────────────
 * Processes Bull queue jobs for every campaign type.
 * Emits real-time Socket.io progress so the frontend dashboard can update live.
 *
 * Queues:
 *   waQueue       whatsapp  bulk-send
 *   emailQueue    email     bulk-send
 *   smsQueue      sms       bulk-send
 *   socialQueue   social    post
 *   scheduleQueue internal  check (cron-triggered)
 *   healthQueue   internal  check-accounts (cron-triggered)
 *
 * Run standalone:  node workers/campaign.worker.js
 * Or imported by server.js to share queue references.
 */
require('dotenv').config();
const Bull   = require('bull');
const cron   = require('node-cron');
const logger = require('../utils/logger');
const { delay } = require('../utils/helpers');

// ── Services ──────────────────────────────────────────────────────────────
const WhatsAppService = require('../services/whatsapp.service');
const EmailService    = require('../services/email.service');
const SmsService      = require('../services/sms.service');
const SocialService   = require('../services/social.service');
const WebhookService  = require('../services/webhook.service');
const PushService     = require('../services/push.service');
const TrackingService = require('../services/tracking.service');

// ── Models ────────────────────────────────────────────────────────────────
const { Campaign, Contact, Account, MessageLog } = require('../models');

// ── Database (only needed when running as standalone worker) ───────────────
if (require.main === module) {
  require('../config/database')();
}

// ── Redis config (handles both redis:// and rediss:// from Upstash) ────────
function buildRedisConfig() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  if (url.startsWith('rediss://')) {
    return { redis: { url, tls: { rejectUnauthorized: false } } };
  }
  return { redis: url };
}
const REDIS = buildRedisConfig();

// ── Queue definitions ─────────────────────────────────────────────────────
// In test mode, replace Bull queues with no-op stubs to avoid Redis connection
let waQueue, emailQueue, smsQueue, socialQueue, scheduleQueue, healthQueue, campaignQueue;

if (process.env.NODE_ENV === 'test') {
  const noop  = { add: async () => ({ id: 'test-job-id' }), process: () => {}, on: () => {}, getWaitingCount: async () => 0, getActiveCount: async () => 0, getCompletedCount: async () => 0, getFailedCount: async () => 0 };
  waQueue = emailQueue = smsQueue = socialQueue = scheduleQueue = healthQueue = campaignQueue = noop;
} else {
  waQueue       = new Bull('whatsapp',   REDIS);
  emailQueue    = new Bull('email',      REDIS);
  smsQueue      = new Bull('sms',        REDIS);
  socialQueue   = new Bull('social',     REDIS);
  scheduleQueue = new Bull('schedules',  REDIS);
  healthQueue   = new Bull('health',     REDIS);
  campaignQueue = new Bull('campaigns',  REDIS);
}

// ── Socket.io — lazily loaded from app context ────────────────────────────
function getIO() {
  try { return require('../server').io; } catch { return null; }
}

function emitProgress(campaignId, payload) {
  try {
    const io = getIO();
    if (io?.emitToCampaign) io.emitToCampaign(String(campaignId), 'campaign:progress', payload);
  } catch {}
}

function emitToUser(userId, event, data) {
  try {
    const io = getIO();
    if (io?.emitToUser) io.emitToUser(String(userId), event, data);
  } catch {}
}

// ── Helper: load contacts for a campaign ─────────────────────────────────
async function loadContacts(campaign) {
  // If job included contacts directly (e.g. from broadcast endpoint)
  // those are stored in the job data, not here.
  // This handles DB-backed campaigns with audience config.
  let contacts = [];
  const userId = campaign.userId;

  if (campaign.audience?.contactIds?.length) {
    contacts.push(...await Contact.find({ _id: { $in: campaign.audience.contactIds }, userId, status: 'active' }));
  }
  if (campaign.audience?.listIds?.length) {
    contacts.push(...await Contact.find({ userId, lists: { $in: campaign.audience.listIds }, status: 'active' }));
  }
  if (!contacts.length) {
    // Fallback: all active contacts for user
    contacts = await Contact.find({ userId, status: 'active' }).limit(10000);
  }

  // Deduplicate by _id
  const seen = new Set();
  return contacts.filter(c => {
    const k = c._id.toString();
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// ── Helper: pick least-used active account ────────────────────────────────
async function pickAccount(userId, platform) {
  const account = await Account.findOne({
    userId, platform, status: 'active',
    'limits.dailySent': { $lt: 900 },
  }).sort({ 'limits.dailySent': 1 });
  if (!account) throw new Error(`No active ${platform} account available`);
  return account;
}

// ═════════════════════════════════════════════════════════════════════════
// WHATSAPP processor
// ═════════════════════════════════════════════════════════════════════════
waQueue.process('bulk-send', 3, async (job) => {
  const { campaignId, contacts: jobContacts, accountId } = job.data;

  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  logger.info(`📱 WA campaign start: ${campaign.name}`);
  await Campaign.findByIdAndUpdate(campaignId, { status: 'running', 'stats.startedAt': new Date() });

  try {
    // Contacts can come from job data (broadcast endpoint) or from DB audience
    const contacts = jobContacts?.length ? jobContacts : await loadContacts(campaign);
    const accId    = accountId || (await pickAccount(campaign.userId, 'whatsapp'))._id.toString();

    await Campaign.findByIdAndUpdate(campaignId, { 'audience.totalCount': contacts.length });

    const results = await WhatsAppService.sendBulk(
      campaignId, accId, contacts, campaign.content.body,
      {
        userId:   campaign.userId,
        delayMin: campaign.settings?.delayMin || 2000,
        delayMax: campaign.settings?.delayMax || 8000,
        media:    campaign.content?.media?.[0],
      }
    );

    await Campaign.findByIdAndUpdate(campaignId, {
      status: 'completed',
      'stats.totalSent':   results.sent,
      'stats.failed':      results.failed,
      'stats.progress':    100,
      'stats.completedAt': new Date(),
    });

    emitProgress(campaignId, { status: 'completed', sent: results.sent, failed: results.failed, progress: 100 });
    emitToUser(campaign.userId, 'campaign:completed', { campaignId, name: campaign.name, ...results });
    await WebhookService.dispatch(campaign.userId, 'campaign.completed', { campaignId, type:'whatsapp', name:campaign.name, ...results }).catch(()=>{});
    PushService.sendToUser(campaign.userId, 'campaign_completed', { campaignId, name:campaign.name, ...results }).catch(()=>{});
    TrackingService.trackCampaignEvent(campaign, 'campaign_completed', { platform:'whatsapp', sent: results.sent||0, failed: results.failed||0 }).catch(()=>{});
    logger.info(`✅ WA campaign done: ${results.sent} sent, ${results.failed} failed`);
    return results;

  } catch (err) {
    await Campaign.findByIdAndUpdate(campaignId, { status: 'failed', 'stats.lastError': err.message });
    emitProgress(campaignId, { status: 'failed', error: err.message });
    throw err;
  }
});

// ═════════════════════════════════════════════════════════════════════════
// EMAIL processor
// ═════════════════════════════════════════════════════════════════════════
emailQueue.process('bulk-send', 5, async (job) => {
  const { campaignId, contacts: jobContacts } = job.data;

  const campaign = await Campaign.findById(campaignId).lean();
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

  logger.info(`📧 Email campaign start: ${campaign.name}`);
  await Campaign.findByIdAndUpdate(campaignId, { status: 'running', 'stats.startedAt': new Date() });

  try {
    const contacts  = jobContacts?.length ? jobContacts : await loadContacts(campaign);
    const total     = contacts.length;
    const batchSize = 50;
    const results   = { sent: 0, failed: 0, bounced: 0 };

    await Campaign.findByIdAndUpdate(campaignId, { 'audience.totalCount': total });

    // A/B test support
    const variants = (campaign.settings?.abTest?.enabled && campaign.settings.abTest.variants?.length)
      ? campaign.settings.abTest.variants
      : [{ subject: campaign.content.subject, body: campaign.content.html || campaign.content.body, weight: 100 }];

    let varIdx = 0;
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch   = contacts.slice(i, i + batchSize);
      const variant = variants[varIdx % variants.length];
      varIdx++;

      const batchRes = await EmailService.sendBulk(campaign, batch, {
        smtpProfileId: campaign.settings?.smtpProfileId,
        fromEmail:     campaign.settings?.fromEmail,
        fromName:      campaign.settings?.fromName,
        replyTo:       campaign.settings?.replyTo,
        subject:       variant.subject || campaign.content.subject,
        htmlTemplate:  variant.body    || campaign.content.html || campaign.content.body,
        trackOpens:    campaign.settings?.trackOpens  !== false,
        trackClicks:   campaign.settings?.trackClicks !== false,
        sendRate:      campaign.settings?.sendRate     || 500,
      });

      results.sent    += batchRes.sent;
      results.failed  += batchRes.failed;
      results.bounced += batchRes.bounced || 0;

      const progress = Math.round(((i + batch.length) / total) * 100);
      await Campaign.findByIdAndUpdate(campaignId, {
        'stats.totalSent': results.sent, 'stats.failed': results.failed,
        'stats.bounced':   results.bounced, 'stats.progress': progress,
      });

      job.progress(progress);
      emitProgress(campaignId, { status: 'running', sent: results.sent, total, progress });
    }

    await Campaign.findByIdAndUpdate(campaignId, {
      status: 'completed', 'stats.completedAt': new Date(), 'stats.progress': 100,
    });

    emitProgress(campaignId, { status: 'completed', ...results, progress: 100 });
    emitToUser(campaign.userId, 'campaign:completed', { campaignId, name: campaign.name, ...results });
    await WebhookService.dispatch(campaign.userId, 'campaign.completed', { campaignId, type:'email', name:campaign.name, ...results }).catch(()=>{});
    PushService.sendToUser(campaign.userId, 'campaign_completed', { campaignId, name:campaign.name, ...results }).catch(()=>{});
    TrackingService.trackCampaignEvent(campaign, 'campaign_completed', { platform:'email', sent: results.sent||0, failed: results.failed||0 }).catch(()=>{});
    logger.info(`✅ Email campaign done: ${results.sent} sent`);
    return results;

  } catch (err) {
    await Campaign.findByIdAndUpdate(campaignId, { status: 'failed', 'stats.lastError': err.message });
    emitProgress(campaignId, { status: 'failed', error: err.message });
    throw err;
  }
});

// ═════════════════════════════════════════════════════════════════════════
// SMS processor
// ═════════════════════════════════════════════════════════════════════════
smsQueue.process('bulk-send', 3, async (job) => {
  const { campaignId, contacts: jobContacts } = job.data;

  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  await Campaign.findByIdAndUpdate(campaignId, { status: 'running', 'stats.startedAt': new Date() });

  const contacts = jobContacts?.length ? jobContacts : await loadContacts(campaign);
  const total    = contacts.length;
  await Campaign.findByIdAndUpdate(campaignId, { 'audience.totalCount': total });

  const results = await SmsService.sendBulk(campaign, contacts);

  // Emit progress per-contact is handled inside SmsService.sendBulk.
  // Here we just emit completion.
  await Campaign.findByIdAndUpdate(campaignId, {
    status: 'completed', 'stats.totalSent': results.sent,
    'stats.failed': results.failed, 'stats.completedAt': new Date(), 'stats.progress': 100,
  });

  emitProgress(campaignId, { status: 'completed', ...results, progress: 100 });
  emitToUser(campaign.userId, 'campaign:completed', { campaignId, name: campaign.name, ...results });
  return results;
});

// ═════════════════════════════════════════════════════════════════════════
// SOCIAL post processor
// ═════════════════════════════════════════════════════════════════════════
socialQueue.process('post', 5, async (job) => {
  const { campaignId, platform, accountId } = job.data;

  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const result = await SocialService.post(platform || campaign.type, accountId, {
    text:  campaign.content.body,
    media: campaign.content.media,
  });

  await Campaign.findByIdAndUpdate(campaignId, {
    status: 'completed', 'stats.totalSent': 1, 'stats.completedAt': new Date(),
  });

  emitToUser(campaign.userId, 'campaign:completed', { campaignId, name: campaign.name, result });
  return result;
});

// ═════════════════════════════════════════════════════════════════════════
// HEALTH CHECK processor
// ═════════════════════════════════════════════════════════════════════════
healthQueue.process('check-accounts', async () => {
  const accounts = await Account.find({ status: { $in: ['active', 'warning'] } });
  for (const acc of accounts) {
    try {
      let health = 100;
      const pct  = (acc.limits?.dailySent || 0) / (acc.limits?.dailyLimit || 1000);
      if (pct > 0.9) health = 60;
      if (pct > 1)   health = 20;
      if (acc.status === 'blocked') health = 0;
      await Account.findByIdAndUpdate(acc._id, { health, lastActive: new Date() });
    } catch {}
    await delay(50);
  }
  logger.info(`Health check: ${accounts.length} accounts updated`);
});

// ═════════════════════════════════════════════════════════════════════════
// CRON JOBS — skipped in test environment
// ═════════════════════════════════════════════════════════════════════════
if (process.env.NODE_ENV !== 'test') {

// Every minute: launch overdue scheduled campaigns
cron.schedule('* * * * *', async () => {
  try {
    const now    = new Date();
    const due    = await Campaign.find({ status: 'scheduled', 'schedule.sendAt': { $lte: now } });
    const qMap   = { whatsapp: waQueue, email: emailQueue, sms: smsQueue };

    for (const campaign of due) {
      const queue  = qMap[campaign.type] || emailQueue;
      const qJob   = await queue.add('bulk-send', { campaignId: campaign._id.toString() }, { attempts: 3, backoff: { type: 'exponential', delay: 10000 } });
      await Campaign.findByIdAndUpdate(campaign._id, { status: 'running', jobId: qJob.id.toString() });
      logger.info(`Scheduler launched: ${campaign.name} (${campaign.type})`);
    }
  } catch (err) { logger.error(`Scheduler cron: ${err.message}`); }
});

// Every hour: reset hourly send counts
cron.schedule('0 * * * *', async () => {
  try {
    await Account.updateMany({}, { 'limits.hourlySent': 0 });
    logger.info('Hourly send limits reset');
  } catch (err) { logger.error(`Hourly reset cron: ${err.message}`); }
});

// Every midnight: reset daily send counts
cron.schedule('0 0 * * *', async () => {
  try {
    await Account.updateMany({}, { 'limits.dailySent': 0, 'limits.lastReset': new Date() });
    logger.info('Daily send limits reset');
  } catch (err) { logger.error(`Daily reset cron: ${err.message}`); }
});

// Every 5 minutes: account health check
cron.schedule('*/5 * * * *', () => {
  healthQueue.add('check-accounts', {}, { removeOnComplete: true }).catch(() => {});
});

} // end NODE_ENV !== test

// ── Queue event logging ───────────────────────────────────────────────────
[waQueue, emailQueue, smsQueue, socialQueue].forEach(q => {
  q.on('completed', job => logger.info(`✅ [${q.name}] Job ${job.id} completed`));
  q.on('failed',    (job, err) => logger.error(`❌ [${q.name}] Job ${job.id} failed: ${err.message}`));
  q.on('stalled',   job => logger.warn(`⚠️  [${q.name}] Job ${job.id} stalled`));
});

// ── Export queue references for use in route handlers ─────────────────────
module.exports = { campaignQueue, waQueue, emailQueue, smsQueue, socialQueue, scheduleQueue };

if (require.main === module) {
  logger.info('🔧 Campaign worker started — listening for jobs...');
}
