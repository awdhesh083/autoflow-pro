'use strict';
/**
 * Auth Routes — /api/v1/auth
 * Register, Login (with 2FA), Refresh, Password Reset, Email Verify, 2FA setup
 */
const express    = require('express');
const { body }   = require('express-validator');
const crypto     = require('crypto');
const jwt        = require('jsonwebtoken');
const speakeasy  = require('speakeasy');
const QRCode     = require('qrcode');
const { User }                   = require('../models');
const { authenticate, validate } = require('../middleware/auth');
const AuthEmailService           = require('../services/auth.email.service');
const { msg }                    = require('../middleware/i18n');

const router = express.Router();

// ── helpers ────────────────────────────────────────────────────────────────
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const signRefresh = (id) =>
  jwt.sign({ id, type: 'refresh' }, process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET, { expiresIn: '30d' });

const safeUser = (u) => ({
  id: u._id, name: u.name, email: u.email, plan: u.plan, role: u.role,
  apiKey: u.apiKey, emailVerified: u.emailVerified, twoFactorEnabled: u.twoFactorEnabled,
  settings: u.settings,
});

// ─────────────────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────────────────
router.post('/register',
  [body('name').trim().notEmpty(), body('email').isEmail().normalizeEmail(), body('password').isLength({ min: 8 })],
  validate,
  async (req, res) => {
    const { name, email, password } = req.body;
    if (await User.findOne({ email }))
      return res.status(409).json({ success: false, message: msg(req,'email_already_registered') });

    const apiKey           = `sk-af-${crypto.randomBytes(32).toString('hex')}`;
    const emailVerifyToken = crypto.randomBytes(32).toString('hex');

    const user = await User.create({
      name, email, password, apiKey,
      emailVerifyToken,
      emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // Send verification email (non-blocking)
    AuthEmailService.sendEmailVerification(user, emailVerifyToken).catch(() => {});

    const token        = signToken(user._id);
    const refreshToken = signRefresh(user._id);

    res.status(201).json({ success: true, token, refreshToken, apiKey, user: safeUser(user) });
  }
);

// ─────────────────────────────────────────────────────────
// LOGIN  (supports 2FA second step)
// ─────────────────────────────────────────────────────────
router.post('/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  validate,
  async (req, res) => {
    const { email, password, twoFactorCode, backupCode } = req.body;
    const user = await User.findOne({ email, isActive: true }).select('+password +twoFactorSecret +twoFactorBackupCodes');
    if (!user) return res.status(401).json({ success: false, message: msg(req,'invalid_credentials') });

    if (user.isLocked())
      return res.status(423).json({ success: false, message: msg(req,'account_locked') });

    const valid = await user.comparePassword(password);
    if (!valid) {
      const attempts = (user.loginAttempts || 0) + 1;
      await User.findByIdAndUpdate(user._id, {
        loginAttempts: attempts,
        ...(attempts >= 5 ? { lockUntil: new Date(Date.now() + 15 * 60 * 1000) } : {}),
      });
      return res.status(401).json({ success: false, message: msg(req,'invalid_credentials') });
    }

    // 2FA check
    if (user.twoFactorEnabled) {
      if (!twoFactorCode && !backupCode)
        return res.status(200).json({ success: false, requiresTwoFactor: true, message: msg(req,'two_factor_required') });

      if (backupCode) {
        const bc = user.twoFactorBackupCodes?.find(b => !b.used && b.code === backupCode.toUpperCase());
        if (!bc) return res.status(401).json({ success: false, message: msg(req,'backup_code_invalid') });
        await User.findByIdAndUpdate(user._id, {
          $set: { 'twoFactorBackupCodes.$[el].used': true },
        }, { arrayFilters: [{ 'el.code': backupCode.toUpperCase() }] });
      } else {
        const verified = speakeasy.totp.verify({
          secret: user.twoFactorSecret, encoding: 'base32',
          token: twoFactorCode, window: 1,
        });
        if (!verified) return res.status(401).json({ success: false, message: msg(req,'two_factor_invalid') });
      }
    }

    await User.findByIdAndUpdate(user._id, { loginAttempts: 0, lockUntil: null, lastLogin: new Date() });

    // Login alert (non-blocking, only for 2FA-protected accounts)
    if (user.twoFactorEnabled)
      AuthEmailService.sendLoginAlert(user, req.ip, req.get('user-agent')).catch(() => {});

    const token        = signToken(user._id);
    const refreshToken = signRefresh(user._id);

    res.json({ success: true, token, refreshToken, user: safeUser(user) });
  }
);

// ─────────────────────────────────────────────────────────
// REFRESH TOKEN
// ─────────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ success: false, message: 'Refresh token required' });
  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') throw new Error('Not a refresh token');
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) throw new Error('User not found');
    res.json({
      success: true,
      token:        signToken(user._id),
      refreshToken: signRefresh(user._id),
    });
  } catch {
    res.status(401).json({ success: false, message: msg(req,'invalid_refresh_token') });
  }
});

