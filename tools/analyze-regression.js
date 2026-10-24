#!/usr/bin/env node
/*
 * tools/analyze-regression.js — 回归日志汇总/混淆矩阵
 * 用法：node tools/analyze-regression.js regA.txt regB.txt regC.txt
 * 说明：文件名前缀只作弱标签（arch_2 实际可能是湖景），最终仍以人工目检为准。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2);
if (!files.length) { console.error('用法: node tools/analyze-regression.js <日志...>'); process.exit(2); }

function labelOf(name) {
  const n = name.replace(/\.(jpe?g|png)$/i, '');
  if (/^portrait_front/.test(n)) return 'portrait_front';
  if (/^portrait_side/.test(n)) return 'portrait_side';
  if (/^pet_extra/.test(n)) return 'pet';
  if (/^water_extra/.test(n)) return 'water';
  const m = n.match(/^([a-z]+?)(?:_\d|$)/);
  return m ? m[1] : 'other';
}

const rows = [];
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const txt = fs.readFileSync(f, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([^\s|]+\.(?:jpe?g|png))\s+\.\.\.\s+crop=\[([0-9,]+)\]\s+scene=([a-z_]+)\s+conf=(\d+)%\s+person=(\w+)/i);
    if (!m) continue;
    const crop = m[2].split(',').map(Number);
    rows.push({ name: m[1], label: labelOf(m[1]), crop, sum: crop.reduce((a, b) => a + b, 0), scene: m[3], conf: Number(m[4]), person: m[5] });
  }
}

const n = rows.length;
const noCrop = rows.filter(r => r.sum === 0).length;
console.log(`样本 ${n} | noCrop ${noCrop} (${(noCrop / n * 100).toFixed(1)}%) | 裁切 ${n - noCrop}`);
const distrib = {};
for (const r of rows) distrib[r.scene] = (distrib[r.scene] || 0) + 1;
console.log('场景分布:', JSON.stringify(distrib, null, 0));

console.log('\n=== 文件夹弱标签 × 预测场景（行=弱标签，列=scene）===');
const labels = [...new Set(rows.map(r => r.label))].sort();
const scenes = [...new Set(rows.map(r => r.scene))].sort();
const header = ['label'.padEnd(14), ...scenes.map(s => s.slice(0, 10).padStart(11))].join('');
console.log(header);
for (const l of labels) {
  const cells = scenes.map(s => String(rows.filter(r => r.label === l && r.scene === s).length).padStart(11));
  console.log(l.padEnd(14) + cells.join(''));
}

console.log('\n=== 需人工重点看（person=true 但非人像场景）===');
rows.filter(r => r.person === 'true' && !/portrait/.test(r.scene)).forEach(r => console.log(`  ${r.name} scene=${r.scene} crop=[${r.crop}]`));

console.log('\n=== 微小裁切 (sum<=5) ===');
const tiny = rows.filter(r => r.sum > 0 && r.sum <= 5);
console.log(tiny.length ? tiny.map(r => `  ${r.name} [${r.crop}]`).join('\n') : '  无');

console.log('\n=== 人像裁切单边>10 ===');
const hardPort = rows.filter(r => /portrait/.test(r.scene) && Math.max(...r.crop) > 10);
console.log(hardPort.length ? hardPort.map(r => `  ${r.name} [${r.crop}]`).join('\n') : '  无');

console.log('\n=== 裁切幅度 top 15 ===');
rows.filter(r => r.sum > 0).sort((a, b) => b.sum - a.sum).slice(0, 15).forEach(r => console.log(`  ${r.name} [${r.crop}] sum=${r.sum} scene=${r.scene}`));
