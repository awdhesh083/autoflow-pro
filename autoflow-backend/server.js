'use strict';
require('dotenv').config();
require('express-async-errors');

// ── Validate env first ────────────────────────────────────────────────────
const { validateEnv } = require('./utils/validateEnv');
validateEnv();

const express       = require('express');
const http          = require('http');
const cors          = require('cors');
const helmet        = require('helmet');
const compression   = require('compression');
const morgan        = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const xss           = require('xss-clean');
const hpp           = require('hpp');
const { Server }    = require('socket.io');
const path          = require('path');

// ── Infrastructure ────────────────────────────────────────────────────────
const connectDB        = require('./config/database');
const connectRedis     = require('./config/redis');
const logger           = require('./utils/logger');
const errorHandler     = require('./middleware/errorHandler');
const { globalLimiter, authLimiter, userLimiter } = require('./middleware/rateLimiter');
const socketHandler    = require('./utils/socketHandler');
const { i18nMiddleware }                          = require('./middleware/i18n');
const { featureGuard, permissionGuard }           = require('./middleware/permissionGuard');

// ── Background workers (all self-register their own crons on require) ─────
require('./workers/analytics.rollup');    // nightly 02:00 AM
require('./services/engagement.scoring');  // nightly 03:00 AM contact scoring
require('./services/send-time-optimizer'); // weekly Sun 04:00 AM send-time analysis
require('./workers/media.worker');        // video/download queue processors
const { startDripCron }  = require('./workers/drip.cron');
const { startProxyCron } = require('./workers/proxy.cron');

// ── Core routes ───────────────────────────────────────────────────────────
const authRoutes      = require('./routes/auth');
const accountRoutes   = require('./routes/accounts');
const contactRoutes   = require('./routes/contacts');
const campaignRoutes  = require('./routes/campaigns');
const whatsappRoutes  = require('./routes/whatsapp');
const emailRoutes     = require('./routes/email');
const smsRoutes       = require('./routes/sms');
const socialRoutes    = require('./routes/social');
const telegramRoutes  = require('./routes/telegram');
const analyticsRoutes = require('./routes/analytics');
const securityRoutes  = require('./routes/security');
const aiRoutes        = require('./routes/ai');
const webhookRoutes   = require('./routes/webhooks');
const schedulerRoutes = require('./routes/scheduler');
const mediaRoutes     = require('./routes/media');
const platformRoutes  = require('./routes/platforms');
const adminRoutes     = require('./routes/admin');
const { router: saasRoutes } = require('./routes/saas');
const gdprRoutes       = require('./routes/gdpr');
const auditRoutes      = require('./routes/audit');
const settingsRoutes   = require('./routes/settings');
const searchRoutes     = require('./routes/search');
const sequenceRoutes   = require('./routes/sequences');
const trackingRoutes   = require('./routes/tracking');
const ecommerceRoutes  = require('./routes/ecommerce');
const templateRoutes   = require('./routes/templates');
const segmentRoutes    = require('./routes/segments');
const linkRoutes       = require('./routes/links');

// ── Platform-specific routes ──────────────────────────────────────────────
const igRoutes       = require('./routes/extra/instagram.routes');
const fbRoutes       = require('./routes/extra/facebook.routes');
const twRoutes       = require('./routes/extra/twitter.routes');
const tiktokRoutes   = require('./routes/extra/tiktok.routes');
const ytRoutes       = require('./routes/extra/youtube.routes');
const liRoutes       = require('./routes/extra/linkedin.routes');
const tgAdvRoutes    = require('./routes/extra/telegram-adv.routes');
const discordRoutes  = require('./routes/extra/discord.routes');
const scraperRoutes  = require('./routes/extra/scraper.routes');

