'use strict';
/**
 * Twitter / X Routes  —  /api/v1/twitter
 * Covers: tweet, thread, auto-RT, DM, follow, monitor, reply bots,
 *         competitor tracking, polls, lists, trends, bulk delete
 */
const express = require('express');
const { body } = require('express-validator');
const { authenticate, validate } = require('../../middleware/auth');
const TwitterService = require('../../services/social/twitter-advanced.service');

const router = express.Router();
router.use(authenticate);

// ── Single tweet ───────────────────────────────────────────────────────────
router.post('/tweet',
  [body('accountId').notEmpty(), body('text').notEmpty().isLength({ max: 280 })],
  validate,
  async (req, res) => {
    const { accountId, text, options } = req.body;
    const client = await TwitterService._getClientV2(accountId);
    const tweet  = await client.v2.tweet(text, options);
    res.json({ success: true, data: { id: tweet.data.id, text: tweet.data.text } });
  }
);

// ── Thread ─────────────────────────────────────────────────────────────────
router.post('/thread', async (req, res) => {
  const { accountId, tweets, options } = req.body;
  if (!tweets?.length) return res.status(400).json({ success: false, message: 'tweets array required' });
  const result = await TwitterService.postThread(accountId, tweets, options || {});
  res.json({ success: true, data: result });
});

// ── Auto-retweet + like campaign ──────────────────────────────────────────
router.post('/campaign/engage', async (req, res) => {
  const { accountId, tweetIds, options } = req.body;
  const result = await TwitterService.retweetLikeCampaign(accountId, tweetIds, options);
  res.json({ success: true, data: result });
});

// ── DM ─────────────────────────────────────────────────────────────────────
router.post('/dm', async (req, res) => {
  const { accountId, recipientId, message } = req.body;
  const client = await TwitterService._getClientV2(accountId);
  const result = await client.v2.sendDmToParticipant(recipientId, { text: message });
  res.json({ success: true, data: result });
});

// ── Follow by keyword ─────────────────────────────────────────────────────
router.post('/follow/keyword', async (req, res) => {
  const { accountId, keyword, options } = req.body;
  const result = await TwitterService.massFollowByKeyword(accountId, keyword, options);
  res.json({ success: true, data: result });
});

// ── Unfollow inactive ─────────────────────────────────────────────────────
router.post('/unfollow/inactive', async (req, res) => {
  const { accountId, options } = req.body;
  const result = await TwitterService.unfollowInactive(accountId, options);
  res.json({ success: true, data: result });
});

// ── Mention reply bot ─────────────────────────────────────────────────────
router.post('/bot/mentions', async (req, res) => {
  const { accountId, options } = req.body;
  TwitterService.startMentionReplyBot(accountId, options || {})
    .catch(e => console.error(`Twitter mention bot error: ${e.message}`));
  res.json({ success: true, message: 'Mention reply bot started' });
});

// ── Keyword reply bot ─────────────────────────────────────────────────────
router.post('/bot/keyword', async (req, res) => {
  const { accountId, keywords, replies, options } = req.body;
  TwitterService.keywordReplyBot(accountId, keywords, replies, options || {})
    .catch(e => console.error(`Twitter keyword bot error: ${e.message}`));
  res.json({ success: true, message: 'Keyword reply bot started' });
});

// ── Scrape tweets ─────────────────────────────────────────────────────────
router.get('/scrape/tweets', async (req, res) => {
  const { accountId, query, limit, sinceDays } = req.query;
  const result = await TwitterService.scrapeTweets(accountId, query, { limit: +limit, sinceDays: +sinceDays });
  res.json({ success: true, data: result });
});

// ── Export followers ──────────────────────────────────────────────────────
router.get('/followers/export', async (req, res) => {
  const { accountId, username, limit } = req.query;
  const result = await TwitterService.exportFollowers(accountId, username, { limit: +limit });
  res.json({ success: true, data: result });
});

// ── Delete old tweets ─────────────────────────────────────────────────────
router.post('/tweets/delete-old', async (req, res) => {
  const { accountId, options } = req.body;
  const result = await TwitterService.deleteOldTweets(accountId, options);
  res.json({ success: true, data: result });
});

// ── Trends ────────────────────────────────────────────────────────────────
router.get('/trends', async (req, res) => {
  const { accountId, woeid = 1 } = req.query;
  const result = await TwitterService.getTrends(accountId, +woeid);
  res.json({ success: true, data: result });
});

// ── Competitor tracking ───────────────────────────────────────────────────
router.post('/competitors/track', async (req, res) => {
  const { accountId, usernames, options } = req.body;
  const result = await TwitterService.trackCompetitors(accountId, usernames, options);
  res.json({ success: true, data: result });
});

// ── Poll ──────────────────────────────────────────────────────────────────
router.post('/poll', async (req, res) => {
  const { accountId, question, choices, durationMinutes } = req.body;
  const result = await TwitterService.createPoll(accountId, question, choices, durationMinutes);
  res.json({ success: true, data: result });
});

// ── Lists ─────────────────────────────────────────────────────────────────
router.post('/list', async (req, res) => {
  const { accountId, name, description, isPrivate } = req.body;
  const result = await TwitterService.createList(accountId, name, description, isPrivate);
  res.json({ success: true, data: result });
});
router.post('/list/:listId/members', async (req, res) => {
  const { accountId, userIds } = req.body;
  const result = await TwitterService.addUsersToList(accountId, req.params.listId, userIds);
  res.json({ success: true, data: result });
});

// ── Bio rotation ──────────────────────────────────────────────────────────
router.post('/bio/rotate', async (req, res) => {
  const { accountId, bios } = req.body;
  if (!bios?.length) return res.status(400).json({ success: false, message: 'bios array required' });
  const client = await TwitterService._getClientV2(accountId);
  const randomBio = bios[Math.floor(Math.random() * bios.length)];
  await client.v1.updateAccountProfile({ description: randomBio });
  res.json({ success: true, message: 'Bio rotated', bio: randomBio });
});

module.exports = router;
