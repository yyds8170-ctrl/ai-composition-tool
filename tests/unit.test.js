/* =============================================================================
 * AI 构图助手 Pro · 纯函数单元测试
 * 运行：node tests/unit.test.js
 * 被测代码由 tools/extract-pure.js 从 index.html 逐字提取，保证与线上一致。
 * =============================================================================*/
const assert = require('assert');
const { _deriveCrop, _smartCrop, _classifyYaw, _gazeGuard, _edgeSnap, _jointGuard, _objectGuard, _portraitFraming, _aspectCrop, _figureGround, _yoloNMS, _estTiltDeg } = require('./pure-functions.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name); console.error('  ', e.message); process.exitCode = 1; }
}

/* -------------------- _deriveCrop（三档裁切） -------------------- */
test('deriveCrop: 无效 base 回退 [0,0,0,0]', () => {
  assert.deepStrictEqual(_deriveCrop(null, 'standard'), [0, 0, 0, 0]);
  assert.deepStrictEqual(_deriveCrop([1, 2], 'standard'), [0, 0, 0, 0]);
});
test('deriveCrop: standard 系数 1（按原始量）', () => {
  assert.deepStrictEqual(_deriveCrop([10, 10, 10, 10], 'standard'), [10, 10, 10, 10]);
});
test('deriveCrop: tight 系数 1.32', () => {
  assert.deepStrictEqual(_deriveCrop([10, 10, 10, 10], 'tight'), [13, 13, 13, 13]);
});
test('deriveCrop: loose 系数 0.55', () => {
  assert.deepStrictEqual(_deriveCrop([20, 20, 20, 20], 'loose'), [11, 11, 11, 11]);
});
test('deriveCrop: 单边 clamp 到 45', () => {
  const out = _deriveCrop([40, 40, 40, 40], 'tight');
  out.forEach(v => assert.ok(v <= 45));
});
test('deriveCrop: 保留面积下限 0.34（裁过头会回退）', () => {
  const out = _deriveCrop([40, 40, 40, 40], 'tight');
  const area = (100 - out[0] - out[2]) / 100 * (100 - out[1] - out[3]) / 100;
  assert.ok(area >= 0.34, '保留面积应 >= 0.34，实际 ' + area.toFixed(4));
});

/* -------------------- _jointGuard（关节裁切保护） -------------------- */
function mkPose(pts) {
  const pose = [];
  for (let i = 0; i < 33; i++) {
    const p = pts[i];
    pose.push(p ? { x: p[0], y: p[1], visibility: p[2] === undefined ? 1 : p[2] } : { x: 0, y: 0, visibility: 0 });
  }
  return pose;
}
test('jointGuard: 非人像原样返回', () => {
  const c = [0, 0, 0, 10];
  assert.deepStrictEqual(_jointGuard(c, mkPose({ 25: [0.5, 0.9] }), false), c);
});
test('jointGuard: 无效 crop 原样返回', () => {
  assert.deepStrictEqual(_jointGuard([0, 0, 0, 0], mkPose({ 25: [0.5, 0.9] }), true), [0, 0, 0, 0]);
  assert.deepStrictEqual(_jointGuard(null, mkPose({ 25: [0.5, 0.9] }), true), null);
});
test('jointGuard: pose 不足 29 点原样返回', () => {
  assert.deepStrictEqual(_jointGuard([0, 0, 0, 10], [{ x: 0, y: 0, visibility: 1 }], true), [0, 0, 0, 10]);
});
test('jointGuard: 下沿切膝盖 → 外移', () => {
  const out = _jointGuard([0, 0, 0, 10], mkPose({ 25: [0.5, 0.9] }), true);
  assert.ok(out[3] < 10, '下沿裁切量应减小，实际 ' + out[3]);
});
test('jointGuard: 下沿切脚踝 → 外移', () => {
  const out = _jointGuard([0, 0, 0, 5], mkPose({ 27: [0.5, 0.95] }), true);
  assert.ok(out[3] < 5, '下沿裁切量应减小，实际 ' + out[3]);
});
test('jointGuard: 上沿切肩膀 → 外移', () => {
  const out = _jointGuard([0, 20, 0, 0], mkPose({ 11: [0.5, 0.2] }), true);
  assert.ok(out[1] < 20, '上沿裁切量应减小，实际 ' + out[1]);
});
test('jointGuard: 上沿切肘部 → 外移', () => {
  const out = _jointGuard([0, 25, 0, 0], mkPose({ 13: [0.5, 0.25] }), true);
  assert.ok(out[1] < 25, '上沿裁切量应减小，实际 ' + out[1]);
});
test('jointGuard: 左沿切左手腕 → 外移', () => {
  const out = _jointGuard([15, 0, 0, 0], mkPose({ 15: [0.15, 0.5] }), true);
  assert.ok(out[0] < 15, '左沿裁切量应减小，实际 ' + out[0]);
});
test('jointGuard: 右沿切右手腕 → 外移', () => {
  const out = _jointGuard([0, 0, 15, 0], mkPose({ 16: [0.85, 0.5] }), true);
  assert.ok(out[2] < 15, '右沿裁切量应减小，实际 ' + out[2]);
});
test('jointGuard: 躯干前的手（x 在中间）不误触发', () => {
  assert.deepStrictEqual(_jointGuard([15, 0, 0, 0], mkPose({ 15: [0.5, 0.5] }), true), [15, 0, 0, 0]);
});
test('jointGuard: 低可见度关节不触发', () => {
  assert.deepStrictEqual(_jointGuard([0, 0, 0, 10], mkPose({ 25: [0.5, 0.9, 0.3] }), true), [0, 0, 0, 10]);
});
test('jointGuard: 关节不在边缘附近不触发', () => {
  assert.deepStrictEqual(_jointGuard([0, 0, 0, 10], mkPose({ 25: [0.5, 0.5] }), true), [0, 0, 0, 10]);
});
test('jointGuard: 只减不增', () => {
  const c = [12, 22, 12, 12];
  const out = _jointGuard(c, mkPose({
    11: [0.5, 0.22], 25: [0.5, 0.88], 15: [0.12, 0.5], 16: [0.88, 0.5]
  }), true);
  [0, 1, 2, 3].forEach(i => assert.ok(out[i] <= c[i], '边 ' + i + ' 不应增大'));
});

