const V = 'voyager-v2';
const CORE = ['./', 'index.html', 'style.css', 'app.js', 'assets/voyager.glb', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// network-first for code (so updates land), cache fallback offline; cache-first for audio/model
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const heavy = /\.(mp3|m4a|glb)$/.test(u.pathname);
  if (heavy) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { if (res.ok && res.status === 200) { const cl = res.clone(); caches.open(V).then((c) => c.put(e.request, cl)); } return res; })));
  } else {
    e.respondWith(fetch(e.request).then((res) => { const cl = res.clone(); caches.open(V).then((c) => c.put(e.request, cl)); return res; }).catch(() => caches.match(e.request)));
  }
});
