# 学习通自动播放脚本 V3 稳定版

这是基于原 `v3_optimized.js` 整理后的学习通课程自动化脚本。当前维护重点是稳定播放、默认 1x 倍速、自动处理同小节多任务点，并尽量避免误判导致的循环弹窗或错误滚动。

当前 Chrome 扩展版本：`3.2.0.9`

## 主要功能

- 默认播放速度为 `1x`，并持续锁定，避免页面自动切回 `1.5x`。
- 自动识别并播放视频任务点。
- 支持同一小节内存在多个视频任务点，按顺序逐个检查和播放。
- 如果某个视频任务点已经完成，会自动跳过并检查下一个视频任务点。
- 如果当前小节内所有视频任务点都已完成，会直接进入下一节。
- 自动识别教材、文档、阅读类任务点，逐步滚动到文档底部。
- 阅读任务只有在检测到任务点完成后才会进入下一节，避免滚到底就误跳。
- 章节测验页面会尝试跳过，并处理“当前章节还有任务点未完成，是否去完成？”弹窗。
- 视频任务优先级高于教材阅读判断，避免把视频页误判成教材文本页。
- 避免跨域 iframe 扫描报错刷屏。
- 支持 Tampermonkey 用户脚本和 Chrome 开发者模式扩展两种使用方式。

## 文件说明

- `v3_optimized.user.js`
  Tampermonkey 用户脚本版本。

- `v3_optimized.js`
  可在浏览器控制台中直接执行的版本。

- `chrome-extension/`
  Chrome 开发者模式可加载的本地扩展目录。

- `tests/`
  针对倍速锁定、弹窗处理、视频任务点、教材阅读、任务类型识别等逻辑的静态回归检查。

## 推荐安装方式：Chrome 扩展

1. 打开 Chrome 的 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择仓库里的 `chrome-extension` 目录。
5. 如果已经加载过旧版本，修改代码后需要点击扩展卡片上的“重新加载”。

当前扩展会注入 `chrome-extension/v3_optimized.user.js`，所以每次更新后都需要重新加载扩展，浏览器才会使用新版本。

## Tampermonkey 使用方式

1. 安装 Tampermonkey。
2. 新建脚本。
3. 复制 `v3_optimized.user.js` 的完整内容。
4. 保存并启用脚本。
5. 刷新学习通课程播放页面。

## 控制台使用方式

1. 打开学习通课程播放页面。
2. 按 `F12` 打开开发者工具。
3. 进入 `Console`。
4. 复制 `v3_optimized.js` 的完整内容并执行。

首次执行后可手动调用：

```javascript
app.run()
app.nextUnit()
```

## 当前行为说明

### 默认倍速

脚本默认配置为：

```javascript
playbackRate: 1
```

页面播放器如果自行改回其他倍速，脚本会在播放、暂停恢复、倍速变化和定时检查时重新设置为 `1x`。

### 视频任务点

进入视频页后，脚本会：

- 扫描当前页面和可访问 iframe 中的视频任务 iframe。
- 找到真实的 `video` 元素并尝试播放。
- 播放失败时尝试静音播放。
- 视频暂停或长时间无进度时尝试恢复播放。
- 视频结束后检查同小节内是否还有未完成的视频任务点。

如果某个视频任务点已经显示完成，脚本会跳过它；如果本小节所有视频任务点都完成，脚本会直接进入下一节。

### 教材和文本阅读任务

脚本会在确认当前任务不是视频、不是章节测验后，才进入阅读任务流程。

阅读任务会逐步滚动页面和文档容器。滚动到底部后，如果任务点仍未完成，脚本会继续等待和检测，不会直接切到下一节。

### 章节测验

章节测验页面会尝试点击下一节跳过。遇到“当前章节还有任务点未完成，是否去完成？”弹窗时，脚本会根据当前页面类型处理：

- 普通学习任务：点击“去学习”或“去完成”。
- 章节测验：优先点击“下一节”，避免在测验页和弹窗之间反复循环。

### 任务类型识别

任务类型判断的优先级为：

1. 视频任务
2. 章节测验
3. 教材、文档、阅读任务
4. 未知任务

这样可以避免视频 iframe 加载较慢时，被误判成教材阅读页面而一直滚动。

## 常见问题

### 仍然跑旧逻辑怎么办？

如果使用 Chrome 扩展，请打开 `chrome://extensions/`，点击该扩展的“重新加载”，然后刷新学习通页面。

如果使用 Tampermonkey，请确认脚本内容已经替换成最新的 `v3_optimized.user.js`。

### 为什么控制台仍然有学习通自己的报错？

学习通页面本身会加载多个内部脚本和跨域 iframe，控制台可能出现平台自身的 warning 或 error。脚本已尽量忽略可预期的跨域 iframe 访问错误，重点看是否还有来自 `v3_optimized.user.js` 的连续异常。

### 为什么阅读任务滚到底后没有立刻下一节？

这是有意设计。部分教材任务需要页面上报完成状态后才算任务点完成，所以脚本会等待“任务点已完成”信号，避免滚到底但任务未完成就误跳。

## 验证脚本

可在仓库根目录运行：

```bash
node tests/verify-dialog-throttle.js
node tests/verify-no-skip-and-frame-guard.js
node tests/verify-flow-fixes.js
node tests/verify-reading-task.js
node tests/verify-speed-lock.js
node tests/verify-jquery-compat.js
node tests/verify-task-classification.js
node tests/verify-video-completion-skip.js
```

也可以对主要脚本做语法检查：

```bash
node --check v3_optimized.user.js
node --check chrome-extension/v3_optimized.user.js
node --check v3_optimized.js
node --check chrome-extension/content.js
```

## 免责声明

本项目仅用于脚本调试、前端自动化研究和页面行为分析。请遵守目标平台的使用规定。
