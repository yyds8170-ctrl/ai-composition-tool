# 移动端 PWA 性能与兼容性调研（e-pwa-mobile）

> 说明：本文为**多轮公开资料学习研究，全部自研方案；仅参考公开通用原理、官方文档与公开工程经验，不涉及任何第三方产品的界面、文案或实现。**
> 研究方法：ONNX Runtime / WebKit / web.dev / MDN / W3C 官方文档 + 公开基准与工程博客（2024–2026）系统检索与交叉核对。所有来源见各节行内链接与文末清单。
> 用途：为单文件 PWA「AI 构图助手 Pro」（ONNX Runtime Web wasm + WebGPU 端侧图像检测、sw.js 离线缓存）提供**移动端真机层面**的性能量级、兼容现状与降级策略依据，并把每条结论映射到本应用的具体检查点/纯函数与验收测试写法。
> 现状基线（本仓库实测文件体积，2026-10）：`index.html` ≈ **2.0 MB**（单文件内联 JS+CSS）；`model/` 目录合计 ≈ **18 MB**（TFJS graph 13 MB 五分片 + `yolo11n.onnx` + ort wasm + MediaPipe 三套运行时）；`sw.js` 已实现 cache-first（静态/模型）+ network-first（核心页）+ `skipWaiting()` + `postMessage({type:'AIC_SW_UPDATE'})` + 后台延迟 30s 预缓存。

---

## 一、ONNX Runtime Web 在移动端（Android Chrome / iOS Safari）的推理性能

### 1.1 执行器（EP）梯队与官方定位

ONNX Runtime Web 官方提供四档执行器，按优先级回退：

| EP | 定位 | 移动端可用性 |
|---|---|---|
| `webgpu` | 默认 GPU 执行器 | 中高端安卓 Chrome 可用；**iOS 仅 iOS 26+** |
| `webnn` | 近原生 NPU/GPU | Chromium 121+ 实验旗标，**iOS Safari 默认不可用** |
| `webgl` | 老设备 GPU | 可用，性能介于两者之间 |
| `wasm` | 默认 CPU 执行器 | 全机型兜底 |

来源：ONNX Runtime 官方性能诊断文档明确：wasm 为默认 CPU EP、webgpu 为默认 GPU EP、WebNN「目前不在浏览器默认支持，需手动开启旗标」、webgl 面向不支持 WebGPU 的老设备（https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html ）。

### 1.2 wasm 的关键前提：跨源隔离（COOP/COEP）决定能否多线程

- ORT 官方文档：多线程（multithreading）**默认开启，但只在 `crossOriginIsolated === true` 时生效**，该模式由 `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` 两个响应头开启；否则自动退回单线程。可用 `ort.env.wasm.numThreads` 显式控制（https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html ；numThreads API：https://onnxruntime.ai/docs/api/js/interfaces/Env.WebAssemblyFlags.html ）。
- SharedArrayBuffer：Safari 自 15.2 起完整支持，但同样要求跨源隔离（https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer/SharedArrayBuffer ）。
- **对本 PWA 的直接含义**：站点挂在 GitHub Pages（`yyds8170-ctrl.github.io`），github.io 域不提供自定义 COOP/COEP 响应头 → 线上环境 `crossOriginIsolated` 几乎必为 `false` → `ort-wasm-simd-threaded.jsep.wasm` 的多线程能力**实际不会激活**，ORT 会自动加载无线程版 wasm（SIMD 仍可用）。这是当前被低估的性能损失点。
- SIMD + 多线程的收益量级（公开基准）：
  - Microsoft 官方：MobileNetV2 上「双线程 + SIMD」相对纯 wasm **提速 3.4×**（https://opensource.microsoft.com/blog/2021/09/02/onnx-runtime-web-running-your-machine-learning-model-in-browser/ ）。
  - 学术实测（arXiv 2402.05981）：开 SIMD 延迟降 49.1%、开多线程再降 10.7%、两者全开降 **64.7%**（https://arxiv.org/pdf/2402.05981.pdf ）。
  - 结论：**若多线程未激活，端侧推理大约慢 1.5–2×**；SIMD 在 iOS 13.4+ / 安卓 Chrome 全量可用，不是瓶颈。

