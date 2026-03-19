/**
 * ══════════════════════════════════════════════════════════
 * INSTAGRAM STORY SERVICE — Feature 2
 * Features:
 *  - Post image/video stories
 *  - AI-generated story images with text overlay
 *  - Story with stickers, polls, questions, countdowns
 *  - Story link (swipe-up / link sticker)
 *  - Highlight manager (create/add/remove)
 *  - Story scheduler
 *  - Story viewer + reactor
 *  - Story reply bot (AI)
 *  - Close friends stories
 *  - Story sequence (multi-story campaign)
 * ══════════════════════════════════════════════════════════
 */

const fs     = require('fs');
const path   = require('path');
const sharp  = require('sharp');
const logger = require('../../utils/logger');
const { delay, randomDelay, personalizeText } = require('../../utils/helpers');

// Story canvas dimensions
const STORY_W = 1080;
const STORY_H = 1920;

class InstagramStoryService {

  // ══════════════════════════════════════════════════════════
  // POST IMAGE STORY
  // ══════════════════════════════════════════════════════════
  async postImageStory(accountId, imagePath, options = {}) {
    const IGService = require('../instagram.service');
    const ig        = await IGService.getClient(accountId);

    // Resize image to story format
    const resized = await this._resizeForStory(imagePath);

    const publishConfig = {
      file: fs.readFileSync(resized),
    };

    // Add story stickers if provided
    if (options.stickers?.length) {
      publishConfig.story_sticker_ids = options.stickers;
    }

    const result = await ig.publish.story(publishConfig);
    this._cleanup(resized);

    logger.info(`✅ IG story posted for ${accountId}`);
    return {
      success:  true,
      mediaId:  result.media.id,
      type:     'image',
      expiresAt: new Date(Date.now() + 24 * 3600000),
    };
  }

  // ══════════════════════════════════════════════════════════
  // POST VIDEO STORY
  // ══════════════════════════════════════════════════════════
  async postVideoStory(accountId, videoPath, options = {}) {
    const IGService = require('../instagram.service');
    const ig        = await IGService.getClient(accountId);

    // Process video with ffmpeg
    const processed = await this._processVideoForStory(videoPath);

    const result = await ig.publish.video({
      video:   fs.readFileSync(processed),
      caption: options.caption || '',
    });

    this._cleanup(processed);

    return { success: true, mediaId: result.media.id, type: 'video' };
  }

  // ══════════════════════════════════════════════════════════
  // AI-GENERATED STORY WITH TEXT OVERLAY
  // ══════════════════════════════════════════════════════════
  async postAIStory(accountId, options = {}) {
    const {
      prompt,
      text,            // overlay text
      textPosition = 'center',  // top/center/bottom
      textColor    = '#FFFFFF',
      fontSize     = 72,
      backgroundColor,
      style        = 'photorealistic',
      caption      = '',
    } = options;

    // 1. Generate AI background image
    const AIImageService = require('../ai-image.service');
    const aiImage = await AIImageService.generate(
      prompt || 'beautiful gradient background for instagram story',
      { width: STORY_W, height: STORY_H }
    );

    // 2. Add text overlay with sharp
    let finalPath = aiImage.filepath;
    if (text) {
      finalPath = await this._addTextOverlay(aiImage.filepath, text, {
        position: textPosition,
        color:    textColor,
        fontSize,
      });
    }

    // 3. Post story
    const result = await this.postImageStory(accountId, finalPath, { caption });
    this._cleanup(finalPath);

    return { ...result, aiPrompt: prompt, overlayText: text };
  }

  // ══════════════════════════════════════════════════════════
  // POST STORY WITH POLL
  // ══════════════════════════════════════════════════════════
  async postPollStory(accountId, imagePath, pollConfig) {
    const IGService = require('../instagram.service');
    const ig        = await IGService.getClient(accountId);
    const { question, option1 = 'Yes', option2 = 'No' } = pollConfig;

    const resized = await this._resizeForStory(imagePath);

    // IG story polls via puppeteer (private API doesn't fully support stickers)
    const result = await ig.publish.story({
      file: fs.readFileSync(resized),
      story_polls: [{
        x: 0.5, y: 0.5,
        width: 0.6, height: 0.25,
        rotation: 0,
        question,
        tallies: [{ text: option1, count: 0 }, { text: option2, count: 0 }],
      }],
    }).catch(async () => {
      // Fallback: post plain story
      return ig.publish.story({ file: fs.readFileSync(resized) });
    });

    this._cleanup(resized);
    return { success: true, mediaId: result.media?.id, poll: { question, option1, option2 } };
  }

  // ══════════════════════════════════════════════════════════
  // POST STORY WITH QUESTION BOX
  // ══════════════════════════════════════════════════════════
  async postQuestionStory(accountId, imagePath, question) {
    const IGService = require('../instagram.service');
    const ig        = await IGService.getClient(accountId);
    const resized   = await this._resizeForStory(imagePath);

    const result = await ig.publish.story({
      file: fs.readFileSync(resized),
      story_questions: [{
        x: 0.5, y: 0.5,
        width: 0.7, height: 0.25,
        question,
        profilePicUrl: '',
      }],
    }).catch(() => ig.publish.story({ file: fs.readFileSync(resized) }));

    this._cleanup(resized);
    return { success: true, mediaId: result.media?.id, question };
  }

