/* v13.1.0 测试集诚实化（第 2 步）：抓取"确属真实摄影"的图片补齐唯一图池。
 * 来源：Lorem Picsum（图片均为 Unsplash 授权的真实照片，含作者与原始页面链接，可追溯）。
 * 说明：本机访问 Wikimedia Commons 超时，故改用可达且授权清晰的 Picsum/Unsplash。
 * 用法：node tools/fetch-picsum.js
 * 产物：imgs/picsum/*.jpg + tests/data/picsum-manifest.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (ai-composition-pro local QA; non-commercial)';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'imgs', 'picsum');
const MAN = path.join(ROOT, 'tests', 'data', 'picsum-manifest.json');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
if (!fs.existsSync(path.dirname(MAN))) fs.mkdirSync(path.dirname(MAN), { recursive: true });

const WANT_NORMAL = 110, W_NORMAL = 2400;   // ≈ 真实手机直出量级
const WANT_BIG = 12, W_BIG = 4200;          // 高像素：验证"24MP/48MP 才解锁的小框重构图"档

async function getJSON(u) { const r = await fetch(u, { headers: { 'User-Agent': UA } }); return r.json(); }
async function save(u, fp, minBytes) {
  const r = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!r.ok) throw new Error('http ' + r.status);
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length < minBytes) throw new Error('too small ' + b.length);
  fs.writeFileSync(fp, b);
  return b.length;
}
(async () => {
  const all = [];
  for (let p = 1; p <= 8; p++) {
    try { const j = await getJSON('https://picsum.photos/v2/list?page=' + p + '&limit=100'); all.push(...j); }
    catch (e) { console.log('list page', p, 'fail', String(e).slice(0, 60)); }
  }
  console.log('候选照片', all.length);
  const tall = all.filter(x => x.width >= 3600);           // 原图够大才敢要 2400/4200
  const manifest = fs.existsSync(MAN) ? JSON.parse(fs.readFileSync(MAN, 'utf8')) : [];
  const used = new Set(manifest.map(m => m.picsumId));
  let n = 0;
  for (const ph of tall) {
    if (n >= WANT_NORMAL) break;
    if (used.has(ph.id)) continue;
    const h = Math.round(W_NORMAL * ph.height / ph.width);
    const fp = path.join(OUT, 'p' + String(n + 1).padStart(3, '0') + '.jpg');
    try {
      const bytes = await save('https://picsum.photos/id/' + ph.id + '/' + W_NORMAL + '/' + h, fp, 120000);
      manifest.push({ file: path.basename(fp), picsumId: ph.id, author: ph.author, srcPage: ph.url,
        origW: ph.width, origH: ph.height, w: W_NORMAL, h: h, bytes: bytes, mp: +(W_NORMAL * h / 1e6).toFixed(1),
        license: 'Unsplash License（经 Lorem Picsum 分发）' });
      used.add(ph.id); n++; process.stdout.write('.');
    } catch (e) { console.log('\nskip', ph.id, String(e).slice(0, 50)); }
  }
  let b = 0;
  for (const ph of tall) {
    if (b >= WANT_BIG) break;
    const already = manifest.some(m => m.picsumId === ph.id);
    if (!already) continue;                       // 已下过普通版，再要一份高分辨率
    const h = Math.round(W_BIG * ph.height / ph.width);
    const fp = path.join(OUT, 'big' + String(b + 1).padStart(2, '0') + '.jpg');
    try {
      const bytes = await save('https://picsum.photos/id/' + ph.id + '/' + W_BIG + '/' + h, fp, 400000);
      manifest.push({ file: path.basename(fp), picsumId: ph.id, author: ph.author, srcPage: ph.url,
        origW: ph.width, origH: ph.height, w: W_BIG, h: h, bytes: bytes, mp: +(W_BIG * h / 1e6).toFixed(1),
        license: 'Unsplash License（经 Lorem Picsum 分发）', hiRes: true });
      b++; process.stdout.write('#');
    } catch (e) { console.log('\nskip big', ph.id, String(e).slice(0, 50)); }
  }
  fs.writeFileSync(MAN, JSON.stringify(manifest, null, 1));
  console.log('\n完成：普通', n, '高像素', b, '总计条目', manifest.length);
})();
