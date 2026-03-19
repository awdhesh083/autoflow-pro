'use strict';
const express = require('express');
const { Account, SimAccount } = require('../models');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const { platform } = req.query;
  const q = { userId:req.user._id };
  if (platform) q.platform = platform;
  const accounts = await Account.find(q).select('-credentials.password -credentials.sessionData');
  res.json({ success:true, data:accounts });
});

router.post('/', async (req, res) => {
  const account = await Account.create({ ...req.body, userId:req.user._id });
  res.status(201).json({ success:true, data:account });
});

router.put('/:id', async (req, res) => {
  const account = await Account.findOneAndUpdate({ _id:req.params.id, userId:req.user._id }, req.body, { new:true });
  if (!account) return res.status(404).json({ success:false, message:'Account not found' });
  res.json({ success:true, data:account });
});

router.delete('/:id', async (req, res) => {
  await Account.findOneAndDelete({ _id:req.params.id, userId:req.user._id });
  res.json({ success:true, message:'Account removed' });
});

// Health check all accounts
router.post('/health-check', async (req, res) => {
  const accounts = await Account.find({ userId:req.user._id });
  const results  = [];
  for (const acc of accounts) {
    let health = 100;
    const pct  = acc.limits?.dailySent / (acc.limits?.dailyLimit || 1000);
    if (pct > 0.9) health = 60;
    if (pct > 1)   health = 20;
    if (acc.status === 'blocked') health = 0;
    await Account.findByIdAndUpdate(acc._id, { health });
    results.push({ id:acc._id, platform:acc.platform, health, status:acc.status });
  }
  res.json({ success:true, data:results });
});

// SIM accounts
router.get('/sims', async (req, res) => {
  const sims = await SimAccount.find({ userId:req.user._id });
  res.json({ success:true, data:sims });
});
router.post('/sims', async (req, res) => {
  const sim = await SimAccount.create({ ...req.body, userId:req.user._id });
  res.status(201).json({ success:true, data:sim });
});
router.post('/sims/:id/rotate', async (req, res) => {
  const sim = await SimAccount.findOneAndUpdate(
    { _id:req.params.id, userId:req.user._id },
    { status:'rotating', lastUsed:new Date(), $inc:{ useCount:1 } },
    { new:true }
  );
  if (!sim) return res.status(404).json({ success:false, message:'SIM not found' });
  // Restore after 5s (real impl: call provider API)
  setTimeout(async () => { await SimAccount.findByIdAndUpdate(sim._id, { status:'active' }); }, 5000);
  res.json({ success:true, message:'SIM rotation initiated', data:sim });
});

module.exports = router;
