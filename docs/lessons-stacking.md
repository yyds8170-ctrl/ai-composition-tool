# 教训：叠层类 UI 修复必须用"同位置两帧 md5 不同"验收

## 事故
v12.0.0 修对比滑块：把 cmpBase.src 从 cropResult 改成 origURL，以为修好了。
tools/verify_compare.js 截 photoView 元素 → PASS。
实际：DOM 里 cmpBase(原图) 排在 photoView(效果) 之后，无 z-index，原图永远盖住效果层。
clip-path 裁的是被盖住的底层，拖分割线毫无视觉变化。
旧断言截单个元素，叠层错了也照出一样的图 → 空断言。

## 正确验收（verify_stacking.js）
1. 不依赖模型：photoView 设纯红、cmpBase 设纯蓝
2. 开对比态，在 x=25% 竖条区域截 cmpPos=20% 与 80% 两帧
3. md5 必须不同才 PASS
4. 这验证的是"分割线移动时，同一物理位置的像素真的变了"

## 规则
以后所有对比/叠层/分层 UI 修复：
- 禁止只截单个元素的空断言
- 必须截"同一位置在两种状态下"的像素，断言不同
- z-index/叠层顺序和 src 一样重要
