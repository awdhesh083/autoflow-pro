const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

// ─────────────────────────────────────────────────────────
// USER MODEL
// ─────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, unique: true, lowercase: true },
  password:      { type: String, required: true, minlength: 8, select: false },
  role:          { type: String, enum: ['admin','manager','user'], default: 'user' },
  plan:          { type: String, enum: ['free','starter','pro','enterprise'], default: 'free' },
  apiKey:        { type: String, unique: true, sparse: true },
  avatar:        String,
  isActive:      { type: Boolean, default: true },
  lastLogin:     Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil:     Date,
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret:  String,
  twoFactorBackupCodes: [{ code: String, used: { type: Boolean, default: false } }],
  emailVerified:    { type: Boolean, default: false },
  emailVerifyToken: String,
  emailVerifyExpires: Date,
  passwordResetToken:   String,
  passwordResetExpires: Date,
  pushSubscriptions: [{ endpoint: String, keys: mongoose.Schema.Types.Mixed, createdAt: { type: Date, default: Date.now } }],
  webhooks:      [{ url: String, events: [String], active: { type: Boolean, default: true } }],
  settings: {
    timezone:    { type: String, default: 'UTC' },
    language:    { type: String, default: 'en' },
    notifications: { email: Boolean, push: Boolean, sms: Boolean },
  }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(pw) {
  return bcrypt.compare(pw, this.password);
};

userSchema.methods.isLocked = function() {
  return this.lockUntil && this.lockUntil > Date.now();
};

// ─────────────────────────────────────────────────────────
// CONTACT MODEL
// ─────────────────────────────────────────────────────────
const contactSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:        { type: String, required: true, trim: true },
  phone:       { type: String, trim: true },
  email:       { type: String, lowercase: true, trim: true },
  company:     String,
  country:     String,
  language:    { type: String, default: 'en' },
  tags:        [{ type: String }],
  customFields: mongoose.Schema.Types.Mixed,
  lists:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' }],
  status:      { type: String, enum: ['active','paused','unsubscribed','bounced','blocked'], default: 'active' },
  waEnabled:   { type: Boolean, default: false },
  waStatus:    { type: String, enum: ['unknown','valid','invalid'], default: 'unknown' },
  subscribed:  { type: Boolean, default: true },
  source:      { type: String, enum: ['manual','import','api','webhook','form','campaign'], default: 'manual' },
  score:       { type: Number, default: 0 },    // engagement score
  lastContacted: Date,
  notes:       String,
  avatar:      String,
  stats: {
    emailsSent:     { type: Number, default: 0 },
    emailsOpened:   { type: Number, default: 0 },
    emailsClicked:  { type: Number, default: 0 },
    waSent:         { type: Number, default: 0 },
    waDelivered:    { type: Number, default: 0 },
    waRead:         { type: Number, default: 0 },
    smsSent:        { type: Number, default: 0 },
    repliesReceived:{ type: Number, default: 0 },
  }
}, { timestamps: true });

contactSchema.index({ userId: 1, phone: 1 });
contactSchema.index({ userId: 1, email: 1 });
contactSchema.index({ userId: 1, tags: 1 });

// ─────────────────────────────────────────────────────────
// CONTACT LIST MODEL
// ─────────────────────────────────────────────────────────
const contactListSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:     { type: String, required: true },
  description: String,
  count:    { type: Number, default: 0 },
  tags:     [String],
  color:    String,
}, { timestamps: true });

