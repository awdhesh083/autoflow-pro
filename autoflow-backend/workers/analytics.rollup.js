'use strict';
/**
 * Analytics Rollup Worker
 * Nightly pre-computation of user stats → Redis cache
 * Keeps dashboard /analytics/overview sub-100ms
 *
 * Schedules:
 *   Daily 02:00 AM  — full rollup for all users
 *   Every 15 min    — rolling 24h quick stats (for realtime widget)
 */
const cron   = require('node-cron');
const logger = require('../utils/logger');
const { MessageLog, Campaign, Contact, AnalyticsEvent } = require('../models');
const { cache } = require('../config/redis');

const AnalyticsRollup = {

  async rollupUser(userId, daysBack = 30) {
    const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    const [totalContacts, campaigns, byPlatform, events, dailyVolume, contactGrowth] =
      await Promise.all([
        Contact.countDocuments({ userId }),

        Campaign.find({ userId, createdAt: { $gte: fromDate } })
          .select('name type status stats audience createdAt')
          .lean(),

        MessageLog.aggregate([
          { $match: { userId, createdAt: { $gte: fromDate } } },
          { $group: {
            _id:       '$platform',
            total:     { $sum: 1 },
            delivered: { $sum: { $cond: [{ $in: ['$status',['delivered','read','opened']] },1,0] } },
            failed:    { $sum: { $cond: [{ $eq: ['$status','failed'] },1,0] } },
          }},
        ]),

        AnalyticsEvent.aggregate([
          { $match: { userId, date: { $gte: fromDate } } },
          { $group: { _id: '$event', count: { $sum: 1 } } },
        ]),

        MessageLog.aggregate([
          { $match: { userId, createdAt: { $gte: fromDate } } },
          { $group: {
            _id:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
            delivered: { $sum: { $cond: [{ $in: ['$status',['delivered','opened']] },1,0] } },
          }},
          { $sort: { '_id': 1 } },
        ]),

        Contact.aggregate([
          { $match: { userId, createdAt: { $gte: fromDate } } },
          { $group: {
            _id:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          }},
          { $sort: { '_id': 1 } },
        ]),
      ]);

    const totalMessages = byPlatform.reduce((s, p) => s + p.total, 0);
    const eventMap      = {};
    events.forEach(e => { eventMap[e._id] = e.count; });

    const summary = {
      totalContacts,
      activeCampaigns:  campaigns.filter(c => c.status === 'running').length,
      totalCampaigns:   campaigns.length,
      totalMessages,
      byPlatform,
      eventMap,
      dailyVolume,
      contactGrowth,
      recentCampaigns:  campaigns.slice(0, 10),
      deliveryRate:     totalMessages ? Math.round((eventMap.delivered || 0) / totalMessages * 100) : 0,
      openRate:         totalMessages ? Math.round((eventMap.opened    || 0) / totalMessages * 100) : 0,
      clickRate:        totalMessages ? Math.round((eventMap.clicked   || 0) / totalMessages * 100) : 0,
      replyRate:        totalMessages ? Math.round((eventMap.replied   || 0) / totalMessages * 100) : 0,
      rolledUpAt:       new Date().toISOString(),
    };

    await cache.set(`analytics:rollup:${userId}:${daysBack}d`, summary, 6 * 60 * 60);
    return summary;
  },

  async rollupAll() {
    const { User } = require('../models');
    const users    = await User.find({ isActive: true }).select('_id').lean();
    logger.info(`Analytics rollup: ${users.length} users`);
    let done = 0, failed = 0;
    for (const user of users) {
      try {
        await this.rollupUser(user._id, 30);
        await this.rollupUser(user._id, 7);  // also cache 7-day
        done++;
      } catch (err) {
        logger.error(`Rollup failed user ${user._id}: ${err.message}`);
        failed++;
      }
    }
    logger.info(`Analytics rollup done: ${done} ok, ${failed} failed`);
  },

  // Quick 24h snapshot — runs every 15 min
  async quickSnapshot(userId) {
    const since  = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [msgs, active] = await Promise.all([
      MessageLog.countDocuments({ userId, createdAt: { $gte: since } }),
      Campaign.countDocuments({ userId, status: 'running' }),
    ]);
    const snap = { last24h: msgs, activeCampaigns: active, snappedAt: new Date().toISOString() };
    await cache.set(`analytics:snap:${userId}`, snap, 20 * 60); // 20 min TTL
    return snap;
  },
};

// ── Cron: full rollup nightly at 02:00 ───────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  cron.schedule('0 2 * * *', async () => {
    logger.info('Starting nightly analytics rollup...');
    await AnalyticsRollup.rollupAll();
  });
}

module.exports = AnalyticsRollup;
