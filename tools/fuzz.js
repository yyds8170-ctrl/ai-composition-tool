/* 临时审查脚本：对纯函数做属性/模糊测试，找真实健壮性问题。 */
const { _deriveCrop, _smartCrop, _classifyYaw, _gazeGuard, _edgeSnap, _rodGuard, _jointGuard, _objectGuard, _portraitFraming, _aspectCrop, _figureGround, _yoloNMS, _estTiltDeg, _guidanceEyeLevel, _guidanceEyeOnGrid, _guidanceDistance, _guidanceOrientation, _faceLightSplit, _lightPosition, _warmLightHint, _windowLightHint, _lowAngleAdvice, _composeDiagnosis, _recommendFilter } = require('../tests/pure-functions.js');

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

// 10. _classifyYaw: 随机（含畸形/缺點/重叠）人脸关键点，检查状态合法、方向∈{-1,0,1}、不抛错、确定性、state 与鼻眼比一致（100 万次）
function rndFaceYaw(){
  if(Math.random()<0.35){
    // 畸形/退化：点数随机、个别点缺失或坐标越界
    const n=Math.floor(rnd(0,7));
    const arr=[];
    for(let i=0;i<n;i++){
      if(Math.random()<0.2){ arr.push(null); }
      else { arr.push({x:rnd(-0.2,1.2), y:rnd(-0.2,1.2)}); }
    }
    return arr;
  }
  const fx=rnd(0.25,0.75), span=rnd(0.04,0.14);
  const yawO=rnd(-0.7,0.7);              // 鼻偏航系数
  const noseX=fx+yawO*span;
  const earHalf=rnd(0.12,0.22);
  const earR=fx-earHalf+rnd(-0.02,0.02); // 画面右耳（解剖学右，偏左）
  const earL=fx+earHalf+rnd(-0.02,0.02);
  // 朝右时左耳（画面右）离鼻近、右耳远；用 yawO 同向扰动耳距
  return [
    {x:fx-span/2,y:rnd(0.35,0.45)},{x:fx+span/2,y:rnd(0.35,0.45)},
    {x:noseX,y:rnd(0.42,0.48)},{x:fx,y:rnd(0.48,0.54)},
    {x:earR+yawO*0.03,y:rnd(0.38,0.44)},{x:earL+yawO*0.03,y:rnd(0.38,0.44)}
  ];
}
for(let i=0;i<1000000;i++){
  const lm=rndFaceYaw();
  let r;
  try{ r=_classifyYaw(lm); }catch(e){ bad('classifyYaw 抛错: '+e.message); continue; }
  if(!r||typeof r.dir!=='number'||[-1,0,1].indexOf(r.dir)===-1) bad('classifyYaw dir 非法: '+JSON.stringify(r));
  if(['none','frontal','three-quarter','profile'].indexOf(r.state)===-1) bad('classifyYaw state 非法: '+r.state);
  if(typeof r.r!=='number'||!isFinite(r.r)) bad('classifyYaw r 非数值');
  if(r.dir!==0 && r.state!=='three-quarter' && r.state!=='profile') bad('classifyYaw dir≠0 但 state='+r.state);
  if(r.state==='frontal'&&r.dir!==0) bad('classifyYaw frontal 但 dir≠0');
  if(r.state==='none'&&r.dir!==0) bad('classifyYaw none 但 dir≠0');
  // 复算鼻眼比（仅在眼点有效且不重叠时），核对 state 分档
  if(Array.isArray(lm)&&lm[0]&&lm[1]&&lm[2]&&typeof lm[0].x==='number'&&typeof lm[1].x==='number'&&typeof lm[2].x==='number'){
    const espan=Math.abs(lm[0].x-lm[1].x);
    if(espan>1e-4){
      const ar=Math.abs((lm[2].x-(lm[0].x+lm[1].x)/2)/espan);
      const expectS=ar<0.10?'frontal':(ar<0.35?'three-quarter':'profile');
      if(r.state!==expectS) bad('classifyYaw 分档不符 state='+r.state+' 期望='+expectS+' ar='+ar);
    } else if(r.state!=='none'){ bad('classifyYaw 眼重叠却非 none'); }
  } else if(r.state!=='none'){ bad('classifyYaw 点不足却非 none'); }
  if(JSON.stringify(_classifyYaw(lm))!==JSON.stringify(r)) bad('classifyYaw 不稳定');
}

