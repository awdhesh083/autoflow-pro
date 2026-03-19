'use strict';
/**
 * SaaS Billing Routes  —  /api/v1/saas
 *
 * Stripe raw-body webhook is mounted separately at /saas/stripe/webhook
 * BEFORE the JSON body-parser so Stripe signature verification works.
 * In server.js: app.post('/api/v1/saas/stripe/webhook', express.raw({type:'application/json'}), handler)
 */
const express = require('express');
const { body } = require('express-validator');
const { authenticate, validate } = require('../middleware/auth');
const { SaaSService, Tenant, TeamMember, PLANS, usageGuard, featureGuard } = require('../services/saas.service');
const logger = require('../utils/logger');

const router = express.Router();

// ── Public ────────────────────────────────────────────────────────────────
router.get('/plans', (_req, res) => {
  const publicPlans = Object.entries(PLANS).map(([key, p]) => ({
    key,
    name:    p.name,
    price:   p.price,
    limits:  p.limits,
    features:p.features,
  }));
  res.json({ success: true, data: publicPlans });
});

// Accept team invite (uses token, no auth required at first)
router.post('/invite/accept', async (req, res) => {
  const { token, userId } = req.body;
  if (!token) return res.status(400).json({ success: false, message: 'token required' });
  const result = await SaaSService.acceptInvite(token, userId);
  res.json({ success: true, data: result });
});

// Affiliate ref link
router.get('/ref/:code', async (req, res) => {
  res.redirect(`/?ref=${req.params.code}`);
});

