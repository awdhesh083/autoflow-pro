'use strict';
const express = require('express');
const { body } = require('express-validator');
const { authenticate, validate } = require('../../middleware/auth');
const DiscordService = require('../../services/discord.service');

const router = express.Router();
router.use(authenticate);

// Init bot
router.post('/init', async (req, res) => {
  const { accountId, token, options } = req.body;
  if (!accountId || !token) return res.status(400).json({ success: false, message: 'accountId and token required' });
  await DiscordService.initBot(accountId, token, options || {});
  res.json({ success: true, message: 'Discord bot initializing...' });
});

// Send channel message
router.post('/message',
  [body('accountId').notEmpty(), body('channelId').notEmpty(), body('message').notEmpty()],
  validate,
  async (req, res) => {
    const { accountId, channelId, message, options } = req.body;
    const result = await DiscordService.sendChannelMessage(accountId, channelId, message, options || {});
    res.json({ success: true, data: result });
  }
);

// DM all server members
router.post('/dm/all', async (req, res) => {
  const { accountId, guildId, message, options } = req.body;
  if (!accountId || !guildId || !message) return res.status(400).json({ success: false, message: 'accountId, guildId, message required' });
  DiscordService.dmAllMembers(accountId, guildId, message, options || {})
    .then(r => console.log(`Discord DM all done: ${r.sent} sent`))
    .catch(e => console.error(`Discord DM error: ${e.message}`));
  res.json({ success: true, message: 'Discord DM campaign started' });
});

// Scrape members
router.post('/scrape/members', async (req, res) => {
  const { accountId, guildId, options } = req.body;
  const result = await DiscordService.scrapeMembers(accountId, guildId, req.user._id, options || {});
  res.json({ success: true, data: result });
});

// Webhook send
router.post('/webhook/send', async (req, res) => {
  const { webhookUrl, message, options } = req.body;
  if (!webhookUrl || !message) return res.status(400).json({ success: false, message: 'webhookUrl and message required' });
  const result = await DiscordService.sendViaWebhook(webhookUrl, message, options || {});
  res.json({ success: true, data: result });
});

// Webhook broadcast
router.post('/webhook/broadcast', async (req, res) => {
  const { webhookUrls, message, options } = req.body;
  if (!webhookUrls?.length) return res.status(400).json({ success: false, message: 'webhookUrls array required' });
  const results = await DiscordService.broadcastToWebhooks(webhookUrls, message, options || {});
  res.json({ success: true, data: results });
});

// Server stats
router.get('/stats/:accountId/:guildId', async (req, res) => {
  const stats = await DiscordService.getServerStats(req.params.accountId, req.params.guildId);
  res.json({ success: true, data: stats });
});

// Auto-reply rules
router.post('/auto-reply', async (req, res) => {
  const { accountId, guildId, rules } = req.body;
  if (!rules?.length) return res.status(400).json({ success: false, message: 'rules array required' });
  await DiscordService.setupAutoReply(accountId, guildId, rules);
  res.json({ success: true, message: `${rules.length} auto-reply rules set` });
});

// Disconnect bot
router.delete('/disconnect/:accountId', async (req, res) => {
  await DiscordService.disconnect(req.params.accountId);
  res.json({ success: true, message: 'Discord bot disconnected' });
});

module.exports = router;
