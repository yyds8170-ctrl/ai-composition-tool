# VLM 图像裁切/取景决策：工程最佳实践与失败模式调研

> 调研日期：2026-10-18
> 调研性质：多轮公开资料学习研究，全部自研方案；仅参考公开通用原理与学术成果，不涉及任何第三方产品的界面、文案或实现。
> 调研对象：`/sandboxdata/workspace/file/aict_v837/index.html`（只读，未改动任何文件）
> 目标产出：直接改进云端裁切链路，并为 v11.17 `_arbitrateCrop(intentLocal, intentCloud, aiData)` 双脑仲裁纯函数提供字段、prompt、校验、回退的完整设计。

---

## 0. 结论先行（TL;DR）

1. **云端只给"意图+边+档位+语义标签+置信度"，绝不给像素坐标**——这条既定原则被全部权威研究证实是正确方向（VLM 直接给坐标的 grounding 准确率低到不可用，详见 §2）。v11.17 应在此基础上**新增 4 个字段**：`cropStrength(轻/中/重)`、`atmosphere(氛围枚举)`、`symmetry(对称枚举)`、`hasReflection(倒影布尔)`，外加一个 `decisionConf(该决策置信度)`。
2. **解析层要从"正则抠 JSON"升级为"枚举白名单+跨字段一致性校验"**。现有正则+截断修复链（7761-7773 行）可以保留作为兜底，但主路径应做枚举白名单和矛盾字段的裁决（例如 `cropIntent=none` 却 `keepOriginal=false`）。
3. **否定指令要全部改写为正向规则**。研究证实 VLM 系统性地忽略"不要/别/不裁"类否定词（§5）。现有 prompt 里"不要默认 none""不要乱裁"这类否定句式，应改写为正向判定规则。
4. **generate-then-rank（本地生成候选框、VLM 只排序）值得做，但建议分两期**：v11.17 先在**单次请求内**补齐枚举+档位+自审 veto（零成本增量）；v11.18 再上候选排序闭环（学界共识方向：Cropper / AesCrop / Venus 均为"生成候选→打分排序"范式，自由给框的通用 MLLM 被反复证明不行）。详见 §7。
5. **现有代码已有非常好的工程底子**：意图化裁切（不给坐标）、`_guardCrop` 几何守护、`_cloudCropIntentGuard` 高彩保护、人像自审闭环、双重熔断、低信息短路——这些都和最佳实践一致。本次调研主要是"补字段、补校验、补 prompt 正向化"，不是推倒重来。

---

## 1. 现状盘点（代码侧只读结论）

云端链路关键位置（index.html 行号）：

| 位置 | 现状 |
|---|---|
| 7533 `runCloudAnalysis` | 主入口；`aiComposeCloudOn` 硬开关、`cloudTripUntil`（3 连败→5 分钟本地）、`cloudBlindUntil`（视觉无效→60s 本地） |
| 7589-7613 | 低信息图短路（纯色/过曝/死黑），人像/夜景豁免 |
| 7615-7621 | 图缩到最长边 1024，JPEG 0.85 |
| 7622-7651 | 48×48 缩略图+尺寸做内容 hash，24h 同图缓存（双种子键） |
| 7653-7662 | sysPrompt（角色/铁律/场景优先级/conf 锚点/氛围与死区/克制） |
| 7663-7688 | user prompt（18 字段 JSON 模板+字段定义） |
| 7695 | `temperature:0.15, max_tokens:2000, enable_thinking:false` |
| 7702 | 28s 超时 abort；7745 5xx/429 退避重试 2 次（2s/5s） |
| 7761-7773 | JSON 解析：正则抠 `{...}`→截断补括号→截尾字段修复 |
| 7777-7792 | "读不到图"盲识别正则，命中后 60s 熔断 |
| 7796-7803 | scene/rule/conf 白名单与范围 clamp |
| 7929-7946 | **VLM 语义护栏**：headroom 少→禁裁顶、gazeDir 前方留白、horizon 居中→禁水平裁；并与本地显著性质心交叉校验 |
| 7809-7834 `_guardCrop` | 单边 clamp 0-50%、四边和 ≤70%、保留区宽高比 1/1.45~1.45 兜底 |
| 8266-8276 | 多物体保护 `_objectGuard`、人像关节保护 `_jointGuard` |
| 3710-3758 `_cloudCropIntentGuard` | 高价值水平条带保护（显著性质量>15% 且方差>1.2×全图/绝对方差>800→内收 2%；高彩 mS>0.30 且 mSat>0.25→整条不裁） |
| 8409-8432 | **人像自审闭环**：裁后 480px 缩略图喂回，问"是否切头/手/脚"，cutPart=true→裁切力度减半 |
| 8325-8333 | 人像特写（bodyH>0.72）强制 noCrop |

