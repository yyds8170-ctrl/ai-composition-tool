/* v13.1.0 QA：统计云端 VLM 在真实链路里到底会不会用 action=refine / reject。
 * 目的：refine 协议单图已证明可用，但 50 张批量回归里命中 0 次。这个探针读 __ai.cloudPickRaw，
 *      直接看模型返回的指令形态（有没有 action 键、值是什么、给了哪些字段），
 *      用来区分"协议没接通"与"这个共享模型根本不填这个字段"。
 * 用法：CLOUD_TOKEN=xxx node tools/probe-cloud-actions.js [目录] [张数]
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer');
const chromePath = require('./chrome-path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PROBE_PORT || 8794);
const TOKEN = process.env.CLOUD_TOKEN;
const DIR = path.join(ROOT, process.argv[2] || 'imgs/u50');
const N = Number(process.argv[3] || 8);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p); if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});
if (!TOKEN) { console.error('需要 CLOUD_TOKEN'); process.exit(2); }

(async () => {
  const imgs = fs.readdirSync(DIR).filter(f => /\.(png|jpe?g)$/i.test(f)).sort().slice(0, N).map(f => path.join(DIR, f));
  await new Promise(r => srv.listen(PORT, r));
  const b = await puppeteer.launch(chromePath.launch());
  const page = await b.newPage(); await page.setViewport({ width: 390, height: 844 });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const MODEL_ON = (process.env.MODEL || '0') === '1';
  await page.evaluate((tk, modelOn) => {
    localStorage.setItem('aiComposeCloudOn', '1');
    localStorage.setItem('aiComposeCloudKey', tk);
    localStorage.setItem('aiModelEnabled', modelOn ? '1' : '0');
    localStorage.setItem('aiForceModel', modelOn ? '1' : '0');
    localStorage.setItem('aiComposeOnboarded_v76', '1');
  }, TOKEN, MODEL_ON);
  console.log('本地模型：' + (MODEL_ON ? '开（与 50 张批量回归同配置）' : '关'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  if (MODEL_ON) {
    const t0 = Date.now();
    while (Date.now() - t0 < 45000) {
      const m = await page.evaluate(() => window.__ai && window.__ai.model);
      if (m && m.ready) break;
      await new Promise(r => setTimeout(r, 800));
    }
    await new Promise(r => setTimeout(r, 500));
  }
  const tally = {};
  for (const img of imgs) {
    const input = await page.$('#fileInput'); await input.uploadFile(img);
    await new Promise(r => setTimeout(r, 1200));
    await page.evaluate(() => document.getElementById('btnAnalyze').click());
    let snap = null; const dl = Date.now() + 80000;
    while (Date.now() < dl) {
      await new Promise(r => setTimeout(r, 800));
      snap = await page.evaluate(() => ({
        raw: window.__ai && window.__ai.cloudPickRaw || null,
        plan: window.__ai && window.__ai.plan || null,
        cands: (window.__ai && window.__ai.candidates || []).map(c => c.id + ':' + (c.noCrop ? '原图' : '[' + c.crop.join(',') + ']'))
      }));
      if (snap && snap.raw) break;
    }
    const name = path.basename(img);
    if (!snap || !snap.raw) { console.log(name, '| 云端无返回'); tally['(无返回)'] = (tally['(无返回)'] || 0) + 1; continue; }
    // v13.1.0 QA：云端返回后再等 3 秒，看候选数组/候选条有没有被后续渲染清空（"随时切换"是 v13 的卖点）
    await new Promise(r => setTimeout(r, 3000));
    const after = await page.evaluate(() => ({
      cand: (window.__ai && window.__ai.candidates || []).length,
      strip: !!document.getElementById('compCandidatesCard'),
      chips: document.querySelectorAll('#compCandidatesCard button[data-cid]').length,
      planCrop: window.__ai && window.__ai.plan && window.__ai.plan.crop
    }));
    console.log('   3 秒后：候选数组=' + after.cand + ' 候选条=' + (after.strip ? '在' : '没了') +
      ' 可点芯片=' + after.chips + ' 落地=' + JSON.stringify(after.planCrop));
    const r = snap.raw;
    const k = r.hasActionKey ? r.action : '(模型未填 action)';
    tally[k] = (tally[k] || 0) + 1;
    console.log(name.padEnd(12), 'action=' + String(r.action).padEnd(9),
      'base=' + String(r.base).padEnd(5), 'trim=' + JSON.stringify(r.trim),
      'best=' + r.best, 'cutsPerson=' + r.cutsPerson,
      '| 落地=' + JSON.stringify(snap.plan && snap.plan.crop),
      'refined=' + (snap.plan && snap.plan.aiRefined),
      'guard=' + (snap.plan && snap.plan.aiGuardWhy || '-'),
      '候选' + snap.cands.length);
    console.log('   返回字段：' + r.keys);
  }
  console.log('\n=== action 触发率 ===');
  for (const k of Object.keys(tally)) console.log('  ' + k.padEnd(18) + tally[k]);
  await b.close(); srv.close();
})();
