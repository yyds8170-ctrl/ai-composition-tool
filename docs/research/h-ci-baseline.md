# CI/CD 与回归基线版本化调研（h-ci-baseline）

- 调研对象：单文件 PWA「AI 构图助手 Pro」（`index.html` ≈ 2MB，v12.0.0）
- 调研方式：只读勘察仓库现状 + 公开文档比对，未修改任何源码、未跑 puppeteer / git 命令。
- 调研目标：
  1. GitHub Actions 对 Pages 静态站点的最小 CI 如何配（lint / 单测 / 回归冒烟 / 红线词扫描），触发器怎么切；
  2. `tests/baseline/current.json` 全量覆盖单文件基线的替代版本化方案；
  3. 红线词自动扫描脚本如何落地为 CI 硬阻断；
  4. ONNX / WebGPU 推理抖动在 CI 中如何容忍（固定已知不稳定图清单，其余 0 diff）；
  5. 真机回归无法 CI 时的折中路径。

> 口径：本文所有路径均相对仓库根；规则全部给出可量化阈值与验收命令。

---

## 〇、现状盘点（调研基线事实）

| 事实 | 值 | 出处 |
|---|---|---|
| 现有 CI | 仅 `.github/workflows/test.yml`：push/PR → 提取纯函数一致性校验 + `tests/unit.test.js`（459 断言） | 现有 workflow |
| 本地回归 | `tools/regress.js`：puppeteer 驱动，默认 `imgs/d25`(25) + `imgs/regression`(139) = **164 张** | tools/regress.js L135–138 |
| 确定性快照 | `tools/snapshot.js`：固定种子 `mulberry32(1117)` + `window.__SNAPSHOT__=1` 强制 ORT wasm-only + 单线程，落盘 `tests/baseline/snapshot-v<ver>.json`，`--compare` 硬比 crop 四元组整数 | tools/snapshot.js L136–153 |
| 已知钉扎 | `MINIMAL_PINS` 内置 23 张边界图（pet/indoor/portrait_side/sky/backlit），wasm-only 后仍跨启动翻转的图，钉回固定值 | tools/snapshot.js L172–196 |
| 云端回归 | `tools/cloud-regress.js`，需 `CLOUD_TOKEN`（真值不能进仓库） | tools/cloud-regress.js |
| 模糊测试 | `tools/fuzz.js`：纯函数属性测试（单函数 200 万次随机） | tools/fuzz.js |
| 基线文件 | `tests/baseline/current.json`（95KB 全量 dump，`--set-baseline` 整体覆盖）；已有 `snapshot-v11.16.0` ~ `v11.23.0` 共 7 个历史快照 | tests/baseline/ |
| 运行时 | ORT wasm 文件本地随仓库分发（`model/ort/ort.min.js` + wasm），无 CDN 依赖 → CI 可复现 | model/ort/ |
| 仓库体积 | `imgs/` 78MB（测试夹具+截图）、`model/` 99MB → Pages 部署必须剔除 `imgs/` | du 实测 |
| 注意 | `.gitignore` 忽略 `package-lock.json` → CI 用 `npm install`，**不能用 `npm ci`** | .gitignore |

---

## 一、最小 CI：GitHub Actions for Pages

### 1.1 触发器矩阵（按事件切负载，不浪费 Actions 分钟）

| 事件 | 跑什么 | 为什么 |
|---|---|---|
| `pull_request` → main | lint + 纯函数一致性 + 单测 + 红线词扫描 + **冒烟子集回归（25 张 d25）** | PR 必须快（<6 min），冒烟子集足够拦截绝大多数回归 |
| `push` → main | 上面全部 + **全量快照 164 张与 main 基线 diff** + 部署 Pages | main 是基线权威，回归失败立刻告警 |
| `tag` 推 `v*` | 上面全部 + 快照归档为 `tests/baseline/v<ver>.json` + 发布 release 附件 | 打 tag 即归档，基线随版本不可变 |
| `schedule` cron 每日 | Lighthouse CI + BrowserStack 冒烟 + flaky 图 3 次复跑 | 真机/性能层，不挡 PR |

### 1.2 `.github/workflows/ci.yml`（草案，替换现有 test.yml）

