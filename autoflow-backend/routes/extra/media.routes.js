'use strict';
/**
 * Media Routes  —  /api/v1/media-tools
 * Wraps: MediaDownloaderService (yt-dlp) + VideoProcessorService (ffmpeg)
 */
const express = require('express');
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');
const { authenticate } = require('../../middleware/auth');
const MediaDownloader  = require('../../services/social/media-downloader.service');
const VideoProcessor   = require('../../services/social/video-processor.service');

const router = express.Router();
router.use(authenticate);

const upload = multer({
  dest: 'uploads/media-proc/',
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
});

// ══════════════════════════════════════════════════════════
// MEDIA DOWNLOADER (yt-dlp)
// ══════════════════════════════════════════════════════════

// GET /check — verify yt-dlp is installed
router.get('/downloader/check', async (req, res) => {
  const check = await MediaDownloader.checkYtDlp();
  res.json({ success: true, data: check });
});

// POST /download — download any URL (YouTube, TikTok, IG, Twitter, etc.)
router.post('/download', async (req, res) => {
  const { url, format, quality, audioOnly, extractAudio, outputDir, noWatermark, addMetadata } = req.body;
  if (!url) return res.status(400).json({ success: false, message: 'url required' });
  const result = await MediaDownloader.download(url, {
    format, quality, audioOnly, extractAudio, outputDir,
    noWatermark, addMetadata,
  });
  res.json({ success: true, data: result });
});

// POST /download/batch — download multiple URLs
router.post('/download/batch', async (req, res) => {
  const { urls, options } = req.body;
  if (!urls?.length) return res.status(400).json({ success: false, message: 'urls array required' });
  const results = await MediaDownloader.downloadBatch(urls, options || {});
  res.json({ success: true, data: results, total: results.length });
});

// POST /download/playlist — download entire playlist
router.post('/download/playlist', async (req, res) => {
  const { playlistUrl, options } = req.body;
  if (!playlistUrl) return res.status(400).json({ success: false, message: 'playlistUrl required' });
  const result = await MediaDownloader.downloadPlaylist(playlistUrl, options || {});
  res.json({ success: true, data: result });
});

// GET /metadata — get video info without downloading
router.get('/metadata', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ success: false, message: 'url required' });
  const result = await MediaDownloader.getMetadata(url);
  res.json({ success: true, data: result });
});

// GET /formats — list available formats for a URL
router.get('/formats', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ success: false, message: 'url required' });
  const result = await MediaDownloader.listFormats(url);
  res.json({ success: true, data: result });
});

// POST /extract-audio — extract audio from any URL
router.post('/extract-audio', async (req, res) => {
  const { url, format = 'mp3', options } = req.body;
  if (!url) return res.status(400).json({ success: false, message: 'url required' });
  const result = await MediaDownloader.extractAudio(url, format, options || {});
  res.json({ success: true, data: result });
});

// Platform-specific helpers
router.post('/download/instagram', async (req, res) => {
  const { url, options } = req.body;
  const result = await MediaDownloader.downloadInstagram(url, options || {});
  res.json({ success: true, data: result });
});
router.post('/download/tiktok', async (req, res) => {
  const { url, options } = req.body;
  const result = await MediaDownloader.downloadTikTok(url, options || {});
  res.json({ success: true, data: result });
});
router.post('/download/twitter', async (req, res) => {
  const { url } = req.body;
  const result = await MediaDownloader.downloadTwitter(url);
  res.json({ success: true, data: result });
});
router.post('/download/thumbnail', async (req, res) => {
  const { url, options } = req.body;
  const result = await MediaDownloader.downloadThumbnail(url, options || {});
  res.json({ success: true, data: result });
});
router.post('/download/subtitles', async (req, res) => {
  const { url, language = 'en', options } = req.body;
  const result = await MediaDownloader.downloadSubtitles(url, language, options || {});
  res.json({ success: true, data: result });
});

// ══════════════════════════════════════════════════════════
// VIDEO PROCESSOR (ffmpeg)
// ══════════════════════════════════════════════════════════

// GET /processor/check — verify ffmpeg is installed
router.get('/processor/check', async (req, res) => {
  const check = VideoProcessor.checkFFmpeg();
  res.json({ success: true, data: check });
});

// POST /info — get video metadata
router.post('/info', upload.single('video'), async (req, res) => {
  const videoPath = req.file?.path || req.body.videoPath;
  if (!videoPath) return res.status(400).json({ success: false, message: 'video required' });
  const result = VideoProcessor.getInfo(videoPath);
  res.json({ success: true, data: result });
});

// POST /resize — resize video for a platform
router.post('/resize', upload.single('video'), async (req, res) => {
  const { preset, options } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  if (!videoPath || !preset) return res.status(400).json({ success: false, message: 'video and preset required' });
  const result = VideoProcessor.resizeForPlatform(videoPath, preset, options ? JSON.parse(options) : {});
  res.json({ success: true, data: { outputPath: result } });
});

// GET /presets — list all platform presets
router.get('/presets', async (req, res) => {
  const presets = VideoProcessor.getPresets();
  res.json({ success: true, data: presets });
});

