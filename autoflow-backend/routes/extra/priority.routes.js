/**
 * ══════════════════════════════════════════════════════════
 * PRIORITY ROUTES — Giveaway · UGC · Comment Reply · Influencer
 * ══════════════════════════════════════════════════════════
 */

const express = require('express');
const multer  = require('multer');
const { authenticate } = require('../../middleware/auth');


const upload = multer({ dest: './uploads/temp/', limits: { fileSize: 500 * 1024 * 1024 } });

// ══════════════════════════════════════════════════════════
// GIVEAWAY ROUTES
// ══════════════════════════════════════════════════════════
const giveawayRouter = express.Router();
giveawayRouter.use(authenticate);
const { GiveawayService } = require('../../services/social/giveaway.service');

// CRUD
giveawayRouter.post('/', async (req, res) => {
  try {
    const result = await GiveawayService.createGiveaway(req.user._id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

giveawayRouter.get('/', async (req, res) => {
  try {
    const result = await GiveawayService.getGiveaways(req.user._id, req.query);
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

giveawayRouter.get('/:id', async (req, res) => {
  try {
    const result = await GiveawayService.getGiveaway(req.params.id, req.user._id);
    if (!result) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

giveawayRouter.put('/:id', async (req, res) => {
  try {
    const result = await GiveawayService.updateGiveaway(req.params.id, req.user._id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Collect entries (scan all platforms)
giveawayRouter.post('/:id/collect', async (req, res) => {
  try {
    GiveawayService.collectEntries(req.params.id, req.user._id)
      .then(r => console.log('Entries collected:', r))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: 'Entry collection started — this may take a few minutes' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get all entries
giveawayRouter.get('/:id/entries', async (req, res) => {
  try {
    const result = await GiveawayService.getEntries(req.params.id, req.user._id, req.query);
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Pick winner(s)
giveawayRouter.post('/:id/pick-winner', async (req, res) => {
  try {
    const result = await GiveawayService.pickWinners(req.params.id, req.user._id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Announce winner(s)
giveawayRouter.post('/:id/announce', async (req, res) => {
  try {
    GiveawayService.announceWinners(req.params.id, req.user._id, req.body)
      .then(r => console.log('Winners announced:', r))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: 'Winner announcement started' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Send follow-up to all entrants
giveawayRouter.post('/:id/follow-up', async (req, res) => {
  try {
    const { message, options } = req.body;
    const result = await GiveawayService.sendEntrantFollowUp(req.params.id, req.user._id, message, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Analytics
giveawayRouter.get('/:id/analytics', async (req, res) => {
  try {
    const result = await GiveawayService.getAnalytics(req.params.id, req.user._id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════
// UGC ROUTES
// ══════════════════════════════════════════════════════════
const ugcRouter = express.Router();
ugcRouter.use(authenticate);
const { UGCService } = require('../../services/social/ugc.service');

// Campaigns
ugcRouter.post('/campaigns', async (req, res) => {
  try {
    const result = await UGCService.createCampaign(req.user._id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

ugcRouter.get('/campaigns', async (req, res) => {
  try {
    const result = await UGCService.getCampaigns(req.user._id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

ugcRouter.put('/campaigns/:id', async (req, res) => {
  try {
    const result = await UGCService.updateCampaign(req.params.id, req.user._id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Manual scan
ugcRouter.post('/scan', async (req, res) => {
  try {
    UGCService.scanForUGC(req.user._id, req.body)
      .then(r => console.log('UGC scan done:', r))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: 'UGC scan started' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Library
ugcRouter.get('/library', async (req, res) => {
  try {
    const result = await UGCService.getLibrary(req.user._id, req.query);
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

ugcRouter.get('/library/:id', async (req, res) => {
  try {
    const result = await UGCService.getItem(req.params.id, req.user._id);
    if (!result) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

ugcRouter.put('/library/:id', async (req, res) => {
  try {
    const result = await UGCService.updateItem(req.params.id, req.user._id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

ugcRouter.delete('/library/:id', async (req, res) => {
  try {
    const result = await UGCService.deleteItem(req.params.id, req.user._id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Permission workflow
ugcRouter.post('/library/:id/request-permission', async (req, res) => {
  try {
    const result = await UGCService.requestPermission(req.params.id, req.user._id, req.body.targetAccount, req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

ugcRouter.post('/library/:id/approve', async (req, res) => {
  try {
    const result = await UGCService.approveAndRepost(req.params.id, req.user._id, req.body, req.query);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

ugcRouter.post('/library/:id/repost', async (req, res) => {
  try {
    const result = await UGCService.repost(req.params.id, req.user._id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

ugcRouter.post('/library/:id/archive', async (req, res) => {
  try {
    const result = await UGCService.archiveItem(req.params.id, req.user._id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Leaderboard
ugcRouter.get('/leaderboard', async (req, res) => {
  try {
    const result = await UGCService.getCreatorLeaderboard(req.user._id, req.query);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Promote top UGC creators → influencer list
ugcRouter.post('/promote-creators', async (req, res) => {
  try {
    const result = await UGCService.promoteCreatorsToInfluencers(req.user._id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Social proof embed
ugcRouter.get('/embed', async (req, res) => {
  try {
    const result = await UGCService.generateSocialProofEmbed(req.user._id, req.query);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Analytics
ugcRouter.get('/analytics', async (req, res) => {
  try {
    const result = await UGCService.getAnalytics(req.user._id, +req.query.days || 30);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════
// AUTO COMMENT REPLY ROUTES
// ══════════════════════════════════════════════════════════
const commentRouter = express.Router();
commentRouter.use(authenticate);
const { AutoCommentReplyService } = require('../../services/social/auto-comment-reply.service');

// Create session
commentRouter.post('/sessions', async (req, res) => {
  try {
    const session = await AutoCommentReplyService.createSession(req.user._id, req.body);
    // Start bot loop
    AutoCommentReplyService.startReplying(session._id, req.user._id)
      .catch(e => console.error(e.message));
    res.json({ success: true, data: session });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get sessions
commentRouter.get('/sessions', async (req, res) => {
  try {
    const result = await AutoCommentReplyService.getSessions(req.user._id, req.query);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Pause / resume / stop
commentRouter.post('/sessions/:id/pause',  async (req, res) => {
  try { res.json({ success: true, data: await AutoCommentReplyService.pauseSession(req.params.id, req.user._id) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

commentRouter.post('/sessions/:id/resume', async (req, res) => {
  try { res.json({ success: true, data: await AutoCommentReplyService.resumeSession(req.params.id, req.user._id) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

commentRouter.post('/sessions/:id/stop', async (req, res) => {
  try { res.json({ success: true, data: await AutoCommentReplyService.stopSession(req.params.id, req.user._id) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Session stats
commentRouter.get('/sessions/:id/stats', async (req, res) => {
  try {
    const result = await AutoCommentReplyService.getSessionStats(req.params.id, req.user._id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Overall stats
commentRouter.get('/stats', async (req, res) => {
  try {
    const result = await AutoCommentReplyService.getAllStats(req.user._id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Competitor poaching
commentRouter.post('/poach', async (req, res) => {
  try {
    const { accountId, competitorPostUrl, platform, replyTemplate, options } = req.body;
    AutoCommentReplyService.poachCompetitorComments(accountId, competitorPostUrl, platform, replyTemplate, options || {})
      .then(r => console.log('Poach done:', r))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: 'Competitor comment poaching started' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Bulk comment on posts
commentRouter.post('/bulk-comment', async (req, res) => {
  try {
    const { accountId, platform, postUrls, comments, options } = req.body;
    AutoCommentReplyService.bulkCommentPosts(accountId, platform, postUrls, comments, options || {})
      .then(r => console.log('Bulk comment done:', r))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: `Bulk commenting on ${postUrls.length} posts started` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════
// INFLUENCER ROUTES
// ══════════════════════════════════════════════════════════
const influencerRouter = express.Router();
influencerRouter.use(authenticate);
const { InfluencerService } = require('../../services/social/influencer.service');

// Search / find influencers
influencerRouter.post('/search', async (req, res) => {
  try {
    InfluencerService.findInfluencers(req.user._id, req.body)
      .then(r => console.log(`Found ${r.found} influencers`))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: 'Influencer search started — results saved to CRM' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

influencerRouter.post('/search/sync', async (req, res) => {
  try {
    const result = await InfluencerService.findInfluencers(req.user._id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// CRM: list
influencerRouter.get('/', async (req, res) => {
  try {
    const result = await InfluencerService.getInfluencers(req.user._id, req.query);
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// AI score single influencer
influencerRouter.post('/:id/ai-score', async (req, res) => {
  try {
    const { Influencer } = require('../../services/social/influencer.service');
    const inf = await Influencer.findOne({ _id: req.params.id, userId: req.user._id });
    if (!inf) return res.status(404).json({ success: false, message: 'Not found' });
    const result = await InfluencerService.aiScoreInfluencer(inf);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Find similar
influencerRouter.get('/:id/similar', async (req, res) => {
  try {
    const result = await InfluencerService.findSimilar(req.user._id, req.params.id, req.query);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Generate outreach message
influencerRouter.post('/:id/write-outreach', async (req, res) => {
  try {
    const { Influencer } = require('../../services/social/influencer.service');
    const inf = await Influencer.findOne({ _id: req.params.id, userId: req.user._id });
    if (!inf) return res.status(404).json({ success: false, message: 'Not found' });
    const result = await InfluencerService.writeOutreachMessage(inf, req.body.brandInfo || {}, req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Generate contract
influencerRouter.post('/:id/contract', async (req, res) => {
  try {
    const { Influencer } = require('../../services/social/influencer.service');
    const inf = await Influencer.findOne({ _id: req.params.id, userId: req.user._id });
    if (!inf) return res.status(404).json({ success: false, message: 'Not found' });
    const result = await InfluencerService.generateContract(inf, req.body.dealTerms || {}, req.body.brandInfo || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Status updates
influencerRouter.patch('/:id/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const result = await InfluencerService.updateStatus(req.user._id, req.params.id, status, notes);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

influencerRouter.post('/:id/shortlist', async (req, res) => {
  try { res.json({ success: true, data: await InfluencerService.shortlistInfluencer(req.user._id, req.params.id) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

influencerRouter.post('/:id/blacklist', async (req, res) => {
  try {
    const result = await InfluencerService.blacklistInfluencer(req.user._id, req.params.id, req.body.reason);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

influencerRouter.delete('/:id', async (req, res) => {
  try { res.json({ success: true, data: await InfluencerService.deleteInfluencer(req.user._id, req.params.id) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// CRM stats
influencerRouter.get('/stats/crm', async (req, res) => {
  try {
    const result = await InfluencerService.getCRMStats(req.user._id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Outreach campaigns
influencerRouter.post('/campaigns', async (req, res) => {
  try {
    const result = await InfluencerService.createCampaign(req.user._id, req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

influencerRouter.get('/campaigns/list', async (req, res) => {
  try {
    const result = await InfluencerService.getCampaigns(req.user._id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

influencerRouter.post('/campaigns/:id/run', async (req, res) => {
  try {
    InfluencerService.runOutreachCampaign(req.user._id, req.params.id)
      .then(r => console.log('Outreach done:', r))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: 'Outreach campaign started' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════
module.exports = {
  giveawayRoutes:   giveawayRouter,
  ugcRoutes:        ugcRouter,
  commentRoutes:    commentRouter,
  influencerRoutes: influencerRouter,
};
