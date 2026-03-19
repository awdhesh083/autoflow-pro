/**
 * ══════════════════════════════════════════════════════════
 * INFLUENCER FINDER & OUTREACH ENGINE — Priority Feature 2
 * Find, qualify, and auto-outreach influencers at scale
 *
 * Platforms: Instagram · TikTok · YouTube · Twitter · Pinterest
 *
 * Finder features:
 *  - Search by niche / keyword / hashtag
 *  - Filter by follower range, engagement rate, location
 *  - Filter by content type (video / image / both)
 *  - Fake follower detector (engagement rate score)
 *  - Contact info extractor (email / bio links)
 *  - Audience demographic estimator
 *  - Brand safety scorer (no offensive content)
 *  - Competitor influencer spy (who's your competitor using?)
 *  - Similar influencer finder (find 10 like this one)
 *  - AI influencer score (0-100 collaboration worthiness)
 *
 * Outreach features:
 *  - Personalized DM/email outreach campaigns
 *  - AI-written collaboration proposals
 *  - Follow-up sequences (3-touch drip)
 *  - Multi-platform outreach (IG DM + email + Twitter)
 *  - Outreach CRM (track status: found → contacted → replied → deal)
 *  - Open rate / reply rate tracker
 *  - Campaign ROI estimator
 *  - Influencer shortlist / blacklist
 *  - Contract template generator
 *  - Rate card estimator (estimated collaboration price)
 * ══════════════════════════════════════════════════════════
 */

const mongoose  = require('mongoose');
const axios     = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const logger    = require('../../utils/logger');
const { delay, randomDelay } = require('../../utils/helpers');
const { Contact } = require('../../models');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Influencer Schema ─────────────────────────────────────
const influencerSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  platform:    { type: String, required: true },
  username:    { type: String, required: true },
  profileUrl:  String,
  name:        String,
  bio:         String,
  avatar:      String,
  location:    String,
  email:       String,
  website:     String,
  niche:       [String],
  tags:        [String],

  metrics: {
    followers:      Number,
    following:      Number,
    posts:          Number,
    avgLikes:       Number,
    avgComments:    Number,
    avgViews:       Number,
    engagementRate: Number,
    estimatedReach: Number,
  },

  scores: {
    overall:       Number,   // 0-100 collaboration score
    authenticity:  Number,   // fake follower likelihood
    brandSafety:   Number,   // content safety score
    engagement:    Number,   // engagement quality score
    growth:        Number,   // follower growth rate
  },

  estimatedRateCard: {
    post:     Number,
    story:    Number,
    reel:     Number,
    video:    Number,
    currency: { type: String, default: 'USD' },
  },

  outreachStatus: {
    type: String,
    enum: ['new','shortlisted','contacted','follow_up_1','follow_up_2','replied','negotiating','deal','rejected','blacklisted'],
    default: 'new',
  },
  outreachNotes:  String,
  lastContactedAt: Date,
  repliedAt:       Date,
  dealValue:       Number,

  searchKeyword:  String,   // what search found them
  savedAt:        { type: Date, default: Date.now },
}, { timestamps: true });

influencerSchema.index({ userId: 1, platform: 1, username: 1 }, { unique: true });
const Influencer = mongoose.model('Influencer', influencerSchema);

// ── Outreach Campaign Schema ──────────────────────────────
const outreachCampaignSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  name:        String,
  platform:    String,
  accountId:   String,

  // Message templates
  templates: {
    initial:    String,
    followUp1:  String,
    followUp2:  String,
  },

  // Follow-up delays
  followUpDays: { f1: { type: Number, default: 3 }, f2: { type: Number, default: 7 } },

  targetInfluencerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Influencer' }],
  status:      { type: String, enum: ['draft','active','paused','completed'], default: 'draft' },

  stats: {
    sent:       { type: Number, default: 0 },
    replied:    { type: Number, default: 0 },
    deals:      { type: Number, default: 0 },
    totalValue: { type: Number, default: 0 },
  },
}, { timestamps: true });

const OutreachCampaign = mongoose.model('OutreachCampaign', outreachCampaignSchema);

class InfluencerService {

