/* AI 构图助手 · Service Worker v8.3.3 —— 离线缓存，让应用像原生 App 一样秒开 */
const CACHE = 'ai-compose-v833';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];
// v4.2.1: 模型文件后台预缓存（不阻塞install，失败自动忽略）——首次打开即开始后台下载，
// 下载完成后离线/弱网加载秒开；配合 fetch 的 cache-first 静态资源分支双保险
// v8.3.3: 预缓存改为 activate 后延迟 30s 启动（不抢首屏页面下载带宽，页面 fetch 已缓存的不重复下载），
// 并在 fetch 事件中唤醒续跑（防止 SW 空闲被浏览器终止而杀掉定时器）
const MODEL_FILES = [
  './model/model.json',
  './model/group1-shard1of5',
  './model/group1-shard2of5',
  './model/group1-shard3of5',
  './model/group1-shard4of5',
  './model/group1-shard5of5',
  // v8.3.0: YOLO11n + onnxruntime-web（WebGPU/WASM）
  './model/yolo/yolo11n.onnx',
  './model/ort/ort.min.js',
  './model/ort/ort-wasm-simd-threaded.jsep.wasm',
  './model/ort/ort-wasm-simd-threaded.jsep.mjs',
  // v8.3.2: MediaPipe 同源完整运行时（JS + wasm + tflite + data），根治国内移动网络 CDN 挂起导致人脸/姿态加载失败
  './model/mediapipe/face_detection/face_detection.js',
  './model/mediapipe/face_detection/face_detection_solution_simd_wasm_bin.js',
  './model/mediapipe/face_detection/face_detection_solution_simd_wasm_bin.wasm',
  './model/mediapipe/face_detection/face_detection_solution_wasm_bin.js',
  './model/mediapipe/face_detection/face_detection_solution_wasm_bin.wasm',
  './model/mediapipe/face_detection/face_detection_short_range.tflite',
  './model/mediapipe/face_detection/face_detection_full_range.tflite',
  './model/mediapipe/face_detection/face_detection_full_range_sparse.tflite',
  './model/mediapipe/face_detection/face_detection_short.binarypb',
  './model/mediapipe/face_detection/face_detection_full.binarypb',
  './model/mediapipe/pose/pose.js',
  './model/mediapipe/pose/pose_solution_packed_assets_loader.js',
  './model/mediapipe/pose/pose_solution_packed_assets.data',
  './model/mediapipe/pose/pose_solution_simd_wasm_bin.js',
  './model/mediapipe/pose/pose_solution_simd_wasm_bin.wasm',
  './model/mediapipe/pose/pose_solution_wasm_bin.js',
  './model/mediapipe/pose/pose_solution_wasm_bin.wasm',
  './model/mediapipe/pose/pose_landmark_full.tflite',
  './model/mediapipe/pose/pose_landmark_lite.tflite',
  './model/mediapipe/pose/pose_web.binarypb',
  './model/mediapipe/selfie_segmentation/selfie_segmentation.js',
  './model/mediapipe/selfie_segmentation/selfie_segmentation_solution_simd_wasm_bin.js',
  './model/mediapipe/selfie_segmentation/selfie_segmentation_solution_simd_wasm_bin.wasm',
  './model/mediapipe/selfie_segmentation/selfie_segmentation_solution_wasm_bin.js',
  './model/mediapipe/selfie_segmentation/selfie_segmentation_solution_wasm_bin.wasm',
  './model/mediapipe/selfie_segmentation/selfie_segmentation.tflite',
  './model/mediapipe/selfie_segmentation/selfie_segmentation_landscape.tflite',
  './model/mediapipe/selfie_segmentation/selfie_segmentation.binarypb'
];

let _swWake = null;
function _scheduleModelPrecache() {
  // v8.3.3: 幂等——已启动则不重复；未下载项才入队，页面 fetch 已缓存的直接跳过
  if (_swWake) return;
  _swWake = setTimeout(function () {
    _swWake = null;
    caches.open(CACHE).then(function (c) {
      return Promise.allSettled(MODEL_FILES.map(function (f) {
        return c.match(f).then(function (hit) {
          if (hit) return true;  // 已缓存（含页面 fetch 缓存）→ 跳过，不重复下载
          return fetch(f, { cache: 'force-cache' }).then(function (r) {
            if (r && r.ok) return c.put(f, r.clone());
          }).catch(function () {});
        }).catch(function () { return undefined; });
      }));
    }).catch(function () {});
  }, 30000); // 延迟 30s：首屏页面/模型加载优先独占带宽
}

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
  // v8.2.2: 通知所有受控页面"新版本已就绪"，页面据此弹出刷新提示条（根治旧缓存看不到新功能）
  self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(clients){
    clients.forEach(function(c){ c.postMessage({type:'AIC_SW_UPDATE', ver:'v8.3.3'}); });
  }).catch(function(){});
  // v8.3.3: 模型预缓存延迟 30s 启动（不阻塞 activate）
  _scheduleModelPrecache();
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;
  // v8.3.3: 任意请求都顺带唤醒延迟预缓存（SW 空闲超时会被终止，定时器可能被杀）
  _scheduleModelPrecache();
  // v7.8 #30: 跨域 CDN（tfjs / coco-ssd 模型权重 / mediapipe 库）运行时缓存——
  // 首次在线访问后写入 Cache，二次启动弱网/离线也能加载模型；SCF 云端 API 不在此列，不缓存
  if (url.indexOf(self.location.origin) !== 0) {
    if (/(cdn\.jsdelivr\.net|unpkg\.com)/.test(url)) {
      e.respondWith(
        caches.open(CACHE).then((c) => c.match(e.request).then((hit) => {
          const network = fetch(e.request, { mode: 'cors' }).then((res) => {
            if (res && (res.ok || res.type === 'opaque')) c.put(e.request, res.clone()).catch(() => {});
            return res;
          }).catch(() => hit);
          return hit || network;  // 缓存优先、后台更新（stale-while-revalidate）
        }))
      );
    }
    return;
  }
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
