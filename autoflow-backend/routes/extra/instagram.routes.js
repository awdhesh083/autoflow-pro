'use strict';
/**
 * Instagram Routes  —  /api/v1/instagram
 * Full feature set: DM, follow, like, comment, scrape, story, upload, reel
 */
const express = require('express');
const multer  = require('multer');
const { authenticate } = require('../../middleware/auth');
const InstagramService = require('../../services/instagram.service');

const router = express.Router();
router.use(authenticate);

const upload = multer({ dest: 'uploads/ig/', limits: { fileSize: 100 * 1024 * 1024 } });

// ── Account ────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { accountId, username, password } = req.body;
  if (!accountId || !username || !password) return res.status(400).json({ success: false, message: 'accountId, username, password required' });
  const result = await InstagramService.login(accountId, username, password);
  res.json({ success: true, data: result });
});

// ── DM ─────────────────────────────────────────────────────────────────────
router.post('/dm/send', async (req, res) => {
  const { accountId, username, message } = req.body;
  const result = await InstagramService.sendDM(accountId, username, message);
  res.json({ success: true, data: result });
});

router.post('/dm/bulk', async (req, res) => {
  const { accountId, targets, message, options = {} } = req.body;
  if (!targets?.length) return res.status(400).json({ success: false, message: 'targets required' });
  // Run async — return job_id immediately
  InstagramService.sendBulkDM(accountId, targets, message, { userId: req.user._id, ...options })
    .then(r => console.log(`IG DM bulk done: ${r.sent} sent`))
    .catch(e => console.error(`IG DM bulk error: ${e.message}`));
  res.json({ success: true, message: `DM campaign started for ${targets.length} targets`, queued: targets.length });
});

// ── Follow / Unfollow ──────────────────────────────────────────────────────
router.post('/follow', async (req, res) => {
  const { accountId, usernames, options } = req.body;
  const result = await InstagramService.autoFollow(accountId, usernames, options);
  res.json({ success: true, data: result });
});

router.post('/unfollow', async (req, res) => {
  const { accountId, options } = req.body;
  const result = await InstagramService.autoUnfollow(accountId, options);
  res.json({ success: true, data: result });
});

// ── Like ───────────────────────────────────────────────────────────────────
router.post('/like/hashtag', async (req, res) => {
  const { accountId, hashtag, options } = req.body;
  const result = await InstagramService.autoLikeByHashtag(accountId, hashtag, options);
  res.json({ success: true, data: result });
});

// ── Comment ────────────────────────────────────────────────────────────────
router.post('/comment', async (req, res) => {
  const { accountId, mediaIds, comments, options } = req.body;
  const result = await InstagramService.autoComment(accountId, mediaIds, comments, options);
  res.json({ success: true, data: result });
});

// ── Story ──────────────────────────────────────────────────────────────────
router.post('/story/view', async (req, res) => {
  const { accountId, userIds } = req.body;
  if (!userIds?.length) return res.status(400).json({ success: false, message: 'userIds required' });
  const result = await InstagramService.autoViewStories(accountId, userIds);
  res.json({ success: true, data: result });
});

// ── Scrape ─────────────────────────────────────────────────────────────────
router.get('/scrape/hashtag', async (req, res) => {
  const { accountId, hashtag, limit = 100 } = req.query;
  const users = await InstagramService.scrapeByHashtag(accountId, hashtag, +limit);
  res.json({ success: true, data: users, count: users.length });
});

router.get('/scrape/followers', async (req, res) => {
  const { accountId, username, limit = 200 } = req.query;
  const users = await InstagramService.scrapeCompetitorFollowers(accountId, username, +limit);
  res.json({ success: true, data: users, count: users.length });
});

router.get('/followers', async (req, res) => {
  const { accountId, username } = req.query;
  const followers = await InstagramService.getAllFollowers(accountId, username);
  res.json({ success: true, data: followers, count: followers.length });
});

router.get('/following', async (req, res) => {
  const { accountId, username } = req.query;
  const following = await InstagramService.getAllFollowing(accountId, username);
  res.json({ success: true, data: following, count: following.length });
});

// ── Upload ─────────────────────────────────────────────────────────────────
router.post('/post', upload.single('image'), async (req, res) => {
  const { accountId, caption } = req.body;
  const imagePath = req.file?.path || req.body.imagePath;
  if (!imagePath) return res.status(400).json({ success: false, message: 'image file or imagePath required' });
  const result = await InstagramService.uploadPost(accountId, imagePath, caption);
  res.json({ success: true, data: result });
});

router.post('/reel', upload.single('video'), async (req, res) => {
  const { accountId, caption } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  if (!videoPath) return res.status(400).json({ success: false, message: 'video file or videoPath required' });
  const result = await InstagramService.uploadReel(accountId, videoPath, caption);
  res.json({ success: true, data: result });
});

module.exports = router;
