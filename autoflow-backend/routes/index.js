/**
 * ══════════════════════════════════════════════════════════
 * AUTOFLOW API ROUTES — All routes in one comprehensive file
 * ══════════════════════════════════════════════════════════
 */

const express  = require('express');
const { body, query, param, validationResult } = require('express-validator');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const csv      = require('csv-parser');

const {
  User, Contact, ContactList, Campaign, MessageLog,
  Account, SimAccount, SmtpProfile, AutoReply,
  Webhook, Proxy, AnalyticsEvent
} = require('../models');

const WhatsAppService = require('../services/whatsapp.service');
const EmailService    = require('../services/email.service');
const SmsService      = require('../services/sms.service');
const SocialService   = require('../services/social.service');
const ProxyService    = require('../services/proxy.service');
const AIService       = require('../services/ai.service');
const { cache }       = require('../config/redis');
const logger          = require('../utils/logger');
const { personalizeText } = require('../utils/helpers');

const { waQueue, emailQueue, smsQueue, socialQueue } = require('../workers/campaign.worker');

// ── Middleware ─────────────────────────────────────────────
const authenticate = async (req, res, next) => {
  try {
    let token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : req.headers['x-api-key'];

    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });

    // Try API key first
    const userByKey = await User.findOne({ apiKey: token, isActive: true });
    if (userByKey) { req.user = userByKey; return next(); }

    // JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) return res.status(401).json({ success: false, message: 'Invalid or expired token' });

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ═══════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════
const authRouter = express.Router();

authRouter.post('/register',
  [body('name').trim().notEmpty(), body('email').isEmail(), body('password').isLength({ min: 8 })],
  validate,
  async (req, res) => {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

    const apiKey = `sk-af-${crypto.randomBytes(32).toString('hex')}`;
    const user   = await User.create({ name, email, password, apiKey });
    const token  = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      token,
      apiKey,
      user: { id: user._id, name: user.name, email: user.email, plan: user.plan }
    });
  }
);

authRouter.post('/login',
  [body('email').isEmail(), body('password').notEmpty()],
  validate,
  async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email, isActive: true }).select('+password');
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (user.isLocked()) return res.status(423).json({ success: false, message: 'Account temporarily locked' });

    const valid = await user.comparePassword(password);
    if (!valid) {
      await User.findByIdAndUpdate(user._id, {
        $inc: { loginAttempts: 1 },
        ...(user.loginAttempts >= 4 ? { lockUntil: new Date(Date.now() + 15 * 60 * 1000) } : {})
      });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    await User.findByIdAndUpdate(user._id, { loginAttempts: 0, lockUntil: null, lastLogin: new Date() });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, plan: user.plan, apiKey: user.apiKey }
    });
  }
);

authRouter.get('/me', authenticate, async (req, res) => {
  res.json({ success: true, user: req.user });
});

authRouter.post('/regenerate-key', authenticate, async (req, res) => {
  const apiKey = `sk-af-${crypto.randomBytes(32).toString('hex')}`;
  await User.findByIdAndUpdate(req.user._id, { apiKey });
  res.json({ success: true, apiKey });
});

// ═══════════════════════════════════════════════════════════
// CONTACT ROUTES
// ═══════════════════════════════════════════════════════════
const contactRouter = express.Router();
contactRouter.use(authenticate);

contactRouter.get('/', async (req, res) => {
  const { page = 1, limit = 50, search, tag, status, list } = req.query;
  const q = { userId: req.user._id };

  if (search) q.$or = [
    { name:  new RegExp(search, 'i') },
    { email: new RegExp(search, 'i') },
    { phone: new RegExp(search, 'i') },
  ];
  if (tag)    q.tags   = tag;
  if (status) q.status = status;
  if (list)   q.lists  = list;

  const cacheKey = `contacts:${req.user._id}:${JSON.stringify(q)}:${page}:${limit}`;
  const cached   = await cache.get(cacheKey);
  if (cached) return res.json(cached);

  const [contacts, total] = await Promise.all([
    Contact.find(q).skip((page - 1) * limit).limit(+limit).sort('-createdAt'),
    Contact.countDocuments(q)
  ]);

  const result = { success: true, data: contacts, total, page: +page, pages: Math.ceil(total / limit) };
  await cache.set(cacheKey, result, 60);
  res.json(result);
});

