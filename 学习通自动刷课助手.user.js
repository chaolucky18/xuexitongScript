// ==UserScript==
// @name         学习通自动刷课助手
// @namespace    https://github.com/xuexitong
// @version      3.0.0
// @description  超星学习通自动刷课脚本，支持自动播放、自动跳转、状态监控、2倍速播放。安装后打开学习通课程页面自动运行，无需手动操作。
// @author       xuexitong
// @license      MIT
// @match        *://*.chaoxing.com/*
// @match        *://*.study.chaoxing.com/*
// @match        *://*.edu.chaoxing.com/*
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_NAME = '学习通自动刷课助手';
    const SCRIPT_VERSION = '3.0.0';

    const Configs = {
        playbackRate: 2,
        autoplay: true,
        retryInterval: 2000,
        maxRetries: 10,
        videoCheckInterval: 1000,
    };

    class XuexitongAutoPlayer {
        constructor() {
            this._videoEl = null;
            this._treeContainerEl = null;
            this._isPlaying = false;
            this._currentRetryCount = 0;
            this._checkInterval = null;
            this._cellData = {
                cells: 0,
                nCells: 0,
                currentCellIndex: 0,
                currentNCellIndex: 0,
                currentVideoTitle: '',
            };
            this._tryTimes = 0;
        }

        run() {
            this._log('%c=== ' + SCRIPT_NAME + ' v' + SCRIPT_VERSION + ' 启动 ===', 'color:#4CAF50;font-size:16px;font-weight:bold');
            this._getTreeContainer();
            this._initCellData();
            this._videoEl = null;
            this._getVideoEl();
            this._clearCheckInterval();
            this.play();
        }

        stop() {
            this._clearCheckInterval();
            this._isPlaying = false;
            this._log('%c脚本已停止', 'color:#607D8B');
        }

        nextUnit() {
            this._log('%c=== 准备切换到下一小节 ===', 'color:#2196F3;font-size:14px');
            const el = this._getTreeContainer();
            const cells = el.children('ul').children('li');
            const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');

            if (nCells.length > this._cellData.currentNCellIndex + 1) {
                const nextNIndex = this._cellData.currentNCellIndex + 1;
                this._log('切换到同章节下一个视频: ' + (nextNIndex + 1) + '/' + nCells.length, 'color:#FF9800');
                this.playCurrentIndex(nCells.get(nextNIndex));
            } else {
                const nextIndex = this._cellData.currentCellIndex + 1;
                if (nextIndex >= cells.length) {
                    this._log('%c=====================================','color:#4CAF50;font-size:16px');
                    this._log('%c==============本课程学习完成了==============','color:#4CAF50;font-size:16px;font-weight:bold');
                    this._log('%c=====================================','color:#4CAF50;font-size:16px');
                    this._clearCheckInterval();
                    return;
                }
                this._log('切换到下一个章节: ' + (nextIndex + 1) + '/' + cells.length, 'color:#FF9800');
                this._cellData.currentCellIndex = nextIndex;
                this._cellData.currentNCellIndex = 0;
                this.playCurrentIndex();
            }
        }

        _clearCheckInterval() {
            if (this._checkInterval) {
                clearInterval(this._checkInterval);
                this._checkInterval = null;
            }
        }

        _startVideoMonitoring() {
            this._clearCheckInterval();
            this._checkInterval = setInterval(() => {
                this._checkVideoStatus();
            }, Configs.videoCheckInterval);
        }

        _checkVideoStatus() {
            try {
                const video = this._getVideoEl();
                if (!video) return;

                if (video.paused && this._isPlaying) {
                    this._log('检测到视频暂停，尝试恢复播放...', 'color:#FF5722');
                    video.play().catch(e => {
                        console.error('恢复播放失败:', e);
                    });
                }

                if (video.ended && this._isPlaying) {
                    this._log('检测到视频结束，准备切换下一个...', 'color:#9C27B0');
                    this._isPlaying = false;
                    setTimeout(() => this.nextUnit(), 1000);
                }
            } catch (e) {
                console.error('视频状态检查失败:', e);
            }
        }

        async play() {
            try {
                const el = this._getVideoEl();
                if (el == null) {
                    if (document.getElementsByClassName('prev_title')[0] &&
                        document.getElementsByClassName('prev_title')[0].title !== '章节测验') {
                        throw new Error('播放失败：视频元素为空');
                    }
                    this._log('===========跳过章节测验，2秒后继续播放==============', 'color:#607D8B');
                    $('#prevNextFocusNext').click();
                    setTimeout(() => {
                        this.play();
                    }, 2000);
                    return;
                }

                this._tryTimes = 0;
                this._isPlaying = true;
                this._videoEventHandle();
                el.playbackRate = Configs.playbackRate;

                try {
                    await el.play();
                    this._log('视频开始播放，倍速: ' + el.playbackRate + 'x', 'color:#4CAF50');
                    this._startVideoMonitoring();
                } catch (playError) {
                    console.error('视频播放失败:', playError);
                    this._handlePlayError(playError);
                }

            } catch (e) {
                if (this._tryTimes > Configs.maxRetries) {
                    console.error('%c视频播放失败，已达到最大重试次数', 'color:#F44336;font-weight:bold', e);
                    this._clearCheckInterval();
                    return;
                }
                this._tryTimes++;
                this._log('播放失败，' + (Configs.retryInterval / 1000) + '秒后重试 (' + this._tryTimes + '/' + Configs.maxRetries + ')', 'color:#FF9800');
                setTimeout(() => {
                    this.play();
                }, Configs.retryInterval);
            }
        }

        _handlePlayError(error) {
            console.error('播放错误详情:', error);
            const video = this._getVideoEl();
            if (video) {
                video.muted = true;
                video.play().then(() => {
                    this._log('静音播放成功', 'color:#4CAF50');
                    setTimeout(() => {
                        video.muted = false;
                    }, 2000);
                }).catch(e => {
                    console.error('静音播放也失败:', e);
                    setTimeout(() => this.nextUnit(), 3000);
                });
            }
        }

        playCurrentIndex(nCell) {
            if (!nCell) {
                const el = this._getTreeContainer();
                const cells = el.children('ul').children('li');
                const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                nCell = nCells.get(this._cellData.currentNCellIndex);
            }

            const $nCell = $(nCell);
            const clickableSpan = $nCell.find('.posCatalog_name')[0];
            if (!clickableSpan) {
                this._log('===========找不到可点击的课程节点，播放下一个视频失败==============', 'color:#F44336');
                setTimeout(() => this.nextUnit(), 2000);
                return;
            }

            this._log('点击切换到: ' + ($(clickableSpan).attr('title') || '未知标题'), 'color:#2196F3');
            $(clickableSpan).click();
            this._videoEl = null;
            this._isPlaying = false;

            this._log('等待视频加载...', 'color:#FF9800');
            setTimeout(() => {
                this._initCellData();
                if (Configs.autoplay) {
                    this.play();
                }
            }, 3000);
        }

        _initCellData() {
            const el = this._getTreeContainer();
            const cells = el.children('ul').children('li');
            this._cellData.cells = cells.length;
            let nCellCounts = 0;
            let foundCurrent = false;

            cells.each((i, v) => {
                const nCells = $(v).find('.posCatalog_select:not(.firstLayer)');
                nCellCounts += nCells.length;
                nCells.each((j, e) => {
                    const _el = $(e);
                    if (_el.hasClass('posCatalog_active')) {
                        this._cellData.currentCellIndex = i;
                        this._cellData.currentNCellIndex = j;
                        foundCurrent = true;
                        const titleSpan = _el.find('.posCatalog_name')[0];
                        if (titleSpan) {
                            this._cellData.currentVideoTitle = $(titleSpan).attr('title');
                        }
                    }
                });
            });

            this._cellData.nCells = nCellCounts;

            if (!foundCurrent && nCellCounts > 0) {
                this._log('未找到当前激活的视频节点，可能需要手动选择', 'color:#FF9800');
            }

            this._log('课程信息: ' + this._cellData.cells + '章, ' + this._cellData.nCells + '节, 当前: 第' + (this._cellData.currentCellIndex + 1) + '章第' + (this._cellData.currentNCellIndex + 1) + '节', 'color:#607D8B');
        }

        _getTreeContainer() {
            if (!this._treeContainerEl) {
                const el = $('#coursetree');
                if (el.length <= 0) {
                    throw new Error('找不到视频列表');
                }
                this._treeContainerEl = el;
            }
            return this._treeContainerEl;
        }

        _getVideoEl() {
            if (!this._videoEl) {
                try {
                    const frameObj = $('iframe').eq(0).contents().find('iframe.ans-insertvideo-online');
                    if (frameObj.length === 0) {
                        return null;
                    }
                    this._videoEl = frameObj.contents().eq(0).find('video#video_html5_api').get(0);
                } catch (e) {
                    console.error('获取视频元素失败:', e);
                    return null;
                }
            }
            if (!this._videoEl) {
                throw new Error('视频组件Video未加载完成');
            }
            return this._videoEl;
        }

        _videoEventHandle() {
            const el = this._videoEl;
            if (!el) {
                this._log('videoEl未加载');
                return;
            }

            el.removeEventListener('ended', this._handleVideoEnded);
            el.removeEventListener('loadedmetadata', this._handleVideoLoaded);
            el.removeEventListener('play', this._handleVideoPlay);
            el.removeEventListener('pause', this._handleVideoPause);

            el.addEventListener('ended', this._handleVideoEnded.bind(this));
            el.addEventListener('loadedmetadata', this._handleVideoLoaded.bind(this));
            el.addEventListener('play', this._handleVideoPlay.bind(this));
            el.addEventListener('pause', this._handleVideoPause.bind(this));
        }

        _handleVideoEnded(e) {
            const title = this._cellData.currentVideoTitle;
            this._log("============'" + title + "' 播放完成=============", 'color:#4CAF50;font-weight:bold');
            this._isPlaying = false;
            this._clearCheckInterval();
            setTimeout(() => this.nextUnit(), 1000);
        }

        _handleVideoLoaded(e) {
            this._log('============视频加载完成=============', 'color:#2196F3');
            if (Configs.autoplay && !this._isPlaying) {
                this.play();
            }
        }

        _handleVideoPlay(e) {
            const title = this._cellData.currentVideoTitle;
            this._log("============'" + title + "' 开始播放=============", 'color:#4CAF50');
            this._isPlaying = true;
        }

        _handleVideoPause(e) {
            this._log('============视频暂停=============', 'color:#FF9800');
        }

        _log(message, style) {
            console.log('%c' + message, style || 'color:#333');
        }
    }

    const app = new XuexitongAutoPlayer();
    window.xuexitongApp = app;

    function preventVideoPause() {
        document.addEventListener('mouseleave', (e) => e.stopPropagation());
        document.addEventListener('mouseout', (e) => e.stopPropagation());
        window.addEventListener('blur', (e) => {
            const video = app._getVideoEl();
            if (video && video.paused && app._isPlaying) {
                video.play().catch(err => console.log('自动恢复播放失败:', err));
            }
        });
    }

    function createControlPanel() {
        const panel = document.createElement('div');
        panel.id = 'xuexitong-control-panel';
        panel.innerHTML = `
            <style>
                #xuexitong-control-panel {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    z-index: 999999;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 12px;
                    padding: 12px 16px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    color: white;
                    min-width: 180px;
                }
                #xuexitong-control-panel h3 {
                    margin: 0 0 10px 0;
                    font-size: 14px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                #xuexitong-control-panel .status {
                    font-size: 12px;
                    opacity: 0.9;
                    margin-bottom: 10px;
                }
                #xuexitong-control-panel .btn-group {
                    display: flex;
                    gap: 8px;
                }
                #xuexitong-control-panel button {
                    flex: 1;
                    padding: 8px 12px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    transition: all 0.2s;
                }
                #xuexitong-control-panel .btn-start {
                    background: #4CAF50;
                    color: white;
                }
                #xuexitong-control-panel .btn-start:hover {
                    background: #45a049;
                }
                #xuexitong-control-panel .btn-stop {
                    background: #f44336;
                    color: white;
                }
                #xuexitong-control-panel .btn-stop:hover {
                    background: #da190b;
                }
                #xuexitong-control-panel .btn-next {
                    background: #2196F3;
                    color: white;
                }
                #xuexitong-control-panel .btn-next:hover {
                    background: #0b7dda;
                }
                #xuexitong-control-panel .speed-info {
                    margin-top: 10px;
                    font-size: 11px;
                    opacity: 0.8;
                }
            </style>
            <h3>🎓 学习通刷课助手</h3>
            <div class="status">状态: <span id="xuexitong-status">运行中</span></div>
            <div class="btn-group">
                <button class="btn-start" onclick="xuexitongApp.run()">开始</button>
                <button class="btn-stop" onclick="xuexitongApp.stop()">停止</button>
                <button class="btn-next" onclick="xuexitongApp.nextUnit()">下一节</button>
            </div>
            <div class="speed-info">播放倍速: ${Configs.playbackRate}x</div>
        `;
        document.body.appendChild(panel);
    }

    function init() {
        try {
            if ($('#coursetree').length === 0) {
                console.log('未检测到学习通课程页面，脚本不运行');
                return;
            }
            preventVideoPause();
            createControlPanel();
            setTimeout(() => {
                app.run();
            }, 2000);
        } catch (error) {
            console.error(SCRIPT_NAME + ' 启动失败:', error.message);
            console.log('请检查是否在正确的课程播放页面。');
        }
    }

    if (window.jQuery) {
        init();
    } else {
        $(document).ready(init);
    }
})();
