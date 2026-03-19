'use strict';
/**
 * Analytics Routes  —  /api/v1/analytics
 *
 * Endpoints:
 *   GET /overview            — main dashboard (cached / rollup)
 *   GET /campaign/:id        — per-campaign funnel + daily stats
 *   GET /contacts/growth     — daily new contacts chart
 *   GET /platforms           — per-platform breakdown
 *   GET /funnel              — overall conversion funnel
 *   GET /revenue             — revenue attribution (from ecommerce integration)
 *   GET /best-times/:platform— AI-powered best-time-to-post
 *   GET /realtime            — live counts (last 5 minutes)
 *   POST /rollup             — manually trigger nightly rollup (admin)
 *   GET /export              — CSV download
 */
const express = require('express');
const { Contact, Campaign, MessageLog, AnalyticsEvent } = require('../models');
const { authenticate } = require('../middleware/auth');
const { cache } = require('../config/redis');
const AnalyticsRollup = require('../workers/analytics.rollup');
const logger = require('../utils/logger');

const router = express.Router();
router.use(authenticate);

// ── helper ────────────────────────────────────────────────────────────────
function daysToDate(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ── GET /overview ─────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  const { period = '30d' } = req.query;
  const days     = parseInt(period) || 30;
  const fromDate = daysToDate(days);
  const userId   = req.user._id;

  // Try pre-computed rollup first
  const precomp = await cache.get(`analytics:rollup:${userId}:${days}d`).catch(() => null);
  if (precomp) return res.json({ success: true, source: 'rollup', data: precomp });

  const cacheKey = `analytics:overview:${userId}:${period}`;
  const cached   = await cache.get(cacheKey).catch(() => null);
  if (cached) return res.json(cached);

  const [
    totalContacts, activeCampaigns, totalMessages,
    byPlatform, eventStats, recentCampaigns, dailyVolume
  ] = await Promise.all([
    Contact.countDocuments({ userId }),
    Campaign.countDocuments({ userId, status: { $in: ['running','scheduled'] } }),
    MessageLog.countDocuments({ userId, createdAt: { $gte: fromDate } }),
    MessageLog.aggregate([
      { $match: { userId, createdAt: { $gte: fromDate } } },
      { $group: { _id: '$platform', total: { $sum: 1 },
        delivered: { $sum: { $cond: [{ $in: ['$status',['delivered','read','opened']] },1,0] } },
        failed:    { $sum: { $cond: [{ $eq:  ['$status','failed']  },1,0] } },
      }},
    ]),
    AnalyticsEvent.aggregate([
      { $match: { userId, date: { $gte: fromDate } } },
      { $group: { _id: '$event', count: { $sum: 1 } } },
    ]),
    Campaign.find({ userId }).sort('-createdAt').limit(10).lean(),
    MessageLog.aggregate([
      { $match: { userId, createdAt: { $gte: fromDate } } },
      { $group: {
        _id:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
        delivered: { $sum: { $cond: [{ $in: ['$status',['delivered','opened']] },1,0] } },
      }},
      { $sort: { '_id': 1 } },
    ]),
  ]);

  const eventMap = {};
  eventStats.forEach(e => { eventMap[e._id] = e.count; });

  const result = {
    success: true, source: 'live',
    data: {
      summary: {
        totalContacts, activeCampaigns, totalMessages,
        deliveryRate: totalMessages ? Math.round((eventMap.delivered ||0)/totalMessages*100) : 0,
        openRate:     totalMessages ? Math.round((eventMap.opened    ||0)/totalMessages*100) : 0,
        clickRate:    totalMessages ? Math.round((eventMap.clicked   ||0)/totalMessages*100) : 0,
        replyRate:    totalMessages ? Math.round((eventMap.replied   ||0)/totalMessages*100) : 0,
      },
      byPlatform, eventMap, dailyVolume, recentCampaigns,
    },
  };

  await cache.set(cacheKey, result, 300).catch(() => {});
  res.json(result);
});

