// ==UserScript==
// @name         学习通自动刷课脚本 V3 (终极防卡死版)
// @namespace    local.codex.xuexitong
// @version      3.6.0
// @description  自动播放、多视频、跳大章、跳图文，防暂停死循环
// @author       Codex
// @match        *://mooc1.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

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
            waitForCoursePage();
        };
        document.head.appendChild(script);
    } else {
        waitForCoursePage();
    }

    function waitForCoursePage() {
        let attempts = 0;
        window[BOOT_TIMER_KEY] = setInterval(() => {
            if ($('#coursetree').length > 0) {
                clearInterval(window[BOOT_TIMER_KEY]);
                initializePlayer();
                return;
            }
            attempts++;
            if (attempts >= 20) {
                clearInterval(window[BOOT_TIMER_KEY]);
                console.error('%c脚本启动超时：未检测到课程目录。', 'color:#F44336;');
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
                autoAdvanceNoVideo: true,
            },
            _videoEl: null,
            _treeContainerEl: null,
            _isPlaying: false,
            _checkInterval: null,
            _eventVideoEl: null,
            _boundVideoHandlers: null,
            _nextUnitPending: false,
            _cellData: { cells: 0, nCells: 0, currentCellIndex: 0, currentNCellIndex: 0, currentVideoTitle: "" },
            
            get cellData() { return this._cellData; },
            
            run() {
                console.log("%c=== 学习通自动刷课 V3.6.0 启动 ===", "color:#4CAF50;font-size:16px;font-weight:bold");
                this._nextUnitPending = false;
                this._getTreeContainer();
                this._initCellData();
                this._videoEl = null;
                this._clearCheckInterval();
                this._bindStepNavigation();
                this.play();
            },
            
            nextUnit() {
                if (this._nextUnitPending) return;
                this._nextUnitPending = true;
                this._clearCheckInterval();
                console.log("%c=== 准备切换到下一节 ===", "color:#2196F3;");
                try {
                    const el = this._getTreeContainer();
                    const cells = el.children("ul").children("li");
                    const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');

                    if (nCells.length > this._cellData.currentNCellIndex + 1) {
                        const nextNIndex = this._cellData.currentNCellIndex + 1;
                        this.playCurrentIndex(nCells.get(nextNIndex));
                    } else {
                        const nextIndex = this._cellData.currentCellIndex + 1;
                        if (nextIndex >= cells.length) {
                            console.log("%c==============本课程学习完成了==============", "color:#4CAF50;font-size:16px;font-weight:bold");
                            return;
                        }
                        this._cellData.currentCellIndex = nextIndex;
                        this._cellData.currentNCellIndex = 0;
                        const nextChapterLi = cells.eq(nextIndex);
                        const chapterTitle = nextChapterLi.find('.posCatalog_select.firstLayer');
                        if (chapterTitle.length > 0) chapterTitle.trigger('click');
                        setTimeout(() => this.playCurrentIndex(), 1200);
                    }
                } catch (error) {
                    this._nextUnitPending = false;
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
                if (now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs) return;
                this._guardLastResumeTs = now;

                const video = this._getVideoEl();
                if (!video || !this._isPlaying) return;

                // 【修复核心1】如果视频其实已经播到 99% 以上了，不要再死循环去唤醒它，直接当做结束处理！
                if (video.duration > 0 && video.currentTime >= video.duration * 0.99) {
                    console.log(`%c视频其实已播放完毕，强制执行下一节`, "color:#9C27B0");
                    this._isPlaying = false;
                    this._videoEl = null;
                    this._handleVideoEnded();
                    return;
                }

                console.log(`%c触发恢复(${reason})`, "color:#607D8B");
                video.play().catch((e) => {
                    video.muted = true;
                    video.play().catch((err) => {});
                });
            },
            
            _checkVideoStatus() {
                try {
                    const video = this._getVideoEl();
                    
                    // 【修复核心2】如果找不到可用的视频，说明当前是图文页，或者视频全播完了，立刻触发跳转
                    if (!video) {
                        if (this._isPlaying) {
                            console.log("%c检测不到有效视频，准备跳转下一节...", "color:#FF9800");
                            this._isPlaying = false;
                            this._clearCheckInterval();
                            setTimeout(() => this.nextUnit(), 1000);
                        }
                        return;
                    }

                    if (video.paused && this._isPlaying) {
                        console.log("%c检测到视频暂停，尝试恢复...", "color:#FF5722");
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
                        this._isPlaying = false;
                        this._videoEl = null; 
                        this._handleVideoEnded();
                    }
                } catch (e) {}
            },
            
            _tryTimes: 0,
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
                            setTimeout(() => { this.play(); }, 2000);
                            return;
                        }
                        if (this._isChapterTest()) {
                            this._advanceChapterTest();
                            return;
                        }

                        // 处理图文页
                        this._isPlaying = false;
                        this._clearCheckInterval();
                        
                        if (this.configs.autoAdvanceNoVideo) {
                            console.warn('%c当前为图文/非视频页面，准备自动跳过...', 'color:#FF9800');
                            // 【修复核心3】加强找“下一节”按钮的命中率
                            const nextBtn = $('.orientationright:visible, .nextChapter:visible, a.prev_next_btn:visible, button').filter((_, el) => {
                                return $(el).text().replace(/\s+/g, '').includes('下一节');
                            }).get(0);
                            
                            if (nextBtn) {
                                console.log("%c点击“下一节”按钮", "color:#2196F3");
                                this._nextUnitPending = true;
                                setTimeout(() => {
                                    nextBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
                                    setTimeout(() => {
                                        this._nextUnitPending = false;
                                        this._videoEl = null;
                                        this._initCellData();
                                        this.play();
                                    }, 3000);
                                }, 3000); 
                            } else {
                                setTimeout(() => this.nextUnit(), 3000);
                            }
                        }
                        return;
                    }

                    this._isPlaying = true;
                    this._videoEventHandle();
                    el.playbackRate = this.configs.playbackRate;

                    try {
                        await el.play();
                        this._tryTimes = 0;
                        console.log(`%c视频开始播放，倍速: ${el.playbackRate}x`, "color:#4CAF50");
                        this._startVideoMonitoring();
                    } catch (playError) {
                        this._handlePlayError(playError);
                    }
                } catch (e) {
                    this._tryTimes++;
                    setTimeout(() => { this.play(); }, this.configs.retryInterval);
                }
            },
            
            _advanceLearningStep() {
                if (this._stepSwitchPending && Date.now() - this._stepSwitchAt < 4000) return true;
                const currentStepTitle = this._currentStepTitle();
                if (currentStepTitle === "章节测验" || currentStepTitle === "视频") return false;

                const videoTab = $(".prev_white:visible").filter((_, el) => {
                    const text = ($(el).text() || "").replace(/\s+/g, "");
                    return text === "2视频" || text === "视频";
                }).get(0);
                
                if (videoTab) {
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    videoTab.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
                    return true;
                }
                return false;
            },
            
            _currentStepTitle() {
                const prevTitle = document.getElementsByClassName('prev_title')[0];
                return prevTitle ? (prevTitle.title || prevTitle.textContent || '').trim() : '';
            },
            
            _isChapterTest() { return this._currentStepTitle() === '章节测验'; },
            
            _advanceChapterTest() {
                const nextButton = $('#prevNextFocusNext:visible, #right1:visible, .nextChapter:visible').first().get(0);
                if (nextButton) {
                    nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    setTimeout(() => this.play(), 2000);
                }
            },
            
            _bindStepNavigation() {
                if (this._stepNavigationBound) return;
                this._stepNavigationBound = true;
                $(document).off('click.xuexitongPlayerV3', '.prev_white').on('click.xuexitongPlayerV3', '.prev_white', (e) => {
                    const text = ($(e.currentTarget).text() || "").replace(/\s+/g, "");
                    if (text.includes("视频")) {
                        this._videoEl = null;
                        this._isPlaying = false;
                        setTimeout(() => { this._initCellData(); this.play(); }, 1800);
                    }
                });
            },
            
            _handlePlayError(error) {
                const video = this._getVideoEl();
                if (video) {
                    video.muted = true;
                    video.play().catch(e => {
                        this._isPlaying = false;
                        this._delayedNextUnitTimer = setTimeout(() => this.play(), this.configs.retryInterval);
                    });
                }
            },
            
            playCurrentIndex(nCell) {
                this._nextUnitPending = false;
                if (!nCell) {
                    const el = this._getTreeContainer();
                    const nCells = $(el.children("ul").children("li").get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                    nCell = nCells.get(this._cellData.currentNCellIndex);
                }
                if (!nCell) {
                    setTimeout(() => this.playCurrentIndex(), 2000);
                    return;
                }
                const clickableSpan = $(nCell).find(".posCatalog_name")[0] || nCell;
                clickableSpan.click(); 
                this._videoEl = null;
                this._isPlaying = false;
                setTimeout(() => { this._initCellData(); this.play(); }, 3000);
            },
            
            _initCellData() {
                const el = this._getTreeContainer();
                const cells = el.children("ul").children("li");
                this._cellData.cells = cells.length;
                let foundCurrent = false;
                cells.each((i, v) => {
                    const nCells = $(v).find('.posCatalog_select:not(.firstLayer)');
                    nCells.each((j, e) => {
                        if ($(e).hasClass("posCatalog_active")) {
                            this._cellData.currentCellIndex = i;
                            this._cellData.currentNCellIndex = j;
                            foundCurrent = true;
                        }
                    });
                });
            },
            
            _getTreeContainer() {
                if (!this._treeContainerEl) {
                    this._treeContainerEl = $('#coursetree');
                }
                return this._treeContainerEl;
            },
            
            _getAllVideos() {
                const videos = [];
                try {
                    const findVideos = (frame, depth) => {
                        if (depth > 2) return;
                        const doc = frame.contentDocument || frame.contentWindow?.document;
                        if (!doc) return;
                        videos.push(...$(doc).find('video#video_html5_api, video[id*="video_html5"]').toArray());
                        $(doc).find('iframe.ans-insertvideo-online, iframe[src*="video"]').each((_, nested) => findVideos(nested, depth + 1));
                    };
                    $('iframe').each((_, frame) => findVideos(frame, 0));
                } catch (e) {}
                return videos;
            },
            
            _getVideoEl() {
                if (this._videoEl && !this._videoEl.ended && this._videoEl.currentTime < (this._videoEl.duration || Infinity) - 1) {
                    return this._videoEl;
                }
                const allVideos = this._getAllVideos();
                for (const v of allVideos) {
                    // 如果视频已经结束，或者进度超过 95%，跳过
                    if (v.ended || (v.duration && v.currentTime >= v.duration * 0.95)) continue; 
                    // 如果视频的宽高为0（被隐藏了），也跳过
                    if (v.offsetWidth === 0 && v.offsetHeight === 0) continue;

                    this._videoEl = v;
                    try { v.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
                    return this._videoEl;
                }
                return null;
            },
            
            _videoEventHandle() {
                const el = this._videoEl;
                if (!el || this._eventVideoEl === el) return;
                this._detachVideoEvents();
                this._eventVideoEl = el;
                this._boundVideoHandlers = {
                    ended: this._handleVideoEnded.bind(this),
                    play: this._handleVideoPlay.bind(this)
                };
                el.addEventListener('ended', this._boundVideoHandlers.ended);
                el.addEventListener('play', this._boundVideoHandlers.play);
            },
            
            _detachVideoEvents() {
                if (!this._eventVideoEl || !this._boundVideoHandlers) return;
                this._eventVideoEl.removeEventListener('ended', this._boundVideoHandlers.ended);
                this._eventVideoEl.removeEventListener('play', this._boundVideoHandlers.play);
                this._eventVideoEl = null;
                this._boundVideoHandlers = null;
            },
            
            _handleVideoEnded(e) {
                this._isPlaying = false;
                this._clearCheckInterval();
                this._videoEl = null; 
                
                setTimeout(() => {
                    const nextVideo = this._getVideoEl();
                    if (nextVideo) {
                        console.log("%c本页还有其他视频，继续播放", "color:#2196F3");
                        this._videoEventHandle(); 
                        this.play(); 
                    } else {
                        console.log("%c本页视频已全部播完，切下一节", "color:#FF9800");
                        this.nextUnit();
                    }
                }, 1500);
            },
            
            _handleVideoPlay(e) {
                this._isPlaying = true;
                this._stepSwitchPending = false;
                this._guardLastTime = Number(this._videoEl?.currentTime || 0);
                this._guardLastWallTs = Date.now();
            },
            
            _bindPageGuards() {
                const resumePlaybackNow = () => this._tryResumePlayback('page-event');
                window.addEventListener('blur', resumePlaybackNow);
                document.addEventListener('visibilitychange', resumePlaybackNow);
            },
            
            destroy() {
                this._isPlaying = false;
                this._clearCheckInterval();
                this._detachVideoEvents();
                $(document).off('.xuexitongPlayerV3');
            },
        };

        window.app = app;
        window[APP_KEY] = app;

        try {
            app.run();
            app._bindPageGuards();
        } catch (error) {
            console.error("%c脚本运行失败: ", "color:#F44336;", error);
        }
    }
})();