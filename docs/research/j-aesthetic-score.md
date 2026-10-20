# J: 裁切评分升级 — NIMA-lite 轻量美学评分

## 现状问题
当前选框只看显著性质心位置，不评估"这个框里的画面好不好看"。多个候选框中可能选了构图对但视觉平庸的。

## 可量化规则（纯像素，无模型）

```
aestheticScore = w1*contrast + w2*satHarmony + w3*edgeDensity
               + w4*ruleOfThirds + w5*goldenRatioFit
```

| 信号 | 计算 | 权重 | 说明 |
|---|---|---|---|
| contrast | (max-min)/255 归一化 | 0.20 | 太平=无聊，太高=刺眼 |
| satHarmony | 饱和色像素占比 + 色相聚类数 | 0.15 | 色彩和谐度 |
| edgeDensity | Sobel 边缘像素 / 总像素 | 0.20 | 太少=空，太多=杂 |
| ruleOfThirds | 主体质心距三分线距离 | 0.25 | 最核心 |
| goldenRatioFit | 主体框宽高比 vs 1.618 距离 | 0.20 | 黄金分割 |

## 落点
- 新纯函数 `aestheticScore(pixels, w, h, saliencyCentroid)` → 0-100
- 在 _smartCrop 的多候选框中选 score 最高的，而非只看质心位置
- 现有 analyzePixels 已算 contrast/sat/edge，零新增扫描

## 预期收益
- 多选框场景下选出视觉更好的框（而非仅位置对的）
- noCrop 比例可能微调（好构图更容易被识别保留）

## 验收测试
- 合成图：三分交点+高对比 vs 正中+灰平，分数差>15分
- 合成图：1.618比例 vs 1:1，前者分高
