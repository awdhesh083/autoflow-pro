'use strict';
const express = require('express');
const multer  = require('multer');
const { authenticate } = require('../../middleware/auth');
const LinkedInService = require('../../services/social/linkedin.service');

const router = express.Router();
router.use(authenticate);
const upload = multer({ dest: 'uploads/linkedin/' });

router.post('/login', async (req, res) => {
  const { accountId, email, password } = req.body;
  const result = await LinkedInService.login(accountId, email, password);
  res.json({ success: true, data: result });
});

router.post('/connect', async (req, res) => {
  const { accountId, profileUrls, message, options } = req.body;
  if (!profileUrls?.length) return res.status(400).json({ success: false, message: 'profileUrls required' });
  const result = await LinkedInService.sendConnectionRequests(accountId, profileUrls, { ...options, message });
  res.json({ success: true, data: result });
});

router.post('/dm', async (req, res) => {
  const { accountId, targets, message, options } = req.body;
  LinkedInService.sendMessages(accountId, targets, message, options || {})
    .catch(e => console.error(`LI DM error: ${e.message}`));
  res.json({ success: true, message: `DM campaign queued for ${targets?.length} recipients` });
});

router.post('/like/feed', async (req, res) => {
  const { accountId, options } = req.body;
  const result = await LinkedInService.autoLikeFeed(accountId, options);
  res.json({ success: true, data: result });
});

router.post('/like/keyword', async (req, res) => {
  const { accountId, keyword, options } = req.body;
  const result = await LinkedInService.autoLikeByKeyword(accountId, keyword, options);
  res.json({ success: true, data: result });
});

router.post('/comment', async (req, res) => {
  const { accountId, postUrls, comments, options } = req.body;
  const result = await LinkedInService.autoCommentOnPosts(accountId, postUrls, comments, options);
  res.json({ success: true, data: result });
});

router.post('/view-profiles', async (req, res) => {
  const { accountId, profileUrls, options } = req.body;
  const result = await LinkedInService.viewProfiles(accountId, profileUrls, options);
  res.json({ success: true, data: result });
});

router.get('/scrape/leads', async (req, res) => {
  const { accountId, query, limit, location, industry, title } = req.query;
  const result = await LinkedInService.scrapeLeadsBySearch(accountId, query, { limit: +limit, location, industry, title });
  res.json({ success: true, data: result });
});

router.get('/scrape/profile', async (req, res) => {
  const { accountId, profileUrl } = req.query;
  const result = await LinkedInService.scrapeProfile(accountId, profileUrl);
  res.json({ success: true, data: result });
});

router.post('/post', upload.single('image'), async (req, res) => {
  const { accountId, content, imageUrl, articleUrl } = req.body;
  const opts = { imageUrl: req.file?.path || imageUrl, articleUrl };
  const result = await LinkedInService.createPost(accountId, content, opts);
  res.json({ success: true, data: result });
});

router.get('/connections/export', async (req, res) => {
  const { accountId, limit } = req.query;
  const result = await LinkedInService.exportConnections(accountId, +limit);
  res.json({ success: true, data: result });
});

router.post('/skills/endorse', async (req, res) => {
  const { accountId, profileUrl, maxSkills } = req.body;
  const result = await LinkedInService.endorseSkills(accountId, profileUrl, maxSkills);
  res.json({ success: true, data: result });
});

router.post('/companies/follow', async (req, res) => {
  const { accountId, companyUrls, options } = req.body;
  const result = await LinkedInService.followCompanies(accountId, companyUrls, options);
  res.json({ success: true, data: result });
});

router.post('/leads/save', async (req, res) => {
  const { leads, listId } = req.body;
  const result = await LinkedInService.saveLeadsToContacts(leads, req.user._id, listId);
  res.json({ success: true, data: result });
});

router.delete('/disconnect/:accountId', async (req, res) => {
  await LinkedInService.disconnect(req.params.accountId);
  res.json({ success: true, message: 'LinkedIn disconnected' });
});

module.exports = router;