// 11. _gazeGuard: 随机 crop/info，触发时检查只改水平单侧、T/B 不变、单侧≤15%、窗宽≥0.62、不切身体/脸、确定性（100 万次）
for(let i=0;i<1000000;i++){
  const L=Math.floor(rnd(0,18)),R=Math.floor(rnd(0,18)),T=Math.floor(rnd(0,12)),B=Math.floor(rnd(0,12));
  const crop=[L,T,R,B];
  const faceCount=Math.random()<0.75?1:Math.floor(rnd(2,4));
  const isCloseUp=Math.random()<0.2;
  const dirPick=Math.random();
  const yaw=dirPick<0.4?{state:'three-quarter',dir:1}:dirPick<0.8?{state:'three-quarter',dir:-1}:{state:'frontal',dir:0};
  const info={isCloseUp:isCloseUp,faceCount:faceCount,yaw:yaw,faceCx:rnd(0.2,0.8)};
  const fx=info.faceCx;
  if(Math.random()<0.8){ info.pl=Math.max(0,fx-rnd(0.1,0.3)); info.pr=Math.min(1,fx+rnd(0.1,0.3)); }
  if(Math.random()<0.6){ info.fl=Math.max(0,info.pl!==undefined?info.pl:fx-0.1); info.fr=Math.min(1,info.pr!==undefined?info.pr:fx+0.1); }
  let out;
  try{ out=_gazeGuard(crop,info); }catch(e){ bad('gazeGuard 抛错: '+e.message); continue; }
  if(out.length!==4){ bad('gazeGuard 长度!=4'); continue; }
  out.forEach(v=>{ if(!validNum(v)) bad('gazeGuard NaN'); if(v<0||v>60) bad('gazeGuard 越界: '+v); });
  const fired=(out[0]+out[1]+out[2]+out[3])-(crop[0]+crop[1]+crop[2]+crop[3])>0;
  if(fired){
    if(isCloseUp||faceCount!==1||yaw.dir===0) bad('gazeGuard 不该触发却触发');
    if(out[1]!==crop[1]||out[3]!==crop[3]) bad('gazeGuard 改动了 T/B');
    const dL=out[0]-crop[0], dR=out[2]-crop[2];
    if(dL>0&&dR>0) bad('gazeGuard 水平双侧裁切（对称乱裁）');
    if(dL>15||dR>15) bad('gazeGuard 单侧超 15%: '+dL+'/'+dR);
    if(dL<0||dR<0) bad('gazeGuard 出现反向收缩（应只增）');
    if(yaw.dir>0&&!(dL>0)) bad('gazeGuard 脸朝右却未裁左侧');
    if(yaw.dir<0&&!(dR>0)) bad('gazeGuard 脸朝左却未裁右侧');
    const fW=1-out[0]/100-out[2]/100;
    if(fW<0.62-1e-9) bad('gazeGuard 窗宽<0.62: '+fW);
    if(typeof info.pl==='number'&&out[0]/100>info.pl-0.02+1e-9) bad('gazeGuard 切身体左');
    if(typeof info.pr==='number'&&out[2]/100>1-info.pr-0.02+1e-9) bad('gazeGuard 切身体右');
    if(typeof info.fl==='number'&&out[0]/100>info.fl-0.01+1e-9) bad('gazeGuard 切脸左');
    if(typeof info.fr==='number'&&out[2]/100>1-info.fr-0.01+1e-9) bad('gazeGuard 切脸右');
    // 方向改善：朝右脸应在窗内左移、朝左右移
    const fxn=(fx-out[0]/100)/Math.max(0.01,1-out[0]/100-out[2]/100);
    const fxn0=(fx-crop[0]/100)/Math.max(0.01,1-crop[0]/100-crop[2]/100);
    if(yaw.dir>0&&!(fxn<fxn0-0.03-1e-9)) bad('gazeGuard 朝右脸未左移');
    if(yaw.dir<0&&!(fxn>fxn0+0.03+1e-9)) bad('gazeGuard 朝左脸未右移');
  }
  if(JSON.stringify(_gazeGuard(crop,info))!==JSON.stringify(out)) bad('gazeGuard 不稳定');
}

