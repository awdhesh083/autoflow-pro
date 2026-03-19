/**
 * ══════════════════════════════════════════════════════════
 * UNIVERSAL CONTENT REPURPOSER — Feature 15
 * One piece of content → every format on every platform
 *
 * Input types:
 *  - Blog post / article (URL or text)
 *  - YouTube video (URL)
 *  - Podcast episode (audio file or URL)
 *  - Tweet / thread
 *  - LinkedIn post
 *  - Any long-form text
 *
 * Output formats:
 *  - Instagram carousel (10 slides)
 *  - Instagram caption + hashtags
 *  - TikTok script (hook → value → CTA)
 *  - YouTube Shorts script
 *  - Twitter/X thread (10 tweets)
 *  - LinkedIn post (thought leadership)
 *  - Facebook post
 *  - Pinterest pin description x5
 *  - Email newsletter
 *  - WhatsApp broadcast message
 *  - Telegram channel post
 *  - Discord announcement
 *  - YouTube description + tags
 *  - Blog post summary
 *  - SMS blast (160 chars)
 *  - Push notification
 *  - Google Business post
 *  - Podcast show notes
 *  - Quote cards (5 pull quotes)
 *  - FAQ from content
 *  - Story sequence (5 slides)
 * ══════════════════════════════════════════════════════════
 */

