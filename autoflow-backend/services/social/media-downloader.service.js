/**
 * ══════════════════════════════════════════════════════════
 * UNIVERSAL MEDIA DOWNLOADER — Feature 7
 * Supports 1000+ sites via yt-dlp + custom scrapers
 * Platforms:
 *  - YouTube (video, audio, playlist, channel)
 *  - TikTok (no watermark)
 *  - Instagram (posts, reels, stories, highlights)
 *  - Facebook (videos, reels, stories)
 *  - Twitter/X (videos, GIFs)
 *  - LinkedIn (videos)
 *  - Pinterest (images, videos)
 *  - Telegram (media)
 *  - Reddit (videos, images)
 *  - Twitch (clips, VODs)
 *  - SoundCloud (audio)
 *  - Spotify (metadata + audio via alternatives)
 *  - Any URL (yt-dlp supports 1000+ sites)
 * Features:
 *  - Batch downloader
 *  - Quality selector
 *  - Audio extraction (MP3)
 *  - Metadata extraction
 *  - Thumbnail extraction
 *  - Subtitle/caption downloader
 *  - Playlist downloader
 *  - Progress tracking
 *  - Auto-organize by platform
 * ══════════════════════════════════════════════════════════
 */

const { execSync, spawn } = require('child_process');
const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const logger = require('../../utils/logger');
const { delay, randomDelay } = require('../../utils/helpers');

const DOWNLOAD_BASE = process.env.DOWNLOAD_DIR || './uploads/downloads';
const PLATFORM_DIRS = {
  youtube:    'youtube',
  tiktok:     'tiktok',
  instagram:  'instagram',
  facebook:   'facebook',
  twitter:    'twitter',
  linkedin:   'linkedin',
  pinterest:  'pinterest',
  reddit:     'reddit',
  twitch:     'twitch',
  soundcloud: 'soundcloud',
  generic:    'misc',
};

