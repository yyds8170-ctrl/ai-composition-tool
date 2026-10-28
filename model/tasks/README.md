# model/tasks — MediaPipe Tasks Vision 自托管资源

本目录存放 MediaPipe Tasks Vision 运行时（JS bundle + WASM）与预训练模型，
供纯前端 PWA 在**完全离线**状态下加载。全部文件已随仓库分发，运行时不访问任何 CDN。

- 包版本：`@mediapipe/tasks-vision@1.1.1`
- 下载日期：2026-10-28
- 许可：Apache License 2.0（全文见同目录 `LICENSE`）
- 合计：7 个资源文件，共 **32,979,121 字节**（≈ 31.45 MiB）

## 文件清单与来源

| 文件 | 字节数 | sha256 | 来源 URL |
| --- | ---: | --- | --- |
| `vision_bundle.mjs` | 156139 | `a84921e02321e582484c1f8126d344b5f33b791fa09c640a52e20ee8632068f1` | https://unpkg.com/@mediapipe/tasks-vision@1.1.1/vision_bundle.mjs |
| `wasm/vision_wasm_internal.js` | 334128 | `6522286aa32dd93eff17c3da002b0649516f87abfec7a80b5bfe5c9625caa5f8` | https://unpkg.com/@mediapipe/tasks-vision@1.1.1/wasm/vision_wasm_internal.js |
| `wasm/vision_wasm_internal.wasm` | 13519922 | `0e101a010e262ef8e78f22e3c95b60a9705fd06962753c9acd6356d9fb56b7bd` | https://unpkg.com/@mediapipe/tasks-vision@1.1.1/wasm/vision_wasm_internal.wasm |
| `wasm/vision_wasm_nosimd_internal.js` | 333931 | `942654dbdcebce08ea039af23d18e58bebf23c8607d74023d2df7071c8a7b638` | https://unpkg.com/@mediapipe/tasks-vision@1.1.1/wasm/vision_wasm_nosimd_internal.js |
| `wasm/vision_wasm_nosimd_internal.wasm` | 12627509 | `c9b1b69bb87baf9e529254d8559dcbcf4c5a9c0eda84f56a12f17d675335ec9c` | https://unpkg.com/@mediapipe/tasks-vision@1.1.1/wasm/vision_wasm_nosimd_internal.wasm |
| `models/blaze_face_short_range.tflite` | 229746 | `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f` | https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite |
| `models/pose_landmarker_lite.task` | 5777746 | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task |

说明：

- 7 个文件的字节数均与上游预期值逐一核对**一致**；sha256 由 `node:crypto`（`sha256`）在下载后本地计算，可用于后续完整性复核。
- `vision_bundle.mjs` 是 ESM 入口；`wasm/` 下 SIMD 与 no-SIMD 两套运行时并存，`FilesetResolver` 会按设备能力自动选择。
- 模型为 float16 量化版本 v1：BlazeFace short-range（轻量人脸检测）与 Pose Landmarker Lite（33 关键点姿态）。

推荐加载方式（示意，实际以项目代码为准）：

```js
import { FilesetResolver, FaceDetector, PoseLandmarker } from './model/tasks/vision_bundle.mjs';

const vision = await FilesetResolver.forVisionTasks('./model/tasks/wasm');
const faceDetector = await FaceDetector.createFromOptions(vision, {
  baseOptions: { modelAssetPath: './model/tasks/models/blaze_face_short_range.tflite' },
  runningMode: 'IMAGE',
});
```

## 许可

上述所有文件（JS 运行时、WASM 二进制、预训练模型）均由 Google LLC / The MediaPipe Authors
以 **Apache License 2.0** 发布。许可全文见本目录 `LICENSE`。

关于 `LICENSE` 的来源：npm 包 `@mediapipe/tasks-vision@1.1.1` **未随包附带**许可证文件
（unpkg 文件清单共 14 项，不含 LICENSE/LICENSE.txt/NOTICE，因此
`https://unpkg.com/@mediapipe/tasks-vision@1.1.1/LICENSE` 返回 404；该包 `package.json`
仅以 `"license": "Apache-2.0"` 声明）。故 `LICENSE` 采用「缺失说明 + Apache-2.0 官方全文」
的形式，全文逐字取自 https://www.apache.org/licenses/LICENSE-2.0.txt（11358 字节，未改动）。

分发时请保留 `LICENSE` 与本 `README.md`，不要移除版权与许可声明。

## 为什么必须随仓库分发，不能只靠 CDN

本项目的定位是**纯前端、可离线使用的 PWA**（Service Worker 缓存 + 无后端）。把
MediaPipe 运行时与模型留在 CDN 上会在以下几个方面直接破坏离线可用性与稳定性：

1. **离线不可用**：PWA 的核心承诺是断网可用。CDN 资源首次未缓存、缓存被清理或用户在飞机/弱网环境下首次打开时，`import()` 与 `fetch()` 会直接失败，人脸/姿态功能整体不可用。
2. **Service Worker 缓存受限**：跨域（opaque）响应无法可靠校验内容与状态码，`Cache API` 对 no-cors 响应的体积统计与更新策略不可控；同源文件可以精确预缓存、按版本 `cache-first` 命中，卸载/升级也更干净。
3. **WASM 必须同源/可缓存**：`vision_wasm_internal.wasm`（13.5 MB）体量大，跨域下载易受 CDN 限速、地区网络策略与 CORS 头变化影响；同源分发可复用 HTTP 缓存与 SW 缓存，避免每次冷启动重复下载十几 MB。
4. **版本锁定与可复现**：npm/CDN 上的 `latest` 或非固定版本可能漂移，导致 WASM 与 JS bundle 版本不匹配（ABI 不兼容）而静默失败；仓库内固定 1.1.1 并附 sha256，可复现、可审计。
5. **供应链与可用性风险**：公共 CDN 可能被墙、限流、下线或被投毒；自托管把依赖收敛到仓库这一处，便于审查与长期维护。

因此这 7 个文件属于**发布产物的一部分**：必须提交进仓库、随站点一起部署，并在 Service Worker
预缓存列表中登记，任何“运行时去 CDN 取”的回退路径都不应作为默认策略。
