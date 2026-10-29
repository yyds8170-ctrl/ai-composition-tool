#!/usr/bin/env node
/*
 * tools/visual-regress.js — 主动构图画布回归走查（contact-sheet 生成器）
 *
 * 用法：
 *   node tools/visual-regress.js                     # 跑 imgs/regression 全部唯一图
 *   node tools/visual-regress.js --dir imgs/regression
 *   node tools/visual-regress.js --only leading      # 只跑文件名某前缀（快速复核）
 *
 * 原理：headless Chrome 加载本地 index.html（移动端视口 390×844，本地模型、跳过新手引导），
 * 逐张喂图 → 点 #btnAnalyze → 轮询等到模型回写后的最终 plan。
 * 然后在页面里用 <canvas> 给每张图做一张卡片：
 *   左：原图 + 红色裁切框（crop=[L,T,R,B] 四边留白百分比；未裁切画黄色虚线整框并标注）
 *   右：按 crop 从原图真实截出的裁切结果（noCrop 时等于原图）
 * 卡片按文件名前缀分组，每组每页 6 张合成一张联系表 PNG，写到 scratch/visual/。
 * 同时 stdout 打印逐图表格，并写一份 CSV 到 scratch/visual/results.csv。
 *
 * 注意：crop 是【四边留白百分比】，不是 [x0,y0,x1,y1] 坐标：
 *   可见矩形 x0=L/100*W, x1=(1-R/100)*W, y0=T/100*H, y1=(1-B/100)*H。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.VISUAL_REGRESS_PORT || 8791);
const OUT_DIR = path.join(ROOT, 'scratch/visual');
const WAIT_MODEL_MS = 40000;
const WAIT_ANALYZE_MS = 15000;
const POLL_MS = 500;
const PER_SHEET = 6;          // 每张联系表 6 个卡片
const CARD_COL = 2;           // 联系表 2 列 × 3 行
const CARD_ROW = 3;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm', '.onnx': 'application/octet-stream',
  '.tflite': 'application/octet-stream', '.binarypb': 'application/octet-stream'
};

function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const fp = path.join(ROOT, p);
      if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
        res.writeHead(404); res.end('nf'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    });
    srv.listen(PORT, () => resolve(srv));
  });
}

function listImages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /\.(png|jpe?g|webp)$/i.test(f))
    .sort()
    .map(f => path.join(dir, f));
}

// 与 tools/regress.js 一致：md5 去重并报告真实唯一数
function dedupeImages(images) {
  const seen = new Map(), out = [], dup = [];
  for (const p of images) {
    let h = '';
    try { h = crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); }
    catch (e) { out.push(p); continue; }
    if (seen.has(h)) { dup.push(path.basename(p) + '==' + path.basename(seen.get(h))); continue; }
    seen.set(h, p); out.push(p);
  }
  if (dup.length) console.log('⚠ 重复图（已自动剔除）: ' + dup.join(', '));
  console.log('唯一图数: ' + out.length + ' / 输入 ' + images.length);
  return out;
}

function prefixOf(name) {
  const m = name.match(/^([A-Za-z]+)/);
  return m ? m[1].toLowerCase() : 'misc';
}

function areaPctOf(crop, noCrop) {
  if (noCrop || !Array.isArray(crop) || crop.length !== 4) return 100;
  const keepW = Math.max(0, 1 - (crop[0] + crop[2]) / 100);
  const keepH = Math.max(0, 1 - (crop[1] + crop[3]) / 100);
  return Math.round(keepW * keepH * 1000) / 10;
}

async function runImage(page, imgPath) {
  const input = await page.$('#fileInput');
  await input.uploadFile(imgPath);
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => document.getElementById('btnAnalyze').click());
  // 与 regress.js 相同的 settle 逻辑：必须等到模型回写，不读像素初判
  const deadline = Date.now() + WAIT_ANALYZE_MS;
  let snap = null, settleUntil = 0;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_MS));
    snap = await page.evaluate(() => {
      const p = window.__ai && window.__ai.plan;
      if (!p) return null;
      const statusEl = document.getElementById('statusbar');
      return {
        crop: p.crop ? p.crop.slice() : null,
        noCrop: !!p.noCrop,
        scene: p.sceneType || '',
        proactiveTag: p.proactiveTag || null,
        proactiveCrop: p.proactiveCrop ? p.proactiveCrop.slice() : null,
        status: statusEl ? statusEl.textContent : ''
      };
    });
    if (!snap || !snap.crop) continue;
    if (!settleUntil) settleUntil = Date.now() + 3500;
    if (/真AI主体识别完成|AI精修建议|人像保护|已应用云端构图/.test(snap.status)) {
      if (Date.now() >= settleUntil - 2800) break;
    } else if (Date.now() >= settleUntil) break;
  }
  return snap;
}

function browserLaunchOptions() {
  const candidates = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
  const found = candidates.find(p => fs.existsSync(p));
  const opts = { headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader'] };
  if (found) opts.executablePath = found;
  return opts;
}

// 在页面里注册卡片绘制 + 联系表合成函数（只跑一次）
async function installBrowserHelpers(page) {
  await page.evaluate(() => {
    window.__vcards = [];
    window.__buildCard = async function (meta) {
      const im = new Image();
      im.src = meta.relURL;
      await im.decode();
      const W = im.naturalWidth, H = im.naturalHeight;
      let m = [0, 0, 0, 0];
      if (!meta.noCrop && Array.isArray(meta.crop) && meta.crop.length === 4) m = meta.crop;
      const sx = m[0] / 100 * W, sy = m[1] / 100 * H;
      const sw = Math.max(1, (1 - (m[0] + m[2]) / 100) * W);
      const sh = Math.max(1, (1 - (m[1] + m[3]) / 100) * H);
      const cropping = !meta.noCrop && (m[0] + m[1] + m[2] + m[3]) > 0.5;

      const SUBW = 640, SUBH = 560, PAD = 26, HDR = 96, CAP = 38, GAP = 26, S = 2;
      const cw = PAD * 2 + SUBW * 2 + GAP;
      const ch = PAD + HDR + SUBH + CAP + PAD;
      const cv = document.createElement('canvas');
      cv.width = cw * S; cv.height = ch * S;
      const ctx = cv.getContext('2d');
      ctx.scale(S, S);
      ctx.fillStyle = '#15181d'; ctx.fillRect(0, 0, cw, ch);

      // ---- 头部标签 ----
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 26px "Noto Sans CJK SC", sans-serif';
      ctx.fillText(meta.name, PAD, PAD);
      ctx.fillStyle = '#9fb3c8';
      ctx.font = '500 19px "Noto Sans CJK SC", sans-serif';
      const line2 = 'scene=' + meta.scene + '   保留面积=' + meta.area + '%   主动构图=' + (meta.pc ? 'Y' : 'N') +
        (meta.tag ? '   tag=' + meta.tag : '');
      ctx.fillText(line2, PAD, PAD + 38);

      const py = PAD + HDR;
      // ---- 左：原图 + 裁切框 ----
      ctx.fillStyle = '#000'; ctx.fillRect(PAD, py, SUBW, SUBH);
      const scL = Math.min(SUBW / W, SUBH / H);
      const dwL = W * scL, dhL = H * scL;
      const dxL = PAD + (SUBW - dwL) / 2, dyL = py + (SUBH - dhL) / 2;
      ctx.drawImage(im, dxL, dyL, dwL, dhL);
      if (cropping) {
        ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 5;
        ctx.strokeRect(dxL + sx * scL, dyL + sy * scL, sw * scL, sh * scL);
      } else {
        ctx.strokeStyle = '#ffd60a'; ctx.lineWidth = 4; ctx.setLineDash([16, 10]);
        ctx.strokeRect(dxL, dyL, dwL, dhL);
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffd60a'; ctx.font = '600 22px "Noto Sans CJK SC", sans-serif';
        ctx.fillText('未裁切（保留原图）', PAD + 14, py + 14);
      }
      // ---- 右：真实裁切结果 ----
      const rx0 = PAD + SUBW + GAP;
      ctx.fillStyle = '#000'; ctx.fillRect(rx0, py, SUBW, SUBH);
      const scR = Math.min(SUBW / sw, SUBH / sh);
      const dwR = sw * scR, dhR = sh * scR;
      const dxR = rx0 + (SUBW - dwR) / 2, dyR = py + (SUBH - dhR) / 2;
      ctx.drawImage(im, sx, sy, sw, sh, dxR, dyR, dwR, dhR);

      // ---- 子图标题 ----
      ctx.fillStyle = '#8aa0b8';
      ctx.font = '500 18px "Noto Sans CJK SC", sans-serif';
      ctx.fillText('原图 + 裁切框（红框=裁切范围）', PAD, py + SUBH + 9);
      ctx.fillText('真实裁切结果', rx0, py + SUBH + 9);

      window.__vcards.push({ meta: meta, cv: cv, cw: cw, ch: ch });
      return true;
    };

    window.__makeSheet = function (groupName, startIdx, title) {
      const items = window.__vcards;
      const MARGIN = 40, TITLE_H = 64, GAP = 30;
      const cw = items[0].cw, ch = items[0].ch;
      const cols = 2, rows = Math.ceil(items.length / cols);
      const W = MARGIN * 2 + cw * cols + GAP * (cols - 1);
      const H = MARGIN + TITLE_H + ch * rows + GAP * (rows - 1) + MARGIN;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#0d0f13'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 30px "Noto Sans CJK SC", sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(title, MARGIN, MARGIN);
      items.forEach((it, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        const x = MARGIN + c * (cw + GAP);
        const y = MARGIN + TITLE_H + r * (ch + GAP);
        ctx.drawImage(it.cv, x, y, it.cw, it.ch);
      });
      return cv.toDataURL('image/png');
    };
    window.__clearCards = function () { window.__vcards = []; };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf('--dir');
  const dir = dirIdx >= 0 ? args[dirIdx + 1] : path.join(ROOT, 'imgs/regression');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  let images = dedupeImages(listImages(dir));
  if (only) {
    images = images.filter(p => prefixOf(path.basename(p)) === only.toLowerCase());
    console.log(`--only ${only} → ${images.length} 张`);
  }
  if (images.length === 0) { console.error('没有可跑的图'); process.exit(2); }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const srv = await startServer();
  const browser = await puppeteer.launch(browserLaunchOptions());
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('aiModelEnabled', '1');
      localStorage.setItem('aiForceModel', '1');
      localStorage.setItem('aiComposeOnboarded_v76', '1');
    } catch (e) {}
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
  console.log('等待本地模型加载...');
  const t0 = Date.now();
  let modelReady = false;
  while (Date.now() - t0 < WAIT_MODEL_MS) {
    const m = await page.evaluate(() => window.__ai && window.__ai.model);
    if (m && m.ready) { modelReady = true; console.log('模型 ready:', JSON.stringify(m)); break; }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!modelReady) { console.error('❌ 模型未在超时内 ready'); await browser.close(); srv.close(); process.exit(3); }

  await installBrowserHelpers(page);

  // 按前缀分组，逐组跑（控制浏览器内存：画完一组联系表就释放卡片画布）
  const groups = new Map();
  for (const p of images) {
    const pre = prefixOf(path.basename(p));
    if (!groups.has(pre)) groups.set(pre, []);
    groups.get(pre).push(p);
  }

  const rows = []; // CSV/stdout 行
  for (const [group, imgs] of [...groups.entries()].sort()) {
    console.log(`\n=== 类别 [${group}]：${imgs.length} 张 ===`);
    await page.evaluate(() => window.__clearCards());
    let cardNo = 0;
    for (const img of imgs) {
      const name = path.basename(img);
      process.stdout.write(`  ${name} ... `);
      try {
        const snap = await runImage(page, img);
        if (!snap) { console.log('NO RESULT'); continue; }
        const area = areaPctOf(snap.crop, snap.noCrop);
        const pc = !!snap.proactiveTag;
        const relURL = '/' + path.relative(ROOT, img).split(path.sep).join('/');
        await page.evaluate((meta) => window.__buildCard(meta), {
          name: name, relURL: relURL, crop: snap.crop, noCrop: snap.noCrop,
          scene: snap.scene, area: area, pc: pc, tag: snap.proactiveTag
        });
        rows.push({
          file: name, scene: snap.scene, area: area,
          crop: snap.noCrop ? 'NO_CROP' : '[' + snap.crop.join(',') + ']',
          pc: pc ? 'Y' : 'N', tag: snap.proactiveTag || ''
        });
        console.log(`scene=${snap.scene} area=${area}% crop=${snap.noCrop ? 'noCrop' : '[' + snap.crop.join(',') + ']'} 主动=${pc ? 'Y' : 'N'}${snap.proactiveTag ? ' tag=' + snap.proactiveTag : ''}`);
      } catch (e) {
        console.log('ERROR: ' + e.message);
        rows.push({ file: name, scene: 'ERROR', area: '', crop: '', pc: '', tag: e.message });
      }
      cardNo++;
      // 攒够一页就出一张联系表
      const n = await page.evaluate(() => window.__vcards.length);
      if (n >= PER_SHEET) {
        await flushSheet(page, group, rows, cardNo - n);
      }
    }
    // 收尾：剩余卡片出最后一页
    const n = await page.evaluate(() => window.__vcards.length);
    if (n > 0) await flushSheet(page, group, rows, cardNo - n);
  }

  // ---- stdout 逐图表格 ----
  console.log('\n=== 逐图结果（' + rows.length + ' 行）===');
  console.log(['文件名', 'scene', '保留面积%', 'crop[L,T,R,B]', '主动', 'proactiveTag'].join('\t'));
  for (const r of rows) {
    console.log([r.file, r.scene, r.area, r.crop, r.pc, r.tag].join('\t'));
  }
  // ---- CSV ----
  const csv = ['file,scene,area_pct,crop,proactive,proactiveTag']
    .concat(rows.map(r => [r.file, r.scene, r.area, '"' + r.crop + '"', r.pc, '"' + (r.tag || '').replace(/"/g, "'") + '"'].join(',')))
    .join('\n');
  const csvPath = path.join(OUT_DIR, 'results.csv');
  fs.writeFileSync(csvPath, '﻿' + csv);
  console.log(`\nCSV 已写入: ${path.relative(ROOT, csvPath)}`);

  // ---- 错误汇总 ----
  console.log(`\n=== 监听汇总 ===`);
  console.log('pageerror: ' + pageErrors.length + (pageErrors.length ? ' → ' + pageErrors.slice(0, 5).join(' | ') : ''));
  console.log('console error: ' + consoleErrors.length + (consoleErrors.length ? ' → ' + consoleErrors.slice(0, 5).join(' | ') : ''));

  await browser.close();
  srv.close();
}

async function flushSheet(page, group, rows, startIdx) {
  const dataUrl = await page.evaluate((g, start) => {
    return window.__makeSheet(g, start, '[' + g + '] 主动构图裁切走查  卡片 ' + (start + 1) + '–' + (start + window.__vcards.length));
  }, group, startIdx);
  const png = dataUrl.replace(/^data:image\/png;base64,/, '');
  const fname = `contact-${group}-${String(startIdx + 1).padStart(2, '0')}.png`;
  fs.writeFileSync(path.join(OUT_DIR, fname), Buffer.from(png, 'base64'));
  console.log(`    📄 联系表 → scratch/visual/${fname}（${dataUrl.length} chars dataURL）`);
  await page.evaluate(() => window.__clearCards());
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
