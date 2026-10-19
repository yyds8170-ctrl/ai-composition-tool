#!/usr/bin/env node
/*
 * tools/two-brain-diff.js — 双脑意图分歧标定（v11.17.0）
 *
 * 驱动真实 app，对同一批图分别记录：
 *   本地脑意图（📷）：plan.crop / cropIntent / tier（关云路径纯几何）
 *   云端脑意图（☁️）：云端返回的 keepOriginal/cropIntent/decisionConf（开云路径）
 * 输出一致/分歧分类对照表到 tests/logs/v11.17.0_calibration.md。
 *
 * 用法：CLOUD_TOKEN=xxx node tools/two-brain-diff.js <图片目录>
 * token 从 process.env.CLOUD_TOKEN 读，绝不入库、不打印。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..');
const PORT = 8775;

const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.onnx':'application/octet-stream'};

function startServer(){
  return new Promise(res=>{
    const srv=http.createServer((req,res)=>{
      let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
      const fp=path.join(ROOT,p);
      if(!fs.existsSync(fp)||!fs.statSync(fp).isFile()){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});
      fs.createReadStream(fp).pipe(res);
    });
    srv.listen(PORT,()=>res(srv));
  });
}

async function snap(page){
  await new Promise(r=>setTimeout(r,1500));
  await page.evaluate(()=>document.getElementById('btnAnalyze').click());
  const t=Date.now()+25000;
  while(Date.now()<t){
    await new Promise(r=>setTimeout(r,500));
    const s=await page.evaluate(()=>{
      const p=window.__ai&&window.__ai.plan; if(!p)return null;
      const sb=document.getElementById('statusbar'); const status=sb?sb.textContent:'';
      return {crop:p.crop?p.crop.map(v=>Math.round(v)):[0,0,0,0], cropIntent:p.cropIntent, sceneType:p.sceneType, status};
    });
    if(s&&s.status&&s.status.indexOf('已自动应用')>=0) return s;
  }
  return null;
}

async function runDir(page, dir, cloudOn){
  // v11.22.0: 递归收集子目录图片（regression_r2 按类分目录）
  function collect(d, base){
    const res=[];
    for(const e of fs.readdirSync(d,{withFileTypes:true})){
      const p=path.join(d,e.name);
      if(e.isDirectory()) res.push(...collect(p, base));
      else if(/\.(jpe?g|png)$/i.test(e.name)) res.push(path.relative(base,p));
    }
    return res;
  }
  const files=collect(dir,dir).sort();
  const out=[];
  for(const f of files){
    // 切换云端开关
    await page.evaluate((on)=>{ try{localStorage.setItem('cloud_on',on?'1':'0');}catch(e){} }, cloudOn);
    const input=await page.$('#fileInput');
    await input.uploadFile(path.join(dir,f));
    const s=await snap(page);
    out.push({file:f, cloud:cloudOn, crop:s?s.crop:null, cropIntent:s?s.cropIntent:null, sceneType:s?s.sceneType:null});
    process.stdout.write((cloudOn?'☁':'📷')+' '+f+' crop='+(s?s.crop:'NULL')+'\n');
  }
  return out;
}

async function main(){
  const dir=process.argv[2];
  if(!dir){ console.error('用法: CLOUD_TOKEN=xxx node tools/two-brain-diff.js <目录>'); process.exit(2); }
  if(!process.env.CLOUD_TOKEN){ console.error('必须设置 CLOUD_TOKEN 环境变量'); process.exit(2); }
  const srv=await startServer();
  const browser=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--enable-unsafe-swiftshader']});
  const page=await browser.newPage();
  await page.setViewport({width:390,height:844});
  await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'networkidle2',timeout:60000});
  // 等模型
  const t=Date.now()+40000;
  while(Date.now()<t){ const m=await page.evaluate(()=>window.__ai&&window.__ai.model); if(m&&m.ready)break; await new Promise(r=>setTimeout(r,1000)); }

  console.log('=== 本地脑（关云） ===');
  const local=await runDir(page,dir,false);
  console.log('=== 云端脑（开云） ===');
  const cloud=await runDir(page,dir,true);

  // 对照
  const lMap={}; local.forEach(x=>lMap[x.file]=x);
  let agree=0, disagree=0, abstain=0, rows=[];
  for(const c of cloud){
    const l=lMap[c.file]; if(!l) continue;
    const lCrop=l.crop||[0,0,0,0], cCrop=c.crop||[0,0,0,0];
    const lNo=(lCrop[0]+lCrop[1]+lCrop[2]+lCrop[3])<3;
    const cNo=(cCrop[0]+cCrop[1]+cCrop[2]+cCrop[3])<3;
    let verdict;
    if(lNo&&cNo){ verdict='双不裁'; agree++; }
    else if(!lNo&&!cNo && lCrop.join()==cCrop.join()){ verdict='双裁同向'; agree++; }
    else { verdict='分歧'; disagree++; }
    rows.push({file:c.file, l:lCrop, c:cCrop, lIntent:l.cropIntent, cIntent:c.cropIntent, scene:l.sceneType, verdict});
  }
  const md=[];
  md.push('# v11.17.0 双脑分歧标定');
  md.push(`\n样本数=${rows.length} 一致=${agree} 分歧=${disagree}\n`);
  md.push('| 文件 | 本地crop | 云端crop | 本地意图 | 云端意图 | 场景 | 判定 |');
  md.push('|---|---|---|---|---|---|---|');
  for(const r of rows){ md.push(`| ${r.file} | ${r.l} | ${r.c} | ${r.lIntent} | ${r.cIntent} | ${r.scene} | ${r.verdict} |`); }
  const outPath=path.join(ROOT,'tests/logs/v11.17.0_calibration.md');
  fs.writeFileSync(outPath, md.join('\n'));
  console.log(`\n✅ 标定写入 ${path.relative(ROOT,outPath)}：一致=${agree} 分歧=${disagree}`);
  await browser.close(); srv.close();
}
main().catch(e=>{console.error('FATAL',e);process.exit(2);});
