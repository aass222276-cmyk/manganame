// very small cache-busting SW
const SW_VERSION = 'v5';  // ★更新のたびに上げる
const CACHE = `manganame-${SW_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest'
];

self.addEventListener('install', e=>{
  e.waitUntil( caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()) );
});
self.addEventListener('activate', e=>{
  e.waitUntil( caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))) );
  self.clients.claim();
});
self.addEventListener('fetch', e=>{
  const req = e.request;
  e.respondWith(
    caches.match(req).then(res=> res || fetch(req).then(r=>{
      // cache html/js
      const copy = r.clone();
      if(req.url.match(/\/(index\.html|app\.js|manifest\.webmanifest)$/)) {
        caches.open(CACHE).then(c=>c.put(req, copy));
      }
      return r;
    }))
  );
});