### 1.3 单次推理耗时量级（中低端机，可量化区间）

| 场景 | WebGPU | wasm（SIMD，单/多线程） | 来源 |
|---|---|---|---|
| 桌面现代机 | 15–30 ms/次 | 300–500 ms/次 | https://markaicode.com/webgpu-browser-machine-learning/ |
| 移动端（启用 WebGPU） | 30–60 ms/次 | — | 同上 |
| 低端机（wasm 兜底，视觉类首帧） | — | 500–1500 ms（视觉首帧） | https://www.technolynx.com/post/real-time-computer-vision-for-live-streaming |
| 同模型 A/B（约 184×184 输入） | 331 ms | 485 ms（4 线程 wasm） | https://segmentfault.com/a/1190000048323804 |
| iPhone 14 Safari WebGPU（30 MB 模型） | 首跑 210 ms / 后续 62 ms / 内存约 90 MB | — | https://martinuke0.github.io/posts/2026-03-12-the-shift-to-local-first-ai-optimizing-small-language-models-for-browser-based-edge-computing/ |
| WebGPU 相对 wasm 综合提速 | **1.4×–9.4×**（视模型而定） | — | https://dev.to/yue_shu_c621a4a637f22396f/webgpu-vs-wasm-in-onnxruntime-web-14x-to-94x-faster-on-the-same-mac-depending-on-the-model-li5 |

**给本 PWA 的量级判断**（YOLO11n / 分类级模型，输入 320–640px）：
- 中高端安卓 Chrome（WebGPU 可用）：单次推理 **50–150 ms**，体验接近「实时」。
- 中低端安卓 Chrome（WebGPU 可用但 GPU 弱，或 wasm）：**200–600 ms**。
- iOS 18 及更早（无 WebGPU，单线程 SIMD wasm）：**500–1500 ms**/次，需 loading 态且宜异步不阻塞 UI（ORT 官方建议开 `ort.env.wasm.proxy = true` 把推理挪进 worker，保证 UI 响应：https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html ）。

### 1.4 iOS Safari 对 SharedArrayBuffer / SIMD / WebGPU / WebNN 的支持现状（2025–2026）

| 能力 | iOS 支持版本 | 关键事实 |
|---|---|---|
| SIMD | iOS 16.4+（Safari 16.4） | 全量可用 |
| SharedArrayBuffer | Safari 15.2+ | 需 COOP/COEP 跨源隔离，否则构造被禁用（https://developer.apple.com/documentation/safari-release-notes/safari-18-release-notes ；MDN 见上） |
| **WebGPU** | **iOS 26 / iPadOS 26（2025-09 发布）起** | WebKit 官方公告 Safari 26.0 新增 WebGPU（https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ ；2025-11 web.dev 宣布主流浏览器支持 WebGPU，Safari 仅限 macOS Tahoe 26 / iOS 26 / visionOS 26：https://web.dev/blog/webgpu-supported-major-browsers ）；Safari 26.2 追加 WebGPU+WebXR（https://developer.apple.com/documentation/safari-release-notes/safari-26_2-release-notes ） |
| WebNN | **iOS 全系不可用** | 仅 Chromium 121+ 实验旗标；W3C 候选推荐标准 2025-09（https://www.w3.org/TR/2025/CRD-webnn-20250925/ ），落地浏览器名单不含 Safari |

**结论**：截至 2026-10，存量 iPhone 用户（iOS 18/17 占多数）在 Safari 里**没有 WebGPU、没有 WebNN、多线程还受 COOP/COEP 限制**——iOS 端实际上跑的是「单线程 SIMD wasm」，单次推理按 **500–1500 ms** 设计交互，必须有不依赖模型的本地规则兜底。只有 Android Chrome（113+ WebGPU 默认开）和 iOS 26+ 才拿得到 30–150 ms 的 GPU 速度。

