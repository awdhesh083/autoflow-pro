'use strict';
/**
 * Contact Segments — /api/v1/segments
 * Dynamic smart lists built from filter rules applied to the Contact collection.
 */
const express   = require('express');
const mongoose  = require('mongoose');
const { body }  = require('express-validator');
const { authenticate, validate } = require('../middleware/auth');
const { Contact } = require('../models');

const router = express.Router();

// ── Segment model ──────────────────────────────────────────────────────────
const segmentSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:      { type: String, required: true, trim: true },
  description: String,
  isDynamic: { type: Boolean, default: true },
  rules: [{
    field:    { type: String, required: true },   // 'score', 'tags', 'platform', 'status', 'lastContacted', etc.
    operator: { type: String, enum: ['eq','neq','gt','gte','lt','lte','contains','notContains','exists','notExists'] },
    value:    mongoose.Schema.Types.Mixed,
  }],
  logic:    { type: String, enum: ['AND', 'OR'], default: 'AND' },
  contactCount: { type: Number, default: 0 },
  lastEvaluated: Date,
  color:    { type: String, default: '#00d4ff' },
}, { timestamps: true });

const Segment = mongoose.models.ContactSegment || mongoose.model('ContactSegment', segmentSchema);

// ── Build MongoDB query from rules ─────────────────────────────────────────
function buildQuery(userId, rules, logic) {
  const conditions = rules.map(rule => {
    const { field, operator, value } = rule;
    switch (operator) {
      case 'eq':          return { [field]: value };
      case 'neq':         return { [field]: { $ne: value } };
      case 'gt':          return { [field]: { $gt: value } };
      case 'gte':         return { [field]: { $gte: value } };
      case 'lt':          return { [field]: { $lt: value } };
      case 'lte':         return { [field]: { $lte: value } };
      case 'contains':    return { [field]: Array.isArray(value) ? { $in: value } : { $regex: value, $options: 'i' } };
      case 'notContains': return { [field]: Array.isArray(value) ? { $nin: value } : { $not: { $regex: value, $options: 'i' } } };
      case 'exists':      return { [field]: { $exists: true, $ne: null } };
      case 'notExists':   return { [field]: { $exists: false } };
      default:            return {};
    }
  }).filter(c => Object.keys(c).length > 0);

  if (!conditions.length) return { userId };

  const logicKey = logic === 'OR' ? '$or' : '$and';
  return { userId, [logicKey]: conditions };
}

router.use(authenticate);

// ── List segments ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const segments = await Segment.find({ userId: req.user._id }).sort('-updatedAt');
  res.json({ success: true, data: segments });
});

// ── Get segment + preview contacts ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const seg = await Segment.findOne({ _id: req.params.id, userId: req.user._id });
  if (!seg) return res.status(404).json({ success: false, message: 'Segment not found' });
  res.json({ success: true, data: seg });
});

// ── Get contacts in a segment ─────────────────────────────────────────────
router.get('/:id/contacts', async (req, res) => {
  const seg = await Segment.findOne({ _id: req.params.id, userId: req.user._id });
  if (!seg) return res.status(404).json({ success: false, message: 'Segment not found' });

  const { page = 1, limit = 50 } = req.query;
  const query = buildQuery(req.user._id, seg.rules, seg.logic);

  const [contacts, total] = await Promise.all([
    Contact.find(query).skip((page - 1) * limit).limit(+limit).select('name email phone tags status score platform'),
    Contact.countDocuments(query),
  ]);

  res.json({ success: true, data: contacts, total, page: +page });
});

// ── Preview contacts (without saving segment) ─────────────────────────────
router.post('/preview', async (req, res) => {
  const { rules = [], logic = 'AND' } = req.body;
  const query = buildQuery(req.user._id, rules, logic);
  const [contacts, total] = await Promise.all([
    Contact.find(query).limit(20).select('name email phone tags status score platform'),
    Contact.countDocuments(query),
  ]);
  res.json({ success: true, data: contacts, total });
});

