'use strict';
/**
 * Campaign Routes — /api/v1/campaigns
 * Create · launch · pause · resume · duplicate · A/B test tracking · templates
 */
const express  = require('express');
const { body } = require('express-validator');
const { Campaign, MessageLog, AnalyticsEvent, Contact } = require('../models');
const { authenticate, validate } = require('../middleware/auth');
const { msg } = require('../middleware/i18n');
// Load queues (workers register crons - guarded with NODE_ENV check)
const _workers = require('../workers/campaign.worker');
const { waQueue, emailQueue, smsQueue, socialQueue } = _workers;

const router = express.Router();
router.use(authenticate);

// ── helpers ───────────────────────────────────────────────────────────────
const QUEUE_MAP = {
  whatsapp:  { queue: waQueue,     job: 'bulk-send' },
  email:     { queue: emailQueue,  job: 'bulk-send' },
  sms:       { queue: smsQueue,    job: 'bulk-send' },
  instagram: { queue: socialQueue, job: 'post' },
  facebook:  { queue: socialQueue, job: 'post' },
  twitter:   { queue: socialQueue, job: 'post' },
  telegram:  { queue: socialQueue, job: 'post' },
  linkedin:  { queue: socialQueue, job: 'post' },
};

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ═══════════════════════════════════════════════════════════
// LIST + CRUD
// ═══════════════════════════════════════════════════════════

router.get('/', async (req, res) => {
  const { status, type, page = 1, limit = 20, search } = req.query;
  const q = { userId: req.user._id };
  if (status) q.status = status;
  if (type)   q.type   = type;
  if (search) q.name   = { $regex: search, $options: 'i' };

  const [campaigns, total] = await Promise.all([
    Campaign.find(q).skip((page - 1) * +limit).limit(+limit).sort('-createdAt'),
    Campaign.countDocuments(q),
  ]);
  res.json({ success: true, data: campaigns, total, page: +page, pages: Math.ceil(total / +limit) });
});

router.get('/:id', async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
  if (!campaign) return res.status(404).json({ success: false, message: msg(req,'campaign_not_found') });
  res.json({ success: true, data: campaign });
});

router.post('/',
  [body('name').notEmpty(), body('type').isIn(Object.keys(QUEUE_MAP).concat(['multi'])), body('content.body').notEmpty()],
  validate,
  async (req, res) => {
    const campaign = await Campaign.create({ ...req.body, userId: req.user._id, status: 'draft' });
    res.status(201).json({ success: true, data: campaign });
  }
);

router.put('/:id', async (req, res) => {
  const campaign = await Campaign.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    req.body, { new: true, runValidators: false }
  );
  if (!campaign) return res.status(404).json({ success: false, message: msg(req,'campaign_not_found') });
  res.json({ success: true, data: campaign });
});

router.delete('/:id', async (req, res) => {
  const campaign = await Campaign.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!campaign) return res.status(404).json({ success: false, message: msg(req,'campaign_not_found') });
  res.json({ success: true, message: 'Campaign deleted' });
});

// ═══════════════════════════════════════════════════════════
// LIFECYCLE: launch / pause / resume / cancel
// ═══════════════════════════════════════════════════════════

router.post('/:id/launch', async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
  if (!campaign) return res.status(404).json({ success: false, message: msg(req,'campaign_not_found') });
  if (!['draft', 'scheduled', 'paused'].includes(campaign.status))
    return res.status(400).json({ success: false, message: `Cannot launch: status is ${campaign.status}` });

  // Schedule for future?
  if (campaign.schedule?.sendAt && campaign.schedule.sendAt > new Date()) {
    await Campaign.findByIdAndUpdate(campaign._id, { status: 'scheduled' });
    return res.json({ success: true, message: 'Campaign scheduled', scheduledAt: campaign.schedule.sendAt });
  }

  const queueDef = QUEUE_MAP[campaign.type] || { queue: emailQueue, job: 'bulk-send' };
  const { queue, job: jobName } = queueDef;
  const qJob = await queue.add(jobName,
    { campaignId: campaign._id.toString() },
    { attempts: 3, backoff: { type: 'exponential', delay: 10000 }, removeOnComplete: 50 }
  );
  await Campaign.findByIdAndUpdate(campaign._id, {
    status: 'running', jobId: qJob.id.toString(), 'stats.startedAt': new Date(),
  });
  res.json({ success: true, message: msg(req,'campaign_launched'), jobId: qJob.id });
});

