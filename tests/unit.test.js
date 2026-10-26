/* =============================================================================
 * AI 构图助手 Pro · 纯函数单元测试
 * 运行：node tests/unit.test.js
 * 被测代码由 tools/extract-pure.js 从 index.html 逐字提取，保证与线上一致。
 * =============================================================================*/
const assert = require('assert');
const { _deriveCrop, _smartCrop, _landscapeCrop, _classifyYaw, _gazeGuard, _edgeSnap, _rodGuard, _cloudCropIntentGuard, _jointGuard, _objectGuard, _portraitFraming, _aspectCrop, _figureGround, _yoloNMS, _estTiltDeg, _guidanceEyeLevel, _guidanceEyeOnGrid, _guidanceDistance, _guidanceOrientation, _faceLightSplit, _lightPosition, _warmLightHint, _windowLightHint, _lowAngleAdvice, _composeDiagnosis, _recommendFilter, _confBand, _medianBox, _consensusPerson, _sceneDebounce, _debangText, _applyPref, _lightDiagnosisPro, _gazeGuardPro, _guidanceDistancePro, _guidanceWaistLevel, _singlePersonGate, _classifyComposition, _composeOverlay, _finalPipelinePlan, _classifyMulti, _scenePrefix, _sceneComposeTip, _aimAlign, _composeVariants, _deadZoneStrength, _cropIntentFromBox, _directionsOppose, _hardProtectionHit, _localConf, _extractIntentLocal, _parseIntentCloud, _negotiateBox, _arbitrateCrop, _hueInWarmBand, _sunsetWarmGuard, _foodMisClassGuard, _symmetryGuard, _decloudPlan, _bandSatSignal, _symEdgeSignal, _foodEvidenceSignal, _cloudCropGuard, _personBoxOf, _proactiveComposition, _balanceCrop, _cropQualityScore, _saferCropVariant } = require('./pure-functions.js');

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

/* -------------------- v11.16.0 _landscapeCrop 边缘能量死区裁切 -------------------- */
// 构造能量图：fn(比例位置)→能量，0~1
function mkLcEnergy(colFn, rowFn, w, h) {
  w = w || 100; h = h || 100;
  const col = [], row = [];
  for (let i = 0; i < w; i++) col.push(colFn(i / w));
  for (let j = 0; j < h; j++) row.push(rowFn(j / h));
  return { col, row, w, h };
}
test('landscapeCrop: 无效能量图→全零', () => {
  assert.deepStrictEqual(_landscapeCrop(null, 0.5, 0.5), [0, 0, 0, 0]);
  assert.deepStrictEqual(_landscapeCrop({ col: [], row: [] }, 0.5, 0.5), [0, 0, 0, 0]);
});
test('landscapeCrop: 全画面均匀高能量→不裁（无死区）', () => {
  const e = mkLcEnergy(() => 0.8, () => 0.8);
  assert.deepStrictEqual(_landscapeCrop(e, 0.5, 0.5), [0, 0, 0, 0]);
});
test('landscapeCrop: 左侧大面积死区+重心偏右→裁左', () => {
  // 左 30% 几乎无能量，右侧丰富
  const e = mkLcEnergy(x => x < 0.3 ? 0.02 : 0.9, y => 0.8);
  const o = _landscapeCrop(e, 0.62, 0.5);

  assert.ok(o[0] > 0, '应裁左侧死区，实际 ' + o[0]);
  assert.strictEqual(o[2], 0, '右侧有内容不裁');
});
test('landscapeCrop: 顶部大片空白天空+重心偏下→裁上', () => {
  const e = mkLcEnergy(x => 0.8, y => y < 0.3 ? 0.02 : 0.9);
  const o = _landscapeCrop(e, 0.5, 0.62);
  assert.ok(o[1] > 0, '应裁顶部死区，实际 ' + o[1]);
  assert.strictEqual(o[3], 0, '底部有内容不裁');
});
test('landscapeCrop: 单边裁切不超过上限 16%', () => {
  const e = mkLcEnergy(x => x < 0.5 ? 0.01 : 0.95, y => 0.8);
  const o = _landscapeCrop(e, 0.7, 0.5);
  assert.ok(o[0] <= 0.16 + 1e-9, '左裁上限0.16，实际 ' + o[0]);
});
test('landscapeCrop: 保留窗宽高均不低于 66%', () => {
  const e = mkLcEnergy(x => (x < 0.3 ? 0.01 : x > 0.75 ? 0.01 : 0.9), y => 0.8);
  const o = _landscapeCrop(e, 0.5, 0.5);
  assert.ok(1 - o[0] - o[2] >= 0.659, '保留宽≥66%，实际 ' + (1 - o[0] - o[2]).toFixed(3));
  assert.ok(1 - o[1] - o[3] >= 0.659, '保留高≥66%，实际 ' + (1 - o[1] - o[3]).toFixed(3));
});
test('landscapeCrop: 死区但重心在中央→不裁（避免误切平衡构图）', () => {
  // 左侧虽低能量但重心在正中 0.5，不应触发水平裁
  const e = mkLcEnergy(x => x < 0.16 ? 0.02 : 0.9, y => 0.8);
  const o = _landscapeCrop(e, 0.5, 0.5);
  assert.strictEqual(o[0], 0, '重心居中不裁水平');
});
test('landscapeCrop: v=false 时垂直方向不裁', () => {
  const e = mkLcEnergy(x => 0.8, y => y < 0.3 ? 0.02 : 0.9);
  const o = _landscapeCrop(e, 0.5, 0.62, { v: false });
  assert.strictEqual(o[1], 0); assert.strictEqual(o[3], 0);
});
test('landscapeCrop: 裁切值均非负', () => {
  const e = mkLcEnergy(x => x < 0.3 ? 0.02 : 0.9, y => y < 0.3 ? 0.02 : 0.9);
  _landscapeCrop(e, 0.6, 0.6).forEach(v => assert.ok(v >= 0));
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

/* -------------------- _rodGuard（v8.8.0 RoD 背景保护） -------------------- */
// 按逐像素亮度 l(0-255)/显著性 s(0-1) 构建行/列前缀和（与 analyzePixels 输出同构）
function mkRod(W, H, pix) {
  const rL = new Float64Array(H + 1), rL2 = new Float64Array(H + 1), rS = new Float64Array(H + 1);
  const cL = new Float64Array(W + 1), cL2 = new Float64Array(W + 1), cS = new Float64Array(W + 1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const q = pix(x, y);
      rL[y + 1] += q.l; rL2[y + 1] += q.l * q.l; rS[y + 1] += q.s;
      cL[x + 1] += q.l; cL2[x + 1] += q.l * q.l; cS[x + 1] += q.s;
    }
  }
  for (let x = 0; x < W; x++) { cL[x + 1] += cL[x]; cL2[x + 1] += cL2[x]; cS[x + 1] += cS[x]; }
  for (let y = 0; y < H; y++) { rL[y + 1] += rL[y]; rL2[y + 1] += rL2[y]; rS[y + 1] += rS[y]; }
  return { w: W, h: H, rL, rL2, rS, cL, cL2, cS };
}
test('rodGuard: 未裁切（全 0）→ 原样', () => {
  const rod = mkRod(100, 100, () => ({ l: 100, s: 0.05 }));
  assert.deepStrictEqual(_rodGuard([0, 0, 0, 0], rod, {}), [0, 0, 0, 0]);
});
test('rodGuard: 非法输入（crop 长度错/无 rod）→ 原样', () => {
  const rod = mkRod(100, 100, () => ({ l: 100, s: 0.05 }));
  assert.deepStrictEqual(_rodGuard([1, 2], rod, {}), [1, 2]);
  assert.deepStrictEqual(_rodGuard([0, 10, 0, 0], null, {}), [0, 10, 0, 0]);
  assert.deepStrictEqual(_rodGuard([0, 10, 0, 0], { w: 1 }, {}), [0, 10, 0, 0]);
});
test('rodGuard: 均匀中性普通天空/地面（低饱和无层次）→ 不动', () => {
  const rod = mkRod(100, 100, () => ({ l: 100, s: 0.05 }));
  assert.deepStrictEqual(_rodGuard([0, 10, 0, 8], rod, {}), [0, 10, 0, 8]);
});
test('rodGuard: 顶部晚霞（高饱和+云层次双高）→ 上边归零保留', () => {
  const rod = mkRod(100, 100, (x, y) => y < 15 ? { l: x % 2 ? 150 : 220, s: 0.7 } : { l: 80, s: 0.1 });
  assert.deepStrictEqual(_rodGuard([0, 10, 0, 0], rod, {}), [0, 0, 0, 0]);
});
test('rodGuard: 底部水面/倒影（高饱和+波光双高）→ 下边归零保留', () => {
  const rod = mkRod(100, 100, (x, y) => y >= 85 ? { l: x % 2 ? 140 : 210, s: 0.65 } : { l: 85, s: 0.12 });
  assert.deepStrictEqual(_rodGuard([0, 0, 0, 10], rod, {}), [0, 0, 0, 0]);
});
test('rodGuard: 纯蓝天（高饱和但零层次方差）→ 仅单高，少裁 2%', () => {
  const rod = mkRod(100, 100, (x, y) => y < 15 ? { l: 128, s: 0.6 } : { l: 80, s: 0.1 });
  assert.deepStrictEqual(_rodGuard([0, 10, 0, 0], rod, {}), [0, 8, 0, 0]);
});
test('rodGuard: 夜景杂乱暗前景（低饱和无方差）→ 不动，保持宽幅裁切', () => {
  const rod = mkRod(100, 100, (x, y) => y >= 85 ? { l: 20, s: 0.02 } : { l: 90, s: 0.15 });
  assert.deepStrictEqual(_rodGuard([0, 0, 0, 12], rod, {}), [0, 0, 0, 12]);
});
test('rodGuard: 整片高饱和（全图绿植，strip 与全图密度接近）→ 密度比不足，不触发', () => {
  const rod = mkRod(100, 100, (x, y) => ({ l: 90 + (x % 3 ? 10 : -10), s: 0.5 }));
  const out = _rodGuard([0, 10, 0, 10], rod, {});
  assert.deepStrictEqual(out, [0, 10, 0, 10]);
});
test('rodGuard: 只少裁——输出上/下边裁切量不超过输入', () => {
  const rod = mkRod(100, 100, (x, y) => y < 15 ? { l: x % 2 ? 150 : 220, s: 0.7 } : { l: 80, s: 0.1 });
  const c = [0, 10, 0, 9], out = _rodGuard(c, rod, {});
  assert.ok(out[1] <= c[1] && out[3] <= c[3]);
});
test('rodGuard: 不碰左右边——水平留白归 _gazeGuard', () => {
  const rod = mkRod(100, 100, (x, y) => x < 15 ? { l: x % 2 ? 150 : 220, s: 0.7 } : { l: 80, s: 0.1 });
  const out = _rodGuard([12, 0, 0, 0], rod, {});
  assert.strictEqual(out[0], 12);
  assert.strictEqual(out[2], 0);
});
test('rodGuard: 确定性——同输入两次一致', () => {
  const rod = mkRod(100, 100, (x, y) => y < 15 ? { l: x % 2 ? 150 : 220, s: 0.7 } : { l: 80, s: 0.1 });
  assert.deepStrictEqual(_rodGuard([0, 10, 0, 3], rod, {}), _rodGuard([0, 10, 0, 3], rod, {}));
});

/* -------------------- v8.9.0 _guidanceEyeLevel（机位同高） -------------------- */
test('eyeLevel: 头顶贴顶 → 提示放低', () => {
  const out = _guidanceEyeLevel({ faceConf: 0.9, headTop: 0.02, faceHR: 0.3, eyesY: 0.33 });
  assert.strictEqual(out.dir, 'down');
  assert.ok(/放低/.test(out.txt));
});
test('eyeLevel: 头顶明显悬空且眼掉中线以下 → 提示举高', () => {
  const out = _guidanceEyeLevel({ faceConf: 0.9, headTop: 0.30, faceHR: 0.25, eyesY: 0.45 });
  assert.strictEqual(out.dir, 'up');
});
test('eyeLevel: 无眼点时头顶悬空也举高（宁缺毋滥中的宽条件）', () => {
  const out = _guidanceEyeLevel({ faceConf: 0.9, headTop: 0.30, faceHR: 0.25, eyesY: null });
  assert.strictEqual(out.dir, 'up');
});
test('eyeLevel 负例: 正常头肩像 headTop=0.12 → null', () => {
  assert.strictEqual(_guidanceEyeLevel({ faceConf: 0.9, headTop: 0.12, faceHR: 0.3, eyesY: 0.33 }), null);
});
test('eyeLevel 负例: 远景小人 faceHR=0.03 → null', () => {
  assert.strictEqual(_guidanceEyeLevel({ faceConf: 0.9, headTop: 0.02, faceHR: 0.03, eyesY: 0.33 }), null);
});
test('eyeLevel 负例: 低置信 faceConf=0.6 → null', () => {
  assert.strictEqual(_guidanceEyeLevel({ faceConf: 0.6, headTop: 0.02, faceHR: 0.3, eyesY: 0.33 }), null);
});
test('eyeLevel 负例: 半身正常留白 headTop=0.20 → null', () => {
  assert.strictEqual(_guidanceEyeLevel({ faceConf: 0.9, headTop: 0.20, faceHR: 0.3, eyesY: 0.33 }), null);
});
test('eyeLevel 负例: 头顶悬空但眼仍在中线上(0.30) → null（不硬报仰）', () => {
  assert.strictEqual(_guidanceEyeLevel({ faceConf: 0.9, headTop: 0.30, faceHR: 0.25, eyesY: 0.30 }), null);
});

/* -------------------- v8.9.0 _guidanceEyeOnGrid（网格眼位） -------------------- */
test('eyeOnGrid: 眼睛掉到中线以下 → 对上横线', () => {
  const out = _guidanceEyeOnGrid({ faceConf: 0.9, eyesY: 0.48 });
  assert.ok(out && /上方那条横线/.test(out.txt));
});
test('eyeOnGrid: 眼睛太靠上 → 放低', () => {
  const out = _guidanceEyeOnGrid({ faceConf: 0.9, eyesY: 0.20 });
  assert.ok(out && /放低/.test(out.txt));
});
test('eyeOnGrid 负例: 理想眼位 0.33 → null', () => {
  assert.strictEqual(_guidanceEyeOnGrid({ faceConf: 0.9, eyesY: 0.33 }), null);
});
test('eyeOnGrid 负例: 宽容带内 0.36 → null', () => {
  assert.strictEqual(_guidanceEyeOnGrid({ faceConf: 0.9, eyesY: 0.36 }), null);
});
test('eyeOnGrid 负例: 无眼点 → null', () => {
  assert.strictEqual(_guidanceEyeOnGrid({ faceConf: 0.9, eyesY: null }), null);
});
test('eyeOnGrid 负例: 低置信 faceConf=0.6 → null', () => {
  assert.strictEqual(_guidanceEyeOnGrid({ faceConf: 0.6, eyesY: 0.48 }), null);
});

/* -------------------- v8.9.0 _guidanceDistance（距离/景别） -------------------- */
test('distance: 人太小 personHR=0.20 → 走近', () => {
  const out = _guidanceDistance({ faceConf: 0.9, personHR: 0.20, faceHR: 0.05 });
  assert.strictEqual(out.dir, 'near');
});
test('distance: 人太满 personHR=0.92 → 后退', () => {
  const out = _guidanceDistance({ faceConf: 0.9, personHR: 0.92, faceHR: 0.6 });
  assert.strictEqual(out.dir, 'far');
});
test('distance 负例: 半身正常 personHR=0.45 → null', () => {
  assert.strictEqual(_guidanceDistance({ faceConf: 0.9, personHR: 0.45, faceHR: 0.2 }), null);
});
test('distance 负例: 全身正常 personHR=0.33 → null', () => {
  assert.strictEqual(_guidanceDistance({ faceConf: 0.9, personHR: 0.33, faceHR: 0.12 }), null);
});
test('distance 负例: 远景无人体框 faceHR=0.03 → null', () => {
  assert.strictEqual(_guidanceDistance({ faceConf: 0.9, personHR: null, faceHR: 0.03 }), null);
});
test('distance 负例: 低置信 faceConf=0.65 → null', () => {
  assert.strictEqual(_guidanceDistance({ faceConf: 0.65, personHR: 0.20, faceHR: 0.05 }), null);
});
test('distance: 无人体框回退脸框 faceHR=0.10 → 走近', () => {
  assert.strictEqual(_guidanceDistance({ faceConf: 0.9, personHR: null, faceHR: 0.10 }).dir, 'near');
});
test('distance: 无人体框回退脸框 faceHR=0.85 → 后退', () => {
  assert.strictEqual(_guidanceDistance({ faceConf: 0.9, personHR: null, faceHR: 0.85 }).dir, 'far');
});
test('distance 负例: 无人体框脸框适中 faceHR=0.5 → null', () => {
  assert.strictEqual(_guidanceDistance({ faceConf: 0.9, personHR: null, faceHR: 0.5 }), null);
});

/* -------------------- v8.9.0 _guidanceOrientation（横竖拍） -------------------- */
test('orientation: 单人竖长人被横拍 → 竖持', () => {
  const out = _guidanceOrientation({ faceCount: 1, personAspect: 1.5, frameAspect: 1.5, sceneType: 'portrait' });
  assert.strictEqual(out.rec, 'portrait');
});
test('orientation: 多人合影被竖拍 → 横持', () => {
  const out = _guidanceOrientation({ faceCount: 4, personAspect: 0.6, frameAspect: 0.7, sceneType: 'general' });
  assert.strictEqual(out.rec, 'landscape');
});
test('orientation: 宽场景被竖拍 → 横持', () => {
  const out = _guidanceOrientation({ faceCount: 1, personAspect: 0.5, frameAspect: 0.7, sceneType: 'waterscape' });
  assert.strictEqual(out.rec, 'landscape');
});
test('orientation 负例: 单人竖人但已竖拍 frameAspect=0.75 → null', () => {
  assert.strictEqual(_guidanceOrientation({ faceCount: 1, personAspect: 1.5, frameAspect: 0.75, sceneType: 'portrait' }), null);
});
test('orientation 负例: 两人 faceCount=2 → null（不猜）', () => {
  assert.strictEqual(_guidanceOrientation({ faceCount: 2, personAspect: 1.5, frameAspect: 1.5, sceneType: 'portrait' }), null);
});
test('orientation 负例: 横竖接近 personAspect=0.9 → null', () => {
  assert.strictEqual(_guidanceOrientation({ faceCount: 1, personAspect: 0.9, frameAspect: 1.5, sceneType: 'portrait' }), null);
});
test('orientation 负例: 人体框不可算 personAspect=0 → null', () => {
  assert.strictEqual(_guidanceOrientation({ faceCount: 4, personAspect: 0, frameAspect: 0.7, sceneType: 'waterscape' }), null);
});

/* -------------------- v9.0.0 _faceLightSplit（脸部分光采样） -------------------- */
function mkGrid(fn) { const g = []; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) g.push(fn(x, y)); return g; }
test('faceLightSplit: 均匀网格 → l≈r≈t≈b', () => {
  const out = _faceLightSplit({ lumGrid: mkGrid(() => 128), gw: 16, gh: 16, fb: [0.3, 0.3, 0.25, 0.25] });
  assert.ok(out);
  for (const k of ['l', 'r', 't', 'b', 'mean']) assert.ok(Math.abs(out[k] - 128) < 2, k + '=' + out[k]);
});
test('faceLightSplit: 左亮右暗 → l>r', () => {
  const out = _faceLightSplit({ lumGrid: mkGrid(x => x < 8 ? 200 : 60), gw: 16, gh: 16, fb: [0.25, 0.3, 0.5, 0.25] });
  assert.ok(out.l > out.r + 60, 'l=' + out.l + ' r=' + out.r);
});
test('faceLightSplit 负例: 网格非法 → null', () => {
  assert.strictEqual(_faceLightSplit({ lumGrid: null, gw: 16, gh: 16, fb: [0.3, 0.3, 0.25, 0.25] }), null);
  assert.strictEqual(_faceLightSplit({ lumGrid: mkGrid(() => 128), gw: 16, gh: 16, fb: [0.3, 0.3, 0.005, 0.005] }), null);
});

