'use strict';
const express = require('express');
const { Campaign, AutoReply } = require('../models');
const { authenticate } = require('../middleware/auth');
const SocialService = require('../services/social.service');

const router = express.Router();
router.use(authenticate);

// POST /post - post to any platform
router.post('/post', async (req, res) => {
  const { platform, accountId, text, media, scheduled } = req.body;
  if (!platform||!accountId) return res.status(400).json({ success:false, message:'platform and accountId required' });

  if (scheduled) {
    const campaign = await Campaign.create({
      userId:   req.user._id,
      name:     `${platform} Post ${new Date().toLocaleDateString()}`,
      type:     platform,
      content:  { body:text, media:media||[] },
      status:   'scheduled',
      schedule: { sendAt:new Date(scheduled) },
    });
    return res.json({ success:true, message:'Post scheduled', data:campaign });
  }

  const result = await SocialService.post(platform, accountId, { text, media });
  res.json({ success:true, data:result });
});

// Auto-reply rules
router.get('/auto-reply', async (req, res) => {
  const rules = await AutoReply.find({ userId:req.user._id });
  res.json({ success:true, data:rules });
});
router.post('/auto-reply', async (req, res) => {
  const rule = await AutoReply.create({ ...req.body, userId:req.user._id });
  res.status(201).json({ success:true, data:rule });
});
router.put('/auto-reply/:id', async (req, res) => {
  const rule = await AutoReply.findOneAndUpdate({ _id:req.params.id, userId:req.user._id }, req.body, { new:true });
  res.json({ success:true, data:rule });
});
router.delete('/auto-reply/:id', async (req, res) => {
  await AutoReply.findOneAndDelete({ _id:req.params.id, userId:req.user._id });
  res.json({ success:true, message:'Rule deleted' });
});

module.exports = router;
