const CACHE = 'sony-a7rv-v4';
const NET_TIMEOUT = 3000;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // cache:'reload' umgeht den HTTP-Cache, sonst liefert GitHub Pages (max-age 600) alte Dateien
      .then(c => Promise.all(ASSETS.map(url =>
        fetch(new Request(url, { cache: 'reload' }))
          .then(res => { if (res && res.ok) return c.put(url, res); })
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isPage(req) {
  return req.mode === 'navigate' || new URL(req.url).pathname.endsWith('/index.html');
}

// Network-first mit Timeout: neue Version wenn erreichbar, sonst sofort aus dem Cache
function networkFirst(req) {
  return caches.open(CACHE).then(cache =>
    new Promise(resolve => {
      let settled = false;
      const fallback = () => {
        if (settled) return;
        settled = true;
        cache.match(req)
          .then(hit => hit || cache.match('./index.html'))
          .then(hit => resolve(hit || Response.error()));
      };
      const timer = setTimeout(fallback, NET_TIMEOUT);

      fetch(new Request(req.url, { cache: 'reload' })).then(res => {
        clearTimeout(timer);
        if (res && res.ok) {
          cache.put('./index.html', res.clone());
          cache.put('./', res.clone());
          if (!settled) { settled = true; resolve(res); }
        } else {
          fallback();
        }
      }).catch(() => { clearTimeout(timer); fallback(); });
    })
  );
}

function cacheFirst(req) {
  return caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res && res.ok && new URL(req.url).origin === self.location.origin) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match('./index.html')));
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(isPage(e.request) ? networkFirst(e.request) : cacheFirst(e.request));
});