---

## 二、单文件大 HTML PWA 的加载性能

### 2.1 体积阈值与 LCP 建议

- **LCP 阈值**：good ≤ **2.5 s**（至少 75% 访问），poor > **4 s**（web.dev Core Web Vitals 定义：https://web.developers.google.cn/articles/defining-core-web-vitals-thresholds ；优化指南：https://web.developers.google.cn/articles/optimize-lcp ）。
- **常见性能预算**（公开工程基准）：JS bundle ≤ **150 KB（gzip 后）**、整页总体积 ≤ **1 MB（gzip 后）**、移动端 4G 下 LCP ≤ 2.5 s（https://www.frontscope.dev/learn/fsd-performance-overview/ ）。
- **本 PWA 的差距**：`index.html` 2.0 MB（未压缩）。即便 gzip 后压到约 500–700 KB，仍**远超「整页 ≤1 MB」预算的 JS 部分**；在弱 4G（实测有效带宽 1–3 Mbps）下，仅首屏 HTML 下载就要 **3–15 s**，直接顶穿 2.5 s LCP 目标。首屏可交互（TTI）还需叠加解析 2 MB HTML 内联脚本的时间。
- **可接受的「单文件」阈值经验值**：工程上内联单文件 < **500 KB（gzip 后）**较稳；**1 MB 以上**在中低端安卓机上解析与主线程阻塞会明显（首屏可感知卡顿）。本应用 2.0 MB 属「重单文件」。

### 2.2 内联 wasm / 模型 vs 独立缓存文件

- **流式编译省 20–30% 启动时间**：web.dev 官方建议优先 `WebAssembly.instantiateStreaming/compileStreaming`，下载与编译并行（https://web.developers.google.cn/articles/webassembly-performance-patterns-for-web-apps ；https://davina-yu.blog.csdn.net/article/details/162846949 ）。**内联 base64 wasm 无法流式编译**，只能全量下载后 decode+compile。
- **base64 内联的体积税**：gzip 后仍多花约 **37%**（实测 378 KB wasm → 内联后 +140 KB，gzip 也补不回来：https://dev.to/pm_cheng_3f36acecfb9c59f5/base64-inlined-wasm-still-costs-37-more-after-gzip-6c3 ）。
- **wasm 本体压缩率**：gzip 可减 **60–75%**，务必预压缩分发（https://emscripten.org/docs/compiling/Deploying-Pages.html ）。
- **对本 PWA 的结论**：当前把 ort wasm、yolo11n.onnx、MediaPipe 全部放 `model/` 独立文件并由 sw.js cache-first，**方向正确**——既享受流式编译，又让 2.0 MB 的 index.html 不必为模型再背 base64 税。**不要**为了「真·单文件」把 wasm/模型内联进 HTML。模型 ≈18 MB 应坚持「首屏 HTML 不请求、后台 30s 延迟预缓存、推理时才拉」的现有策略（sw.js `_scheduleModelPrecache` 已是这个思路）。
- **首屏建议**：index.html 首屏只渲染静态 UI + 本地像素规则（零模型可用），模型加载做成「后台渐进增强」，模型未就绪时界面不可见模型按钮但不白屏。

---

## 三、sw.js 缓存策略在移动端的坑

### 3.1 更新流程（skipWaiting / postMessage）

- 标准模式：新 SW install 后进入 waiting，直到旧 SW 控制的页面全部关闭；用 `skipWaiting()` 立即激活 + `clients.claim()` 接管，再通过 `postMessage` 通知页面刷新（Workbox 官方流程：`messageSkipWaiting()` → 触发 `controlling` → 页面 reload：https://developer.chrome.google.cn/docs/workbox/handling-service-worker-updates ）。
- **本 PWA 已实现**：install 里 `self.skipWaiting()`、activate 里 `self.clients.claim()` + 向所有 client `postMessage({type:'AIC_SW_UPDATE'})`——模式正确。
- **残留坑**：`skipWaiting()` 激活后，**已打开的页面仍跑在旧 SW 上**，必须页面侧收到消息后主动 `location.reload()` 才生效；不 reload 会出现「SW 已是新版、页面还在用旧缓存资源」的混合态。页面侧必须有刷新提示条并在用户确认后 reload。

