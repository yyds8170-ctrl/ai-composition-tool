#!/usr/bin/env node
/*
 * tools/qa-walkthrough.js — 390×844 移动端走查
 * 检查：主界面/帮助设置面板截图、横向溢出、按钮越界、按钮过小、换行错乱、控制台错误。
 * 用法：node tools/qa-walkthrough.js [截图输出目录]
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..');
const PORT = 8785;
const OUT = process.argv[2] || path.join(ROOT, 'qa');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream', '.tflite': 'application/octet-stream',
  '.binarypb': 'application/octet-stream', '.data': 'application/octet-stream'
};

function server() {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const fp = path.join(ROOT, p);
    if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = server();
  await new Promise(r => srv.listen(PORT, r));
  const b = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader']
  });
  const page = await b.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 160)); });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message.slice(0, 160)));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2500));
  // 首次运行会弹新手引导，先跳过，避免挡住主界面巡检
  await page.evaluate(() => { const s = document.getElementById('_obSkip'); if (s) s.click(); });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, '01-main-390x844.png') });

  // 打开帮助/设置，滚到云端分析区
  await page.evaluate(() => {
    const btn = document.getElementById('btnHelp');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 700));
  await page.evaluate(() => {
    const el = document.getElementById('cloudBadge');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, '02-cloud-settings-390x844.png') });

  const audit = await page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const docOverflow = document.documentElement.scrollWidth > vw + 1;
    const bad = [];
    const visible = el => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (s.display === 'none' || s.visibility === 'hidden' || r.width <= 0 || r.height <= 0) return false;
      // 完全在右侧屏幕外的抽屉/关闭面板不算"可见 UI"
      if (r.left > vw * 1.2) return false;
      return true;
    };
    const inScrollableRow = el => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (/(auto|scroll)/.test(s.overflowX)) return true;
        p = p.parentElement;
      }
      return false;
    };
    document.querySelectorAll('button,.btn,input,select').forEach(el => {
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      // 横向滑动行里的按钮允许部分在屏外（可滑动到达），只检查非滑动行
      if (!inScrollableRow(el) && (r.left < -1 || r.right > vw + 1)) bad.push({ tag: el.tagName, id: el.id || '', cls: el.className || '', issue: '越界', left: Math.round(r.left), right: Math.round(r.right) });
      if (el.tagName === 'BUTTON' && r.height < 28) bad.push({ tag: el.tagName, id: el.id || '', cls: el.className || '', issue: '过小', h: Math.round(r.height) });
    });
    const wraps = [];
    document.querySelectorAll('.main-row,.act-row,.ctrl-row').forEach(el => {
      if (!visible(el)) return;
      const s = getComputedStyle(el);
      if (s.flexWrap === 'wrap' && el.scrollWidth > el.clientWidth + 2) wraps.push(el.className + ' overflow+wrap');
    });
    return { vw, vh, docOverflow, bad, wraps };
  });

  console.log('=== 390×844 走查 ===');
  console.log('横向溢出:', audit.docOverflow ? '⚠️ 有' : '无');
  console.log('按钮/输入框越界或过小:', audit.bad.length ? JSON.stringify(audit.bad, null, 2) : '无');
  console.log('异常换行:', audit.wraps.length ? audit.wraps.join('\n') : '无');
  console.log('控制台错误:', errors.length ? errors.join('\n') : '无');
  console.log('截图:', OUT);
  await b.close();
  srv.close();
})().catch(e => { console.error(e); process.exit(1); });
