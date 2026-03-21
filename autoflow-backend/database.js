'use strict';
const mongoose = require('mongoose');
const logger   = require('../utils/logger');

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BUG FIX #4: serverSelectionTimeoutMS was 5000ms — too short for        ║
// ║  Railway cold-starts. MongoDB Atlas SRV DNS lookup + TLS handshake      ║
// ║  can exceed 5s on first connect, causing Mongoose to throw before       ║
// ║  the health check even runs. Increased to 15000ms.                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 15000,  // was 5000 — allow Railway cold-start time
  socketTimeoutMS:          45000,
  maxPoolSize:              10,
  retryWrites:              true,
};

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, MONGO_OPTIONS);
    logger.info('✅  MongoDB connected');
  } catch (err) {
    logger.error(`❌  MongoDB initial connection failed: ${err.message}`);
    // Do NOT call process.exit() here — let the server stay up so Railway's
    // health check returns 503 instead of the process dying entirely.
    // Mongoose will automatically retry in the background.
  }
};

mongoose.connection.on('connected',    () => logger.info('MongoDB connection established'));
mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected — retrying...'));
mongoose.connection.on('reconnected',  () => logger.info('MongoDB reconnected'));
mongoose.connection.on('error',        (err) => logger.error(`MongoDB error: ${err.message}`));

module.exports = connectDB;
