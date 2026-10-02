// Score Hunter – Service Worker (Cloudflare-Version): macht die Seite als App installierbar und offline nutzbar.
// Die Seite selbst ist verschlüsselt; zwischengespeichert wird nur die verschlüsselte Fassung.
// Strategie: Netzwerk zuerst (immer der neueste Stand), bei Offline die letzte gespeicherte Fassung.
const CACHE = 'scorehunter-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon192.png', './icon512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.origin === location.origin) {
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
  } else if (u.hostname === 'store-images.s-microsoft.com') {
    // Cover-Bilder: aus dem Cache, sonst holen und merken (begrenzt durch den Browser)
    e.respondWith(caches.open(CACHE + '-img').then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r;
    }))));
  }
});
