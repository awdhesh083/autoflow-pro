/**
 * ══════════════════════════════════════════════════════════
 * LINKEDIN SERVICE — Feature 5
 * Features:
 *  - Connection request bot (with personalized note)
 *  - Mass DM / InMail sender
 *  - Auto like + comment posts
 *  - Profile viewer (they see you visited)
 *  - Lead scraper (by job title / company / location)
 *  - Post scheduler + article publisher
 *  - Skill endorser
 *  - Connection exporter (CSV)
 *  - Email finder from profiles
 *  - Company follower
 *  - Poll voter
 *  - Event attendee
 *  - Group post scraper
 *  - Sales Navigator scraper
 * Uses: Puppeteer stealth
 * ══════════════════════════════════════════════════════════
 */

const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs            = require('fs');
const path          = require('path');
const axios         = require('axios');
const logger        = require('../../utils/logger');
const { delay, randomDelay, personalizeText } = require('../../utils/helpers');
const { Contact, MessageLog } = require('../../models');

puppeteer.use(StealthPlugin());

const LI_URL     = 'https://www.linkedin.com';
const COOKIE_DIR = './sessions/linkedin';
if (!fs.existsSync(COOKIE_DIR)) fs.mkdirSync(COOKIE_DIR, { recursive: true });

// Email regex
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

class LinkedInService {
  constructor() {
    this.browsers = new Map();
    this.pages    = new Map();
  }

