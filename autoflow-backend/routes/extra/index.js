/**
 * ══════════════════════════════════════════════════════════
 * NEW FEATURE ROUTES — 6 Power Features
 * ══════════════════════════════════════════════════════════
 */

const express = require('express');
const { User, Contact, ContactList } = require('../../models');
const { authenticate } = require('../../middleware/auth');



// ═══════════════════════════════════════════════════════════
// 1. INSTAGRAM ROUTES
// ═══════════════════════════════════════════════════════════
const instagramRouter = express.Router();
instagramRouter.use(authenticate);
const InstagramService = require('../../services/instagram.service');

// Login
instagramRouter.post('/login', async (req, res) => {
  const { accountId, username, password } = req.body;
  const result = await InstagramService.login(accountId, username, password);
  res.json({ success: true, data: result });
});

// Bulk DM sender
instagramRouter.post('/dm/bulk', async (req, res) => {
  const { accountId, targets, message, options = {} } = req.body;
  if (!targets?.length) return res.status(400).json({ success: false, message: 'No targets' });

  // Run async — don't wait
  InstagramService.sendBulkDM(accountId, targets, message, { userId: req.user._id, ...options })
    .then(r  => console.log(`IG DM bulk done: ${r.sent} sent`))
    .catch(e => console.error(`IG DM bulk error: ${e.message}`));

  res.json({ success: true, message: `DM campaign started for ${targets.length} targets`, queued: targets.length });
});

// Send single DM
instagramRouter.post('/dm/send', async (req, res) => {
  const { accountId, username, message } = req.body;
  const result = await InstagramService.sendDM(accountId, username, message);
  res.json({ success: true, data: result });
});

// Auto follow
instagramRouter.post('/follow', async (req, res) => {
  const { accountId, usernames, options } = req.body;
  const result = await InstagramService.autoFollow(accountId, usernames, options);
  res.json({ success: true, data: result });
});

// Auto unfollow non-followers
instagramRouter.post('/unfollow', async (req, res) => {
  const { accountId, options } = req.body;
  const result = await InstagramService.autoUnfollow(accountId, options);
  res.json({ success: true, data: result });
});

// Scrape by hashtag
instagramRouter.get('/scrape/hashtag', async (req, res) => {
  const { accountId, hashtag, limit = 100 } = req.query;
  const users = await InstagramService.scrapeByHashtag(accountId, hashtag, +limit);
  res.json({ success: true, data: users, count: users.length });
});

// Steal competitor followers
instagramRouter.get('/scrape/followers', async (req, res) => {
  const { accountId, username, limit = 200 } = req.query;
  const users = await InstagramService.scrapeCompetitorFollowers(accountId, username, +limit);
  res.json({ success: true, data: users, count: users.length });
});

// Auto like by hashtag
instagramRouter.post('/like/hashtag', async (req, res) => {
  const { accountId, hashtag, options } = req.body;
  const result = await InstagramService.autoLikeByHashtag(accountId, hashtag, options);
  res.json({ success: true, data: result });
});

// Auto comment
instagramRouter.post('/comment', async (req, res) => {
  const { accountId, mediaIds, comments, options } = req.body;
  const result = await InstagramService.autoComment(accountId, mediaIds, comments, options);
  res.json({ success: true, data: result });
});

// Upload post
instagramRouter.post('/post', async (req, res) => {
  const { accountId, imagePath, caption } = req.body;
  const result = await InstagramService.uploadPost(accountId, imagePath, caption);
  res.json({ success: true, data: result });
});

// Get followers list
instagramRouter.get('/followers', async (req, res) => {
  const { accountId, username } = req.query;
  const followers = await InstagramService.getAllFollowers(accountId, username);
  res.json({ success: true, data: followers, count: followers.length });
});

// ═══════════════════════════════════════════════════════════
// 2. FACEBOOK ROUTES
// ═══════════════════════════════════════════════════════════
const facebookRouter = express.Router();
facebookRouter.use(authenticate);
const FacebookService = require('../../services/facebook.service');

// Login
facebookRouter.post('/login', async (req, res) => {
  const { accountId, email, password } = req.body;
  const result = await FacebookService.login(accountId, email, password);
  res.json({ success: true, data: result });
});

