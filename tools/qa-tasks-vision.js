// v13.2 QA：Tasks Vision 自托管链路（加载→推理→关掉→再加载）
// 用法：node tools/qa-tasks-vision.js [人像图] [非人像图]
// 输出：资源请求、徽标状态、真人脸框/关键点、姿态 33 点、关闭后释放、再次加载
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer');
const chromePath = require('./chrome-path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.TV_PORT || 8860);
const ARGS = process.argv.slice(2).filter(a => !a.startsWith('-'));
const IMG_PERSON = path.resolve(ARGS[0] || 'imgs/regression/portrait_front_1.jpg');
const IMG_PLAINS = (ARGS.length > 1 ? ARGS.slice(1) : ['imgs/ls12/ls03.jpg', 'imgs/ls12/ls10.jpg']).map(p => path.resolve(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.tflite': 'application/octet-stream', '.task': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': fs.statSync(fp).size });
  fs.createReadStream(fp).pipe(res);
});

async function pushFile(page, file) {
  const rel = '/' + path.relative(ROOT, file).replace(/\\/g, '/');
  const up = await page.evaluate(async (u) => {
    const r = await fetch(u);
    const blob = await r.blob();
    const name = u.split('/').pop();
    const f = new File([blob], name, { type: blob.type || 'image/jpeg' });
    const dt = new DataTransfer(); dt.items.add(f);
    const inp = document.getElementById('fileInput');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return { url: u, http: r.status, bytes: blob.size, type: blob.type };
  }, rel);
  if (up.http !== 200 || up.bytes < 1024) throw new Error('图片获取失败：' + JSON.stringify(up));
  const prev = await page.evaluate(() => (document.getElementById('photoView') || {}).src || '');
  return prev;
}

async function waitSwitch(page, prevSrc) {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    const st = await page.evaluate(prev => {
      const el = document.getElementById('photoView');
      return { same: !el || el.src === prev, complete: !!(el && el.complete), w: el ? el.naturalWidth : 0 };
    }, prevSrc);
    if (!st.same && st.complete && st.w > 0) return true;
  }
  return false;
}

