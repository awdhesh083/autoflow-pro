/**
 * ══════════════════════════════════════════════════════════
 * FACEBOOK MESSENGER SERVICE — Feature 6
 * Features:
 *  - Bulk DM to FB friends / connections
 *  - AI-powered Messenger chatbot (auto-reply)
 *  - Send media, links, templates
 *  - Broadcast lists
 *  - Message sequences / drip via Messenger
 *  - Read receipt tracker
 *  - Messenger lead capture
 *  - Business Page Messenger integration
 *  - Comment-to-DM automation
 *    (someone comments → auto send them DM)
 * Uses: Puppeteer + Graph API (free tier)
 * ══════════════════════════════════════════════════════════
 */

const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios         = require('axios');
const fs            = require('fs');
const path          = require('path');
const logger        = require('../../utils/logger');
const { delay, randomDelay, personalizeText } = require('../../utils/helpers');
const { MessageLog, Contact } = require('../../models');

puppeteer.use(StealthPlugin());

const FB_URL     = 'https://www.facebook.com';
const MSG_URL    = 'https://www.messenger.com';
const COOKIE_DIR = './sessions/messenger';
if (!fs.existsSync(COOKIE_DIR)) fs.mkdirSync(COOKIE_DIR, { recursive: true });

class MessengerService {
  constructor() {
    this.browsers = new Map();
    this.pages    = new Map();
    this.wsClients= new Map(); // Webhook listeners
  }