// Post to groups
facebookRouter.post('/groups/post', async (req, res) => {
  const { accountId, groupUrls, message, options = {} } = req.body;
  if (!groupUrls?.length) return res.status(400).json({ success: false, message: 'No groups provided' });

  // Run async
  FacebookService.postToGroups(accountId, groupUrls, message, options)
    .then(r  => console.log(`FB groups post done: ${r.posted} posted`))
    .catch(e => console.error(`FB groups error: ${e.message}`));

  res.json({ success: true, message: `Posting to ${groupUrls.length} groups started`, queued: groupUrls.length });
});

// Scrape group members
facebookRouter.get('/groups/members', async (req, res) => {
  const { accountId, groupUrl, limit = 100 } = req.query;
  const members = await FacebookService.scrapeGroupMembers(accountId, groupUrl, +limit);
  res.json({ success: true, data: members, count: members.length });
});

// Post to Marketplace
facebookRouter.post('/marketplace/post', async (req, res) => {
  const { accountId, listing } = req.body;
  const result = await FacebookService.postMarketplace(accountId, listing);
  res.json({ success: true, data: result });
});

// Send friend requests
facebookRouter.post('/friends/add', async (req, res) => {
  const { accountId, profileUrls, options } = req.body;
  const result = await FacebookService.sendFriendRequests(accountId, profileUrls, options);
  res.json({ success: true, data: result });
});

// Invite to event
facebookRouter.post('/events/invite', async (req, res) => {
  const { accountId, eventUrl, options } = req.body;
  const result = await FacebookService.inviteToEvent(accountId, eventUrl, options);
  res.json({ success: true, data: result });
});

// Disconnect
facebookRouter.delete('/disconnect/:accountId', async (req, res) => {
  await FacebookService.disconnect(req.params.accountId);
  res.json({ success: true, message: 'Facebook disconnected' });
});

// ═══════════════════════════════════════════════════════════
// 3. LEAD SCRAPER ROUTES
// ═══════════════════════════════════════════════════════════
const scraperRouter = express.Router();
scraperRouter.use(authenticate);
const LeadScraper = require('../../services/scrapers/lead-scraper.service');

// Google Maps scraper
scraperRouter.post('/google-maps', async (req, res) => {
  const { query, location, limit = 50, saveToList } = req.body;
  if (!query || !location) return res.status(400).json({ success: false, message: 'query and location required' });

  const leads = await LeadScraper.scrapeGoogleMaps(query, location, +limit);

  let saved = null;
  if (saveToList) {
    saved = await LeadScraper.saveLeadsToContacts(leads, req.user._id, saveToList, { tag: 'google_maps' });
  }

  res.json({ success: true, data: leads, count: leads.length, saved });
});

// Yellow Pages scraper
scraperRouter.post('/yellow-pages', async (req, res) => {
  const { category, location, limit = 50, saveToList } = req.body;
  const leads = await LeadScraper.scrapeYellowPages(category, location, +limit);

  let saved = null;
  if (saveToList) {
    saved = await LeadScraper.saveLeadsToContacts(leads, req.user._id, saveToList, { tag: 'yellow_pages' });
  }

  res.json({ success: true, data: leads, count: leads.length, saved });
});

// Website email scraper
scraperRouter.post('/website', async (req, res) => {
  const { url, urls } = req.body;
  if (urls?.length) {
    const results = await LeadScraper.scrapeMultipleWebsites(urls);
    res.json({ success: true, data: results, count: results.length });
  } else if (url) {
    const result = await LeadScraper.scrapeWebsite(url);
    res.json({ success: true, data: result });
  } else {
    res.status(400).json({ success: false, message: 'url or urls required' });
  }
});

// Instagram bio scraper
scraperRouter.post('/instagram-bios', async (req, res) => {
  const { usernames, saveToList } = req.body;
  if (!usernames?.length) return res.status(400).json({ success: false, message: 'usernames required' });

  const leads = await LeadScraper.scrapeInstagramBios(usernames);
  let saved   = null;
  if (saveToList) {
    saved = await LeadScraper.saveLeadsToContacts(leads, req.user._id, saveToList, { tag: 'instagram' });
  }

  res.json({ success: true, data: leads, count: leads.length, saved });
});

// Google search scraper
scraperRouter.post('/google-search', async (req, res) => {
  const { query, limit = 50, saveToList } = req.body;
  const leads = await LeadScraper.scrapeGoogleSearch(query, +limit);

  let saved = null;
  if (saveToList && Array.isArray(leads)) {
    saved = await LeadScraper.saveLeadsToContacts(leads, req.user._id, saveToList);
  }

  res.json({ success: true, data: leads, count: Array.isArray(leads) ? leads.length : 0, saved });
});