// ── Create ────────────────────────────────────────────────────────────────
router.post('/',
  [body('name').trim().notEmpty(), body('rules').isArray({ min: 1 })],
  validate,
  async (req, res) => {
    const { name, description, rules, logic, isDynamic, color } = req.body;

    // Evaluate count immediately
    const query = buildQuery(req.user._id, rules, logic || 'AND');
    const contactCount = await Contact.countDocuments(query);

    const seg = await Segment.create({
      userId: req.user._id, name, description, rules, logic, isDynamic,
      color, contactCount, lastEvaluated: new Date(),
    });

    res.status(201).json({ success: true, data: seg });
  }
);

// ── Update ────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const allowed = ['name', 'description', 'rules', 'logic', 'isDynamic', 'color'];
  const update  = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

  if (update.rules) {
    const query = buildQuery(req.user._id, update.rules, update.logic || 'AND');
    update.contactCount   = await Contact.countDocuments(query);
    update.lastEvaluated  = new Date();
  }

  const seg = await Segment.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    update, { new: true }
  );
  if (!seg) return res.status(404).json({ success: false, message: 'Segment not found' });
  res.json({ success: true, data: seg });
});

// ── Delete ────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  await Segment.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  res.json({ success: true, message: 'Segment deleted' });
});

// ── Re-evaluate (manual refresh count) ───────────────────────────────────
router.post('/:id/evaluate', async (req, res) => {
  const seg = await Segment.findOne({ _id: req.params.id, userId: req.user._id });
  if (!seg) return res.status(404).json({ success: false, message: 'Segment not found' });

  const query        = buildQuery(req.user._id, seg.rules, seg.logic);
  const contactCount = await Contact.countDocuments(query);

  await Segment.findByIdAndUpdate(seg._id, { contactCount, lastEvaluated: new Date() });
  res.json({ success: true, data: { contactCount, lastEvaluated: new Date() } });
});

// ── Export segment contacts to campaign audience ──────────────────────────
router.post('/:id/export-to-campaign', async (req, res) => {
  const seg = await Segment.findOne({ _id: req.params.id, userId: req.user._id });
  if (!seg) return res.status(404).json({ success: false, message: 'Segment not found' });

  const query    = buildQuery(req.user._id, seg.rules, seg.logic);
  const contacts = await Contact.find(query).select('_id').lean();
  const ids      = contacts.map(c => c._id);

  res.json({ success: true, data: { contactIds: ids, count: ids.length, segmentName: seg.name } });
});

// ── Built-in segment templates ────────────────────────────────────────────
router.get('/meta/templates', (_req, res) => {
  res.json({ success: true, data: [
    { name: 'VIP contacts',       rules: [{ field: 'tags', operator: 'contains', value: 'VIP' }],               logic: 'AND', color: '#f59e0b' },
    { name: 'High engagement',    rules: [{ field: 'score', operator: 'gte', value: 80 }],                      logic: 'AND', color: '#10b981' },
    { name: 'WA contacts only',   rules: [{ field: 'waEnabled', operator: 'eq', value: true }],                 logic: 'AND', color: '#25D366' },
    { name: 'Inactive 30d',       rules: [{ field: 'lastContacted', operator: 'lt', value: new Date(Date.now() - 30*86400000) }], logic: 'AND', color: '#ef4444' },
    { name: 'Unverified emails',  rules: [{ field: 'email', operator: 'exists' }, { field: 'status', operator: 'neq', value: 'unsubscribed' }], logic: 'AND', color: '#7c3aed' },
    { name: 'Leads (not customers)', rules: [{ field: 'tags', operator: 'contains', value: 'Lead' }, { field: 'tags', operator: 'notContains', value: 'Customer' }], logic: 'AND', color: '#00d4ff' },
  ]});
});

module.exports = router;