```yaml
name: ci
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch: {}

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }

      # lint-1：纯 JS 工具脚本语法检查（tools/ tests/ 都是 CommonJS，可直接 check）
      - name: lint（node --check + html-validate）
        run: |
          for f in tools/*.js tests/*.js; do node --check "$f" || exit 1; done
          npx --yes html-validate@9 index.html sw.js

      # lint-2：纯函数与线上 index.html 一致性（现有硬门，保留）
      - name: 纯函数一致性校验
        run: |
          node tools/extract-pure.js
          git diff --quiet -- tests/pure-functions.js || {
            echo "::error::tests/pure-functions.js 与 index.html 不一致"; exit 1; }

      - name: 单元测试（459 断言）
        run: node tests/unit.test.js

      # 红线词扫描（见第三节），硬阻断
      - name: 红线词扫描
        run: node tools/redline-scan.js

  regress-smoke:
    needs: quality
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - name: 缓存 puppeteer Chrome
        uses: actions/cache@v4
        with:
          path: ~/.cache/puppeteer
          key: puppeteer-${{ hashFiles('package.json') }}
      - run: npm install   # package-lock.json 被 gitignore，禁止 npm ci

      # PR：只跑 25 张冒烟子集；push main：跑全量 164 张
      - name: 冒烟回归（PR=d25 25张 / main=全量164张）
        run: |
          if [ "${{ github.event_name }}" = "pull_request" ]; then
            node tools/snapshot.js --compare tests/baseline/main.json || true
            node tools/snapshot.js --dir imgs/d25
          else
            node tools/snapshot.js
            node tools/baseline-diff.js --base tests/baseline/main.json
          fi
```

### 1.3 `.github/workflows/pages.yml`（草案，部署 + tag 归档）

官方 Pages 链路：`configure-pages` → `upload-pages-artifact` → `deploy-pages`；PR 事件下 deploy 步骤自动跳过，只上传不发布。

```yaml
name: pages
on:
  push: { branches: [main], tags: ['v*'] }
permissions:
  pages: write
  id-token: write
concurrency:
  group: pages-${{ github.ref }}
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: ${{ steps.deploy.outputs.page_url }} }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      # 只部署运行时必需文件；imgs/ 78MB 测试夹具与截图一律不上线
      - name: 组装发布目录
        run: |
          mkdir _site
          cp index.html sw.js manifest.webmanifest 404.html _site/
          cp icon-192.png icon-512.png _site/
          cp -r model _site/
      - uses: actions/upload-pages-artifact@v4
        with: { path: _site }
      - id: deploy
        uses: actions/deploy-pages@v4

      # tag 事件：把当前 main 基线另存为不可变版本归档
      - name: tag 基线归档
        if: startsWith(github.ref, 'refs/tags/v')
        run: |
          cp tests/baseline/main.json tests/baseline/v${GITHUB_REF_NAME#v}.json
          git config user.email ci@bot; git config user.name ci
          git add tests/baseline/
          git commit -m "chore: archive baseline ${GITHUB_REF_NAME}" || echo "no change"
          git push
```

**验收**：
1. PR 上 push 一个故意改 `_deriveCrop` 系数的 commit → `quality` job 单测红、阻断；
2. PR 上 push 一张 d25 图的 crop 预期改动 → `regress-smoke` 打印 diff 清单；
3. push main → Pages 环境出现 `page_url`，线上 `index.html` 200，且 `https://<host>/imgs/regression/` 404（夹具未上线）。

---

## 二、回归基线版本化：替代 current.json 全量覆盖

### 2.1 问题与方案

现状 `tests/baseline/current.json` 是"当前工作现场"，`--set-baseline` 一把覆盖，**丢两件事**：① 历史版本对应哪份基线不可追溯（目前靠手存的 7 个 snapshot 文件兜底）；② PR 里没有"和 main 比漂移率"的门槛，只能全有/全无 0 diff。

方案：三层基线文件，职责分离。

| 文件 | 职责 | 谁能写 |
|---|---|---|
| `tests/baseline/main.json` | **当前权威基线**（164 张的 crop 四元组 + sceneType + conf + f + snapHash，即 snapshot 产物格式）。PR diff 的基准。 | 仅 main 分支、CI 全量绿后更新 |
| `tests/baseline/v<semver>.json` | **不可变版本归档**，tag 时由 pages.yml 从 main.json 复制，此后永不改写。跨版本 diff（如 v11.23.0 → v12.0.0）直接 `tools/baseline-diff.js --base tests/baseline/v11.23.0.json --head tests/baseline/v12.0.0.json`。 | 仅 tag workflow |
| `tests/baseline/current.json` | 保留为**人工调试 dump**（regress.js 全量输出，含 data 指标），不进 CI 门，可随本地工作机覆盖。 | 本地 `--set-baseline` |

