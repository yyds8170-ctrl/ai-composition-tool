const puppeteer=require('puppeteer');
const http=require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..'); const PORT=8781;
const srv=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fs.existsSync(fp)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':'text/html'});fs.createReadStream(fp).pipe(res);});
(async()=>{
  await new Promise(r=>srv.listen(PORT,r));
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const page=await b.newPage();
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  const errors=[];
  page.on('console',m=>{if(m.type()==='error')errors.push('ERR: '+m.text().slice(0,100));});
  page.on('pageerror',e=>errors.push('PAGE: '+e.message.slice(0,100)));
  await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'domcontentloaded',timeout:30000});
  await new Promise(r=>setTimeout(r,2000));

  // Check all button rows for overflow
  const rows=await page.evaluate(()=>{
    const result=[];
    document.querySelectorAll('.main-row,.sec-row,.act-row,.ctrl-row,.filter-row,.ratio-row').forEach((row,i)=>{
      const rect=row.getBoundingClientRect();
      const over=row.scrollWidth>row.clientWidth+5;
      const wrap=getComputedStyle(row).flexWrap;
      result.push({
        cls:row.className.slice(0,30),
        w:Math.round(rect.width),
        scrollW:row.scrollWidth,
        clientW:row.clientWidth,
        overflowX:getComputedStyle(row).overflowX,
        flexWrap:wrap,
        hasOverflow:over,
        visible:rect.width>0
      });
    });
    return result;
  });

  console.log('=== 按钮行巡检 (390px) ===');
  rows.forEach(r=>{
    const flag=r.hasOverflow?'⚠️ OVERFLOW':'';
    const wrapFlag=r.flexWrap==='wrap'?'⚠️ WRAP':'';
    console.log(`${r.cls.padEnd(35)} w=${r.w} scroll=${r.scrollW} client=${r.clientW} ovf=${r.overflowX} wrap=${r.flexWrap} ${flag}${wrapFlag}`);
  });

  console.log('\n=== console errors ===');
  console.log(errors.length?errors.join('\n'):'无');

  await b.close(); srv.close();
})();
