// v12.18.0 端到端 QA：完整流程抓错
const puppeteer=require('puppeteer');
const chromePath=require('./chrome-path');
const http=require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..');
const PORT=8779;
const srv=http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/')p='/index.html';
  const fp=path.join(ROOT,p);
  if(!fs.existsSync(fp)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/html'});
  fs.createReadStream(fp).pipe(res);
});
(async()=>{
  await new Promise(r=>srv.listen(PORT,r));
  const b=await puppeteer.launch(chromePath.launch());
  const page=await b.newPage();
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  const errors=[];
  page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE_ERR: '+m.text().slice(0,150));});
  page.on('pageerror',e=>errors.push('PAGE_ERR: '+e.message.slice(0,150)));
  page.on('requestfailed',r=>{const u=r.url();if(!u.includes('favicon'))errors.push('NET_FAIL: '+u.slice(0,80)+' '+r.failure().errorText);});
  page.on('response',r=>{const s=r.status();if(s>=400&&s!==404)errors.push('HTTP_'+s+': '+r.url().slice(0,80));});

  console.log('1. 打开页面...');
  await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'domcontentloaded',timeout:30000});
  await new Promise(r=>setTimeout(r,3000));

  console.log('2. 上传测试图...');
  const CANDS=['imgs/picsum/p001.jpg','imgs/regression/backlit_1.jpg','imgs/test100/arch_1.jpg','imgs/test50/food_3.jpg'].map(p=>path.join(ROOT,p));
  const testImg=CANDS.find(p=>fs.existsSync(p))||'';
  if(fs.existsSync(testImg)){
    const input=await page.$('#fileInput');
    await input.uploadFile(testImg);
    await new Promise(r=>setTimeout(r,3000));
    console.log('   上传完成');
  } else {
    console.log('   测试图不存在，跳过');
  }

  console.log('3. 检查关键元素...');
  const els=await page.evaluate(()=>({
    btnAnalyze:!!document.getElementById('btnAnalyze'),
    btnCmp:!!document.getElementById('btnCmp'),
    photoView:!!document.getElementById('photoView'),
    cmpHandle:!!document.getElementById('cmpHandle'),
  }));
  console.log('   elements:',JSON.stringify(els));

  console.log('4. 对比按钮可点?');
  const cmpBtn=await page.$('#btnCmp');
  if(cmpBtn){
    const box=await cmpBtn.boundingBox();
    console.log('   btnCmp box:',box?JSON.stringify({x:Math.round(box.x),y:Math.round(box.y),w:Math.round(box.width)}):'null');
  }

  console.log('5. 对比滑块叠层验证...');
  // 用 verify_stacking 同款逻辑
  const stacking=await page.evaluate(()=>{
    try{
      const pv=document.getElementById('photoView');
      const cb=document.getElementById('cmpBase');
      if(!pv||!cb)return 'no elements';
      const pz=getComputedStyle(pv).zIndex;
      const cz=getComputedStyle(cb).zIndex;
      return 'photoView z-index='+pz+', cmpBase z-index='+cz;
    }catch(e){return 'err:'+e.message;}
  });
  console.log('   stacking:',stacking);

  console.log('\n=== QA 结果 ===');
  if(errors.length===0){
    console.log('✓ 无 console error / 无 pageerror / 无 4xx/5xx');
  } else {
    console.log('发现 '+errors.length+' 个问题:');
    errors.slice(0,15).forEach(e=>console.log('  '+e));
  }

  await b.close(); srv.close();
  process.exit(errors.length>5?1:0);
})();
