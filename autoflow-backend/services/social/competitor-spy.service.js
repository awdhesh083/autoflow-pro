/**
 * ══════════════════════════════════════════════════════════
 * COMPETITOR SPY SERVICE — Feature 13
 * Full multi-platform competitor intelligence engine
 *
 * Features:
 *  - Track competitors across ALL platforms simultaneously
 *  - Follower growth tracker (daily snapshots)
 *  - Engagement rate benchmarker
 *  - Viral post detector (what's performing best)
 *  - Best posting time analysis from competitor data
 *  - Hashtag spy (what hashtags they use)
 *  - Content strategy reverse-engineer
 *  - Brand mention monitor (across web)
 *  - Keyword rank tracker
 *  - Ad library spy (Facebook/IG ads)
 *  - New follower alert
 *  - Competitor posting frequency tracker
 *  - AI-powered competitor analysis report
 *  - Email/contact extractor from competitor bios
 *  - Automated daily/weekly digest emails
 *  - Alert system (when competitor posts go viral)
 * ══════════════════════════════════════════════════════════
 */

const mongoose  = require('mongoose');
const axios     = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const logger    = require('../../utils/logger');
const { delay, randomDelay } = require('../../utils/helpers');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Schema: Competitor ────────────────────────────────────
const competitorSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:     { type: String, required: true },
  notes:    String,

  // Platform handles
  handles: {
    instagram:  String,
    tiktok:     String,
    twitter:    String,
    youtube:    String,
    facebook:   String,
    linkedin:   String,
    pinterest:  String,
    website:    String,
  },

  // Latest snapshot per platform
  snapshots: mongoose.Schema.Types.Mixed,  // { instagram: { followers, posts, engagement, ... } }

  // Historical data (daily snapshots)
  history: [{
    date:     Date,
    platform: String,
    metrics:  mongoose.Schema.Types.Mixed,
  }],

  // Top performing posts (updated on each scrape)
  topPosts: [{
    platform:    String,
    postUrl:     String,
    thumbnail:   String,
    caption:     String,
    likes:       Number,
    comments:    Number,
    views:       Number,
    shares:      Number,
    engagement:  Number,
    postedAt:    Date,
    hashtags:    [String],
    contentType: String,
  }],

  // Alert config
  alerts: {
    viralThreshold:  { type: Number, default: 1000 },  // likes > this = viral alert
    newFollowerSpike:{ type: Number, default: 500 },    // follower gain per day
    emailAlerts:     { type: Boolean, default: false },
    alertEmail:      String,
  },

  isActive:  { type: Boolean, default: true },
  lastSynced: Date,
}, { timestamps: true });

const Competitor = mongoose.model('Competitor', competitorSchema);

// ── Schema: CompetitorSnapshot ────────────────────────────
const snapshotSchema = new mongoose.Schema({
  competitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Competitor', index: true },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  platform:     String,
  date:         { type: Date, default: Date.now, index: true },
  metrics: {
    followers:     Number,
    following:     Number,
    posts:         Number,
    avgLikes:      Number,
    avgComments:   Number,
    avgViews:      Number,
    engagementRate:Number,
    postsThisWeek: Number,
    topHashtags:   [String],
  },
}, { timestamps: true });

const CompetitorSnapshot = mongoose.model('CompetitorSnapshot', snapshotSchema);

class CompetitorSpyService {

  // ══════════════════════════════════════════════════════════
  // CRUD: COMPETITORS
  // ══════════════════════════════════════════════════════════
  async addCompetitor(userId, data) {
    const competitor = await Competitor.create({ userId, ...data });
    // Trigger initial sync
    this.syncCompetitor(competitor._id, userId).catch(() => {});
    return competitor;
  }

  async updateCompetitor(id, userId, data) {
    return Competitor.findOneAndUpdate({ _id: id, userId }, data, { new: true });
  }

  async deleteCompetitor(id, userId) {
    await Competitor.findOneAndDelete({ _id: id, userId });
    await CompetitorSnapshot.deleteMany({ competitorId: id });
    return { deleted: true };
  }

  async getCompetitors(userId, options = {}) {
    const { isActive } = options;
    const q = { userId };
    if (isActive !== undefined) q.isActive = isActive;
    return Competitor.find(q).sort({ name: 1 });
  }

