# 🚀 AutoFlow Pro v4.0 — Deployment Guide

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Railway / VPS                         │
│                                                          │
│   web      →  node server.js        (port 5000)         │
│   worker   →  campaign.worker.js    (Bull queues)        │
│   media    →  media.worker.js       (video/download)     │
│                                                          │
│   MongoDB Atlas   ←→   Upstash Redis                    │
└─────────────────────────────────────────────────────────┘
```

---

## Step 1 — MongoDB Atlas (Free)

1. **https://mongodb.com/atlas** → Sign Up → Create **M0 Free** cluster
2. **Database Access** → Add user → username + password
3. **Network Access** → Add IP → `0.0.0.0/0` (allow all)
4. **Connect** → Drivers → Copy URI → replace `<password>`

```
MONGODB_URI=mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/autoflow
```

---

## Step 2 — Upstash Redis (Free)

1. **https://upstash.com** → Create Database → Global → Free tier
2. **Details** tab → Copy **Redis URL** (starts with `rediss://`)

```
REDIS_URL=rediss://default:password@endpoint.upstash.io:6379
```

---

## Step 3 — Generate JWT Secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Run twice — one for JWT_SECRET, one for REFRESH_TOKEN_SECRET
```

---

## Step 4 — Email Setup (Gmail, free)

1. **Google Account** → Security → 2-Step Verification ON
2. **App Passwords** → Select Mail → Generate 16-char password

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourgmail@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
```

---

## Step 5 — Anthropic API Key

1. **https://console.anthropic.com** → API Keys → Create

```
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

---

## Step 6 — Deploy to Railway

### Option A: GitHub (recommended)

```bash
git init && git add . && git commit -m "AutoFlow v4"
git remote add origin https://github.com/you/autoflow-backend.git
git push -u origin main
```

1. **https://railway.app** → New Project → Deploy from GitHub
2. Select repo → Railway auto-detects Dockerfile
3. **Variables** tab → paste all `.env` values
4. Click **Deploy** → ~4 minutes
5. **Settings** → Domains → Generate domain
6. Update `BASE_URL` and `FRONTEND_URL` in Variables

### Option B: Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

---

## Step 7 — Add Worker Services

In Railway dashboard, create **2 additional services** from the same GitHub repo:

**Campaign Worker:**
- Settings → Start Command: `node workers/campaign.worker.js`
- Add same environment variables

**Media Worker:**
- Settings → Start Command: `node workers/media.worker.js`
- Add same environment variables

---

## Step 8 — Connect WhatsApp

1. POST `https://your-app.railway.app/api/v1/auth/register` with name/email/password
2. POST `https://your-app.railway.app/api/v1/auth/login` to get JWT token
3. POST `https://your-app.railway.app/api/v1/accounts` to create a WhatsApp account
4. POST `https://your-app.railway.app/api/v1/whatsapp/init/:accountId` to start client
5. Connect frontend with Socket.io → listen for `qr` event → display QR image
6. Scan QR from WhatsApp → Settings → Linked Devices

**Keep session alive:** Mount Railway volume at `/app/sessions` to persist sessions across deploys.

---

## Step 9 — Verify

```bash
# Health check
curl https://your-app.railway.app/health

# Register
curl -X POST https://your-app.railway.app/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@you.com","password":"password123"}'

# Analytics (requires Bearer token)
curl https://your-app.railway.app/api/v1/analytics/overview \
  -H "Authorization: Bearer YOUR_JWT"
```

---

## API Reference

| Base | `https://your-app.railway.app/api/v1` |
|------|---------------------------------------|
| Auth | `POST /auth/register` `POST /auth/login` `GET /auth/me` |
| WA | `POST /whatsapp/broadcast` `POST /whatsapp/init/:id` |
| Email | `POST /email/campaign` `POST /email/send` |
| SMS | `POST /sms/bulk` |
| IG | `POST /instagram/dm/bulk` `POST /instagram/follow` |
| Analytics | `GET /analytics/overview` `GET /analytics/funnel` |
| AI | `POST /ai/generate` `POST /ai/chatbot` |
| Platforms | `GET /platforms` `GET /platforms/health` |

---

## Socket.io Events

```js
const socket = io('https://your-app.railway.app');

// Authenticate
socket.emit('authenticate', { token: 'your-jwt' });
socket.on('authenticated', ({ userId }) => console.log('Connected'));

// WhatsApp QR
socket.emit('join:account', { accountId: 'xxx' });
socket.on('qr', ({ accountId, qr }) => displayQRCode(qr));
socket.on('wa:ready', ({ accountId }) => console.log('WA connected!'));

// Campaign progress
socket.emit('join:campaign', { campaignId: 'xxx' });
socket.on('campaign:progress', ({ sent, total, progress }) => updateBar(progress));
socket.on('campaign:completed', ({ name, sent, failed }) => showResult());

// Media processing
socket.on('media:completed', ({ type, outputUrl }) => showDownload(outputUrl));

// Proxy alerts
socket.on('proxy:down', ({ host, health }) => alert(`Proxy ${host} down!`));
socket.on('proxy:auto-rotated', ({ platform, newProxy }) => console.log(`Rotated to ${newProxy}`));
```

---

## Cron Schedule