contactRouter.post('/',
  [body('name').trim().notEmpty(), body('phone').optional(), body('email').optional().isEmail()],
  validate,
  async (req, res) => {
    const contact = await Contact.create({ ...req.body, userId: req.user._id });
    await cache.flush(`contacts:${req.user._id}:*`);
    res.status(201).json({ success: true, data: contact });
  }
);

contactRouter.put('/:id', authenticate, async (req, res) => {
  const contact = await Contact.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, req.body, { new: true });
  if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
  await cache.flush(`contacts:${req.user._id}:*`);
  res.json({ success: true, data: contact });
});

contactRouter.delete('/:id', authenticate, async (req, res) => {
  await Contact.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  await cache.flush(`contacts:${req.user._id}:*`);
  res.json({ success: true, message: 'Contact deleted' });
});

// Bulk import via CSV
contactRouter.post('/import/csv', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const contacts  = [];
  const filePath  = req.file.path;

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => {
      if (row.phone || row.email) {
        contacts.push({
          userId: req.user._id,
          name:   row.name || row.Name || '',
          phone:  row.phone || row.Phone || row.mobile || '',
          email:  row.email || row.Email || '',
          tags:   row.tags  ? row.tags.split(',').map(t => t.trim()) : [],
          company: row.company || row.Company || '',
          status: 'active',
          source: 'import',
        });
      }
    })
    .on('end', async () => {
      try {
        const result = await Contact.insertMany(contacts, { ordered: false }).catch(e => ({ insertedCount: e.result?.nInserted || 0 }));
        fs.unlinkSync(filePath);
        await cache.flush(`contacts:${req.user._id}:*`);
        res.json({ success: true, imported: contacts.length, message: `Imported ${contacts.length} contacts` });
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    });
});

// Validate WA numbers
contactRouter.post('/validate-wa', authenticate, async (req, res) => {
  const { phones, accountId } = req.body;
  if (!phones?.length) return res.status(400).json({ success: false, message: 'No phones provided' });
  const results = await WhatsAppService.validateNumbers(accountId, phones);
  res.json({ success: true, data: results });
});

// ═══════════════════════════════════════════════════════════
// CAMPAIGN ROUTES
// ═══════════════════════════════════════════════════════════
const campaignRouter = express.Router();
campaignRouter.use(authenticate);

campaignRouter.get('/', async (req, res) => {
  const { status, type, page = 1, limit = 20 } = req.query;
  const q = { userId: req.user._id };
  if (status) q.status = status;
  if (type)   q.type   = type;

  const [campaigns, total] = await Promise.all([
    Campaign.find(q).skip((page - 1) * limit).limit(+limit).sort('-createdAt'),
    Campaign.countDocuments(q)
  ]);

  res.json({ success: true, data: campaigns, total });
});

campaignRouter.post('/',
  [body('name').notEmpty(), body('type').isIn(['whatsapp','email','sms','instagram','facebook','twitter','telegram','multi']),
   body('content.body').notEmpty()],
  validate,
  async (req, res) => {
    const campaign = await Campaign.create({ ...req.body, userId: req.user._id });
    res.status(201).json({ success: true, data: campaign });
  }
);

campaignRouter.post('/:id/launch', authenticate, async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
  if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
  if (!['draft','scheduled','paused'].includes(campaign.status)) {
    return res.status(400).json({ success: false, message: `Cannot launch campaign with status: ${campaign.status}` });
  }

  // Schedule for later or launch now
  if (campaign.schedule?.sendAt && campaign.schedule.sendAt > new Date()) {
    await Campaign.findByIdAndUpdate(campaign._id, { status: 'scheduled' });
    return res.json({ success: true, message: 'Campaign scheduled', scheduledAt: campaign.schedule.sendAt });
  }

  // Launch immediately
  const queueMap = {
    whatsapp:  { queue: waQueue,     job: 'bulk-send' },
    email:     { queue: emailQueue,  job: 'bulk-send' },
    sms:       { queue: smsQueue,    job: 'bulk-send' },
    instagram: { queue: socialQueue, job: 'post'      },
    facebook:  { queue: socialQueue, job: 'post'      },
    twitter:   { queue: socialQueue, job: 'post'      },
  };

  const { queue, job } = queueMap[campaign.type] || { queue: emailQueue, job: 'bulk-send' };

  const queueJob = await queue.add(job,
    { campaignId: campaign._id.toString() },
    { attempts: 3, backoff: { type: 'exponential', delay: 10000 }, removeOnComplete: 50 }
  );

  await Campaign.findByIdAndUpdate(campaign._id, { status: 'running', jobId: queueJob.id.toString(), 'stats.startedAt': new Date() });

  res.json({ success: true, message: 'Campaign launched', jobId: queueJob.id, data: campaign });
});