// 12. _edgeSnap: 随机 crop/energy/info（含空能量畸形），断言只少裁（窗只增、不新增边、越界）、不抛错、不切窗内主体/脸、确定性（100 万次）
for(let i=0;i<1000000;i++){
  const W=Math.floor(rnd(60,260)), H=Math.floor(rnd(60,260));
  let col,row;
  if(Math.random()<0.05){ col=[]; } else { col=[]; for(let x=0;x<W;x++) col.push(Math.random()<0.15?rnd(0,0.25):rnd(0.4,1)); }
  if(Math.random()<0.05){ row=[]; } else { row=[]; for(let y=0;y<H;y++) row.push(Math.random()<0.15?rnd(0,0.25):rnd(0.4,1)); }
  const energy={col:col,row:row,w:W,h:H};
  const L=Math.floor(rnd(0,20)),R=Math.floor(rnd(0,20)),T=Math.floor(rnd(0,15)),B=Math.floor(rnd(0,15));
  const crop=[L,T,R,B];
  const info={};
  const wl=L/100,wr=1-R/100,wt=T/100,wb=1-B/100;
  if(wr-wl>0.45&&Math.random()<0.8){
    const mx=Math.max(0.03,(wr-wl)*0.18);
    info.pl=wl+rnd(0.02,mx); info.pr=wr-rnd(0.02,mx);
    if(info.pl>=info.pr){ delete info.pl; delete info.pr; }
  }
  if(wb-wt>0.45&&Math.random()<0.8){
    const my=Math.max(0.03,(wb-wt)*0.18);
    info.pt=wt+rnd(0.02,my); info.pb=wb-rnd(0.02,my);
    if(info.pt>=info.pb){ delete info.pt; delete info.pb; }
  }
  if(wr-wl>0.5&&wb-wt>0.5&&Math.random()<0.6){
    info.fl=info.pl!==undefined?info.pl+0.01:wl+0.05;
    info.fr=info.pr!==undefined?info.pr-0.01:wr-0.05;
    info.ft=info.pt!==undefined?info.pt+0.01:wt+0.05;
    info.fb=info.pb!==undefined?info.pb-0.01:wb-0.05;
    if(info.fl>=info.fr||info.ft>=info.fb){ delete info.fl; delete info.fr; delete info.ft; delete info.fb; }
  }
  let out;
  try{ out=_edgeSnap(crop,energy,info); }catch(e){ bad('edgeSnap 抛错: '+e.message); continue; }
  if(!Array.isArray(out)||out.length!==4){ bad('edgeSnap 长度!=4'); continue; }
  out.forEach((v,k)=>{
    if(!validNum(v)) bad('edgeSnap NaN/非法值');
    if(v<0||v>60) bad('edgeSnap 越界: '+v);
    if(v>crop[k]) bad('edgeSnap 边 '+k+' 增大（多裁） in='+crop[k]+' out='+v);
    if(crop[k]===0&&v!==0) bad('edgeSnap 新增裁切边 '+k);
  });
  if((1-out[0]/100-out[2]/100) < (1-crop[0]/100-crop[2]/100)-1e-9) bad('edgeSnap 窗宽缩小');
  if((1-out[1]/100-out[3]/100) < (1-crop[1]/100-crop[3]/100)-1e-9) bad('edgeSnap 窗高缩小');
  if(typeof info.pl==='number'&&out[0]/100>info.pl-0.02+1e-9) bad('edgeSnap 切主体左');
  if(typeof info.pr==='number'&&out[2]/100>1-info.pr-0.02+1e-9) bad('edgeSnap 切主体右');
  if(typeof info.pt==='number'&&out[1]/100>info.pt-0.02+1e-9) bad('edgeSnap 切主体上');
  if(typeof info.pb==='number'&&out[3]/100>1-info.pb-0.02+1e-9) bad('edgeSnap 切主体下');
  if(typeof info.fl==='number'&&out[0]/100>info.fl-0.01+1e-9) bad('edgeSnap 切脸左');
  if(typeof info.fr==='number'&&out[2]/100>1-info.fr-0.01+1e-9) bad('edgeSnap 切脸右');
  if(typeof info.ft==='number'&&out[1]/100>info.ft-0.01+1e-9) bad('edgeSnap 切脸上');
  if(typeof info.fb==='number'&&out[3]/100>1-info.fb-0.01+1e-9) bad('edgeSnap 切脸下');
  if(JSON.stringify(_edgeSnap(crop,energy,info))!==JSON.stringify(out)) bad('edgeSnap 不稳定');
}

