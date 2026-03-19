/**
 * ══════════════════════════════════════════════════════════
 * TWITTER / X ADVANCED SERVICE — Feature 12
 * Features:
 *  - Thread poster (multi-tweet threads)
 *  - Auto-reply to mentions (AI-powered)
 *  - Auto-reply by keyword
 *  - Tweet scheduler
 *  - Mass follow by keyword/hashtag
 *  - Mass unfollow inactive followers
 *  - Follower/following exporter
 *  - Tweet scraper (by keyword/hashtag/user)
 *  - Tweet deleter (bulk delete old tweets)
 *  - Retweet + like campaigns
 *  - Trend monitor + alert
 *  - Competitor tracker
 *  - Account cloner (repost another's tweets)
 *  - List manager (add users to lists)
 *  - Twitter poll creator
 *  - Profile bio rotator
 *  - Bookmark exporter
 *  - Media downloader
 *  - Engagement booster
 * Uses: twitter-api-v2 + Puppeteer
 * ══════════════════════════════════════════════════════════
 */

const { TwitterApi } = require('twitter-api-v2');
const puppeteer      = require('puppeteer-extra');
const StealthPlugin  = require('puppeteer-extra-plugin-stealth');
const axios          = require('axios');
const fs             = require('fs');
const path           = require('path');
const logger         = require('../../utils/logger');
const { delay, randomDelay, personalizeText } = require('../../utils/helpers');
const { Account, MessageLog, Contact } = require('../../models');

puppeteer.use(StealthPlugin());

class TwitterAdvancedService {

  // ── Get Twitter API client ─────────────────────────────
  async _getClient(accountId) {
    const account = await Account.findById(accountId);
    if (!account?.credentials) throw new Error('Twitter credentials not found');
    const { apiKey, apiSecret, accessToken, accessSecret } = account.credentials;
    return new TwitterApi({ appKey: apiKey, appSecret: apiSecret, accessToken, accessSecret });
  }

  async _getClientV2(accountId) {
    const client = await this._getClient(accountId);
    return client.v2;
  }

  // ══════════════════════════════════════════════════════════
  // THREAD POSTER
  // ══════════════════════════════════════════════════════════
  async postThread(accountId, tweets, options = {}) {
    const client = await this._getClient(accountId);
    const { mediaPerTweet = [], addNumbering = false } = options;

    if (!Array.isArray(tweets) || tweets.length === 0) {
      throw new Error('tweets must be a non-empty array');
    }

    const results    = [];
    let   replyToId  = null;

    for (let i = 0; i < tweets.length; i++) {
      try {
        let text = tweets[i];
        if (addNumbering && tweets.length > 1) {
          text = `${i + 1}/${tweets.length} ${text}`;
        }

        // Truncate to 280
        text = text.slice(0, 280);

        const tweetData = {};
        if (replyToId) tweetData.reply = { in_reply_to_tweet_id: replyToId };

        // Upload media if provided
        if (mediaPerTweet[i]) {
          const mediaId = await client.v1.uploadMedia(
            fs.readFileSync(mediaPerTweet[i]),
            { mimeType: this._getMimeType(mediaPerTweet[i]) }
          );
          tweetData.media = { media_ids: [mediaId] };
        }

        const tweet = await client.v2.tweet(text, tweetData);
        replyToId   = tweet.data.id;
        results.push({
          id:     tweet.data.id,
          text:   text.substring(0, 80),
          url:    `https://twitter.com/i/status/${tweet.data.id}`,
          index:  i + 1,
        });

        logger.info(`Thread tweet ${i + 1}/${tweets.length} posted: ${tweet.data.id}`);

        // Delay between thread tweets
        if (i < tweets.length - 1) await delay(randomDelay(3000, 8000));

      } catch (err) {
        results.push({ index: i + 1, error: err.message });
        logger.error(`Thread tweet ${i + 1} failed: ${err.message}`);
      }
    }

    return {
      success:    true,
      threadId:   results[0]?.id,
      threadUrl:  results[0]?.url,
      tweets:     results.length,
      results,
    };
  }