/* -------------------- v9.0.0 _lightPosition（光位四判） -------------------- */
const SPLIT_UNI = { l: 120, r: 120, t: 120, b: 120, mean: 120, frameMean: 120 };
test('lightPosition: 左右3:1 → split 硬切光', () => {
  const out = _lightPosition({ split: { l: 200, r: 60, t: 110, b: 110, mean: 130 }, faceConf: 0.9, mean: 130, sat: 0.3 });
  assert.strictEqual(out.key, 'split');
});
test('lightPosition: 左右2:1且均匀上下 → side 侧光', () => {
  const out = _lightPosition({ split: { l: 180, r: 100, t: 110, b: 110, mean: 130 }, faceConf: 0.9, mean: 130, sat: 0.3 });
  assert.strictEqual(out.key, 'side');
});
test('lightPosition: 上下1.6:1 → toplight 顶光', () => {
  const out = _lightPosition({ split: { l: 110, r: 110, t: 176, b: 110, mean: 130 }, faceConf: 0.9, mean: 130, sat: 0.3 });
  assert.strictEqual(out.key, 'toplight');
});
test('lightPosition: 全均匀 → flat 平光', () => {
  const out = _lightPosition({ split: SPLIT_UNI, faceConf: 0.9, mean: 130, sat: 0.3 });
  assert.strictEqual(out.key, 'flat');
});
test('lightPosition 负例: 左右1.45:1（接近均匀）→ null', () => {
  const out = _lightPosition({ split: { l: 145, r: 100, t: 110, b: 110, mean: 120 }, faceConf: 0.9, mean: 120, sat: 0.3 });
  assert.strictEqual(out, null);
});
test('lightPosition 负例: 左右1.6:1且上下也1.6:1（方向不明）→ null', () => {
  const out = _lightPosition({ split: { l: 160, r: 100, t: 160, b: 100, mean: 130 }, faceConf: 0.9, mean: 130, sat: 0.3 });
  assert.strictEqual(out, null);
});
test('lightPosition 负例: 低置信 faceConf=0.6 → null', () => {
  const out = _lightPosition({ split: { l: 200, r: 60, t: 110, b: 110, mean: 130 }, faceConf: 0.6, mean: 130, sat: 0.3 });
  assert.strictEqual(out, null);
});
test('lightPosition 负例: split=null → null', () => {
  assert.strictEqual(_lightPosition({ split: null, faceConf: 0.9, mean: 130, sat: 0.3 }), null);
});

/* -------------------- v9.0.0 _warmLightHint / _windowLightHint / _lowAngleAdvice -------------------- */
test('warmLightHint: 暖亮柔 → 正向鼓励', () => {
  assert.ok(_warmLightHint({ wb: 0.12, mean: 150, sat: 0.3 }).txt);
});
test('warmLightHint 负例: 室内暖黄灯 mean=80 → null', () => {
  assert.strictEqual(_warmLightHint({ wb: 0.12, mean: 80, sat: 0.3 }), null);
});
test('warmLightHint 负例: 边界 mean=100/205 → null', () => {
  assert.strictEqual(_warmLightHint({ wb: 0.12, mean: 100, sat: 0.3 }), null);
  assert.strictEqual(_warmLightHint({ wb: 0.12, mean: 205, sat: 0.3 }), null);
});
test('windowLightHint: 侧光+亮边2.2× → 窗光', () => {
  const out = _windowLightHint({ split: { l: 180, r: 110, t: 120, b: 120, mean: 120 }, edgeColMean: 264, faceConf: 0.9, mean: 120 });
  assert.ok(out && out.txt);
});
test('windowLightHint 负例: 缺 edgeColMean → null', () => {
  assert.strictEqual(_windowLightHint({ split: { l: 180, r: 110, t: 120, b: 120, mean: 120 }, edgeColMean: null, faceConf: 0.9, mean: 120 }), null);
});
test('windowLightHint 负例: 无明显亮边 → null', () => {
  assert.strictEqual(_windowLightHint({ split: { l: 180, r: 110, t: 120, b: 120, mean: 120 }, edgeColMean: 130, faceConf: 0.9, mean: 120 }), null);
});
test('lowAngleAdvice: 全身竖拍 → 提示', () => {
  assert.ok(_lowAngleAdvice({ frameAspect: 0.7, personTop: 0.05, personBottom: 0.95, personHR: 0.9 }).txt);
});
test('lowAngleAdvice 负例: 半身 → null', () => {
  assert.strictEqual(_lowAngleAdvice({ frameAspect: 0.7, personTop: 0.2, personBottom: 0.7, personHR: 0.5 }), null);
});
test('lowAngleAdvice 负例: 脚离下沿远 personBottom=0.8 → null', () => {
  assert.strictEqual(_lowAngleAdvice({ frameAspect: 0.7, personTop: 0.1, personBottom: 0.8, personHR: 0.85 }), null);
});
test('lowAngleAdvice 负例: 横拍 → null', () => {
  assert.strictEqual(_lowAngleAdvice({ frameAspect: 1.5, personTop: 0.05, personBottom: 0.95, personHR: 0.9 }), null);
});

/* -------------------- v9.0.0 _composeDiagnosis（统一诊断，只读） -------------------- */
test('diagnosis: 侧脸朝右但脸偏右 → gaze 条（且输出绝无 crop 字段）', () => {
  const out = _composeDiagnosis({ yaw: { state: 'three-quarter', dir: 1, r: 0.3 }, faceCx: 0.55 });
  assert.ok(Array.isArray(out));
  assert.strictEqual(out[0].id, 'gaze');
  assert.strictEqual(out[0].sev, 2);
  assert.ok(!('crop' in out[0]));
});
test('diagnosis: 风光地平线居中 → horizon 条', () => {
  const out = _composeDiagnosis({ isLandscapeScene: true, horizonRatio: 0.51 });
  assert.ok(out.some(d => d.id === 'horizon'));
});
test('diagnosis: toplight → light 条（sev2 优先）', () => {
  const out = _composeDiagnosis({ isLandscapeScene: true, horizonRatio: 0.5, light: { key: 'toplight', txt: '头顶光太重' } });
  assert.strictEqual(out[0].id, 'light');
  assert.ok(out.some(d => d.id === 'horizon'));
});
test('diagnosis 负例: 正面人脸（yaw.dir=0）→ 无 gaze', () => {
  const out = _composeDiagnosis({ yaw: { state: 'frontal', dir: 0, r: 0 }, faceCx: 0.5 });
  assert.ok(!out.some(d => d.id === 'gaze'));
});
test('diagnosis 负例: 头肩像 headTop=0.12 → 无 headroom', () => {
  const out = _composeDiagnosis({ headTop: 0.12 });
  assert.deepStrictEqual(out, []);
});
test('diagnosis 负例: 所有信号舒适区 → []（不硬凑）', () => {
  const out = _composeDiagnosis({ yaw: { dir: 0 }, faceCx: 0.33, headTop: 0.12, eyesY: 0.33, isLandscapeScene: true, horizonRatio: 0.33 });
  assert.deepStrictEqual(out, []);
});
test('diagnosis: 最多3条且按 sev 降序', () => {
  const out = _composeDiagnosis({
    yaw: { dir: 1 }, faceCx: 0.55, headTop: 0.02, eyesY: 0.5,
    isLandscapeScene: true, horizonRatio: 0.5, light: { key: 'flat', txt: 'x' },
    orientation: { txt: 'y' }, rodMoved: true
  });
  assert.ok(out.length <= 3);
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].sev >= out[i].sev);
});
test('diagnosis: rodMoved → bgsafe 提示条', () => {
  const out = _composeDiagnosis({ rodMoved: true });
  assert.ok(out.some(d => d.id === 'bgsafe'));
});
test('diagnosis 负例: 输入缺字段不抛错且该条不出现', () => {
  const out = _composeDiagnosis({});
  assert.deepStrictEqual(out, []);
  assert.deepStrictEqual(_composeDiagnosis(null), []);
});

