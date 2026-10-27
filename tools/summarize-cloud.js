/* v13.1.0 云端回归汇总：把 tools/cloud-regress.js 的原始输出压成可写进发布说明的指标。
 * 用法：node tools/summarize-cloud.js tests/logs/v13.1.0_cloud50_raw.txt
 * 行格式：name.jpg | CLOUD|local scene=S rule=R cloudCrop=[a,b,c,d] cloudNoCrop=B localCrop=[a,b,c,d] | 标签 | 状态条
 *   · cloudCrop = 云端提案（无云端提案时退化成打印的 plan）；localCrop = 最终落地到画布的那一版。
 */
'use strict';
const fs = require('fs');
const file = process.argv[2];
if (!file) { console.error('用法：node tools/summarize-cloud.js <raw日志>'); process.exit(2); }
const lines = fs.readFileSync(file, 'utf8').split('\n');

const rows = [];
let noResult = 0;
for (const raw of lines) {
  const l = raw.trim();
  if (/NO RESULT/.test(l)) { noResult++; continue; }
  const m = l.match(/^(\S+\.(?:jpg|jpeg|png))\s+\|\s+(CLOUD|local)\s+scene=(\S+)\s+rule=(\S+)\s+cloudCrop=\[([\d,\. ]+)\]\s+cloudNoCrop=(\S+)\s+localCrop=\[([\d,\. ]+)\]\s*\|\s*([^|]*)\|\s*(.*)$/);
  if (!m) continue;
  const sum = a => a.split(',').map(Number).reduce((x, y) => x + (isFinite(y) ? y : 0), 0);
  const area = c => {
    const p = c.split(',').map(Number);
    if (p.length !== 4 || p.some(n => !isFinite(n))) return 100;
    return Math.round((100 - p[0]) * (100 - p[1]) / 100 * (100 - p[2]) / 100 * (100 - p[3]) / 100);
  };
  rows.push({
    name: m[1], cloud: m[2] === 'CLOUD', scene: m[3], rule: m[4],
    cloudCrop: m[5], cloudNoCrop: m[6] === 'true', localCrop: m[7],
    tag: m[8].trim(), status: m[9].trim(),
    cloudSum: sum(m[5]), localSum: sum(m[7]), localArea: area(m[7])
  });
  // v13.1.0 新格式行尾带 refined=/rejected=/pick=/cand=/guard=；旧日志没有这些字段（记为 null，不当成 0）
  const t = rows[rows.length - 1];
  const f = l.match(/refined=(\S+) rejected=(\S+) pick=(\S+) cand=(\d+) guard=(.*)$/);
  if (f) { t.refined = f[1] === 'true'; t.rejected = f[2] === 'true'; t.pick = f[3]; t.cand = +f[4]; t.guard = f[5].trim(); t.hasFields = true; }
  else { t.hasFields = false; }
}

const n = rows.length;
const cloud = rows.filter(r => r.cloud);
const local = rows.filter(r => !r.cloud);
const landed = rows.filter(r => r.localSum > 0);
const cloudProposal = cloud.filter(r => r.cloudSum > 0 && !r.cloudNoCrop);
const cloudNoCrop = cloud.filter(r => r.cloudNoCrop);
// refine/reject/guard 优先读行尾字段（plan.aiRefined 等），只有旧日志才退回文案匹配
const hasFields = rows.filter(r => r.hasFields);
const refined = hasFields.length ? rows.filter(r => r.refined === true) : rows.filter(r => /微调/.test(r.tag + r.status));
const rejected = hasFields.length ? rows.filter(r => r.rejected === true) : rows.filter(r => /不该裁|云端判不裁/.test(r.status + r.tag));
const guarded = hasFields.length ? rows.filter(r => r.guard && r.guard !== '-') : rows.filter(r => /云端已复核|保留本地/.test(r.status + r.tag));
if (hasFields.length && hasFields.length < rows.length) console.log('注意：' + (rows.length - hasFields.length) + ' 行是旧格式（无 refined/pick 字段），这几种只能按文案估算，不要当准');
const candNums = hasFields.map(r => r.cand).filter(x => x > 0);
const micro = landed.filter(r => r.localSum > 0 && r.localSum <= 5);
const fail = rows.filter(r => /超时|失败|熔断|网络|缺口令|口令错误|未返回/.test(r.status));
const areas = landed.map(r => r.localArea).sort((a, b) => a - b);
const pct = p => areas.length ? areas[Math.min(areas.length - 1, Math.floor(p * areas.length))] : 0;

console.log('解析行数 ' + n + ' / 无结果 ' + noResult);
console.log('云端主导 ' + cloud.length + '（其中云端提案裁切 ' + cloudProposal.length + '、云端判不裁 ' + cloudNoCrop.length + '）· 本地/人像保护 ' + local.length);
console.log('refine 生效 ' + refined.length + ' · 云端复核后保留本地 ' + guarded.length + ' · 云端 reject ' + rejected.length +
  (candNums.length ? ' · 候选数平均 ' + (candNums.reduce((a, b) => a + b, 0) / candNums.length).toFixed(2) + ' 最多 ' + Math.max.apply(null, candNums) : ' · 候选数：日志无该字段'));
console.log('最终落地裁切 ' + landed.length + '（' + (n ? (landed.length / n * 100).toFixed(0) : 0) + '%）· 不裁 ' + (n - landed.length));
console.log('落地保留面积：p10=' + pct(0.1) + '% 中位=' + pct(0.5) + '% p90=' + pct(0.9) + '% 最小=' + (areas[0] || 0) + '%');
console.log('微裁(合计≤5%) ' + micro.length + ' · 超时/失败 ' + fail.length);

const prot = rows.filter(r => /^portrait/.test(r.scene));
console.log('人像场景 ' + prot.length + ' 张，其中被裁 ' + prot.filter(r => r.localSum > 0).length + ' 张');

const byScene = {};
for (const r of rows) {
  byScene[r.scene] = byScene[r.scene] || { n: 0, crop: 0, min: 100 };
  byScene[r.scene].n++;
  if (r.localSum > 0) byScene[r.scene].crop++;
  byScene[r.scene].min = Math.min(byScene[r.scene].min, r.localArea);
}
console.log('按场景（n / 落地裁切率 / 最小保留）：');
for (const k of Object.keys(byScene).sort((a, b) => byScene[b].n - byScene[a].n)) {
  const v = byScene[k];
  console.log('  ' + k.padEnd(15) + String(v.n).padStart(3) + ' · ' + (v.crop / v.n * 100).toFixed(0) + '% · ' + v.min + '%');
}
if (refined.length) {
  console.log('refine 明细：');
  for (const r of refined) console.log('  ' + r.name + '  base=' + r.cloudCrop + ' → 落地=' + r.localCrop + ' | ' + r.tag);
}
if (fail.length) {
  console.log('失败明细：');
  for (const r of fail) console.log('  ' + r.name + ' | ' + r.status.slice(0, 60));
}