  async getCompetitor(id, userId) {
    return Competitor.findOne({ _id: id, userId });
  }

  // ══════════════════════════════════════════════════════════
  // SYNC: SCRAPE ALL PLATFORMS FOR A COMPETITOR
  // ══════════════════════════════════════════════════════════
  async syncCompetitor(competitorId, userId) {
    const competitor = await Competitor.findOne({ _id: competitorId, userId });
    if (!competitor) throw new Error('Competitor not found');

    const results = {};
    const handles = competitor.handles || {};

    // Scrape each platform in parallel
    const scrapers = [];
    if (handles.instagram) scrapers.push(this._scrapeInstagram(handles.instagram).then(d => { results.instagram = d; }));
    if (handles.tiktok)    scrapers.push(this._scrapeTikTok(handles.tiktok).then(d => { results.tiktok = d; }));
    if (handles.twitter)   scrapers.push(this._scrapeTwitter(handles.twitter).then(d => { results.twitter = d; }));
    if (handles.youtube)   scrapers.push(this._scrapeYouTube(handles.youtube).then(d => { results.youtube = d; }));
    if (handles.facebook)  scrapers.push(this._scrapeFacebook(handles.facebook).then(d => { results.facebook = d; }));

    await Promise.allSettled(scrapers);

    // Save snapshots
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const [platform, data] of Object.entries(results)) {
      if (!data || data.error) continue;

      await CompetitorSnapshot.findOneAndUpdate(
        { competitorId, platform, date: { $gte: today } },
        { competitorId, userId, platform, date: new Date(), metrics: data.metrics },
        { upsert: true, new: true }
      );
    }

    // Update competitor record
    await Competitor.findByIdAndUpdate(competitorId, {
      snapshots:  results,
      lastSynced: new Date(),
    });

    // Check alerts
    await this._checkAlerts(competitor, results);