router.post('/:id/pause', async (req, res) => {
  const campaign = await Campaign.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id, status: 'running' },
    { status: 'paused' }, { new: true }
  );
  if (!campaign) return res.status(404).json({ success: false, message: 'Running campaign not found' });
  res.json({ success: true, message: msg(req,'campaign_paused'), data: campaign });
});

router.post('/:id/resume', async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id, status: 'paused' });
  if (!campaign) return res.status(404).json({ success: false, message: 'Paused campaign not found' });
  const { queue } = QUEUE_MAP[campaign.type] || { queue: emailQueue };
  const qJob = await queue.add('bulk-send', { campaignId: campaign._id.toString() }, { attempts: 3 });
  await Campaign.findByIdAndUpdate(campaign._id, { status: 'running', jobId: qJob.id.toString() });
  res.json({ success: true, message: 'Resumed', jobId: qJob.id });
});

router.post('/:id/cancel', async (req, res) => {
  const campaign = await Campaign.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id, status: { $in: ['running', 'scheduled', 'paused'] } },
    { status: 'cancelled', 'stats.completedAt': new Date() }, { new: true }
  );
  if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found or not cancellable' });
  res.json({ success: true, message: 'Cancelled', data: campaign });
});

// ═══════════════════════════════════════════════════════════
// DUPLICATE + TEMPLATE
// ═══════════════════════════════════════════════════════════

router.post('/:id/duplicate', async (req, res) => {
  const original = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
  if (!original) return res.status(404).json({ success: false, message: msg(req,'campaign_not_found') });

  const { name, type, content, audience, schedule, settings, tags } = original.toObject();

  const clone = await Campaign.create({
    userId: req.user._id,
    name:   `${name} (copy)`,
    type, content, audience, settings, tags,
    status: 'draft',
    schedule: req.body.reschedule ? req.body.schedule : { ...schedule, sendAt: undefined },
    stats: {},  // fresh stats
  });

  res.status(201).json({ success: true, data: clone, message: msg(req,'campaign_duplicated') });
});

router.post('/:id/save-as-template', async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
  if (!campaign) return res.status(404).json({ success: false, message: msg(req,'campaign_not_found') });

  // Save as MessageTemplate
  const mongoose = require('mongoose');
  const Template = mongoose.models.MessageTemplate || require('./templates').Template;

  // Build via direct model if exported, else create an entry
  const t = await mongoose.model('MessageTemplate').create({
    userId:   req.user._id,
    name:     req.body.name || `${campaign.name} Template`,
    platform: campaign.type,
    category: 'promotional',
    subject:  campaign.content?.subject,
    body:     campaign.content?.body || campaign.content?.html || '',
    tags:     campaign.tags || [],
  }).catch(() => null);

  if (!t) return res.json({ success: false, message: 'Template model not loaded — use /api/v1/templates directly' });
  res.status(201).json({ success: true, data: t, message: 'Saved as template' });
});

// List campaign templates
router.get('/list/templates', async (req, res) => {
  const campaigns = await Campaign.find({
    userId: req.user._id,
    'tags': 'template',
  }).sort('-updatedAt').limit(50);
  res.json({ success: true, data: campaigns });
});

// ═══════════════════════════════════════════════════════════
// STATS + ANALYTICS
// ═══════════════════════════════════════════════════════════

