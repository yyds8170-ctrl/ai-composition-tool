# 照片美学评分与滤镜色彩科学调研：NIMA/MUSIQ 规则近似与 LUT/胶片曲线的 PWA 落地

> 调研日期：2026-10-19
> 调研性质：多轮公开资料学习研究，全部自研方案；仅参考公开学术论文（arXiv / CVF / IEEE）、公开技术文档（MDN / Adobe / ACES / Light Illusion）与公开参数区间，不引入任何第三方产品的界面、文案或实现细节。
> 调研对象：为单文件 PWA「AI 构图助手 Pro」提供"美学评分轻量规则化"与"滤镜色彩参数可量化区间"的来源。现状基线：`pure-functions.js` 中 `_recommendFilter(a, sig)` 已基于 `analyzePixels` 信号（mean / contrast / wb / sat / highClip / shadowClip / sharpness / lightScore / skinRatio / warmRatio / sigBox / lumGrid 等）做"硬闸门 + 规则推荐"，已有 6 款滤镜（night / portrait-warm / portrait-cool / portrait-mono / mono / sunset），输出 `{rule, filter, strength}`。
> 术语约定：`a` = analyzePixels 输出信号对象（亮度 0–255、sat/wb 为归一化小数）；`sig` = 场景信号（personScore / personCount / scene / sym 等）；本文所有"纯函数"均指无 I/O、入参只读、同参同值的 JS 函数，与 `_recommendFilter` 同构。

---

## 0. 结论先行（TL;DR）

1. **NIMA/MUSIQ 的任务契约可以抄，但权重不能搬**：它们的输入是整图（224×224 或多尺度原图）、输出是 1–10 标量（或分布的期望），训练信号是 AVA 25 万图、78 万条人工评分。我们的单文件离线 PWA 不能跑 CNN/Transformer 权重，但"1–10 分 + 分量明细"的**输出契约**可以直接复用，用 5 条已有规则信号近似其输入特征，输出 `0–100 分 + A/B/C 档 + 分量分`。
2. **`aestheticScoreLite` 不需要新扫一遍像素**：现有 `analyzePixels` 已经产出曝光（mean/highClip/shadowClip）、色彩（sat/wb/warmRatio）、清晰度（sharpness）、人像（skinRatio/personScore）、构图（sigBox/lumGrid/sym）全部维度的代理信号，纯函数 `aestheticScoreLite(a, sig) → {score, grade, dims}` 只是把已有闸门阈值汇总成一个加权分，成本 = 0 次像素扫描。
3. **滤镜色彩科学的公开参数区间已经够用**：1D LUT = 三通道独立曲线（只能调亮度/增益，不能调色相），3D LUT = RGB 立方体晶格三线性插值（能做橙青分离）；胶片模拟的可量化配方是"阴影 hue 190–210 / sat 20–40 + 高光 hue 30–45 / sat 15–30 + 对比度 1.05–1.15 + 暗角 −15~−40 + 颗粒 σ≈5–15"。
4. **canvas 成本有明确量级**：Uint8ClampedArray 单像素循环 10 万像素 ≈ 4 ms/帧；3×3 颜色矩阵 + 256 项查表曲线每像素约 15 次浮点运算；CPU 上整图做高斯模糊 1920×1080 要 200–500 ms。结论：**分析在 ≤320px 缩略网格上做，预览在 ≤720p 上做，重操作不进主线程热路径**。
5. **评分×滤镜联动的核心分歧在"高分保原味 vs 低分微调"**：公开修图工作流的共识是——高分照片只做"中性化 + 5–10% 微增强"，动风格反而扣分；低分照片先救曝光（暗部 +10–20%）、再补对比（+10–15%）、最后才补饱和（+10–15%），且肤色场景"中性化比加饱和更有效"。

---

## 1. 照片美学评分经典方法：DPR / NIMA / MUSIQ 的输入输出与轻量替代

### 1.1 NIMA（Neural Image Assessment, Talebi & Milanfar 2017/2018）

公开论文（arXiv:1709.05424）的要点：

