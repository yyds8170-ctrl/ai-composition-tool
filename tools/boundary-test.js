// v12.6.0 边界输入测试：确认不崩、有友好提示
const puppeteer=require('puppeteer');
const http=require('http'); const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..'); const PORT=8777;
const srv=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const fp=path.join(ROOT,p);if(!fs.existsSync(fp)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':'text/html'});fs.createReadStream(fp).pipe(res);});
(async()=>{
  await new Promise(r=>srv.listen(PORT,r));
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-gpu']});
  const page=await b.newPage();
  await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'domcontentloaded',timeout:30000});
  await new Promise(r=>setTimeout(r,2000));
  // Test 1: tiny 1x1 pixel
  const tiny=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
  fs.writeFileSync('/tmp/tiny.png',tiny);
  // Test 2: 0 byte file
  fs.writeFileSync('/tmp/empty.jpg','');
  // Test 3: non-image file
  fs.writeFileSync('/tmp/notimg.txt','hello world');
  let crashes=0;
  for(const f of ['/tmp/tiny.png','/tmp/empty.jpg','/tmp/notimg.txt']){
    try{
      const input=await page.$('#fileInput'); await input.uploadFile(f);
      await new Promise(r=>setTimeout(r,2000));
      const err=await page.evaluate(()=>{const s=document.getElementById('statusbar');return s?s.textContent:'';});
      console.log(f.split('/').pop(),'->',err.slice(0,60));
    }catch(e){crashes++;console.log(f.split('/').pop(),'CRASH:',e.message.slice(0,50));}
  }
  await b.close(); srv.close();
  console.log(crashes===0?'BOUNDARY PASS: no crashes':'BOUNDARY FAIL: '+crashes+' crashes');
  process.exit(crashes>0?1:0);
})();
