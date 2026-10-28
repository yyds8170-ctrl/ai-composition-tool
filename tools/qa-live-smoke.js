/* 发布后线上冒烟：真机视口打开 GitHub Pages，走一遍"上传→分析→落地"，确认线上构建可用。
 * 用法：node tools/qa-live-smoke.js [图片路径]
 * 注意：不注入任何口令，只测默认（纯本地）链路——线上是公开站点，绝不在这里填 Key。
 */
'use strict';
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const chromePath = require('./chrome-path');
const URL = 'https://yyds8170-ctrl.github.io/ai-composition-tool/index.html';
const IMG = process.argv[2] || path.join(__dirname, '..', 'imgs', 'picsum', 'p020.jpg');

(async () => {
  if (!fs.existsSync(IMG)) { console.error('找不到测试图：' + IMG); process.exit(2); }
  const b = await puppeteer.launch(chromePath.launch());
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 160)));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Chromium 的自动播放策略：页面未获得用户手势时 navigator.vibrate 会被拦截并记一条 console error。
    // 这是浏览器策略提示，不是功能失败（更新条出现时本来就没有“用户刚点过”这个前提）。
    if (/navigator\.vibrate|user hasn't tapped/i.test(t)) return;
    errs.push('console: ' + t.slice(0, 160));
  });
  const badResp = [];
  p.on('response', r => { if (r.status() >= 400) badResp.push(r.status() + ' ' + r.url().slice(0, 90)); });
  console.log('打开线上站点…');
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise(r => setTimeout(r, 2500));
  const ver = await p.evaluate(() => (typeof APP_VER !== 'undefined' ? APP_VER : (window.APP_VER || '未知')));
  console.log('线上 APP_VER =', ver);
  // 关掉可能残留的云端开关，只测公开默认链路
  await p.evaluate(() => { try { localStorage.setItem('aiComposeCloudOn', '0'); localStorage.setItem('aiComposeOnboarded_v76', '1'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  const input = await p.$('#fileInput');
  if (!input) { console.log('✗ 找不到 #fileInput'); await b.close(); process.exit(1); }
  await input.uploadFile(IMG);
  await new Promise(r => setTimeout(r, 2500));
  await p.evaluate(() => document.getElementById('btnAnalyze').click());
  let plan = null;
  const dl = Date.now() + 60000;
  while (Date.now() < dl) {
    plan = await p.evaluate(() => {
      const t = window.__ai && window.__ai.plan;
      const sb = document.getElementById('statusbar');
      return t ? { crop: t.crop, scene: t.sceneType, rule: t.rule, conf: t.conf, noCrop: !!t.noCrop, cand: t.candCount, status: sb ? sb.textContent.slice(0, 60) : '' } : null;
    });
    if (plan && plan.status && /已应用|完成|A级|B级|构图/.test(plan.status)) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('分析结果：', JSON.stringify(plan));
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log('横向溢出像素：', overflow);
  console.log(errs.length ? '✗ 错误：\n  ' + errs.join('\n  ') : '✓ 无 pageerror / console error');
  console.log(badResp.length ? '✗ 4xx/5xx：\n  ' + badResp.join('\n  ') : '✓ 无 4xx/5xx 资源');
  await b.close();
  const ok = !errs.length && !badResp.length && plan && plan.status;
  console.log(ok ? '\n=== 线上冒烟 PASS ===' : '\n=== 线上冒烟 FAIL ===');
  process.exitCode = ok ? 0 : 1;
})();
