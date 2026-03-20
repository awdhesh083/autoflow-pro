const { createClient } = require('redis');
const logger = require('../utils/logger');

let client;
let isConnected = false;

const connectRedis = async () => {
  try {
    client = createClient({ 
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 3000) }
      // Backoff: 200ms, 400ms, 600ms, 800ms, 1000ms, 1200ms, 1400ms, 1600ms, 1800ms, 2000ms, 2200ms, 2400ms, 2600ms, 2800ms, 3000ms...

    });

    client.on('error',    (err) => logger.error(`Redis error: ${err.message}`));
    client.on('connect',  ()    => { isConnected = true; logger.info('✅ Redis connected'); });
    client.on('ready',    ()    => { isConnected = true; logger.info('✅ Redis ready'); });
    client.on('disconnect', () => { isConnected = false; logger.warn('Redis disconnected'); });

    await client.connect();
    isConnected = true;
    logger.info('✅ Redis client connected');
  } catch (err) {
    logger.error(`🔴 Redis connection failed: ${err.message} - Health checks will fail until Redis is available`);
    isConnected = false;
    // Don't throw - let startup continue, but health checks will fail
    // This gives Railway time to restart or for Redis to come online
  }
};

const getRedis = () => client;
const isRedisReady = () => isConnected && client && client.isOpen;

const cache = {
  async get(key) {
    if (!client) return null;
    try {
      const val = await client.get(key);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  },
  async set(key, value, ttlSeconds = 300) {
    if (!client) return;
    try { await client.setEx(key, ttlSeconds, JSON.stringify(value)); } catch {}
  },
  async del(key) {
    if (!client) return;
    try { await client.del(key); } catch {}
  },
  async flush(pattern) {
    if (!client) return;
    try {
      const keys = await client.keys(pattern);
      if (keys.length) await client.del(keys);
    } catch {}
  }
};

module.exports = connectRedis;
module.exports.getRedis = getRedis;
module.exports.isRedisReady = isRedisReady;
module.exports.cache = cache;