git tag 本身也是一层归档：`v12.0.0` tag 指向的 commit 里 main.json 就是该发布版本的不可变证据，双重保险。

### 2.2 漂移率门槛（PR 与 main 基线 diff）

新脚本 `tools/baseline-diff.js`（草案要点）：

```js
// 退出码：0=自动过；1=超阈值需人工批准；2=图片集数量/新增删除异常
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=path.join(__dirname,'..');
const FLAKY=new Set(Object.keys(JSON.parse(fs.readFileSync(
  path.join(ROOT,'tests/flaky.json'),'utf8'))));          // 见第四节
const THRESHOLD=0.05;                                       // 硬阈值：5%
const args=process.argv.slice(2);
const base=JSON.parse(fs.readFileSync(args[args.indexOf('--base')+1],'utf8'));
const head=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/baseline/main.json'),'utf8'));
const strict=Object.keys(base).filter(k=>!FLAKY.has(k));    // 严格集 = 164-23=141
const changed=strict.filter(k=>
  (base[k].crop||[]).join()!==(head[k].crop||[]).join());
const rate=changed.length/strict.length;
console.log(`strict=${strict.length} changed=${changed.length} rate=${(rate*100).toFixed(1)}%`);
changed.forEach(k=>console.log('  [DIFF]',k,base[k].crop,'→',head[k].crop));
// 新增/缺失图片集变化一律异常（测试集必须冻结）
if(Object.keys(base).length!==Object.keys(head).length) process.exit(2);
process.exit(rate<THRESHOLD?0:1);
```

**可量化规则（落地即执行）**：

1. 严格集 = 全量 164 张 − flaky.json 清单（当前 23 张）= **141 张**；flaky 单独报告，不计入分子分母。
2. PR 漂移率 < 5%（即 ≤ 7/141 张 crop 变化）→ **自动通过**，PR 评论自动贴出 diff 清单（哪些图、裁前裁后值）。
3. 漂移率 ≥ 5%（≥ 8/141 张）→ CI 红，要求人工批准： maintainer 在 PR 上核对 diff 清单 → 打 label `baseline-ack`（用 CODEOWNERS 把 `tests/baseline/**` 设为必需评审路径）→ 重跑 workflow 放行。
4. 图片集数量变化（新增/删除测试图）→ 退出码 2，永远人工，禁止自动过。
5. 基线更新只允许发生在 main：feature 分支禁止写 `main.json`/`v*.json`（靠分支保护规则 + workflow 只在 main 提交）。

**验收**：
- 造一个只改 `pet_1.jpg`（在 flaky 清单内）crop 的提交 → baseline-diff 退出 0；
- 造一个改 10 张 d25 图 crop 的提交 → 退出 1，日志列出全部 10 张；
- 手工 `cp main.json v99.99.9.json` 后改一处 → 跨版本 diff 能精确报告。

---

## 三、红线词自动扫描

### 3.1 设计

词表与扫描分离：词表维护在 `tests/redline-words.txt`（一行一条敏感字符串，含：外部整站照搬类文案、与他站雷同表述类、对三方产物做可执行级分析类、外部样例 App 名称类、各类凭据前缀形态串、仓库外个人标识串）。脚本不硬编码词表，避免词表散落在仓库各处；词表本身也不进文档。

新脚本 `tools/redline-scan.js`（草案）：

