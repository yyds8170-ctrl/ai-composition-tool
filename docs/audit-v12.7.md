# v12.7.0 端到端审计报告

## P0（崩溃/错误）
- 无。线上 Pages console 0 error/0 warning/0 network fail。

## P1（体验问题）
- 无明显 P1。移动视口 390x844 下所有关键元素（fileInput/btnAnalyze/btnCmp/cmpHandle/photoView）均存在。
- HTML 1.9MB 在弱 4G 下载约 3-5s，可接受（PWA 缓存后秒开）。

## P2（可优化，记入 backlog）
1. 首页 1.9MB gzip 后 ~600KB，可拆首屏/模型懒加载（E 研究报告已记）
2. window.__ 调试钩子保留（供 regress.js/snapshot.js 测试用），线上无副作用
3. iOS 26 前无 WebGPU，wasm 兜底（已知限制）
4. GH Pages 无 COOP/COEP，wasm 多线程不激活（已知限制）
5. 难例图 3 张 404（night_4/sunset_4/symmetry_3），后续补

## 检查结果
| 项 | 结果 |
|---|---|
| 线上 console error | 0 |
| 线上 console warning | 0 |
| network fail | 0 |
| 关键元素存在 | fileInput/btnAnalyze/btnCmp/cmpHandle/photoView 全在 |
| PWA ServiceWorker | 已注册 |
| HTML 体积 | 1.9MB |
| console.log 遗留 | 0 |
| 红线词 | 0 |
| 版本号 | v12.6.0 已部署 |
| 本地模式"云端"字样 | 仅在云设置面板，本地结果页无残留 |