// 13. _rodGuard: 随机 rod 前缀和/场景（含畸形、上下双高晚霞水面、纯蓝天、夜景暗部、整片高饱和），断言只少裁上下边、
//     不碰左右、不新增边、窗高只增、不抛错、确定性（100 万次）
function rndRod(W,H,mode){
  const rL=new Float64Array(H+1),rL2=new Float64Array(H+1),rS=new Float64Array(H+1);
  const hi=Math.max(1,Math.round(H*rnd(0.08,0.20)));
  const ne=Math.ceil(W/2), no=Math.floor(W/2);
  for(let y=0;y<H;y++){
    let L0,L1,s0,s1;
    const hot = (mode===1 && y<hi) || (mode===2 && y>=H-hi);
    if(hot){ L0=150; L1=220; s0=0.7; s1=0.7; }
    else if(mode===4 && y>=H-hi){ L0=20; L1=20; s0=0.02; s1=0.02; }
    else if(mode===3){ L0=88; L1=100; s0=0.5; s1=0.5; }
    else if(mode===0){ L0=100+rnd(0,20); L1=L0; s0=0.05; s1=0.05; }
    else { L0=rnd(0,255); L1=rnd(0,255); s0=rnd(0,0.3); s1=rnd(0,0.3); }
    rL[y+1]=rL[y]+ne*L0+no*L1;
    rL2[y+1]=rL2[y]+ne*L0*L0+no*L1*L1;
    rS[y+1]=rS[y]+ne*s0+no*s1;
  }
  const cL=new Float64Array(W+1),cL2=new Float64Array(W+1),cS=new Float64Array(W+1);
  return {w:W,h:H,rL,rL2,rS,cL,cL2,cS};
}
for(let i=0;i<1000000;i++){
  const W=Math.floor(rnd(60,260)), H=Math.floor(rnd(60,260));
  let rod;
  if(Math.random()<0.05){ rod=(Math.random()<0.5?null:{w:W,h:H,rL:[],rL2:[],rS:[]}); }
  else { rod=rndRod(W,H,Math.floor(rnd(0,6))); }
  const L=Math.floor(rnd(0,20)),R=Math.floor(rnd(0,20)),T=Math.floor(rnd(0,15)),B=Math.floor(rnd(0,15));
  const crop=[L,T,R,B];
  let out;
  try{ out=_rodGuard(crop,rod,{}); }catch(e){ bad('rodGuard 抛错: '+e.message); continue; }
  if(!Array.isArray(out)||out.length!==4){ bad('rodGuard 长度!=4'); continue; }
  out.forEach((v,k)=>{ if(!validNum(v)) bad('rodGuard NaN/非法值'); if(v<0||v>60) bad('rodGuard 越界: '+v); });
  if(out[0]!==L||out[2]!==R) bad('rodGuard 改动了左右边: '+L+','+R+' -> '+out[0]+','+out[2]);
  if(out[1]>T) bad('rodGuard 上边增大（多裁） in='+T+' out='+out[1]);
  if(out[3]>B) bad('rodGuard 下边增大（多裁） in='+B+' out='+out[3]);
  if(T===0&&out[1]!==0) bad('rodGuard 新增上边裁切');
  if(B===0&&out[3]!==0) bad('rodGuard 新增下边裁切');
  if(Math.abs(out[1]-Math.round(out[1]))>1e-9||Math.abs(out[3]-Math.round(out[3]))>1e-9) bad('rodGuard 非整数');
  if((1-out[1]/100-out[3]/100) < (1-T/100-B/100)-1e-9) bad('rodGuard 窗高缩小');
  if(JSON.stringify(_rodGuard(crop,rod,{}))!==JSON.stringify(out)) bad('rodGuard 不稳定');
}
// 固定强双高合成：顶部晚霞/底部水面必须把对应边归零；夜景暗部保持；纯蓝天只减2
(function(){
  const H=100,W=100;
  const mk=(mode)=>rndRod(W,H,mode);
  // rndRod 的 hi 随机，单独强制满高价值区构造确定性样本
  const fixed=(hotTop,hotBot,hotVar,hotS)=>{
    const rL=new Float64Array(H+1),rL2=new Float64Array(H+1),rS=new Float64Array(H+1);
    for(let y=0;y<H;y++){
      let a=80,b=80,s=0.1;
      if((hotTop&&y<15)||(hotBot&&y>=H-15)){ a=hotVar?150:175; b=hotVar?220:175; s=hotS; }
      rL[y+1]=rL[y]+W*(a+b)/2; rL2[y+1]=rL2[y]+W*(a*a+b*b)/2; rS[y+1]=rS[y]+W*s;
    }
    return {w:W,h:H,rL,rL2,rS,cL:new Float64Array(W+1),cL2:new Float64Array(W+1),cS:new Float64Array(W+1)};
  };
  const r1=_rodGuard([0,10,0,0],fixed(true,false,true,0.7),{}); if(r1[1]!==0) bad('rodGuard 固定晚霞上边应归零, got '+r1[1]);
  const r2=_rodGuard([0,0,0,10],fixed(false,true,true,0.65),{}); if(r2[3]!==0) bad('rodGuard 固定水面下边应归零, got '+r2[3]);
  const r3=_rodGuard([0,10,0,0],fixed(true,false,false,0.6),{}); if(!(r3[1]===8)) bad('rodGuard 纯蓝天应减2, got '+r3[1]);
})();

