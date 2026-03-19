/**
 * ══════════════════════════════════════════════════════════
 * LEAD SCRAPER SERVICE
 * Sources: Google Maps, Websites, Yellow Pages,
 *          Instagram bios, Facebook groups, Twitter
 * Features: Phone, email, name, address extraction
 * ══════════════════════════════════════════════════════════
 */

const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio       = require('cheerio');
const axios         = require('axios');
const logger        = require('../../utils/logger');
const { delay, randomDelay } = require('../../utils/helpers');
const { Contact }   = require('../../models');

puppeteer.use(StealthPlugin());

// Regex patterns for extraction
const EMAIL_REGEX   = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX   = /(\+?[\d\s\-().]{7,15}\d)/g;
const PHONE_CLEAN   = /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;

class LeadScraperService {
  constructor() {
    this.browser = null;
  }

  async _getBrowser() {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox', '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1366,768',
        ],
      });
    }
    return this.browser;
  }

  // ══════════════════════════════════════════════════════════
  // GOOGLE MAPS SCRAPER
  // ══════════════════════════════════════════════════════════
  async scrapeGoogleMaps(query, location, limit = 50) {
    const browser = await this._getBrowser();
    const page    = await browser.newPage();
    const leads   = [];

    try {
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(`${query} ${location}`)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await delay(3000);

      // Scroll to load more results
      const resultPanel = '[role="feed"]';
      let prevCount = 0;

      while (leads.length < limit) {
        // Get all visible business cards
        const businesses = await page.evaluate(() => {
          const items = document.querySelectorAll('[data-result-index]');
          return Array.from(items).map(item => ({
            name:    item.querySelector('.qBF1Pd')?.innerText || item.querySelector('h3')?.innerText || '',
            rating:  item.querySelector('.MW4etd')?.innerText || '',
            reviews: item.querySelector('.UY7F9')?.innerText || '',
            address: item.querySelector('.W4Efsd:last-child .W4Efsd:last-child > span:last-child')?.innerText || '',
            type:    item.querySelector('.W4Efsd .W4Efsd span')?.innerText || '',
          })).filter(b => b.name);
        });

        // Click each business to get phone/website
        for (const biz of businesses) {
          if (leads.length >= limit) break;
          if (leads.find(l => l.name === biz.name)) continue;

          try {
            // Find and click the listing
            await page.evaluate((name) => {
              const items = document.querySelectorAll('[data-result-index]');
              for (const item of items) {
                if (item.querySelector('.qBF1Pd')?.innerText === name) {
                  item.click();
                  return;
                }
              }
            }, biz.name);

            await delay(randomDelay(2000, 4000));

            // Extract details from right panel
            const details = await page.evaluate(() => {
              const phone   = document.querySelector('[data-tooltip="Copy phone number"]')?.innerText
                || document.querySelector('button[data-item-id^="phone"]')?.innerText || '';
              const website = document.querySelector('a[data-item-id^="authority"]')?.href || '';
              const address = document.querySelector('button[data-item-id="address"]')?.innerText || '';
              const hours   = document.querySelector('[data-item-id="oh"]')?.innerText || '';
              return { phone, website, address, hours };
            });

            const lead = {
              name:    biz.name,
              phone:   details.phone,
              website: details.website,
              address: details.address || biz.address,
              type:    biz.type,
              rating:  biz.rating,
              reviews: biz.reviews,
              source:  'google_maps',
              query,
              location,
            };

            // Try to scrape email from website
            if (details.website) {
              lead.email = await this._extractEmailFromWebsite(details.website);
            }

            leads.push(lead);
            logger.debug(`Scraped: ${biz.name} | ${details.phone} | ${lead.email || 'no email'}`);

          } catch (err) {
            logger.debug(`Error scraping ${biz.name}: ${err.message}`);
          }
        }

        // Scroll panel to load more
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) el.scrollBy(0, 500);
        }, resultPanel);

        await delay(2000);

        if (businesses.length === prevCount) break;
        prevCount = businesses.length;
      }

    } finally {
      await page.close();
    }

    logger.info(`Google Maps scrape complete: ${leads.length} leads found`);
    return leads;
  }

  // ══════════════════════════════════════════════════════════
  // WEBSITE EMAIL/PHONE SCRAPER
  // ══════════════════════════════════════════════════════════
  async scrapeWebsite(url, options = {}) {
    const { followContactPage = true, maxPages = 3 } = options;

    try {
      const result = await this._extractEmailFromWebsite(url, { followContactPage, maxPages });
      return { url, ...result };
    } catch (err) {
      logger.error(`Website scrape failed for ${url}: ${err.message}`);
      return { url, emails: [], phones: [] };
    }
  }

  async _extractEmailFromWebsite(url, options = {}) {
    const { followContactPage = true } = options;

    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
        maxRedirects: 5,
      });

      const html    = response.data;
      const $       = cheerio.load(html);
      const text    = $.text();
      const emails  = [...new Set(text.match(EMAIL_REGEX) || [])].filter(e => !e.includes('example') && !e.includes('test'));
      const phones  = [...new Set(text.match(PHONE_CLEAN) || [])];

      // Also check contact page
      if (followContactPage && emails.length === 0) {
        const contactLinks = [];
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (href && /contact|about|reach/i.test(href)) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, url).href;
            contactLinks.push(fullUrl);
          }
        });

        for (const contactUrl of contactLinks.slice(0, 2)) {
          try {
            const res2   = await axios.get(contactUrl, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            const mails  = res2.data.match(EMAIL_REGEX) || [];
            emails.push(...mails);
          } catch {}
        }
      }

      return emails.length > 0 ? emails[0] : null;
    } catch {
      return null;
    }
  }

  // ══════════════════════════════════════════════════════════
  // BULK URL SCRAPER
  // ══════════════════════════════════════════════════════════
  async scrapeMultipleWebsites(urls) {
    const leads = [];

    for (const url of urls) {
      try {
        const result = await this.scrapeWebsite(url);
        if (result.emails?.length || result.phones?.length) {
          leads.push(result);
        }
        await delay(randomDelay(1000, 3000));
      } catch (err) {
        logger.error(`Failed to scrape ${url}: ${err.message}`);
      }
    }

    return leads;
  }

  // ══════════════════════════════════════════════════════════
  // YELLOW PAGES SCRAPER
  // ══════════════════════════════════════════════════════════
  async scrapeYellowPages(category, location, limit = 50) {
    const browser = await this._getBrowser();
    const page    = await browser.newPage();
    const leads   = [];

    try {
      const searchUrl = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(category)}&geo_location_terms=${encodeURIComponent(location)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await delay(2000);

      let pageNum = 1;
      while (leads.length < limit && pageNum <= 5) {
        const businesses = await page.evaluate(() => {
          const items = document.querySelectorAll('.result');
          return Array.from(items).map(item => ({
            name:    item.querySelector('.business-name')?.innerText?.trim() || '',
            phone:   item.querySelector('.phones')?.innerText?.trim() || '',
            address: item.querySelector('.street-address')?.innerText?.trim() || '',
            city:    item.querySelector('.locality')?.innerText?.trim() || '',
            website: item.querySelector('a.track-visit-website')?.href || '',
            category:item.querySelector('.categories')?.innerText?.trim() || '',
            rating:  item.querySelector('.result-rating')?.innerText?.trim() || '',
          })).filter(b => b.name);
        });

        for (const biz of businesses) {
          if (leads.length >= limit) break;

          const lead = { ...biz, source: 'yellow_pages', category, location };

          if (biz.website) {
            lead.email = await this._extractEmailFromWebsite(biz.website);
            await delay(randomDelay(500, 1500));
          }

          leads.push(lead);
        }

        // Next page
        const nextBtn = await page.$('a.next');
        if (!nextBtn) break;
        await nextBtn.click();
        await delay(randomDelay(3000, 6000));
        pageNum++;
      }

    } finally {
      await page.close();
    }

    return leads;
  }

  // ══════════════════════════════════════════════════════════
  // INSTAGRAM BIO EMAIL SCRAPER
  // ══════════════════════════════════════════════════════════
  async scrapeInstagramBios(usernames) {
    const leads = [];

    for (const username of usernames) {
      try {
        const response = await axios.get(`https://www.instagram.com/${username}/?__a=1&__d=dis`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X)',
            'Cookie':     'ig_did=XXXXXXXX; mid=XXXXXXXX;',
          },
          timeout: 8000,
        });

        const user = response.data?.graphql?.user || response.data?.data?.user;
        if (!user) continue;

        const bio    = user.biography || '';
        const emails = bio.match(EMAIL_REGEX) || [];
        const phones = bio.match(PHONE_CLEAN) || [];

        leads.push({
          username,
          fullName:  user.full_name,
          bio,
          email:     emails[0] || user.business_email || '',
          phone:     phones[0] || user.business_phone_number || '',
          website:   user.external_url || '',
          followers: user.edge_followed_by?.count || 0,
          isVerified:user.is_verified,
          category:  user.category_name || '',
          source:    'instagram_bio',
        });

        await delay(randomDelay(2000, 5000));
      } catch (err) {
        logger.debug(`IG bio scrape failed for ${username}: ${err.message}`);
      }
    }

    return leads;
  }

  // ══════════════════════════════════════════════════════════
  // GOOGLE SEARCH EMAIL SCRAPER
  // Searches "site:domain.com email" or "@domain.com"
  // ══════════════════════════════════════════════════════════
  async scrapeGoogleSearch(query, limit = 50) {
    const browser = await this._getBrowser();
    const page    = await browser.newPage();
    const leads   = [];

    try {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=100`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      await delay(2000);

      // Check for CAPTCHA
      const captcha = await page.$('#captcha-form');
      if (captcha) return { error: 'CAPTCHA detected — try again later or use proxies' };

      const urls = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href^="http"]'))
          .map(a => a.href)
          .filter(h => !h.includes('google') && !h.includes('youtube'));
      });

      for (const url of urls.slice(0, 20)) {
        try {
          const email = await this._extractEmailFromWebsite(url);
          if (email) {
            leads.push({ url, email, source: 'google_search', query });
          }
          await delay(randomDelay(1000, 3000));
        } catch {}
      }

    } finally {
      await page.close();
    }

    return leads;
  }

  // ══════════════════════════════════════════════════════════
  // SAVE SCRAPED LEADS TO CONTACTS DB
  // ══════════════════════════════════════════════════════════
  async saveLeadsToContacts(leads, userId, listId, options = {}) {
    const { tag = 'scraped', overwriteExisting = false } = options;
    const results = { saved: 0, skipped: 0, failed: 0 };

    for (const lead of leads) {
      try {
        if (!lead.email && !lead.phone) { results.skipped++; continue; }

        const existing = await Contact.findOne({
          userId,
          $or: [
            lead.email ? { email: lead.email } : null,
            lead.phone ? { phone: lead.phone } : null,
          ].filter(Boolean),
        });

        if (existing && !overwriteExisting) { results.skipped++; continue; }

        const contactData = {
          userId,
          name:     lead.name || lead.fullName || lead.username || 'Unknown',
          email:    lead.email || '',
          phone:    lead.phone || '',
          company:  lead.name || '',
          website:  lead.website || '',
          tags:     [tag, lead.source || 'scraped'],
          lists:    listId ? [listId] : [],
          source:   'import',
          customFields: {
            address:  lead.address || '',
            category: lead.category || lead.type || '',
            rating:   lead.rating || '',
            location: lead.location || '',
            scraped_from: lead.source,
          },
          status: 'active',
        };

        if (existing) {
          await Contact.findByIdAndUpdate(existing._id, contactData);
        } else {
          await Contact.create(contactData);
        }

        results.saved++;
      } catch (err) {
        results.failed++;
        logger.error(`Failed to save lead: ${err.message}`);
      }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // FULL PIPELINE — Scrape + Save
  // ══════════════════════════════════════════════════════════
  async runPipeline(source, params, userId, listId) {
    let leads = [];

    switch (source) {
      case 'google_maps':
        leads = await this.scrapeGoogleMaps(params.query, params.location, params.limit || 50);
        break;
      case 'yellow_pages':
        leads = await this.scrapeYellowPages(params.category, params.location, params.limit || 50);
        break;
      case 'websites':
        leads = await this.scrapeMultipleWebsites(params.urls || []);
        break;
      case 'instagram':
        leads = await this.scrapeInstagramBios(params.usernames || []);
        break;
      case 'google_search':
        leads = await this.scrapeGoogleSearch(params.query, params.limit || 50);
        break;
      default:
        throw new Error(`Unknown source: ${source}`);
    }

    const saveResult = await this.saveLeadsToContacts(leads, userId, listId, { tag: source });

    return {
      scraped:  leads.length,
      saved:    saveResult.saved,
      skipped:  saveResult.skipped,
      failed:   saveResult.failed,
      leads:    leads.slice(0, 10), // return preview
    };
  }

  async closeBrowser() {
    if (this.browser) { await this.browser.close(); this.browser = null; }
  }
}

module.exports = new LeadScraperService();
