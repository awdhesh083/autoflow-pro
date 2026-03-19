/**
 * ══════════════════════════════════════════════════════════
 * FACEBOOK SERVICE — Puppeteer Unofficial Automation
 * Features: Group mass poster, friend request bot,
 *           Marketplace auto-post, event mass inviter,
 *           page auto-liker, profile scraper
 * ══════════════════════════════════════════════════════════
 */

const puppeteer      = require('puppeteer-extra');
const StealthPlugin  = require('puppeteer-extra-plugin-stealth');
const AnonUAPlugin   = require('puppeteer-extra-plugin-anonymize-ua');
const path           = require('path');
const fs             = require('fs');
const logger         = require('../utils/logger');
const { delay, randomDelay, personalizeText } = require('../utils/helpers');
const { Account, MessageLog } = require('../models');

puppeteer.use(StealthPlugin());
puppeteer.use(AnonUAPlugin({ makeWindows: true }));

const FB_URL = 'https://www.facebook.com';

class FacebookService {
  constructor() {
    this.browsers  = new Map(); // accountId → browser
    this.pages     = new Map(); // accountId → page
    this.cookieDir = './sessions/facebook';
    if (!fs.existsSync(this.cookieDir)) fs.mkdirSync(this.cookieDir, { recursive: true });
  }

