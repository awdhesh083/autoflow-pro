'use strict';
/**
 * Link Shortener + UTM Tracker — /api/v1/links
 * af.io/XXXXXX → redirect + track → analytics per link
 */
const express  = require('express');
const mongoose = require('mongoose');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── ShortLink model ────────────────────────────────────────────────────────
const shortLinkSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', index: true },

  shortCode:  { type: String, required: true, unique: true, index: true },
  originalUrl:{ type: String, required: true },

  // UTM params (auto-appended on redirect)
  utm: {
    source:   { type: String, default: 'autoflow' },
    medium:   String,    // whatsapp | email | sms | instagram
    campaign: String,    // campaign name slug
    content:  String,    // variant label for A/B
    term:     String,
  },

  title:      String,
  isActive:   { type: Boolean, default: true },
  expiresAt:  Date,

  // Aggregate stats
  clicks:     { type: Number, default: 0 },
  uniqueClicks:{ type: Number, default: 0 },

  // Per-click log (capped at 500 per link)
  clickLog: [{
    clickedAt: { type: Date, default: Date.now },
    ip:        String,
    country:   String,
    device:    String,   // desktop | mobile | tablet
    browser:   String,
    referrer:  String,
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  }],
}, { timestamps: true });

shortLinkSchema.index({ userId: 1, createdAt: -1 });

const ShortLink = mongoose.models.ShortLink || mongoose.model('ShortLink', shortLinkSchema);