/* -------------------- v12.24.0 _recommendFilter（场景感知打分制） -------------------- */
const BASE_A = { mean: 130, contrast: 40, wb: 0.005, sat: 0.24, highClip: 0, shadowClip: 0, sharpness: 60, lightScore: 0.05, brightRatio: 0.1, skinRatio: 0.02, isPersonLikely: false, warmRatio: 0.05, waterScore: 0.05, manmadeScore: 0.1, sigBox: [0.3, 0.3, 0.7, 0.7], lumGrid: mkGrid(() => 130), gridW: 16, gridH: 16 };
function recWith(over, sig) { return _recommendFilter(Object.assign({}, BASE_A, over), sig); }
test('filter G1: 糊片 sharpness<25 → GATE', () => {
  assert.strictEqual(recWith({ sharpness: 18 }).rule, 'GATE');
});
test('filter G2: 过曝 highClip>0.15 → GATE', () => {
  assert.strictEqual(recWith({ highClip: 0.18 }).rule, 'GATE');
});
test('filter G3: 明亮且已浓 sat>0.52 且 mean>=80 → GATE', () => {
  assert.strictEqual(recWith({ sat: 0.55, mean: 120 }).rule, 'GATE');
});
test('filter G3b: 极端过饱和 sat>0.72 → GATE（暗图也拦）', () => {
  assert.strictEqual(recWith({ sat: 0.8, mean: 60 }).rule, 'GATE');
});
test('filter G4: 近黑 mean<38 → GATE', () => {
  assert.strictEqual(recWith({ mean: 35 }).rule, 'GATE');
});
test('filter G4b: 暗但有层次（mean45/contrast62/暗部46%）→ 放行温和提亮', () => {
  const r = recWith({ mean: 45, contrast: 62, shadowClip: 0.46, highClip: 0.004, sat: 0.60, lightScore: 0.4 });
  assert.notStrictEqual(r.rule, 'GATE');
});
test('filter G4c: 逆光剪影（高光13%+暗部40%）→ GATE，不自动加色', () => {
  assert.strictEqual(recWith({ highClip: 0.13, shadowClip: 0.40 }).rule, 'GATE');
});
test('filter G5: null/空输入 → GATE', () => {
  assert.strictEqual(_recommendFilter(null).rule, 'GATE');
  assert.strictEqual(_recommendFilter({}).rule, 'GATE');
});
test('filter 人像场景: personScore>=0.6 → 推荐人像类滤镜', () => {
  const r = recWith({ wb: 0.06, mean: 140, sat: 0.2 }, { personScore: 0.8 });
  assert.ok(r.filter, '应推荐滤镜');
  assert.ok(['portra','portrait-warm','ektar','portrait-cool','japan','provia'].indexOf(r.filter) >= 0, '人像池内, 实得=' + r.filter);
});
test('filter 夜景场景: 暗景+lightScore → 推荐夜景类', () => {
  const r = recWith({ mean: 70, lightScore: 0.4 }, null);
  assert.ok(['night','cyber','teal'].indexOf(r.filter) >= 0, '夜景池内, 实得=' + r.filter);
});
test('filter 黄昏场景: 高暖比+暖wb → 推荐黄昏类', () => {
  const r = recWith({ warmRatio: 0.5, wb: 0.08, mean: 120 }, { personScore: 0.3, scene: 'landscape' });
  assert.ok(['sunset','teal','warm'].indexOf(r.filter) >= 0, '黄昏池内, 实得=' + r.filter);
});
test('filter 食物场景: scene=food → 推荐暖食欲色', () => {
  const r = recWith({ mean: 150, sat: 0.25, wb: 0.05 }, { scene: 'food' });
  assert.ok(r.filter, '应推荐');
});
test('filter 风光场景: landscape+明亮低饱和 → 推荐通透类', () => {
  const r = recWith({ mean: 130, sat: 0.15, wb: 0.0, waterScore: 0.1, manmadeScore: 0.1 }, { scene: 'landscape' });
  assert.ok(['velvia','160c','provia'].indexOf(r.filter) >= 0, '风光池内, 实得=' + r.filter);
});
test('filter 低饱和: sat<0.06 → 推荐黑白', () => {
  const r = recWith({ sat: 0.02, mean: 100 }, null);
  assert.ok(['mono','mono-warm','chrome'].indexOf(r.filter) >= 0, '黑白类, 实得=' + r.filter);
});
test('filter 美食低饱和不推黑白: scene=food+sat=0.05 → 非mono', () => {
  const r = recWith({ sat: 0.05, mean: 150, wb: 0.05 }, { scene: 'food' });
  assert.ok(['mono','mono-warm'].indexOf(r.filter) < 0, '美食不该推黑白, 实得=' + r.filter);
});
test('filter 晚霞低饱和不推黑白: warmRatio=0.5+sat=0.05 → 非mono', () => {
  const r = recWith({ sat: 0.05, warmRatio: 0.5, wb: 0.08, mean: 120 }, { scene: 'sunset' });
  assert.ok(['mono','mono-warm'].indexOf(r.filter) < 0, '晚霞不该推黑白, 实得=' + r.filter);
});
test('filter 建筑低饱和可推黑白: scene=architecture+sat=0.05 → chrome/mono-warm', () => {
  const r = recWith({ sat: 0.05, mean: 120, manmadeScore: 0.8 }, { scene: 'architecture' });
  assert.ok(['chrome','mono-warm','provia'].indexOf(r.filter) >= 0, '建筑可接受, 实得=' + r.filter);
});
test('filter v12.28 假人像: 云端 portrait 但本地无人像证据 → 不推人像专属', () => {
  const r = recWith({ skinRatio: 0, isPersonLikely: false, faceAvailable: false, mean: 120, sat: 0.2 }, { scene: 'portrait', personScore: 0, personCount: 0 });
  assert.ok(['portra','ektar','portrait-warm','portrait-cool','portrait-mono'].indexOf(r.filter) < 0, '假人像不推人像色, 实得=' + r.filter);
});
test('filter v12.28 建筑: scene=architecture 不再要求 manmadeScore', () => {
  const r = recWith({ manmadeScore: 0.1, mean: 130, sat: 0.2, wb: 0.0 }, { scene: 'architecture' });
  assert.ok(['chrome','classic','mono-warm','provia','cool'].indexOf(r.filter) >= 0, '建筑池, 实得=' + r.filter);
});
test('filter v12.28 街景: scene=street → 硬朗/纪实池', () => {
  const r = recWith({ manmadeScore: 0.2, mean: 130, sat: 0.2, wb: 0.0 }, { scene: 'street' });
  assert.ok(['chrome','classic','hk','cool','provia'].indexOf(r.filter) >= 0, '街景池, 实得=' + r.filter);
});
test('filter 属性: strength∈[50,80]、非null id 属推荐池', () => {
  const cases = [
    recWith({ mean: 70, lightScore: 0.4 }, null),
    recWith({ wb: 0.06, mean: 140 }, { personScore: 0.8 }),
    recWith({ sat: 0.02, mean: 100 }, null),
    recWith({ warmRatio: 0.5, wb: 0.08, mean: 120 }, { scene: 'landscape' })
  ];
  for (const r of cases) {
    if (r.filter) {
      assert.ok(r.strength >= 50 && r.strength <= 80, 'strength=' + r.strength);
    }
  }
});
test('filter 属性: 无副作用（入参深比较前后不变）', () => {
  const a = Object.assign({}, BASE_A);
  const before = JSON.stringify(a);
  _recommendFilter(a, { personScore: 0.8 });
  assert.strictEqual(JSON.stringify(a), before);
});

/* -------------------- _cloudCropIntentGuard（v9.0.1 云端 cropIntent↔RoD 联动） -------------------- */
function mkRodB(W, H, pix) { return mkRod(W, H, pix); } // 复用行前缀和夹具
test('cloudCropIntentGuard: 非法输入（null/crop长度错/无rod）→ null', () => {
  assert.strictEqual(_cloudCropIntentGuard(null), null);
  assert.strictEqual(_cloudCropIntentGuard({ crop: [1, 2], rod: mkRodB(100, 100, () => ({ l: 100, s: 0.1 })), intent: 'crop_top' }), null);
  assert.strictEqual(_cloudCropIntentGuard({ crop: [0, 10, 0, 0], rod: null, intent: 'crop_top' }), null);
  assert.strictEqual(_cloudCropIntentGuard({ crop: [0, 10, 0, 0], rod: { w: 1 }, intent: 'crop_top' }), null);
});
test('cloudCropIntentGuard: 左右/trim/none 意图（无水平条带）→ null', () => {
  const rod = mkRodB(100, 100, (x, y) => y < 15 ? { l: x % 2 ? 150 : 220, s: 0.7 } : { l: 80, s: 0.1 });
  assert.strictEqual(_cloudCropIntentGuard({ crop: [10, 0, 10, 0], rod, intent: 'crop_left' }), null);
  assert.strictEqual(_cloudCropIntentGuard({ crop: [0, 10, 0, 0], rod, intent: 'trim' }), null);
  assert.strictEqual(_cloudCropIntentGuard({ crop: [0, 10, 0, 0], rod, intent: 'none' }), null);
});
test('cloudCropIntentGuard: 顶部晚霞双高（显著性质量>15% 且方差>1.2×全图）→ 上边内收2%并给note', () => {
  // 顶部 10% 行：高显著(s=0.7)+强明暗云交替(60/140，均值≈100)；其余低显著(s=0.05)均匀 100 灰场。
  // 条带内部方差远大于全图（其余平坦），且显著性质量集中在条带 → 双与门命中。
  const rod = mkRodB(100, 100, (x, y) => y < 10 ? { l: x % 2 ? 60 : 140, s: 0.7 } : { l: 100, s: 0.05 });
  const out = _cloudCropIntentGuard({ crop: [0, 10, 0, 0], rod, intent: 'crop_top' });
  assert.ok(out, '应返回保护结果');
  assert.deepStrictEqual(out.crop, [0, 8, 0, 0]);
  assert.ok(out.note && out.note.indexOf('高价值背景') >= 0, 'note 应说明保护原因');
});
test('cloudCropIntentGuard: 普通均匀天空（方差/显著性质量不足）→ null 不拦', () => {
  const rod = mkRodB(100, 100, () => ({ l: 120, s: 0.05 }));
  assert.strictEqual(_cloudCropIntentGuard({ crop: [0, 10, 0, 0], rod, intent: 'crop_top' }), null);
});
test('cloudCropIntentGuard: crop_tb 顶部双高+底部普通 → 只内收顶边', () => {
  const rod = mkRodB(100, 100, (x, y) => y < 10 ? { l: x % 2 ? 60 : 140, s: 0.7 } : { l: 100, s: 0.05 });
  const out = _cloudCropIntentGuard({ crop: [0, 10, 0, 10], rod, intent: 'crop_tb' });
  assert.ok(out);
  assert.deepStrictEqual(out.crop, [0, 8, 0, 10]);
});
test('cloudCropIntentGuard v9.6: 组间反差抬高全图方差→相对门漏保时绝对方差地板仍护', () => {
  // 条带内 l 40/160 交替（var=3600>800 绝对地板）；全图下半也大幅明暗交替抬高 gVar，使 varL>gVar*1.2 不成立。
  const rod = mkRodB(100, 100, (x, y) => {
    if (y < 10) return { l: x % 2 ? 40 : 160, s: 0.7 };
    return { l: x % 2 ? 20 : 180, s: 0.05 }; // 下半也强反差 → gVar 高
  });
  const out = _cloudCropIntentGuard({ crop: [0, 10, 0, 0], rod, intent: 'crop_top' });
  assert.ok(out, '绝对方差地板应兜底保护');
  assert.deepStrictEqual(out.crop, [0, 8, 0, 0]);
});
test('cloudCropIntentGuard: 无副作用（入参对象与rod不被改写）', () => {
  const rod = mkRodB(100, 100, (x, y) => y < 10 ? { l: x % 2 ? 60 : 140, s: 0.7 } : { l: 100, s: 0.05 });
  const crop = [0, 10, 0, 0];
  const before = JSON.stringify(rod.rL);
  _cloudCropIntentGuard({ crop, rod, intent: 'crop_top' });
  assert.deepStrictEqual(crop, [0, 10, 0, 0]);
  assert.strictEqual(JSON.stringify(rod.rL), before);
});
// v11.16.0 收尾：rod 带饱和度前缀和(rSat)的夹具
function mkRodSat(W, H, pix) {
  const rL = new Float64Array(H + 1), rL2 = new Float64Array(H + 1), rS = new Float64Array(H + 1), rSat = new Float64Array(H + 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const q = pix(x, y); rL[y + 1] += q.l; rL2[y + 1] += q.l * q.l; rS[y + 1] += q.s; rSat[y + 1] += (q.sat || 0); }
  for (let y = 0; y < H; y++) { rL[y + 1] += rL[y]; rL2[y + 1] += rL2[y]; rS[y + 1] += rS[y]; rSat[y + 1] += rSat[y]; }
  return { w: W, h: H, rL, rL2, rS, rSat };
}
test('cloudCropIntentGuard v11.16: 高彩晚霞顶边不再被 intent 门控（intent=crop_right 也整条保留）', () => {
  // 顶部12%戏剧性粉霞：高显著(s=0.7)+高饱和(sat=0.5)；其余绿林/湖水中等显著(s=0.1,l=100)。
  const rod = mkRodSat(100, 100, (x, y) => y < 12 ? { l: 180, s: 0.7, sat: 0.5 } : { l: 100, s: 0.1, sat: 0.05 });
  // 即便 VLM 把 intent 报成 crop_right（非 crop_top），高彩顶边也应整条保留(nT=0)
  const out = _cloudCropIntentGuard({ crop: [3, 12, 22, 0], rod, intent: 'crop_right' });
  assert.ok(out, '高彩晚霞应被整条保留');
  assert.strictEqual(out.crop[1], 0, '顶边应归零保留');
  assert.strictEqual(out.crop[0], 3, '非水平边(左)不动');
  assert.strictEqual(out.crop[2], 22, '非水平边(右)不动');
});
test('cloudCropIntentGuard v11.16: 低饱和顶边即使 crop_right intent 也不护（宁缺毋滥）', () => {
  // 顶部12%灰白过曝天空：高显著但低饱和(sat=0.05) → 不满足 full 高彩门，且 intent=crop_right 时 partial 也不护 → 原样
  const rod = mkRodSat(100, 100, (x, y) => y < 12 ? { l: 200, s: 0.7, sat: 0.05 } : { l: 100, s: 0.1, sat: 0.05 });
  const out = _cloudCropIntentGuard({ crop: [3, 12, 22, 0], rod, intent: 'crop_right' });
  assert.strictEqual(out, null, '低饱和灰白天空不因门控放宽而误护');
});