// Ensure dirs exist
Object.values(PLATFORM_DIRS).forEach(dir => {
  const full = path.join(DOWNLOAD_BASE, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

class MediaDownloaderService {

  // ══════════════════════════════════════════════════════════
  // DETECT PLATFORM
  // ══════════════════════════════════════════════════════════
  detectPlatform(url) {
    const patterns = {
      youtube:    /youtube\.com|youtu\.be/i,
      tiktok:     /tiktok\.com|vm\.tiktok/i,
      instagram:  /instagram\.com/i,
      facebook:   /facebook\.com|fb\.watch/i,
      twitter:    /twitter\.com|x\.com|t\.co/i,
      linkedin:   /linkedin\.com/i,
      pinterest:  /pinterest\.com|pin\.it/i,
      reddit:     /reddit\.com|redd\.it/i,
      twitch:     /twitch\.tv/i,
      soundcloud: /soundcloud\.com/i,
      spotify:    /spotify\.com/i,
      vimeo:      /vimeo\.com/i,
      dailymotion:/dailymotion\.com/i,
    };
    for (const [platform, re] of Object.entries(patterns)) {
      if (re.test(url)) return platform;
    }
    return 'generic';
  }

  // ══════════════════════════════════════════════════════════
  // CHECK YT-DLP INSTALLED
  // ══════════════════════════════════════════════════════════
  checkYtDlp() {
    try {
      const ver = execSync('yt-dlp --version', { timeout: 5000 }).toString().trim();
      return { installed: true, version: ver };
    } catch {
      return { installed: false, installCmd: 'pip install yt-dlp  OR  brew install yt-dlp' };
    }
  }

  // ══════════════════════════════════════════════════════════
  // CORE DOWNLOADER (yt-dlp)
  // ══════════════════════════════════════════════════════════
  async download(url, options = {}) {
    const {
      quality    = 'best',        // best / 1080p / 720p / 480p / 360p / audio
      audioOnly  = false,
      audioFormat= 'mp3',         // mp3 / m4a / wav / flac
      platform   = null,
      subtitles  = false,
      thumbnail  = false,
      outputDir  = null,
      filename   = null,
      cookies    = null,          // path to cookies.txt
      proxy      = null,
      embedSubs  = false,
      maxFilesize= null,          // e.g. '100m'
      onProgress = null,          // callback(percent, speed, eta)
    } = options;

    const detectedPlatform = platform || this.detectPlatform(url);
    const dir = outputDir || path.join(DOWNLOAD_BASE, PLATFORM_DIRS[detectedPlatform] || 'misc');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Build output template
    const outputTemplate = filename
      ? path.join(dir, filename)
      : path.join(dir, '%(uploader)s_%(title)s_%(id)s.%(ext)s');

    // Build yt-dlp args
    const args = [url, '-o', outputTemplate, '--no-playlist'];

    // Quality / format
    if (audioOnly) {
      args.push('-x', '--audio-format', audioFormat, '--audio-quality', '0');
    } else {
      const formatMap = {
        'best':  'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '1080p': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]',
        '720p':  'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]',
        '480p':  'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]',
        '360p':  'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360]',
        'audio': null,
      };
      const fmt = formatMap[quality] || formatMap.best;
      if (fmt) args.push('-f', fmt);
    }

    // Extra options
    if (subtitles)    args.push('--write-subs', '--sub-langs', 'en', '--convert-subs', 'srt');
    if (embedSubs)    args.push('--embed-subs');
    if (thumbnail)    args.push('--write-thumbnail', '--convert-thumbnails', 'jpg');
    if (cookies)      args.push('--cookies', cookies);
    if (proxy)        args.push('--proxy', proxy);
    if (maxFilesize)  args.push('--max-filesize', maxFilesize);

    // Platform-specific cookies/fixes
    if (detectedPlatform === 'tiktok') {
      args.push('--extractor-args', 'tiktok:app_name=tiktok_web');
    }
    if (detectedPlatform === 'twitter') {
      args.push('--extractor-args', 'twitter:player_url=https://twitter.com');
    }

    // Add metadata
    args.push('--add-metadata', '--embed-thumbnail');
    args.push('--merge-output-format', 'mp4');

    logger.info(`Downloading: ${url} [${detectedPlatform}]`);
    logger.info(`yt-dlp args: ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const proc    = spawn('yt-dlp', args);
      let   stdout  = '';
      let   stderr  = '';
      let   filepath= null;

      proc.stdout.on('data', (data) => {
        const line = data.toString();
        stdout    += line;

        // Parse progress
        const progressMatch = line.match(/(\d+\.\d+)%.*?(\d+\.\d+[KMG]iB\/s).*?ETA (\S+)/);
        if (progressMatch && onProgress) {
          onProgress({
            percent: parseFloat(progressMatch[1]),
            speed:   progressMatch[2],
            eta:     progressMatch[3],
          });
        }

        // Track final filename
        const destMatch = line.match(/\[download\] Destination: (.+)/);
        if (destMatch) filepath = destMatch[1].trim();

        const mergeMatch = line.match(/\[Merger\] Merging formats into "(.+)"/);
        if (mergeMatch) filepath = mergeMatch[1].trim();
      });

      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          // Find downloaded file if path not captured
          if (!filepath || !fs.existsSync(filepath)) {
            const files = fs.readdirSync(dir).filter(f => !f.endsWith('.part'));
            const latest = files.map(f => ({
              name: f,
              time: fs.statSync(path.join(dir, f)).mtimeMs,
            })).sort((a, b) => b.time - a.time)[0];
            if (latest) filepath = path.join(dir, latest.name);
          }

          const fileSize = filepath && fs.existsSync(filepath)
            ? fs.statSync(filepath).size : 0;

          resolve({
            success:    true,
            filepath,
            filename:   filepath ? path.basename(filepath) : null,
            platform:   detectedPlatform,
            url,
            fileSize,
            fileSizeHuman: this._humanSize(fileSize),
          });
        } else {
          reject(new Error(`yt-dlp failed (code ${code}): ${stderr.slice(-500)}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`yt-dlp not found: ${err.message}. Install: pip install yt-dlp`));
      });
    });
  }

  // ══════════════════════════════════════════════════════════
  // GET METADATA (no download)
  // ══════════════════════════════════════════════════════════
  async getMetadata(url, options = {}) {
    const { cookies, proxy } = options;
    const args = [url, '--dump-json', '--no-playlist', '--no-download'];
    if (cookies) args.push('--cookies', cookies);
    if (proxy)   args.push('--proxy', proxy);

    try {
      const output = execSync(`yt-dlp ${args.join(' ')}`, { timeout: 30000 }).toString();
      const meta   = JSON.parse(output);

      return {
        success:     true,
        id:          meta.id,
        title:       meta.title,
        description: meta.description?.slice(0, 500),
        uploader:    meta.uploader,
        uploadDate:  meta.upload_date,
        duration:    meta.duration,
        durationStr: this._formatDuration(meta.duration),
        viewCount:   meta.view_count,
        likeCount:   meta.like_count,
        commentCount:meta.comment_count,
        thumbnail:   meta.thumbnail,
        url:         meta.webpage_url,
        platform:    this.detectPlatform(url),
        formats:     meta.formats?.map(f => ({
          id:         f.format_id,
          ext:        f.ext,
          quality:    f.quality,
          resolution: f.resolution,
          filesize:   f.filesize,
          fps:        f.fps,
        })).filter(f => f.resolution !== 'audio only').slice(0, 10),
      };
    } catch (err) {
      throw new Error(`Metadata fetch failed: ${err.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // DOWNLOAD PLAYLIST
  // ══════════════════════════════════════════════════════════
  async downloadPlaylist(playlistUrl, options = {}) {
    const {
      maxItems   = 20,
      quality    = '720p',
      audioOnly  = false,
      outputDir  = null,
      startIndex = 1,
      endIndex   = null,
      reverse    = false,
    } = options;

    const platform = this.detectPlatform(playlistUrl);
    const dir      = outputDir || path.join(DOWNLOAD_BASE, PLATFORM_DIRS[platform] || 'misc', 'playlists');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const args  = [playlistUrl, '-o', path.join(dir, '%(playlist_index)s_%(title)s_%(id)s.%(ext)s')];

    if (audioOnly) {
      args.push('-x', '--audio-format', 'mp3');
    } else {
      args.push('-f', 'bestvideo[height<=720][ext=mp4]+bestaudio/best[height<=720]');
    }

    args.push(`--playlist-start`, String(startIndex));
    if (endIndex) args.push('--playlist-end', String(endIndex));
    if (reverse)  args.push('--playlist-reverse');
    args.push('--max-downloads', String(maxItems));
    args.push('--merge-output-format', 'mp4');
    args.push('--add-metadata');

    logger.info(`Downloading playlist: ${playlistUrl}`);

    try {
      execSync(`yt-dlp ${args.join(' ')}`, { timeout: 600000, maxBuffer: 50 * 1024 * 1024 });
      const files = fs.readdirSync(dir).filter(f => !f.endsWith('.part'));
      return {
        success:    true,
        dir,
        files:      files.length,
        filesList:  files.slice(0, 50),
        platform,
      };
    } catch (err) {
      throw new Error(`Playlist download failed: ${err.message.slice(-500)}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // BATCH DOWNLOADER
  // ══════════════════════════════════════════════════════════
  async downloadBatch(urls, options = {}) {
    const { quality = 'best', audioOnly = false, delayBetween = 2000, onEach = null } = options;
    const results = { success: [], failed: [], total: urls.length };

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        logger.info(`Batch download ${i+1}/${urls.length}: ${url}`);
        const result = await this.download(url, { ...options, quality, audioOnly });
        results.success.push(result);
        if (onEach) onEach({ index: i+1, total: urls.length, ...result });
      } catch (err) {
        results.failed.push({ url, error: err.message });
        if (onEach) onEach({ index: i+1, total: urls.length, success: false, url, error: err.message });
      }
      await delay(randomDelay(delayBetween, delayBetween * 2));
    }

    return results;
  }

  // ══════════════════════════════════════════════════════════
  // PLATFORM-SPECIFIC METHODS
  // ══════════════════════════════════════════════════════════

  // Instagram (posts, reels, stories, highlights)
  async downloadInstagram(url, options = {}) {
    const platform = 'instagram';

    // Handle different IG content types
    if (url.includes('/stories/')) {
      // Stories need auth
      return this.download(url, { ...options, platform,
        cookies: options.cookiesPath || './sessions/instagram_cookies.txt',
      });
    }

    // Public posts/reels
    return this.download(url, { ...options, platform });
  }

  // TikTok (no watermark)
  async downloadTikTok(url, options = {}) {
    // Try API method first (no watermark)
    try {
      const videoId = url.match(/\/video\/(\d+)/)?.[1];
      if (videoId) {
        const apiRes = await axios.get(`https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
          },
          timeout: 10000,
        });

        const videoData = apiRes.data?.aweme_list?.[0];
        if (videoData) {
          const downloadUrl = videoData.video?.play_addr?.url_list?.[0];
          if (downloadUrl) {
            const dir      = path.join(DOWNLOAD_BASE, 'tiktok');
            const filename = `tiktok_${videoId}_nowatermark.mp4`;
            const filepath = path.join(dir, filename);

            const res = await axios.get(downloadUrl, {
              responseType: 'arraybuffer',
              headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)' },
              timeout: 60000,
            });
            fs.writeFileSync(filepath, res.data);
            return { success: true, filepath, filename, platform: 'tiktok', noWatermark: true };
          }
        }
      }
    } catch {}

    // Fallback to yt-dlp
    return this.download(url, { ...options, platform: 'tiktok' });
  }

  // Twitter/X video downloader
  async downloadTwitter(url, options = {}) {
    return this.download(url, { ...options, platform: 'twitter' });
  }

  // Reddit media
  async downloadReddit(url, options = {}) {
    return this.download(url, { ...options, platform: 'reddit' });
  }

  // SoundCloud audio
  async downloadSoundCloud(url, options = {}) {
    return this.download(url, { ...options, platform: 'soundcloud', audioOnly: true, audioFormat: 'mp3' });
  }

  // Pinterest images/videos
  async downloadPinterest(url, options = {}) {
    // Pinterest images direct scrape
    try {
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
        timeout: 10000,
      });
      const imgMatch = res.data.match(/"url":"(https:\/\/i\.pinimg\.com\/originals\/[^"]+)"/);
      if (imgMatch) {
        const imgUrl  = imgMatch[1];
        const dir     = path.join(DOWNLOAD_BASE, 'pinterest');
        const ext     = path.extname(imgUrl) || '.jpg';
        const filename= `pinterest_${Date.now()}${ext}`;
        const filepath= path.join(dir, filename);

        const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 30000 });
        fs.writeFileSync(filepath, imgRes.data);
        return { success: true, filepath, filename, platform: 'pinterest', type: 'image' };
      }
    } catch {}

    return this.download(url, { ...options, platform: 'pinterest' });
  }

  // Twitch clip/VOD
  async downloadTwitch(url, options = {}) {
    return this.download(url, { ...options, platform: 'twitch' });
  }

  // Extract audio from any video URL
  async extractAudio(url, format = 'mp3', options = {}) {
    return this.download(url, { ...options, audioOnly: true, audioFormat: format });
  }

  // ══════════════════════════════════════════════════════════
  // DOWNLOAD THUMBNAIL ONLY
  // ══════════════════════════════════════════════════════════
  async downloadThumbnail(url, options = {}) {
    const platform = this.detectPlatform(url);
    const dir      = path.join(DOWNLOAD_BASE, PLATFORM_DIRS[platform] || 'misc', 'thumbnails');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Get metadata to find thumbnail URL
    try {
      const meta    = await this.getMetadata(url, options);
      const imgUrl  = meta.thumbnail;
      if (!imgUrl) throw new Error('No thumbnail found');

      const ext      = '.jpg';
      const filename = `thumb_${meta.id || Date.now()}${ext}`;
      const filepath = path.join(dir, filename);

      const res = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 30000 });
      fs.writeFileSync(filepath, res.data);

      return { success: true, filepath, filename, thumbnailUrl: imgUrl, meta };
    } catch (err) {
      throw new Error(`Thumbnail download failed: ${err.message}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // DOWNLOAD SUBTITLES
  // ══════════════════════════════════════════════════════════
  async downloadSubtitles(url, language = 'en', options = {}) {
    const platform = this.detectPlatform(url);
    const dir      = path.join(DOWNLOAD_BASE, PLATFORM_DIRS[platform] || 'misc', 'subtitles');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const args = [
      url,
      '--write-subs', '--write-auto-subs',
      '--sub-langs', language,
      '--convert-subs', 'srt',
      '--skip-download',
      '-o', path.join(dir, '%(title)s_%(id)s.%(ext)s'),
    ];

    try {
      execSync(`yt-dlp ${args.join(' ')}`, { timeout: 60000 });
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.srt'));
      return { success: true, files, dir };
    } catch (err) {
      throw new Error(`Subtitle download failed: ${err.message.slice(-300)}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // LIST AVAILABLE FORMATS
  // ══════════════════════════════════════════════════════════
  async listFormats(url) {
    try {
      const output = execSync(`yt-dlp --list-formats "${url}"`, { timeout: 30000 }).toString();
      const lines  = output.split('\n').filter(l => l.match(/^\d+\s/));

      return {
        success: true,
        raw:     output,
        formats: lines.map(line => {
          const parts = line.trim().split(/\s+/);
          return {
            id:         parts[0],
            ext:        parts[1],
            resolution: parts[2],
            note:       parts.slice(3).join(' '),
          };
        }),
      };
    } catch (err) {
      throw new Error(`Format listing failed: ${err.message.slice(-300)}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // MANAGE DOWNLOADED FILES
  // ══════════════════════════════════════════════════════════
  listDownloads(platform = null, options = {}) {
    const { limit = 50, sortBy = 'date' } = options;
    const searchDir = platform
      ? path.join(DOWNLOAD_BASE, PLATFORM_DIRS[platform] || 'misc')
      : DOWNLOAD_BASE;

    const files = this._walkDir(searchDir)
      .filter(f => !f.endsWith('.part') && !f.endsWith('.ytdl'))
      .map(filepath => ({
        filename:  path.basename(filepath),
        filepath,
        platform:  this._guessPlatformFromPath(filepath),
        size:      fs.statSync(filepath).size,
        sizeHuman: this._humanSize(fs.statSync(filepath).size),
        ext:       path.extname(filepath).slice(1),
        modifiedAt:fs.statSync(filepath).mtime,
      }))
      .sort((a, b) => {
        if (sortBy === 'size') return b.size - a.size;
        return b.modifiedAt - a.modifiedAt;
      });

    return {
      total: files.length,
      files: files.slice(0, limit),
      totalSize: this._humanSize(files.reduce((sum, f) => sum + f.size, 0)),
    };
  }

  deleteFile(filepath) {
    if (!filepath.startsWith(DOWNLOAD_BASE)) {
      throw new Error('Cannot delete files outside download directory');
    }
    if (fs.existsSync(filepath)) { fs.unlinkSync(filepath); return { deleted: true }; }
    return { deleted: false, error: 'File not found' };
  }

  cleanupOldFiles(olderThanDays = 30) {
    const cutoff  = Date.now() - olderThanDays * 86400000;
    const allFiles= this._walkDir(DOWNLOAD_BASE);
    let   deleted = 0;
    let   freed   = 0;

    for (const filepath of allFiles) {
      try {
        const stat = fs.statSync(filepath);
        if (stat.mtime.getTime() < cutoff) {
          freed += stat.size;
          fs.unlinkSync(filepath);
          deleted++;
        }
      } catch {}
    }

    return { deleted, freedSpace: this._humanSize(freed) };
  }

  // ══════════════════════════════════════════════════════════
  // UPDATE YT-DLP
  // ══════════════════════════════════════════════════════════
  updateYtDlp() {
    try {
      const out = execSync('yt-dlp -U', { timeout: 60000 }).toString();
      return { success: true, output: out };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════
  _humanSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B','KB','MB','GB','TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return `${bytes.toFixed(1)} ${units[i]}`;
  }

  _formatDuration(seconds) {
    if (!seconds) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
  }

  _walkDir(dir) {
    const files = [];
    if (!fs.existsSync(dir)) return files;
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) files.push(...this._walkDir(full));
      else files.push(full);
    }
    return files;
  }

  _guessPlatformFromPath(filepath) {
    for (const [platform, dir] of Object.entries(PLATFORM_DIRS)) {
      if (filepath.includes(`/${dir}/`) || filepath.includes(`\\${dir}\\`)) return platform;
    }
    return 'generic';
  }
}

module.exports = new MediaDownloaderService();