campaignRouter.post('/:id/pause', authenticate, async (req, res) => {
  const campaign = await Campaign.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id, status: 'running' },
    { status: 'paused' },
    { new: true }
  );
  if (!campaign) return res.status(404).json({ success: false, message: 'Running campaign not found' });
  res.json({ success: true, message: 'Campaign paused', data: campaign });
});

campaignRouter.delete('/:id', authenticate, async (req, res) => {
  const campaign = await Campaign.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
  res.json({ success: true, message: 'Campaign deleted' });
});

campaignRouter.get('/:id/stats', authenticate, async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
  if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

  const messageLogs = await MessageLog.aggregate([
    { $match: { campaignId: campaign._id } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  const stats = { ...campaign.stats.toObject() };
  messageLogs.forEach(s => { stats[s._id] = s.count; });

  res.json({ success: true, data: { campaign, stats, messageLogs } });
});

// ═══════════════════════════════════════════════════════════
// WHATSAPP ROUTES
// ═══════════════════════════════════════════════════════════
const whatsappRouter = express.Router();
whatsappRouter.use(authenticate);

// Initialize WA account
whatsappRouter.post('/init/:accountId', async (req, res) => {
  const account = await Account.findOne({ _id: req.params.accountId, userId: req.user._id });
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

  WhatsAppService.initClient(account).catch(err => logger.error(`WA init: ${err.message}`));
  res.json({ success: true, message: 'WA client initializing. Check QR code endpoint.' });
});

// Get QR code
whatsappRouter.get('/qr/:accountId', async (req, res) => {
  const qr = WhatsAppService.getQRCode(req.params.accountId);
  if (!qr) return res.status(404).json({ success: false, message: 'No QR code available. Client may be connected or not initialized.' });
  res.json({ success: true, qr });
});

// Send single message
whatsappRouter.post('/send', async (req, res) => {
  const { accountId, to, message, media } = req.body;
  const result = await WhatsAppService.sendMessage(accountId, to, message, { media });
  res.json({ success: true, data: result });
});

// Bulk broadcast
whatsappRouter.post('/broadcast', async (req, res) => {
  const { campaignName, contacts: contactPhones, message, accountId, listId, options = {} } = req.body;

  // Build contact list
  let contacts = [];
  if (contactPhones?.length) {
    contacts = contactPhones.map(phone => ({
      phone,
      name: 'Friend',
      _id:  null,
    }));
  } else if (listId) {
    contacts = await Contact.find({ userId: req.user._id, lists: listId, status: 'active', waEnabled: true });
  }

  if (!contacts.length) return res.status(400).json({ success: false, message: 'No contacts provided' });

  // Create and queue campaign
  const campaign = await Campaign.create({
    userId:  req.user._id,
    name:    campaignName || `WA Broadcast ${new Date().toLocaleDateString()}`,
    type:    'whatsapp',
    content: { body: message },
    audience:{ totalCount: contacts.length },
    status:  'running',
    settings:{ waAccountId: accountId, ...options },
  });

  const job = await waQueue.add('bulk-send',
    { campaignId: campaign._id.toString(), contacts, accountId },
    { attempts: 2, removeOnComplete: 50 }
  );

  await Campaign.findByIdAndUpdate(campaign._id, { jobId: job.id.toString() });

  res.json({
    success: true,
    message: `Broadcast queued for ${contacts.length} contacts`,
    campaignId: campaign._id,
    jobId: job.id,
  });
});

// Check WA number validity
whatsappRouter.post('/check-numbers', async (req, res) => {
  const { phones, accountId } = req.body;
  const results = await WhatsAppService.validateNumbers(accountId, phones);
  res.json({ success: true, data: results });
});

// Disconnect WA client
whatsappRouter.delete('/disconnect/:accountId', async (req, res) => {
  await WhatsAppService.disconnect(req.params.accountId);
  await Account.findByIdAndUpdate(req.params.accountId, { status: 'disconnected' });
  res.json({ success: true, message: 'WA account disconnected' });
});

// ═══════════════════════════════════════════════════════════
// EMAIL ROUTES
// ═══════════════════════════════════════════════════════════
const emailRouter = express.Router();
emailRouter.use(authenticate);

// Send single email
emailRouter.post('/send', async (req, res) => {
  const { to, subject, html, text, smtpProfileId } = req.body;
  const result = await EmailService.sendEmail({ to, from: process.env.SMTP_FROM_EMAIL, subject, html, text, smtpProfileId });
  res.json({ success: true, data: result });
});

// Launch email campaign
emailRouter.post('/campaign', async (req, res) => {
  const { name, subject, html, body, toList, contacts: contactEmails, fromEmail, fromName, smtpProfileId, options = {} } = req.body;

  let contacts = [];
  if (contactEmails?.length) {
    contacts = contactEmails.map(email => ({ email, name: 'Friend', status: 'active' }));
  } else if (toList) {
    contacts = await Contact.find({ userId: req.user._id, lists: toList, status: 'active', subscribed: true });
  }

  const campaign = await Campaign.create({
    userId:  req.user._id,
    name:    name || `Email Campaign ${new Date().toLocaleDateString()}`,
    type:    'email',
    content: { subject, html: html || body, body: body || html },
    audience:{ totalCount: contacts.length },
    status:  'running',
    settings:{ smtpProfileId, fromEmail, fromName, ...options },
  });

  const job = await emailQueue.add('bulk-send',
    { campaignId: campaign._id.toString(), contacts },
    { attempts: 3, removeOnComplete: 50 }
  );

  res.json({ success: true, campaignId: campaign._id, jobId: job.id, recipients: contacts.length });
});

// Test SMTP
emailRouter.post('/test', async (req, res) => {
  const { to, smtpProfileId } = req.body;
  const result = await EmailService.sendTest(smtpProfileId, to || req.user.email);
  res.json({ success: true, data: result });
});

// SMTP profiles
emailRouter.get('/smtp-profiles', async (req, res) => {
  const profiles = await SmtpProfile.find({ userId: req.user._id });
  res.json({ success: true, data: profiles });
});

emailRouter.post('/smtp-profiles', async (req, res) => {
  const profile  = await SmtpProfile.create({ ...req.body, userId: req.user._id });
  const verified = await EmailService.verifySmtp(profile);
  if (verified.success) await SmtpProfile.findByIdAndUpdate(profile._id, { isVerified: true, status: 'active' });
  res.status(201).json({ success: true, data: profile, verified: verified.success });
});

// Unsubscribe handler
emailRouter.get('/unsubscribe/:trackingId', async (req, res) => {
  await EmailService.handleUnsubscribe(req.params.trackingId);
  res.send('<h1>✅ You have been unsubscribed.</h1><p>You will no longer receive emails from this list.</p>');
});

// Open tracking pixel
emailRouter.get('/track/open/:trackingId', async (req, res) => {
  const log = await MessageLog.findOneAndUpdate(
    { 'metadata.trackingId': req.params.trackingId, status: { $ne: 'opened' } },
    { status: 'opened', openedAt: new Date() }
  );
  if (log) {
    await AnalyticsEvent.create({ userId: log.userId, campaignId: log.campaignId, messageId: log._id, event: 'opened', ip: req.ip, userAgent: req.headers['user-agent'] });
  }
  // Return 1x1 transparent pixel
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.set('Content-Type', 'image/gif').send(pixel);
});

// Click tracking redirect
emailRouter.get('/track/click/:trackingId/:linkIndex', async (req, res) => {
  const log = await MessageLog.findOne({ 'metadata.trackingId': req.params.trackingId });
  if (log) {
    const linkIdx = parseInt(req.params.linkIndex);
    const link    = log.links?.[linkIdx];
    if (link) {
      await MessageLog.findByIdAndUpdate(log._id, {
        $inc: { [`links.${linkIdx}.clicks`]: 1 },
        clickedAt: new Date(),
        status: 'clicked',
      });
      await AnalyticsEvent.create({ userId: log.userId, campaignId: log.campaignId, messageId: log._id, event: 'clicked' });
      return res.redirect(link.original);
    }
  }
  res.redirect('/');
});

// ═══════════════════════════════════════════════════════════
// SMS ROUTES
// ═══════════════════════════════════════════════════════════
const smsRouter = express.Router();
smsRouter.use(authenticate);

smsRouter.post('/send', async (req, res) => {
  const { to, message, from } = req.body;
  const result = await SmsService.send(to, message, from);
  res.json({ success: true, data: result });
});

smsRouter.post('/bulk', async (req, res) => {
  const { phones, message, listId } = req.body;
  let contacts = [];

  if (phones?.length) contacts = phones.map(p => ({ phone: p, name: 'User', status: 'active' }));
  else if (listId)   contacts = await Contact.find({ userId: req.user._id, lists: listId, status: 'active' });

  const campaign = await Campaign.create({
    userId:  req.user._id,
    name:    `SMS Bulk ${new Date().toLocaleDateString()}`,
    type:    'sms',
    content: { body: message },
    status:  'running',
  });

  const job = await smsQueue.add('bulk-send', { campaignId: campaign._id.toString(), contacts }, { attempts: 2 });
  res.json({ success: true, campaignId: campaign._id, jobId: job.id, recipients: contacts.length });
});

// ═══════════════════════════════════════════════════════════
// ACCOUNTS ROUTES
// ═══════════════════════════════════════════════════════════
const accountRouter = express.Router();
accountRouter.use(authenticate);

accountRouter.get('/', async (req, res) => {
  const { platform } = req.query;
  const q = { userId: req.user._id };
  if (platform) q.platform = platform;
  const accounts = await Account.find(q).select('-credentials.password -credentials.sessionData');
  res.json({ success: true, data: accounts });
});

accountRouter.post('/', async (req, res) => {
  const account = await Account.create({ ...req.body, userId: req.user._id });
  res.status(201).json({ success: true, data: account });
});

accountRouter.put('/:id', authenticate, async (req, res) => {
  const account = await Account.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, req.body, { new: true });
  res.json({ success: true, data: account });
});

accountRouter.delete('/:id', authenticate, async (req, res) => {
  await Account.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  res.json({ success: true, message: 'Account removed' });
});

// Health check all accounts
accountRouter.post('/health-check', authenticate, async (req, res) => {
  const accounts = await Account.find({ userId: req.user._id });
  const results  = [];

  for (const account of accounts) {
    let health = 100;
    const pct  = account.limits.dailySent / (account.limits.dailyLimit || 1000);
    if (pct > 0.9) health = 60;
    if (pct > 1)   health = 20;
    if (account.status === 'blocked') health = 0;

    await Account.findByIdAndUpdate(account._id, { health });
    results.push({ id: account._id, platform: account.platform, health, status: account.status });
  }

  res.json({ success: true, data: results });
});

// SIM accounts
accountRouter.get('/sims', async (req, res) => {
  const sims = await SimAccount.find({ userId: req.user._id });
  res.json({ success: true, data: sims });
});

accountRouter.post('/sims/:id/rotate', authenticate, async (req, res) => {
  const sim = await SimAccount.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { status: 'rotating', lastUsed: new Date(), $inc: { useCount: 1 } },
    { new: true }
  );
  if (!sim) return res.status(404).json({ success: false, message: 'SIM not found' });

  // In real impl: call provider API to rotate/refresh number
  setTimeout(async () => {
    await SimAccount.findByIdAndUpdate(sim._id, { status: 'active' });
  }, 5000);

  res.json({ success: true, message: 'SIM rotation initiated', data: sim });
});

