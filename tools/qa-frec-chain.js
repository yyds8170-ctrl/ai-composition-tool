// v13.2 链路验收：低照度滤镜「自动套用 → 原片回退 → 撤销恢复 → 再撤销」
// 重点区分：① 横幅按钮是否能被真实鼠标点中（曾经被 AI 面板遮挡）；② 撤销栈语义是否正确。
// 用法：node tools/qa-frec-chain.js [图片]
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer');
const chromePath = require('./chrome-path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.CHAIN_PORT || 8881);
const IMG = path.resolve(process.argv[2] || 'qa/v132in/underpass.jpg');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});
const hit = (sel) => {
  const b = document.querySelector(sel);
  if (!b) return { err: 'no ' + sel };
  const r = b.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
  const el = document.elementFromPoint(cx, cy);
  return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], at: el ? (el.id || el.className || el.tagName) : null, visible: !!(b.offsetParent || b.getClientRects().length) };
};
const snap = () => ({ id: window.__ai.filter.id, pill: window.__ai.filter.pill, banner: (document.getElementById('frecText') || {}).textContent || '', bannerShown: (() => { const b = document.getElementById('frecBanner'); return !!b && b.style.display !== 'none'; })(), undoDisabled: document.getElementById('btnUndo').disabled, panelOpen: document.getElementById('aiPanel').classList.contains('open') });

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await puppeteer.launch(chromePath.launch());
  const page = await b.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e).slice(0, 160)));
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('aiComposeOnboarded_v76', '1');
      localStorage.setItem('aiModelEnabled', '0');
      localStorage.setItem('faceEnabled', 'false');
      localStorage.setItem('poseEnabled', 'false');
      localStorage.removeItem('ai_cmp_pref');
    } catch (e) {}
  });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  const input = await page.$('#fileInput');
  await input.uploadFile(IMG);
  await new Promise(r => setTimeout(r, 1600));
  await page.evaluate(() => document.getElementById('btnAnalyze').click());
  const dl = Date.now() + 25000;
  let s0 = null;
  while (Date.now() < dl) {
    await new Promise(r => setTimeout(r, 400));
    s0 = await page.evaluate(snap);
    if (s0 && s0.id && /^lowkey-/.test(s0.id) && s0.bannerShown) break;
  }
  const out = { image: path.basename(IMG), initial: s0, hits: null, mouseReject: null, jsReject: null, jsUndo1: null, jsUndo2: null, pageErrors: errs };
  out.hits = await page.evaluate(hit, '#frecReject');
  out.hitsUndo = await page.evaluate(hit, '#btnUndo');

  // 1) 真实鼠标点「原片」（验证浮层是否可点）
  const rej = await page.$('#frecReject');
  if (rej) await rej.click();
  await new Promise(r => setTimeout(r, 300));
  out.mouseReject = await page.evaluate(snap);

  // 2) 若鼠标仍被遮挡，用 DOM click 区分“点不到”与“逻辑不通”
  if (out.mouseReject && out.mouseReject.id === out.initial.id) {
    await page.evaluate(() => document.getElementById('frecReject').click());
    await new Promise(r => setTimeout(r, 300));
    out.jsReject = await page.evaluate(snap);
  }

  // 3) 撤销「原片」→ 应回到推荐滤镜（用 DOM click 避开面板遮挡，专门验栈语义）
  await page.evaluate(() => document.getElementById('btnUndo').click());
  await new Promise(r => setTimeout(r, 350));
  out.jsUndo1 = await page.evaluate(snap);

  // 4) 再撤销一次 → 应回到自动套用前的原图（自动套用也进撤销栈）
  await page.evaluate(() => document.getElementById('btnUndo').click());
  await new Promise(r => setTimeout(r, 350));
  out.jsUndo2 = await page.evaluate(snap);

  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.close();
})();
