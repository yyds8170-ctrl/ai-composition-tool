#!/usr/bin/env node
/*
 * tools/verify_stacking.js — 对比滑块叠层真实验收（不依赖模型）
 *
 * 直接在页面里把：
 *   photoView(效果层) 设为纯红 dataURL
 *   cmpBase(原图层)   设为纯蓝 dataURL
 * 然后开启对比态，在同一竖条 x=25% 处分别取 cmpPos=20% 和 80% 的截图：
 *   - 若叠层正确（效果层在上、原图层在下，clip 露原图）：
 *       cmpPos=20% 时 x=25% 在分割线右侧 → 红(效果)
 *       cmpPos=80% 时 x=25% 在分割线左侧 → 蓝(原图)
 *       两帧 md5 不同。
 *   - 若原图层盖住效果层（旧 bug）：两处都是蓝，md5 相同 → FAIL。
 *
 * 退出码 0=PASS 1=FAIL
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const md5 = b => crypto.createHash('md5').update(b).digest('hex');

function startServer() {
  return new Promise((resolve, reject) => {
    const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg' };
    const handler = (req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const fp = path.join(ROOT, p);
      if (!fs.existsSync(fp)) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    };
    const srv = http.createServer(handler);
    srv.listen(8771, () => resolve({ srv, port: 8771 }));
    srv.on('error', e => {
      if (e.code === 'EADDRINUSE') {
        const alt = http.createServer(handler);
        alt.listen(0, () => resolve({ srv: alt, port: alt.address().port }));
      } else reject(e);
    });
  });
}

// 1x1 纯色 dataURL
function solid(r,g,b){
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='.replace('iVBOR','iVBOR');
}
// 用 canvas 生成指定颜色 dataURL（在页面里做，避免手拼 base64）
async function main(){
  const { srv, port } = await startServer();
  console.log('服务端口', port);
  const cands=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
  const exe=cands.find(p=>fs.existsSync(p));
  const launch={headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--enable-unsafe-swiftshader']};
  if(exe) launch.executablePath=exe;
  const browser = await puppeteer.launch(launch);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width:390, height:844 });
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil:'domcontentloaded', timeout:30000 });
    await sleep(800);

    // 在页面里：生成红/蓝 dataURL，设置两层，开对比态
    await page.evaluate(() => {
      function solidDataUrl(r,g,b){
        const c = document.createElement('canvas'); c.width = c.height = 8;
        const ctx = c.getContext('2d'); ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(0,0,8,8);
        return c.toDataURL('image/png');
      }
      const red = solidDataUrl(220, 30, 30);   // 效果层
      const blue = solidDataUrl(30, 80, 220);   // 原图层
      const pv = document.getElementById('photoView');
      const cb = document.getElementById('cmpBase');
      pv.src = red; pv.classList.add('show'); pv.style.filter = 'none'; pv.style.transform = 'none';
      cb.src = blue;
      const stage = document.getElementById('stage');
      stage.classList.add('cmp-active');
      pv.classList.add('cmp-clip');
      const ui = document.getElementById('cmpUI'); if (ui) ui.style.display = 'block';
      window.__setCmp = (pct) => {
        pv.style.setProperty('--cmpPos', pct + '%');
        cb.style.setProperty('--cmpPos', pct + '%');
        if (ui) ui.style.setProperty('--cmpPos', pct + '%');
      };
    });

    const stage = await page.$('#stage');
    const box = await stage.boundingBox();
    // 竖条：x 占舞台 22%~28%（即中心 25%），高取中间一带
    const clipX = box.x + box.width * 0.22;
    const clipW = box.width * 0.06;
    const clipY = box.y + box.height * 0.4;
    const clipH = box.height * 0.2;

    async function grab(pct){
      await page.evaluate((p)=>window.__setCmp(p), pct);
      await sleep(300);
      const buf = await page.screenshot({ clip:{ x:clipX, y:clipY, width:clipW, height:clipH } });
      return md5(buf);
    }
    const m20 = await grab(20);
    const m80 = await grab(80);
    console.log('cmpPos=20% 竖条 md5:', m20);
    console.log('cmpPos=80% 竖条 md5:', m80);
    if (m20 !== m80) {
      console.log('PASS：同一位置在分割线移动后画面变化（叠层正确，效果层在上、原图层在下）');
      process.exit(0);
    } else {
      console.log('FAIL：同一位置在分割线移动后画面无变化（原图层仍盖住效果层）');
      process.exit(1);
    }
  } finally { await browser.close(); srv.close(); }
}
main().catch(e=>{ console.error('ERR', e); process.exit(1); });