### 3.2 iOS 特有的「刷新才生效 / 后台不更新」问题

- **主屏幕 PWA 用旧资产**：WebKit 官方 Bug 199110（2025-01 仍在跟踪）：iOS 主屏幕 PWA 在**发布新 SW/新资源后、重启（reboot）再启动**时仍使用旧缓存；Safari 标签页里同流程更新正常（https://bugs.webkit.org/show_bug.cgi?id=199110 ）。→ 缓解：核心页用 network-first（本 sw.js 已做）+ 版本号 cache 名 + 启动时主动比对版本号弹更新条。
- **SW 生命周期短、空闲即杀**：iOS 上 SW 空闲约 **30 s** 后被终止，定时器可能随进程一起被杀（Apple 开发者论坛实测 30–45 s：https://developer.apple.com/forums/thread/758346 ；SW 空闲终止机制说明：https://developer.apple.com/forums/thread/735307 ）。→ 本 sw.js 用「任意 fetch 唤醒 `_scheduleModelPrecache`」对抗 SW 被杀，方向正确。
- **后台冻结**：iOS PWA 切后台后再回前台会冻结/卡死（WebKit Bug 211018：https://bugs.webkit.org/show_bug.cgi?id=211018 ）；多次杀进程重启后离线页偶发白屏（Apple 论坛 702755：https://developer.apple.com/forums/thread/702755 ）。→ 离线兜底页必须极简、不能依赖后台已预加载的大对象。
- iOS 18.4 修复了若干 SW 缓存重定向与忙循环问题（https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes.md ），但上述「主屏幕 PWA 用旧缓存」仍未完全根治。

### 3.3 存储配额与 7 天淘汰（离线启动的隐性前提）

- **Safari/iOS**：脚本可写存储（IndexedDB、SW 注册、Cache API）在用户**连续 7 天未与站点交互后被整体清除**；**已「添加到主屏幕」的 PWA 不受此限**（web.dev 官方：https://web.developers.google.cn/articles/storage-for-the-web ；MDN：https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria ）。
- **总配额**：Safari 约 **1 GB** 可驱逐空间，磁盘压力下按 origin 整体驱逐（WebKit 存储政策：https://webkit.org/blog/14403/updates-to-storage-policy/ ；第三方实测 iOS Safari 缓存约 1 GB：https://www.gerbilsdk.com/docs/mobile ）；Chrome/安卓为磁盘的 **60%**（MDN 同上）。
- **含义**：本应用 18 MB 模型缓存远低于 1 GB 配额，容量无忧；但**用户若只在 Safari 标签页里用、不「添加到主屏幕」，7 天后模型缓存会被清空**，下次启动需重新下载 18 MB。这直接决定第 5 节的降级路径必须存在。

---

## 四、高分辨率照片（12MP+）的 canvas / ImageData 内存与 OOM 规避

### 4.1 内存峰值量级（可量化）

- **ImageData 占用 = 宽 × 高 × 4 字节**（RGBA）：
  - 12 MP（如 4032×3024，主流 iPhone 出片）≈ **48 MB**/张；
  - 24 MP ≈ **96 MB**/张（https://boltquicktools.com/blog/browser-canvas-image-processing.html ）。
