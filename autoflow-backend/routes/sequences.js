'use strict';
/**
 * Drip Sequence / Flow Builder Routes — /api/v1/sequences
 * Full CRUD + enroll/pause/stats endpoints for the visual flow builder.
 */
const express = require('express');
const { body } = require('express-validator');
const { authenticate, validate } = require('../middleware/auth');
const { DripSequenceService, Sequence, Enrollment } = require('../services/drip-sequence.service');

const router = express.Router();
router.use(authenticate);

// ── LIST ──────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const [sequences, total] = await Promise.all([
    Sequence.find({ userId: req.user._id })
      .sort('-updatedAt').skip((page-1)*+limit).limit(+limit),
    Sequence.countDocuments({ userId: req.user._id }),
  ]);
  res.json({ success: true, data: sequences, total, page: +page });
});

// ── GET SINGLE ────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const seq = await Sequence.findOne({ _id: req.params.id, userId: req.user._id });
  if (!seq) return res.status(404).json({ success: false, message: 'Sequence not found' });
  res.json({ success: true, data: seq });
});

// ── CREATE ────────────────────────────────────────────────────────────────
router.post('/',
  [body('name').trim().notEmpty()],
  validate,
  async (req, res) => {
    const { name, description, trigger, steps, entryStep, tags } = req.body;
    const seq = await Sequence.create({
      userId: req.user._id, name, description, trigger,
      steps: steps || [], entryStep, tags,
    });
    res.status(201).json({ success: true, data: seq });
  }
);

// ── UPDATE (whole sequence or just steps from canvas) ─────────────────────
router.put('/:id', async (req, res) => {
  const allowed = ['name', 'description', 'trigger', 'steps', 'entryStep', 'tags', 'isActive'];
  const update  = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

  const seq = await Sequence.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    update, { new: true }
  );
  if (!seq) return res.status(404).json({ success: false, message: 'Sequence not found' });
  res.json({ success: true, data: seq });
});

// ── UPDATE STEPS (from visual builder save) ───────────────────────────────
router.put('/:id/steps', async (req, res) => {
  const { steps, entryStep } = req.body;
  if (!Array.isArray(steps)) return res.status(400).json({ success: false, message: 'steps must be an array' });

  try {
    const seq = await DripSequenceService.updateSteps(req.params.id, req.user._id, steps, entryStep);
    res.json({ success: true, data: seq });
  } catch (e) {
    res.status(404).json({ success: false, message: e.message });
  }
});

// ── ACTIVATE / DEACTIVATE ─────────────────────────────────────────────────
router.post('/:id/activate', async (req, res) => {
  const seq = await Sequence.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { isActive: true }, { new: true }
  );
  if (!seq) return res.status(404).json({ success: false, message: 'Sequence not found' });
  res.json({ success: true, data: seq, message: 'Sequence activated' });
});

router.post('/:id/deactivate', async (req, res) => {
  const seq = await Sequence.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { isActive: false }, { new: true }
  );
  if (!seq) return res.status(404).json({ success: false, message: 'Sequence not found' });
  res.json({ success: true, data: seq, message: 'Sequence deactivated' });
});

// ── DUPLICATE ─────────────────────────────────────────────────────────────
router.post('/:id/duplicate', async (req, res) => {
  const original = await Sequence.findOne({ _id: req.params.id, userId: req.user._id });
  if (!original) return res.status(404).json({ success: false, message: 'Sequence not found' });

  const clone = await Sequence.create({
    userId:      req.user._id,
    name:        `${original.name} (copy)`,
    description: original.description,
    trigger:     original.trigger,
    steps:       original.steps,
    entryStep:   original.entryStep,
    tags:        original.tags,
    isActive:    false,
  });
  res.status(201).json({ success: true, data: clone });
});

// ── DELETE ────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  await Sequence.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  await Enrollment.deleteMany({ sequenceId: req.params.id });
  res.json({ success: true, message: 'Sequence and all enrollments deleted' });
});

// ── ENROLL CONTACTS ───────────────────────────────────────────────────────
router.post('/:id/enroll', async (req, res) => {
  const { contactIds } = req.body;
  if (!Array.isArray(contactIds) || !contactIds.length)
    return res.status(400).json({ success: false, message: 'contactIds array required' });

  const seq = await Sequence.findOne({ _id: req.params.id, userId: req.user._id });
  if (!seq) return res.status(404).json({ success: false, message: 'Sequence not found' });

  let enrolled = 0, skipped = 0;
  for (const contactId of contactIds) {
    try {
      await DripSequenceService.enroll(seq._id, contactId, req.user._id);
      enrolled++;
    } catch { skipped++; }
  }

  res.json({ success: true, data: { enrolled, skipped, total: contactIds.length } });
});

