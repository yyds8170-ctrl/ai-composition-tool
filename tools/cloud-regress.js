#!/usr/bin/env node
/*
 * tools/cloud-regress.js — 云端真实链路回归（驱动真实 app，开启云端开关）
 * 用法：CLOUD_TOKEN=xxx node tools/cloud-regress.js [目录]
 * v12.3.0: 每批 ≤BATCH 张重启浏览器，避免 3.9GB VM OOM。结果合并输出。
 */
'use strict';
const http=require('http'); const fs=require('fs'); const path=require('path');
const puppeteer=require('puppeteer');
const ROOT=path.join(__dirname,'..'); const PORT=Number(process.env.CLOUD_REGRESS_PORT||8776); const BATCH=40;
const TOKEN=process.env.CLOUD_TOKEN;
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.onnx':'application/octet-stream'};
const srv=http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const fp=path.join(ROOT,p); if(!fs.existsSync(fp)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'}); fs.createReadStream(fp).pipe(res); });
function listImgs(d){ return fs.readdirSync(d).filter(f=>/\.(png|jpe?g)$/i.test(f)).sort().map(f=>path.join(d,f)); }
async function runBatch(imgs, batchIdx){
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader']});
  const page=await b.newPage(); await page.setViewport({width:390,height:844});
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
  const results=[];
  for(const img of imgs){
    const input=await page.$('#fileInput'); await input.uploadFile(img); await new Promise(r=>setTimeout(r,1500));
    await page.evaluate(()=>document.getElementById('btnAnalyze').click());
    // v12.26.0: 只在"已自动应用 + ☁️ 云端"时提前结束；本地结果不再算完成，
    // 否则会在云端返回前把像素初判记成 local，云端回归失真。最多等 35s（云端窗口 30s）。
    let snap=null; const dl=Date.now()+60000;
    while(Date.now()<dl){
      await new Promise(r=>setTimeout(r,800));
      snap=await page.evaluate(()=>{
        const p=window.__ai&&window.__ai.plan; const sb=document.getElementById('statusbar'); const tg=document.getElementById('aiRuleTag');
        if(!p) return null;
        const st=sb?sb.textContent:'';
        const tag=tg?tg.textContent:'';
        return {crop:p.crop,scene:p.sceneType,rule:p.rule,conf:p.conf,
          intent:(p.aiIntent&&p.aiIntent.intentName)||p.cropIntent||'',
          tag:tag, cloud:(tag.indexOf('☁️')>=0), noCrop:!!p.noCrop, status:st};
      });
      if(snap&&/已自动应用/.test(snap.status)&&snap.cloud) break;
    }
    const name=path.basename(img);
    if(snap){ console.log(`${name} | ${snap.cloud?'CLOUD':'local'} scene=${snap.scene} rule=${snap.rule} crop=[${snap.crop}] noCrop=${snap.noCrop} | ${snap.tag.slice(0,30)} | ${snap.status.slice(0,30)}`); results.push({name,snap}); }
    else { console.log(`${name} | NO RESULT`); results.push({name,snap:null}); }
  }
  await b.close();
  return results;
}
(async()=>{
  const dir=process.argv[2]||path.join(ROOT,'imgs/d25');
  let imgs=listImgs(dir);
  // 排除 extra/ 子目录（如果有）
  imgs=imgs.filter(f=>!f.includes('/extra/'));
  if(!TOKEN){ console.error('需要 CLOUD_TOKEN'); process.exit(2); }
  await new Promise(r=>srv.listen(PORT,r));
  console.log('共',imgs.length,'张，分',Math.ceil(imgs.length/BATCH),'批（每批',BATCH,'张）');
  const all=[];
  for(let i=0;i<imgs.length;i+=BATCH){
    const batch=imgs.slice(i,i+BATCH);
    const idx=Math.floor(i/BATCH)+1;
    console.log(`\n=== 批 ${idx}: ${batch.length} 张 ===`);
    const r=await runBatch(batch,idx);
    all.push(...r);
    await new Promise(r=>setTimeout(r,2000)); // 浏览器退出后喘息
  }
  // 分歧汇总
  const cloudOnly=all.filter(x=>x.snap&&x.snap.cloud&&x.snap.noCrop===false);
  const localOnly=all.filter(x=>x.snap&&!x.snap.cloud&&x.snap.noCrop===false);
  console.log(`\n=== 汇总：${all.length} 张 | 云端裁切 ${cloudOnly.length} | 本地裁切 ${localOnly.length} | 无结果 ${all.filter(x=>!x.snap).length} ===`);
  srv.close();
})();
