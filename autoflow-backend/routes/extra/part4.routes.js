/**
 * ══════════════════════════════════════════════════════════
 * PART 4 ROUTES — Features 13-15
 * Competitor Spy | Pinterest | Content Repurposer
 * ══════════════════════════════════════════════════════════
 */

const express = require('express');
const multer  = require('multer');
const { authenticate } = require('../../middleware/auth');


const upload = multer({ dest: './uploads/temp/', limits: { fileSize: 500 * 1024 * 1024 } });

// ══════════════════════════════════════════════════════════
// 13. COMPETITOR SPY ROUTES
// ══════════════════════════════════════════════════════════
const spyRouter = express.Router();
spyRouter.use(authenticate);
const { CompetitorSpyService } = require('../../services/social/competitor-spy.service');

// Dashboard overview
spyRouter.get('/dashboard', async (req, res) => {
  try {
    const result = await CompetitorSpyService.getDashboard(req.user._id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// CRUD: competitors
spyRouter.get('/', async (req, res) => {
  try {
    const competitors = await CompetitorSpyService.getCompetitors(req.user._id, req.query);
    res.json({ success: true, data: competitors, total: competitors.length });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

spyRouter.post('/', async (req, res) => {
  try {
    const competitor = await CompetitorSpyService.addCompetitor(req.user._id, req.body);
    res.json({ success: true, data: competitor });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

spyRouter.get('/:id', async (req, res) => {
  try {
    const competitor = await CompetitorSpyService.getCompetitor(req.params.id, req.user._id);
    if (!competitor) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: competitor });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

spyRouter.put('/:id', async (req, res) => {
  try {
    const result = await CompetitorSpyService.updateCompetitor(req.params.id, req.user._id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

spyRouter.delete('/:id', async (req, res) => {
  try {
    const result = await CompetitorSpyService.deleteCompetitor(req.params.id, req.user._id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Sync: scrape all platforms for one competitor
spyRouter.post('/:id/sync', async (req, res) => {
  try {
    CompetitorSpyService.syncCompetitor(req.params.id, req.user._id)
      .then(r => console.log('Competitor sync done:', r))
      .catch(e => console.error('Sync error:', e.message));
    res.json({ success: true, message: 'Sync started in background' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Sync ALL competitors
spyRouter.post('/sync/all', async (req, res) => {
  try {
    CompetitorSpyService.syncAllCompetitors(req.user._id)
      .then(r => console.log(`All competitors synced: ${r.synced}/${r.total}`))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: 'Syncing all competitors in background' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Growth data
spyRouter.get('/:id/growth', async (req, res) => {
  try {
    const { days, platform } = req.query;
    const result = await CompetitorSpyService.getGrowthData(req.params.id, req.user._id, { days: +days || 30, platform });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Top posts (viral detector)
spyRouter.get('/:id/top-posts', async (req, res) => {
  try {
    const { platform, limit, sortBy } = req.query;
    const result = await CompetitorSpyService.getTopPosts(req.params.id, req.user._id, { platform, limit: +limit || 10, sortBy });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Hashtag spy
spyRouter.get('/:id/hashtags', async (req, res) => {
  try {
    const result = await CompetitorSpyService.spyHashtags(req.params.id, req.user._id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Best posting times analysis
spyRouter.get('/:id/best-times', async (req, res) => {
  try {
    const result = await CompetitorSpyService.getBestPostingTimes(req.params.id, req.user._id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// AI analysis report
spyRouter.post('/:id/ai-report', async (req, res) => {
  try {
    const result = await CompetitorSpyService.generateAIReport(req.params.id, req.user._id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Benchmark: you vs competitors
spyRouter.post('/benchmark', async (req, res) => {
  try {
    const { yourMetrics, platform } = req.body;
    const result = await CompetitorSpyService.benchmark(req.user._id, yourMetrics, platform);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Brand mention monitor
spyRouter.post('/mentions/monitor', async (req, res) => {
  try {
    const { keywords, options } = req.body;
    const result = await CompetitorSpyService.monitorMentions(keywords, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Facebook Ad Library spy
spyRouter.get('/ads/facebook', async (req, res) => {
  try {
    const { pageId, limit, country, adType } = req.query;
    const result = await CompetitorSpyService.spyFacebookAds(pageId, { limit: +limit || 20, country, adType });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════
// 14. PINTEREST ROUTES
// ══════════════════════════════════════════════════════════
const pinterestRouter = express.Router();
pinterestRouter.use(authenticate);
const PinterestService = require('../../services/social/pinterest.service');

// OAuth
pinterestRouter.get('/auth/url', (req, res) => {
  const url = PinterestService.getAuthUrl(req.query.state);
  res.json({ success: true, url });
});

pinterestRouter.post('/auth/callback', async (req, res) => {
  try {
    const { code } = req.body;
    const tokens = await PinterestService.exchangeCode(code);
    res.json({ success: true, data: tokens });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Profile
pinterestRouter.get('/profile/:accountId', async (req, res) => {
  try {
    const data = await PinterestService.getProfile(req.params.accountId);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Boards
pinterestRouter.get('/boards/:accountId', async (req, res) => {
  try {
    const { limit, privacy } = req.query;
    const boards = await PinterestService.getBoards(req.params.accountId, { limit: +limit || 50, privacy });
    res.json({ success: true, data: boards, total: boards.length });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

pinterestRouter.post('/boards', async (req, res) => {
  try {
    const { accountId, ...boardData } = req.body;
    const result = await PinterestService.createBoard(accountId, boardData);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

pinterestRouter.put('/boards/:boardId', async (req, res) => {
  try {
    const { accountId, ...updates } = req.body;
    const result = await PinterestService.updateBoard(accountId, req.params.boardId, updates);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

pinterestRouter.delete('/boards/:boardId', async (req, res) => {
  try {
    const { accountId } = req.body;
    const result = await PinterestService.deleteBoard(accountId, req.params.boardId);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Board sections
pinterestRouter.get('/boards/:boardId/sections', async (req, res) => {
  try {
    const { accountId } = req.query;
    const sections = await PinterestService.getBoardSections(accountId, req.params.boardId);
    res.json({ success: true, data: sections });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

pinterestRouter.post('/boards/:boardId/sections', async (req, res) => {
  try {
    const { accountId, name } = req.body;
    const result = await PinterestService.createBoardSection(accountId, req.params.boardId, name);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

pinterestRouter.delete('/boards/:boardId/sections/:sectionId', async (req, res) => {
  try {
    const { accountId } = req.body;
    const result = await PinterestService.deleteBoardSection(accountId, req.params.boardId, req.params.sectionId);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Pins
pinterestRouter.post('/pins', upload.single('image'), async (req, res) => {
  try {
    const pinData = { ...req.body };
    if (req.file) pinData.imagePath = req.file.path;
    const result = await PinterestService.createPin(req.body.accountId, pinData);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

pinterestRouter.post('/pins/bulk', async (req, res) => {
  try {
    const { accountId, pins, options } = req.body;
    PinterestService.bulkPin(accountId, pins, options || {})
      .then(r => console.log('Pinterest bulk pin done:', r))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: `Bulk pin started for ${pins.length} pins` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

pinterestRouter.post('/pins/from-url', async (req, res) => {
  try {
    const { accountId, webpageUrl, boardId, options } = req.body;
    const result = await PinterestService.pinFromUrl(accountId, webpageUrl, boardId, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

pinterestRouter.post('/pins/schedule', async (req, res) => {
  try {
    const { accountId, pins, startTime, intervalHours } = req.body;
    const result = PinterestService.schedulePins(accountId, pins, startTime, (intervalHours || 1) * 3600000);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

pinterestRouter.post('/pins/repin', async (req, res) => {
  try {
    const { accountId, keyword, targetBoardId, options } = req.body;
    PinterestService.autoRepin(accountId, keyword, targetBoardId, options || {})
      .then(r => console.log('Repin done:', r))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: `Auto-repin started for keyword: ${keyword}` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

pinterestRouter.get('/boards/:boardId/pins', async (req, res) => {
  try {
    const { accountId, limit } = req.query;
    const pins = await PinterestService.getBoardPins(accountId, req.params.boardId, { limit: +limit || 50 });
    res.json({ success: true, data: pins, total: pins.length });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

pinterestRouter.delete('/pins/:pinId', async (req, res) => {
  try {
    const { accountId } = req.body;
    const result = await PinterestService.deletePin(accountId, req.params.pinId);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Follow/Unfollow
pinterestRouter.post('/follow/user', async (req, res) => {
  try {
    const { accountId, userId } = req.body;
    const result = await PinterestService.followUser(accountId, userId);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

pinterestRouter.post('/follow/mass', async (req, res) => {
  try {
    const { accountId, userIds, options } = req.body;
    PinterestService.massFollow(accountId, userIds, options || {})
      .then(r => console.log('Pinterest mass follow done:', r))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: `Mass follow started for ${userIds.length} users` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Search
pinterestRouter.get('/search/pins', async (req, res) => {
  try {
    const { accountId, query, limit } = req.query;
    const results = await PinterestService.searchPins(accountId, query, { limit: +limit || 25 });
    res.json({ success: true, data: results, total: results.length });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Spy competitor boards
pinterestRouter.get('/spy/boards', async (req, res) => {
  try {
    const { username, limit } = req.query;
    const result = await PinterestService.spyCompetitorBoards(username, { limit: +limit || 20 });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Trending topics
pinterestRouter.get('/trends', async (req, res) => {
  try {
    const { category } = req.query;
    const result = await PinterestService.getTrendingTopics(category);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Analytics
pinterestRouter.get('/analytics/pin/:pinId', async (req, res) => {
  try {
    const { accountId, startDate, endDate } = req.query;
    const result = await PinterestService.getPinAnalytics(accountId, req.params.pinId, { startDate, endDate });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

pinterestRouter.get('/analytics/account/:accountId', async (req, res) => {
  try {
    const { days } = req.query;
    const result = await PinterestService.getAccountAnalytics(req.params.accountId, { days: +days || 30 });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// AI pin description
pinterestRouter.post('/ai/description', async (req, res) => {
  try {
    const { imageUrl, options } = req.body;
    const result = await PinterestService.generatePinDescription(imageUrl, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════
// 15. CONTENT REPURPOSER ROUTES
// ══════════════════════════════════════════════════════════
const repurposerRouter = express.Router();
repurposerRouter.use(authenticate);
const ContentRepurposer = require('../../services/social/content-repurposer.service');

// List all available output formats
repurposerRouter.get('/formats', (req, res) => {
  res.json({ success: true, data: ContentRepurposer.getFormats() });
});

// Repurpose from URL (blog / article)
repurposerRouter.post('/from-url', async (req, res) => {
  try {
    const { url, formats, options } = req.body;
    // Extract first so we can confirm
    const contentData = await ContentRepurposer.extractFromUrl(url);
    res.json({ success: true, extracted: { title: contentData.title, wordCount: contentData.wordCount } });

    // Then repurpose async
    ContentRepurposer.repurposeToMany(contentData, formats || [], options || {})
      .then(r => console.log(`URL repurpose done: ${r.formatsSuccess}/${r.formatsTotal}`))
      .catch(e => console.error(e.message));
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Repurpose from URL (sync — waits for result)
repurposerRouter.post('/from-url/sync', async (req, res) => {
  try {
    const { url, formats, options } = req.body;
    const result = await ContentRepurposer.repurposeFromUrl(url, formats || [], options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Repurpose from YouTube video
repurposerRouter.post('/from-youtube', async (req, res) => {
  try {
    const { videoUrl, formats, options } = req.body;
    const result = await ContentRepurposer.repurposeFromYouTube(videoUrl, formats || [], options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Repurpose from plain text
repurposerRouter.post('/from-text', async (req, res) => {
  try {
    const { text, formats, options } = req.body;
    const result = await ContentRepurposer.repurposeFromText(text, formats || [], options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Repurpose from uploaded audio/podcast
repurposerRouter.post('/from-audio', upload.single('audio'), async (req, res) => {
  try {
    const audioPath   = req.file?.path || req.body.audioPath;
    const { formats, options } = req.body;
    const contentData = await ContentRepurposer.extractFromAudio(audioPath);
    const result      = await ContentRepurposer.repurposeToMany(contentData, formats ? JSON.parse(formats) : [], options ? JSON.parse(options) : {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Repurpose to single format
repurposerRouter.post('/single', async (req, res) => {
  try {
    const { content, title, format, options } = req.body;
    const contentData = ContentRepurposer.extractFromText(content, { title });
    const result      = await ContentRepurposer.repurposeToFormat(contentData, format, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Smart repurpose (auto-selects formats by goal + platforms)
repurposerRouter.post('/smart', async (req, res) => {
  try {
    const { source, content, url, videoUrl, options } = req.body;
    let contentData;

    if (source === 'url' && url)           contentData = await ContentRepurposer.extractFromUrl(url);
    else if (source === 'youtube' && videoUrl) contentData = await ContentRepurposer.extractFromYouTube(videoUrl);
    else if (content)                      contentData = ContentRepurposer.extractFromText(content, options?.metadata);
    else return res.status(400).json({ success: false, error: 'Provide source + content/url/videoUrl' });

    const result = await ContentRepurposer.smartRepurpose(contentData, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Full repurpose pack (ALL 20 formats)
repurposerRouter.post('/all', async (req, res) => {
  try {
    const { content, title, options } = req.body;
    const contentData = ContentRepurposer.extractFromText(content, { title });

    // Start async, respond immediately
    res.json({ success: true, message: 'Full repurpose started (20 formats) — this takes 2-3 minutes', formats: 20 });

    ContentRepurposer.repurposeAll(contentData, options || {})
      .then(r => console.log(`Full repurpose done: ${r.formatsSuccess}/20 formats`))
      .catch(e => console.error(e.message));
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Extract content only (no repurposing)
repurposerRouter.post('/extract', async (req, res) => {
  try {
    const { source, url, videoUrl, text } = req.body;
    let contentData;

    if (source === 'url')           contentData = await ContentRepurposer.extractFromUrl(url);
    else if (source === 'youtube')  contentData = await ContentRepurposer.extractFromYouTube(videoUrl);
    else                            contentData = ContentRepurposer.extractFromText(text || '');

    res.json({ success: true, data: { title: contentData.title, wordCount: contentData.wordCount, source: contentData.source, preview: contentData.content?.slice(0, 500) } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════
module.exports = {
  competitorSpyRoutes: spyRouter,
  pinterestRoutes:     pinterestRouter,
  repurposerRoutes:    repurposerRouter,
};