// ─────────────────────────────────────────────────────────
// ME + UPDATE
// ─────────────────────────────────────────────────────────
router.get('/me', authenticate, (req, res) => res.json({ success: true, user: req.user }));

router.put('/me', authenticate,
  [body('name').optional().trim().notEmpty(), body('email').optional().isEmail()],
  validate,
  async (req, res) => {
    const allowed = ['name', 'email', 'avatar', 'settings'];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select('-password');
    res.json({ success: true, user });
  }
);

// ─────────────────────────────────────────────────────────
// CHANGE PASSWORD (authenticated)
// ─────────────────────────────────────────────────────────
router.post('/change-password', authenticate,
  [body('currentPassword').notEmpty(), body('newPassword').isLength({ min: 8 })],
  validate,
  async (req, res) => {
    const user = await User.findById(req.user._id).select('+password');
    if (!await user.comparePassword(req.body.currentPassword))
      return res.status(401).json({ success: false, message: msg(req,'password_incorrect') });
    user.password = req.body.newPassword;
    await user.save();
    res.json({ success: true, message: msg(req,'password_updated') });
  }
);

// ─────────────────────────────────────────────────────────
// FORGOT PASSWORD → email reset link
// ─────────────────────────────────────────────────────────
router.post('/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  validate,
  async (req, res) => {
    const user = await User.findOne({ email: req.body.email, isActive: true });
    // Always return success to prevent email enumeration
    if (!user) return res.json({ success: true, message: msg(req,'reset_link_sent') });

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await User.findByIdAndUpdate(user._id, { passwordResetToken: token, passwordResetExpires: expires });

    try {
      await AuthEmailService.sendPasswordReset(user, token);
    } catch (err) {
      await User.findByIdAndUpdate(user._id, { passwordResetToken: null, passwordResetExpires: null });
      return res.status(500).json({ success: false, message: 'Failed to send reset email — check SMTP config' });
    }

    res.json({ success: true, message: 'Password reset email sent' });
  }
);

// ─────────────────────────────────────────────────────────
// RESET PASSWORD → use token from email
// ─────────────────────────────────────────────────────────
router.post('/reset-password/:token',
  [body('password').isLength({ min: 8 })],
  validate,
  async (req, res) => {
    const user = await User.findOne({
      passwordResetToken:   req.params.token,
      passwordResetExpires: { $gt: new Date() },
      isActive:             true,
    });
    if (!user) return res.status(400).json({ success: false, message: msg(req,'reset_link_invalid') });

    user.password             = req.body.password;
    user.passwordResetToken   = undefined;
    user.passwordResetExpires = undefined;
    user.loginAttempts        = 0;
    user.lockUntil            = undefined;
    await user.save();

    res.json({ success: true, message: msg(req,'password_reset_done') });
  }
);

// ─────────────────────────────────────────────────────────
// EMAIL VERIFICATION — send new link
// ─────────────────────────────────────────────────────────
router.post('/verify-email/resend', authenticate, async (req, res) => {
  if (req.user.emailVerified)
    return res.json({ success: true, message: 'Email already verified' });

  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await User.findByIdAndUpdate(req.user._id, { emailVerifyToken: token, emailVerifyExpires: expires });
  await AuthEmailService.sendEmailVerification(req.user, token);

  res.json({ success: true, message: 'Verification email sent' });
});

// ─────────────────────────────────────────────────────────
// EMAIL VERIFICATION — confirm via token
// ─────────────────────────────────────────────────────────
router.post('/verify-email/:token', async (req, res) => {
  const user = await User.findOne({
    emailVerifyToken:   req.params.token,
    emailVerifyExpires: { $gt: new Date() },
  });
  if (!user) return res.status(400).json({ success: false, message: msg(req,'email_verify_invalid') });

  await User.findByIdAndUpdate(user._id, {
    emailVerified:      true,
    emailVerifyToken:   undefined,
    emailVerifyExpires: undefined,
  });

  res.json({ success: true, message: msg(req,'email_verified') });
});

