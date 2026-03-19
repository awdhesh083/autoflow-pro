# AutoFlow Pro Backend v4.0

Full social media automation backend — 14 platforms, 37+ routes, Bull queues, Socket.io real-time, MongoDB, Redis.

## Quick Start

### 1. Install
```bash
npm install
```

### 2. Configure
```bash
cp .env.example .env
# Fill in MONGODB_URI and JWT_SECRET at minimum
```

### 3. Run (development)
```bash
npm run dev:all
# Starts server + campaign worker with nodemon
```

### 4. Run (production)
```bash
npm run start:all
```

## API Base
```
http://localhost:5000/api/v1
```

## Health Check
```
GET /health
```

## Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/register | Create account |
| POST | /auth/login | Get JWT token |
| GET | /contacts | List contacts |
| POST | /contacts/import/csv | Bulk CSV import |
| POST | /whatsapp/broadcast | WhatsApp bulk send |
| POST | /email/campaign | Email blast |
| POST | /sms/bulk | SMS bulk |
| POST | /ai/generate | AI content generation |
| GET | /analytics/overview | Dashboard stats |
| POST | /campaigns/:id/launch | Launch campaign |

## Architecture

```
server.js          Express app + Socket.io
workers/
  campaign.worker.js    Bull queue processors (WA, Email, SMS, Social)
  analytics.rollup.js   Nightly stats aggregation cron (02:00 AM)
  drip.cron.js          Drip sequence executor (every 30s)
routes/            15 core route files (split from god-file)
services/          Platform services (WA, Email, IG, FB, Twitter, TikTok...)
models/            Mongoose schemas (User, Contact, Campaign, MessageLog...)
middleware/        auth.js, errorHandler.js, rateLimiter.js
config/            database.js, redis.js
utils/             logger.js, helpers.js, socketHandler.js, validateEnv.js
```

## Socket.io Events

Connect and authenticate:
```js
const socket = io('http://localhost:5000');
socket.emit('authenticate', { token: 'your-jwt' });
socket.on('authenticated', ({ userId }) => console.log('Connected:', userId));

// Join a campaign room for live progress
socket.emit('join:campaign', { campaignId: 'xxx' });
socket.on('campaign:progress', ({ status, sent, total, progress }) => {
  console.log(`Progress: ${progress}% — ${sent}/${total} sent`);
});
socket.on('campaign:completed', ({ name, sent, failed }) => {
  console.log(`${name} done: ${sent} sent, ${failed} failed`);
});
```

## Deployment (Railway)

1. Connect GitHub repo
2. Set env vars from `.env.example`  
3. Railway auto-detects `Procfile` → starts both `web` and `worker` services
4. Set `NODE_ENV=production`

## Environment Variables

See `.env.example` for full list. Minimum required:
- `MONGODB_URI` — MongoDB Atlas connection string
- `JWT_SECRET` — 64-char random hex string
- `REDIS_URL` — Upstash Redis URL (optional but recommended)
- `ANTHROPIC_API_KEY` — Claude AI features
