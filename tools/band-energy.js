// 计算候选被裁条带的平均边缘能量（水平裁切看 row，垂直裁切看 col）
const puppeteer=require('puppeteer'); const chromePath=require('./chrome-path');
const http=require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..'); const PORT=8790;
const NAMES=(process.env.IMGS||'ancient_6.jpg').split(',');
const srv=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
  const fp=path.join(ROOT,p);if(!fs.existsSync(fp)){res.writeHead(404);res.end();return;}
  const ext=path.extname(fp).toLowerCase();
  const ct=ext==='.js'?'text/javascript':(ext==='.jpg'?'image/jpeg':ext==='.png'?'image/png':'text/html');
  res.writeHead(200,{'Content-Type':ct});fs.createReadStream(fp).pipe(res);});
function bandEnergy(a,crop){
  const ee=a.edgeEnergy||{}; const col=ee.col||[], row=ee.row||[];
  const L=crop[0]/100,T=crop[1]/100,R=crop[2]/100,B=crop[3]/100;
  function avg(arr,f0,f1){let s=0,n=0;const i0=Math.floor(f0*arr.length),i1=Math.ceil(f1*arr.length);
    for(let i=Math.max(0,i0);i<Math.min(arr.length,i1);i++){s+=arr[i];n++;}return n?s/n:0;}
  let hE=0,vE=0;
  if(T>0)hE+=avg(row,0,T);
  if(B>0)hE+=avg(row,1-B,1);
  hE=(T+B>0)?hE/(T+B):0;
  if(L>0)vE+=avg(col,0,L);
  if(R>0)vE+=avg(col,1-R,1);
  vE=(L+R>0)?vE/(L+R):0;
  return {hE:+hE.toFixed(3),vE:+vE.toFixed(3)};
}
(async()=>{
  await new Promise(r=>srv.listen(PORT,r));
  const b=await puppeteer.launch(chromePath.launch()); const page=await b.newPage();
  await page.setViewport({width:390,height:844});
  await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{localStorage.setItem('aiComposeCloudOn','0');localStorage.setItem('aiModelEnabled','0');});
  await page.reload({waitUntil:'domcontentloaded'}); await new Promise(r=>setTimeout(r,1000));
  for(const name of NAMES){
    await (await page.$('#fileInput')).uploadFile(path.join(ROOT,'imgs/regression',name));
    await new Promise(r=>setTimeout(r,900));
    await page.evaluate(()=>document.getElementById('btnAnalyze').click());
    await new Promise(r=>setTimeout(r,3000));
    const r=await page.evaluate(()=>{
      const a=window.__ai.data;
      const ee=a.edgeEnergy||{}; const col=ee.col||[], row=ee.row||[];
      function bandE(crop){
        const L=crop[0]/100,T=crop[1]/100,R=crop[2]/100,B=crop[3]/100;
        function avg(arr,f0,f1){let s=0,n=0;const i0=Math.floor(f0*arr.length),i1=Math.ceil(f1*arr.length);
          for(let i=Math.max(0,i0);i<Math.min(arr.length,i1);i++){s+=arr[i];n++;}return n?s/n:0;}
        let hS=0,hN=0,vS=0,vN=0;
        if(T>0){hS+=avg(row,0,T);hN++;}
        if(B>0){hS+=avg(row,1-B,1);hN++;}
        if(L>0){vS+=avg(col,0,L);vN++;}
        if(R>0){vS+=avg(col,1-R,1);vN++;}
        return {hE:hN?+(hS/hN).toFixed(3):0,vE:vN?+(vS/vN).toFixed(3):0};
      }
      const out=window.__ai.candidates.filter(c=>!c.noCrop).map(c=>({tag:c.tag,crop:c.crop,score:c.score,band:bandE(c.crop)}));
      return out;
    });
    console.log('\n=== '+name+' ===');
    for(const c of r){
      console.log(`  ${c.tag} ${JSON.stringify(c.crop)} score=${(+c.score).toFixed(3)} 条带能量 h=${c.band.hE} v=${c.band.vE}`);
    }
  }
  await b.close(); srv.close();
})();
