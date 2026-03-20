# 🚨 BACKEND AUDIT - ACTION ITEMS

## Critical (Fix Today!)

### 1. Fix Missing REDIS_URL= Prefix
**File**: [.env](file:///c:/Users/The%20Kitchen%20Maker/Desktop/AutoFlow-Pro/autoflow-backend/.env#L48-L50)

**Current (❌ WRONG)**:
```env
# Upstash Redis (free 10k req/day) — for queues, caching, rate limiting
# Get from: https://upstash.com → Create Database → Copy REST URL
  
redis://default:gQAAAAAAASvIAAIncDEzMjAxNDVhYjI1Y2E0MTFjYjJlODQxYzRiN2U1ZjI4MXAxNzY3NDQ@moving-tortoise-76744.upstash.io:6379
```

**Fix (✅ CORRECT)**:
```env
REDIS_URL=redis://default:gQAAAAAAASvIAAIncDEzMjAxNDVhYjI1Y2E0MTFjYjJlODQxYzRiN2U1ZjI4MXAxNzY3NDQ@moving-tortoise-76744.upstash.io:6379
```

---

### 2. Rotate All Credentials
These are currently exposed in .env:

```env
❌ MongoDB password: Raju1975 (visible!)
❌ Gmail app password: uyah drgt cgxu bszi (visible!)
❌ Cloudinary API secret: 6YwgDEaeYRaoWjGKEfNNtUFw3yI (visible!)
```

**Steps**:
1. Go to each service and regenerate/rotate credentials:
   - MongoDB Atlas → Database Access → Change password
   - Gmail → Security → App passwords → Delete old, create new
   - Cloudinary → Dashboard → API Keys → Regenerate

2. Update .env with new values

3. Update Railway environment variables with new values

4. Push code to Git (will auto-deploy)

---

### 3. Generate New JWT Secrets

**Current (❌ Template values)**:
```env
JWT_SECRET=6762444c8aae33e9e28e2b3a4cfe4eb1a5095805792fb6900a76c631c06350b3
REFRESH_TOKEN_SECRET=6c15ff215c3772fa0b72e1f9173a2482b1e7bab69225c821c719cae628a40f2a
```

**Generate new ones**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Run this TWICE - copy each output

# Example output:
# a1b2c3d4e5f6g7h8i9j10k11l12m13n14o15p16q17r18s19t20u21v22w23x24y25z
```

**Update .env**:
```env
JWT_SECRET=<paste-your-generated-value-here>
REFRESH_TOKEN_SECRET=<paste-your-second-generated-value-here>
```

---

## High Priority (Fix This Week)

### 4. Increase MongoDB Connection Timeout
**File**: [config/database.js](file:///c:/Users/The%20Kitchen%20Maker/Desktop/AutoFlow-Pro/autoflow-backend/config/database.js)

**Current**:
```javascript
serverSelectionTimeoutMS: 5000,  // ← Too short!
```

**Change to**:
```javascript
serverSelectionTimeoutMS: 10000,  // ← Give more time for Railway
```

---

### 5. Improve Redis Reconnection Strategy
**File**: [config/redis.js](file:///c:/Users/The%20Kitchen%20Maker/Desktop/AutoFlow-Pro/autoflow-backend/config/redis.js#L11)

**Current**:
```javascript
socket: { reconnectStrategy: (retries) => Math.min(retries * 50, 500) }
```

**Change to**:
```javascript
socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 3000) }
// Backoff: 200ms, 400ms, 600ms, 800ms, 1000ms, 1200ms, 1400ms, 1600ms, 1800ms, 2000ms, 2200ms, 2400ms, 2600ms, 2800ms, 3000ms...
```

---

### 6. Create .env.example File
Copy `.env` and create `.env.example` with all secrets replaced by placeholders:

```env
# ✅ SAFE TO COMMIT - No real credentials
NODE_ENV=production
PORT=5000
BASE_URL=https://your-domain.com
FRONTEND_URL=https://your-frontend.com

MONGODB_URI=mongodb+srv://username:PASSWORD@cluster.mongodb.net/database
REDIS_URL=redis://user:PASSWORD@host:6379

