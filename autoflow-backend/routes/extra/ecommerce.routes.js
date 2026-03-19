'use strict';
/**
 * Ecommerce Routes  —  /api/v1/ecommerce
 * Shopify + WooCommerce integration:
 * - OAuth connection for both platforms
 * - Order webhooks → automated WA/email/SMS notifications
 * - Abandoned cart recovery
 * - Win-back campaigns
 * - Live order sync
 */
const express = require('express');
const { body } = require('express-validator');
const { authenticate, validate } = require('../../middleware/auth');
const { EcommerceService, Store, OrderLog } = require('../../services/ecommerce.service');

const router = express.Router();

// ── Shopify webhooks (no auth — Shopify HMAC verified) ───────────────────
router.post('/webhook/shopify/:storeId', express.json(), async (req, res) => {
  const topic = req.headers['x-shopify-topic'];
  const hmac  = req.headers['x-shopify-hmac-sha256'];
  if (!topic) return res.status(400).json({ success: false, message: 'Missing topic header' });
  try {
    await EcommerceService.handleShopifyWebhook(req.params.storeId, topic, req.body, hmac);
    res.sendStatus(200);
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ── WooCommerce webhooks (no auth) ────────────────────────────────────────
router.post('/webhook/woocommerce/:storeId', express.json(), async (req, res) => {
  const event = req.headers['x-wc-webhook-event'] || req.headers['x-woocommerce-topic'];
  try {
    await EcommerceService.handleWooWebhook(req.params.storeId, event, req.body);
    res.sendStatus(200);
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ── Authenticated routes ──────────────────────────────────────────────────
router.use(authenticate);

// ── Stores ────────────────────────────────────────────────────────────────
router.get('/stores', async (req, res) => {
  const stores = await Store.find({ userId: req.user._id }).select('-credentials').lean();
  res.json({ success: true, data: stores });
});

// Connect Shopify store
router.post('/stores/shopify',
  [body('shopDomain').notEmpty(), body('accessToken').notEmpty()],
  validate,
  async (req, res) => {
    const { shopDomain, accessToken } = req.body;
    const store = await EcommerceService.connectShopify(req.user._id, shopDomain, accessToken);
    res.status(201).json({ success: true, data: store });
  }
);

// Connect WooCommerce store
router.post('/stores/woocommerce',
  [body('siteUrl').isURL(), body('consumerKey').notEmpty(), body('consumerSecret').notEmpty()],
  validate,
  async (req, res) => {
    const { siteUrl, consumerKey, consumerSecret } = req.body;
    const store = await EcommerceService.connectWooCommerce(req.user._id, siteUrl, consumerKey, consumerSecret);
    res.status(201).json({ success: true, data: store });
  }
);

router.delete('/stores/:id', async (req, res) => {
  await Store.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  res.json({ success: true, message: 'Store disconnected' });
});

// ── Orders ────────────────────────────────────────────────────────────────
router.get('/stores/:id/orders', async (req, res) => {
  const { page = 1, limit = 20, event } = req.query;
  const q = { storeId: req.params.id };
  if (event) q.event = event;
  const [orders, total] = await Promise.all([
    OrderLog.find(q).skip((+page - 1) * +limit).limit(+limit).sort('-createdAt'),
    OrderLog.countDocuments(q),
  ]);
  res.json({ success: true, data: orders, total, page: +page });
});

// Sync orders from Shopify
router.get('/stores/:id/sync/shopify', async (req, res) => {
  const orders = await EcommerceService.fetchShopifyOrders(req.params.id, req.query);
  res.json({ success: true, data: orders, count: orders.length });
});

// Sync orders from WooCommerce
router.get('/stores/:id/sync/woocommerce', async (req, res) => {
  const orders = await EcommerceService.fetchWooOrders(req.params.id, req.query);
  res.json({ success: true, data: orders, count: orders.length });
});

// ── Automation triggers ───────────────────────────────────────────────────
// Manually trigger abandoned cart notification
router.post('/stores/:id/trigger/abandoned-cart', async (req, res) => {
  const { customer, cart } = req.body;
  if (!customer || !cart) return res.status(400).json({ success: false, message: 'customer and cart required' });
  const result = await EcommerceService.triggerAbandonedCart(req.params.id, customer, cart);
  res.json({ success: true, data: result });
});

// Run win-back campaign for inactive customers
router.post('/stores/:id/trigger/win-back', async (req, res) => {
  const result = await EcommerceService.runWinBackCampaign(req.params.id, req.user._id);
  res.json({ success: true, data: result });
});

// ── Analytics ─────────────────────────────────────────────────────────────
router.get('/stores/:id/analytics', async (req, res) => {
  const { days = 30 } = req.query;
  const analytics = await EcommerceService.getStoreAnalytics(req.params.id, +days);
  res.json({ success: true, data: analytics });
});

module.exports = router;