**当前云端输出字段**：`scene/subject/desc/highlight/issue/rule/ruleReason/subjectPos/headroom/gazeDir/clutter/horizon/subjectSize/cropIntent/cropReason/keepOriginal/filter/filterReason/conf`。
**当前云端不输出**：精确坐标（boxOk=false，v6.0 起彻底移除坐标通道）、裁切力度档位、氛围/对称/倒影的结构化标签。

---

## 2. 主题一：结构化 JSON 输出稳定化

### 2.1 原理与证据

- OpenAI Structured Outputs（2024-08）：通过 `response_format={"type":"json_schema","strict":true,...}`（function calling 同理 `strict:true`）让模型输出**保证符合 JSON Schema**（含枚举、范围、必填），官方称这是"约束模型输出与开发者 schema 精确匹配"的解法，free-form JSON 生成被明确不推荐。["https://help.openai.com/zh-hans-cn/articles/8555517-function-calling-in-the-openai-api","https://learn.microsoft.com/en-us/Azure/ai-foundry/openai/how-to/structured-outputs?view=foundry-classic"]
- Google Gemini：用 `responseSchema`（支持 `enum` 字段）约束输出，同样是官方推荐路径。["https://ai.google.dev/gemini-api/docs/json-mode?authuser=0000&hl=zh-cn"]
- 但注意：本项目上游是 OpenAI 兼容代理（Cephalon `/chat/completions`），模型多为 qwen/deepseek 类开源兼容模型。**这类端点大多只支持 `response_format:{"type":"json_object"}`（保证是合法 JSON），不支持 strict JSON Schema 约束**。所以本项目不能假设枚举被 schema 强制，**枚举白名单校验必须在本地解析层做**。

### 2.2 做法（可直接采用）

1. **请求层**：若上游支持，加 `response_format:{"type":"json_object"}`（注意：json_object 模式要求 prompt 里自己描述 schema，本项目已在 user prompt 里给了 JSON 模板，兼容）。
2. **字段精简**：枚举字段尽量 ASCII（`crop_top`/`thirds`），自由文本字段（`desc`/`cropReason`）才用中文。降低解析歧义。
3. **解析层三段式**：①正则抠 `{...}` ②JSON.parse ③**每个枚举字段过白名单，非法值→默认值**；自由文本字段做长度兜底。
4. **截断修复保留**：现有"去尾部逗号→补右括号→截尾不完整字段"（7764-7769）是有效的工程补丁，继续保留，但修复失败必须回退本地，不能硬用残缺 JSON。

### 2.3 解析与校验伪代码

```text
function parseCloudVLM(rawText):
    m = rawText.match(/\{[\s\S]*\}/)
    if !m: return null                      # 连 JSON 壳都没有 → 回退本地
    obj = safeJsonParseWithRepair(m[0])    # 现有三段式修复
    if !obj || !obj.rule: return null      # 必须有 rule，否则视为无效

    # ---- 枚举白名单（非法一律降级为默认，绝不信任自由文本）----
    rule        = WHITELIST(obj.rule,        RULES_ENUM,        "thirds")
    scene       = WHITELIST(obj.scene,       SCENE_ENUM,         "general")
    subjectPos  = WHITELIST(obj.subjectPos,  POS_ENUM,           "center")
    subjectSize = WHITELIST(obj.subjectSize, SIZE_ENUM,           "medium")
    headroom    = WHITELIST(obj.headroom,    ["多","中","少"],     "中")
    gazeDir     = WHITELIST(obj.gazeDir,     ["left","right","up","down","none"], "none")
    cropIntent  = WHITELIST(obj.cropIntent,  CROP_ENUM,            "none")
    cropStrength= WHITELIST(obj.cropStrength,["轻","中","重"],      "中")   # v11.17 新增
    atmosphere  = WHITELIST(obj.atmosphere,  ATMOS_ENUM,          "none") # v11.17 新增
    symmetry    = WHITELIST(obj.symmetry,    ["none","horizontal","vertical","both"], "none") # v11.17
    hasReflection = BOOL(obj.hasReflection, false)                # v11.17
    keepOriginal  = BOOL(obj.keepOriginal, false)
    conf        = CLAMP(parseInt(obj.conf), 40, 98, 80)
    decisionConf= CLAMP(parseInt(obj.decisionConf), 0, 100, 50)  # v11.17 新增

    # ---- 跨字段一致性裁决（矛盾时保守降级）----
    if cropIntent == "none":            keepOriginal = true
    if keepOriginal == true:            cropIntent = "none"; cropStrength = "轻"
    if headroom == "少" and cropIntent in [crop_top, crop_tb]: cropIntent = crop_tb?crop_bottom:"trim"
    if gazeDir == "left"  and cropIntent == "crop_left":  cropIntent = "trim"
    if gazeDir == "right" and cropIntent == "crop_right": cropIntent = "trim"
    if symmetry != "none" and cropIntent in 单边枚举:       cropIntent = "trim"   # 对称图禁单边裁（见§6）
    if hasReflection and cropIntent in [crop_bottom, crop_tb]: cropIntent = "crop_top"  # 保倒影
    if atmosphere in [sunset_sky, water_reflection, neon_night] and cropIntent 命中该边:
        keepOriginal = true; cropIntent = "none"                                 # 高彩氛围边不裁

    return normedIntentCloud   # 交给 _arbitrateCrop
```