router.get('/:id/stats', async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
  if (!campaign) return res.status(404).json({ success: false, message: msg(req,'campaign_not_found') });

  const [statusBreakdown, dailyStats, hourlyDist, topContacts] = await Promise.all([
    MessageLog.aggregate([
      { $match: { campaignId: campaign._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    AnalyticsEvent.aggregate([
      { $match: { campaignId: campaign._id } },
      { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, event: '$event' }, count: { $sum: 1 } } },
      { $sort: { '_id.date': 1 } },
    ]),
    MessageLog.aggregate([
      { $match: { campaignId: campaign._id, status: { $in: ['opened', 'read'] } } },
      { $group: { _id: { $hour: '$openedAt' }, count: { $sum: 1 } } },
      { $sort: { '_id': 1 } },
    ]),
    MessageLog.aggregate([
      { $match: { campaignId: campaign._id, status: 'replied' } },
      { $lookup: { from: 'contacts', localField: 'contactId', foreignField: '_id', as: 'contact' } },
      { $limit: 10 },
    ]),
  ]);

  // Build funnel
  const sm = {};
  statusBreakdown.forEach(s => { sm[s._id] = s.count; });
  const total = Object.values(sm).reduce((a, b) => a + b, 0);
  const funnel = [
    { stage: 'Sent',      count: total },
    { stage: 'Delivered', count: sm.delivered || sm.read || 0 },
    { stage: 'Opened',    count: sm.opened || sm.read || 0 },
    { stage: 'Clicked',   count: sm.clicked || 0 },
    { stage: 'Replied',   count: sm.replied || 0 },
  ].map(f => ({ ...f, rate: total ? +(f.count / total * 100).toFixed(1) : 0 }));

  res.json({ success: true, data: { campaign, statusBreakdown, funnel, dailyStats, hourlyDist, topContacts } });
});

// ═══════════════════════════════════════════════════════════
// A/B TEST ENDPOINTS
// ═══════════════════════════════════════════════════════════

// Get A/B test stats for a campaign
router.get('/:id/ab/stats', async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
  if (!campaign) return res.status(404).json({ success: false, message: msg(req,'campaign_not_found') });
  if (!campaign.settings?.abTest?.enabled)
    return res.status(400).json({ success: false, message: 'A/B testing not enabled on this campaign' });

  const variants = campaign.settings.abTest.variants || [];

  // Count opens/clicks per variant name (stored in MessageLog.metadata.variant)
  const variantStats = await MessageLog.aggregate([
    { $match: { campaignId: campaign._id } },
    { $group: {
      _id:     '$metadata.variant',
      sent:    { $sum: 1 },
      opened:  { $sum: { $cond: [{ $eq: ['$status', 'opened'] }, 1, 0] } },
      clicked: { $sum: { $cond: [{ $eq: ['$status', 'clicked'] }, 1, 0] } },
      replied: { $sum: { $cond: [{ $eq: ['$status', 'replied'] }, 1, 0] } },
    }},
  ]);

  // Merge with variant definitions
  const enriched = variants.map(v => {
    const s = variantStats.find(vs => vs._id === v.name) || { sent: 0, opened: 0, clicked: 0, replied: 0 };
    return {
      name:      v.name,
      subject:   v.subject,
      body:      v.body?.substring(0, 100) + '…',
      weight:    v.weight,
      sent:      s.sent,
      opened:    s.opened,
      clicked:   s.clicked,
      replied:   s.replied,
      openRate:  s.sent ? +(s.opened  / s.sent * 100).toFixed(1) : 0,
      clickRate: s.sent ? +(s.clicked / s.sent * 100).toFixed(1) : 0,
      replyRate: s.sent ? +(s.replied / s.sent * 100).toFixed(1) : 0,
    };
  });

  // Determine winner
  const winner = enriched.reduce((best, v) =>
    (v.openRate + v.clickRate * 2) > (best.openRate + best.clickRate * 2) ? v : best,
    enriched[0] || {}
  );

  res.json({
    success: true,
    data: {
      variants:    enriched,
      winner:      winner?.name,
      currentWinner: campaign.settings.abTest.winner,
      isDecided:   !!campaign.settings.abTest.winner,
    },
  });
});

