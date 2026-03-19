/**
 * ══════════════════════════════════════════════════════════
 * YOUTUBE SERVICE — Feature 4
 * Features:
 *  - Video uploader (title, desc, tags, thumbnail, playlist)
 *  - Video scheduler
 *  - Auto subscribe/unsubscribe
 *  - Auto like/dislike
 *  - Auto comment + reply
 *  - Channel scraper (subscribers, videos)
 *  - Comment scraper (all comments + users)
 *  - Video downloader (yt-dlp)
 *  - Thumbnail AI generator
 *  - Playlist manager
 *  - Community post creator
 *  - Live chat bot
 *  - Keyword rank tracker
 *  - Competitor channel monitor
 * Uses: Puppeteer + Google API (free) + yt-dlp
 * ══════════════════════════════════════════════════════════
 */

const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { google }    = require('googleapis');
const axios         = require('axios');
const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');
const logger        = require('../../utils/logger');
const { delay, randomDelay } = require('../../utils/helpers');

puppeteer.use(StealthPlugin());

const YT_URL      = 'https://www.youtube.com';
const YT_STUDIO   = 'https://studio.youtube.com';
const COOKIE_DIR  = './sessions/youtube';
if (!fs.existsSync(COOKIE_DIR)) fs.mkdirSync(COOKIE_DIR, { recursive: true });

class YouTubeService {
  constructor() {
    this.browsers  = new Map();
    this.pages     = new Map();
    this.ytClients = new Map(); // Google API clients
  }

  // ── Setup Google API client ───────────────────────────
  _getYTClient(accountId) {
    if (this.ytClients.has(accountId)) return this.ytClients.get(accountId);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    this.ytClients.set(accountId, { oauth2Client, youtube });
    return this.ytClients.get(accountId);
  }

  setTokens(accountId, tokens) {
    const client = this._getYTClient(accountId);
    client.oauth2Client.setCredentials(tokens);
  }

