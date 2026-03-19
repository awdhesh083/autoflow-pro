'use strict';
const { HttpsProxyAgent } = require('https-proxy-agent');
const axios  = require('axios');
const logger = require('../utils/logger');
const { Proxy } = require('../models');

const ProxyService = {
  async getHealthyProxy(country) {
    const q = { isActive: true, health: { $gte: 70 } };
    if (country) q.country = country;
    const proxy = await Proxy.findOne(q).sort({ useCount: 1, health: -1 });
    if (!proxy) throw new Error('No healthy proxy available for: ' + (country || 'any'));
    await Proxy.findByIdAndUpdate(proxy._id, { $inc: { useCount: 1 } });
    return proxy;
  },

  async checkProxy(proxy) {
    const auth  = proxy.username ? `${proxy.username}:${proxy.password}@` : '';
    const url   = `${proxy.protocol || 'http'}://${auth}${proxy.host}:${proxy.port}`;
    const agent = new HttpsProxyAgent(url);
    const start = Date.now();
    try {
      const resp    = await axios.get('https://api.ipify.org?format=json', { httpsAgent: agent, timeout: 10000 });
      const latency = Date.now() - start;
      const health  = latency < 2000 ? 100 : latency < 5000 ? 70 : 40;
      return { healthy: true, ip: resp.data.ip, latencyMs: latency, health };
    } catch (err) {
      return { healthy: false, health: 0, error: err.message };
    }
  },

  async rotateAll() {
    const proxies = await Proxy.find({ isActive: true });
    const results = [];
    for (const proxy of proxies) {
      const check = await this.checkProxy(proxy);
      await Proxy.findByIdAndUpdate(proxy._id, { health: check.health, lastChecked: new Date() });
      results.push({ id: proxy._id, host: proxy.host, ...check });
    }
    logger.info(`Proxy health check: ${results.filter(r => r.healthy).length}/${results.length} healthy`);
    return results;
  },

  buildProxyUrl(proxy) {
    if (!proxy?.host) return null;
    const auth = proxy.username ? `${proxy.username}:${proxy.password}@` : '';
    return `${proxy.protocol || 'http'}://${auth}${proxy.host}:${proxy.port}`;
  },
};

module.exports = ProxyService;