/* -------------------- _objectGuard（通用物体边界保护） -------------------- */
function mkBox(cls, score, x1, y1, x2, y2) {
  return { class: cls, score: score, b: [x1, y1, x2, y2] };
}
test('objectGuard: 无效 crop / 空框原样返回', () => {
  assert.deepStrictEqual(_objectGuard([0, 0, 0, 0], [mkBox('dog', 0.9, 0.1, 0.3, 0.4, 0.7)]), [0, 0, 0, 0]);
  assert.deepStrictEqual(_objectGuard([15, 10, 10, 10], []), [15, 10, 10, 10]);
  assert.deepStrictEqual(_objectGuard(null, [mkBox('dog', 0.9, 0.1, 0.3, 0.4, 0.7)]), null);
});
test('objectGuard: 左边缘切穿非人物体 → 左沿外移纳入', () => {
  const out = _objectGuard([15, 10, 10, 10], [mkBox('dog', 0.9, 0.10, 0.30, 0.40, 0.70)]);
  assert.ok(out[0] < 15, '左沿裁切量应减小，实际 ' + out[0]);
  assert.deepStrictEqual(out[1], 10); assert.deepStrictEqual(out[2], 10); assert.deepStrictEqual(out[3], 10);
});
test('objectGuard: 右边缘切穿 → 右沿外移', () => {
  const out = _objectGuard([10, 10, 10, 10], [mkBox('car', 0.9, 0.60, 0.30, 0.94, 0.70)]);
  assert.ok(out[2] < 10, '右沿裁切量应减小，实际 ' + out[2]);
});
test('objectGuard: 上边缘切穿 → 上沿外移', () => {
  const out = _objectGuard([10, 13, 10, 10], [mkBox('cat', 0.9, 0.30, 0.10, 0.70, 0.40)]);
  assert.ok(out[1] < 13, '上沿裁切量应减小，实际 ' + out[1]);
});
test('objectGuard: 下边缘切穿 → 下沿外移', () => {
  const out = _objectGuard([10, 10, 10, 11], [mkBox('dog', 0.9, 0.30, 0.60, 0.70, 0.92)]);
  assert.ok(out[3] < 11, '下沿裁切量应减小，实际 ' + out[3]);
});
test('objectGuard: 完全在保留区外的物体不护', () => {
  assert.deepStrictEqual(_objectGuard([15, 10, 10, 10], [mkBox('dog', 0.9, 0.0, 0.3, 0.08, 0.7)]), [15, 10, 10, 10]);
});
test('objectGuard: 完整在保留区内的物体不触发', () => {
  assert.deepStrictEqual(_objectGuard([10, 10, 10, 10], [mkBox('dog', 0.9, 0.4, 0.4, 0.6, 0.6)]), [10, 10, 10, 10]);
});
test('objectGuard: person 类跳过（已由关节/硬保护覆盖）', () => {
  assert.deepStrictEqual(_objectGuard([15, 10, 10, 10], [mkBox('person', 0.95, 0.10, 0.30, 0.40, 0.70)]), [15, 10, 10, 10]);
});
test('objectGuard: 背景家具跳过（couch/dining table）', () => {
  assert.deepStrictEqual(_objectGuard([15, 10, 10, 10], [mkBox('couch', 0.9, 0.10, 0.30, 0.40, 0.70)]), [15, 10, 10, 10]);
  assert.deepStrictEqual(_objectGuard([15, 10, 10, 10], [mkBox('dining table', 0.9, 0.10, 0.30, 0.40, 0.70)]), [15, 10, 10, 10]);
});
test('objectGuard: 低置信度（<0.4）跳过', () => {
  assert.deepStrictEqual(_objectGuard([15, 10, 10, 10], [mkBox('dog', 0.3, 0.10, 0.30, 0.40, 0.70)]), [15, 10, 10, 10]);
});
test('objectGuard: 过小物体（面积<2%）跳过', () => {
  assert.deepStrictEqual(_objectGuard([10, 10, 10, 10], [mkBox('bottle', 0.9, 0.50, 0.50, 0.55, 0.55)]), [10, 10, 10, 10]);
});
test('objectGuard: 单边移动上限 5%', () => {
  const out = _objectGuard([8, 10, 10, 10], [mkBox('dog', 0.9, 0.0, 0.30, 0.40, 0.70)]);
  assert.deepStrictEqual(out[0], 3, '需移动8%应限幅到3%，实际 ' + out[0]);
});
test('objectGuard: 只减不增', () => {
  const c = [15, 13, 12, 11];
  const out = _objectGuard(c, [mkBox('dog', 0.9, 0.05, 0.05, 0.95, 0.95)]);
  [0, 1, 2, 3].forEach(i => assert.ok(out[i] <= c[i], '边 ' + i + ' 不应增大'));
});
test('objectGuard: 右边界外溢(x2>1) clamp 后纳入到不裁', () => {
  const out = _objectGuard([4, 3, 4, 3], [mkBox('bowl', 0.9, 0.78, 0.5, 1.005, 0.9)]);
  assert.deepStrictEqual(out[2], 0);
});
test('objectGuard: 左边界外溢(x1<0) clamp 后仍保护', () => {
  const out = _objectGuard([6, 3, 3, 3], [mkBox('cat', 0.9, -0.04, 0.2, 0.9, 0.95)]);
  assert.ok(out[0] <= 1, '左沿应外移到限幅/0，实际 ' + out[0]);
});

