// Lirafuchs – Service Worker: macht die Seite als App installierbar, offline nutzbar und schnell.
// Online liegen nur die kleine Sperrseite (index.html) und der verschlüsselte Block (data.bin); entschlüsselt wird erst im Browser.
// D12: Sperrseite und data.bin kommen SOFORT aus dem Cache (stale-while-revalidate); eine neue Fassung wird im Hintergrund geholt
// und beim nächsten Öffnen benutzt. Ist sie da, bekommt die offene App die Nachricht {type:'lf-data'} (99z_d11_auto lädt dann neu,
// sobald niemand tippt – nie im Kaufmodus). Cover-Bilder liegen in einem eigenen Cache, der Updates überlebt (höchstens IMG_MAX Bilder).
const CACHE = 'lirafuchs-v2';
const IMG = 'lirafuchs-v1-img';          // Name bleibt fest, damit die Cover bei jedem Update erhalten bleiben
const IMG_MAX = 2000;
const CORE = ['./', './index.html', './data.bin', './manifest.webmanifest', './icon180.png', './icon192.png', './icon512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== IMG).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const sig = r => r ? (r.headers.get('etag') || '') + '|' + (r.headers.get('last-modified') || '') + '|' + (r.headers.get('content-length') || '') : '';
async function notify() {
  const cs = await self.clients.matchAll({ type: 'window' });
  cs.forEach(c => c.postMessage({ type: 'lf-data', at: Date.now() }));
}
// Aus dem Cache sofort antworten, im Hintergrund die neue Fassung holen und merken.
async function swr(event, key, isData) {
  const c = await caches.open(CACHE);
  const hit = await c.match(key, { ignoreSearch: true });
  const net = fetch(key, { cache: 'no-cache' }).then(async r => {
    if (r && r.ok) {
      const changed = !hit || sig(hit) !== sig(r);
      await c.put(key, r.clone());
      if (isData && hit && changed) notify();
    }
    return r;
  });
  if (hit) { try { event.waitUntil(net.catch(() => {})); } catch (x) { net.catch(() => {}); } return hit; }
  return net.catch(() => c.match('./index.html'));
}

let puts = 0;
async function trimImg(c) {
  const ks = await c.keys();
  if (ks.length > IMG_MAX) await Promise.all(ks.slice(0, ks.length - IMG_MAX).map(k => c.delete(k)));   // älteste zuerst raus
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    const scope = new URL(self.registration.scope);
    const rel = u.pathname.slice(scope.pathname.length);
    if (req.mode === 'navigate' || rel === '' || rel === 'index.html') { e.respondWith(swr(e, './index.html', false)); return; }
    if (rel === 'data.bin') { e.respondWith(swr(e, './data.bin', true)); return; }
    // Rest (Manifest, Icons): Netz zuerst, offline aus dem Cache
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r; })
      .catch(() => caches.match(req, { ignoreSearch: true })));
  } else if (u.hostname === 'store-images.s-microsoft.com') {
    // Cover-Bilder: aus dem Cache, sonst holen und merken; Obergrenze IMG_MAX (älteste zuerst raus)
    e.respondWith(caches.open(IMG).then(c => c.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); if (++puts % 50 === 0) trimImg(c).catch(() => {}); }
      return r;
    }))));
  }
});
