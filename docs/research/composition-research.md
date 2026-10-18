# 构图研究：可落地裁切规则（公开资料学习汇总）

> 说明：本文为**多轮公开资料学习研究，全部自研方案；仅参考公开通用原理与学术成果，不涉及任何第三方产品的界面、文案或实现。**
> 研究方法：抖音"我看到的 vs 我拍到的"类教学视频系统检索（14 组关键词、约 70 条视频）+ 公开摄影教程/论文/工程实现文档。所有来源见文末清单。
> 用途：为本地纯函数裁切算法（边缘能量 / 行/列前缀和 RoD / 人脸人体框 / 三分法）与云端 VLM 裁切 prompt 迭代提供规则依据。

---

## 一、检索来源清单

### 1.1 抖音教学视频（按主题）

**"我看到的 vs 我拍到的"减法构图范式**
- 培养你的摄影眼：手机如何拍大片 — https://www.iesdouyin.com/share/video/7629683325372880710 （低角度舍去单调围墙、门洞天然画框）
- 我看到的vs我拍到的：假期旅游 — https://www.iesdouyin.com/share/video/7635998944883355027 （前景虚化避人群、框架主体居中、对角线倒影）
- 当我用减法构图的思维来拍照片 — https://www.iesdouyin.com/share/video/7654136192171521398
- 手机摄影｜我看到的vs我拍到的 — https://www.iesdouyin.com/share/video/7697222452196469867 （前景框架主体三分线、负空间留白）

**三分法 / 九宫格**
- 零基础保姆级构图教学 — https://www.iesdouyin.com/share/video/7372498574589938994
- 九种摄影构图法 — https://www.iesdouyin.com/share/video/7570243069321219354
- 三十秒认识三分构图 — https://www.iesdouyin.com/share/video/7566066799582661907 （人物放三分线、眼神方向留白延伸）
- 用好九宫格 — https://www.iesdouyin.com/share/video/7621596564298022001 （三分线交叉点放人物眼睛）

**地平线 / 风景**
- 地平线与水平线构图技巧 — https://www.iesdouyin.com/share/video/7379721456223063306 （上1/3突出地景、下1/3突出天空、正中仅用于倒影对称）
- 风光地平线放哪里 — https://www.iesdouyin.com/share/video/7365023649776127258 （天空美→地平距底1/3；大地美→距顶1/3）
- 湖边倒影别乱拍 — https://www.iesdouyin.com/share/video/7684998065396808369 （长焦做减法、俯拍拍更多云、横平竖直）

**人像 / 头顶留白 / 视线**
- 人像留白多少合适 — https://www.iesdouyin.com/share/video/7651517434716884267 （全身留一格、半身留一头、特写少留）
- 人物取景头部安放 — https://www.iesdouyin.com/share/video/7040840774283545892 （中近景头顶留白约屏幕1/5；特写不留）
- 万能留白公式 — https://www.iesdouyin.com/share/video/7393562942899309875
- 3个留白构图告别废片 — https://www.iesdouyin.com/share/video/7659352476990164259 （人放一侧1/3、朝向哪边哪边多留空）

**引导线 / 街拍**
- 站拍构图（9.1万赞） — https://www.iesdouyin.com/share/video/7661551322920379974 （微仰15°、头顶留一格白、脚踩底边）
- 98.5%摄影师判断错误的引导线 — https://www.iesdouyin.com/share/video/7663528572493880229 （引导线任务是建纵深/节奏）
- 街拍万能构图 — https://www.iesdouyin.com/share/video/7595813602822641487 （头卡三分线下、脚贴边、人放左下四格留右街）
- 杂乱街头怎么拍 — https://www.iesdouyin.com/share/video/767351373578858975 （长焦减法、横竖构图选择）

**画幅比例 / 横竖**
- 构图比例选错毁大片 — https://www.iesdouyin.com/share/video/7553906990423035182 （1:1紧凑/4:3万能/16:9宏大/9:16纵向）
- 横拍与竖拍 — https://www.iesdouyin.com/share/video/7346499224739073316 （横拍4:3/16:9；竖拍3:4/9:16）
- iPhone为何默认4:3 — https://www.iesdouyin.com/share/video/7628903211583229225 （4:3=传感器满像素、后期横竖空间）