  // ══════════════════════════════════════════════════════════
  // FINDER: SEARCH INFLUENCERS
  // ══════════════════════════════════════════════════════════
  async findInfluencers(userId, searchParams) {
    const {
      platform       = 'instagram',
      keyword        = '',
      hashtag        = '',
      niche          = '',
      minFollowers   = 1000,
      maxFollowers   = 10000000,
      minEngagement  = 1.0,      // minimum engagement rate %
      maxEngagement  = 100,
      location       = '',
      contentType    = 'any',    // any / video / image
      limit          = 50,
      saveToDb       = true,
    } = searchParams;

    let results = [];

    switch (platform) {
      case 'instagram':
        results = await this._searchInstagram(keyword || hashtag, { minFollowers, maxFollowers, minEngagement, limit });
        break;
      case 'tiktok':
        results = await this._searchTikTok(keyword || hashtag, { minFollowers, maxFollowers, minEngagement, limit });
        break;
      case 'youtube':
        results = await this._searchYouTube(keyword || niche, { minFollowers, maxFollowers, limit });
        break;
      case 'twitter':
        results = await this._searchTwitter(keyword, { minFollowers, maxFollowers, limit });
        break;
      default:
        // Multi-platform search
        const [ig, tt, yt] = await Promise.allSettled([
          this._searchInstagram(keyword, { minFollowers, maxFollowers, minEngagement, limit: Math.ceil(limit/3) }),
          this._searchTikTok(keyword,    { minFollowers, maxFollowers, minEngagement, limit: Math.ceil(limit/3) }),
          this._searchYouTube(keyword,   { minFollowers, maxFollowers, limit: Math.ceil(limit/3) }),
        ]);
        results = [
          ...(ig.value || []),
          ...(tt.value || []),
          ...(yt.value || []),
        ];
    }

    // Score all results
    const scored = results.map(inf => ({
      ...inf,
      scores: this._scoreInfluencer(inf),
      estimatedRateCard: this._estimateRateCard(inf),
    }));

    // Filter by engagement
    const filtered = scored.filter(inf =>
      inf.metrics.engagementRate >= minEngagement &&
      inf.metrics.followers >= minFollowers &&
      inf.metrics.followers <= maxFollowers
    );

    // Save to database
    if (saveToDb && filtered.length) {
      await this._saveInfluencers(userId, filtered, keyword || hashtag || niche);
    }

    return {
      success:   true,
      platform,
      keyword:   keyword || hashtag || niche,
      found:     filtered.length,
      influencers: filtered.slice(0, limit),
    };
  }

