'use strict';
/**
 * i18n Middleware
 * Reads Accept-Language header or ?lang= query param → sets req.lang.
 * Used by routes to return error messages in the user's language.
 *
 * Usage in routes:
 *   const { msg } = require('../middleware/i18n');
 *   return res.status(401).json({ success:false, message: msg(req, 'invalid_credentials') });
 */

const MESSAGES = {
  en: {
    // Auth
    invalid_credentials:      'Invalid credentials',
    account_locked:           'Account locked — try again in 15 minutes',
    email_already_registered: 'Email already registered',
    invalid_refresh_token:    'Invalid or expired refresh token',
    password_incorrect:       'Current password incorrect',
    password_updated:         'Password updated successfully',
    reset_link_sent:          'If that email exists, a reset link has been sent',
    reset_link_invalid:       'Reset link is invalid or has expired',
    password_reset_done:      'Password reset successfully — you can now log in',
    email_verified:           'Email verified successfully',
    email_verify_invalid:     'Verification link is invalid or expired',
    two_factor_required:      'Enter your 2FA code',
    two_factor_invalid:       'Invalid 2FA code',
    backup_code_invalid:      'Invalid backup code',
    two_fa_already_enabled:   '2FA is already enabled',
    two_fa_setup_first:       'Run /2fa/setup first',
    two_fa_enabled:           '2FA enabled',
    two_fa_disabled:          '2FA disabled',
    // Resources
    not_found:                'Not found',
    unauthorized:             'Unauthorised — please log in',
    forbidden:                'You do not have permission to do this',
    validation_error:         'Validation error',
    rate_limit_exceeded:      'Rate limit exceeded — slow down',
    // Contacts
    contact_not_found:        'Contact not found',
    contact_created:          'Contact added',
    contact_deleted:          'Contact deleted',
    // Campaigns
    campaign_not_found:       'Campaign not found',
    campaign_launched:        'Campaign launched',
    campaign_paused:          'Campaign paused',
    campaign_duplicated:      'Campaign duplicated',
    // Generic
    server_error:             'Something went wrong — please try again',
    smtp_error:               'Failed to send email — check SMTP config',
  },

  hi: {
    // Auth
    invalid_credentials:      'अमान्य क्रेडेंशियल',
    account_locked:           'अकाउंट लॉक है — 15 मिनट बाद पुनः प्रयास करें',
    email_already_registered: 'यह ईमेल पहले से पंजीकृत है',
    invalid_refresh_token:    'अमान्य या समाप्त रिफ्रेश टोकन',
    password_incorrect:       'वर्तमान पासवर्ड गलत है',
    password_updated:         'पासवर्ड सफलतापूर्वक अपडेट किया गया',
    reset_link_sent:          'अगर यह ईमेल मौजूद है, तो रीसेट लिंक भेज दिया गया है',
    reset_link_invalid:       'रीसेट लिंक अमान्य या समाप्त हो गया है',
    password_reset_done:      'पासवर्ड सफलतापूर्वक रीसेट — अब लॉग इन करें',
    email_verified:           'ईमेल सफलतापूर्वक सत्यापित',
    email_verify_invalid:     'सत्यापन लिंक अमान्य या समाप्त हो गया है',
    two_factor_required:      'अपना 2FA कोड दर्ज करें',
    two_factor_invalid:       'अमान्य 2FA कोड',
    backup_code_invalid:      'अमान्य बैकअप कोड',
    two_fa_already_enabled:   '2FA पहले से सक्षम है',
    two_fa_setup_first:       'पहले /2fa/setup चलाएं',
    two_fa_enabled:           '2FA सक्षम किया गया',
    two_fa_disabled:          '2FA अक्षम किया गया',
    // Resources
    not_found:                'नहीं मिला',
    unauthorized:             'अनधिकृत — कृपया लॉग इन करें',
    forbidden:                'इस कार्य की अनुमति नहीं है',
    validation_error:         'वैलिडेशन त्रुटि',
    rate_limit_exceeded:      'अनुरोध सीमा पार — कृपया धीरे करें',
    // Contacts
    contact_not_found:        'संपर्क नहीं मिला',
    contact_created:          'संपर्क जोड़ा गया',
    contact_deleted:          'संपर्क हटाया गया',
    // Campaigns
    campaign_not_found:       'अभियान नहीं मिला',
    campaign_launched:        'अभियान शुरू किया गया',
    campaign_paused:          'अभियान रोका गया',
    campaign_duplicated:      'अभियान की कॉपी बनाई गई',
    // Generic
    server_error:             'कुछ गलत हो गया — कृपया पुनः प्रयास करें',
    smtp_error:               'ईमेल भेजने में विफल — SMTP कॉन्फ़िग जांचें',
  },
};

/**
 * Express middleware — sets req.lang from:
 *   1. ?lang= query param (explicit override)
 *   2. Accept-Language header (browser preference)
 *   3. Default: 'en'
 */
function i18nMiddleware(req, _res, next) {
  const query  = req.query?.lang;
  const header = req.headers['accept-language'];

  if (query && MESSAGES[query]) {
    req.lang = query;
  } else if (header) {
    // Parse "hi-IN,hi;q=0.9,en;q=0.8" → ['hi', 'en']
    const preferred = header.split(',')
      .map(s => s.split(';')[0].trim().split('-')[0].toLowerCase())
      .find(l => MESSAGES[l]);
    req.lang = preferred || 'en';
  } else {
    req.lang = 'en';
  }

  next();
}

/**
 * Helper — get translated message string.
 * @param {object} req   — Express request (has req.lang)
 * @param {string} key   — message key
 * @param {string} fallback — raw string if key not found
 */
function msg(req, key, fallback) {
  const lang   = req?.lang || 'en';
  const locale = MESSAGES[lang] || MESSAGES.en;
  return locale[key] || MESSAGES.en[key] || fallback || key;
}

module.exports = { i18nMiddleware, msg, MESSAGES };
