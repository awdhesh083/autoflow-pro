'use strict';
/**
 * Full-text Search — /api/v1/search
 *
 * Searches across: Contacts, Campaigns, MessageLogs, Templates
 * Uses MongoDB text indexes ($text search) with fallback to regex for
 * collections that don't have a text index yet.
 *
 * Text indexes are created automatically on first query if missing.
 */
const express  = require('express');
const mongoose = require('mongoose');
const { authenticate } = require('../middleware/auth');
const { Contact, Campaign, MessageLog } = require('../models');

const router = express.Router();
router.use(authenticate);

// ── Ensure text indexes (idempotent — no-op if already exist) ─────────────
async function ensureIndexes() {
  try {
    await Contact.collection.createIndex(
      { name: 'text', email: 'text', phone: 'text', company: 'text', notes: 'text' },
      { name: 'contact_text', background: true }
    );
    await Campaign.collection.createIndex(
      { name: 'text', 'content.body': 'text', 'content.subject': 'text' },
      { name: 'campaign_text', background: true }
    );
    await MessageLog.collection.createIndex(
      { body: 'text', subject: 'text', to: 'text' },
      { name: 'messagelog_text', background: true }
    );
  } catch { /* already exists */ }
}

// Lazy index creation (once per process)
let indexesReady = false;
async function getIndexes() {
  if (!indexesReady) { await ensureIndexes(); indexesReady = true; }
}

// ── GET /search?q=query&types=contacts,campaigns&limit=10 ─────────────────
router.get('/', async (req, res) => {
  const { q, types = 'contacts,campaigns,messages', limit = 20, page = 1 } = req.query;
  if (!q || q.trim().length < 2)
    return res.status(400).json({ success: false, message: 'Query must be at least 2 characters' });

  await getIndexes();

  const userId   = req.user._id;
  const lim      = Math.min(+limit, 50);
  const typeList = types.split(',').map(t => t.trim());
  const results  = {};
  let   total    = 0;

  const searches = [];

  if (typeList.includes('contacts')) {
    searches.push(
      Contact.find({ userId, $text: { $search: q } }, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(lim)
        .select('name email phone tags status score platform')
        .lean()
        .catch(() =>
          // Fallback to regex if text index not ready
          Contact.find({ userId, $or: [
            { name:  new RegExp(q, 'i') },
            { email: new RegExp(q, 'i') },
            { phone: new RegExp(q, 'i') },
          ]}).limit(lim).select('name email phone tags status').lean()
        )
        .then(docs => { results.contacts = docs; total += docs.length; })
    );
  }

  if (typeList.includes('campaigns')) {
    searches.push(
      Campaign.find({ userId, $text: { $search: q } }, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(lim)
        .select('name type status stats createdAt')
        .lean()
        .catch(() =>
          Campaign.find({ userId, name: new RegExp(q, 'i') })
            .limit(lim).select('name type status stats createdAt').lean()
        )
        .then(docs => { results.campaigns = docs; total += docs.length; })
    );
  }

  if (typeList.includes('messages')) {
    searches.push(
      MessageLog.find({ userId, $text: { $search: q } }, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(Math.min(lim, 20))
        .select('platform direction to subject body status createdAt')
        .lean()
        .catch(() =>
          MessageLog.find({ userId, $or: [
            { subject: new RegExp(q, 'i') },
            { to:      new RegExp(q, 'i') },
          ]}).limit(lim).select('platform to subject status createdAt').lean()
        )
        .then(docs => { results.messages = docs; total += docs.length; })
    );
  }

  if (typeList.includes('templates')) {
    const Template = mongoose.models.MessageTemplate;
    if (Template) {
      searches.push(
        Template.find({ userId, $text: { $search: q } }, { score: { $meta: 'textScore' } })
          .sort({ score: { $meta: 'textScore' } })
          .limit(lim)
          .select('name platform category body')
          .lean()
          .catch(() =>
            Template.find({ userId, name: new RegExp(q, 'i') })
              .limit(lim).select('name platform category body').lean()
          )
          .then(docs => { results.templates = docs; total += docs.length; })
      );
    }
  }

  await Promise.all(searches);

  res.json({
    success: true,
    query:   q,
    total,
    data:    results,
    types:   typeList,
  });
});

// ── GET /search/suggest?q= — typeahead (contacts only, fast) ─────────────
router.get('/suggest', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 1) return res.json({ success: true, data: [] });

  const contacts = await Contact.find({
    userId: req.user._id,
    $or: [
      { name:  new RegExp(`^${q}`, 'i') },
      { email: new RegExp(`^${q}`, 'i') },
    ],
  }).limit(8).select('name email phone tags').lean();

  res.json({
    success: true,
    data:    contacts.map(c => ({
      id:    c._id,
      label: c.name,
      sub:   c.email || c.phone,
      tags:  c.tags,
      type:  'contact',
    })),
  });
});

module.exports = router;