- **输入**：224×224 RGB 图，骨干是 Inception-V2 等已训练图像分类网络；把分类网络最后 FC 层换成"全局平均池化 + FC-10"。
- **输出**：10 类概率分布 `p(1..10)`，对应 AVA 数据集 1–10 分的人工评分直方图；**最终分数 = 分布的期望 μ = Σ i·p(i)**，不是 argmax。
- **训练损失**：Earth Mover's Distance（EMD，推土机距离），因为相邻分数桶有序（4 分和 5 分比 4 分和 9 分接近），交叉熵会丢掉这个序关系。
- **数据**：AVA 数据集 ~25.5 万张图、每张平均 ~210 条人工评分，1–10 离散分；另训一个 technical-quality 子网络。
- **公开口径**：NVIDIA 技术博客与 deepinv 文档均复述为"no-reference、预测人类评分分布、与人类感知排序高度相关（SRCC/PCC 量级）"。

来源：https://arxiv.org/pdf/1709.05424 ；https://arxiv.org/html/1712.02864v1 （EMD 损失与 FC-10 结构复述）；https://developer.nvidia.com/blog/deep-learning-hotel-aesthetics-photos/ ；https://deepinv.org/api/stubs/deepinv.loss.metric.NIMA.html

### 1.2 MUSIQ（Multi-Scale Image Quality Transformer, Ke et al., ICCV 2021）

公开论文（arXiv:2108.05997）的要点：

- **输入**：多尺度图像组（原生分辨率 + 保持宽高比 ARP 缩放的 k 个变体，实际 k=3），不是固定 224 正方形；用空间嵌入 + 尺度嵌入区分"不同尺寸、不同粒度"的 patch。
- **输出**：一个标量质量分；后续公开复现（arXiv:2506.18323）把 MUSIQ-AVA 输出归一化到 **S ∈ [0,100]**。
- **数据**：AVA（美学，10 级分布）+ KonIQ-10k（技术质量）等多数据集。
- **意义**：相比 NIMA 的单尺度 224，MUSIQ 证明"局部细节 + 全局构图"都要看到才评得准——这正是规则近似里"边缘密度（局部）+ 三分交点（全局）"双信号分工的理论依据。

来源：https://arxiv.org/pdf/2108.05997v1 ；https://arxiv.org/html/2506.18323v1 （输出区间 [0,100]）；https://blog.csdn.net/PixelMind/article/details/150401665 （k=3 多尺度复述）

### 1.3 DPR（Deep Photo Retouching / 修图评分任务族）

> 口径说明：本轮公开资料检索中，"DPR (Dampf et al.)"未在 arXiv / CVF / IEEE 公开库中检索到与之严格同名同作者的独立论文；下文按公开可查的"修图/修后评分"任务族整理输入输出契约，供我们对标，不虚构引用。

公开可查的修图数据/评分公开口径：

- **MIT-Adobe FiveK**：5,000 张 RAW 照片，5 位专家各自修图输出，公开复现中常用 Expert C 作为"高质量修图"锚点（deepwiki 复述 TITFormer 的 Ima-RGB-C 即 Expert C 版本）。任务定义：输入原图 → 输出专家修后图，评价 = 修后 vs 原图的感知质量差。
- **PPR10K（arXiv:2105.09180）**：11,161 张人像修图（1,681 组、同场景 3–18 张连拍），带人体区域掩码与组内一致性标注。
- **质量导向修图（arXiv:2406.15848）**：85 张 RAW 人像 × 13 档调节，一半修后"更好看"、一半"更差"，用于学习"修多少算过头"——与我们 GATE"过饱和/过曝不推滤镜"的保守策略同源。

**对本 PWA 的启示**：修图评分本质是"修后分 − 原片分"的差值判断，而不是绝对分。落到我们的联动策略：**先算原片 aestheticScoreLite，再决定修多少**，修的幅度受原片分数约束（§3）。

来源：https://arxiv.org/pdf/2105.09180v1.pdf （PPR10K）；https://arxiv.org/html/2406.15848 （修后质量对半分档）；https://deepwiki.com/riversky2025/TITFormer/5.1-fivek-srgb-model-(ima-rgb-c) （FiveK Expert C 口径）

### 1.4 轻量替代：LAION-Aesthetics Predictor（"嵌入 + 小多头"范式）

