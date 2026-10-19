const CACHE_PREFIX = 'whose-day-shell-';
const CACHE_NAME = CACHE_PREFIX + '__BUILD_VERSION__';
const SHELL_URLS = /* __SHELL_URLS__ */ [];
const SHELL_PATHS = new Set(SHELL_URLS);
const DOCUMENT_PATHS = new Map([
  ['/', '/index.html'], ['/index.html', '/index.html'],
  ['/privacy', '/privacy.html'], ['/privacy.html', '/privacy.html'],
  ['/terms', '/terms.html'], ['/terms.html', '/terms.html']
]);

self.addEventListener('install', event => {
  // Keep the previous complete shell if any required file fails to download.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.addAll(SHELL_URLS.map(url => new Request(url, { cache: 'reload' })));
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization')) return;
  const document = request.mode === 'navigate' && DOCUMENT_PATHS.has(url.pathname);
  if (!document && !SHELL_PATHS.has(url.pathname)) return;
  const path = DOCUMENT_PATHS.get(url.pathname) || url.pathname;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) return response;
      if (response.status < 500) return response;
    } catch {
      // Auth callbacks keep their URL in the browser; only the static HTML is reused.
    }
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(path);
    // Cloudflare canonicalizes HTML paths. A redirected cached response cannot
    // satisfy a navigation whose redirect mode is manual; reuse its static body.
    if (cached?.redirected) return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers: cached.headers });
    return cached || Response.error();
  })());
});