### 2.4 来源与置信度

- OpenAI Structured Outputs / function calling 官方文档：**高**（一手官方）。
- Google Gemini responseSchema 官方文档：**高**。
- 本项目上游为 OpenAI 兼容代理、未必支持 strict schema：**高**（基于代码 7567-7569 模型列表推断）。
- 置信度：总体 **高**。

---

## 3. 主题二：防坐标幻觉（原理与本项目的对应做法）

### 3.1 原理与证据

- **VLM 直接输出像素坐标是系统性弱项**。GUI grounding 评测里，通用 VLM 的"直接坐标预测"准确率极低：ScreenSpot-v2 上 Gemini-3.1-Pro 直接推断仅 11.72%，加"网格脚手架（Mark-Grid）"后才到 95.20%——说明模型不是看不懂图，而是**把视觉位置翻译成数字 token 这一步严重失真**。["https://arxiv.org/html/2509.11548"]
- **坐标 token 有数值偏差**：无引导的模型在解码早期就强烈偏向大数（如真值 [659,857] 被预测成 [1024,856]），这种 positional encoding 带来的偏差需要专门矫正。["https://arxiv.org/html/2510.22102v1"]
- **两阶段范式**：prefill 阶段先选候选元素，decoding 阶段才精调坐标；**候选选错，解码阶段无法挽救**。这意味着"让模型自由给框"本质上把定位赌在了 prefill 一瞬间。["https://arxiv.org/html/2605.12549"]
- **reasoning（CoT）反而降低 grounding 准确率**（归一化框上 Gemini/Claude thinking 分别掉 28.7%/16.1%），本项目 `enable_thinking:false` 是对的。["https://arxiv.org/pdf/2503.16788"]
- 行业共识（代码 7836-7837 注释里也引用了）：VLM 自由输出数字坐标 = 数值幻觉根源；正确做法是**模型只做意图/方向判断，坐标由代码算**。

### 3.2 做法（本项目已做对，本次要补的）

本项目 v6.0 起 `boxOk=false`、云端绝不给坐标，是完全正确的。v11.17 在此基础上补两点：

1. **把"裁切力度"从隐式变显式**：当前力度全靠本地引擎按 subjectPos/subjectSize 推算，VLM 没有表达"这块只该轻轻收一下"的通道。新增 `cropStrength:轻/中/重`，本地映射为四边总裁量的档位（建议：轻=3%、中=8%、重=14%，且仍受 `_guardCrop` 总和≤70% 约束）。
2. **跨字段一致性校验代替"坐标合法性校验"**：既然云端不给坐标，"坐标自相矛盾"就变成"意图字段自相矛盾"，§2.3 的伪代码已覆盖（none↔keepOriginal、headroom↔crop_top、gazeDir↔同向裁、symmetry↔单边裁、hasReflection↔裁底）。

### 3.3 来源与置信度

- ScreenSpot / UGround 系列 grounding 评测：**高**（一手论文）。
- 坐标数值偏差、prefill 决定性：**中高**（2025-2026 较新论文，方向一致）。
- 置信度：**高**——"云端不给坐标"是多源一致结论。

---

## 4. 主题三：多候选打分范式（generate-then-rank）

### 4.1 原理与证据

- **Cropper（ACM MM 2024 级）**：VLM 先**生成 R=6 个候选裁框**，再用打分器（美学 VILA + CLIP 内容保持 + 面积）给每个候选打分，把分数反馈给 VLM **迭代 L=2 轮** refinement。消融：zero-shot Gemini-1.5-Pro 直接给框 IoU 仅 0.509，加候选+打分+迭代后 0.748。**关键观察：VLM 直接给的初始候选"缺乏多样性、有时毫无意义（过大或过小）"**——这正是本项目要防的"越裁越大/乱裁"。["https://arxiv.org/html/2408.07790"]
- **AesCrop（2025）**：端到端 **rank-based** 裁切——一次输出多个裁框并附质量分，用组合注意力显式编码构图线索。["https://arxiv.org/html/2510.22528"]
- **Venus（CVPR 2026）**：两阶段先训审美指导、再用 CoT 推理激活审美裁切，在 FLMS 上 IoU 超上一任 SOTA +1.50、比 GPT-4o 高 +15.4；结论是"审美裁切能力来自推理指导，而非自由坐标生成"。["https://arxiv.org/html/2602.23980"]
- **COMEX（2026）**：通用 MLLM 在真实照片（FCDB）审美裁切上表现依然很差，再次证明"让通用 VLM 自由给框"不靠谱。["https://arxiv.org/html/2608.07570"]
- **FCDB/FLMS 是该领域标准评测**：FCDB 348 张测试图每图一个 reframing 框，用 IoU 和 Disp（边界位移）评价。["https://arxiv.org/html/2407.01971v1"]