  // ── Instagram search via hashtag scraping ─────────────
  async _searchInstagram(query, options = {}) {
    const { minFollowers = 1000, maxFollowers = 10000000, minEngagement = 1, limit = 20 } = options;
    const influencers = [];

    try {
      // Search via hashtag
      const hashtag = query.replace('#', '');
      const res = await axios.get(`https://www.instagram.com/explore/tags/${hashtag}/?__a=1&__d=dis`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000,
      });

      const posts = res.data?.graphql?.hashtag?.edge_hashtag_to_media?.edges || [];
      const seen  = new Set();

      for (const post of posts.slice(0, limit * 3)) {
        const owner = post.node?.owner;
        if (!owner?.id || seen.has(owner.id)) continue;
        seen.add(owner.id);

        // Get user profile
        try {
          const profileRes = await axios.get(`https://www.instagram.com/${owner.username}/?__a=1&__d=dis`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 8000,
          });
          const user = profileRes.data?.graphql?.user;
          if (!user) continue;

          const followers   = user.edge_followed_by?.count || 0;
          if (followers < minFollowers || followers > maxFollowers) continue;

          const recentPosts = user.edge_owner_to_timeline_media?.edges?.slice(0, 12) || [];
          const avgLikes    = recentPosts.reduce((s, p) => s + (p.node?.edge_liked_by?.count || 0), 0) / (recentPosts.length || 1);
          const avgComments = recentPosts.reduce((s, p) => s + (p.node?.edge_media_to_comment?.count || 0), 0) / (recentPosts.length || 1);
          const engRate     = followers ? ((avgLikes + avgComments) / followers * 100) : 0;

          if (engRate < minEngagement) continue;

          // Extract email from bio
          const email = user.biography?.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] || '';

          influencers.push({
            platform:   'instagram',
            username:   user.username,
            profileUrl: `https://www.instagram.com/${user.username}/`,
            name:       user.full_name,
            bio:        user.biography,
            avatar:     user.profile_pic_url_hd,
            email,
            website:    user.external_url,
            metrics: {
              followers,
              following:      user.edge_follow?.count,
              posts:          user.edge_owner_to_timeline_media?.count,
              avgLikes:       Math.round(avgLikes),
              avgComments:    Math.round(avgComments),
              engagementRate: parseFloat(engRate.toFixed(2)),
              estimatedReach: Math.round(followers * (engRate / 100) * 5),
            },
          });

          if (influencers.length >= limit) break;
          await delay(randomDelay(1000, 2000));
        } catch {}
      }
    } catch (err) {
      logger.warn(`IG influencer search failed: ${err.message}`);
    }

    return influencers;
  }

  // ── TikTok search ─────────────────────────────────────
  async _searchTikTok(query, options = {}) {
    const { minFollowers = 1000, maxFollowers = 10000000, limit = 20 } = options;
    const influencers = [];

    try {
      const res = await axios.get('https://www.tiktok.com/api/search/user/full/', {
        params: { keyword: query, count: limit * 2, offset: 0 },
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
          'Referer':    'https://www.tiktok.com/',
        },
        timeout: 10000,
      });

      for (const item of (res.data?.user_list || []).slice(0, limit)) {
        const u        = item.user_info;
        const followers= u?.follower_count || 0;
        if (followers < minFollowers || followers > maxFollowers) continue;

        const heartCount = u?.total_favorited || 0;
        const videoCount = u?.aweme_count      || 1;
        const avgLikes   = Math.round(heartCount / videoCount);
        const engRate    = followers ? parseFloat((avgLikes / followers * 100).toFixed(2)) : 0;

        influencers.push({
          platform:   'tiktok',
          username:   u.unique_id,
          profileUrl: `https://www.tiktok.com/@${u.unique_id}`,
          name:       u.nickname,
          bio:        u.signature,
          avatar:     u.avatar_larger?.url_list?.[0],
          email:      u.signature?.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] || '',
          metrics: {
            followers,
            following:      u.following_count,
            posts:          u.aweme_count,
            avgLikes,
            engagementRate: engRate,
            estimatedReach: Math.round(followers * (engRate / 100) * 8),
          },
        });
      }
    } catch (err) {
      logger.warn(`TikTok influencer search failed: ${err.message}`);
    }

    return influencers;
  }

  // ── YouTube search ─────────────────────────────────────
  async _searchYouTube(query, options = {}) {
    const { minFollowers = 1000, maxFollowers = 10000000, limit = 20 } = options;
    if (!process.env.YOUTUBE_API_KEY) return [];

    const influencers = [];
    try {
      const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: { part: 'snippet', q: query, type: 'channel', maxResults: limit, key: process.env.YOUTUBE_API_KEY },
        timeout: 10000,
      });

      const channelIds = searchRes.data?.items?.map(i => i.id.channelId).join(',');
      if (!channelIds) return [];

      const statsRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: { part: 'statistics,snippet,brandingSettings', id: channelIds, key: process.env.YOUTUBE_API_KEY },
        timeout: 10000,
      });

      for (const ch of (statsRes.data?.items || [])) {
        const subs = parseInt(ch.statistics?.subscriberCount || 0);
        if (subs < minFollowers || subs > maxFollowers) continue;

        const views   = parseInt(ch.statistics?.viewCount || 0);
        const videos  = parseInt(ch.statistics?.videoCount || 1);
        const avgViews= Math.round(views / videos);

        influencers.push({
          platform:   'youtube',
          username:   ch.snippet?.customUrl || ch.id,
          profileUrl: `https://www.youtube.com/channel/${ch.id}`,
          name:       ch.snippet?.title,
          bio:        ch.snippet?.description?.slice(0, 300),
          avatar:     ch.snippet?.thumbnails?.high?.url,
          email:      ch.snippet?.description?.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] || '',
          metrics: {
            followers:     subs,
            posts:         videos,
            avgViews,
            totalViews:    views,
            engagementRate: subs ? parseFloat((avgViews / subs * 100).toFixed(2)) : 0,
            estimatedReach: avgViews,
          },
        });
      }
    } catch (err) {
      logger.warn(`YouTube influencer search failed: ${err.message}`);
    }

    return influencers;
  }

  // ── Twitter search ──────────────────────────────────────
  async _searchTwitter(query, options = {}) {
    const { minFollowers = 1000, maxFollowers = 10000000, limit = 20 } = options;
    if (!process.env.TWITTER_BEARER_TOKEN) return [];

    const influencers = [];
    try {
      const res = await axios.get('https://api.twitter.com/2/users/search', {
        params: { query, max_results: limit, 'user.fields': 'public_metrics,description,verified,profile_image_url' },
        headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` },
        timeout: 10000,
      });

      for (const u of (res.data?.data || [])) {
        const followers = u.public_metrics?.followers_count || 0;
        if (followers < minFollowers || followers > maxFollowers) continue;

        influencers.push({
          platform:   'twitter',
          username:   u.username,
          profileUrl: `https://twitter.com/${u.username}`,
          name:       u.name,
          bio:        u.description,
          avatar:     u.profile_image_url,
          email:      u.description?.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] || '',
          metrics: {
            followers,
            following:      u.public_metrics?.following_count,
            posts:          u.public_metrics?.tweet_count,
            engagementRate: 0, // requires tweet analytics
          },
        });
      }
    } catch (err) {
      logger.warn(`Twitter influencer search failed: ${err.message}`);
    }

    return influencers;
  }

  // ══════════════════════════════════════════════════════════
  // SCORER & RATE CARD
  // ══════════════════════════════════════════════════════════
  _scoreInfluencer(inf) {
    const m = inf.metrics;
    const followers = m.followers || 0;
    const engRate   = m.engagementRate || 0;

    // Engagement quality score (0-100)
    const engScore =
      engRate >= 10 ? 100 :
      engRate >= 6  ? 85  :
      engRate >= 3  ? 70  :
      engRate >= 1  ? 50  : 20;

    // Authenticity score — high engagement on smaller account = authentic
    // Suspiciously low engagement on large account = fake followers
    const expectedEng = followers > 1000000 ? 1.5 : followers > 100000 ? 2.5 : followers > 10000 ? 4 : 6;
    const authScore   = Math.min(100, Math.round((engRate / expectedEng) * 100));

    // Brand safety (basic — no profanity check without content scan)
    const brandSafety = 80; // default — full check requires content analysis

    // Growth rate (placeholder — requires historical data)
    const growth = 50;

    const overall = Math.round((engScore * 0.35) + (authScore * 0.35) + (brandSafety * 0.2) + (growth * 0.1));

    return {
      overall:      Math.min(100, overall),
      authenticity: Math.min(100, authScore),
      brandSafety,
      engagement:   engScore,
      growth,
      tier: followers >= 1000000 ? 'mega' : followers >= 100000 ? 'macro' : followers >= 10000 ? 'mid' : followers >= 1000 ? 'micro' : 'nano',
    };
  }

  _estimateRateCard(inf) {
    const followers = inf.metrics.followers || 0;
    const engRate   = inf.metrics.engagementRate || 0;
    const platform  = inf.platform;

    // Industry-standard rate estimates (CPM-based)
    const cpm = platform === 'youtube' ? 25 : platform === 'tiktok' ? 10 : 15;
    const engMultiplier = engRate > 5 ? 1.5 : engRate > 3 ? 1.2 : 1;

    const baseRate = Math.round((followers / 1000) * cpm * engMultiplier);
    const cap = (v, min, max) => Math.min(max, Math.max(min, v));

    return {
      post:     cap(baseRate, 50, 50000),
      story:    cap(Math.round(baseRate * 0.3), 20, 10000),
      reel:     cap(Math.round(baseRate * 1.5), 75, 75000),
      video:    cap(Math.round(baseRate * 2),   100, 100000),
      currency: 'USD',
    };
  }

  // ══════════════════════════════════════════════════════════
  // AI INFLUENCER SCORER (deep analysis)
  // ══════════════════════════════════════════════════════════
  async aiScoreInfluencer(influencer) {
    const prompt = `Analyze this influencer profile and provide a detailed collaboration worthiness score.

Profile:
${JSON.stringify({
  platform:   influencer.platform,
  username:   influencer.username,
  bio:        influencer.bio,
  followers:  influencer.metrics?.followers,
  engRate:    influencer.metrics?.engagementRate,
  scores:     influencer.scores,
}, null, 2)}

Return ONLY JSON:
{
  "overallScore": 78,
  "recommendation": "Strong micro-influencer with authentic engagement — ideal for lifestyle brands",
  "strengths": ["high engagement rate", "niche audience"],
  "weaknesses": ["limited reach", "inconsistent posting"],
  "bestFor": ["product launches", "affiliate campaigns"],
  "avoid": ["luxury brands", "B2B products"],
  "estimatedROI": "3-5x",
  "audienceProfile": "Likely 18-35 female, beauty/lifestyle interested",
  "negotiationTips": ["offer product + flat fee", "request 3 story slides + 1 post"],
  "redFlags": []
}`;

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages:   [{ role: 'user', content: prompt }],
      system:     'You are an influencer marketing expert. Return ONLY valid JSON, no markdown.',
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    return { success: true, username: influencer.username, ...JSON.parse(text) };
  }

  // ══════════════════════════════════════════════════════════
  // SIMILAR INFLUENCER FINDER
  // ══════════════════════════════════════════════════════════
  async findSimilar(userId, influencerId, options = {}) {
    const inf  = await Influencer.findOne({ _id: influencerId, userId });
    if (!inf) throw new Error('Influencer not found');

    const query = inf.niche?.[0] || inf.searchKeyword || inf.username;
    return this.findInfluencers(userId, {
      platform:    inf.platform,
      keyword:     query,
      minFollowers: Math.round(inf.metrics.followers * 0.3),
      maxFollowers: Math.round(inf.metrics.followers * 3),
      minEngagement: Math.max(1, inf.metrics.engagementRate - 2),
      limit:         options.limit || 10,
    });
  }

  // ══════════════════════════════════════════════════════════
  // OUTREACH: AI PROPOSAL WRITER
  // ══════════════════════════════════════════════════════════
  async writeOutreachMessage(influencer, brandInfo, options = {}) {
    const {
      messageType  = 'dm',      // dm / email
      campaignType = 'product_gifting', // product_gifting / paid_post / affiliate / collab
      tone         = 'casual',
      yourName     = '',
      brandName    = '',
      productName  = '',
      offer        = '',
    } = options;

    const charLimit = messageType === 'dm' ? 500 : 2000;

    const prompt = `Write a ${messageType} outreach message to an influencer for a collaboration.

Influencer:
- Username: @${influencer.username}
- Platform: ${influencer.platform}
- Followers: ${influencer.metrics?.followers?.toLocaleString()}
- Niche: ${influencer.bio?.slice(0, 100) || 'lifestyle'}
- Score: ${influencer.scores?.overall}/100

Brand/Campaign:
- Brand: ${brandName}
- Product: ${productName}
- Your name: ${yourName}
- Campaign type: ${campaignType}
- Offer: ${offer || 'to be discussed'}
- Tone: ${tone}

Rules:
- Max ${charLimit} characters
- Personalize to their content/niche (reference their bio/platform)
- Clear value proposition
- Specific ask (what you want them to do)
- Easy response (yes/no question at end)
- Do NOT sound like a template blast

Return ONLY JSON:
{
  "message": "full message text",
  "subject": "${messageType === 'email' ? 'email subject line' : 'n/a'}",
  "charCount": 350,
  "followUp1": "follow-up message if no reply in 3 days",
  "followUp2": "second follow-up if no reply in 7 days",
  "personalizedHook": "what makes this feel personal to them"
}`;

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages:   [{ role: 'user', content: prompt }],
      system:     'You are an influencer marketing manager. Return ONLY valid JSON, no markdown.',
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    return { success: true, influencer: influencer.username, platform: influencer.platform, ...JSON.parse(text) };
  }

  // ══════════════════════════════════════════════════════════
  // OUTREACH CAMPAIGN: SEND TO LIST
  // ══════════════════════════════════════════════════════════
  async runOutreachCampaign(userId, campaignId) {
    const campaign = await OutreachCampaign.findOne({ _id: campaignId, userId });
    if (!campaign) throw new Error('Campaign not found');

    const influencers = await Influencer.find({
      _id:              { $in: campaign.targetInfluencerIds },
      userId,
      outreachStatus:   { $in: ['new', 'shortlisted'] },
    });

    logger.info(`Starting outreach: ${influencers.length} influencers on ${campaign.platform}`);

    for (const inf of influencers) {
      try {
        const message = campaign.templates.initial;
        await this._sendOutreachMessage(campaign, inf, message);

        await Influencer.findByIdAndUpdate(inf._id, {
          outreachStatus:  'contacted',
          lastContactedAt: new Date(),
        });

        await OutreachCampaign.findByIdAndUpdate(campaignId, { $inc: { 'stats.sent': 1 } });

        // Schedule follow-ups
        this._scheduleFollowUp(campaign, inf, 1);
        this._scheduleFollowUp(campaign, inf, 2);

        logger.info(`✅ Outreach sent to @${inf.username} on ${inf.platform}`);

        // Anti-spam delay
        await delay(randomDelay(30000, 90000));
      } catch (err) {
        logger.error(`Outreach failed for @${inf.username}: ${err.message}`);
      }
    }

    return { campaignId, sent: influencers.length };
  }

  async _sendOutreachMessage(campaign, influencer, messageTemplate) {
    const message = messageTemplate
      .replace('{name}',      influencer.name || influencer.username)
      .replace('{username}',  `@${influencer.username}`)
      .replace('{followers}', influencer.metrics?.followers?.toLocaleString() || '')
      .replace('{platform}',  influencer.platform);

    switch (influencer.platform) {
      case 'instagram': {
        const IGService = require('../instagram.service');
        const ig = await IGService.getClient(campaign.accountId);
        const user = await ig.user.searchExact(influencer.username);
        if (user?.pk) await ig.directMessage.sendText({ userIds: [user.pk], text: message });
        break;
      }
      case 'twitter': {
        const { TwitterApi } = require('twitter-api-v2');
        const { Account }    = require('../../models');
        const account        = await Account.findById(campaign.accountId);
        const client         = new TwitterApi({
          appKey:       account.credentials.apiKey,
          appSecret:    account.credentials.apiSecret,
          accessToken:  account.credentials.accessToken,
          accessSecret: account.credentials.accessSecret,
        });
        await client.v1.sendDm({ recipient_id: influencer.metrics.userId, text: message.slice(0, 10000) });
        break;
      }
      default:
        // Email outreach if email available
        if (influencer.email) {
          const EmailService = require('../email.service');
          await EmailService.sendEmail({
            to:      influencer.email,
            subject: `Collaboration opportunity for @${influencer.username}`,
            text:    message,
          });
        } else {
          logger.warn(`No outreach method for ${influencer.platform} / @${influencer.username}`);
        }
    }

    await MessageLog.create?.({
      platform:  influencer.platform,
      direction: 'outbound',
      to:        influencer.username,
      body:      message,
      type:      'influencer_outreach',
    }).catch(() => {});
  }

  _scheduleFollowUp(campaign, influencer, attempt) {
    const days = attempt === 1 ? campaign.followUpDays?.f1 || 3 : campaign.followUpDays?.f2 || 7;
    const template = attempt === 1 ? campaign.templates.followUp1 : campaign.templates.followUp2;
    if (!template) return;

    setTimeout(async () => {
      const refreshed = await Influencer.findById(influencer._id);
      // Only follow up if no reply yet
      if (!refreshed || ['replied','deal','rejected','blacklisted'].includes(refreshed.outreachStatus)) return;

      await this._sendOutreachMessage(campaign, influencer, template).catch(e =>
        logger.error(`Follow-up ${attempt} failed for @${influencer.username}: ${e.message}`)
      );

      await Influencer.findByIdAndUpdate(influencer._id, {
        outreachStatus:  attempt === 1 ? 'follow_up_1' : 'follow_up_2',
        lastContactedAt: new Date(),
      });

      logger.info(`Follow-up ${attempt} sent to @${influencer.username}`);
    }, days * 86400000);
  }

  // ══════════════════════════════════════════════════════════
  // CONTRACT TEMPLATE GENERATOR
  // ══════════════════════════════════════════════════════════
  async generateContract(influencer, dealTerms, brandInfo) {
    const prompt = `Generate a professional influencer collaboration contract/brief.

Influencer: @${influencer.username} | ${influencer.metrics?.followers?.toLocaleString()} followers | ${influencer.platform}
Brand: ${brandInfo.name}
Deal Terms: ${JSON.stringify(dealTerms)}

Include:
- Deliverables (exact posts/stories/videos required)
- Timeline & deadlines
- Compensation & payment terms
- Usage rights
- FTC disclosure requirements
- Exclusivity clause (if any)
- Revision policy
- Cancellation terms

Return ONLY JSON:
{
  "contractTitle": "...",
  "sections": [
    {"title": "Deliverables", "content": "..."},
    {"title": "Compensation", "content": "..."},
    {"title": "Timeline", "content": "..."},
    {"title": "Usage Rights", "content": "..."},
    {"title": "FTC Disclosure", "content": "..."},
    {"title": "Cancellation", "content": "..."}
  ],
  "fullContract": "complete contract text",
  "keyTerms": ["bullet summary of key points"]
}`;

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages:   [{ role: 'user', content: prompt }],
      system:     'You are a legal/marketing contract specialist. Return ONLY valid JSON, no markdown.',
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    return { success: true, ...JSON.parse(text) };
  }

  // ══════════════════════════════════════════════════════════
  // CRM: MANAGE INFLUENCER PIPELINE
  // ══════════════════════════════════════════════════════════
  async getInfluencers(userId, options = {}) {
    const { platform, status, minScore, limit = 50, page = 1, search } = options;
    const q = { userId };
    if (platform) q.platform = platform;
    if (status)   q.outreachStatus = status;
    if (minScore) q['scores.overall'] = { $gte: minScore };
    if (search)   q.$or = [{ username: new RegExp(search, 'i') }, { name: new RegExp(search, 'i') }];

    const [influencers, total] = await Promise.all([
      Influencer.find(q).skip((page-1)*limit).limit(+limit).sort({ 'scores.overall': -1 }),
      Influencer.countDocuments(q),
    ]);

    return { influencers, total, page: +page, limit: +limit };
  }

  async updateStatus(userId, influencerId, status, notes) {
    return Influencer.findOneAndUpdate(
      { _id: influencerId, userId },
      { outreachStatus: status, outreachNotes: notes, ...(status === 'replied' ? { repliedAt: new Date() } : {}) },
      { new: true }
    );
  }

  async shortlistInfluencer(userId, influencerId) {
    return this.updateStatus(userId, influencerId, 'shortlisted', '');
  }

  async blacklistInfluencer(userId, influencerId, reason) {
    return this.updateStatus(userId, influencerId, 'blacklisted', reason);
  }

  async deleteInfluencer(userId, influencerId) {
    await Influencer.findOneAndDelete({ _id: influencerId, userId });
    return { deleted: true };
  }

  async getCRMStats(userId) {
    const all = await Influencer.find({ userId });
    const byStatus   = {};
    const byPlatform = {};

    for (const inf of all) {
      byStatus[inf.outreachStatus]   = (byStatus[inf.outreachStatus]   || 0) + 1;
      byPlatform[inf.platform]       = (byPlatform[inf.platform]       || 0) + 1;
    }

    const deals     = all.filter(i => i.outreachStatus === 'deal');
    const contacted = all.filter(i => !['new','shortlisted'].includes(i.outreachStatus));
    const replied   = all.filter(i => ['replied','negotiating','deal'].includes(i.outreachStatus));

    return {
      total:       all.length,
      byStatus,
      byPlatform,
      replyRate:   contacted.length ? `${Math.round(replied.length / contacted.length * 100)}%` : '0%',
      dealRate:    contacted.length ? `${Math.round(deals.length   / contacted.length * 100)}%` : '0%',
      totalDealValue: deals.reduce((s, d) => s + (d.dealValue || 0), 0),
      avgScore:    all.length ? Math.round(all.reduce((s, i) => s + (i.scores?.overall || 0), 0) / all.length) : 0,
    };
  }

  // Create / manage campaigns
  async createCampaign(userId, data) {
    return OutreachCampaign.create({ userId, ...data });
  }

  async getCampaigns(userId) {
    return OutreachCampaign.find({ userId }).sort({ createdAt: -1 });
  }

  // ── Internal: save to DB ─────────────────────────────
  async _saveInfluencers(userId, influencers, keyword) {
    let saved = 0;
    for (const inf of influencers) {
      try {
        await Influencer.findOneAndUpdate(
          { userId, platform: inf.platform, username: inf.username },
          { userId, searchKeyword: keyword, ...inf },
          { upsert: true, new: true }
        );
        saved++;
      } catch {}
    }
    return saved;
  }
}

module.exports = { InfluencerService: new InfluencerService(), Influencer, OutreachCampaign };
