/* Zema Planner service worker.
   - The page itself: network first (so updates show straight away), cached copy if the network is slow or offline.
   - Fonts, the Supabase library and the app's own icons: cached, refreshed in the background.
   - Planner data (Supabase) is never cached here: it is always live. */
const CACHE = 'zema-shell-v1';
const SHELL = './';

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(c => c.add(SHELL)).catch(() => {}));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function pageFromNetwork(request) {
  return fetch(request).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(SHELL, copy));
    }
    return res;
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    if (url.origin !== self.location.origin) return;
    event.respondWith((async () => {
      const cached = await caches.match(SHELL);
      const network = pageFromNetwork(request);
      if (!cached) return network;
      const slow = new Promise(resolve => setTimeout(() => resolve(null), 4000));
      try {
        const first = await Promise.race([network, slow]);
        return first && first.ok ? first : cached;
      } catch (_) {
        return cached;
      }
    })());
    return;
  }

  if (url.hostname.endsWith('supabase.co')) return;

  const isStatic = url.origin === self.location.origin ||
    /(^|\.)cdn\.jsdelivr\.net$|(^|\.)fonts\.googleapis\.com$|(^|\.)fonts\.gstatic\.com$/.test(url.hostname);
  if (!isStatic) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
      }
      return res;
    });
    if (cached) { network.catch(() => {}); return cached; }
    return network;
  })());
});
