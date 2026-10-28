/* v13.1.0 回归日志汇总：把 tools/regress.js 的原始输出压成可写进发布说明的指标。
 * 用法：node tools/summarize-regress.js tests/logs/v13.1.0_local100_raw.txt [人像保护阈值面积]
 */
'use strict';
const fs = require('fs');
const file = process.argv[2];
const minAreaTight = Number(process.argv[3] || 0);
const lines = fs.readFileSync(file, 'utf8').split('\n');
let total = 0, crop = 0, noCrop = 0, err = 0, micro = 0, big = 0, personCut = 0;
const areas = [], byScene = {}, candCounts = [];
for (const l of lines) {
  // v13.2：行尾新增 fid=/auto=/why= 诊断字段，这里用非贪婪跳过，保持旧日志也能解析
  const m = l.trim().match(/^(\S+\.(?:jpg|jpeg|png)) \.\.\. crop=\[([\d,\. ]+)\] area=(\d+)% scene=(\S+) conf=(\d+)% person=(\S+).*?\bf=(\S+).*?\bpc=(\S+) cands=(\d+)/);
  if (!m) { if (/ERROR|NO RESULT/.test(l)) err++; continue; }
  total++;
  const name = m[1], cropArr = m[2].split(',').map(Number), area = +m[3], scene = m[4], person = m[6];
  areas.push(area); candCounts.push(+m[9]);
  byScene[scene] = byScene[scene] || { n: 0, crop: 0, minArea: 100 };
  byScene[scene].n++;
  if (area < 100) { crop++; byScene[scene].crop++; } else noCrop++;
  const sum = cropArr.reduce((a, b) => a + b, 0);
  if (sum > 0 && sum <= 5) micro++;
  if (area < minAreaTight) big++;
  if (person === 'true' && area < 100) personCut++;
  byScene[scene].minArea = Math.min(byScene[scene].minArea, area);
}
const sorted = areas.slice().sort((a, b) => a - b);
const pct = p => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
console.log('样本 ' + total + ' · 裁切 ' + crop + ' (' + (crop / total * 100).toFixed(0) + '%) · 不裁 ' + noCrop + ' · 错误 ' + err);
console.log('保留面积：p10=' + pct(0.1) + '% 中位=' + pct(0.5) + '% p90=' + pct(0.9) + '% 最小=' + (sorted[0] || 0) + '%');
console.log('候选数：平均 ' + (candCounts.reduce((a, b) => a + b, 0) / candCounts.length).toFixed(1) + ' · 最多 ' + Math.max.apply(null, candCounts));
console.log('微裁(四边合计≤5%) ' + micro + ' 处 · 低于阈值面积(<=' + minAreaTight + '%) ' + big + ' 处 · 有人物且被裁 ' + personCut + ' 处');
console.log('按场景：');
for (const k of Object.keys(byScene).sort((a, b) => byScene[b].n - byScene[a].n)) {
  const v = byScene[k];
  console.log('  ' + k.padEnd(14) + ' n=' + String(v.n).padStart(3) + ' 裁切率=' + (v.crop / v.n * 100).toFixed(0) + '% 最小保留=' + v.minArea + '%');
}
