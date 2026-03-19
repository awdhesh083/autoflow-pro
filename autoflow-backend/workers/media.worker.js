'use strict';
/**
 * Media Worker  —  async Bull queue for video/audio processing
 *
 * Queued jobs are pushed by the /api/v1/video/* and /api/v1/downloader/* routes
 * when the ?async=true flag is sent. Progress is streamed via Socket.io.
 *
 * Jobs:
 *   process.resize         resize for a platform preset
 *   process.compress       compress video
 *   process.watermark      add watermark
 *   process.trim           trim clip
 *   process.merge          merge clips
 *   process.gif            create GIF
 *   process.audio.extract  extract audio
 *   process.batch          batch operation
 *   download.url           download from any URL via yt-dlp
 */
require('dotenv').config();
const Bull   = require('bull');
const path   = require('path');
const fs     = require('fs');
const logger = require('../utils/logger');

const VideoProcessor   = require('../services/social/video-processor.service');
const MediaDownloader  = require('../services/social/media-downloader.service');

if (require.main === module) {
  require('../config/database')();
}

function buildRedisConfig() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  return url.startsWith('rediss://')
    ? { redis: { url, tls: { rejectUnauthorized: false } } }
    : { redis: url };
}

const noop = { add: async () => ({ id: 'test-job' }), process: () => {}, on: () => {} };
const mediaQueue    = process.env.NODE_ENV === 'test' ? noop : new Bull('media-process', buildRedisConfig());
const downloadQueue = process.env.NODE_ENV === 'test' ? noop : new Bull('media-download', buildRedisConfig());

// ── Socket.io helper ──────────────────────────────────────────────────────
function emitToUser(userId, event, data) {
  try {
    const io = require('../server').io;
    if (io?.emitToUser) io.emitToUser(String(userId), event, data);
  } catch {}
}

// ── Ensure output dirs exist ──────────────────────────────────────────────
['uploads/processed', 'uploads/downloads', 'uploads/temp'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ══════════════════════════════════════════════════════════════════════════
// MEDIA PROCESSING PROCESSOR
// ══════════════════════════════════════════════════════════════════════════
mediaQueue.process(5, async (job) => {
  const { type, inputPath, options = {}, userId, jobMeta = {} } = job.data;

  logger.info(`🎬 Media job [${type}] started: ${path.basename(inputPath || '')}`);

  emitToUser(userId, 'media:started', { jobId: job.id, type, file: path.basename(inputPath || '') });

  try {
    let result;

    switch (type) {
      case 'resize':
        result = VideoProcessor.resizeForPlatform(inputPath, options.preset, options);
        break;

      case 'resize.all':
        result = VideoProcessor.resizeForAllPlatforms(inputPath, options.platforms);
        break;

      case 'compress':
        result = VideoProcessor.compress(inputPath, options);
        break;

      case 'watermark.image':
        result = VideoProcessor.addImageWatermark(inputPath, options.watermarkPath, options);
        break;

      case 'watermark.text':
        result = VideoProcessor.addTextWatermark(inputPath, options.text, options);
        break;

      case 'trim':
        result = VideoProcessor.trim(inputPath, options.startTime, options.endTime, options);
        break;

      case 'split':
        result = VideoProcessor.splitIntoChunks(inputPath, options.chunkDurationSec, options);
        break;

      case 'merge':
        result = VideoProcessor.merge(options.videoPaths, options.outputPath);
        break;

      case 'audio.replace':
        result = VideoProcessor.replaceAudio(inputPath, options.audioPath, options);
        break;

      case 'audio.add.music':
        result = VideoProcessor.addBackgroundMusic(inputPath, options.musicPath, options);
        break;

      case 'audio.extract':
        result = VideoProcessor.extractAudio(inputPath, options.format);
        break;

      case 'audio.mute':
        result = VideoProcessor.muteAudio(inputPath);
        break;

      case 'speed':
        result = VideoProcessor.changeSpeed(inputPath, options.speed, options);
        break;

      case 'color':
        result = VideoProcessor.colorGrade(inputPath, options);
        break;

      case 'subtitles':
        result = VideoProcessor.burnSubtitles(inputPath, options.subtitlePath, options);
        break;

      case 'thumbnail':
        result = VideoProcessor.extractThumbnail(inputPath, options);
        break;

      case 'gif':
        result = VideoProcessor.createGif(inputPath, options);
        break;

      case 'convert':
        result = VideoProcessor.convert(inputPath, options.targetFormat, options);
        break;

      case 'intro.outro':
        result = VideoProcessor.addIntroOutro(inputPath, options.introPath, options.outroPath);
        break;

      case 'batch':
        result = await VideoProcessor.batchProcess(options.inputPaths, options.operation, options.operationOptions);
        break;

      default:
        throw new Error(`Unknown media job type: ${type}`);
    }

    // Build base URL for response
    const baseUrl    = process.env.BASE_URL || 'http://localhost:5000';
    const outputFile = Array.isArray(result) ? result : result;
    const outputUrl  = typeof result === 'string'
      ? `${baseUrl}/${result.replace(/^\.?\/?/, '')}`
      : result;

    const payload = { jobId: job.id, type, status: 'completed', result, outputUrl, meta: jobMeta };

    emitToUser(userId, 'media:completed', payload);
    logger.info(`✅ Media job [${type}] done: ${JSON.stringify(result).substring(0, 80)}`);
    return payload;

  } catch (err) {
    emitToUser(userId, 'media:failed', { jobId: job.id, type, error: err.message });
    logger.error(`❌ Media job [${type}] failed: ${err.message}`);
    throw err;
  }
});

// ══════════════════════════════════════════════════════════════════════════
// DOWNLOAD PROCESSOR
// ══════════════════════════════════════════════════════════════════════════
downloadQueue.process(3, async (job) => {
  const { url, options = {}, userId, jobMeta = {} } = job.data;

  logger.info(`⬇️  Download job started: ${url}`);
  emitToUser(userId, 'download:started', { jobId: job.id, url });

  try {
    const result = await MediaDownloader.download(url, {
      ...options,
      outputDir: options.outputDir || './uploads/downloads',
    });

    const baseUrl   = process.env.BASE_URL || 'http://localhost:5000';
    const outputUrl = result.filePath
      ? `${baseUrl}/${result.filePath.replace(/^\.?\/?/, '')}`
      : null;

    const payload = { jobId: job.id, status: 'completed', result, outputUrl, meta: jobMeta };
    emitToUser(userId, 'download:completed', payload);
    logger.info(`✅ Download done: ${result.filePath || url}`);
    return payload;

  } catch (err) {
    emitToUser(userId, 'download:failed', { jobId: job.id, url, error: err.message });
    logger.error(`❌ Download failed [${url}]: ${err.message}`);
    throw err;
  }
});

// ── Queue events ──────────────────────────────────────────────────────────
[mediaQueue, downloadQueue].forEach(q => {
  q.on('completed', job => logger.info(`✅ [${q.name}] Job ${job.id} done`));
  q.on('failed',   (job, err) => logger.error(`❌ [${q.name}] Job ${job.id}: ${err.message}`));
  q.on('stalled',  job => logger.warn(`⚠️  [${q.name}] Job ${job.id} stalled`));
});

// ── Exports ───────────────────────────────────────────────────────────────
module.exports = { mediaQueue, downloadQueue };

if (require.main === module) {
  logger.info('🎬 Media worker started — listening for jobs...');
}
