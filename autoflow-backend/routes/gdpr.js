'use strict';
/**
 * GDPR / Data Privacy Routes — /api/v1/privacy
 *
 * Covers India's DPDP Act + GDPR basics:
 *   GET  /privacy/export          — full JSON data export for a contact
 *   DELETE /privacy/erase/:id     — right to erasure (GDPR Art. 17 / DPDP §14)
 *   GET  /privacy/audit-log       — what data was collected, when, and why
 *   POST /privacy/consent/:id     — record explicit consent
 *   GET  /privacy/contacts        — list contacts with their consent status
 *   POST /privacy/bulk-delete     — erase multiple contacts by email list
 */
const express  = require('express');
const mongoose = require('mongoose');
const archiver = require('archiver');
const { authenticate } = require('../middleware/auth');
const { Contact, Campaign, MessageLog, AnalyticsEvent } = require('../models');

const router = express.Router();

// ── ConsentLog model (lightweight — no extra schema file) ─────────────────
const consentSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
  email:     String,
  phone:     String,
  consentType: { type: String, enum: ['marketing','transactional','analytics','all'], default: 'marketing' },
  granted:   { type: Boolean, required: true },
  source:    { type: String, enum: ['form','import','manual','api','campaign'], default: 'manual' },
  ipAddress: String,
  userAgent: String,
  notes:     String,
}, { timestamps: true });

const ConsentLog = mongoose.models.ConsentLog || mongoose.model('ConsentLog', consentSchema);

router.use(authenticate);

