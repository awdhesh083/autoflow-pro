/**
 * ══════════════════════════════════════════════════════════
 * WHATSAPP STATUS SERVICE — Feature 1
 * Features:
 *  - Post text/image/video/audio to WA Status
 *  - Auto-view all contacts' statuses
 *  - Auto-react to statuses (emoji reactions)
 *  - Status scheduler
 *  - Status analytics (who viewed yours)
 *  - Group status campaigns
 *  - Status story sequences
 * ══════════════════════════════════════════════════════════
 */

const fs     = require('fs');
const path   = require('path');
const logger = require('../../utils/logger');
const { delay, randomDelay } = require('../../utils/helpers');

class WhatsAppStatusService {
  constructor() {
    this.clients = new Map(); // from main WA service
  }

  // Get WA client from main service
  _getClient(accountId) {
    const WAService = require('../whatsapp.service');
    const client = WAService.clients?.get(accountId);
    if (!client) throw new Error(`WhatsApp not connected for account ${accountId}`);
    return client;
  }

  // ══════════════════════════════════════════════════════════
  // POST STATUS
  // ══════════════════════════════════════════════════════════

  // Post text status
  async postTextStatus(accountId, text, options = {}) {
    const client = this._getClient(accountId);
    const { backgroundColor = '#075e54', font = 2 } = options;

    try {
      await client.setStatus(text); // sets WA "About" text
      // For actual stories/status:
      await client.pupPage.evaluate(async (text, bg, font) => {
        // Use WA web internal API to post status
        window.WWebJS = window.WWebJS || {};
        const statusResult = await window.Store.StatusUtils.sendTextStatus({
          text,
          backgroundColor: bg,
          font,
        });
        return statusResult;
      }, text, backgroundColor, font);

      logger.info(`✅ WA text status posted for ${accountId}`);
      return { success: true, type: 'text', text };
    } catch (err) {
      // Fallback: use sendMessage to status broadcast list
      logger.warn(`WA status via pupPage failed, trying broadcast: ${err.message}`);
      await client.sendMessage('status@broadcast', text);
      return { success: true, type: 'text', text, method: 'broadcast' };
    }
  }

  // Post image status
  async postImageStatus(accountId, imagePath, caption = '', options = {}) {
    const client = this._getClient(accountId);

    try {
      const { MessageMedia } = require('whatsapp-web.js');
      const media = MessageMedia.fromFilePath(imagePath);
      media.caption = caption;

      await client.sendMessage('status@broadcast', media, {
        caption,
        sendMediaAsSticker: false,
      });

      logger.info(`✅ WA image status posted for ${accountId}`);
      return { success: true, type: 'image', caption, path: imagePath };
    } catch (err) {
      logger.error(`WA image status failed: ${err.message}`);
      throw err;
    }
  }

  // Post video status
  async postVideoStatus(accountId, videoPath, caption = '') {
    const client = this._getClient(accountId);
    const { MessageMedia } = require('whatsapp-web.js');

    const media = MessageMedia.fromFilePath(videoPath);
    await client.sendMessage('status@broadcast', media, { caption });

    logger.info(`✅ WA video status posted for ${accountId}`);
    return { success: true, type: 'video', caption };
  }

  // Post audio status (voice note as status)
  async postAudioStatus(accountId, audioPath) {
    const client = this._getClient(accountId);
    const { MessageMedia } = require('whatsapp-web.js');

    const media = MessageMedia.fromFilePath(audioPath);
    await client.sendMessage('status@broadcast', media, { sendAudioAsVoice: true });

    return { success: true, type: 'audio' };
  }

  // Post AI-generated image as status
  async postAIImageStatus(accountId, prompt, caption = '') {
    const AIImageService = require('../ai-image.service');
    const img = await AIImageService.generate(prompt, {
      width: 1080, height: 1920, // vertical for story format
    });
    return this.postImageStatus(accountId, img.filepath, caption);
  }

  // ══════════════════════════════════════════════════════════
  // STATUS SEQUENCE — post multiple statuses in order
  // ══════════════════════════════════════════════════════════
  async postStatusSequence(accountId, statusList, options = {}) {
    const { delayBetween = 5000 } = options;
    const results = [];

    for (const status of statusList) {
      try {
        let result;
        if (status.type === 'text')  result = await this.postTextStatus(accountId, status.content, status.options);
        if (status.type === 'image') result = await this.postImageStatus(accountId, status.path, status.caption);
        if (status.type === 'video') result = await this.postVideoStatus(accountId, status.path, status.caption);
        if (status.type === 'ai')    result = await this.postAIImageStatus(accountId, status.prompt, status.caption);
        results.push({ ...result, index: results.length });
        await delay(delayBetween);
      } catch (err) {
        results.push({ success: false, error: err.message, index: results.length });
      }
    }

    return { total: statusList.length, posted: results.filter(r => r.success).length, results };
  }

