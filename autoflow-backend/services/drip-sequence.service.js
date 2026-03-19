/**
 * ══════════════════════════════════════════════════════════
 * DRIP SEQUENCE SERVICE
 * Visual drag-drop automation builder
 * Supports: Multi-channel sequences, if/else branching,
 *           delays, conditions, triggers
 * ══════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');
const cron     = require('node-cron');
const logger   = require('../utils/logger');
const { delay, personalizeText } = require('../utils/helpers');
const { Contact, MessageLog }    = require('../models');

// ── Drip Sequence Schema ──────────────────────────────────
const stepSchema = new mongoose.Schema({
  id:       { type: String, required: true },   // unique step id (for visual builder)
  type:     { type: String, enum: ['email','whatsapp','sms','telegram','wait','condition','tag','webhook','end'], required: true },
  position: { x: Number, y: Number },           // canvas position for visual builder
  config: {
    // For message steps
    subject:  String,
    body:     String,
    html:     String,
    media:    [{ url: String, type: String }],
    platform: String,
    // For wait step
    waitDays:  Number,
    waitHours: Number,
    waitUntil: String,                           // 'opened','clicked','replied'
    // For condition step
    condition:  String,                          // 'opened_email','clicked_link','replied','tag_has'
    conditionValue: String,
    truePath:   String,                          // step id for true branch
    falsePath:  String,                          // step id for false branch
    // For tag step
    addTags:    [String],
    removeTags: [String],
    // For webhook step
    webhookUrl: String,
    // General
    fromEmail:  String,
    fromName:   String,
    smtpProfileId: String,
  },
  nextStep:  String,                             // default next step id (for non-condition)
  label:     String,                             // display label on canvas
}, { _id: false });

const sequenceSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:        { type: String, required: true },
  description: String,
  isActive:    { type: Boolean, default: false },
  trigger: {
    type:    { type: String, enum: ['manual','form_submit','tag_added','contact_created','campaign_sent','webhook','date_field'], default: 'manual' },
    config:  mongoose.Schema.Types.Mixed,
  },
  steps:        [stepSchema],
  entryStep:   String,                           // ID of first step
  stats: {
    enrolled:  { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    active:    { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 },
  },
  tags: [String],
}, { timestamps: true });

const enrollmentSchema = new mongoose.Schema({
  sequenceId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Sequence', required: true, index: true },
  contactId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Contact',  required: true },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true },
  status:      { type: String, enum: ['active','completed','paused','unsubscribed','failed'], default: 'active' },
  currentStep: String,                           // current step id
  completedSteps: [String],
  nextRunAt:   Date,
  enrolledAt:  { type: Date, default: Date.now },
  completedAt: Date,
  data:        mongoose.Schema.Types.Mixed,      // custom data for conditions
}, { timestamps: true });

enrollmentSchema.index({ sequenceId: 1, contactId: 1 }, { unique: true });
enrollmentSchema.index({ nextRunAt: 1, status: 1 });

const Sequence   = mongoose.model('Sequence',   sequenceSchema);
const Enrollment = mongoose.model('Enrollment', enrollmentSchema);

// ── Drip Sequence Service ─────────────────────────────────
class DripSequenceService {
  constructor() {
    this._startProcessor();
  }

  // ── Create sequence ─────────────────────────────────────
  async createSequence(userId, data) {
    const seq = await Sequence.create({ ...data, userId });
    return seq;
  }

  // ── Update sequence steps (from visual builder) ─────────
  async updateSteps(sequenceId, userId, steps, entryStep) {
    const seq = await Sequence.findOneAndUpdate(
      { _id: sequenceId, userId },
      { steps, entryStep },
      { new: true }
    );
    return seq;
  }

  // ── Enroll contact into sequence ────────────────────────
  async enroll(sequenceId, contactId, userId, startData = {}) {
    const seq = await Sequence.findById(sequenceId);
    if (!seq || !seq.isActive) throw new Error('Sequence not found or not active');

    // Check not already enrolled
    const existing = await Enrollment.findOne({ sequenceId, contactId, status: 'active' });
    if (existing) return { alreadyEnrolled: true };

    const enrollment = await Enrollment.create({
      sequenceId, contactId, userId,
      currentStep: seq.entryStep,
      nextRunAt:   new Date(),
      data: startData,
    });

    await Sequence.findByIdAndUpdate(sequenceId, { $inc: { 'stats.enrolled': 1, 'stats.active': 1 } });

    logger.info(`Contact ${contactId} enrolled in sequence ${seq.name}`);
    return enrollment;
  }

  // ── Bulk enroll contacts ────────────────────────────────
  async bulkEnroll(sequenceId, contactIds, userId) {
    const results = { enrolled: 0, skipped: 0 };

    for (const contactId of contactIds) {
      const r = await this.enroll(sequenceId, contactId, userId).catch(() => ({ failed: true }));
      if (r.alreadyEnrolled || r.failed) results.skipped++;
      else results.enrolled++;
    }

    return results;
  }

  // ── Process a single enrollment step ────────────────────
  async _processEnrollment(enrollment) {
    const seq     = await Sequence.findById(enrollment.sequenceId);
    const contact = await Contact.findById(enrollment.contactId);
    if (!seq || !contact) return;

    const step = seq.steps.find(s => s.id === enrollment.currentStep);
    if (!step) {
      await this._complete(enrollment);
      return;
    }

    logger.debug(`Processing step ${step.type} for contact ${contact._id}`);

    try {
      let nextStepId = step.nextStep;

      switch (step.type) {

        case 'email': {
          const EmailService = require('./email.service');
          const body = personalizeText(step.config.html || step.config.body || '', {
            name:    contact.name,
            email:   contact.email,
            company: contact.company || '',
          });
          await EmailService.sendEmail({
            to:           contact.email,
            from:         step.config.fromEmail || process.env.SMTP_FROM_EMAIL,
            fromName:     step.config.fromName  || 'AutoFlow',
            subject:      personalizeText(step.config.subject || '', { name: contact.name }),
            html:         body,
            smtpProfileId:step.config.smtpProfileId,
          });

          await MessageLog.create({
            userId:     enrollment.userId,
            contactId:  contact._id,
            platform:   'email',
            to:         contact.email,
            subject:    step.config.subject,
            body:       step.config.body?.substring(0, 500),
            status:     'sent',
          });
          break;
        }

        case 'whatsapp': {
          const WaService = require('./whatsapp.service');
          const accounts  = await require('../models').Account.find({ userId: enrollment.userId, platform: 'whatsapp', status: 'active' });
          if (accounts.length && contact.phone) {
            const msg = personalizeText(step.config.body, { name: contact.name, phone: contact.phone });
            await WaService.sendMessage(accounts[0]._id.toString(), contact.phone, msg);
          }
          break;
        }

        case 'sms': {
          const SmsService = require('./index').SmsService;
          if (contact.phone) {
            const msg = personalizeText(step.config.body, { name: contact.name });
            await SmsService.send(contact.phone, msg);
          }
          break;
        }

        case 'telegram': {
          const TelegramService = require('./index').TelegramService;
          if (contact.customFields?.telegramId) {
            const msg = personalizeText(step.config.body, { name: contact.name });
            await TelegramService.sendMessage(contact.customFields.telegramId, msg);
          }
          break;
        }

        case 'wait': {
          const waitMs = ((step.config.waitDays || 0) * 86400000) + ((step.config.waitHours || 0) * 3600000);
          await Enrollment.findByIdAndUpdate(enrollment._id, {
            nextRunAt:   new Date(Date.now() + waitMs),
            currentStep: step.nextStep,
            $push:       { completedSteps: step.id },
          });
          return; // Don't proceed now — wait until nextRunAt
        }

        case 'condition': {
          const conditionMet = await this._evaluateCondition(step.config, contact, enrollment);
          nextStepId = conditionMet ? step.config.truePath : step.config.falsePath;
          break;
        }

        case 'tag': {
          const updateOp = {};
          if (step.config.addTags?.length)    updateOp.$addToSet = { tags: { $each: step.config.addTags } };
          if (step.config.removeTags?.length) updateOp.$pull    = { tags: { $in: step.config.removeTags } };
          if (Object.keys(updateOp).length) await Contact.findByIdAndUpdate(contact._id, updateOp);
          break;
        }

        case 'webhook': {
          if (step.config.webhookUrl) {
            await require('axios').post(step.config.webhookUrl, {
              event:   'drip_sequence_step',
              contact: { id: contact._id, name: contact.name, email: contact.email, phone: contact.phone },
              step:    step.id,
              sequence:enrollment.sequenceId,
            }, { timeout: 5000 }).catch(() => {});
          }
          break;
        }

        case 'end': {
          await this._complete(enrollment);
          return;
        }
      }

      // Move to next step
      if (nextStepId) {
        await Enrollment.findByIdAndUpdate(enrollment._id, {
          currentStep:  nextStepId,
          nextRunAt:    new Date(Date.now() + 1000), // process immediately
          $push:        { completedSteps: step.id },
        });
      } else {
        await this._complete(enrollment);
      }

    } catch (err) {
      logger.error(`Drip step error for enrollment ${enrollment._id}: ${err.message}`);
      await Enrollment.findByIdAndUpdate(enrollment._id, {
        status:   'failed',
        nextRunAt: new Date(Date.now() + 3600000), // retry in 1hr
      });
    }
  }

  // ── Evaluate condition ──────────────────────────────────
  async _evaluateCondition(config, contact, enrollment) {
    switch (config.condition) {
      case 'tag_has':
        return contact.tags.includes(config.conditionValue);
      case 'email_exists':
        return !!contact.email;
      case 'phone_exists':
        return !!contact.phone;
      case 'opened_email': {
        const log = await MessageLog.findOne({ contactId: contact._id, platform: 'email', status: 'opened' });
        return !!log;
      }
      case 'clicked_link': {
        const log = await MessageLog.findOne({ contactId: contact._id, platform: 'email', status: 'clicked' });
        return !!log;
      }
      case 'replied': {
        const log = await MessageLog.findOne({ contactId: contact._id, direction: 'inbound' });
        return !!log;
      }
      case 'custom_field':
        return contact.customFields?.[config.conditionValue] === config.conditionExpected;
      default:
        return true;
    }
  }

  // ── Complete enrollment ─────────────────────────────────
  async _complete(enrollment) {
    await Enrollment.findByIdAndUpdate(enrollment._id, {
      status:      'completed',
      completedAt: new Date(),
      nextRunAt:   null,
    });
    await Sequence.findByIdAndUpdate(enrollment.sequenceId, {
      $inc: { 'stats.completed': 1, 'stats.active': -1 }
    });
  }

  // ── Background processor (runs every 30s) ───────────────
  _startProcessor() {
    cron.schedule('*/30 * * * * *', async () => {
      try {
        const due = await Enrollment.find({
          status:    'active',
          nextRunAt: { $lte: new Date() },
        }).limit(50);

        for (const enrollment of due) {
          await this._processEnrollment(enrollment).catch(err =>
            logger.error(`Enrollment processor error: ${err.message}`)
          );
        }
      } catch (err) {
        logger.error(`Drip processor cron error: ${err.message}`);
      }
    });

    logger.info('🔄 Drip sequence processor started');
  }

  // ── Get sequence stats ──────────────────────────────────
  async getStats(sequenceId, userId) {
    const [seq, enrollments] = await Promise.all([
      Sequence.findOne({ _id: sequenceId, userId }),
      Enrollment.aggregate([
        { $match: { sequenceId: mongoose.Types.ObjectId(sequenceId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    const statsMap = {};
    enrollments.forEach(e => { statsMap[e._id] = e.count; });

    return { sequence: seq, enrollmentStats: statsMap };
  }
}

module.exports = { DripSequenceService: new DripSequenceService(), Sequence, Enrollment };
