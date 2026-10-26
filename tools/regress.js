#!/usr/bin/env node
/*
 * tools/regress.js — 真实摄影图回归脚本
 *
 * 用法：
 *   node tools/regress.js                  # 跑全部测试图，打印报告
 *   node tools/regress.js --set-baseline   # 跑完全部图后落盘到 tests/baseline/current.json
 *   node tools/regress.js --diff           # 与 tests/baseline/current.json 对比，crop diff≠0 则退出码 1
 *   node tools/regress.js --dir imgs/d25   # 指定图片目录（默认 imgs/d25 + imgs/cloud25）
 *
 * 原理：headless Chrome 加载本地 index.html，等 YOLO 模型 ready，逐张喂图，
 * 从 window.__ai.plan / window.__ai.data 读取 crop 框、场景判定、主体识别、滤镜推荐。
 * crop diff 是硬门：除非本版本显式要改裁切行为，否则两张同图 crop 必须逐元素相等。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.REGRESS_PORT || 8771); // v12.26.0: 支持并行分片回归
const WAIT_MODEL_MS = 40000;   // 等 YOLO ready
const WAIT_ANALYZE_MS = 15000; // 每张图分析兜底（v12.26.0: 25s→15s，首判出现后再等 4s 收最终 plan）
const POLL_MS = 500;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webmanifest': 'application/manifest+json',
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
    .filter(f => /\.(png|jpe?g)$/i.test(f))
    .sort()
    .map(f => path.join(dir, f));
}

function round(v, n = 4) {
  if (typeof v !== 'number' || !isFinite(v)) return v;
  return Number(v.toFixed(n));
}

async function runImage(page, imgPath) {
  // 上传图片
  const input = await page.$('#fileInput');
  await input.uploadFile(imgPath);
  await new Promise(r => setTimeout(r, 1200));
  // 点分析
  await page.evaluate(() => document.getElementById('btnAnalyze').click());
  // 轮询等 plan——必须等 YOLO 检测回调完成（状态栏出现"已自动应用"），
  // 否则读到的是像素初判 plan（sceneType 可能误标 waterscape）
  const deadline = Date.now() + WAIT_ANALYZE_MS;
  let snap = null;
  let sawCrop = false;
  let settleUntil = 0; // v12.26.0: 首次"已自动应用"可能是像素初判，等 YOLO 回写后再读最终 plan
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_MS));
    snap = await page.evaluate(() => {
      const p = window.__ai && window.__ai.plan;
      const d = window.__ai && window.__ai.data;
      if (!p) return null;
      const r4 = v => (typeof v === 'number' && isFinite(v)) ? Number(v.toFixed(4)) : v;
      const statusEl = document.getElementById('statusbar');
      const status = statusEl ? statusEl.textContent : '';
      return {
        plan: {
          rule: p.rule, sceneType: p.sceneType, conf: p.conf,
          subject: p.subject, f: p.f, noCrop: p.noCrop,
          crop: p.crop ? p.crop.map(v => (typeof v === 'number' ? Number(v.toFixed(4)) : v)) : null,
          selfReviewed: p.selfReviewed, cropIntent: p.cropIntent,
          proactiveCrop: p.proactiveCrop || null, proactiveTag: p.proactiveTag || null
        },
        data: d ? {
          detectedClasses: d.detectedClasses,
          isPerson: d.isPerson,
          bodyRatio: r4(d.bodyRatio),
          mean: r4(d.mean),
          sharpness: r4(d.sharpness),
          sym: r4(d.sym),
          modelLoaded: d.modelLoaded
        } : null,
        status: status,
        activeFilter: (() => {
          const el = document.querySelector('.filter-pill.active');
          return el ? el.getAttribute('data-f') : null;
        })()
      };
    });
    if (!snap || !snap.plan || !snap.plan.crop) continue;
    sawCrop = true;
    // 像素结果已出；等模型复核完成（或最多 3.5s）再读最终 plan。
    if (!settleUntil) settleUntil = Date.now() + 3500;
    if (/真AI主体识别完成|AI精修建议|人像保护|已应用云端构图/.test(snap.status)) {
      if (Date.now() >= settleUntil - 2800) break;
    } else if (Date.now() >= settleUntil) break;
  }
  return snap;
}

function diffCrop(a, b) {
  if (!a || !b) return ['missing result'];
  if (a.crop == null && b.crop == null) return [];
  if (a.crop == null || b.crop == null) return ['crop presence mismatch'];
  const diffs = [];
  for (let i = 0; i < 4; i++) {
    if (a.crop[i] !== b.crop[i]) diffs.push(`crop[${i}]: ${a.crop[i]} → ${b.crop[i]}`);
  }
  return diffs;
}

function browserLaunchOptions(){
  const candidates=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
  const found=candidates.find(p=>fs.existsSync(p));
  const opts={headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--enable-unsafe-swiftshader']};
  if(found) opts.executablePath=found;
  return opts;
}

async function main() {
  const args = process.argv.slice(2);
  const setBaseline = args.includes('--set-baseline');
  const diffMode = args.includes('--diff');
  const dirIdx = args.indexOf('--dir');
  const dirs = [];
  if (dirIdx >= 0) dirs.push(args[dirIdx + 1]);
  if (dirs.length === 0) {
    dirs.push(path.join(ROOT, 'imgs/d25'));
    dirs.push(path.join(ROOT, 'imgs/regression'));
  }

  const images = [];
  for (const d of dirs) images.push(...listImages(d));
  if (images.length === 0) { console.error('没有测试图'); process.exit(2); }

  console.log(`=== 回归开始：${images.length} 张图 ===`);
  const srv = await startServer();
  const browser = await puppeteer.launch(browserLaunchOptions());
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  // v12.29.0：回归显式请求本地模型（普通用户默认不下载），并跳过新手引导。
  await page.evaluateOnNewDocument(() => {
    try{
      localStorage.setItem('aiModelEnabled','1');
      localStorage.setItem('aiForceModel','1');
      localStorage.setItem('aiComposeOnboarded_v76','1');
    }catch(e){}
  });

  // 等模型 ready
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
  console.log('等待 YOLO 模型加载...');
  const t0 = Date.now();
  while (Date.now() - t0 < WAIT_MODEL_MS) {
    const m = await page.evaluate(() => window.__ai && window.__ai.model);
    if (m && m.ready) { console.log('模型 ready:', JSON.stringify(m)); break; }
    await new Promise(r => setTimeout(r, 1000));
  }

  const results = {};
  for (const img of images) {
    const name = path.basename(img);
    process.stdout.write(`  ${name} ... `);
    try {
      const r = await runImage(page, img);
      results[name] = r;
      if (r && r.plan) {
        console.log(`crop=[${r.plan.crop}] scene=${r.plan.sceneType} conf=${r.plan.conf}% person=${r.data ? r.data.isPerson : '?'} f=${r.activeFilter || '-'} pc=${r.plan.proactiveCrop ? 'Y' : 'N'}`);
      } else {
        console.log('NO RESULT');
      }
    } catch (e) {
      results[name] = { error: e.message };
      console.log('ERROR: ' + e.message);
    }
  }

  await browser.close();
  srv.close();

  // 对比模式
  const baselinePath = path.join(ROOT, 'tests/baseline/current.json');
  if (diffMode && fs.existsSync(baselinePath)) {
    const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    let cropDiffs = 0;
    console.log('\n=== CROP DIFF 对比 ===');
    for (const name of Object.keys(results)) {
      const old = base[name];
      if (!old) { console.log(`  [新增] ${name}`); continue; }
      const d = diffCrop(old.plan, results[name].plan);
      if (d.length) {
        cropDiffs++;
        console.log(`  [DIFF] ${name}: ${d.join('; ')}`);
      }
    }
    for (const name of Object.keys(base)) {
      if (!results[name]) console.log(`  [缺失] ${name}`);
    }
    if (cropDiffs === 0) console.log('✅ crop diff = 0（全部通过）');
    else { console.error(`❌ crop diff = ${cropDiffs}（不通过）`); process.exit(1); }
  }

  if (setBaseline) {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(results, null, 2));
    console.log(`\n✅ baseline 已写入 ${path.relative(ROOT, baselinePath)}`);
  } else if (!diffMode) {
    console.log('\n=== 结果摘要（不落盘，加 --set-baseline 保存）===');
    console.log(JSON.stringify(results, null, 2).slice(0, 2000));
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