- **WebKit canvas 总内存上限**：约 **256 MB（iPad）/ 288 MB（iPhone X）**，超了直接抛 "Total canvas memory use exceeds the maximum limit"，且**刷新页面都救不回来**（WebKit Bug 190280：https://bugs.webkit.org/show_bug.cgi?id=190280 ；Bug 195325：https://bugs.webkit.org/show_bug.cgi?id=195325 ）。
- **单张超大画布直接杀进程**：3024×4032 一张画布即约 **418 MB**，Web 进程被 killed（Bug 172533：https://bugs.webkit.org/show_bug.cgi?id=172533 ）。
- **移动端 tab 驱逐线**：工作集跨 **500 MB–1 GB**（视机型）即被浏览器 evict/杀 tab（https://boltquicktools.com/blog/browser-canvas-image-processing.html ）。
- **多拷贝放大**：一次 resize/滤镜流程 = 解码位图 + 分析 canvas + 显示 canvas + 滤镜 canvas，24 MP 图片两套拷贝即可把工作集推过 **200 MB**（同上）。

### 4.2 对本 PWA 的风险点与规避（落到纯函数）

本应用管线 = 读用户照片 → 解码 → 降采样给 YOLO/分类 → 像素能量/前缀和分析 → 裁切预览 + 30 款滤镜。12 MP 照片在「解码位图(48) + 分析 canvas(48) + 显示 canvas(48) + 滤镜中间 canvas(48)」四拷贝下工作集约 **190–250 MB**，逼近 iPhone 256–288 MB 红线。

规避措施（均为公开通用做法）：
1. **入口降采样**：用 `createImageBitmap(blob, { resizeWidth/Height })` 在解码期直接缩到长边 ≤ **2048 px**（≈ 4 MP，ImageData ≈ 16 MB），分析与检测都用小图；显示/导出再按需放大。Android 原生思路即 `inSampleSize` 降采样（https://developer.android.google.cn/topic/performance/graphics/load-bitmap.html ）。
2. **离屏单 canvas 复用**：全程只保留一个离屏 canvas 做中间计算，用完 `ctx.clearRect` + 尽量 `canvas.width = 0` 释放底图。
3. **及时 `URL.revokeObjectURL`** 和解码后的 bitmap `close()`，避免解码对象滞留。
4. **分块/流式**：超 16 MP 才考虑分块；常规 12 MP 降采样到 2048 长边后无需分块。
5. **不做全分辨率滤镜**：30 款滤镜在 ≤2048 小图上算，导出图另起一次性 canvas，用完即弃。

---

## 五、弱网 / 断网：模型缓存失败的降级路径

### 5.1 失败场景枚举（基于本 sw.js 行为）

- 模型文件 cache-first：未命中缓存且网络失败时，`fetch('/model/...')` 返回 `undefined`（sw.js 对 `/model/` 没有兜底页）→ 推理 session 创建失败。
- 首次访问即断网：CORE（HTML/icon/manifest）在 install 时已缓存，页面能开；但模型 18 MB 一个都没下到 → 模型功能全不可用。
- Safari 7 天淘汰后：缓存被清，用户在弱网下启动 → 18 MB 模型拉取超时。
- 国内移动网络 CDN 挂起：本 sw.js 已把跨域 CDN（jsdelivr/unpkg）资源也做了运行时缓存，二次启动可离线（v7.8 注释），但首次在线必须成功。

### 5.2 降级路径设计（什么时候退回纯本地规则）

本应用已有**零模型即可运行的本地纯函数引擎**（边缘能量 / 行列前缀和 RoD / 三分法 / 人像保护裁切，见 `tests/pure-functions.js` 的 `_deriveCrop` 等）。降级原则：

| 触发条件 | 降级动作 |
|---|---|
| `crossOriginIsolated === false` | 不设多线程，单线程 SIMD wasm，UI 不卡（proxy worker） |
| WebGPU 不可用（iOS<26） | wasm 推理，单次按 500–1500 ms 显示 loading |
| 模型文件全部拉取失败/超时 | **直接退回纯本地规则**（三分法 + 边缘能量 + 裁切档），功能可用、不报错 |
| 部分模型缺失（如 YOLO 缺、MediaPipe 缺） | 关掉对应功能入口（检测/人像），保留通用构图规则 |
| 内存超限（canvas 抛错） | 自动降到长边 1024 px 再试，仍失败则只给裁切建议、不做像素分析 |

