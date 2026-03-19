'use strict';
/**
 * AutoReply Service
 * Matches incoming messages against rules and generates replies.
 * Supports: keyword match, regex match, "all messages" catch-all
 * Reply types: static text, AI-generated, personalised template
 */
const logger = require('../utils/logger');
const { delay, personalizeText } = require('../utils/helpers');
const { AutoReply, Account } = require('../models');
const AIService = require('./ai.service');

const AutoReplyService = {
  /**
   * Process an incoming message for a given account.
   * @param {string|null} accountId  - Platform account _id (or null if userId provided in opts)
   * @param {string}      from       - Sender identifier (phone / username / chat id)
   * @param {string}      messageText
   * @param {string}      platform   - 'whatsapp' | 'telegram' | 'instagram' | ...
   * @param {object}      options    - { userId } if accountId is null
   * @returns {string|null} reply text, or null if no rule matched
   */
  async process(accountId, from, messageText, platform, options = {}) {
    try {
      let userId = options.userId;
      if (!userId && accountId) {
        const acc = await Account.findById(accountId).select('userId');
        userId = acc?.userId;
      }
      if (!userId) return null;

      const rules = await AutoReply.find({
        userId,
        platform: { $in: [platform, 'all'] },
        isActive: true,
      }).sort('-priority');

      for (const rule of rules) {
        if (!this._matches(rule, messageText)) continue;

        const reply = await this._buildReply(rule, { from, messageText, platform });
        if (!reply) continue;

        // Optional delay before sending (simulates human typing)
        if (rule.response?.delay > 0) await delay(rule.response.delay);

        // Stats
        await AutoReply.findByIdAndUpdate(rule._id, {
          $inc: { 'stats.triggered': 1, 'stats.replied': 1 },
          'stats.lastTriggered': new Date(),
        }).catch(() => {});

        return reply;
      }
    } catch (err) {
      logger.error(`AutoReply.process error: ${err.message}`);
    }
    return null;
  },

  _matches(rule, text) {
    const t = rule.trigger.caseSensitive ? text : (text || '').toLowerCase();
    switch (rule.trigger.type) {
      case 'all':     return true;
      case 'keyword': return rule.trigger.keywords.some(kw =>
        t.includes(rule.trigger.caseSensitive ? kw : kw.toLowerCase())
      );
      case 'regex': {
        try {
          return new RegExp(rule.trigger.regex, rule.trigger.caseSensitive ? '' : 'i').test(text);
        } catch { return false; }
      }
      default: return false;
    }
  },

  async _buildReply(rule, context) {
    switch (rule.response.type) {
      case 'ai':       return AIService.chat(context.messageText, [], rule.response.aiPrompt || 'You are a helpful customer support assistant. Be concise and friendly.');
      case 'template': return personalizeText(rule.response.template, { name: 'Friend', ...context });
      case 'text':
      default:         return rule.response.text || null;
    }
  },
};

module.exports = AutoReplyService;