// ═══════════════════════════════════════════════════════════
// ANALYTICS ROUTES
// ═══════════════════════════════════════════════════════════
const analyticsRouter = express.Router();
analyticsRouter.use(authenticate);

analyticsRouter.get('/overview', async (req, res) => {
  const { period = '30d' } = req.query;
  const days    = parseInt(period) || 30;
  const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const userId  = req.user._id;

  const cacheKey = `analytics:overview:${userId}:${period}`;
  const cached   = await cache.get(cacheKey);
  if (cached) return res.json(cached);

  const [
    totalContacts, activeCampaigns, totalMessages,
    messagesByPlatform, eventStats, recentCampaigns
  ] = await Promise.all([
    Contact.countDocuments({ userId }),
    Campaign.countDocuments({ userId, status: { $in: ['running','scheduled'] } }),
    MessageLog.countDocuments({ userId, createdAt: { $gte: fromDate } }),
    MessageLog.aggregate([
      { $match: { userId, createdAt: { $gte: fromDate } } },
      { $group: { _id: '$platform', count: { $sum: 1 }, delivered: { $sum: { $cond: [{ $in: ['$status', ['delivered','read','opened']] }, 1, 0] } } } }
    ]),
    AnalyticsEvent.aggregate([
      { $match: { userId, date: { $gte: fromDate } } },
      { $group: { _id: '$event', count: { $sum: 1 } } }
    ]),
    Campaign.find({ userId }).sort('-createdAt').limit(10).lean()
  ]);

  const eventMap = {};
  eventStats.forEach(e => { eventMap[e._id] = e.count; });

  const result = {
    success: true,
    data: {
      summary: {
        totalContacts,
        activeCampaigns,
        totalMessages,
        deliveryRate: totalMessages ? Math.round((eventMap.delivered || 0) / totalMessages * 100) : 0,
        openRate:     totalMessages ? Math.round((eventMap.opened || 0)   / totalMessages * 100) : 0,
        clickRate:    totalMessages ? Math.round((eventMap.clicked || 0)  / totalMessages * 100) : 0,
      },
      byPlatform:     messagesByPlatform,
      eventStats:     eventMap,
      recentCampaigns,
    }
  };

  await cache.set(cacheKey, result, 300);
  res.json(result);
});