/* -------------------- _portraitFraming（人像近眼上三分 + 景别化裁切） -------------------- */
function pfInfo(o){
  return Object.assign({pl:0.30,pt:0.20,pr:0.70,pb:0.80,ph:0.60,aspect:0.5625,isCloseUp:false,isPerson:true}, o||{});
}
// 计算某 crop 下的眼位（eyeK 与函数内一致：半身 0.10 / 七分 0.08）
function pfEye(out, info){
  const eyeK=info.ph>=0.50?0.10:0.08;
  const T=out[1]/100, H=1-T-out[3]/100;
  return (info.pt+eyeK*info.ph-T)/H;
}
test('portraitFraming: 非人像/特写/横图/缺框 原样返回', () => {
  const c=[6,1,6,2];
  assert.deepStrictEqual(_portraitFraming(c, pfInfo({isPerson:false})), c);
  assert.deepStrictEqual(_portraitFraming(c, pfInfo({isCloseUp:true})), c);
  assert.deepStrictEqual(_portraitFraming(c, pfInfo({aspect:1.0})), c);
  assert.deepStrictEqual(_portraitFraming(c, pfInfo({aspect:0.92})), c);
  assert.deepStrictEqual(_portraitFraming(c, pfInfo({pt:NaN})), c);
});
test('portraitFraming: 全身(ph<0.34)与特写(ph>=0.72)不硬裁', () => {
  const c=[0,0,0,0];
  assert.deepStrictEqual(_portraitFraming(c, pfInfo({pt:0.62,pb:0.87,ph:0.25})), c); // 远景全身
  assert.deepStrictEqual(_portraitFraming(c, pfInfo({pt:0.05,pb:0.95,ph:0.90})), c); // 特写
});
test('portraitFraming: 眼睛位置已合理(<=0.42)不触发', () => {
  const c=[0,0,0,0];
  // 半身，眼睛在画面 ~0.26，构图正常
  assert.deepStrictEqual(_portraitFraming(c, pfInfo({pt:0.20,pb:0.75,ph:0.55})), c);
});
test('portraitFraming: 半身眼位偏低+头顶留白过大 → 触发，眼位锚定上三分', () => {
  const c=[6,1,6,2];
  const info=pfInfo({pl:0.30,pt:0.408,pr:0.70,pb:0.908,ph:0.50});
  const out=_portraitFraming(c, info);
  assert.notDeepStrictEqual(out, c);
  const eye=pfEye(out, info);
  assert.ok(Math.abs(eye-0.33)<0.03, '眼位应≈0.33，实际 '+eye);
  const T=out[1]/100, H=1-T-out[3]/100, W=1-out[0]/100-out[2]/100;
  assert.ok(H>=0.60, '长边护栏 H≥0.60，实际 '+H);
  assert.ok(H*W>=0.36, '保留面积≥0.36，实际 '+(H*W));
  assert.ok(T<=info.pt-0.04, '不切头顶');
  assert.ok(T+H>=info.pb+0.04, '不切身体下沿');
  assert.ok(out[0]/100<=info.pl-0.03, '不裁左侧人体');
  assert.ok(out[2]/100<=1-info.pr-0.03, '不裁右侧人体');
});
test('portraitFraming: 七分人像眼位偏低 → 触发且不切腿', () => {
  const c=[6,6,6,4];
  const info=pfInfo({pl:0.31,pt:0.447,pr:0.43,pb:0.827,ph:0.38});
  const out=_portraitFraming(c, info);
  assert.notDeepStrictEqual(out, c);
  const eye=pfEye(out, info);
  assert.ok(Math.abs(eye-0.33)<0.04, '眼位应≈0.33，实际 '+eye);
  const T=out[1]/100, H=1-T-out[3]/100;
  assert.ok(T+H>=info.pb+0.06, '七分身底边不得切到腿');
  assert.ok(H>=0.60, '长边护栏');
});
test('portraitFraming: 人物已到画面底、眼位过低 → 放弃（不切腿，宁缺毋滥）', () => {
  const c=[6,5,5,0];
  const info=pfInfo({pl:0.25,pt:0.582,pr:0.75,pb:1.0,ph:0.42});
  assert.deepStrictEqual(_portraitFraming(c, info), c);
});
test('portraitFraming: 触发后输出确定性', () => {
  const c=[6,1,6,2];
  const info=pfInfo({pl:0.30,pt:0.408,pr:0.70,pb:0.908,ph:0.50});
  assert.deepStrictEqual(_portraitFraming(c, info), _portraitFraming(c, info));
});

/* -------------------- _figureGround（主体背景分离） -------------------- */
test('figureGround: 非数字输入返回 null', () => {
  assert.strictEqual(_figureGround('a', 100), null);
  assert.strictEqual(_figureGround(100, null), null);
  assert.strictEqual(_figureGround(NaN, 100), null);
});
test('figureGround: 强逆光（diff≥44 且 bg≥150）→ 强提示', () => {
  const tip = _figureGround(110, 160);
  assert.ok(tip && tip.indexOf('逆光') >= 0);
});
test('figureGround: 弱逆光（diff≥30 且 bg≥140）→ 弱提示', () => {
  const tip = _figureGround(115, 145);
  assert.ok(tip && tip.indexOf('略亮') >= 0);
});
test('figureGround: 差值大但背景不亮（夜景）→ null', () => {
  assert.strictEqual(_figureGround(60, 120), null);
});
test('figureGround: 背景不明显亮于脸 → null', () => {
  assert.strictEqual(_figureGround(130, 135), null);
  assert.strictEqual(_figureGround(150, 140), null);
});
test('figureGround: 临界值（diff=44 bg=150 触发）', () => {
  assert.ok(_figureGround(106, 150));
  assert.strictEqual(_figureGround(121, 140), null);
});