// ─────────────────────────────────────────────────────────
// CAMPAIGN MODEL
// ─────────────────────────────────────────────────────────
const campaignSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:        { type: String, required: true },
  type:        { type: String, enum: ['whatsapp','email','sms','instagram','facebook','twitter','telegram','linkedin','multi'], required: true },
  status:      { type: String, enum: ['draft','scheduled','running','paused','completed','failed','cancelled'], default: 'draft' },
  content: {
    subject:   String,         // email subject
    body:      { type: String, required: true },
    html:      String,         // for email HTML
    media:     [{ url: String, type: String, caption: String }],
    variables: [String],       // e.g. ['name','email','company']
    buttons:   [{ text: String, url: String, type: String }],
  },
  audience: {
    listIds:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' }],
    contactIds:[{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
    filters:   mongoose.Schema.Types.Mixed,  // { tag: 'VIP', status: 'active' }
    totalCount:{ type: Number, default: 0 },
  },
  schedule: {
    sendAt:    Date,
    timezone:  { type: String, default: 'UTC' },
    recurring: {
      enabled:   { type: Boolean, default: false },
      frequency: { type: String, enum: ['daily','weekly','monthly'] },
      days:      [Number],
      time:      String,
      endDate:   Date,
    }
  },
  settings: {
    fromName:      String,
    fromEmail:     String,
    replyTo:       String,
    trackOpens:    { type: Boolean, default: true },
    trackClicks:   { type: Boolean, default: true },
    sendRate:      { type: Number, default: 500 },     // per hour
    delayMin:      { type: Number, default: 2000 },    // ms between messages
    delayMax:      { type: Number, default: 8000 },
    retryFailed:   { type: Boolean, default: true },
    retryCount:    { type: Number, default: 3 },
    smtpProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'SmtpProfile' },
    waAccountId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    rotateAccounts:{ type: Boolean, default: false },
    stopOnReply:   { type: Boolean, default: false },
    unsubHeader:   { type: Boolean, default: true },
    abTest: {
      enabled:   { type: Boolean, default: false },
      variants:  [{ name: String, subject: String, body: String, weight: Number }],
      winner:    String,
    }
  },
  stats: {
    totalSent:     { type: Number, default: 0 },
    delivered:     { type: Number, default: 0 },
    failed:        { type: Number, default: 0 },
    opened:        { type: Number, default: 0 },
    clicked:       { type: Number, default: 0 },
    replied:       { type: Number, default: 0 },
    unsubscribed:  { type: Number, default: 0 },
    bounced:       { type: Number, default: 0 },
    read:          { type: Number, default: 0 },
    conversions:   { type: Number, default: 0 },
    revenue:       { type: Number, default: 0 },
    progress:      { type: Number, default: 0 },  // 0-100%
    startedAt:     Date,
    completedAt:   Date,
    estimatedEndAt:Date,
    lastError:     String,
  },
  jobId:       String,   // Bull queue job ID
  tags:        [String],
}, { timestamps: true });

campaignSchema.index({ userId: 1, status: 1 });
campaignSchema.index({ userId: 1, type: 1 });
campaignSchema.index({ 'schedule.sendAt': 1, status: 1 });

// ─────────────────────────────────────────────────────────
// MESSAGE LOG MODEL
// ─────────────────────────────────────────────────────────
const messageLogSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  campaignId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', index: true },
  contactId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  platform:    { type: String, enum: ['whatsapp','email','sms','instagram','facebook','twitter','telegram','linkedin'] },
  direction:   { type: String, enum: ['outbound','inbound'], default: 'outbound' },
  to:          String,   // phone/email/username
  from:        String,
  subject:     String,
  body:        String,
  status:      { type: String, enum: ['queued','sent','delivered','read','failed','bounced','unsubscribed','replied'], default: 'queued' },
  externalId:  String,   // platform message ID
  errorMessage:String,
  metadata:    mongoose.Schema.Types.Mixed,
  openedAt:    Date,
  clickedAt:   Date,
  deliveredAt: Date,
  repliedAt:   Date,
  links:       [{ original: String, shortened: String, clicks: { type: Number, default: 0 } }],
}, { timestamps: true });

messageLogSchema.index({ userId: 1, platform: 1, createdAt: -1 });
messageLogSchema.index({ campaignId: 1, status: 1 });

