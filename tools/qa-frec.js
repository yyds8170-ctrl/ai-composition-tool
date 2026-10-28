// v13.2 QA：光影/低照度图片的「滤镜推荐 + 数字依据」逐张取证
// 用法：node tools/qa-frec.js imgs/ls6 [imgs/ls12]
// 输出：JSON 数组（stdout），字段含像素信号、光影几何、推荐规则、实际套用与 pill 状态。
const puppeteer = require('puppeteer');
const chromePath = require('./chrome-path');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.QA_FREC_PORT || 8853);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.tflite': 'application/octet-stream', '.mjs': 'text/javascript' };

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

function listImages(p) {
  const abs = path.resolve(p);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return [abs];
  return fs.readdirSync(abs).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort().map(f => path.join(abs, f));
}

(async () => {
  const dirs = process.argv.slice(2).filter(a => !a.startsWith('-'));
  if (!dirs.length) { console.error('用法: node tools/qa-frec.js <目录> [...]'); process.exit(2); }
  let images = [];
  for (const d of dirs) images.push(...listImages(path.resolve(d)));
  await new Promise(r => srv.listen(PORT, r));
  const browser = await puppeteer.launch(chromePath.launch());
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('aiModelEnabled', '1');
      localStorage.setItem('aiForceModel', '1');
      localStorage.setItem('aiComposeOnboarded_v76', '1');
    } catch (e) {}
  });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 45000) {
    const m = await page.evaluate(() => window.__ai && window.__ai.model);
    if (m && m.ready) break;
    await new Promise(r => setTimeout(r, 800));
  }

  const out = [];
  for (const img of images) {
    const name = path.basename(img);
    try {
      // 每张图清空偏好历史：--undo 会点「原片」，不清会把后续同场景推荐静默降权（实测连点 3 次后 rec=null）
      await page.evaluate(() => { try { localStorage.removeItem('ai_cmp_pref'); } catch (e) {} });
      const input = await page.$('#fileInput');
      await input.uploadFile(img);
      await new Promise(r => setTimeout(r, 1200));
      await page.evaluate(() => document.getElementById('btnAnalyze').click());
      const deadline = Date.now() + 30000;
      let snap = null;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 400));
        snap = await page.evaluate(() => {
          const p = window.__ai && window.__ai.plan;
          if (!p || !p.crop) return null;
          const statusEl = document.getElementById('statusbar');
          return {
            plan: p,
            data: window.__ai.data,
            candidates: window.__ai.candidates,
            selected: window.__ai.selectedCandidate,
            filter: window.__ai.filter,
            banner: (document.getElementById('frecText') || {}).textContent || '',
            bannerShown: (() => { const b = document.getElementById('frecBanner'); return !!(b && b.style.display !== 'none'); })(),
            status: statusEl ? statusEl.textContent : ''
          };
        });
        if (snap && /已自动应用|已应用|已主动优化|构图优化完成/.test(snap.status)) {
          await new Promise(r => setTimeout(r, 900)); // 等自动滤镜/撤销栈落定
          snap = await page.evaluate(() => {
            const statusEl = document.getElementById('statusbar');
            return {
              plan: window.__ai.plan,
              data: window.__ai.data,
              candidates: window.__ai.candidates,
              selected: window.__ai.selectedCandidate,
              filter: window.__ai.filter,
              banner: (document.getElementById('frecText') || {}).textContent || '',
              bannerShown: (() => { const b = document.getElementById('frecBanner'); return !!(b && b.style.display !== 'none'); })(),
              status: statusEl ? statusEl.textContent : ''
            };
          });
          break;
        }
      }
      const d = (snap && snap.data) || {};
      const f = (snap && snap.filter) || {};
      const w = f.why || {};
      // --undo：验证“先套用→点原片回退→撤销恢复”的完整链路（只对横幅可见的图做）
      let undoChain = null;
      if (process.argv.includes('--undo') && snap && snap.filter && snap.bannerShown && snap.filter.id && /^lowkey-/.test(snap.filter.id)) {
        undoChain = { before: snap.filter.id };
        undoChain.hit = await page.evaluate(() => {
          const b = document.getElementById('frecReject');
          if (!b) return { err: 'no btn' };
          const r = b.getBoundingClientRect();
          const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
          const el = document.elementFromPoint(cx, cy);
          return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], at: el ? (el.id || el.className || el.tagName) : null };
        });
        const rej = await page.$('#frecReject');
        if (rej) { await rej.click(); await new Promise(r => setTimeout(r, 350)); }
        undoChain.afterReject = await page.evaluate(() => ({ id: window.__ai.filter.id, pill: window.__ai.filter.pill, banner: (document.getElementById('frecText') || {}).textContent || '' }));
        if (undoChain.afterReject.id === undoChain.before) {
          // 鼠标点在按钮中心却没触发 → 多半被浮层拦截；再用 DOM click 区分“事件未绑定”与“点不到”
          if (rej) { await page.evaluate(() => document.getElementById('frecReject').click()); await new Promise(r => setTimeout(r, 350)); }
          undoChain.afterJsClick = await page.evaluate(() => ({ id: window.__ai.filter.id, pill: window.__ai.filter.pill }));
        }
        const u = await page.$('#btnUndo');
        if (u) { await u.click(); await new Promise(r => setTimeout(r, 350)); }
        undoChain.afterUndo = await page.evaluate(() => ({ id: window.__ai.filter.id, pill: window.__ai.filter.pill }));
        if (undoChain.afterUndo.id !== undoChain.before) {
          // 面板打开时「撤销」在抽屉下面（既有布局）；DOM click 只验证撤销栈语义
          await page.evaluate(() => document.getElementById('btnUndo').click());
          await new Promise(r => setTimeout(r, 350));
          undoChain.afterJsUndo = await page.evaluate(() => ({ id: window.__ai.filter.id, pill: window.__ai.filter.pill }));
        }
      }
      out.push({
        image: name,
        scene: snap && snap.plan && snap.plan.sceneType,
        subject: snap && snap.plan && snap.plan.subject,
        isPerson: d.isPerson, detectedClasses: d.detectedClasses, personScore: d.personScore,
        faceAvailable: d.faceAvailable, faceCount: d.faceCount, faceBoxes: d.faceBoxes, skinRatio: d.skinRatio,
        poseReady: d.poseReady, shoulderTilt: d.shoulderTilt,
        crop: snap && snap.plan && snap.plan.crop,
        cands: snap && snap.plan && snap.plan.candCount,
        mean: d.mean, sat: d.sat, sharpness: d.sharpness, contrast: d.contrast,
        highClip: d.highClip, shadowClip: d.shadowClip, lightScore: d.lightScore,
        waterScore: d.waterScore, warmRatio: d.warmRatio, personScore: d.personScore,
        light: w.light || null,
        rec: w.rec || null,
        whyStage: w.stage || null,
        applied: f.id || null,
        pill: f.pill || null,
        auto: !!f.autoApplied,
        banner: snap ? snap.banner : '',
        bannerShown: !!(snap && snap.bannerShown),
        status: snap ? snap.status : '',
        selectedReason: snap && snap.selected ? snap.selected.reason : null,
        selectedTag: snap && snap.selected ? snap.selected.tag : null,
        undoChain: undoChain
      });
      console.log(`done ${name}: f=${f.id || '-'} rec=${w.rec ? w.rec.filter : '-'} stage=${w.stage || '-'}`);
    } catch (e) {
      out.push({ image: name, error: String(e.message || e).slice(0, 160) });
      console.log(`ERR ${name}: ${e.message}`);
    }
  }
  await browser.close();
  srv.close();
  console.log(JSON.stringify({ images: out, pageErrors: errs }, null, 1));
})();