// 14. v8.9.0 拍前实时引导四件套：随机/越界/缺字段/NaN 入参 → null 或合法对象；绝不抛错、确定性
function validGuidanceOut(o){
  if(o===null||o===undefined) return;
  if(typeof o!=='object'){ bad('guidance 返回非对象: '+JSON.stringify(o)); return; }
  if(typeof o.txt!=='string'||!o.txt.length) bad('guidance 缺 txt: '+JSON.stringify(o));
}
for(let i=0;i<200000;i++){
  const fc=rnd(0,1.1), ht=rnd(-0.1,1.2), fhr=rnd(0,1), ey=rnd(-0.1,1.2);
  let r;
  try{ r=_guidanceEyeLevel({faceConf:fc,headTop:ht,faceHR:fhr,eyesY:ey}); }catch(e){ bad('eyeLevel 抛错: '+e.message); continue; }
  validGuidanceOut(r);
  if(JSON.stringify(_guidanceEyeLevel({faceConf:fc,headTop:ht,faceHR:fhr,eyesY:ey}))!==JSON.stringify(r)) bad('eyeLevel 不稳定');
  try{ r=_guidanceEyeOnGrid({faceConf:fc,eyesY:Math.random()<0.2?null:ey}); }catch(e){ bad('eyeOnGrid 抛错'); continue; }
  validGuidanceOut(r);
  if(JSON.stringify(_guidanceEyeOnGrid({faceConf:fc,eyesY:ey}))!==JSON.stringify(_guidanceEyeOnGrid({faceConf:fc,eyesY:ey}))) bad('eyeOnGrid 不稳定');
}
if(_guidanceEyeOnGrid({faceConf:0.9,eyesY:null})!==null) bad('eyeOnGrid 无眼点未 null');
if(_guidanceEyeOnGrid({faceConf:0.9})!==null) bad('eyeOnGrid 缺眼点未 null');
for(let i=0;i<200000;i++){
  const fc=rnd(0,1.1), phr=rnd(-0.1,1.2), fhr=rnd(0,1);
  let r;
  try{ r=_guidanceDistance({faceConf:fc,personHR:phr,faceHR:fhr}); }catch(e){ bad('distance 抛错'); continue; }
  validGuidanceOut(r);
  if(JSON.stringify(_guidanceDistance({faceConf:fc,personHR:phr,faceHR:fhr}))!==JSON.stringify(r)) bad('distance 不稳定');
}
if(_guidanceDistance({faceConf:0.9,personHR:null,faceHR:null})!==null) bad('distance 双缺失未 null');
if(_guidanceDistance({faceConf:0.9})!==null) bad('distance 全缺未 null');
for(let i=0;i<200000;i++){
  const fcnt=Math.floor(rnd(0,6)), pa=rnd(-0.2,2), fa=rnd(0.4,2), st=['waterscape','landscape','architecture','portrait',null,undefined][Math.floor(rnd(0,6))];
  let r;
  try{ r=_guidanceOrientation({faceCount:fcnt,personAspect:pa,frameAspect:fa,sceneType:st}); }catch(e){ bad('orientation 抛错'); continue; }
  validGuidanceOut(r);
  if(JSON.stringify(_guidanceOrientation({faceCount:fcnt,personAspect:pa,frameAspect:fa,sceneType:st}))!==JSON.stringify(r)) bad('orientation 不稳定');
}
if(_guidanceOrientation({faceCount:4,personAspect:0,frameAspect:0.7,sceneType:'waterscape'})!==null) bad('orientation pa=0 未 null');
if(_guidanceOrientation({faceCount:4,personAspect:-1,frameAspect:0.7,sceneType:'waterscape'})!==null) bad('orientation pa<0 未 null');
if(_guidanceOrientation({faceCount:4,personAspect:NaN,frameAspect:0.7,sceneType:'waterscape'})!==null) bad('orientation pa=NaN 未 null');

