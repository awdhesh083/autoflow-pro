/**
 * Email Service
 * Supports: SMTP (nodemailer), SendGrid, Mailgun, Amazon SES
 * Features: bulk sending, tracking, templates, drip sequences, bounce handling
 */
const nodemailer = require('nodemailer');
const sgMail     = require('@sendgrid/mail');
const AWS        = require('aws-sdk');
const crypto     = require('crypto');
const logger     = require('../utils/logger');
const { delay, randomDelay, personalizeText, trackingPixel, wrapLinks } = require('../utils/helpers');
const { MessageLog, Contact, Campaign, SmtpProfile } = require('../models');

class EmailService {
  constructor() {
    this.transports = new Map();   // smtpProfileId → nodemailer transport
    this._initDefaultTransport();
  }

  // ── Initialize default SMTP transport ──────────────────
  _initDefaultTransport() {
    if (!process.env.SMTP_HOST) return;

    const transport = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      pool: true,
      maxConnections: 5,
      maxMessages:    100,
      rateLimit:      14,    // max 14 messages/second
      tls: { rejectUnauthorized: false },
    });

    this.transports.set('default', transport);

    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    }
  }

  // ── Get/create transport for SMTP profile ──────────────
  async _getTransport(smtpProfileId) {
    if (!smtpProfileId) return this.transports.get('default');

    if (this.transports.has(smtpProfileId)) {
      return this.transports.get(smtpProfileId);
    }

    const profile = await SmtpProfile.findById(smtpProfileId);
    if (!profile) throw new Error('SMTP profile not found');

    let transport;
    if (profile.provider === 'smtp') {
      transport = nodemailer.createTransport({
        host:   profile.host,
        port:   profile.port || 587,
        secure: profile.secure || false,
        auth:   { user: profile.auth.user, pass: profile.auth.pass },
        pool:   true,
        tls:    { rejectUnauthorized: false },
      });
    } else if (profile.provider === 'sendgrid') {
      sgMail.setApiKey(profile.apiKey);
      transport = { provider: 'sendgrid', fromEmail: profile.fromEmail, fromName: profile.fromName };
    } else if (profile.provider === 'mailgun') {
      const mailgun = require('mailgun-js')({ apiKey: profile.apiKey, domain: profile.domain });
      transport = { provider: 'mailgun', mailgun, fromEmail: profile.fromEmail, fromName: profile.fromName };
    } else if (profile.provider === 'ses') {
      const ses  = new AWS.SES({ region: profile.region || 'us-east-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY });
      transport = nodemailer.createTransport({ SES: { ses, aws: AWS } });
    }

    if (transport) this.transports.set(smtpProfileId, transport);
    return transport;
  }

  // ── Send single email ───────────────────────────────────
  async sendEmail({ to, from, fromName, subject, html, text, replyTo, attachments, headers, smtpProfileId, trackingId }) {
    const transport = await this._getTransport(smtpProfileId);
    if (!transport) throw new Error('No email transport configured');

    // Inject tracking pixel for open tracking
    if (trackingId && html) {
      html += trackingPixel(trackingId);
    }

    // Wrap links for click tracking
    if (trackingId && html) {
      html = wrapLinks(html, trackingId);
    }

    const mailOptions = {
      from:        fromName ? `"${fromName}" <${from}>` : from,
      to,
      subject,
      html:        html || `<pre>${text}</pre>`,
      text:        text || '',
      replyTo:     replyTo || from,
      attachments: attachments || [],
      headers: {
        'X-Mailer':     'AutoFlow Pro v3',
        'X-Campaign-Id': trackingId || '',
        'List-Unsubscribe': `<mailto:unsubscribe@${from.split('@')[1]}>, <https://your-domain.com/unsubscribe/${trackingId}>`,
        ...headers,
      },
    };

    // Use provider-specific sender
    if (transport.provider === 'sendgrid') {
      const msg = {
        to, from: { email: from, name: fromName },
        subject, html: html || '', text: text || '',
        trackingSettings: {
          clickTracking:  { enable: !!trackingId },
          openTracking:   { enable: !!trackingId },
        },
        customArgs: { campaign_id: trackingId || '' },
      };
      const [response] = await sgMail.send(msg);
      return { success: true, messageId: response.headers['x-message-id'], provider: 'sendgrid' };
    }

    if (transport.provider === 'mailgun') {
      const data = { from: `${fromName} <${from}>`, to, subject, html, text };
      const res  = await transport.mailgun.messages().send(data);
      return { success: true, messageId: res.id, provider: 'mailgun' };
    }

    // nodemailer (SMTP / SES)
    const info = await transport.sendMail(mailOptions);
    return { success: true, messageId: info.messageId, provider: 'smtp', response: info.response };
  }

  // ── Bulk email campaign ─────────────────────────────────
  async sendBulk(campaign, contacts, options = {}) {
    const {
      smtpProfileId,
      fromEmail,
      fromName,
      replyTo,
      subject,
      htmlTemplate,
      textTemplate,
      delayMin    = 500,
      delayMax    = 2000,
      trackOpens  = true,
      trackClicks = true,
      unsubFooter = true,
    } = options;

    const results  = { sent: 0, failed: 0, bounced: 0, errors: [] };
    const profile  = smtpProfileId ? await SmtpProfile.findById(smtpProfileId) : null;
    const fromAddr = profile?.fromEmail || fromEmail || process.env.SMTP_FROM_EMAIL;
    const fromN    = profile?.fromName  || fromName  || process.env.SMTP_FROM_NAME || 'AutoFlow';

    for (let i = 0; i < contacts.length; i++) {
      const contact  = contacts[i];
      if (!contact.email) { results.failed++; continue; }
      if (contact.status === 'unsubscribed' || contact.status === 'bounced') {
        results.bounced++; continue;
      }

      const trackingId = crypto.randomBytes(16).toString('hex');

      try {
        // Personalize content
        const personalized = personalizeText(htmlTemplate, {
          name:      contact.name || 'Friend',
          firstname: contact.name?.split(' ')[0] || 'Friend',
          email:     contact.email,
          phone:     contact.phone || '',
          company:   contact.company || '',
          ...options.variables,
        });

        const personalSubject = personalizeText(subject, {
          name: contact.name?.split(' ')[0] || 'Friend',
          ...options.variables,
        });

        // Add unsubscribe footer
        let finalHtml = personalized;
        if (unsubFooter) {
          finalHtml += `
            <br><br>
            <div style="font-size:11px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:10px">
              You received this email because you subscribed to our list.<br>
              <a href="https://your-domain.com/unsubscribe/${trackingId}" style="color:#999">Unsubscribe</a>
              &nbsp;|&nbsp;
              <a href="https://your-domain.com/manage/${trackingId}" style="color:#999">Manage Preferences</a>
            </div>`;
        }

        const result = await this.sendEmail({
          to:           contact.email,
          from:         fromAddr,
          fromName:     fromN,
          subject:      personalSubject,
          html:         finalHtml,
          text:         textTemplate ? personalizeText(textTemplate, { name: contact.name }) : undefined,
          replyTo,
          smtpProfileId,
          trackingId:   trackOpens || trackClicks ? trackingId : null,
        });

        // Log
        await MessageLog.create({
          userId:     campaign.userId,
          campaignId: campaign._id,
          contactId:  contact._id,
          platform:   'email',
          to:         contact.email,
          subject:    personalSubject,
          body:       htmlTemplate.substring(0, 500),
          status:     'sent',
          externalId: result.messageId,
          metadata:   { trackingId },
        });

        // Update contact stats
        await Contact.findByIdAndUpdate(contact._id, {
          $inc: { 'stats.emailsSent': 1 },
          lastContacted: new Date(),
        });

        // Update SMTP profile daily counter
        if (profile) {
          await SmtpProfile.findByIdAndUpdate(smtpProfileId, { $inc: { dailySent: 1 } });
        }

        results.sent++;

        // Rate limiting: respect send rate setting
        const sendRate = options.sendRate || 500;   // per hour
        const minDelay = Math.max(delayMin, Math.floor(3600000 / sendRate));
        await delay(randomDelay(minDelay, Math.max(delayMax, minDelay + 1000)));

      } catch (err) {
        results.failed++;
        results.errors.push({ email: contact.email, error: err.message });

        await MessageLog.create({
          userId:      campaign.userId,
          campaignId:  campaign._id,
          contactId:   contact._id,
          platform:    'email',
          to:          contact.email,
          status:      'failed',
          errorMessage: err.message,
        }).catch(() => {});

        // If bounce/invalid address, mark contact
        if (err.message.includes('550') || err.message.includes('invalid') || err.message.includes('does not exist')) {
          await Contact.findByIdAndUpdate(contact._id, { status: 'bounced' });
          results.bounced++;
          results.failed--;
        }

        logger.error(`Email send error to ${contact.email}: ${err.message}`);
      }
    }

    return results;
  }

  // ── Verify SMTP profile ─────────────────────────────────
  async verifySmtp(smtpProfile) {
    try {
      const transport = nodemailer.createTransport({
        host:   smtpProfile.host,
        port:   smtpProfile.port,
        secure: smtpProfile.secure,
        auth:   { user: smtpProfile.auth.user, pass: smtpProfile.auth.pass },
        tls:    { rejectUnauthorized: false },
      });
      await transport.verify();
      return { success: true, message: 'SMTP connection verified' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // ── Send test email ─────────────────────────────────────
  async sendTest(smtpProfileId, toEmail) {
    return this.sendEmail({
      to:           toEmail,
      from:         process.env.SMTP_FROM_EMAIL,
      fromName:     'AutoFlow Test',
      subject:      '✅ AutoFlow SMTP Test — It works!',
      html:         `<h2>🚀 AutoFlow Email Test</h2><p>Your SMTP configuration is working correctly.</p><p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>`,
      smtpProfileId,
    });
  }

  // ── Handle bounce/complaint webhook ────────────────────
  async handleBounce(email, type) {
    const status = type === 'complaint' ? 'unsubscribed' : 'bounced';
    await Contact.updateMany({ email }, { status });
    logger.info(`Marked ${email} as ${status} due to ${type}`);
  }

  // ── Handle unsubscribe ──────────────────────────────────
  async handleUnsubscribe(trackingId) {
    const log = await MessageLog.findOne({ 'metadata.trackingId': trackingId });
    if (log?.contactId) {
      await Contact.findByIdAndUpdate(log.contactId, { subscribed: false, status: 'unsubscribed' });
      await MessageLog.findByIdAndUpdate(log._id, { status: 'unsubscribed' });
    }
  }
}

module.exports = new EmailService();
