// 对指定图，跑分析后截图成片（当前实际落地）
const puppeteer=require('puppeteer'); const chromePath=require('./chrome-path');
const http=require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..'); const PORT=8788;
const NAMES=(process.env.IMGS||'ancient_7.jpg').split(',');
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
  const t0=Date.now();
  while(Date.now()-t0<40000){
    const m=await page.evaluate(()=>window.__ai&&window.__ai.model);
    if(m&&m.ready)break;
    await new Promise(r=>setTimeout(r,1000));
  }
  await new Promise(r=>setTimeout(r,1200));
  for(const name of NAMES){
    const fp=path.join(ROOT,'imgs/regression',name);
    await (await page.$('#fileInput')).uploadFile(fp);
    await new Promise(r=>setTimeout(r,1000));
    await page.evaluate(()=>document.getElementById('btnAnalyze').click());
    await new Promise(r=>setTimeout(r,3500));
    await page.evaluate(()=>{
      const sp=document.getElementById('scorePanel'); if(sp)sp.style.display='none';
      const cp=document.getElementById('cropPreview'); if(cp)cp.style.display='none';
      const ai=document.getElementById('aiPanel'); if(ai)ai.classList.remove('open');
    });
    await new Promise(r=>setTimeout(r,300));
    const info=await page.evaluate(()=>({crop:window.__ai.plan.crop,scene:window.__ai.plan.sceneType,
      dims:document.getElementById('photoView').naturalWidth+'x'+document.getElementById('photoView').naturalHeight}));
    const el=await page.$('#photoView');
    const shot=path.join(ROOT,'tools/verify_'+name.replace('.jpg','.png'));
    await el.screenshot({path:shot});
    console.log(name,JSON.stringify(info),'->',shot);
  }
  await b.close(); srv.close();
})();