// ── Legacy extra routes ───────────────────────────────────────────────────
const { dripRoutes, aiImageRoutes }                                        = require('./routes/extra');
const { waStatusRoutes, igStoryRoutes }                                    = require('./routes/extra/part1.routes');
const { messengerRoutes, downloaderRoutes, videoRoutes }                   = require('./routes/extra/part2.routes');
const { captionRoutes, postSchedulerRoutes }                               = require('./routes/extra/part3.routes');
const { competitorSpyRoutes, pinterestRoutes, repurposerRoutes }           = require('./routes/extra/part4.routes');
const { giveawayRoutes, ugcRoutes, commentRoutes, influencerRoutes }       = require('./routes/extra/priority.routes');

// ── App ───────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || '*', methods: ['GET','POST'] },
  transports: ['websocket','polling'],
});

//  Initiate connections (they start in background - health check verifies)
connectDB();
connectRedis();

// ── Security middleware ───────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin:       process.env.FRONTEND_URL || '*',
  credentials:  true,
  methods:      ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Api-Key'],
}));
app.use(mongoSanitize());
app.use(i18nMiddleware);   // detect Accept-Language header
app.use(xss());
app.use(hpp());
app.use(compression({ 
  level: 6,        // Balance CPU vs compression (1-9, default 6)
  threshold: 1024  // Only compress >1KB responses
}));
app.use(globalLimiter);

// ── Body parsers  (raw must come BEFORE json for Stripe/Shopify webhooks) ─
// Raw for webhook signature verification routes
app.use('/api/v1/saas/stripe/webhook',        (req, res, next) => { express.raw({ type: '*/*' })(req, res, next); });
app.use('/api/v1/ecommerce/webhook/shopify',  (req, res, next) => { express.raw({ type: 'application/json' })(req, res, next); });

// JSON for everything else
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/',        express.static(path.join(__dirname, 'public')));  // PWA assets

// ── Health check ──────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    // Check MongoDB
    const mongoReady = require('mongoose').connection.readyState === 1;
    if (!mongoReady) return res.status(503).json({ status: 'error', reason: 'MongoDB not ready' });

    // Check Redis
    const { isRedisReady } = require('./config/redis');
    if (!isRedisReady()) {
      return res.status(503).json({ status: 'error', reason: 'Redis not connected' });
    }

    res.json({
      status: 'ok', version: '4.0.0',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      services: { database: 'connected', redis: 'connected', queue: 'running' },
    });
  } catch (err) {
    logger.error(`Health check error: ${err.message}`);
    res.status(503).json({ status: 'error', reason: err.message });
  }
});

// ── API Routes — ALL registered before server.listen() ───────────────────
const V1 = '/api/v1';

// Auth (dedicated rate limiter)
app.use(`${V1}/auth`,        authLimiter, authRoutes);

// Core
app.use(`${V1}/accounts`,    permissionGuard('canManageAccounts'), accountRoutes);
app.use(`${V1}/contacts`,    contactRoutes);
app.use(`${V1}/campaigns`,   permissionGuard('canSendCampaigns'), campaignRoutes);
app.use(`${V1}/whatsapp`,    userLimiter, featureGuard('whatsappBulk'),     permissionGuard('canSendCampaigns'), whatsappRoutes);
app.use(`${V1}/email`,       userLimiter, featureGuard('emailBulk'),         permissionGuard('canSendCampaigns'), emailRoutes);
app.use(`${V1}/sms`,         featureGuard('smsBulk'),           permissionGuard('canSendCampaigns'), smsRoutes);
app.use(`${V1}/social`,      socialRoutes);
app.use(`${V1}/telegram`,    featureGuard('socialAutomation'),   permissionGuard('canSendCampaigns'), telegramRoutes);
app.use(`${V1}/analytics`,   permissionGuard('canViewAnalytics'), analyticsRoutes);
app.use(`${V1}/security`,    securityRoutes);
app.use(`${V1}/ai`,          userLimiter, aiRoutes);
app.use(`${V1}/webhooks`,    webhookRoutes);
app.use(`${V1}/scheduler`,   schedulerRoutes);
app.use(`${V1}/media`,       mediaRoutes);
app.use(`${V1}/platforms`,   platformRoutes);
app.use(`${V1}/admin`,       adminRoutes);
app.use(`${V1}/saas`,        saasRoutes);
app.use(`${V1}/ecommerce`,   ecommerceRoutes);
app.use(`${V1}/privacy`,     gdprRoutes);
app.use(`${V1}/audit`,       auditRoutes);
app.use(`${V1}/settings`,    settingsRoutes);
app.use(`${V1}/search`,      searchRoutes);
app.use(`${V1}/sequences`,   sequenceRoutes);
app.use(`${V1}/tracking`,    trackingRoutes);
app.use(`${V1}/templates`,   templateRoutes);
app.use(`${V1}/segments`,    segmentRoutes);
app.use(`${V1}/links`,       linkRoutes);