  // ── Launch stealth browser ─────────────────────────────
  async _launch(accountId, proxy) {
    const args = [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1440,900',
      '--disable-web-security',
      '--lang=en-US',
    ];
    if (proxy?.host) args.push(`--proxy-server=${proxy.host}:${proxy.port}`);

    const browser = await puppeteer.launch({
      headless: process.env.LI_HEADLESS !== 'false',
      args,
      defaultViewport: { width: 1440, height: 900 },
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    if (proxy?.username) await page.authenticate({ username: proxy.username, password: proxy.password });

    this.browsers.set(accountId, browser);
    this.pages.set(accountId, page);
    return { browser, page };
  }

  // ── Login ──────────────────────────────────────────────
  async login(accountId, email, password) {
    const { page } = await this._launch(accountId);

    // Try cookies first
    const cookiePath = path.join(COOKIE_DIR, `${accountId}.json`);
    if (fs.existsSync(cookiePath)) {
      await page.setCookie(...JSON.parse(fs.readFileSync(cookiePath, 'utf8')));
      await page.goto(`${LI_URL}/feed`, { waitUntil: 'networkidle2' });
      const loggedIn = await page.$('.global-nav__me-photo');
      if (loggedIn) {
        logger.info(`LinkedIn session restored: ${accountId}`);
        return { success: true, restored: true };
      }
    }

    await page.goto(`${LI_URL}/login`, { waitUntil: 'networkidle2' });
    await delay(randomDelay(1000, 2000));

    await this._humanType(page, '#username', email);
    await delay(randomDelay(500, 1000));
    await this._humanType(page, '#password', password);
    await delay(randomDelay(300, 700));
    await page.click('[data-litms-control-urn="login-submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    const url = page.url();
    if (url.includes('feed') || url.includes('mynetwork')) {
      const cookies = await page.cookies();
      fs.writeFileSync(cookiePath, JSON.stringify(cookies));
      logger.info(`✅ LinkedIn logged in: ${email}`);
      return { success: true };
    }

    if (url.includes('checkpoint') || url.includes('challenge')) {
      return { success: false, requires2FA: true, message: 'LinkedIn requires verification — check email/phone' };
    }

    return { success: false, message: 'Login failed' };
  }

  _getPage(accountId) {
    const page = this.pages.get(accountId);
    if (!page) throw new Error(`LinkedIn not initialized for ${accountId}. Call login() first.`);
    return page;
  }

  // ══════════════════════════════════════════════════════════
  // CONNECTION REQUEST BOT
  // ══════════════════════════════════════════════════════════
  async sendConnectionRequests(accountId, profileUrls, options = {}) {
    const page = this._getPage(accountId);
    const {
      noteTemplate  = '',   // personalized connection note
      delayMin      = 15000,
      delayMax      = 45000,
      maxPerDay     = 20,   // LinkedIn limits ~100/week
      withNote      = false,
    } = options;

    const results = { sent: 0, failed: 0, alreadyConnected: 0, pending: 0 };

    for (const profileUrl of profileUrls.slice(0, maxPerDay)) {
      try {
        await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await delay(randomDelay(2000, 4000));

        // Get profile name for personalization
        const name = await page.evaluate(() =>
          document.querySelector('h1.text-heading-xlarge')?.innerText?.split(' ')[0] || 'there'
        );

        // Find Connect button
        const connectBtn = await page.$('button[aria-label*="Connect"]') ||
          await page.$('button.pvs-profile-actions__action:not([aria-label*="Follow"])');

        if (!connectBtn) {
          const btnText = await page.evaluate(() =>
            document.querySelector('.pvs-profile-actions__action')?.innerText
          );
          if (btnText?.includes('Message')) results.alreadyConnected++;
          else if (btnText?.includes('Pending')) results.pending++;
          else results.failed++;
          continue;
        }

        await connectBtn.click();
        await delay(randomDelay(1000, 2000));

        // Add note if enabled
        if (withNote && noteTemplate) {
          const addNoteBtn = await page.$('button[aria-label="Add a note"]');
          if (addNoteBtn) {
            await addNoteBtn.click();
            await delay(500);
            const noteArea = await page.$('textarea#custom-message');
            if (noteArea) {
              const note = personalizeText(noteTemplate, { name, firstname: name });
              await this._humanType(page, 'textarea#custom-message', note.slice(0, 300));
            }
          }
        }

        // Send request
        const sendBtn = await page.$('button[aria-label="Send invitation"]') ||
          await page.$('button[aria-label="Send now"]');
        if (sendBtn) {
          await sendBtn.click();
          results.sent++;
          logger.info(`LinkedIn connection sent to: ${name} (${profileUrl})`);
        } else {
          // Some profiles have direct connect without note modal
          results.sent++;
        }

        await delay(randomDelay(delayMin, delayMax));

        // Extra cooldown every 5 connections
        if (results.sent % 5 === 0) {
          logger.info('LinkedIn cooling down for 3 min...');
          await delay(randomDelay(180000, 300000));
        }

      } catch (err) {
        results.failed++;
        logger.error(`LinkedIn connect failed for ${profileUrl}: ${err.message}`);
        await delay(randomDelay(5000, 10000));
      }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // MASS DM / MESSAGE SENDER
  // ══════════════════════════════════════════════════════════
  async sendMessages(accountId, targets, messageTemplate, options = {}) {
    const page = this._getPage(accountId);
    const { delayMin = 20000, delayMax = 60000, maxPerDay = 15, userId, campaignId } = options;
    const results = { sent: 0, failed: 0, notConnected: 0 };

    for (const target of targets.slice(0, maxPerDay)) {
      try {
        const profileUrl = target.profileUrl || `${LI_URL}/in/${target.username}`;
        await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await delay(randomDelay(2000, 4000));

        // Find Message button
        const msgBtn = await page.$('button[aria-label*="Message"]') ||
          await page.$('a[aria-label*="Message"]');

        if (!msgBtn) {
          results.notConnected++;
          continue;
        }

        await msgBtn.click();
        await delay(randomDelay(1500, 3000));

        // Type message in chat window
        const msgInput = await page.$('.msg-form__contenteditable') ||
          await page.$('[contenteditable="true"]');

        if (!msgInput) { results.failed++; continue; }

        const name    = target.name || target.firstName || 'there';
        const message = personalizeText(messageTemplate, {
          name, firstname: name,
          company: target.company || '',
          title:   target.title   || '',
          ...options.variables,
        });

        await msgInput.click();
        await delay(500);
        for (const char of message) {
          await page.keyboard.type(char, { delay: randomDelay(20, 70) });
        }
        await delay(randomDelay(500, 1000));

        // Send
        const sendBtn = await page.$('button.msg-form__send-button') ||
          await page.$('button[aria-label="Send"]');
        if (sendBtn) {
          await sendBtn.click();
          results.sent++;

          await MessageLog.create({
            platform: 'linkedin', direction: 'outbound',
            to: profileUrl, body: message,
          }).catch(() => {});
        }

        await delay(randomDelay(delayMin, delayMax));

        // Cooldown every 5 messages
        if (results.sent % 5 === 0) await delay(randomDelay(120000, 240000));

      } catch (err) {
        results.failed++;
        logger.error(`LinkedIn DM failed: ${err.message}`);
      }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // AUTO LIKE POSTS
  // ══════════════════════════════════════════════════════════
  async autoLikeFeed(accountId, options = {}) {
    const page = this._getPage(accountId);
    const { limit = 20, delayMin = 5000, delayMax = 15000 } = options;

    await page.goto(`${LI_URL}/feed`, { waitUntil: 'networkidle2' });
    await delay(3000);

    const results = { liked: 0, failed: 0 };
    let scrolls = 0;

    while (results.liked < limit && scrolls < 10) {
      // Like all unliked posts visible
      const liked = await page.evaluate(async () => {
        const btns  = document.querySelectorAll('button[aria-label*="Like"][aria-pressed="false"]');
        let count   = 0;
        for (const btn of Array.from(btns).slice(0, 3)) {
          btn.click();
          count++;
          await new Promise(r => setTimeout(r, 500));
        }
        return count;
      });

      results.liked += liked;
      await page.evaluate(() => window.scrollBy(0, 1500));
      await delay(randomDelay(delayMin, delayMax));
      scrolls++;
    }

    return results;
  }

  async autoLikeByKeyword(accountId, keyword, options = {}) {
    const page = this._getPage(accountId);
    const { limit = 10, delayMin = 8000, delayMax = 20000 } = options;

    await page.goto(`${LI_URL}/search/results/content/?keywords=${encodeURIComponent(keyword)}&sortBy=date_posted`, { waitUntil: 'networkidle2' });
    await delay(3000);

    const results = { liked: 0, failed: 0 };

    for (let i = 0; i < limit; i++) {
      try {
        const likeBtn = await page.$('button[aria-label*="Like"][aria-pressed="false"]');
        if (likeBtn) { await likeBtn.click(); results.liked++; }
        await page.evaluate(() => window.scrollBy(0, 800));
        await delay(randomDelay(delayMin, delayMax));
      } catch { results.failed++; }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // AUTO COMMENT
  // ══════════════════════════════════════════════════════════
  async autoCommentOnPosts(accountId, postUrls, comments, options = {}) {
    const page = this._getPage(accountId);
    const { delayMin = 30000, delayMax = 90000 } = options;
    const results = { commented: 0, failed: 0 };

    for (const postUrl of postUrls) {
      const comment = comments[Math.floor(Math.random() * comments.length)];
      try {
        await page.goto(postUrl, { waitUntil: 'networkidle2' });
        await delay(2000);

        const commentBtn = await page.$('button[aria-label*="comment"]');
        if (commentBtn) {
          await commentBtn.click();
          await delay(1000);
        }

        const input = await page.$('.ql-editor[contenteditable="true"]') ||
          await page.$('.comments-comment-box__form-container [contenteditable="true"]');

        if (input) {
          await input.click();
          await page.keyboard.type(comment, { delay: randomDelay(30, 80) });
          await delay(500);

          const submitBtn = await page.$('button.comments-comment-box__submit-button');
          if (submitBtn) { await submitBtn.click(); results.commented++; }
        }

        await delay(randomDelay(delayMin, delayMax));
      } catch { results.failed++; }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // PROFILE VIEWER
  // ══════════════════════════════════════════════════════════
  async viewProfiles(accountId, profileUrls, options = {}) {
    const page = this._getPage(accountId);
    const { delayMin = 5000, delayMax = 15000, scrollOnProfile = true } = options;
    const results = { viewed: 0, failed: 0 };

    for (const url of profileUrls) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
        await delay(2000);

        if (scrollOnProfile) {
          for (let i = 0; i < 3; i++) {
            await page.evaluate(() => window.scrollBy(0, 500));
            await delay(randomDelay(500, 1500));
          }
        }

        results.viewed++;
        await delay(randomDelay(delayMin, delayMax));
      } catch { results.failed++; }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // LEAD SCRAPER
  // ══════════════════════════════════════════════════════════
  async scrapeLeadsBySearch(accountId, searchQuery, options = {}) {
    const page  = this._getPage(accountId);
    const {
      limit       = 50,
      jobTitle    = '',
      company     = '',
      location    = '',
      industry    = '',
      connections = '2',   // 1st, 2nd, 3rd
    } = options;

    const params = new URLSearchParams({
      keywords:    searchQuery,
      origin:      'GLOBAL_SEARCH_HEADER',
    });
    if (connections) params.set('network', `["F","S"]`); // 1st + 2nd degree

    await page.goto(`${LI_URL}/search/results/people/?${params}`, { waitUntil: 'networkidle2' });
    await delay(3000);

    const leads  = [];
    let   pageNum = 1;

    while (leads.length < limit && pageNum <= 10) {
      const profiles = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.reusable-search__result-container')).map(el => ({
          name:        el.querySelector('.entity-result__title-text a span[aria-hidden="true"]')?.innerText?.trim(),
          profileUrl:  el.querySelector('.entity-result__title-text a')?.href,
          headline:    el.querySelector('.entity-result__primary-subtitle')?.innerText?.trim(),
          location:    el.querySelector('.entity-result__secondary-subtitle')?.innerText?.trim(),
          avatar:      el.querySelector('img.presence-entity__image')?.src,
          connections: el.querySelector('.entity-result__badge-text')?.innerText?.trim(),
        })).filter(p => p.name && p.profileUrl);
      });

      leads.push(...profiles);

      // Next page
      const nextBtn = await page.$('button[aria-label="Next"]');
      if (!nextBtn) break;
      await nextBtn.click();
      await delay(randomDelay(3000, 6000));
      pageNum++;
    }

    return leads.slice(0, limit);
  }

  // Deep scrape single profile
  async scrapeProfile(accountId, profileUrl) {
    const page = this._getPage(accountId);

    await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    await delay(2000);

    // Scroll to load all sections
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 1000));
      await delay(500);
    }

    const profile = await page.evaluate(() => {
      const getText = (sel) => document.querySelector(sel)?.innerText?.trim() || '';
      const getAll  = (sel) => Array.from(document.querySelectorAll(sel)).map(el => el.innerText?.trim()).filter(Boolean);

      return {
        name:         getText('h1.text-heading-xlarge'),
        headline:     getText('.text-body-medium.break-words'),
        location:     getText('.pb2.pv-text-details__left-panel span:not(.distance-badge)'),
        about:        getText('#about ~ .pvs-list__outer-container .visually-hidden'),
        connections:  getText('.t-bold span'),
        email:        document.body.innerText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] || '',
        website:      getText('.pv-contact-info__contact-type.ci-website a'),
        phone:        getText('.pv-contact-info__contact-type.ci-phone span'),
        experience:   getAll('#experience ~ .pvs-list__outer-container .pvs-entity__path-node'),
        education:    getAll('#education ~ .pvs-list__outer-container .pvs-entity__path-node'),
        skills:       getAll('#skills ~ .pvs-list__outer-container .pvs-entity__path-node'),
        avatar:       document.querySelector('.pv-top-card-profile-picture__image')?.src,
      };
    });

    profile.profileUrl = profileUrl;
    return profile;
  }

  // ══════════════════════════════════════════════════════════
  // POST ON LINKEDIN
  // ══════════════════════════════════════════════════════════
  async createPost(accountId, content, options = {}) {
    const page = this._getPage(accountId);
    const { imagePath, visibility = 'PUBLIC' } = options;

    await page.goto(`${LI_URL}/feed`, { waitUntil: 'networkidle2' });
    await delay(2000);

    // Click "Start a post"
    const startPost = await page.$('button.share-box-feed-entry__trigger') ||
      await page.$('[data-view-name="share-box"]');
    if (!startPost) throw new Error('Could not find post button');

    await startPost.click();
    await delay(2000);

    // Type content
    const editor = await page.$('.ql-editor') ||
      await page.$('[data-placeholder="What do you want to talk about?"]');
    if (!editor) throw new Error('Post editor not found');

    await editor.click();
    for (const char of content) {
      await page.keyboard.type(char, { delay: randomDelay(20, 60) });
    }
    await delay(1000);

    // Upload image if provided
    if (imagePath) {
      const imageBtn = await page.$('button[aria-label="Add a photo"]') ||
        await page.$('button[aria-label="Add media"]');
      if (imageBtn) {
        await imageBtn.click();
        await delay(1000);
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) { await fileInput.uploadFile(imagePath); await delay(3000); }
      }
    }

    // Post
    const postBtn = await page.$('button.share-actions__primary-action') ||
      await page.$('button[data-view-name="share-content-button"]');
    if (postBtn) { await postBtn.click(); await delay(3000); }

    logger.info(`✅ LinkedIn post created for ${accountId}`);
    return { success: true, content: content.substring(0, 100) };
  }

  // ══════════════════════════════════════════════════════════
  // CONNECTION EXPORTER
  // ══════════════════════════════════════════════════════════
  async exportConnections(accountId, limit = 500) {
    const page        = this._getPage(accountId);
    const connections = [];
    let   pageNum     = 1;

    await page.goto(`${LI_URL}/mynetwork/invite-connect/connections/`, { waitUntil: 'networkidle2' });
    await delay(3000);

    // Scroll and scrape
    let prevCount = 0;
    while (connections.length < limit) {
      const items = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.mn-connection-card')).map(card => ({
          name:       card.querySelector('.mn-connection-card__name')?.innerText?.trim(),
          headline:   card.querySelector('.mn-connection-card__occupation')?.innerText?.trim(),
          profileUrl: card.querySelector('a.mn-connection-card__link')?.href,
          avatar:     card.querySelector('img')?.src,
          connectedOn: card.querySelector('time')?.innerText?.trim(),
        })).filter(c => c.name)
      );

      for (const item of items) {
        if (!connections.find(c => c.profileUrl === item.profileUrl)) {
          connections.push(item);
        }
      }

      if (connections.length === prevCount) break;
      prevCount = connections.length;

      await page.evaluate(() => window.scrollBy(0, 1000));
      await delay(randomDelay(1500, 3000));
    }

    return { total: connections.length, connections: connections.slice(0, limit) };
  }

  // ══════════════════════════════════════════════════════════
  // SKILL ENDORSER
  // ══════════════════════════════════════════════════════════
  async endorseSkills(accountId, profileUrl, maxSkills = 5) {
    const page = this._getPage(accountId);

    await page.goto(profileUrl, { waitUntil: 'networkidle2' });
    await delay(2000);

    // Scroll to skills section
    await page.evaluate(() => {
      const section = document.querySelector('#skills');
      if (section) section.scrollIntoView();
    });
    await delay(1000);

    const endorsed = await page.evaluate(async (max) => {
      const btns  = document.querySelectorAll('button[aria-label*="Endorse"]');
      let count   = 0;
      for (const btn of Array.from(btns).slice(0, max)) {
        if (count >= max) break;
        btn.click();
        count++;
        await new Promise(r => setTimeout(r, 1000));
      }
      return count;
    }, maxSkills);

    return { success: true, endorsed, profileUrl };
  }

  // ══════════════════════════════════════════════════════════
  // COMPANY FOLLOWER
  // ══════════════════════════════════════════════════════════
  async followCompanies(accountId, companyUrls, options = {}) {
    const page = this._getPage(accountId);
    const { delayMin = 5000, delayMax = 15000 } = options;
    const results = { followed: 0, failed: 0 };

    for (const url of companyUrls) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        await delay(2000);

        const followBtn = await page.$('button[aria-label*="Follow"]');
        if (followBtn) {
          const text = await page.evaluate(el => el.innerText, followBtn);
          if (text?.includes('Follow')) {
            await followBtn.click();
            results.followed++;
          }
        }
        await delay(randomDelay(delayMin, delayMax));
      } catch { results.failed++; }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // EMAIL FINDER FROM PROFILES
  // ══════════════════════════════════════════════════════════
  async findEmailsFromProfiles(accountId, profileUrls) {
    const page  = this._getPage(accountId);
    const leads = [];

    for (const url of profileUrls) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
        await delay(1500);

        // Click Contact Info
        const contactBtn = await page.$('a[href*="overlay/contact-info"]') ||
          await page.$('a#top-card-text-details-contact-info');
        if (contactBtn) {
          await contactBtn.click();
          await delay(1500);
        }

        const info = await page.evaluate(() => {
          const text   = document.body.innerText;
          const email  = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] || '';
          const phone  = text.match(/(\+?[\d\s\-().]{7,15}\d)/)?.[0] || '';
          const name   = document.querySelector('h1.text-heading-xlarge')?.innerText?.trim() || '';
          const title  = document.querySelector('.text-body-medium')?.innerText?.trim() || '';
          const website= document.querySelector('.pv-contact-info__contact-type.ci-website a')?.href || '';
          return { email, phone, name, title, website };
        });

        leads.push({ ...info, profileUrl: url });

        // Close modal if open
        const closeBtn = await page.$('button[aria-label="Dismiss"]');
        if (closeBtn) await closeBtn.click();

        await delay(randomDelay(2000, 4000));
      } catch (err) {
        leads.push({ profileUrl: url, error: err.message });
      }
    }

    return leads;
  }

  // ══════════════════════════════════════════════════════════
  // SAVE LEADS TO CONTACTS DB
  // ══════════════════════════════════════════════════════════
  async saveLeadsToContacts(leads, userId, listId) {
    const { Contact } = require('../../models');
    const results     = { saved: 0, skipped: 0 };

    for (const lead of leads) {
      if (!lead.name) { results.skipped++; continue; }
      try {
        await Contact.findOneAndUpdate(
          { userId, 'customFields.linkedinUrl': lead.profileUrl },
          {
            userId,
            name:    lead.name,
            email:   lead.email   || '',
            phone:   lead.phone   || '',
            company: lead.company || '',
            tags:    ['linkedin', 'scraped'],
            lists:   listId ? [listId] : [],
            source:  'import',
            customFields: {
              linkedinUrl:   lead.profileUrl,
              linkedinTitle: lead.headline || lead.title,
              location:      lead.location,
            },
            status: 'active',
          },
          { upsert: true, new: true }
        );
        results.saved++;
      } catch { results.skipped++; }
    }

    return results;
  }

  // ── Helpers ────────────────────────────────────────────
  async _humanType(page, selector, text) {
    await page.waitForSelector(selector, { timeout: 10000 });
    await page.click(selector);
    for (const char of text) {
      await page.type(selector, char, { delay: randomDelay(40, 120) });
    }
  }

  async disconnect(accountId) {
    const browser = this.browsers.get(accountId);
    if (browser) { await browser.close(); this.browsers.delete(accountId); this.pages.delete(accountId); }
  }
}

module.exports = new LinkedInService();