// ─────────────────────────────────────────────────────────
// ACCOUNT MODEL (Social media / WA / email accounts)
// ─────────────────────────────────────────────────────────
const accountSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  platform: { type: String, enum: ['whatsapp','instagram','facebook','twitter','telegram','linkedin','tiktok','youtube','discord','pinterest','email','sms'], required: true },
  label:    String,
  username: String,
  phone:    String,
  email:    String,
  status:   { type: String, enum: ['active','paused','blocked','warming','disconnected','expired'], default: 'active' },
  health:   { type: Number, default: 100, min: 0, max: 100 },
  credentials: {
    accessToken:  String,
    refreshToken: String,
    tokenExpiry:  Date,
    sessionData:  mongoose.Schema.Types.Mixed,   // WA session, cookies etc
    apiKey:       String,
    appId:        String,
    appSecret:    String,
    username:     String,
    password:     String,   // stored encrypted
  },
  proxy:     { host: String, port: Number, username: String, password: String, country: String },
  simId:     { type: mongoose.Schema.Types.ObjectId, ref: 'SimAccount' },
  limits: {
    dailySent:   { type: Number, default: 0 },
    hourlySent:  { type: Number, default: 0 },
    dailyLimit:  { type: Number, default: 1000 },
    hourlyLimit: { type: Number, default: 100 },
    lastReset:   Date,
  },
  warmup: {
    active:    { type: Boolean, default: false },
    day:       { type: Number, default: 1 },
    startedAt: Date,
  },
  stats: {
    totalSent:     { type: Number, default: 0 },
    totalReceived: { type: Number, default: 0 },
    blocksAvoided: { type: Number, default: 0 },
    uptime:        { type: Number, default: 100 },
  },
  lastActive: Date,
  notes:      String,
}, { timestamps: true });

// ─────────────────────────────────────────────────────────
// SIM ACCOUNT MODEL
// ─────────────────────────────────────────────────────────
const simAccountSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  number:   { type: String, required: true },
  country:  String,
  countryCode: String,
  provider: { type: String, enum: ['twilio','5sim','sms-activate','textnow','virtual','custom'], default: 'virtual' },
  providerId: String,
  status:   { type: String, enum: ['active','standby','rotating','blocked','expired'], default: 'active' },
  health:   { type: Number, default: 100 },
  boundTo:  { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  cost:     { type: Number, default: 0 },
  expiresAt:Date,
  lastUsed: Date,
  useCount: { type: Number, default: 0 },
}, { timestamps: true });

// ─────────────────────────────────────────────────────────
// SMTP PROFILE MODEL
// ─────────────────────────────────────────────────────────
const smtpProfileSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:     { type: String, required: true },
  provider: { type: String, enum: ['smtp','sendgrid','mailgun','ses','postmark','custom'], default: 'smtp' },
  host:     String,
  port:     { type: Number, default: 587 },
  secure:   { type: Boolean, default: false },
  auth: { user: String, pass: String },
  fromName:  String,
  fromEmail: String,
  apiKey:    String,   // for SendGrid/Mailgun
  domain:    String,   // for Mailgun
  region:    String,   // for SES
  isDefault: { type: Boolean, default: false },
  isVerified:{ type: Boolean, default: false },
  dailySent: { type: Number, default: 0 },
  dailyLimit:{ type: Number, default: 500 },
  status:    { type: String, enum: ['active','suspended','unverified'], default: 'unverified' },
}, { timestamps: true });

