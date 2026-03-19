'use strict';
const express = require('express');
const { body } = require('express-validator');
const { Contact, Campaign, MessageLog, SmtpProfile, AnalyticsEvent } = require('../models');
const { authenticate, validate } = require('../middleware/auth');
const EmailService  = require('../services/email.service');
const { emailQueue } = require('../workers/campaign.worker');

const router = express.Router();
router.use(authenticate);

// POST /send - single email
router.post('/send',
  [body('to').notEmpty(),body('subject').notEmpty()],
  validate,
  async (req, res) => {
    const { to, subject, html, text, smtpProfileId } = req.body;
    const result = await EmailService.sendEmail({ to, from:process.env.SMTP_FROM_EMAIL, subject, html, text, smtpProfileId });
    res.json({ success:true, data:result });
  }
);

// POST /campaign - launch bulk email campaign (queued)
router.post('/campaign', async (req, res) => {
  const { name, subject, html, body:bodyText, toList, contacts:emails, fromEmail, fromName, smtpProfileId, options={} } = req.body;
  let contacts = [];
  if (emails?.length) contacts = emails.map(e => ({ email:e, name:'Friend', status:'active' }));
  else if (toList)   contacts = await Contact.find({ userId:req.user._id, lists:toList, status:'active', subscribed:true });
  if (!contacts.length) return res.status(400).json({ success:false, message:'No contacts provided' });

  const campaign = await Campaign.create({
    userId: req.user._id,
    name:   name || `Email Campaign ${new Date().toLocaleDateString()}`,
    type:  'email',
    content:{ subject, html:html||bodyText, body:bodyText||html },
    audience:{ totalCount:contacts.length },
    status: 'running',
    settings:{ smtpProfileId, fromEmail, fromName, ...options },
  });
  const job = await emailQueue.add('bulk-send', { campaignId:campaign._id.toString(), contacts }, { attempts:3, removeOnComplete:50 });
  res.json({ success:true, campaignId:campaign._id, jobId:job.id, recipients:contacts.length });
});

// POST /test - send test email
router.post('/test', async (req, res) => {
  const { to, smtpProfileId } = req.body;
  const result = await EmailService.sendTest(smtpProfileId, to||req.user.email);
  res.json({ success:true, data:result });
});

// SMTP Profiles
router.get('/smtp-profiles', async (req, res) => {
  const profiles = await SmtpProfile.find({ userId:req.user._id });
  res.json({ success:true, data:profiles });
});
router.post('/smtp-profiles', async (req, res) => {
  const profile  = await SmtpProfile.create({ ...req.body, userId:req.user._id });
  const verified = await EmailService.verifySmtp(profile);
  if (verified.success) await SmtpProfile.findByIdAndUpdate(profile._id, { isVerified:true, status:'active' });
  res.status(201).json({ success:true, data:profile, verified:verified.success });
});
router.delete('/smtp-profiles/:id', async (req, res) => {
  await SmtpProfile.findOneAndDelete({ _id:req.params.id, userId:req.user._id });
  res.json({ success:true, message:'SMTP profile deleted' });
});

// Unsubscribe page (no auth)
router.get('/unsubscribe/:trackingId', async (req, _res, next) => { next(); }, async (req, res) => {
  await EmailService.handleUnsubscribe(req.params.trackingId);
  res.send('<h1 style="font-family:sans-serif;text-align:center;margin-top:80px">&#10003; Unsubscribed successfully.</h1>');
});

// Open tracking pixel (no auth)
router.get('/track/open/:trackingId', async (req, res) => {
  const log = await MessageLog.findOneAndUpdate(
    { 'metadata.trackingId':req.params.trackingId, status:{ $ne:'opened' } },
    { status:'opened', openedAt:new Date() }
  );
  if (log) await AnalyticsEvent.create({ userId:log.userId, campaignId:log.campaignId, messageId:log._id, event:'opened', ip:req.ip }).catch(()=>{});
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');
  res.set('Content-Type','image/gif').send(pixel);
});

// Click tracking redirect (no auth)
router.get('/track/click/:trackingId/:linkIndex', async (req, res) => {
  const log = await MessageLog.findOne({ 'metadata.trackingId':req.params.trackingId });
  if (log) {
    const idx  = parseInt(req.params.linkIndex);
    const link = log.links?.[idx];
    if (link) {
      await MessageLog.findByIdAndUpdate(log._id, { $inc:{ [`links.${idx}.clicks`]:1 }, clickedAt:new Date(), status:'clicked' });
      await AnalyticsEvent.create({ userId:log.userId, campaignId:log.campaignId, event:'clicked' }).catch(()=>{});
      return res.redirect(link.original);
    }
  }
  res.redirect('/');
});

module.exports = router;