```js
#!/usr/bin/env node
// 用法：node tools/redline-scan.js  →  命中任一红线词即 exit 1
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const words=fs.readFileSync(path.join(ROOT,'tests/redline-words.txt'),'utf8')
  .split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
const TARGETS=['index.html','sw.js','README.md','manifest.webmanifest','404.html',
               'tools','tests','docs'];
const SKIP_DIR=new Set(['node_modules','.git','imgs','model','logs','data']);
const hits=[];
(function walk(f){
  const st=fs.statSync(f);
  if(st.isDirectory()){
    if(SKIP_DIR.has(path.basename(f))) return;
    return fs.readdirSync(f).forEach(c=>walk(path.join(f,c))); }
  if(!/\.(js|html|md|json|webmanifest|yml|txt)$/.test(f)) return;
  const rel=path.relative(ROOT,f);
  if(rel==='tests/redline-words.txt') return;              // 词表自身免扫
  if(/tests[\\/]baseline[\\/]/.test(rel)) return;          // 基线数据 dump 免扫
  const text=fs.readFileSync(f,'utf8');
  for(const w of words) if(text.includes(w)) hits.push(`${rel}: 命中红线词（第${text.split(w)[0].split('\n').length}行）`);
})(ROOT);
if(hits.length){ console.error('❌ 红线词扫描失败，'+hits.length+' 处命中：');
  hits.forEach(h=>console.error('  '+h)); process.exit(1); }
console.log(`✅ 红线词扫描通过（${words.length} 条词表，全仓 0 命中）`);
```

### 3.2 集成与规则

- 挂在 `ci.yml` 的 `quality` job（第一节已含），命中即 CI 红、PR 阻断，无豁免 label（词表变更需走 PR 评审）。
- 词表维护规则：新增/删除条目必须在 PR 描述里写理由；词表文件本身有 CODEOWNERS 评审。
- 扫描范围刻意排除：`imgs/`（测试图二进制名义）、`model/`、`tests/baseline/*.json`（历史 dump）、`node_modules`。

**验收**：
1. 本地 `node tools/redline-scan.js` → 输出「词表 N 条，全仓 0 命中」，退出 0；
2. 故意在 README.md 末尾追加一条词表里的串再跑 → 退出 1，报错行号精确；
3. PR 上该追加未撤回前，`quality` job 必须红。

---

## 四、ONNX / WebGPU 推理抖动在 CI 中的容忍

### 4.1 原理（现状已具备的钉扎手段）

CI runner 无真实 GPU，SwiftShader 软件 GL 上 WebGPU kernel 调度非确定，跨启动 crop 会翻转。`tools/snapshot.js` 已内置三重钉扎，CI 必须沿用同一套：

1. 固定种子：`Math.random` 被替换为 `mulberry32(1117)` 确定性 PRNG（snapshot.js L137–148）；
2. `window.__SNAPSHOT__=1` → app 命中后强制 ORT **wasm-only**，不走 WebGPU EP；
3. `ort.env.wasm.numThreads=1` 单线程，消除线程调度抖动。

### 4.2 容忍规则（固定清单 + 其余 0 diff）

把硬编码在 snapshot.js 里的 `MINIMAL_PINS` 抽出来独立成 `tests/flaky.json`，CI 与本地共用同一份清单：

```json
{
  "comment": "已知不稳定图清单：wasm-only 后仍跨启动翻转，按钉扎值比较；其余 141 张必须 0 diff",
  "updatedAt": "2026-10-19",
  "items": {
    "pet_1.jpg":       { "crop": [0,0,0,0], "sceneType": "animal", "conf": 90, "f": "vivid",
                         "evidence": "3 次独立启动 crop 翻转", "promoteAfterStreakWeeks": 4 },
    "sky_2.jpg":       { "crop": [0,0,0,0], "sceneType": "food", "conf": 93, "f": "warm",
                         "evidence": "边界 sky 图类别误标", "promoteAfterStreakWeeks": 4 }
  }
}
```

**可量化规则**：

1. **清单外（141 张）**：crop 四元组整数逐元素相等，容差 = 0；任一不同即回归失败（现有 `--compare` 行为，保留）。
2. **清单内（当前 23 张）**：输出强制等于钉扎值（snapshot.js 现有 MINIMAL_PINS 逻辑改为读 flaky.json），即使真实检测翻转也以钉扎值入库，单独报告不阻断。
3. **晋升规则**：每日 cron 任务把 flaky 清单每张图连跑 3 次；连续 4 周（`promoteAfterStreakWeeks`）3 次结果一致 → 自动提 PR 把该图移出清单，回到严格集。
4. **降级规则**：严格集中任何一张图在任一 CI 运行中出现抖动（重跑即翻转）→ 当日报告加红，人工确认 3 次证据后移入 flaky.json 并附 evidence。
5. CI 永远跑 wasm-only 路径；WebGPU 仅真机/人工预览验证，不进 CI 断言。