/* -------------------- _yoloNMS（非极大值抑制） -------------------- */
test('yoloNMS: 空框返回 []', () => {
  assert.deepStrictEqual(_yoloNMS([], [], 0.45), []);
});
test('yoloNMS: 高重叠框保留高分框', () => {
  const boxes = [[0, 0, 10, 10], [0.5, 0.5, 10.5, 10.5]];
  assert.deepStrictEqual(_yoloNMS(boxes, [0.9, 0.5], 0.45), [0]);
});
test('yoloNMS: 完全分离框都保留', () => {
  const boxes = [[0, 0, 10, 10], [50, 50, 60, 60]];
  assert.deepStrictEqual(_yoloNMS(boxes, [0.9, 0.8], 0.45).sort(), [0, 1]);
});
test('yoloNMS: 高分框优先', () => {
  const boxes = [[0, 0, 10, 10], [0.5, 0.5, 10.5, 10.5]];
  assert.deepStrictEqual(_yoloNMS(boxes, [0.3, 0.95], 0.45), [1]);
});
test('yoloNMS: 阈值越小抑制越强', () => {
  const boxes = [[0, 0, 10, 10], [2, 2, 12, 12]];
  const a = _yoloNMS(boxes, [0.9, 0.8], 0.05).length;
  const b = _yoloNMS(boxes, [0.9, 0.8], 0.9).length;
  assert.ok(a <= b);
});

/* -------------------- _estTiltDeg（水平倾斜估计） -------------------- */
const W = 60, H = 60, TH = 10;
function tiltField(angleDeg, fraction) {
  const gx = new Float32Array(W * H), gy = new Float32Array(W * H), gm = new Float32Array(W * H);
  const rad = angleDeg * Math.PI / 180;
  const ax = Math.cos(rad), ay = Math.sin(rad);
  const count = Math.floor(W * H * fraction);
  for (let i = 0; i < count; i++) { gx[i] = ax * 100; gy[i] = ay * 100; gm[i] = 100; }
  return { gx, gy, gm };
}
test('estTiltDeg: 无水平结构 → deg0 conf0', () => {
  const gx = new Float32Array(W * H), gy = new Float32Array(W * H), gm = new Float32Array(W * H);
  const out = _estTiltDeg(gx, gy, gm, W, H, TH);
  assert.strictEqual(out.deg, 0);
  assert.strictEqual(out.conf, 0);
});
test('estTiltDeg: 水平边缘（无倾斜）→ deg≈0 高置信', () => {
  const f = tiltField(90, 0.1);
  const out = _estTiltDeg(f.gx, f.gy, f.gm, W, H, TH);
  assert.ok(Math.abs(out.deg) < 1.5, 'deg 应接近 0，实际 ' + out.deg);
  assert.ok(out.conf > 60, '置信应较高，实际 ' + out.conf);
});
test('estTiltDeg: 倾斜约 -5° 能检出', () => {
  const f = tiltField(85, 0.1);
  const out = _estTiltDeg(f.gx, f.gy, f.gm, W, H, TH);
  assert.ok(Math.abs(out.deg + 5) < 2, 'deg 应接近 -5，实际 ' + out.deg);
});
test('estTiltDeg: 倾斜超 10° → 不可靠', () => {
  const f = tiltField(75, 0.1);
  assert.strictEqual(_estTiltDeg(f.gx, f.gy, f.gm, W, H, TH).deg, 0);
});
test('estTiltDeg: 弱边缘被忽略', () => {
  const gx = new Float32Array(W * H), gy = new Float32Array(W * H), gm = new Float32Array(W * H);
  for (let i = 0; i < 200; i++) { gx[i] = 0; gy[i] = 12; gm[i] = 12; }
  assert.strictEqual(_estTiltDeg(gx, gy, gm, W, H, TH).conf, 0);
});

