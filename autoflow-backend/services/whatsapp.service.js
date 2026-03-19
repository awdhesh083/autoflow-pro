/**
 * WhatsApp Service
 * Uses whatsapp-web.js (Baileys-based) for unofficial WA API
 * Supports multi-device, QR login, session persistence, anti-detection
 */
const { Client, LocalAuth, MessageMedia, Buttons, List } = require('whatsapp-web.js');
const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const qrcode        = require('qrcode');
const path          = require('path');
const fs            = require('fs');
const logger        = require('../utils/logger');
const { delay, randomDelay, personalizeText } = require('../utils/helpers');
const { Account, MessageLog, Contact }        = require('../models');

puppeteer.use(StealthPlugin());

class WhatsAppService {
  constructor() {
    this.clients  = new Map();   // accountId → Client instance
    this.qrCodes  = new Map();   // accountId → QR code data URL
    this.io       = null;
    this.sessionPath = process.env.WA_SESSION_PATH || './sessions/whatsapp';

    if (!fs.existsSync(this.sessionPath)) {
      fs.mkdirSync(this.sessionPath, { recursive: true });
    }
  }

  setSocket(io) { this.io = io; }

  emit(accountId, event, data) {
    if (this.io) this.io.to(`account:${accountId}`).emit(event, data);
  }

  // ── Initialize a WA client for an account ──────────────
  async initClient(account) {
    const accountId = account._id.toString();

    if (this.clients.has(accountId)) {
      logger.info(`WA client already exists for ${accountId}`);
      return;
    }

    logger.info(`Initializing WA client for account ${accountId}`);

    // Build puppeteer args with stealth + proxy
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--window-size=1920,1080',
    ];