// 15. v9.0.0 _faceLightSplit: 随机网格/越界fb/畸形输入 → null 或合法四块均值（0–255）、确定性（50 万次）
for(let i=0;i<500000;i++){
  const gw=16, gh=16;
  const lg=[]; for(let j=0;j<gw*gh;j++) lg.push(rnd(0,255));
  const fb=[rnd(-0.1,1.1),rnd(-0.1,1.1),rnd(0.001,0.6),rnd(0.001,0.6)];
  let r;
  try{ r=_faceLightSplit({lumGrid:lg,gw,gh,fb}); }catch(e){ bad('faceLightSplit 抛错: '+e.message); continue; }
  if(r===null) continue;
  for(const k of ['l','r','t','b','mean','frameMean']){
    if(!validNum(r[k])) bad('faceLightSplit NaN: '+k+'='+r[k]);
    if(r[k]<0||r[k]>255) bad('faceLightSplit 越界: '+k+'='+r[k]);
  }
  const r2=_faceLightSplit({lumGrid:lg,gw,gh,fb});
  if(JSON.stringify(r2)!==JSON.stringify(r)) bad('faceLightSplit 不稳定');
}
if(_faceLightSplit({lumGrid:null,gw:16,gh:16,fb:[0.3,0.3,0.2,0.2]})!==null) bad('faceLightSplit 非法网格未 null');
if(_faceLightSplit({lumGrid:Array(256).fill(128),gw:16,gh:16,fb:[0.5,0.5,0.001,0.001]})!==null) bad('faceLightSplit 脸太小未 null');

