# AutoFlow Pro v5 — Deployment Guide

## Quick Start (Docker — Recommended)

```bash
git clone <your-repo>
cd autoflow-backend

# 1. Configure environment
cp .env.example .env
nano .env          # Fill in: MONGODB_URI, JWT_SECRET, ANTHROPIC_API_KEY at minimum

# 2. Start everything
docker-compose up -d

# 3. View logs
docker-compose logs -f app
```

API available at: `http://localhost:5000`  
Health check: `http://localhost:5000/health`

---

## Manual Setup

### Prerequisites
- Node.js ≥ 18
- MongoDB ≥ 7
- Redis ≥ 7

### Install & Run
```bash
npm install
cp .env.example .env   # Configure required variables
npm run validate:env   # Verify .env is complete
npm run dev:all        # Starts API + Campaign Worker + Media Worker
```

### Run Tests (offline, no DB needed)
```bash
npm test               # 105 tests, 8 suites — all pass offline
npm run test:coverage  # With coverage report
```

---

## Environment Variables

### Required (minimum to boot)
| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | `mongodb://localhost:27017/autoflow` |
| `JWT_SECRET` | 64+ char random string |

### AI Features
| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | From console.anthropic.com |

### Email (pick one)
| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_USER` | Gmail address |
| `SMTP_PASS` | Gmail app password |

### SMS
| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | From twilio.com |
| `TWILIO_AUTH_TOKEN` | From twilio.com |
| `TWILIO_PHONE_NUMBER` | Your Twilio number |

### WhatsApp (Baileys)
| Variable | Description |
|----------|-------------|
| `WA_SESSION_PATH` | `./sessions` |

### Push Notifications (Web Push)
Generate VAPID keys:
```bash
node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k))"
```
| Variable | Description |
|----------|-------------|
| `VAPID_PUBLIC_KEY` | Generated above |
| `VAPID_PRIVATE_KEY` | Generated above |
| `VAPID_EMAIL` | `mailto:admin@yourdomain.com` |

### Analytics & Tracking
| Variable | Description |
|----------|-------------|
| `GA4_MEASUREMENT_ID` | `G-XXXXXXXXXX` from GA4 Admin |
| `GA4_API_SECRET` | From GA4 Measurement Protocol secrets |
| `META_PIXEL_ID` | Facebook Pixel ID |
| `META_CAPI_TOKEN` | Meta Conversions API token |

### Billing (Stripe)
| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | From stripe.com dashboard |
| `STRIPE_WEBHOOK_SECRET` | From Stripe webhook settings |

---

## Frontend Setup

1. Copy `autoflow-final.jsx` → `src/App.jsx`
2. Install: `npm install recharts`
3. Add to `index.html`:
```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#00d4ff">
<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
```
4. Copy `public/manifest.json` and `public/sw.js` from backend to your Vite `public/` folder
5. Create `.env`:
```
VITE_API_URL=http://localhost:5000/api/v1
VITE_WS_URL=http://localhost:5000
```

---

## Production Deployment

### Nginx reverse proxy
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        root /var/www/autoflow/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

### Process Manager (PM2)
```bash
npm install -g pm2
pm2 start server.js --name autoflow-api
pm2 start workers/campaign.worker.js --name autoflow-worker
pm2 start workers/media.worker.js --name autoflow-media
pm2 save && pm2 startup
```

---

## Architecture

```
autoflow-backend/
├── server.js              # Express + Socket.io entry point
├── routes/                # 29 core + 23 extra platform routes (470 endpoints)
│   ├── auth.js            # JWT + 2FA + password reset + email verify
│   ├── campaigns.js       # CRUD + launch + A/B test + duplicate
│   ├── contacts.js        # CRM + scoring + segments
│   ├── sequences.js       # Visual flow builder CRUD + enroll
│   ├── tracking.js        # GA4 + Meta Pixel attribution
│   ├── gdpr.js            # Privacy + consent + erasure
│   ├── audit.js           # Immutable audit log (90d TTL)
│   ├── search.js          # Full-text search + typeahead
│   ├── links.js           # Link shortener + UTM tracker
│   ├── templates.js       # Message template library
│   ├── segments.js        # Smart contact segments
│   ├── settings.js        # User preferences + push + send-time
│   └── extra/             # 14-platform automation routes
├── services/              # 23 core + 20 sub-platform services
│   ├── push.service.js    # Web Push notifications (VAPID)
│   ├── tracking.service.js # GA4 + Meta CAPI
│   ├── engagement.scoring.js # Nightly contact scoring
│   ├── send-time-optimizer.js # Weekly send-time analysis
│   ├── drip-sequence.service.js # Flow builder execution engine
│   └── social/            # 19 platform-specific service files
├── workers/               # Bull queue processors + crons
├── middleware/             # auth, i18n, permissions, rate-limiting
├── models/                # 12 Mongoose models
├── tests/                 # 8 suites, 105 tests (offline)
└── public/                # PWA manifest + service worker
```

---

## Cron Schedule

| Job | Time | File |
|-----|------|------|
| Campaign scheduler | Every minute | campaign.worker.js |
| Drip sequences | Every 30s | drip.cron.js |
| Analytics rollup | 02:00 AM daily | analytics.rollup.js |
| Engagement scoring | 03:00 AM daily | engagement.scoring.js |
| Send-time analysis | 04:00 AM Sunday | send-time-optimizer.js |
| Proxy health check | Every 15 min | proxy.cron.js |

---

## API Authentication

All endpoints (except `/auth/login`, `/auth/register`, `/links/r/:code`) require:
```
Authorization: Bearer <jwt_token>
```

Or API key:
```
X-API-Key: sk-af-<your_api_key>
```