/* -------------------- v9.1.0 _confBand（置信度迟滞带宽） -------------------- */
test('confBand: >=0.65 确认人像', () => {
  assert.strictEqual(_confBand(0.70, null), 'person');
  assert.strictEqual(_confBand(0.90, 'none'), 'person');
});
test('confBand: <=0.45 确认非人像', () => {
  assert.strictEqual(_confBand(0.30, null), 'none');
  assert.strictEqual(_confBand(0.10, 'person'), 'none');
});
test('confBand: 0.45-0.65 带内沿用既有判定不翻转', () => {
  assert.strictEqual(_confBand(0.55, 'person'), 'person'); // 既有人像不翻成非人像
  assert.strictEqual(_confBand(0.50, 'none'), 'none');      // 既非人像不翻成人像
  assert.strictEqual(_confBand(0.60, null), 'hold');        // 无既有结论时 hold
});
test('confBand: 非法输入 → hold', () => {
  assert.strictEqual(_confBand(NaN, 'person'), 'hold');
  assert.strictEqual(_confBand(undefined, 'person'), 'hold');
});

/* -------------------- v9.1.0 _medianBox（多帧框中值聚合） -------------------- */
test('medianBox: <3 帧返回 null（宁缺毋滥不猜）', () => {
  assert.strictEqual(_medianBox(null), null);
  assert.strictEqual(_medianBox([]), null);
  assert.strictEqual(_medianBox([{x:0.1,y:0.1,w:0.2,h:0.3,conf:0.5}]), null);
  assert.strictEqual(_medianBox([{x:0.1,y:0.1,w:0.2,h:0.3,conf:0.5},{x:0.2,y:0.2,w:0.3,h:0.3,conf:0.6}]), null);
});
test('medianBox: 3+ 帧取各分量中值，压掉离群跳动', () => {
  const boxes = [
    {x:0.10,y:0.10,w:0.20,h:0.30,conf:0.50},
    {x:0.11,y:0.11,w:0.21,h:0.31,conf:0.52},
    {x:0.50,y:0.50,w:0.90,h:0.90,conf:0.90}, // 离群误检
  ];
  const m = _medianBox(boxes);
  assert.ok(m);
  assert.ok(Math.abs(m.x - 0.11) < 1e-9, 'x 中值应≈0.11，实得 ' + m.x);
  assert.ok(Math.abs(m.w - 0.21) < 1e-9, 'w 中值应≈0.21，实得 ' + m.w);
  assert.ok(Math.abs(m.conf - 0.52) < 1e-9, 'conf 中值应≈0.52，实得 ' + m.conf);
});

/* -------------------- v9.1.0 _consensusPerson（上传路径多数决+中值框） -------------------- */
test('consensusPerson: 单次推理直接采信', () => {
  const r = _consensusPerson([{detected:true, score:0.9, box:{x:0.1,y:0.1,w:0.2,h:0.3,conf:0.9}}]);
  assert.strictEqual(r.person, true);
  assert.strictEqual(r.score, 0.9);
});
test('consensusPerson: 3 次多数决——2次有人1次无人 → 确认人像', () => {
  const runs = [
    {detected:true, score:0.55, box:{x:0.1,y:0.1,w:0.2,h:0.3,conf:0.55}},
    {detected:true, score:0.58, box:{x:0.11,y:0.11,w:0.21,h:0.31,conf:0.58}},
    {detected:false, score:0, box:null},
  ];
  const r = _consensusPerson(runs);
  assert.strictEqual(r.person, true);
  assert.ok(r.box, '应给出中值框');
});
test('consensusPerson: 3 次多数决——1次有人2次无人 → 判非人像（消除单次误检翻转）', () => {
  const runs = [
    {detected:true, score:0.5, box:{x:0.5,y:0.5,w:0.9,h:0.9,conf:0.5}},
    {detected:false, score:0, box:null},
    {detected:false, score:0, box:null},
  ];
  const r = _consensusPerson(runs);
  assert.strictEqual(r.person, false);
  assert.strictEqual(r.box, null);
});
test('consensusPerson: 空输入 → 非人像', () => {
  const r = _consensusPerson([]);
  assert.strictEqual(r.person, false);
  assert.strictEqual(r.box, null);
});

/* -------------------- v9.1.0 _sceneDebounce（场景3帧确认/5帧翻转） -------------------- */
test('sceneDebounce: 1 帧夜景抖动不翻转既有人像', () => {
  let st = {scene:'portrait', pend:null, pc:0, held:5};
  st = _sceneDebounce('night', st);   // 第1帧夜景
  assert.strictEqual(st.scene, 'portrait');
  st = _sceneDebounce('portrait', st); // 回到人像
  assert.strictEqual(st.scene, 'portrait');
  assert.strictEqual(st.pend, null);
});
test('sceneDebounce: 连续 3 帧新场景才更新（未稳时）', () => {
  let st = {scene:null, pend:null, pc:0, held:0};
  st = _sceneDebounce('landscape', st); assert.strictEqual(st.scene, null); // pc=1
  st = _sceneDebounce('landscape', st); assert.strictEqual(st.scene, null); // pc=2
  st = _sceneDebounce('landscape', st); assert.strictEqual(st.scene, 'landscape'); // pc=3 确认
});
test('sceneDebounce: 已稳定场景反向翻转需 5 帧', () => {
  let st = {scene:'portrait', pend:null, pc:0, held:10}; // 已稳定10帧
  for (let i = 0; i < 4; i++) st = _sceneDebounce('night', st);
  assert.strictEqual(st.scene, 'portrait'); // 4帧还不翻
  st = _sceneDebounce('night', st);
  assert.strictEqual(st.scene, 'night');    // 第5帧才翻
});

/* -------------------- v9.1.0 _debangText（拍前引导文字防抖状态机） -------------------- */
test('debangText: 连续3帧同结论才显示', () => {
  let st = {key:null, count:0};
  st = _debangText([{id:'eye', txt:'放低手机'}], st);
  assert.strictEqual(st.show, false);
  st = _debangText([{id:'eye', txt:'放低手机'}], st);
  assert.strictEqual(st.show, false);
  st = _debangText([{id:'eye', txt:'放低手机'}], st);
  assert.strictEqual(st.show, true);
  assert.strictEqual(st.txt, '放低手机');
});
test('debangText: 2帧后反转不显示', () => {
  let st = {key:null, count:0};
  st = _debangText([{id:'eye', txt:'A'}], st);
  st = _debangText([{id:'eye', txt:'A'}], st);
  st = _debangText([{id:'dist', txt:'走近'}], st); // 第3帧换结论
  assert.strictEqual(st.show, false);
});

/* ==================== v9.2.0 实时取景防抖状态机逐帧断言（模拟相机帧流） ==================== */
// 用纯函数 _debangText 模拟连续帧：引导条"连续3帧同结论才显示、换结论立即回落"。
test('debangText: 帧1/帧2 同结论不显示，帧3 才显示', () => {
  let st = _debangText([{id:'eyeLevel',txt:'放低手机'}], null);
  assert.strictEqual(st.show, false); assert.strictEqual(st.count, 1);
  st = _debangText([{id:'eyeLevel',txt:'放低手机'}], st);
  assert.strictEqual(st.show, false); assert.strictEqual(st.count, 2);
  st = _debangText([{id:'eyeLevel',txt:'放低手机'}], st);
  assert.strictEqual(st.show, true); assert.strictEqual(st.txt, '放低手机');
});
test('debangText: 第3帧换结论→不显示（2帧后反转不show）', () => {
  let st = _debangText([{id:'a',txt:'A'}], null);
  st = _debangText([{id:'a',txt:'A'}], st);
  st = _debangText([{id:'b',txt:'B'}], st); // 第3帧换结论
  assert.strictEqual(st.show, false); assert.strictEqual(st.key, 'b');
});
test('debangText: 无引导帧（空序列）回落隐藏', () => {
  let st = {key:'a',count:3,show:true,txt:'A'};
  st = _debangText([], st);
  assert.strictEqual(st.show, false); assert.strictEqual(st.key, null);
});
test('debangText: 新结论也需连续3帧才重新显示', () => {
  let st = _debangText([{id:'a',txt:'A'}], null); // 1
  st = _debangText([{id:'a',txt:'A'}], st);      // 2
  st = _debangText([{id:'a',txt:'A'}], st);      // 3 show
  assert.strictEqual(st.show, true);
  st = _debangText([{id:'c',txt:'C'}], st);      // 1
  assert.strictEqual(st.show, false);
  st = _debangText([{id:'c',txt:'C'}], st);      // 2
  assert.strictEqual(st.show, false);
  st = _debangText([{id:'c',txt:'C'}], st);      // 3
  assert.strictEqual(st.show, true); assert.strictEqual(st.txt, 'C');
});

/* ---- v9.2 场景防抖 _sceneDebounce 逐状态 ---- */
test('sceneDebounce: 未稳场景3帧确认', () => {
  let s = _sceneDebounce('landscape', null); assert.strictEqual(s.scene, null);
  s = _sceneDebounce('landscape', s); assert.strictEqual(s.scene, null);
  s = _sceneDebounce('landscape', s); assert.strictEqual(s.scene, 'landscape');
});
test('sceneDebounce: 已稳5帧后反向切换需5帧', () => {
  let s = {scene:'portrait',pend:null,pc:0,held:10};
  for(let i=0;i<4;i++){ s=_sceneDebounce('night',s); assert.strictEqual(s.scene,'portrait'); }
  s = _sceneDebounce('night',s);
  assert.strictEqual(s.scene,'night');
});

/* ---- v9.2 四条拍前引导：触发 / 沉默 正负例 ---- */
test('guidanceOrientation: 竖长单人被横拍→竖持；宽景被竖拍→横持；否则沉默', () => {
  assert.deepStrictEqual(_guidanceOrientation({faceCount:1,personAspect:1.5,frameAspect:1.4,sceneType:null}).rec,'portrait');
  assert.deepStrictEqual(_guidanceOrientation({faceCount:1,personAspect:0.5,frameAspect:0.7,sceneType:'landscape'}).rec,'landscape');
  assert.strictEqual(_guidanceOrientation({faceCount:1,personAspect:1.5,frameAspect:0.7,sceneType:null}),null); // 竖拍竖人正确
  assert.strictEqual(_guidanceOrientation({faceCount:1,personAspect:0,frameAspect:1.4,sceneType:null}),null); // 人体框不可算
});
test('guidanceDistance: 人太小走近/太大后退/适中沉默/低置信沉默', () => {
  assert.deepStrictEqual(_guidanceDistance({faceConf:0.9,personHR:0.1}).dir,'near');
  assert.deepStrictEqual(_guidanceDistance({faceConf:0.9,personHR:0.9}).dir,'far');
  assert.strictEqual(_guidanceDistance({faceConf:0.9,personHR:0.5}),null);
  assert.strictEqual(_guidanceDistance({faceConf:0.5,personHR:0.1}),null); // 低置信不报
});
test('guidanceEyeLevel: 脸太顶下→放低/太低无眼点→举高/适中沉默', () => {
  assert.deepStrictEqual(_guidanceEyeLevel({faceConf:0.9,headTop:0.02,faceHR:0.3,eyesY:0.2}).dir,'down');
  assert.deepStrictEqual(_guidanceEyeLevel({faceConf:0.9,headTop:0.3,faceHR:0.3,eyesY:null}).dir,'up');
  assert.strictEqual(_guidanceEyeLevel({faceConf:0.9,headTop:0.1,faceHR:0.3,eyesY:0.2}),null);
});
test('guidanceEyeOnGrid: 眼过高/过低纠正/适中沉默/低置信沉默', () => {
  assert.ok(_guidanceEyeOnGrid({faceConf:0.9,eyesY:0.5}));
  assert.ok(_guidanceEyeOnGrid({faceConf:0.9,eyesY:0.1}));
  assert.strictEqual(_guidanceEyeOnGrid({faceConf:0.9,eyesY:0.3}),null);
  assert.strictEqual(_guidanceEyeOnGrid({faceConf:0.5,eyesY:0.5}),null);
});

/* ==================== v12.24.0 滤镜规则矩阵已改为打分制，旧链式用例已删除 ==================== */
function baseA(over){ return Object.assign({mean:120,sat:0.10,sharpness:60,highClip:0.05,shadowClip:0.10,
  lightScore:0.5,wb:0,warmRatio:0.1,waterScore:0.05,manmadeScore:0.1,skinRatio:0.1}, over||{}); }
function baseSig(over){ return Object.assign({personScore:0,personCount:0,scene:'portrait'}, over||{}); }

// --- G1 糊片闸门（sharpness<25 恒 null） ---
// --- G2 曝光断层 ---
// --- G3 已浓 ---
// --- G4 近纯黑 ---
// --- R1 夜景提亮 ---
// --- R2B 暖调人像 ---
// --- R2C 冷调人像 ---
// --- R2A 侧光黑白人像（非对称 lumGrid） ---
function sideLightA(over){ const g=[]; for(let i=0;i<4;i++){ g.push(10,10,200,200); } return baseA(Object.assign({lumGrid:g,gridW:4,gridH:4,sigBox:[0,0,1,1]},over||{})); }
// --- R3 近黑白 ---
// --- R4 黄昏暖景 ---
// --- 沉默原则：非人像正常光景 → null ---
// --- 追加边界/负例（凑足三维矩阵覆盖） ---