- **结构**：CLIP ViT-L/14 提 768/1024 维图像嵌入 → 一个简单线性层/MLP 头 → 输出 1–10 连续分；训练样本仅 ~4,000 张人工打分图（laion.ai 官方博客）。
- **意义**：证明"冻结大骨干 + 极小评分头"就能得到可用的美学排序；但 CLIP 骨干 ~90M 参数、权重文件数 MB~数十 MB，**不适合单文件离线 PWA**，仅作为"输出契约（1–10 分）"与"分数只做排序、不当物理量"的设计参照。
- NVIDIA NeMo Curator 的公开文档同样用"MLP on CLIP ViT-L/14 embedding → aesthetic_score"作为数据筛选过滤器。

来源：https://laion.ai/blog/laion-aesthetics/ ；https://projects.laion.ai/laion-datasets/laion-aesthetic.html ；https://docs.nvidia.com/nemo/curator/latest/curate-images/process-data/filters/aesthetic ；https://www.kaggle.com/discussions/general/464229

### 1.5 纯 JS 规则近似：`aestheticScoreLite` 怎么搭

公开文献中"不用深度网络"的美学/构图特征全部可在我们已有的 `lumGrid`（亮度网格）+ 信号上计算：

| 规则维度 | 公开方法 | 公开参数区间 | 落到我们的信号 |
|---|---|---|---|
| 三分法交点显著性 | USTC EG10《Optimizing Photo Composition》：3×3 网格四交点 = "power points"，主体应落在交点附近 | 主体显著质心到最近交点的归一化距离 ≤ ~0.15（1/6 画幅内）算"命中" | `sigBox`（显著框）中心 vs (1/3,1/3)(2/3,1/3)(1/3,2/3)(2/3,2/3) 四点取最近距离 |
| 显著区重心 | NJU《Improving Photo Composition Elegantly》：ROT 只对"有明确前景主体"的图评分，先算显著区重心再比交点 | 无主体图（显著区弥散）不计三分分，避免惩罚风光 | `sigBox` 面积占比 <8% 时该维度中性给分 |
| 边缘密度（清晰度代理） | PMC《Photo Composition with Real-Time Rating》：Sobel + 积分图算边缘占比；smartcrop detail 通道：亮度二阶中心差 | 糊片边缘占比低；我们已有闸门 `sharpness<25 → GATE`（实测回归基线） | `sharpness` 信号（0–100） |
| 对称度 | 左右镜像亮度相关（公开构图文献通用） | 相关系数 >0.6 算"对称构图成立"（建筑/倒影类加分） | `sig.sym`（现有信号） |
| 肤色占比 | YCbCr 肤色阈值公开区间：Cb∈[77,127]、Cr∈[133,173]（数字 255 制）；或 RGB 规则 R>95,G>40,B>20,R>G,R>B,|R−G|>15 | 人像肤色占比典型 5%–25% 画幅；<2% 视为无人像 | `skinRatio`（现有信号，YCbCr 已在 analyzePixels 内） |
| 曝光准确 | Lightroom/Camera Raw 公开工作流：曝光偏差用直方图两端裁切衡量 | 正常曝光 mean≈90–170（0–255）；highClip>0.15 过曝、shadowClip>0.30 死黑（现有闸门） | `mean / highClip / shadowClip` |
| 色彩平衡 | 白平衡偏移用 R/B 增益差衡量（OpenRV：±100 量程内独立 R/B 增益） | |wb|>0.10 偏色明显；自然片 sat≈0.15–0.30，sat>0.42–0.45 过饱和（现有闸门） | `wb / sat` |

来源：http://staff.ustc.edu.cn/~renjiec/Composition/paper/EG10_composition-fin.pdf （power points）；http://cs.nju.edu.cn/_upload/tpl/00/bc/188/template188/webs/paperdownload/Improving%20Photo%20Composition%20Elegantly%20Considering%20Image%20Similarity%20During%20Composition%20Optimization.pdf （显著区重心）；https://pmc.ncbi.nlm.nih.gov/articles/PMC7036822/ （Sobel+积分图实时构图）；https://www.iti.gr/~bmezaris/publications/icip15_2_preprint.pdf （9 宫格主体占比）；https://arxiv.org/pdf/1708.02694v1.pdf （HSV/RGB 肤色阈值）；https://journals.riverpublishers.com/index.php/JMM/article/download/12875/14593?inline=1 （YCbCr Pratheepan 阈值）；https://lifeart.github.io/openrv-web/docs/color/primary-controls.html （温度 R/B 独立增益）

