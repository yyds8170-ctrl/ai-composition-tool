const puppeteer = require('puppeteer');
(async () => {
  const b = await puppeteer.launch({headless:'new', args:['--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader']});
  const page = await b.newPage();
  await page.setViewport({width:390, height:844, isMobile:true, hasTouch:true});
  const errors = [];
  page.on('console', msg => { if(msg.type()==='error'||msg.type()==='warning') errors.push(msg.type()+': '+msg.text().slice(0,120)); });
  page.on('pageerror', e => errors.push('PAGEERROR: '+e.message.slice(0,120)));
  page.on('requestfailed', r => errors.push('NETFAIL: '+r.url().slice(0,80)+' '+r.failure().errorText));
  
  await page.goto('https://yyds8170-ctrl.github.io/ai-composition-tool/', {waitUntil:'networkidle2', timeout:60000});
  await new Promise(r=>setTimeout(r,5000));
  
  // Check title/version
  const ver = await page.evaluate(()=>document.title);
  console.log('TITLE:', ver);
  
  // Check key elements exist
  const els = await page.evaluate(()=>({
    fileInput: !!document.getElementById('fileInput'),
    btnAnalyze: !!document.getElementById('btnAnalyze'),
    btnCmp: !!document.getElementById('btnCmp'),
    cmpHandle: !!document.getElementById('cmpHandle'),
    photoView: !!document.getElementById('photoView'),
    swReg: !!navigator.serviceWorker,
  }));
  console.log('ELEMENTS:', JSON.stringify(els));
  
  // Check file size
  const htmlSize = await page.evaluate(async ()=>{ const r=await fetch('/ai-composition-tool/'); return (await r.text()).length; });
  console.log('HTML size:', (htmlSize/1024).toFixed(0)+'KB');
  
  console.log('\n=== ERRORS/WARNINGS ('+errors.length+') ===');
  errors.slice(0,20).forEach(e=>console.log(e));
  
  await b.close();
})();
