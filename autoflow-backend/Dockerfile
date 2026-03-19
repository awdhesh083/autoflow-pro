# ═══════════════════════════════════════════════════════════
# AutoFlow Pro Backend v4.0
# Node 18 + Chromium + ffmpeg + yt-dlp + Python3
# ═══════════════════════════════════════════════════════════
FROM node:18-slim

# ── System dependencies ───────────────────────────────────
RUN apt-get update && apt-get install -y \
    # Puppeteer / WhatsApp
    chromium \
    chromium-sandbox \
    fonts-liberation \
    libayatana-appindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    # ffmpeg for video processing
    ffmpeg \
    # yt-dlp dependencies
    python3 \
    python3-pip \
    wget \
    curl \
    # ImageMagick for thumbnails
    imagemagick \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# ── Install yt-dlp ────────────────────────────────────────
RUN pip3 install --no-cache-dir yt-dlp --break-system-packages 2>/dev/null || \
    pip3 install --no-cache-dir yt-dlp

# ── Puppeteer: use system Chromium ────────────────────────
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# ── Working directory ─────────────────────────────────────
WORKDIR /app

# ── Node dependencies (cached layer) ─────────────────────
COPY package*.json ./
RUN npm ci --only=production

# ── Source files ──────────────────────────────────────────
COPY . .

# ── Required runtime directories ─────────────────────────
RUN mkdir -p \
    sessions/whatsapp \
    uploads/media \
    uploads/downloads \
    uploads/processed \
    uploads/temp \
    uploads/ig \
    uploads/tiktok \
    uploads/youtube \
    uploads/linkedin \
    uploads/telegram \
    logs

# ── Non-root user for security ────────────────────────────
RUN useradd -m -u 1001 appuser \
    && chown -R appuser:appuser /app
USER appuser

# ── Port ──────────────────────────────────────────────────
EXPOSE 5000

# ── Health check ──────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# ── Start ─────────────────────────────────────────────────
CMD ["node", "server.js"]