**什么时候必须退回纯本地规则**：当「模型就绪耗时 + 推理耗时」在该机型上让单次分析 > **2 s** 且 UI 无反馈时，模型就是负优化；本地规则（毫秒级、零内存峰值）应永远是第一档，模型只是「可用时更强」的第二档增强。

---

## 六、结论落地点：检查点 / 纯函数 / 验收测试写法

> 每条结论对应本 PWA 的一个具体检查点或纯函数，验收测试给出可落地的断言写法（可并入 `tests/unit.test.js` / `tests/pure-functions.js`）。

### 6.1 移动端兼容检查点（运行时探测）

| 检查点 | 探测方式 | 阈值/断言 | 来源依据 |
|---|---|---|---|
| 跨源隔离 | `crossOriginIsolated` | 若 `false`，断言 `ort.env.wasm.numThreads` 被设为 1（不尝试多线程） | ORT 官方多线程依赖 COOP/COEP（§1.2） |
| WebGPU 可用性 | `navigator.gpu` 是否存在 | 不存在 → 回退 wasm，断言走 wasm EP 且有 loading 态 | WebGPU 仅 iOS26+（§1.4） |
| 实际生效 EP | 读 `session.handler.epName` 或 env 日志 | 断言：iOS<26 绝不期望 `webgpu`；中高端安卓断言拿到 `webgpu` 或 `wasm` | ORT 性能文档（§1.1） |
| 模型就绪度 | 启动后探测 `caches.match('/model/yolo/yolo11n.onnx')` | 未命中 → 断言「本地规则引擎可独立出裁切建议」 | §5.2 降级 |
| 内存安全 | 包裹降采样函数与 canvas 初始化 try/catch | 断言解码长边 ≤ 2048；OOM 时自动再降到 1024 | §4.1 |

### 6.2 纯函数（不依赖模型/网络，可单测）

- `deriveCrop(buildResult, mode)`（已有 `_deriveCrop`）：输入 base 裁切量 + tight/standard/loose 模式，输出裁切框。**验收断言**：三档面积严格单调、保留面积 ≥ 0.34（现有 200 万次枚举基线）——这是模型全挂时的最终兜底，必须 100% 可测、零依赖。
- `decodeToMaxEdge(blob, maxEdge=2048)`（新增建议）：用 `createImageBitmap` 按长边降采样。**验收断言**：返回位图长边 ≤ maxEdge、像素内存（w×h×4）≤ 16 MB；12 MP 输入不抛 canvas 内存错误。
- `selectEngine({crossOriginIsolated, hasWebGPU, modelReady})`（新增纯函数）：输入三个布尔，输出应使用的引擎档位（`local-only / wasm-single / wasm-threaded / webgpu`）与预估单次耗时档。**验收断言**：`(false, false, false)` → `local-only`；`(false, true, true)` → `webgpu`；`(false,false,true)` → `wasm-single` 且预估档 ∈ [500,1500] ms。
- `shouldFallbackLocal(engineReadyTimeMs, inferenceMs)`：断言总分析耗时 > 2000 ms 时强制 `local-only`。

### 6.3 加载与缓存验收

- **LCP 预算测试**：断言 `index.html` gzip 后 ≤ **700 KB**（当前 2.0 MB，为现有改进目标）；弱网 3 Mbps 下首屏 HTML 下载 ≤ 2 s。依据 §2.1。
- **sw 更新测试**：模拟「旧页面 + 新 SW」，断言页面收到 `AIC_SW_UPDATE` 后出现刷新提示条，reload 后版本号为新值；主屏幕场景下核心页仍 network-first 拿最新。依据 §3.1/§3.2。
- **离线启动测试**：断网冷启动，断言（a）CORE 页面可开、不白屏；（b）模型按钮按降级规则隐藏或切本地规则。依据 §3.3/§5.2。
- **7 天淘汰模拟**：清缓存后断网启动，断言应用不崩、本地规则仍出裁切建议。依据 §3.3。

---

## 七、汇总表：移动端风险 × 缓解措施