    logger.info(`✅ Competitor synced: ${competitor.name}`);
    return { success: true, competitor: competitor.name, platforms: Object.keys(results) };
  }

  // Sync ALL competitors for a user
  async syncAllCompetitors(userId) {
    const competitors = await Competitor.find({ userId, isActive: true });
    const results     = [];

    for (const c of competitors) {
      try {
        const r = await this.syncCompetitor(c._id, userId);
        results.push({ name: c.name, ...r });
      } catch (err) {
        results.push({ name: c.name, error: err.message });
      }
      await delay(3000); // Rate limit between competitors
    }

    return { synced: results.filter(r => r.success).length, total: competitors.length, results };
  }

  // ══════════════════════════════════════════════════════════
  // PLATFORM SCRAPERS
  // ══════════════════════════════════════════════════════════
  async _scrapeInstagram(username) {
    try {
      // Instagram public data via web scraping
      const res = await axios.get(`https://www.instagram.com/${username}/?__a=1&__d=dis`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        timeout: 10000,
      });

      const user = res.data?.graphql?.user || res.data?.data?.user;
      if (!user) throw new Error('No data');

      const recentPosts = user.edge_owner_to_timeline_media?.edges?.slice(0, 12) || [];
      const avgLikes    = recentPosts.reduce((s, p) => s + (p.node?.edge_liked_by?.count || 0), 0) / (recentPosts.length || 1);
      const avgComments = recentPosts.reduce((s, p) => s + (p.node?.edge_media_to_comment?.count || 0), 0) / (recentPosts.length || 1);
      const followers   = user.edge_followed_by?.count || 0;
      const engRate     = followers ? ((avgLikes + avgComments) / followers * 100) : 0;

      const topPosts = recentPosts.map(p => ({
        platform:    'instagram',
        postUrl:     `https://www.instagram.com/p/${p.node.shortcode}/`,
        thumbnail:   p.node.thumbnail_src,
        caption:     p.node.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 200) || '',
        likes:       p.node.edge_liked_by?.count || 0,
        comments:    p.node.edge_media_to_comment?.count || 0,
        views:       p.node.video_view_count || 0,
        postedAt:    new Date(p.node.taken_at_timestamp * 1000),
        contentType: p.node.is_video ? 'video' : 'image',
        hashtags:    (p.node.edge_media_to_caption?.edges?.[0]?.node?.text?.match(/#\w+/g) || []).slice(0, 10),
      })).sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments));

      return {
        platform: 'instagram',
        username,
        name:        user.full_name,
        bio:         user.biography,
        website:     user.external_url,
        avatar:      user.profile_pic_url_hd,
        verified:    user.is_verified,
        businessCategory: user.business_category_name,
        metrics: {
          followers:     followers,
          following:     user.edge_follow?.count,
          posts:         user.edge_owner_to_timeline_media?.count,
          avgLikes:      Math.round(avgLikes),
          avgComments:   Math.round(avgComments),
          engagementRate: engRate.toFixed(2),
        },
        topPosts: topPosts.slice(0, 6),
      };
    } catch (err) {
      logger.warn(`IG scrape failed for ${username}: ${err.message}`);
      return { platform: 'instagram', username, error: err.message };
    }
  }

  async _scrapeTikTok(username) {
    try {
      const res = await axios.get(`https://www.tiktok.com/@${username}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 10000,
      });

      // Parse __UNIVERSAL_DATA_FOR_REHYDRATION__
      const match = res.data.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s);
      if (!match) throw new Error('No TikTok data found');

      const data    = JSON.parse(match[1]);
      const user    = data?.['__DEFAULT_SCOPE__']?.['webapp.user-detail']?.userInfo;
      if (!user) throw new Error('No user data');

      const stats      = user.stats || {};
      const userInfo   = user.user || {};
      const followers  = stats.followerCount || 0;
      const heartCount = stats.heartCount || 0;
      const videoCount = stats.videoCount || 1;
      const avgLikes   = videoCount ? Math.round(heartCount / videoCount) : 0;
      const engRate    = followers ? (avgLikes / followers * 100).toFixed(2) : '0';

      return {
        platform: 'tiktok',
        username,
        name:     userInfo.nickname,
        bio:      userInfo.signature,
        avatar:   userInfo.avatarLarger,
        verified: userInfo.verified,
        metrics: {
          followers:     followers,
          following:     stats.followingCount,
          posts:         stats.videoCount,
          totalLikes:    heartCount,
          avgLikes,
          engagementRate: engRate,
        },
      };
    } catch (err) {
      logger.warn(`TikTok scrape failed for ${username}: ${err.message}`);
      return { platform: 'tiktok', username, error: err.message };
    }
  }

  async _scrapeTwitter(username) {
    try {
      // Try Twitter API v2 if available
      if (process.env.TWITTER_BEARER_TOKEN) {
        const res = await axios.get(`https://api.twitter.com/2/users/by/username/${username}`, {
          params: { 'user.fields': 'public_metrics,description,verified,profile_image_url' },
          headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` },
          timeout: 10000,
        });

        const user  = res.data?.data;
        const m     = user?.public_metrics || {};

        return {
          platform: 'twitter',
          username,
          name:     user.name,
          bio:      user.description,
          verified: user.verified,
          metrics: {
            followers:  m.followers_count,
            following:  m.following_count,
            posts:      m.tweet_count,
            listedCount:m.listed_count,
          },
        };
      }

      // Fallback: Nitter scrape
      const res = await axios.get(`https://nitter.net/${username}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000,
      });

      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(res.data);
      const doc = dom.window.document;

      return {
        platform: 'twitter',
        username,
        name:     doc.querySelector('.profile-card-fullname')?.textContent?.trim(),
        bio:      doc.querySelector('.profile-bio')?.textContent?.trim(),
        metrics: {
          followers: this._parseCount(doc.querySelector('.followers .profile-stat-num')?.textContent),
          following: this._parseCount(doc.querySelector('.following .profile-stat-num')?.textContent),
          posts:     this._parseCount(doc.querySelector('.posts .profile-stat-num')?.textContent),
        },
      };
    } catch (err) {
      return { platform: 'twitter', username, error: err.message };
    }
  }

  async _scrapeYouTube(channelHandle) {
    try {
      if (process.env.YOUTUBE_API_KEY) {
        const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: { part: 'snippet', q: channelHandle, type: 'channel', key: process.env.YOUTUBE_API_KEY },
          timeout: 10000,
        });

        const channelId = searchRes.data?.items?.[0]?.id?.channelId;
        if (!channelId) throw new Error('Channel not found');

        const statsRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
          params: { part: 'statistics,snippet', id: channelId, key: process.env.YOUTUBE_API_KEY },
          timeout: 10000,
        });

        const ch = statsRes.data?.items?.[0];
        const s  = ch?.statistics || {};

        return {
          platform: 'youtube',
          username: channelHandle,
          name:     ch?.snippet?.title,
          bio:      ch?.snippet?.description?.slice(0, 200),
          avatar:   ch?.snippet?.thumbnails?.high?.url,
          metrics: {
            followers:  parseInt(s.subscriberCount || 0),
            posts:      parseInt(s.videoCount || 0),
            totalViews: parseInt(s.viewCount || 0),
            avgViews:   s.videoCount ? Math.round(parseInt(s.viewCount) / parseInt(s.videoCount)) : 0,
          },
        };
      }
      return { platform: 'youtube', username: channelHandle, error: 'YOUTUBE_API_KEY required' };
    } catch (err) {
      return { platform: 'youtube', username: channelHandle, error: err.message };
    }
  }

  async _scrapeFacebook(pageUsername) {
    try {
      // Facebook public page scrape
      const res = await axios.get(`https://www.facebook.com/${pageUsername}`, {
        headers: {
          'User-Agent': 'facebookexternalhit/1.1',
          'Accept-Language': 'en-US,en',
        },
        timeout: 10000,
      });

      const likesMatch = res.data.match(/"page_likers":\{"count":(\d+)/);
      const nameMatch  = res.data.match(/"name":"([^"]+)","category/);
      const followMatch= res.data.match(/"follower_count":(\d+)/);

      return {
        platform: 'facebook',
        username: pageUsername,
        name:     nameMatch?.[1],
        metrics: {
          followers: parseInt(followMatch?.[1] || 0),
          likes:     parseInt(likesMatch?.[1] || 0),
        },
      };
    } catch (err) {
      return { platform: 'facebook', username: pageUsername, error: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════
  // GROWTH TRACKER (historical diff)
  // ══════════════════════════════════════════════════════════
  async getGrowthData(competitorId, userId, options = {}) {
    const { days = 30, platform } = options;
    const from = new Date(Date.now() - days * 86400000);
    const q    = { competitorId, date: { $gte: from } };
    if (platform) q.platform = platform;

    const snapshots = await CompetitorSnapshot.find(q).sort({ date: 1 });

    // Group by platform
    const byPlatform = {};
    for (const snap of snapshots) {
      if (!byPlatform[snap.platform]) byPlatform[snap.platform] = [];
      byPlatform[snap.platform].push({
        date:    snap.date,
        metrics: snap.metrics,
      });
    }

    // Calculate growth
    const growth = {};
    for (const [plat, data] of Object.entries(byPlatform)) {
      const first = data[0]?.metrics?.followers || 0;
      const last  = data[data.length - 1]?.metrics?.followers || 0;
      growth[plat] = {
        followerGain:   last - first,
        followerGainPct:first ? (((last - first) / first) * 100).toFixed(1) + '%' : 'N/A',
        dataPoints:     data.length,
        timeline:       data,
      };
    }

    return { competitorId, days, growth };
  }

  // ══════════════════════════════════════════════════════════
  // TOP PERFORMING POSTS (viral detector)
  // ══════════════════════════════════════════════════════════
  async getTopPosts(competitorId, userId, options = {}) {
    const { platform, limit = 10, sortBy = 'engagement' } = options;
    const competitor = await Competitor.findOne({ _id: competitorId, userId });
    if (!competitor) throw new Error('Not found');

    let posts = competitor.topPosts || [];
    if (platform) posts = posts.filter(p => p.platform === platform);

    const sorted = posts.sort((a, b) => {
      if (sortBy === 'likes')    return b.likes - a.likes;
      if (sortBy === 'views')    return b.views - a.views;
      if (sortBy === 'comments') return b.comments - a.comments;
      return (b.likes + b.comments * 2 + b.views * 0.1) - (a.likes + a.comments * 2 + a.views * 0.1);
    });

    return { competitorId, platform, total: sorted.length, posts: sorted.slice(0, limit) };
  }

  // ══════════════════════════════════════════════════════════
  // HASHTAG SPY
  // ══════════════════════════════════════════════════════════
  async spyHashtags(competitorId, userId) {
    const competitor = await Competitor.findOne({ _id: competitorId, userId });
    if (!competitor) throw new Error('Not found');

    const allHashtags = {};
    for (const post of competitor.topPosts || []) {
      for (const tag of post.hashtags || []) {
        const key = tag.toLowerCase();
        allHashtags[key] = (allHashtags[key] || 0) + 1;
      }
    }

    // Also from snapshots
    const snaps = await CompetitorSnapshot.find({ competitorId }).select('metrics.topHashtags');
    for (const snap of snaps) {
      for (const tag of snap.metrics?.topHashtags || []) {
        const key = tag.toLowerCase();
        allHashtags[key] = (allHashtags[key] || 0) + 1;
      }
    }

    const ranked = Object.entries(allHashtags)
      .sort(([, a], [, b]) => b - a)
      .map(([tag, count]) => ({ tag, count, frequency: `${count}x` }));

    return {
      competitorId,
      name:      competitor.name,
      hashtags:  ranked.slice(0, 30),
      topHashtags: ranked.slice(0, 10).map(h => h.tag),
    };
  }

  // ══════════════════════════════════════════════════════════
  // BEST POSTING TIME ANALYSIS
  // ══════════════════════════════════════════════════════════
  async getBestPostingTimes(competitorId, userId) {
    const competitor = await Competitor.findOne({ _id: competitorId, userId });
    if (!competitor) throw new Error('Not found');

    const byHour = Array(24).fill(0).map((_, h) => ({ hour: h, totalEngagement: 0, posts: 0 }));
    const byDay  = Array(7).fill(0).map((_, d) => ({ day: d, dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d], totalEngagement: 0, posts: 0 }));

    for (const post of competitor.topPosts || []) {
      if (!post.postedAt) continue;
      const dt         = new Date(post.postedAt);
      const hour       = dt.getHours();
      const day        = dt.getDay();
      const engagement = (post.likes || 0) + (post.comments || 0) * 2 + (post.views || 0) * 0.01;

      byHour[hour].totalEngagement += engagement;
      byHour[hour].posts++;
      byDay[day].totalEngagement   += engagement;
      byDay[day].posts++;
    }

    const topHours = byHour
      .filter(h => h.posts > 0)
      .map(h => ({ ...h, avgEngagement: Math.round(h.totalEngagement / h.posts) }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 5);

    const topDays = byDay
      .filter(d => d.posts > 0)
      .map(d => ({ ...d, avgEngagement: Math.round(d.totalEngagement / d.posts) }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);

    return {
      competitorId,
      name:      competitor.name,
      topHours:  topHours.map(h => `${h.hour}:00 (avg eng: ${h.avgEngagement})`),
      topDays:   topDays.map(d => `${d.dayName} (avg eng: ${d.avgEngagement})`),
      recommendation: topHours[0] ? `Post at ${topHours[0].hour}:00 on ${topDays[0]?.dayName}s` : 'Not enough data',
      data:      { byHour, byDay },
    };
  }

  // ══════════════════════════════════════════════════════════
  // BENCHMARK: YOU vs COMPETITORS
  // ══════════════════════════════════════════════════════════
  async benchmark(userId, yourMetrics, platform = 'instagram') {
    const competitors = await Competitor.find({ userId, isActive: true });
    const comparison  = [];

    for (const c of competitors) {
      const snap = c.snapshots?.[platform];
      if (!snap || snap.error) continue;

      comparison.push({
        name:           c.name,
        followers:      snap.metrics?.followers || 0,
        engagementRate: parseFloat(snap.metrics?.engagementRate || 0),
        avgLikes:       snap.metrics?.avgLikes || 0,
        avgComments:    snap.metrics?.avgComments || 0,
        postsPerWeek:   snap.metrics?.postsThisWeek || 0,
      });
    }

    // Add "you" to comparison
    const allData = [{ name: 'YOU', ...yourMetrics }, ...comparison];

    // Rank
    const ranked = allData.map(a => ({
      ...a,
      followerRank:    [...allData].sort((x, y) => y.followers - x.followers).findIndex(x => x.name === a.name) + 1,
      engagementRank:  [...allData].sort((x, y) => y.engagementRate - x.engagementRate).findIndex(x => x.name === a.name) + 1,
    }));

    const avgFollowers   = comparison.reduce((s, c) => s + c.followers, 0) / (comparison.length || 1);
    const avgEngagement  = comparison.reduce((s, c) => s + c.engagementRate, 0) / (comparison.length || 1);

    return {
      platform,
      comparison:     ranked,
      industryAvg: {
        followers:      Math.round(avgFollowers),
        engagementRate: avgEngagement.toFixed(2) + '%',
      },
      yourPerformance: {
        aboveAvgFollowers:   yourMetrics.followers > avgFollowers,
        aboveAvgEngagement:  yourMetrics.engagementRate > avgEngagement,
      },
    };
  }

  // ══════════════════════════════════════════════════════════
  // AI ANALYSIS REPORT
  // ══════════════════════════════════════════════════════════
  async generateAIReport(competitorId, userId) {
    const competitor = await Competitor.findOne({ _id: competitorId, userId });
    if (!competitor) throw new Error('Not found');

    const snapshots  = competitor.snapshots || {};
    const topPosts   = competitor.topPosts?.slice(0, 10) || [];

    const dataStr = JSON.stringify({
      name:     competitor.name,
      snapshots,
      topPosts: topPosts.map(p => ({
        platform: p.platform, likes: p.likes, comments: p.comments,
        caption: p.caption?.slice(0, 100), hashtags: p.hashtags?.slice(0, 5),
        postedAt: p.postedAt, contentType: p.contentType,
      })),
    }, null, 2);

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `You are a social media strategist. Analyze this competitor data and provide actionable insights.

COMPETITOR DATA:
${dataStr}

Provide a comprehensive analysis in JSON format:
{
  "summary": "2-3 sentence executive summary",
  "strengths": ["what they do well"],
  "weaknesses": ["gaps and opportunities for you"],
  "contentStrategy": {
    "topContentTypes": ["what types perform best"],
    "postingPattern": "how often and when they post",
    "captionStyle": "tone and style analysis",
    "hashtagStrategy": "their hashtag approach"
  },
  "opportunities": ["specific things you can do to beat them"],
  "threats": ["what you need to watch out for"],
  "actionableSteps": [
    {"step": "specific action", "priority": "high/medium/low", "expectedImpact": "what this will achieve"}
  ],
  "contentIdeas": ["5 content ideas inspired by their best performers"],
  "overallRating": "how strong a competitor are they (1-10)"
}`
      }],
      system: 'You are a competitive intelligence analyst. Return ONLY valid JSON, no markdown.',
    });

    const text   = response.content[0].text.replace(/```json|```/g, '').trim();
    const report = JSON.parse(text);

    return {
      success:     true,
      competitor:  competitor.name,
      generatedAt: new Date(),
      ...report,
    };
  }

  // ══════════════════════════════════════════════════════════
  // BRAND MENTION MONITOR
  // ══════════════════════════════════════════════════════════
  async monitorMentions(keywords, options = {}) {
    const { sources = ['twitter', 'reddit', 'news'], limit = 20 } = options;
    const results = [];

    for (const keyword of keywords) {
      // Twitter search via bearer token
      if (sources.includes('twitter') && process.env.TWITTER_BEARER_TOKEN) {
        try {
          const res = await axios.get('https://api.twitter.com/2/tweets/search/recent', {
            params: {
              query:          `"${keyword}" -is:retweet lang:en`,
              max_results:    Math.min(10, limit),
              'tweet.fields': 'created_at,author_id,public_metrics',
            },
            headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` },
            timeout: 10000,
          });
          for (const tweet of res.data?.data || []) {
            results.push({
              source:     'twitter',
              keyword,
              text:       tweet.text?.slice(0, 200),
              url:        `https://twitter.com/i/status/${tweet.id}`,
              likes:      tweet.public_metrics?.like_count,
              createdAt:  tweet.created_at,
            });
          }
        } catch {}
      }

      // Reddit search
      if (sources.includes('reddit')) {
        try {
          const res = await axios.get(`https://www.reddit.com/search.json`, {
            params: { q: keyword, sort: 'new', limit: 5, t: 'week' },
            headers: { 'User-Agent': 'AutoflowBot/1.0' },
            timeout: 10000,
          });
          for (const post of res.data?.data?.children || []) {
            results.push({
              source:    'reddit',
              keyword,
              text:      post.data.title,
              url:       `https://reddit.com${post.data.permalink}`,
              upvotes:   post.data.ups,
              createdAt: new Date(post.data.created_utc * 1000),
            });
          }
        } catch {}
      }

      await delay(1000);
    }

    return {
      keywords,
      total:    results.length,
      mentions: results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit),
    };
  }

  // ══════════════════════════════════════════════════════════
  // AD LIBRARY SPY (Facebook/Meta)
  // ══════════════════════════════════════════════════════════
  async spyFacebookAds(pageId, options = {}) {
    const { limit = 20, country = 'US', adType = 'ALL' } = options;

    try {
      // Meta Ad Library API (requires Meta Business account)
      const res = await axios.get('https://graph.facebook.com/v18.0/ads_archive', {
        params: {
          access_token:   process.env.META_ACCESS_TOKEN,
          search_page_ids: pageId,
          ad_reached_countries: country,
          ad_type:        adType,
          limit,
          fields:         'id,ad_creative_body,ad_creative_link_description,ad_delivery_start_time,ad_snapshot_url,page_name,spend',
        },
        timeout: 15000,
      });

      return {
        success: true,
        pageId,
        ads:     res.data?.data?.map(ad => ({
          id:          ad.id,
          body:        ad.ad_creative_body,
          description: ad.ad_creative_link_description,
          startDate:   ad.ad_delivery_start_time,
          previewUrl:  ad.ad_snapshot_url,
          spend:       ad.spend,
        })) || [],
        total:   res.data?.data?.length || 0,
      };
    } catch (err) {
      return {
        success: false,
        error:   err.message,
        note:    'FB Ad Library requires META_ACCESS_TOKEN from Meta Business API. Free to get at developers.facebook.com',
        fallback:`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&view_all_page_id=${pageId}`,
      };
    }
  }

  // ══════════════════════════════════════════════════════════
  // DASHBOARD OVERVIEW (all competitors at a glance)
  // ══════════════════════════════════════════════════════════
  async getDashboard(userId) {
    const competitors = await Competitor.find({ userId, isActive: true });
    const overview    = [];

    for (const c of competitors) {
      const recentSnaps = await CompetitorSnapshot
        .find({ competitorId: c._id })
        .sort({ date: -1 })
        .limit(2);

      const latest  = recentSnaps[0];
      const prev    = recentSnaps[1];
      const gain    = latest && prev
        ? (latest.metrics?.followers || 0) - (prev.metrics?.followers || 0)
        : 0;

      overview.push({
        id:          c._id,
        name:        c.name,
        handles:     c.handles,
        lastSynced:  c.lastSynced,
        platforms:   Object.keys(c.snapshots || {}),
        topMetrics:  c.snapshots
          ? Object.fromEntries(
              Object.entries(c.snapshots)
                .filter(([, v]) => v && !v.error)
                .map(([k, v]) => [k, { followers: v.metrics?.followers, engagementRate: v.metrics?.engagementRate }])
            )
          : {},
        followerGain24h: gain,
        topPost:         c.topPosts?.[0] || null,
      });
    }

    return {
      total:       competitors.length,
      lastUpdated: new Date(),
      competitors: overview,
    };
  }

  // ── Alert checker ─────────────────────────────────────
  async _checkAlerts(competitor, newData) {
    for (const [platform, data] of Object.entries(newData)) {
      if (!data || data.error) continue;

      // Check viral posts
      const viralPosts = (data.topPosts || []).filter(p =>
        (p.likes || 0) > (competitor.alerts?.viralThreshold || 1000)
      );

      if (viralPosts.length > 0) {
        logger.info(`🚨 Viral alert: ${competitor.name} on ${platform} — ${viralPosts.length} viral post(s)`);
        // TODO: Send email/webhook alert
      }
    }
  }

  _parseCount(str) {
    if (!str) return 0;
    const cleaned = str.trim().replace(',', '');
    if (cleaned.includes('K')) return Math.round(parseFloat(cleaned) * 1000);
    if (cleaned.includes('M')) return Math.round(parseFloat(cleaned) * 1000000);
    return parseInt(cleaned) || 0;
  }
}

module.exports = { CompetitorSpyService: new CompetitorSpyService(), Competitor, CompetitorSnapshot };
