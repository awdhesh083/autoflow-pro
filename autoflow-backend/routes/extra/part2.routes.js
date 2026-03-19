/**
 * ══════════════════════════════════════════════════════════
 * PART 2 ROUTES — Features 5-8
 * LinkedIn | Messenger | Media Downloader | Video Processor
 * ══════════════════════════════════════════════════════════
 */

const express = require('express');
const multer  = require('multer');
const jwt     = require('jsonwebtoken');
const path    = require('path');
const fs      = require('fs');
const { User } = require('../../models');
const { authenticate } = require('../../middleware/auth');


const upload = multer({
  dest: './uploads/temp/',
  limits: { fileSize: 500 * 1024 * 1024 },
});

// ══════════════════════════════════════════════════════════
// 5. LINKEDIN ROUTES
// ══════════════════════════════════════════════════════════
const linkedinRouter = express.Router();
linkedinRouter.use(authenticate);
const LinkedInService = require('../../services/social/linkedin.service');

// Login
linkedinRouter.post('/login', async (req, res) => {
  const { accountId, email, password } = req.body;
  const result = await LinkedInService.login(accountId, email, password);
  res.json({ success: true, data: result });
});

// Send connection requests
linkedinRouter.post('/connect', async (req, res) => {
  const { accountId, profileUrls, options } = req.body;
  LinkedInService.sendConnectionRequests(accountId, profileUrls, options || {})
    .then(r => console.log('LI connect done:', r))
    .catch(e => console.error('LI connect error:', e.message));
  res.json({ success: true, message: `Connection requests started for ${profileUrls.length} profiles` });
});

// Bulk DM
linkedinRouter.post('/dm/bulk', async (req, res) => {
  const { accountId, targets, message, options } = req.body;
  LinkedInService.sendMessages(accountId, targets, message, { ...options, userId: req.user._id })
    .then(r => console.log('LI DM done:', r))
    .catch(e => console.error(e.message));
  res.json({ success: true, message: `LI DM campaign started for ${targets.length} targets` });
});

// Auto like feed
linkedinRouter.post('/like/feed', async (req, res) => {
  const { accountId, options } = req.body;
  const result = await LinkedInService.autoLikeFeed(accountId, options || {});
  res.json({ success: true, data: result });
});

// Auto like by keyword
linkedinRouter.post('/like/keyword', async (req, res) => {
  const { accountId, keyword, options } = req.body;
  const result = await LinkedInService.autoLikeByKeyword(accountId, keyword, options || {});
  res.json({ success: true, data: result });
});

// Auto comment
linkedinRouter.post('/comment', async (req, res) => {
  const { accountId, postUrls, comments, options } = req.body;
  const result = await LinkedInService.autoCommentOnPosts(accountId, postUrls, comments, options || {});
  res.json({ success: true, data: result });
});

// Profile viewer
linkedinRouter.post('/view/profiles', async (req, res) => {
  const { accountId, profileUrls, options } = req.body;
  LinkedInService.viewProfiles(accountId, profileUrls, options || {})
    .then(r => console.log('LI view done:', r))
    .catch(e => console.error(e.message));
  res.json({ success: true, message: `Viewing ${profileUrls.length} profiles` });
});

// Scrape leads
linkedinRouter.get('/scrape/leads', async (req, res) => {
  const { accountId, query, limit } = req.query;
  const result = await LinkedInService.scrapeLeadsBySearch(accountId, query, { limit: +limit || 50 });
  res.json({ success: true, data: result, count: result.length });
});

// Deep scrape single profile
linkedinRouter.get('/profile', async (req, res) => {
  const { accountId, profileUrl } = req.query;
  const result = await LinkedInService.scrapeProfile(accountId, profileUrl);
  res.json({ success: true, data: result });
});

// Create post
linkedinRouter.post('/post', upload.single('image'), async (req, res) => {
  const { accountId, content } = req.body;
  const imagePath = req.file?.path || req.body.imagePath;
  const result = await LinkedInService.createPost(accountId, content, { imagePath });
  res.json({ success: true, data: result });
});

// Export connections
linkedinRouter.get('/connections/:accountId', async (req, res) => {
  const { limit } = req.query;
  const result = await LinkedInService.exportConnections(req.params.accountId, +limit || 500);
  res.json({ success: true, data: result });
});

// Skill endorser
linkedinRouter.post('/endorse', async (req, res) => {
  const { accountId, profileUrl, maxSkills } = req.body;
  const result = await LinkedInService.endorseSkills(accountId, profileUrl, maxSkills || 5);
  res.json({ success: true, data: result });
});