// ── helpers ───────────────────────────────────────────────────────────────
function generateCode(len = 6) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function detectDevice(ua = '') {
  if (/tablet|ipad/i.test(ua))  return 'tablet';
  if (/mobile|android|iphone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function buildDestUrl(originalUrl, utm) {
  try {
    const url = new URL(originalUrl);
    if (utm.source)   url.searchParams.set('utm_source',   utm.source);
    if (utm.medium)   url.searchParams.set('utm_medium',   utm.medium);
    if (utm.campaign) url.searchParams.set('utm_campaign',  utm.campaign);
    if (utm.content)  url.searchParams.set('utm_content',  utm.content);
    if (utm.term)     url.searchParams.set('utm_term',      utm.term);
    return url.toString();
  } catch {
    return originalUrl;
  }
}

// ── PUBLIC: redirect endpoint (no auth) ──────────────────────────────────
router.get('/r/:code', async (req, res) => {
  const link = await ShortLink.findOne({ shortCode: req.params.code, isActive: true });

  if (!link) return res.redirect(302, process.env.FRONTEND_URL || 'http://localhost:5173');
  if (link.expiresAt && link.expiresAt < new Date()) {
    return res.status(410).send('This link has expired');
  }

  // Build destination with UTM params
  const destUrl = buildDestUrl(link.originalUrl, link.utm);

  // Track asynchronously — never block redirect
  const ua      = req.get('user-agent') || '';
  const clickEntry = {
    clickedAt: new Date(),
    ip:        req.ip,
    device:    detectDevice(ua),
    browser:   /chrome/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Other',
    referrer:  req.get('referrer') || '',
    contactId: req.query.cid || undefined,
  };

  ShortLink.findByIdAndUpdate(link._id, {
    $inc:  { clicks: 1 },
    $push: { clickLog: { $each: [clickEntry], $slice: -500 } },
  }).catch(() => {});

  // Update contact click stat if cid provided
  if (req.query.cid) {
    const { Contact } = require('../models');
    Contact.findByIdAndUpdate(req.query.cid, {
      $inc: { 'stats.emailsClicked': 1 },
    }).catch(() => {});
  }

  res.redirect(302, destUrl);
});

// ── AUTHENTICATED routes ──────────────────────────────────────────────────
router.use(authenticate);

// List user's links
router.get('/', async (req, res) => {
  const { page = 1, limit = 30, campaignId } = req.query;
  const q = { userId: req.user._id };
  if (campaignId) q.campaignId = campaignId;

  const [links, total] = await Promise.all([
    ShortLink.find(q).select('-clickLog').sort('-createdAt').skip((page - 1) * limit).limit(+limit),
    ShortLink.countDocuments(q),
  ]);
  res.json({ success: true, data: links, total, page: +page });
});

// Get single link + full click log
router.get('/:id', async (req, res) => {
  const link = await ShortLink.findOne({ _id: req.params.id, userId: req.user._id });
  if (!link) return res.status(404).json({ success: false, message: 'Link not found' });
  res.json({ success: true, data: link });
});

// Analytics summary for a link
router.get('/:id/stats', async (req, res) => {
  const link = await ShortLink.findOne({ _id: req.params.id, userId: req.user._id });
  if (!link) return res.status(404).json({ success: false, message: 'Link not found' });

  const byDevice = {};
  const byDate   = {};
  const byBrowser= {};

  (link.clickLog || []).forEach(c => {
    const d = c.clickedAt?.toISOString()?.split('T')[0] || 'unknown';
    byDevice[c.device]   = (byDevice[c.device]   || 0) + 1;
    byDate[d]            = (byDate[d]             || 0) + 1;
    byBrowser[c.browser] = (byBrowser[c.browser]  || 0) + 1;
  });

  res.json({
    success: true,
    data: {
      totalClicks:  link.clicks,
      byDevice:     Object.entries(byDevice).map(([device, count]) => ({ device, count })),
      byBrowser:    Object.entries(byBrowser).map(([browser, count]) => ({ browser, count })),
      dailyClicks:  Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
      recentClicks: link.clickLog.slice(-10).reverse(),
    },
  });
});

// Create / shorten link
router.post('/', async (req, res) => {
  const { url, campaignId, platform, campaignName, title, expiresIn, content } = req.body;
  if (!url) return res.status(400).json({ success: false, message: 'url required' });

  // Generate unique code
  let shortCode;
  for (let i = 0; i < 10; i++) {
    const candidate = generateCode();
    const exists    = await ShortLink.findOne({ shortCode: candidate });
    if (!exists) { shortCode = candidate; break; }
  }
  if (!shortCode) return res.status(500).json({ success: false, message: 'Failed to generate short code' });

  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';

  const link = await ShortLink.create({
    userId:     req.user._id,
    campaignId: campaignId || undefined,
    shortCode,
    originalUrl: url,
    title:      title || url.substring(0, 60),
    utm: {
      source:   'autoflow',
      medium:   platform || 'unknown',
      campaign: campaignName ? campaignName.toLowerCase().replace(/\s+/g, '-') : undefined,
      content:  content || undefined,
    },
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
  });

  res.status(201).json({
    success: true,
    data: {
      ...link.toObject(),
      shortUrl: `${baseUrl}/api/v1/links/r/${shortCode}`,
    },
  });
});

// Bulk shorten (for campaign use)
router.post('/bulk', async (req, res) => {
  const { urls, platform, campaignId, campaignName } = req.body;
  if (!Array.isArray(urls) || !urls.length)
    return res.status(400).json({ success: false, message: 'urls array required' });

  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  const results = [];

  for (const url of urls.slice(0, 100)) {
    let shortCode;
    for (let i = 0; i < 5; i++) {
      const candidate = generateCode();
      if (!await ShortLink.findOne({ shortCode: candidate })) { shortCode = candidate; break; }
    }
    if (!shortCode) continue;

    const link = await ShortLink.create({
      userId: req.user._id, campaignId, shortCode, originalUrl: url,
      utm: { source: 'autoflow', medium: platform, campaign: campaignName?.toLowerCase().replace(/\s+/g,'-') },
    });
    results.push({ original: url, shortUrl: `${baseUrl}/api/v1/links/r/${shortCode}`, id: link._id });
  }

  res.status(201).json({ success: true, data: results, count: results.length });
});

// Update link
router.put('/:id', async (req, res) => {
  const allowed = ['title', 'isActive', 'expiresAt', 'utm'];
  const update  = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
  const link = await ShortLink.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, update, { new: true }).select('-clickLog');
  if (!link) return res.status(404).json({ success: false, message: 'Link not found' });
  res.json({ success: true, data: link });
});

// Delete link
router.delete('/:id', async (req, res) => {
  await ShortLink.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  res.json({ success: true, message: 'Link deleted' });
});

// UTM builder helper (no DB, just builds the URL)
router.post('/utm/build', authenticate, (req, res) => {
  const { url, source = 'autoflow', medium, campaign, content, term } = req.body;
  if (!url) return res.status(400).json({ success: false, message: 'url required' });
  const dest = buildDestUrl(url, { source, medium, campaign, content, term });
  res.json({ success: true, data: { url: dest } });
});

module.exports = router;
