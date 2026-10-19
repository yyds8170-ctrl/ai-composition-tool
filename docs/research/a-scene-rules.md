# 分场景摄影构图规则的可量化裁切策略调研：八个场景的阈值、纯函数落点与验收断言

> 调研日期：2026-10-19
> 调研性质：多轮公开资料学习研究，全部自研方案；仅参考公开通用摄影教材、公开技术博客与公开学术口径中的参数区间，不引入任何第三方产品的界面、文案或实现细节。
> 调研对象：为单文件 PWA「AI 构图助手 Pro」的本地纯函数裁切链路（`_smartCrop` / `_landscapeCrop` / `_portraitFraming` / `_aspectCrop` / `_gazeGuard` / `_rodGuard` / `_objectGuard` / v12.0 三护栏）补齐"分场景"参数表。本文只沉淀可自行推导实现的公式与阈值区间，不引入任何开源库。
> 现状基线（从 index.html 与 tests/pure-functions.js 逐字核对）：
> - `_smartCrop(cx,cy,opt)`：MIN=0.13，CAPX=0.18，CAPY=0.15，三分界 tL/tR/tT/tB=0.375/0.625；只把偏位主体拉回三分点，不做居中对称裁。
> - `_landscapeCrop(energy,cx,cy,opt)`：STRIP=0.16，RATIO=0.42，CAP=0.16，PROBE=0.03，MINDEP=0.03；边带能量 < 中心 42% 判死区，单边最多裁 16%，保留宽高 ≥66%。
> - `_portraitFraming(crop,info)`：仅竖幅（aspect<0.92）、人体高 ph∈[0.34,0.72)；eyeK=0.10(半身)/0.08(七分)，目标眼位 eyeT=0.33，headMin=0.05，bodyKeep=0.05/0.06。
> - `_aspectCrop`：16:9 宽幅，仅横拍 aspect∈[1.45,2.1]，H≥0.80、W≥0.85，|tilt|>3° 直接放弃。
> - 安全钳：裁切后主体必须落在 X∈[0.15,0.85]、Y∈[0.10,0.85]。
> - 人体硬保护：头顶留 ≥4%、脚下留 ≥6%、左右各留 ≥3%。
> - v12.0 三护栏：`_sunsetWarmGuard`（色相带 330–30、V≥0.55、占比>0.40 → 顶边不裁）、`_foodMisClassGuard`（food 且 bandSat<0.25 且有食物证据 → 顶/底边不裁）、`_symmetryGuard`（eRatio∈[0.5,2.0]、var>8000、ncc>0.60 → 左右不裁）。
> 术语约定：所有坐标为**归一化值**（0~1，左上角原点），裁切框记为 `crop=[L,T,R,B]`（单边裁去比例，0.04 = 裁掉该边 4%）；"主体框"= COCO/MediaPipe 输出的 `bbox=[x1,y1,x2,y2]`。

---

## 0. 结论先行（TL;DR）

1. **八个场景可归纳为三类裁切哲学**：①人像/动物/美食=**单一主体保护型**（先保主体完整、再谈构图美化，宁可不裁）；②风景/水景/夜景=**横向延展大场景型**（靠边缘能量死区 + 宽幅重构，不做单侧主体重定位）；③建筑/街拍=**几何约束型**（垂直线/消失点是硬约束，先校正再构图）。现有代码的场景门（v8.5.0 / v11.16.0）已暗合此分类，本文把每类的公开参数区间对齐到具体函数参数。
2. **最值得新增的只有两个小函数**：`_eyeAnchor`（动物/人像眼位三分锚定，复用 `_portraitFraming` 的 eyeT=0.33 契约）与 `_highlightGuard`（夜景灯光点连通域保护）。其余规则都能落到现有函数的参数微调，不需要新管线。
3. **公开摄影教材的关键共识可直接数值化**：人像眼位 ≈ 画面上 1/3 线（y≈0.33）；头顶留白特写 4–6%、半身 8–12%；地平线"戏剧性天空放下 1/3、前景有趣放上 1/3"，正中心是最弱构图；对称建筑对偏离极度敏感（对称轴偏离 ≥3% 即"看着歪"）；水面倒影对水平度比陆地更敏感（倾斜阈值收紧到 0.5°）。
4. **验收断言的统一写法**：每个场景给 3–5 条"合成输入 → crop 四边断言"的纯函数级用例，与 tests/unit.test.js 的 `test(name, fn) + assert` 风格一致；所有用例都在 ≤320px 网格上构造，不依赖真实照片。
5. **红线**：夜景灯光、水面反光、暖色霞带、桌面纹理是四类"高价值背景"，现有 `_rodGuard`/三护栏已覆盖前三种；本文补齐第四种（夜景高光点）并把每类的触发阈值写成可测试的数值。

