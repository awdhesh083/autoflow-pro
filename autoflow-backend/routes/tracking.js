'use strict';
/**
 * Tracking & Attribution Routes — /api/v1/tracking
 *
 * GET  /tracking/status          — shows which platforms are configured
 * POST /tracking/conversion      — manual conversion event (CRM / webhook trigger)
 * POST /tracking/lead            — manual lead event
 * GET  /tracking/utm/build       — build a UTM-tagged URL
 * POST /tracking/test            — send a test event to verify setup
 * GET  /tracking/report/:period  — attribution report: which campaigns drove conversions
 */
const express  = require('express');
const { authenticate } = require('../middleware/auth');
const { Campaign, Contact, AnalyticsEvent } = require('../models');
const TrackingService = require('../services/tracking.service');

const router = express.Router();
router.use(authenticate);

// ── GET /tracking/status ──────────────────────────────────────────────────
router.get('/status', (_req, res) => {
  res.json({ success: true, data: TrackingService.getStatus() });
});

// ── POST /tracking/test ───────────────────────────────────────────────────
router.post('/test', async (req, res) => {
  const status = TrackingService.getStatus();
  const results = {};

  if (status.ga4.configured) {
    results.ga4 = await TrackingService.GA4.send(
      'autoflow-test-client',
      'test_event',
      { test: true, timestamp: Date.now() }
    );
  } else {
    results.ga4 = { skipped: true, reason: 'no_ga4_config', hint: 'Add GA4_MEASUREMENT_ID and GA4_API_SECRET to .env' };
  }

  if (status.meta.configured) {
    results.meta = await TrackingService.MetaPixel.send(
      'PageView',
      { email: req.user.email },
      { test_event: true }
    );
  } else {
    results.meta = { skipped: true, reason: 'no_meta_config', hint: 'Add META_PIXEL_ID and META_CAPI_TOKEN to .env' };
  }

  res.json({ success: true, data: results });
});

// ── POST /tracking/conversion ─────────────────────────────────────────────
router.post('/conversion', async (req, res) => {
  const { contactId, campaignId, value = 0, currency = 'USD', eventType = 'purchase' } = req.body;
  if (!contactId) return res.status(400).json({ success: false, message: 'contactId required' });

  const [contact, campaign] = await Promise.all([
    Contact.findOne({ _id: contactId, userId: req.user._id }).lean(),
    campaignId ? Campaign.findOne({ _id: campaignId, userId: req.user._id }).lean() : Promise.resolve(null),
  ]);
  if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

  // Record in internal analytics
  await AnalyticsEvent.create({
    userId:     req.user._id,
    campaignId: campaign?._id,
    contactId:  contact._id,
    platform:   campaign?.type || 'manual',
    event:      'converted',
    value,
    meta:       { currency, eventType, source: 'api' },
  });

  // Fire external trackers
  const results = await TrackingService.trackConversion(contact, campaign, eventType, { value, currency });

  // Update campaign conversion stat
  if (campaign) {
    await Campaign.findByIdAndUpdate(campaign._id, {
      $inc: { 'stats.conversions': 1, 'stats.revenue': value },
    });
  }

  res.json({ success: true, data: { results, contact: contact.name, value, currency } });
});

// ── POST /tracking/lead ───────────────────────────────────────────────────
router.post('/lead', async (req, res) => {
  const { contactId, campaignId } = req.body;
  if (!contactId) return res.status(400).json({ success: false, message: 'contactId required' });

  const [contact, campaign] = await Promise.all([
    Contact.findOne({ _id: contactId, userId: req.user._id }).lean(),
    campaignId ? Campaign.findOne({ _id: campaignId, userId: req.user._id }).lean() : Promise.resolve(null),
  ]);
  if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

  const results = await TrackingService.trackLead(contact, campaign);
  res.json({ success: true, data: { results } });
});

// ── GET /tracking/utm/build ───────────────────────────────────────────────
// Build UTM-tagged URL from campaign fields (convenience endpoint)
router.post('/utm/build', (req, res) => {
  const { url, source = 'autoflow', medium, campaign, content, term } = req.body;
  if (!url) return res.status(400).json({ success: false, message: 'url required' });
  try {
    const u = new URL(url);
    if (source)   u.searchParams.set('utm_source',   source);
    if (medium)   u.searchParams.set('utm_medium',   medium);
    if (campaign) u.searchParams.set('utm_campaign',  campaign);
    if (content)  u.searchParams.set('utm_content',  content);
    if (term)     u.searchParams.set('utm_term',     term);
    res.json({ success: true, data: { url: u.toString() } });
  } catch {
    res.status(400).json({ success: false, message: 'Invalid URL' });
  }
});

// ── GET /tracking/report/:period ──────────────────────────────────────────
// Attribution report: which campaigns produced the most conversions/revenue
router.get('/report/:period', async (req, res) => {
  const periodMap = { '7d': 7, '30d': 30, '90d': 90 };
  const days      = periodMap[req.params.period] || 30;
  const since     = new Date(Date.now() - days * 86400000);

  const [conversions, topCampaigns, dailyConversions] = await Promise.all([
    // Total conversions this period
    AnalyticsEvent.aggregate([
      { $match: { userId: req.user._id, event: 'converted', date: { $gte: since } } },
      { $group: {
        _id:     null,
        total:   { $sum: 1 },
        revenue: { $sum: '$value' },
      }},
    ]),

    // Top campaigns by conversion
    AnalyticsEvent.aggregate([
      { $match: { userId: req.user._id, event: 'converted', campaignId: { $ne: null }, date: { $gte: since } } },
      { $group: { _id: '$campaignId', conversions: { $sum: 1 }, revenue: { $sum: '$value' } } },
      { $sort: { conversions: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'campaigns', localField: '_id', foreignField: '_id', as: 'campaign' } },
      { $unwind: { path: '$campaign', preserveNullAndEmptyArrays: true } },
      { $project: {
        _id:         1,
        conversions: 1,
        revenue:     1,
        name:        '$campaign.name',
        type:        '$campaign.type',
      }},
    ]),

    // Daily conversion trend
    AnalyticsEvent.aggregate([
      { $match: { userId: req.user._id, event: 'converted', date: { $gte: since } } },
      { $group: {
        _id:     { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        count:   { $sum: 1 },
        revenue: { $sum: '$value' },
      }},
      { $sort: { _id: 1 } },
    ]),
  ]);

  const summary = conversions[0] || { total: 0, revenue: 0 };

  res.json({
    success: true,
    data: {
      period:     req.params.period,
      summary:    { ...summary, avgRevenue: summary.total ? +(summary.revenue / summary.total).toFixed(2) : 0 },
      topCampaigns,
      dailyConversions,
      tracking:   TrackingService.getStatus(),
    },
  });
});

// ── GET /tracking/pixel/:campaignId ──────────────────────────────────────
// Embed conversion pixel in landing pages (1x1 gif that fires conversion)
router.get('/pixel/:campaignId', async (req, res) => {
  const { email, value = 0 } = req.query;
  // Fire async — don't block pixel response
  if (email) {
    const campaign = await Campaign.findById(req.params.campaignId).lean().catch(() => null);
    const contact  = await Contact.findOne({ email: email.toLowerCase() }).lean().catch(() => null);
    if (contact && campaign) {
      TrackingService.trackConversion(contact, campaign, 'pixel_conversion', { value: +value }).catch(() => {});
    }
  }
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-cache, no-store' }).send(pixel);
});

module.exports = router;
