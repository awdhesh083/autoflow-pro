'use strict';
/**
 * Contact Engagement Scoring
 * Computes a 0-100 score per contact based on message interaction history.
 *
 * Formula:
 *   +2  per email open
 *   +5  per email click
 *   +1  per WA message delivered/read
 *   +8  per WA reply
 *   +6  per SMS reply
 *   +3  per IG/social interaction
 *   -10 per hard bounce
 *   -15 per unsubscribe
 *   Decays 2 points per week of inactivity (max -20)
 *
 * Tier labels:
 *   80-100 = Champion
 *   60-79  = Loyal
 *   40-59  = Potential
 *   20-39  = At-risk
 *   0-19   = Dormant
 */
const cron    = require('node-cron');
const logger  = require('../utils/logger');
const { Contact, MessageLog } = require('../models');

const WEIGHTS = {
  opened:      2,
  clicked:     5,
  read:        1,
  delivered:   1,
  replied:     8,
  sms_replied: 6,
  social:      3,
  bounced:    -10,
  unsubscribed:-15,
};

const TIER_LABELS = [
  { min: 80,  label: 'Champion',  color: '#10b981', tag: 'Champion'  },
  { min: 60,  label: 'Loyal',     color: '#00d4ff', tag: 'Loyal'     },
  { min: 40,  label: 'Potential', color: '#f59e0b', tag: 'Potential' },
  { min: 20,  label: 'At-risk',   color: '#f97316', tag: 'At-risk'   },
  { min: 0,   label: 'Dormant',   color: '#ef4444', tag: 'Dormant'   },
];

function getTier(score) {
  return TIER_LABELS.find(t => score >= t.min) || TIER_LABELS[TIER_LABELS.length - 1];
}

const EngagementScoring = {

  // ── Score a single contact ────────────────────────────────────────────
  async scoreContact(contactId) {
    const [logs, contact] = await Promise.all([
      MessageLog.find({ contactId })
        .select('platform status direction openedAt clickedAt repliedAt createdAt')
        .lean(),
      Contact.findById(contactId).select('score lastContacted').lean(),
    ]);

    if (!contact) return null;

    let raw = 0;

    logs.forEach(log => {
      switch (log.status) {
        case 'opened':
          raw += WEIGHTS.opened; break;
        case 'clicked':
          raw += WEIGHTS.clicked; break;
        case 'read':
        case 'delivered':
          raw += WEIGHTS.delivered; break;
        case 'replied':
          raw += log.platform === 'sms' ? WEIGHTS.sms_replied : WEIGHTS.replied;
          break;
        case 'bounced':
          raw += WEIGHTS.bounced; break;
        case 'unsubscribed':
          raw += WEIGHTS.unsubscribed; break;
      }
      if (['instagram','twitter','facebook','tiktok','linkedin'].includes(log.platform) && log.direction === 'inbound') {
        raw += WEIGHTS.social;
      }
    });

    // Inactivity decay (2pts/week, max 4 weeks)
    if (contact.lastContacted) {
      const weeksInactive = Math.floor((Date.now() - new Date(contact.lastContacted)) / (7 * 24 * 60 * 60 * 1000));
      raw -= Math.min(weeksInactive * 2, 20);
    }

    const score = Math.max(0, Math.min(100, Math.round(raw)));
    const tier  = getTier(score);

    await Contact.findByIdAndUpdate(contactId, {
      score,
      'customFields.engagementTier': tier.label,
    });

    return { contactId, score, tier: tier.label };
  },

  // ── Batch score all contacts for a user ───────────────────────────────
  async scoreAllForUser(userId) {
    const contacts = await Contact.find({ userId }).select('_id').lean();
    logger.info(`Scoring ${contacts.length} contacts for user ${userId}`);
    let done = 0;

    for (const c of contacts) {
      try {
        await this.scoreContact(c._id);
        done++;
      } catch (err) {
        logger.error(`Score error for contact ${c._id}: ${err.message}`);
      }
    }
    return { scored: done, total: contacts.length };
  },

  // ── Nightly batch score all users ────────────────────────────────────
  async scoreAll() {
    const { User } = require('../models');
    const users = await User.find({ isActive: true }).select('_id').lean();
    logger.info(`Engagement scoring: ${users.length} users`);
    let totalScored = 0;

    for (const u of users) {
      try {
        const r = await this.scoreAllForUser(u._id);
        totalScored += r.scored;
      } catch (err) {
        logger.error(`Score batch error user ${u._id}: ${err.message}`);
      }
    }
    logger.info(`Engagement scoring complete: ${totalScored} contacts scored`);
  },

  // ── Auto-tag based on tier changes ────────────────────────────────────
  async applyTierTags(userId) {
    const contacts = await Contact.find({ userId }).select('_id score tags').lean();
    const TIER_TAGS = TIER_LABELS.map(t => t.tag);

    for (const c of contacts) {
      const tier = getTier(c.score);
      // Remove old tier tags, add new one
      const cleanedTags = (c.tags || []).filter(t => !TIER_TAGS.includes(t));
      cleanedTags.push(tier.tag);

      await Contact.findByIdAndUpdate(c._id, { tags: cleanedTags });
    }
  },

  getTier,
  TIER_LABELS,
};

// ── Nightly cron: 03:00 AM ────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') { cron.schedule('0 3 * * *', async () => {
  logger.info('Starting nightly engagement scoring...');
  await EngagementScoring.scoreAll();
});

}

module.exports = EngagementScoring;