// 16. v9.0.0 _lightPosition: 随机split/低置信/畸形 → null 或 {key,txt}、分支最多一条、确定性（50 万次）
const LP_KEYS=['split','side','toplight','flat'];
for(let i=0;i<500000;i++){
  const s={l:rnd(0,255),r:rnd(0,255),t:rnd(0,255),b:rnd(0,255),mean:128};
  const fc=rnd(0,1.1);
  let r;
  try{ r=_lightPosition({split:s,faceConf:fc,mean:130,sat:0.3}); }catch(e){ bad('lightPosition 抛错: '+e.message); continue; }
  if(r===null) continue;
  if(LP_KEYS.indexOf(r.key)<0) bad('lightPosition 非法 key: '+r.key);
  if(typeof r.txt!=='string'||!r.txt.length) bad('lightPosition 缺 txt');
  if(JSON.stringify(_lightPosition({split:s,faceConf:fc,mean:130,sat:0.3}))!==JSON.stringify(r)) bad('lightPosition 不稳定');
}
if(_lightPosition({split:{l:0.0001,r:100,t:100,b:100},faceConf:0.9})!==null) bad('lightPosition min<1e-3 未 null');

// 17. v9.0.0 _warmLightHint / _windowLightHint / _lowAngleAdvice: 随机输入 → null 或 {txt}、确定性（各 20 万次）
for(let i=0;i<200000;i++){
  const o={wb:rnd(-0.2,0.2),mean:rnd(0,260),sat:rnd(0,1)};
  let r;
  try{ r=_warmLightHint(o); }catch(e){ bad('warmLightHint 抛错'); continue; }
  if(r!==null&&typeof r.txt!=='string') bad('warmLightHint 缺 txt');
  if(JSON.stringify(_warmLightHint(o))!==JSON.stringify(r)) bad('warmLightHint 不稳定');
}
for(let i=0;i<200000;i++){
  const o={split:{l:rnd(0,255),r:rnd(0,255),t:120,b:120,mean:rnd(10,200)},edgeColMean:rnd(0,300),faceConf:rnd(0,1.1),mean:rnd(0,255)};
  let r;
  try{ r=_windowLightHint(o); }catch(e){ bad('windowLightHint 抛错'); continue; }
  if(r!==null&&typeof r.txt!=='string') bad('windowLightHint 缺 txt');
  if(JSON.stringify(_windowLightHint(o))!==JSON.stringify(r)) bad('windowLightHint 不稳定');
}
for(let i=0;i<200000;i++){
  const o={frameAspect:rnd(0.5,2),personTop:rnd(-0.1,1.1),personBottom:rnd(-0.1,1.1),personHR:rnd(0,1.2)};
  let r;
  try{ r=_lowAngleAdvice(o); }catch(e){ bad('lowAngleAdvice 抛错'); continue; }
  if(r!==null&&typeof r.txt!=='string') bad('lowAngleAdvice 缺 txt');
  if(JSON.stringify(_lowAngleAdvice(o))!==JSON.stringify(r)) bad('lowAngleAdvice 不稳定');
}

