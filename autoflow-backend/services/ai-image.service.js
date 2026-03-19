/**
 * ══════════════════════════════════════════════════════════
 * AI IMAGE GENERATOR SERVICE
 * Free providers:
 *   1. Pollinations.ai   — 100% free, no API key
 *   2. Stable Diffusion  — self-hosted (local) or free APIs
 *   3. Hugging Face      — free inference API
 *   4. Craiyon           — free (slower)
 * ══════════════════════════════════════════════════════════
 */

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { delay } = require('../utils/helpers');

// Ensure output directory exists
const IMG_DIR = './uploads/ai-images';
if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

class AIImageService {

  // ══════════════════════════════════════════════════════════
  // 1. POLLINATIONS.AI — 100% FREE, NO API KEY REQUIRED
  //    Best for: Quick generation, good quality, no limits
  // ══════════════════════════════════════════════════════════
  async generatePollinations(prompt, options = {}) {
    const {
      width  = 1024,
      height = 1024,
      seed   = Math.floor(Math.random() * 999999),
      model  = 'flux',       // flux, flux-realism, flux-cablyai, turbo
      nologo = true,
      enhance = false,
    } = options;

    const encodedPrompt = encodeURIComponent(prompt);
    const params = new URLSearchParams({
      width, height, seed, model,
      nologo:  nologo  ? 'true' : 'false',
      enhance: enhance ? 'true' : 'false',
    });

    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?${params}`;

    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: { 'User-Agent': 'AutoFlow/3.0' },
      });

      const filename = `pollinations_${Date.now()}_${seed}.jpg`;
      const filepath = path.join(IMG_DIR, filename);
      fs.writeFileSync(filepath, response.data);

      return {
        success:  true,
        provider: 'pollinations',
        url:      `${process.env.BASE_URL || 'http://localhost:5000'}/uploads/ai-images/${filename}`,
        filepath,
        prompt,
        model,
        seed,
        width, height,
      };
    } catch (err) {
      logger.error(`Pollinations error: ${err.message}`);
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════
  // 2. HUGGING FACE FREE INFERENCE API
  //    Sign up: https://huggingface.co (free, no credit card)
  //    Models: stable-diffusion-xl, realistic-vision, etc.
  // ══════════════════════════════════════════════════════════
  async generateHuggingFace(prompt, options = {}) {
    const {
      model          = 'stabilityai/stable-diffusion-xl-base-1.0',
      negativePrompt = 'blurry, bad quality, deformed, ugly',
      steps          = 20,
      guidanceScale  = 7.5,
    } = options;

    if (!process.env.HUGGINGFACE_API_KEY) {
      throw new Error('HUGGINGFACE_API_KEY not set — sign up free at huggingface.co');
    }

    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        inputs: prompt,
        parameters: {
          negative_prompt: negativePrompt,
          num_inference_steps: steps,
          guidance_scale: guidanceScale,
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 120000,
      }
    );

    const filename = `hf_${Date.now()}.jpg`;
    const filepath = path.join(IMG_DIR, filename);
    fs.writeFileSync(filepath, response.data);

    return {
      success:  true,
      provider: 'huggingface',
      model,
      url:      `${process.env.BASE_URL}/uploads/ai-images/${filename}`,
      filepath,
      prompt,
    };
  }

  // ══════════════════════════════════════════════════════════
  // 3. LOCAL STABLE DIFFUSION (self-hosted, fully free)
  //    Setup: Install automatic1111 or ComfyUI locally
  //    Then run: python launch.py --api
  // ══════════════════════════════════════════════════════════
  async generateLocalSD(prompt, options = {}) {
    const sdUrl = process.env.SD_API_URL || 'http://127.0.0.1:7860';
    const {
      negativePrompt = 'ugly, blurry, deformed, extra limbs, text, watermark',
      steps          = 25,
      cfgScale       = 7,
      width          = 512,
      height         = 512,
      sampler        = 'DPM++ 2M Karras',
    } = options;

    const response = await axios.post(`${sdUrl}/sdapi/v1/txt2img`, {
      prompt,
      negative_prompt: negativePrompt,
      steps,
      cfg_scale:       cfgScale,
      width,
      height,
      sampler_name:    sampler,
    }, { timeout: 120000 });

    const base64 = response.data.images[0];
    const filename = `sd_local_${Date.now()}.png`;
    const filepath = path.join(IMG_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(base64, 'base64'));

    return {
      success:  true,
      provider: 'stable-diffusion-local',
      url:      `${process.env.BASE_URL}/uploads/ai-images/${filename}`,
      filepath,
      prompt,
    };
  }

  // ══════════════════════════════════════════════════════════
  // 4. TOGETHER.AI FREE CREDITS ($25 free on signup)
  //    Models: SDXL, Flux, Kandinsky
  // ══════════════════════════════════════════════════════════
  async generateTogetherAI(prompt, options = {}) {
    if (!process.env.TOGETHER_API_KEY) throw new Error('TOGETHER_API_KEY not set');

    const { model = 'black-forest-labs/FLUX.1-schnell', width = 1024, height = 1024, steps = 4 } = options;

    const response = await axios.post('https://api.together.xyz/v1/images/generations', {
      prompt, model, width, height, steps, n: 1,
    }, {
      headers: { Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 60000,
    });

    const imageUrl = response.data.data[0].url;
    const imgData  = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const filename = `together_${Date.now()}.png`;
    const filepath = path.join(IMG_DIR, filename);
    fs.writeFileSync(filepath, imgData.data);

    return {
      success: true, provider: 'together-ai', model, url: `${process.env.BASE_URL}/uploads/ai-images/${filename}`, filepath, prompt,
    };
  }

  // ══════════════════════════════════════════════════════════
  // SMART AUTO-PICKER: Tries providers in priority order
  // ══════════════════════════════════════════════════════════
  async generate(prompt, options = {}) {
    const { provider = 'auto' } = options;

    // Direct provider selection
    if (provider === 'pollinations') return this.generatePollinations(prompt, options);
    if (provider === 'huggingface')  return this.generateHuggingFace(prompt, options);
    if (provider === 'local-sd')     return this.generateLocalSD(prompt, options);
    if (provider === 'together')     return this.generateTogetherAI(prompt, options);

    // Auto: try in order of reliability
    const providers = [
      () => this.generatePollinations(prompt, options),
      process.env.HUGGINGFACE_API_KEY ? () => this.generateHuggingFace(prompt, options) : null,
      process.env.TOGETHER_API_KEY    ? () => this.generateTogetherAI(prompt, options)  : null,
      process.env.SD_API_URL          ? () => this.generateLocalSD(prompt, options)     : null,
    ].filter(Boolean);

    let lastError;
    for (const tryProvider of providers) {
      try {
        return await tryProvider();
      } catch (err) {
        lastError = err;
        logger.warn(`AI image provider failed, trying next: ${err.message}`);
        await delay(1000);
      }
    }

    throw lastError || new Error('All AI image providers failed');
  }

  // ══════════════════════════════════════════════════════════
  // SOCIAL MEDIA OPTIMIZED GENERATION
  // Auto-sizes and applies platform-specific prompting
  // ══════════════════════════════════════════════════════════
  async generateForPlatform(prompt, platform, options = {}) {
    const platformConfigs = {
      instagram:  { width: 1080, height: 1080, suffix: 'instagram post, vibrant, high quality, professional photography' },
      instagram_story: { width: 1080, height: 1920, suffix: 'instagram story, vertical format, engaging' },
      facebook:   { width: 1200, height: 630,  suffix: 'facebook post, clean, professional' },
      twitter:    { width: 1200, height: 675,  suffix: 'twitter post, eye-catching, social media' },
      linkedin:   { width: 1200, height: 627,  suffix: 'linkedin professional post, business, clean' },
      whatsapp:   { width: 800,  height: 800,  suffix: 'whatsapp, clear, simple' },
      youtube:    { width: 1280, height: 720,  suffix: 'youtube thumbnail, bold, clickbait style, text overlay' },
      tiktok:     { width: 1080, height: 1920, suffix: 'tiktok vertical video thumbnail, trending, youth' },
    };

    const config = platformConfigs[platform] || platformConfigs.instagram;
    const enhancedPrompt = `${prompt}, ${config.suffix}`;

    return this.generate(enhancedPrompt, { ...options, width: config.width, height: config.height });
  }

  // ══════════════════════════════════════════════════════════
  // BATCH GENERATE — Multiple variations
  // ══════════════════════════════════════════════════════════
  async generateBatch(prompt, count = 4, options = {}) {
    const images = [];
    const seeds  = Array.from({ length: count }, () => Math.floor(Math.random() * 999999));

    for (const seed of seeds) {
      try {
        const img = await this.generate(prompt, { ...options, seed });
        images.push(img);
        await delay(1000);
      } catch (err) {
        logger.error(`Batch generate error: ${err.message}`);
      }
    }

    return images;
  }

  // ══════════════════════════════════════════════════════════
  // AI PROMPT ENHANCER
  // Takes a simple idea and turns it into a detailed prompt
  // ══════════════════════════════════════════════════════════
  async enhancePrompt(simplePrompt, style = 'photorealistic') {
    const AIService = require('./index').AIService;
    const styleGuides = {
      photorealistic: 'photorealistic, 8k, professional photography, perfect lighting, sharp focus',
      illustration:   'digital illustration, vector art, flat design, colorful, professional',
      cartoon:        'cartoon style, vibrant colors, fun, animated, Disney-like',
      minimalist:     'minimalist design, clean, white background, simple shapes, modern',
      cinematic:      'cinematic, dramatic lighting, film still, movie quality, epic',
      product:        'product photography, studio lighting, white background, commercial quality',
    };

    const enhancedPrompt = await AIService.chat(
      `Enhance this image prompt for AI art generation: "${simplePrompt}". Style: ${style}. Return ONLY the enhanced prompt, no explanation.`,
      [],
      'You are an expert AI art prompt engineer. Generate detailed, vivid prompts.'
    );

    return {
      original: simplePrompt,
      enhanced: `${enhancedPrompt}, ${styleGuides[style] || styleGuides.photorealistic}`,
      style,
    };
  }

  // ══════════════════════════════════════════════════════════
  // DELETE OLD IMAGES (cleanup)
  // ══════════════════════════════════════════════════════════
  async cleanupOldImages(daysOld = 7) {
    const files   = fs.readdirSync(IMG_DIR);
    const cutoff  = Date.now() - daysOld * 86400000;
    let deleted   = 0;

    for (const file of files) {
      const filepath = path.join(IMG_DIR, file);
      const stat     = fs.statSync(filepath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filepath);
        deleted++;
      }
    }

    return { deleted };
  }
}

module.exports = new AIImageService();