/* -------------------- v8.5.0 _smartCrop 该裁才裁最小修正 -------------------- */
test('smartCrop: 主体居中→完全不裁（杜绝对称乱裁）', () => {
  assert.deepStrictEqual(_smartCrop(0.5, 0.5), [0, 0, 0, 0]);
  assert.deepStrictEqual(_smartCrop(0.45, 0.55), [0, 0, 0, 0]);
});
test('smartCrop: 主体在三分点附近→不裁', () => {
  assert.deepStrictEqual(_smartCrop(0.35, 0.65), [0, 0, 0, 0]);
});
test('smartCrop: 轻微偏心→不裁（小于最小触发）', () => {
  assert.deepStrictEqual(_smartCrop(0.33, 0.67), [0, 0, 0, 0]);
});
test('smartCrop: 主体明显偏左→只裁右侧空白，绝不裁左侧', () => {
  const o = _smartCrop(0.25, 0.5);
  assert.strictEqual(o[0], 0, '左边不裁（主体在左）');
  assert.ok(o[2] > 0, '应裁右侧空白，实际 ' + o[2]);
  assert.strictEqual(o[1], 0); assert.strictEqual(o[3], 0);
});
test('smartCrop: 主体明显偏右→只裁左侧空白', () => {
  const o = _smartCrop(0.75, 0.5);
  assert.strictEqual(o[2], 0, '右边不裁（主体在右）');
  assert.ok(o[0] > 0, '应裁左侧空白，实际 ' + o[0]);
});
test('smartCrop: 主体偏上→只裁下侧', () => {
  const o = _smartCrop(0.5, 0.30);
  assert.strictEqual(o[1], 0); assert.ok(o[3] > 0, '应裁下侧，实际 ' + o[3]);
});
test('smartCrop: 主体偏下→只裁上侧', () => {
  const o = _smartCrop(0.5, 0.75);
  assert.ok(o[1] > 0, '应裁上侧，实际 ' + o[1]); assert.strictEqual(o[3], 0);
});
test('smartCrop: 偏左修正后主体≈左三分点（未触顶时精确）', () => {
  const cx = 0.32, o = _smartCrop(cx, 0.5);
  const fW = 1 - o[0] - o[2];
  assert.ok(Math.abs(cx / fW - 0.375) < 0.02, '裁后主体应≈0.375，实际 ' + (cx / fW).toFixed(3));
});
test('smartCrop: 极端偏左触顶时也只裁到上限，不硬凑三分', () => {
  const cx = 0.25, o = _smartCrop(cx, 0.5);
  const fW = 1 - o[0] - o[2];
  assert.ok(Math.abs(o[2] - 0.18) < 1e-9, '应被限制在0.18，实际 ' + o[2]);
  assert.ok(cx / fW < 0.35, '触顶时主体仍偏左，不强行拉回，实际 ' + (cx / fW).toFixed(3));
});
test('smartCrop: 裁切量受上限约束', () => {
  const o = _smartCrop(0.05, 0.05);
  assert.ok(o[2] <= 0.18 + 1e-9, '水平单边≤0.18，实际 ' + o[2]);
  assert.ok(o[3] <= 0.15 + 1e-9, '垂直单边≤0.15，实际 ' + o[3]);
});
test('smartCrop: vCrop=false 时垂直方向不裁（风光/建筑）', () => {
  assert.deepStrictEqual(_smartCrop(0.5, 0.25, { vCrop: false }), [0, 0, 0, 0]);
  assert.deepStrictEqual(_smartCrop(0.5, 0.75, { vCrop: false }), [0, 0, 0, 0]);
});
test('smartCrop: 非数中心→当居中不裁', () => {
  assert.deepStrictEqual(_smartCrop(NaN, undefined), [0, 0, 0, 0]);
});
test('smartCrop: 水平偏心但垂直在死区→只裁水平', () => {
  const o = _smartCrop(0.28, 0.5);
  assert.ok(o[2] > 0); assert.strictEqual(o[1], 0); assert.strictEqual(o[3], 0);
});
test('smartCrop: 确定性', () => {
  assert.deepStrictEqual(_smartCrop(0.25, 0.75), _smartCrop(0.25, 0.75));
});

/* -------------------- v8.5.0 _aspectCrop 场景化 16:9 宽幅 -------------------- */
const AC_FA = 16 / 9;
function acInfo(over) { return Object.assign({ scene: 'landscape', isPerson: false, aspect: 1.5, tiltDeg: 0, tiltConf: 0, cx: 0.5, cy: 0.5, ratio: 0.5, horizonOk: false, boxes: [] }, over || {}); }
function acRatio(out, aspect) { const fH = 1 - (out[1] + out[3]) / 100, fW = 1 - (out[0] + out[2]) / 100; return aspect * fW / fH; }
test('aspectCrop: 非风光场景（人像/美食/通用）原样返回', () => {
  assert.deepStrictEqual(_aspectCrop([0, 0, 0, 0], acInfo({ scene: 'portrait' })), [0, 0, 0, 0]);
  assert.deepStrictEqual(_aspectCrop([0, 0, 0, 0], acInfo({ scene: 'food' })), [0, 0, 0, 0]);
  assert.deepStrictEqual(_aspectCrop([0, 0, 0, 0], acInfo({ scene: 'general' })), [0, 0, 0, 0]);
});
test('aspectCrop: 竖幅/方图/超极端宽幅不触发', () => {
  assert.deepStrictEqual(_aspectCrop([0, 0, 0, 0], acInfo({ aspect: 0.75 })), [0, 0, 0, 0]);
  assert.deepStrictEqual(_aspectCrop([0, 0, 0, 0], acInfo({ aspect: 1.33 })), [0, 0, 0, 0]);
  assert.deepStrictEqual(_aspectCrop([0, 0, 0, 0], acInfo({ aspect: 2.3 })), [0, 0, 0, 0]);
});
test('aspectCrop: 有人物交人像通道，不做宽幅', () => {
  assert.deepStrictEqual(_aspectCrop([0, 0, 0, 0], acInfo({ isPerson: true })), [0, 0, 0, 0]);
});
test('aspectCrop: 明显倾斜（高置信>3°）先找平，不做宽幅', () => {
  assert.deepStrictEqual(_aspectCrop([0, 0, 0, 0], acInfo({ tiltConf: 50, tiltDeg: 5 })), [0, 0, 0, 0]);
  assert.deepStrictEqual(_aspectCrop([0, 0, 0, 0], acInfo({ tiltConf: 60, tiltDeg: -4 })), [0, 0, 0, 0]);
});
test('aspectCrop: 横拍风光 1.5 无主体→裁上下成 16:9，画幅正确', () => {
  const out = _aspectCrop([0, 0, 0, 0], acInfo({ aspect: 1.5 }));
  assert.ok(out[0] === 0 && out[2] === 0, '裁上下应满宽，实际 ' + JSON.stringify(out));
  assert.ok(out[1] + out[3] >= 5, '应裁掉上下，实际 ' + JSON.stringify(out));
  assert.ok(Math.abs(acRatio(out, 1.5) - AC_FA) <= 0.08, '裁后宽高比应≈16:9，实际 ' + acRatio(out, 1.5).toFixed(3));
  const fH = 1 - (out[1] + out[3]) / 100;
  assert.ok(fH >= 0.80, '裁后高占比≥0.80，实际 ' + fH);
});
test('aspectCrop: 横拍水景 1.955 无主体→裁左右成 16:9，画幅正确', () => {
  const out = _aspectCrop([0, 0, 0, 0], acInfo({ scene: 'waterscape', aspect: 1.955 }));
  assert.ok(out[1] === 0 && out[3] === 0, '裁左右应满高，实际 ' + JSON.stringify(out));
  assert.ok(out[0] + out[2] >= 5, '应裁掉左右，实际 ' + JSON.stringify(out));
  assert.ok(Math.abs(acRatio(out, 1.955) - AC_FA) <= 0.08, '裁后宽高比应≈16:9，实际 ' + acRatio(out, 1.955).toFixed(3));
});
test('aspectCrop: 夜景 1.5 同样触发', () => {
  const out = _aspectCrop([0, 0, 0, 0], acInfo({ scene: 'night', aspect: 1.5 }));
  assert.ok(out[1] + out[3] >= 5, '夜景应裁上下，实际 ' + JSON.stringify(out));
  assert.ok(Math.abs(acRatio(out, 1.5) - AC_FA) <= 0.08);
});
test('aspectCrop: 地平线保持原相对位置（上三分）', () => {
  const out = _aspectCrop([0, 0, 0, 0], acInfo({ aspect: 1.5, horizonOk: true, ratio: 0.35 }));
  const T = out[1] / 100, fH = 1 - (out[1] + out[3]) / 100;
  const ratioAfter = (0.35 - T) / fH;
  assert.ok(Math.abs(ratioAfter - 0.35) < 0.02, '地平线相对位置应保持≈0.35，实际 ' + ratioAfter.toFixed(3));
});
test('aspectCrop: 居中主体装得下时不切主体', () => {
  const out = _aspectCrop([0, 0, 0, 0], acInfo({ aspect: 1.5, boxes: [{ b: [0.3, 0.1, 0.7, 0.9] }] }));
  const T = out[1] / 100, B = out[3] / 100;
  assert.ok(T <= 0.1 - 0.01 + 1e-9, '上边不切主体，T=' + T);
  assert.ok(B <= 1 - 0.9 - 0.01 + 1e-9, '下边不切主体，B=' + B);
  assert.ok(Math.abs(acRatio(out, 1.5) - AC_FA) <= 0.08);
});
test('aspectCrop: 主体垂直跨度过大装不下→放弃', () => {
  const out = _aspectCrop([0, 0, 0, 0], acInfo({ aspect: 1.5, boxes: [{ b: [0.2, 0.05, 0.8, 0.95] }] }));
  assert.deepStrictEqual(out, [0, 0, 0, 0]);
});
test('aspectCrop: 主体横跨左右两端（裁左右）装不下→放弃', () => {
  const out = _aspectCrop([0, 0, 0, 0], acInfo({ scene: 'waterscape', aspect: 1.955, boxes: [{ b: [0.02, 0.2, 0.98, 0.8] }] }));
  assert.deepStrictEqual(out, [0, 0, 0, 0]);
});
test('aspectCrop: 小主体（<1%）忽略，大主体贴边会被切→放弃', () => {
  // 大主体占满顶部（y0~0.98），裁上下必切→放弃
  const out = _aspectCrop([0, 0, 0, 0], acInfo({ aspect: 1.5, boxes: [{ b: [0.1, 0.0, 0.9, 0.98] }] }));
  assert.deepStrictEqual(out, [0, 0, 0, 0]);
});
test('aspectCrop: 确定性——同输入两次结果一致', () => {
  const i = acInfo({ aspect: 1.5, horizonOk: true, ratio: 0.4, boxes: [{ b: [0.25, 0.2, 0.75, 0.7] }] });
  assert.deepStrictEqual(_aspectCrop([0, 0, 0, 0], i), _aspectCrop([0, 0, 0, 0], i));
});