**对称 / 倒影**
- 鎏金镜像对称 — https://www.iesdouyin.com/share/video/7597717346240843049 （贴水倒手机、建筑与倒影各占一半）
- 平行城市镜像 — https://www.iesdouyin.com/share/video/7640888400047869210 （水面为中轴、实景倒影1:1）
- 对称最简单 — https://www.iesdouyin.com/share/video/7694126626553082107 （走廊建筑倒影手机放中间）

**建筑 / 垂直线**
- 建筑绘画技巧拍建筑 — https://www.iesdouyin.com/share/video/7284923116969676086 （横平竖直、手机倒贴地压缩地面）
- 一拍就歪怎样横平竖直 — https://www.iesdouyin.com/share/video/7587627524058926345 （站中央对称轴+不仰不俯）
- 孙师傅拍建筑 — https://www.iesdouyin.com/share/video/7027800137757953316

**美食**
- 8种万能吃饭拍照构图（166万赞） — https://www.iesdouyin.com/share/video/7585901220498689317
- 9种拍食物万能构图 — https://www.iesdouyin.com/share/video/754208930236239389
- 在家吃饭随手拍 — https://www.iesdouyin.com/share/video/7049678659736620320 （正方形俯拍切边、主体占3/4）
- 漂亮饭正确拍法 — https://www.iesdouyin.com/share/video/7627840311204653681

**夜景**
- 城市夜景三种玩法 — https://www.iesdouyin.com/share/video/7633013309377907557
- 夜景灯笼构图 — https://www.iesdouyin.com/share/video/7611075052158635283 （发光字与屋顶完整入镜）

### 1.2 图文 / 论文 / 工程实现

- MM2014 自动裁切三模型 — https://users.eecs.northwestern.edu/~xsh835/assets/cropping-mm2014.pdf （内容保持 τ=0.4、边界简洁、权重 5:1）
- smartcrop.js 默认配置 — https://codakey.io/projects/jwagner-smartcrop-js/deploy-guide
- 人像 headroom 网格 — https://nextapps.fun/griddr/blog/portrait-composition-phone-grid-eyes-headroom （眼线33%、头顶留白≈8%、下裁切线88%）
- 关节裁切禁忌 — https://photographyicon.com/amputate/ ; https://photography.tutsplus.com/tutorials/quick-tip-5-tried-and-true-portrait-cropping-techniques--photo-15607
- 视线空间 — https://photographyicon.com/rule-of-space/
- 三分法地平线 — https://www.pixpretty.com/crop-photos-tips/thirds-composition.html
- 倒影对称 — https://mobilelensmastery.com/symmetry-in-smartphone-reflection-photos/
- 夜景氛围 — https://markus-hagner-photography.com/smartphone-night-photography-tips-for-sharp-low-light-photos/
- 美食角度 — https://kwickos.com/blog/restaurant-photography-guide.html
- 视频裁切防抖 — https://www.visioforge.com/help/docs/dotnet/general/ai/auto-reframe/ ; https://transcriptr.ai/blog/ai-auto-reframe-vertical-video
- VLM 裁切 — https://arxiv.org/pdf/2408.07790

---

## 二、分场景量化规则

### 2.1 通用：减法构图
- 边带能量 < 中心带 42% 判死区；单边最多裁 16%；3% 窄探针碰内容即停。
- 裁框保留显著能量 ≥ 40%（MM2014 硬下限）。

### 2.2 风景 / 滨水
- 天空出彩 → 地平线放画面下 1/3（天占 2/3）；地面出彩 → 上 1/3；正中仅用于倒影对称。
- 地平线水平 ≤ ~1°。
- 连续 ≥8% 低纹理低饱和行判死区，但高饱和行（晚霞/蓝天）豁免。
- 实景-倒影镜像时上下两半等量保留，不对单边裁切。

### 2.3 建筑
- 横平竖直；垂直边线不歪。
- 窄探针在屋顶/天际线停住，不切主体。
- 仰拍 keystoning 适度可接受、过量判失误。

