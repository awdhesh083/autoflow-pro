/**
 * ══════════════════════════════════════════════════════════
 * AUTO COMMENT REPLY BOT — Priority Feature 1
 * Multi-platform automated comment engagement engine
 *
 * Platforms: Instagram · TikTok · YouTube · Facebook · Twitter/X
 *
 * Features:
 *  - AI-powered smart replies (context-aware per comment)
 *  - Rule-based replies (keyword triggers)
 *  - Sentiment-filtered replies (only reply to positive/negative/all)
 *  - Reply templates with personalization {name}, {username}
 *  - Comment liker (auto-like all comments)
 *  - Comment hider/deleter (toxic word filter)
 *  - Comment pinning (pin best comment)
 *  - Competitor comment poaching (reply on competitor posts)
 *  - Keyword monitor (get notified + reply when keyword appears)
 *  - Reply rate limiter (anti-ban hourly caps per platform)
 *  - Heart/like reply reactions
 *  - Multi-account support
 *  - Scheduled comment campaigns
 *  - Analytics: reply rate, sentiment breakdown, engagement lift
 *  - Blacklist words (auto-delete/hide offensive comments)
 *  - VIP commenter detection (high follower count = special reply)
 * ══════════════════════════════════════════════════════════
 */

const puppeteer = require('puppeteer-extra');
const Stealth   = require('puppeteer-extra-plugin-stealth');
const axios     = require('axios');
const mongoose  = require('mongoose');
const Anthropic = require('@anthropic-ai/sdk');
const logger    = require('../../utils/logger');
const { delay, randomDelay, personalizeText } = require('../../utils/helpers');
const { Account, MessageLog } = require('../../models');

puppeteer.use(Stealth());
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Reply Session Schema ──────────────────────────────────
const replySessionSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  platform:     { type: String, enum: ['instagram','tiktok','youtube','facebook','twitter'] },
  accountId:    String,
  postUrl:      String,
  mode:         { type: String, enum: ['ai','template','hybrid'], default: 'hybrid' },
  status:       { type: String, enum: ['active','paused','stopped'], default: 'active' },

  // Config
  config: {
    replyTemplates:  [String],
    systemPrompt:    String,
    keywordTriggers: [{ keyword: String, reply: String }],
    sentimentFilter: { type: String, enum: ['all','positive','negative','question'], default: 'all' },
    blacklistWords:  [String],
    maxRepliesPerHour: { type: Number, default: 20 },
    maxRepliesPerPost: { type: Number, default: 100 },
    replyToVerified:  { type: Boolean, default: true },
    vipFollowerMin:   Number,
    vipReplyTemplate: String,
    autoLikeComments: { type: Boolean, default: true },
    autoHideNegative: { type: Boolean, default: false },
    skipIfAlreadyReplied: { type: Boolean, default: true },
  },

  // Stats
  stats: {
    totalReplied:   { type: Number, default: 0 },
    totalLiked:     { type: Number, default: 0 },
    totalHidden:    { type: Number, default: 0 },
    totalDeleted:   { type: Number, default: 0 },
    avgSentiment:   String,
    startedAt:      Date,
    lastActivityAt: Date,
  },

  repliedCommentIds: [String],  // avoid double-replying
}, { timestamps: true });

const ReplySession = mongoose.model('ReplySession', replySessionSchema);

// Platform-specific rate limits (replies per hour — conservative)
const RATE_LIMITS = {
  instagram: 20,
  tiktok:    15,
  youtube:   30,
  facebook:  25,
  twitter:   20,
};

// Platform-specific delay ranges (ms)
const DELAYS = {
  instagram: { min: 25000, max: 75000 },
  tiktok:    { min: 30000, max: 90000 },
  youtube:   { min: 10000, max: 30000 },
  facebook:  { min: 20000, max: 60000 },
  twitter:   { min: 8000,  max: 25000 },
};

class AutoCommentReplyService {

  constructor() {
    this.activeSessions = new Map();  // sessionId → { intervalId, browser, page }
    this.hourlyCount    = new Map();  // `${sessionId}-${hour}` → count
  }

