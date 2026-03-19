'use strict';
const express = require('express');
const { body } = require('express-validator');
const multer  = require('multer');
const csv     = require('csv-parser');
const fs      = require('fs');
const { Contact, ContactList } = require('../models');
const { authenticate, validate } = require('../middleware/auth');
const { msg } = require('../middleware/i18n');
const { cache } = require('../config/redis');

const router = express.Router();
router.use(authenticate);

const upload = multer({ dest: 'uploads/', limits: { fileSize: 20*1024*1024 } });

// GET / - list contacts (paginated + filtered + cached)
router.get('/', async (req, res) => {
  const { page=1, limit=50, search, tag, status, list } = req.query;
  const q = { userId: req.user._id };
  if (search) q.$or = [{ name:new RegExp(search,'i') },{ email:new RegExp(search,'i') },{ phone:new RegExp(search,'i') }];
  if (tag)    q.tags   = tag;
  if (status) q.status = status;
  if (list)   q.lists  = list;

  const cacheKey = `contacts:${req.user._id}:${JSON.stringify(q)}:${page}:${limit}`;
  const cached   = await cache.get(cacheKey).catch(()=>null);
  if (cached) return res.json(cached);

  const [contacts, total] = await Promise.all([
    Contact.find(q).skip((page-1)*+limit).limit(+limit).sort('-createdAt'),
    Contact.countDocuments(q),
  ]);
  const result = { success:true, data:contacts, total, page:+page, pages:Math.ceil(total/+limit) };
  await cache.set(cacheKey, result, 60).catch(()=>{});
  res.json(result);
});

// POST / - create single contact
router.post('/',
  [body('name').trim().notEmpty(),body('phone').optional(),body('email').optional().isEmail()],
  validate,
  async (req, res) => {
    const contact = await Contact.create({ ...req.body, userId:req.user._id });
    await cache.flush(`contacts:${req.user._id}:*`).catch(()=>{});
    res.status(201).json({ success:true, data:contact });
  }
);

// POST /bulk - create multiple contacts
router.post('/bulk', async (req, res) => {
  const { contacts } = req.body;
  if (!Array.isArray(contacts)||!contacts.length) return res.status(400).json({ success:false, message:'contacts array required' });
  const docs = contacts.map(c=>({ ...c, userId:req.user._id, source:'api' }));
  const result = await Contact.insertMany(docs, { ordered:false }).catch(e=>({ insertedCount:e.result?.nInserted||0 }));
  await cache.flush(`contacts:${req.user._id}:*`).catch(()=>{});
  res.status(201).json({ success:true, inserted:result.length||result.insertedCount });
});

// POST /import/csv - CSV bulk import
router.post('/import/csv', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success:false, message:'No file uploaded' });
  const contacts = [];
  const filePath = req.file.path;
  fs.createReadStream(filePath).pipe(require('csv-parser')())
    .on('data', row => {
      if (row.phone||row.email) {
        contacts.push({
          userId:  req.user._id,
          name:    row.name||row.Name||row.full_name||'',
          phone:   row.phone||row.Phone||row.mobile||row.Mobile||'',
          email:   row.email||row.Email||'',
          tags:    row.tags ? row.tags.split(',').map(t=>t.trim()) : [],
          company: row.company||row.Company||'',
          status:  'active', source:'import',
        });
      }
    })
    .on('end', async () => {
      try {
        await Contact.insertMany(contacts, { ordered:false });
        fs.unlinkSync(filePath);
        await cache.flush(`contacts:${req.user._id}:*`).catch(()=>{});
        res.json({ success:true, imported:contacts.length });
      } catch(err) { res.status(500).json({ success:false, message:err.message }); }
    });
});

// GET /export - CSV download
router.get('/export', async (req, res) => {
  const contacts = await Contact.find({ userId:req.user._id, status:'active' }).lean();
  const header   = 'name,phone,email,tags,company,status\n';
  const rows     = contacts.map(c=>`"${c.name}","${c.phone||''}","${c.email||''}","${(c.tags||[]).join('|')}","${c.company||''}","${c.status}"`).join('\n');
  res.set({ 'Content-Type':'text/csv', 'Content-Disposition':'attachment; filename="contacts.csv"' });
  res.send(header+rows);
});