// Full pipeline (scrape + save in one call)
scraperRouter.post('/pipeline', async (req, res) => {
  const { source, params, listId } = req.body;
  const result = await LeadScraper.runPipeline(source, params, req.user._id, listId);
  res.json({ success: true, data: result });
});

// ═══════════════════════════════════════════════════════════
// 4. DRIP SEQUENCE ROUTES
// ═══════════════════════════════════════════════════════════
const dripRouter = express.Router();
dripRouter.use(authenticate);
const { DripSequenceService, Sequence, Enrollment } = require('../../services/drip-sequence.service');

// Get all sequences
dripRouter.get('/', async (req, res) => {
  const sequences = await Sequence.find({ userId: req.user._id }).sort('-createdAt');
  res.json({ success: true, data: sequences });
});

// Create sequence
dripRouter.post('/', async (req, res) => {
  const seq = await DripSequenceService.createSequence(req.user._id, req.body);
  res.status(201).json({ success: true, data: seq });
});

// Update sequence steps (from visual builder drag-drop)
dripRouter.put('/:id/steps', async (req, res) => {
  const { steps, entryStep } = req.body;
  const seq = await DripSequenceService.updateSteps(req.params.id, req.user._id, steps, entryStep);
  if (!seq) return res.status(404).json({ success: false, message: 'Sequence not found' });
  res.json({ success: true, data: seq });
});

// Activate/deactivate sequence
dripRouter.patch('/:id/toggle', async (req, res) => {
  const seq = await Sequence.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    [{ $set: { isActive: { $not: '$isActive' } } }],
    { new: true }
  );
  res.json({ success: true, data: seq, message: `Sequence ${seq.isActive ? 'activated' : 'deactivated'}` });
});

// Enroll single contact
dripRouter.post('/:id/enroll', async (req, res) => {
  const { contactId } = req.body;
  const result = await DripSequenceService.enroll(req.params.id, contactId, req.user._id);
  res.json({ success: true, data: result });
});

// Bulk enroll contacts
dripRouter.post('/:id/enroll/bulk', async (req, res) => {
  const { contactIds, listId } = req.body;

  let ids = contactIds || [];
  if (listId) {
    const contacts = await Contact.find({ userId: req.user._id, lists: listId, status: 'active' });
    ids = contacts.map(c => c._id.toString());
  }

  const result = await DripSequenceService.bulkEnroll(req.params.id, ids, req.user._id);
  res.json({ success: true, data: result });
});

// Get sequence stats
dripRouter.get('/:id/stats', async (req, res) => {
  const result = await DripSequenceService.getStats(req.params.id, req.user._id);
  res.json({ success: true, data: result });
});

// Get enrollments for sequence
dripRouter.get('/:id/enrollments', async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const q = { sequenceId: req.params.id };
  if (status) q.status = status;

  const [enrollments, total] = await Promise.all([
    Enrollment.find(q).skip((page-1)*limit).limit(+limit).populate('contactId', 'name email phone'),
    Enrollment.countDocuments(q)
  ]);

  res.json({ success: true, data: enrollments, total });
});

// Delete sequence
dripRouter.delete('/:id', async (req, res) => {
  await Sequence.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  await Enrollment.deleteMany({ sequenceId: req.params.id });
  res.json({ success: true, message: 'Sequence deleted' });
});

// ═══════════════════════════════════════════════════════════
// 5. DISCORD ROUTES
// ═══════════════════════════════════════════════════════════
const discordRouter = express.Router();
discordRouter.use(authenticate);
const DiscordService = require('../../services/discord.service');

// Initialize bot
discordRouter.post('/init', async (req, res) => {
  const { accountId, token, options } = req.body;
  await DiscordService.initBot(accountId, token, options || {});
  res.json({ success: true, message: 'Discord bot initializing...' });
});

// Send message to channel
discordRouter.post('/message', async (req, res) => {
  const { accountId, channelId, message, options } = req.body;
  const result = await DiscordService.sendChannelMessage(accountId, channelId, message, options || {});
  res.json({ success: true, data: result });
});

