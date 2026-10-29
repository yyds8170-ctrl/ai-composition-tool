// 逐步：分析 → 逐个点候选 chip → 再点主按钮，dump 每步状态/截图
const puppeteer=require('puppeteer');
const chromePath=require('./chrome-path');
const http=require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..');
const PORT=8783;
const NAME=process.env.IMG||'indoor_1.jpg';
const srv=http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/')p='/index.html';
  const fp=path.join(ROOT,p);
  if(!fs.existsSync(fp)){res.writeHead(404);res.end();return;}
  const ext=path.extname(fp).toLowerCase();
  const ct=ext==='.js'?'text/javascript':(ext==='.jpg'||ext==='.jpeg')?'image/jpeg':(ext==='.png')?'image/png':'text/html';
  res.writeHead(200,{'Content-Type':ct}); fs.createReadStream(fp).pipe(res);
});
function state(page){
  return page.evaluate(()=>{
    const el=document.getElementById('photoView');
    const pv=document.getElementById('pvImg');
    const p=window.__ai.plan;
    const ov=document.getElementById('shotOverlay');
    const si=document.getElementById('shotImg');
    return {
      plan:{noCrop:!!(p&&p.noCrop),crop:p&&p.crop?Array.from(p.crop):null,id:p&&p.aiCandidateId,tag:p&&p.aiCandidateTag},
      shown:{w:el.naturalWidth,h:el.naturalHeight},
      pv:{w:pv.naturalWidth,h:pv.naturalHeight,shown:pv.src.startsWith('data:')},
      cands:window.__ai.candidates.map(c=>({id:c.id,tag:c.tag,crop:c.crop,noCrop:c.noCrop})),
      selected:window.__ai.selectedCandidate,
      shot:{open:ov.classList.contains('show'),w:si.naturalWidth,h:si.naturalHeight},
      panelOpen:document.getElementById('aiPanel').classList.contains('open')
    };
  });
}
(async()=>{
  await new Promise(r=>srv.listen(PORT,r));
  const b=await puppeteer.launch(chromePath.launch());
  const page=await b.newPage();
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message.slice(0,120)));
  await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>localStorage.setItem('aiComposeCloudOn','0'));
  await page.reload({waitUntil:'domcontentloaded'});
  await new Promise(r=>setTimeout(r,1000));
  await (await page.$('#fileInput')).uploadFile(path.join(ROOT,'imgs/regression',NAME));
  await new Promise(r=>setTimeout(r,1000));
  await page.evaluate(()=>document.getElementById('btnAnalyze').click());
  await new Promise(r=>setTimeout(r,2500));
  console.log('STEP analyze:',JSON.stringify(await state(page),null,1));
  const cands=await page.evaluate(()=>window.__ai.candidates);
  for(const c of cands){
    // 点该候选 chip
    await page.evaluate((id)=>{
      const btns=document.querySelectorAll('#compCandidatesCard button[data-cid]');
      for(const b of btns){if(b.getAttribute('data-cid')===id){b.click();return;}}
    },c.id);
    await new Promise(r=>setTimeout(r,900));
    const s=await state(page);
    console.log(`STEP chip ${c.id} (${c.tag}):`,JSON.stringify({plan:s.plan,shown:s.shown,selected:s.selected,shot:s.shot}));
    await page.screenshot({path:path.join(ROOT,`tools/step_chip_${c.id}.png`)});
    // 紧接着点主按钮
    await page.evaluate(()=>{const a=document.getElementById('aiApply');if(a)a.click();});
    await new Promise(r=>setTimeout(r,1500));
    const s2=await state(page);
    console.log(`  after MAIN:`,JSON.stringify({plan:s2.plan,shown:s2.shown,shot:s2.shot,panelOpen:s2.panelOpen}));
    await page.screenshot({path:path.join(ROOT,`tools/step_main_${c.id}.png`)});
    // 仅重新打开面板（不重新分析，避免候选被重建）以继续
    await page.evaluate(()=>{try{document.getElementById('aiPanel').classList.add('open');}catch(e){}});
    await new Promise(r=>setTimeout(r,400));
  }
  console.log('errors:',errors.length?errors.slice(0,6):'none');
  await b.close(); srv.close();
})();