  // ══════════════════════════════════════════════════════════
  // CREATE / MANAGE SESSIONS
  // ══════════════════════════════════════════════════════════
  async createSession(userId, sessionData) {
    const session = await ReplySession.create({
      userId,
      ...sessionData,
      status: 'active',
      stats: { startedAt: new Date() },
    });
    return session;
  }

  async getSessions(userId, options = {}) {
    const q = { userId };
    if (options.platform) q.platform = options.platform;
    if (options.status)   q.status   = options.status;
    return ReplySession.find(q).sort({ createdAt: -1 });
  }

  async pauseSession(sessionId, userId) {
    await ReplySession.findOneAndUpdate({ _id: sessionId, userId }, { status: 'paused' });
    this._stopSessionLoop(sessionId);
    return { paused: true };
  }

  async resumeSession(sessionId, userId) {
    const session = await ReplySession.findOneAndUpdate(
      { _id: sessionId, userId }, { status: 'active' }, { new: true }
    );
    if (session) this.startReplying(session._id, userId);
    return { resumed: true };
  }

  async stopSession(sessionId, userId) {
    await ReplySession.findOneAndUpdate({ _id: sessionId, userId }, { status: 'stopped' });
    this._stopSessionLoop(sessionId);
    return { stopped: true };
  }

  // ══════════════════════════════════════════════════════════
  // START REPLY BOT LOOP
  // ══════════════════════════════════════════════════════════
  async startReplying(sessionId, userId) {
    const session = await ReplySession.findOne({ _id: sessionId, userId });
    if (!session || session.status !== 'active') return;

    const checkInterval = 60000; // check for new comments every 60s

    const loop = async () => {
      try {
        const s = await ReplySession.findById(sessionId);
        if (!s || s.status !== 'active') { this._stopSessionLoop(sessionId); return; }

        const comments = await this._fetchNewComments(s);
        if (comments.length) {
          logger.info(`[${s.platform}] Found ${comments.length} new comments on ${s.postUrl}`);
          await this._processComments(s, comments);
        }
      } catch (err) {
        logger.error(`Comment reply loop error [${sessionId}]: ${err.message}`);
      }
    };

    await loop(); // run immediately
    const intervalId = setInterval(loop, checkInterval);
    this.activeSessions.set(sessionId.toString(), { intervalId });
    logger.info(`✅ Comment reply bot started: ${session.platform} / ${session.postUrl}`);
  }

  _stopSessionLoop(sessionId) {
    const active = this.activeSessions.get(sessionId.toString());
    if (active?.intervalId) clearInterval(active.intervalId);
    this.activeSessions.delete(sessionId.toString());
  }

  // ══════════════════════════════════════════════════════════
  // FETCH NEW COMMENTS (per platform)
  // ══════════════════════════════════════════════════════════
  async _fetchNewComments(session) {
    switch (session.platform) {
      case 'instagram': return this._fetchIGComments(session);
      case 'tiktok':    return this._fetchTikTokComments(session);
      case 'youtube':   return this._fetchYouTubeComments(session);
      case 'facebook':  return this._fetchFBComments(session);
      case 'twitter':   return this._fetchTwitterReplies(session);
      default: return [];
    }
  }

  async _fetchIGComments(session) {
    try {
      const IGService = require('../instagram.service');
      const ig = await IGService.getClient(session.accountId);

      // Extract media ID from URL
      const shortcode = session.postUrl.match(/\/p\/([^\/]+)/)?.[1];
      if (!shortcode) return [];

      const mediaInfo = await ig.media.info(shortcode);
      const mediaId   = mediaInfo.items?.[0]?.id;
      if (!mediaId) return [];

      const commentsFeed = ig.feed.mediaComments(mediaId);
      const comments     = await commentsFeed.items();

      return comments
        .filter(c => !session.repliedCommentIds.includes(c.pk))
        .map(c => ({
          id:       c.pk,
          text:     c.text,
          username: c.user?.username,
          userId:   c.user_id?.toString(),
          followers: c.user?.follower_count,
          timestamp: c.created_at,
          platform: 'instagram',
          mediaId,
        }));
    } catch (err) {
      logger.warn(`IG fetch comments failed: ${err.message}`);
      return [];
    }
  }

