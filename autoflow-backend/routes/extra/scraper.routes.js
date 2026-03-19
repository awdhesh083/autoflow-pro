'use strict';
const express = require('express');
const { authenticate } = require('../../middleware/auth');
const LeadScraper = require('../../services/scrapers/lead-scraper.service');

const router = express.Router();
router.use(authenticate);

// Google Maps
router.post('/google-maps', async (req, res) => {
  const { query, location, limit = 50, saveToList } = req.body;
  if (!query || !location) return res.status(400).json({ success: false, message: 'query and location required' });
  const leads = await LeadScraper.scrapeGoogleMaps(query, location, +limit);
  let saved = null;
  if (saveToList) saved = await LeadScraper.saveLeadsToContacts(leads, req.user._id, saveToList, { tag: 'google_maps' });
  res.json({ success: true, data: leads, count: leads.length, saved });
});

// Yellow Pages
router.post('/yellow-pages', async (req, res) => {
  const { category, location, limit = 50, saveToList } = req.body;
  const leads = await LeadScraper.scrapeYellowPages(category, location, +limit);
  let saved = null;
  if (saveToList) saved = await LeadScraper.saveLeadsToContacts(leads, req.user._id, saveToList, { tag: 'yellow_pages' });
  res.json({ success: true, data: leads, count: leads.length, saved });
});

// Website email extractor
router.post('/website', async (req, res) => {
  const { url, urls } = req.body;
  if (urls?.length) {
    const results = await LeadScraper.scrapeMultipleWebsites(urls);
    return res.json({ success: true, data: results, count: results.length });
  }
  if (!url) return res.status(400).json({ success: false, message: 'url or urls required' });
  const result = await LeadScraper.scrapeWebsite(url);
  res.json({ success: true, data: result });
});

// Instagram bio scraper
router.post('/instagram-bios', async (req, res) => {
  const { usernames, saveToList } = req.body;
  if (!usernames?.length) return res.status(400).json({ success: false, message: 'usernames required' });
  const leads = await LeadScraper.scrapeInstagramBios(usernames);
  let saved = null;
  if (saveToList) saved = await LeadScraper.saveLeadsToContacts(leads, req.user._id, saveToList, { tag: 'instagram' });
  res.json({ success: true, data: leads, count: leads.length, saved });
});

// Google search
router.post('/google-search', async (req, res) => {
  const { query, limit = 50, saveToList } = req.body;
  const leads = await LeadScraper.scrapeGoogleSearch(query, +limit);
  let saved = null;
  if (saveToList && Array.isArray(leads)) {
    saved = await LeadScraper.saveLeadsToContacts(leads, req.user._id, saveToList);
  }
  res.json({ success: true, data: leads, count: Array.isArray(leads) ? leads.length : 0, saved });
});

// Pipeline (scrape + save in one call)
router.post('/pipeline', async (req, res) => {
  const { source, params, listId } = req.body;
  const result = await LeadScraper.runPipeline(source, params, req.user._id, listId);
  res.json({ success: true, data: result });
});

module.exports = router;
