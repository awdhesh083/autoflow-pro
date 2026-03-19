'use strict';
/**
 * Ecommerce Routes  —  /api/v1/ecommerce
 * Supports: Shopify, WooCommerce
 * Features: connect store, webhook handlers, order triggers, abandoned cart, win-back
 */
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { EcommerceService, Store, OrderLog } = require('../services/ecommerce.service');

const router = express.Router();

// ── Shopify webhook (raw body) — no auth ──────────────────────────────────
router.post('/webhook/shopify/:storeId',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const topic = req.headers['x-shopify-topic'];
    const hmac  = req.headers['x-shopify-hmac-sha256'];
    try {
      await EcommerceService.handleShopifyWebhook(req.params.storeId, topic, req.body, hmac);
      res.sendStatus(200);
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

// ── WooCommerce webhook — no auth ─────────────────────────────────────────
router.post('/webhook/woocommerce/:storeId/:event',
  express.json(),
  async (req, res) => {
    try {
      await EcommerceService.handleWooWebhook(req.params.storeId, req.params.event, req.body);
      res.sendStatus(200);
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }
);

// ── Authenticated routes ───────────────────────────────────────────────────
router.use(authenticate);

// Connect Shopify store
router.post('/shopify/connect', async (req, res) => {
  const { shopDomain, accessToken } = req.body;
  if (!shopDomain || !accessToken) return res.status(400).json({ success: false, message: 'shopDomain and accessToken required' });
  const store = await EcommerceService.connectShopify(req.user._id, shopDomain, accessToken);
  res.status(201).json({ success: true, data: store });
});

// Connect WooCommerce store
router.post('/woocommerce/connect', async (req, res) => {
  const { siteUrl, consumerKey, consumerSecret } = req.body;
  if (!siteUrl || !consumerKey || !consumerSecret) return res.status(400).json({ success: false, message: 'siteUrl, consumerKey, consumerSecret required' });
  const store = await EcommerceService.connectWooCommerce(req.user._id, siteUrl, consumerKey, consumerSecret);
  res.status(201).json({ success: true, data: store });
});

// List stores
router.get('/stores', async (req, res) => {
  const stores = await Store.find({ userId: req.user._id }).select('-credentials');
  res.json({ success: true, data: stores });
});

// Get store stats
router.get('/stores/:id/stats', async (req, res) => {
  const store = await Store.findOne({ _id: req.params.id, userId: req.user._id });
  if (!store) return res.status(404).json({ success: false, message: 'Store not found' });
  res.json({ success: true, data: store.stats });
});

// Get orders for a store
router.get('/stores/:id/orders', async (req, res) => {
  const { page = 1, limit = 20, event } = req.query;
  const q = { storeId: req.params.id };
  if (event) q.event = event;
  const [orders, total] = await Promise.all([
    OrderLog.find(q).sort('-createdAt').skip((page-1)*+limit).limit(+limit),
    OrderLog.countDocuments(q),
  ]);
  res.json({ success: true, data: orders, total });
});

// Update store automations
router.put('/stores/:id/automations', async (req, res) => {
  const store = await Store.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: { automations: req.body } },
    { new: true }
  );
  if (!store) return res.status(404).json({ success: false, message: 'Store not found' });
  res.json({ success: true, data: store.automations });
});

// Fetch Shopify orders directly
router.get('/stores/:id/shopify/orders', async (req, res) => {
  const result = await EcommerceService.fetchShopifyOrders(req.params.id, req.query);
  res.json({ success: true, data: result });
});

// Manually trigger abandoned cart
router.post('/stores/:id/trigger/abandoned-cart', async (req, res) => {
  const { customerData, cartData } = req.body;
  const result = await EcommerceService.triggerAbandonedCart(req.params.id, customerData, cartData);
  res.json({ success: true, data: result });
});

// Win-back campaign
router.post('/stores/:id/campaign/win-back', async (req, res) => {
  const result = await EcommerceService.runWinBackCampaign(req.params.id, req.user._id);
  res.json({ success: true, data: result });
});

// Disconnect store
router.delete('/stores/:id', async (req, res) => {
  await Store.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  res.json({ success: true, message: 'Store disconnected' });
});

module.exports = router;
