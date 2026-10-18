#!/usr/bin/env node
/*
 * tools/cloud-regress.js — 云端真实链路回归（驱动真实 app，开启云端开关）
 * 用法：CLOUD_TOKEN=xxx node tools/cloud-regress.js [目录]
 * 逐张喂图，等待云端分析完成，读 plan.crop / cropIntent / scene / cloud 标记。
 */
'use strict';
const http=require('http'); const fs=require('fs'); const path=require('path');
const puppeteer=require('puppeteer');
const ROOT=path.join(__dirname,'..'); const PORT=8776;
const TOKEN=process.env.CLOUD_TOKEN;
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.onnx':'application/octet-stream'};
const srv=http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const fp=path.join(ROOT,p); if(!fs.existsSync(fp)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'}); fs.createReadStream(fp).pipe(res); });
function listImgs(d){ return fs.readdirSync(d).filter(f=>/\.(png|jpe?g)$/i.test(f)).sort().map(f=>path.join(d,f)); }
(async()=>{
  const dir=process.argv[2]||path.join(ROOT,'imgs/d25');
  const imgs=listImgs(dir);
  if(!TOKEN){ console.error('需要 CLOUD_TOKEN'); process.exit(2); }
  await new Promise(r=>srv.listen(PORT,r));
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader']});
  const page=await b.newPage(); await page.setViewport({width:390,height:844});
  // 先打开页面再注入 localStorage（需同源）
  await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.evaluate((tk)=>{
    localStorage.setItem('aiComposeCloudOn','1');
    localStorage.setItem('aiComposeCloudKey',tk);
    localStorage.setItem('aiComposeCloudBase','https://1334762369-i3x3zem36d.ap-guangzhou.tencentscf.com');
  },TOKEN);
  await page.reload({waitUntil:'domcontentloaded'});
  await new Promise(r=>setTimeout(r,3000));
  const t0=Date.now();
  while(Date.now()-t0<40000){ const m=await page.evaluate(()=>window.__ai&&window.__ai.model); if(m&&m.ready)break; await new Promise(r=>setTimeout(r,1000)); }
  console.log('模型 ready，云端已开启，开始测',imgs.length,'张');
  for(const img of imgs){
    const input=await page.$('#fileInput'); await input.uploadFile(img); await new Promise(r=>setTimeout(r,1500));
    await page.evaluate(()=>document.getElementById('btnAnalyze').click());
    // 云端较慢，等 35s 内出现"云端"或"分析完成"
    let snap=null; const dl=Date.now()+40000;
    while(Date.now()<dl){
      await new Promise(r=>setTimeout(r,800));
      snap=await page.evaluate(()=>{
        const p=window.__ai&&window.__ai.plan; const sb=document.getElementById('statusbar'); const tg=document.getElementById('aiRuleTag');
        if(!p) return null;
        const st=sb?sb.textContent:'';
        const tag=tg?tg.textContent:'';
        // 云/本地标记以规则标签为准（☁️ 云端 / 📷 本地）；调试钩子 plan 不暴露 cloud 字段
        return {crop:p.crop,scene:p.sceneType,rule:p.rule,conf:p.conf,
          intent:(p.aiIntent&&p.aiIntent.intentName)||p.cropIntent||'',
          tag:tag, cloud:(tag.indexOf('☁️')>=0), noCrop:!!p.noCrop, status:st};
      });
      // 自动应用落定后即结束（tag 已带 ☁️/📷）
      if(snap&&/已自动应用/.test(snap.status)&&(snap.tag.indexOf('☁️')>=0||snap.tag.indexOf('📷')>=0)) break;
    }
    const name=path.basename(img);
    if(snap) console.log(`${name} | ${snap.cloud?'CLOUD':'local'} scene=${snap.scene} rule=${snap.rule} crop=[${snap.crop}] noCrop=${snap.noCrop} | ${snap.tag.slice(0,30)} | ${snap.status.slice(0,30)}`);
    else console.log(`${name} | NO RESULT`);
  }
  await b.close(); srv.close();
})();
