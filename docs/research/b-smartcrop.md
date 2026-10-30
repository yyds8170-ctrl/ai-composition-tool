# 内容感知裁切（content-aware crop）算法调研：显著性、搜索打分与美学评分

> 调研日期：2026-10-19
> 调研性质：多轮公开资料学习研究，全部自研方案；仅参考公开通用原理、学术论文与 MIT/BSD 许可的公开参考实现中的公开参数设计，不涉及任何第三方产品的界面、文案或实现细节。
> 调研对象：为本地单文件 PWA 的纯 JS 裁切引擎（已有 `_lumGrid` 亮度网格、`_edgeEnergy` 边缘能量、行/列 RoD 前缀和、三护栏）提供"可量化规则"来源。本文不引入任何开源库，只沉淀可自行推导实现的公式、权重区间与验收断言。
> 术语约定：本文"裁剪框"= `{x, y, w, h}`（归一化 0~1 或像素坐标，函数层统一用归一化）；"显著性图"= 与缩略网格同尺寸的 `Float32Array`。

---

## 0. 结论先行（TL;DR）

1. **smartcrop.js 的范式（显著性叠加 → 穷举候选框 → 重要性掩码打分 → 取最高分）是本 PWA 下一步最划算的升级**。我们已有的 `_lumGrid` / `_edgeEnergy` 正好对应它的 detail 通道，缺的只是"饱和度通道 + 候选框枚举 + importance 掩码打分"这三层薄逻辑，全部是 O(n) 纯函数。
2. **经典显著性三巨头里，纯 JS 网格上唯一零依赖落地的是谱残差（Spectral Residual）**：一张 64×64 灰度图的二维 FFT ≈ 几万次复数运算；Itti-Koch 要 45 张多尺度特征图，GBVS 要在图上跑马尔可夫平衡分布，两者在网格实现上都远重于收益，仅作原理储备。
3. **深度美学评分（NIMA/MUSIQ）在本 PWA 不落地**（需要卷积/Transformer 权重文件，违反单文件离线约束），但它"输入整图、输出 1~10 标量分布"的任务定义，可以用四条规则近似：边缘密度占比、三分交点显著质量、对称度、裁剪内饱和度均值——这正是 GAIC/FCDB 文献里"生成候选→打分排序"范式的轻量版。
4. **评测口径要先立起来再写代码**：FCDB 上"不裁切"基线 IoU≈0.638、"居中裁 90%"基线≈0.665（公开论文实测），这就是我们纯函数版要对标的及格线；IoU 之外还要算 BDE（边界位移误差）与 boundary recall（边界召回）。
5. **CPC 的公开口径需要修正**：公开论文中 CPC = **Comparative Photo Composition**（Wei et al., CVPR 2018 "Good View Hunting"，10,797 图 × 24 候选视角 × 6 人工两两排序，>100 万对比较标注），并非"Deng et al. 2018"；Deng 2018 的公开工作是 ACM MM 的对抗式美学增强，与裁切数据集无关。本文按公开论文口径描述。

---

## 1. smartcrop.js：显著性叠加 + 候选框穷举打分

### 1.1 原理

公开 MIT 参考实现（jwagner/smartcrop.js，参数为公开常量，非私有逻辑）的管线是四步：

1. **预缩放**：先把图压到最长边 ≤256px 再分析（`prescale = min(max(256/w, 256/h), 1)`），后续全部在小图上做，天然 O(n)。
2. **三通道显著性图**（同一张 RGBA 网格的三个通道各存一路）：
   - **detail 通道（边缘）**：拉普拉斯式二阶中心差 `4·L(x,y) − L(x−1,y) − L(x+1,y) − L(x,y−1) − L(x,y+1)`（边界处退化为单点采样），即亮度的二阶导数，等价于我们 `_edgeEnergy` 的网格版。
   - **skin 通道（肤色）**：亮度落在 `[0.2, 1.0]` 且归一化 RGB 向量与参考肤色向量 `(0.78, 0.57, 0.44)` 的"距离相似度"超过阈值 0.8 的像素，按 `(相似度 − 0.8)/(1 − 0.8)` 线性拉伸到 0~255。
   - **saturation 通道**：HSL 式饱和度 > 0.4 且亮度落在 `[0.05, 0.9]` 的像素，按 `(sat − 0.4)/(1 − 0.4)` 拉伸。