// DM all server members
discordRouter.post('/dm/all', async (req, res) => {
  const { accountId, guildId, message, options } = req.body;

  // Async
  DiscordService.dmAllMembers(accountId, guildId, message, options || {})
    .then(r  => console.log(`Discord DM all done: ${r.sent} sent`))
    .catch(e => console.error(`Discord DM all error: ${e.message}`));

  res.json({ success: true, message: 'Discord DM campaign started' });
});

// Scrape members to contacts
discordRouter.post('/scrape/members', async (req, res) => {
  const { accountId, guildId, options } = req.body;
  const result = await DiscordService.scrapeMembers(accountId, guildId, req.user._id, options || {});
  res.json({ success: true, data: result });
});

// Post via webhook (no bot needed)
discordRouter.post('/webhook/send', async (req, res) => {
  const { webhookUrl, message, options } = req.body;
  const result = await DiscordService.sendViaWebhook(webhookUrl, message, options || {});
  res.json({ success: true, data: result });
});

// Broadcast to multiple webhooks
discordRouter.post('/webhook/broadcast', async (req, res) => {
  const { webhookUrls, message, options } = req.body;
  const results = await DiscordService.broadcastToWebhooks(webhookUrls, message, options || {});
  res.json({ success: true, data: results });
});

// Get server stats
discordRouter.get('/stats/:accountId/:guildId', async (req, res) => {
  const stats = await DiscordService.getServerStats(req.params.accountId, req.params.guildId);
  res.json({ success: true, data: stats });
});

// Setup auto-reply rules
discordRouter.post('/auto-reply', async (req, res) => {
  const { accountId, guildId, rules } = req.body;
  await DiscordService.setupAutoReply(accountId, guildId, rules);
  res.json({ success: true, message: `${rules.length} auto-reply rules set` });
});

// Disconnect bot
discordRouter.delete('/disconnect/:accountId', async (req, res) => {
  await DiscordService.disconnect(req.params.accountId);
  res.json({ success: true, message: 'Discord bot disconnected' });
});

// ═══════════════════════════════════════════════════════════
// 6. AI IMAGE GENERATOR ROUTES
// ═══════════════════════════════════════════════════════════
const aiImageRouter = express.Router();
aiImageRouter.use(authenticate);
const AIImageService = require('../../services/ai-image.service');

// Generate image (auto provider)
aiImageRouter.post('/generate', async (req, res) => {
  const { prompt, provider = 'auto', width, height, seed, model, style } = req.body;
  if (!prompt) return res.status(400).json({ success: false, message: 'prompt required' });

  const result = await AIImageService.generate(prompt, { provider, width, height, seed, model });
  res.json({ success: true, data: result });
});

// Generate for specific platform (auto-sized)
aiImageRouter.post('/generate/platform', async (req, res) => {
  const { prompt, platform, options } = req.body;
  const result = await AIImageService.generateForPlatform(prompt, platform, options || {});
  res.json({ success: true, data: result });
});

// Generate batch (multiple variations)
aiImageRouter.post('/generate/batch', async (req, res) => {
  const { prompt, count = 4, options } = req.body;
  const images = await AIImageService.generateBatch(prompt, +count, options || {});
  res.json({ success: true, data: images, count: images.length });
});

// Enhance prompt with AI
aiImageRouter.post('/enhance-prompt', async (req, res) => {
  const { prompt, style = 'photorealistic' } = req.body;
  const result = await AIImageService.enhancePrompt(prompt, style);
  res.json({ success: true, data: result });
});

// List generated images
aiImageRouter.get('/list', async (req, res) => {
  const fs      = require('fs');
  const imgDir  = './uploads/ai-images';
  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';

  if (!fs.existsSync(imgDir)) return res.json({ success: true, data: [] });

  const files = fs.readdirSync(imgDir)
    .map(f => ({
      filename:  f,
      url:       `${baseUrl}/uploads/ai-images/${f}`,
      createdAt: fs.statSync(`${imgDir}/${f}`).mtime,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);

  res.json({ success: true, data: files, count: files.length });
});

// Cleanup old images
aiImageRouter.delete('/cleanup', async (req, res) => {
  const { daysOld = 7 } = req.body;
  const result = await AIImageService.cleanupOldImages(+daysOld);
  res.json({ success: true, data: result });
});

// ══════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════
module.exports = {
  instagramRoutes: instagramRouter,
  facebookRoutes:  facebookRouter,
  scraperRoutes:   scraperRouter,
  dripRoutes:      dripRouter,
  discordRoutes:   discordRouter,
  aiImageRoutes:   aiImageRouter,
};
