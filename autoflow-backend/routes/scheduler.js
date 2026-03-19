'use strict';
const express = require('express');
const { Campaign } = require('../models');
const { authenticate } = require('../middleware/auth');
const nodeCron = require('node-cron');
const { waQueue, emailQueue, smsQueue } = require('../workers/campaign.worker');
const logger = require('../utils/logger');

// Start the scheduler cron once on module load
let cronStarted = false;
function startSchedulerCron() {
  if (cronStarted) return;
  cronStarted = true;
  nodeCron.schedule('* * * * *', async () => {
    try {
      const now      = new Date();
      const overdue  = await Campaign.find({ status:'scheduled', 'schedule.sendAt':{ $lte:now } });
      for (const campaign of overdue) {
        const queueMap = { whatsapp:waQueue, email:emailQueue, sms:smsQueue };
        const queue    = queueMap[campaign.type] || emailQueue;
        const job      = await queue.add('bulk-send', { campaignId:campaign._id.toString() }, { attempts:3 });
        await Campaign.findByIdAndUpdate(campaign._id, { status:'running', jobId:job.id.toString() });
        logger.info(`Scheduler launched campaign ${campaign._id} (${campaign.type})`);
      }
    } catch (err) { logger.error(`Scheduler cron error: ${err.message}`); }
  });
  logger.info('Campaign scheduler cron started (1-min interval)');
}
startSchedulerCron();

const router = express.Router();
router.use(authenticate);

// GET /queue - scheduled campaigns
router.get('/queue', async (req, res) => {
  const campaigns = await Campaign.find({ userId:req.user._id, status:{ $in:['scheduled','running'] } }).sort('schedule.sendAt');
  res.json({ success:true, data:campaigns });
});

// GET /calendar - posts for calendar view
router.get('/calendar', async (req, res) => {
  const { month, year } = req.query;
  const m    = parseInt(month)||new Date().getMonth()+1;
  const y    = parseInt(year)||new Date().getFullYear();
  const from = new Date(y, m-1, 1);
  const to   = new Date(y, m, 0, 23, 59, 59);
  const campaigns = await Campaign.find({ userId:req.user._id, 'schedule.sendAt':{ $gte:from, $lte:to } }).sort('schedule.sendAt');
  res.json({ success:true, data:campaigns });
});

// POST /schedule/:campaignId
router.post('/schedule/:campaignId', async (req, res) => {
  const { sendAt, timezone, recurring } = req.body;
  if (!sendAt) return res.status(400).json({ success:false, message:'sendAt required' });
  const campaign = await Campaign.findOneAndUpdate(
    { _id:req.params.campaignId, userId:req.user._id },
    { status:'scheduled', schedule:{ sendAt:new Date(sendAt), timezone, recurring } },
    { new:true }
  );
  if (!campaign) return res.status(404).json({ success:false, message:'Campaign not found' });
  res.json({ success:true, data:campaign, message:`Scheduled for ${new Date(sendAt).toLocaleString()}` });
});

// DELETE /schedule/:campaignId - cancel
router.delete('/schedule/:campaignId', async (req, res) => {
  const campaign = await Campaign.findOneAndUpdate(
    { _id:req.params.campaignId, userId:req.user._id, status:'scheduled' },
    { status:'draft', schedule:null },
    { new:true }
  );
  if (!campaign) return res.status(404).json({ success:false, message:'Scheduled campaign not found' });
  res.json({ success:true, message:'Schedule cancelled', data:campaign });
});

module.exports = router;