**函数签名（纯函数，零像素扫描）：**

```js
aestheticScoreLite(a, sig) → {
  score,            // 0–100（映射 NIMA 1–10 → ×10）
  grade,            // 'A' ≥80 / 'B' 60–79 / 'C' <60
  dims: {
    comp,           // 0–100：sigBox 中心到最近三分交点距离分 + sym 对称分
    exposure,       // 0–100：mean 居中分 − highClip/shadowClip 惩罚
    color,          // 0–100：sat 居中分 − |wb| 惩罚 − 过饱和惩罚
    detail,         // 0–100：sharpness 归一化
    portrait,       // 0–100：skinRatio/personScore 人像分（无人像图中性 70）
  }
}
```

**验收测试写法（对齐 `tests/unit.test.js` 现有 `BASE_A` 夹具风格）：**

| # | 构造输入 | 期望断言 |
|---|---|---|
| T1 | `a=null` / `a={}` / `sigBox` 长度错 | 返回 `score=0, grade='C'` 或守卫生成 GATE 等价分支（对齐现有 `_recommendFilter(null).rule==='GATE'`） |
| T2 | BASE_A 基线（mean=130, sat=0.24, wb=0.005, sharpness=60） | `score∈[60,80]`，`grade='B'`，5 个 dims 均 ∈[0,100] |
| T3 | 显著框中心挪到 (1/3, 1/3) 交点 vs 挪到 (0.9,0.9) 角落 | 前者 `dims.comp` 比后者高 ≥15 分 |
| T4 | `sharpness=18`（糊片） | `dims.detail<30`，总分较基线降 ≥20 分 |
| T5 | `highClip=0.30`（过曝） | `dims.exposure<40`，总分较基线降 ≥15 分 |
| T6 | 入参深比较前后不变（同现有"无副作用"用例） | `JSON.stringify(a)` 调用前后相等 |

---

## 2. 滤镜色彩科学：LUT 原理、HSL 调整、胶片模拟曲线与 canvas 成本

### 2.1 LUT 查找表原理（1D vs 3D）

- **1D LUT**：输入值 → 输出值的一维映射表，每通道独立。能力边界：只能调亮度/对比度/通道增益，**不能做色相偏移、不能"动一种颜色不动另一种"**（Light Illusion / Luttie 公开文档）。
- **3D LUT**：把 (R,G,B) 三元组当作三维颜色立方体坐标，每个晶格点存一个输出 (R,G,B)；典型采样密度 17³ / 33³ / 65³。输出用**三线性插值**（取包围输入点的 8 个最近晶格点加权）。能力：色相偏移、按色相区间调色、胶片模拟的核心载体（ACES CLF 规范 / OpenRV / LUTCalc 公开文档）。
- **成本量级**：17³ = 4,913 个晶格点 ≈ 14 KB（Uint8）；每像素 8 次查表 + 7 次插值混合，约 15–20 次浮点运算。

来源：https://lightillusion.com/what_are_luts.html ；https://luttie.app/blog/what-is-a-lut-file ；https://docs.acescentral.com/clf/specification/ （LUT3D 三线性插值规范）；https://lifeart.github.io/openrv-web/docs/guides/lut-system.html ；https://deepwiki.com/cameramanben/LUTCalc/1.1-what-is-a-lut

### 2.2 色温 / 色调 / 饱和度 / 对比度的 HSL 调整（公开公式区间）