---

## 1. 人像（portrait / portrait_close）

### 1.1 可量化规则

| 规则 | 阈值/区间 | 公开依据 | 自研建议 |
|---|---|---|---|
| 眼睛三分线 | 裁切后眼位 y∈[0.30, 0.36]，目标 0.33 | 多份人像教材共识：眼睛放上三分线，"eye nearest the camera at a power point"（PhotoWorkout / 22Portraits / UAH 指南） | 沿用 `_portraitFraming` eyeT=0.33，容差带 ±0.03 |
| 头肩安全边距（特写，bodyH>0.72） | 头顶留白 4–6%，下巴下留 3–5%，左右各 3–4% | UAH 官方肖像裁切指南：头顶约 1/12（≈8%，半身档）；Griddr 实践：headroom ≈8%、下裁切守卫 88%（nextapps Griddr Journal） | 现有特写 cropTop=max(0.02, faceY−0.35) ≈ 头顶留白 15% 偏松，建议特写档收紧到 4–8% |
| 半身（0.50≤ph<0.72） | 头顶留白 8–12%，切位在大腿中（y≈0.78）或小腿中，**绝不切颈/腰/膝** | 通用摄影教材"不切关节"原则（joints rule） | 现有 bodyKeep=0.05（半身）够用，补一条"bbox 切位禁带"：颈部 y∈[headTop, headTop+0.10]、腰部 y∈[pb−0.25, pb−0.15] 不进裁切线 |
| 视线留白（lead room） | 朝向侧留白 ≥15%，背向侧可裁至 5% | 人像"looking room"通用原则 | 沿用 `_gazeGuard`，朝向后裁边 CAP 上调到 0.18 |
| 竖版/横版比例建议 | 头肩特写 3:4（或 4:5 社媒）；半身 2:3；环境人像 4:3 或 3:2 横版 | 行业通用肖像画幅 | `_portraitFraming` 只处理竖幅（aspect<0.92）已覆盖；横版人像当前走 `_aspectCrop` 的反向——建议横版人像成品画幅固定 3:2，不做 16:9 |
| 眼位过高/过低检测 | 当前眼位 eyeNow∈(0.42, 0.70) 且头顶留白 hrNow>0.28 才触发重锚 | 现有 `_portraitFraming` 双触发闸门 | 保持不变（宁缺毋滥） |

### 1.2 落到哪个纯函数

```
_portraitFraming(crop, info)   // 已存在：眼位锚定上三分 + 头顶/身体硬约束
_gazeGuard(crop, info)         // 已存在：视线方向单侧留白
人体硬保护（L4550–4559）        // 已存在：headTop−0.04 / bottom+0.06 / sides±0.03
```
建议新增/微调：
- 特写档头顶留白 15%→6%（改 isCloseUp 分支 cropTop 公式：`cropTop = max(0.02, faceY - 0.42)`）；
- 新增 `_jointGuard(crop, personBox)`：若裁切线落在颈/腰/膝禁带内，把该边内收 2%（只减不增）。

### 1.3 验收断言示例

| # | 合成输入 | 期望断言 |
|---|---|---|
| P1 | 竖幅 3:4，人脸框 pt=0.20, ph=0.60（半身），eyeAbs=0.26，当前裁切后眼位 eyeNow=0.55、hrNow=0.30 | `_portraitFraming` 返回非原 crop；新眼位 newEye∈[0.30,0.36]；头顶留白 ≥4%；底边 ≤ 1−(pb+0.05) |
| P2 | 同 P1，但 eyeNow=0.38（眼位本就正常） | 返回原 crop（双触发未满足） |
| P3 | 特写 bodyH=0.80，faceY=0.45 | isCloseUp 分支 cropTop ∈ [0.04,0.10]（头顶留白 4–10%）；cropLeft=cropRight=0.04 |
| P4 | 半身人 pb=0.70，bodyGuard 前 cropBottom=0.40（将切到小腿以下） | 硬保护后 cropBottom ≤ 1−pb−0.06 ≈ 0.24 |
| P5 | 人脸朝右（gaze=+1），主体 cx=0.40 | `_gazeGuard` 后右侧留白 ≥0.15，左侧可裁但主体最终 X∈[0.15,0.85] |