3. **候选框枚举**：目标画幅固定，scale 从 `maxScale` 以 0.1 步长递减，x/y 从 0 以 8px 步长滑动，凡能放下的矩形全部入列。256×256 图 + 1 个目标画幅时，候选框数量在百~千量级。
4. **逐框打分**：在框内按 8 步长抽样，每个抽样点乘一个 importance 权重再累加；总分除以框面积归一化，取最高。

### 1.2 可量化规则（公开参数区间）

| 参数 | 公开参考值 | 自研建议区间 |
|---|---|---|
| prescale 上限 | 最长边 256px | 256~320px（我们网格已是 48×48 级，直接复用） |
| detail 权重 `detailWeight` | 0.2 | 0.15~0.3 |
| skin 权重 `skinWeight` | 1.8 | 1.0~2.0（人像场景开到 2.0，风光降到 0.5） |
| saturation 权重 `saturationWeight` | 0.1 | 0.05~0.2 |
| skin 相似度阈值 | 0.8（亮度窗 [0.2,1.0]，bias 0.01） | 0.75~0.85 |
| saturation 阈值 | 0.4（亮度窗 [0.05,0.9]，bias 0.2） | 0.35~0.45 |
| 边框惩罚 `edgeWeight` | −20.0，`edgeRadius` 0.4 | −15 ~ −25；radius 0.3~0.5 |
| 框外重要度 `outsideImportance` | −0.5 | −0.3 ~ −0.6（裁掉的区域也"扣分"） |
| importance 中心项 `s` | `1.41 − √(px²+py²)`，px/py ∈ [0,1] 为到中心归一化距离 | 系数 1.2~1.5 可调 |
| 三分法加成 | 命中 1/3、2/3 线时 `+ max(0, s+d+0.5) × 1.2 × thirds(px)×thirds(py)`，`thirds()` 是宽度约 1/16 的二次高斯 bump | bump 宽度 1/12~1/20 |
| 搜索步长 | step=8px，scaleStep=0.1，scoreDownSample=8 | 网格上 step 取 1~2 格，scale 档 5~8 档 |

关键点：**`outsideImportance = −0.5` 是被很多实现漏掉的一招**——打分时框外像素按 −0.5 计入，等于"框外显著性越高、这个框越差"，与我们 RoD 前缀和保护背景是同一思想的反向用法。

### 1.3 落到哪个纯函数

```
enumerateCropCandidates({ imgW, imgH, aspectW, aspectH,
                         scales=[1, .9, .8, .7], stepFrac=0.03 })
  → Array<{ x, y, w, h }>          // 归一化坐标，全部能放下的框

importanceAt({ crop, nx, ny })      // nx/ny ∈ [0,1] 图上归一化坐标
  → number                          // <0 表示框外；中心最高、边缘平方衰减、三分线 bump

scoreCropCandidate({ crop, sal, edge, sat, w, h, weights })
  → { detail, skin, sat, total }    // total = (0.2·detail + 1.8·skin + 0.1·sat) / (crop.w·crop.h)
```

`sal/edge/sat` 都是同尺寸 `Float32Array`，与现有 `_lumGrid`/`_edgeEnergy` 同构；`weights` 从 §1.2 表取默认值。

### 1.4 验收测试草案（输入像素特征 → 期望裁剪边断言）

| # | 构造输入（合成小网格） | 期望断言 |
|---|---|---|
| T1 | 256×192 灰底，中央 96×96 高边缘方块，目标 1:1 | topCrop 的 x/y 落在方块外接框 ±8px 内，w/h 接近 192（贴高） |
| T2 | 同 T1，但方块挪到左下三分交点 | topCrop 中心落在方块中心，且不再是图几何中心（importance 中心项被三分 bump 拉偏） |
| T3 | 满屏均匀纹理（detail 处处相等）+ 无肤色无饱和 | topCrop 退化为居中框（Baseline_C 行为），total 差异 <2% |
| T4 | 主体块之外，四边各有一条高饱和色带 | topCrop 不得把色带切到只剩 <30%（outsideImportance 生效）；四条单边裁切比例均 <40% |
| T5 | 高边缘主体在 y>0.8 底部，上方 60% 为空白天空 | 目标 16:9 横裁时，下边框 ≥0.85（主体不被切脚），上边框 ≤0.4 |