/* -------------------- v8.6.0 _classifyYaw 视线朝向 -------------------- */
function mkFace6(noseX, earR, earL) {
  return [{ x: 0.46, y: .4 }, { x: 0.54, y: .4 }, { x: noseX, y: .45 }, { x: 0.5, y: .5 },
  { x: earR, y: .42 }, { x: earL, y: .42 }];
}
test('classifyYaw: 正面（鼻在眼中点）→ frontal dir=0', () => {
  const r = _classifyYaw(mkFace6(0.50, 0.42, 0.58));
  assert.strictEqual(r.state, 'frontal'); assert.strictEqual(r.dir, 0);
});
test('classifyYaw: 近正面（|r|<0.10）→ frontal', () => {
  const r = _classifyYaw(mkFace6(0.506, 0.42, 0.58));
  assert.strictEqual(r.state, 'frontal');
});
test('classifyYaw: 脸朝右 3/4（鼻偏右、耳距同号）→ dir=+1', () => {
  const r = _classifyYaw(mkFace6(0.52, 0.40, 0.55));
  assert.strictEqual(r.state, 'three-quarter'); assert.strictEqual(r.dir, 1);
});
test('classifyYaw: 脸朝左 3/4 → dir=-1', () => {
  const r = _classifyYaw(mkFace6(0.48, 0.45, 0.60));
  assert.strictEqual(r.state, 'three-quarter'); assert.strictEqual(r.dir, -1);
});
test('classifyYaw: 鼻眼比与耳距符号矛盾 → dir=0（不判朝向）', () => {
  // 鼻偏右（rNose>0），但人为让耳距也偏成"朝左"：右耳近、左耳远
  const r = _classifyYaw([{ x: .46, y: .4 }, { x: .54, y: .4 }, { x: .52, y: .45 },
    { x: .5, y: .5 }, { x: .51, y: .4 }, { x: .59, y: .4 }]);
  assert.strictEqual(r.dir, 0);
});
test('classifyYaw: 点不足（<3）→ none', () => {
  assert.strictEqual(_classifyYaw([{ x: .46, y: .4 }, { x: .5, y: .45 }]).state, 'none');
});
test('classifyYaw: 非数组/空 → none', () => {
  assert.strictEqual(_classifyYaw(null).state, 'none');
  assert.strictEqual(_classifyYaw([]).state, 'none');
});
test('classifyYaw: 两眼重叠（espan≈0，纯侧）→ none', () => {
  const r = _classifyYaw([{ x: .5, y: .4 }, { x: .5, y: .4 }, { x: .5, y: .45 },
    { x: .5, y: .5 }, { x: .4, y: .42 }, { x: .6, y: .42 }]);
  assert.strictEqual(r.state, 'none');
});
test('classifyYaw: 大偏航（|r|>0.35）→ profile', () => {
  // 鼻移到 0.55：rNose=(0.55-0.5)/0.08=0.625>0.35；耳距同号
  const r = _classifyYaw(mkFace6(0.55, 0.38, 0.52));
  assert.strictEqual(r.state, 'profile'); assert.strictEqual(r.dir, 1);
});
test('classifyYaw: 缺耳点时退用鼻眼比', () => {
  const face = [{ x: .46, y: .4 }, { x: .54, y: .4 }, { x: .52, y: .45 }, { x: .5, y: .5 }];
  const r = _classifyYaw(face);
  assert.strictEqual(r.state, 'three-quarter'); assert.strictEqual(r.dir, 1);
});

