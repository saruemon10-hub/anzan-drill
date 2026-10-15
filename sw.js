// オフライン用キャッシュ。ファイルを更新したら CACHE の版と js/app.js の VERSION をそろえて上げる。
// 版を上げると sw.js が変わるので、開いているアプリにも「新しい版がある」と伝わる。
const CACHE = 'anzan-v4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './js/app.js',
  './js/problems.js',
  './js/sound.js',
  './js/voice.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (e) => {
  // ブラウザの HTTP キャッシュを通さず、サーバーから最新を取ってくる
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// ネット優先：つながるときは最新のファイルを使って保存し直す。つながらないとき（オフライン）は保存済みを使う。
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([
        fetch(new Request(req.url, { cache: 'no-cache' })),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
      ]);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      return hit || Response.error();
    }
  })());
});