/* -------------------- v9.3.0 可训练偏好 _applyPref -------------------- */
const FPc=(n,fn)=>{ test(n,fn); };
FPc('偏好：空 history 原样返回 rec（新用户零变化）', ()=>{
  const rec={filter:'night',strength:80,reason:'x',rule:'R1',scene:'night'};
  const out=_applyPref(rec,[]);
  assert.strictEqual(out.filter,'night'); assert.strictEqual(out.strength,80);
  assert.strictEqual(out.rule,'R1'); assert.strictEqual(out,rec);
});
FPc('偏好：null/非法 history 不抛错原样返回', ()=>{
  const rec={filter:'night',strength:80,reason:'x',rule:'R1'};
  assert.strictEqual(_applyPref(rec,null),rec);
  assert.strictEqual(_applyPref(rec,'bad'),rec);
  assert.strictEqual(_applyPref(null,[]),null);
  assert.strictEqual(_applyPref({filter:null},[]).filter,null);
});
FPc('偏好：推翻 2 次不触发（<3）', ()=>{
  const rec={filter:'night',rule:'R1',scene:'night'};
  const h=[{rule:'R1',scene:'night'},{rule:'R1',scene:'night'}];
  assert.strictEqual(_applyPref(rec,h).filter,'night');
});
FPc('偏好：推翻 3 次 → 本场景 null', ()=>{
  const rec={filter:'night',rule:'R1',scene:'night'};
  const h=[{rule:'R1',scene:'night'},{rule:'R1',scene:'night'},{rule:'R1',scene:'night'}];
  const out=_applyPref(rec,h);
  assert.strictEqual(out.filter,null); assert.strictEqual(out.strength,0); assert.strictEqual(out.rule,'R1(PREF)');
});
FPc('偏好：4 次以上仍 null（有界）', ()=>{
  const rec={filter:'night',rule:'R1',scene:'night'};
  const h=[{rule:'R1',scene:'night'},{rule:'R1',scene:'night'},{rule:'R1',scene:'night'},{rule:'R1',scene:'night'},{rule:'R1',scene:'night'}];
  assert.strictEqual(_applyPref(rec,h).filter,null);
});
FPc('偏好：跨场景不误伤——R1@night 推翻不影响 R1@landscape', ()=>{
  const rec={filter:'night',rule:'R1',scene:'landscape'};
  const h=[{rule:'R1',scene:'night'},{rule:'R1',scene:'night'},{rule:'R1',scene:'night'}];
  assert.strictEqual(_applyPref(rec,h).filter,'night');
});
FPc('偏好：跨 rule 不误伤——R4 推翻不影响 R1', ()=>{
  const rec={filter:'night',rule:'R1',scene:'night'};
  const h=[{rule:'R4',scene:'night'},{rule:'R4',scene:'night'},{rule:'R4',scene:'night'}];
  assert.strictEqual(_applyPref(rec,h).filter,'night');
});
FPc('偏好：rec 本就 null 时不再包装', ()=>{
  const rec={filter:null,strength:0,rule:'GATE'};
  const out=_applyPref(rec,[{rule:'GATE'}]);
  assert.strictEqual(out.filter,null);
});
FPc('偏好：history 含坏条目被跳过', ()=>{
  const rec={filter:'night',rule:'R1',scene:'night'};
  const h=[null,{x:1},{rule:'R1',scene:'night'},{rule:'R1',scene:'night'}];
  assert.strictEqual(_applyPref(rec,h).filter,'night'); // 有效2条<3
});
FPc('偏好：确定性——同输入两次结果一致', ()=>{
  const rec={filter:'night',rule:'R1',scene:'night'};
  const h=[{rule:'R1',scene:'night'},{rule:'R1',scene:'night'},{rule:'R1',scene:'night'}];
  assert.deepStrictEqual(_applyPref(rec,h),_applyPref(rec,h));
});

/* -------------------- v9.4.0 光位/视线补强 -------------------- */
test('bgFace: 逆光黑脸（脸0.4背景）+平光 → 提示', ()=>{
  assert.strictEqual(_lightDiagnosisPro({frameMean:150,faceMean:50,lightKey:'flat'}).id,'bgFace');
});
test('bgFace: 死区（ratio≈1）不报', ()=>{
  assert.strictEqual(_lightDiagnosisPro({frameMean:120,faceMean:110,lightKey:'flat'}),null);
});
test('bgFace: 脸<0.6背景但侧光不报（只提示平光逆光）', ()=>{
  assert.strictEqual(_lightDiagnosisPro({frameMean:150,faceMean:50,lightKey:'split'}),null);
});
test('bgFace: 非法入参不抛错返回null', ()=>{
  assert.strictEqual(_lightDiagnosisPro(null),null);
  assert.strictEqual(_lightDiagnosisPro({frameMean:0,faceMean:5}),null);
  assert.strictEqual(_lightDiagnosisPro({frameMean:'x',faceMean:5}),null);
});
test('gazePro: 死区 |rNose|<0.05 不做', ()=>{
  assert.strictEqual(_gazeGuardPro({rNose:0.03,eyeSpan:0.3}),null);
});
test('gazePro: 浅侧 0.07 → 1.5:1', ()=>{
  const r=_gazeGuardPro({rNose:0.07,eyeSpan:0.3});
  assert.strictEqual(r.dir,1); assert.strictEqual(r.noseRoomRatio,1.5);
});
test('gazePro: 明显侧脸 0.15 → 2:1', ()=>{
  const r=_gazeGuardPro({rNose:-0.15,eyeSpan:0.3});
  assert.strictEqual(r.dir,-1); assert.strictEqual(r.noseRoomRatio,2.0);
});
test('gazePro: 耳距符号矛盾 → 回退居中null', ()=>{
  // rNose 朝右(+)，earLR 右耳距大(lg>0 应为朝右)——构造矛盾：rNose正 earLR<1(lg<0 朝左)
  assert.strictEqual(_gazeGuardPro({rNose:0.15,earLR:0.5,eyeSpan:0.3}),null);
});
test('gazePro: 耳距符号一致 → 正常判向', ()=>{
  assert.strictEqual(_gazeGuardPro({rNose:0.15,earLR:2.0,eyeSpan:0.3}).dir,1);
});
test('gazePro: eyeSpan 过小 → null不抛错', ()=>{
  assert.strictEqual(_gazeGuardPro({rNose:0.2,eyeSpan:1e-5}),null);
  assert.strictEqual(_gazeGuardPro(null),null);
});

/* -------------------- v9.5.0 候选池 R5/R6 + 采纳正向偏好 -------------------- */
test('采纳偏好：3 次采纳 → 强度+10 有界', ()=>{
  const rec={filter:'night',strength:80,reason:'x',rule:'R1',scene:'night'};
  const h=[{rule:'R1',scene:'night',type:'adopt'},{rule:'R1',scene:'night',type:'adopt'},{rule:'R1',scene:'night',type:'adopt'}];
  const out=_applyPref(rec,h);
  assert.strictEqual(out.filter,'night'); assert.strictEqual(out.strength,90); assert.strictEqual(out.rule,'R1(PREF+)');
});
test('采纳偏好：2 次采纳不加权', ()=>{
  const rec={filter:'night',strength:80,rule:'R1',scene:'night'};
  const h=[{rule:'R1',scene:'night',type:'adopt'},{rule:'R1',scene:'night',type:'adopt'}];
  assert.strictEqual(_applyPref(rec,h).strength,80);
});
test('采纳偏好：强度有界 ≤100', ()=>{
  const rec={filter:'night',strength:95,rule:'R1',scene:'night'};
  const h=[{rule:'R1',scene:'night',type:'adopt'},{rule:'R1',scene:'night',type:'adopt'},{rule:'R1',scene:'night',type:'adopt'}];
  assert.strictEqual(_applyPref(rec,h).strength,100);
});
test('采纳偏好：旧记录无 type 按推翻处理', ()=>{
  const rec={filter:'night',strength:80,rule:'R1',scene:'night'};
  const h=[{rule:'R1',scene:'night'},{rule:'R1',scene:'night'},{rule:'R1',scene:'night'}];
  assert.strictEqual(_applyPref(rec,h).filter,null);
});

/* -------------------- v11.0.0 实时引导精化 + 构图类型判定 -------------------- */
test('distancePro: personHR=0.95 → 太近后退', () => {
  const r = _guidanceDistancePro({faceConf:0.9, personHR:0.95, faceHR:0.6});
  assert.ok(r && r.dir==='near' && r.txt.indexOf('半步')>=0);
});
test('distancePro: personHR=0.18 → 走近', () => {
  const r = _guidanceDistancePro({faceConf:0.9, personHR:0.18, faceHR:0.1});
  assert.ok(r && r.dir==='far' && r.txt.indexOf('走近')>=0);
});
test('distancePro: personHR=0.45 半身舒适带 → ok-hold', () => {
  const r = _guidanceDistancePro({faceConf:0.9, personHR:0.45, faceHR:0.2});
  assert.ok(r && r.dir==='ok-hold');
});
test('distancePro: personHR=0.85 特写头肩死区内 → null', () => {
  assert.strictEqual(_guidanceDistancePro({faceConf:0.9, personHR:0.85, faceHR:0.5}), null);
});
test('distancePro: faceConf=0.6 低置信 → null', () => {
  assert.strictEqual(_guidanceDistancePro({faceConf:0.6, personHR:0.95}), null);
});
test('distancePro: 无人体框回退 faceHR=0.85 → 太近', () => {
  const r = _guidanceDistancePro({faceConf:0.9, faceHR:0.85});
  assert.ok(r && r.dir==='near');
});
test('waistLevel: 全身 personCY=0.62 → 放低', () => {
  const r = _guidanceWaistLevel({faceConf:0.9, personHR:0.85, headTop:0.20, personBottom:1.05});
  assert.ok(r && r.dir==='down');
});
test('waistLevel: 全身 personCY=0.38 → 举高', () => {
  const r = _guidanceWaistLevel({faceConf:0.9, personHR:0.85, headTop:-0.05, personBottom:0.80});
  assert.ok(r && r.dir==='up');
});
test('waistLevel: 半身 shotSize 不足 → null', () => {
  assert.strictEqual(_guidanceWaistLevel({faceConf:0.9, personHR:0.5, headTop:0.1, personBottom:0.6}), null);
});
test('waistLevel: 全身 personCY=0.50 居中死区 → null', () => {
  assert.strictEqual(_guidanceWaistLevel({faceConf:0.9, personHR:0.85, headTop:0.08, personBottom:0.93}), null);
});
test('waistLevel: personBottom 缺失 → null', () => {
  assert.strictEqual(_guidanceWaistLevel({faceConf:0.9, personHR:0.85, headTop:0.20, personBottom:null}), null);
});
test('singlePersonGate: faceCount=3 → applicable:false', () => {
  const r = _singlePersonGate({faceCount:3, personCount:1});
  assert.ok(r && r.applicable===false);
});
test('singlePersonGate: 单人 → applicable:true', () => {
  const r = _singlePersonGate({faceCount:1, personCount:1});
  assert.ok(r && r.applicable===true);
});
test('singlePersonGate: 人数缺失 → null', () => {
  assert.strictEqual(_singlePersonGate({faceCount:null}), null);
});
test('classifyComposition: 单人全身右三分 → 右三分法·全身构图', () => {
  const r = _classifyComposition({faceConf:0.9, personHR:0.9, faceHR:0.3, personCx:0.63, yawDir:1, earSpanOK:true, sym:0.2, faceCount:1, personCount:1, headTop:0.05, personBottom:0.95});
  assert.ok(r && r.type==='thirds-right' && r.shotSize==='full' && r.txt.indexOf('右三分法')>=0);
});
test('classifyComposition: 强对称 → 对称构图', () => {
  const r = _classifyComposition({faceConf:0.9, personHR:0.6, faceHR:0.3, personCx:0.5, yawDir:0, earSpanOK:true, sym:0.8, faceCount:1, personCount:1, headTop:0.1, personBottom:0.7});
  assert.ok(r && r.type==='sym');
});
test('classifyComposition: personCx=0.45 落缝 → null', () => {
  assert.strictEqual(_classifyComposition({faceConf:0.9, personHR:0.6, faceHR:0.3, personCx:0.45, yawDir:1, earSpanOK:true, sym:0.2, faceCount:1, personCount:1, headTop:0.1, personBottom:0.7}), null);
});
test('classifyComposition: 两人合影 → null', () => {
  assert.strictEqual(_classifyComposition({faceConf:0.9, personHR:0.6, faceHR:0.3, personCx:0.33, yawDir:1, earSpanOK:true, sym:0.2, faceCount:2, personCount:2, headTop:0.1, personBottom:0.7}), null);
});
test('classifyComposition: yawDir=0 且 earSpanOK=false → null', () => {
  assert.strictEqual(_classifyComposition({faceConf:0.9, personHR:0.6, faceHR:0.3, personCx:0.33, yawDir:0, earSpanOK:false, sym:0.2, faceCount:1, personCount:1, headTop:0.1, personBottom:0.7}), null);
});
test('classifyComposition: faceHR=0.03 远景 → null', () => {
  assert.strictEqual(_classifyComposition({faceConf:0.9, personHR:0.1, faceHR:0.03, personCx:0.33, yawDir:1, earSpanOK:true, sym:0.2, faceCount:1, personCount:1, headTop:0.4, personBottom:0.5}), null);
});

/* -------------------- v11.1.0 叠加层声明 _composeOverlay -------------------- */
test('overlay: 三分+人框+锚点命中', () => {
  const r = _composeOverlay({crop:[0.05,0.05,0.95,0.95], grid:"thirds-right", personBox:{x0:0.3,y0:0.1,x1:0.4,y1:0.9}, personCx:0.66, personCY:0.66});
  assert.deepStrictEqual(r.gridLines,["v1/3","v2/3","h1/3","h2/3"]);
  assert.strictEqual(r.protectBands.length,2);
  assert.deepStrictEqual(r.cropBox,[0.05,0.05,0.95,0.95]);
  assert.ok(r.anchors.length===1 && r.anchors[0].label==="✓");
});
test('overlay: center → 中心线', () => {
  const r = _composeOverlay({crop:[0,0,1,1], grid:"center"});
  assert.deepStrictEqual(r.gridLines,["center-v","center-h"]);
  assert.strictEqual(r.protectBands.length,0);
});
test('overlay: sym → 对称轴', () => {
  assert.deepStrictEqual(_composeOverlay({crop:[0,0,1,1], grid:"sym"}).gridLines,["sym-axis"]);
});
test('overlay: crop 非法 → 空结构不抛错', () => {
  const r = _composeOverlay({crop:[NaN,0,1,1], grid:"thirds-right"});
  assert.deepStrictEqual(r.cropBox,null);
  assert.deepStrictEqual(r.anchors,[]);
});
test('overlay: crop 越界裁到 [0,1]', () => {
  assert.deepStrictEqual(_composeOverlay({crop:[-0.2,0.5,1.2,0.95]}).cropBox,[0,0.5,1,0.95]);
});
test('overlay: 空入参 → 空结构', () => {
  assert.deepStrictEqual(_composeOverlay(null),{gridLines:[],protectBands:[],cropBox:null,anchors:[]});
});

