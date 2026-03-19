'use strict';
/**
 * AI Caption Routes  —  /api/v1/ai-caption
 * Full AI content creation: captions, hashtags, hooks, bios,
 * content calendars, video scripts, story scripts, brand voice training.
 */
const express = require('express');
const multer  = require('multer');
const { authenticate } = require('../../middleware/auth');
const AICaptionService = require('../../services/social/ai-caption.service');

const router = express.Router();
router.use(authenticate);
const upload = multer({ dest: 'uploads/captions/' });

// Generate caption for one platform
router.post('/generate', async (req, res) => {
  const result = await AICaptionService.generateCaption(req.body);
  res.json({ success: true, data: result });
});

// Generate captions for all platforms at once
router.post('/generate/all-platforms', async (req, res) => {
  const { topic, ...options } = req.body;
  if (!topic) return res.status(400).json({ success: false, message: 'topic required' });
  const result = await AICaptionService.generateForAllPlatforms(topic, options);
  res.json({ success: true, data: result });
});

// Hashtag research + generation
router.post('/hashtags', async (req, res) => {
  const result = await AICaptionService.generateHashtags(req.body);
  res.json({ success: true, data: result });
});

// Check hashtags for bans/restrictions
router.post('/hashtags/check-banned', async (req, res) => {
  const { hashtags } = req.body;
  if (!hashtags?.length) return res.status(400).json({ success: false, message: 'hashtags array required' });
  const result = await AICaptionService.checkBannedHashtags(hashtags);
  res.json({ success: true, data: result });
});

// Viral hook generator
router.post('/hooks', async (req, res) => {
  const { topic, ...options } = req.body;
  if (!topic) return res.status(400).json({ success: false, message: 'topic required' });
  const result = await AICaptionService.generateViralHooks(topic, options);
  res.json({ success: true, data: result });
});

// Caption from image (vision AI)
router.post('/from-image', upload.single('image'), async (req, res) => {
  const imagePath = req.file?.path || req.body.imagePath;
  if (!imagePath) return res.status(400).json({ success: false, message: 'image required' });
  const result = await AICaptionService.captionFromImage(imagePath, req.body);
  res.json({ success: true, data: result });
});

// Caption from image URL
router.post('/from-image-url', async (req, res) => {
  const { imageUrl, ...options } = req.body;
  if (!imageUrl) return res.status(400).json({ success: false, message: 'imageUrl required' });
  const result = await AICaptionService.captionFromImageUrl(imageUrl, options);
  res.json({ success: true, data: result });
});

// Profile bio generator
router.post('/bio', async (req, res) => {
  const result = await AICaptionService.generateBio(req.body);
  res.json({ success: true, data: result });
});

// 30-day content calendar
router.post('/calendar', async (req, res) => {
  const result = await AICaptionService.generateContentCalendar(req.body);
  res.json({ success: true, data: result });
});

// Video script writer
router.post('/video-script', async (req, res) => {
  const result = await AICaptionService.generateVideoScript(req.body);
  res.json({ success: true, data: result });
});

// Story script writer
router.post('/story-script', async (req, res) => {
  const result = await AICaptionService.generateStoryScript(req.body);
  res.json({ success: true, data: result });
});

// Translate caption to other languages
router.post('/translate', async (req, res) => {
  const { caption, targetLanguages, platform } = req.body;
  if (!caption || !targetLanguages?.length) return res.status(400).json({ success: false, message: 'caption and targetLanguages required' });
  const result = await AICaptionService.translateCaption(caption, targetLanguages, platform);
  res.json({ success: true, data: result });
});

// Train brand voice from examples
router.post('/brand-voice/train', async (req, res) => {
  const { exampleCaptions, options } = req.body;
  if (!exampleCaptions?.length) return res.status(400).json({ success: false, message: 'exampleCaptions array required' });
  const result = await AICaptionService.trainBrandVoice(exampleCaptions, options || {});
  res.json({ success: true, data: result });
});

// Analyse caption performance data
router.post('/analyse-performance', async (req, res) => {
  const { captions } = req.body;
  if (!captions?.length) return res.status(400).json({ success: false, message: 'captions array required' });
  const result = await AICaptionService.analyzeCaptionPerformance(captions);
  res.json({ success: true, data: result });
});

module.exports = router;
