// ==UserScript==
// @name         学习通自动刷课脚本 V3 稳定版
// @namespace    local.codex.xuexitong
// @version      3.2.0
// @description  按原版框架自动播放、自动下一节、章节测验自动跳过
// @author       Codex
// @match        *://mooc1.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    if (typeof window.jQuery === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
        script.type = 'text/javascript';
        script.onload = function () {
            console.log('jQuery loaded.');
            initializePlayer();
        };
        document.head.appendChild(script);
    } else {
        initializePlayer();
    }

    function initializePlayer() {
        window.app = {
            configs: {
                playbackRate: 1.5,
                autoplay: true,
                retryInterval: 2000,
                maxRetries: 10,
                videoCheckInterval: 1000,
                guardNoProgressMs: 7000,
                guardResumeCooldownMs: 1500,
            },
            _videoEl: null,
            _treeContainerEl: null,
            _isPlaying: false,
            _currentRetryCount: 0,
            _checkInterval: null,
            _cellData: {
                cells: 0,
                nCells: 0,
                currentCellIndex: 0,
                currentNCellIndex: 0,
                currentVideoTitle: '',
            },
            get cellData() {
                return this._cellData;
            },
            run() {
                console.log('%c=== 学习通自动刷课脚本 V3 稳定版启动 ===', 'color:#4CAF50;font-size:16px;font-weight:bold');
                this._getTreeContainer();
                this._initCellData();
                this._videoEl = null;
                this._getVideoEl();
                this._clearCheckInterval();
                this._bindStepNavigation();
                this.play();
            },
            nextUnit() {
                console.log('%c=== 准备切换到下一小节 ===', 'color:#2196F3;font-size:14px');
                const el = this._getTreeContainer();
                const cells = el.children('ul').children('li');
                const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');

                if (nCells.length > this._cellData.currentNCellIndex + 1) {
                    const nextNIndex = this._cellData.currentNCellIndex + 1;
                    console.log(`%c切换到同章节下一个视频: ${nextNIndex + 1}/${nCells.length}`, 'color:#FF9800');
                    this.playCurrentIndex(nCells.get(nextNIndex));
                } else {
                    const nextIndex = this._cellData.currentCellIndex + 1;
                    if (nextIndex >= cells.length) {
                        console.log('%c=====================================', 'color:#4CAF50;font-size:16px');
                        console.log('%c==============本课程学习完成了==============', 'color:#4CAF50;font-size:16px;font-weight:bold');
                        console.log('%c=====================================', 'color:#4CAF50;font-size:16px');
                        this._clearCheckInterval();
                        return;
                    }
                    console.log(`%c切换到下一个章节: ${nextIndex + 1}/${cells.length}`, 'color:#FF9800');
                    this._cellData.currentCellIndex = nextIndex;
                    this._cellData.currentNCellIndex = 0;
                    this.playCurrentIndex();
                }
            },
            _clearCheckInterval() {
                if (this._checkInterval) {
                    clearInterval(this._checkInterval);
                    this._checkInterval = null;
                }
            },
            _startVideoMonitoring() {
                this._clearCheckInterval();
                this._guardLastTime = 0;
                this._guardLastWallTs = 0;
                this._guardLastResumeTs = 0;
                this._checkInterval = setInterval(() => {
                    this._checkVideoStatus();
                }, this.configs.videoCheckInterval);
            },
            _tryResumePlayback(reason) {
                const now = Date.now();
                if (now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs) {
                    return;
                }
                this._guardLastResumeTs = now;

                const video = this._getVideoEl();
                if (!video || !this._isPlaying) return;

                console.log(`%c触发视频保活恢复(${reason})`, 'color:#607D8B');
                video.play().catch((e) => {
                    console.warn('直接恢复播放失败，尝试静音恢复:', e);
                    video.muted = true;
                    video.play().catch((err) => {
                        console.error('静音恢复播放失败:', err);
                    });
                });
            },
            _checkVideoStatus() {
                try {
                    const video = this._getVideoEl();
                    if (!video) return;

                    if (video.paused && this._isPlaying) {
                        console.log('%c检测到视频暂停，尝试恢复播放...', 'color:#FF5722');
                        this._tryResumePlayback('paused');
                    } else if (this._isPlaying && !video.ended) {
                        const now = Date.now();
                        const current = Number(video.currentTime || 0);
                        if (this._guardLastWallTs === 0) {
                            this._guardLastWallTs = now;
                            this._guardLastTime = current;
                        } else {
                            const stalled = Math.abs(current - this._guardLastTime) < 0.01;
                            const stalledMs = now - this._guardLastWallTs;
                            if (stalled && stalledMs >= this.configs.guardNoProgressMs) {
                                this._tryResumePlayback('no-progress');
                                this._guardLastWallTs = now;
                                this._guardLastTime = Number(video.currentTime || 0);
                            } else if (!stalled) {
                                this._guardLastWallTs = now;
                                this._guardLastTime = current;
                            }
                        }
                    }

                    if (video.ended && this._isPlaying) {
                        console.log('%c检测到视频结束，准备切换下一个...', 'color:#9C27B0');
                        this._isPlaying = false;
                        setTimeout(() => this.nextUnit(), 1000);
                    }
                } catch (e) {
                    console.error('视频状态检查失败:', e);
                }
            },
            _tryTimes: 0,
            _stepAdvanceTimes: 0,
            _stepSwitchAt: 0,
            _stepSwitchPending: false,
            _delayedNextUnitTimer: null,
            _guardLastTime: 0,
            _guardLastWallTs: 0,
            _guardLastResumeTs: 0,
            async play() {
                try {
                    const el = this._getVideoEl();
                    if (el == null) {
                        if (this._advanceLearningStep()) {
                            console.log('%c当前不在视频页，已尝试切到下一学习步骤，2秒后重试', 'color:#607D8B');
                            setTimeout(() => {
                                this.play();
                            }, 2000);
                            return;
                        }
                        console.log('%c===========跳过章节测验，2秒后继续播放==============', 'color:#607D8B');
                        $('#prevNextFocusNext').click();
                        setTimeout(() => {
                            this.play();
                        }, 2000);
                        return;
                    }

                    this._tryTimes = 0;
                    this._isPlaying = true;
                    this._videoEventHandle();
                    el.playbackRate = this.configs.playbackRate;

                    try {
                        await el.play();
                        console.log(`%c视频开始播放，倍速: ${el.playbackRate}x`, 'color:#4CAF50');
                        this._startVideoMonitoring();
                    } catch (playError) {
                        console.error('视频播放失败:', playError);
                        this._handlePlayError(playError);
                    }
                } catch (e) {
                    if (this._tryTimes > this.configs.maxRetries) {
                        console.error('%c视频播放失败，已达到最大重试次数', 'color:#F44336;font-weight:bold', e);
                        this._clearCheckInterval();
                        return;
                    }
                    this._tryTimes++;
                    console.log(`%c播放失败，${this.configs.retryInterval / 1000}秒后重试 (${this._tryTimes}/${this.configs.maxRetries})`, 'color:#FF9800');
                    setTimeout(() => {
                        this.play();
                    }, this.configs.retryInterval);
                }
            },
            _advanceLearningStep() {
                if (this._stepSwitchPending && Date.now() - this._stepSwitchAt < 4000) {
                    return true;
                }

                const prevTitle = document.getElementsByClassName('prev_title')[0];
                const currentStepTitle = prevTitle ? (prevTitle.title || prevTitle.textContent || '').trim() : '';

                if (currentStepTitle === '章节测验' || currentStepTitle === '视频') {
                    return false;
                }

                const clickElement = (el, label) => {
                    if (!el) return false;
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    console.log(`%c尝试点击${label}`, 'color:#2196F3');
                    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    return true;
                };

                const videoTab = $('.prev_white:visible').filter((_, el) => {
                    const text = ($(el).text() || '').replace(/\s+/g, '');
                    return text === '2视频' || text === '视频';
                }).get(0);
                if (clickElement(videoTab, '“视频”页签')) {
                    return true;
                }

                return false;
            },
            _bindStepNavigation() {
                if (this._stepNavigationBound) {
                    return;
                }
                this._stepNavigationBound = true;

                const reenterVideoMode = () => {
                    this._videoEl = null;
                    this._isPlaying = false;
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    setTimeout(() => {
                        try {
                            this._initCellData();
                        } catch (e) {}
                        this.play();
                    }, 1800);
                };

                $(document).on('click', '.prev_white', (e) => {
                    const text = ($(e.currentTarget).text() || '').replace(/\s+/g, '');
                    if (text.includes('视频')) {
                        console.log(`%c检测到步骤切换点击：${text}，准备重新接管视频页`, 'color:#607D8B');
                        reenterVideoMode();
                    }
                });
            },
            _handlePlayError(error) {
                console.error('播放错误详情:', error);
                const video = this._getVideoEl();
                if (video) {
                    video.muted = true;
                    video.play().then(() => {
                        console.log('%c静音播放成功', 'color:#4CAF50');
                        if (this._delayedNextUnitTimer) {
                            clearTimeout(this._delayedNextUnitTimer);
                            this._delayedNextUnitTimer = null;
                        }
                    }).catch((e) => {
                        console.error('静音播放也失败:', e);
                        if (this._delayedNextUnitTimer) {
                            clearTimeout(this._delayedNextUnitTimer);
                        }
                        this._delayedNextUnitTimer = setTimeout(() => {
                            this._delayedNextUnitTimer = null;
                            this.nextUnit();
                        }, 3000);
                    });
                }
            },
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
                    console.error('%c===========找不到可点击的课程节点，播放下一个视频失败==============', 'color:#F44336');
                    setTimeout(() => this.nextUnit(), 2000);
                    return;
                }

                console.log(`%c点击切换到: ${$(clickableSpan).attr('title') || '未知标题'}`, 'color:#2196F3');
                $(clickableSpan).click();
                this._videoEl = null;
                this._isPlaying = false;

                console.log('%c等待视频加载...', 'color:#FF9800');
                setTimeout(() => {
                    this._initCellData();
                    if (this.configs.autoplay) {
                        this.play();
                    }
                }, 3000);
            },
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
                    console.warn('%c未找到当前激活的视频节点，可能需要手动选择', 'color:#FF9800');
                }

                console.log(`%c课程信息: ${this._cellData.cells}章, ${this._cellData.nCells}节, 当前: 第${this._cellData.currentCellIndex + 1}章第${this._cellData.currentNCellIndex + 1}节`, 'color:#607D8B');
            },
            _getTreeContainer() {
                if (!this._treeContainerEl) {
                    const el = $('#coursetree');
                    if (el.length <= 0) {
                        throw new Error('找不到视频列表');
                    }
                    this._treeContainerEl = el;
                }
                return this._treeContainerEl;
            },
            _getVideoEl() {
                if (!this._videoEl) {
                    try {
                        const frameObj = $('iframe').eq(0).contents().find('iframe.ans-insertvideo-online');
                        if (frameObj.length === 0) {
                            return null;
                        }
                        this._videoEl = frameObj.eq(0).contents().find('video#video_html5_api').get(0);
                    } catch (e) {
                        console.error('获取视频元素失败:', e);
                        return null;
                    }
                }
                if (!this._videoEl) {
                    throw new Error('视频组件Video未加载完成');
                }
                return this._videoEl;
            },
            _videoEventHandle() {
                const el = this._videoEl;
                if (!el) {
                    console.log('videoEl未加载');
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
            },
            _handleVideoEnded(e) {
                const title = this._cellData.currentVideoTitle;
                console.warn(`%c============'${title}' 播放完成=============`, 'color:#4CAF50;font-weight:bold');
                this._isPlaying = false;
                this._clearCheckInterval();
                setTimeout(() => this.nextUnit(), 1000);
            },
            _handleVideoLoaded(e) {
                console.log('%c============视频加载完成=============', 'color:#2196F3');
                if (this.configs.autoplay && !this._isPlaying) {
                    this.play();
                }
            },
            _handleVideoPlay(e) {
                const title = this._cellData.currentVideoTitle;
                console.info(`%c============'${title}' 开始播放=============`, 'color:#4CAF50');
                this._isPlaying = true;
                this._stepSwitchPending = false;
                const video = this._getVideoEl();
                this._guardLastTime = Number(video?.currentTime || 0);
                this._guardLastWallTs = Date.now();
                if (this._delayedNextUnitTimer) {
                    clearTimeout(this._delayedNextUnitTimer);
                    this._delayedNextUnitTimer = null;
                }
            },
            _handleVideoPause(e) {
                console.log('%c============视频暂停=============', 'color:#FF9800');
            },
        };

        function startWhenReady() {
            if (location.hostname.startsWith('mooc1')) {
                if ($('#coursetree').find('.posCatalog_select').length > 0) {
                    window.app.run();
                    return;
                }
                console.log('%c等待课程目录数据加载...', 'color:#FF9800');
                setTimeout(startWhenReady, 500);
                return;
            }
            window.app.run();
        }
        startWhenReady();

        const preventPause = (e) => {
            e.stopPropagation();
            e.preventDefault();
        };

        const resumePlaybackNow = () => {
            if (window.app && typeof window.app._tryResumePlayback === 'function') {
                window.app._tryResumePlayback('page-event');
            }
        };

        document.addEventListener('mouseleave', preventPause);
        window.addEventListener('mouseleave', preventPause);
        document.addEventListener('mouseout', preventPause);
        window.addEventListener('mouseout', preventPause);

        window.addEventListener('blur', () => {
            console.log('%c页面失去焦点，保持播放状态', 'color:#607D8B');
            resumePlaybackNow();
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('%c页面切到后台，尝试保持播放状态', 'color:#607D8B');
            }
            resumePlaybackNow();
        });
    }
})();