/* -------------------- v11.2.0 拍后即成片规划 _finalPipelinePlan -------------------- */
test('finalPlan: 有滤镜推荐 → 输出成片', () => {
  const r = _finalPipelinePlan({crop:[0.05,0.05,0.95,0.95], prefRec:{filter:"portrait-warm",strength:80,reason:"暖光环境，肤色更通透"}});
  assert.deepStrictEqual(r.crop,[0.05,0.05,0.95,0.95]);
  assert.strictEqual(r.filter,"portrait-warm");
  assert.strictEqual(r.strength,80);
  assert.ok(r.reason.indexOf("暖光")>=0);
  assert.deepStrictEqual(r.views,{compare:true,final:true});
  assert.ok(r.applyNote.indexOf("已自动裁切")>=0);
});
test('finalPlan: 无滤镜推荐 → 只裁切不套', () => {
  const r = _finalPipelinePlan({crop:[0,0,0,0], prefRec:{filter:null,strength:0,reason:""}});
  assert.strictEqual(r.filter,null);
  assert.strictEqual(r.strength,0);
  assert.strictEqual(r.reason,"");
  assert.ok(r.applyNote.indexOf("无合适滤镜")>=0);
});
test('finalPlan: crop 原样透传不改入参', () => {
  const c=[0.1,0.2,0.9,0.8];
  const r=_finalPipelinePlan({crop:c, prefRec:{filter:null}});
  r.crop[0]=0.99;
  assert.deepStrictEqual(c,[0.1,0.2,0.9,0.8]);
});
test('finalPlan: 空入参 → 默认结构', () => {
  const r=_finalPipelinePlan(null);
  assert.deepStrictEqual(r.crop,[0,0,0,0]);
  assert.strictEqual(r.filter,null);
});
test('finalPlan: filter 非 null 必带 reason（缺失补空串不崩）', () => {
  const r=_finalPipelinePlan({crop:[0,0,0,0], prefRec:{filter:"film-kodak"}});
  assert.strictEqual(r.filter,"film-kodak");
  assert.strictEqual(typeof r.reason,"string");
});

/* -------------------- v11.4.0 多主体状态标签 _classifyMulti -------------------- */
test('multi: 干净双人 → duo', () => {
  const r = _classifyMulti({ persons: [{h:0.6,cx:0.35,score:0.9},{h:0.5,cx:0.65,score:0.9}], sceneType:"portrait" });
  assert.ok(r && r.kind==="duo" && r.txt==="双人构图");
});
test('multi: 干净三人 → trio', () => {
  const r = _classifyMulti({ persons: [{h:0.6,cx:0.3,score:0.9},{h:0.5,cx:0.5,score:0.9},{h:0.45,cx:0.7,score:0.9}], sceneType:"portrait" });
  assert.ok(r && r.kind==="trio" && r.txt==="三人合影");
});
test('multi: nP=1 → null（交单人引擎）', () => {
  assert.strictEqual(_classifyMulti({ persons: [{h:0.6,cx:0.5,score:0.9}], sceneType:"portrait" }), null);
});
test('multi: nP=4 人群 → null', () => {
  assert.strictEqual(_classifyMulti({ persons: [{h:0.4,cx:0.2,score:0.9},{h:0.35,cx:0.4,score:0.9},{h:0.3,cx:0.6,score:0.9},{h:0.25,cx:0.8,score:0.9}], sceneType:"portrait" }), null);
});
test('multi: mainH<0.25 远人 → null', () => {
  assert.strictEqual(_classifyMulti({ persons: [{h:0.2,cx:0.3,score:0.9},{h:0.15,cx:0.6,score:0.9}], sceneType:"portrait" }), null);
});
test('multi: 主次比<0.55 主+路人 → null', () => {
  assert.strictEqual(_classifyMulti({ persons: [{h:0.6,cx:0.3,score:0.9},{h:0.2,cx:0.6,score:0.9}], sceneType:"portrait" }), null);
});
test('multi: hGap<0.12 叠站 → null', () => {
  assert.strictEqual(_classifyMulti({ persons: [{h:0.6,cx:0.48,score:0.9},{h:0.5,cx:0.52,score:0.9}], sceneType:"portrait" }), null);
});
test('multi: sceneType=night → null', () => {
  assert.strictEqual(_classifyMulti({ persons: [{h:0.6,cx:0.3,score:0.9},{h:0.5,cx:0.6,score:0.9}], sceneType:"night" }), null);
});
test('multi: sceneType=architecture → null', () => {
  assert.strictEqual(_classifyMulti({ persons: [{h:0.6,cx:0.3,score:0.9},{h:0.5,cx:0.6,score:0.9}], sceneType:"architecture" }), null);
});
test('multi: score<0.5 低质框过滤 → nP=1 → null', () => {
  assert.strictEqual(_classifyMulti({ persons: [{h:0.6,cx:0.3,score:0.9},{h:0.5,cx:0.6,score:0.3}], sceneType:"portrait" }), null);
});
test('multi: 空入参 → null', () => {
  assert.strictEqual(_classifyMulti(null), null);
});

/* -------------------- v11.6.0 新纯函数 -------------------- */
test('v116 distPro: 舒适带 [0.35,0.75] → ok-hold', () => {
  var r=_guidanceDistancePro({faceConf:0.9,personHR:0.5});
  assert.strictEqual(r.dir,'ok-hold'); assert.ok(r.txt.indexOf('保持')>=0);
});
test('v116 distPro: 太近 >0.90 → near 步进话术', () => {
  var r=_guidanceDistancePro({faceConf:0.9,personHR:0.95});
  assert.strictEqual(r.dir,'near'); assert.ok(r.txt.indexOf('半步')>=0);
});
test('v116 distPro: 死区 [0.25,0.35) → null', () => {
  assert.strictEqual(_guidanceDistancePro({faceConf:0.9,personHR:0.30}), null);
});
test('v116 distPro: 低置信 → null', () => {
  assert.strictEqual(_guidanceDistancePro({faceConf:0.5,personHR:0.5}), null);
});
test('v116 sceneTip: 人+地标上下分区', () => {
  var r=_sceneComposeTip({faceConf:0.9,sceneType:"architecture",hasLandmark:true,personHR:0.4,personCY:0.6});
  assert.strictEqual(r.id,'landmark-split');
});
test('v116 sceneTip: 引导线单人', () => {
  var r=_sceneComposeTip({faceConf:0.9,sceneType:"street",leadingLine:true,personCount:1});
  assert.strictEqual(r.id,'leading-line');
});
test('v116 sceneTip: 建筑对称居中建议', () => {
  var r=_sceneComposeTip({faceConf:0.9,sceneType:"architecture",sym:0.8,personHR:0.3});
  assert.strictEqual(r.id,'center-vs-thirds');
});
test('v116 sceneTip: 夜景 → null', () => {
  assert.strictEqual(_sceneComposeTip({faceConf:0.9,sceneType:"night",hasLandmark:true,personHR:0.4,personCY:0.6}), null);
});
test('v116 sceneTip: 特写 personHR>0.7 → null', () => {
  assert.strictEqual(_sceneComposeTip({faceConf:0.9,sceneType:"portrait",personHR:0.8}), null);
});
test('v116 aimAlign: 全在死区 → locked', () => {
  var r=_aimAlign({faceConf:0.9,personCx:0.66,personCY:0.34,alignTarget:{x:0.67,y:0.33}});
  assert.strictEqual(r.dir,'locked');
});
test('v116 aimAlign: 人偏右 → left', () => {
  var r=_aimAlign({faceConf:0.9,personCx:0.80,personCY:0.33,alignTarget:{x:0.67,y:0.33}});
  assert.strictEqual(r.dir,'left');
});
test('v116 aimAlign: 偏差在死区 → locked', () => {
  var r=_aimAlign({faceConf:0.9,personCx:0.70,personCY:0.33,alignTarget:{x:0.67,y:0.33}});
  assert.strictEqual(r.dir,'locked');
});
test('v116 aimAlign: 多人 → null', () => {
  assert.strictEqual(_aimAlign({faceConf:0.9,personCx:0.80,personCY:0.33,faceCount:2,alignTarget:{x:0.67,y:0.33}}), null);
});
test('v116 aimAlign: 人偏低 → up', () => {
  var r=_aimAlign({faceConf:0.9,personCx:0.67,personCY:0.50,alignTarget:{x:0.67,y:0.33}});
  assert.strictEqual(r.dir,'up');
});
test('v116 variants: 单人舒适带 → 2 方案', () => {
  var r=_composeVariants({faceConf:0.9,personHR:0.5,sceneType:"portrait",yawDir:"right",faceCount:1});
  assert.strictEqual(r.length,2);
});
test('v116 variants: 多人 → null', () => {
  assert.strictEqual(_composeVariants({faceConf:0.9,personHR:0.5,sceneType:"portrait",faceCount:2}), null);
});
test('v116 variants: 太远 personHR=0.2 → null', () => {
  assert.strictEqual(_composeVariants({faceConf:0.9,personHR:0.2,sceneType:"portrait"}), null);
});
test('v116 variants: 夜景 → null', () => {
  assert.strictEqual(_composeVariants({faceConf:0.9,personHR:0.5,sceneType:"night"}), null);
});
test('v116 scenePrefix: portrait 前缀', () => {
  assert.strictEqual(_scenePrefix("portrait",0.1),"阳光人像·");
});
test('v116 scenePrefix: night 前缀', () => {
  assert.strictEqual(_scenePrefix("night",0.1),"夜景·");
});
test('v116 scenePrefix: 未知无前缀', () => {
  assert.strictEqual(_scenePrefix("food",0.1),"");
});

/* -------------------- v11.17 双脑共识仲裁（31 例） -------------------- */
// 夹具
function mkL(tier, dir, lCrop, extra){
  return Object.assign({version:"v1117",deadZone:{top:{strength:0,strip:0},bottom:{strength:0,strip:0}},tier:tier,topTier:tier,bottomTier:tier,direction:dir,lCrop:lCrop,rule:"x",conf:60,sceneType:"landscape",hardProtection:false,signals:{hSym:0.1,vSym:0,mean:0.5,sat:0.2}}, extra||{});
}
function mkC(o){
  return Object.assign({keepOriginal:false,cropIntent:"crop_top",cropConf:60,keepConf:0,confMissing:false,hasReflection:false,symmetry:"none",flags:{},checklist:[]}, o||{});
}

