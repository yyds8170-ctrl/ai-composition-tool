const puppeteer=require('puppeteer');
const http=require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..'); const PORT=8782;
const srv=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fs.existsSync(fp)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':'text/html'});fs.createReadStream(fp).pipe(res);});
(async()=>{
  await new Promise(r=>srv.listen(PORT,r));
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const page=await b.newPage();
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'domcontentloaded',timeout:30000});
  await new Promise(r=>setTimeout(r,2000));
  const detail=await page.evaluate(()=>{
    const out=[];
    document.querySelectorAll('.ai-row,.sec-row,.ctrl-row').forEach((row,i)=>{
      const btns=row.querySelectorAll('button');
      if(!btns.length)return;
      const names=[...btns].map(b=>b.textContent.trim().slice(0,8));
      const tops=new Set([...btns].map(b=>Math.round(b.getBoundingClientRect().top)));
      out.push({
        cls:row.className.slice(0,25),
        btnCount:btns.length,
        names:names.join('|'),
        rows:tops.size,
        allSameRow:tops.size===1,
        scrollW:row.scrollWidth,
        clientW:row.clientWidth
      });
    });
    return out;
  });
  detail.forEach(d=>{
    console.log(`${d.cls.padEnd(28)} btn=${d.btnCount} rows=${d.rows} overflow=${d.scrollW>d.clientW} [${d.names}]`);
  });
  await b.close(); srv.close();
})();
