'use strict';
/**
 * Audit Log Routes — /api/v1/audit
 * Immutable record of every significant action in the system.
 * Who did what, to which resource, when, from where.
 */
const express  = require('express');
const mongoose = require('mongoose');
const { authenticate } = require('../middleware/auth');
const { adminOnly }    = require('../middleware/admin');

const router = express.Router();

// ── AuditLog model ─────────────────────────────────────────────────────────
const auditLogSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action:     { type: String, required: true, index: true },
  // Format: resource.verb  e.g. campaign.launched, contact.deleted, account.blocked
  resource:   { type: String, index: true },
  resourceId: { type: mongoose.Schema.Types.ObjectId },
  details:    mongoose.Schema.Types.Mixed,
  ip:         String,
  userAgent:  String,
  status:     { type: String, enum: ['success', 'failure'], default: 'success' },
  error:      String,
}, { timestamps: true });

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }); // auto-delete after 90 days

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

// ── Middleware: auto-log important route actions ───────────────────────────
function auditLogger(action, resource) {
  return async (req, _res, next) => {
    // Store action info on request for post-response logging
    req._audit = { action, resource, userId: req.user?._id, ip: req.ip, userAgent: req.get('user-agent') };
    next();
  };
}

router.use(authenticate);

// ── GET /audit — list logs for current user ───────────────────────────────
router.get('/', async (req, res) => {
  const { page = 1, limit = 50, action, resource, status, from, to } = req.query;
  const q = { userId: req.user._id };
  if (action)   q.action   = { $regex: action, $options: 'i' };
  if (resource) q.resource = resource;
  if (status)   q.status   = status;
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to)   q.createdAt.$lte = new Date(to);
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(q).sort('-createdAt').skip((page - 1) * +limit).limit(+limit),
    AuditLog.countDocuments(q),
  ]);
  res.json({ success: true, data: logs, total, page: +page });
});

// ── GET /audit/summary — action counts ───────────────────────────────────
router.get('/summary', async (req, res) => {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [byAction, byDay, recentErrors] = await Promise.all([
    AuditLog.aggregate([
      { $match: { userId: req.user._id, createdAt: { $gte: since30 } } },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
    AuditLog.aggregate([
      { $match: { userId: req.user._id, createdAt: { $gte: since30 } } },
      { $group: {
        _id:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
      }},
      { $sort: { '_id': 1 } },
    ]),
    AuditLog.find({ userId: req.user._id, status: 'failure', createdAt: { $gte: since30 } })
      .sort('-createdAt').limit(5),
  ]);
  res.json({ success: true, data: { byAction, byDay, recentErrors } });
});

// ── Admin: all users' logs ─────────────────────────────────────────────────
router.get('/all', adminOnly, async (req, res) => {
  const { page = 1, limit = 100, userId, action, from, to } = req.query;
  const q = {};
  if (userId) q.userId = userId;
  if (action) q.action = { $regex: action, $options: 'i' };
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to)   q.createdAt.$lte = new Date(to);
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(q).populate('userId', 'name email').sort('-createdAt').skip((page - 1) * +limit).limit(+limit),
    AuditLog.countDocuments(q),
  ]);
  res.json({ success: true, data: logs, total, page: +page });
});

// ── Export logs as CSV ────────────────────────────────────────────────────
router.get('/export', async (req, res) => {
  const { from, to } = req.query;
  const q = { userId: req.user._id };
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to)   q.createdAt.$lte = new Date(to);
  }

  const logs = await AuditLog.find(q).sort('-createdAt').limit(10000).lean();
  const header = 'timestamp,action,resource,status,ip,details\n';
  const rows   = logs.map(l =>
    `"${l.createdAt?.toISOString()}","${l.action}","${l.resource||''}","${l.status}","${l.ip||''}","${JSON.stringify(l.details||{}).replace(/"/g,"'")}"`
  ).join('\n');

  res.set({
    'Content-Type':        'text/csv',
    'Content-Disposition': 'attachment; filename="autoflow-audit-log.csv"',
  });
  res.send(header + rows);
});

// ── Manual log entry (for custom events from integrations) ───────────────
router.post('/', async (req, res) => {
  const { action, resource, resourceId, details, status = 'success' } = req.body;
  if (!action) return res.status(400).json({ success: false, message: 'action required' });

  const log = await AuditLog.create({
    userId: req.user._id, action, resource, resourceId, details, status,
    ip: req.ip, userAgent: req.get('user-agent'),
  });
  res.status(201).json({ success: true, data: log });
});

module.exports = router;
module.exports.AuditLog      = AuditLog;
module.exports.auditLogger   = auditLogger;