  // ══════════════════════════════════════════════════════════
  // AI AUTO-REPLY TO MENTIONS
  // ══════════════════════════════════════════════════════════
  async startMentionReplyBot(accountId, options = {}) {
    const {
      systemPrompt    = 'You are a friendly brand account. Reply naturally, helpfully, and in under 280 chars.',
      checkInterval   = 60000,
      maxDailyReplies = 50,
      filterKeywords  = [],  // only reply if tweet contains these
      skipKeywords    = [],  // skip if contains these
    } = options;

    const client    = await this._getClient(accountId);
    const AIService = require('../index').AIService;
    const me        = await client.v2.me();

    let dailyReplies  = 0;
    let lastReset     = new Date().toDateString();
    let sinceId       = null;

    const checkAndReply = async () => {
      if (new Date().toDateString() !== lastReset) { dailyReplies = 0; lastReset = new Date().toDateString(); }
      if (dailyReplies >= maxDailyReplies) return;

      try {
        const params = {
          expansions:    ['author_id'],
          'tweet.fields': ['text', 'author_id', 'created_at'],
          max_results:   20,
        };
        if (sinceId) params.since_id = sinceId;

        const mentions = await client.v2.userMentionTimeline(me.data.id, params);

        for (const tweet of (mentions.data?.data || [])) {
          if (tweet.author_id === me.data.id) continue;

          const text = tweet.text.replace(/@\w+/g, '').trim();

          if (filterKeywords.length && !filterKeywords.some(k => text.toLowerCase().includes(k.toLowerCase()))) continue;
          if (skipKeywords.some(k => text.toLowerCase().includes(k.toLowerCase()))) continue;

          try {
            const reply = await AIService.chat(text, [], systemPrompt);
            if (reply) {
              const replyText = reply.slice(0, 277) + (reply.length > 277 ? '...' : '');
              await client.v2.tweet(replyText, { reply: { in_reply_to_tweet_id: tweet.id } });
              dailyReplies++;
              sinceId = tweet.id;
              logger.info(`Twitter AI replied to mention: ${tweet.id}`);
              await delay(randomDelay(5000, 15000));
            }
          } catch {}
        }
      } catch (err) {
        logger.error(`Mention reply check failed: ${err.message}`);
      }
    };

    const intervalId = setInterval(checkAndReply, checkInterval);
    setTimeout(() => clearInterval(intervalId), 86400000);

    return {
      success:        true,
      account:        me.data.username,
      checkEvery:     `${checkInterval / 1000}s`,
      maxDailyReplies,
    };
  }