| 操作 | 公开公式 / 区间 | 来源 |
|---|---|---|
| 对比度 | `out = (px − 0.5)·c + 0.5`，c∈[0,2]，默认 1.0；胶片风 c≈1.05–1.15 | https://lifeart.github.io/openrv-web/docs/color/primary-controls.html ；https://onlinephototools.com/image-tools/image-cinestill-800t-filter-effect-tool/ （默认 contrastFactor=1.1） |
| 饱和度 | `out = Y + (px − Y)·s`，Y = 0.2126R + 0.7152G + 0.0722B（亮度保持的灰度混合）；自然修图 s 微调到 1.05–1.15 | https://dev.to/toolzip/image-adjustment-in-the-browser-brightness-contrast-saturation-without-libraries-5f51 ；https://blog.logrocket.com/how-to-manipulate-css-colors-with-javascript-fb547113a1b8 |
| 色相旋转 | RGB 空间用角度 θ 旋转：`(R,G,B)` 绕灰度轴旋转；sharp 库公开参数 `hue` = 旋转角度（度） | https://sharp.pixelplumbing.com/api-operation/ |
| 色温 Temperature | OpenRV 公开量程 ±100，实现 = 独立 R/B 通道增益、G 保持不变；日光基准 5500–6500K，钨丝灯 3200K | https://lifeart.github.io/openrv-web/docs/color/primary-controls.html ；https://shuttercoach.app/learn/how-to-edit-photos-for-beginners/ ；https://learn.adobe.com/uk/lightroom-classic/help/image-tone-color.html |
| 色调 Tint | 绿/品红轴补偿，公开工作流中幅度远小于色温，建议 ±5 以内 | https://dreamshootai.com/blog/color-correct-image （HSL 只轻动） |

### 2.3 胶片模拟的色彩曲线（橙青分离 / 暗角 / 颗粒）

公开教程给出的可量化配方区间（Lightroom/Photoshop 口径）：

| 胶片元素 | 公开参数区间 | 来源 |
|---|---|---|
| 橙青分离（阴影） | Shadows：hue ≈ 190–210（青/蓝绿），saturation ≈ 20–40（浓烈版）或 8–12%（克制版） | https://www.pixelbubble.com/posts/teal-and-orange-why-this-color-grade-dominates-social-media/ ；https://markus-hagner-photography.com/how-to-apply-split-toning-and-color-grading-to-create-a-film-look-in-your-photos/ |
| 橙青分离（高光） | Highlights：hue ≈ 30–45（橙/琥珀），saturation ≈ 15–30 | 同上 |
| 曲线实现法 | Blue 通道阴影端上抬（阴影加蓝）、高光端下拉（高光去蓝变暖）；Red 通道高光轻抬 | https://photoshoptutorials.tv/tutorials/color-grading-curves-photoshop/ ；https://photoshop-guides.info/article/how-to-create-cinematic-color-grade-photoshop |
| 暗角 Vignette | Amount ≈ −15…−40（负值压暗四角），Midpoint +20…+40，Feather/Roundness 50–70 | https://gurfoto.ru/school/articles/a-cinematic-portrait-in-photoshop/ ；https://brownz.art/tag/analoge-asthetik/ ；https://helpx.adobe.com/uk/photoshop/using/correcting-image-distortion-noise.html |
| 颗粒 Grain | Amount 15–40、Size 20–30、Roughness 40–60；高斯噪声 σ ≈ 5（细微）/ 25（明显）/ 50（重口）；胶片工具默认 grain=15 | https://www.aiarty.com/edit-photo/add-grain-in-photoshop.htm ；https://pixotter.com/blog/add-grain-to-photo/ ；https://onlinephototools.com/image-tools/image-cinestill-800t-filter-effect-tool/ |

### 2.4 canvas / ImageData 上做 3×3 矩阵 + 曲线的成本

- ImageData 内存布局 = `Uint8ClampedArray`，长度 = H×W×4，RGBA 交错（MDN 公开文档）。
- 性能实测区间：**100,000 像素直接写 Uint8ClampedArray ≈ 4 ms/帧**；同量级用 `fillRect` 逐点写 ≈ 40 ms/帧（慢约 40 倍）——即"一次性 getImageData → 内存循环 → putImageData"是唯一正确姿势。
- 重操作的反面教材：CPU 上做半径 5 的盒式模糊，1920×1080 ≈ 2.3 亿次运算、200–500 ms，实时不可用。
- **我们的预算结论**：分析（美学评分/显著/边缘）跑在 ≤320px 缩略图（≈10 万像素 → <5 ms）；滤镜预览跑在 ≤720p；颗粒/模糊这类邻域操作在缩略图上预计算或降级为 256 项查表曲线（逐像素独立、无邻域依赖，天然 O(n)）。

来源：https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Pixel_manipulation_with_canvas ；https://www.mysimulator.uk/blog/tip-canvas-2d-performance.html （10 万像素 4ms vs 40ms）；https://joanleon.dev/en/webgpu-image-processing/ （CPU 模糊 200–500ms 量级）；https://blog.csdn.net/weixin_42659252/article/details/165497445 （小图主线程直算 <5ms 优于开 Worker）