| Job | When | What |
|-----|------|------|
| Campaign scheduler | Every minute | Launches overdue scheduled campaigns |
| Drip sequences | Every 30 seconds | Executes pending enrollment steps |
| Analytics rollup | Daily 02:00 AM | Pre-computes dashboard stats for all users |
| Proxy health check | Every 15 minutes | Checks + auto-rotates dead proxies |
| Hourly limit reset | Every hour | Resets `hourlySent` counters |
| Daily limit reset | Midnight | Resets `dailySent` counters |
| Account health | Every 5 minutes | Updates health scores |

---

## Free Tier Limits

| Service | Free Limit |
|---------|-----------|
| MongoDB Atlas | 512 MB |
| Upstash Redis | 10,000 req/day |
| Railway | 500 hrs/month |
| Gmail SMTP | 500 emails/day |
| Anthropic | Pay per use (~$0.003/req) |
| Cloudinary | 25 GB storage |
| Twitter API | 1,500 tweets/month |
| Telegram | Unlimited |
| WhatsApp QR | Unlimited (ban risk if spam) |

---

## Troubleshooting

**MongoDB IP whitelist:**  Atlas → Network Access → `0.0.0.0/0`

**WhatsApp sessions reset on deploy:**  Mount Railway volume at `/app/sessions`

**Puppeteer fails on Railway:**  Dockerfile includes all Chromium deps — ensure Railway uses Dockerfile not Nixpacks

**yt-dlp not found:**  Verify `pip3 install yt-dlp` ran in Docker build; check `docker logs`

**Redis TLS error:**  Upstash URLs start with `rediss://` (double s) — the code handles TLS automatically

**Railway sleeps (free tier):**  Use UptimeRobot (free) to ping `/health` every 5 min

---

## API Quick Reference (Complete)

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/register | Create account, returns JWT + API key |
| POST | /auth/login | Login, returns JWT + refresh token |
| POST | /auth/refresh | Rotate refresh token |
| GET  | /auth/me | Current user |
| POST | /auth/change-password | Update password |
| POST | /auth/regenerate-key | New API key |

### Messaging
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /whatsapp/init/:accountId | Start WA client + stream QR via socket |
| GET  | /whatsapp/qr/:accountId | Get QR code data URL |
| POST | /whatsapp/broadcast | Bulk send (queued via Bull) |
| POST | /email/campaign | Bulk email blast (queued) |
| POST | /sms/bulk | Bulk SMS (queued) |
| POST | /telegram/broadcast | Telegram bulk send |

### Platforms
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | /platforms | All connected platform accounts + stats |
| GET  | /platforms/health | Health summary |
| POST | /instagram/dm/bulk | Bulk DM |
| POST | /instagram/follow | Auto-follow |
| POST | /facebook/groups/post | Post to groups |
| POST | /twitter/thread | Post thread |
| POST | /tiktok/upload | Upload TikTok video |
| POST | /youtube/upload | Upload YouTube video |
| POST | /linkedin/connect | Connection requests |
| GET  | /leads/google-maps | Scrape B2B leads |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /analytics/overview | Full dashboard stats |
| GET | /analytics/funnel | Conversion funnel |
| GET | /analytics/realtime | Last-5-min counts |
| GET | /analytics/best-times/:platform | Best posting time |
| GET | /analytics/revenue | Ecommerce revenue |
| GET | /analytics/export | CSV download |

### Admin (role: admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | /admin/users | All users paginated |
| PUT  | /admin/users/:id | Update user plan/role |
| POST | /admin/users/:id/toggle | Activate / deactivate |
| GET  | /admin/stats | Platform-wide aggregates |
| GET  | /admin/queue/stats | Bull queue depths |
| POST | /admin/broadcast | Email all users |

### SaaS Billing
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | /saas/plans | All plan features + limits |
| GET  | /saas/tenant | Current tenant |
| GET  | /saas/usage | Monthly usage vs limits |
| POST | /saas/checkout | Create Stripe checkout session |
| POST | /saas/plan/upgrade | Upgrade plan |
| POST | /saas/billing-portal | Stripe billing portal |
| POST | /saas/team/invite | Invite team member |

### Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /webhooks | Register webhook |
| GET  | /webhooks/:id/logs | Delivery logs |
| POST | /webhooks/:id/logs/:logId/retry | Retry failed delivery |
| POST | /webhooks/:id/test | Send test event |

---

## Webhook Event Reference

| Event | When fired |
|-------|-----------|
| `campaign.completed` | Any campaign finishes |
| `message.sent` | Individual message sent |
| `message.delivered` | Message confirmed delivered |
| `account.blocked` | Platform account blocked |
| `contact.replied` | Contact sent an inbound message |
| `test.ping` | Manual test from dashboard |

---

## Environment Variables Reference

```bash
# REQUIRED
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<64-char hex>

# STRONGLY RECOMMENDED
REDIS_URL=rediss://...         # Upstash free tier
ANTHROPIC_API_KEY=sk-ant-...   # AI features
REFRESH_TOKEN_SECRET=<hex>

# EMAIL
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx  # App password

# WHATSAPP
WA_SESSION_PATH=./sessions/whatsapp
WA_HEADLESS=true

# TELEGRAM
TELEGRAM_BOT_TOKEN=1234567890:ABC...

# TWITTER
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_SECRET=...

# YOUTUBE / GOOGLE
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# STRIPE (SaaS billing)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...

# SHOPIFY (ecommerce)
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...

# AI IMAGE
HUGGINGFACE_API_KEY=hf_...

# DISCORD
DISCORD_BOT_TOKEN=...

# SECURITY
WEBHOOK_SECRET=<random hex>
BASE_URL=https://your-app.railway.app
FRONTEND_URL=https://your-frontend.com
```
