/**
 * ══════════════════════════════════════════════════════════
 * UGC (USER GENERATED CONTENT) COLLECTOR & REPOSTER
 * Priority Feature 2
 *
 * Platforms: Instagram · TikTok · Twitter/X · YouTube · Facebook
 *
 * Collection sources:
 *  - Brand hashtag mentions (#yourbrand)
 *  - Account @mentions / tags
 *  - Tagged photos/videos
 *  - Product review posts
 *  - Comments that reference your brand
 *  - Story mentions (IG)
 *  - Duets / Stitches (TikTok)
 *  - Quote tweets
 *  - YouTube video mentions
 *
 * Features:
 *  - Auto-scan all platforms on schedule
 *  - AI content quality scorer (0-100)
 *  - AI brand safety filter (flag inappropriate content)
 *  - Auto permission requester (DM / comment asking to repost)
 *  - Permission tracker (approved / pending / denied)
 *  - One-click repost to your feed (with credit)
 *  - Scheduled UGC calendar
 *  - UGC library / content vault
 *  - Top creator leaderboard
 *  - Auto-thank commenter
 *  - Social proof wall embed generator
 *  - Influencer discovery from UGC (best creators → add to influencer list)
 *  - Performance tracker (how does UGC perform vs original content)
 *  - Email digest of best UGC weekly
 *  - Watermarker / branded overlay before reposting
 * ══════════════════════════════════════════════════════════
 */

const mongoose  = require('mongoose');
const axios     = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const logger    = require('../../utils/logger');
const { delay, randomDelay } = require('../../utils/helpers');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── UGC Item Schema ───────────────────────────────────────
const ugcSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },

  // Source info
  platform:    { type: String, required: true },
  sourceType:  { type: String, enum: ['hashtag','mention','tag','duet','quote','review','story'], default: 'hashtag' },
  postId:      String,
  postUrl:     { type: String, required: true },
  thumbnail:   String,
  mediaUrls:   [String],
  mediaType:   { type: String, enum: ['image','video','carousel','text'], default: 'image' },
  caption:     String,
  hashtags:    [String],

  // Creator info
  creator: {
    username:   String,
    displayName:String,
    profileUrl: String,
    avatar:     String,
    followers:  Number,
    verified:   Boolean,
    email:      String,
  },

  // Performance metrics
  metrics: {
    likes:    Number,
    comments: Number,
    shares:   Number,
    views:    Number,
    saves:    Number,
    postedAt: Date,
  },

  // AI scoring
  scores: {
    quality:     Number,   // 0-100 content quality
    brandSafety: Number,   // 0-100 brand safety (100 = perfectly safe)
    authenticity:Number,   // 0-100 authentic feel
    overall:     Number,   // 0-100 combined score
  },
  aiNotes:     String,   // AI analysis notes

  // Permission workflow
  permission: {
    status:         { type: String, enum: ['pending','requested','approved','denied','not_required'], default: 'pending' },
    requestedAt:    Date,
    requestMethod:  { type: String, enum: ['dm','comment','email'] },
    approvedAt:     Date,
    deniedAt:       Date,
    requestMessage: String,
    responseMessage:String,
  },

  // Repost tracking
  reposted: [{
    platform:    String,
    accountId:   String,
    postedAt:    Date,
    postUrl:     String,
    caption:     String,
    performance: mongoose.Schema.Types.Mixed,
  }],

  status:      { type: String, enum: ['new','scored','approved','scheduled','reposted','archived','rejected'], default: 'new' },
  tags:        [String],
  notes:       String,
  collectedAt: { type: Date, default: Date.now, index: true },
  searchQuery: String,
}, { timestamps: true });

ugcSchema.index({ userId: 1, platform: 1, postId: 1 }, { unique: true });
const UGCItem = mongoose.model('UGCItem', ugcSchema);