| # | 风险（量化） | 影响机型/环境 | 缓解措施（落到本 PWA） | 优先级 |
|---|---|---|---|---|
| 1 | iOS<26 无 WebGPU，单次推理 500–1500 ms | 存量 iPhone（iOS 17/18） | wasm + proxy worker 异步；本地规则兜底；检测类功能按机型降级 | 高 |
| 2 | 非跨源隔离 → wasm 单线程，推理慢 1.5–2× | GitHub Pages 线上（`crossOriginIsolated=false`） | 运行时探测后 `numThreads=1`；长期评估可设 COOP/COEP 的托管方案 | 高 |
| 3 | index.html 2.0 MB，弱 4G 下载 3–15 s，顶穿 LCP 2.5 s | 中低端安卓 + 弱网 | 拆离非首屏 JS；目标 gzip ≤ 700 KB；首屏零模型 | 高 |
| 4 | 12 MP 照片多拷贝工作集 190–250 MB，逼近 256–288 MB canvas 红线 | 全部 iPhone | 入口降采样到长边 ≤2048（16 MB）；单离屏 canvas 复用；revokeObjectURL | 高 |
| 5 | 主屏幕 PWA 重启后用旧缓存（WebKit Bug 199110） | iOS 已安装用户 | 核心页 network-first + 版本号比对 + 更新提示条 | 中 |
| 6 | Safari 7 天未交互清缓存（含 18 MB 模型） | Safari 标签页用户（未加主屏幕） | 引导「添加到主屏幕」；模型缺失自动退回纯本地规则 | 中 |
| 7 | SW 空闲 30 s 被杀、切后台冻结、离线页偶发白屏 | iOS PWA | fetch 唤醒预缓存；离线兜底页极简，不依赖后台大对象 | 中 |
| 8 | 模型 18 MB 首次弱网下载失败 | 首访断网/弱网 | 后台 30s 延迟预缓存 + allSettled 失败忽略；部分缺失按功能降级 | 中 |
| 9 | 内联 base64 wasm 体积 +37%、无法流式编译 | 若未来改单文件 | 坚持 model/ 独立缓存文件；不要把 wasm/模型内联进 HTML | 低（现状已正确） |
| 10 | WebNN iOS 全系不可用 | iOS | 不依赖 WebNN；WebNN 仅作 Android Chromium 未来增强 | 低 |

---

## 八、下一版最该先做的 3 个性能/兼容项

1. **给 iOS/低端机装上「本地规则优先」的引擎选择器**（对应 §5.2、§6.2 的 `selectEngine` / `shouldFallbackLocal`）。
   理由：它一次性兜住了「无 WebGPU（iOS<26）+ 单线程 wasm + 模型拉取失败 + 内存超限」四类最高频移动端故障，且纯函数可单测、零风险。这是 ROI 最高的一项。

2. **照片入口强制降采样到长边 ≤2048 px + 单离屏 canvas 复用**（对应 §4.2 的 `decodeToMaxEdge`）。
   理由：12 MP 照片多拷贝工作集已逼近 iPhone 256–288 MB 的 canvas 硬红线，是移动端「白屏/刷新都救不回」的最致命崩溃源；降采样同时把 YOLO/分类的输入内存与耗时一起砍到 1/12。

3. **拆 index.html：首屏 gzip 目标 ≤700 KB，非首屏 JS 按需加载**（对应 §2.1）。
   理由：2.0 MB 单文件在弱 4G 下下载 3–15 s，直接顶穿 LCP 2.5 s 目标，是中低端安卓「打开就卡」的主因；模型/wasm 已在独立文件（保持 cache-first、不要内联），只需把内联 JS 中非首屏部分拆成懒加载 chunk。

---

## 附：来源清单

