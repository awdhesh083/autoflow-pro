'use strict';
const Anthropic = require('@anthropic-ai/sdk');
const Sentiment = require('sentiment');

const anthropic         = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sentimentAnalyzer = new Sentiment();

const AIService = {
  async generateContent({ type='post', platform='general', tone='engaging', language='en', length='medium', context='', keywords=[] }) {
    const lengthMap = { short: '50-100', medium: '100-250', long: '250-500' };
    const charLimit = lengthMap[length] || '100-250';
    const system    = `You are AutoFlow's AI content engine. Generate high-converting ${platform} content for marketing automation.`;
    const prompt    = `Generate a ${tone} ${type} for ${platform}.
Language: ${language}. Length: ${charLimit} chars.
${context ? `Context: ${context}` : ''}
${keywords.length ? `Keywords: ${keywords.join(', ')}` : ''}
Use emojis where appropriate. Make it engaging and action-oriented.
Return JSON only: { "content": "...", "hashtags": [...], "cta": "..." }`;

    const msg  = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1000, system, messages: [{ role: 'user', content: prompt }] });
    const text = msg.content[0].text;
    try { return JSON.parse(text); } catch { return { content: text, hashtags: [], cta: '' }; }
  },

  async generateSubjectLines(topic, tone = 'professional', count = 5) {
    const msg  = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 500,
      messages: [{ role: 'user', content: `Generate ${count} email subject lines for: "${topic}". Tone: ${tone}. Return as JSON array of strings only.` }],
    });
    const text = msg.content[0].text;
    try { return JSON.parse(text.match(/\[.*\]/s)?.[0] || '[]'); } catch { return [text]; }
  },

  analyzeSentiment(text) {
    const r = sentimentAnalyzer.analyze(text);
    return {
      score:       r.score,
      comparative: r.comparative,
      sentiment:   r.score > 1 ? 'positive' : r.score < -1 ? 'negative' : 'neutral',
      tokens:      r.tokens,
      positive:    r.positive,
      negative:    r.negative,
    };
  },

  async chat(message, history = [], systemPrompt = '') {
    const messages = [
      ...(history || []).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];
    const resp = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1500,
      system:     systemPrompt || 'You are AutoFlow AI Pro — expert social media automation, marketing, and analytics assistant. Be helpful, concise, and action-oriented.',
      messages,
    });
    return resp.content[0].text;
  },

  async generateHashtags(topic, platform = 'instagram', count = 20) {
    const text = await this.chat(`Generate ${count} trending hashtags for ${platform} about "${topic}". Return only hashtags, one per line, with # symbol.`);
    return text.split('\n').map(t => t.trim()).filter(t => t.startsWith('#'));
  },
};

module.exports = AIService;
