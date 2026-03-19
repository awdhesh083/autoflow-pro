/**
 * ══════════════════════════════════════════════════════════
 * SAAS + ECOMMERCE ROUTES
 * ══════════════════════════════════════════════════════════
 */

const express = require('express');
const jwt     = require('jsonwebtoken');
const { User } = require('../../models');

// ── Auth middleware ───────────────────────────────────────
const authenticate = async (req, res, next) => {
  try {
    let token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : req.headers['x-api-key'];
    if (!token) return res.status(401).json({ success: false, message: 'Auth required' });
    const userByKey = await User.findOne({ apiKey: token, isActive: true });
    if (userByKey) { req.user = userByKey; return next(); }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'Invalid token' });
    req.user = user;
    next();
  } catch { res.status(401).json({ success: false, message: 'Invalid token' }); }
};

const { SaaSService, Tenant, TeamMember, PLANS, usageGuard, featureGuard } = require('../../services/saas.service');
const { EcommerceService, Store, OrderLog } = require('../../services/ecommerce.service');

// ═══════════════════════════════════════════════════════════
// SAAS / BILLING ROUTES
// ═══════════════════════════════════════════════════════════
const saasRouter = express.Router();

// ── Public: plans page ──────────────────────────────────
saasRouter.get('/plans', (req, res) => {
  res.json({ success: true, data: PLANS });
});

// ── Public: accept invite ───────────────────────────────
saasRouter.post('/invite/accept', async (req, res) => {
  const { inviteToken, userId } = req.body;
  const member = await SaaSService.acceptInvite(inviteToken, userId);
  res.json({ success: true, data: member, message: 'Invitation accepted!' });
});

// ── Public: referral landing ────────────────────────────
saasRouter.get('/ref/:code', async (req, res) => {
  const tenant = await Tenant.findOne({ referralCode: req.params.code.toUpperCase() });
  if (!tenant) return res.status(404).json({ success: false, message: 'Invalid referral code' });
  res.json({ success: true, data: { tenantName: tenant.name, code: tenant.referralCode } });
});

// ── Protected routes ─────────────────────────────────────
saasRouter.use(authenticate);

// Get current tenant
saasRouter.get('/tenant', async (req, res) => {
  const member = await TeamMember.findOne({ userId: req.user._id, inviteAccepted: true });
  if (!member) return res.status(404).json({ success: false, message: 'No tenant found' });
  const tenant = await Tenant.findById(member.tenantId);
  res.json({ success: true, data: { tenant, member } });
});

// Create tenant (on first login / registration)
saasRouter.post('/tenant', async (req, res) => {
  const existing = await TeamMember.findOne({ userId: req.user._id });
  if (existing) return res.status(409).json({ success: false, message: 'Already in a tenant' });

  const tenant = await SaaSService.createTenant(req.user, req.body);
  res.status(201).json({ success: true, data: tenant });
});

// Get usage stats
saasRouter.get('/usage', async (req, res) => {
  const member = await TeamMember.findOne({ userId: req.user._id });
  if (!member) return res.status(404).json({ success: false, message: 'No tenant found' });
  const stats = await SaaSService.getUsageStats(member.tenantId);
  res.json({ success: true, data: stats });
});

// Checkout — upgrade plan
saasRouter.post('/checkout', async (req, res) => {
  const { plan, successUrl, cancelUrl } = req.body;
  const member = await TeamMember.findOne({ userId: req.user._id, inviteAccepted: true });
  if (!member) return res.status(404).json({ success: false, message: 'No tenant found' });

  const session = await SaaSService.createCheckoutSession(
    member.tenantId, plan,
    successUrl || `${process.env.BASE_URL}/billing/success`,
    cancelUrl  || `${process.env.BASE_URL}/billing`
  );
  res.json({ success: true, data: session });
});

