'use strict';
const express = require('express');
const multer  = require('multer');
const { authenticate } = require('../../middleware/auth');
const TikTokService = require('../../services/social/tiktok.service');

const router = express.Router();
router.use(authenticate);
const upload = multer({ dest: 'uploads/tiktok/', limits: { fileSize: 500 * 1024 * 1024 } });

router.post('/login', async (req, res) => {
  const { accountId } = req.body;
  const result = await TikTokService.login(accountId);
  res.json({ success: true, data: result });
});

router.post('/upload', upload.single('video'), async (req, res) => {
  const { accountId, caption, hashtags, schedule } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  if (!videoPath) return res.status(400).json({ success: false, message: 'video required' });
  const result = await TikTokService.uploadVideo(accountId, videoPath, { caption, hashtags: hashtags ? JSON.parse(hashtags) : [], schedule });
  res.json({ success: true, data: result });
});

router.post('/follow', async (req, res) => {
  const { accountId, usernames, options } = req.body;
  const result = await TikTokService.autoFollow(accountId, usernames, options);
  res.json({ success: true, data: result });
});

router.post('/like/hashtag', async (req, res) => {
  const { accountId, hashtag, options } = req.body;
  const result = await TikTokService.autoLikeByHashtag(accountId, hashtag, options);
  res.json({ success: true, data: result });
});

router.post('/comment', async (req, res) => {
  const { accountId, videoUrls, comments, options } = req.body;
  const result = await TikTokService.autoComment(accountId, videoUrls, comments, options);
  res.json({ success: true, data: result });
});

router.get('/scrape/hashtag', async (req, res) => {
  const { accountId, hashtag, limit = 100 } = req.query;
  const users = await TikTokService.scrapeUsersByHashtag(accountId, hashtag, +limit);
  res.json({ success: true, data: users, count: users.length });
});

router.post('/download', async (req, res) => {
  const { videoUrl } = req.body;
  if (!videoUrl) return res.status(400).json({ success: false, message: 'videoUrl required' });
  const result = await TikTokService.downloadVideo(videoUrl);
  res.json({ success: true, data: result });
});

router.post('/download/batch', async (req, res) => {
  const { videoUrls } = req.body;
  if (!videoUrls?.length) return res.status(400).json({ success: false, message: 'videoUrls array required' });
  const results = await TikTokService.downloadBatch(videoUrls);
  res.json({ success: true, data: results });
});

router.get('/trends', async (req, res) => {
  const { country = 'US' } = req.query;
  const result = await TikTokService.getTrendingHashtags(country);
  res.json({ success: true, data: result });
});

router.post('/dm/send', async (req, res) => {
  const { accountId, username, message } = req.body;
  const result = await TikTokService.sendDM(accountId, username, message);
  res.json({ success: true, data: result });
});

router.post('/dm/bulk', async (req, res) => {
  const { accountId, targets, message, options } = req.body;
  TikTokService.sendBulkDM(accountId, targets, message, options || {})
    .catch(e => console.error(`TikTok bulk DM: ${e.message}`));
  res.json({ success: true, message: `DM campaign queued for ${targets?.length} targets` });
});

router.get('/followers/export', async (req, res) => {
  const { accountId, username, limit } = req.query;
  const result = await TikTokService.exportFollowers(accountId, username, +limit);
  res.json({ success: true, data: result });
});

router.delete('/disconnect/:accountId', async (req, res) => {
  await TikTokService.disconnect(req.params.accountId);
  res.json({ success: true, message: 'TikTok disconnected' });
});

module.exports = router;
