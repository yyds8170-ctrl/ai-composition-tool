/* 对照两份回归日志（v13.0.0 老格式 / v13.1.0 新格式），量化"敢不敢裁"的变化。 */
'use strict';
const fs = require('fs');
function parse(f) {
  const o = {};
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const l = line.trim();
    const m = l.match(/^(\S+\.(?:jpg|jpeg|png)) \.\.\. crop=\[([0-9.,\s]+)\](?: area=(\d+)%)? scene=(\S+) conf=(\d+)% person=(\S+)/);
    if (!m) continue;
    const crop = m[2].split(',').map(Number);
    const area = m[3] !== undefined ? +m[3] / 100
      : (1 - crop[0] / 100 - crop[2] / 100) * (1 - crop[1] / 100 - crop[3] / 100);
    o[m[1]] = { crop, area, scene: m[4], person: m[6] };
  }
  return o;
}
const A = parse(process.argv[2]), B = parse(process.argv[3]);
const ks = Object.keys(B).filter(k => A[k]);
let ca = 0, cb = 0, sa = 0, sb = 0, changed = 0, more = 0, less = 0, minA = 1, minB = 1;
for (const k of ks) {
  if (A[k].area < 0.999) ca++;
  if (B[k].area < 0.999) cb++;
  sa += A[k].area; sb += B[k].area;
  minA = Math.min(minA, A[k].area); minB = Math.min(minB, B[k].area);
  if (JSON.stringify(A[k].crop) !== JSON.stringify(B[k].crop)) { changed++; if (B[k].area < A[k].area - 0.005) more++; else if (B[k].area > A[k].area + 0.005) less++; }
}
console.log('可比图 ' + ks.length + ' 张（唯一图口径）');
console.log('v13.0.0：裁切率 ' + (ca / ks.length * 100).toFixed(0) + '% · 平均保留 ' + (sa / ks.length * 100).toFixed(1) + '% · 最小保留 ' + (minA * 100).toFixed(0) + '%');
console.log('v13.1.0：裁切率 ' + (cb / ks.length * 100).toFixed(0) + '% · 平均保留 ' + (sb / ks.length * 100).toFixed(1) + '% · 最小保留 ' + (minB * 100).toFixed(0) + '%');
console.log('结果变化 ' + changed + ' 张：更激进 ' + more + ' · 更保守 ' + less);
const risky = ks.filter(k => B[k].person === 'true' && B[k].area < 0.999);
console.log('person=true 且被裁（需人工复核）：' + (risky.length ? risky.join(', ') : '无'));
for (const k of risky) console.log('   ' + k + ' v13.0=' + JSON.stringify(A[k].crop) + ' → v13.1=' + JSON.stringify(B[k].crop) + ' 保留 ' + (B[k].area * 100).toFixed(0) + '%');
const tight = ks.filter(k => B[k].area <= 0.7).sort((a, b) => B[a].area - B[b].area).slice(0, 8);
console.log('最激进的 ' + tight.length + ' 张：' + tight.map(k => k + '(' + (B[k].area * 100).toFixed(0) + '%)').join(' '));
