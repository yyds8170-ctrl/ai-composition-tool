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
function launchOpts(){
  const c=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
  const p=c.find(x=>fs.existsSync(x)); const o={headless:'new',args:['--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader']};
  if(p)o.executablePath=p; return o;
}
async function runBatch(imgs, batchIdx){
  const b=await puppeteer.launch(launchOpts());
  const page=await b.newPage(); await page.setViewport({width:390,height:844});
  await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.evaluate((tk)=>{
    localStorage.setItem('aiComposeCloudOn','1');
    localStorage.setItem('aiComposeCloudKey',tk);
    localStorage.setItem('aiComposeCloudBase','https://1334762369-i3x3zem36d.ap-guangzhou.tencentscf.com');
    localStorage.setItem('aiModelEnabled','1');
    localStorage.setItem('aiForceModel','1');
    localStorage.setItem('aiComposeOnboarded_v76','1');
  },TOKEN);
  await page.reload({waitUntil:'domcontentloaded'});
  await new Promise(r=>setTimeout(r,1500));
  const _tm=Date.now();
  while(Date.now()-_tm<40000){ const m=await page.evaluate(()=>window.__ai&&window.__ai.model); if(m&&m.ready) break; await new Promise(r=>setTimeout(r,800)); }
  await new Promise(r=>setTimeout(r,500));
  const results=[];
  for(const img of imgs){
    const input=await page.$('#fileInput'); await input.uploadFile(img); await new Promise(r=>setTimeout(r,1500));
    await page.evaluate(()=>document.getElementById('btnAnalyze').click());
    // v12.29.0：像素构图先自动应用；云端返回后出现「云端建议」卡/☁️ 标签即算完成。
    let snap=null; const dl=Date.now()+75000;
    while(Date.now()<dl){
      await new Promise(r=>setTimeout(r,800));
      snap=await page.evaluate(()=>{
        const p=window.__ai&&window.__ai.plan; const cp=window.__ai&&window.__ai.cloudPlan; const sb=document.getElementById('statusbar'); const tg=document.getElementById('aiRuleTag');
        if(!p) return null;
        const st=sb?sb.textContent:''; const tag=tg?tg.textContent:'';
        return {crop:p.crop,scene:p.sceneType,rule:p.rule,conf:p.conf,
          intent:(p.aiIntent&&p.aiIntent.intentName)||p.cropIntent||'',
          tag:tag, cloud:(tag.indexOf('☁️')>=0), noCrop:!!p.noCrop, status:st,
          cp:cp?{crop:cp.crop,scene:cp.sceneType,rule:cp.rule,conf:cp.conf,noCrop:cp.noCrop,intent:cp.cropIntent||''}:null,
          card:!!document.getElementById('cloudUpgradeApply')};
      });
      if(snap&&snap.cp) break;
      if(snap&&/云端建议已返回|云端与本地构图一致|已应用云端构图|已应用云端AI|云端AI确认|云端已复核|人像保护/.test(snap.status)) break;
      if(snap&&/已自动应用/.test(snap.status)&&snap.cloud) break;
    }
    // 云端候选已返回：等自动应用/建议卡稳定后再读最终 plan。
    if(snap&&snap.cp && !snap.card){
      await new Promise(r=>setTimeout(r,900));
      const _snap2=await page.evaluate(()=>{
        const p=window.__ai&&window.__ai.plan; const cp=window.__ai&&window.__ai.cloudPlan; const sb=document.getElementById('statusbar'); const tg=document.getElementById('aiRuleTag');
        if(!p) return null; const st=sb?sb.textContent:''; const tag=tg?tg.textContent:'';
        return {crop:p.crop,scene:p.sceneType,rule:p.rule,conf:p.conf,intent:(p.aiIntent&&p.aiIntent.intentName)||p.cropIntent||'',
          tag:tag, cloud:(tag.indexOf('☁️')>=0), noCrop:!!p.noCrop, status:st, card:false,
          cp:cp?{crop:cp.crop,scene:cp.sceneType,rule:cp.rule,conf:cp.conf,noCrop:cp.noCrop,intent:cp.cropIntent||''}:null};
      });
      if(_snap2) snap=_snap2;
    }
    // v12.29.0：云端返回后点“应用云端构图”，让回归读取真正的云端裁切结果（而不是本地已落地的那一版）。
    if(snap&&snap.card){
      try{ await page.evaluate(()=>{const b=document.getElementById('cloudUpgradeApply');if(b)b.click();}); }catch(e){}
      await new Promise(r=>setTimeout(r,900));
      snap=await page.evaluate(()=>{
        const p=window.__ai&&window.__ai.plan; const cp=window.__ai&&window.__ai.cloudPlan; const sb=document.getElementById('statusbar'); const tg=document.getElementById('aiRuleTag');
        if(!p) return null; const st=sb?sb.textContent:''; const tag=tg?tg.textContent:'';
        return {crop:p.crop,scene:p.sceneType,rule:p.rule,conf:p.conf,intent:(p.aiIntent&&p.aiIntent.intentName)||p.cropIntent||'',
          tag:tag, cloud:(tag.indexOf('☁️')>=0), noCrop:!!p.noCrop, status:st, card:false,
          cp:cp?{crop:cp.crop,scene:cp.sceneType,rule:cp.rule,conf:cp.conf,noCrop:cp.noCrop,intent:cp.cropIntent||''}:null};
      });
    }
    const name=path.basename(img);
    if(snap){ const cc=snap.cp||snap; console.log(`${name} | ${snap.cloud?'CLOUD':'local'} scene=${cc.scene} rule=${cc.rule} cloudCrop=[${cc.crop}] cloudNoCrop=${cc.noCrop} localCrop=[${snap.crop}] | ${snap.tag.slice(0,30)} | ${snap.status.slice(0,34)}`); results.push({name,snap}); }
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
