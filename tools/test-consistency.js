// 预览 vs 应用一致性自动测试（v13.3.0 稳健版）
// 断言：对"实际在界面上提供的每个候选（含原图）"，点 chip 落地尺寸 == 预览应得尺寸 == 随后点主按钮(#aiApply)落地尺寸。
// 关键：候选以 DOM 中实际渲染的 chip 为准（人像/多主体/动物等安全护栏会隐藏候选，那些图不参与裁切断言）；
// 每次操作后等图片真正加载完成、且 plan 稳定，避免读到过渡态。
// 默认关闭云端（确定性）；设置 CLOUD_TOKEN 时启用云端（先清缓存，保证所见即所得对任意候选成立）。
// 默认每类取代表图；ALL=1 跑全部 imgs/regression。
const puppeteer=require('puppeteer');
const chromePath=require('./chrome-path');
const http=require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..');
const PORT=8810;
const TOKEN=process.env.CLOUD_TOKEN||'';
const USE_CLOUD=!!TOKEN;
const srv=http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/')p='/index.html';
  const fp=path.join(ROOT,p);
  if(!fs.existsSync(fp)){res.writeHead(404);res.end();return;}
  const ext=path.extname(fp).toLowerCase();
  const ct={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.jpg':'image/jpeg','.jpeg':'image/jpeg',
    '.png':'image/png','.webp':'image/webp','.wasm':'application/wasm','.tflite':'application/octet-stream',
    '.task':'application/octet-stream','.webmanifest':'application/manifest+json','.json':'application/json'}[ext]||'text/html';
  res.writeHead(200,{'Content-Type':ct}); fs.createReadStream(fp).pipe(res);
});
function pickImages(){
  let all=fs.readdirSync(path.join(ROOT,'imgs/regression')).filter(n=>/\.jpg$/i.test(n)).sort();
  if(process.env.ALL==='1') return all;
  const seen={}, out=[];
  for(const n of all){
    const pre=n.replace(/_\d+\.jpg$/,'');
    if(!seen[pre]){seen[pre]=1;out.push(n);}
  }
  return out;
}
function dimsClose(a,b){
  if(!a||!b) return false;
  const tolW=Math.max(2,Math.round(b.w*0.02)), tolH=Math.max(2,Math.round(b.h*0.02));
  return Math.abs(a.w-b.w)<=tolW && Math.abs(a.h-b.h)<=tolH;
}
function expectedDims(orig,c){
  if(!c) return {w:orig.w,h:orig.h};
  return {w:Math.round(orig.w*(100-c[0]-c[2])/100), h:Math.round(orig.h*(100-c[1]-c[3])/100)};
}
// 等 photoView 真正加载完成（事件监听，不覆盖 app 的 onload）
async function waitImg(page,timeout=6000){
  await page.evaluate((to)=>new Promise(res=>{
    const el=document.getElementById('photoView');
    if(el.complete&&el.naturalWidth>0)return res();
    const t=setTimeout(res,to);
    const done=()=>{clearTimeout(t);el.removeEventListener('load',done);res();};
    el.addEventListener('load',done);
  }),timeout);
}
// 等上传后的新图落地：dim 必须与上传前不同（避免读到上一张已 complete 的图），再等其 complete
async function waitUpload(page,prev,timeout=9000){
  const start=Date.now();
  while(Date.now()-start<timeout){
    const d=await page.evaluate(()=>{const e=document.getElementById('photoView');
      return (e.complete&&e.naturalWidth>0)?{w:e.naturalWidth,h:e.naturalHeight}:null;});
    if(d&&(!prev||d.w!==prev.w||d.h!==prev.h)){
      // 再确认一次稳定（100ms 后仍相同）
      await new Promise(r=>setTimeout(r,120));
      const d2=await page.evaluate(()=>{const e=document.getElementById('photoView');
        return {w:e.naturalWidth,h:e.naturalHeight};});
      if(d2.w===d.w&&d2.h===d.h)return d;
    }
    await new Promise(r=>setTimeout(r,100));
  }
  return await page.evaluate(()=>{const e=document.getElementById('photoView');return {w:e.naturalWidth,h:e.naturalHeight};});
}
// 等 plan 稳定（连续 3 次 400ms 采样不变）
async function settlePlan(page,maxMs=12000){
  let last=null,stable=0,start=Date.now();
  while(Date.now()-start<maxMs){
    const cur=await page.evaluate(()=>{const p=window.__ai.plan;
      return p?JSON.stringify({c:p.crop,n:p.noCrop}):null;});
    if(cur!==null&&cur===last){stable++;if(stable>=3)return;}else stable=0;
    last=cur;
    await new Promise(r=>setTimeout(r,400));
  }
}
// 读 DOM 中实际渲染的候选 chip（安全护栏隐藏时返回空）
async function readCard(page){
  await page.evaluate(()=>document.getElementById('aiPanel').classList.add('open'));
  await new Promise(r=>setTimeout(r,350));
  return await page.evaluate(()=>{
    const card=document.getElementById('compCandidatesCard');
    if(!card)return [];
    const ids=[...card.querySelectorAll('button[data-cid]')].map(b=>b.getAttribute('data-cid'));
    const cmap={};(window.__ai.candidates||[]).forEach(c=>cmap[c.id]=c);
    return ids.map(id=>({id,crop:cmap[id]?cmap[id].crop:null,noCrop:cmap[id]?cmap[id].noCrop:null}));
  });
}
(async()=>{
  const images=pickImages();
  await new Promise(r=>srv.listen(PORT,r));
  const b=await puppeteer.launch(chromePath.launch());
  const page=await b.newPage();
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message.slice(0,120)));
  page.on('console',m=>{if(m.type()==='error'){const t=m.text();if(/red line|红线/.test(t))errors.push(t.slice(0,120));}});
  // 在任何页面脚本运行前就设好 localStorage（每次导航都生效），避免 goto+evaluate+reload 与 SW 激活竞态。
  await page.evaluateOnNewDocument((tk,cloud)=>{
    try{
      Object.keys(localStorage).filter(k=>/^ai_cmp_cc_/.test(k)).forEach(k=>localStorage.removeItem(k));
      if(cloud){
        localStorage.setItem('aiComposeCloudOn','1');
        localStorage.setItem('aiComposeCloudMode','shared');
        localStorage.setItem('aiComposeCloudKey',tk);
      }else{
        localStorage.setItem('aiComposeCloudOn','0');
      }
    }catch(e){}
  },TOKEN,USE_CLOUD);
  await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'load',timeout:30000});
  await page.waitForSelector('#fileInput',{timeout:20000});
  await new Promise(r=>setTimeout(r,1000));
  let total=0, pass=0, skipped=0; const failures=[];
  for(const name of images){
    const fp=path.join(ROOT,'imgs/regression',name);
    const prev=await page.evaluate(()=>{const e=document.getElementById('photoView');
      return (e.naturalWidth>0)?{w:e.naturalWidth,h:e.naturalHeight}:null;});
    await (await page.$('#fileInput')).uploadFile(fp);
    const orig=await waitUpload(page,prev);
    await page.evaluate(()=>document.getElementById('btnAnalyze').click());
    // 云端等更久
    await settlePlan(page,USE_CLOUD?60000:12000);
    await waitImg(page);
    const chips=await readCard(page);
    const plan=await page.evaluate(()=>window.__ai.plan);
    if(!chips.length){skipped++;continue;} // 安全护栏未提供候选（人像/多主体/动物/极暗等）→ 跳过
    // 1) 直接点主按钮（分析后最常见动作）：应与当前 plan 预览一致
    {
      const exp=expectedDims(orig,plan.noCrop?null:plan.crop);
      await page.evaluate(()=>document.getElementById('aiApply').click());
      await waitImg(page);
      await new Promise(r=>setTimeout(r,250));
      const got=await page.evaluate(()=>{const el=document.getElementById('photoView');return {w:el.naturalWidth,h:el.naturalHeight};});
      total++;
      if(dimsClose(got,exp))pass++;else failures.push(`${name} 直接主按钮: got ${got.w}x${got.h} exp ${exp.w}x${exp.h}`);
    }
    // 2) 逐候选：chip 落地 → 主按钮落地，均应==预览应得
    for(const c of chips){
      if(!c.crop && !c.noCrop)continue;
      await page.evaluate(()=>document.getElementById('aiPanel').classList.add('open'));
      await new Promise(r=>setTimeout(r,200));
      await page.evaluate((id)=>{
        const bs=document.querySelectorAll('#compCandidatesCard button[data-cid]');
        for(const x of bs){if(x.getAttribute('data-cid')===id){x.click();return;}}
      },c.id);
      await waitImg(page);
      const chipDims=await page.evaluate(()=>{const el=document.getElementById('photoView');return {w:el.naturalWidth,h:el.naturalHeight};});
      const exp=expectedDims(orig,c.noCrop?null:c.crop);
      await page.evaluate(()=>document.getElementById('aiApply').click());
      await waitImg(page);
      await new Promise(r=>setTimeout(r,250));
      const mainDims=await page.evaluate(()=>{const el=document.getElementById('photoView');return {w:el.naturalWidth,h:el.naturalHeight};});
      total++;
      const ok=dimsClose(chipDims,exp)&&dimsClose(mainDims,exp);
      if(ok)pass++;else failures.push(`${name} 候选${c.id}: chip ${chipDims.w}x${chipDims.h}, main ${mainDims.w}x${mainDims.h}, exp ${exp.w}x${exp.h}`);
    }
  }
  console.log(`\n==== 一致性结果（${USE_CLOUD?'云端':'本地'}，${images.length} 图）====`);
  console.log(`断言 ${pass}/${total} 通过（安全护栏未提供候选，跳过 ${skipped} 张）`);
  if(failures.length){console.log('失败项:');failures.forEach(f=>console.log('  ❌ '+f));}
  console.log('页面错误:',errors.length?errors.slice(0,6):'无');
  await b.close(); srv.close();
  process.exit(pass===total?0:1);
})();