// ─────────────────────────────────────────────────────────
// 2FA SETUP → generate secret + QR code
// ─────────────────────────────────────────────────────────
router.post('/2fa/setup', authenticate, async (req, res) => {
  if (req.user.twoFactorEnabled)
    return res.status(400).json({ success: false, message: msg(req,'two_fa_already_enabled') });

  const secret = speakeasy.generateSecret({
    name:   `AutoFlow (${req.user.email})`,
    length: 32,
  });

  // Store secret (not yet activated)
  await User.findByIdAndUpdate(req.user._id, { twoFactorSecret: secret.base32 });

  const qrCode = await QRCode.toDataURL(secret.otpauth_url);

  res.json({
    success:    true,
    secret:     secret.base32,       // for manual entry
    qrCode,                           // base64 PNG data URL
    otpauthUrl: secret.otpauth_url,
  });
});

// ─────────────────────────────────────────────────────────
// 2FA ENABLE → verify first TOTP, then activate
// ─────────────────────────────────────────────────────────
router.post('/2fa/enable',
  authenticate,
  [body('token').notEmpty().isLength({ min: 6, max: 6 })],
  validate,
  async (req, res) => {
    const user = await User.findById(req.user._id).select('+twoFactorSecret');
    if (!user.twoFactorSecret)
      return res.status(400).json({ success: false, message: msg(req,'two_fa_setup_first') });
    if (user.twoFactorEnabled)
      return res.status(400).json({ success: false, message: '2FA already active' });

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret, encoding: 'base32',
      token: req.body.token, window: 1,
    });
    if (!verified) return res.status(401).json({ success: false, message: msg(req,'two_factor_invalid') });

    // Generate 8 single-use backup codes
    const rawCodes    = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );
    const backupCodes = rawCodes.map(code => ({ code, used: false }));

    await User.findByIdAndUpdate(user._id, {
      twoFactorEnabled:    true,
      twoFactorBackupCodes: backupCodes,
    });

    // Email backup codes to user
    AuthEmailService.send2FAEnabled(user, rawCodes).catch(() => {});

    res.json({ success: true, message: msg(req,'two_fa_enabled'), backupCodes: rawCodes });
  }
);

// ─────────────────────────────────────────────────────────
// 2FA VERIFY → used in login flow when 2FA is required
// ─────────────────────────────────────────────────────────
router.post('/2fa/verify', authenticate,
  [body('token').notEmpty()],
  validate,
  async (req, res) => {
    const user = await User.findById(req.user._id).select('+twoFactorSecret');
    if (!user.twoFactorEnabled) return res.status(400).json({ success: false, message: '2FA not enabled' });

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret, encoding: 'base32',
      token: req.body.token, window: 1,
    });
    if (!verified) return res.status(401).json({ success: false, message: msg(req,'two_factor_invalid') });

    res.json({ success: true, message: '2FA verified' });
  }
);

// ─────────────────────────────────────────────────────────
// 2FA DISABLE
// ─────────────────────────────────────────────────────────
router.post('/2fa/disable', authenticate,
  [body('password').notEmpty()],
  validate,
  async (req, res) => {
    const user = await User.findById(req.user._id).select('+password');
    if (!await user.comparePassword(req.body.password))
      return res.status(401).json({ success: false, message: 'Password incorrect' });

    await User.findByIdAndUpdate(user._id, {
      twoFactorEnabled:    false,
      twoFactorSecret:     undefined,
      twoFactorBackupCodes: [],
    });

    res.json({ success: true, message: msg(req,'two_fa_disabled') });
  }
);

// ─────────────────────────────────────────────────────────
// BACKUP CODES — regenerate
// ─────────────────────────────────────────────────────────
router.post('/2fa/backup-codes', authenticate,
  [body('password').notEmpty()],
  validate,
  async (req, res) => {
    const user = await User.findById(req.user._id).select('+password');
    if (!user.twoFactorEnabled) return res.status(400).json({ success: false, message: '2FA not enabled' });
    if (!await user.comparePassword(req.body.password))
      return res.status(401).json({ success: false, message: 'Password incorrect' });

    const rawCodes    = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );
    await User.findByIdAndUpdate(user._id, {
      twoFactorBackupCodes: rawCodes.map(code => ({ code, used: false })),
    });

    res.json({ success: true, backupCodes: rawCodes });
  }
);

// ─────────────────────────────────────────────────────────
// REGENERATE API KEY
// ─────────────────────────────────────────────────────────
router.post('/regenerate-key', authenticate, async (req, res) => {
  const apiKey = `sk-af-${crypto.randomBytes(32).toString('hex')}`;
  await User.findByIdAndUpdate(req.user._id, { apiKey });
  res.json({ success: true, apiKey });
});

module.exports = router;
