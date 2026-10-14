/* =============================================================================
 * AI 构图助手 Pro · 纯函数单元测试
 * 运行：node tests/unit.test.js
 * 被测代码由 tools/extract-pure.js 从 index.html 逐字提取，保证与线上一致。
 * =============================================================================*/
const assert = require('assert');
const { _deriveCrop, _jointGuard, _objectGuard, _figureGround, _yoloNMS, _estTiltDeg } = require('./pure-functions.js');

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

/* -------------------- 汇总 -------------------- */
if (process.exitCode) {
  console.log(`\n有测试失败：已通过 ${passed} 个`);
} else {
  console.log(`\n✓ 单元测试全部通过：${passed}/${passed}`);
}
