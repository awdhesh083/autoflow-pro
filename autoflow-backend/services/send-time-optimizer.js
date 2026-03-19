'use strict';
/**
 * AI Send-Time Optimizer
 * Analyses MessageLog.openedAt history per contact → finds best send window.
 * Stores result in Contact.customFields.bestSendWindow.
 * Falls back to industry best-times when insufficient personal data.
 */
const cron   = require('node-cron');
const logger = require('../utils/logger');
const { Contact, MessageLog } = require('../models');

// Industry best times (fallback) — hour in local timezone
const INDUSTRY_BEST = {
  email:     { hours: [10, 11, 14], days: [2, 3, 4] },   // Tue-Thu, 10am-2pm
  whatsapp:  { hours: [9, 10, 19, 20], days: [1,2,3,4,5] },
  sms:       { hours: [10, 11, 18, 19], days: [2, 3, 4] },
  instagram: { hours: [8, 9, 17, 18], days: [3, 5, 7] },
  linkedin:  { hours: [8, 10, 12], days: [2, 3, 4] },
  twitter:   { hours: [9, 10, 12], days: [3, 4, 5] },
  telegram:  { hours: [8, 9, 20], days: [1,2,3,4,5] },
  facebook:  { hours: [9, 13, 16], days: [2, 3, 5] },
};

// Day of week names
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const SendTimeOptimizer = {
  // ── Analyse a single contact ────────────────────────────────────────────
  async analyseContact(contactId, platform = 'email') {
    const logs = await MessageLog.find({
      contactId,
      platform,
      status:   { $in: ['opened', 'read', 'clicked', 'replied'] },
      openedAt: { $exists: true, $ne: null },
    }).select('openedAt createdAt').lean();

    if (logs.length < 5) {
      // Not enough data — return industry best
      const fallback = INDUSTRY_BEST[platform] || INDUSTRY_BEST.email;
      return {
        contactId,
        platform,
        source:     'industry',
        confidence: 0,
        bestHours:  fallback.hours,
        bestDays:   fallback.days.map(d => DAY_NAMES[d]),
        bestWindow: `${String(fallback.hours[0]).padStart(2,'0')}:00–${String(fallback.hours[fallback.hours.length-1]).padStart(2,'0')}:59`,
      };
    }

    // Aggregate by hour and day of week
    const hourCounts = new Array(24).fill(0);
    const dayCounts  = new Array(7).fill(0);

    logs.forEach(log => {
      const dt = new Date(log.openedAt || log.createdAt);
      hourCounts[dt.getUTCHours()]++;
      dayCounts[dt.getUTCDay()]++;
    });

    // Find top 3 hours
    const topHours = hourCounts
      .map((count, h) => ({ h, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(x => x.h);

    // Find top 2 days
    const topDays = dayCounts
      .map((count, d) => ({ d, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 2)
      .map(x => DAY_NAMES[x.d]);

    const confidence = Math.min(100, Math.round(logs.length / 20 * 100));
    const bestHour   = topHours[0];

    const result = {
      contactId,
      platform,
      source:     'personal',
      confidence,
      bestHours:  topHours.sort((a, b) => a - b),
      bestDays:   topDays,
      bestWindow: `${String(bestHour).padStart(2,'0')}:00–${String((bestHour + 2) % 24).padStart(2,'0')}:59`,
      sampleSize: logs.length,
    };

    // Persist to contact
    const key = `bestSendWindow_${platform}`;
    await Contact.findByIdAndUpdate(contactId, {
      [`customFields.${key}`]: result,
    });

    return result;
  },

  // ── Get next optimal send time for a contact ────────────────────────────
  async nextSendTime(contactId, platform = 'email', withinHours = 48) {
    const window = await this.analyseContact(contactId, platform);
    const now    = new Date();
    const end    = new Date(now.getTime() + withinHours * 60 * 60 * 1000);

    // Scan the next withinHours hours for a slot that matches best hours + best days
    const bestHours = window.bestHours;
    const dayMap    = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
    const bestDays  = window.bestDays.map(d => dayMap[d]).filter(d => d !== undefined);

    let candidate = new Date(now);
    candidate.setUTCMinutes(0, 0, 0);
    candidate.setUTCHours(candidate.getUTCHours() + 1);

    while (candidate < end) {
      const h = candidate.getUTCHours();
      const d = candidate.getUTCDay();
      if (bestHours.includes(h) && (bestDays.length === 0 || bestDays.includes(d))) {
        return {
          sendAt:     candidate.toISOString(),
          windowInfo: window,
        };
      }
      candidate = new Date(candidate.getTime() + 60 * 60 * 1000); // +1h
    }

    // No slot found in window — return first best hour tomorrow
    const fallback = new Date(now);
    fallback.setUTCDate(fallback.getUTCDate() + 1);
    fallback.setUTCHours(bestHours[0] || 10, 0, 0, 0);
    return { sendAt: fallback.toISOString(), windowInfo: window };
  },

  // ── Batch analyse contacts for a user ──────────────────────────────────
  async analyseForUser(userId, platforms = ['email', 'whatsapp']) {
    const contacts = await Contact.find({ userId }).select('_id').lean();
    logger.info(`Send-time analysis: ${contacts.length} contacts × ${platforms.length} platforms`);
    let done = 0;

    for (const c of contacts) {
      for (const platform of platforms) {
        await this.analyseContact(c._id, platform).catch(() => {});
      }
      done++;
    }
    return { analysed: done, platforms };
  },

  // ── Get platform best-times summary (no personal data needed) ──────────
  getIndustryBestTimes(platform) {
    const data = INDUSTRY_BEST[platform] || INDUSTRY_BEST.email;
    return {
      platform,
      bestHours: data.hours,
      bestDays:  data.days.map(d => DAY_NAMES[d]),
      source:    'industry',
      confidence: 100,
    };
  },
};

// ── Weekly cron: Sunday 04:00 AM — re-analyse all contacts ───────────────
if (process.env.NODE_ENV !== 'test') { cron.schedule('0 4 * * 0', async () => {
  logger.info('Starting weekly send-time analysis...');
  try {
    const { User } = require('../models');
    const users    = await User.find({ isActive: true }).select('_id').lean();
    for (const u of users) {
      await SendTimeOptimizer.analyseForUser(u._id).catch(e =>
        logger.error(`Send-time analysis user ${u._id}: ${e.message}`)
      );
    }
    logger.info('Send-time analysis complete');
  } catch (err) {
    logger.error(`Send-time cron error: ${err.message}`);
  }
});

}

module.exports = SendTimeOptimizer;
