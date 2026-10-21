(function () {
    const APP_KEY = '__xuexitongPlayerV3';
    const BOOT_TIMER_KEY = '__xuexitongPlayerV3BootTimer';

    const previousApp = window[APP_KEY];
    if (previousApp && typeof previousApp.destroy === 'function') {
        previousApp.destroy();
    }
    if (window[BOOT_TIMER_KEY]) {
        clearInterval(window[BOOT_TIMER_KEY]);
        window[BOOT_TIMER_KEY] = null;
    }

    if (typeof window.jQuery === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
        script.type = 'text/javascript';
        script.onload = function () {
            console.log("jQuery loaded.");
            waitForCoursePage();
        };
        document.head.appendChild(script);
    } else {
        waitForCoursePage();
    }

    function waitForCoursePage() {
        let attempts = 0;
        const maxAttempts = 20;
        window[BOOT_TIMER_KEY] = setInterval(() => {
            if ($('#coursetree').length > 0) {
                clearInterval(window[BOOT_TIMER_KEY]);
                window[BOOT_TIMER_KEY] = null;
                initializePlayer();
                return;
            }
            attempts++;
            if (attempts >= maxAttempts) {
                clearInterval(window[BOOT_TIMER_KEY]);
                window[BOOT_TIMER_KEY] = null;
                console.error('%c脚本启动超时：未检测到课程目录（#coursetree）。请确认当前处于课程播放页。', 'color:#F44336;font-weight:bold');
            }
        }, 1000);
    }

    function initializePlayer() {
        const app = {
            configs: {
                playbackRate: 1.5,
                autoplay: true,
                retryInterval: 2000,
                maxRetries: 10,
                videoCheckInterval: 1000,
                guardNoProgressMs: 7000,
                guardResumeCooldownMs: 1500,
                autoAdvanceNoVideo: false,
            },
            _videoEl: null,
            _treeContainerEl: null,
            _isPlaying: false,
            _running: false,
            _generation: 0,
            _pendingTimers: new Set(),
            _currentRetryCount: 0,
            _checkInterval: null,
            _eventVideoEl: null,
            _boundVideoHandlers: null,
            _nextUnitPending: false,
            _chapterAdvanceTimes: 0,
            _cellData: {
                cells: 0,
                nCells: 0,
                currentCellIndex: 0,
                currentNCellIndex: 0,
                currentVideoTitle: "",
            },
            get cellData() {
                return this._cellData;
            },
            _schedule(task, delay) {
                const generation = this._generation;
                const timer = setTimeout(() => {
                    this._pendingTimers.delete(timer);
                    if (this._running && this._generation === generation) task();
                }, delay);
                this._pendingTimers.add(timer);
                return timer;
            },
            run() {
                this.destroy();
                this._running = true;
                this._tryTimes = 0;
                this._stepSwitchPending = false;
                this._bindPageGuards();
                console.log("%c=== 学习通自动刷课脚本 V3 优化版启动 ===", "color:#4CAF50;font-size:16px;font-weight:bold");
                this._nextUnitPending = false;
                this._chapterAdvanceTimes = 0;
                this._getTreeContainer();
                this._initCellData();
                this._videoEl = null;
                this._getVideoEl();
                this._clearCheckInterval();
                this._bindStepNavigation();
                this.play();
            },
            nextUnit() {
                if (!this._running) return;
                if (this._nextUnitPending) {
                    console.warn('%c已有小节切换正在进行，忽略重复请求', 'color:#FF9800');
                    return;
                }
                this._nextUnitPending = true;
                this._clearCheckInterval();
                console.log("%c=== 准备切换到下一小节 ===", "color:#2196F3;font-size:14px");
                try {
                    const el = this._getTreeContainer();
                    const cells = el.children("ul").children("li");
                    const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');

                    if (nCells.length > this._cellData.currentNCellIndex + 1) {
                        const nextNIndex = this._cellData.currentNCellIndex + 1;
                        console.log(`%c切换到同章节下一个视频: ${nextNIndex + 1}/${nCells.length}`, "color:#FF9800");
                        this.playCurrentIndex(nCells.get(nextNIndex));
                    } else {
                        const nextIndex = this._cellData.currentCellIndex + 1;
                        if (nextIndex >= cells.length) {
                            console.log("%c=====================================", "color:#4CAF50;font-size:16px");
                            console.log("%c==============本课程学习完成了==============", "color:#4CAF50;font-size:16px;font-weight:bold");
                            console.log("%c=====================================", "color:#4CAF50;font-size:16px");
                            return;
                        }
                        console.log(`%c切换到下一个章节: ${nextIndex + 1}/${cells.length}`, "color:#FF9800");
                        this._cellData.currentCellIndex = nextIndex;
                        this._cellData.currentNCellIndex = 0;
                        this.playCurrentIndex();
                    }
                } catch (error) {
                    this._nextUnitPending = false;
                    console.error('切换下一小节失败:', error);
                }
            },
            _clearCheckInterval() {
                if (this._checkInterval) {
                    clearInterval(this._checkInterval);
                    this._checkInterval = null;
                }
            },
            _startVideoMonitoring() {
                if (!this._running) return;
                this._clearCheckInterval();
                this._guardLastTime = 0;
                this._guardLastWallTs = 0;
                this._guardLastResumeTs = 0;
                this._checkInterval = setInterval(() => {
                    this._checkVideoStatus();
                }, this.configs.videoCheckInterval);
            },
            _tryResumePlayback(reason) {
                const generation = this._generation;
                if (!this._running) return;
                const now = Date.now();
                if (now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs) {
                    return;
                }
                this._guardLastResumeTs = now;

                const video = this._getVideoEl();
                if (!video || !this._isPlaying) return;

                console.log(`%c触发视频保活恢复(${reason})`, "color:#607D8B");
                video.play().catch((e) => {
                    if (!this._running || generation !== this._generation) return;
                    console.warn("直接恢复播放失败，尝试静音恢复:", e);
                    video.muted = true;
                    video.play().catch((err) => {
                        console.error("静音恢复播放失败:", err);
                    });
                });
            },
            _checkVideoStatus() {
                if (!this._running) return;
                try {
                    const video = this._getVideoEl();
                    if (!video) return;

                    if (video.paused && this._isPlaying) {
                        console.log("%c检测到视频暂停，尝试恢复播放...", "color:#FF5722");
                        this._tryResumePlayback("paused");
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
                                this._tryResumePlayback("no-progress");
                                this._guardLastWallTs = now;
                                this._guardLastTime = Number(video.currentTime || 0);
                            } else if (!stalled) {
                                this._guardLastWallTs = now;
                                this._guardLastTime = current;
                            }
                        }
                    }

                    if (video.ended && this._isPlaying) {
                        console.log("%c检测到视频结束，准备切换下一个...", "color:#9C27B0");
                        this._isPlaying = false;
                        this._schedule(() => this.nextUnit(), 1000);
                    }
                } catch (e) {
                    console.error("视频状态检查失败:", e);
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
                const generation = this._generation;
                if (!this._running) return;
                try {
                    const el = this._getVideoEl();
                    if (el == null) {
                        if (this._currentStepTitle() === '视频') {
                            throw new Error('视频组件尚未加载完成');
                        }
                        if (this._advanceLearningStep()) {
                            console.log("%c当前不在视频页，已尝试切到下一学习步骤，2秒后重试", "color:#607D8B");
                            this._schedule(() => {
                                this.play();
                            }, 2000);
                            return;
                        }
                        if (this._isChapterTest()) {
                            this._advanceChapterTest();
                            return;
                        }
                        // The directory may render before the video iframe or step tabs.
                        if (this._tryTimes < this.configs.maxRetries) {
                            throw new Error('等待视频组件或学习步骤加载');
                        }
                        this._isPlaying = false;
                        this._clearCheckInterval();
                        if (this.configs.autoAdvanceNoVideo) {
                            console.warn('%c当前小节未发现视频，按配置切换到下一小节', 'color:#FF9800');
                            this.nextUnit();
                        } else {
                            console.warn('%c当前小节未发现视频或可识别的学习步骤，已安全停止。确认无需完成课件后，可执行 app.nextUnit()。', 'color:#FF9800');
                        }
                        return;
                    }

                    this._isPlaying = true;
                    this._videoEventHandle();
                    el.playbackRate = this.configs.playbackRate;

                    try {
                        await el.play();
                        if (!this._running || generation !== this._generation) return;
                        this._tryTimes = 0;
                        console.log(`%c视频开始播放，倍速: ${el.playbackRate}x`, "color:#4CAF50");
                        this._startVideoMonitoring();
                    } catch (playError) {
                        if (!this._running || generation !== this._generation) return;
                        console.error("视频播放失败:", playError);
                        this._handlePlayError(playError);
                    }
                } catch (e) {
                    if (!this._running || generation !== this._generation) return;
                    if (this._tryTimes >= this.configs.maxRetries) {
                        console.error("%c视频播放失败，已达到最大重试次数", "color:#F44336;font-weight:bold", e);
                        this._clearCheckInterval();
                        return;
                    }
                    this._tryTimes++;
                    console.log(`%c播放失败，${this.configs.retryInterval/1000}秒后重试 (${this._tryTimes}/${this.configs.maxRetries})`, "color:#FF9800");
                    this._schedule(() => {
                        this.play();
                    }, this.configs.retryInterval);
                }
            },
            _advanceLearningStep() {
                if (this._stepSwitchPending && Date.now() - this._stepSwitchAt < 4000) {
                    return true;
                }

                const prevTitle = document.getElementsByClassName("prev_title")[0];
                const currentStepTitle = prevTitle ? (prevTitle.title || prevTitle.textContent || "").trim() : "";

                if (currentStepTitle === "章节测验" || currentStepTitle === "视频") {
                    return false;
                }

                const clickElement = (el, label) => {
                    if (!el) return false;
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    console.log(`%c尝试点击${label}`, "color:#2196F3");
                    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
                    return true;
                };

                const videoTab = $(".prev_white:visible").filter((_, el) => {
                    const text = ($(el).text() || "").replace(/\s+/g, "");
                    return text === "2视频" || text === "视频";
                }).get(0);
                if (clickElement(videoTab, "“视频”页签")) {
                    return true;
                }

                return false;
            },
            _currentStepTitle() {
                const prevTitle = document.getElementsByClassName('prev_title')[0];
                return prevTitle ? (prevTitle.title || prevTitle.textContent || '').trim() : '';
            },
            _isChapterTest() {
                return this._currentStepTitle() === '章节测验';
            },
            _advanceChapterTest() {
                if (this._chapterAdvanceTimes >= 3) {
                    console.error('%c章节测验页面连续跳转失败，已停止以避免页面循环。请手动处理后执行 app.run()。', 'color:#F44336;font-weight:bold');
                    return;
                }

                const nextButton = $('#prevNextFocusNext:visible, #right1:visible, .nextChapter:visible').first().get(0);
                if (!nextButton) {
                    console.warn('%c未找到章节测验的下一步按钮，已停止。', 'color:#FF9800');
                    return;
                }

                this._chapterAdvanceTimes++;
                console.log('%c检测到章节测验，尝试进入下一学习步骤', 'color:#607D8B');
                nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                this._schedule(() => this.play(), 2000);
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
                    this._schedule(() => {
                        try {
                            this._initCellData();
                        } catch (e) {}
                        this.play();
                    }, 1800);
                };

                $(document).off('click.xuexitongPlayerV3', '.prev_white').on('click.xuexitongPlayerV3', '.prev_white', (e) => {
                    const text = ($(e.currentTarget).text() || "").replace(/\s+/g, "");
                    if (text.includes("视频")) {
                        console.log(`%c检测到步骤切换点击：${text}，准备重新接管视频页`, "color:#607D8B");
                        reenterVideoMode();
                    }
                });
            },
            _handlePlayError(error) {
                const generation = this._generation;
                if (!this._running) return;
                console.error("播放错误详情:", error);
                const video = this._getVideoEl();
                if (video) {
                    video.muted = true;
                    video.play().then(() => {
                        if (!this._running || generation !== this._generation) return;
                        console.log("%c静音播放成功", "color:#4CAF50");
                        this._tryTimes = 0;
                        this._startVideoMonitoring();
                        if (this._delayedNextUnitTimer) {
                            clearTimeout(this._delayedNextUnitTimer);
                            this._delayedNextUnitTimer = null;
                        }
                    }).catch(e => {
                        if (!this._running || generation !== this._generation) return;
                        console.error("静音播放也失败:", e);
                        if (this._delayedNextUnitTimer) {
                            clearTimeout(this._delayedNextUnitTimer);
                        }
                        this._isPlaying = false;
                        if (this._tryTimes >= this.configs.maxRetries) {
                            console.error('%c静音播放失败，已达到最大重试次数', 'color:#F44336;font-weight:bold', e);
                            return;
                        }
                        this._tryTimes++;
                        this._delayedNextUnitTimer = this._schedule(() => {
                            this._delayedNextUnitTimer = null;
                            this.play();
                        }, this.configs.retryInterval);
                    });
                }
            },
            playCurrentIndex(nCell) {
                if (!this._running) return;
                this._tryTimes = 0;
                this._nextUnitPending = false;
                if (!nCell) {
                    const el = this._getTreeContainer();
                    const cells = el.children("ul").children("li");
                    const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                    nCell = nCells.get(this._cellData.currentNCellIndex);
                }

                const $nCell = $(nCell);
                const clickableSpan = $nCell.find(".posCatalog_name")[0];
                if (!clickableSpan) {
                    console.error("%c===========找不到可点击的课程节点，播放下一个视频失败==============", "color:#F44336");
                    return;
                }

                console.log(`%c点击切换到: ${$(clickableSpan).attr('title') || '未知标题'}`, "color:#2196F3");
                $(clickableSpan).click();
                this._videoEl = null;
                this._isPlaying = false;

                console.log("%c等待视频加载...", "color:#FF9800");
                this._schedule(() => {
                    this._initCellData();
                    if (this.configs.autoplay) {
                        this.play();
                    }
                }, 3000);
            },
            _initCellData() {
                const el = this._getTreeContainer();
                const cells = el.children("ul").children("li");
                this._cellData.cells = cells.length;
                let nCellCounts = 0;
                let foundCurrent = false;

                cells.each((i, v) => {
                    const nCells = $(v).find('.posCatalog_select:not(.firstLayer)');
                    nCellCounts += nCells.length;
                    nCells.each((j, e) => {
                        const _el = $(e);
                        if (_el.hasClass("posCatalog_active")) {
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
                    console.warn("%c未找到当前激活的视频节点，可能需要手动选择", "color:#FF9800");
                }

                console.log(`%c课程信息: ${this._cellData.cells}章, ${this._cellData.nCells}节, 当前: 第${this._cellData.currentCellIndex + 1}章第${this._cellData.currentNCellIndex + 1}节`, "color:#607D8B");
            },
            _getTreeContainer() {
                if (!this._treeContainerEl) {
                    const el = $('#coursetree');
                    if (el.length <= 0) {
                        throw new Error("找不到视频列表");
                    }
                    this._treeContainerEl = el;
                }
                return this._treeContainerEl;
            },
            _getVideoEl() {
                if (!this._videoEl) {
                    try {
                        const findVideo = (frame, depth) => {
                            if (depth > 2) return null;
                            const frameDocument = frame.contentDocument || frame.contentWindow?.document;
                            if (!frameDocument) return null;
                            const $frameDocument = $(frameDocument);
                            const directVideo = $frameDocument.find('video#video_html5_api, video[id*="video_html5"]').get(0);
                            if (directVideo) return directVideo;

                            const nestedFrames = $frameDocument.find('iframe.ans-insertvideo-online, iframe[src*="video"]');
                            for (const nestedFrame of nestedFrames.toArray()) {
                                const nestedVideo = findVideo(nestedFrame, depth + 1);
                                if (nestedVideo) return nestedVideo;
                            }
                            return null;
                        };

                        for (const frame of $('iframe').toArray()) {
                            const video = findVideo(frame, 0);
                            if (video) {
                                this._videoEl = video;
                                break;
                            }
                        }
                    } catch (e) {
                        console.error("获取视频元素失败:", e);
                        return null;
                    }
                }
                if (!this._videoEl) return null;
                return this._videoEl;
            },
            _videoEventHandle() {
                const el = this._videoEl;
                if (!el) {
                    console.log("videoEl未加载");
                    return;
                }

                if (this._eventVideoEl === el) return;
                this._detachVideoEvents();
                this._eventVideoEl = el;
                this._boundVideoHandlers = {
                    ended: this._handleVideoEnded.bind(this),
                    loadedmetadata: this._handleVideoLoaded.bind(this),
                    play: this._handleVideoPlay.bind(this),
                    pause: this._handleVideoPause.bind(this),
                };

                el.addEventListener('ended', this._boundVideoHandlers.ended);
                el.addEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
                el.addEventListener('play', this._boundVideoHandlers.play);
                el.addEventListener('pause', this._boundVideoHandlers.pause);
            },
            _detachVideoEvents() {
                if (!this._eventVideoEl || !this._boundVideoHandlers) return;
                this._eventVideoEl.removeEventListener('ended', this._boundVideoHandlers.ended);
                this._eventVideoEl.removeEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
                this._eventVideoEl.removeEventListener('play', this._boundVideoHandlers.play);
                this._eventVideoEl.removeEventListener('pause', this._boundVideoHandlers.pause);
                this._eventVideoEl = null;
                this._boundVideoHandlers = null;
            },
            _handleVideoEnded(e) {
                const title = this._cellData.currentVideoTitle;
                console.warn(`%c============'${title}' 播放完成=============`, "color:#4CAF50;font-weight:bold");
                this._isPlaying = false;
                this._clearCheckInterval();
                this._schedule(() => this.nextUnit(), 1000);
            },
            _handleVideoLoaded(e) {
                console.log(`%c============视频加载完成=============`, "color:#2196F3");
                if (this.configs.autoplay && !this._isPlaying) {
                    this.play();
                }
            },
            _handleVideoPlay(e) {
                const title = this._cellData.currentVideoTitle;
                console.info(`%c============'${title}' 开始播放=============`, "color:#4CAF50");
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
                console.log(`%c============视频暂停=============`, "color:#FF9800");
            },
            _bindPageGuards() {
                if (this._pageGuards) return;
                const preventPause = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                };
                const resumePlaybackNow = () => this._tryResumePlayback('page-event');
                this._pageGuards = { preventPause, resumePlaybackNow };
                document.addEventListener('mouseleave', preventPause);
                window.addEventListener('mouseleave', preventPause);
                document.addEventListener('mouseout', preventPause);
                window.addEventListener('mouseout', preventPause);
                window.addEventListener('blur', resumePlaybackNow);
                document.addEventListener('visibilitychange', resumePlaybackNow);
            },
            destroy() {
                this._running = false;
                this._generation++;
                for (const timer of this._pendingTimers) clearTimeout(timer);
                this._pendingTimers.clear();
                this._delayedNextUnitTimer = null;
                this._stepNavigationBound = false;
                this._isPlaying = false;
                this._clearCheckInterval();
                const videos = new Set([this._videoEl, this._eventVideoEl]);
                this._detachVideoEvents();
                for (const video of videos) video?.pause();
                $(document).off('.xuexitongPlayerV3');
                if (this._pageGuards) {
                    const { preventPause, resumePlaybackNow } = this._pageGuards;
                    document.removeEventListener('mouseleave', preventPause);
                    window.removeEventListener('mouseleave', preventPause);
                    document.removeEventListener('mouseout', preventPause);
                    window.removeEventListener('mouseout', preventPause);
                    window.removeEventListener('blur', resumePlaybackNow);
                    document.removeEventListener('visibilitychange', resumePlaybackNow);
                    this._pageGuards = null;
                }
            },
        };

        window.app = app;
        window[APP_KEY] = app;

        try {
            app.run();
        } catch (error) {
            console.error("%c脚本运行失败: ", "color:#F44336;font-weight:bold", error.message);
            console.log("请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。");
        }
    }
})();
