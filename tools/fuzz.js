/* 临时审查脚本：对纯函数做属性/模糊测试，找真实健壮性问题。 */
const { _deriveCrop, _smartCrop, _jointGuard, _objectGuard, _portraitFraming, _aspectCrop, _figureGround, _yoloNMS, _estTiltDeg } = require('../tests/pure-functions.js');

let issues = 0;
function bad(msg) { console.log('ISSUE:', msg); issues++; }
const rnd = (a, b) => a + Math.random() * (b - a);
const validNum = v => typeof v === 'number' && isFinite(v);

// 1. _deriveCrop: 随机 base，检查范围、NaN、三档单调、round 后面积>=0.34（200 万次）
for (let i = 0; i < 2000000; i++) {
  const base = [rnd(0, 45), rnd(0, 45), rnd(0, 45), rnd(0, 45)];
  for (const mode of ['loose', 'standard', 'tight']) {
    const out = _deriveCrop(base, mode);
    if (out.length !== 4) { bad('deriveCrop 长度!=4'); continue; }
    out.forEach(v => { if (!validNum(v)) bad('deriveCrop NaN: ' + v); if (v < 0 || v > 45) bad('deriveCrop 越界: ' + v); });
    const area = (100 - out[0] - out[2]) * (100 - out[1] - out[3]) / 10000;
    if (area < 0.34) bad('deriveCrop 面积低于 0.34: ' + area.toFixed(4));
  }
  const l = _deriveCrop(base, 'loose'), s = _deriveCrop(base, 'standard'), t = _deriveCrop(base, 'tight');
  for (let k = 0; k < 4; k++) {
    if (!(l[k] <= s[k] && s[k] <= t[k])) bad(`deriveCrop 非单调 loose${l[k]} std${s[k]} tight${t[k]}`);
  }
  // 稳定性
  const a = JSON.stringify(_deriveCrop(base, 'standard')), b = JSON.stringify(_deriveCrop(base, 'standard'));
  if (a !== b) bad('deriveCrop 不稳定');
}

// 2. _jointGuard: 随机 pose + crop，检查只减不增、范围
function rndPose() {
  const pose = [];
  for (let i = 0; i < 33; i++) {
    if (Math.random() < 0.6) pose.push({ x: rnd(-0.1, 1.1), y: rnd(-0.1, 1.1), visibility: rnd(0, 1) });
    else pose.push({ x: 0, y: 0, visibility: 0 });
  }
  return pose;
}
for (let i = 0; i < 2000000; i++) {
  const crop = [rnd(0, 50), rnd(0, 50), rnd(0, 50), rnd(0, 50)].map(v => Math.round(v));
  const pose = rndPose();
  const out = _jointGuard(crop, pose, true);
  out.forEach((v, k) => {
    if (!validNum(v)) bad('jointGuard NaN');
    if (v < 0 || v > 50) bad('jointGuard 越界: ' + v);
    if (v > crop[k]) bad(`jointGuard 增大裁切边 ${k}: ${crop[k]}->${v}`); // 只减不增
  });
}

// 3. _figureGround: 检查输出为 null 或非空字符串
for (let i = 0; i < 5000; i++) {
  const out = _figureGround(rnd(-50, 300), rnd(-50, 300));
  if (out !== null && typeof out !== 'string') bad('figureGround 异常类型');
}

// 4. _yoloNMS: 随机框，检查输出索引合法
for (let i = 0; i < 10000; i++) {
  const n = Math.floor(rnd(0, 8));
  const boxes = [], scores = [];
  for (let j = 0; j < n; j++) {
    const x = rnd(0, 100), y = rnd(0, 100), w = rnd(1, 40), h = rnd(1, 40);
    boxes.push([x, y, x + w, y + h]); scores.push(rnd(0, 1));
  }
  const keep = _yoloNMS(boxes, scores, rnd(0.1, 0.9));
  keep.forEach(k => { if (!validNum(k) || k < 0 || k >= n || (k | 0) !== k) bad('NMS 非法索引'); });
  if (new Set(keep).size !== keep.length) bad('NMS 重复索引');
}

// 5. _estTiltDeg: 随机字段，检查输出结构
for (let i = 0; i < 3000; i++) {
  const W = 20, H = 20;
  const gx = new Float32Array(W * H), gy = new Float32Array(W * H), gm = new Float32Array(W * H);
  for (let j = 0; j < W * H; j++) {
    if (Math.random() < 0.3) { gx[j] = rnd(-100, 100); gy[j] = rnd(-100, 100); gm[j] = Math.hypot(gx[j], gy[j]); }
  }
  const out = _estTiltDeg(gx, gy, gm, W, H, 10);
  if (!validNum(out.deg) || !validNum(out.conf)) bad('estTiltDeg NaN');
  if (Math.abs(out.deg) > 10) bad('estTiltDeg deg 超 10: ' + out.deg);
  if (out.conf < 0 || out.conf > 100) bad('estTiltDeg conf 越界');
}

