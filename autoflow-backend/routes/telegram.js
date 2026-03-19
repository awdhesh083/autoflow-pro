'use strict';
const express = require('express');
const { body } = require('express-validator');
const { authenticate, validate } = require('../middleware/auth');
const TelegramService = require('../services/telegram.service');

const router = express.Router();
router.use(authenticate);

const delay = ms => new Promise(r => setTimeout(r, ms));

// POST /send - single message
router.post('/send',
  [body('chatId').notEmpty(), body('message').notEmpty()],
  validate,
  async (req, res) => {
    const { chatId, message, parseMode='HTML' } = req.body;
    const result = await TelegramService.sendMessage(chatId, message, { parse_mode:parseMode });
    res.json({ success:true, data:result });
  }
);

// POST /broadcast - send to multiple chats with delay
router.post('/broadcast', async (req, res) => {
  const { chatIds, message, delayMs=500 } = req.body;
  if (!Array.isArray(chatIds)||!message) return res.status(400).json({ success:false, message:'chatIds[] and message required' });
  const results = [];
  for (const chatId of chatIds) {
    const r = await TelegramService.sendMessage(chatId, message).catch(e => ({ error:e.message }));
    results.push({ chatId, ...r });
    await delay(delayMs);
  }
  res.json({ success:true, data:results, sent:results.filter(r=>!r.error).length, failed:results.filter(r=>r.error).length });
});

// POST /photo - send photo
router.post('/photo', async (req, res) => {
  const { chatId, photoUrl, caption } = req.body;
  const result = await TelegramService.sendPhoto(chatId, photoUrl, caption);
  res.json({ success:true, data:result });
});

// POST /broadcast-channels - broadcast to multiple channels
router.post('/broadcast-channels', async (req, res) => {
  const { channels, message } = req.body;
  const results = await TelegramService.broadcastToChannels(channels, message);
  res.json({ success:true, data:results });
});

// POST /setup-auto-reply
router.post('/setup-auto-reply', async (req, res) => {
  TelegramService.setupAutoReply(async (from, text, platform) => {
    const { AutoReplyService } = require('../services');
    return AutoReplyService.process(null, from, text, platform);
  });
  res.json({ success:true, message:'Auto-reply handler attached to Telegram bot' });
});

module.exports = router;