// ── Stripe webhook — raw body required, NO authenticate ───────────────────
// NOTE: This must be registered in server.js with express.raw() BEFORE express.json():
//   app.post('/api/v1/saas/stripe/webhook', express.raw({type:'*/*'}), async (req, res) => {...})
// The handler below is exported for use in server.js
router.post('/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    if (!sig) return res.status(400).json({ success: false, message: 'Missing stripe-signature' });
    try {
      const result = await SaaSService.handleStripeWebhook(req.body, sig);
      res.json({ success: true, received: true, result });
    } catch (err) {
      logger.error(`Stripe webhook error: ${err.message}`);
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

// ── Authenticated routes ───────────────────────────────────────────────────
router.use(authenticate);

// ── Tenant ─────────────────────────────────────────────────────────────────
router.get('/tenant', async (req, res) => {
  const tenant = await Tenant.findOne({ ownerId: req.user._id })
    .populate('teamMembers.userId', 'name email');
  if (!tenant) return res.json({ success: true, data: null, hasTenant: false });
  res.json({ success: true, data: tenant, hasTenant: true });
});

router.post('/tenant', async (req, res) => {
  const existing = await Tenant.findOne({ ownerId: req.user._id });
  if (existing) return res.status(409).json({ success: false, message: 'Tenant already exists' });
  const tenant = await SaaSService.createTenant(req.user, req.body);
  res.status(201).json({ success: true, data: tenant });
});

router.put('/tenant', async (req, res) => {
  const tenant = await Tenant.findOneAndUpdate({ ownerId: req.user._id }, req.body, { new: true });
  if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
  res.json({ success: true, data: tenant });
});

// ── Usage & Limits ─────────────────────────────────────────────────────────
router.get('/usage', async (req, res) => {
  const tenant = await Tenant.findOne({ ownerId: req.user._id });
  if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
  const stats = await SaaSService.getUsageStats(tenant._id);
  res.json({ success: true, data: stats });
});

// Check specific feature access
router.get('/access/:feature', async (req, res) => {
  const tenant = await Tenant.findOne({ ownerId: req.user._id });
  if (!tenant) return res.json({ success: true, allowed: false, reason: 'No tenant' });
  const allowed = await SaaSService.checkFeatureAccess(tenant._id, req.params.feature);
  res.json({ success: true, allowed });
});

// ── Billing ────────────────────────────────────────────────────────────────
router.post('/checkout',
  [body('plan').isIn(Object.keys(PLANS)), body('successUrl').isURL(), body('cancelUrl').isURL()],
  validate,
  async (req, res) => {
    const { plan, successUrl, cancelUrl } = req.body;
    const tenant = await Tenant.findOne({ ownerId: req.user._id });
    if (!tenant) return res.status(404).json({ success: false, message: 'Create a tenant first' });
    const session = await SaaSService.createCheckoutSession(tenant._id, plan, successUrl, cancelUrl);
    res.json({ success: true, data: session });
  }
);

router.post('/billing-portal', async (req, res) => {
  const { returnUrl } = req.body;
  const tenant = await Tenant.findOne({ ownerId: req.user._id });
  if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
  const session = await SaaSService.createBillingPortal(tenant._id, returnUrl || process.env.FRONTEND_URL);
  res.json({ success: true, data: session });
});

router.post('/plan/upgrade',
  [body('plan').isIn(Object.keys(PLANS))],
  validate,
  async (req, res) => {
    const { plan, successUrl, cancelUrl } = req.body;
    const tenant = await Tenant.findOne({ ownerId: req.user._id });
    if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
    if (tenant.plan === plan) return res.status(400).json({ success: false, message: `Already on ${plan} plan` });
    const session = await SaaSService.createCheckoutSession(
      tenant._id, plan,
      successUrl || `${process.env.FRONTEND_URL}/billing/success`,
      cancelUrl  || `${process.env.FRONTEND_URL}/billing`
    );
    res.json({ success: true, data: session, message: `Redirecting to Stripe for ${plan} plan` });
  }
);

// ── Team ───────────────────────────────────────────────────────────────────
router.get('/team', async (req, res) => {
  const tenant = await Tenant.findOne({ ownerId: req.user._id }).populate('teamMembers.userId','name email');
  if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
  res.json({ success: true, data: tenant.teamMembers });
});

router.post('/team/invite',
  [body('email').isEmail()],
  validate,
  async (req, res) => {
    const { email, role, permissions } = req.body;
    const tenant = await Tenant.findOne({ ownerId: req.user._id });
    if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
    const result = await SaaSService.inviteTeamMember(tenant._id, req.user._id, email, role, permissions);
    res.json({ success: true, data: result });
  }
);

router.delete('/team/:memberId', async (req, res) => {
  const tenant = await Tenant.findOne({ ownerId: req.user._id });
  if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
  await Tenant.findByIdAndUpdate(tenant._id, { $pull: { teamMembers: { _id: req.params.memberId } } });
  res.json({ success: true, message: 'Member removed' });
});

router.put('/team/:memberId/permissions', async (req, res) => {
  const tenant = await Tenant.findOneAndUpdate(
    { ownerId: req.user._id, 'teamMembers._id': req.params.memberId },
    { $set: { 'teamMembers.$.permissions': req.body.permissions, 'teamMembers.$.role': req.body.role } },
    { new: true }
  );
  res.json({ success: true, data: tenant });
});

// ── White-label branding ───────────────────────────────────────────────────
router.put('/branding', featureGuard('whiteLabel'), async (req, res) => {
  const tenant = await Tenant.findOne({ ownerId: req.user._id });
  if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
  const updated = await SaaSService.updateBranding(tenant._id, req.body);
  res.json({ success: true, data: updated });
});

router.post('/domain/verify', featureGuard('whiteLabel'), async (req, res) => {
  const { domain } = req.body;
  const tenant = await Tenant.findOne({ ownerId: req.user._id });
  if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
  const result = await SaaSService.verifyCustomDomain(tenant._id, domain);
  res.json({ success: true, data: result });
});

// ── Affiliate ──────────────────────────────────────────────────────────────
router.get('/affiliate', async (req, res) => {
  const tenant = await Tenant.findOne({ ownerId: req.user._id });
  if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
  const stats = await SaaSService.getAffiliateStats(tenant._id);
  res.json({ success: true, data: stats });
});

// ── Admin: all tenants ─────────────────────────────────────────────────────
router.get('/admin/tenants', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
  const { page = 1, limit = 20, plan, status } = req.query;
  const tenants = await SaaSService.getAllTenants({ page: +page, limit: +limit, plan, status });
  res.json({ success: true, data: tenants });
});

module.exports = { router, usageGuard, featureGuard };