async function setToggle(page, id, on) {
  await page.evaluate(({ id, on }) => {
    const cb = document.getElementById(id);
    if (!cb) return false;
    cb.checked = on;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { id, on });
}

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const browser = await puppeteer.launch(chromePath.launch());
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const reqs = [], errs = [];
  page.on('response', r => { const u = r.url(); if (/model\/tasks|blaze_face|pose_landmarker/.test(u)) reqs.push(r.status() + ' ' + u.replace(`http://localhost:${PORT}`, '')); });
  page.on('requestfailed', r => { const u = r.url(); if (/model\/tasks|blaze_face|pose_landmarker/.test(u)) reqs.push('FAIL ' + r.failure().errorText + ' ' + u.replace(`http://localhost:${PORT}`, '')); });
  page.on('pageerror', e => errs.push(String(e.message || e).slice(0, 240)));
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('aiComposeOnboarded_v76', '1');
      // 只在首次进入时关掉 YOLO；--real 阶段会把它改成 1 再 reload，这里不能每次导航都覆盖
      if (localStorage.getItem('aiModelEnabled') === null) localStorage.setItem('aiModelEnabled', '0');
      localStorage.setItem('faceEnabled', 'true');
      localStorage.setItem('poseEnabled', 'true');
    } catch (e) {}
  });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));

  const out = { images: { person: path.basename(IMG_PERSON), plains: IMG_PLAINS.map(p => path.basename(p)) }, steps: [] };
  // 真实用户路径：帮助面板里的「重新加载」
  for (const sel of ['#faceReload', '#poseReload']) {
    await page.evaluate(s => { const b = document.querySelector(s); if (b) b.click(); }, sel);
    await new Promise(r => setTimeout(r, 400));
  }
  const t0 = Date.now();
  let vision = null;
  while (Date.now() - t0 < 90000) {
    vision = await page.evaluate(() => window.__aiDbg.vision());
    if (vision.face === 'ready' && vision.pose === 'ready') break;
    if (vision.face === 'fail' && vision.pose === 'fail') break;
    await new Promise(r => setTimeout(r, 700));
  }
  out.load = { ms: Date.now() - t0, vision };
  out.badges = await page.evaluate(() => ({
    face: (document.getElementById('faceBadge') || {}).textContent || '',
    pose: (document.getElementById('poseBadge') || {}).textContent || ''
  }));

  async function uploadAndDetect(file) {
    // 不用 puppeteer uploadFile（headless 下 File.type 偶发为空，App 会按“非图片”拒绝）；
    // 用 fetch 取同源图片造一个带正确 MIME 的 File，走真实 change 事件链路。
    const prevSrc = await page.evaluate(() => (document.getElementById('photoView') || {}).src || '');
    await pushFile(page, file);
    const ok = await waitSwitch(page, prevSrc);
    if (!ok) throw new Error('图片未切换：' + file);
    await new Promise(r => setTimeout(r, 300));
    const f = await page.evaluate(() => window.__aiDbg.face());
    await new Promise(r => setTimeout(r, 250));
    const p = await page.evaluate(() => window.__aiDbg.pose());
    await new Promise(r => setTimeout(r, 250));
    const d = await page.evaluate(() => {
      const x = window.__ai.data || {};
      const el = document.getElementById('photoView');
      return { src: el && el.src ? el.src.slice(-28) : '', w: el ? el.naturalWidth : 0, h: el ? el.naturalHeight : 0,
        faceCount: x.faceCount, faceBoxes: x.faceBoxes, faceLM: x.faceLM, faceConfidence: x.faceConfidence, faceAvailable: x.faceAvailable,
        poseReady: x.poseReady, poseVisMean: x.poseVisMean, shoulderTilt: x.shoulderTilt, scene: (window.__ai.plan || {}).sceneType };
    });
    return { file: path.basename(file), faceCall: f, poseCall: p, data: d };
  }
  out.person = await uploadAndDetect(IMG_PERSON);
  out.plains = [];
  for (const p of IMG_PLAINS) out.plains.push(await uploadAndDetect(p));

  // 关掉 → 应释放并回到 idle；再打开 → 必须还能 ready（close 后重建）
  await setToggle(page, 'faceOn', false);
  await setToggle(page, 'poseOn', false);
  await new Promise(r => setTimeout(r, 400));
  out.afterOff = await page.evaluate(() => window.__aiDbg.vision());
  await setToggle(page, 'faceOn', true);
  await setToggle(page, 'poseOn', true);
  const t1 = Date.now();
  let back = null;
  while (Date.now() - t1 < 60000) {
    back = await page.evaluate(() => window.__aiDbg.vision());
    if (back.face === 'ready' && back.pose === 'ready') break;
    await new Promise(r => setTimeout(r, 700));
  }
  out.afterReopen = { ms: Date.now() - t1, vision: back };

  // 真实用户路径：YOLO 在线 → 点「AI 分析」→ 模型回调里自动跑人脸/姿态
  if (process.argv.includes('--real')) {
    await page.evaluate(() => { localStorage.setItem('aiModelEnabled', '1'); localStorage.setItem('aiForceModel', '1'); });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    const tr = Date.now();
    while (Date.now() - tr < 90000) {
      const m = await page.evaluate(() => window.__ai && window.__ai.model);
      if (m && m.ready) break;
      await new Promise(r => setTimeout(r, 800));
    }
    await new Promise(r => setTimeout(r, 800));
    // 人脸/姿态与 YOLO 是串行加载的，必须等它们也 ready，否则分析回调里会被"未就绪"跳过
    const tvWait = Date.now();
    let tvState = null;
    while (Date.now() - tvWait < 90000) {
      tvState = await page.evaluate(() => window.__aiDbg.vision());
      if (tvState.face === 'ready' && tvState.pose === 'ready') break;
      await new Promise(r => setTimeout(r, 700));
    }
    out.realPathTv = tvState;
    const prev = await page.evaluate(() => (document.getElementById('photoView') || {}).src || '');
    await pushFile(page, IMG_PERSON);
    const switched = await waitSwitch(page, prev);
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => document.getElementById('btnAnalyze').click());
    const rt = Date.now();
    let realData = null;
    while (Date.now() - rt < 30000) {
      await new Promise(r => setTimeout(r, 600));
      realData = await page.evaluate(() => {
        const s = (document.getElementById('statusbar') || {}).textContent || '';
        const x = window.__ai.data || {};
        return { status: s.slice(0, 60), model: window.__ai.model, faceCount: x.faceCount, faceBoxes: x.faceBoxes, faceConfidence: x.faceConfidence, faceAvailable: x.faceAvailable, poseReady: x.poseReady, poseVisMean: x.poseVisMean, scene: (window.__ai.plan || {}).sceneType, person: x.isPerson, faceWhy: window.__aiDbg.vision().faceWhy, lsModel: localStorage.getItem('aiModelEnabled') };
      });
      if (/已自动应用|构图优化完成|已应用/.test(realData.status)) break;
    }
    out.realPath = { switched, data: realData };
  }

  out.requests = [...new Set(reqs)];
  out.pageErrors = errs;
  console.log(JSON.stringify(out, null, 1));
  await browser.close(); srv.close();
})();