### 4.2 本项目的 generate-then-rank 方案（详见 §7）

核心翻转：**候选框由本地几何预生成（安全、合法、不越界），VLM 只做"审美排序+否决"**。这恰好把 VLM 的强项（审美判断、看缩略图对比）和弱项（生成精确坐标）分离。

### 4.3 来源与置信度

- Cropper / AesCrop / Venus / COMEX：**高**（一手论文，方向高度一致）。
- 置信度：**高**——"候选生成靠几何、排序靠 VLM"是学界收敛方向。

---

## 5. 主题四：self-consistency 与二次自审

### 5.1 原理与证据

- **self-consistency（自洽投票）**：同一问题多次采样（随机解码），取多数票；仅在**票差很小（margin 触发）**时才对低票差样本做二次仲裁（MQRA）。思想是"幻觉是随机孤立的、正确答案是稳定一致的"。["https://arxiv.org/html/2606.04323","https://arxiv.org/html/2512.11109"]
- 多 VLM 互证（Consensus Entropy）也证实：3 次采样多数票能显著降低 OCR 类错误。["https://arxiv.org/html/2504.11101v4"]
- 但**全量 3 倍采样 = 3 倍成本**，对 PWA 不划算。工程上更优的是：**默认单次低温度采样，只在"低置信/双脑矛盾"时触发一次复核**。

### 5.2 做法（结合本项目现有自审闭环）

本项目已有一个很好的雏形（8409-8432 人像完整性自审）。建议升级为**清单式自审**，且从"仅人像"扩展到"所有做了裁切的图"：

1. **单次请求内**，让 VLM 在输出 JSON 时就附带一个 `checklist` 字段（自检结果）：`{cut_head:false, cut_limb:false, cut_reflection:false, break_symmetry:false, cut_guiding_line:false}`。这是"先给方案、立刻自检"的 self-refine 模式，不额外花钱。
2. **外部复核（第二次请求）只在仲裁器判定矛盾时触发**：当 `_arbitrateCrop` 发现 local 与 cloud 意图冲突、或 `decisionConf<60`、或 checklist 任一项为 true 时，才把裁后缩略图喂回复核（现有逻辑）。
3. **self-consistency 投票**：仅对最关键的 `cropIntent` 决策，且仅在"云端说裁、本地显著性说别裁"这种强冲突时做 2 次采样取多数（成本可控）。

### 5.3 来源与置信度

- self-consistency / MQRA / 多 VLM 互证：**中高**（方法成熟，成本权衡是工程判断）。
- 置信度：**高**——"默认单次、矛盾才复核"是性价比最优解。

---

## 6. 主题五：prompt 鲁棒性

### 6.1 原理与证据

- **系统/用户分层**：Anthropic 官方"give Claude a role"建议——稳定规则、角色、原则走 system；具体字段任务、输入走 user。本项目 7691 已这样做（v8.0.5 注释），**保持**。
- **few-shot**：Anthropic 称例子是"最可靠的格式/语气/结构引导方式之一"，但要相关、多样、用标签包裹。["https://docs.anthropic.com/en/docs/give-claude-a-role","https://claude.com/blog/best-practices-for-prompt-engineering"] 本项目可加 1-2 个**纯文字**的边缘案例示例（如"晚霞满天=atmosphere:sunset_sky，此时 cropIntent 必须 none"），不必配图（省 token）。
- **否定指令系统性失效**：这是最重要的一条。研究证实 CLIP/VLM 会忽略 no/not/without，"a car without tires"常被理解成"a car with tires"；plain 否定 prompt 在视觉问答上直接答错。["https://arxiv.org/html/2403.20312v1/","https://arxiv.org/pdf/2610.01180"] 工程上的对策是 **positive framing**——告诉模型"该做什么"而不是"别做什么"，Anthropic 官方也明确背书这一点（"Tell Claude what to do instead of what not to do"）。["https://eval.16x.engineer/blog/the-pink-elephant-negative-instructions-llms-effectiveness-analysis"]
- **温度/top_p**：结构化抽取/分类类任务官方建议 **temperature 0.0~0.2、top_p 保持默认（1.0）**；且 OpenAI 明确"不要同时调 temperature 和 top_p"。本项目 `temperature:0.15` 处于推荐区间，**保持或降到 0.1**，top_p 不动。["https://aiagentskit.com/blog/temperature-top-p-ai/","https://prompt-architects.com/blog/48-temperature-top-p-top-k-explained"]

