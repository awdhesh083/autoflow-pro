const { createClient } = require('redis');
const logger = require('../utils/logger');

let client;

const connectRedis = async () => {
  try {
    client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

    client.on('error',        (err) => logger.error(`Redis error: ${err.message}`));
    client.on('connect',      ()    => logger.info('✅ Redis connected'));
    client.on('reconnecting', ()    => logger.warn('Redis reconnecting...'));

    await client.connect();
  } catch (err) {
    logger.warn(`Redis connection failed (continuing without cache): ${err.message}`);
    client = null;
  }
};

const getRedis = () => client;

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
module.exports.cache    = cache;