// Platform automations
app.use(`${V1}/instagram`,   featureGuard('socialAutomation'),   permissionGuard('canSendCampaigns'), igRoutes);
app.use(`${V1}/facebook`,    featureGuard('socialAutomation'),   permissionGuard('canSendCampaigns'), fbRoutes);
app.use(`${V1}/twitter`,     featureGuard('socialAutomation'),   permissionGuard('canSendCampaigns'), twRoutes);
app.use(`${V1}/tiktok`,      featureGuard('socialAutomation'),   permissionGuard('canSendCampaigns'), tiktokRoutes);
app.use(`${V1}/youtube`,     featureGuard('socialAutomation'),   permissionGuard('canSendCampaigns'), ytRoutes);
app.use(`${V1}/linkedin`,    featureGuard('socialAutomation'),   permissionGuard('canSendCampaigns'), liRoutes);
app.use(`${V1}/tg-adv`,      tgAdvRoutes);
app.use(`${V1}/discord`,     featureGuard('socialAutomation'),   permissionGuard('canSendCampaigns'), discordRoutes);
app.use(`${V1}/leads`,       scraperRoutes);

// Feature modules
app.use(`${V1}/drip`,        dripRoutes);
app.use(`${V1}/ai-image`,    aiImageRoutes);
app.use(`${V1}/wa-status`,   waStatusRoutes);
app.use(`${V1}/ig-story`,    igStoryRoutes);
app.use(`${V1}/messenger`,   messengerRoutes);
app.use(`${V1}/downloader`,  downloaderRoutes);
app.use(`${V1}/video`,       videoRoutes);
app.use(`${V1}/captions`,    captionRoutes);
app.use(`${V1}/posts`,       postSchedulerRoutes);
app.use(`${V1}/competitors`, competitorSpyRoutes);
app.use(`${V1}/pinterest`,   featureGuard('socialAutomation'),   permissionGuard('canSendCampaigns'), pinterestRoutes);
app.use(`${V1}/repurpose`,   repurposerRoutes);
app.use(`${V1}/giveaways`,   giveawayRoutes);
app.use(`${V1}/ugc`,         ugcRoutes);
app.use(`${V1}/comments`,    commentRoutes);
app.use(`${V1}/influencers`, influencerRoutes);

// ── Socket.io ─────────────────────────────────────────────────────────────
socketHandler(io);
app.set('io', io);

// ── 404 + error handler ───────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: `${req.method} ${req.url} not found` }));
app.use(errorHandler);

// ── Start — AFTER all routes ──────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 5000;
server.listen(PORT, () => {
  logger.info(`🚀  AutoFlow v4.0  →  port ${PORT}  (${process.env.NODE_ENV || 'development'})`);
  logger.info(`🔗  API: http://localhost:${PORT}/api/v1`);
  logger.info(`💡  Health: http://localhost:${PORT}/health`);

  // Start background crons after DB is connected
  startDripCron();
  startProxyCron();
});

process.on('SIGTERM',            ()    => { server.close(() => process.exit(0)); });
process.on('unhandledRejection', (err) => { logger.error(`Unhandled: ${err?.message}`); server.close(() => process.exit(1)); });
process.on('uncaughtException',  (err) => { logger.error(`Uncaught: ${err.message}`);   process.exit(1); });

module.exports = { app, server, io };
