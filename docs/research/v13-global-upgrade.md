# v13.0.0 真AI构图 + BYOK 视觉模型预设研究

> 日期：2026-10-26
> 目标：让云端真正“看图选最美构图”，并让普通用户选厂商后不用手写模型名。
> 方法：多智能体并行研究 + 官方文档/模型目录 + 浏览器 CORS 预检（OPTIONS，不带真实 Key）+ 真实 SCF 请求验证。

## 一、为什么“云端开着却像本地”

1. 云端开关与口令分离：开关 `aiComposeCloudOn=1` 但口令为空时，v12.29 仍会先落地像素构图，只有结果卡一小行提示，用户看不到。
2. 口令保存有 250ms debounce，粘贴口令后立刻点开关/分析，输入框会被回填成旧值，口令被清空，云端永远不发出。
3. 云端只回 `cropIntent`，本地 `planFromAnalysis` 再算一遍，很多图算回 noCrop；用户看到“云端开了但没变化”。
4. 旧建议卡会被后续 `presentAnalysis` 清掉，失败解释也被本地模型状态覆盖。

v13 的修法：
- 口令 input 立即写 state + localStorage；开关切换前先 flush；初始化同步开关/复核 checkbox；`_cloudReady()` 同时以 localStorage 的开关/模式/口令为权威。
- 顶部常驻云端状态条：`云端AI分析中 6s` / `云端AI选中 B · 4:5` / `云端已复核 · 保留本地` / `口令不对 · 去填写` / `超时 · 重试云端`。
- 缺口令时不再假装走云端：标签直接显示 `📷 本地 · ☁️ 云端未就绪`，状态条给「去填口令」。
- 60s 超时、失败、相机空帧都会落到明确状态，不再永久停在“分析中”。

## 二、真 AI 构图：本地出候选，VLM 只做选择

研究结论（SoM / RegionFocus / BLINK / Cropper CVPR'25 / GAIC）：
- VLM 直接输出精确坐标不稳定；把“定位”变成“在已有候选里选编号”更可靠。
- 一张候选联系表 = 1 次上传 + 1 次推理，比多次候选请求更快、更便宜，也能横向比较。
- 需要防位置偏差：原图固定左上；A/B/C 按图片 hash 轮换格子；要求同时给 best 和 worst，二者相同判无效。
- 本地负责硬保护：主体/人脸/人物/物体、画幅、面积、边缘死区、动物/美食分级上限；VLM 只能选，不能绕过 veto。

v13 落地：
1. `_buildCompositionCandidates` 生成 A/B/C 三个安全裁切 + D 原图；人像/特写不生成候选。
2. 每个候选过 `_cloudCropGuard`（人像/动物/美食上限）与 `_cropQualityScore`（主体重叠、三分、画幅、死区、面积）。
3. `_buildCandidateSheet` 生成 896×896 2×2 联系表：原图固定左上，A/B/C 按 hash 轮换；每格真实裁切 + 编号 + 画幅。
4. 云端 prompt 只要求 `scores{A,B,C,D}`、`best`、`worst`、`confidence`、`reason`、`scene/subject/filter`；不输出坐标。
5. 本地校验：best 分数必须在最高分附近、best≠worst、选中候选安全；否则退回最高分安全候选或原图。
6. 用户没手动改图时，云端选中结果自动从原图重裁并应用；用户改过则只给建议卡。
7. 结果页常驻「✨ AI 构图候选」条，A/B/C/原图可随时切换，云端选中项高亮并显示理由。

## 三、BYOK 厂商与视觉模型预设（2026-10-26 核对）

> 只列**支持图片输入**的模型；模型名必须精确。CORS 为浏览器 OPTIONS 预检 + 无 Key POST 的只读判断，CDN/WAF 变动后需复测。