// POST /compress
router.post('/compress', upload.single('video'), async (req, res) => {
  const { options } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  if (!videoPath) return res.status(400).json({ success: false, message: 'video required' });
  const result = VideoProcessor.compress(videoPath, options ? JSON.parse(options) : {});
  res.json({ success: true, data: { outputPath: result } });
});

// POST /trim
router.post('/trim', upload.single('video'), async (req, res) => {
  const { startTime, endTime, options } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  if (!videoPath || !startTime || !endTime) return res.status(400).json({ success: false, message: 'video, startTime, endTime required' });
  const result = VideoProcessor.trim(videoPath, startTime, endTime, options ? JSON.parse(options) : {});
  res.json({ success: true, data: { outputPath: result } });
});

// POST /extract-audio-from-video
router.post('/extract-audio-from-video', upload.single('video'), async (req, res) => {
  const { format = 'mp3' } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  if (!videoPath) return res.status(400).json({ success: false, message: 'video required' });
  const result = VideoProcessor.extractAudio(videoPath, format);
  res.json({ success: true, data: { outputPath: result } });
});

// POST /thumbnail
router.post('/thumbnail', upload.single('video'), async (req, res) => {
  const { options } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  if (!videoPath) return res.status(400).json({ success: false, message: 'video required' });
  const result = VideoProcessor.extractThumbnail(videoPath, options ? JSON.parse(options) : {});
  res.json({ success: true, data: { outputPath: result } });
});

// POST /gif — convert video clip to GIF
router.post('/gif', upload.single('video'), async (req, res) => {
  const { options } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  if (!videoPath) return res.status(400).json({ success: false, message: 'video required' });
  const result = VideoProcessor.createGif(videoPath, options ? JSON.parse(options) : {});
  res.json({ success: true, data: { outputPath: result } });
});

// POST /watermark — add image watermark
router.post('/watermark', upload.fields([{ name: 'video', maxCount: 1 }, { name: 'watermark', maxCount: 1 }]), async (req, res) => {
  const videoPath     = req.files?.video?.[0]?.path || req.body.videoPath;
  const watermarkPath = req.files?.watermark?.[0]?.path || req.body.watermarkPath;
  const { options }   = req.body;
  if (!videoPath || !watermarkPath) return res.status(400).json({ success: false, message: 'video and watermark required' });
  const result = VideoProcessor.addImageWatermark(videoPath, watermarkPath, options ? JSON.parse(options) : {});
  res.json({ success: true, data: { outputPath: result } });
});

// POST /text-watermark — burn text onto video
router.post('/text-watermark', upload.single('video'), async (req, res) => {
  const { text, options } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  if (!videoPath || !text) return res.status(400).json({ success: false, message: 'video and text required' });
  const result = VideoProcessor.addTextWatermark(videoPath, text, options ? JSON.parse(options) : {});
  res.json({ success: true, data: { outputPath: result } });
});

// POST /speed — change playback speed
router.post('/speed', upload.single('video'), async (req, res) => {
  const { speed, options } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  if (!videoPath || !speed) return res.status(400).json({ success: false, message: 'video and speed required' });
  const result = VideoProcessor.changeSpeed(videoPath, +speed, options ? JSON.parse(options) : {});
  res.json({ success: true, data: { outputPath: result } });
});

// POST /convert — convert to different format
router.post('/convert', upload.single('video'), async (req, res) => {
  const { targetFormat, options } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  if (!videoPath || !targetFormat) return res.status(400).json({ success: false, message: 'video and targetFormat required' });
  const result = VideoProcessor.convert(videoPath, targetFormat, options ? JSON.parse(options) : {});
  res.json({ success: true, data: { outputPath: result } });
});

// POST /add-music — add background music
router.post('/add-music', upload.fields([{ name: 'video', maxCount: 1 }, { name: 'music', maxCount: 1 }]), async (req, res) => {
  const videoPath = req.files?.video?.[0]?.path || req.body.videoPath;
  const musicPath = req.files?.music?.[0]?.path || req.body.musicPath;
  const { options } = req.body;
  if (!videoPath || !musicPath) return res.status(400).json({ success: false, message: 'video and music required' });
  const result = VideoProcessor.addBackgroundMusic(videoPath, musicPath, options ? JSON.parse(options) : {});
  res.json({ success: true, data: { outputPath: result } });
});

// POST /split — split into chunks
router.post('/split', upload.single('video'), async (req, res) => {
  const { chunkDuration, options } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  if (!videoPath || !chunkDuration) return res.status(400).json({ success: false, message: 'video and chunkDuration required' });
  const chunks = VideoProcessor.splitIntoChunks(videoPath, +chunkDuration, options ? JSON.parse(options) : {});
  res.json({ success: true, data: { chunks }, count: chunks.length });
});

// POST /batch — batch process multiple files
router.post('/batch', upload.array('videos', 20), async (req, res) => {
  const { operation, options, videoPaths } = req.body;
  const paths = req.files?.map(f => f.path) || (videoPaths ? JSON.parse(videoPaths) : []);
  if (!paths.length || !operation) return res.status(400).json({ success: false, message: 'videos and operation required' });
  const results = await VideoProcessor.batchProcess(paths, operation, options ? JSON.parse(options) : {});
  res.json({ success: true, data: results });
});

module.exports = router;
