#!/usr/bin/env node
/* =============================================================================
 * 从 index.html 提取不依赖 DOM/全局 state 的纯函数，生成 tests/pure-functions.js
 * 目的：让浏览器里的核心算法可以被 Node 单元测试直接引用，且保证"被测代码"
 *       与线上 index.html 逐字一致（提取即复制，不做改写）。
 * 用法：node tools/extract-pure.js
 * =============================================================================*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'tests', 'pure-functions.js');

// 需要提取的纯函数（名字需与 index.html 中一致）
const TARGETS = ['_deriveCrop', '_smartCrop', '_landscapeCrop', '_classifyYaw', '_gazeGuard', '_edgeSnap', '_rodGuard', '_cloudCropIntentGuard', '_jointGuard', '_objectGuard', '_portraitFraming', '_aspectCrop', '_figureGround', '_yoloNMS', '_estTiltDeg', '_guidanceEyeLevel', '_guidanceEyeOnGrid', '_guidanceDistance', '_guidanceOrientation', '_faceLightSplit', '_lightPosition', '_warmLightHint', '_windowLightHint', '_lowAngleAdvice', '_composeDiagnosis', '_recommendFilter', '_confBand', '_medianBox', '_consensusPerson', '_sceneDebounce', '_debangText', '_applyPref', '_lightDiagnosisPro', '_gazeGuardPro', '_guidanceDistancePro', '_guidanceWaistLevel', '_singlePersonGate', '_classifyComposition','_composeOverlay','_finalPipelinePlan','_classifyMulti','_scenePrefix','_sceneComposeTip','_aimAlign','_composeVariants','_deadZoneStrength','_cropIntentFromBox','_directionsOppose','_hardProtectionHit','_localConf','_extractIntentLocal','_parseIntentCloud','_negotiateBox','_arbitrateCrop','_hueInWarmBand','_sunsetWarmGuard','_foodMisClassGuard','_symmetryGuard','_decloudPlan','_bandSatSignal','_symEdgeSignal','_foodEvidenceSignal','_contentGuard','_thirdsFitScore','aestheticScore','_cloudCropGuard','_personBoxOf','_proactiveComposition','_balanceCrop','_cropQualityScore','_saferCropVariant','_candidateRatioTag','_candidateAspectCrop','_buildCompositionCandidates','_srcMegapixels','_cropBudget','_subjectEvidence','_skinEdgeGuard','_cropsIoU','_cropsSimilar','_windowToCrop','_anchorWindow','_intentCandidates','_cloudTrimToCrop','_validateNewCrop'];

const src = fs.readFileSync(SRC, 'utf8');

/** 从 `function name(` 处开始，做大括号平衡，返回整段函数源码（含前导缩进） */
function extractFunction(code, name) {
  const sig = `function ${name}(`;
  const start = code.indexOf(sig);
  if (start < 0) throw new Error(`未找到函数：${name}`);
  // 向前保留所在行缩进
  let lineStart = start;
  while (lineStart > 0 && code[lineStart - 1] !== '\n') lineStart--;
  // 从第一个 { 开始平衡
  let i = code.indexOf('{', start);
  if (i < 0) throw new Error(`函数 ${name} 没有 {`);
  let depth = 0;
  let inStr = null;       // ' " `
  let inLineComment = false, inBlockComment = false;
  for (; i < code.length; i++) {
    const ch = code[i], next = code[i + 1];
    if (inLineComment) { if (ch === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (ch === '*' && next === '/') { inBlockComment = false; i++; } continue; }
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return code.slice(lineStart, i);
}

let body = '/* 本文件由 tools/extract-pure.js 从 index.html 自动生成，请勿手改。 */\n';
for (const name of TARGETS) {
  body += '\n' + extractFunction(src, name) + '\n';
}
body += '\nmodule.exports = { ' + TARGETS.join(', ') + ' };\n';

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, body);
console.log('已生成', path.relative(ROOT, OUT), '，函数：', TARGETS.join(', '));