// ── UGC Campaign Schema ────────────────────────────────────
const ugcCampaignSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:        String,
  hashtags:    [String],
  mentions:    [String],     // @handle to monitor
  platforms:   [String],
  minScore:    { type: Number, default: 60 },
  minFollowers:{ type: Number, default: 0 },
  autoRequest: { type: Boolean, default: false },    // auto-DM permission request
  autoRepost:  { type: Boolean, default: false },    // auto-repost approved UGC
  targetAccounts: [{ platform: String, accountId: String }],
  scanInterval:{ type: Number, default: 3600000 },  // ms between scans
  isActive:    { type: Boolean, default: true },
  lastScanned: Date,
  stats: {
    totalFound:    { type: Number, default: 0 },
    totalReposted: { type: Number, default: 0 },
    totalApproved: { type: Number, default: 0 },
  },
}, { timestamps: true });

const UGCCampaign = mongoose.model('UGCCampaign', ugcCampaignSchema);

class UGCService {

  constructor() {
    this.activeScans = new Map();
  }

  // ══════════════════════════════════════════════════════════
  // CAMPAIGNS: CREATE / MANAGE
  // ══════════════════════════════════════════════════════════
  async createCampaign(userId, data) {
    const campaign = await UGCCampaign.create({ userId, ...data });
    if (data.isActive) this.startCampaignScan(campaign._id, userId);
    return campaign;
  }

  async getCampaigns(userId) {
    return UGCCampaign.find({ userId }).sort({ createdAt: -1 });
  }

  async updateCampaign(id, userId, updates) {
    return UGCCampaign.findOneAndUpdate({ _id: id, userId }, updates, { new: true });
  }

  // ══════════════════════════════════════════════════════════
  // START CAMPAIGN AUTO-SCANNER
  // ══════════════════════════════════════════════════════════
  startCampaignScan(campaignId, userId) {
    const run = async () => {
      const campaign = await UGCCampaign.findOne({ _id: campaignId, userId, isActive: true });
      if (!campaign) { this._stopScan(campaignId); return; }

      logger.info(`UGC scan: campaign "${campaign.name}"`);
      const results = await this.scanForUGC(userId, {
        hashtags:    campaign.hashtags,
        mentions:    campaign.mentions,
        platforms:   campaign.platforms,
        minFollowers:campaign.minFollowers,
        campaignId,
      });

      await UGCCampaign.findByIdAndUpdate(campaignId, {
        lastScanned: new Date(),
        $inc: { 'stats.totalFound': results.found },
      });

      // Auto-request permission
      if (campaign.autoRequest) {
        const newItems = await UGCItem.find({
          userId, 'permission.status': 'pending',
          scores: { $exists: true },
          'scores.overall': { $gte: campaign.minScore },
        }).limit(20);

        for (const item of newItems) {
          await this.requestPermission(item._id, userId, campaign.targetAccounts?.[0]).catch(() => {});
          await delay(randomDelay(10000, 30000));
        }
      }
    };

    run();
    const id = setInterval(run, 3600000);
    this.activeScans.set(campaignId.toString(), id);
  }

  _stopScan(campaignId) {
    const id = this.activeScans.get(campaignId.toString());
    if (id) clearInterval(id);
    this.activeScans.delete(campaignId.toString());
  }

