'use strict';
const jwt  = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { User } = require('../models');

/**
 * JWT + API-key authentication middleware.
 * Accepts:  Authorization: Bearer <token>
 *        OR X-Api-Key: <apiKey>
 */
const authenticate = async (req, res, next) => {
  try {
    let token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : req.headers['x-api-key'];

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Try API key first (faster — no crypto)
    const byKey = await User.findOne({ apiKey: token, isActive: true });
    if (byKey) { req.user = byKey; return next(); }

    // JWT path
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

/** express-validator result checker */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

module.exports = { authenticate, validate };