// Follow companies
linkedinRouter.post('/follow/companies', async (req, res) => {
  const { accountId, companyUrls, options } = req.body;
  const result = await LinkedInService.followCompanies(accountId, companyUrls, options || {});
  res.json({ success: true, data: result });
});

// Email finder
linkedinRouter.post('/find/emails', async (req, res) => {
  const { accountId, profileUrls } = req.body;
  const result = await LinkedInService.findEmailsFromProfiles(accountId, profileUrls);
  res.json({ success: true, data: result, withEmail: result.filter(r => r.email).length });
});

// Save leads to CRM
linkedinRouter.post('/save-leads', async (req, res) => {
  const { leads, listId } = req.body;
  const result = await LinkedInService.saveLeadsToContacts(leads, req.user._id, listId);
  res.json({ success: true, data: result });
});

// Disconnect
linkedinRouter.delete('/disconnect/:accountId', async (req, res) => {
  await LinkedInService.disconnect(req.params.accountId);
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════
// 6. MESSENGER ROUTES
// ══════════════════════════════════════════════════════════
const messengerRouter = express.Router();
messengerRouter.use(authenticate);
const MessengerService = require('../../services/social/messenger.service');

// Login
messengerRouter.post('/login', async (req, res) => {
  const { accountId, email, password } = req.body;
  const result = await MessengerService.login(accountId, email, password);
  res.json({ success: true, data: result });
});

// Send single message
messengerRouter.post('/send', async (req, res) => {
  const { accountId, recipientId, message, options } = req.body;
  const result = await MessengerService.sendMessage(accountId, recipientId, message, options || {});
  res.json({ success: true, data: result });
});

// Bulk DM
messengerRouter.post('/dm/bulk', async (req, res) => {
  const { accountId, targets, message, options } = req.body;
  MessengerService.sendBulkDM(accountId, targets, message, { ...options, userId: req.user._id })
    .then(r => console.log('Messenger bulk done:', r))
    .catch(e => console.error(e.message));
  res.json({ success: true, message: `Messenger bulk DM started for ${targets.length} targets` });
});

// Comment-to-DM automation
messengerRouter.post('/comment-to-dm', async (req, res) => {
  const { accountId, postUrl, dmMessage, options } = req.body;
  const result = await MessengerService.setupCommentToDM(accountId, postUrl, dmMessage, options || {});
  res.json({ success: true, data: result });
});

// Get conversations
messengerRouter.get('/conversations/:accountId', async (req, res) => {
  const { limit } = req.query;
  const result = await MessengerService.getConversations(req.params.accountId, +limit || 50);
  res.json({ success: true, data: result });
});

// AI auto-reply bot
messengerRouter.post('/auto-reply', async (req, res) => {
  const { accountId, systemPrompt, options } = req.body;
  const result = await MessengerService.startAutoReplyBot(accountId, { systemPrompt, ...options });
  res.json({ success: true, data: result });
});

// Graph API — Page message
messengerRouter.post('/page/send', async (req, res) => {
  const { pageAccessToken, recipientId, message } = req.body;
  const result = await MessengerService.sendPageMessage(pageAccessToken, recipientId, message);
  res.json({ success: true, data: result });
});

// Graph API — Button template
messengerRouter.post('/page/template/button', async (req, res) => {
  const { pageAccessToken, recipientId, text, buttons } = req.body;
  const result = await MessengerService.sendButtonTemplate(pageAccessToken, recipientId, text, buttons);
  res.json({ success: true, data: result });
});

// Messenger webhook (from Facebook)
messengerRouter.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;
  if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
    res.send(challenge);
  } else {
    res.sendStatus(403);
  }
});

messengerRouter.post('/webhook', express.json(), async (req, res) => {
  const { pageAccessToken, autoReplyRules } = req.query;
  await MessengerService.handleWebhook(req.body, pageAccessToken, autoReplyRules || []);
  res.sendStatus(200);
});

// Get friends list
messengerRouter.get('/friends/:accountId', async (req, res) => {
  const { limit } = req.query;
  const result = await MessengerService.getFriendsList(req.params.accountId, +limit || 200);
  res.json({ success: true, data: result });
});