### 2.4 夜景
- 高彩/霓虹牌整条保留（不被裁边劈断）。
- 暗部负空间是氛围，不当死区裁。
- 光斑/倒影成片保护。

### 2.5 人像
- 眼线落在画面上 1/3（33%）。
- 头顶留白约画面高 8%（半身留一头、全身留一格、特写不留）。
- 禁切关节（踝/膝/髋/腕/肘/肩）、下巴、手指尖。
- 视线方向前多留空间。
- 对称正对时保持居中，不硬拉三分。

### 2.6 美食
- 主菜居中或落三分点；碗盘完整入框。
- 桌面低纹理背景不是死区（防风景死区误裁）。
- 45° 适用多数菜；正俯拍适合扁平食物。

### 2.7 引导线 / 框中框 / 对称
- 长引导线两端完整入框。
- 前景画框（门/窗/孔洞）整体纳入。
- 对称模式下关闭三分偏置、左右/上下等量。

---

## 三、画幅比例选择规则

| 画幅 | 适用 | 可量化判据 |
|---|---|---|
| 16:9 横 | 风光/水景/夜景大场景 | 场景∈{waterscape,landscape,night} 且原片 aspect>1.3 |
| 4:3 | 通用默认 | 信号不足时默认（传感器满像素） |
| 3:4 竖 | 半身/七分身人像 | 人体高框 ph∈[0.5,0.72] |
| 9:16 竖 | 全身人像/竖高建筑/高塔 | ph≥0.72 或主体框高>宽×1.5 |
| 1:1 方 | 美食俯拍/单主体特写 | 美食俯拍或单主体居中背景杂 |

---

## 四、与现有算法对照矩阵

| 规则 | 状态 | 位置 |
|---|---|---|
| 风景死区边带裁切（RATIO=0.42/CAP=0.16/PROBE=0.03） | 已覆盖 | `_landscapeCrop` |
| 高彩/晚霞整条保护（mS>0.30 且 mSat>0.25） | 已覆盖 | `_rodGuard` / `_cloudCropIntentGuard` |
| 人像眼位锚 0.33、头顶最小留白 4%、不切身体 | 已覆盖 | `_portraitFraming` |
| 16:9 宽幅（风光/夜景/建筑）、倾斜>3°跳过 | 已覆盖 | `_aspectCrop` |
| 多帧中值框、置信滞回 0.45–0.65 | 已覆盖 | `_medianBox`/`_confBand` |
| 云端查切头/手/脚 | 已覆盖 | VLM 自审闭环 |
| 头顶留白目标 8%（现 5%） | 可增强 | `_portraitFraming` headMin 调 0.07–0.08 |
| 地平线天空/地面价值比较 | 可增强 | `_landscapeCrop` 加行区域价值分 |
| 内容保持 τ=0.4（现仅面积下限） | 可增强 | 叠加显著能量占比 |
| 人像视线空间 | 可增强 | `_portraitFraming` 水平方向偏置 |
| 美食防死区误裁 | 可增强 | food 场景关闭死区 |
| 关节裁切禁区 | **缺失** | 需新增 `_jointGuard` |
| 倒影对称保护 | **缺失** | 需新增 `_symmetryGuard` |
| 引导线/框中框保护 | **缺失** | 需新增 `_lineFrameGuard` |
| 画幅比例推荐 | **缺失** | 需新增 `_aspectRecommend` |
| 美食取景 | **缺失** | 需新增 `_foodFraming` |
| 云端"返回 none" | **缺失** | prompt 增补 |

---

## 五、后续落地优先级（Top 5）

1. **倒影/对称保护 `_symmetryGuard`** — 检测镜像中线→对称居中、关三分偏置
2. **关节裁切禁区 `_jointGuard`** — YOLO pose 关键点 ±4% 带不切
3. **美食取景+防死区误裁 `_foodFraming`** — food 场景关死区、主菜居中完整入框
4. **画幅比例推荐 `_aspectRecommend`** — 按场景输出 1:1/4:3/3:4/9:16/16:9 建议
5. **云端 prompt 增补"拿不准返回 none"** — VLM 克制不硬裁