JWT_SECRET=<run:node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
REFRESH_TOKEN_SECRET=<run:node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">

ANTHROPIC_API_KEY=sk-ant-api03-XXXXXXXXXXXXXXXX
SMTP_HOST=smtp.gmail.com
SMTP_USER=your@gmail.com
SMTP_PASS=<gmail-app-password>

# ... other optional vars
```

Then:
```bash
git add .env.example
git commit -m "Add .env.example template (no secrets)"
```

---

## Nice-to-Have (Do Later)

### 7. Add HSTS Security Header
**File**: [server.js](file:///c:/Users/The%20Kitchen%20Maker/Desktop/AutoFlow-Pro/autoflow-backend/server.js#L102-L108)

**Current**:
```javascript
app.use(helmet({ 
  contentSecurityPolicy: false, 
  crossOriginEmbedderPolicy: false 
}));
```

**Update to**:
```javascript
app.use(helmet({ 
  contentSecurityPolicy: false, 
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true }  // ← Add this
}));
```

---

### 8. Optimize Compression Settings
**File**: [server.js](file:///c:/Users/The%20Kitchen%20Maker/Desktop/AutoFlow-Pro/autoflow-backend/server.js#L116)

**Current**:
```javascript
app.use(compression());
```

**Update to**:
```javascript
app.use(compression({ 
  level: 6,        // Balance CPU vs compression (1-9, default 6)
  threshold: 1024  // Only compress >1KB responses
}));
```

---

## Testing Checklist

After making changes, test locally:

```bash
# 1. Validate environment
npm run validate:env

# 2. Start the server
npm run dev

# 3. Quick health check (in another terminal)
curl http://localhost:5000/health
# Expected: {"status":"ok", "services":{"database":"connected","redis":"connected"}}

# 4. Test authentication
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "testpass123"
  }'
# Expected: {"success":true, "user": {...}, "token": "..."}

# 5. Test authenticated endpoint
JWT_TOKEN="<from-login-response>"
curl http://localhost:5000/api/v1/analytics/overview \
  -H "Authorization: Bearer $JWT_TOKEN"
# Expected: 200 OK with analytics data
```

---

## Deployment Steps (After Fixes)

```bash
# 1. Commit changes locally
git add -A
git commit -m "Fix critical security issues + improve config"

# 2. Push to GitHub
git push

# 3. Railway auto-deploys! Watch here:
# https://railway.app → Your Project → Deployments → (new one appearing)

# 4. Monitor deployment logs
# Railway Dashboard → Logs → Filter for "🚀" or "error"

# 5. Test production health check
curl https://your-railway-app-domain.railway.app/health

# 6. If health check passes → You're live! 🎉
```

---

## Emergency Rollback

If something breaks on Railway:

```bash
# 1. Check logs
railway logs

# 2. Rollback to previous version
railway logs --tail
# Find the deployment before the failing one
# Click the deployment number to view details
# Click "Redeploy" on the previous successful deployment

# OR manually
# Push a fix: git revert <commit> && git push
```

---

## Support Resources

| Resource | Link | Purpose |
|----------|------|---------|
| MongoDB Atlas | https://mongodb.com/atlas | Database dashboard |
| Upstash | https://upstash.com | Redis console |
| Railway | https://railway.app | Deployment platform |
| Node.js Docs | https://nodejs.org/docs | JavaScript runtime |
| Express.js | https://expressjs.com | Web framework |

---

## Timeline

| Time | Task |
|------|------|
| **Now** | Fix REDIS_URL prefix + rotate credentials |
| **Today** | Generate JWT secrets + test locally |
| **This Week** | Increase connection timeouts |
| **Before Launch** | Create .env.example + test on Railway |
| **After Launch** | Monitor logs + enable HSTS |

---

**Questions?** Check [AUDIT_REPORT.md](file:///c:/Users/The%20Kitchen%20Maker/Desktop/AutoFlow-Pro/autoflow-backend/AUDIT_REPORT.md) for detailed findings.

**Status**: 🟠 Ready with fixes (~30 min work)
