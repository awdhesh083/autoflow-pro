'use strict';
const express = require('express');
const multer  = require('multer');
const { authenticate } = require('../../middleware/auth');
const FacebookService = require('../../services/facebook.service');

const router = express.Router();
router.use(authenticate);
const upload = multer({ dest: 'uploads/fb/', limits: { fileSize: 100 * 1024 * 1024 } });

router.post('/login', async (req, res) => {
  const { accountId, email, password } = req.body;
  const result = await FacebookService.login(accountId, email, password);
  res.json({ success: true, data: result });
});

// Groups
router.post('/groups/post', async (req, res) => {
  const { accountId, groupUrls, message, options = {} } = req.body;
  if (!groupUrls?.length) return res.status(400).json({ success: false, message: 'groupUrls required' });
  FacebookService.postToGroups(accountId, groupUrls, message, options)
    .then(r => console.log(`FB groups: ${r.posted} posted`))
    .catch(e => console.error(`FB groups error: ${e.message}`));
  res.json({ success: true, message: `Posting to ${groupUrls.length} groups started`, queued: groupUrls.length });
});

router.get('/groups/members', async (req, res) => {
  const { accountId, groupUrl, limit = 100 } = req.query;
  const members = await FacebookService.scrapeGroupMembers(accountId, groupUrl, +limit);
  res.json({ success: true, data: members, count: members.length });
});

// Marketplace
router.post('/marketplace/post', async (req, res) => {
  const { accountId, listing } = req.body;
  const result = await FacebookService.postMarketplace(accountId, listing);
  res.json({ success: true, data: result });
});

// Friends
router.post('/friends/add', async (req, res) => {
  const { accountId, profileUrls, options } = req.body;
  const result = await FacebookService.sendFriendRequests(accountId, profileUrls, options);
  res.json({ success: true, data: result });
});

// Events
router.post('/events/invite', async (req, res) => {
  const { accountId, eventUrl, options } = req.body;
  const result = await FacebookService.inviteToEvent(accountId, eventUrl, options);
  res.json({ success: true, data: result });
});

router.delete('/disconnect/:accountId', async (req, res) => {
  await FacebookService.disconnect(req.params.accountId);
  res.json({ success: true, message: 'Facebook disconnected' });
});

module.exports = router;
