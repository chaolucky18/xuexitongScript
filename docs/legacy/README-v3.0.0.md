# 🎓 学习通自动刷课助手 V3.0

<div align="center">

![Banner](img/banner.png)

<h3>🚀 自动化 · 🚀 智能化 · 🚀 省时省力</h3>

[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](https://github.com/xuexitong/xuexitong)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20|%20Mac%20|%20Linux-orange.svg)](README.md)

*让刷课变得如此简单，一键启动，自动完成！*

</div>

---

## ✨ 功能亮点

| 🎯 功能 | 📝 说明 |
|:--------|:--------|
| 🔄 **自动播放** | 无需手动操作，打开页面自动开始 |
| ⚡ **2倍速播放** | 学习通最高支持倍速，节省50%时间 |
| 🔍 **状态监控** | 实时监测视频状态，暂停自动恢复 |
| ⏭️ **自动跳转** | 视频播完自动切换下一章节 |
| 🔇 **静音播放** | 播放失败自动尝试静音模式 |
| 🎮 **控制面板** | 可视化操作界面，随时控制 |

---

## 🎯 三种安装方式，总有一款适合你

### 方式一：🌿 油猴脚本安装（⭐ 推荐）

> *最简单！安装一次，永久自动运行*

#### 第一步：安装 Tampermonkey 扩展

| 浏览器 | 安装方法 |
|:------|:--------|
| Chrome | 打开 [Chrome 应用商店](https://chrome.google.com/webstore)，搜索 **Tampermonkey**，点击安装 |
| Edge | 打开 [Edge 扩展商店](https://microsoftedge.microsoft.com/)，搜索 **Tampermonkey**，点击安装 |
| Firefox | 打开 [Firefox 附加组件](https://addons.mozilla.org/)，搜索 **Tampermonkey**，点击安装 |

#### 第二步：安装学习通刷课脚本

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│    📁 把这个文件拖到浏览器窗口：                             │
│                                                             │
│    【学习通自动刷课助手.user.js】                            │
│                                                             │
│    或者双击该文件用浏览器打开                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 第三步：开始使用！

```
✅ 打开学习通课程页面
✅ 脚本自动运行
✅ 右上角出现控制面板
✅ 自动刷课开始！
```

---

### 方式二：🔧 手动控制台安装

> *适合不想安装扩展的用户*

#### 第一步：打开学习通课程页面

进入你要学习的课程页面，选择要继续学习的那一节。

#### 第二步：打开开发者工具

按键盘上的 **`F12`** 键，打开开发者工具面板。

#### 第三步：切换到 Console

在开发者工具中，点击顶部的 **Console（控制台）** 选项卡。

#### 第四步：粘贴代码

用文本编辑器打开 `v3_optimized.js` 文件，复制全部代码，粘贴到控制台输入框中。

#### 第五步：回车执行

按 **`Enter`** 回车键，脚本开始运行！

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   📋 代码示例：                                             │
│                                                             │
│   > 打开 v3_optimized.js 文件                               │
│   > 全选内容 (Ctrl + A)                                     │
│   > 复制 (Ctrl + C)                                         │
│   > 粘贴到 Console (Ctrl + V)                               │
│   > 按回车 (Enter)                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 方式三：📱 书签方式安装

> *适合轻度用户，一次性使用*

1. 在浏览器中新建一个书签
2. 书签名称填写：**学习通刷课**
3. 书签网址填写以下代码：

```javascript
javascript:(function(){if(typeof window.jQuery==='undefined'){var s=document.createElement('script');s.src='https://code.jquery.com/jquery-3.6.0.min.js';document.head.appendChild(s);}var t=setInterval(function(){if(typeof window.jQuery!=='undefined'){clearInterval(t);window.app={configs:{playbackRate:2,autoplay:true,retryInterval:2000,maxRetries:10,videoCheckInterval:1000},_videoEl:null,_treeContainerEl:null,_isPlaying:false,_checkInterval:null,_cellData:{cells:0,nCells:0,currentCellIndex:0,currentNCellIndex:0,currentVideoTitle:''},run(){console.log('%c=== 学习通自动刷脚脚本 V3 优化版启动 ===','color:#4CAF50;font-size:16px;font-weight:bold');this._getTreeContainer();this._initCellData();this._videoEl=null;this._getVideoEl();this._clearCheckInterval();this.play()},nextUnit(){console.log('%c=== 准备切换到下一小节 ===','color:#2196F3;font-size:14px');const el=this._getTreeContainer();const cells=el.children('ul').children('li');const nCells=$(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');if(nCells.length>this._cellData.currentNCellIndex+1){const nextNIndex=this._cellData.currentNCellIndex+1;this.playCurrentIndex(nCells.get(nextNIndex))}else{const nextIndex=this._cellData.currentCellIndex+1;if(nextIndex>=cells.length){console.log('%c=====================================','color:#4CAF50;font-size:16px');console.log('%c==============本课程学习完成了==============','color:#4CAF50;font-size:16px;font-weight:bold');console.log('%c=====================================','color:#4CAF50;font-size:16px');this._clearCheckInterval();return}this._cellData.currentCellIndex=nextIndex;this._cellData.currentNCellIndex=0;this.playCurrentIndex()}},_clearCheckInterval(){if(this._checkInterval){clearInterval(this._checkInterval);this._checkInterval=null}},_startVideoMonitoring(){this._clearCheckInterval();this._checkInterval=setInterval(()=>{this._checkVideoStatus()},this.configs.videoCheckInterval)},_checkVideoStatus(){try{const video=this._getVideoEl();if(!video)return;if(video.paused&&this._isPlaying){console.log('%c检测到视频暂停，尝试恢复播放...','color:#FF5722');video.play().catch(e=>{console.error('恢复播放失败:',e)})}if(video.ended&&this._isPlaying){console.log('%c检测到视频结束，准备切换下一个...','color:#9C27B0');this._isPlaying=false;setTimeout(()=>this.nextUnit(),1000)}}catch(e){console.error('视频状态检查失败:',e)}},_tryTimes:0,async play(){try{const el=this._getVideoEl();if(el==null){if(document.getElementsByClassName('prev_title')[0]&&document.getElementsByClassName('prev_title')[0].title!=='章节测验'){throw new Error('播放失败：视频元素为空')}console.log('%c===========跳过章节测验，2秒后继续播放==============','color:#607D8B');$('#prevNextFocusNext').click();setTimeout(()=>{this.play()},2000);return}this._tryTimes=0;this._isPlaying=true;this._videoEventHandle();el.playbackRate=this.configs.playbackRate;try{await el.play();console.log('%c视频开始播放，倍速: '+el.playbackRate+'x','color:#4CAF50');this._startVideoMonitoring()}catch(playError){console.error('视频播放失败:',playError);this._handlePlayError(playError)}}catch(e){if(this._tryTimes>this.configs.maxRetries){console.error('%c视频播放失败，已达到最大重试次数','color:#F44336;font-weight:bold',e);this._clearCheckInterval();return}this._tryTimes++;console.log('%c播放失败，'+(this.configs.retryInterval/1000)+'秒后重试 ('+this._tryTimes+'/'+this.configs.maxRetries+')','color:#FF9800');setTimeout(()=>{this.play()},this.configs.retryInterval)}},_handlePlayError(error){console.error('播放错误详情:',error);const video=this._getVideoEl();if(video){video.muted=true;video.play().then(()=>{console.log('%c静音播放成功','color:#4CAF50');setTimeout(()=>{video.muted=false},2000)}).catch(e=>{console.error('静音播放也失败:',e);setTimeout(()=>this.nextUnit(),3000)})}},playCurrentIndex(nCell){if(!nCell){const el=this._getTreeContainer();const cells=el.children('ul').children('li');const nCells=$(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');nCell=nCells.get(this._cellData.currentNCellIndex)}const $nCell=$(nCell);const clickableSpan=$nCell.find('.posCatalog_name')[0];if(!clickableSpan){console.error('%c===========找不到可点击的课程节点，播放下一个视频失败==============','color:#F44336');setTimeout(()=>this.nextUnit(),2000);return}console.log('%c点击切换到: '+($(clickableSpan).attr('title')||'未知标题'),'color:#2196F3');$(clickableSpan).click();this._videoEl=null;this._isPlaying=false;console.log('%c等待视频加载...','color:#FF9800');setTimeout(()=>{this._initCellData();if(this.configs.autoplay){this.play()}},3000)},_initCellData(){const el=this._getTreeContainer();const cells=el.children('ul').children('li');this._cellData.cells=cells.length;let nCellCounts=0;let foundCurrent=false;cells.each((i,v)=>{const nCells=$(v).find('.posCatalog_select:not(.firstLayer)');nCellCounts+=nCells.length;nCells.each((j,e)=>{const _el=$(e);if(_el.hasClass('posCatalog_active')){this._cellData.currentCellIndex=i;this._cellData.currentNCellIndex=j;foundCurrent=true;const titleSpan=_el.find('.posCatalog_name')[0];if(titleSpan){this._cellData.currentVideoTitle=$(titleSpan).attr('title')}}})});this._cellData.nCells=nCellCounts;if(!foundCurrent&&nCellCounts>0){console.warn('%c未找到当前激活的视频节点，可能需要手动选择','color:#FF9800')}console.log('%c课程信息: '+this._cellData.cells+'章, '+this._cellData.nCells+'节, 当前: 第'+(this._cellData.currentCellIndex+1)+'章第'+(this._cellData.currentNCellIndex+1)+'节','color:#607D8B')},_getTreeContainer(){if(!this._treeContainerEl){const el=$('#coursetree');if(el.length<=0){throw new Error('找不到视频列表')}this._treeContainerEl=el}return this._treeContainerEl},_getVideoEl(){if(!this._videoEl){try{const frameObj=$('iframe').eq(0).contents().find('iframe.ans-insertvideo-online');if(frameObj.length===0){return null}this._videoEl=frameObj.contents().eq(0).find('video#video_html5_api').get(0)}catch(e){console.error('获取视频元素失败:',e);return null}}if(!this._videoEl){throw new Error('视频组件Video未加载完成')}return this._videoEl},_videoEventHandle(){const el=this._videoEl;if(!el){console.log('videoEl未加载');return}el.removeEventListener('ended',this._handleVideoEnded);el.removeEventListener('loadedmetadata',this._handleVideoLoaded);el.removeEventListener('play',this._handleVideoPlay);el.removeEventListener('pause',this._handleVideoPause);el.addEventListener('ended',this._handleVideoEnded.bind(this));el.addEventListener('loadedmetadata',this._handleVideoLoaded.bind(this));el.addEventListener('play',this._handleVideoPlay.bind(this));el.addEventListener('pause',this._handleVideoPause.bind(this))},_handleVideoEnded(e){const title=this._cellData.currentVideoTitle;console.log('%c============'+title+' 播放完成=============','color:#4CAF50;font-weight:bold');this._isPlaying=false;this._clearCheckInterval();setTimeout(()=>this.nextUnit(),1000)},_handleVideoLoaded(e){console.log('%c============视频加载完成=============','color:#2196F3');if(this.configs.autoplay&&!this._isPlaying){this.play()}},_handleVideoPlay(e){const title=this._cellData.currentVideoTitle;console.log('%c============'+title+' 开始播放=============','color:#4CAF50');this._isPlaying=true},_handleVideoPause(e){console.log('%c============视频暂停=============','color:#FF9800')}};window.app.run();}},1000)})();
```

4. 进入学习通课程页面后，点击书签即可运行脚本

---

## 🎮 界面说明

安装完成后，页面右上角会显示控制面板：

```
┌─────────────────────────────────┐
│  🎓 学习通刷课助手              │
│  状态: 运行中                   │
│  ┌─────┐ ┌─────┐ ┌─────┐       │
│  │开始 │ │停止 │ │下一节│      │
│  └─────┘ └─────┘ └─────┘       │
│  播放倍速: 2x                    │
└─────────────────────────────────┘
```

### 控制按钮

| 按钮 | 功能 |
|:----|:-----|
| 🟢 **开始** | 重新启动脚本 |
| 🔴 **停止** | 停止自动刷课 |
| 🔵 **下一节** | 手动跳转到下一章节 |

---

## ⚙️ 配置选项

如果你想自定义配置，可以修改脚本顶部的配置：

```javascript
const Configs = {
    playbackRate: 2,           // 播放倍速（建议不要超过2倍）
    autoplay: true,            // 自动播放
    retryInterval: 2000,       // 重试间隔（毫秒）
    maxRetries: 10,            // 最大重试次数
    videoCheckInterval: 1000   // 视频状态检查间隔
};
```

---

## 📊 版本对比

| 功能特性 | V1 版本 | V2 版本 | V3 版本 ⭐ |
|:--------|:-------:|:-------:|:----------:|
| 基础自动播放 | ✅ | ✅ | ✅ |
| 2倍速播放 | ❌ (8倍) | ✅ | ✅ |
| 自动章节跳转 | ✅ | ✅ | ✅ |
| 视频状态监控 | ❌ | ❌ | ✅ |
| 暂停自动恢复 | ❌ | ❌ | ✅ |
| 静音播放机制 | ❌ | ❌ | ✅ |
| 页面焦点处理 | ❌ | ❌ | ✅ |
| 可视化控制面板 | ❌ | ❌ | ✅ |
| 错误重试机制 | 基础 | 基础 | 智能重试 |
| 详细彩色日志 | ❌ | ❌ | ✅ |
| 油猴脚本支持 | ❌ | ❌ | ✅ |

---

## 🔧 常见问题

### ❓ 脚本无法运行？

1. 确认已安装 **Tampermonkey** 扩展
2. 确认脚本已正确安装（Tampermonkey 管理面板中可以看到）
3. 确认在**学习通课程播放页面**，不是首页或其他页面
4. 尝试**刷新页面**后重新运行

### ❓ 视频仍然暂停？

1. 检查**网络连接**是否稳定
2. 尝试降低播放倍速到 **1.5倍**
3. 确保浏览器标签页保持在**前台**
4. 关闭其他占用资源的程序

### ❓ 控制台显示错误？

1. **"找不到视频列表"** - 请在正确的课程目录页面运行
2. **"视频组件Video未加载完成"** - 等待视频加载，3秒后自动重试
3. **"播放失败"** - 网络波动，脚本会自动重试

### ❓ 章节测验怎么办？

脚本会**自动跳过**章节测验页面，无需手动处理。

---

## 🎨 日志颜色说明

脚本会在控制台输出彩色日志：

| 颜色 | 含义 |
|:----|:----|
| 🟢 绿色 | 操作成功、视频开始播放 |
| 🔵 蓝色 | 状态信息、视频加载完成 |
| 🟠 橙色 | 警告信息、重试提示 |
| 🔴 红色 | 错误信息、失败提示 |
| 🟣 紫色 | 视频切换提示 |

---

## 📝 版本历史

### V3.0.0 (当前版本) ⭐

- ✨ **全新发布** 油猴脚本支持，一键安装永久使用
- ✨ **新增** 可视化控制面板
- ✨ **优化** 视频状态监控系统
- ✨ **优化** 静音播放失败处理
- ✨ **优化** 错误重试机制（最多10次）
- ✨ **优化** 页面焦点处理，防止切换标签暂停

### V2.0

- 🔄 重构代码结构
- 🔄 添加自动启动功能
- 🔄 支持快捷方法调用

### V1.0

- 🎉 初始版本发布
- 🎉 基础自动播放功能
- 🎉 8倍速播放支持

---

## ⚠️ 免责声明

- 本脚本仅供**学习和技术研究**使用
- 请遵守超星学习通平台的**使用规定**
- 作者不对因使用本脚本造成的任何问题负责
- 若因此产生任何后果，概由使用者自行承担

---

## 🙏 致谢

感谢所有为此项目提供反馈和建议的用户！

---

<div align="center">

**made with ❤️ for students**

*如果对你有帮助，请点个 Star ⭐*

</div>
