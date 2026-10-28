/* v13.2 P0 回归：所见即所得（预览框 = 最终裁切）
 * 用法：node tools/qa-crop-preview.js [图片]
 * 断言（上传后、分析前测，避开分析自动落地带来的重建）：
 *  ① object-fit = contain（照片完整显示，不再被舞台二次裁切）
 *  ② 显示矩形宽高比 == 原图比例（±1.5%）
 *  ③ 预览框(裁 10/10/10/10) 的 px 值 == 用显示矩形算出的期望值（±2px）
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer');
const chromePath = require('./chrome-path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.CPX_PORT || 8806);
const IMG = process.argv[2] || path.join(ROOT, 'imgs', 'u50', 'p005.jpg');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.tflite': 'application/octet-stream', '.binarypb': 'application/octet-stream', '.data': 'application/octet-stream' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});
(async () => {
  if (!fs.existsSync(IMG)) { console.error('找不到图片', IMG); process.exit(2); }
  await new Promise(r => srv.listen(PORT, r));
  const b = await puppeteer.launch(chromePath.launch());
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 140)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)); });
  await p.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.evaluate(() => {
    localStorage.setItem('aiComposeOnboarded_v76', '1');
    localStorage.setItem('aiModelEnabled', '0');
    localStorage.setItem('aiComposeCloudOn', '0');
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));
  const input = await p.$('#fileInput'); await input.uploadFile(IMG);
  await new Promise(r => setTimeout(r, 2000));

  const r = await p.evaluate(() => {
    const pv = document.getElementById('photoView');
    const cp = document.getElementById('cropPreview');
    const fr = document.getElementById('cpFrame');
    window.__v132core.preview({ crop: [10, 10, 10, 10], noCrop: false });
    const bw = cp.clientWidth, bh = cp.clientHeight;
    const iw = pv.naturalWidth, ih = pv.naturalHeight;
    const fit = pv.style.objectFit || getComputedStyle(pv).objectFit;
    const sc = fit === 'contain' ? Math.min(bw / iw, bh / ih) : Math.max(bw / iw, bh / ih);
    const d = { x: (bw - iw * sc) / 2, y: (bh - ih * sc) / 2, w: iw * sc, h: ih * sc };
    const m = fr.style;
    return {
      box: { w: bw, h: bh }, nat: { w: iw, h: ih }, fit, disp: d,
      frame: { x: parseFloat(m.left), y: parseFloat(m.top), w: parseFloat(m.width), h: parseFloat(m.height) },
      shown: getComputedStyle(cp).display !== 'none'
    };
  });
  const exp = { x: r.disp.x + r.disp.w * 0.10, y: r.disp.y + r.disp.h * 0.10, w: r.disp.w * 0.80, h: r.disp.h * 0.80 };
  const d = { dx: +(r.frame.x - exp.x).toFixed(1), dy: +(r.frame.y - exp.y).toFixed(1), dw: +(r.frame.w - exp.w).toFixed(1), dh: +(r.frame.h - exp.h).toFixed(1) };
  const arImg = r.nat.w / r.nat.h, arDisp = r.disp.w / r.disp.h;
  const arErr = Math.abs(arDisp - arImg) / arImg * 100;
  const okFit = r.fit === 'contain';
  const okAr = arErr <= 1.5;
  const okFrame = r.shown && Math.abs(d.dx) <= 2 && Math.abs(d.dy) <= 2 && Math.abs(d.dw) <= 2 && Math.abs(d.dh) <= 2;
  console.log('图片', r.nat.w + '×' + r.nat.h, '| 遮罩层', r.box.w + '×' + r.box.h, '| objectFit =', r.fit);
  console.log('显示矩形', JSON.stringify({ x: +r.disp.x.toFixed(1), y: +r.disp.y.toFixed(1), w: +r.disp.w.toFixed(1), h: +r.disp.h.toFixed(1) }));
  console.log('预览框(裁10%)', JSON.stringify(r.frame), '| 期望', JSON.stringify({ x: +exp.x.toFixed(1), y: +exp.y.toFixed(1), w: +exp.w.toFixed(1), h: +exp.h.toFixed(1) }), '| 差值', JSON.stringify(d));
  console.log('断言：contain', okFit ? 'PASS' : 'FAIL', '| 比例一致', arErr.toFixed(2) + '%', okAr ? 'PASS' : 'FAIL', '| 框=期望', okFrame ? 'PASS' : 'FAIL');
  console.log(errs.length ? '✗ 页面错误：' + errs.join(' | ') : '✓ 无页面错误');
  const pass = okFit && okAr && okFrame && !errs.length;
  console.log(pass ? '\n=== 所见即所得 PASS ===' : '\n=== 所见即所得 FAIL ===');
  await b.close(); srv.close();
  process.exitCode = pass ? 0 : 1;
})();