---

## 3. 评分与滤镜的联动：高分保原味 vs 低分怎么救

### 3.1 公开修图工作流的共识顺序

公开专业修图教程（Adobe / Neurapix / DreamShootAI 等）的固定工序：**白平衡（色温/色调）→ 曝光（高光/阴影/白色/黑色）→ 对比/曲线 → HSL 细调色相 → 分离色调 → 暗角/颗粒收尾**。每一步都有"少即是多"的幅度上限。

### 3.2 高分照片（grade='A'，score≥80）：保原味，只做微增强

- 公开口径：原片已经准确时，加风格化滤镜反而破坏已经成立的色彩关系；只允许"中性化 + 5–10% 微增强"。
- 落到我们：`grade='A'` → `_recommendFilter` 输出 `rule='NONE'`（与现有"曝光准确色温中性日常照 → NONE"用例 N1 一致），如需推荐则只允许"微增强型"参数：contrast 1.05、sat 1.05、色温 ±0、暗角 0。
- 现有证据：`filter N1/N2/N9/N10/N13` 全部对"本来就准"的图输出 NONE，说明现有规则已经隐式体现了这条原则，只是没有一个"总分"来统一它。

### 3.3 低分照片（grade='C'，score<60）：先救技术分，再谈风格

按公开工作流的顺序与公开幅度区间：

| 缺陷信号（现有闸门） | 救援动作 | 公开幅度区间 |
|---|---|---|
| 欠曝 mean<60（或 shadowClip>0.30 死黑） | 抬阴影（shadow lift） | +10–20%（公开修图区间），对比再 +10–15% |
| 过曝 highClip>0.15 | 压高光 | −10–15%，不建议硬拉回死白（现有 GATE 已拒推艺术滤镜，先救曝光） |
| 偏色 \|wb\|>0.10 | 白平衡中性化（R/B 增益回中） | 色温回摆到中性基准，幅度 = \|wb\| 全量回中 |
| 发灰 sat<0.10 或 contrast 偏低 | 补对比再补饱和 | contrast +10–15% → sat +10–15%（先对比后饱和，公开顺序） |
| 肤色发闷（skinRatio 高但 mean 低） | 中性化优先于加饱和 | 公开口径："肤色从中性化受益大于从饱和度提升受益" |
| 糊片 sharpness<25 | 不救，GATE（现有规则） | 锐化救不回失焦，公开口径一致 |

来源：https://dreamshootai.com/blog/color-correct-image （白平衡先行、HSL 轻动、肤色中性化>加饱和）；https://neurapix.com/blog/get-it-right-in-lightroom-classic-practical-color-correction-workflow （工序顺序与显示环境基准）；https://learn.adobe.com/uk/lightroom-classic/help/image-tone-color.html （Temp/Tint 工序）；https://photoshoptutorials.tv/tutorials/color-grading-curves-photoshop/ （曲线微调幅度"visible but not cartoonish"）

### 3.4 落到现有推荐器的改造点

```
_recommendFilter(a, sig) 现状：硬闸门(GATE) + 6 条场景规则(R1–R4)
改造：先调 aestheticScoreLite(a, sig) 得 {score, grade}
  ├─ grade='A' → 场景规则只允许 NONE / 微增强，禁止 portrait-* 强风格
  ├─ grade='B' → 维持现有 R1–R4 场景规则（含现有 6 款滤镜）
  └─ grade='C' → 先出 rescue 建议（wb→shadow→contrast→sat 参数链），
                 场景强风格滤镜（sunset/portrait-mono）降级或不推
```

---

## 4. 汇总表与下一版优先级

### 4.1 评分维度 × 权重表（aestheticScoreLite 建议默认权重）