// 死区强度（2）
test('v117 deadZone: 死白顶 strength≈0.9', () => {
  var e=[]; for(var i=0;i<100;i++) e.push(i<90?0.01:0.6);
  var r=_deadZoneStrength(e,100);
  assert.ok(r.top.strength>=0.85 && r.top.strength<=0.95, "top strength="+r.top.strength);
});
test('v117 deadZone: 内容铺满 strength≈0', () => {
  var e=[]; for(var i=0;i<100;i++) e.push(0.6);
  var r=_deadZoneStrength(e,100);
  assert.strictEqual(r.top.strength,0);
});
// 硬保护（3+反例1）
test('v117 hardProtect: 人脸被切→true', () => { assert.strictEqual(_hardProtectionHit(null,{flags:{cutFace:true}}), true); });
test('v117 hardProtect: 关节被切→true', () => { assert.strictEqual(_hardProtectionHit(null,{flags:{cutJoint:true}}), true); });
test('v117 hardProtect: 高彩带被切→true', () => { assert.strictEqual(_hardProtectionHit(null,{flags:{cutHighSat:true}}), true); });
test('v117 hardProtect: 无命中→false（反例）', () => { assert.strictEqual(_hardProtectionHit(null,{flags:{}}), false); });
// R1 本地强死区云端同向（3）
test('v117 R1: 本地强死区云端同向→本地框', () => {
  var r=_arbitrateCrop(mkL("strong","crop_top",[0,15,0,0]), mkC({cropIntent:"crop_top",cropConf:80}), [0,10,0,0], {flags:{}});
  assert.deepStrictEqual(r.crop,[0,15,0,0]);
});
test('v117 R1: 晚霞强死区云端crop_tb→本地框', () => {
  var r=_arbitrateCrop(mkL("strong","crop_tb",[0,12,0,12]), mkC({cropIntent:"crop_tb",cropConf:70}), [0,10,0,10], {flags:{}});
  assert.deepStrictEqual(r.crop,[0,12,0,12]);
});
test('v117 R1: 硬保护前置即使同向也否决不裁', () => {
  var r=_arbitrateCrop(mkL("strong","crop_top",[0,15,0,0]), mkC({cropIntent:"crop_top",cropConf:80}), [0,10,0,0], {flags:{cutFace:true}});
  assert.deepStrictEqual(r.crop,[0,0,0,0]);
});
// R2 本地弱/无死区云端强裁（3）
test('v117 R2: 本地弱+云端cropConf80→云端框', () => {
  var r=_arbitrateCrop(mkL("weak","none",[0,0,0,0]), mkC({cropIntent:"crop_top",cropConf:80}), [0,10,0,0], {flags:{}});
  assert.deepStrictEqual(r.crop,[0,10,0,0]);
});
test('v117 R2: 本地none+云端cropConf70→云端框', () => {
  var r=_arbitrateCrop(mkL("none","none",[0,0,0,0]), mkC({cropIntent:"crop_bottom",cropConf:70}), [0,0,0,8], {flags:{}});
  assert.deepStrictEqual(r.crop,[0,0,0,8]);
});
test('v117 R2: 本地trim+云端强裁→云端框', () => {
  var r=_arbitrateCrop(mkL("weak","trim",[0,2,0,0]), mkC({cropIntent:"crop_top",cropConf:90}), [0,12,0,0], {flags:{}});
  assert.deepStrictEqual(r.crop,[0,12,0,0]);
});
// R3a 本地强裁 vs 云端强保留（2）
test('v117 R3a: 本地强裁云端keepConf85→弃权', () => {
  var r=_arbitrateCrop(mkL("strong","crop_top",[0,15,0,0]), mkC({keepOriginal:true,cropIntent:"none",cropConf:0,keepConf:85}), [0,10,0,0], {flags:{}});
  assert.strictEqual(r.abstained,true); assert.deepStrictEqual(r.crop,[0,0,0,0]);
});
test('v117 R3a: 本地强裁云端反方向keepConf60→走R3b不弃权', () => {
  var r=_arbitrateCrop(mkL("strong","crop_top",[0,15,0,0]), mkC({cropIntent:"crop_bottom",cropConf:60,keepConf:60}), [0,0,0,10], {flags:{}});
  assert.notStrictEqual(r.abstained,true);
});
// R3b negotiate（2）
test('v117 R3b: 取保留面积大者', () => {
  var r=_negotiateBox([0,15,0,0],[0,5,0,0],{});
  assert.deepStrictEqual(r.crop,[0,5,0,0]);
});
test('v117 R3b: 打平取裁得更少者', () => {
  var r=_negotiateBox([0,8,0,0],[0,8,0,0],{});
  assert.deepStrictEqual(r.crop,[0,8,0,0]);
});
// R4 双不裁（3）
test('v117 R4: 本地none云端keepOriginal→Z', () => {
  var r=_arbitrateCrop(mkL("none","none",[0,0,0,0]), mkC({keepOriginal:true,cropIntent:"none",cropConf:0,keepConf:50}), [0,0,0,0], {flags:{}});
  assert.deepStrictEqual(r.crop,[0,0,0,0]);
});
test('v117 R4: 本地weak云端none→Z', () => {
  var r=_arbitrateCrop(mkL("weak","none",[0,0,0,0]), mkC({keepOriginal:true,cropIntent:"none",cropConf:0,keepConf:40}), [0,0,0,0], {flags:{}});
  assert.deepStrictEqual(r.crop,[0,0,0,0]);
});
test('v117 R4: 本地none云端keep+主体大→Z', () => {
  var r=_arbitrateCrop(mkL("none","none",[0,0,0,0],{signals:{hSym:0.1,bodyRatio:0.8}}), mkC({keepOriginal:true,cropIntent:"none",cropConf:0,keepConf:50}), [0,0,0,0], {flags:{}});
  assert.deepStrictEqual(r.crop,[0,0,0,0]);
});
// R-conf 置信缺失（2）
test('v117 Rconf: 云端置信缺失→本地框×0.5', () => {
  var r=_arbitrateCrop(mkL("strong","crop_top",[0,16,0,0]), mkC({cropIntent:"crop_top",cropConf:50,keepConf:0,confMissing:true}), [0,10,0,0], {flags:{}});
  assert.deepStrictEqual(r.crop,[0,8,0,0]);
});
test('v117 Rconf: cropConf=49<50且缺失→×0.5', () => {
  var r=_arbitrateCrop(mkL("strong","crop_top",[0,14,0,0]), mkC({cropIntent:"crop_top",cropConf:49,keepConf:0,confMissing:true}), [0,10,0,0], {flags:{}});
  assert.deepStrictEqual(r.crop,[0,7,0,0]);
});
// R7 低置信（2）
test('v117 R7: 本地强裁云端cropConf30→×0.5', () => {
  var r=_arbitrateCrop(mkL("strong","crop_top",[0,16,0,0]), mkC({cropIntent:"crop_top",cropConf:30,keepConf:0,confMissing:false}), [0,10,0,0], {flags:{}});
  assert.deepStrictEqual(r.crop,[0,8,0,0]);
});
test('v117 R7: 本地强裁云端cropConf40→×0.5', () => {
  var r=_arbitrateCrop(mkL("strong","crop_top",[0,12,0,0]), mkC({cropIntent:"crop_top",cropConf:40,keepConf:0,confMissing:false}), [0,10,0,0], {flags:{}});
  assert.deepStrictEqual(r.crop,[0,6,0,0]);
});
// 解析校验（4）
test('v117 parse: 枚举越界回退none', () => {
  var C=_parseIntentCloud({cropIntent:"banana"}, null);
  assert.strictEqual(C.cropIntent,"none");
});
test('v117 parse: hasReflection+hSym0.1非豁免→false', () => {
  var L=mkL("none","none",[0,0,0,0],{sceneType:"portrait",signals:{hSym:0.1,bottomRod:false}});
  var C=_parseIntentCloud({hasReflection:true}, L);
  assert.strictEqual(C.hasReflection,false);
});
test('v117 parse: waterscape豁免→保留true', () => {
  var L=mkL("none","none",[0,0,0,0],{sceneType:"waterscape",signals:{hSym:0.1,bottomRod:true}});
  var C=_parseIntentCloud({hasReflection:true}, L);
  assert.strictEqual(C.hasReflection,true);
});
test('v117 parse: cropConf拆为云端裁置信', () => {
  var C=_parseIntentCloud({keepOriginal:false,cropIntent:"crop_top",decisionConf:72}, null);
  assert.strictEqual(C.cropConf,72); assert.strictEqual(C.keepConf,0);
});
// 矛盾字段（2）
test('v117 conflict: cropIntent=crop_top但keepOriginal→keep优先', () => {
  var C=_parseIntentCloud({keepOriginal:true,cropIntent:"crop_top",decisionConf:80}, null);
  assert.strictEqual(C.keepOriginal,true); assert.strictEqual(C.cropIntent,"none");
});
test('v117 conflict: cropConf越界夹到0..100', () => {
  var C=_parseIntentCloud({keepOriginal:false,cropIntent:"crop_top",decisionConf:150}, null);
  assert.strictEqual(C.cropConf,100);
});
// 置信边界（2）
test('v117 boundary: cropConf=60(inclusive)→R2', () => {
  var r=_arbitrateCrop(mkL("weak","none",[0,0,0,0]), mkC({cropIntent:"crop_top",cropConf:60}), [0,9,0,0], {flags:{}});
  assert.deepStrictEqual(r.crop,[0,9,0,0]);
});
test('v117 boundary: keepConf=70(inclusive)→R3a弃权', () => {
  var r=_arbitrateCrop(mkL("strong","crop_top",[0,15,0,0]), mkC({keepOriginal:true,cropIntent:"none",cropConf:0,keepConf:70}), [0,10,0,0], {flags:{}});
  assert.strictEqual(r.abstained,true);
});
// 极端图（2）
test('v117 extreme: 全白→tier=none', () => {
  var L=_extractIntentLocal({rowEnergy:[0.0001,0.0001],h:2}, {crop:[0,0,0,0],sceneType:"landscape"});
  assert.strictEqual(L.tier,"none");
});
test('v117 extreme: _cropIntentFromBox满裁→crop_tb', () => {
  assert.strictEqual(_cropIntentFromBox([0,15,0,15]),"crop_tb");
});

/* -------------------- 汇总 -------------------- */

// v11.23.0 三护栏单测
test('g',function(){ assert.strictEqual(_hueInWarmBand(350,330,30), true); });
test('g',function(){ assert.strictEqual(_hueInWarmBand(200,330,30), false); });
test('g',function(){ var c=_sunsetWarmGuard([0,10,0,0],{topBandHsv:{h:350,v:0.8,ratio:0.6}}); assert.deepStrictEqual(c,[0,0,0,0]); });
test('g',function(){ var c=_sunsetWarmGuard([0,10,0,0],{topBandHsv:{h:200,v:0.8,ratio:0.6}}); assert.deepStrictEqual(c,[0,10,0,0]); });
test('g',function(){ var c=_sunsetWarmGuard([0,10,0,0],{topBandHsv:{h:350,v:0.4,ratio:0.6}}); assert.deepStrictEqual(c,[0,10,0,0]); });
test('g',function(){ var c=_foodMisClassGuard([0,10,0,5],{sceneType:'food',bandSat:0.2,hasFoodEvidence:true}); assert.deepStrictEqual(c,[0,0,0,0]); });
test('g',function(){ var c=_foodMisClassGuard([0,10,0,5],{sceneType:'portrait',bandSat:0.2,hasFoodEvidence:true}); assert.deepStrictEqual(c,[0,10,0,5]); });
test('g',function(){ var c=_foodMisClassGuard([0,10,0,5],{sceneType:'food',bandSat:0.4,hasFoodEvidence:true}); assert.deepStrictEqual(c,[0,10,0,5]); });
test('g',function(){ var c=_symmetryGuard([10,5,10,5],{symEdge:{ncc:0.7,eRatio:1.0,var:10000}}); assert.deepStrictEqual(c,[0,2,0,2]); });
test('g',function(){ var c=_symmetryGuard([10,5,10,5],{symEdge:{ncc:0.7,eRatio:0.3,var:10000}}); assert.deepStrictEqual(c,[10,5,10,5]); });
test('g',function(){ var c=_symmetryGuard([10,5,10,5],{symEdge:{ncc:0.5,eRatio:1.0,var:10000}}); assert.deepStrictEqual(c,[10,5,10,5]); });

/* -------------------- v12.1.0 G审计P0: _decloudPlan（关云降级） -------------------- */
test('decloudPlan: 剥离 cloud/cloudPending/cloudSkipped，保留业务字段', () => {
  var p={rule:'thirds',crop:[1,2,3,4],conf:80,cloud:true,cloudPending:true,cloudSkipped:true,sceneType:'portrait'};
  var o=_decloudPlan(p);
  assert.strictEqual(o.cloud,false);
  assert.strictEqual('cloudPending' in o,false);
  assert.strictEqual('cloudSkipped' in o,false);
  assert.strictEqual(o.rule,'thirds');
  assert.deepStrictEqual(o.crop,[1,2,3,4]);
  assert.strictEqual(o.conf,80);
  assert.strictEqual(o.sceneType,'portrait');
  // 原对象不被污染
  assert.strictEqual(p.cloud,true);
  assert.strictEqual(!!p.cloudPending,true);
});
test('decloudPlan: null/undefined 安全返回', () => {
  assert.strictEqual(_decloudPlan(null),null);
  assert.strictEqual(_decloudPlan(undefined),undefined);
});
test('decloudPlan: 降级后结果页不再携带任何云端标记位', () => {
  var o=_decloudPlan({cloud:true,cloudPending:true,cloudSkipped:true,cloudSkipReason:'x'});
  assert.strictEqual(o.cloud,false);
  assert.strictEqual('cloudPending' in o,false);
  assert.strictEqual('cloudSkipped' in o,false);
});

/* -------------------- v12.1.0 信号①: _bandSatSignal（顶带平均饱和度） -------------------- */
function mkRgba(px,w,h){ var d=Buffer.alloc(w*h*4); px.forEach(function(c,i){ d[i*4]=c[0]; d[i*4+1]=c[1]; d[i*4+2]=c[2]; d[i*4+3]=255; }); return d; }
test('bandSatSignal: 纯灰图饱和度≈0', () => {
  var d=mkRgba([[128,128,128],[128,128,128],[128,128,128],[128,128,128]],2,2);
  var s=_bandSatSignal(d,2,2,0.40);
  assert.ok(s<0.02,'灰图饱和度应≈0，实际 '+s);
});
test('bandSatSignal: 高饱和纯色→接近1', () => {
  // 4x2 图，顶50%=第一行：纯红(255,0,0) 与纯蓝(0,0,255)，S=(mx-mn)/mx=1
  var px=[[255,0,0],[255,0,0],[0,0,255],[0,0,255], [128,128,128],[128,128,128],[128,128,128],[128,128,128]];
  var d=mkRgba(px,4,2);
  var s=_bandSatSignal(d,4,2,0.50);
  assert.ok(s>0.9,'高饱和顶带饱和度应接近1，实际 '+s);
});
test('bandSatSignal: 非法输入回退 0.25', () => {
  assert.strictEqual(_bandSatSignal(null,2,2,0.4),0.25);
  assert.strictEqual(_bandSatSignal([],0,0,0.4),0.25);
});

/* -------------------- v12.1.0 信号②: _symEdgeSignal（NCC 对称度） -------------------- */
test('symEdgeSignal: 完全镜像对称→ncc≈1 且 eRatio≈1', () => {
  // 4x2 网格严格镜像：行0 [10,20,20,10] 行1 [30,40,40,30]
  var grid=[10,20,20,10, 30,40,40,30];
  var edgeCol=[0.2,0.2,0.2,0.2];
  var r=_symEdgeSignal(grid,4,2,edgeCol,4,null,0);
  assert.ok(Math.abs(r.ncc-1)<1e-6,'镜像对称 ncc 应=1，实际 '+r.ncc);
  assert.ok(Math.abs(r.eRatio-1)<1e-6,'左右能量应均衡，实际 '+r.eRatio);
});
test('symEdgeSignal: 左右反差镜像→ncc≈0', () => {
  var grid=[10,20,80,90, 30,40,50,60];
  var r=_symEdgeSignal(grid,4,2,[0.2,0.2,0.2,0.2],4,null,0);
  assert.ok(r.ncc<0.05,'反相关镜像 ncc 应≈0，实际 '+r.ncc);
});
test('symEdgeSignal: 有纹理左半区 var 达标', () => {
  var grid=[10,20,20,10, 30,40,40,30];
  // lum 4x2：左半两列用 0/255 交替（右半平涂128）→ 左半 var=16256
  var lum=[0,255,128,128, 0,255,128,128];
  var r=_symEdgeSignal(grid,4,2,[0.2,0.2,0.2,0.2],4,lum,2);
  assert.ok(r.var>8000,'强纹理左半 var 应>8000，实际 '+r.var);
});
test('symEdgeSignal: 非法输入→ncc=0 不触发护栏', () => {
  var r=_symEdgeSignal(null,0,0,null,0,null,0);
  assert.strictEqual(r.ncc,0);
  assert.strictEqual(r.var,0);
});