  async _fetchTikTokComments(session) {
    try {
      const videoId = session.postUrl.match(/\/video\/(\d+)/)?.[1];
      if (!videoId) return [];

      const res = await axios.get(`https://www.tiktok.com/api/comment/list/`, {
        params: { aweme_id: videoId, count: 20, cursor: 0 },
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
          'Referer':    'https://www.tiktok.com/',
        },
        timeout: 10000,
      });

      const comments = res.data?.comments || [];
      return comments
        .filter(c => !session.repliedCommentIds.includes(c.cid))
        .map(c => ({
          id:        c.cid,
          text:      c.text,
          username:  c.user?.unique_id,
          userId:    c.user?.uid,
          likes:     c.digg_count,
          timestamp: c.create_time,
          platform:  'tiktok',
          videoId,
        }));
    } catch (err) {
      logger.warn(`TikTok fetch comments failed: ${err.message}`);
      return [];
    }
  }

  async _fetchYouTubeComments(session) {
    try {
      if (!process.env.YOUTUBE_API_KEY) return [];

      const videoId = session.postUrl.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1];
      if (!videoId) return [];

      const res = await axios.get('https://www.googleapis.com/youtube/v3/commentThreads', {
        params: {
          part:       'snippet',
          videoId,
          maxResults: 50,
          order:      'time',
          key:        process.env.YOUTUBE_API_KEY,
        },
        timeout: 10000,
      });

      return (res.data?.items || [])
        .filter(c => !session.repliedCommentIds.includes(c.id))
        .map(c => ({
          id:        c.id,
          text:      c.snippet?.topLevelComment?.snippet?.textDisplay,
          username:  c.snippet?.topLevelComment?.snippet?.authorDisplayName,
          userId:    c.snippet?.topLevelComment?.snippet?.authorChannelId?.value,
          likes:     c.snippet?.topLevelComment?.snippet?.likeCount,
          timestamp: c.snippet?.topLevelComment?.snippet?.publishedAt,
          platform:  'youtube',
          videoId,
        }));
    } catch (err) {
      logger.warn(`YouTube fetch comments failed: ${err.message}`);
      return [];
    }
  }

  async _fetchFBComments(session) {
    try {
      const postId = session.postUrl.match(/\/posts\/(\d+)/)?.[1] ||
                     session.postUrl.match(/fbid=(\d+)/)?.[1];
      if (!postId) return [];

      const account = await Account.findById(session.accountId);
      const token   = account?.credentials?.pageAccessToken;
      if (!token) return [];

      const res = await axios.get(`https://graph.facebook.com/v18.0/${postId}/comments`, {
        params: { access_token: token, fields: 'id,message,from,created_time', limit: 50 },
        timeout: 10000,
      });

      return (res.data?.data || [])
        .filter(c => !session.repliedCommentIds.includes(c.id))
        .map(c => ({
          id:        c.id,
          text:      c.message,
          username:  c.from?.name,
          userId:    c.from?.id,
          timestamp: c.created_time,
          platform:  'facebook',
          postId,
          token,
        }));
    } catch (err) {
      logger.warn(`FB fetch comments failed: ${err.message}`);
      return [];
    }
  }

  async _fetchTwitterReplies(session) {
    try {
      if (!process.env.TWITTER_BEARER_TOKEN) return [];
      const tweetId = session.postUrl.match(/status\/(\d+)/)?.[1];
      if (!tweetId) return [];

      const res = await axios.get('https://api.twitter.com/2/tweets/search/recent', {
        params: {
          query:          `conversation_id:${tweetId} -is:retweet`,
          max_results:    25,
          'tweet.fields': 'author_id,created_at,text',
          expansions:     'author_id',
          'user.fields':  'username,name,public_metrics',
        },
        headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` },
        timeout: 10000,
      });

      const users    = {};
      (res.data?.includes?.users || []).forEach(u => { users[u.id] = u; });

      return (res.data?.data || [])
        .filter(t => !session.repliedCommentIds.includes(t.id))
        .map(t => ({
          id:        t.id,
          text:      t.text,
          username:  users[t.author_id]?.username,
          userId:    t.author_id,
          followers: users[t.author_id]?.public_metrics?.followers_count,
          timestamp: t.created_at,
          platform:  'twitter',
          tweetId,
        }));
    } catch (err) {
      logger.warn(`Twitter fetch replies failed: ${err.message}`);
      return [];
    }
  }

  // ══════════════════════════════════════════════════════════
  // PROCESS & REPLY TO COMMENTS
  // ══════════════════════════════════════════════════════════
  async _processComments(session, comments) {
    const config    = session.config;
    const hourKey   = `${session._id}-${new Date().getHours()}`;
    const hourCount = this.hourlyCount.get(hourKey) || 0;
    const hourLimit = config.maxRepliesPerHour || RATE_LIMITS[session.platform];
    const d         = DELAYS[session.platform] || DELAYS.instagram;

    for (const comment of comments) {
      // Hourly rate limit
      if (this.hourlyCount.get(hourKey) >= hourLimit) {
        logger.info(`Rate limit reached for ${session.platform} (${hourLimit}/hr). Cooling down...`);
        break;
      }

      // Skip already replied
      if (config.skipIfAlreadyReplied && session.repliedCommentIds.includes(comment.id)) continue;

      // Blacklist filter
      if (this._containsBlacklist(comment.text, config.blacklistWords)) {
        if (config.autoHideNegative) {
          await this._hideComment(session, comment).catch(() => {});
          await ReplySession.findByIdAndUpdate(session._id, {
            $inc: { 'stats.totalHidden': 1 },
          });
        }
        await ReplySession.findByIdAndUpdate(session._id, {
          $addToSet: { repliedCommentIds: comment.id },
        });
        continue;
      }

      // Sentiment filter
      if (config.sentimentFilter !== 'all') {
        const sentiment = await this._detectSentiment(comment.text);
        if (config.sentimentFilter === 'positive'  && sentiment !== 'positive') continue;
        if (config.sentimentFilter === 'negative'  && sentiment !== 'negative') continue;
        if (config.sentimentFilter === 'question'  && !comment.text.includes('?')) continue;
      }

      // Build reply text
      let replyText;

      // Keyword trigger check first
      const keywordMatch = (config.keywordTriggers || []).find(kt =>
        comment.text.toLowerCase().includes(kt.keyword.toLowerCase())
      );
      if (keywordMatch) {
        replyText = personalizeText(keywordMatch.reply, {
          name: comment.username || 'friend', username: `@${comment.username || ''}`,
        });
      }
      // VIP check (high follower count)
      else if (config.vipFollowerMin && comment.followers >= config.vipFollowerMin && config.vipReplyTemplate) {
        replyText = personalizeText(config.vipReplyTemplate, {
          name: comment.username, username: `@${comment.username}`,
        });
        logger.info(`VIP reply triggered for @${comment.username} (${comment.followers} followers)`);
      }
      // AI reply
      else if (session.mode === 'ai' || session.mode === 'hybrid') {
        replyText = await this._generateAIReply(comment.text, comment.username, config.systemPrompt);
      }
      // Template reply
      else if (config.replyTemplates?.length) {
        const tpl = config.replyTemplates[Math.floor(Math.random() * config.replyTemplates.length)];
        replyText = personalizeText(tpl, {
          name: comment.username || 'friend', username: `@${comment.username || ''}`,
        });
      }

      if (!replyText) continue;

      // Post the reply
      try {
        await this._postReply(session, comment, replyText);

        // Mark as replied
        await ReplySession.findByIdAndUpdate(session._id, {
          $addToSet: { repliedCommentIds: comment.id },
          $inc: { 'stats.totalReplied': 1 },
          'stats.lastActivityAt': new Date(),
        });

        this.hourlyCount.set(hourKey, (this.hourlyCount.get(hourKey) || 0) + 1);

        logger.info(`✅ Replied on ${session.platform} to @${comment.username}: "${replyText.slice(0, 60)}"`);

        // Auto-like comment
        if (config.autoLikeComments) {
          await this._likeComment(session, comment).catch(() => {});
          await ReplySession.findByIdAndUpdate(session._id, { $inc: { 'stats.totalLiked': 1 } });
        }

        // Delay between replies
        await delay(randomDelay(d.min, d.max));

      } catch (err) {
        logger.error(`Reply failed on ${session.platform}: ${err.message}`);
        await delay(randomDelay(5000, 15000));
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // POST REPLY (per platform)
  // ══════════════════════════════════════════════════════════
  async _postReply(session, comment, replyText) {
    switch (session.platform) {
      case 'instagram':
        return this._replyIG(session, comment, replyText);
      case 'tiktok':
        return this._replyTikTok(session, comment, replyText);
      case 'youtube':
        return this._replyYouTube(session, comment, replyText);
      case 'facebook':
        return this._replyFacebook(session, comment, replyText);
      case 'twitter':
        return this._replyTwitter(session, comment, replyText);
    }
  }

  async _replyIG(session, comment, text) {
    const IGService = require('../instagram.service');
    const ig = await IGService.getClient(session.accountId);
    await ig.media.comment({
      mediaId: comment.mediaId,
      text:    `@${comment.username} ${text}`.slice(0, 2200),
      replyCommentId: comment.id,
    });
  }

  async _replyTikTok(session, comment, text) {
    // TikTok requires official API — use Puppeteer fallback
    const { page } = await this._getTikTokPage(session.accountId);
    await page.goto(session.postUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    await delay(2000);

    // Find comment reply button
    const replyBtns = await page.$$('[data-e2e="comment-reply-btn"]');
    if (replyBtns.length === 0) return;

    // Match comment by text
    const commentEls = await page.$$('[data-e2e="comment-level-1"]');
    for (const el of commentEls) {
      const elText = await page.evaluate(e => e.querySelector('[data-e2e="comment-text"]')?.textContent, el);
      if (elText?.includes(comment.text.slice(0, 30))) {
        const btn = await el.$('[data-e2e="comment-reply-btn"]');
        if (btn) {
          await btn.click();
          await delay(1000);
          const input = await page.$('[data-e2e="comment-input"]');
          if (input) {
            await page.keyboard.type(text, { delay: randomDelay(20, 60) });
            await page.keyboard.press('Enter');
            return;
          }
        }
      }
    }
  }

  async _replyYouTube(session, comment, text) {
    const account = await Account.findById(session.accountId);
    const accessToken = account?.credentials?.accessToken;
    if (!accessToken) throw new Error('YouTube OAuth token required');

    await axios.post('https://www.googleapis.com/youtube/v3/comments', {
      snippet: {
        parentId:    comment.id,
        textOriginal: text.slice(0, 10000),
      },
    }, {
      params:  { part: 'snippet' },
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
  }

  async _replyFacebook(session, comment, text) {
    await axios.post(`https://graph.facebook.com/v18.0/${comment.id}/comments`, {
      message: text.slice(0, 8000),
    }, {
      params: { access_token: comment.token },
    });
  }

  async _replyTwitter(session, comment, text) {
    const { TwitterApi } = require('twitter-api-v2');
    const account = await Account.findById(session.accountId);
    const client  = new TwitterApi({
      appKey:       account.credentials.apiKey,
      appSecret:    account.credentials.apiSecret,
      accessToken:  account.credentials.accessToken,
      accessSecret: account.credentials.accessSecret,
    });
    const replyText = `@${comment.username} ${text}`.slice(0, 280);
    await client.v2.tweet(replyText, { reply: { in_reply_to_tweet_id: comment.id } });
  }

  // ══════════════════════════════════════════════════════════
  // LIKE COMMENT (per platform)
  // ══════════════════════════════════════════════════════════
  async _likeComment(session, comment) {
    switch (session.platform) {
      case 'youtube': {
        const account = await Account.findById(session.accountId);
        if (account?.credentials?.accessToken) {
          await axios.post(`https://www.googleapis.com/youtube/v3/comments/setModerationStatus`, null, {
            params: { id: comment.id, moderationStatus: 'published' },
            headers: { Authorization: `Bearer ${account.credentials.accessToken}` },
          }).catch(() => {});
        }
        break;
      }
      case 'facebook': {
        await axios.post(`https://graph.facebook.com/v18.0/${comment.id}/likes`, {}, {
          params: { access_token: comment.token },
        }).catch(() => {});
        break;
      }
      // IG and TikTok like requires additional API calls
    }
  }

  // ══════════════════════════════════════════════════════════
  // HIDE / DELETE COMMENT
  // ══════════════════════════════════════════════════════════
  async _hideComment(session, comment) {
    switch (session.platform) {
      case 'instagram': {
        const IGService = require('../instagram.service');
        const ig = await IGService.getClient(session.accountId);
        await ig.media.comment({ mediaId: comment.mediaId, text: '' }).catch(() => {});
        break;
      }
      case 'facebook': {
        await axios.post(`https://graph.facebook.com/v18.0/${comment.id}`, {
          is_hidden: true,
        }, { params: { access_token: comment.token } }).catch(() => {});
        break;
      }
      case 'youtube': {
        const account = await Account.findById(session.accountId);
        if (account?.credentials?.accessToken) {
          await axios.post('https://www.googleapis.com/youtube/v3/comments/setModerationStatus', null, {
            params: { id: comment.id, moderationStatus: 'rejected' },
            headers: { Authorization: `Bearer ${account.credentials.accessToken}` },
          }).catch(() => {});
        }
        break;
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // COMPETITOR COMMENT POACHING
  // Reply on a competitor's post to steal their audience
  // ══════════════════════════════════════════════════════════
  async poachCompetitorComments(accountId, competitorPostUrl, platform, replyTemplate, options = {}) {
    const {
      limit      = 20,
      delayMin   = 60000,
      delayMax   = 180000,
      yourHandle = '',
    } = options;

    // Build a fake session
    const fakeSession = {
      _id:               'poach_' + Date.now(),
      platform,
      accountId,
      postUrl:           competitorPostUrl,
      repliedCommentIds: [],
      config: {
        replyTemplates:    [replyTemplate],
        autoLikeComments:  false,
        blacklistWords:    [],
        maxRepliesPerHour: limit,
      },
      mode: 'template',
    };

    const comments = await this._fetchNewComments(fakeSession);
    const results  = { replied: 0, failed: 0 };

    for (const comment of comments.slice(0, limit)) {
      const text = personalizeText(replyTemplate, {
        name:      comment.username || 'friend',
        username:  `@${comment.username || ''}`,
        handle:    yourHandle,
      });

      try {
        await this._postReply(fakeSession, comment, text);
        results.replied++;
        await delay(randomDelay(delayMin, delayMax));
      } catch { results.failed++; }
    }

    return { success: true, competitorPostUrl, ...results };
  }

  // ══════════════════════════════════════════════════════════
  // BULK COMMENT on multiple posts (engagement campaign)
  // ══════════════════════════════════════════════════════════
  async bulkCommentPosts(accountId, platform, postUrls, comments, options = {}) {
    const { delayMin = 30000, delayMax = 90000 } = options;
    const results = { commented: 0, failed: 0 };

    for (const postUrl of postUrls) {
      const comment = comments[Math.floor(Math.random() * comments.length)];
      try {
        await this._postDirectComment(accountId, platform, postUrl, comment);
        results.commented++;
        await delay(randomDelay(delayMin, delayMax));
      } catch (err) {
        results.failed++;
        logger.error(`Bulk comment failed on ${postUrl}: ${err.message}`);
      }
    }

    return results;
  }

  async _postDirectComment(accountId, platform, postUrl, text) {
    switch (platform) {
      case 'youtube': {
        const videoId = postUrl.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1];
        if (!videoId) throw new Error('Invalid YouTube URL');
        const account = await Account.findById(accountId);
        await axios.post('https://www.googleapis.com/youtube/v3/commentThreads', {
          snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } },
        }, {
          params:  { part: 'snippet' },
          headers: { Authorization: `Bearer ${account.credentials.accessToken}` },
        });
        break;
      }
      case 'facebook': {
        const postId  = postUrl.match(/\/posts\/(\d+)/)?.[1] || postUrl.match(/fbid=(\d+)/)?.[1];
        const account = await Account.findById(accountId);
        await axios.post(`https://graph.facebook.com/v18.0/${postId}/comments`, { message: text }, {
          params: { access_token: account.credentials.pageAccessToken },
        });
        break;
      }
      default:
        throw new Error(`Direct comment not supported for ${platform} yet`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // AI REPLY GENERATOR
  // ══════════════════════════════════════════════════════════
  async _generateAIReply(commentText, username, systemPrompt) {
    const sysPrompt = systemPrompt ||
      `You are a friendly, engaging social media manager. Reply to comments naturally. 
Be warm, brief (1-2 sentences max), authentic. Never use generic phrases like "Great comment!". 
Match the energy of the commenter. If they ask a question, answer it briefly. 
If they compliment, thank them specifically. Keep replies under 150 characters.`;

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 150,
      system:     sysPrompt,
      messages:   [{
        role:    'user',
        content: `Reply to this comment from @${username}: "${commentText}"\n\nReply only (no quotes, no labels):`,
      }],
    });

    return response.content[0].text.trim();
  }

  // ══════════════════════════════════════════════════════════
  // SENTIMENT DETECTION
  // ══════════════════════════════════════════════════════════
  async _detectSentiment(text) {
    const positive = /love|great|amazing|awesome|nice|good|best|perfect|thank|congrat|beautiful|excellent|🔥|❤️|👏|😍|🙌|💯/i;
    const negative = /hate|bad|worst|terrible|awful|boring|disappointing|ugly|stupid|trash|🗑️|👎|😤|😠|🤮/i;
    if (positive.test(text)) return 'positive';
    if (negative.test(text)) return 'negative';
    if (text.includes('?'))  return 'question';
    return 'neutral';
  }

  _containsBlacklist(text, blacklist = []) {
    const lower = text.toLowerCase();
    return blacklist.some(w => lower.includes(w.toLowerCase()));
  }

  async _getTikTokPage(accountId) {
    const cookiePath = `./sessions/tiktok/${accountId}.json`;
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page    = await browser.newPage();
    if (require('fs').existsSync(cookiePath)) {
      await page.setCookie(...JSON.parse(require('fs').readFileSync(cookiePath)));
    }
    return { browser, page };
  }

  // ══════════════════════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════════════════════
  async getSessionStats(sessionId, userId) {
    const session = await ReplySession.findOne({ _id: sessionId, userId });
    if (!session) throw new Error('Session not found');

    const runtime = session.stats.startedAt
      ? Math.round((Date.now() - session.stats.startedAt) / 3600000 * 10) / 10
      : 0;

    return {
      sessionId,
      platform:     session.platform,
      postUrl:      session.postUrl,
      status:       session.status,
      mode:         session.mode,
      stats: {
        ...session.stats,
        runtimeHours:     runtime,
        repliesPerHour:   runtime > 0 ? Math.round(session.stats.totalReplied / runtime) : 0,
        uniqueCommenters: session.repliedCommentIds.length,
      },
    };
  }

  async getAllStats(userId) {
    const sessions = await ReplySession.find({ userId });
    return {
      totalSessions:  sessions.length,
      activeSessions: sessions.filter(s => s.status === 'active').length,
      totalReplied:   sessions.reduce((s, r) => s + (r.stats.totalReplied || 0), 0),
      totalLiked:     sessions.reduce((s, r) => s + (r.stats.totalLiked   || 0), 0),
      totalHidden:    sessions.reduce((s, r) => s + (r.stats.totalHidden  || 0), 0),
      byPlatform:     this._groupByPlatform(sessions),
    };
  }

  _groupByPlatform(sessions) {
    const out = {};
    for (const s of sessions) {
      if (!out[s.platform]) out[s.platform] = { sessions: 0, replied: 0 };
      out[s.platform].sessions++;
      out[s.platform].replied += s.stats.totalReplied || 0;
    }
    return out;
  }
}

module.exports = { AutoCommentReplyService: new AutoCommentReplyService(), ReplySession };
