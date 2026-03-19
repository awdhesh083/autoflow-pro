'use strict';
/**
 * Rate Limiter Middleware
 * Global: 500 req / 15 min per IP
 * Auth:   10 req / 15 min per IP (skip successes)
 * User:   plan-aware per-user limits via Redis
 * Strict: 20 req / 15 min (scraper, AI endpoints)
 */
const rateLimit = require('express-rate-limit');
const { getRedis } = require('../config/redis');

// ── IP-based limiters ──────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      500,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many requests — slow down' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many auth attempts — try again in 15 minutes' },
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Rate limit exceeded' },
});

// ── Plan-aware per-user limiter (Redis-backed) ────────────────────────────
// Limits per minute by plan: free=30, starter=120, pro=500, enterprise=∞
const PLAN_LIMITS = { free: 30, starter: 120, pro: 500, enterprise: 9999 };

const userLimiter = async (req, res, next) => {
  if (!req.user) return next(); // unauthenticated falls through to global

  const redis  = getRedis();
  if (!redis)  return next(); // Redis not available — skip user limiter

  const plan    = req.user.plan || 'free';
  const max     = PLAN_LIMITS[plan] || 30;
  const key     = `rl:user:${req.user._id}`;

  try {
    const current = await redis.incr(key);
    if (current === 1) await redis.expire(key, 60); // 1-minute window

    // Set headers
    res.setHeader('X-RateLimit-Limit',     max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - current));
    res.setHeader('X-RateLimit-Plan',      plan);

    if (current > max) {
      const ttl = await redis.ttl(key);
      return res.status(429).json({
        success: false,
        message: `Rate limit exceeded for ${plan} plan (${max} req/min). Upgrade for higher limits.`,
        retryAfter: ttl,
        upgradeUrl: '/api/v1/saas/plans',
      });
    }
    next();
  } catch {
    next(); // Redis error — fail open
  }
};

module.exports = { globalLimiter, authLimiter, strictLimiter, userLimiter };
