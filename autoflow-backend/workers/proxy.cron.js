'use strict';
/**
 * Proxy Health Cron
 * Runs every 15 minutes — checks all active proxies, updates health scores,
 * and emits Socket.io alerts when a proxy goes down or is auto-rotated.
 *
 * Also handles auto-assignment: if an Account has a dead proxy,
 * automatically assigns the next healthy one.
 */
const cron   = require('node-cron');
const logger = require('../utils/logger');

let started = false;

async function runProxyHealthCheck() {
  try {
    const ProxyService = require('../services/proxy.service');
    const { Proxy, Account } = require('../models');

    const proxies = await Proxy.find({ isActive: true });
    if (!proxies.length) return;

    logger.info(`Proxy health check: checking ${proxies.length} proxies`);

    let healthy = 0, degraded = 0, down = 0, autoRotated = 0;

    for (const proxy of proxies) {
      const check = await ProxyService.checkProxy(proxy);

      await Proxy.findByIdAndUpdate(proxy._id, {
        health:      check.health,
        latencyMs:   check.latencyMs || null,
        lastChecked: new Date(),
        lastIp:      check.ip || proxy.lastIp,
      });

      if (check.health >= 70) {
        healthy++;
      } else if (check.health > 0) {
        degraded++;
        _emitAlert('proxy:degraded', {
          id: proxy._id, host: proxy.host,
          health: check.health, latencyMs: check.latencyMs,
        });
      } else {
        down++;
        logger.warn(`Proxy DOWN: ${proxy.host}:${proxy.port}`);
        _emitAlert('proxy:down', { id: proxy._id, host: proxy.host, health: 0 });

        // Auto-rotate accounts bound to this dead proxy
        const affected = await Account.find({
          'proxy.host':   proxy.host,
          'proxy.port':   proxy.port,
          status:         { $ne: 'disabled' },
        });

        for (const acc of affected) {
          try {
            const newProxy = await ProxyService.getHealthyProxy(proxy.country);
            await Account.findByIdAndUpdate(acc._id, { proxy: newProxy });
            autoRotated++;
            _emitAlert('proxy:auto-rotated', {
              platform:  acc.platform,
              accountId: acc._id,
              newProxy:  `${newProxy.host}:${newProxy.port}`,
            });
            logger.info(`Auto-rotated proxy for ${acc.platform} account ${acc._id}`);
          } catch (err) {
            logger.warn(`No healthy replacement proxy for account ${acc._id}: ${err.message}`);
          }
        }
      }
    }

    logger.info(`Proxy check done: ${healthy} healthy, ${degraded} degraded, ${down} down, ${autoRotated} auto-rotated`);
  } catch (err) {
    logger.error(`Proxy health cron error: ${err.message}`);
  }
}

function _emitAlert(event, data) {
  try {
    const io = require('../server').io;
    if (io?.emit) io.emit(event, data);
  } catch {}
}

function startProxyCron() {
  if (started) return;
  started = true;

  // Every 15 minutes
  cron.schedule('*/15 * * * *', runProxyHealthCheck);

  logger.info('Proxy health cron started (15-min interval)');
}

module.exports = { startProxyCron, runProxyHealthCheck };