/* -------------------- v8.6.0 _gazeGuard nose room 视线留白 -------------------- */
function gzInfo(o) {
  return Object.assign({ isCloseUp: false, faceCount: 1, yaw: { state: 'three-quarter', dir: 1 }, faceCx: 0.42 }, o);
}
test('gazeGuard: 脸朝右、略偏右 → 裁左单侧（脸到左三分、右留白）', () => {
  const out = _gazeGuard([0, 0, 0, 0], gzInfo({ yaw: { state: 'three-quarter', dir: 1 }, faceCx: 0.42 }));
  assert.strictEqual(out[0], 13); assert.strictEqual(out[1], 0); assert.strictEqual(out[2], 0); assert.strictEqual(out[3], 0);
});
test('gazeGuard: 脸朝左、略偏左 → 裁右单侧', () => {
  const out = _gazeGuard([0, 0, 0, 0], gzInfo({ yaw: { state: 'three-quarter', dir: -1 }, faceCx: 0.58 }));
  assert.strictEqual(out[0], 0); assert.strictEqual(out[2], 13);
});
test('gazeGuard: 正面（dir=0）→ 不裁', () => {
  assert.deepStrictEqual(_gazeGuard([0, 0, 0, 0], gzInfo({ yaw: { state: 'frontal', dir: 0 }, faceCx: 0.42 })), [0, 0, 0, 0]);
});
test('gazeGuard: 朝向不可信（dir=0）→ 不裁', () => {
  assert.deepStrictEqual(_gazeGuard([0, 0, 0, 0], gzInfo({ yaw: { state: 'three-quarter', dir: 0 }, faceCx: 0.42 })), [0, 0, 0, 0]);
});
test('gazeGuard: 多人（faceCount≠1）→ 不裁', () => {
  assert.deepStrictEqual(_gazeGuard([0, 0, 0, 0], gzInfo({ faceCount: 2 })), [0, 0, 0, 0]);
});
test('gazeGuard: 特写 → 不裁', () => {
  assert.deepStrictEqual(_gazeGuard([0, 0, 0, 0], gzInfo({ isCloseUp: true })), [0, 0, 0, 0]);
});
test('gazeGuard: 居中脸朝右需裁超 15% 上限 → 放弃', () => {
  assert.deepStrictEqual(_gazeGuard([0, 0, 0, 0], gzInfo({ faceCx: 0.5 })), [0, 0, 0, 0]);
});
test('gazeGuard: 脸已在目标位置（朝右脸在 0.33 更左）→ 不裁', () => {
  assert.deepStrictEqual(_gazeGuard([0, 0, 0, 0], gzInfo({ faceCx: 0.33 })), [0, 0, 0, 0]);
});
test('gazeGuard: 身体会被切（身后是身体、左缘伸到裁切线内）→ 放弃', () => {
  // 朝右裁左到 ~0.134；身体左缘 pl=0.10 落在裁切线内（会切到身后背部/肩），放弃
  const out = _gazeGuard([0, 0, 0, 0], gzInfo({ faceCx: 0.42, pl: 0.10, pr: 0.5 }));
  assert.deepStrictEqual(out, [0, 0, 0, 0]);
});
test('gazeGuard: 窗宽不足（<0.62）→ 放弃', () => {
  // 传入已很窄的 crop（L=0.30），再裁左使窗宽跌破 0.62
  const out = _gazeGuard([30, 0, 0, 0], gzInfo({ faceCx: 0.60, pl: 0.55, pr: 0.68 }));
  assert.deepStrictEqual(out, [30, 0, 0, 0]);
});
test('gazeGuard: 改善量过小（<4%）→ 不裁', () => {
  // 朝右目标 0.33，脸在 0.35（轻微），需裁 L=(0.35-0.33)/0.67=0.03（裁3%，<4% 放弃）
  assert.deepStrictEqual(_gazeGuard([0, 0, 0, 0], gzInfo({ faceCx: 0.35 })), [0, 0, 0, 0]);
});
test('gazeGuard: 保留前序 T/B（竖幅/宽幅已设上下），只改水平', () => {
  const out = _gazeGuard([0, 8, 0, 6], gzInfo({ faceCx: 0.42, pl: 0.35, pr: 0.5 }));
  assert.strictEqual(out[1], 8); assert.strictEqual(out[3], 6); assert.strictEqual(out[0], 13);
});
test('gazeGuard: 脸框（fl/fr）会被切 → 放弃', () => {
  // 朝右裁左到 ~0.134；身体默认安全，但脸框左缘 fl=0.10（左耳/后脑伸到身后）落在裁切线内，放弃
  const out = _gazeGuard([0, 0, 0, 0], gzInfo({ faceCx: 0.42, fl: 0.10, fr: 0.5 }));
  assert.deepStrictEqual(out, [0, 0, 0, 0]);
});
test('gazeGuard: 确定性——同输入两次一致', () => {
  const i = gzInfo({ faceCx: 0.42 });
  assert.deepStrictEqual(_gazeGuard([0, 0, 0, 0], i), _gazeGuard([0, 0, 0, 0], i));
});
test('gazeGuard: 非法输入（crop 长度错/无 info）→ 原样', () => {
  assert.deepStrictEqual(_gazeGuard([1, 2], gzInfo()), [1, 2]);
  assert.deepStrictEqual(_gazeGuard([0, 0, 0, 0], null), [0, 0, 0, 0]);
});


