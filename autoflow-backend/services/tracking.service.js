'use strict';
/**
 * Attribution Tracking Service
 *
 * Dispatches server-side events to:
 *   1. Google Analytics 4  — Measurement Protocol
 *   2. Meta Conversions API — server-side pixel events
 *
 * Both APIs bypass ad blockers and iOS 14+ privacy restrictions.
 *
 * Setup:
 *   GA4_MEASUREMENT_ID   = G-XXXXXXXXXX
 *   GA4_API_SECRET       = from GA4 Admin → Data Streams → Measurement Protocol API Secrets
 *   META_PIXEL_ID        = your 15-digit pixel ID
 *   META_CAPI_TOKEN      = from Events Manager → Settings → Conversions API
 *
 * Usage:
 *   await TrackingService.trackCampaignEvent(campaign, 'campaign_send', { sent: 100 });
 *   await TrackingService.trackConversion(contact, campaign, 'purchase', { value: 499, currency: 'INR' });
 */
const https   = require('https');
const crypto  = require('crypto');
const logger  = require('../utils/logger');

// ── Helpers ───────────────────────────────────────────────────────────────
function sha256(value) {
  return value ? crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex') : undefined;
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const opts = new URL(url);
    const req  = https.request({
      hostname: opts.hostname,
      path:     opts.pathname + opts.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Google Analytics 4 — Measurement Protocol ─────────────────────────────
const GA4 = {
  isConfigured() {
    return !!(process.env.GA4_MEASUREMENT_ID && process.env.GA4_API_SECRET);
  },

  /**
   * Send a GA4 event via Measurement Protocol.
   * Docs: https://developers.google.com/analytics/devguides/collection/protocol/ga4
   */
  async send(clientId, eventName, params = {}) {
    if (!this.isConfigured()) return { skipped: true, reason: 'no_ga4_config' };

    const measurementId = process.env.GA4_MEASUREMENT_ID;
    const apiSecret     = process.env.GA4_API_SECRET;

    const url  = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;
    const body = {
      client_id: clientId || 'autoflow-server',
      non_personalized_ads: false,
      events: [{
        name:   eventName,
        params: {
          engagement_time_msec: 100,
          session_id:           Date.now().toString(),
          ...params,
        },
      }],
    };

    try {
      const r = await postJson(url, body);
      if (r.status >= 400) {
        logger.warn(`GA4 Measurement Protocol error: ${r.status} ${r.body}`);
        return { success: false, status: r.status };
      }
      return { success: true, status: r.status };
    } catch (err) {
      logger.error(`GA4 send error: ${err.message}`);
      return { success: false, error: err.message };
    }
  },

  /**
   * Track a campaign event in GA4.
   * Maps AutoFlow events → GA4 event names.
   */
  async trackCampaign(campaign, event, data = {}) {
    if (!this.isConfigured()) return;

    const GA4_EVENT_MAP = {
      campaign_launched:   'campaign_launch',
      campaign_completed:  'campaign_complete',
      message_sent:        'message_sent',
      message_opened:      'email_open',
      message_clicked:     'email_click',
      message_replied:     'message_reply',
      conversion:          'purchase',
    };

    const eventName = GA4_EVENT_MAP[event] || event;
    const params    = {
      campaign_id:     String(campaign._id),
      campaign_name:   campaign.name,
      campaign_type:   campaign.type,
      content_type:    campaign.type,
      ...data,
    };

    return this.send(`campaign-${campaign._id}`, eventName, params);
  },
};

// ── Meta Conversions API ───────────────────────────────────────────────────
const MetaPixel = {
  isConfigured() {
    return !!(process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN);
  },

  /**
   * Send a server-side event to Meta Conversions API.
   * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
   */
  async send(eventName, userData = {}, customData = {}, eventSourceUrl = '') {
    if (!this.isConfigured()) return { skipped: true, reason: 'no_meta_config' };

    const pixelId  = process.env.META_PIXEL_ID;
    const token    = process.env.META_CAPI_TOKEN;
    const testCode = process.env.META_TEST_EVENT_CODE; // optional — for testing

    const url  = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`;
    const body = {
      data: [{
        event_name:        eventName,
        event_time:        Math.floor(Date.now() / 1000),
        event_source_url:  eventSourceUrl || `${process.env.BASE_URL || 'https://autoflow.io'}/`,
        action_source:     'website',
        user_data: {
          em:  userData.email   ? [sha256(userData.email)]  : undefined,
          ph:  userData.phone   ? [sha256(userData.phone)]  : undefined,
          fn:  userData.name    ? [sha256(userData.name.split(' ')[0])] : undefined,
          ln:  userData.name    ? [sha256(userData.name.split(' ').slice(1).join(' '))] : undefined,
          client_ip_address: userData.ip        || undefined,
          client_user_agent: userData.userAgent || undefined,
          fbp:               userData.fbp       || undefined, // Facebook browser ID cookie
          fbc:               userData.fbc       || undefined, // Facebook click ID
        },
        custom_data: {
          currency: customData.currency || 'USD',
          value:    customData.value    || 0,
          ...customData,
        },
      }],
      ...(testCode ? { test_event_code: testCode } : {}),
    };

    try {
      const r = await postJson(url, body);
      const parsed = JSON.parse(r.body);
      if (r.status >= 400) {
        logger.warn(`Meta CAPI error: ${r.status} ${r.body}`);
        return { success: false, status: r.status, body: parsed };
      }
      return { success: true, events_received: parsed.events_received };
    } catch (err) {
      logger.error(`Meta CAPI error: ${err.message}`);
      return { success: false, error: err.message };
    }
  },

  /**
   * Track a campaign conversion event.
   * Call this when a contact from a campaign completes a meaningful action.
   */
  async trackConversion(contact, campaign, value = 0, currency = 'USD') {
    if (!this.isConfigured()) return;
    return this.send(
      'Purchase',
      { email: contact.email, phone: contact.phone, name: contact.name },
      { value, currency, content_name: campaign?.name, campaign_id: String(campaign?._id || '') }
    );
  },

  async trackLead(contact, campaign) {
    if (!this.isConfigured()) return;
    return this.send(
      'Lead',
      { email: contact.email, phone: contact.phone, name: contact.name },
      { campaign_id: String(campaign?._id || ''), campaign_name: campaign?.name }
    );
  },

  async trackViewContent(contact, campaignName) {
    if (!this.isConfigured()) return;
    return this.send(
      'ViewContent',
      { email: contact.email, phone: contact.phone },
      { content_name: campaignName }
    );
  },
};

// ── Unified TrackingService ────────────────────────────────────────────────
const TrackingService = {
  GA4,
  MetaPixel,
  isAnyConfigured: () => GA4.isConfigured() || MetaPixel.isConfigured(),

  /**
   * Track a campaign event to all configured destinations simultaneously.
   */
  async trackCampaignEvent(campaign, event, data = {}) {
    if (!this.isAnyConfigured()) return;
    const results = await Promise.allSettled([
      GA4.trackCampaign(campaign, event, data),
    ]);
    return results;
  },

  /**
   * Track a conversion (purchase / signup) from a campaign.
   * Fires to both GA4 and Meta.
   */
  async trackConversion(contact, campaign, eventType = 'purchase', data = {}) {
    if (!this.isAnyConfigured()) return;
    const results = await Promise.allSettled([
      GA4.trackCampaign(campaign, 'conversion', { ...data, contact_id: String(contact._id) }),
      MetaPixel.trackConversion(contact, campaign, data.value || 0, data.currency || 'USD'),
    ]);
    return results;
  },

  /**
   * Track a lead scraped or imported into CRM.
   */
  async trackLead(contact, campaign) {
    if (!this.isAnyConfigured()) return;
    await Promise.allSettled([
      GA4.send(`contact-${contact._id}`, 'generate_lead', {
        campaign_id:   String(campaign?._id || ''),
        campaign_name: campaign?.name || '',
        contact_id:    String(contact._id),
      }),
      MetaPixel.trackLead(contact, campaign),
    ]);
  },

  /**
   * Check configuration status (for settings UI).
   */
  getStatus() {
    return {
      ga4: {
        configured: GA4.isConfigured(),
        measurementId: process.env.GA4_MEASUREMENT_ID || null,
      },
      meta: {
        configured: MetaPixel.isConfigured(),
        pixelId: process.env.META_PIXEL_ID || null,
      },
    };
  },
};

module.exports = TrackingService;