---

## 2. 动物（animal）

### 2.1 可量化规则

| 规则 | 阈值/区间 | 公开依据 | 自研建议 |
|---|---|---|---|
| 主体占比 | 单主体 bbox 面积 ∈ [0.15, 0.75]；<0.15 算"环境动物"（不重定位），>0.75 已铺满不裁 | 现有 `_smartCrop` 闸门：主体框 ar∈[0.08,0.75] 才主导构图 | 动物类建议主导框门槛上调到 0.12（鸟/松鼠小主体也能主导） |
| 眼睛位置 | 动物可见眼位于三分交点 ±0.08；不可见眼（侧脸/背面）则用头部 bbox 中心 | 野生动物教材："position its eye at one of the four grid intersections"（Amateur Photographer Guide / SafariLingo） | 新增 `_eyeAnchor(crop, headBox)`：复用 eyeT=0.33 契约，水平方向眼位锚到最近交点 |
| 毛发边缘保护 | bbox 外扩边距 ≥2–3% 再裁（耳尖/尾尖/鬃毛常超出检测框） | 野生动物"leave space in direction of movement"；COCO 检测框对毛发类动物偏紧 | `_objectGuard(crop, boxes)` 已有边距保护，动物类建议边距从默认 2% 提到 3% |
| 朝向留白 | 动物注视/运动方向留白 ≥10–15%（lead room） | "if the animal is looking right, give it space on the right"（Akari Photo Tours） | 复用 `_gazeGuard` 通道（faceAvailable 缺失时用头部框水平偏移估计朝向） |
| 画幅建议 | 单动物竖版 3:4；群动物/奔跑场景横版 16:9（运动方向留横向空间） | 野生动物通用实践 | 动物类**不做**垂直重定位（现有 vCrop=false 已正确：耳朵尾巴姿态多样易切头） |

### 2.2 落到哪个纯函数

```
_smartCrop(cx,cy,{vCrop:false})   // 已存在：只做水平重定位，动物专用
_objectGuard(crop, boxes)         // 已存在：bbox 边距保护（动物类边距参数 0.03）
```
建议新增：
- `_eyeAnchor(crop, headBox, aspect)`：眼位三分锚定（契约照抄 `_portraitFraming` 的 eyeT=0.33 / headMin=0.05），仅当检测到动物头部框时触发。

### 2.3 验收断言示例

| # | 合成输入 | 期望断言 |
|---|---|---|
| A1 | 动物 bbox 中心 cx=0.20, cy=0.50, 面积=0.30，动物场景 | `_smartCrop` 返回 R>0（裁右留白侧）且 R≤0.18；裁切后主体中心 cx'∈[0.375, 0.625] 附近；L=0 |
| A2 | 同 A1，但 bbox 面积=0.90（已铺满） | 返回 [0,0,0,0]（_fill 闸门） |
| A3 | 动物头框 eyeAbs 相当于 y=0.55（眼位偏低），竖版 | `_eyeAnchor` 返回非原 crop，新眼位 ∈[0.30,0.36]，且头顶留白 ≥3% |
| A4 | 动物 bbox 右缘 x2=0.97，当前 cropRight=0.06 | `_objectGuard` 后 cropRight ≤ 1−0.97−0.03 = 0（毛发边距不切） |
| A5 | 动物朝右运动，cx=0.45 | 裁切后右侧留白 ≥0.10（朝向侧不裁死） |

---

## 3. 风景（landscape）

### 3.1 可量化规则