---

## 2. 经典显著性检测三法：Itti-Koch / 谱残差 / GBVS

### 2.1 Itti-Koch（1998，中心-环绕）

**原理**：模拟灵长类视觉——建高斯金字塔（尺度 σ=0..8），对亮度、颜色(RG/BG 对抗对)、朝向(Gabor 4 方向)三类特征做**多尺度中心-环绕差分**：中心 c∈{2,3,4}，环绕 s=c+δ，δ∈{3,4}，共 6 组差分；得到 9 张亮度 + 12 张颜色 + 24 张朝向 = **45 张特征图**，逐图做全局归一化 N()（压平均、突峰值），跨尺度相加合成 3 张 conspicuity map，再加权平均为最终显著图。

**可量化规则**：差分尺度差固定为 3~4 个八度；输入先缩到最长边 ≤640px；N() 操作为 `(max − mean)²` 式强调。复杂度 O(n·45·k)，k 为小卷积核——但 45 张图 + 金字塔在纯 JS 里是数千行级实现。

**落到哪个纯函数**：不直接落地。其"多尺度差分"思想已被 `_edgeEnergy` 的多尺度边缘近似覆盖。可借的一条规则：**中心-环绕 = 中心块均值与外环均值之差**，可用我们的 RoD 前缀和 O(1) 算出，作为 `centerSurroundContrast({lumGrid, cx, cy, rIn, rOut}) → number` 的辅助校验函数（用于"地平线居中误判"护栏）。

**验收测试**：

| # | 输入 | 断言 |
|---|---|---|
| T1 | 均匀灰底 | centerSurroundContrast ≈ 0（±0.02） |
| T2 | 中央亮块、四周暗 | 对比值 > 0.3 |
| T3 | 全图渐变无突变 | 对比值 < 0.15 |

### 2.2 谱残差（Spectral Residual, Hou & Zhang, CVPR 2007）

**原理**：自然图的 log 幅度谱在去掉局部平滑成分后是"平滑的先验"，剩下的残差就是新奇区域。流程：灰度缩到 **64×64** → 二维 FFT → `L = log|F|` → `R = L − averageFilter(L, 3×3)` → 用原相位 `φ` 重建 `S = gaussianBlur( |IFFT(R·e^{iφ})|² )`。后续 PQFT（2008）证明**只用相位谱**也能得到几乎等价的显著图。

**为什么它是最易落地的**：FFT 是 O(N log N)，N=4096 个像素点 ≈ 4096×12 ≈ 5 万次复数乘加，在 JS 里跑 64 点一维 FFT（行列分离两次）仅几毫秒；不需要任何金字塔、不需要迭代。复杂度真正 O(n)（n=网格像素数）。

**可量化规则**：网格尺寸 64×64（或与我们 48×48 网格对齐）；残差平均核 3×3；重建后高斯模糊 σ≈1~2；输出平方后再归一化到 0~1。

**落到哪个纯函数**：

```
spectralResidualMap({ lumGrid, gw, gh }) → Float32Array(gw*gh)
// 内部：自实现 64 点 radix-2 复数 FFT（gw/gh 取 2 的幂，不足补零）
```

**验收测试**：

| # | 输入（64×64 合成图） | 断言 |
|---|---|---|
| T1 | 纯均匀灰图 | 输出均值 <0.05，无局部峰 |
| T2 | 中央 16×16 白斑、其余灰 | 显著质量心落在白斑外接框 ±4px |
| T3 | 左半亮右半暗阶梯 | 峰值沿分界线带状分布，不在图中心 |
| T4 | 周期条纹纹理（人造图案） | 输出几乎全平（残差法对周期图案本征不敏感）——用于区分"真主体"与"纹理背景" |

### 2.3 GBVS（Harel et al., NIPS 2006）

**原理**：特征图上建全连接图，边权 = 像素特征差异 × 距离衰减 `D(p,q)/dist(p,q)`，行归一化成马尔可夫转移矩阵，**求平衡分布（主特征向量）**作为激活图；通道间再融合。论文实测在人类注视预测上 ROC 达人类对照的 98%，优于 Itti-Koch 的 84%。

