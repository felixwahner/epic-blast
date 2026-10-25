// Template: the version and asset-list placeholders are filled in by build/pwa-plugin.ts.
// Plain JavaScript on purpose - it is copied verbatim into dist/sw.js.
const PREFIX = `epic-blast-${self.registration.scope}-`;
const CACHE = PREFIX + '__VERSION__';
// Precached on install.
const ASSETS = __ASSETS__;
// World art, cached the first time it is requested.
const LAZY_ASSETS = __LAZY_ASSETS__;
const assetURLs = new Set([...ASSETS, ...LAZY_ASSETS].map(path => new URL(path, self.registration.scope).href));
const shell = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(
    ASSETS.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' }))
  )).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Reloads request the current shell; cached builds are used only when offline.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(new Request(event.request, { cache: 'no-store' }));
        if (response.ok) return response;
      } catch { /* Use the installed shell when offline. */ }
      const cached = await (await caches.open(CACHE)).match(shell);
      return cached || Response.error();
    })());
  } else if (assetURLs.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) void cache.put(event.request, response.clone());
      return response;
    })());
  }
});