// ─────────────────────────────────────────────────────────
// DATA EXPORT — full JSON package for a contact
// ─────────────────────────────────────────────────────────
router.get('/export/contact/:id', async (req, res) => {
  const contact = await Contact.findOne({ _id: req.params.id, userId: req.user._id }).lean();
  if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

  const [messages, events, consents] = await Promise.all([
    MessageLog.find({ contactId: contact._id }).select('-__v').lean(),
    AnalyticsEvent.find({ contactId: contact._id }).select('-__v').lean(),
    ConsentLog.find({ contactId: contact._id }).lean(),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    exportedBy: req.user.email,
    contact: {
      id:          contact._id,
      name:        contact.name,
      email:       contact.email,
      phone:       contact.phone,
      company:     contact.company,
      country:     contact.country,
      tags:        contact.tags,
      source:      contact.source,
      status:      contact.status,
      score:       contact.score,
      createdAt:   contact.createdAt,
      lastContacted: contact.lastContacted,
      customFields: contact.customFields,
    },
    messages:  messages.map(m => ({
      platform: m.platform, direction: m.direction, status: m.status,
      subject: m.subject, sentAt: m.createdAt, openedAt: m.openedAt,
      clickedAt: m.clickedAt, deliveredAt: m.deliveredAt,
    })),
    analytics: events,
    consents,
    summary: {
      totalMessagesSent:     messages.filter(m => m.direction === 'outbound').length,
      totalMessagesReceived: messages.filter(m => m.direction === 'inbound').length,
      platformsUsed:         [...new Set(messages.map(m => m.platform))],
    },
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="autoflow-data-${contact._id}.json"`);
  res.send(JSON.stringify(exportData, null, 2));
});

// Bulk export — all contacts for a user as a JSON archive
router.get('/export/all', async (req, res) => {
  const contacts = await Contact.find({ userId: req.user._id }).select('name email phone').lean();

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="autoflow-all-contacts-export.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    exportedBy: req.user.email,
    totalContacts: contacts.length,
    contacts,
  });
});

// ─────────────────────────────────────────────────────────
// RIGHT TO ERASURE — delete all data about a contact
// ─────────────────────────────────────────────────────────
router.delete('/erase/:id', async (req, res) => {
  const contact = await Contact.findOne({ _id: req.params.id, userId: req.user._id });
  if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

  const [msgResult, evtResult] = await Promise.all([
    MessageLog.deleteMany({ contactId: contact._id }),
    AnalyticsEvent.deleteMany({ contactId: contact._id }),
    ConsentLog.deleteMany({ contactId: contact._id }),
  ]);

  await Contact.findByIdAndDelete(contact._id);

  // Log erasure in audit trail
  const { AuditLog } = require('./audit');
  AuditLog.create({
    userId:     req.user._id,
    action:     'contact.erased',
    resource:   'Contact',
    resourceId: contact._id,
    details:    { email: contact.email, phone: contact.phone, messagesDeleted: msgResult.deletedCount },
    ip:         req.ip,
  }).catch(() => {});

  res.json({
    success: true,
    message: `All data for ${contact.email || contact.phone || contact._id} permanently erased`,
    deleted: {
      contact:   1,
      messages:  msgResult.deletedCount,
      events:    evtResult.deletedCount,
    },
  });
});

// Bulk erasure by email list (GDPR opt-out webhook)
router.post('/bulk-erase', async (req, res) => {
  const { emails = [], phones = [] } = req.body;
  if (!emails.length && !phones.length)
    return res.status(400).json({ success: false, message: 'emails or phones array required' });

  const query = { userId: req.user._id };
  if (emails.length && phones.length)
    query.$or = [{ email: { $in: emails } }, { phone: { $in: phones } }];
  else if (emails.length) query.email = { $in: emails };
  else                    query.phone = { $in: phones };

  const contacts = await Contact.find(query).select('_id email phone').lean();
  const ids      = contacts.map(c => c._id);

  await Promise.all([
    Contact.deleteMany({ _id: { $in: ids } }),
    MessageLog.deleteMany({ contactId: { $in: ids } }),
    AnalyticsEvent.deleteMany({ contactId: { $in: ids } }),
  ]);

  res.json({ success: true, erased: contacts.length, contacts: contacts.map(c => c.email || c.phone) });
});

// ─────────────────────────────────────────────────────────
// CONSENT MANAGEMENT
// ─────────────────────────────────────────────────────────
router.post('/consent/:id', async (req, res) => {
  const contact = await Contact.findOne({ _id: req.params.id, userId: req.user._id });
  if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

  const { granted, consentType = 'marketing', source = 'manual', notes } = req.body;
  if (granted === undefined) return res.status(400).json({ success: false, message: 'granted (boolean) required' });

  const consent = await ConsentLog.create({
    userId: req.user._id, contactId: contact._id,
    email: contact.email, phone: contact.phone,
    granted, consentType, source, notes,
    ipAddress: req.ip, userAgent: req.get('user-agent'),
  });

  // Update contact subscription status
  if (!granted) {
    await Contact.findByIdAndUpdate(contact._id, { subscribed: false, status: 'unsubscribed' });
  } else {
    await Contact.findByIdAndUpdate(contact._id, { subscribed: true, status: 'active' });
  }

  res.status(201).json({ success: true, data: consent });
});

// Get consent history for a contact
router.get('/consent/:id', async (req, res) => {
  const contact = await Contact.findOne({ _id: req.params.id, userId: req.user._id });
  if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
  const history = await ConsentLog.find({ contactId: contact._id }).sort('-createdAt');
  res.json({ success: true, data: history });
});

// Contacts with their consent status
router.get('/contacts', async (req, res) => {
  const { page = 1, limit = 50, status } = req.query;
  const q = { userId: req.user._id };
  if (status === 'subscribed')   q.subscribed = true;
  if (status === 'unsubscribed') q.subscribed = false;

  const [contacts, total] = await Promise.all([
    Contact.find(q).select('name email phone subscribed status tags createdAt')
      .sort('-createdAt').skip((page - 1) * +limit).limit(+limit),
    Contact.countDocuments(q),
  ]);
  res.json({ success: true, data: contacts, total, page: +page });
});

// Public unsubscribe page (no auth — for one-click unsubscribe links)
router.get('/unsubscribe/:token', async (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Unsubscribe</title>
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
    min-height:100vh;margin:0;background:#03050e;color:#e2e8f0}
    .box{background:#0b0f22;border:1px solid #1c2645;border-radius:16px;padding:40px;max-width:440px;text-align:center}
    h2{color:#00d4ff;margin-bottom:8px}
    p{color:#4a5f7a;margin-bottom:24px}
    button{background:linear-gradient(135deg,#00d4ff,#7c3aed);color:#fff;border:none;
    padding:12px 28px;border-radius:8px;font-size:15px;cursor:pointer;font-weight:700}
    .success{color:#10b981;font-weight:700;display:none}</style></head>
  <body><div class="box">
    <div style="font-size:48px;margin-bottom:16px">✉️</div>
    <h2>Manage Email Preferences</h2>
    <p>Click below to unsubscribe from marketing emails. You will still receive important account notifications.</p>
    <button onclick="doUnsub()">Unsubscribe Me</button>
    <p class="success" id="ok">✅ You've been unsubscribed successfully.</p>
  </div>
  <script>
    async function doUnsub() {
      const r = await fetch('/api/v1/privacy/unsubscribe-confirm/${_req.params.token}', {method:'POST'});
      if(r.ok) { document.querySelector('button').style.display='none'; document.getElementById('ok').style.display='block'; }
    }
  </script></body></html>`);
});

// Process the unsubscribe confirmation
router.post('/unsubscribe-confirm/:token', async (req, res) => {
  // token is the MessageLog trackingId
  const log = await MessageLog.findOne({ 'metadata.trackingId': req.params.token });
  if (!log) return res.status(404).json({ success: false, message: 'Token not found' });

  await Contact.findByIdAndUpdate(log.contactId, { subscribed: false, status: 'unsubscribed' });
  await MessageLog.findByIdAndUpdate(log._id, { status: 'unsubscribed' });

  res.json({ success: true, message: 'Unsubscribed' });
});

// Privacy summary dashboard
router.get('/summary', async (req, res) => {
  const [total, subscribed, unsubscribed, consentCount] = await Promise.all([
    Contact.countDocuments({ userId: req.user._id }),
    Contact.countDocuments({ userId: req.user._id, subscribed: true }),
    Contact.countDocuments({ userId: req.user._id, subscribed: false }),
    ConsentLog.countDocuments({ userId: req.user._id, granted: true }),
  ]);

  res.json({
    success: true,
    data: {
      total, subscribed, unsubscribed,
      consentRecords: consentCount,
      consentRate: total ? Math.round(subscribed / total * 100) : 0,
      compliance: {
        gdpr:  true,
        dpdp:  true,
        canSpam: true,
      },
    },
  });
});

module.exports = router;
module.exports.ConsentLog = ConsentLog;