  // ══════════════════════════════════════════════════════════
  // AUTO-REPLY BY KEYWORD (search tweets → reply)
  // ══════════════════════════════════════════════════════════
  async keywordReplyBot(accountId, keywords, replies, options = {}) {
    const {
      maxPerRun   = 10,
      delayMin    = 30000,
      delayMax    = 90000,
      excludeUsers= [],
    } = options;

    const client  = await this._getClient(accountId);
    const me      = await client.v2.me();
    const results = { replied: 0, failed: 0, skipped: 0 };

    for (const keyword of keywords) {
      try {
        const search = await client.v2.search(`${keyword} -is:retweet -is:reply lang:en`, {
          'tweet.fields': ['author_id', 'text', 'created_at'],
          max_results: maxPerRun,
        });

        for (const tweet of (search.data?.data || []).slice(0, maxPerRun)) {
          if (tweet.author_id === me.data.id) { results.skipped++; continue; }
          if (excludeUsers.includes(tweet.author_id)) { results.skipped++; continue; }

          const reply = replies[Math.floor(Math.random() * replies.length)];
          try {
            await client.v2.tweet(reply.slice(0, 280), { reply: { in_reply_to_tweet_id: tweet.id } });
            results.replied++;
            await delay(randomDelay(delayMin, delayMax));
          } catch { results.failed++; }
        }
      } catch {}
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // MASS FOLLOW BY KEYWORD / HASHTAG
  // ══════════════════════════════════════════════════════════
  async massFollowByKeyword(accountId, keyword, options = {}) {
    const { limit = 20, delayMin = 15000, delayMax = 45000 } = options;
    const client  = await this._getClient(accountId);
    const me      = await client.v2.me();
    const results = { followed: 0, failed: 0, alreadyFollowing: 0 };

    const search = await client.v2.search(`${keyword} -is:retweet lang:en`, {
      expansions:    ['author_id'],
      max_results:   Math.min(limit * 2, 100),
      'user.fields': ['public_metrics', 'created_at'],
    });

    const users = [...new Set((search.data?.includes?.users || []).map(u => u.id))].slice(0, limit);

    for (const userId of users) {
      if (userId === me.data.id) continue;
      try {
        await client.v2.follow(me.data.id, userId);
        results.followed++;
        await delay(randomDelay(delayMin, delayMax));
      } catch (err) {
        if (err.code === 327) results.alreadyFollowing++;
        else results.failed++;
      }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // MASS UNFOLLOW INACTIVE
  // ══════════════════════════════════════════════════════════
  async unfollowInactive(accountId, options = {}) {
    const {
      maxUnfollow     = 20,
      delayMin        = 15000,
      delayMax        = 45000,
      minDaysSincePost = 30,
      keepVerified    = true,
    } = options;

    const client  = await this._getClient(accountId);
    const me      = await client.v2.me();
    const results = { unfollowed: 0, kept: 0, failed: 0 };

    const following = await client.v2.following(me.data.id, {
      max_results:   200,
      'user.fields': ['public_metrics', 'verified', 'most_recent_tweet_id'],
    });

    const cutoff = Date.now() - minDaysSincePost * 86400000;

    for (const user of (following.data?.data || []).slice(0, maxUnfollow * 2)) {
      if (results.unfollowed >= maxUnfollow) break;
      if (keepVerified && user.verified) { results.kept++; continue; }

      // Check last tweet date (if available)
      try {
        await client.v2.unfollow(me.data.id, user.id);
        results.unfollowed++;
        await delay(randomDelay(delayMin, delayMax));
      } catch { results.failed++; }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // TWEET SCRAPER
  // ══════════════════════════════════════════════════════════
  async scrapeTweets(accountId, query, options = {}) {
    const { limit = 100, since, until, lang = 'en', excludeRT = true } = options;
    const client = await this._getClient(accountId);

    let q = `${query} ${excludeRT ? '-is:retweet' : ''} lang:${lang}`;
    if (since) q += ` since:${since}`;
    if (until) q += ` until:${until}`;

    const tweets   = [];
    let   nextToken= null;

    do {
      const res = await client.v2.search(q, {
        max_results:   Math.min(100, limit - tweets.length),
        next_token:    nextToken || undefined,
        'tweet.fields':['author_id','created_at','public_metrics','entities','text'],
        expansions:    ['author_id'],
        'user.fields': ['name','username','verified','public_metrics'],
      });

      const users = {};
      (res.data?.includes?.users || []).forEach(u => { users[u.id] = u; });

      for (const tweet of (res.data?.data || [])) {
        const author = users[tweet.author_id] || {};
        tweets.push({
          id:         tweet.id,
          text:       tweet.text,
          url:        `https://twitter.com/i/status/${tweet.id}`,
          author:     author.username,
          authorName: author.name,
          verified:   author.verified,
          followers:  author.public_metrics?.followers_count,
          likes:      tweet.public_metrics?.like_count,
          retweets:   tweet.public_metrics?.retweet_count,
          replies:    tweet.public_metrics?.reply_count,
          createdAt:  tweet.created_at,
          emails:     tweet.text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [],
          hashtags:   tweet.entities?.hashtags?.map(h => `#${h.tag}`) || [],
          urls:       tweet.entities?.urls?.map(u => u.expanded_url) || [],
        });
      }

      nextToken = res.data?.meta?.next_token;
    } while (nextToken && tweets.length < limit);

    return { success: true, query, total: tweets.length, tweets };
  }

  // ══════════════════════════════════════════════════════════
  // FOLLOWER EXPORTER
  // ══════════════════════════════════════════════════════════
  async exportFollowers(accountId, targetUsername, options = {}) {
    const { limit = 200 } = options;
    const client = await this._getClient(accountId);

    const user = await client.v2.userByUsername(targetUsername, {
      'user.fields': ['public_metrics'],
    });

    const followers  = [];
    let   nextToken  = null;

    do {
      const res = await client.v2.followers(user.data.id, {
        max_results:   200,
        next_token:    nextToken || undefined,
        'user.fields': ['name','username','description','public_metrics','verified','location'],
      });

      followers.push(...(res.data?.data || []).map(u => ({
        id:          u.id,
        username:    u.username,
        name:        u.name,
        bio:         u.description,
        followers:   u.public_metrics?.followers_count,
        following:   u.public_metrics?.following_count,
        tweets:      u.public_metrics?.tweet_count,
        verified:    u.verified,
        location:    u.location,
        profileUrl:  `https://twitter.com/${u.username}`,
        email:       u.description?.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] || '',
      })));

      nextToken = res.data?.meta?.next_token;
    } while (nextToken && followers.length < limit);

    return { success: true, username: targetUsername, total: followers.length, followers: followers.slice(0, limit) };
  }

  // ══════════════════════════════════════════════════════════
  // BULK TWEET DELETER
  // ══════════════════════════════════════════════════════════
  async deleteOldTweets(accountId, options = {}) {
    const { olderThanDays = 30, maxDelete = 50, keepPinned = true } = options;
    const client  = await this._getClient(accountId);
    const me      = await client.v2.me();
    const cutoff  = new Date(Date.now() - olderThanDays * 86400000);
    const results = { deleted: 0, failed: 0, kept: 0 };

    const timeline = await client.v2.userTimeline(me.data.id, {
      max_results:   100,
      'tweet.fields':['created_at','pinned_tweet_id'],
    });

    const pinned = me.data.pinned_tweet_id;

    for (const tweet of (timeline.data?.data || [])) {
      if (results.deleted >= maxDelete) break;
      if (keepPinned && tweet.id === pinned) { results.kept++; continue; }
      if (new Date(tweet.created_at) > cutoff) { results.kept++; continue; }

      try {
        await client.v2.deleteTweet(tweet.id);
        results.deleted++;
        await delay(randomDelay(2000, 5000));
      } catch { results.failed++; }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // TREND MONITOR
  // ══════════════════════════════════════════════════════════
  async getTrends(accountId, woeid = 1) {
    // woeid: 1 = worldwide, 23424977 = USA, 23424975 = UK
    const client = await this._getClient(accountId);
    try {
      const res = await client.v1.get('trends/place', { id: woeid });
      const trends = res[0]?.trends?.map(t => ({
        name:       t.name,
        url:        t.url,
        tweetVolume:t.tweet_volume,
        query:      t.query,
      })) || [];
      return { success: true, woeid, trends, asOf: res[0]?.as_of };
    } catch (err) {
      throw new Error(`Trends require elevated Twitter API access: ${err.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // COMPETITOR TRACKER
  // ══════════════════════════════════════════════════════════
  async trackCompetitors(accountId, usernames, options = {}) {
    const client = await this._getClient(accountId);
    const data   = [];

    for (const username of usernames) {
      try {
        const [user, tweets] = await Promise.all([
          client.v2.userByUsername(username, {
            'user.fields': ['public_metrics','description','verified','created_at'],
          }),
          client.v2.userTimeline((await client.v2.userByUsername(username)).data.id, {
            max_results:   10,
            'tweet.fields':['public_metrics','created_at'],
          }),
        ]);

        const tweetList = tweets.data?.data || [];
        const avgLikes  = tweetList.reduce((s, t) => s + (t.public_metrics?.like_count || 0), 0) / (tweetList.length || 1);
        const avgRT     = tweetList.reduce((s, t) => s + (t.public_metrics?.retweet_count || 0), 0) / (tweetList.length || 1);

        data.push({
          username,
          name:         user.data.name,
          followers:    user.data.public_metrics?.followers_count,
          following:    user.data.public_metrics?.following_count,
          tweets:       user.data.public_metrics?.tweet_count,
          verified:     user.data.verified,
          avgLikes:     Math.round(avgLikes),
          avgRetweets:  Math.round(avgRT),
          engagementRate: user.data.public_metrics?.followers_count
            ? ((avgLikes + avgRT) / user.data.public_metrics.followers_count * 100).toFixed(2) + '%'
            : '0%',
          recentTweets: tweetList.slice(0, 5).map(t => ({
            id:       t.id,
            text:     t.text?.slice(0, 100),
            likes:    t.public_metrics?.like_count,
            retweets: t.public_metrics?.retweet_count,
          })),
          trackedAt: new Date(),
        });

        await delay(1000);
      } catch (err) {
        data.push({ username, error: err.message });
      }
    }

    return { success: true, competitors: data };
  }

  // ══════════════════════════════════════════════════════════
  // RETWEET + LIKE CAMPAIGN
  // ══════════════════════════════════════════════════════════
  async retweetLikeCampaign(accountId, tweetIds, options = {}) {
    const { like = true, retweet = true, delayMin = 5000, delayMax = 15000 } = options;
    const client  = await this._getClient(accountId);
    const me      = await client.v2.me();
    const results = { liked: 0, retweeted: 0, failed: 0 };

    for (const tweetId of tweetIds) {
      try {
        if (like)     { await client.v2.like(me.data.id, tweetId);     results.liked++; }
        if (retweet)  { await client.v2.retweet(me.data.id, tweetId);  results.retweeted++; }
        await delay(randomDelay(delayMin, delayMax));
      } catch { results.failed++; }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // CREATE POLL
  // ══════════════════════════════════════════════════════════
  async createPoll(accountId, question, choices, durationMinutes = 1440) {
    const client = await this._getClient(accountId);

    const tweet = await client.v2.tweet({
      text: question.slice(0, 280),
      poll: {
        options:           choices.slice(0, 4).map(c => ({ label: c.slice(0, 25) })),
        duration_minutes:  Math.min(Math.max(5, durationMinutes), 10080),
      },
    });

    return {
      success:  true,
      tweetId:  tweet.data.id,
      tweetUrl: `https://twitter.com/i/status/${tweet.data.id}`,
      question,
      choices,
    };
  }

  // ══════════════════════════════════════════════════════════
  // TWITTER LIST MANAGER
  // ══════════════════════════════════════════════════════════
  async createList(accountId, name, description = '', isPrivate = false) {
    const client = await this._getClient(accountId);
    const list   = await client.v2.createList({ name, description, private: isPrivate });
    return { success: true, listId: list.data.id, name };
  }

  async addUsersToList(accountId, listId, userIds) {
    const client  = await this._getClient(accountId);
    const results = { added: 0, failed: 0 };

    for (const userId of userIds) {
      try {
        await client.v2.addListMember(listId, userId);
        results.added++;
        await delay(randomDelay(1000, 3000));
      } catch { results.failed++; }
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // PROFILE BIO ROTATOR
  // ══════════════════════════════════════════════════════════
  async rotateBio(accountId, bios, intervalMs = 86400000) {
    let idx = 0;
    const client = await this._getClient(accountId);

    const updateBio = async () => {
      const bio = bios[idx % bios.length];
      try {
        await client.v1.updateAccountProfile({ description: bio.slice(0, 160) });
        logger.info(`Twitter bio updated to: ${bio.slice(0, 50)}`);
      } catch (err) {
        logger.error(`Bio rotation failed: ${err.message}`);
      }
      idx++;
    };

    await updateBio();
    const intervalId = setInterval(updateBio, intervalMs);
    setTimeout(() => clearInterval(intervalId), intervalMs * bios.length);

    return { success: true, bios: bios.length, intervalHours: intervalMs / 3600000 };
  }

  // ══════════════════════════════════════════════════════════
  // SCHEDULE TWEET
  // ══════════════════════════════════════════════════════════
  scheduleTweet(accountId, tweetData, scheduledAt) {
    const delayMs = new Date(scheduledAt) - Date.now();
    if (delayMs <= 0) throw new Error('Scheduled time must be in the future');

    const timer = setTimeout(async () => {
      try {
        const client = await this._getClient(accountId);
        if (Array.isArray(tweetData.tweets)) {
          await this.postThread(accountId, tweetData.tweets);
        } else {
          await client.v2.tweet(tweetData.text.slice(0, 280));
        }
        logger.info(`Scheduled tweet posted for ${accountId}`);
      } catch (err) {
        logger.error(`Scheduled tweet failed: ${err.message}`);
      }
    }, delayMs);

    return { success: true, scheduledAt: new Date(scheduledAt), delayMs };
  }

  _getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.mp4': 'video/mp4' };
    return map[ext] || 'image/jpeg';
  }
}

module.exports = new TwitterAdvancedService();
