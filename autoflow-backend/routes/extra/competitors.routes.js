'use strict';
/**
 * Competitor Spy Routes  —  /api/v1/spy
 * Track competitor accounts across all platforms, analyse their strategy,
 * get AI-generated reports, benchmark your metrics vs theirs.
 */
const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { CompetitorSpyService } = require('../../services/social/competitor-spy.service');

const router = express.Router();
router.use(authenticate);

// ── CRUD ────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const competitors = await CompetitorSpyService.getCompetitors(req.user._id, req.query);
  res.json({ success: true, data: competitors, total: competitors.length });
});

router.post('/', async (req, res) => {
  const competitor = await CompetitorSpyService.addCompetitor(req.user._id, req.body);
  res.status(201).json({ success: true, data: competitor });
});

router.get('/:id', async (req, res) => {
  const competitor = await CompetitorSpyService.getCompetitor(req.params.id, req.user._id);
  if (!competitor) return res.status(404).json({ success: false, message: 'Competitor not found' });
  res.json({ success: true, data: competitor });
});

router.put('/:id', async (req, res) => {
  const competitor = await CompetitorSpyService.updateCompetitor(req.params.id, req.user._id, req.body);
  res.json({ success: true, data: competitor });
});

router.delete('/:id', async (req, res) => {
  await CompetitorSpyService.deleteCompetitor(req.params.id, req.user._id);
  res.json({ success: true, message: 'Competitor removed' });
});

// ── Sync / Scrape ─────────────────────────────────────────────────────────
router.post('/:id/sync', async (req, res) => {
  const result = await CompetitorSpyService.syncCompetitor(req.params.id, req.user._id);
  res.json({ success: true, data: result });
});

router.post('/sync/all', async (req, res) => {
  const results = await CompetitorSpyService.syncAllCompetitors(req.user._id);
  res.json({ success: true, data: results });
});

// ── Analysis ──────────────────────────────────────────────────────────────
router.get('/:id/growth', async (req, res) => {
  const { days = 30, metric } = req.query;
  const result = await CompetitorSpyService.getGrowthData(req.params.id, req.user._id, { days: +days, metric });
  res.json({ success: true, data: result });
});

router.get('/:id/top-posts', async (req, res) => {
  const { limit = 10, platform, sortBy } = req.query;
  const result = await CompetitorSpyService.getTopPosts(req.params.id, req.user._id, { limit: +limit, platform, sortBy });
  res.json({ success: true, data: result });
});

router.get('/:id/hashtags', async (req, res) => {
  const result = await CompetitorSpyService.spyHashtags(req.params.id, req.user._id);
  res.json({ success: true, data: result });
});

router.get('/:id/best-times', async (req, res) => {
  const result = await CompetitorSpyService.getBestPostingTimes(req.params.id, req.user._id);
  res.json({ success: true, data: result });
});

// ── AI Reports ────────────────────────────────────────────────────────────
router.post('/:id/report', async (req, res) => {
  const result = await CompetitorSpyService.generateAIReport(req.params.id, req.user._id);
  res.json({ success: true, data: result });
});

// ── Benchmark ─────────────────────────────────────────────────────────────
router.post('/benchmark', async (req, res) => {
  const { yourMetrics, platform } = req.body;
  if (!yourMetrics) return res.status(400).json({ success: false, message: 'yourMetrics required' });
  const result = await CompetitorSpyService.benchmark(req.user._id, yourMetrics, platform);
  res.json({ success: true, data: result });
});

// ── Brand mention monitor ─────────────────────────────────────────────────
router.post('/monitor/mentions', async (req, res) => {
  const { keywords, options } = req.body;
  if (!keywords?.length) return res.status(400).json({ success: false, message: 'keywords array required' });
  const result = await CompetitorSpyService.monitorMentions(keywords, options || {});
  res.json({ success: true, data: result });
});

// ── Facebook Ad Library spy ───────────────────────────────────────────────
router.post('/spy/fb-ads', async (req, res) => {
  const { pageId, options } = req.body;
  if (!pageId) return res.status(400).json({ success: false, message: 'pageId required' });
  const result = await CompetitorSpyService.spyFacebookAds(pageId, options || {});
  res.json({ success: true, data: result });
});

module.exports = router;