const Anthropic = require('@anthropic-ai/sdk');
const axios     = require('axios');
const { execSync } = require('child_process');
const fs        = require('fs');
const path      = require('path');
const logger    = require('../../utils/logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Output format definitions ─────────────────────────────
const OUTPUT_FORMATS = {
  ig_carousel:     { label: 'Instagram Carousel (10 slides)', platform: 'instagram' },
  ig_caption:      { label: 'Instagram Caption + Hashtags',   platform: 'instagram' },
  ig_story:        { label: 'Instagram Story Sequence',       platform: 'instagram' },
  ig_reel_script:  { label: 'Instagram Reel Script',          platform: 'instagram' },
  tiktok_script:   { label: 'TikTok Script',                  platform: 'tiktok'    },
  yt_short_script: { label: 'YouTube Short Script',           platform: 'youtube'   },
  yt_description:  { label: 'YouTube Video Description',      platform: 'youtube'   },
  twitter_thread:  { label: 'Twitter/X Thread',               platform: 'twitter'   },
  twitter_tweet:   { label: 'Single Tweet',                   platform: 'twitter'   },
  linkedin_post:   { label: 'LinkedIn Post',                  platform: 'linkedin'  },
  facebook_post:   { label: 'Facebook Post',                  platform: 'facebook'  },
  pinterest_pins:  { label: 'Pinterest Pin Descriptions x5',  platform: 'pinterest' },
  email_newsletter:{ label: 'Email Newsletter',               platform: 'email'     },
  whatsapp_blast:  { label: 'WhatsApp Broadcast',             platform: 'whatsapp'  },
  telegram_post:   { label: 'Telegram Channel Post',          platform: 'telegram'  },
  discord_post:    { label: 'Discord Announcement',           platform: 'discord'   },
  sms_blast:       { label: 'SMS Blast (160 chars)',          platform: 'sms'       },
  push_notif:      { label: 'Push Notification',              platform: 'push'      },
  blog_summary:    { label: 'Blog Post Summary',              platform: 'blog'      },
  podcast_notes:   { label: 'Podcast Show Notes',             platform: 'podcast'   },
  quote_cards:     { label: 'Pull Quote Cards x5',            platform: 'design'    },
  faq:             { label: 'FAQ Section',                    platform: 'website'   },
  google_business: { label: 'Google Business Post',           platform: 'google'    },
};

class ContentRepurposerService {

  // ══════════════════════════════════════════════════════════
  // CONTENT EXTRACTORS
  // ══════════════════════════════════════════════════════════

  // Extract content from URL (blog post, article)
  async extractFromUrl(url) {
    try {
      const res  = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
        timeout: 15000,
      });
      const html = res.data;

      // Strip HTML tags
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 15000); // cap at 15k chars

      // Extract title
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i) ||
                         html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title      = titleMatch?.[1]?.trim() || url;

      // OG description
      const descMatch  = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
      const description= descMatch?.[1] || '';

      return { source: 'url', url, title, description, content: text, wordCount: text.split(/\s+/).length };
    } catch (err) {
      throw new Error(`URL extraction failed: ${err.message}`);
    }
  }

  // Extract transcript from YouTube video
  async extractFromYouTube(videoUrl) {
    const videoId = videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
    if (!videoId) throw new Error('Invalid YouTube URL');

    try {
      // Try yt-dlp for subtitles/transcript
      const subtitleDir = `./uploads/temp/subtitles_${Date.now()}`;
      fs.mkdirSync(subtitleDir, { recursive: true });

      execSync(
        `yt-dlp --write-auto-subs --skip-download --sub-langs en --convert-subs srt -o "${subtitleDir}/%(id)s" "${videoUrl}"`,
        { timeout: 60000 }
      );

      const srtFiles = fs.readdirSync(subtitleDir).filter(f => f.endsWith('.srt'));
      let transcript = '';

      if (srtFiles.length > 0) {
        const srt    = fs.readFileSync(path.join(subtitleDir, srtFiles[0]), 'utf8');
        transcript   = srt
          .replace(/^\d+$/gm, '')
          .replace(/\d{2}:\d{2}:\d{2},\d{3} --> .+/g, '')
          .replace(/<[^>]+>/g, '')
          .replace(/\n{3,}/g, '\n')
          .trim();
      }

      // Also get video metadata
      const metaStr = execSync(`yt-dlp --dump-json "${videoUrl}"`, { timeout: 30000 }).toString();
      const meta    = JSON.parse(metaStr);

      // Cleanup
      srtFiles.forEach(f => { try { fs.unlinkSync(path.join(subtitleDir, f)); } catch {} });
      try { fs.rmdirSync(subtitleDir); } catch {}

      return {
        source:      'youtube',
        url:         videoUrl,
        videoId,
        title:       meta.title,
        description: meta.description?.slice(0, 500),
        duration:    meta.duration,
        content:     transcript || meta.description || meta.title,
        wordCount:   (transcript || '').split(/\s+/).length,
        channel:     meta.uploader,
      };
    } catch (err) {
      logger.warn(`YT transcript failed: ${err.message}. Using description.`);
      return { source: 'youtube', url: videoUrl, videoId, content: '', error: err.message };
    }
  }

  // Extract from audio (podcast) via transcription
  async extractFromAudio(audioPath) {
    // Use whisper (if installed) or Anthropic's audio API
    try {
      const transcript = execSync(
        `whisper "${audioPath}" --output_format txt --model base --output_dir /tmp`,
        { timeout: 300000 }
      ).toString();

      return {
        source:    'audio',
        audioPath,
        content:   transcript,
        wordCount: transcript.split(/\s+/).length,
      };
    } catch {
      // Fallback: use file metadata if whisper not installed
      return {
        source:  'audio',
        audioPath,
        content: '',
        error:   'Whisper not installed. Run: pip install openai-whisper',
        note:    'Install whisper for audio transcription, or pass text content directly',
      };
    }
  }

  // Plain text input
  extractFromText(text, metadata = {}) {
    return {
      source:    'text',
      content:   text.slice(0, 20000),
      wordCount: text.split(/\s+/).length,
      title:     metadata.title || 'Content',
      ...metadata,
    };
  }

  // ══════════════════════════════════════════════════════════
  // CORE REPURPOSER — generate ONE format
  // ══════════════════════════════════════════════════════════
  async repurposeToFormat(contentData, format, options = {}) {
    const { tone = 'casual', brandName = '', niche = '', targetAudience = '' } = options;
    const { content, title, url } = contentData;

    if (!content && !title) throw new Error('No content to repurpose');

    const sourceText = `ORIGINAL CONTENT:\nTitle: ${title || 'Untitled'}\n${content?.slice(0, 8000) || ''}`;

    const formatPrompts = {
      ig_carousel: `Create a 10-slide Instagram carousel from this content.
Return ONLY JSON:
{
  "title": "carousel title",
  "slides": [
    {"slideNumber": 1, "type": "hook", "headline": "...", "body": "...", "visualNote": "what to show", "emoji": "🔥"},
    {"slideNumber": 2, "type": "content", ...},
    ...
    {"slideNumber": 10, "type": "cta", "headline": "Follow for more!", "body": "...", "visualNote": "..."}
  ],
  "caption": "post caption with hashtags",
  "hashtags": ["#tag1", "#tag2"]
}`,

      ig_caption: `Write an Instagram caption with hashtags from this content.
Return ONLY JSON:
{
  "caption": "full caption with emojis",
  "hashtags": ["#tag1"],
  "cta": "call to action",
  "charCount": 200
}`,

      ig_story: `Create a 5-slide Instagram Story sequence from this content.
Return ONLY JSON:
{
  "slides": [
    {"slide": 1, "type": "hook|content|poll|cta", "text": "...", "visualNote": "...", "sticker": "poll|question|none"}
  ]
}`,

      ig_reel_script: `Write a 30-60 second Instagram Reel script from this content.
Return ONLY JSON:
{
  "hook": {"text": "...", "seconds": 3},
  "body": [{"point": "...", "text": "...", "seconds": 10}],
  "cta": {"text": "...", "seconds": 5},
  "fullScript": "complete spoken words",
  "onScreenText": ["overlays"],
  "totalSeconds": 45,
  "caption": "reel caption",
  "hashtags": ["#tag"]
}`,

      tiktok_script: `Write a viral TikTok script from this content. Max 60 seconds.
Return ONLY JSON:
{
  "hook": {"text": "...", "seconds": 3, "visualNote": "..."},
  "body": [{"text": "...", "seconds": 10, "visualNote": "..."}],
  "cta": {"text": "...", "seconds": 5},
  "fullScript": "everything spoken",
  "onScreenText": ["text overlays"],
  "totalSeconds": 55,
  "caption": "tiktok caption",
  "hashtags": ["#fyp"]
}`,

      yt_short_script: `Write a YouTube Shorts script (max 60s) from this content.
Return ONLY JSON:
{
  "title": "video title (max 70 chars)",
  "hook": {"text": "...", "seconds": 3},
  "body": [{"point": "...", "text": "...", "seconds": 10}],
  "cta": {"text": "Subscribe!", "seconds": 5},
  "fullScript": "complete spoken script",
  "totalSeconds": 58,
  "description": "youtube description",
  "tags": ["tag1", "tag2"]
}`,

      yt_description: `Write a full YouTube video description from this content. Include timestamps, keywords, and CTA.
Return ONLY JSON:
{
  "title": "optimized video title",
  "description": "full description (500-1000 chars)",
  "timestamps": [{"time": "0:00", "label": "Intro"}, ...],
  "tags": ["tag1", "tag2"],
  "endScreenCta": "subscribe CTA"
}`,

      twitter_thread: `Write a 10-tweet Twitter/X thread from this content. Each tweet max 280 chars.
Return ONLY JSON:
{
  "hook": "opening tweet (most attention-grabbing)",
  "tweets": ["tweet 1 text", "tweet 2 text", ...],
  "summary": "final summary tweet with CTA"
}`,

      twitter_tweet: `Write a single punchy tweet (max 280 chars) from this content.
Return ONLY JSON:
{
  "tweet": "tweet text",
  "hashtags": ["#tag"],
  "charCount": 200
}`,

      linkedin_post: `Write a LinkedIn thought-leadership post from this content. Professional, insightful, storytelling.
Return ONLY JSON:
{
  "post": "full LinkedIn post (800-1500 chars)",
  "hook": "first line",
  "hashtags": ["#tag1"],
  "charCount": 1000
}`,

      facebook_post: `Write an engaging Facebook post from this content.
Return ONLY JSON:
{
  "post": "full Facebook post",
  "hashtags": ["#tag"],
  "cta": "call to action"
}`,

      pinterest_pins: `Write 5 different Pinterest pin descriptions for this content. Each keyword-rich, inspiring.
Return ONLY JSON:
{
  "pins": [
    {"title": "...", "description": "...", "keywords": ["kw1"], "boardSuggestion": "..."}
  ]
}`,

      email_newsletter: `Write a full email newsletter from this content.
Return ONLY JSON:
{
  "subject": "email subject line",
  "preheader": "preview text (90 chars)",
  "body": {
    "intro": "opening paragraph",
    "mainContent": "main body text",
    "keyPoints": ["bullet 1", "bullet 2"],
    "cta": {"text": "button text", "url": "{{CTA_URL}}"}
  },
  "signoff": "closing line"
}`,

      whatsapp_blast: `Write a WhatsApp broadcast message from this content. Keep it conversational, max 500 chars, with emoji.
Return ONLY JSON:
{
  "message": "whatsapp message text",
  "charCount": 300,
  "emoji": "used emojis"
}`,

      telegram_post: `Write a Telegram channel post from this content. Markdown formatting OK.
Return ONLY JSON:
{
  "post": "telegram post with **bold** and formatting",
  "buttons": [{"text": "Read More", "url": "{{LINK}}"}]
}`,

      discord_post: `Write a Discord server announcement from this content.
Return ONLY JSON:
{
  "title": "announcement title",
  "body": "announcement body",
  "embed": {"color": "#5865F2", "fields": [{"name": "Key Point", "value": "..."}]}
}`,

      sms_blast: `Write an SMS blast from this content. MUST be under 160 characters.
Return ONLY JSON:
{
  "sms": "message text",
  "charCount": 130,
  "link": "{{SHORT_LINK}}"
}`,

      push_notif: `Write a push notification from this content. Title max 50 chars, body max 100 chars.
Return ONLY JSON:
{
  "title": "notification title",
  "body": "notification body",
  "cta": "tap action label"
}`,

      blog_summary: `Write a blog post summary / meta description from this content.
Return ONLY JSON:
{
  "headline": "SEO headline",
  "metaDescription": "155-char meta description",
  "summary": "3-paragraph summary",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "tags": ["tag1", "tag2"]
}`,

      podcast_notes: `Write podcast show notes from this content.
Return ONLY JSON:
{
  "title": "episode title",
  "summary": "episode summary (200 chars)",
  "showNotes": "full show notes with timestamps and links",
  "keyTakeaways": ["takeaway 1", "takeaway 2"],
  "guestInfo": "if applicable",
  "resources": ["link or resource mentioned"]
}`,

      quote_cards: `Extract 5 powerful pull quotes from this content for social media quote cards.
Return ONLY JSON:
{
  "quotes": [
    {"quote": "...", "context": "brief context", "platform": "best platform for this quote", "visualNote": "background color/image suggestion"}
  ]
}`,

      faq: `Create an FAQ section from this content with 8-10 Q&A pairs.
Return ONLY JSON:
{
  "faqs": [
    {"question": "...", "answer": "...", "category": "general|technical|pricing"}
  ]
}`,

      google_business: `Write a Google Business post from this content. Max 1500 chars.
Return ONLY JSON:
{
  "post": "post text",
  "cta": {"type": "LEARN_MORE|SIGN_UP|BUY|ORDER", "url": "{{URL}}"},
  "charCount": 800
}`,
    };

    const prompt = formatPrompts[format];
    if (!prompt) throw new Error(`Unknown format: ${format}. Available: ${Object.keys(OUTPUT_FORMATS).join(', ')}`);

    const systemPrompt = `You are a world-class content repurposing specialist.
Brand: ${brandName || 'personal brand'}
Niche: ${niche || 'general'}
Tone: ${tone}
Target audience: ${targetAudience || 'general'}
Return ONLY valid JSON. No markdown, no backticks, no explanation outside JSON.`;

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system:     systemPrompt,
      messages: [{
        role:    'user',
        content: `${sourceText}\n\n---\n\n${prompt}`,
      }],
    });

    const raw    = response.content[0].text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(raw);

    return {
      success:  true,
      format,
      label:    OUTPUT_FORMATS[format]?.label,
      platform: OUTPUT_FORMATS[format]?.platform,
      source:   contentData.source,
      title:    contentData.title,
      result,
    };
  }

  // ══════════════════════════════════════════════════════════
  // REPURPOSE TO MULTIPLE FORMATS AT ONCE
  // ══════════════════════════════════════════════════════════
  async repurposeToMany(contentData, formats, options = {}) {
    const results  = {};
    const errors   = {};
    const total    = formats.length;
    let   done     = 0;

    for (const format of formats) {
      try {
        logger.info(`Repurposing to ${format} (${++done}/${total})...`);
        results[format] = await this.repurposeToFormat(contentData, format, options);
      } catch (err) {
        errors[format]  = err.message;
        logger.error(`Repurpose to ${format} failed: ${err.message}`);
      }
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    return {
      success:       true,
      source:        contentData.source,
      title:         contentData.title,
      formatsTotal:  total,
      formatsSuccess:Object.keys(results).length,
      formatsFailed: Object.keys(errors).length,
      results,
      errors,
    };
  }

  // ══════════════════════════════════════════════════════════
  // FULL REPURPOSE PACK (all 20 formats)
  // ══════════════════════════════════════════════════════════
  async repurposeAll(contentData, options = {}) {
    const allFormats = Object.keys(OUTPUT_FORMATS);
    return this.repurposeToMany(contentData, allFormats, options);
  }

  // ══════════════════════════════════════════════════════════
  // SMART REPURPOSE (auto-selects best formats for content type)
  // ══════════════════════════════════════════════════════════
  async smartRepurpose(contentData, options = {}) {
    const { goal = 'growth', platforms = [] } = options;

    // Auto-select formats based on goal + platforms
    let selectedFormats;

    if (platforms.length > 0) {
      // Map platforms to their best formats
      const platformFormatMap = {
        instagram: ['ig_carousel', 'ig_caption', 'ig_story', 'ig_reel_script'],
        tiktok:    ['tiktok_script'],
        twitter:   ['twitter_thread', 'twitter_tweet'],
        linkedin:  ['linkedin_post'],
        facebook:  ['facebook_post'],
        youtube:   ['yt_short_script', 'yt_description'],
        pinterest: ['pinterest_pins'],
        email:     ['email_newsletter'],
        whatsapp:  ['whatsapp_blast'],
        telegram:  ['telegram_post'],
        discord:   ['discord_post'],
        sms:       ['sms_blast'],
      };
      selectedFormats = [...new Set(platforms.flatMap(p => platformFormatMap[p] || []))];
    } else if (goal === 'growth') {
      selectedFormats = ['ig_carousel', 'tiktok_script', 'twitter_thread', 'linkedin_post', 'yt_short_script'];
    } else if (goal === 'sales') {
      selectedFormats = ['email_newsletter', 'whatsapp_blast', 'sms_blast', 'ig_caption', 'facebook_post'];
    } else if (goal === 'engagement') {
      selectedFormats = ['ig_story', 'twitter_thread', 'instagram_reel_script', 'quote_cards', 'faq'];
    } else if (goal === 'seo') {
      selectedFormats = ['blog_summary', 'yt_description', 'pinterest_pins', 'google_business', 'faq'];
    } else {
      selectedFormats = ['ig_carousel', 'twitter_thread', 'linkedin_post', 'email_newsletter', 'tiktok_script'];
    }

    logger.info(`Smart repurpose: ${selectedFormats.length} formats for goal="${goal}"`);
    return this.repurposeToMany(contentData, selectedFormats, options);
  }

  // ══════════════════════════════════════════════════════════
  // PIPELINE: URL → Extract → Repurpose → Return all
  // ══════════════════════════════════════════════════════════
  async repurposeFromUrl(url, formats, options = {}) {
    const contentData = await this.extractFromUrl(url);
    if (!formats || formats.length === 0) {
      return this.smartRepurpose(contentData, options);
    }
    return this.repurposeToMany(contentData, formats, options);
  }

  async repurposeFromYouTube(videoUrl, formats, options = {}) {
    const contentData = await this.extractFromYouTube(videoUrl);
    if (!formats || formats.length === 0) {
      return this.smartRepurpose(contentData, options);
    }
    return this.repurposeToMany(contentData, formats, options);
  }

  async repurposeFromText(text, formats, options = {}) {
    const contentData = this.extractFromText(text, options.metadata || {});
    if (!formats || formats.length === 0) {
      return this.smartRepurpose(contentData, options);
    }
    return this.repurposeToMany(contentData, formats, options);
  }

  // ══════════════════════════════════════════════════════════
  // LIST AVAILABLE FORMATS
  // ══════════════════════════════════════════════════════════
  getFormats() {
    return Object.entries(OUTPUT_FORMATS).map(([key, val]) => ({
      key,
      label:    val.label,
      platform: val.platform,
    }));
  }
}

module.exports = new ContentRepurposerService();
