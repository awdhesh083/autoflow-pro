/**
 * ══════════════════════════════════════════════════════════
 * PART 3 ROUTES — Features 9-12
 * AI Caption | Post Scheduler | Telegram Advanced | Twitter Advanced
 * ══════════════════════════════════════════════════════════
 */

const express = require('express');
const multer  = require('multer');
const { authenticate } = require('../../middleware/auth');


const upload = multer({ dest: './uploads/temp/', limits: { fileSize: 500 * 1024 * 1024 } });

// ══════════════════════════════════════════════════════════
// 9. AI CAPTION ROUTES
// ══════════════════════════════════════════════════════════
const captionRouter = express.Router();
captionRouter.use(authenticate);
const AICaptionService = require('../../services/social/ai-caption.service');

// Generate caption for a platform
captionRouter.post('/generate', async (req, res) => {
  try {
    const result = await AICaptionService.generateCaption(req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Generate for ALL platforms at once
captionRouter.post('/generate/all-platforms', async (req, res) => {
  try {
    const { topic, ...options } = req.body;
    const result = await AICaptionService.generateForAllPlatforms(topic, options);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Hashtag research
captionRouter.post('/hashtags', async (req, res) => {
  try {
    const result = await AICaptionService.generateHashtags(req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Banned hashtag checker
captionRouter.post('/hashtags/check-banned', async (req, res) => {
  try {
    const { hashtags } = req.body;
    const result = await AICaptionService.checkBannedHashtags(hashtags);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Viral hook generator
captionRouter.post('/hooks', async (req, res) => {
  try {
    const { topic, ...options } = req.body;
    const result = await AICaptionService.generateViralHooks(topic, options);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Caption from uploaded image
captionRouter.post('/from-image', upload.single('image'), async (req, res) => {
  try {
    const imagePath = req.file?.path || req.body.imagePath;
    const result = await AICaptionService.captionFromImage(imagePath, req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Caption from image URL
captionRouter.post('/from-image-url', async (req, res) => {
  try {
    const { imageUrl, ...options } = req.body;
    const result = await AICaptionService.captionFromImageUrl(imageUrl, options);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Bio writer
captionRouter.post('/bio', async (req, res) => {
  try {
    const result = await AICaptionService.generateBio(req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 30-day content calendar
captionRouter.post('/calendar', async (req, res) => {
  try {
    const result = await AICaptionService.generateContentCalendar(req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Video script generator
captionRouter.post('/script/video', async (req, res) => {
  try {
    const result = await AICaptionService.generateVideoScript(req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Story script generator
captionRouter.post('/script/story', async (req, res) => {
  try {
    const result = await AICaptionService.generateStoryScript(req.body);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Caption translator
captionRouter.post('/translate', async (req, res) => {
  try {
    const { caption, languages, platform } = req.body;
    const result = await AICaptionService.translateCaption(caption, languages, platform);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Brand voice trainer
captionRouter.post('/brand-voice', async (req, res) => {
  try {
    const { examples, newTopic, platform, variants } = req.body;
    const result = await AICaptionService.trainBrandVoice(examples, { newTopic, platform, variants });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Caption performance analyzer
captionRouter.post('/analyze', async (req, res) => {
  try {
    const { captions } = req.body;
    const result = await AICaptionService.analyzeCaptionPerformance(captions);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════
// 10. POST SCHEDULER ROUTES
// ══════════════════════════════════════════════════════════
const schedulerRouter = express.Router();
schedulerRouter.use(authenticate);
const { PostSchedulerService } = require('../../services/social/post-scheduler.service');

// Create / schedule post
schedulerRouter.post('/', upload.array('media', 10), async (req, res) => {
  try {
    const postData = { ...req.body };
    if (req.files?.length) {
      postData.mediaUrls = req.files.map(f => f.path);
    }
    if (typeof postData.platforms === 'string') postData.platforms = JSON.parse(postData.platforms);
    const result = await PostSchedulerService.createPost(req.user._id, postData);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get all posts
schedulerRouter.get('/', async (req, res) => {
  try {
    const result = await PostSchedulerService.getPosts(req.user._id, req.query);
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get single post
schedulerRouter.get('/:id', async (req, res) => {
  try {
    const post = await PostSchedulerService.getPost(req.params.id, req.user._id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    res.json({ success: true, data: post });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Update post
schedulerRouter.put('/:id', async (req, res) => {
  try {
    const post = await PostSchedulerService.updatePost(req.params.id, req.user._id, req.body);
    res.json({ success: true, data: post });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Cancel scheduled post
schedulerRouter.post('/:id/cancel', async (req, res) => {
  try {
    const result = await PostSchedulerService.cancelPost(req.params.id, req.user._id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete post
schedulerRouter.delete('/:id', async (req, res) => {
  try {
    const result = await PostSchedulerService.deletePost(req.params.id, req.user._id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Publish immediately
schedulerRouter.post('/:id/publish', async (req, res) => {
  try {
    const result = await PostSchedulerService.publishPost(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Bulk schedule
schedulerRouter.post('/bulk/schedule', async (req, res) => {
  try {
    const { posts } = req.body;
    const result = await PostSchedulerService.bulkSchedule(req.user._id, posts);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Best time recommender
schedulerRouter.get('/best-times/:platform', (req, res) => {
  const { timezone, niche } = req.query;
  const result = PostSchedulerService.getBestTimes(req.params.platform, timezone, niche);
  res.json({ success: true, data: result });
});

// Analytics
schedulerRouter.get('/analytics/summary', async (req, res) => {
  try {
    const result = await PostSchedulerService.getAnalytics(req.user._id, +req.query.days || 30);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════
// 11. TELEGRAM ADVANCED ROUTES
// ══════════════════════════════════════════════════════════
const tgAdvRouter = express.Router();
tgAdvRouter.use(authenticate);
const TelegramAdvService = require('../../services/social/telegram-advanced.service');

// Scrape group members
tgAdvRouter.get('/scrape/members', async (req, res) => {
  try {
    const { accountId, group, limit, saveToCRM } = req.query;
    const result = await TelegramAdvService.scrapeGroupMembers(accountId, group, {
      limit: +limit || 200, saveToCRM: saveToCRM === 'true', userId: req.user._id,
    });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Mass DM members
tgAdvRouter.post('/dm/mass', async (req, res) => {
  try {
    const { accountId, members, message, options } = req.body;
    TelegramAdvService.massDMMembers(accountId, members, message, options || {})
      .then(r => console.log('TG mass DM done:', r))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: `TG mass DM started for ${members.length} members` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Post to channel
tgAdvRouter.post('/channel/post', async (req, res) => {
  try {
    const { accountId, channelId, content, options } = req.body;
    const result = await TelegramAdvService.postToChannel(accountId, channelId, content, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Broadcast to multiple channels
tgAdvRouter.post('/channel/broadcast', async (req, res) => {
  try {
    const { accountId, channelIds, content, options } = req.body;
    TelegramAdvService.broadcastToChannels(accountId, channelIds, content, options || {})
      .then(r => console.log('TG broadcast done:', r))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: `TG broadcast started to ${channelIds.length} channels` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Setup auto-forwarder
tgAdvRouter.post('/forwarder/setup', async (req, res) => {
  try {
    const { accountId, fromChannelId, toChannelIds, options } = req.body;
    const result = await TelegramAdvService.setupAutoForwarder(accountId, fromChannelId, toChannelIds, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create poll
tgAdvRouter.post('/poll', async (req, res) => {
  try {
    const { accountId, chatId, question, options: pollOptions, config } = req.body;
    const result = await TelegramAdvService.createPoll(accountId, chatId, question, pollOptions, config || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// View booster
tgAdvRouter.post('/views/boost', async (req, res) => {
  try {
    const { accountId, channelId, messageIds } = req.body;
    const result = await TelegramAdvService.boostViews(accountId, channelId, messageIds);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Join groups
tgAdvRouter.post('/groups/join', async (req, res) => {
  try {
    const { accountId, inviteLinks, options } = req.body;
    const result = await TelegramAdvService.joinGroups(accountId, inviteLinks, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Setup AI chatbot in group
tgAdvRouter.post('/chatbot/setup', async (req, res) => {
  try {
    const { accountId, groupId, options } = req.body;
    const result = await TelegramAdvService.setupGroupChatbot(accountId, groupId, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Message with inline buttons
tgAdvRouter.post('/message/buttons', async (req, res) => {
  try {
    const { accountId, chatId, text, buttons } = req.body;
    const result = await TelegramAdvService.sendMessageWithButtons(accountId, chatId, text, buttons);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Send media to many chats
tgAdvRouter.post('/media/bulk', async (req, res) => {
  try {
    const { accountId, chatIds, media, options } = req.body;
    TelegramAdvService.sendMediaBulk(accountId, chatIds, media, options || {})
      .then(r => console.log('TG media bulk done:', r))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: `TG media bulk started for ${chatIds.length} chats` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Channel stats
tgAdvRouter.get('/channel/stats', async (req, res) => {
  try {
    const { accountId, channelId } = req.query;
    const result = await TelegramAdvService.getChannelStats(accountId, channelId);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════
// 12. TWITTER ADVANCED ROUTES
// ══════════════════════════════════════════════════════════
const twitterAdvRouter = express.Router();
twitterAdvRouter.use(authenticate);
const TwitterAdvService = require('../../services/social/twitter-advanced.service');

// Post thread
twitterAdvRouter.post('/thread', async (req, res) => {
  try {
    const { accountId, tweets, options } = req.body;
    TwitterAdvService.postThread(accountId, tweets, options || {})
      .then(r => console.log('Thread posted:', r.threadUrl))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: `Thread of ${tweets.length} tweets started` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Start AI mention reply bot
twitterAdvRouter.post('/bot/mentions', async (req, res) => {
  try {
    const { accountId, options } = req.body;
    const result = await TwitterAdvService.startMentionReplyBot(accountId, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Keyword reply bot
twitterAdvRouter.post('/bot/keyword', async (req, res) => {
  try {
    const { accountId, keywords, replies, options } = req.body;
    const result = await TwitterAdvService.keywordReplyBot(accountId, keywords, replies, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Mass follow by keyword
twitterAdvRouter.post('/follow/keyword', async (req, res) => {
  try {
    const { accountId, keyword, options } = req.body;
    TwitterAdvService.massFollowByKeyword(accountId, keyword, options || {})
      .then(r => console.log('TW follow done:', r))
      .catch(e => console.error(e.message));
    res.json({ success: true, message: `Mass follow by keyword "${keyword}" started` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Unfollow inactive
twitterAdvRouter.post('/unfollow/inactive', async (req, res) => {
  try {
    const { accountId, options } = req.body;
    const result = await TwitterAdvService.unfollowInactive(accountId, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Scrape tweets
twitterAdvRouter.get('/scrape/tweets', async (req, res) => {
  try {
    const { accountId, query, limit, since, until, lang } = req.query;
    const result = await TwitterAdvService.scrapeTweets(accountId, query, { limit: +limit || 100, since, until, lang });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Export followers
twitterAdvRouter.get('/followers/export', async (req, res) => {
  try {
    const { accountId, username, limit } = req.query;
    const result = await TwitterAdvService.exportFollowers(accountId, username, { limit: +limit || 200 });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Delete old tweets
twitterAdvRouter.post('/tweets/delete-old', async (req, res) => {
  try {
    const { accountId, options } = req.body;
    const result = await TwitterAdvService.deleteOldTweets(accountId, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Get trending topics
twitterAdvRouter.get('/trends', async (req, res) => {
  try {
    const { accountId, woeid } = req.query;
    const result = await TwitterAdvService.getTrends(accountId, +woeid || 1);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Competitor tracker
twitterAdvRouter.post('/competitors/track', async (req, res) => {
  try {
    const { accountId, usernames, options } = req.body;
    const result = await TwitterAdvService.trackCompetitors(accountId, usernames, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Retweet + like campaign
twitterAdvRouter.post('/campaign/engage', async (req, res) => {
  try {
    const { accountId, tweetIds, options } = req.body;
    const result = await TwitterAdvService.retweetLikeCampaign(accountId, tweetIds, options || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create poll
twitterAdvRouter.post('/poll', async (req, res) => {
  try {
    const { accountId, question, choices, durationMinutes } = req.body;
    const result = await TwitterAdvService.createPoll(accountId, question, choices, durationMinutes);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Create list
twitterAdvRouter.post('/list', async (req, res) => {
  try {
    const { accountId, name, description, isPrivate } = req.body;
    const result = await TwitterAdvService.createList(accountId, name, description, isPrivate);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Add users to list
twitterAdvRouter.post('/list/:listId/members', async (req, res) => {
  try {
    const { accountId, userIds } = req.body;
    const result = await TwitterAdvService.addUsersToList(accountId, req.params.listId, userIds);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Bio rotator
twitterAdvRouter.post('/bio/rotate', async (req, res) => {
  try {
    const { accountId, bios, intervalHours } = req.body;
    const result = await TwitterAdvService.rotateBio(accountId, bios, (intervalHours || 24) * 3600000);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Schedule tweet / thread
twitterAdvRouter.post('/schedule', async (req, res) => {
  try {
    const { accountId, tweetData, scheduledAt } = req.body;
    const result = TwitterAdvService.scheduleTweet(accountId, tweetData, scheduledAt);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════
module.exports = {
  captionRoutes:     captionRouter,
  postSchedulerRoutes: schedulerRouter,
  tgAdvRoutes:       tgAdvRouter,
  twitterAdvRoutes:  twitterAdvRouter,
};