    if (account.proxy?.host) {
      args.push(`--proxy-server=${account.proxy.host}:${account.proxy.port}`);
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId:    accountId,
        dataPath:    this.sessionPath,
      }),
      puppeteer: {
        headless:           process.env.WA_HEADLESS !== 'false',
        executablePath:     puppeteer.executablePath(),
        args,
        defaultViewport:    null,
        ignoreHTTPSErrors:  true,
      },
      webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' },
    });

    // ── Events ─────────────────────────────────────────
    client.on('qr', async (qr) => {
      try {
        const qrDataURL = await qrcode.toDataURL(qr);
        this.qrCodes.set(accountId, qrDataURL);
        this.emit(accountId, 'wa:qr', { accountId, qr: qrDataURL });
        logger.info(`WA QR generated for account ${accountId}`);
      } catch (err) {
        logger.error(`QR generation error: ${err.message}`);
      }
    });

    client.on('ready', async () => {
      logger.info(`✅ WA ready for account ${accountId}`);
      this.qrCodes.delete(accountId);
      await Account.findByIdAndUpdate(accountId, { status: 'active', lastActive: new Date() });
      this.emit(accountId, 'wa:ready', { accountId });
    });

    client.on('authenticated', () => {
      logger.info(`WA authenticated for account ${accountId}`);
      this.emit(accountId, 'wa:authenticated', { accountId });
    });

    client.on('auth_failure', async (msg) => {
      logger.error(`WA auth failed for ${accountId}: ${msg}`);
      await Account.findByIdAndUpdate(accountId, { status: 'disconnected', health: 0 });
      this.emit(accountId, 'wa:auth_failure', { accountId, message: msg });
    });

    client.on('disconnected', async (reason) => {
      logger.warn(`WA disconnected for ${accountId}: ${reason}`);
      this.clients.delete(accountId);
      await Account.findByIdAndUpdate(accountId, { status: 'disconnected' });
      this.emit(accountId, 'wa:disconnected', { accountId, reason });
    });

    client.on('message', async (msg) => {
      await this._handleIncoming(accountId, msg);
    });

    client.on('message_ack', async (msg, ack) => {
      // ack: 1=sent, 2=delivered, 3=read
      await this._handleAck(accountId, msg, ack);
    });

    this.clients.set(accountId, client);

    try {
      await client.initialize();
    } catch (err) {
      logger.error(`WA init error for ${accountId}: ${err.message}`);
      this.clients.delete(accountId);
      throw err;
    }
  }

  // ── Send single message ─────────────────────────────────
  async sendMessage(accountId, to, content, options = {}) {
    const client = this.clients.get(accountId);
    if (!client) throw new Error(`WA client not initialized for account ${accountId}`);

    // Normalize phone: ensure @c.us suffix
    const chatId = to.includes('@') ? to : `${to.replace(/[^0-9]/g, '')}@c.us`;

    try {
      let msg;
      if (options.media) {
        const media = await MessageMedia.fromUrl(options.media.url, { unsafeMime: true });
        msg = await client.sendMessage(chatId, media, {
          caption: content,
          sendMediaAsDocument: options.asDocument || false,
        });
      } else if (options.buttons) {
        const btns = new Buttons(content, options.buttons.map(b => ({ body: b.text })));
        msg = await client.sendMessage(chatId, btns);
      } else {
        msg = await client.sendMessage(chatId, content);
      }

      return { success: true, messageId: msg.id._serialized, status: 'sent' };
    } catch (err) {
      logger.error(`WA send error to ${to}: ${err.message}`);
      throw err;
    }
  }

  // ── Bulk broadcast with anti-spam ───────────────────────
  async sendBulk(campaignId, accountId, contacts, messageTemplate, options = {}) {
    const {
      delayMin = 2000,
      delayMax = 8000,
      rotateAccounts = false,
      variables = {},
    } = options;

    const results = { sent: 0, failed: 0, skipped: 0, errors: [] };

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];

      try {
        // Personalize message
        const personalizedMsg = personalizeText(messageTemplate, {
          name:    contact.name || 'Friend',
          phone:   contact.phone,
          email:   contact.email,
          company: contact.company || '',
          ...variables,
        });

        // Validate phone
        if (!contact.phone) {
          results.skipped++;
          continue;
        }

        // Check if WA number is valid (optional - skips if not checked)
        const phone = contact.phone.replace(/[^0-9]/g, '');

        // Send message
        const result = await this.sendMessage(accountId, phone, personalizedMsg, options);

        // Log to DB
        await MessageLog.create({
          userId:     options.userId,
          campaignId,
          contactId:  contact._id,
          platform:   'whatsapp',
          to:         contact.phone,
          body:       personalizedMsg,
          status:     'sent',
          externalId: result.messageId,
        });

        // Update contact stats
        await Contact.findByIdAndUpdate(contact._id, {
          $inc: { 'stats.waSent': 1 },
          lastContacted: new Date(),
        });

        results.sent++;

        // Emit progress
        if (this.io) {
          this.io.to(`campaign:${campaignId}`).emit('campaign:progress', {
            campaignId,
            sent:     results.sent,
            failed:   results.failed,
            total:    contacts.length,
            progress: Math.round(((results.sent + results.failed) / contacts.length) * 100),
          });
        }

        // Anti-spam delay between messages
        if (i < contacts.length - 1) {
          const ms = randomDelay(delayMin, delayMax);
          logger.debug(`WA anti-spam delay: ${ms}ms`);
          await delay(ms);
        }

        // Hourly limit check
        if (results.sent % 50 === 0) {
          const account = await Account.findById(accountId);
          if (account && account.limits.hourlySent >= account.limits.hourlyLimit) {
            logger.warn(`WA hourly limit reached for account ${accountId}. Pausing 1hr.`);
            await delay(3600000);
            await Account.findByIdAndUpdate(accountId, { 'limits.hourlySent': 0 });
          }
        }

      } catch (err) {
        results.failed++;
        results.errors.push({ contact: contact.phone, error: err.message });
        logger.error(`WA bulk send error for ${contact.phone}: ${err.message}`);

        // Log failure
        await MessageLog.create({
          userId:     options.userId,
          campaignId,
          contactId:  contact._id,
          platform:   'whatsapp',
          to:         contact.phone,
          status:     'failed',
          errorMessage: err.message,
        }).catch(() => {});
      }
    }

    return results;
  }

  // ── Check if number exists on WA ────────────────────────
  async checkNumber(accountId, phone) {
    const client = this.clients.get(accountId);
    if (!client) return { valid: false, error: 'Client not initialized' };

    try {
      const phoneNum   = phone.replace(/[^0-9]/g, '');
      const isValid    = await client.isRegisteredUser(`${phoneNum}@c.us`);
      return { valid: isValid, phone };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  // ── Bulk number validation ──────────────────────────────
  async validateNumbers(accountId, phones) {
    const results = [];
    for (const phone of phones) {
      const result = await this.checkNumber(accountId, phone);
      results.push(result);
      await delay(200); // small delay
    }
    return results;
  }

  // ── Get QR code for account ─────────────────────────────
  getQRCode(accountId) {
    return this.qrCodes.get(accountId) || null;
  }

  // ── Get client status ───────────────────────────────────
  getStatus(accountId) {
    const client = this.clients.get(accountId);
    if (!client) return 'disconnected';
    return client.pupBrowser ? 'connected' : 'disconnected';
  }

  // ── Disconnect client ───────────────────────────────────
  async disconnect(accountId) {
    const client = this.clients.get(accountId);
    if (client) {
      await client.destroy();
      this.clients.delete(accountId);
      logger.info(`WA client disconnected: ${accountId}`);
    }
  }

  // ── Handle incoming messages ────────────────────────────
  async _handleIncoming(accountId, msg) {
    if (msg.fromMe) return;

    try {
      const contact = msg.from.replace('@c.us', '');

      // Save to message log
      const log = await MessageLog.create({
        campaignId: null,
        platform:   'whatsapp',
        direction:  'inbound',
        from:       contact,
        body:       msg.body,
        status:     'delivered',
        externalId: msg.id._serialized,
      });

      // Emit to UI
      this.emit(accountId, 'wa:message', {
        accountId,
        from:  contact,
        body:  msg.body,
        time:  new Date(),
        logId: log._id,
      });

      // Trigger auto-reply (handled by AutoReplyService)
      const AutoReplyService = require('./autoreply.service');
      await AutoReplyService.process(accountId, contact, msg.body, 'whatsapp', {
        client: this.clients.get(accountId),
      });

    } catch (err) {
      logger.error(`WA incoming handler error: ${err.message}`);
    }
  }

  // ── Handle message ACK updates ──────────────────────────
  async _handleAck(accountId, msg, ack) {
    const statusMap = { 1: 'sent', 2: 'delivered', 3: 'read' };
    const status    = statusMap[ack];
    if (!status) return;

    try {
      await MessageLog.findOneAndUpdate(
        { externalId: msg.id._serialized },
        { status, ...(status === 'delivered' ? { deliveredAt: new Date() } : {}) }
      );
    } catch (err) {
      logger.error(`WA ACK update error: ${err.message}`);
    }
  }

  // ── Auto-initialize all active WA accounts on startup ───
  async initAll() {
    try {
      const accounts = await Account.find({ platform: 'whatsapp', status: { $in: ['active','disconnected'] } });
      logger.info(`Auto-initializing ${accounts.length} WA accounts...`);
      for (const account of accounts) {
        this.initClient(account).catch(err =>
          logger.error(`Failed to init WA account ${account._id}: ${err.message}`)
        );
        await delay(3000); // stagger initialization
      }
    } catch (err) {
      logger.error(`WA initAll error: ${err.message}`);
    }
  }
}

module.exports = new WhatsAppService();
