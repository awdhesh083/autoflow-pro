'use strict';
const { Telegraf } = require('telegraf');
const logger = require('../utils/logger');
const { delay } = require('../utils/helpers');

const TelegramService = {
  _bots: new Map(),

  getBot(token) {
    const tok = token || process.env.TELEGRAM_BOT_TOKEN;
    if (!tok) throw new Error('Telegram bot token not configured');
    if (!this._bots.has(tok)) {
      const bot = new Telegraf(tok);
      bot.launch().catch(err => logger.warn(`TG launch: ${err.message}`));
      this._bots.set(tok, bot);
    }
    return this._bots.get(tok);
  },

  async sendMessage(chatId, message, options = {}) {
    const bot    = this.getBot(options.botToken);
    const result = await bot.telegram.sendMessage(chatId, message, {
      parse_mode: options.parse_mode || 'HTML', ...options,
    });
    return { platform: 'telegram', messageId: result.message_id, chatId };
  },

  async sendPhoto(chatId, photoUrl, caption, botToken) {
    const bot    = this.getBot(botToken);
    const result = await bot.telegram.sendPhoto(chatId, photoUrl, { caption });
    return { platform: 'telegram', messageId: result.message_id };
  },

  async sendDocument(chatId, fileSource, caption, botToken) {
    const bot    = this.getBot(botToken);
    const result = await bot.telegram.sendDocument(chatId, fileSource, { caption });
    return { platform: 'telegram', messageId: result.message_id };
  },

  async broadcast(chatIds, message, options = {}) {
    const results = [];
    const ms      = options.delay || 600;
    for (const chatId of chatIds) {
      try {
        const r = await this.sendMessage(chatId, message, options);
        results.push({ chatId, success: true, ...r });
      } catch (err) {
        results.push({ chatId, success: false, error: err.message });
        logger.warn(`TG broadcast failed ${chatId}: ${err.message}`);
      }
      await delay(ms);
    }
    return {
      sent:    results.filter(r =>  r.success).length,
      failed:  results.filter(r => !r.success).length,
      results,
    };
  },

  broadcastToChannels(channels, message, botToken) {
    return this.broadcast(channels, message, { botToken });
  },

  setupAutoReply(handler) {
    const bot = this.getBot();
    bot.on('message', async (ctx) => {
      const text  = ctx.message.text || '';
      const from  = String(ctx.from.id);
      const reply = await handler(from, text, 'telegram').catch(() => null);
      if (reply) await ctx.reply(reply);
    });
    logger.info('Telegram auto-reply handler attached');
  },

  async stopAll() {
    for (const bot of this._bots.values()) {
      await bot.stop().catch(() => {});
    }
    this._bots.clear();
  },
};

module.exports = TelegramService;