| 规则 | 阈值/区间 | 公开依据 | 自研建议 |
|---|---|---|---|
| 地平线位置 | 落在 y∈[0.30,0.36]（前景主导）或 y∈[0.64,0.70]（天空主导）；**避开中心带 y∈[0.45,0.55]** | 多份风光教材共识："horizon on bottom third when sky is dramatic"；"center split is typically the weakest composition"（ShutterCoach / JustPix / naturephotogear） | 新增 `_horizonBand` 判定：检测到地平线且当前 y∈[0.45,0.55] 时，按天空精彩度把地平线拉向 0.33 或 0.67 |
| 天空占比 | 戏剧性天空（高饱和/高亮度方差）：天空占 35–65%；平淡天空：天空占比 ≤35% | "if the sky is dramatic, give sky two-thirds"；"boring sky → upper third horizon"（ShutterCoach / carephoto） | 复用 `_rodGuard` 的 colorHit/salHit 判定"天空是否精彩"，精彩→地平线目标 0.67，平淡→0.33 |
| 引导线收敛点 | 收敛点落在三分交点 ±0.06 | "lines converge near your subject"（theCamera.School） | 现有 sigBox/cx,cy 显著性质心近似收敛点；落在 [0.33±0.06, 0.67±0.06] 外才触发微调 |
| 水平度 | 地平线倾斜 ≤1°（感知阈值）；>3° 先校正不裁 | 建筑/风光通用"水平"原则 | 沿用 `_aspectCrop` 的 |tilt|>3° 放弃闸门；建议裁切路径用收紧档：tilt∈(1°,3°] 只做 ≤2% 的微裁 |
| 死区裁切 | 边带能量 < 中心 42% 才裁；单边 ≤16%；保留宽高 ≥66% | 现有 `_landscapeCrop` 参数（v11.16.0） | 保持不变；风景类横拍走 `_aspectCrop` 16:9 |

### 3.2 落到哪个纯函数

```
_landscapeCrop(energy, cx, cy, {v:true})  // 已存在：边缘死区裁切
_aspectCrop(crop, info)                   // 已存在：16:9 宽幅（沿地平线定位）
_rodGuard(crop, rod, info)                // 已存在：高彩/双高背景条带保护
```
建议新增：
- `_horizonCue(crop, horizonY, skyScore)`：地平线居中带闸门，skyScore>0.5 时把地平线拉向 y=0.67（天空 2/3），否则拉向 y=0.33；任一边放不下（顶/底出界）就放弃。

### 3.3 验收断言示例

| # | 合成输入 | 期望断言 |
|---|---|---|
| L1 | 天空条带高饱和（colorHit），当前地平线 y=0.50 | `_horizonCue` 后地平线 ∈[0.64,0.70]（天空给 2/3） |
| L2 | 天空平淡（mean 低 sat 低），地平线 y=0.50 | 地平线 ∈[0.30,0.36] |
| L3 | 地平线 y=0.33（本就正确） | 返回原 crop |
| L4 | 顶边 16% 边带能量仅为中心 20%，cy=0.60 | `_landscapeCrop` 返回 T>0 且 T≤0.16；1−T≥0.66 |
| L5 | |tilt|=4° | `_aspectCrop` 返回原 crop（先校正） |
| L6 | 横拍 aspect=1.78，显著主体框在 y∈[0.55,0.75] | 16:9 重构后主体框 y 区间完整保留（裁切不得切框） |

---

## 4. 水景（waterscape）

### 4.1 可量化规则

| 规则 | 阈值/区间 | 公开依据 | 自研建议 |
|---|---|---|---|
| 水面反光保护 | 水面条带饱和度/亮度方差高于阈值时**不裁该边** | 现有 `_rodGuard`：colorHit（高彩）/salHit+varHit（双高）整块保留 | 沿用；水景类把双高闸门的 SAL_K 权重上调（水面反光天然高饱和） |
| 地平线水平 | 倾斜阈值收紧到 ≤0.5°（倒影对水平度比陆地更敏感） | 水面倒影对称的通用实践："level perspective"（picfair 建筑/风光章节同源） | `_aspectCrop` 现有 |tilt|>3° 太松；建议水景档：|tilt|>1.5° 即放弃裁切 |
| 倒影对称 | 垂直对称轴判定：eRatio∈[0.5,2.0]、var>8000、ncc>0.60 → 左右不裁；水平倒影对称时**允许**地平线居中（0.5±0.03）——这是唯一的"居中合法"场景 | "center split" 唯一例外："unless you're going for a symmetry shot"（ihitthebutton） | 沿用 `_symmetryGuard`；新增"倒影对称"时放行 `_horizonCue` 的居中带（不把 0.5 当缺陷） |
| 水面占比 | 无倒影：水面 40–50%（地平线 0.5–0.6）；有强倒影：水面 45–55% 居中 | 风光教材倒影构图 | 与 `_horizonCue` 联动：倒影分数高时不强行拉三分 |

