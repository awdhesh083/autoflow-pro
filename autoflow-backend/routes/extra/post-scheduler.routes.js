'use strict';
/**
 * Post Scheduler Routes  —  /api/v1/schedule-posts
 * Multi-platform post scheduling with Bull queue, recurring posts,
 * best-time recommendations, bulk CSV import, and per-post analytics.
 */
const express = require('express');
const multer  = require('multer');
const csv     = require('csv-parser');
const fs      = require('fs');
const { authenticate } = require('../../middleware/auth');
const { PostSchedulerService, ScheduledPost } = require('../../services/social/post-scheduler.service');

const router = express.Router();
router.use(authenticate);
const upload = multer({
  dest:   'uploads/scheduled/',
  limits: { fileSize: 500 * 1024 * 1024 },
});

// ── CRUD ────────────────────────────────────────────────────────────────────
// GET / — list posts
router.get('/', async (req, res) => {
  const result = await PostSchedulerService.getPosts(req.user._id, req.query);
  res.json({ success: true, ...result });
});

// POST / — create + schedule a post
router.post('/', upload.array('media', 10), async (req, res) => {
  const postData  = JSON.parse(req.body.postData || '{}');
  const mediaPaths = req.files?.map(f => f.path) || [];
  if (mediaPaths.length) {
    postData.platforms = (postData.platforms || []).map(p => ({ ...p, mediaPath: mediaPaths[0] }));
  }
  const options = JSON.parse(req.body.options || '{}');
  const result  = await PostSchedulerService.createPost(req.user._id, postData, options);
  res.status(201).json({ success: true, data: result });
});

// GET /:id
router.get('/:id', async (req, res) => {
  const post = await PostSchedulerService.getPost(req.params.id, req.user._id);
  if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
  res.json({ success: true, data: post });
});

// PUT /:id — update draft
router.put('/:id', async (req, res) => {
  const post = await PostSchedulerService.updatePost(req.params.id, req.user._id, req.body);
  res.json({ success: true, data: post });
});

// DELETE /:id/cancel — cancel scheduled post
router.delete('/:id/cancel', async (req, res) => {
  const post = await PostSchedulerService.cancelPost(req.params.id, req.user._id);
  res.json({ success: true, message: 'Post cancelled', data: post });
});

// DELETE /:id — delete post entirely
router.delete('/:id', async (req, res) => {
  await PostSchedulerService.deletePost(req.params.id, req.user._id);
  res.json({ success: true, message: 'Post deleted' });
});

// ── Publish ──────────────────────────────────────────────────────────────────
// POST /:id/publish-now — bypass schedule, publish immediately
router.post('/:id/publish-now', async (req, res) => {
  const result = await PostSchedulerService.publishPost(req.params.id);
  res.json({ success: true, data: result });
});

// ── Calendar view ─────────────────────────────────────────────────────────
router.get('/calendar/month', async (req, res) => {
  const { month, year } = req.query;
  const m    = parseInt(month) || new Date().getMonth() + 1;
  const y    = parseInt(year)  || new Date().getFullYear();
  const from = new Date(y, m - 1, 1);
  const to   = new Date(y, m, 0, 23, 59, 59);

  const posts = await ScheduledPost.find({
    userId:      req.user._id,
    scheduledAt: { $gte: from, $lte: to },
    status:      { $in: ['draft', 'scheduled', 'published', 'partial', 'failed'] },
  }).sort('scheduledAt').lean();

  res.json({ success: true, data: posts, total: posts.length });
});

// ── Bulk import from CSV ──────────────────────────────────────────────────
router.post('/bulk/csv', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'CSV file required' });
  const rows = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', resolve)
      .on('error', reject);
  });
  fs.unlinkSync(req.file.path);

  // Map CSV rows to post data format
  const postsArray = rows.map(row => ({
    content:     { text: row.text || row.content || row.caption || '' },
    platforms:   (row.platforms || row.platform || 'instagram').split(',').map(p => ({ platform: p.trim(), caption: row.text || row.content || '' })),
    scheduledAt: row.scheduledAt || row.scheduled_at || row.date,
    tags:        row.tags ? row.tags.split(',').map(t => t.trim()) : [],
  })).filter(p => p.content.text && p.scheduledAt);

  const result = await PostSchedulerService.bulkSchedule(req.user._id, postsArray);
  res.json({ success: true, data: result, processed: rows.length, scheduled: postsArray.length });
});

// ── Analytics ─────────────────────────────────────────────────────────────
router.get('/analytics/summary', async (req, res) => {
  const { days = 30 } = req.query;
  const result = await PostSchedulerService.getAnalytics(req.user._id, +days);
  res.json({ success: true, data: result });
});

// ── Best time recommendation ──────────────────────────────────────────────
router.get('/best-time', async (req, res) => {
  const { platform, timezone } = req.query;
  // Returns best posting times based on engagement data
  const bestTimes = {
    instagram: ['09:00', '12:00', '17:00', '21:00'],
    twitter:   ['08:00', '12:00', '17:00'],
    linkedin:  ['08:00', '12:00', '17:00'],
    facebook:  ['09:00', '13:00', '16:00'],
    tiktok:    ['07:00', '19:00', '21:00'],
    youtube:   ['14:00', '17:00', '20:00'],
  };
  res.json({ success: true, data: { platform, bestTimes: bestTimes[platform] || bestTimes.instagram, timezone } });
});

module.exports = router;