  // ══════════════════════════════════════════════════════════
  // POST STORY WITH LINK STICKER
  // ══════════════════════════════════════════════════════════
  async postLinkStory(accountId, imagePath, url, linkText = 'Learn More') {
    const IGService = require('../instagram.service');
    const ig        = await IGService.getClient(accountId);
    const resized   = await this._resizeForStory(imagePath);

    const result = await ig.publish.story({
      file: fs.readFileSync(resized),
      story_cta: [{ links: [{ webUri: url }] }],
    }).catch(() => ig.publish.story({ file: fs.readFileSync(resized) }));

    this._cleanup(resized);
    return { success: true, mediaId: result.media?.id, url, linkText };
  }

  // ══════════════════════════════════════════════════════════
  // POST COUNTDOWN STORY
  // ══════════════════════════════════════════════════════════
  async postCountdownStory(accountId, imagePath, countdownConfig) {
    const IGService = require('../instagram.service');
    const ig        = await IGService.getClient(accountId);
    const resized   = await this._resizeForStory(imagePath);
    const { text, endTime } = countdownConfig;

    const result = await ig.publish.story({
      file: fs.readFileSync(resized),
      story_countdowns: [{
        x: 0.5, y: 0.6,
        width: 0.7, height: 0.2,
        text,
        end_ts: Math.floor(new Date(endTime).getTime() / 1000),
        following_enabled: true,
      }],
    }).catch(() => ig.publish.story({ file: fs.readFileSync(resized) }));

    this._cleanup(resized);
    return { success: true, mediaId: result.media?.id, countdown: { text, endTime } };
  }

  // ══════════════════════════════════════════════════════════
  // CLOSE FRIENDS STORY
  // ══════════════════════════════════════════════════════════
  async postCloseFriendsStory(accountId, imagePath, caption = '') {
    const IGService = require('../instagram.service');
    const ig        = await IGService.getClient(accountId);
    const resized   = await this._resizeForStory(imagePath);

    const result = await ig.publish.story({
      file:              fs.readFileSync(resized),
      audience:          'besties',  // close friends
      caption,
    }).catch(() => ig.publish.story({ file: fs.readFileSync(resized) }));

    this._cleanup(resized);
    return { success: true, mediaId: result.media?.id, audience: 'close_friends' };
  }

  // ══════════════════════════════════════════════════════════
  // STORY SEQUENCE — Post multiple stories in campaign
  // ══════════════════════════════════════════════════════════
  async postStorySequence(accountId, stories, options = {}) {
    const { delayBetween = 3000 } = options;
    const results = [];

    for (const story of stories) {
      try {
        let result;
        switch (story.type) {
          case 'image':     result = await this.postImageStory(accountId, story.path, story.options); break;
          case 'video':     result = await this.postVideoStory(accountId, story.path, story.options); break;
          case 'ai':        result = await this.postAIStory(accountId, story); break;
          case 'poll':      result = await this.postPollStory(accountId, story.path, story.poll); break;
          case 'question':  result = await this.postQuestionStory(accountId, story.path, story.question); break;
          case 'link':      result = await this.postLinkStory(accountId, story.path, story.url, story.linkText); break;
          case 'countdown': result = await this.postCountdownStory(accountId, story.path, story.countdown); break;
          default: result = await this.postAIStory(accountId, story);
        }
        results.push({ success: true, ...result, index: results.length });
      } catch (err) {
        results.push({ success: false, error: err.message, index: results.length });
      }
      await delay(delayBetween);
    }

    return { total: stories.length, posted: results.filter(r => r.success).length, results };
  }

  // ══════════════════════════════════════════════════════════
  // HIGHLIGHTS MANAGER
  // ══════════════════════════════════════════════════════════
  async createHighlight(accountId, title, storyIds, coverImagePath) {
    const IGService = require('../instagram.service');
    const ig        = await IGService.getClient(accountId);

    const coverFile = coverImagePath ? fs.readFileSync(coverImagePath) : null;

    const result = await ig.highlights.create({
      title,
      coverMediaId: storyIds[0],
      mediaIds:     storyIds,
      cropped_image_version: coverFile ? {
        width: 480, height: 480, url: '',
      } : undefined,
    });

    return { success: true, highlightId: result.reel.id, title };
  }

  async addToHighlight(accountId, highlightId, storyIds) {
    const IGService = require('../instagram.service');
    const ig        = await IGService.getClient(accountId);

    await ig.highlights.editHighlight(highlightId, {
      added_media_ids:   storyIds,
      removed_media_ids: [],
    });

    return { success: true, highlightId, added: storyIds.length };
  }

  async deleteHighlight(accountId, highlightId) {
    const IGService = require('../instagram.service');
    const ig        = await IGService.getClient(accountId);
    await ig.highlights.deleteHighlight(highlightId);
    return { success: true, highlightId };
  }

