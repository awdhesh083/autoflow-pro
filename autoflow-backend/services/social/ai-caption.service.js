/**
 * ══════════════════════════════════════════════════════════
 * AI CAPTION & HASHTAG GENERATOR — Feature 9
 * Full AI-powered content creation engine
 *
 * Features:
 *  - Platform-specific captions (IG/TikTok/Twitter/LinkedIn/FB/YT)
 *  - Hashtag research + ranking by reach/competition
 *  - Trending hashtag injector
 *  - Tone selector (funny/professional/inspirational/casual/viral)
 *  - Niche-specific hashtag sets
 *  - Caption A/B variants generator
 *  - Emoji auto-inserter
 *  - CTA (call-to-action) generator
 *  - Caption from image (vision AI)
 *  - Viral hook generator
 *  - Bio writer
 *  - Content calendar (30-day)
 *  - Brand voice trainer (learn from examples)
 *  - Hashtag performance tracker
 *  - Banned hashtag checker
 *  - Caption translator (multilingual)
 *  - Thread script generator
 *  - Story script generator
 *  - Reel/Short script generator
 * ══════════════════════════════════════════════════════════
 */

const Anthropic = require('@anthropic-ai/sdk');
const axios     = require('axios');
const fs        = require('fs');
const logger    = require('../../utils/logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Platform configs ──────────────────────────────────────
const PLATFORM_CONFIG = {
  instagram: {
    maxChars:     2200,
    hashtagLimit: 30,
    hashtagPlace: 'end',
    emojiStyle:   'heavy',
    style:        'visual, lifestyle, aesthetic',
    ctaExamples:  ['Double tap if you agree! ❤️', 'Save this for later! 📌', 'Tag a friend who needs to see this!', 'Follow for more! 🔥'],
  },
  tiktok: {
    maxChars:     2200,
    hashtagLimit: 10,
    hashtagPlace: 'inline',
    emojiStyle:   'heavy',
    style:        'trending, fun, Gen-Z, viral, hooky',
    ctaExamples:  ['Follow for part 2!', 'Duet this!', 'Reply with your take 👇', 'Stitch if you relate!'],
  },
  twitter: {
    maxChars:     280,
    hashtagLimit: 3,
    hashtagPlace: 'inline',
    emojiStyle:   'light',
    style:        'punchy, witty, conversational, thread-worthy',
    ctaExamples:  ['RT if you agree', 'Reply with your thoughts', 'Follow for more', 'Like if this helped you'],
  },
  linkedin: {
    maxChars:     3000,
    hashtagLimit: 5,
    hashtagPlace: 'end',
    emojiStyle:   'minimal',
    style:        'professional, insightful, thought leadership, storytelling',
    ctaExamples:  ['What do you think? Drop a comment below.', 'Follow me for more insights.', 'Share with your network if this resonated.', 'Connect with me to discuss further.'],
  },
  facebook: {
    maxChars:     63206,
    hashtagLimit: 10,
    hashtagPlace: 'end',
    emojiStyle:   'moderate',
    style:        'community-focused, engaging, storytelling, friendly',
    ctaExamples:  ['Comment your thoughts below! 👇', 'Share with friends!', 'React with ❤️ if you agree!', 'Join the conversation!'],
  },
  youtube: {
    maxChars:     5000,
    hashtagLimit: 15,
    hashtagPlace: 'end',
    emojiStyle:   'moderate',
    style:        'descriptive, SEO-optimized, engaging, searchable',
    ctaExamples:  ['Subscribe for more!', 'Hit the notification bell 🔔', 'Like if this helped!', 'Comment your questions below!'],
  },
  pinterest: {
    maxChars:     500,
    hashtagLimit: 20,
    hashtagPlace: 'end',
    emojiStyle:   'light',
    style:        'descriptive, inspiring, keyword-rich, aspirational',
    ctaExamples:  ['Save for later!', 'Try this today!', 'Pin for inspiration!', 'Share with a friend!'],
  },
  threads: {
    maxChars:     500,
    hashtagLimit: 5,
    hashtagPlace: 'end',
    emojiStyle:   'light',
    style:        'conversational, authentic, community-driven',
    ctaExamples:  ['What do you think?', 'Reply below 👇', 'Repost if you agree!'],
  },
};

// ── Tone configs ──────────────────────────────────────────
const TONES = {
  funny:          'humorous, witty, uses wordplay, jokes and memes. Light-hearted and entertaining.',
  professional:   'formal, credible, data-driven. Demonstrates expertise and authority.',
  inspirational:  'motivational, uplifting, uses powerful quotes and emotional language.',
  casual:         'relaxed, friendly, conversational, like talking to a friend.',
  viral:          'highly shareable, provocative, controversy-free, curiosity-gap, urgent.',
  educational:    'informative, teaches something valuable, step-by-step, clear.',
  storytelling:   'narrative arc, personal story, emotional connection, relatable.',
  salesy:         'persuasive, benefit-focused, urgency, FOMO, clear offer and CTA.',
  minimalist:     'short, punchy, powerful. Less is more.',
  luxury:         'premium, exclusive, aspirational, sophisticated language.',
};

class AICaptionService {

  // ══════════════════════════════════════════════════════════
  // CORE: GENERATE CAPTION
  // ══════════════════════════════════════════════════════════
  async generateCaption(options = {}) {
    const {
      platform    = 'instagram',
      topic       = '',
      tone        = 'casual',
      niche       = '',
      keywords    = [],
      includeCTA  = true,
      includeEmoji= true,
      includeHashtags = true,
      hashtagCount = null,
      language    = 'English',
      brandName   = '',
      targetAudience = '',
      variants    = 1,       // how many caption variants to generate
      imageBase64 = null,    // generate from image
    } = options;

    const cfg     = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.instagram;
    const toneDesc= TONES[tone] || TONES.casual;
    const maxTags = hashtagCount || cfg.hashtagLimit;

    const systemPrompt = `You are a world-class social media copywriter specializing in ${platform} content.
You create highly engaging, platform-optimized captions that drive engagement and growth.
Platform: ${platform} (max ${cfg.maxChars} chars)
Style: ${cfg.style}
Always respond with valid JSON only. No markdown, no backticks, no explanation.`;

    const userPrompt = `Generate ${variants} caption variant(s) for ${platform}.

Topic/Content: ${topic || 'general lifestyle content'}
Tone: ${toneDesc}
Niche: ${niche || 'general'}
Keywords to include: ${keywords.join(', ') || 'none specified'}
Language: ${language}
Brand: ${brandName || 'personal brand'}
Target Audience: ${targetAudience || 'general audience'}
Include CTA: ${includeCTA}
Include Emojis: ${includeEmoji} (style: ${cfg.emojiStyle})
Include Hashtags: ${includeHashtags} (max ${maxTags}, place at ${cfg.hashtagPlace})

${includeCTA ? `CTA examples for reference: ${cfg.ctaExamples.join(' | ')}` : ''}

Return ONLY this JSON structure (no markdown):
{
  "captions": [
    {
      "caption": "full caption text with emojis and hashtags",
      "captionOnly": "caption without hashtags",
      "hashtags": ["#tag1", "#tag2"],
      "cta": "the call to action used",
      "hook": "the opening hook line",
      "estimatedReach": "low/medium/high",
      "charCount": 150,
      "tone": "${tone}"
    }
  ]
}`;

    let messages;
    if (imageBase64) {
      messages = [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: userPrompt },
        ],
      }];
    } else {
      messages = [{ role: 'user', content: userPrompt }];
    }

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system:     systemPrompt,
      messages,
    });

    const text   = response.content[0].text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(text);

    logger.info(`✅ Generated ${result.captions.length} caption(s) for ${platform}`);
    return {
      success:  true,
      platform,
      tone,
      ...result,
    };
  }

  // ══════════════════════════════════════════════════════════
  // MULTI-PLATFORM CAPTION PACK
  // ══════════════════════════════════════════════════════════
  async generateForAllPlatforms(topic, options = {}) {
    const platforms = options.platforms || ['instagram', 'tiktok', 'twitter', 'linkedin', 'facebook'];
    const results   = {};

    for (const platform of platforms) {
      try {
        const result = await this.generateCaption({ ...options, platform, topic, variants: 1 });
        results[platform] = result.captions[0];
      } catch (err) {
        results[platform] = { error: err.message };
      }
    }

    return { success: true, topic, platforms: results };
  }

  // ══════════════════════════════════════════════════════════
  // HASHTAG RESEARCH & GENERATOR
  // ══════════════════════════════════════════════════════════
  async generateHashtags(options = {}) {
    const {
      topic       = '',
      niche       = '',
      platform    = 'instagram',
      count       = 30,
      strategy    = 'mixed',   // viral / niche / mixed / local / branded
      targetReach = 'medium',  // small (<100k) / medium (100k-1M) / large (>1M)
      competitors = [],        // competitor usernames to spy
      language    = 'English',
    } = options;

    const systemPrompt = `You are a hashtag strategy expert. Return ONLY valid JSON, no markdown.`;

    const prompt = `Research and generate ${count} strategic hashtags for ${platform}.

Topic: ${topic}
Niche: ${niche || topic}
Strategy: ${strategy}
Target reach per hashtag: ${targetReach} posts
Language: ${language}

Strategy guidelines:
- mixed: 20% viral (>1M posts), 50% medium (100k-1M), 30% niche (<100k)
- viral: focus on high-reach trending tags
- niche: focus on targeted, less competitive tags
- local: include location-based tags
- branded: create unique brand hashtags

Return ONLY this JSON:
{
  "hashtags": [
    {
      "tag": "#hashtag",
      "category": "niche|viral|medium|branded|location",
      "estimatedPosts": "500k",
      "competition": "low|medium|high",
      "relevance": 9,
      "recommended": true
    }
  ],
  "strategy": {
    "summary": "why this set works",
    "topPicks": ["#tag1", "#tag2", "#tag3"],
    "brandedSuggestion": "#YourBrandTag",
    "bestFor": "${platform}"
  },
  "sets": {
    "viral": ["#tag1"],
    "medium": ["#tag2"],
    "niche": ["#tag3"],
    "full": "#tag1 #tag2 #tag3"
  }
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
      system: systemPrompt,
    });

    const text   = response.content[0].text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(text);

    return { success: true, platform, topic, count: result.hashtags.length, ...result };
  }

  // ══════════════════════════════════════════════════════════
  // VIRAL HOOK GENERATOR
  // ══════════════════════════════════════════════════════════
  async generateViralHooks(topic, options = {}) {
    const { platform = 'instagram', count = 10, niche = '', tone = 'viral' } = options;

    const prompt = `Generate ${count} viral opening hooks for ${platform} content about: "${topic}"
Niche: ${niche || 'general'}
Make them attention-grabbing, curiosity-inducing, pattern-interrupting.

Hook types to include:
- Curiosity gap ("You won't believe...")
- Bold statement ("Most people do X wrong")
- Question hook ("What if I told you...")
- Story hook ("3 years ago I was...")
- Data hook ("97% of people don't know...")
- Controversy hook ("Unpopular opinion:")
- Tutorial hook ("Stop doing X. Do this instead:")
- Listicle hook ("5 things that changed my...")

Return ONLY JSON:
{
  "hooks": [
    {
      "hook": "the hook text",
      "type": "curiosity|story|data|controversy|tutorial|listicle|question|bold",
      "platform": "${platform}",
      "viralScore": 8,
      "emoji": "🔥"
    }
  ]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
      system: 'You are a viral content strategist. Return ONLY valid JSON, no markdown.',
    });

    const text   = response.content[0].text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(text);
    return { success: true, topic, platform, ...result };
  }

  // ══════════════════════════════════════════════════════════
  // CAPTION FROM IMAGE (Vision AI)
  // ══════════════════════════════════════════════════════════
  async captionFromImage(imagePath, options = {}) {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64      = imageBuffer.toString('base64');
    const ext         = imagePath.split('.').pop().toLowerCase();
    const mediaType   = ext === 'png' ? 'image/png' : 'image/jpeg';

    return this.generateCaption({ ...options, imageBase64: base64 });
  }

  async captionFromImageUrl(imageUrl, options = {}) {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
    const base64   = Buffer.from(response.data).toString('base64');
    return this.generateCaption({ ...options, imageBase64: base64 });
  }

  // ══════════════════════════════════════════════════════════
  // BIO WRITER
  // ══════════════════════════════════════════════════════════
  async generateBio(options = {}) {
    const {
      platform  = 'instagram',
      name      = '',
      niche     = '',
      value     = '',         // what you offer
      cta       = '',         // what you want them to do
      keywords  = [],
      tone      = 'casual',
      emoji     = true,
      variants  = 3,
    } = options;

    const limits = { instagram: 150, twitter: 160, linkedin: 220, tiktok: 80, youtube: 1000, facebook: 101 };
    const limit  = limits[platform] || 150;

    const prompt = `Write ${variants} ${platform} bio variants for:
Name/Brand: ${name}
Niche: ${niche}
Value proposition: ${value}
CTA: ${cta}
Keywords: ${keywords.join(', ')}
Tone: ${TONES[tone] || tone}
Use emojis: ${emoji}
Max characters: ${limit}

Return ONLY JSON:
{
  "bios": [
    {
      "bio": "full bio text",
      "charCount": 145,
      "highlights": ["what makes this bio strong"],
      "cta": "the CTA used"
    }
  ]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
      system: 'You are a personal branding expert. Return ONLY valid JSON, no markdown.',
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    return { success: true, platform, ...JSON.parse(text) };
  }

  // ══════════════════════════════════════════════════════════
  // 30-DAY CONTENT CALENDAR
  // ══════════════════════════════════════════════════════════
  async generateContentCalendar(options = {}) {
    const {
      platforms   = ['instagram', 'tiktok'],
      niche       = '',
      goals       = ['grow followers', 'increase engagement'],
      postsPerDay = 1,
      startDate   = new Date().toISOString().split('T')[0],
      brandName   = '',
      topics      = [],
      tone        = 'casual',
    } = options;

    const prompt = `Create a 30-day social media content calendar.

Brand: ${brandName || 'personal brand'}
Niche: ${niche}
Platforms: ${platforms.join(', ')}
Goals: ${goals.join(', ')}
Posts per day: ${postsPerDay}
Tone: ${tone}
Key topics/themes: ${topics.join(', ') || 'auto-generate based on niche'}
Start date: ${startDate}

Plan 30 days of content. Each day should have a theme, content idea, caption hook, and hashtag category.

Return ONLY JSON:
{
  "calendar": [
    {
      "day": 1,
      "date": "2025-01-01",
      "theme": "Motivation Monday",
      "contentType": "carousel|reel|story|post|video",
      "topic": "specific post idea",
      "hook": "opening line",
      "captionBrief": "what the caption should say",
      "hashtagCategory": "motivational|niche|viral",
      "platform": "instagram",
      "goal": "awareness|engagement|conversion",
      "contentPillar": "education|entertainment|inspiration|promotion",
      "visualIdea": "what the image/video should show"
    }
  ],
  "strategy": {
    "contentPillars": ["education", "entertainment", "inspiration", "promotion"],
    "postingFrequency": "${postsPerDay}/day",
    "bestTimes": {"instagram": "6PM-9PM", "tiktok": "7PM-10PM"},
    "weeklyThemes": ["Week 1: Brand intro", "Week 2: Value content"]
  }
}`;

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages:   [{ role: 'user', content: prompt }],
      system:     'You are a social media strategist. Return ONLY valid JSON, no markdown.',
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(text);

    return {
      success:  true,
      niche,
      platforms,
      totalPosts: result.calendar.length,
      ...result,
    };
  }

  // ══════════════════════════════════════════════════════════
  // VIDEO SCRIPT GENERATOR
  // ══════════════════════════════════════════════════════════
  async generateVideoScript(options = {}) {
    const {
      platform    = 'tiktok',
      topic       = '',
      duration    = 60,        // seconds
      tone        = 'casual',
      niche       = '',
      cta         = '',
      style       = 'talking_head', // talking_head / voiceover / text_overlay / tutorial
    } = options;

    const prompt = `Write a ${duration}-second ${platform} ${style} video script about: "${topic}"
Niche: ${niche}
Tone: ${TONES[tone] || tone}
CTA: ${cta || 'follow for more'}

Structure: Hook (3s) → Problem/Context (10s) → Value/Content (40s) → CTA (7s)

Return ONLY JSON:
{
  "script": {
    "hook": {"text": "...", "durationSec": 3, "visualNote": "what to show on screen"},
    "intro": {"text": "...", "durationSec": 5, "visualNote": "..."},
    "body": [
      {"point": "...", "text": "...", "durationSec": 10, "visualNote": "..."}
    ],
    "cta": {"text": "...", "durationSec": 5, "visualNote": "..."},
    "fullScript": "complete spoken script",
    "onScreenText": ["text overlays to add"],
    "musicMood": "upbeat/calm/dramatic",
    "totalDuration": ${duration}
  },
  "caption": "caption to post with this video",
  "hashtags": ["#tag1", "#tag2"],
  "thumbnail": "description of ideal thumbnail"
}`;

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages:   [{ role: 'user', content: prompt }],
      system:     'You are a viral video script writer. Return ONLY valid JSON, no markdown.',
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    return { success: true, platform, topic, duration, ...JSON.parse(text) };
  }

  // ══════════════════════════════════════════════════════════
  // CAPTION TRANSLATOR
  // ══════════════════════════════════════════════════════════
  async translateCaption(caption, targetLanguages, platform = 'instagram') {
    const prompt = `Translate and culturally adapt this ${platform} caption to the following languages.
Keep hashtags in English unless cultural adaptation requires change.
Maintain the same tone, emojis, and engagement style.

Original caption:
${caption}

Target languages: ${targetLanguages.join(', ')}

Return ONLY JSON:
{
  "translations": {
    "en": "${caption}",
    "es": "...",
    "fr": "..."
  }
}`;

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages:   [{ role: 'user', content: prompt }],
      system:     'You are a multilingual social media translator. Return ONLY valid JSON, no markdown.',
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    return { success: true, original: caption, ...JSON.parse(text) };
  }

  // ══════════════════════════════════════════════════════════
  // BRAND VOICE TRAINER
  // Learn from examples and replicate style
  // ══════════════════════════════════════════════════════════
  async trainBrandVoice(exampleCaptions, options = {}) {
    const { newTopic, platform = 'instagram', variants = 3 } = options;

    const prompt = `Analyze these example captions from a brand and learn their unique voice, style, and patterns.
Then generate ${variants} new caption(s) for: "${newTopic}"

EXAMPLE CAPTIONS:
${exampleCaptions.map((c, i) => `${i+1}. ${c}`).join('\n\n')}

Analysis criteria:
- Tone and personality
- Emoji usage pattern
- Sentence structure
- Hashtag style
- CTA style
- Unique phrases/vocabulary

Generate new captions in the EXACT same brand voice for platform: ${platform}

Return ONLY JSON:
{
  "brandVoiceAnalysis": {
    "tone": "description",
    "emojiUsage": "description",
    "uniqueTraits": ["trait1", "trait2"],
    "avgLength": 150
  },
  "captions": [
    {
      "caption": "...",
      "hashtags": ["#tag"],
      "similarityScore": 9
    }
  ]
}`;

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages:   [{ role: 'user', content: prompt }],
      system:     'You are a brand voice specialist. Return ONLY valid JSON, no markdown.',
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    return { success: true, platform, newTopic, ...JSON.parse(text) };
  }

  // ══════════════════════════════════════════════════════════
  // COMPETITOR CAPTION ANALYZER
  // ══════════════════════════════════════════════════════════
  async analyzeCaptionPerformance(captions) {
    const prompt = `Analyze these social media captions and rate their likely performance.

${captions.map((c, i) => `Caption ${i+1}:\n${c}`).join('\n\n---\n\n')}

Return ONLY JSON:
{
  "analysis": [
    {
      "captionIndex": 1,
      "score": 8.5,
      "strengths": ["strong hook", "clear CTA"],
      "weaknesses": ["too long", "generic hashtags"],
      "improvedVersion": "...",
      "predictedEngagement": "high|medium|low",
      "bestPlatform": "instagram|tiktok"
    }
  ],
  "winner": 1,
  "insights": ["key takeaway 1", "key takeaway 2"]
}`;

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages:   [{ role: 'user', content: prompt }],
      system:     'You are a social media analytics expert. Return ONLY valid JSON, no markdown.',
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    return { success: true, ...JSON.parse(text) };
  }

  // ══════════════════════════════════════════════════════════
  // BANNED HASHTAG CHECKER
  // ══════════════════════════════════════════════════════════
  async checkBannedHashtags(hashtags) {
    // Known banned/restricted IG hashtags
    const knownBanned = new Set([
      '#beautyblogger', '#alone', '#always', '#armparty', '#asia',
      '#beautysalon', '#bikinibody', '#brain', '#date', '#desk',
      '#direct', '#dm', '#edits', '#eyes', '#facials', '#fitness',
      '#glutes', '#hardwork', '#iloveyou', '#instant', '#like',
      '#mirrorphoto', '#mustfollow', '#naughty', '#saltwater', '#skype',
      '#snap', '#snowstorm', '#sopretty', '#sunbathing', '#tag',
      '#teens', '#thought', '#todayimwearing', '#valentine', '#woman',
      '#womancrushwednesday', '#workflow',
    ]);

    const results = hashtags.map(tag => {
      const clean = tag.toLowerCase().replace(/^#/, '');
      const withHash = `#${clean}`;
      const banned = knownBanned.has(withHash);
      return {
        tag: withHash,
        status: banned ? 'banned' : 'ok',
        risk: banned ? 'high' : 'low',
      };
    });

    return {
      success: true,
      total: hashtags.length,
      banned: results.filter(r => r.status === 'banned').length,
      safe: results.filter(r => r.status === 'ok').length,
      results,
      recommendation: results.filter(r => r.status === 'ok').map(r => r.tag),
    };
  }

  // ══════════════════════════════════════════════════════════
  // STORY SCRIPT
  // ══════════════════════════════════════════════════════════
  async generateStoryScript(options = {}) {
    const { topic, slides = 5, platform = 'instagram', niche = '', includePoll = false, includeLink = false } = options;

    const prompt = `Create a ${slides}-slide ${platform} story sequence about: "${topic}"
Niche: ${niche}
${includePoll ? 'Include a poll slide' : ''}
${includeLink ? 'Include a swipe-up/link slide' : ''}

Return ONLY JSON:
{
  "slides": [
    {
      "slideNumber": 1,
      "type": "hook|content|value|poll|question|cta|link",
      "text": "text overlay for this slide",
      "background": "color or image description",
      "sticker": "poll|question|countdown|none",
      "stickerConfig": {"question": "...", "option1": "Yes", "option2": "No"},
      "duration": 5,
      "visualNote": "what to show"
    }
  ],
  "strategy": "why this sequence works",
  "hashtags": ["#tag1"]
}`;

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages:   [{ role: 'user', content: prompt }],
      system:     'You are a story content strategist. Return ONLY valid JSON, no markdown.',
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    return { success: true, topic, platform, ...JSON.parse(text) };
  }
}

module.exports = new AICaptionService();
