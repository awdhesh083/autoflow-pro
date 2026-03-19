'use strict';
/**
 * Proxy Health Worker
 * Runs every 15 minutes. Checks all active proxies, updates health scores,
 * disables dead proxies, and emits Socket.io alerts when a proxy dies.
 *
 * Also handles auto-rotation: when an Account's proxy health drops below
 * the threshold, it automatically assigns a healthier one.
 */
require('dotenv').config();
const cron    = require('node-cron');
const logger  = require('../utils/logger');
const { Proxy, Account } = require('../models');
const ProxyService = require('../services/proxy.service');

const HEALTH_THRESHOLD = 60;  // Below this → disable proxy
const WARN_THRESHOLD   = 75;  // Below this → warn + try to rotate

function getIO() {
  try { return require('../server').io; } catch { return null; }
}

function alertUser(userId, event, data) {
  try {
    const io = getIO();
    if (io?.emitToUser) io.emitToUser(String(userId), event, data);
  } catch {}
}

async function runHealthCheck() {
  logger.info('🔍 Proxy health check starting...');

  const proxies = await Proxy.find({ isActive: true });
  if (!proxies.length) {
    logger.info('No active proxies to check');
    return { checked: 0, healthy: 0, disabled: 0, warned: 0 };
  }

  const results = { checked: proxies.length, healthy: 0, disabled: 0, warned: 0 };

  for (const proxy of proxies) {
    try {
      const check = await ProxyService.checkProxy(proxy);

      await Proxy.findByIdAndUpdate(proxy._id, {
        health:      check.health,
        latencyMs:   check.latencyMs || null,
        lastChecked: new Date(),
        isActive:    check.health > HEALTH_THRESHOLD,
      });

      if (!check.healthy || check.health <= HEALTH_THRESHOLD) {
        results.disabled++;
        logger.warn(`Proxy ${proxy.host}:${proxy.port} disabled — health ${check.health}`);

        // Alert owner if proxy has a userId
        if (proxy.userId) {
          alertUser(proxy.userId, 'proxy:down', {
            proxyId: proxy._id,
            host:    proxy.host,
            port:    proxy.port,
            health:  check.health,
            error:   check.error,
          });
        }

        // Auto-rotate accounts using this proxy
        const affectedAccounts = await Account.find({ 'proxy._id': proxy._id, status: 'active' });
        for (const acc of affectedAccounts) {
          try {
            const replacement = await ProxyService.getHealthyProxy(proxy.country);
            await Account.findByIdAndUpdate(acc._id, { proxy: replacement });
            logger.info(`Auto-rotated proxy for account ${acc._id} (${acc.platform})`);
            if (acc.userId) {
              alertUser(acc.userId, 'proxy:auto-rotated', {
                accountId:   acc._id,
                platform:    acc.platform,
                newProxy:    `${replacement.host}:${replacement.port}`,
              });
            }
          } catch {
            logger.warn(`No replacement proxy for account ${acc._id}`);
          }
        }

      } else if (check.health <= WARN_THRESHOLD) {
        results.warned++;
        if (proxy.userId) {
          alertUser(proxy.userId, 'proxy:warning', {
            proxyId: proxy._id,
            host:    proxy.host,
            health:  check.health,
            latency: check.latencyMs,
          });
        }
        results.healthy++;
      } else {
        results.healthy++;
      }

    } catch (err) {
      logger.error(`Proxy check error for ${proxy.host}: ${err.message}`);
      await Proxy.findByIdAndUpdate(proxy._id, { health: 0, lastChecked: new Date() });
      results.disabled++;
    }
  }

  logger.info(`Proxy health check done: ${results.healthy} healthy, ${results.disabled} disabled, ${results.warned} warned`);
  return results;
}

// ── Cron: every 15 minutes ────────────────────────────────────────────────
let cronStarted = false;

function startProxyCron() {
  if (cronStarted) return;
  cronStarted = true;
  cron.schedule('*/15 * * * *', async () => {
    await runHealthCheck().catch(err => logger.error(`Proxy cron error: ${err.message}`));
  });
  logger.info('🔍 Proxy health cron started (15-min interval)');
}

module.exports = { startProxyCron, runHealthCheck };

if (require.main === module) {
  if (require.main === module) require('../config/database')();
  startProxyCron();
  logger.info('Proxy health worker started standalone');
}