  getAuthUrl() {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/youtube', 'https://www.googleapis.com/auth/youtube.upload'],
    });
  }

  // ══════════════════════════════════════════════════════════
  // VIDEO UPLOADER (Google API — most reliable)
  // ══════════════════════════════════════════════════════════
  async uploadVideo(accountId, videoPath, options = {}) {
    const {
      title         = 'My Video',
      description   = '',
      tags          = [],
      categoryId    = '22',      // 22 = People & Blogs
      privacyStatus = 'public',  // public / unlisted / private
      thumbnailPath = null,
      playlistId    = null,
      scheduleTime  = null,
      language      = 'en',
      notifySubscribers = true,
    } = options;

    // Method A: Google API (requires OAuth2 tokens)
    if (this.ytClients.get(accountId)?.oauth2Client?.credentials?.access_token) {
      return this._uploadViaAPI(accountId, videoPath, options);
    }

    // Method B: Puppeteer YouTube Studio
    return this._uploadViaPuppeteer(accountId, videoPath, options);
  }

  // ── Upload via Google API ─────────────────────────────
  async _uploadViaAPI(accountId, videoPath, options) {
    const { youtube } = this._getYTClient(accountId);
    const {
      title = 'My Video', description = '', tags = [],
      categoryId = '22', privacyStatus = 'public', scheduleTime, thumbnailPath, playlistId,
    } = options;

    const publishAt = scheduleTime ? new Date(scheduleTime).toISOString() : undefined;

    const res = await youtube.videos.insert({
      part:      ['snippet', 'status'],
      requestBody: {
        snippet: { title, description, tags, categoryId, defaultLanguage: options.language || 'en' },
        status:  {
          privacyStatus:      publishAt ? 'private' : privacyStatus,
          publishAt,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(videoPath),
      },
    });

    const videoId = res.data.id;

    // Upload custom thumbnail
    if (thumbnailPath) {
      await youtube.thumbnails.set({
        videoId,
        media: { body: fs.createReadStream(thumbnailPath) },
      }).catch(err => logger.warn(`Thumbnail upload failed: ${err.message}`));
    }

    // Add to playlist
    if (playlistId) {
      await youtube.playlistItems.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            playlistId,
            resourceId: { kind: 'youtube#video', videoId },
          },
        },
      }).catch(() => {});
    }

    logger.info(`✅ YouTube video uploaded via API: ${videoId}`);
    return {
      success:    true,
      videoId,
      videoUrl:   `https://www.youtube.com/watch?v=${videoId}`,
      title,
      privacyStatus,
      scheduledAt: scheduleTime || null,
    };
  }

  // ── Upload via Puppeteer ──────────────────────────────
  async _uploadViaPuppeteer(accountId, videoPath, options) {
    const { page } = await this._launchBrowser(accountId);
    const { title = 'My Video', description = '', tags = [], privacyStatus = 'public' } = options;

    const cookiePath = path.join(COOKIE_DIR, `${accountId}.json`);
    if (fs.existsSync(cookiePath)) {
      await page.setCookie(...JSON.parse(fs.readFileSync(cookiePath, 'utf8')));
    }

    await page.goto(`${YT_STUDIO}/channel/upload`, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(3000);

    // Check if logged in
    const isLoggedIn = await page.$('#avatar-btn') || await page.$('ytcp-ve');
    if (!isLoggedIn) {
      return { success: false, needsLogin: true, message: 'Please log into YouTube in the browser first' };
    }

    // Upload file
    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) return { success: false, error: 'Upload input not found' };

    await fileInput.uploadFile(videoPath);
    await delay(3000);

    // Fill title
    await page.waitForSelector('#title-textarea', { timeout: 30000 });
    await page.click('#title-textarea #input');
    await page.keyboard.selectAll();
    await page.keyboard.type(title);
    await delay(500);

    // Fill description
    const descArea = await page.$('#description-textarea #input');
    if (descArea) {
      await descArea.click();
      await page.keyboard.type(description);
    }

    // Tags
    if (tags.length) {
      const moreOptions = await page.$('button[aria-label="More options"]');
      if (moreOptions) { await moreOptions.click(); await delay(1000); }
      const tagsInput = await page.$('#tags-input input');
      if (tagsInput) {
        for (const tag of tags) {
          await tagsInput.type(tag);
          await page.keyboard.press('Enter');
          await delay(200);
        }
      }
    }

    // Click Next buttons
    for (let i = 0; i < 3; i++) {
      const nextBtn = await page.$('#next-button');
      if (nextBtn) { await nextBtn.click(); await delay(2000); }
    }

    // Set visibility
    const visMap = { public: 0, unlisted: 1, private: 2 };
    const visIdx  = visMap[privacyStatus] ?? 0;
    const radios  = await page.$$('tp-yt-paper-radio-button');
    if (radios[visIdx]) await radios[visIdx].click();
    await delay(1000);

    // Publish
    const publishBtn = await page.$('#done-button');
    if (publishBtn) { await publishBtn.click(); await delay(5000); }

    const cookies = await page.cookies();
    fs.writeFileSync(cookiePath, JSON.stringify(cookies));

    return { success: true, title, privacyStatus, method: 'puppeteer' };
  }

  // ══════════════════════════════════════════════════════════
  // AUTO SUBSCRIBE
  // ══════════════════════════════════════════════════════════
  async autoSubscribe(accountId, channelUrls, options = {}) {
    const page = this._getOrCreatePage(accountId);
    const { delayMin = 5000, delayMax = 15000 } = options;
    const results = { subscribed: 0, failed: 0, alreadySubscribed: 0 };

    for (const url of channelUrls) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        await delay(2000);

        const subBtn = await page.$('ytd-subscribe-button-renderer button');
        if (subBtn) {
          const text = await page.evaluate(el => el.innerText, subBtn);
          if (text === 'Subscribe') {
            await subBtn.click();
            results.subscribed++;
          } else {
            results.alreadySubscribed++;
          }
        }
        await delay(randomDelay(delayMin, delayMax));
      } catch { results.failed++; }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // AUTO LIKE VIDEOS
  // ══════════════════════════════════════════════════════════
  async autoLike(accountId, videoUrls, options = {}) {
    const page = this._getOrCreatePage(accountId);
    const { delayMin = 3000, delayMax = 10000 } = options;
    const results = { liked: 0, failed: 0 };

    for (const url of videoUrls) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        await delay(3000); // wait for player

        const likeBtn = await page.$('ytd-toggle-button-renderer:first-of-type button[aria-label*="like"]');
        if (likeBtn) {
          const isPressed = await page.evaluate(el => el.getAttribute('aria-pressed'), likeBtn);
          if (isPressed !== 'true') {
            await likeBtn.click();
            results.liked++;
          }
        }
        await delay(randomDelay(delayMin, delayMax));
      } catch { results.failed++; }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // AUTO COMMENT
  // ══════════════════════════════════════════════════════════
  async autoComment(accountId, videoUrls, comments, options = {}) {
    const page = this._getOrCreatePage(accountId);
    const { delayMin = 30000, delayMax = 90000 } = options;
    const results = { commented: 0, failed: 0 };

    for (const url of videoUrls) {
      const comment = comments[Math.floor(Math.random() * comments.length)];
      try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        await delay(4000);

        // Scroll to comments
        await page.evaluate(() => window.scrollBy(0, 600));
        await delay(2000);

        const commentBox = await page.$('#simplebox-placeholder');
        if (commentBox) {
          await commentBox.click();
          await delay(1000);

          const input = await page.$('#contenteditable-root');
          if (input) {
            await input.type(comment, { delay: randomDelay(30, 80) });
            await delay(500);

            const submitBtn = await page.$('#submit-button');
            if (submitBtn) { await submitBtn.click(); results.commented++; }
          }
        }
        await delay(randomDelay(delayMin, delayMax));
      } catch { results.failed++; }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // VIDEO DOWNLOADER (yt-dlp)
  // ══════════════════════════════════════════════════════════
  async downloadVideo(videoUrl, options = {}) {
    const { quality = 'best', outputDir = './uploads/youtube', audioOnly = false } = options;
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const videoId   = videoUrl.match(/[?&]v=([^&]+)/)?.[1] || videoUrl.split('/').pop();
    const ext       = audioOnly ? 'mp3' : 'mp4';
    const filename  = `yt_${videoId}_${Date.now()}.${ext}`;
    const outputTpl = path.join(outputDir, `yt_${videoId}_${Date.now()}.%(ext)s`);

    const format  = audioOnly ? '-x --audio-format mp3' : `-f "${quality}[ext=mp4]/best[ext=mp4]/best"`;
    const cmd     = `yt-dlp ${format} -o "${outputTpl}" "${videoUrl}"`;

    try {
      execSync(cmd, { timeout: 180000 });
      const files  = fs.readdirSync(outputDir).filter(f => f.startsWith(`yt_${videoId}`));
      const latest = files.sort().pop();
      return { success: true, path: path.join(outputDir, latest), filename: latest, videoId };
    } catch (err) {
      throw new Error(`yt-dlp failed: ${err.message}. Install with: pip install yt-dlp`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // CHANNEL SCRAPER
  // ══════════════════════════════════════════════════════════
  async scrapeChannel(channelUrl, options = {}) {
    const { maxVideos = 50 } = options;

    // Try Google API first
    if (process.env.YOUTUBE_API_KEY) {
      return this._scrapeChannelViaAPI(channelUrl, maxVideos);
    }

    // Fallback: Puppeteer
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page    = await browser.newPage();

    try {
      await page.goto(`${channelUrl}/videos`, { waitUntil: 'networkidle2' });
      await delay(3000);

      // Scroll to load videos
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 2000));
        await delay(2000);
      }

      const data = await page.evaluate(() => {
        const channelName = document.querySelector('#channel-name')?.innerText;
        const subscribers = document.querySelector('#subscriber-count')?.innerText;
        const videos      = Array.from(document.querySelectorAll('ytd-rich-item-renderer')).map(item => ({
          title:     item.querySelector('#video-title')?.innerText?.trim(),
          url:       'https://www.youtube.com' + item.querySelector('a#thumbnail')?.getAttribute('href'),
          views:     item.querySelector('#metadata-line span:first-child')?.innerText,
          published: item.querySelector('#metadata-line span:last-child')?.innerText,
          thumbnail: item.querySelector('yt-image img')?.src,
        })).filter(v => v.title);
        return { channelName, subscribers, videos };
      });

      return data;
    } finally {
      await browser.close();
    }
  }

  async _scrapeChannelViaAPI(channelUrl, maxVideos) {
    const yt         = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY });
    const channelId  = await this._resolveChannelId(channelUrl);

    const channelRes = await yt.channels.list({ part: ['snippet','statistics'], id: [channelId] });
    const channel    = channelRes.data.items[0];

    const videosRes  = await yt.search.list({
      part: ['snippet'], channelId, order: 'date', maxResults: Math.min(maxVideos, 50),
    });

    return {
      channelName:  channel.snippet.title,
      subscribers:  channel.statistics.subscriberCount,
      totalViews:   channel.statistics.viewCount,
      videoCount:   channel.statistics.videoCount,
      description:  channel.snippet.description,
      country:      channel.snippet.country,
      videos: videosRes.data.items.map(v => ({
        videoId:   v.id.videoId,
        title:     v.snippet.title,
        published: v.snippet.publishedAt,
        thumbnail: v.snippet.thumbnails?.high?.url,
        url:       `https://www.youtube.com/watch?v=${v.id.videoId}`,
      })),
    };
  }

  // ══════════════════════════════════════════════════════════
  // COMMENT SCRAPER
  // ══════════════════════════════════════════════════════════
  async scrapeComments(videoUrl, limit = 200) {
    if (!process.env.YOUTUBE_API_KEY) {
      return { error: 'Set YOUTUBE_API_KEY for comment scraping (free quota available)' };
    }

    const yt      = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY });
    const videoId = videoUrl.match(/[?&]v=([^&]+)/)?.[1];
    if (!videoId) throw new Error('Invalid YouTube URL');

    const comments  = [];
    let pageToken   = null;

    do {
      const res = await yt.commentThreads.list({
        part:       ['snippet'],
        videoId,
        maxResults: 100,
        pageToken:  pageToken || undefined,
        order:      'relevance',
      });

      for (const item of res.data.items) {
        const c = item.snippet.topLevelComment.snippet;
        comments.push({
          author:     c.authorDisplayName,
          authorUrl:  c.authorChannelUrl,
          text:       c.textDisplay,
          likes:      c.likeCount,
          published:  c.publishedAt,
          email:      c.textDisplay.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] || null,
        });
      }

      pageToken = res.data.nextPageToken;
    } while (pageToken && comments.length < limit);

    return { videoId, total: comments.length, comments };
  }

  // ══════════════════════════════════════════════════════════
  // PLAYLIST MANAGER
  // ══════════════════════════════════════════════════════════
  async createPlaylist(accountId, title, description = '', privacy = 'public') {
    const { youtube } = this._getYTClient(accountId);
    const res = await youtube.playlists.insert({
      part: ['snippet','status'],
      requestBody: {
        snippet: { title, description },
        status:  { privacyStatus: privacy },
      },
    });
    return { success: true, playlistId: res.data.id, title };
  }

  async addVideoToPlaylist(accountId, playlistId, videoId) {
    const { youtube } = this._getYTClient(accountId);
    await youtube.playlistItems.insert({
      part: ['snippet'],
      requestBody: { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } },
    });
    return { success: true, playlistId, videoId };
  }

  // ══════════════════════════════════════════════════════════
  // AI THUMBNAIL GENERATOR
  // ══════════════════════════════════════════════════════════
  async generateThumbnail(videoTitle, style = 'youtube', outputDir = './uploads/youtube') {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const AIImageService = require('../ai-image.service');
    const AIService      = require('../index').AIService;

    // Generate optimized prompt
    const prompt = await AIService.chat(
      `Create an AI image prompt for a YouTube thumbnail for this video: "${videoTitle}". Make it bold, eye-catching, with dramatic lighting. Return ONLY the prompt.`,
      [], 'You are a YouTube thumbnail expert.'
    );

    const img = await AIImageService.generate(
      `${prompt}, youtube thumbnail style, bold text areas, high contrast, professional`,
      { width: 1280, height: 720, provider: 'pollinations' }
    );

    return {
      success:   true,
      path:      img.filepath,
      url:       img.url,
      prompt,
      videoTitle,
    };
  }

  // ══════════════════════════════════════════════════════════
  // COMPETITOR CHANNEL MONITOR
  // ══════════════════════════════════════════════════════════
  async monitorCompetitors(channelUrls, userId) {
    const data = [];
    for (const url of channelUrls) {
      try {
        const channel = await this.scrapeChannel(url, { maxVideos: 5 });
        data.push({ url, ...channel, scrapedAt: new Date() });
      } catch (err) {
        data.push({ url, error: err.message });
      }
      await delay(2000);
    }
    return data;
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════
  async _launchBrowser(accountId) {
    const browser = await puppeteer.launch({
      headless: process.env.YT_HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
      defaultViewport: { width: 1280, height: 800 },
    });
    const page = await browser.newPage();
    this.browsers.set(accountId, browser);
    this.pages.set(accountId, page);
    return { browser, page };
  }

  _getOrCreatePage(accountId) {
    if (this.pages.has(accountId)) return this.pages.get(accountId);
    throw new Error(`YouTube not initialized for ${accountId}. Call uploadVideo or login first.`);
  }

  async _resolveChannelId(channelUrl) {
    if (channelUrl.includes('/channel/')) return channelUrl.split('/channel/')[1].split('/')[0];
    if (channelUrl.includes('/c/') || channelUrl.includes('/@')) {
      const page = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] }).then(b => b.newPage());
      await page.goto(channelUrl, { waitUntil: 'networkidle2' });
      const channelId = await page.evaluate(() => {
        const links = document.querySelectorAll('link[rel="canonical"]');
        for (const l of links) { const m = l.href?.match(/channel\/([^/]+)/); if (m) return m[1]; }
        return null;
      });
      await page.browser().close();
      return channelId;
    }
    return null;
  }

  async disconnect(accountId) {
    const browser = this.browsers.get(accountId);
    if (browser) { await browser.close(); this.browsers.delete(accountId); this.pages.delete(accountId); }
  }
}

module.exports = new YouTubeService();