analyticsRouter.get('/campaign/:id', authenticate, async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
  if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

  const [statusBreakdown, dailyStats] = await Promise.all([
    MessageLog.aggregate([
      { $match: { campaignId: campaign._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    AnalyticsEvent.aggregate([
      { $match: { campaignId: campaign._id } },
      { $group: {
        _id:   { date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, event: '$event' },
        count: { $sum: 1 }
      }},
      { $sort: { '_id.date': 1 } }
    ])
  ]);

  res.json({ success: true, data: { campaign, statusBreakdown, dailyStats } });
});

// ═══════════════════════════════════════════════════════════
// AI ROUTES
// ═══════════════════════════════════════════════════════════
const aiRouter = express.Router();
aiRouter.use(authenticate);

aiRouter.post('/generate', async (req, res) => {
  const { type, platform, tone, language, length, context, keywords } = req.body;

  const result = await AIService.generateContent({ type, platform, tone, language, length, context, keywords });
  res.json({ success: true, data: result });
});

aiRouter.post('/subject-lines', async (req, res) => {
  const { topic, tone, count = 5 } = req.body;
  const subjects = await AIService.generateSubjectLines(topic, tone, count);
  res.json({ success: true, data: subjects });
});

aiRouter.post('/personalize', async (req, res) => {
  const { template, contactData } = req.body;
  const personalized = personalizeText(template, contactData);
  res.json({ success: true, data: { personalized } });
});

aiRouter.post('/analyze-sentiment', async (req, res) => {
  const { text } = req.body;
  const result  = await AIService.analyzeSentiment(text);
  res.json({ success: true, data: result });
});

aiRouter.post('/chatbot', async (req, res) => {
  const { message, history, systemPrompt } = req.body;
  const reply = await AIService.chat(message, history, systemPrompt);
  res.json({ success: true, data: { reply } });
});

// ═══════════════════════════════════════════════════════════
// SECURITY ROUTES
// ═══════════════════════════════════════════════════════════
const securityRouter = express.Router();
securityRouter.use(authenticate);

securityRouter.get('/overview', async (req, res) => {
  const [accounts, proxies] = await Promise.all([
    Account.find({ userId: req.user._id }).select('platform status health'),
    Proxy.find({ $or: [{ userId: req.user._id }, { userId: null }] }).select('country health isActive'),
  ]);

  const avgHealth = accounts.reduce((sum, a) => sum + (a.health || 100), 0) / (accounts.length || 1);
  const blockedCount = accounts.filter(a => a.status === 'blocked').length;
  const securityScore = Math.max(0, Math.min(100, Math.round(avgHealth - blockedCount * 10)));

  res.json({
    success: true,
    data: {
      securityScore,
      accounts:     accounts.length,
      blocked:      blockedCount,
      healthyProxies: proxies.filter(p => p.isActive && p.health > 80).length,
      totalProxies:   proxies.length,
      antiDetection:  true,
      ipRotation:     true,
      captchaSolver:  !!process.env.TWOCAPTCHA_API_KEY,
    }
  });
});

securityRouter.get('/proxies', async (req, res) => {
  const proxies = await Proxy.find({ isActive: true }).select('-password');
  res.json({ success: true, data: proxies });
});

securityRouter.post('/proxies', async (req, res) => {
  const proxy   = await Proxy.create({ ...req.body, userId: req.user._id });
  const checked = await ProxyService.checkProxy(proxy);
  await Proxy.findByIdAndUpdate(proxy._id, { health: checked.health, latencyMs: checked.latencyMs, lastChecked: new Date() });
  res.status(201).json({ success: true, data: proxy });
});

securityRouter.post('/proxies/rotate/:accountId', authenticate, async (req, res) => {
  const account  = await Account.findOne({ _id: req.params.accountId, userId: req.user._id });
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

  const newProxy = await ProxyService.getHealthyProxy(account.proxy?.country);
  await Account.findByIdAndUpdate(account._id, { proxy: newProxy });

  res.json({ success: true, message: 'Proxy rotated', newProxy: `${newProxy.host}:${newProxy.port}` });
});

// ═══════════════════════════════════════════════════════════
// WEBHOOK ROUTES
// ═══════════════════════════════════════════════════════════
const webhookRouter = express.Router();
webhookRouter.use(authenticate);

webhookRouter.get('/', async (req, res) => {
  const hooks = await Webhook.find({ userId: req.user._id });
  res.json({ success: true, data: hooks });
});

webhookRouter.post('/', async (req, res) => {
  const hook = await Webhook.create({ ...req.body, userId: req.user._id, secret: crypto.randomBytes(16).toString('hex') });
  res.status(201).json({ success: true, data: hook });
});

webhookRouter.delete('/:id', authenticate, async (req, res) => {
  await Webhook.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  res.json({ success: true, message: 'Webhook deleted' });
});

// Inbound webhook from platforms (no auth)
const inboundWebhookRouter = express.Router();

inboundWebhookRouter.post('/email/bounce', async (req, res) => {
  const events = req.body;
  for (const event of (Array.isArray(events) ? events : [events])) {
    if (event.event === 'bounce' || event.event === 'dropped') {
      await EmailService.handleBounce(event.email, 'bounce');
    } else if (event.event === 'unsubscribe' || event.event === 'spamreport') {
      await EmailService.handleBounce(event.email, 'complaint');
    }
  }
  res.sendStatus(200);
});

inboundWebhookRouter.post('/twilio/sms', async (req, res) => {
  const { From, Body, MessageSid } = req.body;
  await MessageLog.create({ platform: 'sms', direction: 'inbound', from: From, body: Body, externalId: MessageSid });
  res.set('Content-Type', 'text/xml').send('<?xml version="1.0"?><Response></Response>');
});

// ═══════════════════════════════════════════════════════════
// SCHEDULER ROUTES
// ═══════════════════════════════════════════════════════════
const schedulerRouter = express.Router();
schedulerRouter.use(authenticate);

schedulerRouter.get('/queue', async (req, res) => {
  const campaigns = await Campaign.find({ userId: req.user._id, status: { $in: ['scheduled','running'] } }).sort('schedule.sendAt');
  res.json({ success: true, data: campaigns });
});

schedulerRouter.post('/schedule/:campaignId', authenticate, async (req, res) => {
  const { sendAt, timezone, recurring } = req.body;
  const campaign = await Campaign.findOneAndUpdate(
    { _id: req.params.campaignId, userId: req.user._id },
    { status: 'scheduled', schedule: { sendAt: new Date(sendAt), timezone, recurring } },
    { new: true }
  );
  if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
  res.json({ success: true, data: campaign, message: `Scheduled for ${new Date(sendAt).toLocaleString()}` });
});

// ═══════════════════════════════════════════════════════════
// MEDIA ROUTES
// ═══════════════════════════════════════════════════════════
const mediaRouter = express.Router();
mediaRouter.use(authenticate);

mediaRouter.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const url = `${process.env.BASE_URL || 'http://localhost:5000'}/uploads/${req.file.filename}`;
  res.json({ success: true, url, filename: req.file.filename, mimetype: req.file.mimetype, size: req.file.size });
});

// ═══════════════════════════════════════════════════════════
// SOCIAL ROUTES
// ═══════════════════════════════════════════════════════════
const socialRouter = express.Router();
socialRouter.use(authenticate);

socialRouter.post('/post', async (req, res) => {
  const { platform, accountId, text, media, scheduled } = req.body;

  if (scheduled) {
    const campaign = await Campaign.create({
      userId:   req.user._id,
      name:     `${platform} Post ${new Date().toLocaleDateString()}`,
      type:     platform,
      content:  { body: text, media: media || [] },
      status:   'scheduled',
      schedule: { sendAt: new Date(scheduled) },
    });
    return res.json({ success: true, message: 'Post scheduled', data: campaign });
  }

  const result = await SocialService.post(platform, accountId, { text, media });
  res.json({ success: true, data: result });
});

// Auto-reply rules
socialRouter.get('/auto-reply', authenticate, async (req, res) => {
  const rules = await AutoReply.find({ userId: req.user._id });
  res.json({ success: true, data: rules });
});

socialRouter.post('/auto-reply', authenticate, async (req, res) => {
  const rule = await AutoReply.create({ ...req.body, userId: req.user._id });
  res.status(201).json({ success: true, data: rule });
});

// ═══════════════════════════════════════════════════════════
// TELEGRAM ROUTES
// ═══════════════════════════════════════════════════════════
const telegramRouter = express.Router();
telegramRouter.use(authenticate);

telegramRouter.post('/send', async (req, res) => {
  const { chatId, message, parseMode = 'HTML' } = req.body;
  const TelegramService = require('../services/telegram.service');
  const result = await TelegramService.sendMessage(chatId, message, { parse_mode: parseMode });
  res.json({ success: true, data: result });
});

telegramRouter.post('/broadcast', async (req, res) => {
  const { chatIds, message } = req.body;
  const TelegramService = require('../services/telegram.service');
  const results = [];
  for (const chatId of chatIds) {
    const r = await TelegramService.sendMessage(chatId, message).catch(e => ({ error: e.message }));
    results.push({ chatId, ...r });
    await delay(500);
  }
  res.json({ success: true, data: results });
});

// ─────────────────────────────────────────────────────────
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════
// EXPORTS — wire into server.js
// ═══════════════════════════════════════════════════════════
module.exports = {
  authRoutes:      authRouter,
  contactRoutes:   contactRouter,
  campaignRoutes:  campaignRouter,
  whatsappRoutes:  whatsappRouter,
  emailRoutes:     emailRouter,
  smsRoutes:       smsRouter,
  accountRoutes:   accountRouter,
  analyticsRoutes: analyticsRouter,
  aiRoutes:        aiRouter,
  securityRoutes:  securityRouter,
  webhookRoutes:   webhookRouter,
  inboundWebhookRoutes: inboundWebhookRouter,
  schedulerRoutes: schedulerRouter,
  mediaRoutes:     mediaRouter,
  socialRoutes:    socialRouter,
  telegramRoutes:  telegramRouter,
};
