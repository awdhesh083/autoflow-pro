'use strict';
/**
 * Content Repurposer Routes  —  /api/v1/repurpose
 * Turns any long-form content (YouTube, blog, podcast, PDF) into
 * platform-native short-form content for all social channels.
 */
const express = require('express');
const multer  = require('multer');
const { authenticate } = require('../../middleware/auth');
const Repurposer = require('../../services/social/content-repurposer.service');

const router = express.Router();
router.use(authenticate);
const upload = multer({ dest: 'uploads/repurpose/', limits: { fileSize: 500 * 1024 * 1024 } });

// POST /from-url — extract content from any URL then repurpose
router.post('/from-url', async (req, res) => {
  const { url, formats, options } = req.body;
  if (!url) return res.status(400).json({ success: false, message: 'url required' });
  const result = await Repurposer.repurposeFromUrl(url, formats || [], options || {});
  res.json({ success: true, data: result });
});

// POST /from-youtube — YouTube video → clips, shorts, tweets, blog
router.post('/from-youtube', async (req, res) => {
  const { videoUrl, formats, options } = req.body;
  if (!videoUrl) return res.status(400).json({ success: false, message: 'videoUrl required' });
  const result = await Repurposer.repurposeFromYouTube(videoUrl, formats || [], options || {});
  res.json({ success: true, data: result });
});

// POST /from-text — blog/article → social posts
router.post('/from-text', async (req, res) => {
  const { text, title, formats, options } = req.body;
  if (!text) return res.status(400).json({ success: false, message: 'text required' });
  const result = await Repurposer.repurposeFromText(text, formats || [], { title, ...options });
  res.json({ success: true, data: result });
});

// POST /from-audio — podcast/audio → transcript + social posts
router.post('/from-audio', upload.single('audio'), async (req, res) => {
  const audioPath = req.file?.path || req.body.audioPath;
  if (!audioPath) return res.status(400).json({ success: false, message: 'audio file required' });
  const content = await Repurposer.extractFromAudio(audioPath);
  const formats = req.body.formats ? JSON.parse(req.body.formats) : [];
  const result  = await Repurposer.repurposeToMany(content, formats, JSON.parse(req.body.options || '{}'));
  res.json({ success: true, data: result });
});

// POST /smart — auto-detect best formats + repurpose
router.post('/smart', async (req, res) => {
  const { url, text, options } = req.body;
  if (!url && !text) return res.status(400).json({ success: false, message: 'url or text required' });
  let contentData;
  if (url) contentData = await Repurposer.extractFromUrl(url);
  else     contentData = { text, type: 'article' };
  const result = await Repurposer.smartRepurpose(contentData, options || {});
  res.json({ success: true, data: result });
});

// POST /extract — just extract content without repurposing
router.post('/extract', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, message: 'url required' });
  const content = url.includes('youtube.com') || url.includes('youtu.be')
    ? await Repurposer.extractFromYouTube(url)
    : await Repurposer.extractFromUrl(url);
  res.json({ success: true, data: content });
});

// POST /to-format — repurpose already-extracted content to a specific format
router.post('/to-format', async (req, res) => {
  const { contentData, format, options } = req.body;
  if (!contentData || !format) return res.status(400).json({ success: false, message: 'contentData and format required' });
  const result = await Repurposer.repurposeToFormat(contentData, format, options || {});
  res.json({ success: true, data: result });
});

// POST /to-all — repurpose to ALL supported formats
router.post('/to-all', async (req, res) => {
  const { contentData, options } = req.body;
  if (!contentData) return res.status(400).json({ success: false, message: 'contentData required' });
  const result = await Repurposer.repurposeAll(contentData, options || {});
  res.json({ success: true, data: result });
});

module.exports = router;
