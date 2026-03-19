/**
 * ══════════════════════════════════════════════════════════
 * INSTAGRAM SERVICE — Unofficial API
 * Features: DM bulk sender, auto follow/unfollow, auto like,
 *           comment, story view, hashtag scraper, follower steal
 * Uses: instagram-private-api
 * ══════════════════════════════════════════════════════════
 */

const { IgApiClient, IgLoginTwoFactorRequiredError } = require('instagram-private-api');
const Bluebird = require('bluebird');
const logger   = require('../utils/logger');
const { delay, randomDelay, personalizeText } = require('../utils/helpers');
const { Account, MessageLog, Contact } = require('../models');

class InstagramService {
  constructor() {
    this.clients = new Map(); // accountId → IgApiClient
  }

  // ── Login and create session ────────────────────────────
  async login(accountId, username, password) {
    const ig = new IgApiClient();
    ig.state.generateDevice(username);

    // Simulate mobile device
    ig.request.end$.subscribe(async () => {
      const serialized = await ig.state.serialize();
      delete serialized.constants;
      // Save session to Account in DB
      await Account.findByIdAndUpdate(accountId, {
        'credentials.sessionData': serialized,
        status: 'active',
        lastActive: new Date(),
      });
    });

    try {
      await ig.simulate.preLoginFlow();
      const user = await ig.account.login(username, password);
      await ig.simulate.postLoginFlow();

      this.clients.set(accountId, ig);
      logger.info(`✅ Instagram logged in: ${username}`);
      return { success: true, userId: user.pk, username: user.username };

    } catch (err) {
      if (err instanceof IgLoginTwoFactorRequiredError) {
        return { success: false, requires2FA: true, message: '2FA required — check your phone' };
      }
      logger.error(`Instagram login failed for ${username}: ${err.message}`);
      throw err;
    }
  }

  // ── Restore saved session ───────────────────────────────
  async restoreSession(accountId) {
    const account = await Account.findById(accountId).select('+credentials');
    if (!account?.credentials?.sessionData) return false;

    const ig = new IgApiClient();
    ig.state.generateDevice(account.credentials.username);
    await ig.state.deserialize(account.credentials.sessionData);

    this.clients.set(accountId, ig);
    return true;
  }

  // ── Get or restore client ───────────────────────────────
  async getClient(accountId) {
    if (this.clients.has(accountId)) return this.clients.get(accountId);
    const restored = await this.restoreSession(accountId);
    if (!restored) throw new Error(`Instagram not logged in for account ${accountId}`);
    return this.clients.get(accountId);
  }

  // ── Send DM to single user ──────────────────────────────
  async sendDM(accountId, username, message) {
    const ig = await this.getClient(accountId);

    try {
      // Get user ID from username
      const userId = await ig.user.getIdByUsername(username);

      // Get or create thread
      const thread = ig.entity.directThread([userId.toString()]);
      await thread.broadcastText(message);

      logger.info(`IG DM sent to ${username}`);
      return { success: true, username, status: 'sent' };
    } catch (err) {
      logger.error(`IG DM failed to ${username}: ${err.message}`);
      throw err;
    }
  }

  // ── Bulk DM sender with anti-ban delays ─────────────────
  async sendBulkDM(accountId, targets, messageTemplate, options = {}) {
    const {
      delayMin   = 15000,  // 15 seconds min (Instagram is strict)
      delayMax   = 45000,  // 45 seconds max
      maxPerHour = 20,
      userId,
      campaignId,
    } = options;

    const results = { sent: 0, failed: 0, skipped: 0, errors: [] };
    let hourlySent = 0;
    let hourStart  = Date.now();

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];

      // Hourly rate limit check
      if (hourlySent >= maxPerHour) {
        const elapsed  = Date.now() - hourStart;
        const waitTime = Math.max(0, 3600000 - elapsed);
        logger.info(`IG hourly limit reached. Waiting ${Math.round(waitTime/60000)} minutes...`);
        await delay(waitTime);
        hourlySent = 0;
        hourStart  = Date.now();
      }

