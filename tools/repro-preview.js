// 复现：云端预览裁切 vs 一键应用结果 是否一致
const puppeteer=require('puppeteer');
const chromePath=require('./chrome-path');
const http=require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..');
const PORT=8781;
const TOKEN=process.env.CLOUD_TOKEN||'';
const IMGS=(process.env.IMGS||'arch_1.jpg,night_1.jpg,indoor_1.jpg,arch_3.jpg,night_5.jpg').split(',');
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
(async()=>{
  await new Promise(r=>srv.listen(PORT,r));
  const b=await puppeteer.launch(chromePath.launch());
  const page=await b.newPage();
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  const errors=[];
  page.on('pageerror',e=>errors.push('PAGE_ERR: '+e.message.slice(0,120)));
  await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'domcontentloaded',timeout:30000});
  // 配置云端
  await page.evaluate((tk)=>{
    localStorage.setItem('aiComposeCloudOn','1');
    localStorage.setItem('aiComposeCloudMode','shared');
    localStorage.setItem('aiComposeCloudKey',tk);
  },TOKEN);
  await page.reload({waitUntil:'domcontentloaded'});
  await new Promise(r=>setTimeout(r,1500));

  for(const name of IMGS){
    const fp=path.join(ROOT,'imgs/regression',name);
    if(!fs.existsSync(fp)){console.log(`\n[${name}] 不存在，跳过`);continue;}
    console.log(`\n========== ${name} ==========`);
    const input=await page.$('#fileInput');
    await input.uploadFile(fp);
    await new Promise(r=>setTimeout(r,1500));
    // 点 AI 分析（JS 点击，puppeteer click 在移动视口不触发）
    await page.evaluate(()=>{try{document.getElementById('btnAnalyze').click();}catch(e){}});
    // 等分析：最多等 40s 云端
    let info=null;
    for(let i=0;i<40;i++){
      await new Promise(r=>setTimeout(r,1000));
      info=await page.evaluate(()=>{
        try{
          const p=window.__ai.plan;
          const pv=document.getElementById('pvImg');
          return {
            analyzed:!!p,
            hasPlan:!!p,
            cloud:!!(p&&p.cloudFlag),
            noCrop:!!(p&&p.noCrop),
            crop:p&&p.crop?Array.from(p.crop):null,
            rule:p&&p.rule, scene:p&&p.sceneType,
            pvShown:!!(pv&&pv.src&&pv.src.startsWith('data:')),
            status:String(document.querySelector('#statusText')?.textContent||'').slice(0,40)
          };
        }catch(e){return {err:e.message};}
      });
      if(info&&info.analyzed&&info.cloud&&info.pvShown) break;
    }
    console.log('预览时 plan:',JSON.stringify(info));
    if(!info||!info.hasPlan){console.log('  无 plan，跳过');continue;}
    // 原图尺寸
    const origDims=await page.evaluate(()=>{
      const el=document.getElementById('photoView');
      return {w:el.naturalWidth,h:el.naturalHeight};
    });
    // 计算预览裁切应得尺寸
    let expected=null;
    if(info.crop&&!info.noCrop){
      const c=info.crop;
      expected={
        w:Math.round(origDims.w*(100-c[0]-c[2])/100),
        h:Math.round(origDims.h*(100-c[1]-c[3])/100)
      };
    }
    console.log('  原图尺寸:',JSON.stringify(origDims),' 预览裁切应得:',JSON.stringify(expected));
    // 点一键
    const btn=await page.$('#aiApply');
    let btnBox=btn?await btn.boundingBox():null;
    if(btnBox){ await btn.click(); } else { console.log('  一键按钮不可点'); continue; }
    await new Promise(r=>setTimeout(r,2500));
    const after=await page.evaluate(()=>{
      const el=document.getElementById('photoView');
      return {w:el.naturalWidth,h:el.naturalHeight,
        status:String(document.querySelector('#statusText')?.textContent||'').slice(0,60)};
    });
    console.log('  应用后实际尺寸:',JSON.stringify(after.w)+'x'+JSON.stringify(after.h));
    if(expected){
      const dw=Math.abs(after.w-expected.w), dh=Math.abs(after.h-expected.h);
      const ok=(dw<=expected.w*0.03&&dh<=expected.h*0.03);
      console.log('  尺寸差: dx='+dw+' dy='+dh+'  => '+(ok?'✅ 一致':'❌ 不一致(预览≠应用)'));
    } else {
      console.log('  plan 为 noCrop，应用后应保持原图: '+(after.w===origDims.w&&after.h===origDims.h?'✅':'❌ 尺寸变了'));
    }
  }
  console.log('\n页面错误:',errors.length?errors.slice(0,8):'无');
  await b.close(); srv.close();
})();
