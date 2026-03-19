'use strict';
/**
 * Message Template Routes — /api/v1/templates
 * Save, browse, and apply reusable message templates across all platforms.
 */
const express = require('express');
const mongoose = require('mongoose');
const { body } = require('express-validator');
const { authenticate, validate } = require('../middleware/auth');
const { personalizeText } = require('../utils/helpers');

const router = express.Router();

// ── Template model ─────────────────────────────────────────────────────────
const templateSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:      { type: String, required: true, trim: true },
  platform:  { type: String, enum: ['whatsapp','email','sms','telegram','instagram','facebook','twitter','linkedin','discord','all'], default: 'all' },
  category:  { type: String, enum: ['promotional','transactional','support','welcome','followup','announcement','custom'], default: 'custom' },
  subject:   String,          // email subject line
  body:      { type: String, required: true },
  variables: [String],        // detected variable names like ['name','phone','link']
  isPublic:  { type: Boolean, default: false },
  usageCount:{ type: Number, default: 0 },
  tags:      [String],
}, { timestamps: true });

templateSchema.index({ userId: 1, platform: 1 });
templateSchema.index({ userId: 1, category: 1 });
templateSchema.index({ isPublic: 1, platform: 1 });

const Template = mongoose.models.MessageTemplate || mongoose.model('MessageTemplate', templateSchema);

// Detect [variable] placeholders in text
function extractVariables(text) {
  const matches = text.match(/\[([a-zA-Z_]+)\]/g) || [];
  return [...new Set(matches.map(m => m.slice(1, -1)))];
}

router.use(authenticate);

// ── List ───────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { platform, category, search, page = 1, limit = 50, includePublic } = req.query;
  const q = {};

  if (includePublic === 'true') {
    q.$or = [{ userId: req.user._id }, { isPublic: true }];
  } else {
    q.userId = req.user._id;
  }

  if (platform && platform !== 'all') q.platform = { $in: [platform, 'all'] };
  if (category) q.category = category;
  if (search) q.$text = { $search: search };

  const [templates, total] = await Promise.all([
    Template.find(q).sort('-updatedAt').skip((page - 1) * limit).limit(+limit),
    Template.countDocuments(q),
  ]);

  res.json({ success: true, data: templates, total, page: +page });
});

// ── Get single ────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const t = await Template.findOne({
    _id: req.params.id,
    $or: [{ userId: req.user._id }, { isPublic: true }],
  });
  if (!t) return res.status(404).json({ success: false, message: 'Template not found' });
  res.json({ success: true, data: t });
});

// ── Create ────────────────────────────────────────────────────────────────
router.post('/',
  [body('name').trim().notEmpty(), body('body').notEmpty()],
  validate,
  async (req, res) => {
    const { name, platform, category, subject, body: content, isPublic, tags } = req.body;
    const variables = extractVariables(content + (subject || ''));

    const t = await Template.create({
      userId: req.user._id,
      name, platform, category, subject, variables, isPublic, tags,
      body: content,
    });

    res.status(201).json({ success: true, data: t });
  }
);

// ── Update ────────────────────────────────────────────────────────────────
router.put('/:id',
  [body('name').optional().trim().notEmpty(), body('body').optional().notEmpty()],
  validate,
  async (req, res) => {
    const allowed = ['name', 'platform', 'category', 'subject', 'body', 'isPublic', 'tags'];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    if (update.body || update.subject)
      update.variables = extractVariables((update.body || '') + (update.subject || ''));

    const t = await Template.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      update, { new: true }
    );
    if (!t) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, data: t });
  }
);

// ── Delete ────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  await Template.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  res.json({ success: true, message: 'Template deleted' });
});

// ── Apply → personalize with contact data ────────────────────────────────
router.post('/:id/apply', async (req, res) => {
  const t = await Template.findOne({
    _id: req.params.id,
    $or: [{ userId: req.user._id }, { isPublic: true }],
  });
  if (!t) return res.status(404).json({ success: false, message: 'Template not found' });

  const vars = req.body.variables || {};  // { name: 'Priya', phone: '+91...', link: 'http...' }

  const personalizedBody    = personalizeText(t.body, vars);
  const personalizedSubject = t.subject ? personalizeText(t.subject, vars) : undefined;

  // Track usage
  Template.findByIdAndUpdate(t._id, { $inc: { usageCount: 1 } }).catch(() => {});

  res.json({
    success: true,
    data: {
      body:    personalizedBody,
      subject: personalizedSubject,
      template: { id: t._id, name: t.name },
      variablesApplied: Object.keys(vars),
    },
  });
});

// ── Duplicate ─────────────────────────────────────────────────────────────
router.post('/:id/duplicate', async (req, res) => {
  const t = await Template.findOne({
    _id: req.params.id,
    $or: [{ userId: req.user._id }, { isPublic: true }],
  });
  if (!t) return res.status(404).json({ success: false, message: 'Template not found' });

  const clone = await Template.create({
    userId:   req.user._id,
    name:     `${t.name} (copy)`,
    platform: t.platform, category: t.category, subject: t.subject,
    body: t.body, variables: t.variables, tags: t.tags, isPublic: false,
  });

  res.status(201).json({ success: true, data: clone });
});

// ── Categories + stats ────────────────────────────────────────────────────
router.get('/meta/stats', async (req, res) => {
  const [byPlatform, byCategory, total] = await Promise.all([
    Template.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
    ]),
    Template.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
    Template.countDocuments({ userId: req.user._id }),
  ]);
  res.json({ success: true, data: { total, byPlatform, byCategory } });
});

module.exports = router;
