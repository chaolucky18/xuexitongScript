# 学习通自动刷课脚本

可选两套入口：

- **仅刷课：** `v3_optimized.js` / `v3_optimized.user.js`
- **刷课 + 自动答题：** `v1_autoAnswer_optimized.js` / `v1_autoAnswer_optimized.user.js`（由 v3 播放流程 + v1 答题逻辑合并）

共同能力：

- 自动播放视频
- 视频结束后自动切换到下一小节
- 章节测验：跳过，或（合并版）自动答题
- 从“学习目标”步骤自动切到“视频”步骤
- 手动点“2视频”页签后自动重新接管播放

目标是保持原模板的行为方式，尽量少叠加后台保活、通知、测试按钮等附加层，减少冲突。

## DeepSeek 控制台练习版

仓库新增了独立的 [DeepSeek 控制台版](deepseek-console/README.md)，通过本地服务调用 DeepSeek API，识别章节练习题并辅助作答。原有 V3 脚本入口保持不变。


## 文件说明

- [v3_optimized.js](v3_optimized.js)
  仅刷课，控制台执行
- [v3_optimized.user.js](v3_optimized.user.js)
  仅刷课，Tampermonkey 油猴版
- [v1_autoAnswer_optimized.js](v1_autoAnswer_optimized.js)
  刷课 + 自动答题合并版，控制台执行
- [v1_autoAnswer_optimized.user.js](v1_autoAnswer_optimized.user.js)
  刷课 + 自动答题，油猴版
- [v1_autoAnswer.js](v1_autoAnswer.js)
  仅自动答题（测验 / 作业页控制台执行，调试用）
- [scripts/build-userscript.mjs](scripts/build-userscript.mjs)
  根据控制台源码生成油猴版
- [scripts/build-v1-optimized.mjs](scripts/build-v1-optimized.mjs)
  从 v3 + v1 生成合并版源码

## 当前脚本行为

### 1. 学习目标页

如果当前小节先进入的是“学习目标”而不是视频页，脚本会尝试点击顶部的 `2视频` / `视频` 标签进入视频步骤。

说明：

- 这条路径已经按当前页面结构收紧，只走顶部视频标签，不再点击底部 `下一节` 按钮
- 原因是底部按钮在当前页面里可能触发额外调试/暂停逻辑，稳定性较差

### 2. 视频页

进入视频页后，脚本会：

- 识别 iframe 内的真实视频元素
- 自动调用 `play()`
- 如果播放被短暂中断，则尝试恢复播放
- 如果普通播放失败，则尝试静音播放

仅刷课默认配置：

```javascript
configs: {
    playbackRate: 1.5,
    autoplay: true,
    retryInterval: 2000,
    maxRetries: 10,
    videoCheckInterval: 1000,
    autoAdvanceNoVideo: false,
}
```

合并版在以上基础上还带测验相关项（见第 4 节）。

### 3. 视频结束后

视频触发结束事件后，脚本会调用 `nextUnit()`，在课程目录树中定位到下一小节并点击进入。

### 4. 章节测验

先判断当前是不是测验页（步骤名「章节测验」，或页面内已出现测验 iframe）。

**仅刷课（v3）**

直接尝试点击 `#prevNextFocusNext`（或同级下一步控件）跳过测验，最多尝试 3 次，防止循环。

**合并版（v1_autoAnswer_optimized）优先级**

1. `skipChapterTest === true`（默认）：与 v3 一样跳过测验
2. 否则若 `autoAnswer === true`：走自动答题，结束后再尝试进入下一步 / 下一节
3. 两者都关：安全停止，可手动处理后执行 `app.nextUnit()` / `app._advanceChapterTest()`

自动答题会：

- 识别 iframe 内题目（单选 / 多选 / 判断 / 简答），多 iframe 按 `workId` 隔离
- 优先用本地已存答案，不足时再调 DeepSeek（`useAI`）
- 已批阅页可保存「题目 → 答案」到 `localStorage`
- 支持 `font-cxsecret` 题干解码（`decodeFont`）

合并版测验相关默认配置：

```javascript
configs: {
    skipChapterTest: true,
    autoAnswer: false,
    apiKey: "",
    model: "deepseek-chat",
    autoSubmit: true,
    useAI: true,
    autoRedo: false,
    autoRedoTimes: 1,
    clearBeforeSelect: true,
    decodeFont: true,
}
```

说明：

- `skipChapterTest`：为 `true` 时直接跳过测验，**优先于** `autoAnswer`
- `autoAnswer`：关闭跳过后，遇到测验是否自动答题
- `autoSubmit`：写完答案后是否自动提交
- `useAI`：为 `false` 时只用本地已存答案，不调模型
- `autoRedo`：已批阅页保存答案后，是否自动点「重做」并按已存答案回填
- `autoRedoTimes`：每个测验（按 `workId`）最多自动重做几次；平台给 5 次时可设成 `2`；`clearQuizAnswers()` 会清零计数
- `clearBeforeSelect`：点选前若已有选项，先取消再重选
- `decodeFont`：是否解码加密题干

