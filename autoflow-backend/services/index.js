'use strict';
/**
 * services/index.js — re-export barrel
 * All services now live in their own files.
 * This file exists for backward-compat imports that use require('../services').
 */
const AIService        = require('./ai.service');
const SmsService       = require('./sms.service');
const TelegramService  = require('./telegram.service');
const ProxyService     = require('./proxy.service');
const SocialService    = require('./social.service');
const WhatsAppService  = require('./whatsapp.service');
const EmailService     = require('./email.service');

// ── AutoReply Service (kept here — small, no circular deps) ──────────────
const { AutoReply, Account } = require('../models');
const logger        = require('../utils/logger');
const { delay, personalizeText } = require('../utils/helpers');

const AutoReplyService = {
  async process(accountId, from, messageText, platform, options = {}) {
    try {
      const userId = accountId
        ? (await Account.findById(accountId).select('userId'))?.userId
        : options.userId;
      if (!userId) return null;

      const rules = await AutoReply.find({
        userId,
        platform: { $in: [platform, 'all'] },
        isActive: true,
      }).sort('-priority');

      for (const rule of rules) {
        if (this._matches(rule, messageText)) {
          const reply = await this._buildReply(rule, { from, messageText });
          if (rule.response?.delay) await delay(rule.response.delay);
          await AutoReply.findByIdAndUpdate(rule._id, { $inc: { 'stats.triggered': 1, 'stats.replied': 1 } });
          return reply;
        }
      }
    } catch (err) { logger.error(`AutoReply error: ${err.message}`); }
    return null;
  },

  _matches(rule, text) {
    const t = rule.trigger.caseSensitive ? text : text.toLowerCase();
    if (rule.trigger.type === 'all')     return true;
    if (rule.trigger.type === 'keyword') return rule.trigger.keywords.some(kw => t.includes(rule.trigger.caseSensitive ? kw : kw.toLowerCase()));
    if (rule.trigger.type === 'regex')   return new RegExp(rule.trigger.regex, rule.trigger.caseSensitive ? '' : 'i').test(text);
    return false;
  },

  async _buildReply(rule, context) {
    if (rule.response.type === 'ai')       return AIService.chat(context.messageText, [], rule.response.aiPrompt);
    if (rule.response.type === 'template') return personalizeText(rule.response.template, { name: 'Friend', ...context });
    return rule.response.text;
  },
};

// ── Webhook Dispatcher (kept here — small utility) ───────────────────────
const axios = require('axios');
const { Webhook: WebhookModel } = require('../models');

const WebhookDispatcher = {
  async dispatch(userId, event, data) {
    const hooks = await WebhookModel.find({ userId, events: { $in: [event, '*'] }, isActive: true });
    for (const hook of hooks) {
      this._send(hook, event, data).catch(err => logger.error(`Webhook to ${hook.url}: ${err.message}`));
    }
  },

  async _send(hook, event, data) {
    const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    const sig     = hook.secret
      ? require('crypto').createHmac('sha256', hook.secret).update(payload).digest('hex')
      : '';
    await axios.post(hook.url, JSON.parse(payload), {
      headers: { 'Content-Type': 'application/json', 'X-AutoFlow-Event': event, 'X-AutoFlow-Signature': `sha256=${sig}`, ...hook.headers },
      timeout: 10000,
    });
    await WebhookModel.findByIdAndUpdate(hook._id, { $inc: { 'stats.totalSent': 1 }, 'stats.lastSent': new Date() });
  },
};

module.exports = {
  AIService, SmsService, TelegramService, ProxyService,
  SocialService, WhatsAppService, EmailService,
  AutoReplyService, WebhookDispatcher,
};
