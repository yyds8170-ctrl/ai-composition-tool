#!/usr/bin/env node
'use strict';
// 调试：dump 风景图的边缘能量/RoD 条带指标/对称度，用于校准 _landscapeCrop 阈值
const http = require('http'); const fs = require('fs'); const path = require('path');
const puppeteer = require('puppeteer');
const ROOT = path.join(__dirname, '..'); const PORT = 8774;
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.onnx':'application/octet-stream' };
const srv = http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const fp=path.join(ROOT,p); if(!fs.existsSync(fp)){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'}); fs.createReadStream(fp).pipe(res); });
function avg(arr,from,to){ let s=0,c=0; for(let i=from;i<to;i++){s+=arr[i];c++;} return c?s/c:0; }
(async()=>{
  const imgs = process.argv.slice(2);
  await new Promise(r=>srv.listen(PORT,r));
  const b = await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader']});
  const page = await b.newPage(); await page.setViewport({width:390,height:844});
  console.log('navigating...'); await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'domcontentloaded',timeout:60000}); console.log('loaded');
  const t0=Date.now(); while(Date.now()-t0<40000){ const m=await page.evaluate(()=>window.__ai&&window.__ai.model); if(m&&m.ready){console.log('model ready');break;} await new Promise(r=>setTimeout(r,1000)); }
  for(const img of imgs){
    const input=await page.$('#fileInput'); await input.uploadFile(img); await new Promise(r=>setTimeout(r,1500));
    await page.evaluate(()=>document.getElementById('btnAnalyze').click());
    let d=null; const dl=Date.now()+25000;
    while(Date.now()<dl){ await new Promise(r=>setTimeout(r,500)); const st=await page.evaluate(()=>{const s=document.getElementById('statusbar');return s?s.textContent:'';}); if(st.indexOf('已自动应用')>=0){ d=await page.evaluate(()=>({a:window.__ai.data,p:window.__ai.plan})); break; } }
    if(!d) continue;
    const a=d.a, p=d.p;
    const e=a.edgeEnergy, rod=a.rod;
    const col=e.col, row=e.row, W=e.w, H=e.h;
    // 边缘能量条带
    const cL=avg(col,Math.floor(.30*W),Math.floor(.70*W)), cT=avg(row,Math.floor(.30*H),Math.floor(.70*H));
    const eL=avg(col,0,Math.floor(.16*W)), eR=avg(col,Math.floor(.84*W),W);
    const eT=avg(row,0,Math.floor(.16*H)), eB=avg(row,Math.floor(.84*H),H);
    // RoD 条带显著性与方差（上下 16%）
    function rodStat(y0,y1){ const n=(y1-y0)*W; const sL=rod.rL[y1]-rod.rL[y0],sL2=rod.rL2[y1]-rod.rL2[y0],sS=rod.rS[y1]-rod.rS[y0],sSa=rod.rSat[y1]-rod.rSat[y0]; const gN=W*H,gmS=rod.rS[H]/gN; return {mS:+(sS/n).toFixed(3),gmS:+gmS.toFixed(3),varL:Math.round(Math.max(0,sL2/n-(sL/n)**2)),sat:+(sSa/n).toFixed(3),lum:+((sL/n)/255).toFixed(2)}; }
    const topRod=rodStat(0,Math.round(.16*H)), botRod=rodStat(Math.round(.84*H),H);
    function colStat(x0,x1){ const n=H*(x1-x0); const sSa=rod.cSat[x1]-rod.cSat[x0], sS=rod.cS[x1]-rod.cS[x0]; const gN=W*H,gmS=rod.cS[W]/gN; return {sat:+(sSa/n).toFixed(3),mS:+((sS/n)).toFixed(3),gmS:+gmS.toFixed(3)}; }
    const leftSat=colStat(0,Math.round(.16*W)), rightSat=colStat(Math.round(.84*W),W);
    // 精确深度条带显著性（top8/left9 与全局比）
    const gN=W*H, gmS=rod.rS[H]/gN;
    function rowMS(depth){ const y1=Math.round(depth*H); const n=y1*W; return +((rod.rS[y1]-rod.rS[0])/n).toFixed(3); }
    function colMS(depth){ const x1=Math.round(depth*W); const n=x1*H; return +((rod.cS[x1]-rod.cS[0])/n).toFixed(3); }
    console.log(`\n${path.basename(img)} scene=${p.sceneType} crop=[${p.crop}]`);
    console.log(`  cx=${a.cx.toFixed(2)} cy=${a.cy.toFixed(2)} hSym=${a.hSym?.toFixed(2)} vSym=${a.vSym?.toFixed(2)} sym=${a.sym?.toFixed(2)}`);
    console.log(`  edge: center H=${cL.toFixed(3)} V=${cT.toFixed(3)} | L=${eL.toFixed(3)} R=${eR.toFixed(3)} T=${eT.toFixed(3)} B=${eB.toFixed(3)}`);
    console.log(`  rod top sat=${topRod.sat} lum=${topRod.lum} mS=${topRod.mS}(thr=${(topRod.gmS*1.3).toFixed(3)}) var=${topRod.varL} | bot sat=${botRod.sat} lum=${botRod.lum} var=${botRod.varL}`);
    console.log(`  side sat: L=${leftSat.sat} mS=${leftSat.mS} | R=${rightSat.sat} mS=${rightSat.mS} (global gmS=${gmS.toFixed(3)})`);
    console.log(`  stripS top8%=${rowMS(.08)} left9%=${colMS(.09)} top16%=${rowMS(.16)} left16%=${colMS(.16)} | ratio top8=${(rowMS(.08)/gmS).toFixed(2)} left9=${(colMS(.09)/gmS).toFixed(2)}`);
  }
  await b.close(); srv.close();
})();