### 4.2 落到哪个纯函数

```
_symmetryGuard(crop, info)     // 已存在：镜像对称 → 左右不裁
_rodGuard(crop, rod, info)     // 已存在：水面反光条带保护
_aspectCrop(crop, info)        // 已存在：16:9 宽幅（水景在列）
_sunsetWarmGuard(crop, info)   // 已存在：暖色霞带顶边不裁
```
建议微调：`_aspectCrop` 按场景分档——waterscape/architecture 的 tilt 放弃阈值从 3° 收紧到 1.5°。

### 4.3 验收断言示例

| # | 合成输入 | 期望断言 |
|---|---|---|
| W1 | 水面条带 bandSat=0.5（高彩反光） | `_rodGuard` 后被裁条带整块保留（该边裁切量归零） |
| W2 | 对称分数 eRatio=0.8, var=12000, ncc=0.75 | `_symmetryGuard` 后 L=0, R=0（对称轴不被左右裁切破坏） |
| W3 | 倒影对称场景，地平线 y=0.50 | 不触发 `_horizonCue` 的"居中即缺陷"修正（放行） |
| W4 | |tilt|=2°，水景场景 | 收紧档下 `_aspectCrop` 放弃（返回原 crop） |
| W5 | 顶带色相 10°（暖色）、V=0.7、ratio=0.45 | `_sunsetWarmGuard` 后 T=0（暖霞顶带保留） |

---

## 5. 建筑（architecture）

### 5.1 可量化规则

| 规则 | 阈值/区间 | 公开依据 | 自研建议 |
|---|---|---|---|
| 垂直线条校正 | 垂直线与竖直方向目标夹角 ≤1°；仰拍产生的会聚线（keystone）|tilt|>3° 时先校正不裁切 | "keep verticals straight at 90°"；tilting up makes verticals converge（picfair / datafield 教材） | 沿用 `_estTiltDeg`；建筑档 tilt>1.5° 即放弃裁切（与水景同收紧档） |
| 对称居中 | 对称轴 x∈[0.5−0.03, 0.5+0.03]；symEdge 判定命中时左右不裁 | "even slightly off-center, symmetry breaks"（ShutterCoach / Icon Photography）——对称构图对偏离极度敏感 | 沿用 `_symmetryGuard` |
| 边缘裁切 | 屋顶线不切：窄探针 PROBE=0.03 碰到屋顶能量即停；底部地面基线保留 ≥3–5% | 现有 v11.16.0 注释：窄探针在屋顶/天际线立即停住 | 保持不变；补一条：底部基线（建筑落地线）下方保留 ≥4% 地面，不裁成"切地基" |
| 画幅建议 | 单栋建筑竖版 2:3 或 3:4；连片街景/广场横版 16:9 | 建筑通用实践 | `_aspectCrop` 覆盖横版 |

### 5.2 落到哪个纯函数

```
_landscapeCrop(energy, cx, cy, {v:true})  // 已存在：屋顶贴边时探针停住，可裁天际线上方空白天
_symmetryGuard(crop, info)               // 已存在：左右不裁
_aspectCrop(crop, info)                  // 已存在：16:9 横版
```
建议微调：建筑档 tilt 放弃阈值收紧（1.5°）；底部基线保护边距 4%。

### 5.3 验收断言示例

