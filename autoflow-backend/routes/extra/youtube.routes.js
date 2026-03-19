'use strict';
const express = require('express');
const multer  = require('multer');
const { authenticate } = require('../../middleware/auth');
const YouTubeService = require('../../services/social/youtube.service');

const router = express.Router();
router.use(authenticate);
const upload = multer({ dest: 'uploads/youtube/', limits: { fileSize: 2 * 1024 * 1024 * 1024 } }); // 2GB

router.post('/upload', upload.single('video'), async (req, res) => {
  const { accountId, title, description, tags, privacy, category } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  if (!videoPath) return res.status(400).json({ success: false, message: 'video required' });
  const result = await YouTubeService.uploadVideo(accountId, videoPath, {
    title, description, tags: tags ? JSON.parse(tags) : [], privacy, category,
  });
  res.json({ success: true, data: result });
});

router.post('/subscribe', async (req, res) => {
  const { accountId, channelUrls, options } = req.body;
  const result = await YouTubeService.autoSubscribe(accountId, channelUrls, options);
  res.json({ success: true, data: result });
});

router.post('/like', async (req, res) => {
  const { accountId, videoUrls, options } = req.body;
  const result = await YouTubeService.autoLike(accountId, videoUrls, options);
  res.json({ success: true, data: result });
});

router.post('/comment', async (req, res) => {
  const { accountId, videoUrls, comments, options } = req.body;
  const result = await YouTubeService.autoComment(accountId, videoUrls, comments, options);
  res.json({ success: true, data: result });
});

router.post('/download', async (req, res) => {
  const { videoUrl, format, quality } = req.body;
  if (!videoUrl) return res.status(400).json({ success: false, message: 'videoUrl required' });
  const result = await YouTubeService.downloadVideo(videoUrl, { format, quality });
  res.json({ success: true, data: result });
});

router.get('/scrape/channel', async (req, res) => {
  const { channelUrl, maxVideos } = req.query;
  const result = await YouTubeService.scrapeChannel(channelUrl, { maxVideos: +maxVideos });
  res.json({ success: true, data: result });
});

router.get('/scrape/comments', async (req, res) => {
  const { videoUrl, limit } = req.query;
  const result = await YouTubeService.scrapeComments(videoUrl, +limit);
  res.json({ success: true, data: result });
});

router.post('/playlist', async (req, res) => {
  const { accountId, title, description, privacy } = req.body;
  const result = await YouTubeService.createPlaylist(accountId, title, description, privacy);
  res.json({ success: true, data: result });
});

router.post('/playlist/:playlistId/video', async (req, res) => {
  const { accountId, videoId } = req.body;
  const result = await YouTubeService.addVideoToPlaylist(accountId, req.params.playlistId, videoId);
  res.json({ success: true, data: result });
});

router.post('/thumbnail/generate', async (req, res) => {
  const { videoTitle, style } = req.body;
  const result = await YouTubeService.generateThumbnail(videoTitle, style);
  res.json({ success: true, data: result });
});

router.post('/competitors/monitor', async (req, res) => {
  const { channelUrls } = req.body;
  const result = await YouTubeService.monitorCompetitors(channelUrls, req.user._id);
  res.json({ success: true, data: result });
});

router.delete('/disconnect/:accountId', async (req, res) => {
  await YouTubeService.disconnect(req.params.accountId);
  res.json({ success: true, message: 'YouTube disconnected' });
});

module.exports = router;