### 6.2 本项目 prompt 的正向化改写清单

现有 prompt 里的否定句式 → 正向规则改写：

| 现有（否定） | 改为（正向） |
|---|---|
| "不要只描述照片然后说保持原图" | "先找到画面最美区域 highlight，再据此定 cropIntent" |
| "不要默认 none" | "四边存在无信息死区时，cropIntent 从 crop_top/bottom/left/right/trim 中选" |
| "不要输出数字坐标或百分比" | "裁切方向只从 8 个枚举里选；具体裁多少由本地算法算" |
| "不要因为天空多就裁掉" | "天空/水面带色彩层次时，atmosphere 标为 sunset_sky/water_reflection，该边 cropIntent 选 none" |
| "对称、倒影、引导线保持完整" | "symmetry 非 none 时，cropIntent 选 trim 或 none，不选单边枚举" |

### 6.3 中文 prompt 注意点

- 枚举值一律 ASCII（已做），中文只用于描述与解释。
- 中文否定词（"不要/别/不裁"）同样易被忽略，正向化优先级同英文。
- 字段说明用短句、给例子（现有"如'人物略偏左，向右移半步'"是好做法）。

### 6.4 来源与置信度

- Anthropic prompt 最佳实践：**高**（官方）。
- VLM 忽略否定词：**高**（多篇 2024-2026 论文一致）。
- 温度参数：**高**（多源一致）。
- 置信度：**高**。

---

## 7. 主题六：典型失败模式与回退（对照表）

| # | 失败模式 | 检测条件（本地判定） | 回退/修正策略 |
|---|---|---|---|
| F1 | 云端拒答/空响应/非 JSON | `txt` 为空、正则抠不到 `{`、无 `rule` 字段 | `onDone(null)` → 本地引擎全量（现有） |
| F2 | JSON 被 max_tokens 截断 | 括号不平衡、尾部字段不完整 | 现有三段修复；仍失败 → 回退本地 |
| F3 | 视觉通道无效（读不到图） | 现有 `_blindRe` 命中 | 重试 1 次 → 60s `cloudBlindUntil` 熔断（现有） |
| F4 | 越裁越大/过小 | 四边和 >70%，或单边 >50% | `_guardCrop` 已 clamp 到和≤70%；新增：若超阈先把 `cropStrength` 降一档再重算 |
| F5 | 对称图被单边裁 | `symmetry!=none` 且 cropIntent∈单边枚举；或本地 hSym/vSym 高 | 降级为 trim/none（§2.3） |
| F6 | 夜景误判成美食/日景 | 本地 mean<70（夜景）但云端 scene=food/architecture | 以本地夜景信号优先，强制 scene=night 且走宽幅门 |
| F7 | 把好氛围当死区（裁晚霞/倒影） | `atmosphere∈{sunset_sky,water_reflection,neon_night}` 且 cropIntent 命中该边；或 `_cloudCropIntentGuard` 命中 | keepOriginal=true / 内收 2%（现有 + 新增 atmosphere 字段双保险） |
| F8 | 坐标/意图自相矛盾 | cropIntent=none 却 keepOriginal=false；headroom=少 却 crop_top | §2.3 跨字段一致性裁决，保守降级 |
| F9 | 切头/切关节/切倒影 | 自审 checklist 任一项=true，或裁后缩略图复核 complete=false | 裁切力度减半（现有）；切倒影→改裁对边 |
| F10 | 幻觉主体（VLM 编造画面里没有的东西） | highlight 描述的位置与本地显著性质心严重偏离（如质心在右、VLM 说主体在左） | 该 cropIntent 与显著性冲突时降级为 trim，并以本地质心为准重定位（现有 7943-7946） |
| F11 | 云端超时 | 28s abort | 回退本地（现有）；外层 30s 兜底 |
| F12 | 连续网络/服务异常 | 3 连败 | 5 分钟 `cloudTripUntil` 熔断（现有） |
| F13 | 低置信度判断 | `decisionConf<60` 或 conf<60 | 仲裁器偏向本地意图；仅做轻裁（trim/轻） |
| F14 | 人像特写被乱裁 | 本地 bodyH>0.72 | 强制 noCrop（现有 8325-8333） |
| F15 | 同图撞缓存套错方案 | 低信息相似图 hash 碰撞 | 现有双种子键+尺寸已缓解；命中后仍过一遍低信息短路 |

---

## 8. 主题七：相关研究清单（仅参考公开学术方向与通用原理）

