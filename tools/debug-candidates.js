/* v13.1.0 QA：用真实 aiData 复算候选/预算/校验，定位"候选为 0 是被哪道闸门拦下"。
 * 用法：node tools/debug-candidates.js imgs/picsum/p001.jpg
 */
'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer');
const ROOT=path.join(__dirname,'..'),PORT=Number(process.env.DBG_PORT||8791);
const chromePath=require('./chrome-path');
const IMG=process.argv[2]||'imgs/picsum/p001.jpg';
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.onnx':'application/octet-stream','.tflite':'application/octet-stream','.data':'application/octet-stream','.binarypb':'application/octet-stream'};
const srv=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);
  if(!fs.existsSync(fp)||!fs.statSync(fp).isFile()){res.writeHead(404);res.end('nf');return;}
  res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);});
(async()=>{
  await new Promise(r=>srv.listen(PORT,r));
  const b=await puppeteer.launch(chromePath.launch());
  const p=await b.newPage();await p.setViewport({width:390,height:844});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,140));});
  await p.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>{localStorage.setItem('aiComposeOnboarded_v76','1');localStorage.setItem('aiModelEnabled','0');localStorage.setItem('aiComposeCloudOn','0');});
  await p.reload({waitUntil:'domcontentloaded'});await new Promise(r=>setTimeout(r,1200));
  const input=await p.$('#fileInput');await input.uploadFile(path.join(ROOT,IMG));await new Promise(r=>setTimeout(r,2500));
  await p.evaluate(()=>document.getElementById('btnAnalyze').click());
  await new Promise(r=>setTimeout(r,6000));
  const out=await p.evaluate((img)=>{
    const d=window.__aiDbg, plan=window.__ai.plan;
    const sc=(plan&&plan.sceneType)||'general';
    const budget=d.budget(sc), ev=d.evidence(), intents=d.intents(sc), built=d.build(sc);
    const perIntents=(Array.isArray(intents)?intents:[]).map(it=>({intent:it.intent,crop:it.crop,v:d.validate(it.crop,sc)}));
    return {img, src:document.getElementById('photoView').naturalWidth+'x'+document.getElementById('photoView').naturalHeight,
      plan:{crop:plan&&plan.crop,noCrop:plan&&plan.noCrop,scene:sc,proactive:plan&&plan.proactiveCrop},
      budget, evidence:ev, intentCount:Array.isArray(intents)?intents.length:intents, perIntents,
      builtCount:Array.isArray(built)?built.length:built,
      keysHasSkinGrid:(d.keys()||[]).indexOf('skinGrid')>=0, probe:d.probe(),
      skin:(()=>{const x=window.__ai.data||{};return {skinRatio:x.skinRatio,skinFill:x.skinFill,skinAspect:x.skinAspect,skinHRatio:x.skinHRatio,isPersonLikely:x.isPersonLikely,isPerson:x.isPerson};})(),
      skinDiag:(()=>{ try{ return window.__v131core.skinEdgeGuard([24,18,9,15], window.__ai.data); }catch(e){ return {err:String(e)}; } })(),
      sigBox:(window.__ai.data&&window.__ai.data.topBBox)||null};
  },IMG);
  console.log(JSON.stringify(out,null,1));
  console.log('errors',errs.slice(0,5));
  await b.close();srv.close();
})();
