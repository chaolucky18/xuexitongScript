# 多视频增强油猴版

这是一个独立的 Tampermonkey 版本，不依赖 `deepseek-console` 的本地服务。DeepSeek API Key 保存在 Tampermonkey 的脚本存储中，页面刷新或整页跳转后仍可继续使用。

脚本文件：`xuexitong-deepseek-1.8.4.user.js`

## 和现有版本的区别

- 直接请求 DeepSeek API，不需要启动本地端口，也不需要辅助窗口。
- 扫描主文档、嵌套 iframe 和 Shadow DOM 中的视频。
- 识别 `ans-insertvideo-online` 视频卡片，支持同一小节中的隐藏、懒加载和纵向排列视频。
- 完成一个视频后先处理本页下一段，全部视频完成后才进入下一小节。
- 按视频自己的任务卡片判断完成状态，避免页面顶部的“任务点已完成”错误影响未观看视频。
- 已观看的视频不会重播；只观看了一部分的视频仍会继续播放。
- 视频或特殊页面加载最多等待 15 秒，之后依次尝试页面 Next、iframe Next、课程目录和 DeepSeek 导航判断。
- 章节测验会识别题目和选项、调用 DeepSeek、核对题量与答案后提交。
- 不修改 `playbackRate`。

## 安装

1. 安装 Tampermonkey。
2. 新建脚本并粘贴 `xuexitong-deepseek-1.8.4.user.js` 的全部内容。
3. 保存后打开学习通课程播放页。
4. 首次运行时点击右下角“配置 API”，填写自己的 DeepSeek API Key。

API Key 不会写入网页 localStorage，也不会出现在脚本源码中。题目和选项会发送到 DeepSeek API，调用可能产生费用。

## 测试

```bash
npm install
npm test
```

测试覆盖多视频队列、隐藏和懒加载视频卡片、Shadow DOM、iframe 导航、特殊信息页、15 秒兜底以及已观看跳过。

学习通页面结构可能变化。遇到无法识别的页面时，脚本会在右下角显示当前步骤和停止原因，不会无限循环点击。