      try {
        const personalized = personalizeText(messageTemplate, {
          name:     target.name || target.username || 'Friend',
          username: target.username || '',
          ...options.variables,
        });

        await this.sendDM(accountId, target.username, personalized);

        await MessageLog.create({
          userId, campaignId,
          platform: 'instagram',
          to:       target.username,
          body:     personalized,
          status:   'sent',
        });

        results.sent++;
        hourlySent++;

        // Anti-ban: longer random delay
        const waitMs = randomDelay(delayMin, delayMax);
        logger.debug(`IG anti-ban delay: ${Math.round(waitMs/1000)}s`);
        await delay(waitMs);

        // Extra long pause every 10 messages
        if (results.sent % 10 === 0) {
          logger.info('IG taking a longer break (every 10 msgs)...');
          await delay(randomDelay(120000, 300000)); // 2-5 min
        }

      } catch (err) {
        results.failed++;
        results.errors.push({ username: target.username, error: err.message });

        // If rate limited, wait longer
        if (err.message.includes('feedback_required') || err.message.includes('429')) {
          logger.warn('Instagram rate limit hit! Cooling down for 30 minutes...');
          await delay(1800000);
        }
      }
    }

    return results;
  }

  // ── Auto follow users ───────────────────────────────────
  async autoFollow(accountId, usernames, options = {}) {
    const ig = await this.getClient(accountId);
    const { delayMin = 10000, delayMax = 30000, maxPerDay = 50 } = options;
    const results = { followed: 0, failed: 0 };

    for (let i = 0; i < Math.min(usernames.length, maxPerDay); i++) {
      try {
        const userId = await ig.user.getIdByUsername(usernames[i]);
        await ig.friendship.create(userId);
        results.followed++;
        await delay(randomDelay(delayMin, delayMax));
      } catch (err) {
        results.failed++;
        if (err.message.includes('feedback_required')) {
          await delay(300000); // 5 min cooldown
        }
      }
    }
    return results;
  }

  // ── Auto unfollow (non-followers) ───────────────────────
  async autoUnfollow(accountId, options = {}) {
    const ig = await this.getClient(accountId);
    const { maxPerSession = 20, delayMin = 15000, delayMax = 40000 } = options;

    const following  = await this.getAllFollowing(accountId);
    const followers  = await this.getAllFollowers(accountId);
    const followerSet = new Set(followers.map(f => f.pk));

    const toUnfollow = following.filter(u => !followerSet.has(u.pk)).slice(0, maxPerSession);
    const results = { unfollowed: 0, failed: 0 };

    for (const user of toUnfollow) {
      try {
        await ig.friendship.destroy(user.pk);
        results.unfollowed++;
        await delay(randomDelay(delayMin, delayMax));
      } catch (err) {
        results.failed++;
      }
    }
    return results;
  }

  // ── Get all followers ───────────────────────────────────
  async getAllFollowers(accountId, targetUsername) {
    const ig      = await this.getClient(accountId);
    const userId  = targetUsername
      ? await ig.user.getIdByUsername(targetUsername)
      : (await ig.account.currentUser()).pk;

    const followersFeed = ig.feed.accountFollowers(userId);
    const followers = [];
    let page;

    do {
      page = await followersFeed.items();
      followers.push(...page);
      if (page.length > 0) await delay(randomDelay(2000, 5000));
    } while (followersFeed.isMoreAvailable());

    return followers;
  }

  // ── Get all following ───────────────────────────────────
  async getAllFollowing(accountId, targetUsername) {
    const ig     = await this.getClient(accountId);
    const userId = targetUsername
      ? await ig.user.getIdByUsername(targetUsername)
      : (await ig.account.currentUser()).pk;

    const followingFeed = ig.feed.accountFollowing(userId);
    const following = [];
    let page;

    do {
      page = await followingFeed.items();
      following.push(...page);
      if (page.length > 0) await delay(randomDelay(2000, 5000));
    } while (followingFeed.isMoreAvailable());

    return following;
  }

  // ── Scrape users by hashtag ─────────────────────────────
  async scrapeByHashtag(accountId, hashtag, limit = 100) {
    const ig   = await this.getClient(accountId);
    const feed = ig.feed.tag(hashtag);
    const users = [];
    const seen  = new Set();

    while (users.length < limit && feed.isMoreAvailable()) {
      const posts = await feed.items();
      for (const post of posts) {
        const user = post.user;
        if (!seen.has(user.pk)) {
          seen.add(user.pk);
          users.push({
            pk:         user.pk,
            username:   user.username,
            fullName:   user.full_name,
            isPrivate:  user.is_private,
            profilePic: user.profile_pic_url,
          });
        }
      }
      await delay(randomDelay(3000, 8000));
    }

    return users.slice(0, limit);
  }

  // ── Steal competitor followers ──────────────────────────
  async scrapeCompetitorFollowers(accountId, competitorUsername, limit = 200) {
    const followers = await this.getAllFollowers(accountId, competitorUsername);
    return followers.slice(0, limit).map(u => ({
      pk:       u.pk,
      username: u.username,
      fullName: u.full_name,
      isPrivate: u.is_private,
    }));
  }

  // ── Auto like posts by hashtag ──────────────────────────
  async autoLikeByHashtag(accountId, hashtag, options = {}) {
    const ig = await this.getClient(accountId);
    const { limit = 20, delayMin = 8000, delayMax = 25000 } = options;
    const feed   = ig.feed.tag(hashtag);
    const posts  = await feed.items();
    const results = { liked: 0, failed: 0 };

    for (const post of posts.slice(0, limit)) {
      try {
        await ig.media.like({ mediaId: post.id, moduleInfo: { module_name: 'feed_timeline' }, d: 0 });
        results.liked++;
        await delay(randomDelay(delayMin, delayMax));
      } catch (err) {
        results.failed++;
        if (err.message.includes('feedback_required')) await delay(300000);
      }
    }
    return results;
  }

  // ── Auto comment ────────────────────────────────────────
  async autoComment(accountId, mediaIds, comments, options = {}) {
    const ig = await this.getClient(accountId);
    const { delayMin = 30000, delayMax = 90000 } = options;
    const results = { commented: 0, failed: 0 };

    for (const mediaId of mediaIds) {
      const comment = comments[Math.floor(Math.random() * comments.length)];
      try {
        await ig.media.comment({ mediaId, text: comment });
        results.commented++;
        await delay(randomDelay(delayMin, delayMax));
      } catch (err) {
        results.failed++;
        if (err.message.includes('feedback_required')) await delay(600000);
      }
    }
    return results;
  }

  // ── Auto view stories ───────────────────────────────────
  async autoViewStories(accountId, userIds) {
    const ig = await this.getClient(accountId);
    const results = { viewed: 0, failed: 0 };

    for (const userId of userIds) {
      try {
        const reel = await ig.feed.reelsTray().items();
        const userReel = reel.find(r => r.id === userId);
        if (userReel?.items?.length) {
          await ig.story.seen(userReel.items);
          results.viewed++;
        }
        await delay(randomDelay(2000, 6000));
      } catch (err) {
        results.failed++;
      }
    }
    return results;
  }

  // ── Upload post ─────────────────────────────────────────
  async uploadPost(accountId, imagePath, caption) {
    const ig  = await this.getClient(accountId);
    const fs  = require('fs');
    const img = fs.readFileSync(imagePath);

    const result = await ig.publish.photo({ file: img, caption });
    return { success: true, mediaId: result.media.id, caption };
  }

  // ── Upload reel ─────────────────────────────────────────
  async uploadReel(accountId, videoPath, caption) {
    const ig    = await this.getClient(accountId);
    const fs    = require('fs');
    const video = fs.readFileSync(videoPath);

    const result = await ig.publish.video({ video, caption });
    return { success: true, mediaId: result.media.id };
  }
}

module.exports = new InstagramService();