// PUT /:id
router.put('/:id', async (req, res) => {
  const contact = await Contact.findOneAndUpdate({ _id:req.params.id, userId:req.user._id }, req.body, { new:true });
  if (!contact) return res.status(404).json({ success:false, message:msg(req,'contact_not_found') });
  await cache.flush(`contacts:${req.user._id}:*`).catch(()=>{});
  res.json({ success:true, data:contact });
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  await Contact.findOneAndDelete({ _id:req.params.id, userId:req.user._id });
  await cache.flush(`contacts:${req.user._id}:*`).catch(()=>{});
  res.json({ success:true, message:msg(req,'contact_deleted') });
});

// DELETE /bulk - delete multiple
router.delete('/bulk', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ success:false, message:'ids array required' });
  const result = await Contact.deleteMany({ _id:{ $in:ids }, userId:req.user._id });
  await cache.flush(`contacts:${req.user._id}:*`).catch(()=>{});
  res.json({ success:true, deleted:result.deletedCount });
});

// PATCH /bulk - bulk tag / status update
router.patch('/bulk', async (req, res) => {
  const { ids, update } = req.body;
  if (!Array.isArray(ids)||!update) return res.status(400).json({ success:false, message:'ids and update required' });
  const allowed = ['tags','status','subscribed'];
  const safe    = {};
  allowed.forEach(k => { if (update[k]!==undefined) safe[k]=update[k]; });
  await Contact.updateMany({ _id:{ $in:ids }, userId:req.user._id }, safe);
  await cache.flush(`contacts:${req.user._id}:*`).catch(()=>{});
  res.json({ success:true, updated:ids.length });
});

// Contact lists
router.get('/lists', async (req, res) => {
  const lists = await ContactList.find({ userId:req.user._id }).sort('-createdAt');
  res.json({ success:true, data:lists });
});
router.post('/lists', async (req, res) => {
  const list = await ContactList.create({ ...req.body, userId:req.user._id });
  res.status(201).json({ success:true, data:list });
});
router.put('/lists/:id', async (req, res) => {
  const list = await ContactList.findOneAndUpdate({ _id:req.params.id, userId:req.user._id }, req.body, { new:true });
  res.json({ success:true, data:list });
});
router.delete('/lists/:id', async (req, res) => {
  await ContactList.findOneAndDelete({ _id:req.params.id, userId:req.user._id });
  res.json({ success:true, message:'List deleted' });
});


// ═══════════════════════════════════════════════════════════
// ENGAGEMENT SCORING
// ═══════════════════════════════════════════════════════════

// GET /contacts/scoring/tiers — distribution of contacts per tier
router.get('/scoring/tiers', async (req, res) => {
  const EngagementScoring = require('../services/engagement.scoring');
  const tiers = EngagementScoring.TIER_LABELS;
  const breakdown = await Promise.all(
    tiers.map(async t => {
      const nextTier = tiers[tiers.indexOf(t) - 1];
      const min = t.min;
      const max = nextTier ? nextTier.min - 1 : 100;
      const count = await Contact.countDocuments({
        userId: req.user._id,
        score:  { $gte: min, $lte: max },
      });
      return { label: t.label, color: t.color, min, max, count };
    })
  );
  res.json({ success: true, data: breakdown });
});

// POST /contacts/scoring/recalculate — trigger batch re-score (async)
router.post('/scoring/recalculate', async (req, res) => {
  const EngagementScoring = require('../services/engagement.scoring');
  // Run async, don't wait
  EngagementScoring.scoreAllForUser(req.user._id)
    .then(r => require('../utils/logger').info(`Score complete: ${r.scored}/${r.total} contacts`))
    .catch(e => require('../utils/logger').error(`Score error: ${e.message}`));
  const total = await Contact.countDocuments({ userId: req.user._id });
  res.json({ success: true, message: `Scoring ${total} contacts in background…`, total });
});

// POST /contacts/:id/score — score one contact immediately
router.post('/:id/score', async (req, res) => {
  const contact = await Contact.findOne({ _id: req.params.id, userId: req.user._id });
  if (!contact) return res.status(404).json({ success: false, message: msg(req,'contact_not_found') });
  const EngagementScoring = require('../services/engagement.scoring');
  const result = await EngagementScoring.scoreContact(contact._id);
  res.json({ success: true, data: result });
});

// POST /contacts/scoring/apply-tags — tag all contacts with tier label
router.post('/scoring/apply-tags', async (req, res) => {
  const EngagementScoring = require('../services/engagement.scoring');
  await EngagementScoring.applyTierTags(req.user._id);
  res.json({ success: true, message: 'Tier tags applied to all contacts' });
});

module.exports = router;
