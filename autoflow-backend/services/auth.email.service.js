'use strict';
/**
 * Auth Email Service
 * Sends transactional emails: password reset, email verification, 2FA backup codes.
 * Uses nodemailer directly (not the full EmailService) to avoid circular deps.
 */
const nodemailer = require('nodemailer');
const logger     = require('../utils/logger');

function _transport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls:    { rejectUnauthorized: false },
  });
}

async function send({ to, subject, html }) {
  const transport = _transport();
  if (!transport) {
    logger.warn(`Auth email not sent (no SMTP config): ${subject} → ${to}`);
    logger.info(`[DEV] Would send: ${subject} to ${to}`);
    return { success: true, dev: true };
  }
  try {
    const info = await transport.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'AutoFlow'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to, subject, html,
    });
    logger.info(`Auth email sent: ${subject} → ${to} (${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`Auth email failed: ${err.message}`);
    throw err;
  }
}

const BASE_URL = () => process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:5173';

const AuthEmailService = {
  async sendPasswordReset(user, token) {
    const url = `${BASE_URL()}/reset-password?token=${token}`;
    return send({
      to: user.email,
      subject: 'Reset your AutoFlow password',
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px">
          <h2 style="color:#00d4ff;margin-bottom:8px">Password Reset</h2>
          <p>Hi ${user.name},</p>
          <p>Someone requested a password reset for your AutoFlow account. Click the button below to set a new password:</p>
          <p style="margin:28px 0">
            <a href="${url}" style="background:linear-gradient(135deg,#00d4ff,#7c3aed);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">
              Reset Password
            </a>
          </p>
          <p style="font-size:13px;color:#888">This link expires in <strong>1 hour</strong>. If you didn't request this, ignore this email.</p>
          <p style="font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:16px;margin-top:24px">
            Or copy this link: <a href="${url}" style="color:#00d4ff">${url}</a>
          </p>
        </div>`,
    });
  },

  async sendEmailVerification(user, token) {
    const url = `${BASE_URL()}/verify-email?token=${token}`;
    return send({
      to: user.email,
      subject: 'Verify your AutoFlow email address',
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px">
          <h2 style="color:#00d4ff;margin-bottom:8px">Verify your email</h2>
          <p>Hi ${user.name}, welcome to AutoFlow Pro!</p>
          <p>Please verify your email address to unlock all features:</p>
          <p style="margin:28px 0">
            <a href="${url}" style="background:linear-gradient(135deg,#00d4ff,#7c3aed);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">
              Verify Email
            </a>
          </p>
          <p style="font-size:13px;color:#888">This link expires in <strong>24 hours</strong>.</p>
        </div>`,
    });
  },

  async send2FAEnabled(user, backupCodes) {
    return send({
      to: user.email,
      subject: 'Two-factor authentication enabled on your AutoFlow account',
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px">
          <h2 style="color:#10b981;margin-bottom:8px">2FA Enabled</h2>
          <p>Hi ${user.name},</p>
          <p>Two-factor authentication has been enabled on your account.</p>
          <h3 style="margin-top:24px">Your Backup Codes</h3>
          <p style="font-size:13px;color:#666">Save these somewhere safe. Each code can only be used once if you lose access to your authenticator app:</p>
          <div style="background:#f5f5f5;border-radius:8px;padding:16px;font-family:monospace;font-size:14px;line-height:2">
            ${backupCodes.map(c => `<div>${c}</div>`).join('')}
          </div>
          <p style="font-size:13px;color:#f59e0b;margin-top:16px">⚠️ These codes will not be shown again. Store them securely.</p>
        </div>`,
    });
  },

  async sendLoginAlert(user, ip, userAgent) {
    return send({
      to: user.email,
      subject: 'New login detected on your AutoFlow account',
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px">
          <h2 style="color:#f59e0b;margin-bottom:8px">New Login Detected</h2>
          <p>Hi ${user.name},</p>
          <p>A new login was detected on your AutoFlow account:</p>
          <table style="margin:16px 0;font-size:13px;width:100%">
            <tr><td style="color:#888;padding:4px 0">IP Address</td><td style="font-weight:600">${ip || 'Unknown'}</td></tr>
            <tr><td style="color:#888;padding:4px 0">Time</td><td style="font-weight:600">${new Date().toLocaleString()}</td></tr>
            <tr><td style="color:#888;padding:4px 0">Device</td><td style="font-weight:600">${(userAgent || 'Unknown').substring(0, 60)}</td></tr>
          </table>
          <p style="font-size:13px;color:#888">If this wasn't you, <a href="${BASE_URL()}/change-password" style="color:#ef4444">reset your password immediately</a>.</p>
        </div>`,
    });
  },
};

module.exports = AuthEmailService;