// 6. _objectGuard: 随机 crop + 随机检测框，检查只减不增、范围、保留面积不缩小、确定性
const OBJ_CLS = ['dog','car','cat','bottle','person','couch','bird','horse','pizza','chair'];
function rndBoxes() {
  const n = Math.floor(rnd(0, 7));
  const arr = [];
  for (let j = 0; j < n; j++) {
    const x1 = rnd(-0.05, 0.95), y1 = rnd(-0.05, 0.95);
    const x2 = x1 + rnd(0.02, 0.55), y2 = y1 + rnd(0.02, 0.55);
    arr.push({ class: OBJ_CLS[Math.floor(rnd(0, OBJ_CLS.length))], score: rnd(0.1, 0.99),
      b: [x1, y1, x2, y2] }); // 允许略微超出 [0,1]，测生产端 clamp 健壮性
  }
  return arr;
}
function areaOf(c){ return (100-c[0]-c[2])*(100-c[1]-c[3])/10000; }
for (let i = 0; i < 2000000; i++) {
  const crop = [rnd(0, 50), rnd(0, 50), rnd(0, 50), rnd(0, 50)].map(v => Math.round(v));
  const boxes = rndBoxes();
  const out = _objectGuard(crop, boxes);
  if (out.length !== 4) { bad('objectGuard 长度!=4'); continue; }
  out.forEach((v,k)=>{
    if(!validNum(v)) bad('objectGuard NaN');
    if(v<0||v>50) bad('objectGuard 越界: '+v);
    if(v>crop[k]) bad(`objectGuard 增大裁切边 ${k}: ${crop[k]}->${v}`);
  });
  if(areaOf(out) < areaOf(crop) - 1e-9) bad('objectGuard 保留面积缩小');
  const s1=JSON.stringify(_objectGuard(crop,boxes)), s2=JSON.stringify(_objectGuard(crop,boxes));
  if(s1!==s2) bad('objectGuard 不稳定');
}

// 7. _portraitFraming: 随机人像框/画幅/crop，触发时检查不切头/不切身体/不裁人/面积/长边/眼位上移；不触发时原样
for (let i = 0; i < 1000000; i++) {
  const ph = rnd(0.1, 0.95);
  let pt = rnd(0.02, 0.55), pb = Math.min(1, pt + ph);
  let pl = rnd(0.05, 0.5), pr = Math.min(1, pl + rnd(0.15, 0.6));
  const aspect = rnd(0.42, 1.05); // 含横图/竖图
  const isCloseUp = Math.random() < 0.15;
  const crop = [rnd(0, 20), rnd(0, 20), rnd(0, 20), rnd(0, 20)].map(v => Math.round(v));
  const info = { pl, pt, pr, pb, ph, aspect, isCloseUp, isPerson: true };
  let out;
  try { out = _portraitFraming(crop, info); } catch(e){ bad('portraitFraming 抛错: '+e.message); continue; }
  if (out.length !== 4) { bad('portraitFraming 长度!=4'); continue; }
  out.forEach(v => { if (!validNum(v)) bad('portraitFraming NaN'); if (v<0||v>60) bad('portraitFraming 越界: '+v); });
  const fired = JSON.stringify(out) !== JSON.stringify(crop);
  if (fired) {
    const L=out[0]/100, T=out[1]/100, R=out[2]/100, H=1-T-out[3]/100, W=1-L-R;
    const eyeK=ph>=0.5?0.10:0.08, eyeAbs=pt+eyeK*ph;
    const T0=crop[1]/100, H0=1-T0-crop[3]/100;
    const eyeNow=(eyeAbs-T0)/H0, newEye=(eyeAbs-T)/H;
    if (H < 0.60-1e-9) bad('portraitFraming 长边护栏失效 H='+H);
    if (H*W < 0.36-1e-9) bad('portraitFraming 保留面积<0.36: '+(H*W));
    if (T > pt-0.04+1e-9) bad('portraitFraming 切头顶 T='+T+' pt='+pt);
    if (T+H < pb+(ph>=0.5?0.05:0.06)-1e-9) bad('portraitFraming 切身体/腿');
    if (L > pl-0.03+1e-9 || R > 1-pr-0.03+1e-9) bad('portraitFraming 裁到左右人体');
    if ((pt-T)/H < 0.04-1e-9) bad('portraitFraming 头顶留白<4%');
    if (!(newEye < eyeNow)) bad('portraitFraming 眼位未上移 now='+eyeNow+' new='+newEye);
    // 触发的前置条件一致性（竖幅/非特写/半身七分/眼位低/头留白大）
    if (aspect>=0.92 || isCloseUp || !(ph>=0.34&&ph<0.72)) bad('portraitFraming 不该触发却触发');
  }
  if (JSON.stringify(_portraitFraming(crop, info)) !== JSON.stringify(out)) bad('portraitFraming 不稳定');
}