// Billing portal (manage subscription)
saasRouter.post('/billing-portal', async (req, res) => {
  const member = await TeamMember.findOne({ userId: req.user._id, inviteAccepted: true });
  if (!member) return res.status(404).json({ success: false, message: 'No tenant found' });

  const session = await SaaSService.createBillingPortal(
    member.tenantId,
    req.body.returnUrl || `${process.env.BASE_URL}/billing`
  );
  res.json({ success: true, data: session });
});

// ── Team management ──────────────────────────────────────
saasRouter.get('/team', async (req, res) => {
  const member  = await TeamMember.findOne({ userId: req.user._id });
  if (!member) return res.status(404).json({ success: false, message: 'No tenant found' });

  const members = await TeamMember.find({ tenantId: member.tenantId }).populate('userId', 'name email avatar');
  res.json({ success: true, data: members });
});

saasRouter.post('/team/invite', async (req, res) => {
  const { email, role, permissions } = req.body;
  const member = await TeamMember.findOne({ userId: req.user._id, role: { $in: ['owner','admin'] } });
  if (!member) return res.status(403).json({ success: false, message: 'Admin access required' });

  const result = await SaaSService.inviteTeamMember(member.tenantId, req.user.name, email, role, permissions);
  res.json({ success: true, data: result, message: `Invitation sent to ${email}` });
});

saasRouter.delete('/team/:memberId', authenticate, async (req, res) => {
  const myMember = await TeamMember.findOne({ userId: req.user._id, role: { $in: ['owner','admin'] } });
  if (!myMember) return res.status(403).json({ success: false, message: 'Admin access required' });

  await TeamMember.findOneAndDelete({ _id: req.params.memberId, tenantId: myMember.tenantId, role: { $ne: 'owner' } });
  res.json({ success: true, message: 'Team member removed' });
});

saasRouter.put('/team/:memberId/permissions', authenticate, async (req, res) => {
  const myMember = await TeamMember.findOne({ userId: req.user._id, role: { $in: ['owner','admin'] } });
  if (!myMember) return res.status(403).json({ success: false, message: 'Admin access required' });

  const member = await TeamMember.findOneAndUpdate(
    { _id: req.params.memberId, tenantId: myMember.tenantId },
    { permissions: req.body.permissions, role: req.body.role },
    { new: true }
  );
  res.json({ success: true, data: member });
});

// ── White-label branding ─────────────────────────────────
saasRouter.put('/branding', async (req, res) => {
  const member = await TeamMember.findOne({ userId: req.user._id, role: { $in: ['owner','admin'] } });
  if (!member) return res.status(403).json({ success: false, message: 'Admin access required' });

  const branding = await SaaSService.updateBranding(member.tenantId, req.body);
  res.json({ success: true, data: branding });
});

saasRouter.post('/domain/verify', authenticate, async (req, res) => {
  const { domain } = req.body;
  const member  = await TeamMember.findOne({ userId: req.user._id });
  const result  = await SaaSService.verifyCustomDomain(member.tenantId, domain);
  res.json({ success: true, data: result });
});

// ── Affiliate stats ──────────────────────────────────────
saasRouter.get('/affiliate', async (req, res) => {
  const member = await TeamMember.findOne({ userId: req.user._id });
  if (!member) return res.status(404).json({ success: false, message: 'No tenant found' });

  const stats = await SaaSService.getAffiliateStats(member.tenantId);
  res.json({ success: true, data: stats });
});

// ── Admin: all tenants ───────────────────────────────────
saasRouter.get('/admin/tenants', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Super admin only' });
  const result = await SaaSService.getAllTenants(req.query);
  res.json({ success: true, data: result });
});