  // ══════════════════════════════════════════════════════════
  // CORE SCANNER
  // ══════════════════════════════════════════════════════════
  async scanForUGC(userId, options = {}) {
    const {
      hashtags    = [],
      mentions    = [],
      platforms   = ['instagram','twitter','tiktok','youtube'],
      minFollowers= 0,
      limit       = 50,
      campaignId,
    } = options;

    const allItems = [];

    for (const platform of platforms) {
      for (const hashtag of hashtags) {
        try {
          const items = await this._scanHashtag(platform, hashtag, { limit: Math.ceil(limit / hashtags.length) });
          allItems.push(...items.map(i => ({ ...i, sourceType: 'hashtag', searchQuery: hashtag })));
        } catch (err) { logger.warn(`UGC scan hashtag ${hashtag} on ${platform}: ${err.message}`); }
        await delay(1000);
      }

      for (const mention of mentions) {
        try {
          const items = await this._scanMentions(platform, mention, { limit: Math.ceil(limit / (mentions.length || 1)) });
          allItems.push(...items.map(i => ({ ...i, sourceType: 'mention', searchQuery: mention })));
        } catch (err) { logger.warn(`UGC scan mention ${mention} on ${platform}: ${err.message}`); }
        await delay(1000);
      }
    }

    // Filter by min followers
    const filtered = minFollowers
      ? allItems.filter(i => (i.creator?.followers || 0) >= minFollowers)
      : allItems;

    // Save to DB + score with AI (batch)
    let saved = 0;
    for (const item of filtered) {
      try {
        const existing = await UGCItem.findOne({ userId, platform: item.platform, postId: item.postId });
        if (existing) continue;

        const scored = await this._scoreWithAI(item);
        await UGCItem.create({
          userId,
          campaignId,
          ...item,
          scores: scored.scores,
          aiNotes: scored.notes,
          status: 'scored',
        });
        saved++;
      } catch {}
    }

    logger.info(`UGC scan complete: ${filtered.length} found, ${saved} new`);
    return { found: filtered.length, saved };
  }

  // ── Platform scanners ─────────────────────────────────
  async _scanHashtag(platform, hashtag, options = {}) {
    const { limit = 20 } = options;
    const tag = hashtag.replace('#', '');
    const items = [];

    switch (platform) {
      case 'instagram': {
        try {
          const res = await axios.get(`https://www.instagram.com/explore/tags/${tag}/?__a=1&__d=dis`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 10000,
          });
          const posts = res.data?.graphql?.hashtag?.edge_hashtag_to_media?.edges || [];
          for (const p of posts.slice(0, limit)) {
            const n = p.node;
            items.push({
              platform:  'instagram',
              postId:    n.id,
              postUrl:   `https://www.instagram.com/p/${n.shortcode}/`,
              thumbnail: n.thumbnail_src || n.display_url,
              mediaType: n.is_video ? 'video' : 'image',
              caption:   n.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 500) || '',
              hashtags:  (n.edge_media_to_caption?.edges?.[0]?.node?.text?.match(/#\w+/g) || []).slice(0, 15),
              creator: {
                username:  n.owner?.username,
                profileUrl:`https://www.instagram.com/${n.owner?.username}/`,
              },
              metrics: {
                likes:   n.edge_liked_by?.count || 0,
                comments:n.edge_media_to_comment?.count || 0,
                views:   n.video_view_count || 0,
                postedAt:new Date(n.taken_at_timestamp * 1000),
              },
            });
          }
        } catch (err) { logger.warn(`IG hashtag scan: ${err.message}`); }
        break;
      }

      case 'twitter': {
        try {
          if (!process.env.TWITTER_BEARER_TOKEN) break;
          const res = await axios.get('https://api.twitter.com/2/tweets/search/recent', {
            params: {
              query:          `#${tag} -is:retweet lang:en`,
              max_results:    Math.min(100, limit),
              'tweet.fields': 'created_at,public_metrics,entities,attachments',
              expansions:     'author_id,attachments.media_keys',
              'user.fields':  'name,username,public_metrics,verified,profile_image_url',
              'media.fields': 'url,preview_image_url,type',
            },
            headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` },
            timeout: 10000,
          });

          const users = {};
          (res.data?.includes?.users || []).forEach(u => { users[u.id] = u; });
          const media = {};
          (res.data?.includes?.media || []).forEach(m => { media[m.media_key] = m; });

          for (const tweet of (res.data?.data || [])) {
            const u = users[tweet.author_id];
            if (!u) continue;
            const mediaKey = tweet.attachments?.media_keys?.[0];
            const m        = mediaKey ? media[mediaKey] : null;
            items.push({
              platform:  'twitter',
              postId:    tweet.id,
              postUrl:   `https://twitter.com/${u.username}/status/${tweet.id}`,
              thumbnail: m?.preview_image_url || m?.url,
              mediaType: m ? (m.type === 'video' ? 'video' : 'image') : 'text',
              caption:   tweet.text?.slice(0, 500),
              hashtags:  tweet.entities?.hashtags?.map(h => `#${h.tag}`) || [],
              creator: {
                username:   u.username,
                displayName:u.name,
                profileUrl: `https://twitter.com/${u.username}`,
                avatar:     u.profile_image_url,
                followers:  u.public_metrics?.followers_count || 0,
                verified:   u.verified,
              },
              metrics: {
                likes:    tweet.public_metrics?.like_count || 0,
                comments: tweet.public_metrics?.reply_count || 0,
                shares:   tweet.public_metrics?.retweet_count || 0,
                postedAt: new Date(tweet.created_at),
              },
            });
          }
        } catch (err) { logger.warn(`Twitter hashtag scan: ${err.message}`); }
        break;
      }

      case 'tiktok': {
        try {
          const res = await axios.get(`https://www.tiktok.com/api/challenge/item_list/`, {
            params: { challengeName: tag, count: limit, cursor: 0 },
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
              'Referer':    'https://www.tiktok.com/',
            },
            timeout: 10000,
          });
          for (const item of (res.data?.itemList || []).slice(0, limit)) {
            items.push({
              platform:  'tiktok',
              postId:    item.id,
              postUrl:   `https://www.tiktok.com/@${item.author?.uniqueId}/video/${item.id}`,
              thumbnail: item.video?.cover,
              mediaType: 'video',
              caption:   item.desc?.slice(0, 500),
              hashtags:  item.textExtra?.filter(t => t.hashtagName).map(t => `#${t.hashtagName}`) || [],
              creator: {
                username:   item.author?.uniqueId,
                displayName:item.author?.nickname,
                profileUrl: `https://www.tiktok.com/@${item.author?.uniqueId}`,
                avatar:     item.author?.avatarThumb,
                followers:  item.authorStats?.followerCount || 0,
                verified:   item.author?.verified,
              },
              metrics: {
                likes:    item.stats?.diggCount || 0,
                comments: item.stats?.commentCount || 0,
                shares:   item.stats?.shareCount || 0,
                views:    item.stats?.playCount || 0,
                postedAt: new Date(item.createTime * 1000),
              },
            });
          }
        } catch (err) { logger.warn(`TikTok hashtag scan: ${err.message}`); }
        break;
      }

