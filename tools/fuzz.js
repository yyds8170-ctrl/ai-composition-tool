/* 临时审查脚本：对纯函数做属性/模糊测试，找真实健壮性问题。 */
const { _deriveCrop, _jointGuard, _figureGround, _yoloNMS, _estTiltDeg } = require('../tests/pure-functions.js');

let issues = 0;
function bad(msg) { console.log('ISSUE:', msg); issues++; }
const rnd = (a, b) => a + Math.random() * (b - a);
const validNum = v => typeof v === 'number' && isFinite(v);

// 1. _deriveCrop: 随机 base，检查范围、NaN、三档单调
for (let i = 0; i < 20000; i++) {
  const base = [rnd(0, 45), rnd(0, 45), rnd(0, 45), rnd(0, 45)];
  for (const mode of ['loose', 'standard', 'tight']) {
    const out = _deriveCrop(base, mode);
    if (out.length !== 4) { bad('deriveCrop 长度!=4'); continue; }
    out.forEach(v => { if (!validNum(v)) bad('deriveCrop NaN: ' + v); if (v < 0 || v > 45) bad('deriveCrop 越界: ' + v); });
    const area = (100 - out[0] - out[2]) * (100 - out[1] - out[3]) / 10000;
    if (area < 0.33) bad('deriveCrop 面积低于 0.34: ' + area.toFixed(3));
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
for (let i = 0; i < 20000; i++) {
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

console.log(issues === 0 ? '\n✓ 模糊测试未发现问题' : `\n发现 ${issues} 个问题`);
