// 单图：强制模型加载，渲染最终成片（模型开启），并打印模型状态
const puppeteer=require('puppeteer'); const chromePath=require('./chrome-path');
const http=require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..'); const PORT=8789;
const NAME=process.argv[2]||'ancient_6.jpg';
const FORCE=process.argv[3]?process.argv[3].split(',').map(Number):null;
const srv=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
  const fp=path.join(ROOT,p);if(!fs.existsSync(fp)){res.writeHead(404);res.end();return;}
  const ext=path.extname(fp).toLowerCase();
  const ct=ext==='.js'?'text/javascript':(ext==='.jpg'?'image/jpeg':ext==='.png'?'image/png':ext==='.onnx'?'application/octet-stream':'text/html');
  res.writeHead(200,{'Content-Type':ct});fs.createReadStream(fp).pipe(res);});
(async()=>{
  await new Promise(r=>srv.listen(PORT,r));
  const b=await puppeteer.launch(chromePath.launch()); const page=await b.newPage();
  await page.setViewport({width:390,height:844});
  await page.evaluateOnNewDocument(()=>{try{
    localStorage.setItem('aiModelEnabled','1');localStorage.setItem('aiForceModel','1');
    localStorage.setItem('aiComposeOnboarded_v76','1');localStorage.setItem('aiComposeCloudOn','0');
  }catch(e){}});
  await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'domcontentloaded',timeout:60000});
  const t0=Date.now(); let m=null;
  while(Date.now()-t0<45000){
    m=await page.evaluate(()=>window.__ai&&window.__ai.model);
    if(m&&m.ready)break;
    await new Promise(r=>setTimeout(r,1000));
  }
  console.log('model:',JSON.stringify(m));
  await (await page.$('#fileInput')).uploadFile(path.join(ROOT,'imgs/regression',NAME));
  await new Promise(r=>setTimeout(r,1200));
  await page.evaluate(()=>document.getElementById('btnAnalyze').click());
  await new Promise(r=>setTimeout(r,4500));
  if(FORCE){
    // 点击裁切框匹配 FORCE 的候选 chip
    await page.evaluate((force)=>{
      document.getElementById('aiPanel').classList.add('open');
      const bs=document.querySelectorAll('#compCandidatesCard button[data-cid]');
      const want=JSON.stringify(force);
      for(const x of bs){
        const id=x.getAttribute('data-cid');
        const cands=window.__ai.candidates;
        const c=cands.find(c=>c.id===id);
        if(c&&JSON.stringify(c.crop)===want){x.click();return;}
      }
    },FORCE);
    await new Promise(r=>setTimeout(r,1500));
  }
  const info=await page.evaluate(()=>{
    const sp=document.getElementById('scorePanel');if(sp)sp.style.display='none';
    const cp=document.getElementById('cropPreview');if(cp)cp.style.display='none';
    const ai=document.getElementById('aiPanel');if(ai)ai.classList.remove('open');
    return {crop:window.__ai.plan.crop,scene:window.__ai.plan.sceneType,
      dims:document.getElementById('photoView').naturalWidth+'x'+document.getElementById('photoView').naturalHeight,
      dataScene:window.__ai.data.sceneType};
  });
  await new Promise(r=>setTimeout(r,300));
  const out=path.join(ROOT,'tools/model_'+NAME.replace('.jpg','.png'));
  await (await page.$('#photoView')).screenshot({path:out});
  console.log(NAME,JSON.stringify(info),'->',out);
  await b.close(); srv.close();
})();