  // ══════════════════════════════════════════════════════════
  // VIEW ALL CONTACTS' STATUSES
  // ══════════════════════════════════════════════════════════
  async viewAllStatuses(accountId, options = {}) {
    const client = this._getClient(accountId);
    const { delayMin = 1000, delayMax = 3000, maxStatuses = 100 } = options;

    try {
      // Get all status updates
      const statuses = await client.pupPage.evaluate(async () => {
        const statusList = await window.Store.StatusStore.getStatuses();
        return statusList.map(s => ({
          id:        s.id._serialized,
          from:      s.from,
          name:      s.notifyName,
          timestamp: s.t,
          type:      s.type,
          body:      s.body,
          hasMedia:  s.hasMedia,
          viewed:    s.viewed,
        }));
      });

      const toView  = statuses.filter(s => !s.viewed).slice(0, maxStatuses);
      let viewed = 0;

      for (const status of toView) {
        try {
          // Mark as read/viewed
          await client.pupPage.evaluate(async (statusId) => {
            const msg = await window.Store.Msg.get(statusId);
            if (msg) await window.Store.ReadSeen.sendSeen(msg.chat, msg, false);
          }, status.id);

          viewed++;
          await delay(randomDelay(delayMin, delayMax));
        } catch {}
      }

      logger.info(`WA statuses viewed: ${viewed}/${toView.length}`);
      return { total: statuses.length, viewed, statuses: statuses.slice(0, 20) };

    } catch (err) {
      // Fallback
      logger.warn(`Status viewer fallback: ${err.message}`);
      return { total: 0, viewed: 0, error: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════
  // REACT TO STATUSES
  // ══════════════════════════════════════════════════════════
  async reactToStatuses(accountId, emoji = '❤️', options = {}) {
    const client = this._getClient(accountId);
    const { maxReactions = 50, delayMin = 2000, delayMax = 5000 } = options;

    try {
      const statuses = await client.pupPage.evaluate(async () => {
        const list = await window.Store.StatusStore.getStatuses();
        return list.map(s => ({ id: s.id._serialized, from: s.from }));
      });

      let reacted = 0;
      for (const status of statuses.slice(0, maxReactions)) {
        try {
          await client.pupPage.evaluate(async (statusId, reaction) => {
            const msg = await window.Store.Msg.get(statusId);
            if (msg) await window.Store.EmojiReact.sendEmojiReaction(msg, reaction);
          }, status.id, emoji);

          reacted++;
          await delay(randomDelay(delayMin, delayMax));
        } catch {}
      }

      return { total: statuses.length, reacted };
    } catch (err) {
      return { error: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════
  // WHO VIEWED MY STATUS
  // ══════════════════════════════════════════════════════════
  async getStatusViewers(accountId) {
    const client = this._getClient(accountId);

    try {
      const viewers = await client.pupPage.evaluate(async () => {
        const myStatuses = await window.Store.StatusStore.getMyStatuses();
        const result = [];
        for (const status of myStatuses) {
          const reads = await window.Store.StatusStore.getStatusReaders(status.id);
          result.push({
            statusId:  status.id._serialized,
            body:      status.body,
            timestamp: status.t,
            viewCount: reads.length,
            viewers:   reads.map(r => ({ id: r.id._serialized, name: r.notifyName, viewedAt: r.t })),
          });
        }
        return result;
      });

      return { success: true, data: viewers };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════
  // SCHEDULE STATUS
  // ══════════════════════════════════════════════════════════
  scheduleStatus(accountId, statusData, scheduledAt) {
    const delay = new Date(scheduledAt) - Date.now();
    if (delay <= 0) throw new Error('Scheduled time must be in the future');

    const timer = setTimeout(async () => {
      try {
        if (statusData.type === 'text')  await this.postTextStatus(accountId, statusData.content, statusData.options);
        if (statusData.type === 'image') await this.postImageStatus(accountId, statusData.path, statusData.caption);
        if (statusData.type === 'video') await this.postVideoStatus(accountId, statusData.path, statusData.caption);
        logger.info(`Scheduled WA status posted for ${accountId}`);
      } catch (err) {
        logger.error(`Scheduled WA status failed: ${err.message}`);
      }
    }, delay);

    return {
      success:     true,
      scheduledAt: new Date(scheduledAt),
      delayMs:     delay,
      message:     `Status scheduled for ${new Date(scheduledAt).toLocaleString()}`,
    };
  }
}

module.exports = new WhatsAppStatusService();
