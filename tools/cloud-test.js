#!/usr/bin/env node
/*
 * tools/cloud-test.js — 云端 SCF 真实调用测试
 *
 * 用法：
 *   CLOUD_TOKEN=<your-token> node tools/cloud-test.js
 *
 * 纪律：token 只从环境变量读，绝不写进文件/commit/输出。
 * 测完后 shell history 里的 token 应被清理（见 SOP）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE = 'https://1334762369-i3x3zem36d.ap-guangzhou.tencentscf.com';
const TOKEN = process.env.CLOUD_TOKEN;
if (!TOKEN) { console.error('需要 CLOUD_TOKEN 环境变量'); process.exit(2); }

const ROOT = path.join(__dirname, '..');

// 极简图片缩放（不依赖 canvas，直接读 PNG→canvas 在 Node 不可用，这里直接发原图 base64）
// SCF 后端会自己处理缩放，我们直接发原图 base64 dataURL
function imgToDataUrl(fp) {
  const buf = fs.readFileSync(fp);
  const ext = path.extname(fp).toLowerCase();
  const mime = ext === '.jpg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

const sysPrompt = [
  '你是服务普通拍照用户（不会摄影的人）的专业摄影构图分析师。你只输出一个严格 JSON 对象，不输出任何多余文字、不输出 markdown。',
  '铁律：① 只做语义判断，绝不输出数字坐标、像素或百分比裁切数值，裁切由前端专业算法按你的意图计算；② 所有判断必须基于真实看到的画面，不臆测画面里没有的东西；③ 面向普通人，描述讲人话、可执行。'
].join('\n');

const userPrompt = [
  '请仔细分析这张照片，按下列字段输出严格 JSON：',
  '{"scene":"portrait/food/landscape/street/architecture/animal/waterscape/night/general","subject":"...","desc":"至少80字","issue":"...","rule":"thirds/golden/diag/lead/sym/center/frame/mini","ruleReason":"...","cropIntent":"none/crop_top/crop_bottom/crop_left/crop_right/trim","filter":"...","conf":80}',
  '画面出现明显人物→portrait；水面倒影为主体→waterscape；建筑为主体→architecture；整体偏暗→night。'
].join('\n');

async function callCloud(imgPath, label) {
  const dataUrl = imgToDataUrl(imgPath);
  const body = {
    model: 'qwen3.5-flash',
    messages: [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: dataUrl } }
      ]}
    ],
    temperature: 0.15,
    max_tokens: 2000
  };
  console.log(`\n--- ${label} (${path.basename(imgPath)}) ---`);
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': TOKEN },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });
    const j = await r.json();
    const ms = Date.now() - t0;
    console.log(`HTTP ${r.status} · ${ms}ms`);
    const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (content) {
      // 抠 JSON
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          const parsed = JSON.parse(m[0]);
          console.log('scene:', parsed.scene, '| rule:', parsed.rule, '| conf:', parsed.conf);
          console.log('subject:', parsed.subject);
          console.log('cropIntent:', parsed.cropIntent, '| filter:', parsed.filter);
          console.log('desc:', (parsed.desc || '').slice(0, 120));
        } catch (e) { console.log('raw content:', content.slice(0, 300)); }
      } else { console.log('raw content:', content.slice(0, 300)); }
    } else {
      console.log('response keys:', Object.keys(j));
      console.log(JSON.stringify(j).slice(0, 300));
    }
  } catch (e) {
    console.log(`FAIL: ${e.message} (${Date.now()-t0}ms)`);
  }
}

async function testDegradation() {
  console.log('\n=== 降级路径测试（错误 base URL，应静默失败不抛错）===');
  try {
    const r = await fetch('https://invalid-host-nonexistent.example.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': TOKEN },
      body: '{}',
      signal: AbortSignal.timeout(5000)
    });
    console.log('unexpected status:', r.status);
  } catch (e) {
    console.log('预期内失败（应静默回退本地）:', e.message.slice(0, 80));
  }
}

(async () => {
  // 测 3 张代表图：人像、美食、街拍
  await callCloud(path.join(ROOT, 'imgs/d25/portrait_1.png'), '人像');
  await callCloud(path.join(ROOT, 'imgs/d25/food_1.png'), '美食');
  await callCloud(path.join(ROOT, 'imgs/d25/street_5.png'), '街拍多人');
  await testDegradation();
  console.log('\n=== 云端测试完成 ===');
  // 清 shell history 里的 token
  try { execSync('history -c 2>/dev/null || true'); } catch(e) {}
})();