- ONNX Runtime 性能诊断（EPs / 多线程依赖跨源隔离 / proxy worker / uint8 量化）：https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html
- ORT numThreads API：https://onnxruntime.ai/docs/api/js/interfaces/Env.WebAssemblyFlags.html
- Microsoft Open Source Blog：SIMD+多线程 3.4×：https://opensource.microsoft.com/blog/2021/09/02/onnx-runtime-web-running-your-machine-learning-model-in-browser/
- arXiv 2402.05981：SIMD/多线程延迟降低实测：https://arxiv.org/pdf/2402.05981.pdf
- WebGPU vs WASM 1.4–9.4×（ORT 1.27）：https://dev.to/yue_shu_c621a4a637f22396f/webgpu-vs-wasm-in-onnxruntime-web-14x-to-94x-faster-on-the-same-mac-depending-on-the-model-li5
- 移动端推理量级（WebGPU 30–60 ms、wasm 300–500 ms）：https://markaicode.com/webgpu-browser-machine-learning/
- 低端机 wasm 首帧 500–1500 ms：https://www.technolynx.com/post/real-time-computer-vision-for-live-streaming
- iPhone 14 Safari WebGPU 实测：https://martinuke0.github.io/posts/2026-03-12-the-shift-to-local-first-ai-optimizing-small-language-models-for-browser-based-edge-computing/
- WebKit：Safari 26.0 新增 WebGPU：https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- web.dev：主流浏览器 WebGPU 支持（Safari iOS 26）：https://web.dev/blog/webgpu-supported-major-browsers
- Safari 26.2 Release Notes（WebGPU+WebXR）：https://developer.apple.com/documentation/safari-release-notes/safari-26_2-release-notes
- MDN SharedArrayBuffer（Safari 15.2+，需跨源隔离）：https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer/SharedArrayBuffer
- WebNN W3C 候选推荐 2025-09：https://www.w3.org/TR/2025/CRD-webnn-20250925/
- LCP 阈值（2.5s good / 4s poor）：https://web.developers.google.cn/articles/defining-core-web-vitals-thresholds
- LCP 优化指南：https://web.developers.google.cn/articles/optimize-lcp
- 性能预算（JS ≤150KB / 整页 ≤1MB）：https://www.frontscope.dev/learn/fsd-performance-overview/
- web.dev：wasm 流式编译模式：https://web.developers.google.cn/articles/webassembly-performance-patterns-for-web-apps
- base64 内联 wasm +37%：https://dev.to/pm_cheng_3f36acecfb9c59f5/base64-inlined-wasm-still-costs-37-more-after-gzip-6c3
- Emscripten 部署（gzip 减 60–75%）：https://emscripten.org/docs/compiling/Deploying-Pages.html
- Workbox SW 更新流程（skipWaiting/postMessage/reload）：https://developer.chrome.google.cn/docs/workbox/handling-service-worker-updates
- WebKit Bug 199110（iOS 主屏幕 PWA 用旧资产）：https://bugs.webkit.org/show_bug.cgi?id=199110
- Apple 论坛：iOS SW 30–45 s 被杀：https://developer.apple.com/forums/thread/758346
- Apple 论坛：SW 空闲终止机制：https://developer.apple.com/forums/thread/735307
- WebKit Bug 211018（iOS PWA 后台冻结）：https://bugs.webkit.org/show_bug.cgi?id=211018
- Apple 论坛 702755（离线页偶发白屏）：https://developer.apple.com/forums/thread/702755
- web.dev：Safari 7 天存储淘汰 / 1 GB 配额：https://web.developers.google.cn/articles/storage-for-the-web
- MDN：存储配额与淘汰（Chrome 60% 磁盘）：https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- WebKit：存储政策更新：https://webkit.org/blog/14403/updates-to-storage-policy/
- 浏览器 canvas 内存（24MP=96MB、tab 驱逐 500MB–1GB）：https://boltquicktools.com/blog/browser-canvas-image-processing.html
- WebKit Bug 190280（canvas 内存上限 256/288MB）：https://bugs.webkit.org/show_bug.cgi?id=190280
- WebKit Bug 172533（3024×4032=418MB 杀进程）：https://bugs.webkit.org/show_bug.cgi?id=172533
- Android 降采样 inSampleSize：https://developer.android.google.cn/topic/performance/graphics/load-bitmap.html
