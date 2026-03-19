'use strict';
const express = require('express');
const multer  = require('multer');
const { authenticate } = require('../../middleware/auth');
const TelegramAdv = require('../../services/social/telegram-advanced.service');

const router = express.Router();
router.use(authenticate);
const upload = multer({ dest: 'uploads/telegram/' });

router.get('/scrape/members', async (req, res) => {
  const { accountId, groupUsername, limit, saveToList } = req.query;
  const result = await TelegramAdv.scrapeGroupMembers(accountId, groupUsername, { limit: +limit, saveToList });
  res.json({ success: true, data: result });
});

router.post('/dm/bulk', async (req, res) => {
  const { accountId, members, message, options } = req.body;
  if (!members?.length) return res.status(400).json({ success: false, message: 'members array required' });
  TelegramAdv.massDMMembers(accountId, members, message, options || {})
    .catch(e => console.error(`TG bulk DM error: ${e.message}`));
  res.json({ success: true, message: `TG DM campaign queued for ${members.length} members` });
});

router.post('/channel/post', upload.single('media'), async (req, res) => {
  const { accountId, channelId, text, parseMode, disablePreview, pinMessage } = req.body;
  const options = { parseMode, disablePreview: disablePreview === 'true', pinMessage: pinMessage === 'true' };
  if (req.file) options.mediaPath = req.file.path;
  const result = await TelegramAdv.postToChannel(accountId, channelId, { text, ...options }, options);
  res.json({ success: true, data: result });
});

router.post('/forward/setup', async (req, res) => {
  const { accountId, fromChannelId, toChannelIds, options } = req.body;
  const result = await TelegramAdv.setupAutoForwarder(accountId, fromChannelId, toChannelIds, options);
  res.json({ success: true, data: result });
});

router.post('/poll', async (req, res) => {
  const { accountId, chatId, question, options: pollOptions, config } = req.body;
  const result = await TelegramAdv.createPoll(accountId, chatId, question, pollOptions, config);
  res.json({ success: true, data: result });
});

router.post('/views/boost', async (req, res) => {
  const { accountId, channelId, messageIds } = req.body;
  const result = await TelegramAdv.boostViews(accountId, channelId, messageIds);
  res.json({ success: true, data: result });
});

router.post('/groups/join', async (req, res) => {
  const { accountId, inviteLinks, options } = req.body;
  const result = await TelegramAdv.joinGroups(accountId, inviteLinks, options);
  res.json({ success: true, data: result });
});

router.post('/channel/broadcast', async (req, res) => {
  const { accountId, channelIds, content, options } = req.body;
  const result = await TelegramAdv.broadcastToChannels(accountId, channelIds, content, options);
  res.json({ success: true, data: result });
});

router.post('/message/buttons', async (req, res) => {
  const { accountId, chatId, text, buttonRows } = req.body;
  const result = await TelegramAdv.sendMessageWithButtons(accountId, chatId, text, buttonRows);
  res.json({ success: true, data: result });
});

router.post('/media/bulk', upload.single('media'), async (req, res) => {
  const { accountId, chatIds, mediaConfig, options } = req.body;
  const cfg = req.file ? { ...JSON.parse(mediaConfig || '{}'), localPath: req.file.path } : JSON.parse(mediaConfig || '{}');
  const result = await TelegramAdv.sendMediaBulk(accountId, JSON.parse(chatIds), cfg, options ? JSON.parse(options) : {});
  res.json({ success: true, data: result });
});

module.exports = router;