// Disconnect
messengerRouter.delete('/disconnect/:accountId', async (req, res) => {
  await MessengerService.disconnect(req.params.accountId);
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════
// 7. MEDIA DOWNLOADER ROUTES
// ══════════════════════════════════════════════════════════
const downloaderRouter = express.Router();
downloaderRouter.use(authenticate);
const MediaDownloader = require('../../services/social/media-downloader.service');

// Check yt-dlp status
downloaderRouter.get('/status', (req, res) => {
  const ytdlp = MediaDownloader.checkYtDlp();
  res.json({ success: true, data: ytdlp });
});

// Detect platform
downloaderRouter.get('/detect', (req, res) => {
  const { url } = req.query;
  res.json({ success: true, platform: MediaDownloader.detectPlatform(url) });
});

// Get metadata (no download)
downloaderRouter.get('/meta', async (req, res) => {
  const { url, cookies, proxy } = req.query;
  const result = await MediaDownloader.getMetadata(url, { cookies, proxy });
  res.json({ success: true, data: result });
});

// List available formats
downloaderRouter.get('/formats', async (req, res) => {
  const { url } = req.query;
  const result = await MediaDownloader.listFormats(url);
  res.json({ success: true, data: result });
});

// Universal download
downloaderRouter.post('/download', async (req, res) => {
  const { url, quality, audioOnly, audioFormat, subtitles, thumbnail, proxy, maxFilesize } = req.body;
  const result = await MediaDownloader.download(url, {
    quality, audioOnly, audioFormat, subtitles, thumbnail, proxy, maxFilesize,
  });
  res.json({ success: true, data: result });
});

// Platform-specific: TikTok (no watermark)
downloaderRouter.post('/tiktok', async (req, res) => {
  const { url, options } = req.body;
  const result = await MediaDownloader.downloadTikTok(url, options || {});
  res.json({ success: true, data: result });
});

// Instagram
downloaderRouter.post('/instagram', async (req, res) => {
  const { url, cookiesPath } = req.body;
  const result = await MediaDownloader.downloadInstagram(url, { cookiesPath });
  res.json({ success: true, data: result });
});

// Twitter/X
downloaderRouter.post('/twitter', async (req, res) => {
  const { url } = req.body;
  const result = await MediaDownloader.downloadTwitter(url);
  res.json({ success: true, data: result });
});

// Reddit
downloaderRouter.post('/reddit', async (req, res) => {
  const { url } = req.body;
  const result = await MediaDownloader.downloadReddit(url);
  res.json({ success: true, data: result });
});

// Pinterest
downloaderRouter.post('/pinterest', async (req, res) => {
  const { url } = req.body;
  const result = await MediaDownloader.downloadPinterest(url);
  res.json({ success: true, data: result });
});

// SoundCloud
downloaderRouter.post('/soundcloud', async (req, res) => {
  const { url } = req.body;
  const result = await MediaDownloader.downloadSoundCloud(url);
  res.json({ success: true, data: result });
});

// Twitch
downloaderRouter.post('/twitch', async (req, res) => {
  const { url } = req.body;
  const result = await MediaDownloader.downloadTwitch(url);
  res.json({ success: true, data: result });
});

// Extract audio only
downloaderRouter.post('/audio', async (req, res) => {
  const { url, format } = req.body;
  const result = await MediaDownloader.extractAudio(url, format || 'mp3');
  res.json({ success: true, data: result });
});

// Thumbnail only
downloaderRouter.post('/thumbnail', async (req, res) => {
  const { url } = req.body;
  const result = await MediaDownloader.downloadThumbnail(url);
  res.json({ success: true, data: result });
});

// Subtitles
downloaderRouter.post('/subtitles', async (req, res) => {
  const { url, language } = req.body;
  const result = await MediaDownloader.downloadSubtitles(url, language || 'en');
  res.json({ success: true, data: result });
});

// Playlist download
downloaderRouter.post('/playlist', async (req, res) => {
  const { url, options } = req.body;
  MediaDownloader.downloadPlaylist(url, options || {})
    .then(r => console.log('Playlist done:', r))
    .catch(e => console.error(e.message));
  res.json({ success: true, message: 'Playlist download started' });
});

// Batch download
downloaderRouter.post('/batch', async (req, res) => {
  const { urls, options } = req.body;
  MediaDownloader.downloadBatch(urls, options || {})
    .then(r => console.log(`Batch done: ${r.success.length}/${urls.length}`))
    .catch(e => console.error(e.message));
  res.json({ success: true, message: `Batch download started for ${urls.length} URLs` });
});

// List downloaded files
downloaderRouter.get('/files', (req, res) => {
  const { platform, limit, sortBy } = req.query;
  const result = MediaDownloader.listDownloads(platform, { limit: +limit || 50, sortBy });
  res.json({ success: true, data: result });
});

// Delete file
downloaderRouter.delete('/files', (req, res) => {
  const { filepath } = req.body;
  const result = MediaDownloader.deleteFile(filepath);
  res.json({ success: true, data: result });
});

// Cleanup old files
downloaderRouter.post('/cleanup', (req, res) => {
  const { olderThanDays } = req.body;
  const result = MediaDownloader.cleanupOldFiles(olderThanDays || 30);
  res.json({ success: true, data: result });
});

// Update yt-dlp
downloaderRouter.post('/update', (req, res) => {
  const result = MediaDownloader.updateYtDlp();
  res.json({ success: true, data: result });
});

// ══════════════════════════════════════════════════════════
// 8. VIDEO PROCESSOR ROUTES
// ══════════════════════════════════════════════════════════
const videoRouter = express.Router();
videoRouter.use(authenticate);
const VideoProcessor = require('../../services/social/video-processor.service');

// Check ffmpeg
videoRouter.get('/status', (req, res) => {
  const ffmpeg = VideoProcessor.checkFFmpeg();
  res.json({ success: true, data: ffmpeg });
});

// Get platform presets
videoRouter.get('/presets', (req, res) => {
  res.json({ success: true, data: VideoProcessor.getPresets() });
});

// Get video info
videoRouter.post('/info', upload.single('video'), async (req, res) => {
  const videoPath = req.file?.path || req.body.videoPath;
  const result = VideoProcessor.getInfo(videoPath);
  res.json({ success: true, data: result });
});

// Resize for platform
videoRouter.post('/resize', upload.single('video'), async (req, res) => {
  const { preset, options } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  const result = VideoProcessor.resizeForPlatform(videoPath, preset, JSON.parse(options || '{}'));
  res.json({ success: true, data: result });
});

// Resize for ALL platforms at once
videoRouter.post('/resize/all', upload.single('video'), async (req, res) => {
  const { platforms } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  const result = VideoProcessor.resizeForAllPlatforms(videoPath, platforms ? JSON.parse(platforms) : undefined);
  res.json({ success: true, data: result });
});

// Compress
videoRouter.post('/compress', upload.single('video'), async (req, res) => {
  const { quality, targetSizeMB, resolution } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  const result = VideoProcessor.compress(videoPath, { quality, targetSizeMB, resolution });
  res.json({ success: true, data: result });
});

// Add image watermark
videoRouter.post('/watermark/image', upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'watermark', maxCount: 1 },
]), async (req, res) => {
  const videoPath = req.files?.video?.[0]?.path || req.body.videoPath;
  const watermarkPath = req.files?.watermark?.[0]?.path || req.body.watermarkPath;
  const options = JSON.parse(req.body.options || '{}');
  const result = VideoProcessor.addImageWatermark(videoPath, watermarkPath, options);
  res.json({ success: true, data: result });
});