**可量化规则**：图节点 = 网格点；连接半径 ~2 格；平衡分布 = 转移矩阵迭代收敛（幂法 50~100 次）。

**落到哪个纯函数**：**不落地**。矩阵规模 = 网格点数（32×32=1024 节点），每次迭代是 O(n²) 乘法 + 归一化，收益与 Itti 相当但更慢；仅在"显著图融合"思想上借用其结论——**通道间融合用简单等权平均即可，不需要图模型**。

### 2.4 三法横向结论

| 方法 | 纯 JS 实现量 | 复杂度 | 对本 PWA 的价值 |
|---|---|---|---|
| Itti-Koch | 大（45 图+金字塔） | O(n·45·k) | 仅借"中心-环绕"单条规则 |
| **谱残差** | **中（自写 64 点 FFT）** | **O(N log N)，N=4096** | **可落地，作第二路显著图与 `_lumGrid` 交叉校验** |
| GBVS | 很大（矩阵幂迭代） | O(n²·iter) | 不落地 |

---

## 3. 美学评分：深度方法（NIMA / MUSIQ）与轻量规则近似

### 3.1 NIMA（Talebi & Milanfar, ECCV/TIP 2018）

**输入输出**：输入 224×224 RGB 整图；骨干为 VGG/Inception/MobileNet 类预训练网络微调；输出不是单分，而是 **10 维 softmax 分布（评分 1~10 的概率）**；最终分 = `Σ i·p_i`（期望分）。训练损失为 EMD（推土机距离），使预测分布贴近人工打分分布；**美学模型**在 AVA（~25 万图、每图 ~200 人打分）上训练，**技术质量模型**在 TID2013 上训练，两个模型分开。

**对本 PWA 的意义**：任务定义可借鉴——**对"候选裁剪框"逐个算美学分再排序**，而不是直接预测坐标；这正是 smartcrop.js 打分层、以及 GAIC/FCDB 文献一致的范式。但权重文件无法进单文件，故不实现模型。

### 3.2 MUSIQ（Ke et al., ICCV 2021）

**输入输出**：无参考质量评估 Transformer：多尺度原生分辨率图像块 → ViT 编码器（轻量配置，参数量级对标 ResNet-50）→ 输出单一质量标量；创新点是 hash 二维空间位置编码 + 尺度嵌入，支持任意宽高比与原生分辨率输入。

**对本 PWA 的意义**：与裁切直接相关的启示是——**同一内容在不同尺度下质量感受不同**，对应我们搜索时"多 scale 档分别打分再取全局最优"是对的；而非只裁一个固定比例。

### 3.3 轻量规则近似（自研四条，替代深度美学头）

| 规则 | 公式（可量化） | 作用 |
|---|---|---|
| 边缘密度占比 | `edgeDensity = E_inside / (E_inside + E_outside)`，E 为 `_edgeEnergy` 在框内/框外求和 | 高分框应把"有信息区域"装进来（≈ RoD 的正向版） |
| 三分交点显著质量 | 在 4 个三分交点 ±1/16 容差窗口内采样显著性求和，记 `thirdsHit` | 命中交点加分，0.1~0.3 权重 |
| 对称度 | `symmetry = 1 − mean(|左半 − 镜像右半|)/灰度量程`；纵/横各算一次 | symmetry > 0.8 → 触发居中约束、禁偏心裁（保护倒影/建筑） |
| 裁剪内饱和度均值 | `satMean(crop)` 与全图均值比 | 高饱和主体（美食/花）所在框加分；同时是暖霞误判护栏的输入 |

**落到哪个纯函数**：

```
aestheticScoreLite({ crop, lumGrid, edgeGrid, satGrid, w, h })
  → { score, edgeDensity, thirdsHit, symmetryH, symmetryV, satMean }
// score = 0.4·edgeDensity + 0.25·thirdsHit + 0.2·satRatio + 对称惩罚项
```

它是 `scoreCropCandidate` 的"第二裁判"：smartcrop 式 total 选 top3 候选后，用这个 score 做 tie-break。

**验收测试**：

