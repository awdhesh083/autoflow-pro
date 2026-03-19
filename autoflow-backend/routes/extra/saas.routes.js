'use strict';
/**
 * SaaS Routes  —  /api/v1/saas
 * Multi-tenant billing, subscriptions, team management, usage tracking,
 * white-label branding, affiliate system, Stripe webhooks.
 */
const express = require('express');
const { body } = require('express-validator');
const { authenticate, validate } = require('../../middleware/auth');
const { SaaSService, Tenant, TeamMember, PLANS, usageGuard, featureGuard } = require('../../services/saas.service');

const router = express.Router();

// ── No-auth routes ────────────────────────────────────────────────────────

// GET /plans — public pricing page data
router.get('/plans', (_req, res) => {
  const plans = Object.entries(PLANS).map(([key, plan]) => ({
    id:    key,
    name:  plan.name,
    price: plan.price,
    limits:   plan.limits,
    features: plan.features,
  }));
  res.json({ success: true, data: plans });
});

// POST /webhook/stripe — Stripe event receiver (no auth, Stripe HMAC verified)
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ success: false, message: 'Missing stripe-signature header' });
  try {
    await SaaSService.handleStripeWebhook(req.body, sig);
    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── Authenticated routes ──────────────────────────────────────────────────
router.use(authenticate);

// GET /me — current tenant + plan info
router.get('/me', async (req, res) => {
  const tenant = await Tenant.findOne({ ownerId: req.user._id }).lean();
  if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found. Use POST /saas/onboard to create one.' });
  const plan = PLANS[tenant.plan] || PLANS.free;
  res.json({ success: true, data: { tenant, plan } });
});

// POST /onboard — create tenant on first sign-up
router.post('/onboard', async (req, res) => {
  const existing = await Tenant.findOne({ ownerId: req.user._id });
  if (existing) return res.json({ success: true, data: existing, message: 'Tenant already exists' });
  const tenant = await SaaSService.createTenant(req.user, req.body);
  res.status(201).json({ success: true, data: tenant });
});

// ── Billing ───────────────────────────────────────────────────────────────
router.post('/subscribe',
  [body('plan').isIn(['starter','pro','enterprise']), body('successUrl').isURL(), body('cancelUrl').isURL()],
  validate,
  async (req, res) => {
    const { plan, successUrl, cancelUrl } = req.body;
    const tenant = await Tenant.findOne({ ownerId: req.user._id });
    if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
    const session = await SaaSService.createCheckoutSession(tenant._id, plan, successUrl, cancelUrl);
    res.json({ success: true, data: session });
  }
);

router.post('/billing-portal', async (req, res) => {
  const { returnUrl } = req.body;
  const tenant  = await Tenant.findOne({ ownerId: req.user._id });
  if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
  const session = await SaaSService.createBillingPortal(tenant._id, returnUrl);
  res.json({ success: true, data: session });
});

// ── Usage ─────────────────────────────────────────────────────────────────
router.get('/usage', async (req, res) => {
  const tenant = await Tenant.findOne({ ownerId: req.user._id });
  if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
  const stats = await SaaSService.getUsageStats(tenant._id);
  res.json({ success: true, data: stats });
});

// ── Feature / usage guards — example usage:
// router.post('/some-feature', featureGuard('instagram'), usageGuard('waMessages'), handler)

// ── Team members ──────────────────────────────────────────────────────────
router.get('/team', async (req, res) => {
  const tenant  = await Tenant.findOne({ ownerId: req.user._id });
  if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
  const members = await TeamMember.find({ tenantId: tenant._id }).populate('userId', 'name email avatar');
  res.json({ success: true, data: members });
});

router.post('/team/invite',
  [body('email').isEmail(), body('role').isIn(['admin','manager','member'])],
  validate,
  async (req, res) => {
    const { email, role, permissions } = req.body;
    const tenant = await Tenant.findOne({ ownerId: req.user._id });
    if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
    const result = await SaaSService.inviteTeamMember(tenant._id, req.user._id, email, role, permissions || {});
    res.json({ success: true, data: result });
  }
);

router.post('/team/accept-invite', async (req, res) => {
  const { inviteToken } = req.body;
  if (!inviteToken) return res.status(400).json({ success: false, message: 'inviteToken required' });
  const result = await SaaSService.acceptInvite(inviteToken, req.user._id);
  res.json({ success: true, data: result });
});

router.delete('/team/:memberId', async (req, res) => {
  await TeamMember.findOneAndDelete({ _id: req.params.memberId });
  res.json({ success: true, message: 'Team member removed' });
});

// ── White-label branding ──────────────────────────────────────────────────
router.put('/branding', async (req, res) => {
  const tenant = await Tenant.findOne({ ownerId: req.user._id });
  if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
  const result = await SaaSService.updateBranding(tenant._id, req.body);
  res.json({ success: true, data: result });
});

router.post('/domain/verify', async (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ success: false, message: 'domain required' });
  const tenant = await Tenant.findOne({ ownerId: req.user._id });
  const result = await SaaSService.verifyCustomDomain(tenant._id, domain);
  res.json({ success: true, data: result });
});

// ── Affiliate ─────────────────────────────────────────────────────────────
router.get('/affiliate/stats', async (req, res) => {
  const tenant = await Tenant.findOne({ ownerId: req.user._id });
  if (!tenant) return res.status(404).json({ success: false, message: 'No tenant found' });
  const stats = await SaaSService.getAffiliateStats(tenant._id);
  res.json({ success: true, data: stats });
});

// ── Admin only ────────────────────────────────────────────────────────────
router.get('/admin/tenants', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
  const result = await SaaSService.getAllTenants(req.query);
  res.json({ success: true, data: result });
});

// Re-export middleware for use in other route files
module.exports = { router, usageGuard, featureGuard };