| # | 合成输入 | 期望断言 |
|---|---|---|
| B1 | 屋顶 bbox 顶 y1=0.05，顶边 16% 条带能量仅中心 30% | `_landscapeCrop` 的窄探针在 y≈0.05 处停住：T≤0.05（不切屋顶） |
| B2 | 对称轴 x=0.47（偏离中心 3% 内），sym 命中 | `_symmetryGuard` 后 L=R=0 |
| B3 | 对称轴 x=0.40（偏离 10%），sym 命中 | 仍返回原 crop（护栏是"只减不增"，不主动居中——居中由引导逻辑负责） |
| B4 | |tilt|=2.5° | 收紧档下 `_aspectCrop` 放弃 |
| B5 | 建筑落地线 y2=0.92，地面在 y∈[0.92,1.0] 能量低 | 底部裁切 B≤1−0.92−0.04 = 0.04（保留地基边） |

---

## 6. 街拍（street）

### 6.1 可量化规则

| 规则 | 阈值/区间 | 公开依据 | 自研建议 |
|---|---|---|---|
| 引导线消失点 | 消失点（显著性质心/检测主框中心）落在三分交点 ±0.08 | "aligning lines so they converge near your subject"（theCamera.School） | 沿用 `_smartCrop` 的三分界 0.375/0.625 |
| 主体避让 | 主体 bbox 外扩 ≥2–3% 边距；行人不切头/脚（人体硬保护复用） | 街拍通用"subject breathing room" | `_objectGuard` + 人体硬保护（已有） |
| 杂乱边缘裁除 | 边缘条带低能量且无显著框 → 死区裁除（单边 ≤16%）；边带内有任意检测框（score≥0.40）则不裁该边 | 现有 `_smartCrop` 闸门（score<0.40 不采信） | 保持不变；街拍**允许**垂直重定位（vCrop=true，现有代码已如此） |
| 负空间 | 人物行走朝向侧留白 ≥15% | "negative space behind a walking person"（photobek） | 复用 `_gazeGuard` |

### 6.2 落到哪个纯函数

```
_smartCrop(cx, cy, {vCrop:true})   // 已存在：街拍做水平+垂直重定位
_objectGuard(crop, boxes)          // 已存在：主体框边距保护
人体硬保护（L4550–4559）            // 已存在：行人头顶/脚下保护
```
本场景无需新增函数，参数已就位。

### 6.3 验收断言示例

| # | 合成输入 | 期望断言 |
|---|---|---|
| S1 | 行人 bbox 中心 cx=0.25, cy=0.50，面积=0.20 | `_smartCrop` 返回 R>0、R≤0.18；裁切后 cx'∈[0.375,0.625] |
| S2 | 同 S1，但边带内 score=0.50 的自行车框紧贴右边缘 | 该边不裁（`_objectGuard` 边距保护） |
| S3 | 行人头框 top=0.08，当前 cropTop=0.10 | 硬保护后 cropTop ≤ 0.08−0.04 = 0.04 |
| S4 | 主体 cy=0.85（贴底） | `_smartCrop` 返回 T>0（裁上留白侧）且 T≤0.15；裁切后 cy'≤0.85 安全钳上限附近 |
| S5 | 主体 cx=0.50（本就在中心） | 返回 [0,0,0,0]（MIN=0.13 差闸门不触发） |

---

## 7. 夜景（night）

### 7.1 可量化规则

| 规则 | 阈值/区间 | 公开依据 | 自研建议 |
|---|---|---|---|
| 灯光点保护 | 高亮连通域（亮度 >200/255 的斑块）外扩 ≥2% 保护半径；灯斑中心落在裁切线 ±3% 带内时该边不裁 | 夜景/灯光摄影通用实践：bokeh 点是视觉焦点 | 新增 `_highlightGuard(crop, brightBlobs)`：只减不增 |
| 暗部裁切 | 纯黑死区（条带 mean<30/255 且方差<20）可裁，单边 ≤16%；但**星空/路灯反光带**（低亮度但高方差或含灯斑）不裁 | 夜景通用：死黑边缘可裁，暗部细节保留 | 沿用 `_landscapeCrop` 的能量死区思路；夜景档把死区判定从"能量<42%"放宽到"能量<55% 且无灯斑" |
| 水平度/地平线 | 同风景：tilt>3° 放弃 | 同源 | 保持不变 |
| 画幅 | 夜景横拍走 16:9（城市天际线/桥/水面） | 现有 `_aspectCrop` 覆盖 night | 保持不变 |

### 7.2 落到哪个纯函数

