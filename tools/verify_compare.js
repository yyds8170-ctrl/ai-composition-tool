#!/usr/bin/env node
/*
 * tools/verify_compare.js — 对比滑块 puppeteer 实测验收（v12.1.0 固化脚本）
 *
 * 验收目标：AI 裁切完成后点「对比」，拖动分割线 cmpX=20% / 80% 时，
 *          photoView 区域两帧 PNG 像素必须不同（md5 不同）。
 *          —— 防止回归 v12.0.0 修过的 bug：cmpBase 错挂裁切后图，两层同像素，拖动无反应。
 *
 * 用法：node tools/verify_compare.js [图片文件名]
 * 退出码：0=PASS  1=FAIL
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..');
const PORT = 8771; // 与 regress.js 同款端口
const WAIT_MODEL_MS = 40000;
const WAIT_ANALYZE_MS = 40000;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm', '.onnx': 'application/octet-stream'
};

function startServer() {
  return new Promise((resolve, reject) => {
    const handler = (req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const fp = path.join(ROOT, p);
      if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    };
    const srv = http.createServer(handler);
    // 优先 regress.js 同款 8771；被占用（如回归仍在跑）则自动找空闲端口
    srv.listen(PORT, () => resolve({ srv, port: PORT }));
    srv.on('error', e => {
      if (e.code === 'EADDRINUSE') {
        const alt = http.createServer(handler);
        alt.listen(0, () => resolve({ srv: alt, port: alt.address().port }));
        alt.on('error', reject);
      } else { reject(e); }
    });
  });
}

const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function setCmpX(page, pct) {
  // cmpX 是闭包内变量，无法直接赋值——直接在 cmpHandle 上派发合成 PointerEvent
  // 驱动真实监听器（pointerdown→pointermove→pointerup），与用户手势同代码路径。
  await page.evaluate((pct) => {
    var h = document.getElementById('cmpHandle');
    var stage = document.getElementById('stage');
    var r = stage.getBoundingClientRect();
    var x = r.left + r.width * pct / 100;
    h.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true, clientX: x, clientY: r.top + r.height / 2 }));
    h.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, bubbles: true, clientX: x, clientY: r.top + r.height / 2 }));
    h.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true, clientX: x, clientY: r.top + r.height / 2 }));
  }, pct);
  await sleep(350); // 等 clip-path / 分割线渲染稳定（updateCmp 在 rAF 里）
  return await page.evaluate(() => {
    var pv = document.getElementById('photoView');
    return pv ? pv.style.getPropertyValue('--cmpPos') : null;
  });
}

async function shootPhotoView(page) {
  const pv = await page.$('#photoView');
  return pv.screenshot({ type: 'png' });
}

async function main() {
  const imgName = process.argv[2] || 'backlit_11.jpg';
  const imgPath = path.join(ROOT, 'imgs/regression', imgName);
  if (!fs.existsSync(imgPath)) { console.error('FAIL: 测试图不存在 ' + imgPath); process.exit(1); }

  console.log('=== 对比滑块 puppeteer 验收 ===');
  console.log('测试图:', imgName);
  const { srv, port } = await startServer();
  console.log('本地服务端口:', port);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader']
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });

    // 等模型 ready
    const t0 = Date.now();
    while (Date.now() - t0 < WAIT_MODEL_MS) {
      const m = await page.evaluate(() => window.__ai && window.__ai.model);
      if (m && m.ready) break;
      await sleep(1000);
    }
    console.log('模型就绪，上传图片…');

    // 上传 + 触发分析
    const input = await page.$('#fileInput');
    await input.uploadFile(imgPath);
    await sleep(2000);
    await page.evaluate(() => document.getElementById('btnAnalyze').click());

    // 等裁切结果（plan.crop 出现 + 状态栏"已自动应用"）
    let got = null;
    const deadline = Date.now() + WAIT_ANALYZE_MS;
    while (Date.now() < deadline) {
      await sleep(500);
      got = await page.evaluate(() => {
        const p = window.__ai && window.__ai.plan;
        const st = document.getElementById('statusbar');
        return p && p.crop ? { crop: p.crop, status: st ? st.textContent : '' } : null;
      });
      if (got && got.status && got.status.indexOf('已自动应用') >= 0) break;
    }
    if (!got) { console.error('FAIL: 等待裁切结果超时'); process.exit(1); }
    console.log('裁切结果 crop =', JSON.stringify(got.crop));

    // 点对比按钮
    await page.evaluate(() => document.getElementById('btnCmp').click());
    await sleep(600);
    const cmpOn = await page.evaluate(() => {
      const cb = document.getElementById('cmpBase');
      const pv = document.getElementById('photoView');
      return {
        cmpBaseDisplay: cb ? getComputedStyle(cb).display : '?',
        cmpBaseSrc: cb ? (cb.src || '').slice(-60) : '?',
        pvClip: pv ? getComputedStyle(pv).clipPath : '?'
      };
    });
    console.log('对比开启:', JSON.stringify(cmpOn));

    // cmpX=20% 截图
    const pos20 = await setCmpX(page, 20);
    const shot20 = await shootPhotoView(page);
    // cmpX=80% 截图
    const pos80 = await setCmpX(page, 80);
    const shot80 = await shootPhotoView(page);
    console.log('cmpPos readback: 20%→', pos20, ' 80%→', pos80);

    const h20 = md5(shot20), h80 = md5(shot80);
    console.log('frame@20% md5 =', h20);
    console.log('frame@80% md5 =', h80);

    if (h20 === h80) {
      // 两帧相同 → 排查 cmpBase / clip-path
      const diag = await page.evaluate(() => {
        const cb = document.getElementById('cmpBase');
        const pv = document.getElementById('photoView');
        return {
          cmpBaseSrc: cb ? cb.src : null,
          origURL: (typeof state !== 'undefined' && state.origURL) ? String(state.origURL).slice(-60) : 'n/a',
          pvClass: pv ? pv.className : '?',
          pvClipPath: pv ? getComputedStyle(pv).clipPath : '?',
          cmpPos: pv ? pv.style.getPropertyValue('--cmpPos') : '?'
        };
      });
      console.error('FAIL: 两帧 PNG 像素相同 —— 排查诊断：');
      console.error(JSON.stringify(diag, null, 2));
      console.error('可能原因：cmpBase.src 与 photoView 同源；photoView clip-path 未随 cmpX 变化');
      process.exit(1);
    }
    console.log('PASS: cmpX=20% vs 80% 两帧像素不同，对比滑块正常工作');
  } finally {
    await browser.close();
    srv.close();
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
