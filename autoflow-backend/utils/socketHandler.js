'use strict';
const logger = require('./logger');

const socketHandler = (io) => {
  // Pass io to WhatsApp service so QR events can be emitted
  try {
    const WhatsAppService = require('../services/whatsapp.service');
    if (typeof WhatsAppService.setSocket === 'function') {
      WhatsAppService.setSocket(io);
    }
  } catch (e) { logger.warn(`WA socket setup: ${e.message}`); }

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // ── Authenticate socket ──────────────────────────────────
    socket.on('authenticate', async ({ token }) => {
      try {
        const jwt     = require('jsonwebtoken');
        const { User } = require('../models');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user    = await User.findById(decoded.id);
        if (!user) return socket.emit('auth_error', { message: 'Invalid token' });

        socket.userId = user._id.toString();
        socket.join(`user:${socket.userId}`);
        socket.emit('authenticated', { userId: socket.userId });
        logger.info(`Socket authenticated: user ${socket.userId}`);
      } catch {
        socket.emit('auth_error', { message: 'Authentication failed' });
      }
    });

    // ── Room management ─────────────────────────────────────
    socket.on('join:campaign',  ({ campaignId })  => { socket.join(`campaign:${campaignId}`);  });
    socket.on('leave:campaign', ({ campaignId })  => { socket.leave(`campaign:${campaignId}`); });
    socket.on('join:account',   ({ accountId })   => { socket.join(`account:${accountId}`);    });
    socket.on('leave:account',  ({ accountId })   => { socket.leave(`account:${accountId}`);   });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  // ── Helpers for services to emit events ──────────────────
  io.emitToUser     = (userId, event, data)      => io.to(`user:${userId}`).emit(event, data);
  io.emitToCampaign = (campaignId, event, data)  => io.to(`campaign:${campaignId}`).emit(event, data);
  io.emitToAccount  = (accountId, event, data)   => io.to(`account:${accountId}`).emit(event, data);

  return io;
};

module.exports = socketHandler;
