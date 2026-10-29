// 本地确定性复现（关闭云端）：预览所示裁切 vs 主按钮落地结果
const puppeteer=require('puppeteer');
const chromePath=require('./chrome-path');
const http=require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..');
const PORT=8782;
const IMGS=(process.env.IMGS||'night_1.jpg,arch_3.jpg,indoor_1.jpg').split(',');
const srv=http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/')p='/index.html';
  const fp=path.join(ROOT,p);
  if(!fs.existsSync(fp)){res.writeHead(404);res.end();return;}
  const ext=path.extname(fp).toLowerCase();
  const ct=ext==='.js'?'text/javascript':(ext==='.jpg'||ext==='.jpeg')?'image/jpeg':(ext==='.png')?'image/png':'text/html';
  res.writeHead(200,{'Content-Type':ct});
  fs.createReadStream(fp).pipe(res);
});
function dump(page,tag){
  return page.evaluate((tag)=>{
    try{
      const pv=document.getElementById('pvImg');
      const el=document.getElementById('photoView');
      const p=window.__ai.plan;
      const cands=(window.__ai.candidates||[]).map(c=>({id:c.id,tag:c.tag,crop:c.crop,noCrop:c.noCrop}));
      return {
        tag,
        plan:{noCrop:!!(p&&p.noCrop),crop:p&&p.crop?Array.from(p.crop):null,rule:p&&p.rule,scene:p&&p.sceneType,aiCandidateId:p&&p.aiCandidateId},
        shown:{w:el.naturalWidth,h:el.naturalHeight},
        pvShown:!!(pv&&pv.src&&pv.src.startsWith('data:')),
        selected:window.__ai.selectedCandidate,
        cands,
        status:String(document.querySelector('#statusText')?.textContent||'').slice(0,50)
      };
    }catch(e){return {tag,err:e.message};}
  },tag);
}
(async()=>{
  await new Promise(r=>srv.listen(PORT,r));
  const b=await puppeteer.launch(chromePath.launch());
  const page=await b.newPage();
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  const errors=[];
  page.on('pageerror',e=>errors.push('PAGE_ERR: '+e.message.slice(0,120)));
  await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.evaluate(()=>{
    localStorage.setItem('aiComposeCloudOn','0'); // 关闭云端，保证确定性
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await new Promise(r=>setTimeout(r,1200));
  for(const name of IMGS){
    const fp=path.join(ROOT,'imgs/regression',name);
    if(!fs.existsSync(fp)){console.log(`\n[${name}] 不存在`);continue;}
    console.log(`\n========== ${name} ==========`);
    const input=await page.$('#fileInput');
    await input.uploadFile(fp);
    await new Promise(r=>setTimeout(r,1200));
    // 分析前 photoView 即原图
    const orig=await page.evaluate(()=>{const el=document.getElementById('photoView');return {w:el.naturalWidth,h:el.naturalHeight};});
    console.log('原图尺寸:',JSON.stringify(orig));
    await page.evaluate(()=>{try{document.getElementById('btnAnalyze').click();}catch(e){}});
    await new Promise(r=>setTimeout(r,2500));
    const before=await dump(page,'预览/落地前');
    console.log(JSON.stringify(before,null,1));
    // 点主按钮（JS 点击，移动视口物理 click 可能不触发）
    await page.evaluate(()=>{try{document.getElementById('aiApply').click();}catch(e){}});
    await new Promise(r=>setTimeout(r,2500));
    await page.screenshot({path:path.join(ROOT,'tools','shot_after_'+name.replace(/\.jpg$/,'')+'.png')});
    const after=await dump(page,'应用后');
    console.log(JSON.stringify({tag:after.tag,shown:after.shown,status:after.status,plan:{noCrop:after.plan.noCrop,crop:after.plan.crop}},null,1));
  }
  console.log('\n页面错误:',errors.length?errors.slice(0,8):'无');
  await b.close(); srv.close();
})();