// 8. _smartCrop: 随机 cx/cy，检查无对称裁切、方向正确、上限、居中不裁、确定性（200 万次）
for (let i = 0; i < 2000000; i++) {
  const cx = rnd(-0.1, 1.1), cy = rnd(-0.1, 1.1), vCrop = Math.random() < 0.5;
  let out;
  try { out = _smartCrop(cx, cy, { vCrop: vCrop }); } catch(e){ bad('smartCrop 抛错: '+e.message); continue; }
  if (out.length !== 4) { bad('smartCrop 长度!=4'); continue; }
  const [L,T,R,B] = out;
  [L,T,R,B].forEach(v=>{ if(!validNum(v)) bad('smartCrop NaN'); if(v<0||v>0.181) bad('smartCrop 越界: '+v); });
  if (T>0.151+1e-9 || B>0.151+1e-9) bad('smartCrop 垂直超上限');
  if (L>0 && R>0) bad('smartCrop 水平双侧裁切（对称乱裁）');
  if (T>0 && B>0) bad('smartCrop 垂直双侧裁切');
  const ccx=Math.max(0,Math.min(1,cx)), ccy=Math.max(0,Math.min(1,cy));
  if (ccx<0.375 && L>0) bad('smartCrop 主体偏左却裁左边');
  if (ccx>0.625 && R>0) bad('smartCrop 主体偏右却裁右边');
  if (vCrop && ccy<0.375 && T>0) bad('smartCrop 主体偏上却裁上边');
  if (vCrop && ccy>0.625 && B>0) bad('smartCrop 主体偏下却裁下边');
  if (!vCrop && (T>0||B>0)) bad('smartCrop vCrop=false 仍垂直裁切');
  if (ccx>=0.375&&ccx<=0.625&&ccy>=0.375&&ccy<=0.625 && (L+T+R+B)>0) bad('smartCrop 主体居中却裁切');
  if (JSON.stringify(_smartCrop(cx,cy,{vCrop}))!==JSON.stringify(out)) bad('smartCrop 不稳定');
}

// 9. _aspectCrop: 随机构图信息，触发时检查画幅≈16:9、面积、不切主体；不触发原样；确定性（100 万次）
const AC_SCENES=['waterscape','landscape','night','portrait','food','general','architecture'];
function rndACBoxes(){
  const n=Math.floor(rnd(0,6)); const arr=[];
  for(let j=0;j<n;j++){
    const x1=rnd(0,0.8), y1=rnd(0,0.8), x2=Math.min(1,x1+rnd(0.05,0.5)), y2=Math.min(1,y1+rnd(0.05,0.5));
    arr.push({b:[x1,y1,x2,y2]});
  }
  return arr;
}
for (let i=0;i<1000000;i++){
  const info={ scene:AC_SCENES[Math.floor(rnd(0,AC_SCENES.length))], isPerson:Math.random()<0.15,
    aspect:rnd(0.6,2.4), tiltDeg:rnd(-12,12), tiltConf:rnd(0,80),
    cx:rnd(0,1),cy:rnd(0,1),ratio:rnd(0.1,0.9),horizonOk:Math.random()<0.5, boxes:rndACBoxes() };
  const crop=[0,0,0,0];
  let out;
  try{ out=_aspectCrop(crop,info); }catch(e){ bad('aspectCrop 抛错: '+e.message); continue; }
  if(out.length!==4){ bad('aspectCrop 长度!=4'); continue; }
  out.forEach(v=>{ if(!validNum(v)) bad('aspectCrop NaN'); if(v<0||v>60) bad('aspectCrop 越界: '+v); });
  const L=out[0]/100,T=out[1]/100,R=out[2]/100,B=out[3]/100, fH=1-T-B, fW=1-L-R;
  const fired=out.reduce((s,v)=>s+v,0)>0;
  if(fired){
    if(fH*fW<0.78-1e-9) bad('aspectCrop 面积<0.78: '+(fH*fW));
    if(Math.abs(info.aspect*fW/fH-16/9)>0.08+1e-9) bad('aspectCrop 画幅偏离16:9');
    if(info.isPerson) bad('aspectCrop 人像不应触发');
    if(info.tiltConf>=40&&Math.abs(info.tiltDeg)>3) bad('aspectCrop 倾斜不应触发');
    if(!(info.scene==='waterscape'||info.scene==='landscape'||info.scene==='night'||info.scene==='architecture')) bad('aspectCrop 非宽幅场景触发');
    if(info.aspect<1.45||info.aspect>2.1) bad('aspectCrop 画幅范围外触发');
    for(const o of info.boxes){
      const b=o.b; if((b[2]-b[0])*(b[3]-b[1])<0.01) continue;
      if(T>b[1]-0.01+1e-9) bad('aspectCrop 切主体上');
      if(B>1-b[3]-0.01+1e-9) bad('aspectCrop 切主体下');
      if(L>b[0]-0.01+1e-9) bad('aspectCrop 切主体左');
      if(R>1-b[2]-0.01+1e-9) bad('aspectCrop 切主体右');
    }
  }
  if(JSON.stringify(_aspectCrop(crop,info))!==JSON.stringify(out)) bad('aspectCrop 不稳定');
}

console.log(issues === 0 ? '\n✓ 模糊测试未发现问题' : `\n发现 ${issues} 个问题`);
