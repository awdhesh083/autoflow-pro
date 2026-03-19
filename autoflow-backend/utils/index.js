/**
 * ══════════════════════════════════════════════════════════
 * UTILITIES, MIDDLEWARE & HELPERS
 * ══════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────
// utils/logger.js
// ─────────────────────────────────────────────────────────
const winston  = require('winston');
const path     = require('path');
const fs       = require('fs');

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
      )
    }),
    new winston.transports.File({ filename: path.join(logDir, 'error.log'),   level: 'error', maxsize: 10485760, maxFiles: 5 }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log'),                maxsize: 10485760, maxFiles: 10 }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(logDir, 'exceptions.log') })
  ],
});

module.exports = logger;

// ─────────────────────────────────────────────────────────
// utils/helpers.js
// ─────────────────────────────────────────────────────────
const crypto = require('crypto');

const helpers = {
  // Pause execution for ms milliseconds
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Random delay between min and max ms
  randomDelay: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,

  // Personalize text with contact variables
  personalizeText: (template, variables = {}) => {
    if (!template) return '';
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\[${key}\\]`, 'gi');
      result = result.replace(regex, value || '');
    }
    // Remove any unreplaced variables
    result = result.replace(/\[[a-z_]+\]/gi, '');
    return result;
  },

  // Generate 1x1 tracking pixel HTML
  trackingPixel: (trackingId) => {
    const url = `${process.env.BASE_URL || 'http://localhost:5000'}/api/v1/email/track/open/${trackingId}`;
    return `<img src="${url}" width="1" height="1" style="display:none" alt="">`;
  },

  // Wrap all links in HTML with tracking redirects
  wrapLinks: (html, trackingId) => {
    let idx = 0;
    return html.replace(/href="(https?:\/\/[^"]+)"/gi, (match, url) => {
      const encoded = encodeURIComponent(url);
      const trackUrl = `${process.env.BASE_URL}/api/v1/email/track/click/${trackingId}/${idx++}`;
      return `href="${trackUrl}" data-original="${url}"`;
    });
  },

  // Generate secure random token
  generateToken: (length = 32) => crypto.randomBytes(length).toString('hex'),

  // Sanitize phone number
  sanitizePhone: (phone) => {
    const cleaned = phone.replace(/[^0-9+]/g, '');
    if (!cleaned.startsWith('+')) return `+${cleaned}`;
    return cleaned;
  },

  // Chunk array into batches
  chunk: (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  },

  // Deep merge objects
  deepMerge: (target, source) => {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] instanceof Object && !Array.isArray(source[key])) {
        result[key] = helpers.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  },

  // Paginate mongoose query
  paginate: async (Model, query, options = {}) => {
    const { page = 1, limit = 20, sort = '-createdAt', populate = '' } = options;
    const skip  = (page - 1) * limit;
    const total = await Model.countDocuments(query);
    const data  = await Model.find(query).skip(skip).limit(+limit).sort(sort).populate(populate);
    return { data, total, page: +page, pages: Math.ceil(total / limit), hasNext: skip + data.length < total };
  },

  // Format bytes
  formatBytes: (bytes) => {
    if (bytes < 1024)       return `${bytes} B`;
    if (bytes < 1048576)    return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(2)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  },

  // Escape HTML
  escapeHtml: (str) => str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
};

module.exports = helpers;

// ─────────────────────────────────────────────────────────
// middleware/errorHandler.js
// ─────────────────────────────────────────────────────────
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message    = err.message || 'Internal server error';

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message    = Object.values(err.errors).map(e => e.message).join(', ');
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message    = `Invalid ${err.path}: ${err.value}`;
  }

  // MongoDB duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message    = `${field} already exists`;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError')   { statusCode = 401; message = 'Invalid token'; }
  if (err.name === 'TokenExpiredError')   { statusCode = 401; message = 'Token expired'; }

  if (process.env.NODE_ENV === 'development') {
    console.error('ERROR STACK:', err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
};

module.exports = errorHandler;

// ─────────────────────────────────────────────────────────
// middleware/rateLimiter.js
// ─────────────────────────────────────────────────────────
const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 500,
  message:  { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders:   false,
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many requests' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many auth attempts. Please wait 15 minutes.' },
});

module.exports = { globalLimiter, strictLimiter, authLimiter };

// ─────────────────────────────────────────────────────────
// utils/socketHandler.js
// ─────────────────────────────────────────────────────────
const socketLogger = require('./logger');

const socketHandler = (io) => {
  io.on('connection', (socket) => {
    socketLogger.debug(`Socket connected: ${socket.id}`);

    // Authenticate socket
    socket.on('authenticate', async ({ token }) => {
      try {
        const jwt  = require('jsonwebtoken');
        const { User } = require('../models');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user    = await User.findById(decoded.id);
        if (!user) return socket.emit('auth_error', { message: 'Invalid token' });

        socket.userId = user._id.toString();
        socket.join(`user:${socket.userId}`);
        socket.emit('authenticated', { userId: socket.userId });
        socketLogger.debug(`Socket authenticated: ${socket.userId}`);
      } catch (err) {
        socket.emit('auth_error', { message: 'Authentication failed' });
      }
    });

    // Join campaign room for live updates
    socket.on('join:campaign', ({ campaignId }) => {
      socket.join(`campaign:${campaignId}`);
      socketLogger.debug(`Socket joined campaign: ${campaignId}`);
    });

    // Join account room for WA QR etc.
    socket.on('join:account', ({ accountId }) => {
      socket.join(`account:${accountId}`);
    });

    // Leave rooms
    socket.on('leave:campaign', ({ campaignId }) => socket.leave(`campaign:${campaignId}`));
    socket.on('leave:account',  ({ accountId })  => socket.leave(`account:${accountId}`));

    socket.on('disconnect', () => {
      socketLogger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  // Helper: emit to all sockets of a user
  io.emitToUser = (userId, event, data) => {
    io.to(`user:${userId}`).emit(event, data);
  };

  return io;
};

module.exports = socketHandler;