| 维度 | 信号来源 | 权重 | 公开依据 |
|---|---|---|---|
| 构图 comp | `sigBox` 中心 vs 三分交点距离 + `sig.sym` | 0.25 | EG10 power points；NJU 显著区重心 |
| 曝光 exposure | `mean` 居中度 − `highClip`/`shadowClip` 惩罚 | 0.25 | Camera Raw 直方图两端裁切工作流；现有 GATE 阈值 |
| 色彩 color | `sat` 居中度 − `|wb|` 惩罚 − 过饱和惩罚 | 0.20 | OpenRV 温度 R/B 增益；现有 sat>0.42 闸门 |
| 细节 detail | `sharpness` 归一化 | 0.20 | PMC Sobel 边缘占比；现有 sharpness<25 闸门 |
| 人像 portrait | `skinRatio` + `personScore`（无人像图中性 70 分） | 0.10 | YCbCr 肤色区间；PPR10K 人像修图任务族 |

> 权重校准原则：五个维度各出 0–100 分，加权和即 score；先用上表默认值上线，再按真实相册回放数据微调——公开文献中这类规则权重的可信区间本身就是 ±0.05 量级。

### 4.2 滤镜 × 适用场景表（现有 6 款 + 救援链，按 score 档分流）

| 滤镜 / 模式 | 适用 score 档 | 触发信号（现有规则） | 公开色彩参数锚点 |
|---|---|---|---|
| NONE（原片） | A（≥80） | 曝光准 + 色温中 + sat 0.15–0.30 | 微增强 contrast 1.05 / sat 1.05 |
| rescue-natural（救援链，建议新增） | C（<60） | 欠曝/过曝/偏色/发灰 | wb 回中 → shadow +10–20% → contrast +10–15% → sat +10–15% |
| night | B | mean 70–84 + lightScore≥0.4 + brightRatio≥0.2 | 暗部抬升 + 轻微暖色 |
| portrait-warm | B | skinRatio≥0.12 + personScore≥0.8 + wb≥0.051 + mean≈140 | 高光暖偏 hue 30–45 |
| portrait-cool | B | personScore≥0.7 + wb≤−0.06 + mean≥120 | 阴影冷偏 hue 190–210 的克制版（sat 8–12%） |
| portrait-mono | B | 半侧光（lumGrid 左右 2.5:1）+ 人像证据 | 去饱和 + 对比 1.1 |
| mono | B | sat≤0.02 纯灰 | 灰度 + 对比 1.1 |
| sunset | B（C 档降级） | warmRatio≥0.5 + wb≥0.08 + landscape 无人 | 橙高光 + 青阴影分离（sat 20–30 区间） |

### 4.3 本 PWA 下一版最该先做的 3 项（按投入产出排序）

1. **`aestheticScoreLite(a, sig)` 纯函数 + 单测**（投入最小、收益最大）。零像素扫描，只汇总现有 `analyzePixels` 信号；把现有散落的 GATE 阈值（sharpness<25 / highClip>0.15 / shadowClip>0.30 / sat>0.42 / mean<40）统一成一个 0–100 分 + A/B/C 档；测试直接复用 `tests/unit.test.js` 的 `BASE_A` 夹具与"入参无副作用"断言模式。
2. **rescue-natural 救援链参数化**（把"低分怎么救"从口头规则变成可测函数）。新纯函数 `rescuePlan(a) → {wbGain, shadowLift, contrast, satBoost}`，每档参数落在 §3.3 公开区间内；`_recommendFilter` 在 grade='C' 时优先返回它；验收用例：欠曝图 → shadowLift∈[0.10,0.20]、偏色图 → wbGain 回中、过饱和图 → satBoost≤0（禁止再加饱和）。
3. **橙青分离 + 暗角的查表化原型**（为胶片风格打地基，先不追求 3D LUT）。用 256 项 ×3 通道曲线表（阴影 hue 190–210 / sat 20–40、高光 hue 30–45 / sat 15–30、暗角 amount −15…−40），在 ≤320px 分析图上验证视觉区间；真要做 3D LUT 时再上 17³ 晶格三线性插值（≈14KB、逐像素 8 次查表），不进首版。

---

## 附：本文未做的事（边界声明）

- 未实现任何模型权重加载/推理（单文件离线约束下不落地 NIMA/MUSIQ/CLIP）。
- 未修改 `pure-functions.js` / `index.html` 任何源码；本文仅为研究结论，改造点在 §3.4/§4.3 列为待办。
- "DPR (Dampf et al.)"未检索到严格同名公开论文，已按公开可查的修图评分任务族（FiveK / PPR10K / 质量导向修图）对标，未虚构引用。