// ── Stripe webhook (no auth — raw body needed) ───────────
saasRouter.post('/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    try {
      const result = await SaaSService.handleStripeWebhook(req.body, sig);
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════
// ECOMMERCE ROUTES
// ═══════════════════════════════════════════════════════════
const ecommerceRouter = express.Router();

// ── Webhooks (no auth — from Shopify/WooCommerce) ────────
ecommerceRouter.post('/webhook/shopify/:storeId', express.json(), async (req, res) => {
  const topic = req.headers['x-shopify-topic'];
  const hmac  = req.headers['x-shopify-hmac-sha256'];
  await EcommerceService.handleShopifyWebhook(req.params.storeId, topic, req.body, hmac);
  res.sendStatus(200);
});

ecommerceRouter.post('/webhook/woocommerce/:storeId/:event', express.json(), async (req, res) => {
  await EcommerceService.handleWooWebhook(req.params.storeId, req.params.event, req.body);
  res.sendStatus(200);
});

// ── Protected routes ─────────────────────────────────────
ecommerceRouter.use(authenticate);

// List stores
ecommerceRouter.get('/stores', async (req, res) => {
  const stores = await Store.find({ userId: req.user._id });
  res.json({ success: true, data: stores });
});

// Connect Shopify
ecommerceRouter.post('/stores/shopify', async (req, res) => {
  const { shopDomain, accessToken } = req.body;
  const store = await EcommerceService.connectShopify(req.user._id, shopDomain, accessToken);
  res.status(201).json({ success: true, data: store, message: 'Shopify connected! Webhooks registered.' });
});

// Connect WooCommerce
ecommerceRouter.post('/stores/woocommerce', async (req, res) => {
  const { siteUrl, consumerKey, consumerSecret } = req.body;
  const store = await EcommerceService.connectWooCommerce(req.user._id, siteUrl, consumerKey, consumerSecret);
  res.status(201).json({ success: true, data: store, message: 'WooCommerce connected!' });
});

// Update automation settings
ecommerceRouter.put('/stores/:id/automations', async (req, res) => {
  const store = await Store.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { automations: req.body },
    { new: true }
  );
  if (!store) return res.status(404).json({ success: false, message: 'Store not found' });
  res.json({ success: true, data: store });
});

// Update single automation
ecommerceRouter.patch('/stores/:id/automations/:type', async (req, res) => {
  const store = await Store.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { [`automations.${req.params.type}`]: req.body },
    { new: true }
  );
  res.json({ success: true, data: store });
});

// Get orders
ecommerceRouter.get('/stores/:id/orders', async (req, res) => {
  const { page = 1, limit = 20, event } = req.query;
  const q = { storeId: req.params.id };
  if (event) q.event = event;

  const [orders, total] = await Promise.all([
    OrderLog.find(q).skip((page-1)*limit).limit(+limit).sort('-createdAt'),
    OrderLog.countDocuments(q)
  ]);

  res.json({ success: true, data: orders, total });
});

// Get store analytics
ecommerceRouter.get('/stores/:id/analytics', async (req, res) => {
  const { days = 30 } = req.query;
  const analytics = await EcommerceService.getStoreAnalytics(req.params.id, +days);
  res.json({ success: true, data: analytics });
});

// Manually trigger abandoned cart
ecommerceRouter.post('/stores/:id/trigger/abandoned-cart', async (req, res) => {
  const { customer, cart } = req.body;
  const result = await EcommerceService.triggerAbandonedCart(req.params.id, customer, cart);
  res.json({ success: true, data: result });
});

// Run win-back campaign
ecommerceRouter.post('/stores/:id/trigger/win-back', async (req, res) => {
  const result = await EcommerceService.runWinBackCampaign(req.params.id, req.user._id);
  res.json({ success: true, data: result });
});

// Fetch live orders from Shopify
ecommerceRouter.get('/stores/:id/sync/shopify', async (req, res) => {
  const orders = await EcommerceService.fetchShopifyOrders(req.params.id, req.query);
  res.json({ success: true, data: orders, count: orders.length });
});

// Fetch live orders from WooCommerce
ecommerceRouter.get('/stores/:id/sync/woocommerce', async (req, res) => {
  const orders = await EcommerceService.fetchWooOrders(req.params.id, req.query);
  res.json({ success: true, data: orders, count: orders.length });
});

// Delete store
ecommerceRouter.delete('/stores/:id', authenticate, async (req, res) => {
  await Store.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  res.json({ success: true, message: 'Store disconnected' });
});

module.exports = { saasRoutes: saasRouter, ecommerceRoutes: ecommerceRouter };
