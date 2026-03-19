'use strict';
const express = require('express');
const { body } = require('express-validator');
const { Contact, Campaign, Account, MessageLog } = require('../models');
const { authenticate, validate } = require('../middleware/auth');
const WhatsAppService = require('../services/whatsapp.service');
const { waQueue }     = require('../workers/campaign.worker');
const logger          = require('../utils/logger');

const router = express.Router();
router.use(authenticate);

// POST /init/:accountId - start WA client + QR
router.post('/init/:accountId', async (req, res) => {
  const account = await Account.findOne({ _id:req.params.accountId, userId:req.user._id });
  if (!account) return res.status(404).json({ success:false, message:'Account not found' });
  WhatsAppService.initClient(account).catch(err => logger.error(`WA init: ${err.message}`));
  res.json({ success:true, message:'WA client initializing. Listen to socket event "qr" for QR code.' });
});

// GET /status/:accountId
router.get('/status/:accountId', async (req, res) => {
  const status = WhatsAppService.getStatus(req.params.accountId);
  res.json({ success:true, status });
});

// GET /qr/:accountId
router.get('/qr/:accountId', async (req, res) => {
  const qr = WhatsAppService.getQRCode(req.params.accountId);
  if (!qr) return res.status(404).json({ success:false, message:'No QR available. Init client first.' });
  res.json({ success:true, qr });
});

// POST /send - single message
router.post('/send',
  [body('accountId').notEmpty(),body('to').notEmpty(),body('message').notEmpty()],
  validate,
  async (req, res) => {
    const { accountId, to, message, media } = req.body;
    const result = await WhatsAppService.sendMessage(accountId, to, message, { media });
    res.json({ success:true, data:result });
  }
);

// POST /broadcast - bulk send (queued)
router.post('/broadcast',
  [body('message').notEmpty()],
  validate,
  async (req, res) => {
    const { campaignName, contacts:phones, message, accountId, listId, options={} } = req.body;
    let contacts = [];
    if (phones?.length) {
      contacts = phones.map(p => ({ phone:p, name:'Friend', _id:null }));
    } else if (listId) {
      contacts = await Contact.find({ userId:req.user._id, lists:listId, status:'active', waEnabled:true });
    }
    if (!contacts.length) return res.status(400).json({ success:false, message:'No contacts provided' });

    const campaign = await Campaign.create({
      userId:  req.user._id,
      name:    campaignName || `WA Broadcast ${new Date().toLocaleDateString()}`,
      type:    'whatsapp',
      content: { body:message },
      audience:{ totalCount:contacts.length },
      status:  'running',
      settings:{ waAccountId:accountId, ...options },
    });
    const job = await waQueue.add('bulk-send', { campaignId:campaign._id.toString(), contacts, accountId }, { attempts:2, removeOnComplete:50 });
    await Campaign.findByIdAndUpdate(campaign._id, { jobId:job.id.toString() });
    res.json({ success:true, message:`Broadcast queued for ${contacts.length} contacts`, campaignId:campaign._id, jobId:job.id });
  }
);

// POST /check-numbers - validate WA registration
router.post('/check-numbers', async (req, res) => {
  const { phones, accountId } = req.body;
  const results = await WhatsAppService.validateNumbers(accountId, phones);
  res.json({ success:true, data:results });
});

// GET /auto-reply - list rules
router.get('/auto-reply', async (req, res) => {
  const { AutoReply } = require('../models');
  const rules = await AutoReply.find({ userId:req.user._id, platform:{ $in:['whatsapp','all'] } });
  res.json({ success:true, data:rules });
});

// POST /auto-reply - create rule
router.post('/auto-reply', async (req, res) => {
  const { AutoReply } = require('../models');
  const rule = await AutoReply.create({ ...req.body, userId:req.user._id, platform:'whatsapp' });
  res.status(201).json({ success:true, data:rule });
});

// DELETE /disconnect/:accountId
router.delete('/disconnect/:accountId', async (req, res) => {
  await WhatsAppService.disconnect(req.params.accountId);
  await Account.findByIdAndUpdate(req.params.accountId, { status:'disconnected' });
  res.json({ success:true, message:'WA account disconnected' });
});

module.exports = router;