| # | 输入 | 断言 |
|---|---|---|
| T1 | 主体在三分交点、背景空白 | thirdsHit > 0.3；居中框的 aestheticScoreLite 比交点框低 >10% |
| T2 | 左右完全镜像对称图 | symmetryV > 0.9；偏心裁候选被对称惩罚项压过 |
| T3 | 框内边缘能量占比 80% vs 另一框 40% | 前者 score 更高 |
| T4 | 高饱和美食占框 70% | satMean 比值 >1.3 时候选不被护栏误杀 |
| T5 | 全平灰图 | edgeDensity≈0.5、thirdsHit≈0 → score 全部相等，回退居中框 |

---

## 4. CPC 与 FCDB：标注口径与评测指标

### 4.1 CPC = Comparative Photo Composition（Wei et al., CVPR 2018）

公开口径（按论文"Good View Hunting: Learning Photo Composition from Dense View Pairs"）：

- **10,797 张图**，每张自动生成 **24 个候选视角**（4 种标准宽高比 × 6 个候选框）；
- 每个视角对由 **6 名 AMT 工人两两投票**排序，得到 **>100 万对比较标注**；
- 训练的是**排序模型**（pairwise/listwise ranking），不是直接回归坐标——再次印证"生成候选→排序"范式。
- 注：此前需求描述中的"Cropping Prediction / J. Deng et al. 2018"与公开论文不符，本文按 Wei et al. 2018 口径记录。

### 4.2 FCDB = Flickr Cropping Dataset（Chen et al., WACV 2017）

公开口径（yiling-chen.github.io/flickr-cropping-dataset）：

- 从 Flickr 采集 31,888 张 → 人工筛掉拼图/合成图/带框图 → 最终 **3,413 张 CC 许可图**；
- 标注两层：① **每张图 1 个"最佳裁剪框"**（摄影爱好者标注、AMT 投票保留高分框），存于 `cropping_training/testing_set.json`，格式为 `crop=[x, y, x2, y2]`；② **每张图 10 对裁剪两两偏好投票**（`ranking_annotation.json`，vote_for_0/1）。
- 后续文献（CACNet 起）普遍采用 **1,395 train / 348 test** 的子集划分。

### 4.3 评测指标（纯函数可算）

| 指标 | 定义 | 公开基线参考值（FCDB test） |
|---|---|---|
| **IoU** | `|pred ∩ gt| / |pred ∪ gt|` | 不裁切 Baseline_N ≈ **0.638**；居中 90% Baseline_C ≈ **0.665**；早期学习式模型 ≈ 0.60~0.68 |
| **BDE**（Boundary Displacement Error） | 预测框 4 条边到 GT 对应边的平均像素位移 | 越小越好；无公开通用及格线，相对比较即可 |
| **Boundary Recall** | GT 边界像素中，落在预测边界 ε 邻域（ε≈对角线 1%~2%）内的比例 | 越高越好 |
| （进阶）Acc@N / SRCC | 对全候选集打分排序的排序质量（GAICD 口径） | SRCC 0.735 为公开强基线 |

**关键启示**：IoU 对"差一点的框"过于宽容（论文图示：美学更差的框 IoU 反而更高），所以验收时 **IoU + BDE 必须成对看**；且纯函数版若连"不裁切 0.638"都跑不过，就是规则有 bug 而不是算法不行。

### 4.4 落到哪个纯函数

```
compareCropToGT({ pred:{x,y,w,h}, gt:{x,y,w,h}, imgW, imgH })
  → { iou, bde, boundaryRecall }
```

这是验收测试的断言计算器：把 T1~T5 的"期望裁剪边"写成 GT，自动算三指标。

---

## 5. 实现成本 / 收益对比表