// ── GET /campaign/:id ─────────────────────────────────────────────────────
router.get('/campaign/:id', async (req, res) => {
  const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
  if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

  const [statusBreakdown, dailyStats, hourlyStats] = await Promise.all([
    MessageLog.aggregate([
      { $match: { campaignId: campaign._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    AnalyticsEvent.aggregate([
      { $match: { campaignId: campaign._id } },
      { $group: {
        _id:   { date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, event: '$event' },
        count: { $sum: 1 },
      }},
      { $sort: { '_id.date': 1 } },
    ]),
    MessageLog.aggregate([
      { $match: { campaignId: campaign._id, createdAt: { $gte: daysToDate(1) } } },
      { $group: {
        _id:   { $dateToString: { format: '%H:00', date: '$createdAt' } },
        count: { $sum: 1 },
      }},
      { $sort: { '_id': 1 } },
    ]),
  ]);

  // Build funnel
  const statusMap = {};
  statusBreakdown.forEach(s => { statusMap[s._id] = s.count; });
  const total     = Object.values(statusMap).reduce((a, b) => a + b, 0);
  const funnel    = {
    sent:      statusMap.sent      || total,
    delivered: statusMap.delivered || statusMap.read || 0,
    opened:    statusMap.opened    || statusMap.read || 0,
    clicked:   statusMap.clicked   || 0,
    replied:   statusMap.replied   || 0,
  };

  res.json({ success: true, data: { campaign, statusBreakdown, funnel, dailyStats, hourlyStats } });
});

// ── GET /contacts/growth ──────────────────────────────────────────────────
router.get('/contacts/growth', async (req, res) => {
  const { days = 30 } = req.query;
  const fromDate = daysToDate(+days);
  const data = await Contact.aggregate([
    { $match: { userId: req.user._id, createdAt: { $gte: fromDate } } },
    { $group: {
      _id:    { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      count:  { $sum: 1 },
      byTag:  { $push: '$tags' },
    }},
    { $sort: { '_id': 1 } },
  ]);
  const total = await Contact.countDocuments({ userId: req.user._id });
  res.json({ success: true, data: { daily: data, total } });
});

// ── GET /platforms ────────────────────────────────────────────────────────
router.get('/platforms', async (req, res) => {
  const { period = '30d' } = req.query;
  const days     = parseInt(period) || 30;
  const fromDate = daysToDate(days);

  const data = await MessageLog.aggregate([
    { $match: { userId: req.user._id, createdAt: { $gte: fromDate } } },
    { $group: {
      _id:       '$platform',
      total:     { $sum: 1 },
      delivered: { $sum: { $cond: [{ $eq: ['$status','delivered'] },1,0] } },
      opened:    { $sum: { $cond: [{ $eq: ['$status','opened']    },1,0] } },
      clicked:   { $sum: { $cond: [{ $eq: ['$status','clicked']   },1,0] } },
      failed:    { $sum: { $cond: [{ $eq: ['$status','failed']    },1,0] } },
    }},
    { $addFields: {
      deliveryRate: { $cond: [{ $gt: ['$total',0] }, { $multiply: [{ $divide: ['$delivered','$total'] },100] }, 0] },
      openRate:     { $cond: [{ $gt: ['$total',0] }, { $multiply: [{ $divide: ['$opened',  '$total'] },100] }, 0] },
    }},
    { $sort: { total: -1 } },
  ]);

  res.json({ success: true, data });
});

// ── GET /funnel ───────────────────────────────────────────────────────────
router.get('/funnel', async (req, res) => {
  const { period = '30d' } = req.query;
  const days     = parseInt(period) || 30;
  const fromDate = daysToDate(days);
  const userId   = req.user._id;

  const [msgStats, eventStats] = await Promise.all([
    MessageLog.aggregate([
      { $match: { userId, createdAt: { $gte: fromDate } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    AnalyticsEvent.aggregate([
      { $match: { userId, date: { $gte: fromDate } } },
      { $group: { _id: '$event', count: { $sum: 1 } } },
    ]),
  ]);

  const statusMap = {};
  msgStats.forEach(s => { statusMap[s._id] = s.count; });
  const eventMap = {};
  eventStats.forEach(e => { eventMap[e._id] = e.count; });

  const totalSent = Object.values(statusMap).reduce((a,b) => a+b, 0);
  const funnel = [
    { stage: 'Sent',      count: totalSent,                              pct: 100 },
    { stage: 'Delivered', count: statusMap.delivered || 0,               pct: totalSent ? Math.round((statusMap.delivered||0)/totalSent*100) : 0 },
    { stage: 'Opened',    count: eventMap.opened     || statusMap.opened || 0, pct: totalSent ? Math.round((eventMap.opened||0)/totalSent*100) : 0 },
    { stage: 'Clicked',   count: eventMap.clicked    || 0,               pct: totalSent ? Math.round((eventMap.clicked||0)/totalSent*100) : 0 },
    { stage: 'Replied',   count: eventMap.replied    || 0,               pct: totalSent ? Math.round((eventMap.replied||0)/totalSent*100) : 0 },
    { stage: 'Converted', count: eventMap.converted  || 0,               pct: totalSent ? Math.round((eventMap.converted||0)/totalSent*100) : 0 },
  ];

  res.json({ success: true, data: { funnel, statusMap, eventMap, period } });
});

// ── GET /revenue ──────────────────────────────────────────────────────────
router.get('/revenue', async (req, res) => {
  const { period = '30d' } = req.query;
  const days     = parseInt(period) || 30;
  const fromDate = daysToDate(days);

  // Pull revenue data from ecommerce OrderLogs if available
  try {
    const { OrderLog, Store } = require('../services/ecommerce.service');
    const stores = await Store.find({ userId: req.user._id }).select('_id name platform currency');

    if (!stores.length) {
      return res.json({ success: true, data: { total: 0, currency: 'USD', stores: [], daily: [] } });
    }

    const storeIds = stores.map(s => s._id);
    const [totals, daily] = await Promise.all([
      OrderLog.aggregate([
        { $match: { storeId: { $in: storeIds }, event: 'paid', createdAt: { $gte: fromDate } } },
        { $group: { _id: '$storeId', revenue: { $sum: '$order.total' }, count: { $sum: 1 } } },
      ]),
      OrderLog.aggregate([
        { $match: { storeId: { $in: storeIds }, event: 'paid', createdAt: { $gte: fromDate } } },
        { $group: {
          _id:     { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$order.total' },
          orders:  { $sum: 1 },
        }},
        { $sort: { '_id': 1 } },
      ]),
    ]);

    const storeMap = {};
    stores.forEach(s => { storeMap[s._id] = s; });
    const byStore = totals.map(t => ({
      store:    storeMap[t._id]?.name,
      platform: storeMap[t._id]?.platform,
      revenue:  t.revenue,
      orders:   t.count,
    }));

    res.json({ success: true, data: {
      total:    totals.reduce((s,t) => s+t.revenue, 0),
      orders:   totals.reduce((s,t) => s+t.count, 0),
      byStore,
      daily,
      period,
    }});
  } catch {
    res.json({ success: true, data: { total: 0, note: 'Connect an ecommerce store to track revenue' } });
  }
});

// ── GET /best-times/:platform ─────────────────────────────────────────────
router.get('/best-times/:platform', async (req, res) => {
  const { platform } = req.params;

  // Static best-time data based on industry research
  const bestTimes = {
    instagram: [{ day:'Tue',hours:[9,10,11] },{ day:'Wed',hours:[9,10,11] },{ day:'Fri',hours:[9,10,11] }],
    twitter:   [{ day:'Wed',hours:[9,10]    },{ day:'Thu',hours:[9,10]    },{ day:'Fri',hours:[9,10,11] }],
    facebook:  [{ day:'Tue',hours:[9,10,11] },{ day:'Wed',hours:[9]       },{ day:'Fri',hours:[10,11]  }],
    linkedin:  [{ day:'Tue',hours:[10,11]   },{ day:'Wed',hours:[10,11]   },{ day:'Thu',hours:[10,11]  }],
    tiktok:    [{ day:'Tue',hours:[9]       },{ day:'Thu',hours:[9,12]    },{ day:'Fri',hours:[5,9]    }],
    youtube:   [{ day:'Fri',hours:[12,15,16]},{ day:'Sat',hours:[9,11]    },{ day:'Sun',hours:[9,11]   }],
    whatsapp:  [{ day:'Mon',hours:[9,10]    },{ day:'Wed',hours:[9,10]    },{ day:'Fri',hours:[9,10]   }],
    telegram:  [{ day:'Tue',hours:[8,9,10]  },{ day:'Thu',hours:[8,9]     },{ day:'Fri',hours:[8,9,10] }],
    email:     [{ day:'Tue',hours:[10,11]   },{ day:'Wed',hours:[10,11]   },{ day:'Thu',hours:[10,11]  }],
  };

  const times = bestTimes[platform] || bestTimes.instagram;

  // Also try to analyse user's own historical data
  let personalised = null;
  try {
    const fromDate = daysToDate(90);
    const hourlyData = await MessageLog.aggregate([
      { $match: { userId: req.user._id, platform, status: { $in: ['opened','read','clicked'] }, createdAt: { $gte: fromDate } } },
      { $group: {
        _id:   { hour: { $hour: '$createdAt' }, dow: { $dayOfWeek: '$createdAt' } },
        count: { $sum: 1 },
      }},
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
    if (hourlyData.length >= 5) personalised = hourlyData;
  } catch {}

  res.json({ success: true, data: { platform, industryBestTimes: times, userPersonalised: personalised } });
});

// ── GET /realtime ─────────────────────────────────────────────────────────
router.get('/realtime', async (req, res) => {
  const since = new Date(Date.now() - 5 * 60 * 1000); // last 5 min
  const userId = req.user._id;

  const [recent, active] = await Promise.all([
    MessageLog.aggregate([
      { $match: { userId, createdAt: { $gte: since } } },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
    ]),
    Campaign.countDocuments({ userId, status: 'running' }),
  ]);

  const total5min = recent.reduce((s, r) => s + r.count, 0);
  res.json({ success: true, data: { last5min: total5min, byPlatform: recent, activeCampaigns: active } });
});

// ── POST /rollup — manual trigger (admin) ─────────────────────────────────
router.post('/rollup', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
  const summary = await AnalyticsRollup.rollupUser(req.user._id);
  res.json({ success: true, data: summary });
});

// ── GET /export ───────────────────────────────────────────────────────────
router.get('/export', async (req, res) => {
  const { period = '30d' } = req.query;
  const days     = parseInt(period) || 30;
  const fromDate = daysToDate(days);
  const campaigns = await Campaign.find({ userId: req.user._id, createdAt: { $gte: fromDate } }).lean();

  const header = 'name,type,contacts,delivered,failed,opened,clicked,status,started,completed\n';
  const rows   = campaigns.map(c =>
    `"${c.name}","${c.type}","${c.audience?.totalCount||0}","${c.stats?.totalSent||0}","${c.stats?.failed||0}","${c.stats?.opened||0}","${c.stats?.clicked||0}","${c.status}","${c.stats?.startedAt?.toISOString()?.split('T')[0]||''}","${c.stats?.completedAt?.toISOString()?.split('T')[0]||''}"`
  ).join('\n');

  res.set({ 'Content-Type':'text/csv', 'Content-Disposition':`attachment; filename="analytics-${period}.csv"` });
  res.send(header + rows);
});

module.exports = router;
