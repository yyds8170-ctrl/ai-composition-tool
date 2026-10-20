const puppeteer=require('puppeteer');
const http=require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..'); const PORT=8783;
const srv=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fs.existsSync(fp)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':'text/html'});fs.createReadStream(fp).pipe(res);});
const files=fs.readdirSync(path.join(ROOT,'imgs/regression/extra')).filter(f=>f.endsWith('.jpg'));
(async()=>{
  await new Promise(r=>srv.listen(PORT,r));
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const page=await b.newPage();
  await page.setViewport({width:390,height:844});
  const errors=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,80));});
  await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'domcontentloaded',timeout:30000});
  await new Promise(r=>setTimeout(r,3000));

  const results=[];
  for(const f of files){
    try{
      // Upload file
      const input=await page.$('input[type=file]');
      if(!input){ results.push({f,err:'no input'}); continue; }
      await input.uploadFile(path.join(ROOT,'imgs/regression/extra',f));
      await new Promise(r=>setTimeout(r,5000)); // wait for analysis
      // Get recommended filter from state
      const rec=await page.evaluate(()=>{
        try{
          if(!state.aiData) return {filter:'none',reason:'no aiData'};
          // Find the recommend result in the UI
          const el=document.querySelector('.filter-rec, .rec-filter, [data-rec-filter]');
          return {
            filter: state.recFilter||'unknown',
            reason: state.recReason||'',
            scene: state.aiData.scene||'unknown',
            mean: Math.round(state.aiData.mean||0),
            sat: (state.aiData.sat||0).toFixed(2),
            wb: (state.aiData.wb||0).toFixed(3)
          };
        }catch(e){ return {filter:'err',reason:e.message}; }
      });
      results.push({f,...rec});
    }catch(e){
      results.push({f,err:e.message.slice(0,60)});
    }
  }

  console.log('=== 24张难例滤镜推荐 ===');
  console.log('文件'.padEnd(16),'场景'.padEnd(12),'滤镜'.padEnd(16),'mean','sat','wb');
  results.forEach(r=>{
    console.log(r.f.padEnd(16),(r.scene||'?').padEnd(12),(r.filter||'?').padEnd(16),r.mean||'',r.sat||'',r.wb||'');
  });
  console.log('\n=== console errors ===');
  console.log(errors.length?errors.slice(0,5).join('\n'):'无');

  await b.close(); srv.close();
})();