| 工作 | 要点 | 对本项目的启示 | 链接 |
|---|---|---|---|
| Cropper (2024) | VLM 生成 R=6 候选 + 美学/CLIP/面积打分 + L=2 迭代 | 候选打分范式；VLM 直接给框 IoU 仅 0.509 | https://arxiv.org/html/2408.07790 |
| AesCrop (2025) | rank-based，多框+质量分，构图注意力偏置 | 排序而非单点 | https://arxiv.org/html/2510.22528 |
| Venus (CVPR2026) | 两阶段：审美指导→CoT 激活裁切 | 审美判断靠推理不靠坐标 | https://arxiv.org/html/2602.23980 |
| COMEX (2026) | 通用 MLLM 在真实照片裁切上仍差 | 别指望通用 VLM 自由给框 | https://arxiv.org/html/2608.07570 |
| InstructCrop (ACM MM25) | 教 MLLM 做审美裁切 | 训练数据范式参考 | https://dl.acm.org/doi/pdf/10.1145/3746027.3754931 |
| ScreenSpot / UGround | VLM 直接坐标预测准确率极低 | 云端不给坐标 | https://arxiv.org/pdf/2410.05243v3 |
| 坐标偏差矫正 (2025) | 解码早期偏向大数 | 数值幻觉证据 | https://arxiv.org/html/2510.22102v1 |
| self-consistency / MQRA | 多采样投票、低票差再仲裁 | 矛盾才复核 | https://arxiv.org/html/2606.04323 |
| FCDB / FLMS | 裁切标准评测（IoU/Disp） | 自评测口径 | https://arxiv.org/html/2407.01971v1 |

---

## 9. 云端输出字段 vs 本地必算字段（明确划分）

### 9.1 云端（VLM）可以输出的——全部是语义/枚举/标签

| 字段 | 类型/枚举 | 说明 | v11.17 是否新增 |
|---|---|---|---|
| `scene` | 9 枚举 | 场景分类 | 已有 |
| `rule` | 8 枚举 | 构图法 | 已有 |
| `subjectPos` | 10 枚举 | 主体相对位置（非坐标） | 已有 |
| `subjectSize` | 4 枚举 | small/medium/large/full | 已有 |
| `cropIntent` | 8 枚举 | 裁切方向意图 | 已有 |
| `cropStrength` | 轻/中/重 | 裁切力度档位 | **新增** |
| `keepOriginal` | bool | 是否保持原图 | 已有 |
| `headroom` | 多/中/少 | 头顶留白 | 已有 |
| `gazeDir` | left/right/up/down/none | 视线方向 | 已有 |
| `horizon` | 上三分/中/下三分/无 | 地平线位置 | 已有 |
| `atmosphere` | none/sunset_sky/blue_sky/water_reflection/neon_night/cloud_sea/clean_dead | 氛围标签（保护高彩边） | **新增** |
| `symmetry` | none/horizontal/vertical/both | 对称标签（禁单边裁） | **新增** |
| `hasReflection` | bool | 倒影（保底部） | **新增** |
| `conf` | 0-100 | 整体构图分 | 已有 |
| `decisionConf` | 0-100 | 本次裁切决策置信度 | **新增** |
| `checklist` | 5 个 bool | 切头/切肢/切倒影/破对称/切引导线 自检 | **新增（单次请求内自检）** |
| `desc/highlight/issue/cropReason` | 中文自由文本 | 解释用 | 已有 |

### 9.2 本地（代码）必须算、绝不信任云端的

- **精确裁切框** [L,T,R,B] 百分比（`_computeCropByRule` / `_aspectCrop`）
- **主体保护框**（COCO/MediaPipe/皮肤质心/显著性融合）
- **人脸框、姿态关节框**（`_jointGuard` 输入）
- **多物体框**（`allBoxes`，`_objectGuard`）
- **显著性图 / RoD 前缀和 / 高彩条带检测**（`_cloudCropIntentGuard` 输入）
- **几何守护**：单边≤50%、四边和≤70%、保留区宽高比 1/1.45~1.45
- **宽幅门**（waterscape/landscape/night/architecture 横拍 16:9）
- **夜景判定**（本地 mean<70）、低信息短路、人像特写判定（bodyH>0.72）
- **双脑仲裁** `_arbitrateCrop(intentLocal, intentCloud, aiData)` 的最终取舍

---

## 10. 完整 sysPrompt 建议稿（v11.17，中文，正向化）