/* -------------------- v12.1.0 信号③: _foodEvidenceSignal（真美食证据） -------------------- */
test('foodEvidenceSignal: 暖色占比不足直接 false', () => {
  var lum=[128,128,128,128, 100,150,100,150];
  assert.strictEqual(_foodEvidenceSignal(0.05,lum,4,2),false);
});
test('foodEvidenceSignal: 暖调+下半纹理适中→true', () => {
  // 4x4：下半两行 y=2,3 用 80/180 交替（方差=2500，落在 800~9000）
  var lum=[128,128,128,128, 128,128,128,128, 80,180,80,180, 80,180,80,180];
  assert.strictEqual(_foodEvidenceSignal(0.20,lum,4,4),true);
});
test('foodEvidenceSignal: 暖调但下半空白平涂→false', () => {
  var lum=[128,128,128,128, 128,128,128,128, 128,128,128,128, 128,128,128,128];
  assert.strictEqual(_foodEvidenceSignal(0.20,lum,4,4),false);
});
test('foodEvidenceSignal: 暖调但下半对比过烈→false（非美食场景）', () => {
  // 0/255 交替 → var=16256 >9000
  var lum=[128,128,128,128, 128,128,128,128, 0,255,0,255, 0,255,0,255];
  assert.strictEqual(_foodEvidenceSignal(0.20,lum,4,4),false);
});
test('foodEvidenceSignal: null lum 安全 false', () => {
  assert.strictEqual(_foodEvidenceSignal(0.2,null,4,4),false);
});

/* -------------------- v12.1.0 三护栏×真实信号联动（只减不增） -------------------- */
test('guard链: 真对称信号左右不裁、顶底裁减半(护垂直对称)', () => {
  var c=[12,8,12,8];
  var out=_symmetryGuard(c,{symEdge:{ncc:0.85,eRatio:1.05,var:12000}});
  assert.deepStrictEqual(out,[0,3,0,3]);
  assert.ok(out[0]===0&&out[2]===0,'左右边不应裁（保对称轴）');
  assert.ok(out[1]===3&&out[3]===3,'顶底裁减半为原0.4，护倒影/建筑垂直对称');
});
test('guard链: food真证据+低饱和顶带→只减顶底边', () => {
  var out=_foodMisClassGuard([12,8,12,8],{sceneType:'food',bandSat:0.18,hasFoodEvidence:true});
  assert.deepStrictEqual(out,[12,0,12,0]);
});

if (process.exitCode) {
  console.log(`\n有测试失败：已通过 ${passed} 个`);
} else {
  console.log(`\n✓ 单元测试全部通过：${passed}/${passed}（滤镜推荐打分制）`);
}

// -------------------- v12.10: _contentGuard + aestheticScore --------------------
{
  const { _contentGuard, aestheticScore } = require('./pure-functions.js');
  // 极暗图不裁
  assert.strictEqual(_contentGuard(10, 0.2, 0.1), true, '极暗图应不裁');
  assert.strictEqual(_contentGuard(200, 0.2, 0.1), false, '正常亮度应裁');
  // 纯色/灰图不裁
  assert.strictEqual(_contentGuard(128, 0.01, 0.01), true, '纯色灰图应不裁');
  // 截图/UI不裁
  assert.strictEqual(_contentGuard(128, 0.05, 0.5), true, '高边缘低饱和截图应不裁');
  // 正常照片不触发
  assert.strictEqual(_contentGuard(120, 0.3, 0.1), false, '正常照片不应不裁');
  // null安全
  assert.strictEqual(_contentGuard(-1, 0.3, 0.1), false, 'null安全');
  // aestheticScore
  var good = aestheticScore(0.7, 0.4, 0.1, 0.9, 0.8);
  var bad = aestheticScore(0.1, 0.05, 0.4, 0.2, 0.1);
  assert.ok(good > bad, '好构图分应高于差构图: '+good+' vs '+bad);
  assert.ok(good >= 60 && good <= 100, '好构图分在合理范围: '+good);
  assert.ok(bad >= 0 && bad <= 60, '差构图分在合理范围: '+bad);
  console.log('  ✓ v12.10 _contentGuard + aestheticScore（9条）');
}

// -------------------- v12.11.0: _thirdsFitScore --------------------
{
  const { _thirdsFitScore } = require('./pure-functions.js');
  // 完美落在三分交点
  assert.ok(_thirdsFitScore(1/3, 1/3) > 0.9, '交点应接近1: '+_thirdsFitScore(1/3,1/3));
  // 正中应较低
  assert.ok(_thirdsFitScore(0.5, 0.5) < 0.6, '正中应<0.5: '+_thirdsFitScore(0.5,0.5));
  // 右上角2/3,1/3也是交点
  assert.ok(_thirdsFitScore(2/3, 1/3) > 0.9, '右上交点应>0.9');
  // null安全
  assert.ok(_thirdsFitScore(-1, -1) === 0.5, 'null安全');
  console.log('  ✓ v12.11.0 _thirdsFitScore（4条）');
}

// -------------------- v12.27.0: _proactiveComposition --------------------
{
  const A={frameAspect:0.75,cx:0.5,cy:0.5,sigBox:[0.25,0.2,0.75,0.8],bodyRatio:0.25,
    edgeEnergy:{col:[0.5,0.4,0.3,0.2],row:[0.5,0.4,0.3,0.2]},sym:0.1,diagStrength:0.1,rowGap:10,
    topBandHsv:{ratio:0.05},blueWater:0};
  const r=_proactiveComposition(A,{sceneType:'street',crop:[0,0,0,0],noCrop:true});
  assert.ok(r && r.crop, '竖幅街景应给出 4:5 候选');
  assert.ok(r.crop[0]+r.crop[2]===0, '4:5 候选只裁上下');
  assert.ok(r.crop[1]<=8 && r.crop[3]<=8, '上下裁切应温和');
  assert.ok(_proactiveComposition(A,{sceneType:'portrait',crop:[0,0,0,0]})===null, '人像不主动裁');
  const sunset=Object.assign({},A,{topBandHsv:{ratio:0.6}});
  const rs=_proactiveComposition(sunset,{sceneType:'street',crop:[0,0,0,0]});
  assert.ok(rs && rs.crop[1]===0, '晚霞/蓝天顶部应保留，裁切让给底部');
  const leadCol=[]; for(let i=0;i<24;i++) leadCol.push((i<3||i>20)?0.05:0.6);
  const lead=Object.assign({},A,{frameAspect:4/3,diagStrength:0.5,rowGap:30,
    edgeEnergy:{col:leadCol,row:[0.4,0.4,0.4,0.4]}});
  const r2=_proactiveComposition(lead,{sceneType:'street',crop:[0,0,0,0]});
  assert.ok(r2 && r2.crop, '横图引导线应给出候选');
  assert.ok(r2.crop[0]>=8||r2.crop[2]>=8||r2.crop[1]>=8||r2.crop[3]>=8, '应有明显裁切（画幅或引导线）');
  console.log('  ✓ v12.27.0 _proactiveComposition（6条）');
}

// -------------------- v12.28.0: 人景共存安全构图 --------------------
{
  const base={frameAspect:0.75,cx:0.3,cy:0.5,sigBox:[0.12,0.18,0.46,0.92],bodyRatio:0.3,
    edgeEnergy:{col:new Array(24).fill(0.2).map((v,i)=>i<3||i>20?0.05:0.6),row:new Array(16).fill(0.4)},
    sym:0.1,diagStrength:0.2,rowGap:12,topBandHsv:{ratio:0.05},blueWater:0,
    allBoxes:[{class:'person',score:0.82,b:[0.12,0.18,0.46,0.92]}]};
  const pb=_personBoxOf(base);
  assert.ok(pb && Math.abs(pb[0]-0.12)<1e-6, '人物框提取');
  const r=_proactiveComposition(base,{sceneType:'street',crop:[0,0,0,0],noCrop:true});
  assert.ok(r && r.crop, '街景有人时应给出安全构图');
  assert.ok(/人景构图/.test(r.tag), '应标记人景构图');
  assert.ok(pb[0]>=r.crop[0]/100+0.03-1e-6, '左安全边');
  assert.ok(pb[2]<=1-r.crop[2]/100-0.03+1e-6, '右安全边');
  const full=Object.assign({},base,{allBoxes:[{class:'person',score:0.9,b:[0.05,0.02,0.95,0.98]}],cocoPersonBox:{l:0.05,t:0.02,r:0.95,b:0.98}});
  assert.strictEqual(_proactiveComposition(full,{sceneType:'street',crop:[0,0,0,0]}),null,'满框人物不强裁');
  assert.strictEqual(_proactiveComposition(base,{sceneType:'portrait',crop:[0,0,0,0]}),null,'人像场景不主动裁');
  console.log('  ✓ v12.28.0 人景共存安全构图（6条）');
}

// -------------------- v12.29.0: 大侧裁暗部呼吸 + 4:5 画幅平衡 --------------------
{
  const underpass={frameAspect:0.75,cx:0.303,cy:0.489,sigBox:[0,0,1,1],bodyRatio:0.075,
    edgeEnergy:{col:new Array(24).fill(0.4),row:new Array(16).fill(0.4)},allBoxes:[]};
  const r=_balanceCrop(underpass,{sceneType:'general',crop:[0,0,18,0],noCrop:false});
  assert.ok(r && r.length===4, '地下通道大侧裁应给出平衡候选');
  assert.strictEqual(r[0],0,'左边不新增');
  assert.ok(r[2]>=5 && r[2]<=10,'右侧保留暗部呼吸: '+r[2]);
  assert.ok(r[3]>=12 && r[3]<=18,'底部收紧空地面: '+r[3]);
  assert.ok(r[1]===0,'顶部不新增');
  const real=0.75*(1-r[0]/100-r[2]/100)/(1-r[1]/100-r[3]/100);
  assert.ok(Math.abs(real-0.8)<0.015,'候选应接近 4:5: '+real);
  assert.strictEqual(_balanceCrop(Object.assign({},underpass,{frameAspect:1.5}),{sceneType:'street',crop:[0,0,18,0]}),null,'横图不走竖幅平衡');
  assert.strictEqual(_balanceCrop(underpass,{sceneType:'portrait',crop:[0,0,18,0]}),null,'人像不自动重平衡');
  const personNearBottom=Object.assign({},underpass,{allBoxes:[{class:'person',score:0.9,b:[0.2,0.2,0.5,0.95]}],cocoPersonBox:{l:0.2,t:0.2,r:0.5,b:0.95}});
  assert.strictEqual(_balanceCrop(personNearBottom,{sceneType:'street',crop:[0,0,18,0]}),null,'人物贴底不强收底部');
  console.log('  ✓ v12.29.0 暗部呼吸画幅平衡（5条）');
}

// -------------------- v12.29.0: 裁切质量评分（像素 vs 模型择优） --------------------
{
  const a={frameAspect:1.5,cx:0.5,cy:0.5,sigBox:[0.3,0.35,0.7,0.65],bodyRatio:0.2,
    edgeEnergy:{col:new Array(24).fill(0.5).map((v,i)=>i<2||i>21?0.05:0.5),row:new Array(16).fill(0.5).map((v,i)=>i<2||i>13?0.05:0.5)},allBoxes:[]};
  const cropScore=_cropQualityScore(a,[0,7,0,9],false);
  const noScore=_cropQualityScore(a,[0,0,0,0],true);
  assert.ok(cropScore>noScore,'16:9 收边应优于原图: '+cropScore+' vs '+noScore);
  assert.strictEqual(_cropQualityScore(a,[0,0,40,0],false),-1,'切主体候选不安全');
  const person={frameAspect:0.75,cx:0.3,cy:0.5,sigBox:[0.2,0.2,0.4,0.9],bodyRatio:0.3,cocoPersonBox:{l:0.2,t:0.2,r:0.4,b:0.9},allBoxes:[{class:'person',score:0.9,b:[0.2,0.2,0.4,0.9]}]};
  assert.strictEqual(_cropQualityScore(person,[30,0,0,0],false),-1,'裁到人物不安全');
  console.log('  ✓ v12.29.0 裁切质量评分（3条）');
}

// -------------------- v12.29.0: 底部物体保护时把裁切量移到顶部 --------------------
{
  const sky={frameAspect:1.55,cx:0.5,cy:0.55,sigBox:[0.15,0.35,0.85,0.95],bodyRatio:0.25,
    edgeEnergy:{col:new Array(24).fill(0.2),row:new Array(16).fill(0.2).map((v,i)=>i<4?0.02:(i>11?0.7:0.2))},
    allBoxes:[{class:'potted plant',score:0.7,b:[0.05,0.72,0.25,0.98]},{class:'chair',score:0.6,b:[0.35,0.88,0.6,0.99]}]};
  const bad=[0,6,0,7];
  assert.strictEqual(_cropQualityScore(sky,bad,false),-1,'底部植物被裁时原候选不安全');
  const safe=_saferCropVariant(sky,bad);
  assert.ok(safe && safe[3]===0 && safe[1]>=10,'应把底部裁切量移到顶部: '+JSON.stringify(safe));
  assert.ok(_cropQualityScore(sky,safe,false)>=0,'顶部空天候选通过物体保护');
  console.log('  ✓ v12.29.0 底部物体保护改收顶部（3条）');
}

// -------------------- v12.28.0: 云端分级裁切保护 --------------------
{
  const animal=_cloudCropGuard([13,10,10,9],null,'animal');
  assert.ok(Math.max(...animal)<=8, '动物单边≤8: '+animal);
  assert.ok(animal.reduce((a,b)=>a+b,0)<=25, '动物四边≤25: '+animal);
  const food=_cloudCropGuard([10,0,13,0],null,'food');
  assert.ok(food[2]<=12, '美食单边≤12: '+food);
  const port=_cloudCropGuard([19,0,19,0],null,'portrait');
  assert.ok(Math.max(...port)<=10, '人像单边≤10: '+port);
  const land=_cloudCropGuard([20,20,20,20],null,'landscape');
  assert.ok(Math.max(...land)<=15, '通用单边≤15: '+land);
  assert.ok(land.reduce((a,b)=>a+b,0)<=40, '通用四边≤40: '+land);
  const cut=_cloudCropGuard([15,0,0,0],{sigBox:[0,0.4,0.2,0.6]},'general');
  assert.deepStrictEqual(cut,[0,0,0,0], '主体框被切>25%则不裁');
  console.log('  ✓ v12.28.0 云端分级裁切保护（7条）');
}
