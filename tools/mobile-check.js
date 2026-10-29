// 移动端 390×844 走查：顶部按钮一行、底部操作横滑、面板不溢出、无 console/page error
const puppeteer=require('puppeteer'); const chromePath=require('./chrome-path');
const http=require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..'); const PORT=8795;
const srv=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';
  const fp=path.join(ROOT,p);if(!fs.existsSync(fp)){res.writeHead(404);res.end();return;}
  const ext=path.extname(fp).toLowerCase();
  const ct={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.jpg':'image/jpeg','.png':'image/png',
    '.wasm':'application/wasm','.tflite':'application/octet-stream','.task':'application/octet-stream',
    '.webmanifest':'application/manifest+json','.onnx':'application/octet-stream','.json':'application/json',
    '.webp':'image/webp'}[ext]||'text/html';
  res.writeHead(200,{'Content-Type':ct});fs.createReadStream(fp).pipe(res);});
(async()=>{
  await new Promise(r=>srv.listen(PORT,r));
  const b=await puppeteer.launch(chromePath.launch()); const page=await b.newPage();
  const errors=[];
  page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  await page.setViewport({width:390,height:844,dpr:2,isMobile:true,hasTouch:true});
  await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{localStorage.setItem('aiComposeOnboarded_v76','1');localStorage.setItem('aiComposeCloudOn','0');
    localStorage.setItem('aiModelEnabled','0');localStorage.setItem('aiForceModel','0');});
  await page.reload({waitUntil:'domcontentloaded'}); await new Promise(r=>setTimeout(r,1200));
  const r1=await page.evaluate(()=>{
    const W=document.documentElement.clientWidth;
    function btnsOf(sel){const out=[];document.querySelectorAll(sel).forEach(b=>{
      const r=b.getBoundingClientRect();if(r.width>0)out.push({x:Math.round(r.x),right:Math.round(r.right),y:Math.round(r.y),w:Math.round(r.width)});});return out;}
    const top=btnsOf('.topbar .minimal-toggle');
    const main=btnsOf('.controls .main-row .btn');
    const ai=btnsOf('.controls .ai-row .btn');
    const overflowX=document.documentElement.scrollWidth>W+2;
    // 底部滤镜排可横滑
    const filterBar=document.getElementById('filterBar');
    let filterInfo=null;
    if(filterBar)filterInfo={sw:filterBar.scrollWidth,cw:filterBar.clientWidth};
    return {W,top,main,ai,overflowX,filterInfo};
  });
  console.log('初始页:',JSON.stringify(r1,null,1));
  function oneRow(btns){return new Set(btns.map(b=>b.y)).size<=1;}
  function noWrap(btns,W){return btns.every(b=>b.right<=W+2);}
  const topOneRow=oneRow(r1.top), topNoWrap=noWrap(r1.top,r1.W);
  const mainOneRow=oneRow(r1.main), mainNoWrap=noWrap(r1.main,r1.W);
  const aiOneRow=oneRow(r1.ai), aiNoWrap=noWrap(r1.ai,r1.W);
  console.log('顶部按钮: 一行',topOneRow,'不越界',topNoWrap);
  console.log('主操作排(5): 一行',mainOneRow,'不越界',mainNoWrap);
  // ai-row 在窄屏设计为自动换行（2×2，见 CSS 注释），不要求一行；只要求按钮完整可见、不越界
  const aiVisible=r1.ai.length===4 && r1.ai.every(b=>b.x>=0&&b.right<=r1.W+2);
  console.log('AI操作排(4): 完整可见',aiVisible,'(窄屏允许换行)');
  console.log('初始横向溢出:',r1.overflowX,' 底部滤镜排:',JSON.stringify(r1.filterInfo));
  // 上传图并分析
  await (await page.$('#fileInput')).uploadFile(path.join(ROOT,'imgs/regression/backlit_11.jpg'));
  await new Promise(r=>setTimeout(r,1200));
  await page.evaluate(()=>document.getElementById('btnAnalyze').click());
  await new Promise(r=>setTimeout(r,3500));
  // 打开 AI 面板与候选，检查溢出
  const r2=await page.evaluate(()=>{
    const W=document.documentElement.clientWidth;
    const ai=document.getElementById('aiPanel');if(ai)ai.classList.add('open');
    const overflowX=document.documentElement.scrollWidth>W+2;
    // 候选排可横滑
    const cand=document.querySelector('#compCandidatesCard > div:nth-child(2)');
    let candInfo=null;
    if(cand)candInfo={sw:cand.scrollWidth,cw:cand.clientWidth};
    return {overflowX,candInfo};
  });
  console.log('分析后:',JSON.stringify(r2));
  await page.screenshot({path:path.join(ROOT,'tools/mobile_390.png')});
  console.log('console/page 错误:',errors.length?errors:'无');
  const pass=topOneRow&&topNoWrap&&mainOneRow&&mainNoWrap&&aiVisible&&!r1.overflowX&&!r2.overflowX&&errors.length===0;
  console.log(pass?'✓ 移动端走查通过':'✗ 移动端走查有问题');
  await b.close(); srv.close();
})();