// Add text watermark
videoRouter.post('/watermark/text', upload.single('video'), async (req, res) => {
  const { text, options } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  const result = VideoProcessor.addTextWatermark(videoPath, text, JSON.parse(options || '{}'));
  res.json({ success: true, data: result });
});

// Trim
videoRouter.post('/trim', upload.single('video'), async (req, res) => {
  const { startTime, endTime } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  const result = VideoProcessor.trim(videoPath, startTime, endTime);
  res.json({ success: true, data: result });
});

// Split into chunks
videoRouter.post('/split', upload.single('video'), async (req, res) => {
  const { chunkDuration } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  const result = VideoProcessor.splitIntoChunks(videoPath, +chunkDuration || 60);
  res.json({ success: true, data: result });
});

// Merge videos
videoRouter.post('/merge', async (req, res) => {
  const { videoPaths, outputPath } = req.body;
  const result = VideoProcessor.merge(videoPaths, outputPath);
  res.json({ success: true, data: result });
});

// Add intro/outro
videoRouter.post('/intro-outro', async (req, res) => {
  const { videoPath, introPath, outroPath } = req.body;
  const result = VideoProcessor.addIntroOutro(videoPath, introPath, outroPath);
  res.json({ success: true, data: result });
});

// Replace audio
videoRouter.post('/audio/replace', upload.fields([
  { name: 'video', maxCount: 1 }, { name: 'audio', maxCount: 1 },
]), async (req, res) => {
  const videoPath = req.files?.video?.[0]?.path || req.body.videoPath;
  const audioPath = req.files?.audio?.[0]?.path || req.body.audioPath;
  const result = VideoProcessor.replaceAudio(videoPath, audioPath);
  res.json({ success: true, data: result });
});