```
_landscapeCrop(energy, cx, cy, {v:true})  // 已存在：夜景在列（v11.16.0）
_aspectCrop(crop, info)                 // 已存在：16:9
_rodGuard(crop, rod, info)               // 已存在：高彩/双高灯色条带保护
```
建议新增：
- `_highlightGuard(crop, blobs)`：扫描缩略网格上亮度>200 的连通域中心，任一 blob 中心落在拟裁边的 ±3% 条带内，则该边裁切量归零（只减不增）。

### 7.3 验收断言示例

| # | 合成输入 | 期望断言 |
|---|---|---|
| N1 | 高亮光斑中心 x=0.96（贴右边），当前拟裁 cropRight=0.08 | `_highlightGuard` 后 cropRight=0（光斑不被切一半） |
| N2 | 四角纯黑死区（mean=10，方差=5），中心区域有灯 | `_landscapeCrop` 对死区边裁除 >0 且 ≤0.16 |
| N3 | 暗部区域 mean=20 但方差=200（路灯反光） | 不判为死区，该边不裁 |
| N4 | |tilt|=3.5° | `_aspectCrop` 返回原 crop |
| N5 | 暖色路灯带顶条带（色相 20°，V=0.6） | `_sunsetWarmGuard` 顶边不裁（色相带 330–30 命中） |

---

## 8. 美食（food）

### 8.1 可量化规则

| 规则 | 阈值/区间 | 公开依据 | 自研建议 |
|---|---|---|---|
| 桌面纹理保留 | food 弱证据（bandSat<0.25）时顶/底边不裁，防止把桌面纹理误判成死区 | 现有 `_foodMisClassGuard`（v12.0） | 保持不变；food **不走** `_landscapeCrop` 死区路径（现有场景门已正确） |
| 主体居中 | hero dish bbox 中心 ∈[0.42,0.58]（居中±8%）；bbox 面积 ∈[0.25,0.60] | 美食构图通用："triangular composition" + hero dish 主体 | 现有 food 走 center rule；建议补一条：hero 盘 cx 偏离中心 >10% 时才微调，且只裁空白侧 |
| 上方留白 | 45° 视角：盘上方背景留白 10–20%；flat-lay 俯拍：四周均匀留白 ≥6% | "negative space: leave empty table surface to let the dish breathe"（Icon Photography / Photo Culinaire） | 新增轻量规则：45° 档 cropTop ≥0.10（保证上方背景不裁死） |
| 不做 smartCrop | 俯拍摆盘/仰拍形变场景不做主体重定位 | 现有 v8.5.0 场景门注释 | 保持不变 |

### 8.2 落到哪个纯函数

```
_foodMisClassGuard(crop, info)   // 已存在：顶/底边不裁（弱证据）
_objectGuard(crop, boxes)        // 已存在：餐盘框保护
```
建议新增轻量参数（不新建函数）：food 分支 cropTop 下限 0.10、hero 盘 cx 微调阈值 ±0.10。

### 8.3 验收断言示例

| # | 合成输入 | 期望断言 |
|---|---|---|
| F1 | food 场景，bandSat=0.15，有食物证据 | `_foodMisClassGuard` 后 T=0, B=0（桌面不裁） |
| F2 | food 场景，bandSat=0.60（高彩菜） | 护栏放行（高彩不是弱证据），交给主链路 |
| F3 | hero 盘 bbox cx=0.50 | 不触发水平微调（居中±8% 内） |
| F4 | hero 盘 cx=0.30（偏左 20%） | 只裁右侧空白侧，裁后 cx'∈[0.42,0.58] 且餐盘框完整 |
| F5 | 45° 视角，拟裁 cropTop=0.15 | 上方留白仍 ≥10%（裁后上方背景可见） |

---

## 9. 横向汇总：场景 × 规则 × 纯函数 × 关键阈值