| 厂商 | Base URL | CORS | 推荐预设（默认/高质量） |
|---|---|---|---|
| 硅基流动 | `https://api.siliconflow.cn/v1` | ✅ | `Qwen/Qwen3-VL-32B-Instruct` / `Qwen/Qwen3-VL-235B-A22B-Instruct` |
| 通义百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | ✅ | `qwen3.7-plus` / `qwen3.8-max`（另有 `qwen3-vl-plus/flash`） |
| OpenRouter | `https://openrouter.ai/api/v1` | ✅ | `google/gemini-3.8-flash` / `anthropic/claude-sonnet-5.5` |
| DeepSeek | `https://api.deepseek.com/v1` | ✅ | `deepseek-flash`（V4.1 Flash 原生视觉） |
| Kimi | `https://api.moonshot.cn/v1` | ✅ | `kimi-k3.1-pro` / `kimi-k3.1-pro-highspeed` |
| 百度千帆 | `https://qianfan.baidubce.com/v2` | ✅ | `ernie-4.5-turbo-vl` / `ernie-5.0` |
| MiniMax | `https://api.minimaxi.com/v1` | ✅ | `MiniMax-M3.1-Flash` / `MiniMax-M3` |
| 阶跃星辰 | `https://api.stepfun.com/v1` | ✅ | `step-3.7-flash` / `step-5-preview` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | ❌ 预检无 ACAO | 必须代理；`glm-4.6v-flashx` / `glm-5v-turbo` |
| 腾讯混元 | `https://api.hunyuan.cloud.tencent.com/v1` | ❌ 预检 404 | 旧平台必须代理；`hunyuan-t1-vision` |
| 火山方舟 | `https://ark.cn-beijing.volces.com/api/v3` | ❌ 实际 POST 无 ACAO | 必须代理；`doubao-seed-2.1-lite` / `pro` |
| OpenAI 官方 | `https://api.openai.com/v1` | ❌ 通常无 CORS | 需代理；`gpt-5.5` / `gpt-5-mini` |
| Anthropic 官方 | `https://api.anthropic.com/v1` | ⚠ opt-in + 海外 | `claude-sonnet-5-5` / `claude-haiku-5-5` |
| Google Gemini 官方 | `https://generativelanguage.googleapis.com/v1beta/openai/` | ⚠ 未确认 | `gemini-3.8-flash` / `gemini-3.1-pro-preview` |

实现细节：
- 每个厂商下拉里内置 2-5 个视觉模型预设，自动填 `cloudByokModel`，不需要手写。
- 「自定义模型 ID」仅用于高级用户；提示必须支持 vision/image_url。
- 「测试云端连接」发送一张 64×64 测试图和 5 token 请求，真实验证 Key、模型 ID、CORS、视觉通道；结果直接显示 401/404/429/CORS/超时。
- OpenRouter 自动带 `HTTP-Referer` + `X-OpenRouter-Title`；Anthropic 自动带 `anthropic-dangerous-direct-browser-access: true`。
- 只给 Qwen 系列发 `enable_thinking:false`、GLM 发 `thinking:{type:"disabled"}`；其他厂商不再乱塞未知字段，避免 400。

## 四、参考来源

- SoM: https://arxiv.org/abs/2310.11441
- RegionFocus: https://arxiv.org/abs/2505.00684
- BLINK: https://arxiv.org/abs/2404.12390
- Cropper CVPR'25: https://cvpr.thecvf.com/virtual/2025/poster/34238
- GAIC: https://arxiv.org/abs/1909.08989
- SiliconFlow 模型: https://www.siliconflow.com/zh-tw/models
- 百炼模型: https://help.aliyun.com/zh/model-studio/models
- OpenRouter Models: https://openrouter.ai/models
- DeepSeek Vision: https://api-docs.deepseek.com/guides/vision
- Kimi 模型: https://platform.kimi.com/docs/models
- 千帆模型: https://cloud.baidu.com/doc/qianfan/s/rmh4stp0j
- MiniMax API: https://platform.minimaxi.com/docs/guides/text-generation
- StepFun 视觉: https://platform.stepfun.com/docs/zh/guides/models/vision
- GLM-4.6V: https://docs.bigmodel.cn/cn/guide/models/vlm/glm-4.6v
- 混元 OpenAI 兼容: https://cloud.tencent.com/document/product/1729/111007
- 火山方舟模型: https://www.volcengine.com/docs/82379/2183190
- OpenAI Models: https://platform.openai.com/docs/models
- Anthropic OpenAI SDK: https://platform.claude.com/docs/en/api/openai-sdk
- Gemini OpenAI 兼容: https://ai.google.dev/gemini-api/docs/openai

## 五、本轮实测（2026-10-26）

- 本地 100 张：noCrop 44 / 裁切 56；人像/特写 23 张全部保留；人物切穿 0；微小裁切 0（与 v12.29 构图基线一致）。
- 真实云端单图：arch_1 12.1s 选 B（16:9）并自动应用；backlit_5 37s 云端识别 portrait 后退回原图；arch_5 动物裁切被收到单边 8%（[0,8,0,0]）；food_3 本地误判 portrait_close 时云端仍给建议卡，不再静默。
- 候选切换：A/B/C/原图本地点击均能从原图重裁并更新 plan/尺寸，0 控制台错误。
- BYOK 设置：硅基流动预设下拉正确；OpenRouter 自动填 Gemini 3.8 Flash；自定义模型输入可展开；共享口令「测试云端连接」真实返回 ✅ 9.4s；硅基 dummy Key 返回 401（说明 CORS 通道正常）。
- 云端 50 张（本地模型+云端均开启）：CLOUD 36 / local 14（14 张为本地人像保护），超时/失败 0；云端提案裁切 24 / 不裁 26，最终落地裁切 28 / 不裁 22；人像 16 张全部不裁；动物≤8%/25%、美食≤12%/35%；微裁 0、>35% 裁切 0。