```text
你是服务普通拍照用户的专业摄影构图分析师。你只输出一个严格 JSON 对象，不输出任何多余文字、不输出 markdown。

【你的任务】先观察整张照片，找到画面最美、最吸引眼球的区域（highlight），然后判断该往哪个方向收紧能让它更突出。裁切方向与力度只从给定枚举中选，具体裁多少由本地算法计算。

【场景优先级】有明显人物（任何大小/正侧背）→portrait；动物是绝对主体、人物只是点缀→animal；室内餐具/饮品/食物为主体→food；水面倒影为视觉主体→waterscape；建筑/街道/天际线为主体→architecture 或 street；整体偏暗以灯光夜色为主→night；其余→landscape 或 general。

【氛围判定（重要）】天空/水面/夜景若带色彩与层次（晚霞、宝石蓝天、云海、霓虹、水面倒影），把 atmosphere 标为对应枚举（sunset_sky/blue_sky/water_reflection/neon_night/cloud_sea），并把该边的 cropIntent 设为 none——这些是构图的一部分。只有真正单调无信息的区域（灰白过曝、纯黑、糊掉的杂物堆）才是裁切目标（atmosphere=clean_dead）。

【对称与倒影】若画面明显左右对称、上下对称或镜像，symmetry 标为对应枚举，cropIntent 选 trim 或 none，让对称结构保持完整。若水面/地面有明显倒影，hasReflection 设为 true，底部保持完整（cropIntent 避免 crop_bottom/crop_tb）。

【裁切方向 cropIntent 枚举】crop_top / crop_bottom / crop_left / crop_right / crop_tb / crop_lr / trim / none。
- 找到 clean_dead 死区在哪条边，就选该边；四边都有价值（含简洁氛围）时选 none。
【裁切力度 cropStrength 枚举】轻=只收冗余边一点点；中=适度收紧；重=明显裁去大块死区。拿不准时选轻。

【人物】headroom 标多/中/少；gazeDir 标视线方向（left/right/up/down/none）。头顶留白少时（headroom=少）保持顶部完整。

【conf 锚点】主体混乱/杂物抢戏=45-58；主体明确但松散=60-73；构图合理=75-84；三分/引导线/对称精准=85-98（人物类≤88）。decisionConf 只针对"要不要裁、往哪裁"这个决策打分：画面拿不准就给低分（<60），本地算法会更保守。

【自检 checklist（输出前逐项自问）】cut_head（会切到人头/头顶吗）、cut_limb（会切到手/脚/关节吗）、cut_reflection（会切到倒影吗）、break_symmetry（会破坏对称吗）、cut_guiding_line（会切断引导线吗）。任一项为真，把 cropIntent 降级为 trim 或 none。

【铁律】先观察再回答；所有判断基于真实看到的画面；描述讲人话；字段名与枚举值严格照给，不要输出数字坐标或百分比。
```

**user prompt**（字段清单，v11.17）：在现有模板基础上，把 JSON 示例改为：

```json
{"scene":"","subject":"","desc":"","highlight":"","issue":"","rule":"","ruleReason":"",
 "subjectPos":"","subjectSize":"","headroom":"多/中/少","gazeDir":"left/right/up/down/none",
 "horizon":"上三分/中/下三分/无","clutter":"",
 "atmosphere":"none/sunset_sky/blue_sky/water_reflection/neon_night/cloud_sea/clean_dead",
 "symmetry":"none/horizontal/vertical/both","hasReflection":false,
 "cropIntent":"crop_top/crop_bottom/crop_left/crop_right/crop_tb/crop_lr/trim/none",
 "cropStrength":"轻/中/重","cropReason":"","keepOriginal":false,
 "checklist":{"cut_head":false,"cut_limb":false,"cut_reflection":false,"break_symmetry":false,"cut_guiding_line":false},
 "filter":"","filterReason":"","conf":80,"decisionConf":60}
```

**请求参数建议**：`temperature:0.1`（比现 0.15 略降，更稳）、`top_p` 不动、`max_tokens:2000` 保持、`enable_thinking:false` 保持。若上游支持，加 `response_format:{"type":"json_object"}`。

---

## 11. generate-then-rank 完整方案（v11.18 候选，与仲裁器衔接）

### 11.1 是否值得做——明确推荐

**值得做，但分两期。** 理由：
- 学界共识：Cropper（R=6 候选+打分迭代）、AesCrop（rank-based）、Venus（CoT 激活裁切）全部收敛到"候选生成→审美排序"，而通用 MLLM 自由给框被反复证明差（COMEX、Cropper zero-shot IoU 0.509）。
- 本项目 VLM 的强项是"看缩略图做审美偏好"，弱项是"生成精确几何"。把两者拆开：**几何候选本地生成（合法、不越界），VLM 只排序+否决**，正好扬长避短。
- 但全量上候选排序 = 多一次图上传/多一份延迟，对 PWA 有成本。所以 **v11.17 先做零成本增量（枚举+档位+单次请求内自检），v11.18 再上排序闭环**。

### 11.2 候选框如何本地生成（K=5~6，全部保证合法）