注意：`apiKey` 不要提交到公开仓库，个人配置可以写在本地 `.local-configs.json` 中，不会提交到远程

若只要答题、不要刷课，也可在测验页单独执行 [v1_autoAnswer.js](v1_autoAnswer.js)。

## 使用方法

### 方法一：控制台执行

1. 打开学习通课程播放页
2. 按 `F12`，进入 `Console`
3. 复制源码粘贴执行：
   - 仅刷课：[v3_optimized.js](v3_optimized.js)
   - 刷课 + 自动答题：[v1_autoAnswer_optimized.js](v1_autoAnswer_optimized.js)
4. 不要两套同时粘贴

首次执行后可用：

```javascript
app.run()
app.nextUnit()
```

合并版若要自动答题（默认是跳过）：

```javascript
app.configs.skipChapterTest = false
app.configs.autoAnswer = true
app.configs.autoRedo = true
app.configs.autoRedoTimes = 2
app.run()
```

查看 / 清空答案库（合并版或单独答题脚本）：

```javascript
dumpQuizAnswers()
clearQuizAnswers()
```

### 方法二：Tampermonkey

1. 安装 Tampermonkey
2. 导入其一（不要同时启用）：
   - 仅刷课：[v3_optimized.user.js](v3_optimized.user.js)
   - 刷课 + 自动答题：[v1_autoAnswer_optimized.user.js](v1_autoAnswer_optimized.user.js)
3. 确认脚本已启用
4. 刷新学习通播放页面

合并版油猴默认同样是 `skipChapterTest: true`。要自动答题时，在控制台改上面的 `app.configs` 即可（油猴脚本改完后刷新仍会回到文件里的默认值；需要持久默认就把配置写进源码再重新 `build-userscript`）。

## 已知说明

### 0. 无视频或课件页面

默认不会自动跳过无法识别的无视频页面，避免在课件未完成时反复触发“当前章节还有任务未完成”的平台提示。控制台会给出明确日志；确认当前节点无需处理后，可手动执行 `app.nextUnit()`。

如果课程结构已确认安全，才可在控制台将 `app.configs.autoAdvanceNoVideo = true`，让脚本自动切换无视频小节。

### 1. 为什么有时会看到 `AbortError`

常见报错：

```text
The play() request was interrupted by a call to pause()
```

这通常不是视频坏了，而是：

- 页面从步骤页切到视频页时，播放器初始化会短暂停一下
- 页面内部脚本会在加载过程中重置播放状态
- 浏览器对媒体播放请求进行了短暂中断

脚本会优先尝试恢复播放，而不是立即判定失败。

### 2. 为什么会出现重复日志

如果同一页面反复粘贴执行脚本，会导致同一套监听和定时逻辑叠加，从而出现多次日志。

建议：

- 刷新页面后只执行一次
- 如果使用油猴版，尽量不要再在控制台重复粘贴执行
- 仅刷课油猴与合并版油猴不要同时开

### 3. 为什么“静音播放成功”但一开始还能听到声音

旧逻辑里曾经会在静音启动成功后恢复声音。当前建议使用持续静音方式，不再自动恢复。

### 4. 测验页识别与重做计数

- 有的课步骤名不是「章节测验」，合并版也会按测验 iframe 识别
- 多测验 iframe 按 `workId` 分别处理，避免串台
- `autoRedoTimes` 按课程 + `workId` 记在 `localStorage`；达上限会跳过，`clearQuizAnswers()` 一并清空

### 5. 合并版源码怎么更新

改完 `v3_optimized.js` / `v1_autoAnswer.js` 后：

```bash
node scripts/build-v1-optimized.mjs
node scripts/build-userscript.mjs
```

## 当前调试结论

目前这版已经验证：

- 顶部 `2视频` 标签可以程序化点击
- 手动进入视频页后可以自动播放
- 静音恢复链路可用
- 合并版在测试课可识别多测验 iframe，并按配置跳过或自动答题

目前重点保留的是稳定性，再叠加功能时优先走配置开关。

## 维护与验证

修改 `v3_optimized.js` 后：

```bash
node scripts/build-userscript.mjs
node tests/verify-v3.mjs
```

修改答题或合并逻辑后，再执行：

```bash
node scripts/build-v1-optimized.mjs
node scripts/build-userscript.mjs
```

`verify-v3.mjs` 会验证 v3 入口语法，并确认油猴脚本与对应源码一致。

## 免责声明

本项目仅用于脚本调试、前端自动化研究和页面行为分析，请遵守目标平台的使用规定。