| 场景 | 核心规则 | 承载纯函数 | 关键阈值（现状/建议） |
|---|---|---|---|
| portrait_close | 眼位上三分、头肩留白 | `_portraitFraming` + isCloseUp 分支 | eyeT=0.33；特写头顶留白建议 4–8%（现 ~15% 偏松） |
| portrait | 眼位锚定、视线留白、关节禁带 | `_portraitFraming` / `_gazeGuard` / 人体硬保护 | headTop−0.04、foot+0.06、sides±0.03；新增 `_jointGuard` |
| animal | 眼位三分、毛发边距、朝向留白 | `_smartCrop(vCrop:false)` / `_objectGuard` / 新增 `_eyeAnchor` | 主导框面积 0.12–0.75；边距 3%；朝向留白 ≥10% |
| landscape | 地平线三分、天空精彩度、死区裁切 | `_landscapeCrop` / `_aspectCrop` / 新增 `_horizonCue` | 地平线避 0.45–0.55；死区能量<42%；单边≤16% |
| waterscape | 反光保护、水平收紧、倒影对称放行 | `_symmetryGuard` / `_rodGuard` / `_sunsetWarmGuard` | ncc>0.60；tilt 收紧 1.5°；倒影时放行地平线居中 |
| architecture | 垂直线校正、对称轴居中、屋顶/地基保护 | `_landscapeCrop` / `_symmetryGuard` / `_estTiltDeg` | tilt 收紧 1.5°；对称轴 ±3%；地基留 ≥4% |
| street | 消失点三分、主体避让、杂乱裁除 | `_smartCrop(vCrop:true)` / `_objectGuard` / 人体硬保护 | score≥0.40 才采信边带框；主体最终 X∈[0.15,0.85] |
| night | 灯光点保护、暗部死区裁切 | `_landscapeCrop` / 新增 `_highlightGuard` | 亮度>200 blob ±3% 条带不裁；死区 mean<30 且方差<20 |
| food | 桌面保留、主体居中、上方留白 | `_foodMisClassGuard` / `_objectGuard` | bandSat<0.25 顶/底不裁；hero cx 居中±8%；上方留白≥10% |

## 10. 落地优先级建议

1. **P0（参数微调，零新函数）**：isCloseUp 头顶留白收紧 15%→6%；建筑/水景 tilt 放弃阈值 3°→1.5°；food cropTop 下限 0.10。
2. **P1（两个小纯函数）**：`_eyeAnchor`（动物眼位锚定）与 `_highlightGuard`（夜景灯光点保护），契约都照抄现有函数（eyeT=0.33 / 只减不增），各 30 行内。
3. **P2（场景感知地平线）**：`_horizonCue`（居中带闸门 + 天空精彩度分向 0.33/0.67），依赖现有 `_rodGuard` 的 colorHit/salHit 信号，不新增像素扫描。

---

### 公开来源（按引用顺序）

- 人像头肩/眼位：https://photographyicon.com/headroom/ ；https://www.photoworkout.com/rule-of-thirds-in-photography/ ；https://nextapps.fun/griddr/blog/portrait-composition-phone-grid-eyes-headroom ；https://www.uah.edu/omc/services/photography/portrait-guide/portrait-cropping-guide ；https://www.22portraits.com/blog/headshot-crop-and-framing-guide/
- 风光地平线：https://shuttercoach.app/learn/how-to-compose-landscape-photos/ ；https://ihitthebutton.com/rule-of-thirds/ ；https://www.justpix.com/resources/landscape-photography-that-translates-to-wall-art ；https://naturephotogear.com/composition-rules-for-landscape-photography-beyond-the-rule-of-thirds-2026/
- 动物/野生动物：https://amateurphotographerguide.com/how-to-photograph-wildlife-practical-techniques-2026/ ；https://akariphototours.com/blog/better-wildlife-photos-without-new-gear/ ；https://safarilingo.com/en/guide/wildlife-composition-tips/
- 建筑：https://shuttercoach.app/learn/how-to-photograph-architecture/ ；https://photographyicon.com/architectural-photography/ ；https://focus.picfair.com/articles/how-to-take-better-architecture-photography-9-top-tips ；https://datafield.dev/photography/part-04/chapter-18/index.html
- 街拍：https://thecamera.school/learn/hubs/genres/street-photography/street-photography-composition-techniques ；https://www.photobek.com/photography-composition-basics/
- 美食：https://photographyicon.com/food-photography/ ；https://photoculinaireschool.com/negative-space-food-photography-tips/ ；https://foodphoto.ai/blog/flat-lay-food-photography-complete-guide/
