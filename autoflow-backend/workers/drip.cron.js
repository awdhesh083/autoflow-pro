'use strict';
/**
 * Drip Sequence Cron Loader
 *
 * DripSequenceService starts its own internal 30-second cron in _startProcessor()
 * which is called from the constructor. Requiring it once is enough to boot it.
 *
 * This module exists so server.js has a clean startDripCron() function to call
 * after the DB connection is confirmed ready.
 */
const logger = require('../utils/logger');

let started = false;

function startDripCron() {
  if (started) return;
  started = true;
  try {
    // Requiring the service instantiates it, which calls _startProcessor()
    // which registers the 30-second cron internally.
    require('../services/drip-sequence.service');
    logger.info('Drip sequence processor loaded (internal 30s cron active)');
  } catch (err) {
    logger.error(`Failed to load drip sequence service: ${err.message}`);
  }
}

module.exports = { startDripCron };