/* -------------------- _edgeSnap（v8.7.0 边缘能量吸附） -------------------- */
function mkEnergy(W, H, low) {
  const col = new Array(W).fill(0.8), row = new Array(H).fill(0.8);
  if (low && low.col) for (const k in low.col) col[+k] = low.col[k];
  if (low && low.row) for (const k in low.row) row[+k] = low.row[k];
  return { col, row, w: W, h: H };
}
test('edgeSnap: 未裁切（全 0）→ 原样', () => {
  const e = mkEnergy(100, 100, { col: { 11: 0.05 } });
  assert.deepStrictEqual(_edgeSnap([0, 0, 0, 0], e, {}), [0, 0, 0, 0]);
});
test('edgeSnap: 非法输入（crop 长度错/无 energy/无 col）→ 原样', () => {
  const e = mkEnergy(100, 100);
  assert.deepStrictEqual(_edgeSnap([1, 2], e, {}), [1, 2]);
  assert.deepStrictEqual(_edgeSnap([15, 0, 0, 0], null, {}), [15, 0, 0, 0]);
  assert.deepStrictEqual(_edgeSnap([15, 0, 0, 0], { row: [], w: 0 }, {}), [15, 0, 0, 0]);
});
test('edgeSnap: 邻域无更低能量（全高能量）→ 原样', () => {
  const e = mkEnergy(100, 100);
  assert.deepStrictEqual(_edgeSnap([15, 0, 0, 0], e, {}), [15, 0, 0, 0]);
});
test('edgeSnap: 左边少裁方向有低能量列 → 刀左移、少裁', () => {
  const e = mkEnergy(100, 100, { col: { 11: 0.05 } });
  assert.deepStrictEqual(_edgeSnap([15, 0, 0, 0], e, {}), [11, 0, 0, 0]);
});
test('edgeSnap: 低能量只在多裁方向（外侧）→ 忽略，不吸附', () => {
  const e = mkEnergy(100, 100, { col: { 19: 0.05 } });
  assert.deepStrictEqual(_edgeSnap([15, 0, 0, 0], e, {}), [15, 0, 0, 0]);
});
test('edgeSnap: 右边少裁方向低能量 → 刀右移、少裁', () => {
  const e = mkEnergy(100, 100, { col: { 89: 0.05 } });
  assert.deepStrictEqual(_edgeSnap([0, 0, 15, 0], e, {}), [0, 0, 11, 0]);
});
test('edgeSnap: 上边、下边低能量 → 各向少裁方向内收', () => {
  const e = mkEnergy(100, 100, { row: { 11: 0.05, 89: 0.05 } });
  assert.deepStrictEqual(_edgeSnap([0, 15, 0, 15], e, {}), [0, 11, 0, 11]);
});
test('edgeSnap: 四边同裁、四边外侧均有低能量 → 四边内收', () => {
  const e = mkEnergy(100, 100, { col: { 11: 0.05, 89: 0.05 }, row: { 11: 0.05, 89: 0.05 } });
  assert.deepStrictEqual(_edgeSnap([15, 15, 15, 15], e, {}), [11, 11, 11, 11]);
});
test('edgeSnap: 低能量列进入主体安全带 → 拒绝，原样', () => {
  const e = mkEnergy(100, 100, { col: { 11: 0.05 } });
  // 主体左缘 pl=0.12，左侧安全带到 0.10；idx=11 刀位 0.11 进入安全带，拒绝
  assert.deepStrictEqual(_edgeSnap([15, 0, 0, 0], e, { pl: 0.12, pr: 0.9 }), [15, 0, 0, 0]);
});
test('edgeSnap: 改善量不足（<0.10）→ 不吸附', () => {
  const e = mkEnergy(100, 100, { col: { 11: 0.25 } }); // 当前 0.8? 改当前刀位为 0.30
  e.col[15] = 0.30;
  assert.deepStrictEqual(_edgeSnap([15, 0, 0, 0], e, {}), [15, 0, 0, 0]);
});
test('edgeSnap: 目标位本身能量已不高（0.3）且无更干净缝 → 原样', () => {
  const e = mkEnergy(100, 100, { col: {} });
  e.col[15] = 0.30;
  assert.deepStrictEqual(_edgeSnap([15, 0, 0, 0], e, {}), [15, 0, 0, 0]);
});
test('edgeSnap: 只少裁——任何输出边裁切量不超过输入', () => {
  const e = mkEnergy(100, 100, { col: { 11: 0.05, 89: 0.05 }, row: { 11: 0.05, 89: 0.05 } });
  const c = [15, 15, 15, 15], out = _edgeSnap(c, e, {});
  [0, 1, 2, 3].forEach(i => assert.ok(out[i] <= c[i], '边 ' + i + ' 不应增大'));
});
test('edgeSnap: 确定性——同输入两次一致', () => {
  const e = mkEnergy(100, 100, { col: { 11: 0.05 } });
  assert.deepStrictEqual(_edgeSnap([15, 0, 0, 0], e, {}), _edgeSnap([15, 0, 0, 0], e, {}));
});

/* -------------------- 汇总 -------------------- */
if (process.exitCode) {
  console.log(`\n有测试失败：已通过 ${passed} 个`);
} else {
  console.log(`\n✓ 单元测试全部通过：${passed}/${passed}`);
}