// Pick a winner and send remaining contacts with winning variant
router.post('/:id/ab/winner', async (req, res) => {
  const { variantName, sendRemaining = false } = req.body;
  if (!variantName) return res.status(400).json({ success: false, message: 'variantName required' });

  const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
  if (!campaign) return res.status(404).json({ success: false, message: msg(req,'campaign_not_found') });

  const variants = campaign.settings?.abTest?.variants || [];
  const winner   = variants.find(v => v.name === variantName);
  if (!winner) return res.status(400).json({ success: false, message: `Variant '${variantName}' not found` });

  // Mark winner
  await Campaign.findByIdAndUpdate(campaign._id, {
    'settings.abTest.winner': variantName,
  });

  // Optionally re-launch with winner content to unsent contacts
  if (sendRemaining && campaign.status === 'completed') {
    const sentIds = await MessageLog.distinct('contactId', { campaignId: campaign._id });
    const unsent  = await Contact.find({
      userId: campaign.userId,
      _id:    { $nin: sentIds },
      status: 'active',
    }).select('_id');

    if (unsent.length > 0) {
      const winnerCampaign = await Campaign.create({
        userId:  campaign.userId,
        name:    `${campaign.name} — Winner: ${variantName}`,
        type:    campaign.type,
        status:  'draft',
        content: {
          ...campaign.content,
          subject: winner.subject || campaign.content.subject,
          body:    winner.body    || campaign.content.body,
        },
        audience: { contactIds: unsent.map(c => c._id) },
        settings: { ...campaign.settings, abTest: { enabled: false } },
        tags:    [...(campaign.tags || []), 'ab-winner'],
      });

      const queueDef = QUEUE_MAP[campaign.type] || { queue: emailQueue, job: 'bulk-send' };
      const qJob = await queue.add(job, { campaignId: winnerCampaign._id.toString() }, { attempts: 3 });
      await Campaign.findByIdAndUpdate(winnerCampaign._id, { status: 'running', jobId: qJob.id.toString() });

      return res.json({
        success: true,
        message: `Winner set to '${variantName}'. Launched to ${unsent.length} remaining contacts.`,
        data:    { winnerId: campaign._id, winnerCampaignId: winnerCampaign._id, unsentCount: unsent.length },
      });
    }
  }

  res.json({ success: true, message: `Winner set to '${variantName}'`, data: { winner: variantName } });
});

// Auto-pick winner based on performance metrics
router.post('/:id/ab/auto-pick', async (req, res) => {
  const { metric = 'openRate', minSampleSize = 50 } = req.body;
  const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
  if (!campaign?.settings?.abTest?.enabled)
    return res.status(400).json({ success: false, message: 'A/B test not enabled' });

  const stats = await MessageLog.aggregate([
    { $match: { campaignId: campaign._id } },
    { $group: {
      _id:     '$metadata.variant',
      sent:    { $sum: 1 },
      opened:  { $sum: { $cond: [{ $eq: ['$status', 'opened']  }, 1, 0] } },
      clicked: { $sum: { $cond: [{ $eq: ['$status', 'clicked'] }, 1, 0] } },
    }},
  ]);

  // Require minimum sample
  const valid = stats.filter(s => s.sent >= minSampleSize);
  if (valid.length < 2)
    return res.status(400).json({ success: false, message: `Need ≥${minSampleSize} sends per variant. Got: ${stats.map(s => `${s._id}:${s.sent}`).join(', ')}` });

  const scored = valid.map(s => ({
    name:  s._id,
    score: metric === 'clickRate'
      ? s.sent ? s.clicked / s.sent : 0
      : s.sent ? s.opened  / s.sent : 0,
  }));

  scored.sort((a, b) => b.score - a.score);
  const winnerName = scored[0].name;

  await Campaign.findByIdAndUpdate(campaign._id, { 'settings.abTest.winner': winnerName });

  res.json({
    success: true,
    data:    { winner: winnerName, metric, scores: scored, sampleSize: valid[0].sent },
    message: `Auto-picked '${winnerName}' based on ${metric}`,
  });
});

module.exports = router;
