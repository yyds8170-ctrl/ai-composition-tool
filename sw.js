/* AI 构图助手 · Service Worker v4.2.0 —— 离线缓存，让应用像原生 App 一样秒开 */
const CACHE = 'ai-compose-v420';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
  // v4.2: 模型文件改 runtime cache-first（模型为不可变资源，离线可用；不再预缓存18MB，避免install超时）
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;
  if (url.indexOf(self.location.origin) !== 0) return;
  const p = new URL(e.request.url).pathname;
  const isCore = (p === '/' || p.endsWith('/index.html') || p.endsWith('/manifest.webmanifest'));
  if (isCore) {
    // 核心页面：network-first，每次联网拿最新版本，离线时回退缓存
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone)).catch(() => {});
        }
        return res;
      }).catch(() =>
        caches.match(e.request).then((hit) => hit || caches.match('./index.html'))
      )
    );
  } else {
    // 静态资源（含 model/ 模型文件 v4.2）：cache-first + 后台更新，弱网/离线可用
    e.respondWith(
      caches.match(e.request).then((hit) => {
        if (hit) return hit;
        return fetch(e.request).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone)).catch(() => {});
          }
          return res;
        }).catch(() => (p.indexOf('/model/') === 0 ? undefined : caches.match('./index.html')));
      })
    );
  }
});