```text
候选集（均为归一化四边裁量 [L,T,R,B]，且已过 _guardCrop 守护）：
  A = 现状引擎输出（rule 构图重定位框）         ← 本地默认
  B = 四边各 +6% 轻度收紧（trim 档）
  C = 主体保护框内收紧（subjectSize=small 时更紧）
  D = 沿 horizon/地平线上下宽幅（风景/夜景用）
  E = keepOriginal（[0,0,0,0]）               ← 原图兜底
  （可选 F = 视线方向留白重定位）
```

### 11.3 给模型的消息格式

把 A-E 五个候选各自裁出缩略图，拼成一张 **2×3 或 1×5 缩略图拼图**（每格标注 A/B/C/D/E），随单张图发给 VLM：

```text
这是同一张照片的 5 个裁切候选（缩略图已按 A/B/C/D/E 标注）。
请只做两件事：
1. 按美学从好到差排序，输出 rank 数组；
2. 找出会切到人物/倒影/对称/引导线的候选并否决。
只输出 JSON：{"rank":["B","A","D","C","E"],"best":"B","veto":["C"],"reason":"..."}
```

### 11.4 返回排序格式与仲裁器衔接

```text
VLM 返回 {rank, best, veto, reason}：
  - 先剔除 veto 中的候选；
  - 取 rank 第一个未被否决者为 vlmBest；
  - 交给 _arbitrateCrop(intentLocal=A, intentCloud=vlmBest, aiData)：
      · 若 vlmBest == A（与本地默认一致）→ 直接用，省一次取舍；
      · 若不一致且 decisionConf≥70 且 vlmBest 不在 veto → 用 vlmBest，并在 notes 记录；
      · 若不一致但 decisionConf<60 → 维持本地 A（保守）；
      · E（原图）排第一 → 等同 keepOriginal=true。
```

成本控制：拼图一次请求（约 1024px），不增加往返；veto 清单替代外部复核请求。

---

## 12. 红线与口径

- 本报告全部结论来自多轮公开资料（官方文档/论文/工程博客）的学习研究，所有 prompt、schema、校验逻辑均为本项目自研设计。
- 统一口径："多轮公开资料学习研究，全部自研方案；仅参考公开通用原理与学术成果"。
- 本调研为只读：未修改 `/sandboxdata/workspace/file/aict_v837/` 任何文件、未做 git 操作、未启动浏览器、未真实调用云端接口。

---

## 13. 来源汇总（按置信度分组）

**高置信（官方/一手论文）**
1. OpenAI Function Calling / Structured Outputs：https://help.openai.com/zh-hans-cn/articles/8555517-function-calling-in-the-openai-api
2. Azure OpenAI Structured Outputs：https://learn.microsoft.com/en-us/Azure/ai-foundry/openai/how-to/structured-outputs
3. Google Gemini JSON Mode / responseSchema：https://ai.google.dev/gemini-api/docs/json-mode?authuser=0000&hl=zh-cn
4. Anthropic Give Claude a Role：https://docs.anthropic.com/en/docs/give-claude-a-role
5. Anthropic Prompt Engineering Best Practices 2026：https://claude.com/blog/best-practices-for-prompt-engineering
6. Cropper（候选+打分迭代）：https://arxiv.org/html/2408.07790
7. AesCrop（rank-based）：https://arxiv.org/html/2510.22528
8. Venus（CVPR2026 审美裁切）：https://arxiv.org/html/2602.23980
9. COMEX（通用 MLLM 裁切差）：https://arxiv.org/html/2608.07570
10. InstructCrop：https://dl.acm.org/doi/pdf/10.1145/3746027.3754931
11. ScreenSpot-v2 / Mark-Grid（直接坐标 11.72%→95.20%）：https://arxiv.org/html/2509.11548
12. UGround / ScreenSpot：https://arxiv.org/pdf/2410.05243v3
13. CoT 降低 grounding：https://arxiv.org/pdf/2503.16788
14. 坐标数值偏差：https://arxiv.org/html/2510.22102v1
15. prefill 决定 grounding：https://arxiv.org/html/2605.12549
16. VLM 忽略否定词：https://arxiv.org/html/2403.20312v1/
17. Skeleton-and-Strategy（否定理解）：https://arxiv.org/pdf/2610.01180
18. self-consistency / MQRA：https://arxiv.org/html/2606.04323
19. Test-time scaling for VLM：https://arxiv.org/html/2512.11109
20. 多 VLM 互证（Consensus Entropy）：https://arxiv.org/html/2504.11101v4
21. FCDB/FLMS 评测口径：https://arxiv.org/html/2407.01971v1

**中高置信（工程博客/综述）**
22. Pink Elephant（否定指令失效与正向框架）：https://eval.16x.engineer/blog/the-pink-elephant-negative-instructions-llms-effectiveness-analysis
23. Temperature/Top-P 工程指南：https://aiagentskit.com/blog/temperature-top-p-ai/
24. 抽取类任务温度表：https://prompt-architects.com/blog/48-temperature-top-p-top-k-explained

（共 24 个来源）