  // ── Launch browser with stealth ─────────────────────────
  async _launch(accountId, proxy) {
    const args = [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars', '--window-size=1366,768',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--lang=en-US,en',
    ];
    if (proxy?.host) args.push(`--proxy-server=${proxy.host}:${proxy.port}`);

    const browser = await puppeteer.launch({
      headless: process.env.FB_HEADLESS !== 'false',
      args,
      defaultViewport: { width: 1366, height: 768 },
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    // Set realistic headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });

    // Proxy auth if needed
    if (proxy?.username) {
      await page.authenticate({ username: proxy.username, password: proxy.password });
    }

    this.browsers.set(accountId, browser);
    this.pages.set(accountId, page);
    return { browser, page };
  }

  // ── Login to Facebook ────────────────────────────────────
  async login(accountId, email, password) {
    const account  = await Account.findById(accountId).select('+credentials');
    const { page } = await this._launch(accountId, account?.proxy);

    // Try restoring cookies first
    const cookiePath = path.join(this.cookieDir, `${accountId}.json`);
    if (fs.existsSync(cookiePath)) {
      const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      await page.setCookie(...cookies);
      await page.goto(`${FB_URL}/`, { waitUntil: 'networkidle2' });

      // Check if still logged in
      const loggedIn = await page.$('[aria-label="Your profile"]');
      if (loggedIn) {
        logger.info(`Facebook session restored for ${accountId}`);
        return { success: true, restored: true };
      }
    }

    // Fresh login
    await page.goto(`${FB_URL}/login`, { waitUntil: 'networkidle2' });
    await delay(randomDelay(1000, 3000));

    await this._humanType(page, '#email', email);
    await delay(randomDelay(500, 1500));
    await this._humanType(page, '#pass', password);
    await delay(randomDelay(500, 1000));
    await page.click('[name="login"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    // Check for checkpoint/2FA
    const url = page.url();
    if (url.includes('checkpoint') || url.includes('two_step')) {
      return { success: false, requires2FA: true, message: 'Facebook requires verification' };
    }

    if (url.includes('facebook.com') && !url.includes('login')) {
      // Save cookies
      const cookies = await page.cookies();
      fs.writeFileSync(cookiePath, JSON.stringify(cookies));
      logger.info(`✅ Facebook logged in: ${email}`);
      return { success: true };
    }

    return { success: false, message: 'Login failed — wrong credentials?' };
  }

  // ── Post to Facebook Groups ──────────────────────────────
  async postToGroups(accountId, groupUrls, message, options = {}) {
    const page = this.pages.get(accountId);
    if (!page) throw new Error('Facebook not logged in. Call login() first.');

    const {
      delayMin    = 60000,   // 1 min between posts (FB detects spam fast)
      delayMax    = 180000,  // 3 min
      imageUrl    = null,
      skipErrors  = true,
    } = options;

    const results = { posted: 0, failed: 0, skipped: 0, errors: [] };

    for (const groupUrl of groupUrls) {
      try {
        // Navigate to group
        await page.goto(groupUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await delay(randomDelay(3000, 7000));

        // Check if we're in the group (might need to join)
        const joinBtn = await page.$('[aria-label="Join group"]');
        if (joinBtn) {
          results.skipped++;
          logger.info(`Skipped group (not a member): ${groupUrl}`);
          continue;
        }

        // Click "Write something..." post box
        const postBox = await page.$('[data-pagelet="GroupInlineComposer"] [contenteditable="true"]')
          || await page.$('div[role="button"][tabindex="0"]:has-text("Write something")')
          || await page.$('[aria-label="Write something to the group..."]');

        if (!postBox) {
          // Try clicking the placeholder text area
          await page.evaluate(() => {
            const el = document.querySelector('[data-testid="status-attachment-mentions-input"]');
            if (el) el.click();
          });
          await delay(2000);
        }

        await page.click('[contenteditable="true"]').catch(() => {});
        await delay(randomDelay(1000, 2000));

        // Type message with human-like speed
        await this._humanTypeInEditor(page, message);
        await delay(randomDelay(1000, 2000));

        // Add image if provided
        if (imageUrl) {
          // Click photo/video button
          const photoBtn = await page.$('[aria-label="Photo/Video"]');
          if (photoBtn) await photoBtn.click();
          await delay(2000);
        }

        // Find and click Post button
        const postBtn = await page.$('[aria-label="Post"]')
          || await page.$('div[aria-label="Post"][role="button"]');

        if (postBtn) {
          await postBtn.click();
          await delay(randomDelay(3000, 6000));
          results.posted++;
          logger.info(`✅ Posted to FB group: ${groupUrl}`);
        } else {
          results.failed++;
          results.errors.push({ group: groupUrl, error: 'Post button not found' });
        }

        // Wait between posts
        const waitMs = randomDelay(delayMin, delayMax);
        logger.info(`FB waiting ${Math.round(waitMs/60000)} minutes before next post...`);
        await delay(waitMs);

      } catch (err) {
        results.failed++;
        results.errors.push({ group: groupUrl, error: err.message });
        logger.error(`FB group post failed for ${groupUrl}: ${err.message}`);

        if (!skipErrors) throw err;
        await delay(randomDelay(10000, 30000));
      }
    }

    return results;
  }

  // ── Scrape Facebook group members ───────────────────────
  async scrapeGroupMembers(accountId, groupUrl, limit = 100) {
    const page = this.pages.get(accountId);
    if (!page) throw new Error('Not logged in');

    await page.goto(`${groupUrl}/members`, { waitUntil: 'networkidle2' });
    await delay(3000);

    const members = [];
    let lastHeight = 0;

    while (members.length < limit) {
      // Scrape visible member cards
      const newMembers = await page.evaluate(() => {
        const cards = document.querySelectorAll('[data-visualcompletion="ignore-dynamic"] a[href*="facebook.com"]');
        return Array.from(cards).map(el => ({
          name:    el.innerText?.trim(),
          profile: el.href,
        })).filter(m => m.name && m.profile.includes('facebook.com/'));
      });

      for (const m of newMembers) {
        if (!members.find(ex => ex.profile === m.profile)) members.push(m);
      }

      // Scroll down
      await page.evaluate(() => window.scrollBy(0, 1000));
      await delay(randomDelay(2000, 4000));

      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === lastHeight) break;
      lastHeight = newHeight;
    }

    return members.slice(0, limit);
  }

  // ── Post to Facebook Marketplace ────────────────────────
  async postMarketplace(accountId, listing) {
    const page = this.pages.get(accountId);
    if (!page) throw new Error('Not logged in');

    const {
      title, price, description, category = 'Miscellaneous',
      condition = 'New', location, images = []
    } = listing;

    await page.goto(`${FB_URL}/marketplace/create/item`, { waitUntil: 'networkidle2' });
    await delay(3000);

    // Fill title
    await this._humanType(page, '[aria-label="Title"]', title);
    await delay(500);

    // Fill price
    await this._humanType(page, '[aria-label="Price"]', price.toString());
    await delay(500);

    // Fill category
    const catInput = await page.$('[aria-label="Category"]');
    if (catInput) {
      await catInput.click();
      await this._humanType(page, '[aria-label="Category"]', category);
      await delay(1000);
      await page.keyboard.press('Enter');
    }

    // Fill description
    await this._humanType(page, '[aria-label="Description"]', description);
    await delay(500);

    // Upload images
    for (const imgPath of images) {
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) await fileInput.uploadFile(imgPath);
      await delay(2000);
    }

    // Submit
    const nextBtn = await page.$('[aria-label="Next"]');
    if (nextBtn) { await nextBtn.click(); await delay(2000); }

    const publishBtn = await page.$('[aria-label="Publish"]');
    if (publishBtn) { await publishBtn.click(); await delay(3000); }

    return { success: true, title, price };
  }

  // ── Send friend requests ─────────────────────────────────
  async sendFriendRequests(accountId, profileUrls, options = {}) {
    const page = this.pages.get(accountId);
    if (!page) throw new Error('Not logged in');

    const { maxPerDay = 15, delayMin = 30000, delayMax = 90000 } = options;
    const results = { sent: 0, failed: 0 };

    for (const profileUrl of profileUrls.slice(0, maxPerDay)) {
      try {
        await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await delay(randomDelay(2000, 5000));

        const addBtn = await page.$('[aria-label="Add friend"]');
        if (addBtn) {
          await addBtn.click();
          results.sent++;
          await delay(randomDelay(delayMin, delayMax));
        } else {
          results.failed++;
        }
      } catch (err) {
        results.failed++;
      }
    }
    return results;
  }

  // ── Invite friends to event ──────────────────────────────
  async inviteToEvent(accountId, eventUrl, options = {}) {
    const page = this.pages.get(accountId);
    if (!page) throw new Error('Not logged in');

    await page.goto(eventUrl, { waitUntil: 'networkidle2' });
    await delay(3000);

    // Click Invite button
    const inviteBtn = await page.$('[aria-label="Invite"]');
    if (!inviteBtn) return { success: false, message: 'Invite button not found' };

    await inviteBtn.click();
    await delay(2000);

    // Select all friends
    const selectAllBtn = await page.$('[aria-label="Select all friends"]');
    if (selectAllBtn) await selectAllBtn.click();
    await delay(1000);

    // Send invites
    const sendBtn = await page.$('[aria-label="Send Invites"]');
    if (sendBtn) { await sendBtn.click(); await delay(3000); }

    return { success: true };
  }

  // ── Get page from account ────────────────────────────────
  getPage(accountId) {
    return this.pages.get(accountId);
  }

  // ── Disconnect ───────────────────────────────────────────
  async disconnect(accountId) {
    const browser = this.browsers.get(accountId);
    if (browser) { await browser.close(); this.browsers.delete(accountId); this.pages.delete(accountId); }
  }

  // ── Human-like typing ────────────────────────────────────
  async _humanType(page, selector, text) {
    await page.waitForSelector(selector, { timeout: 10000 });
    await page.click(selector);
    await page.evaluate(sel => { document.querySelector(sel).value = ''; }, selector);
    for (const char of text) {
      await page.type(selector, char, { delay: randomDelay(50, 150) });
    }
  }

  async _humanTypeInEditor(page, text) {
    for (const char of text) {
      await page.keyboard.type(char, { delay: randomDelay(30, 120) });
    }
  }
}

module.exports = new FacebookService();