**验收**：
- 同一分支连跑两次 `node tools/snapshot.js` 再 `--compare` → 第二次退出 0（证明钉扎生效）；
- 故意改 flaky.json 里一张图的钉扎 crop 值 → `baseline-diff` 仍退出 0（flaky 不计入严格集）；
- 故意改严格集中一张图的 crop → 退出 1。

---

## 五、真机回归无法 CI 时的折中

CI 内 puppeteer 只能覆盖"无头 Chrome + 软件渲染"一层；真实手机 GPU、Safari JIT、相机取景链路覆盖不到。按成本从低到高三层补：

### 5.1 Lighthouse CI（每次 push main 都跑，免费）

对已部署 Pages 站点跑性能/预算断言，本地 ubuntu runner 即可，不占外部额度：

```bash
# .github/workflows/nightly.yml 里：
npm install -g @lhci/cli@0.14
lhci autorun --collect.url="https://<your-pages-host>/" \
  --assert.assertions='{"categories:performance":["error",{"minScore":0.8}],
                        "resource-summary:size:total":["error",{"maxNumericValue":4500000}]}'
```

规则：性能分 ≥ 0.8、首页总资源 ≤ 4.5MB（index.html 2MB + model/ 按需懒载，超限即红）。

### 5.2 BrowserStack Automate（每日 cron，用免费额度）

- 开源项目可申请 BrowserStack 开源计划（审核通过后免费额度放开）；未审核前免费档含每月约 100 分钟自动化浏览器测试，够每日一轮 2~3 台设备冒烟（约 10 分钟/天）。
- 复用现有 puppeteer 脚本：把 `puppeteer.launch()` 换成连 BrowserStack CDP 端点，capabilities 选 iPhone Safari 最新版 + Android Chrome 最新版两台；凭证存 GitHub Secrets（`BROWSERSTACK_USERNAME` / `BROWSERSTACK_ACCESS_KEY`）。
- 只跑 `imgs/d25` 25 张子集 + 页面加载/模型 ready 探针（现有 `tools/probe1~3.js` 可改），不做全量断言；真机只验证"能跑通、不白屏、模型 ready"，crop 精度仍靠本地 wasm 钉扎。

### 5.3 TestFlight（季度人工门，不进 CI）

PWA 无法直接上架 TestFlight，最小折中：用一个 WebView 壳（仅包一层 URL 加载）把 Pages 地址套进 iOS App，打 TestFlight 外部测试组；每个大版本发布前人工验收一轮（相机取景构图提示、相册上传、离线二次打开）。这是人工验收门，不是自动化 CI 项。

**三层取舍**：Lighthouse CI 挡性能劣化（每次发布必跑）；BrowserStack 挡跨浏览器白屏/崩溃（每日跑，额度内）；TestFlight 挡真机交互死角（季度跑，人工）。

---

## 六、落地路线图与验收清单

| 优先级 | 动作 | 涉及文件 | 验收命令 |
|---|---|---|---|
| P0 | 红线词脚本 + 词表入库，挂进现有 test.yml | `tools/redline-scan.js`、`tests/redline-words.txt`、`.github/workflows/test.yml` | `node tools/redline-scan.js` 退出 0；恶意注入后退出 1 |
| P0 | `tests/flaky.json` 从 MINIMAL_PINS 抽出，snapshot.js 改为读它 | `tests/flaky.json`、`tools/snapshot.js` | 连跑两次 snapshot --compare 退出 0 |
| P1 | `baseline-diff.js` + main.json 指针基线 + 5% 漂移门槛 | `tools/baseline-diff.js`、`tests/baseline/main.json` | 改 10 张图 → 退出 1 并列清单 |
| P1 | pages.yml 官方部署链路 + 剔除 imgs/ + tag 归档 v<ver>.json | `.github/workflows/pages.yml` | push main 线上 200；`/imgs/` 404；打 tag 后 tests/baseline/ 出现 v12.0.0.json |
| P2 | nightly.yml：Lighthouse CI + BrowserStack 两台设备 + flaky 复跑 | `.github/workflows/nightly.yml`、`tests/lhci-budget.json` | cron 连续 3 天绿 |

**总验收（一键自检）**：
```bash
node --check tools/*.js tests/*.js
node tools/extract-pure.js && git diff --quiet -- tests/pure-functions.js
node tests/unit.test.js
node tools/redline-scan.js
node tools/snapshot.js --compare tests/baseline/main.json
```
全部退出 0，即 CI 最小闭环成立。