// 18. v9.0.0 _composeDiagnosis: 随机信号 → 数组长度≤3、元素含 id/sev/action、不抛错、无 crop 字段（50 万次）
for(let i=0;i<500000;i++){
  const o={
    yaw:{dir:[-1,0,1][Math.floor(rnd(0,3))]},
    faceCx:rnd(-0.1,1.1), headTop:rnd(-0.1,1.2), eyesY:Math.random()<0.2?null:rnd(-0.1,1.2),
    horizonRatio:rnd(-0.1,1.2), isLandscapeScene:Math.random()<0.3,
    light:Math.random()<0.3?{key:['split','toplight','flat','side'][Math.floor(rnd(0,4))],txt:'x'}:null,
    orientation:Math.random()<0.3?{txt:'y'}:null, rodMoved:Math.random()<0.3
  };
  let r;
  try{ r=_composeDiagnosis(o); }catch(e){ bad('composeDiagnosis 抛错: '+e.message); continue; }
  if(!Array.isArray(r)){ bad('composeDiagnosis 非数组'); continue; }
  if(r.length>3) bad('composeDiagnosis 超过3条: '+r.length);
  for(const d of r){
    if(typeof d.id!=='string'||typeof d.sev!=='number'||typeof d.action!=='string') bad('composeDiagnosis 元素结构非法');
    if('crop' in d) bad('composeDiagnosis 评语竟带 crop（只读纪律破坏）');
  }
  for(let k=1;k<r.length;k++) if(r[k-1].sev<r[k].sev) bad('composeDiagnosis 未按 sev 降序');
  if(JSON.stringify(_composeDiagnosis(o))!==JSON.stringify(r)) bad('composeDiagnosis 不稳定');
}
if(!Array.isArray(_composeDiagnosis(null))||_composeDiagnosis(null).length!==0) bad('composeDiagnosis null 输入未 []');

// 19. v9.0.0 _recommendFilter: 随机信号 → 永远返回合法对象、strength∈[0,100]、非null id∈6款、不抛错、无副作用（50 万次）
const FREC_ALLOW=['night','portrait-warm','portrait-cool','portrait-mono','mono','sunset'];
for(let i=0;i<500000;i++){
  const grid=[]; for(let j=0;j<256;j++) grid.push(rnd(0,255));
  const a={mean:rnd(0,260),contrast:rnd(0,80),wb:rnd(-0.15,0.15),sat:rnd(0,0.6),
    highClip:rnd(0,0.4),shadowClip:rnd(0,0.5),sharpness:rnd(0,100),lightScore:rnd(0,1),
    brightRatio:rnd(0,0.5),skinRatio:rnd(0,0.3),isPersonLikely:Math.random()<0.3,
    warmRatio:rnd(0,0.6),waterScore:rnd(0,1),manmadeScore:rnd(0,1),
    sigBox:[rnd(0,0.4),rnd(0,0.4),rnd(0.5,1),rnd(0.5,1)],lumGrid:grid,gridW:16,gridH:16};
  const sig=Math.random()<0.3?null:{personScore:rnd(0,1),personCount:Math.floor(rnd(0,4)),scene:['food','landscape','portrait',null][Math.floor(rnd(0,4))]};
  const before=JSON.stringify(a);
  let r;
  try{ r=_recommendFilter(a,sig); }catch(e){ bad('recommendFilter 抛错: '+e.message); continue; }
  if(!r||typeof r!=='object'){ bad('recommendFilter 非对象'); continue; }
  if(!('filter' in r&&'strength' in r&&'reason' in r&&'rule' in r)) bad('recommendFilter 缺字段');
  if(r.filter!==null&&FREC_ALLOW.indexOf(r.filter)<0) bad('recommendFilter 非法滤镜 id: '+r.filter);
  if(!validNum(r.strength)||r.strength<0||r.strength>100) bad('recommendFilter strength 非法: '+r.strength);
  if(JSON.stringify(a)!==before) bad('recommendFilter 污染入参');
  if(JSON.stringify(_recommendFilter(a,sig))!==JSON.stringify(r)) bad('recommendFilter 不稳定');
}
if(_recommendFilter(null).rule!=='GATE') bad('recommendFilter null 未 GATE');
if(_recommendFilter({}).rule!=='GATE') bad('recommendFilter 缺 mean 未 GATE');

console.log(issues === 0 ? '\n✓ 模糊测试未发现问题' : `\n发现 ${issues} 个问题`);