| 方法 | 实现量（纯函数 LOC 估） | 运行耗时（256 网格） | 直接收益 | 风险 |
|---|---|---|---|---|
| **候选框枚举 + importance 打分（smartcrop 范式）** | ~150 | <5ms | 从"固定边"升级为"按内容选框"，最大收益 | 低，全部复用现有网格 |
| **轻量美学 scoreLite（四规则）** | ~120 | <3ms | top3 候选 tie-break，显著降低"裁对位置但裁错氛围" | 低 |
| 饱和度通道 | ~40 | <1ms | 美食/花/暖霞主体加分，补齐现有三通道 | 低 |
| 谱残差显著图 | ~200（含 64 点 FFT） | 3~8ms | 第二路显著图，与 lumGrid 交叉，抗"纹理误判" | 中，FFT 需自测数值稳定 |
| Itti-Koch 完整版 | ~800+ | 50ms+ | 边际增益（多尺度已被 edgeEnergy 覆盖） | 高，不建议 |
| GBVS | ~600+（矩阵幂迭代） | 100ms+ | 同上 | 高，不建议 |
| NIMA / MUSIQ | 模型权重无法进单文件 | — | — | 约束不允许 |
| IoU/BDE/boundaryRecall 指标函数 | ~60 | <1ms | 验收可回归 | 低 |

---

## 6. 推荐下一步（先做 1~2 个）

**第一批（本周可落地，两个纯函数 + 一个指标函数）：**

1. **`enumerateCropCandidates` + `scoreCropCandidate`（§1）**：把现有"单一裁切边"升级为"候选框打分"。权重取 §1.2 区间中值，skinWeight 在无人像检测时置 0.5。
2. **`aestheticScoreLite`（§3.3）**：作为 top3 候选的 tie-break，并输出 symmetry 直接喂给现有"对称居中护栏"。

**第二批（验证收益后再做）：**

3. **`compareCropToGT` 指标函数 + 10~20 组合成测试图库**：用 §4.3 基线值（IoU≥0.64 起步、≥0.67 及格）做回归门槛。
4. **谱残差 `spectralResidualMap`**：仅当第一批上线后仍有"纹理背景误判主体"的失败案例再引入。

**明确不做**：Itti-Koch 完整版、GBVS、NIMA/MUSIQ——纯 JS 成本与收益不匹配，且与单文件离线约束冲突。

---

## 7. 公开资料来源

- smartcrop.js 公开参考实现（MIT 许可，公开参数常量）：https://github.com/jwagner/smartcrop.js ，CDN 镜像 https://cdn.jsdelivr.net/npm/smartcrop@2.0.3/smartcrop.js
- Itti, Koch, Niebur, "A Model of Saliency-Based Visual Attention for Rapid Scene Analysis", PAMI 1998：https://hasler.ece.gatech.edu/Courses/MachineLearning/FoundationalPapers/Itti_Koch_Neiber1998.pdf （Princeton 存档副本 http://www.cs.princeton.edu/courses/archive/spring08/cos598B/Readings/IttiKochNiebur1998.pdf ）
- Hou & Zhang, "Saliency Detection: A Spectral Residual Approach", CVPR 2007（作者主页）：http://www.houxiaodi.com/publication.html ；实现流程参考 Frontiers 2014 综述 https://www.frontiersin.org/journals/computational-neuroscience/articles/10.3389/fncom.2014.00147/full
- Harel, Koch, Perona, "Graph-Based Visual Saliency", NIPS 2006：http://papers.neurips.cc/paper/3095-graph-based-visual-saliency.pdf
- Talebi & Milanfar, "NIMA: Neural Image Assessment", 2018：https://arxiv.org/html/1709.05424v2
- Ke et al., "MUSIQ: Multi-scale Image Quality Transformer", ICCV 2021：https://arxiv.org/pdf/2108.05997v1 （附录 https://www.openaccess.thecvf.com/content/ICCV2021/supplemental/Ke_MUSIQ_Multi-Scale_Image_ICCV_2021_supplemental.pdf ）
- Wei et al., "Good View Hunting: Learning Photo Composition from Dense View Pairs"（CPC 数据集），CVPR 2018：https://xplorestaging.ieee.org/document/8578668/similar ；10,797 图/24 视角口径见 https://arxiv.org/html/2505.22490 与 https://arxiv.org/html/2312.12080v1
- Chen et al., "Quantitative Analysis of Automatic Image Cropping Algorithms: A Dataset and Comparative Study"（FCDB），WACV 2017：https://yiling-chen.github.io/flickr-cropping-dataset/
- IoU/BDE 指标定义与 FCDB/ICDB 基线值（GAIC 论文）：https://ar5iv.labs.arxiv.org/html/1904.04441