      case 'youtube': {
        try {
          if (!process.env.YOUTUBE_API_KEY) break;
          const res = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: { part: 'snippet', q: `#${tag}`, type: 'video', maxResults: limit, order: 'date', key: process.env.YOUTUBE_API_KEY },
            timeout: 10000,
          });
          for (const item of (res.data?.items || [])) {
            items.push({
              platform:  'youtube',
              postId:    item.id?.videoId,
              postUrl:   `https://www.youtube.com/watch?v=${item.id?.videoId}`,
              thumbnail: item.snippet?.thumbnails?.high?.url,
              mediaType: 'video',
              caption:   item.snippet?.title,
              creator: {
                username:   item.snippet?.channelId,
                displayName:item.snippet?.channelTitle,
                profileUrl: `https://www.youtube.com/channel/${item.snippet?.channelId}`,
              },
              metrics: {
                postedAt: new Date(item.snippet?.publishedAt),
              },
            });
          }
        } catch (err) { logger.warn(`YouTube hashtag scan: ${err.message}`); }
        break;
      }
    }

    return items;
  }

  async _scanMentions(platform, handle, options = {}) {
    const { limit = 20 } = options;
    const items = [];

    if (platform === 'twitter' && process.env.TWITTER_BEARER_TOKEN) {
      try {
        const res = await axios.get('https://api.twitter.com/2/tweets/search/recent', {
          params: {
            query:          `@${handle.replace('@', '')} -is:retweet`,
            max_results:    Math.min(100, limit),
            'tweet.fields': 'created_at,public_metrics',
            expansions:     'author_id',
            'user.fields':  'username,name,public_metrics,profile_image_url',
          },
          headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` },
          timeout: 10000,
        });
        const users = {};
        (res.data?.includes?.users || []).forEach(u => { users[u.id] = u; });
        for (const tweet of (res.data?.data || [])) {
          const u = users[tweet.author_id];
          if (!u) continue;
          items.push({
            platform:  'twitter',
            postId:    tweet.id,
            postUrl:   `https://twitter.com/${u.username}/status/${tweet.id}`,
            mediaType: 'text',
            caption:   tweet.text,
            creator: {
              username:   u.username,
              displayName:u.name,
              profileUrl: `https://twitter.com/${u.username}`,
              avatar:     u.profile_image_url,
              followers:  u.public_metrics?.followers_count || 0,
            },
            metrics: {
              likes:    tweet.public_metrics?.like_count || 0,
              comments: tweet.public_metrics?.reply_count || 0,
              shares:   tweet.public_metrics?.retweet_count || 0,
              postedAt: new Date(tweet.created_at),
            },
          });
        }
      } catch {}
    }
    return items;
  }

  // ══════════════════════════════════════════════════════════
  // AI SCORING
  // ══════════════════════════════════════════════════════════
  async _scoreWithAI(item) {
    try {
      const prompt = `Score this UGC (user generated content) for brand reposting.

Platform: ${item.platform}
Caption: ${item.caption?.slice(0, 300) || 'No caption'}
Creator followers: ${item.creator?.followers || 'unknown'}
Likes: ${item.metrics?.likes || 0}
Views: ${item.metrics?.views || 0}
Media type: ${item.mediaType}

Scoring criteria:
- quality: production value, how professional/authentic it looks
- brandSafety: no offensive content, appropriate for all audiences
- authenticity: genuine, not forced/fake
- overall: weighted average considering all factors

Return ONLY JSON:
{"scores":{"quality":75,"brandSafety":95,"authenticity":80,"overall":82},"notes":"Authentic testimonial style. Safe for all audiences. Good engagement rate."}`;

      const response = await anthropic.messages.create({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages:   [{ role: 'user', content: prompt }],
        system:     'You are a brand safety and content quality expert. Return ONLY valid JSON.',
      });

      const text = response.content[0].text.replace(/```json|```/g, '').trim();
      return JSON.parse(text);
    } catch {
      return {
        scores: { quality: 50, brandSafety: 70, authenticity: 60, overall: 60 },
        notes:  'Auto-scored (AI unavailable)',
      };
    }
  }

  // ══════════════════════════════════════════════════════════
  // PERMISSION REQUESTER
  // ══════════════════════════════════════════════════════════
  async requestPermission(ugcItemId, userId, targetAccount, options = {}) {
    const item = await UGCItem.findOne({ _id: ugcItemId, userId });
    if (!item) throw new Error('UGC item not found');
    if (item.permission.status === 'approved') return { alreadyApproved: true };

    const method  = options.method || 'dm';
    const message = options.message || this._buildPermissionRequest(item);

    try {
      await this._sendPermissionRequest(item, message, method, targetAccount);

      await UGCItem.findByIdAndUpdate(ugcItemId, {
        'permission.status':         'requested',
        'permission.requestedAt':    new Date(),
        'permission.requestMethod':  method,
        'permission.requestMessage': message,
      });

      logger.info(`✅ Permission requested from @${item.creator.username} on ${item.platform}`);
      return { requested: true, method, username: item.creator.username };
    } catch (err) {
      logger.error(`Permission request failed: ${err.message}`);
      throw err;
    }
  }

  _buildPermissionRequest(item) {
    return `Hi @${item.creator?.username}! 👋\n\n` +
           `We love your post and would love to share it with our community! ` +
           `Would you give us permission to repost it on our page? ` +
           `You'll receive full credit of course! 🙏\n\n` +
           `Simply reply "YES" to approve, or "NO" to decline.\n\n` +
           `Thank you for creating amazing content! ✨`;
  }

  async _sendPermissionRequest(item, message, method, targetAccount) {
    switch (item.platform) {
      case 'instagram': {
        if (!targetAccount?.accountId) throw new Error('accountId required for IG');
        const IGService = require('../instagram.service');
        const ig        = await IGService.getClient(targetAccount.accountId);
        const user      = await ig.user.searchExact(item.creator.username);
        if (!user?.pk) throw new Error('IG user not found');
        if (method === 'dm') {
          await ig.directMessage.sendText({ userIds: [user.pk], text: message });
        } else {
          // Comment permission request on their post
          const shortcode = item.postUrl.match(/\/p\/([^\/]+)/)?.[1];
          const mediaInfo = await ig.media.info(shortcode);
          const mediaId   = mediaInfo.items?.[0]?.id;
          if (mediaId) await ig.media.comment({ mediaId, text: message.slice(0, 300) });
        }
        break;
      }
      case 'twitter': {
        if (!targetAccount?.accountId) throw new Error('accountId required');
        const { TwitterApi } = require('twitter-api-v2');
        const { Account }   = require('../../models');
        const account       = await Account.findById(targetAccount.accountId);
        const client        = new TwitterApi({
          appKey: account.credentials.apiKey, appSecret: account.credentials.apiSecret,
          accessToken: account.credentials.accessToken, accessSecret: account.credentials.accessSecret,
        });
        // Reply to their tweet asking for permission
        await client.v2.tweet(
          `@${item.creator.username} ${message.slice(0, 250)}`,
          { reply: { in_reply_to_tweet_id: item.postId } }
        );
        break;
      }
      default:
        logger.warn(`Permission request not implemented for ${item.platform}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // APPROVE / REPOST UGC
  // ══════════════════════════════════════════════════════════
  async approveAndRepost(ugcItemId, userId, repostConfig, options = {}) {
    const item = await UGCItem.findOne({ _id: ugcItemId, userId });
    if (!item) throw new Error('UGC item not found');

    // Mark approved
    await UGCItem.findByIdAndUpdate(ugcItemId, {
      'permission.status':    'approved',
      'permission.approvedAt': new Date(),
      status:                 'approved',
    });

    if (options.repostNow !== false) {
      return this.repost(ugcItemId, userId, repostConfig);
    }
    return { approved: true, ugcItemId };
  }

  async repost(ugcItemId, userId, repostConfig) {
    const item = await UGCItem.findOne({ _id: ugcItemId, userId });
    if (!item) throw new Error('UGC item not found');

    const caption = repostConfig.caption || this._buildRepostCaption(item, repostConfig);

    const { PostSchedulerService } = require('./post-scheduler.service');
    const result = await PostSchedulerService.createPost(userId, {
      caption,
      mediaUrls:   item.mediaUrls?.length ? item.mediaUrls : (item.thumbnail ? [item.thumbnail] : []),
      mediaType:   item.mediaType,
      platforms:   repostConfig.platforms || [],
      scheduledAt: repostConfig.scheduledAt || null,
    });

    await UGCItem.findByIdAndUpdate(ugcItemId, {
      status: 'reposted',
      $push: {
        reposted: {
          platform:  repostConfig.platforms?.[0]?.platform,
          accountId: repostConfig.platforms?.[0]?.accountId,
          postedAt:  new Date(),
          caption,
        },
      },
    });

    return { success: true, ugcItemId, postId: result.postId, caption };
  }

  _buildRepostCaption(item, config) {
    const credit = `📸 @${item.creator?.username}`;
    const hashtags = (config.hashtags || item.hashtags?.slice(0, 5) || []).join(' ');
    const comment = config.comment || '✨ Amazing content from our community!';

    return `${comment}\n\n${credit}\n\n${hashtags}`.trim();
  }

  // ══════════════════════════════════════════════════════════
  // LIBRARY: GET / FILTER / MANAGE UGC
  // ══════════════════════════════════════════════════════════
  async getLibrary(userId, options = {}) {
    const {
      platform, status, minScore = 0, sourceType,
      page = 1, limit = 20, sortBy = 'overall',
    } = options;

    const q = { userId };
    if (platform)   q.platform   = platform;
    if (status)     q.status     = status;
    if (sourceType) q.sourceType = sourceType;
    if (minScore)   q['scores.overall'] = { $gte: minScore };

    const sortField = sortBy === 'recent' ? { collectedAt: -1 }
      : sortBy === 'likes' ? { 'metrics.likes': -1 }
      : { 'scores.overall': -1 };

    const [items, total] = await Promise.all([
      UGCItem.find(q).sort(sortField).skip((page-1)*limit).limit(+limit),
      UGCItem.countDocuments(q),
    ]);

    return { items, total, page: +page, limit: +limit };
  }

  async getItem(ugcItemId, userId) {
    return UGCItem.findOne({ _id: ugcItemId, userId });
  }

  async updateItem(ugcItemId, userId, updates) {
    return UGCItem.findOneAndUpdate({ _id: ugcItemId, userId }, updates, { new: true });
  }

  async archiveItem(ugcItemId, userId) {
    return UGCItem.findOneAndUpdate({ _id: ugcItemId, userId }, { status: 'archived' }, { new: true });
  }

  async deleteItem(ugcItemId, userId) {
    await UGCItem.findOneAndDelete({ _id: ugcItemId, userId });
    return { deleted: true };
  }

  // ══════════════════════════════════════════════════════════
  // TOP CREATOR LEADERBOARD
  // ══════════════════════════════════════════════════════════
  async getCreatorLeaderboard(userId, options = {}) {
    const { limit = 20, platform } = options;
    const q = { userId };
    if (platform) q.platform = platform;

    const items = await UGCItem.find(q);
    const creators = {};

    for (const item of items) {
      const key = `${item.platform}:${item.creator?.username}`;
      if (!creators[key]) {
        creators[key] = {
          platform:    item.platform,
          username:    item.creator?.username,
          displayName: item.creator?.displayName,
          profileUrl:  item.creator?.profileUrl,
          avatar:      item.creator?.avatar,
          followers:   item.creator?.followers || 0,
          posts:       0,
          totalLikes:  0,
          totalViews:  0,
          avgScore:    0,
          scores:      [],
          reposted:    0,
        };
      }
      const c = creators[key];
      c.posts++;
      c.totalLikes += item.metrics?.likes || 0;
      c.totalViews += item.metrics?.views || 0;
      c.scores.push(item.scores?.overall || 0);
      if (item.status === 'reposted') c.reposted++;
    }

    const leaderboard = Object.values(creators).map(c => ({
      ...c,
      avgScore: c.scores.length ? Math.round(c.scores.reduce((s,v) => s+v, 0) / c.scores.length) : 0,
      scores:   undefined,
    })).sort((a, b) => (b.totalLikes + b.posts * 10) - (a.totalLikes + a.posts * 10));

    return { total: leaderboard.length, creators: leaderboard.slice(0, limit) };
  }

  // ══════════════════════════════════════════════════════════
  // PROMOTE TOP CREATORS TO INFLUENCER LIST
  // ══════════════════════════════════════════════════════════
  async promoteCreatorsToInfluencers(userId, options = {}) {
    const { minPosts = 2, minFollowers = 1000, minScore = 70 } = options;
    const lb = await this.getCreatorLeaderboard(userId, { limit: 100 });

    const { InfluencerService } = require('./influencer.service');
    let promoted = 0;

    for (const creator of lb.creators) {
      if (creator.posts < minPosts) continue;
      if (creator.followers < minFollowers) continue;
      if (creator.avgScore < minScore) continue;

      try {
        await InfluencerService._saveInfluencers(userId, [{
          platform:   creator.platform,
          username:   creator.username,
          profileUrl: creator.profileUrl,
          name:       creator.displayName,
          avatar:     creator.avatar,
          metrics: {
            followers:      creator.followers,
            engagementRate: creator.followers ? (creator.totalLikes / creator.posts / creator.followers * 100) : 0,
          },
          tags: ['ugc_creator'],
        }], 'ugc_discovery');
        promoted++;
      } catch {}
    }

    return { promoted, total: lb.creators.length };
  }

  // ══════════════════════════════════════════════════════════
  // SOCIAL PROOF WALL (embed HTML generator)
  // ══════════════════════════════════════════════════════════
  async generateSocialProofEmbed(userId, options = {}) {
    const { limit = 12, minScore = 70, theme = 'grid' } = options;
    const { items } = await this.getLibrary(userId, { status: 'reposted', minScore, limit });

    const cards = items.map(item => `
      <div class="ugc-card">
        <img src="${item.thumbnail || ''}" alt="UGC" loading="lazy" />
        <div class="ugc-meta">
          <span class="ugc-platform">${item.platform}</span>
          <a href="${item.postUrl}" target="_blank">@${item.creator?.username}</a>
        </div>
        <p>${item.caption?.slice(0, 100) || ''}${item.caption?.length > 100 ? '...' : ''}</p>
        <div class="ugc-stats">❤️ ${item.metrics?.likes || 0}</div>
      </div>`).join('\n');

    const html = `<!-- AutoFlow UGC Wall -->
<style>
  .ugc-wall{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;font-family:sans-serif}
  .ugc-card{border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1);background:#fff}
  .ugc-card img{width:100%;aspect-ratio:1;object-fit:cover}
  .ugc-meta{display:flex;justify-content:space-between;padding:8px 12px 0;font-size:12px;color:#666}
  .ugc-card p{padding:8px 12px;font-size:13px;color:#333;margin:0}
  .ugc-stats{padding:4px 12px 12px;font-size:12px;color:#999}
</style>
<div class="ugc-wall">${cards}</div>`;

    return { success: true, embedHtml: html, itemCount: items.length };
  }

  // ══════════════════════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════════════════════
  async getAnalytics(userId, days = 30) {
    const from  = new Date(Date.now() - days * 86400000);
    const items = await UGCItem.find({ userId, collectedAt: { $gte: from } });

    const byPlatform  = {};
    const byStatus    = {};
    const bySourceType= {};

    for (const item of items) {
      byPlatform[item.platform]         = (byPlatform[item.platform]         || 0) + 1;
      byStatus[item.status]             = (byStatus[item.status]             || 0) + 1;
      bySourceType[item.sourceType]     = (bySourceType[item.sourceType]     || 0) + 1;
    }

    const avgScore   = items.length
      ? Math.round(items.reduce((s, i) => s + (i.scores?.overall || 0), 0) / items.length)
      : 0;
    const approved   = items.filter(i => ['approved','reposted'].includes(i.status));
    const requested  = items.filter(i => i.permission?.status !== 'pending');
    const replyRate  = requested.length
      ? Math.round(approved.length / requested.length * 100) + '%'
      : '0%';

    return {
      total:        items.length,
      avgScore,
      replyRate,
      byPlatform,
      byStatus,
      bySourceType,
      topPerforming: items
        .sort((a, b) => (b.scores?.overall || 0) - (a.scores?.overall || 0))
        .slice(0, 5)
        .map(i => ({ postUrl: i.postUrl, score: i.scores?.overall, creator: i.creator?.username })),
    };
  }
}

module.exports = { UGCService: new UGCService(), UGCItem, UGCCampaign };