// Mute audio
videoRouter.post('/audio/mute', upload.single('video'), async (req, res) => {
  const videoPath = req.file?.path || req.body.videoPath;
  const result = VideoProcessor.muteAudio(videoPath);
  res.json({ success: true, data: result });
});

// Add background music
videoRouter.post('/audio/music', upload.fields([
  { name: 'video', maxCount: 1 }, { name: 'music', maxCount: 1 },
]), async (req, res) => {
  const videoPath = req.files?.video?.[0]?.path || req.body.videoPath;
  const musicPath = req.files?.music?.[0]?.path || req.body.musicPath;
  const { musicVolume } = req.body;
  const result = VideoProcessor.addBackgroundMusic(videoPath, musicPath, { musicVolume: +musicVolume || 0.3 });
  res.json({ success: true, data: result });
});

// Extract audio
videoRouter.post('/audio/extract', upload.single('video'), async (req, res) => {
  const { format } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  const result = VideoProcessor.extractAudio(videoPath, format || 'mp3');
  res.json({ success: true, data: result });
});

// Change speed
videoRouter.post('/speed', upload.single('video'), async (req, res) => {
  const { speed } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  const result = VideoProcessor.changeSpeed(videoPath, +speed);
  res.json({ success: true, data: result });
});

// Color grade
videoRouter.post('/color', upload.single('video'), async (req, res) => {
  const videoPath = req.file?.path || req.body.videoPath;
  const options = JSON.parse(req.body.options || '{}');
  const result = VideoProcessor.colorGrade(videoPath, options);
  res.json({ success: true, data: result });
});

// Burn subtitles
videoRouter.post('/subtitles/burn', upload.fields([
  { name: 'video', maxCount: 1 }, { name: 'subtitles', maxCount: 1 },
]), async (req, res) => {
  const videoPath    = req.files?.video?.[0]?.path    || req.body.videoPath;
  const subtitlePath = req.files?.subtitles?.[0]?.path || req.body.subtitlePath;
  const options      = JSON.parse(req.body.options || '{}');
  const result       = VideoProcessor.burnSubtitles(videoPath, subtitlePath, options);
  res.json({ success: true, data: result });
});

// Extract thumbnail(s)
videoRouter.post('/thumbnail', upload.single('video'), async (req, res) => {
  const { at, multiple, count, width } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  const result = VideoProcessor.extractThumbnail(videoPath, {
    at, multiple: multiple === 'true', count: +count || 5, width: +width || 1280,
  });
  res.json({ success: true, data: result });
});

// Create GIF
videoRouter.post('/gif', upload.single('video'), async (req, res) => {
  const { start, duration, width, fps } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  const result = VideoProcessor.createGif(videoPath, {
    start, duration: +duration || 5, width: +width || 480, fps: +fps || 12,
  });
  res.json({ success: true, data: result });
});

// Images to video (slideshow)
videoRouter.post('/slideshow', upload.array('images', 50), async (req, res) => {
  const imagePaths = req.files?.map(f => f.path) || JSON.parse(req.body.imagePaths || '[]');
  const options    = JSON.parse(req.body.options || '{}');
  const result     = VideoProcessor.imagesToVideo(imagePaths, options);
  res.json({ success: true, data: result });
});

// Convert format
videoRouter.post('/convert', upload.single('video'), async (req, res) => {
  const { format } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  const result = VideoProcessor.convert(videoPath, format);
  res.json({ success: true, data: result });
});

// Batch process
videoRouter.post('/batch', async (req, res) => {
  const { videoPaths, operation, options } = req.body;
  VideoProcessor.batchProcess(videoPaths, operation, options || {})
    .then(r => console.log('Batch process done:', r.success.length, 'ok,', r.failed.length, 'failed'))
    .catch(e => console.error(e.message));
  res.json({ success: true, message: `Batch ${operation} started for ${videoPaths.length} files` });
});

// ══════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════
module.exports = {
  linkedinRoutes:   linkedinRouter,
  messengerRoutes:  messengerRouter,
  downloaderRoutes: downloaderRouter,
  videoRoutes:      videoRouter,
};