  async getHighlights(accountId, userId) {
    const IGService = require('../instagram.service');
    const ig        = await IGService.getClient(accountId);
    const targetId  = userId || (await ig.account.currentUser()).pk;

    const highlights = await ig.highlights.highlightsTray(targetId);
    return highlights.tray.map(h => ({
      id:         h.id,
      title:      h.title,
      mediaCount: h.media_count,
      coverImage: h.cover_media?.cropped_image_versions2?.candidates?.[0]?.url,
    }));
  }

  // ══════════════════════════════════════════════════════════
  // AUTO VIEW + REACT TO STORIES
  // ══════════════════════════════════════════════════════════
  async autoViewStories(accountId, options = {}) {
    const IGService = require('../instagram.service');
    const ig        = await IGService.getClient(accountId);
    const { maxAccounts = 50, reactEmoji = null } = options;

    const reelsTray = await ig.feed.reelsTray().items();
    const results   = { viewed: 0, reacted: 0, failed: 0 };

    for (const reel of reelsTray.slice(0, maxAccounts)) {
      try {
        if (reel.items?.length) {
          await ig.story.seen(reel.items);
          results.viewed += reel.items.length;

          if (reactEmoji) {
            for (const item of reel.items.slice(0, 1)) {
              await ig.media.react({
                mediaId: item.id,
                emoji:   reactEmoji,
              }).catch(() => {});
              results.reacted++;
            }
          }
          await delay(randomDelay(1000, 3000));
        }
      } catch { results.failed++; }
    }

    return results;
  }

  // AI-powered story reply bot
  async setupStoryReplyBot(accountId, systemPrompt) {
    const IGService = require('../instagram.service');
    const ig        = await IGService.getClient(accountId);
    const AIService = require('../index').AIService;

    // Listen for incoming story replies
    ig.realtime?.on('message', async (data) => {
      try {
        const msg = data.message;
        if (msg?.story_share || msg?.reel_share) {
          const reply = await AIService.chat(
            msg.text || 'Someone replied to your story',
            [],
            systemPrompt || 'You are a friendly Instagram account. Reply naturally to story replies.'
          );

          if (reply) {
            const thread = ig.entity.directThread([msg.user_id.toString()]);
            await thread.broadcastText(reply);
          }
        }
      } catch {}
    });

    return { success: true, message: 'Story reply bot activated' };
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS — Image Processing
  // ══════════════════════════════════════════════════════════
  async _resizeForStory(inputPath) {
    const outputPath = inputPath.replace(/\.[^.]+$/, '_story.jpg');
    await sharp(inputPath)
      .resize(STORY_W, STORY_H, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 90 })
      .toFile(outputPath);
    return outputPath;
  }

  async _addTextOverlay(imagePath, text, options = {}) {
    const { position = 'center', color = '#FFFFFF', fontSize = 72 } = options;

    const posMap = {
      top:    { gravity: 'North', dy: 150 },
      center: { gravity: 'Center', dy: 0  },
      bottom: { gravity: 'South', dy: -150 },
    };

    const { gravity, dy } = posMap[position] || posMap.center;
    const outputPath = imagePath.replace(/\.[^.]+$/, '_text.jpg');

    // Create SVG text overlay
    const svgText = `
      <svg width="${STORY_W}" height="${STORY_H}">
        <defs>
          <filter id="shadow">
            <feDropShadow dx="2" dy="2" stdDeviation="4" flood-opacity="0.6"/>
          </filter>
        </defs>
        <text
          x="50%"
          y="${position === 'top' ? '15%' : position === 'bottom' ? '85%' : '50%'}"
          font-family="Arial, sans-serif"
          font-size="${fontSize}"
          font-weight="bold"
          fill="${color}"
          text-anchor="middle"
          dominant-baseline="middle"
          filter="url(#shadow)"
          style="white-space: pre-wrap"
        >${this._escapeXml(text)}</text>
      </svg>
    `;

    await sharp(imagePath)
      .resize(STORY_W, STORY_H, { fit: 'cover' })
      .composite([{
        input:   Buffer.from(svgText),
        gravity: gravity.toLowerCase(),
        top:     dy > 0 ? dy : undefined,
        bottom:  dy < 0 ? -dy : undefined,
      }])
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    return outputPath;
  }

  async _processVideoForStory(videoPath) {
    const { execSync } = require('child_process');
    const outputPath   = videoPath.replace(/\.[^.]+$/, '_story.mp4');

    try {
      execSync(
        `ffmpeg -i "${videoPath}" -vf "scale=${STORY_W}:${STORY_H}:force_original_aspect_ratio=decrease,pad=${STORY_W}:${STORY_H}:(ow-iw)/2:(oh-ih)/2" -t 15 -c:v libx264 -c:a aac "${outputPath}" -y`,
        { timeout: 120000 }
      );
    } catch {
      return videoPath; // return original if ffmpeg fails
    }

    return outputPath;
  }

  _cleanup(filePath) {
    try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
  }

  _escapeXml(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}

module.exports = new InstagramStoryService();
