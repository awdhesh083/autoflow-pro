/**
 * ══════════════════════════════════════════════════════════
 * PART 1 ROUTES — Features 1-4
 * WA Status | IG Story | TikTok | YouTube
 * ══════════════════════════════════════════════════════════
 */

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const { authenticate } = require('../../middleware/auth');


// Multer for file uploads
const upload = multer({
  dest: './uploads/temp/',
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// ══════════════════════════════════════════════════════════
// 1. WHATSAPP STATUS ROUTES
// ══════════════════════════════════════════════════════════
const waStatusRouter = express.Router();
waStatusRouter.use(authenticate);
const WAStatusService = require('../../services/social/wa-status.service');

// Post text status
waStatusRouter.post('/text', async (req, res) => {
  const { accountId, text, options } = req.body;
  const result = await WAStatusService.postTextStatus(accountId, text, options || {});
  res.json({ success: true, data: result });
});

// Post image status
waStatusRouter.post('/image', upload.single('image'), async (req, res) => {
  const { accountId, caption } = req.body;
  const imagePath = req.file?.path || req.body.imagePath;
  const result = await WAStatusService.postImageStatus(accountId, imagePath, caption);
  res.json({ success: true, data: result });
});

// Post video status
waStatusRouter.post('/video', upload.single('video'), async (req, res) => {
  const { accountId, caption } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  const result = await WAStatusService.postVideoStatus(accountId, videoPath, caption);
  res.json({ success: true, data: result });
});

// Post AI-generated image as status
waStatusRouter.post('/ai', async (req, res) => {
  const { accountId, prompt, caption } = req.body;
  const result = await WAStatusService.postAIImageStatus(accountId, prompt, caption);
  res.json({ success: true, data: result });
});

// Post status sequence
waStatusRouter.post('/sequence', async (req, res) => {
  const { accountId, statuses, options } = req.body;
  const result = await WAStatusService.postStatusSequence(accountId, statuses, options || {});
  res.json({ success: true, data: result });
});

// View all contacts' statuses
waStatusRouter.post('/view-all', async (req, res) => {
  const { accountId, options } = req.body;
  const result = await WAStatusService.viewAllStatuses(accountId, options || {});
  res.json({ success: true, data: result });
});

// React to statuses
waStatusRouter.post('/react', async (req, res) => {
  const { accountId, emoji, options } = req.body;
  const result = await WAStatusService.reactToStatuses(accountId, emoji || '❤️', options || {});
  res.json({ success: true, data: result });
});

// Get who viewed my status
waStatusRouter.get('/viewers/:accountId', async (req, res) => {
  const result = await WAStatusService.getStatusViewers(req.params.accountId);
  res.json({ success: true, data: result });
});

// Schedule status
waStatusRouter.post('/schedule', async (req, res) => {
  const { accountId, status, scheduledAt } = req.body;
  const result = WAStatusService.scheduleStatus(accountId, status, scheduledAt);
  res.json({ success: true, data: result });
});

// ══════════════════════════════════════════════════════════
// 2. INSTAGRAM STORY ROUTES
// ══════════════════════════════════════════════════════════
const igStoryRouter = express.Router();
igStoryRouter.use(authenticate);
const IGStoryService = require('../../services/social/ig-story.service');

// Post image story
igStoryRouter.post('/image', upload.single('image'), async (req, res) => {
  const { accountId, options } = req.body;
  const imagePath = req.file?.path || req.body.imagePath;
  const result = await IGStoryService.postImageStory(accountId, imagePath, JSON.parse(options || '{}'));
  res.json({ success: true, data: result });
});

// Post video story
igStoryRouter.post('/video', upload.single('video'), async (req, res) => {
  const { accountId, options } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  const result = await IGStoryService.postVideoStory(accountId, videoPath, JSON.parse(options || '{}'));
  res.json({ success: true, data: result });
});

// Post AI-generated story with text overlay
igStoryRouter.post('/ai', async (req, res) => {
  const result = await IGStoryService.postAIStory(req.body.accountId, req.body);
  res.json({ success: true, data: result });
});

// Post poll story
igStoryRouter.post('/poll', upload.single('image'), async (req, res) => {
  const { accountId, question, option1, option2 } = req.body;
  const imagePath = req.file?.path || req.body.imagePath;
  const result = await IGStoryService.postPollStory(accountId, imagePath, { question, option1, option2 });
  res.json({ success: true, data: result });
});

// Post question story
igStoryRouter.post('/question', upload.single('image'), async (req, res) => {
  const { accountId, question } = req.body;
  const imagePath = req.file?.path || req.body.imagePath;
  const result = await IGStoryService.postQuestionStory(accountId, imagePath, question);
  res.json({ success: true, data: result });
});

// Post story with link sticker
igStoryRouter.post('/link', upload.single('image'), async (req, res) => {
  const { accountId, url, linkText } = req.body;
  const imagePath = req.file?.path || req.body.imagePath;
  const result = await IGStoryService.postLinkStory(accountId, imagePath, url, linkText);
  res.json({ success: true, data: result });
});

// Post countdown story
igStoryRouter.post('/countdown', upload.single('image'), async (req, res) => {
  const { accountId, countdownText, endTime } = req.body;
  const imagePath = req.file?.path || req.body.imagePath;
  const result = await IGStoryService.postCountdownStory(accountId, imagePath, { text: countdownText, endTime });
  res.json({ success: true, data: result });
});

// Post close friends story
igStoryRouter.post('/close-friends', upload.single('image'), async (req, res) => {
  const { accountId, caption } = req.body;
  const imagePath = req.file?.path || req.body.imagePath;
  const result = await IGStoryService.postCloseFriendsStory(accountId, imagePath, caption);
  res.json({ success: true, data: result });
});

// Post story sequence (campaign)
igStoryRouter.post('/sequence', async (req, res) => {
  const { accountId, stories, options } = req.body;
  const result = await IGStoryService.postStorySequence(accountId, stories, options || {});
  res.json({ success: true, data: result });
});

// Highlights CRUD
igStoryRouter.get('/highlights/:accountId', async (req, res) => {
  const { userId } = req.query;
  const result = await IGStoryService.getHighlights(req.params.accountId, userId);
  res.json({ success: true, data: result });
});

igStoryRouter.post('/highlights', async (req, res) => {
  const { accountId, title, storyIds, coverImagePath } = req.body;
  const result = await IGStoryService.createHighlight(accountId, title, storyIds, coverImagePath);
  res.json({ success: true, data: result });
});

igStoryRouter.put('/highlights/:highlightId', async (req, res) => {
  const { accountId, storyIds } = req.body;
  const result = await IGStoryService.addToHighlight(accountId, req.params.highlightId, storyIds);
  res.json({ success: true, data: result });
});

igStoryRouter.delete('/highlights/:highlightId', async (req, res) => {
  const { accountId } = req.body;
  const result = await IGStoryService.deleteHighlight(accountId, req.params.highlightId);
  res.json({ success: true, data: result });
});

// Auto view + react to stories
igStoryRouter.post('/auto-view', async (req, res) => {
  const { accountId, options } = req.body;
  const result = await IGStoryService.autoViewStories(accountId, options || {});
  res.json({ success: true, data: result });
});

// ══════════════════════════════════════════════════════════
// 3. TIKTOK ROUTES
// ══════════════════════════════════════════════════════════
const tiktokRouter = express.Router();
tiktokRouter.use(authenticate);
const TikTokService = require('../../services/social/tiktok.service');

// Login / init
tiktokRouter.post('/login', async (req, res) => {
  const { accountId } = req.body;
  const result = await TikTokService.login(accountId);
  res.json({ success: true, data: result });
});

// Save cookies
tiktokRouter.post('/save-session', async (req, res) => {
  const { accountId } = req.body;
  const result = await TikTokService.saveCookies(accountId);
  res.json({ success: true, data: result });
});

// Upload video
tiktokRouter.post('/upload', upload.single('video'), async (req, res) => {
  const { accountId, caption, hashtags, mentions, visibility, allowComments, allowDuet, allowStitch } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;

  TikTokService.uploadVideo(accountId, videoPath, {
    caption,
    hashtags:     hashtags ? JSON.parse(hashtags) : [],
    mentions:     mentions ? JSON.parse(mentions) : [],
    visibility:   visibility || 'public',
    allowComments: allowComments !== 'false',
    allowDuet:    allowDuet    !== 'false',
    allowStitch:  allowStitch  !== 'false',
  }).then(r => console.log('TT upload done:', r))
    .catch(e => console.error('TT upload error:', e.message));

  res.json({ success: true, message: 'TikTok upload started', videoPath });
});

// Schedule video
tiktokRouter.post('/schedule', upload.single('video'), async (req, res) => {
  const { accountId, options, scheduledAt } = req.body;
  const videoPath = req.file?.path || req.body.videoPath;
  const result = await TikTokService.scheduleVideo(accountId, videoPath, JSON.parse(options || '{}'), scheduledAt);
  res.json({ success: true, data: result });
});

// Auto follow
tiktokRouter.post('/follow', async (req, res) => {
  const { accountId, usernames, options } = req.body;
  const result = await TikTokService.autoFollow(accountId, usernames, options || {});
  res.json({ success: true, data: result });
});

// Auto like by hashtag
tiktokRouter.post('/like/hashtag', async (req, res) => {
  const { accountId, hashtag, options } = req.body;
  const result = await TikTokService.autoLikeByHashtag(accountId, hashtag, options || {});
  res.json({ success: true, data: result });
});

// Auto comment
tiktokRouter.post('/comment', async (req, res) => {
  const { accountId, videoUrls, comments, options } = req.body;
  const result = await TikTokService.autoComment(accountId, videoUrls, comments, options || {});
  res.json({ success: true, data: result });
});

// Scrape users by hashtag
tiktokRouter.get('/scrape/hashtag', async (req, res) => {
  const { accountId, hashtag, limit } = req.query;
  const result = await TikTokService.scrapeUsersByHashtag(accountId, hashtag, +limit || 100);
  res.json({ success: true, data: result, count: result.length });
});

// Download video
tiktokRouter.post('/download', async (req, res) => {
  const { videoUrl, outputDir } = req.body;
  const result = await TikTokService.downloadVideo(videoUrl, { outputDir });
  res.json({ success: true, data: result });
});

// Batch download
tiktokRouter.post('/download/batch', async (req, res) => {
  const { videoUrls, outputDir } = req.body;
  const result = await TikTokService.downloadBatch(videoUrls, outputDir);
  res.json({ success: true, data: result });
});

// Trending hashtags
tiktokRouter.get('/trending/hashtags', async (req, res) => {
  const { country } = req.query;
  const result = await TikTokService.getTrendingHashtags(country);
  res.json({ success: true, data: result });
});

// Send DM
tiktokRouter.post('/dm/send', async (req, res) => {
  const { accountId, username, message } = req.body;
  const result = await TikTokService.sendDM(accountId, username, message);
  res.json({ success: true, data: result });
});

// Bulk DM
tiktokRouter.post('/dm/bulk', async (req, res) => {
  const { accountId, targets, message, options } = req.body;
  TikTokService.sendBulkDM(accountId, targets, message, options || {})
    .then(r => console.log('TT DM done:', r)).catch(e => console.error(e.message));
  res.json({ success: true, message: `DM campaign started for ${targets.length} targets` });
});

// Export followers
tiktokRouter.get('/followers/:accountId', async (req, res) => {
  const { username, limit } = req.query;
  const result = await TikTokService.exportFollowers(req.params.accountId, username, +limit || 200);
  res.json({ success: true, data: result });
});

// Disconnect
tiktokRouter.delete('/disconnect/:accountId', async (req, res) => {
  await TikTokService.disconnect(req.params.accountId);
  res.json({ success: true, message: 'TikTok disconnected' });
});

// ══════════════════════════════════════════════════════════
// 4. YOUTUBE ROUTES
// ══════════════════════════════════════════════════════════
const youtubeRouter = express.Router();
youtubeRouter.use(authenticate);
const YouTubeService = require('../../services/social/youtube.service');

// OAuth2 auth URL
youtubeRouter.get('/auth-url', (req, res) => {
  const url = YouTubeService.getAuthUrl();
  res.json({ success: true, url });
});

// Set OAuth tokens
youtubeRouter.post('/tokens', async (req, res) => {
  const { accountId, tokens } = req.body;
  YouTubeService.setTokens(accountId, tokens);
  res.json({ success: true, message: 'Tokens set' });
});

// Upload video
youtubeRouter.post('/upload', upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
  const { accountId, title, description, tags, categoryId, privacyStatus, playlistId, scheduleTime } = req.body;
  const videoPath     = req.files?.video?.[0]?.path || req.body.videoPath;
  const thumbnailPath = req.files?.thumbnail?.[0]?.path || req.body.thumbnailPath;

  YouTubeService.uploadVideo(accountId, videoPath, {
    title, description,
    tags:          tags ? JSON.parse(tags) : [],
    categoryId,
    privacyStatus: privacyStatus || 'public',
    thumbnailPath,
    playlistId,
    scheduleTime,
  }).then(r => console.log('YT upload done:', r))
    .catch(e => console.error('YT upload error:', e.message));

  res.json({ success: true, message: 'YouTube upload started', title });
});

// Auto subscribe
youtubeRouter.post('/subscribe', async (req, res) => {
  const { accountId, channelUrls, options } = req.body;
  const result = await YouTubeService.autoSubscribe(accountId, channelUrls, options || {});
  res.json({ success: true, data: result });
});

// Auto like videos
youtubeRouter.post('/like', async (req, res) => {
  const { accountId, videoUrls, options } = req.body;
  const result = await YouTubeService.autoLike(accountId, videoUrls, options || {});
  res.json({ success: true, data: result });
});

// Auto comment
youtubeRouter.post('/comment', async (req, res) => {
  const { accountId, videoUrls, comments, options } = req.body;
  const result = await YouTubeService.autoComment(accountId, videoUrls, comments, options || {});
  res.json({ success: true, data: result });
});

// Download video
youtubeRouter.post('/download', async (req, res) => {
  const { videoUrl, quality, audioOnly, outputDir } = req.body;
  const result = await YouTubeService.downloadVideo(videoUrl, { quality, audioOnly, outputDir });
  res.json({ success: true, data: result });
});

// Scrape channel
youtubeRouter.get('/channel', async (req, res) => {
  const { channelUrl, maxVideos } = req.query;
  const result = await YouTubeService.scrapeChannel(channelUrl, { maxVideos: +maxVideos || 50 });
  res.json({ success: true, data: result });
});

// Scrape comments
youtubeRouter.get('/comments', async (req, res) => {
  const { videoUrl, limit } = req.query;
  const result = await YouTubeService.scrapeComments(videoUrl, +limit || 200);
  res.json({ success: true, data: result });
});

// Create playlist
youtubeRouter.post('/playlist', async (req, res) => {
  const { accountId, title, description, privacy } = req.body;
  const result = await YouTubeService.createPlaylist(accountId, title, description, privacy);
  res.json({ success: true, data: result });
});

// Add video to playlist
youtubeRouter.post('/playlist/:playlistId/video', async (req, res) => {
  const { accountId, videoId } = req.body;
  const result = await YouTubeService.addVideoToPlaylist(accountId, req.params.playlistId, videoId);
  res.json({ success: true, data: result });
});

// Generate AI thumbnail
youtubeRouter.post('/thumbnail/generate', async (req, res) => {
  const { videoTitle, style } = req.body;
  const result = await YouTubeService.generateThumbnail(videoTitle, style);
  res.json({ success: true, data: result });
});

// Monitor competitor channels
youtubeRouter.post('/competitors/monitor', async (req, res) => {
  const { channelUrls } = req.body;
  const result = await YouTubeService.monitorCompetitors(channelUrls, req.user._id);
  res.json({ success: true, data: result });
});

// Disconnect
youtubeRouter.delete('/disconnect/:accountId', async (req, res) => {
  await YouTubeService.disconnect(req.params.accountId);
  res.json({ success: true, message: 'YouTube disconnected' });
});

// ══════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════
module.exports = {
  waStatusRoutes: waStatusRouter,
  igStoryRoutes:  igStoryRouter,
  tiktokRoutes:   tiktokRouter,
  youtubeRoutes:  youtubeRouter,
};