// ── ENROLLMENTS LIST ──────────────────────────────────────────────────────
router.get('/:id/enrollments', async (req, res) => {
  const { status, page = 1, limit = 50 } = req.query;
  const q = { sequenceId: req.params.id };
  if (status) q.status = status;

  const [enrollments, total] = await Promise.all([
    Enrollment.find(q)
      .populate('contactId', 'name email phone')
      .sort('-enrolledAt').skip((page-1)*+limit).limit(+limit),
    Enrollment.countDocuments(q),
  ]);
  res.json({ success: true, data: enrollments, total, page: +page });
});

// ── STATS ─────────────────────────────────────────────────────────────────
router.get('/:id/stats', async (req, res) => {
  const seq = await Sequence.findOne({ _id: req.params.id, userId: req.user._id });
  if (!seq) return res.status(404).json({ success: false, message: 'Sequence not found' });

  const byStatus = await Enrollment.aggregate([
    { $match: { sequenceId: seq._id } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const byStep = await Enrollment.aggregate([
    { $match: { sequenceId: seq._id, status: 'active' } },
    { $group: { _id: '$currentStep', count: { $sum: 1 } } },
  ]);

  res.json({
    success: true,
    data: {
      sequence: seq,
      enrollment: { byStatus, total: byStatus.reduce((s, x) => s + x.count, 0) },
      activeByStep: byStep,
    },
  });
});

// ── STEP TEMPLATES (quick-start presets for the builder) ─────────────────
router.get('/meta/step-templates', (_req, res) => {
  res.json({ success: true, data: [
    {
      name: 'Welcome Email + WA',
      description: 'Email on day 0, WhatsApp follow-up on day 2',
      steps: [
        { id: 's1', type: 'email',    label: 'Welcome Email',    position: { x: 100, y: 100 }, config: { subject: 'Welcome to [company]!', body: 'Hi [name], welcome aboard!' }, nextStep: 's2' },
        { id: 's2', type: 'wait',     label: 'Wait 2 days',      position: { x: 300, y: 100 }, config: { waitDays: 2 },                                                          nextStep: 's3' },
        { id: 's3', type: 'whatsapp', label: 'WA Follow-up',     position: { x: 500, y: 100 }, config: { body: 'Hi [name]! 👋 Just checking in.' },                               nextStep: 's4' },
        { id: 's4', type: 'end',      label: 'End',              position: { x: 700, y: 100 }, config: {} },
      ],
      entryStep: 's1',
    },
    {
      name: 'Lead Nurture (5-step)',
      description: 'Email drip over 10 days with open-rate condition',
      steps: [
        { id: 'n1', type: 'email',     label: 'Intro Email',      position: { x: 100, y: 150 }, config: { subject: 'Solving your [problem]', body: 'Hi [name]…' },    nextStep: 'n2' },
        { id: 'n2', type: 'wait',      label: 'Wait 3 days',      position: { x: 300, y: 150 }, config: { waitDays: 3 },                                               nextStep: 'n3' },
        { id: 'n3', type: 'condition', label: 'Opened Email?',    position: { x: 500, y: 150 }, config: { condition: 'opened_email', truePath: 'n4', falsePath: 'n5' } },
        { id: 'n4', type: 'email',     label: 'Value Email',      position: { x: 700, y: 80  }, config: { subject: 'Here\'s how we can help', body: 'Hi [name]…' },   nextStep: 'n6' },
        { id: 'n5', type: 'email',     label: 'Re-engagement',    position: { x: 700, y: 220 }, config: { subject: 'Still interested, [name]?', body: 'Hey…' },        nextStep: 'n6' },
        { id: 'n6', type: 'end',       label: 'End',              position: { x: 900, y: 150 }, config: {} },
      ],
      entryStep: 'n1',
    },
    {
      name: 'WhatsApp Campaign Blast',
      description: 'Bulk WA → tag responders → follow-up',
      steps: [
        { id: 'w1', type: 'whatsapp', label: 'Initial Blast',    position: { x: 100, y: 150 }, config: { body: 'Hi [name]! 🎉 Special offer just for you → [link]' }, nextStep: 'w2' },
        { id: 'w2', type: 'wait',     label: 'Wait 1 day',       position: { x: 300, y: 150 }, config: { waitDays: 1 },                                               nextStep: 'w3' },
        { id: 'w3', type: 'condition',label: 'Replied?',         position: { x: 500, y: 150 }, config: { condition: 'replied', truePath: 'w4', falsePath: 'w5' } },
        { id: 'w4', type: 'tag',      label: 'Tag as Hot Lead',  position: { x: 700, y: 80  }, config: { addTags: ['hot-lead'], removeTags: ['cold'] },                nextStep: 'w6' },
        { id: 'w5', type: 'whatsapp', label: 'Follow-up',        position: { x: 700, y: 220 }, config: { body: 'Hey [name], did you see our offer? 😊' },              nextStep: 'w6' },
        { id: 'w6', type: 'end',      label: 'End',              position: { x: 900, y: 150 }, config: {} },
      ],
      entryStep: 'w1',
    },
  ]});
});

module.exports = router;
