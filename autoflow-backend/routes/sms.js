'use strict';
const express = require('express');
const { body } = require('express-validator');
const { Contact, Campaign } = require('../models');
const { authenticate, validate } = require('../middleware/auth');
const SmsService  = require('../services/sms.service');
const { smsQueue } = require('../workers/campaign.worker');

const router = express.Router();
router.use(authenticate);

// POST /send - single SMS
router.post('/send',
  [body('to').notEmpty(),body('message').notEmpty()],
  validate,
  async (req, res) => {
    const { to, message, from } = req.body;
    const result = await SmsService.send(to, message, from);
    res.json({ success:true, data:result });
  }
);

// POST /bulk - bulk SMS campaign (queued)
router.post('/bulk', async (req, res) => {
  const { phones, message, listId } = req.body;
  if (!message) return res.status(400).json({ success:false, message:'message required' });
  let contacts = [];
  if (phones?.length) contacts = phones.map(p => ({ phone:p, name:'User', status:'active' }));
  else if (listId)   contacts = await Contact.find({ userId:req.user._id, lists:listId, status:'active' });
  if (!contacts.length) return res.status(400).json({ success:false, message:'No contacts provided' });

  const campaign = await Campaign.create({
    userId:  req.user._id,
    name:    `SMS Bulk ${new Date().toLocaleDateString()}`,
    type:    'sms',
    content: { body:message },
    audience:{ totalCount:contacts.length },
    status:  'running',
  });
  const job = await smsQueue.add('bulk-send', { campaignId:campaign._id.toString(), contacts }, { attempts:2 });
  res.json({ success:true, campaignId:campaign._id, jobId:job.id, recipients:contacts.length });
});

// Twilio inbound webhook (no auth)
router.post('/webhook/twilio', async (req, res) => {
  const { From, Body, MessageSid } = req.body;
  const { MessageLog } = require('../models');
  await MessageLog.create({ platform:'sms', direction:'inbound', from:From, body:Body, externalId:MessageSid }).catch(()=>{});
  res.set('Content-Type','text/xml').send('<?xml version="1.0"?><Response></Response>');
});

module.exports = router;