  // ── Launch browser ─────────────────────────────────────
  async _launch(accountId, proxy) {
    const args = [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1440,900',
    ];
    if (proxy?.host) args.push(`--proxy-server=${proxy.host}:${proxy.port}`);

    const browser = await puppeteer.launch({
      headless: process.env.FB_HEADLESS !== 'false',
      args,
      defaultViewport: { width: 1440, height: 900 },
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    if (proxy?.username) await page.authenticate({ username: proxy.username, password: proxy.password });

    this.browsers.set(accountId, browser);
    this.pages.set(accountId, page);
    return { browser, page };
  }

  // ── Login to Messenger ─────────────────────────────────
  async login(accountId, email, password) {
    const { page } = await this._launch(accountId);

    const cookiePath = path.join(COOKIE_DIR, `${accountId}.json`);
    if (fs.existsSync(cookiePath)) {
      await page.setCookie(...JSON.parse(fs.readFileSync(cookiePath, 'utf8')));
      await page.goto(MSG_URL, { waitUntil: 'networkidle2' });
      const loggedIn = await page.$('[aria-label="New message"]') || await page.$('[aria-label="Chats"]');
      if (loggedIn) {
        logger.info(`Messenger session restored: ${accountId}`);
        return { success: true, restored: true };
      }
    }

    // Login via Facebook
    await page.goto(`${FB_URL}/login`, { waitUntil: 'networkidle2' });
    await delay(randomDelay(1000, 2000));

    await page.type('#email', email, { delay: randomDelay(50, 120) });
    await delay(500);
    await page.type('#pass', password, { delay: randomDelay(50, 120) });
    await delay(500);
    await page.click('[name="login"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    const url = page.url();
    if (url.includes('checkpoint') || url.includes('two_step')) {
      return { success: false, requires2FA: true, message: 'FB requires verification' };
    }

    if (url.includes('facebook.com') && !url.includes('login')) {
      const cookies = await page.cookies();
      fs.writeFileSync(cookiePath, JSON.stringify(cookies));
      // Navigate to Messenger
      await page.goto(MSG_URL, { waitUntil: 'networkidle2' });
      logger.info(`✅ Messenger logged in: ${email}`);
      return { success: true };
    }

    return { success: false, message: 'Login failed' };
  }

  _getPage(accountId) {
    const page = this.pages.get(accountId);
    if (!page) throw new Error(`Messenger not initialized for ${accountId}`);
    return page;
  }

  // ══════════════════════════════════════════════════════════
  // SEND SINGLE MESSAGE
  // ══════════════════════════════════════════════════════════
  async sendMessage(accountId, recipientId, message, options = {}) {
    const page = this._getPage(accountId);

    try {
      // Navigate to conversation (by profile URL or name)
      const convUrl = recipientId.startsWith('http')
        ? recipientId.replace('facebook.com', 'messenger.com')
        : `${MSG_URL}/t/${recipientId}`;

      await page.goto(convUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      await delay(randomDelay(2000, 4000));

      // Find message input
      const input = await page.$('[role="textbox"][contenteditable="true"]') ||
        await page.$('div[aria-label*="message"]');

      if (!input) throw new Error('Message input not found');

      await input.click();
      await delay(500);

      // Type message with human speed
      for (const char of message) {
        await page.keyboard.type(char, { delay: randomDelay(20, 70) });
      }

      // Send media if provided
      if (options.imagePath) {
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) { await fileInput.uploadFile(options.imagePath); await delay(2000); }
      }

      // Press Enter to send
      await page.keyboard.press('Enter');
      await delay(1000);

      await MessageLog.create({
        platform: 'messenger', direction: 'outbound',
        to: recipientId, body: message,
      }).catch(() => {});

      return { success: true, to: recipientId, message };
    } catch (err) {
      logger.error(`Messenger send failed to ${recipientId}: ${err.message}`);
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════
  // BULK DM SENDER
  // ══════════════════════════════════════════════════════════
  async sendBulkDM(accountId, targets, messageTemplate, options = {}) {
    const {
      delayMin     = 30000,  // Messenger is strict — 30s min
      delayMax     = 90000,
      maxPerDay    = 15,     // Very conservative for safety
      userId,
      campaignId,
    } = options;

    const results = { sent: 0, failed: 0, skipped: 0, errors: [] };

    for (const target of targets.slice(0, maxPerDay)) {
      try {
        const message = personalizeText(messageTemplate, {
          name:      target.name || target.username || 'Friend',
          firstname: target.name?.split(' ')[0] || 'Friend',
          ...options.variables,
        });

        await this.sendMessage(accountId, target.profileUrl || target.username, message);

        await MessageLog.create({
          platform: 'messenger', direction: 'outbound',
          to: target.profileUrl || target.username,
          body: message, userId, campaignId,
          status: 'sent',
        }).catch(() => {});

        results.sent++;
        logger.info(`Messenger DM sent to: ${target.name}`);

        const waitMs = randomDelay(delayMin, delayMax);
        logger.info(`Messenger anti-ban wait: ${Math.round(waitMs/1000)}s`);
        await delay(waitMs);

        // Extra long break every 5 messages
        if (results.sent % 5 === 0) {
          logger.info('Messenger taking 5 min break...');
          await delay(randomDelay(300000, 600000));
        }

      } catch (err) {
        results.failed++;
        results.errors.push({ target: target.name, error: err.message });
        await delay(randomDelay(10000, 30000));
      }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // COMMENT-TO-DM AUTOMATION
  // Auto DM anyone who comments on your post
  // ══════════════════════════════════════════════════════════
  async setupCommentToDM(accountId, postUrl, dmMessage, options = {}) {
    const page = this._getPage(accountId);
    const { checkIntervalMs = 60000, maxDMs = 50 } = options;
    const alreadyDMed = new Set();

    logger.info(`Comment-to-DM activated for post: ${postUrl}`);

    const checkAndDM = async () => {
      try {
        await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await delay(2000);

        // Scrape comments
        const commenters = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('[data-testid="UFI2Comment/body"] a')).map(a => ({
            name:       a.innerText?.trim(),
            profileUrl: a.href,
          })).filter(c => c.name && c.profileUrl.includes('facebook.com'));
        });

        for (const commenter of commenters) {
          if (!alreadyDMed.has(commenter.profileUrl) && alreadyDMed.size < maxDMs) {
            const msg = personalizeText(dmMessage, {
              name: commenter.name,
              firstname: commenter.name.split(' ')[0],
            });

            await this.sendMessage(accountId, commenter.profileUrl, msg).catch(() => {});
            alreadyDMed.add(commenter.profileUrl);
            await delay(randomDelay(10000, 30000));
          }
        }
      } catch (err) {
        logger.error(`Comment-to-DM check failed: ${err.message}`);
      }
    };

    // Start polling
    await checkAndDM();
    const intervalId = setInterval(checkAndDM, checkIntervalMs);

    // Auto-stop after 24h
    setTimeout(() => clearInterval(intervalId), 86400000);

    return {
      success:    true,
      postUrl,
      message:    'Comment-to-DM automation started',
      checkEvery: `${checkIntervalMs / 60000} minutes`,
      maxDMs,
    };
  }

  // ══════════════════════════════════════════════════════════
  // GET ALL CONVERSATIONS
  // ══════════════════════════════════════════════════════════
  async getConversations(accountId, limit = 50) {
    const page = this._getPage(accountId);

    await page.goto(MSG_URL, { waitUntil: 'networkidle2' });
    await delay(3000);

    const convs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-testid="mwthreadlist-item"]')).map(item => ({
        name:       item.querySelector('[data-testid="mwthreadlist-item-link"] span')?.innerText?.trim(),
        lastMsg:    item.querySelectorAll('span')[2]?.innerText?.trim(),
        time:       item.querySelector('[aria-label*="ago"]')?.innerText?.trim(),
        unread:     !!item.querySelector('[aria-label*="unread"]'),
      })).filter(c => c.name);
    });

    return { total: convs.length, conversations: convs.slice(0, limit) };
  }

  // ══════════════════════════════════════════════════════════
  // AI AUTO-REPLY BOT
  // ══════════════════════════════════════════════════════════
  async startAutoReplyBot(accountId, options = {}) {
    const page = this._getPage(accountId);
    const {
      systemPrompt  = 'You are a helpful customer support agent. Be concise and friendly.',
      checkInterval = 30000,
      maxReplies    = 100,
    } = options;

    const AIService  = require('../index').AIService;
    const replied    = new Set();
    let   replyCount = 0;

    const checkAndReply = async () => {
      if (replyCount >= maxReplies) return;

      try {
        await page.goto(MSG_URL, { waitUntil: 'networkidle2' });
        await delay(2000);

        // Get unread conversations
        const unreadConvs = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('[data-testid="mwthreadlist-item"]'))
            .filter(item => item.querySelector('[aria-label*="unread"]'))
            .map(item => ({
              href: item.querySelector('a')?.href,
              name: item.querySelector('span')?.innerText?.trim(),
            })).filter(c => c.href).slice(0, 5);
        });

        for (const conv of unreadConvs) {
          const convKey = `${conv.href}-${Date.now().toString().slice(0,-5)}`; // ~10s bucket
          if (replied.has(conv.href)) continue;

          try {
            await page.goto(conv.href, { waitUntil: 'networkidle2' });
            await delay(2000);

            // Get last message
            const lastMsg = await page.evaluate(() => {
              const msgs = document.querySelectorAll('[data-testid="message-text"]');
              return msgs[msgs.length - 1]?.innerText?.trim();
            });

            if (!lastMsg) continue;

            // Generate AI reply
            const reply = await AIService.chat(lastMsg, [], systemPrompt);
            if (!reply) continue;

            // Type and send reply
            const input = await page.$('[role="textbox"][contenteditable="true"]');
            if (input) {
              await input.click();
              await page.keyboard.type(reply, { delay: randomDelay(30, 80) });
              await page.keyboard.press('Enter');
              replied.add(conv.href);
              replyCount++;
              logger.info(`Messenger AI replied to ${conv.name}`);
              await delay(randomDelay(2000, 5000));
            }
          } catch {}
        }
      } catch (err) {
        logger.error(`Messenger auto-reply error: ${err.message}`);
      }
    };

    await checkAndReply();
    const intervalId = setInterval(checkAndReply, checkInterval);
    setTimeout(() => clearInterval(intervalId), 86400000); // auto-stop after 24h

    return {
      success: true,
      message: 'Messenger AI auto-reply bot started',
      checkEvery: `${checkInterval / 1000}s`,
    };
  }

  // ══════════════════════════════════════════════════════════
  // GRAPH API — For Business Pages (Free tier)
  // ══════════════════════════════════════════════════════════

  // Send message via Graph API (Page Messenger)
  async sendPageMessage(pageAccessToken, recipientId, message) {
    const res = await axios.post(
      `https://graph.facebook.com/v18.0/me/messages`,
      {
        recipient: { id: recipientId },
        message:   { text: message },
        messaging_type: 'RESPONSE',
      },
      { params: { access_token: pageAccessToken } }
    );
    return res.data;
  }

  // Send template message (button template)
  async sendButtonTemplate(pageAccessToken, recipientId, text, buttons) {
    const res = await axios.post(
      `https://graph.facebook.com/v18.0/me/messages`,
      {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'button',
              text,
              buttons: buttons.map(b => ({
                type:    b.type || 'web_url',
                title:   b.title,
                url:     b.url,
                payload: b.payload,
              })),
            },
          },
        },
      },
      { params: { access_token: pageAccessToken } }
    );
    return res.data;
  }

  // Handle incoming Messenger webhook
  async handleWebhook(body, pageAccessToken, autoReplyRules = []) {
    const AIService = require('../index').AIService;

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.message || event.message.is_echo) continue;

        const senderId = event.sender.id;
        const text     = event.message.text || '';

        // Check auto-reply rules
        for (const rule of autoReplyRules) {
          let matches = false;
          if (rule.trigger === 'all') matches = true;
          else if (rule.trigger === 'keyword') {
            matches = rule.keywords?.some(kw => text.toLowerCase().includes(kw.toLowerCase()));
          }

          if (matches) {
            let reply = rule.response;
            if (rule.type === 'ai') {
              reply = await AIService.chat(text, [], rule.systemPrompt).catch(() => null);
            }
            if (reply) {
              await this.sendPageMessage(pageAccessToken, senderId, reply).catch(() => {});
            }
            break;
          }
        }

        // Log incoming message
        await MessageLog.create({
          platform: 'messenger', direction: 'inbound',
          from: senderId, body: text,
        }).catch(() => {});
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // GET FRIENDS LIST (for bulk DM targeting)
  // ══════════════════════════════════════════════════════════
  async getFriendsList(accountId, limit = 200) {
    const page    = this._getPage(accountId);
    const friends = [];

    await page.goto(`${FB_URL}/friends/list`, { waitUntil: 'networkidle2' });
    await delay(3000);

    let prevCount = 0;
    while (friends.length < limit) {
      const items = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-pagelet="FriendListPagelet"] a[href*="facebook.com"]')).map(a => ({
          name:       a.querySelector('[dir="auto"]')?.innerText?.trim(),
          profileUrl: a.href,
        })).filter(f => f.name)
      );

      for (const item of items) {
        if (!friends.find(f => f.profileUrl === item.profileUrl)) friends.push(item);
      }

      if (friends.length === prevCount) break;
      prevCount = friends.length;

      await page.evaluate(() => window.scrollBy(0, 1000));
      await delay(randomDelay(1500, 3000));
    }

    return { total: friends.length, friends: friends.slice(0, limit) };
  }

  async disconnect(accountId) {
    const browser = this.browsers.get(accountId);
    if (browser) { await browser.close(); this.browsers.delete(accountId); this.pages.delete(accountId); }
  }
}

module.exports = new MessengerService();
