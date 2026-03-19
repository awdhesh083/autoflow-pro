/**
 * AutoFlow Pro — Service Worker
 * Strategy: Cache-first for assets, network-first for API calls.
 * Enables offline shell + push notification receipt.
 */
const CACHE_VERSION  = 'autoflow-v1';
const STATIC_CACHE   = `${CACHE_VERSION}-static`;
const API_CACHE      = `${CACHE_VERSION}-api`;

const PRECACHE_URLS  = ['/', '/index.html', '/manifest.json', '/icon-192.png'];
const API_PREFIX     = '/api/v1/';

// ── Install: precache static shell ────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache strategy ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls: network-first, short cache (30s for analytics/dashboard)
  if (url.pathname.startsWith(API_PREFIX)) {
    const isSafe = event.request.method === 'GET' &&
      (url.pathname.includes('/analytics/') || url.pathname.includes('/contacts'));

    if (isSafe) {
      event.respondWith(
        fetch(event.request)
          .then(resp => {
            const clone = resp.clone();
            caches.open(API_CACHE).then(cache => cache.put(event.request, clone));
            return resp;
          })
          .catch(() => caches.match(event.request))
      );
    }
    return; // Non-safe API: pass through, no caching
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        if (resp.status === 200 && event.request.method === 'GET') {
          caches.open(STATIC_CACHE).then(cache => cache.put(event.request, resp.clone()));
        }
        return resp;
      }).catch(() => caches.match('/index.html')); // fallback to app shell
    })
  );
});

// ── Push notification receipt ─────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'AutoFlow', body: event.data.text() }; }

  const options = {
    body:    payload.body  || '',
    icon:    payload.icon  || '/icon-192.png',
    badge:   payload.badge || '/icon-72.png',
    tag:     payload.tag   || 'autoflow',
    data:    payload.data  || {},
    vibrate: [100, 50, 100],
    actions: [{ action: 'open', title: 'Open AutoFlow' }],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'AutoFlow', options)
  );
});

// ── Notification click: open app ──────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      const match = wins.find(w => w.url.includes(self.location.origin));
      if (match) { match.focus(); match.navigate(url); }
      else clients.openWindow(url);
    })
  );
});

// ── Background sync (optional — retry failed API calls) ──────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(
      // IndexedDB queue of failed API calls would be processed here
      Promise.resolve()
    );
  }
});
