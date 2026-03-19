'use strict';
const express = require('express');
const { body } = require('express-validator');
const { authenticate, validate } = require('../middleware/auth');
const AIService = require('../services/ai.service');
const { personalizeText } = require('../utils/helpers');

const router = express.Router();
router.use(authenticate);

// POST /generate - content generation
router.post('/generate', async (req, res) => {
  const { type, platform, tone, language, length, context, keywords } = req.body;
  const result = await AIService.generateContent({ type, platform, tone, language, length, context, keywords });
  res.json({ success:true, data:result });
});

// POST /subject-lines
router.post('/subject-lines', async (req, res) => {
  const { topic, tone, count=5 } = req.body;
  const subjects = await AIService.generateSubjectLines(topic, tone, count);
  res.json({ success:true, data:subjects });
});

// POST /personalize
router.post('/personalize', async (req, res) => {
  const { template, contactData } = req.body;
  const personalized = personalizeText(template, contactData);
  res.json({ success:true, data:{ personalized } });
});

// POST /sentiment
router.post('/analyze-sentiment', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ success:false, message:'text required' });
  const result = await AIService.analyzeSentiment(text);
  res.json({ success:true, data:result });
});

// POST /chatbot
router.post('/chatbot', async (req, res) => {
  const { message, history, systemPrompt } = req.body;
  if (!message) return res.status(400).json({ success:false, message:'message required' });
  const reply = await AIService.chat(message, history, systemPrompt);
  res.json({ success:true, data:{ reply } });
});

// POST /hashtags
router.post('/hashtags', async (req, res) => {
  const { topic, platform='instagram', count=20 } = req.body;
  const text = await AIService.chat(`Generate ${count} trending hashtags for ${platform} about "${topic}". Return only the hashtags, one per line, with # symbol.`);
  const tags  = text.split('\n').map(t=>t.trim()).filter(t=>t.startsWith('#'));
  res.json({ success:true, data:tags });
});

// POST /caption
router.post('/caption', async (req, res) => {
  const { topic, platform='instagram', tone='engaging', count=3 } = req.body;
  const result = await AIService.generateContent({ type:'caption', platform, tone, context:topic, length:'short' });
  res.json({ success:true, data:result });
});

module.exports = router;