// ─────────────────────────────────────────────────────────
// AUTO-REPLY RULE MODEL
// ─────────────────────────────────────────────────────────
const autoReplySchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  platform:  String,
  name:      { type: String, required: true },
  isActive:  { type: Boolean, default: true },
  trigger: {
    type:     { type: String, enum: ['keyword','all','intent','regex','button'], default: 'all' },
    keywords: [String],
    regex:    String,
    intent:   String,
    caseSensitive: { type: Boolean, default: false },
  },
  response: {
    type:     { type: String, enum: ['text','template','ai','sequence'], default: 'text' },
    text:     String,
    template: String,
    buttons:  [{ text: String, url: String }],
    media:    [{ url: String, type: String }],
    aiPrompt: String,
    sequenceId: { type: mongoose.Schema.Types.ObjectId },
    delay:    { type: Number, default: 0 },   // ms
  },
  conditions: {
    businessHours:  { type: Boolean, default: false },
    startHour:  Number,
    endHour:    Number,
    timezone:   String,
    weekdays:   [Number],
    maxReplies: Number,   // max per contact per day
  },
  stats: {
    triggered:  { type: Number, default: 0 },
    replied:    { type: Number, default: 0 },
    leadsGen:   { type: Number, default: 0 },
  },
  priority: { type: Number, default: 0 },
}, { timestamps: true });

// ─────────────────────────────────────────────────────────
// WEBHOOK MODEL
// ─────────────────────────────────────────────────────────
const webhookSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:       String,
  url:        { type: String, required: true },
  events:     [{ type: String }],
  secret:     String,
  isActive:   { type: Boolean, default: true },
  headers:    mongoose.Schema.Types.Mixed,
  retryCount: { type: Number, default: 3 },
  stats: {
    totalSent: { type: Number, default: 0 },
    failed:    { type: Number, default: 0 },
    lastSent:  Date,
    lastStatus:Number,
  }
}, { timestamps: true });

// ─────────────────────────────────────────────────────────
// PROXY MODEL
// ─────────────────────────────────────────────────────────
const proxySchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  host:      { type: String, required: true },
  port:      { type: Number, required: true },
  username:  String,
  password:  String,
  protocol:  { type: String, enum: ['http','https','socks4','socks5'], default: 'http' },
  country:   String,
  city:      String,
  type:      { type: String, enum: ['residential','datacenter','mobile'], default: 'residential' },
  provider:  String,
  isActive:  { type: Boolean, default: true },
  health:    { type: Number, default: 100 },
  latencyMs: Number,
  lastChecked:Date,
  assignedTo:{ type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  useCount:  { type: Number, default: 0 },
  failCount: { type: Number, default: 0 },
}, { timestamps: true });

// ─────────────────────────────────────────────────────────
// ANALYTICS EVENT MODEL (time-series)
// ─────────────────────────────────────────────────────────
const analyticsEventSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  campaignId:{ type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', index: true },
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageLog' },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  platform:  String,
  event:     { type: String, enum: ['sent','delivered','opened','clicked','replied','bounced','unsubscribed','converted','blocked'], index: true },
  value:     Number,
  meta:      mongoose.Schema.Types.Mixed,
  ip:        String,
  userAgent: String,
  date:      { type: Date, default: Date.now, index: true },
}, { timestamps: false });

analyticsEventSchema.index({ userId: 1, event: 1, date: -1 });
analyticsEventSchema.index({ campaignId: 1, event: 1 });

// ─────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────
module.exports = {
  User:           mongoose.model('User',           userSchema),
  Contact:        mongoose.model('Contact',        contactSchema),
  ContactList:    mongoose.model('ContactList',    contactListSchema),
  Campaign:       mongoose.model('Campaign',       campaignSchema),
  MessageLog:     mongoose.model('MessageLog',     messageLogSchema),
  Account:        mongoose.model('Account',        accountSchema),
  SimAccount:     mongoose.model('SimAccount',     simAccountSchema),
  SmtpProfile:    mongoose.model('SmtpProfile',    smtpProfileSchema),
  AutoReply:      mongoose.model('AutoReply',      autoReplySchema),
  Webhook:        mongoose.model('Webhook',        webhookSchema),
  Proxy:          mongoose.model('Proxy',          proxySchema),
  AnalyticsEvent: mongoose.model('AnalyticsEvent', analyticsEventSchema),
};
