// ==UserScript==
// @name         学习通刷课+自动答题 V1 Optimized
// @namespace    local.codex.xuexitong
// @version      1.0.0
// @description  自动刷课；章节测验可跳过或自动答题（skipChapterTest 优先于 autoAnswer）
// @author       Codex
// @match        *://mooc1.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

// ==============================================
// 学习通刷课 + 自动答题（v1_autoAnswer_optimized）
// 基于 v3_optimized 播放流程 + v1_autoAnswer 答题逻辑
// 章节测验优先级：skipChapterTest > autoAnswer > 停止
// ==============================================
(function () {
    const APP_KEY = '__xuexitongPlayerV1Opt';
    const BOOT_TIMER_KEY_LEGACY = '__xuexitongPlayerV3BootTimer';
    const BOOT_TIMER_KEY = '__xuexitongPlayerV3BootTimer';

    const previousApp = window[APP_KEY] || window.__xuexitongPlayerV3;
    if (previousApp && typeof previousApp.destroy === 'function') {
        previousApp.destroy();
    }
    if (window[BOOT_TIMER_KEY]) {
        clearInterval(window[BOOT_TIMER_KEY]);
        window[BOOT_TIMER_KEY] = null;
    }
    if (window[BOOT_TIMER_KEY_LEGACY]) {
        clearInterval(window[BOOT_TIMER_KEY_LEGACY]);
        window[BOOT_TIMER_KEY_LEGACY] = null;
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
                // 章节测验：skipChapterTest 优先于 autoAnswer
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
            },
            _videoEl: null,
            _treeContainerEl: null,
            _isPlaying: false,
            _currentRetryCount: 0,
            _checkInterval: null,
            _eventVideoEl: null,
            _boundVideoHandlers: null,
            _nextUnitPending: false,
            _chapterAdvanceTimes: 0,
            _autoAnswerRunning: false,
            _quizAutoAnswer: null,
            _autoAnswerDoneFor: null,
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
            run() {
                console.log("%c=== 学习通刷课+自动答题 V1 Optimized 启动 ===", "color:#4CAF50;font-size:16px;font-weight:bold");
                console.log("%c测验策略:", "color:#607D8B", {
                    skipChapterTest: this.configs.skipChapterTest,
                    autoAnswer: this.configs.autoAnswer,
                });
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

                console.log(`%c触发视频保活恢复(${reason})`, "color:#607D8B");
                video.play().catch((e) => {
                    console.warn("直接恢复播放失败，尝试静音恢复:", e);
                    video.muted = true;
                    video.play().catch((err) => {
                        console.error("静音恢复播放失败:", err);
                    });
                });
            },
            _checkVideoStatus() {
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
                        setTimeout(() => this.nextUnit(), 1000);
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
                try {
                    const el = this._getVideoEl();
                    if (el == null) {
                        if (this._currentStepTitle() === '视频') {
                            throw new Error('视频组件尚未加载完成');
                        }
                        if (this._advanceLearningStep()) {
                            console.log("%c当前不在视频页，已尝试切到下一学习步骤，2秒后重试", "color:#607D8B");
                            setTimeout(() => {
                                this.play();
                            }, 2000);
                            return;
                        }
                        if (this._isChapterTest()) {
                            // 优先级：跳过章节测验 > 自动答题 > 安全停止
                            if (this.configs.skipChapterTest) {
                                console.log('%c章节测验：skipChapterTest=true，跳过并进入下一步', 'color:#607D8B');
                                this._advanceChapterTest();
                                return;
                            }
                            if (this.configs.autoAnswer) {
                                this._runChapterAutoAnswer();
                                return;
                            }
                            console.warn('%c章节测验：skipChapterTest=false 且 autoAnswer=false，已安全停止。可手动答题后执行 app.nextUnit() / app._advanceChapterTest()。', 'color:#FF9800');
                            return;
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
                        this._tryTimes = 0;
                        console.log(`%c视频开始播放，倍速: ${el.playbackRate}x`, "color:#4CAF50");
                        this._startVideoMonitoring();
                    } catch (playError) {
                        console.error("视频播放失败:", playError);
                        this._handlePlayError(playError);
                    }
                } catch (e) {
                    if (this._tryTimes >= this.configs.maxRetries) {
                        console.error("%c视频播放失败，已达到最大重试次数", "color:#F44336;font-weight:bold", e);
                        this._clearCheckInterval();
                        return;
                    }
                    this._tryTimes++;
                    console.log(`%c播放失败，${this.configs.retryInterval/1000}秒后重试 (${this._tryTimes}/${this.configs.maxRetries})`, "color:#FF9800");
                    setTimeout(() => {
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
            _quizDocScore(doc) {
                if (!doc) return 0;
                let href = '';
                try { href = doc.defaultView?.location?.href || ''; } catch (e) {}
                return (doc.querySelector('.correctAnswer') ? 8 : 0)
                    + (doc.querySelector('.singleQuesId') ? 4 : 0)
                    + (doc.querySelector('.TiMu') ? 2 : 0)
                    + ([...doc.querySelectorAll("input[type='hidden']")].some((el) => /^answer\d+$/.test(el.id)) ? 1 : 0)
                    + (/doHomeWork|selectWorkQuestion|YiPiYue/i.test(href) ? 2 : 0);
            },
            _hasQuizDocuments() {
                const seen = new Set();
                const walk = (win, depth) => {
                    if (!win || depth > 5) return false;
                    try {
                        const doc = win.document;
                        if (doc && !seen.has(doc)) {
                            seen.add(doc);
                            if (this._quizDocScore(doc) >= 4) return true;
                        }
                        for (const frame of doc.querySelectorAll('iframe')) {
                            if (walk(frame.contentWindow, depth + 1)) return true;
                        }
                    } catch (e) {}
                    return false;
                };
                return walk(window, 0);
            },
            _isChapterTest() {
                // 步骤名可能是「章节测验」，也可能是普通小节内嵌测验 iframe
                return this._currentStepTitle() === '章节测验' || this._hasQuizDocuments();
            },
            _chapterKey() {
                try {
                    const u = new URL(location.href);
                    return [u.searchParams.get('chapterId'), u.searchParams.get('courseId'), this._currentStepTitle(), this._cellData.currentCellIndex, this._cellData.currentNCellIndex].join('|');
                } catch (e) {
                    return String(this._currentStepTitle() || '') + '|' + this._cellData.currentCellIndex + '|' + this._cellData.currentNCellIndex;
                }
            },
            async _runChapterAutoAnswer() {
                if (this._autoAnswerRunning) {
                    console.warn('%c自动答题进行中，忽略重复触发', 'color:#FF9800');
                    return;
                }
                const chapterKey = this._chapterKey();
                if (this._autoAnswerDoneFor === chapterKey) {
                    console.log('%c本小节已完成自动答题，改为进入下一步/下一节', 'color:#607D8B');
                    this._advanceChapterTest();
                    return;
                }
                this._autoAnswerRunning = true;
                this._clearCheckInterval();
                try {
                    if (!this._quizAutoAnswer) {
                        this._quizAutoAnswer = createQuizAutoAnswer(this.configs);
                    }
                    console.log('%c章节测验：开始自动答题（skipChapterTest=false, autoAnswer=true）', 'color:#2196F3;font-size:14px');
                    await this._quizAutoAnswer.run();
                    this._autoAnswerDoneFor = chapterKey;
                    console.log('%c自动答题流程结束，2秒后尝试进入下一学习步骤', 'color:#4CAF50');
                    this._chapterAdvanceTimes = 0;
                    setTimeout(() => this._advanceChapterTest(), 2000);
                } catch (error) {
                    console.error('%c自动答题失败: ', 'color:#F44336;font-weight:bold', error && (error.message || error));
                } finally {
                    this._autoAnswerRunning = false;
                }
            },
            _advanceChapterTest() {
                if (this._chapterAdvanceTimes >= 3) {
                    console.error('%c章节测验页面连续跳转失败，已停止以避免页面循环。请手动处理后执行 app.run()。', 'color:#F44336;font-weight:bold');
                    return;
                }

                const nextButton = $('#prevNextFocusNext:visible, #right1:visible, .nextChapter:visible').first().get(0)
                    || $('#prevNextFocusNext, #right1, .nextChapter').first().get(0);
                if (!nextButton) {
                    console.warn('%c未找到章节测验的下一步按钮，改为切换下一小节', 'color:#FF9800');
                    this.nextUnit();
                    return;
                }

                this._chapterAdvanceTimes++;
                console.log('%c检测到章节测验，尝试进入下一学习步骤', 'color:#607D8B');
                nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                setTimeout(() => this.play(), 2000);
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

                $(document).off('click.xuexitongPlayerV3', '.prev_white').on('click.xuexitongPlayerV3', '.prev_white', (e) => {
                    const text = ($(e.currentTarget).text() || "").replace(/\s+/g, "");
                    if (text.includes("视频")) {
                        console.log(`%c检测到步骤切换点击：${text}，准备重新接管视频页`, "color:#607D8B");
                        reenterVideoMode();
                    }
                });
            },
            _handlePlayError(error) {
                console.error("播放错误详情:", error);
                const video = this._getVideoEl();
                if (video) {
                    video.muted = true;
                    video.play().then(() => {
                        console.log("%c静音播放成功", "color:#4CAF50");
                        this._tryTimes = 0;
                        this._startVideoMonitoring();
                        if (this._delayedNextUnitTimer) {
                            clearTimeout(this._delayedNextUnitTimer);
                            this._delayedNextUnitTimer = null;
                        }
                    }).catch(e => {
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
                        this._delayedNextUnitTimer = setTimeout(() => {
                            this._delayedNextUnitTimer = null;
                            this.play();
                        }, this.configs.retryInterval);
                    });
                }
            },
            playCurrentIndex(nCell) {
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
                setTimeout(() => {
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
                setTimeout(() => this.nextUnit(), 1000);
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
                this._isPlaying = false;
                this._clearCheckInterval();
                this._detachVideoEvents();
                if (this._delayedNextUnitTimer) clearTimeout(this._delayedNextUnitTimer);
                $(document).off('.xuexitongPlayerV3');
                this._autoAnswerRunning = false;
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

    function createQuizAutoAnswer(configs) {
        const APP_KEY = "__xuexitongAutoAnswer";
function quizDocScore(doc) {
        if (!doc) return 0;
        const href = doc.defaultView?.location?.href || "";
        return (doc.querySelector(".correctAnswer") ? 8 : 0)
            + (doc.querySelector(".singleQuesId") ? 4 : 0)
            + (doc.querySelector(".TiMu") ? 2 : 0)
            + ([...doc.querySelectorAll("input[type='hidden']")].some((el) => /^answer\d+$/.test(el.id)) ? 1 : 0)
            + (/doHomeWork|selectWorkQuestion|YiPiYue/i.test(href) ? 2 : 0);
    }

    function collectQuizDocuments() {
        const docs = [];
        const seen = new Set();
        collectDocs().forEach((doc) => {
            if (quizDocScore(doc) < 4 || seen.has(doc)) return;
            seen.add(doc);
            docs.push(doc);
        });
        return docs.sort((a, b) => quizDocScore(b) - quizDocScore(a));
    }

    function getQuizDocument() {
        return collectQuizDocuments()[0] || null;
    }

    function collectDocs() {
        const docs = [];
        const walk = (win, depth) => {
            if (!win || depth > 5) return;
            try {
                docs.push(win.document);
                for (const frame of win.document.querySelectorAll("iframe")) {
                    walk(frame.contentWindow, depth + 1);
                }
            } catch (e) {}
        };
        walk(window, 0);
        return docs;
    }

    function findGradedDocuments() {
        return collectQuizDocuments().filter((doc) => isGradedPage(doc));
    }

    function findHomeworkDocuments() {
        return collectQuizDocuments().filter((doc) => !isGradedPage(doc));
    }

    function extractWorkId(doc) {
        const href = doc?.defaultView?.location?.href || "";
        return (String(href).match(/[?&]workId=(\d+)/) || [])[1] || "";
    }

    function quizDocLabel(doc) {
        const workId = extractWorkId(doc);
        const href = doc?.defaultView?.location?.href || "";
        if (/YiPiYue|lookWork/i.test(href)) return `已批阅${workId ? `(workId=${workId})` : ""}`;
        if (/doHomeWork/i.test(href)) return `答题中${workId ? `(workId=${workId})` : ""}`;
        return workId ? `workId=${workId}` : "测验页";
    }

    function findCorrectAnswerDocument() {
        return findGradedDocuments()[0] || collectDocs().find((doc) => doc.querySelector(".correctAnswer, .answerFont")) || null;
    }

    let cxFontMap = null;

    function usesSecretFont(el) {
        if (!el) return false;
        try {
            const family = (el.ownerDocument.defaultView.getComputedStyle(el).fontFamily || "").toLowerCase();
            return /cxsecret/.test(family);
        } catch (e) {
            return false;
        }
    }

    const cxFontMaps = new WeakMap();

    function decodeCxText(text, doc) {
        const map = (doc && cxFontMaps.get(doc)) || cxFontMap;
        if (!text || !map) return text;
        return Array.from(String(text)).map((ch) => {
            const next = map[ch.codePointAt(0)];
            return next ? String.fromCodePoint(next) : ch;
        }).join("");
    }

    function isInsideSecret(node) {
        const el = node.nodeType === 1 ? node : node.parentElement;
        const wrap = el && el.closest && el.closest(".font-cxsecret");
        return !!(wrap && usesSecretFont(wrap));
    }

    function readNodeText(el) {
        if (!el) return "";
        if (!usesSecretFont(el) && !el.querySelector?.(".font-cxsecret")) {
            return (el.innerText || "").replace(/\s+/g, " ").trim();
        }
        let out = "";
        const walk = (node) => {
            if (node.nodeType === 3) {
                const raw = node.nodeValue || "";
                out += isInsideSecret(node) ? decodeCxText(raw, el.ownerDocument) : raw;
                return;
            }
            if (node.nodeType === 1) node.childNodes.forEach(walk);
        };
        walk(el);
        return out.replace(/\s+/g, " ").trim();
    }

    function readPlainText(el) {
        return (el?.innerText || "").replace(/\s+/g, " ").trim();
    }

    function collectSecretChars(docs) {
        const chars = new Set();
        docs.forEach((doc) => {
            doc.querySelectorAll(".font-cxsecret").forEach((el) => {
                if (!usesSecretFont(el)) return;
                Array.from(el.innerText || "").forEach((ch) => {
                    if (ch.trim()) chars.add(ch);
                });
            });
        });
        return [...chars];
    }

    function pickSecretFontFamily(doc) {
        const sample = [...doc.querySelectorAll(".font-cxsecret")].find(usesSecretFont);
        if (sample) {
            const family = doc.defaultView.getComputedStyle(sample).fontFamily;
            if (family) return family;
        }
        return "font-cxsecret";
    }

    function findCxSecretFontBuffer(doc) {
        const chunks = [...doc.querySelectorAll("style")].map((el) => el.textContent || "");
        try {
            [...doc.styleSheets].forEach((sheet) => {
                try {
                    [...sheet.cssRules].forEach((rule) => chunks.push(rule.cssText || ""));
                } catch (e) {}
            });
        } catch (e) {}
        const css = chunks.join("\n");
        const match = css.match(/font-cxsecret[\s\S]{0,200}?base64,([A-Za-z0-9+/=]+)/);
        if (!match) return null;
        const bin = Uint8Array.from(atob(match[1]), (ch) => ch.charCodeAt(0));
        return bin.buffer;
    }

    function parseCmapChars(buffer) {
        const bin = new Uint8Array(buffer);
        const dv = new DataView(buffer);
        const u16 = (offset) => dv.getUint16(offset);
        const u32 = (offset) => dv.getUint32(offset);
        const i16 = (offset) => dv.getInt16(offset);
        const tableCount = u16(4);
        let cmapOff = 0;
        for (let i = 0; i < tableCount; i++) {
            const offset = 12 + i * 16;
            const tag = String.fromCharCode(bin[offset], bin[offset + 1], bin[offset + 2], bin[offset + 3]);
            if (tag === "cmap") cmapOff = u32(offset + 8);
        }
        if (!cmapOff) return [];
        const rec = cmapOff + u32(cmapOff + 8);
        if (u16(rec) !== 4) return [];
        const segCount = u16(rec + 6) / 2;
        const endCodes = rec + 14;
        const startCodes = endCodes + segCount * 2 + 2;
        const idDelta = startCodes + segCount * 2;
        const idRange = idDelta + segCount * 2;
        const chars = [];
        for (let s = 0; s < segCount; s++) {
            const start = u16(startCodes + s * 2);
            const end = u16(endCodes + s * 2);
            const delta = i16(idDelta + s * 2);
            const range = u16(idRange + s * 2);
            for (let code = start; code <= end && code !== 0xFFFF; code++) {
                let gid = 0;
                if (range === 0) gid = (code + delta) & 0xFFFF;
                else {
                    const glyph = u16(idRange + s * 2 + range + (code - start) * 2);
                    gid = glyph ? (glyph + delta) & 0xFFFF : 0;
                }
                if (gid) chars.push(String.fromCodePoint(code));
            }
        }
        return chars;
    }

    function createNormDrawer(doc, fontFamily, size, n) {
        const canvas = doc.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        return (ch) => {
            ctx.clearRect(0, 0, size, size);
            ctx.fillStyle = "#000";
            ctx.font = `${Math.floor(size * 0.72)}px ${fontFamily}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(ch, size / 2, size / 2 + 1);
            const data = ctx.getImageData(0, 0, size, size).data;
            let minX = size;
            let minY = size;
            let maxX = 0;
            let maxY = 0;
            let ink = 0;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    if (data[(y * size + x) * 4 + 3] > 80) {
                        ink += 1;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            if (!ink) return { ink: 0, bits: null };
            const width = Math.max(1, maxX - minX + 1);
            const height = Math.max(1, maxY - minY + 1);
            const bits = new Uint8Array(n * n);
            for (let yy = 0; yy < n; yy++) {
                for (let xx = 0; xx < n; xx++) {
                    const sx = minX + Math.floor(xx * width / n);
                    const sy = minY + Math.floor(yy * height / n);
                    bits[yy * n + xx] = data[(sy * size + sx) * 4 + 3] > 80 ? 1 : 0;
                }
            }
            return { ink, bits };
        };
    }

    function bitDistance(a, b) {
        let dist = 0;
        for (let i = 0; i < a.length; i++) dist += a[i] ^ b[i];
        return dist;
    }

    async function waitForSecretFont(doc, family) {
        try {
            if (doc.fonts) {
                await doc.fonts.ready;
                await doc.fonts.load(`28px ${family}`);
            }
        } catch (e) {}
        await new Promise((resolve) => setTimeout(resolve, 80));
    }

    async function ensureCxFontMap(doc) {
        if (!configs.decodeFont) return null;
        const docs = doc ? [doc, ...collectQuizDocuments()] : collectQuizDocuments();
        let built = 0;
        for (const secretDoc of docs) {
            if (cxFontMaps.has(secretDoc)) continue;
            if (![...secretDoc.querySelectorAll(".font-cxsecret")].some(usesSecretFont)) continue;
            const buffer = findCxSecretFontBuffer(secretDoc);
            const cipherChars = buffer ? parseCmapChars(buffer) : collectSecretChars([secretDoc]);
            if (!cipherChars.length) continue;
            const family = pickSecretFontFamily(secretDoc);
            await waitForSecretFont(secretDoc, family);
            const size = 40;
            const n = 24;
            const drawSecret = createNormDrawer(secretDoc, family, size, n);
            const drawRef = createNormDrawer(secretDoc, '"Microsoft YaHei","SimHei","PingFang SC","Noto Sans SC",sans-serif', size, n);
            const secrets = cipherChars.map((ch) => ({ ch, glyph: drawSecret(ch) })).filter((item) => item.glyph.bits);
            if (!secrets.length) continue;
            const best = secrets.map(() => ({ ch: "", dist: Infinity }));
            const addRef = (ch) => {
                const glyph = drawRef(ch);
                if (!glyph.bits || glyph.ink < 6) return;
                secrets.forEach((item, i) => {
                    if (glyph.ink < item.glyph.ink * 0.5 || glyph.ink > item.glyph.ink * 1.85) return;
                    const dist = bitDistance(item.glyph.bits, glyph.bits);
                    if (dist < best[i].dist) {
                        best[i].dist = dist;
                        best[i].ch = ch;
                    }
                });
            };
            for (let i = 33; i <= 126; i++) addRef(String.fromCharCode(i));
            "、。·…—【】（）《》？！，、对错正确错误是否".split("").forEach(addRef);
            for (let code = 0x4e00; code <= 0x9fa5; code++) addRef(String.fromCodePoint(code));
            const map = {};
            let hit = 0;
            secrets.forEach((item, i) => {
                const limit = Math.floor(n * n * 0.42);
                if (!best[i].ch || best[i].ch === item.ch || best[i].dist > limit) return;
                map[item.ch.codePointAt(0)] = best[i].ch.codePointAt(0);
                hit += 1;
            });
            if (!hit) continue;
            cxFontMaps.set(secretDoc, map);
            cxFontMap = map;
            built += 1;
            console.log(`%c字体解密完成，映射 ${hit}/${secrets.length} 个加密字`, "color:#4CAF50");
        }
        if (!built) {
            const named = docs.some((item) => item.querySelector(".font-cxsecret"));
            if (named) console.log("%c.fontLabel 带 font-cxsecret 类，但没有需要解码的加密字，按明文读取", "color:#607D8B");
        }
        return cxFontMap;
    }

    function questionId(box, hidden) {
        const fromBox = String(box?.id || "").replace(/^question/, "");
        if (fromBox && /^\d+$/.test(fromBox)) return fromBox;
        const fromLi = box?.querySelector("li[qid]")?.getAttribute("qid");
        if (fromLi) return fromLi;
        const fromHidden = String(hidden?.id || "").replace(/^answer/, "");
        if (fromHidden && /^\d+$/.test(fromHidden)) return fromHidden;
        return "";
    }

    function readQuestionBoxes(doc) {
        const boxes = [];
        const seen = new Set();
        const push = (el) => {
            if (!el || seen.has(el)) return;
            if (el.closest && el.closest(".singleQuesId") && el.closest(".singleQuesId") !== el) return;
            seen.add(el);
            boxes.push(el);
        };
        doc.querySelectorAll(".singleQuesId, .TiMu").forEach(push);
        doc.querySelectorAll('[id^="question"]').forEach((el) => {
            if (/^question\d+$/.test(el.id)) push(el);
        });
        [...doc.querySelectorAll("input[type='hidden']")]
            .filter((el) => /^answer\d+$/.test(el.id))
            .forEach((hidden) => {
                const qid = hidden.id.replace(/^answer/, "");
                const box = doc.getElementById("question" + qid)
                    || hidden.closest(".singleQuesId, .TiMu, li, div");
                if (box) push(box);
            });
        return boxes;
    }

    function readStem(box) {
        const label = box.querySelector(".fontLabel");
        if (label) {
            const title = decodeCxText(readPlainText(label.querySelector(".newZy_TItle")), box.ownerDocument);
            const clone = label.cloneNode(true);
            clone.querySelectorAll(".newZy_TItle").forEach((el) => el.remove());
            const body = decodeCxText(readPlainText(clone), box.ownerDocument);
            const stem = [title, body].filter(Boolean).join(" ");
            if (stem) return stem;
            return readPlainText(label);
        }
        const el = box.querySelector(".mark_name, .Zy_TItle, .stem, .q_title, h3, h2.type_tit");
        return readPlainText(el) || readPlainText(box).slice(0, 800);
    }

    function optionItems(box) {
        const top = [...box.querySelectorAll("ul.Zy_ulTop li")];
        const list = (top.length ? top : [...box.querySelectorAll("li[onclick*='addChoice'], li[onclick*='addMultipleChoice']")])
            .filter((li, i, arr) => arr.indexOf(li) === i);
        return list.filter((li) => optionLetter(li));
    }

    function readOptions(box) {
        return optionItems(box).map((li) => ({
            letter: optionLetter(li),
            text: optionText(li),
            el: li,
        })).filter((item) => item.letter || item.text);
    }

    function readQuestionNum(box, qid, index) {
        const attr = box.getAttribute("num") || box.querySelector("[num]")?.getAttribute("num");
        if (attr && /^\d+$/.test(attr)) return Number(attr);
        const card = qid && box.ownerDocument.querySelector(`.Cy_ulBottom #num${qid}, .answerCard [qid="${qid}"]`);
        const cardText = (card?.innerText || "").trim();
        if (/^\d+$/.test(cardText)) return Number(cardText);
        return index + 1;
    }

    function parseQuestion(box, index) {
        const hidden = questionHidden(box.ownerDocument, box);
        const qid = questionId(box, hidden);
        const options = readOptions(box);
        const stem = readStem(box);
        const num = readQuestionNum(box, qid, index);
        const content = [
            stem,
            ...options.map((item) => `${item.letter || ""}. ${item.text}`.replace(/^\.\s*/, "")),
        ].filter(Boolean).join("\n");
        return {
            num,
            qid,
            stem,
            options,
            content,
            box,
            filled: !!(hidden && String(hidden.value || "").trim()),
        };
    }

    function getPageQuestions(doc) {
        const docs = doc ? [doc] : collectQuizDocuments();
        if (!docs.length) {
            console.warn("%c未找到作业 iframe，当前不在测验文档里", "color:#FF9800");
            return [];
        }
        const questions = [];
        const seen = new Set();
        docs.forEach((currentDoc) => {
            readQuestionBoxes(currentDoc).forEach((box) => {
                const parsed = parseQuestion(box, questions.length);
                const key = parsed.qid || String(parsed.stem || parsed.content).slice(0, 80);
                if (seen.has(key)) return;
                seen.add(key);
                questions.push(parsed);
            });
        });
        questions.forEach((question, i) => { question.num = i + 1; });
        const preview = questions.map(({ box, options, ...rest }) => ({
            ...rest,
            optionCount: options.length,
        }));
        console.log("%c识别题目列表:", "color:#2196F3", preview);
        return questions;
    }

    function questionKey(question) {
        return question.qid ? `qid:${question.qid}` : `num:${question.num}`;
    }

    function unansweredQuestions(questions) {
        return questions.filter((question) => !question.filled);
    }

    const QUIZ_STORE_PREFIX = "xuexitongQuizAnswers:";

    function findCourseId(doc) {
        const hrefs = [doc?.defaultView?.location?.href, location.href];
        try {
            let win = doc?.defaultView;
            while (win) {
                hrefs.push(win.location.href);
                if (win === window.top) break;
                win = win.parent;
            }
        } catch (e) {}
        for (const href of hrefs) {
            const match = String(href || "").match(/[?&]courseId=(\d+)/);
            if (match) return match[1];
        }
        return "default";
    }

    function courseStoreKey(doc) {
        return QUIZ_STORE_PREFIX + findCourseId(doc);
    }

    function redoUsedStoreKey(doc) {
        return "xuexitongQuizRedoUsed:" + findCourseId(doc);
    }

    function loadRedoUsed(doc) {
        try {
            return JSON.parse(localStorage.getItem(redoUsedStoreKey(doc)) || "{}") || {};
        } catch (e) {
            return {};
        }
    }

    function saveRedoUsed(doc, map) {
        localStorage.setItem(redoUsedStoreKey(doc), JSON.stringify(map));
    }

    function getRedoUsedCount(doc, workId) {
        if (!workId) return 0;
        const n = Number(loadRedoUsed(doc)[workId]);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }

    function bumpRedoUsedCount(doc, workId) {
        if (!workId) return 0;
        const map = loadRedoUsed(doc);
        const next = getRedoUsedCount(doc, workId) + 1;
        map[workId] = next;
        saveRedoUsed(doc, map);
        return next;
    }

    function getAutoRedoLimit() {
        if (!configs.autoRedo) return 0;
        const n = Number(configs.autoRedoTimes);
        if (!Number.isFinite(n) || n < 0) return 1;
        return Math.floor(n);
    }

    function parseRedoRemaining(doc) {
        if (!doc) return null;
        const hit = [...doc.querySelectorAll("a, button, span, input")].find((el) => {
            const text = (el.innerText || el.value || "").replace(/\s+/g, " ").trim();
            return /^重做/.test(text) && text.length < 40;
        });
        if (!hit) return null;
        const text = (hit.innerText || hit.value || "").replace(/\s+/g, " ");
        const m = text.match(/剩余\s*(\d+)\s*次/);
        return m ? Number(m[1]) : null;
    }

    function loadAnswerStore(doc) {
        try {
            return JSON.parse(localStorage.getItem(courseStoreKey(doc)) || "{}") || {};
        } catch (e) {
            return {};
        }
    }

    function saveAnswerStore(doc, map) {
        localStorage.setItem(courseStoreKey(doc), JSON.stringify(map));
    }

    function normalizeStem(stem) {
        return String(stem || "")
            .replace(/\s+/g, " ")
            .replace(/【[^】]*】/g, "")
            .replace(/[（(]\s*\d+(?:\.\d+)?\s*分\s*[）)]/g, "")
            .replace(/正确答案.*/, "")
            .replace(/我的答案.*/, "")
            .replace(/^\d+[.、．\s]+/, "")
            .trim();
    }

    function isGradedPage(doc) {
        if (!doc) return false;
        if (doc.querySelector(".correctAnswer, .answerFont")) return true;
        const href = [doc.defaultView?.location?.href, location.href].join(" ");
        if (/YiPiYue|selectWorkQuestionYiPiYue|lookWork/i.test(href)) return true;
        const boxes = readQuestionBoxes(doc);
        if (boxes.some((box) => /正确答案/.test(box.innerText || ""))) return true;
        const body = (doc.body?.innerText || "").replace(/\s+/g, "");
        return /正确答案/.test(body) && /已批阅|请重做|得分/.test(body);
    }

    function findCorrectAnswerRoot(box) {
        if (!box) return null;
        const inside = box.querySelector(".correctAnswer");
        if (inside) return inside;
        let node = box.nextElementSibling;
        while (node && !node.classList?.contains("singleQuesId") && !node.classList?.contains("TiMu") && !/^question\d+$/.test(node.id || "")) {
            if (node.classList?.contains("correctAnswer")) return node;
            const nested = node.querySelector?.(".correctAnswer");
            if (nested) return nested;
            node = node.nextElementSibling;
        }
        const parent = box.parentElement;
        if (parent && parent.querySelectorAll(".singleQuesId, .TiMu, [id^='question']").length <= 1) {
            return parent.querySelector(".correctAnswer");
        }
        return null;
    }

    function parseCorrectAnswerText(raw) {
        const compact = String(raw || "").replace(/\s+/g, "").replace(/^正确答案[:：]?/, "").trim();
        if (!compact) return "";
        if (/^[A-Ha-h]+$/.test(compact)) return compact.toUpperCase();
        if (/^(对|错|正确|错误)$/.test(compact)) {
            if (compact === "正确") return "对";
            if (compact === "错误") return "错";
            return compact;
        }
        const spaced = String(raw || "").replace(/\s+/g, " ").trim();
        const letter = spaced.match(/正确答案\s*[:：]?\s*([A-Ha-h]+)/);
        if (letter) return letter[1].toUpperCase();
        const judge = spaced.match(/正确答案\s*[:：]?\s*(对|错|正确|错误)/);
        if (judge) {
            if (judge[1] === "正确") return "对";
            if (judge[1] === "错误") return "错";
            return judge[1];
        }
        const other = spaced.match(/正确答案\s*[:：]?\s*(.+?)(?:我的答案|得分|解析|$)/);
        if (other) return other[1].replace(/[。；;]+$/, "").trim();
        return compact;
    }

    function extractCorrectAnswer(box, fallbackRoot) {
        const root = findCorrectAnswerRoot(box) || fallbackRoot;
        if (!root) return "";
        const fromCon = parseCorrectAnswerText(root.querySelector(".answerCon")?.innerText || "");
        if (fromCon) return fromCon;
        return parseCorrectAnswerText(root.innerText || "");
    }

    function harvestCorrectAnswers(doc, questions) {
        const map = loadAnswerStore(doc);
        const nodes = [...doc.querySelectorAll(".correctAnswer")];
        console.log(`%c检测到 .correctAnswer ${nodes.length} 个`, "color:#607D8B");
        let added = 0;
        const list = questions.length ? questions : nodes.map((node, i) => ({
            num: i + 1,
            qid: "",
            stem: readStem(node.closest(".singleQuesId, .TiMu, [id^='question']") || node.parentElement || node),
            content: "",
            box: node.closest(".singleQuesId, .TiMu, [id^='question']") || node.parentElement,
        }));
        const ordered = [];
        list.forEach((question, i) => {
            const correct = extractCorrectAnswer(question.box, nodes[i]);
            ordered.push(correct || "");
            if (!correct) {
                console.warn(`%c第${i + 1}题未读到正确答案`, "color:#FF9800");
                return;
            }
            const stemKey = normalizeStem(question.stem || question.content);
            if (stemKey) map[stemKey] = correct;
            if (question.qid) map["qid:" + question.qid] = correct;
            added += 1;
            console.log(`%c记录第${i + 1}题: ${correct}`, "color:#4CAF50", stemKey);
        });
        // 已批阅页若没有「正确答案」，不要用空串覆盖已有 __order
        if (ordered.some(Boolean)) {
            const workId = extractWorkId(doc);
            if (workId) map["__order:" + workId] = ordered;
            map.__order = ordered;
        }
        saveAnswerStore(doc, map);
        return { map, added };
    }

    function lookupStoredAnswer(question, store, index) {
        if (!store) return "";
        if (question.qid && store["qid:" + question.qid]) return store["qid:" + question.qid];
        const stem = normalizeStem(question.stem || question.content);
        if (stem && store[stem]) return store[stem];
        const keys = Object.keys(store).filter((key) => key !== "__order" && !key.startsWith("__order:") && !key.startsWith("qid:"));
        const hit = keys.find((key) => key && stem && (stem.includes(key) || key.includes(stem)));
        if (hit) return store[hit];
        const workId = extractWorkId(question.box?.ownerDocument);
        const scoped = workId && Array.isArray(store["__order:" + workId]) ? store["__order:" + workId] : null;
        if (scoped && scoped[index]) return scoped[index];
        if (Array.isArray(store.__order) && store.__order[index]) return store.__order[index];
        return "";
    }

    function dumpQuizAnswers() {
        const doc = getQuizDocument() || document;
        const map = loadAnswerStore(doc);
        const redoUsed = loadRedoUsed(doc);
        console.log("%c已存答案映射:", "color:#2196F3", map);
        console.log("%c已用自动重做次数:", "color:#607D8B", redoUsed, `上限 autoRedoTimes=${getAutoRedoLimit()}`);
        return { answers: map, redoUsed, autoRedoTimes: getAutoRedoLimit() };
    }

    function clearQuizAnswers() {
        const doc = getQuizDocument() || document;
        localStorage.removeItem(courseStoreKey(doc));
        localStorage.removeItem(redoUsedStoreKey(doc));
        console.log("%c已清空答案映射与自动重做计数", "color:#FF9800");
    }

    function buildPrompt(questions) {
        return `请你做以下题目：
选择题：按题目出现顺序返回【序号:字母】，如 1:A 2:BC
判断题：按题目出现顺序返回【序号:对/错】
简答题：按题目出现顺序返回【序号:答案】
格式必须干净，不要多余内容，不要重复题干里的题号！
题目：
${questions.map((q) => q.content).join("\n\n")}`;
    }

    function logPrompt(questions) {
        console.log("%c=== 组装完成 prompt ===", "color:#2196F3;font-size:14px");
        console.log("%c" + buildPrompt(questions), "color:#607D8B");
    }

    // 2. 调用AI获取答案（DeepSeek）
    async function getAIAnswer(questions) {
        const apiKey = configs.apiKey;
        console.log(`%cAPI Key 已填写: ${!!(apiKey && apiKey !== "你的api")}`, "color:#607D8B");
        if (!apiKey || apiKey === "你的api") {
            console.warn("%c请先填入 DeepSeek API Key", "color:#FF9800");
            return "⚠️ 请先填入DeepSeek API Key";
        }
        try {
            const prompt = buildPrompt(questions);

            const res = await fetch("https://api.deepseek.com/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: configs.model || "deepseek-chat",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.0
                })
            });
            console.log(`%cAPI 响应: ok=${res.ok} status=${res.status}`, res.ok ? "color:#4CAF50" : "color:#F44336;font-weight:bold");
            if (!res.ok) {
                console.error(`%cAPI 请求失败: ${res.status}`, "color:#F44336;font-weight:bold");
                return `⚠️ API请求失败: ${res.status}`;
            }
            const data = await res.json();
            console.log("%cAI 完整返回:", "color:#2196F3", data);
            const aiContent = data.choices?.[0]?.message?.content || "获取答案失败";
            console.log("%cAI 原始回答:", "color:#2196F3", aiContent);
            return aiContent;
        } catch (e) {
            console.error("%cAPI 请求异常:", "color:#F44336;font-weight:bold", e);
            return "⚠️ CORS跨域拦截！浏览器控制台环境无法直接调用DeepSeek接口，需要后端代理或Tampermonkey @connect";
        }
    }

    function parseAnswerMap(answerText) {
        if (answerText && typeof answerText === "object" && !Array.isArray(answerText)) {
            return Object.fromEntries(
                Object.entries(answerText).map(([num, value]) => [String(num), String(value).trim()])
            );
        }
        const text = String(answerText || "");
        const answerMap = {};
        text.split(/\n+/).forEach((line, idx) => {
            const match = String(line).match(/^\s*(\d+)\s*[:：.、]\s*(.+?)\s*$/);
            console.log(`%c解析答案行 ${idx}: ${String(line)}`, "color:#607D8B", match);
            if (match) answerMap[match[1]] = match[2].trim();
        });
        return answerMap;
    }

    function classifyAnswer(raw) {
        const compact = String(raw || "").replace(/[,，、\s#/|;；.．]/g, "");
        if (/^(对|正确|TRUE|T|YES|Y)$/i.test(compact)) return { kind: "tf", value: "对" };
        if (/^(错|错误|FALSE|F|NO|N)$/i.test(compact)) return { kind: "tf", value: "错" };
        if (/^[A-Za-z]+$/.test(compact)) return { kind: "letters", value: compact.toUpperCase().split("") };
        return { kind: "text", value: String(raw || "").trim() };
    }

    function optionMark(li) {
        return li?.querySelector(".num_option_dx, .num_option") || null;
    }

    function optionLetter(li) {
        if (!li) return "";
        const mark = optionMark(li);
        const attr = (mark?.getAttribute("data") || li.getAttribute("data") || "").toUpperCase();
        if (/^[A-H]$/.test(attr)) return attr;
        const text = ((mark?.innerText || li.querySelector("i.fl, label.fl.before")?.innerText || "").replace(/\s+/g, " ").trim()).toUpperCase();
        const match = text.match(/^([A-H])/);
        return match ? match[1] : "";
    }

    function optionText(li) {
        return readPlainText(li.querySelector("a.fl.after"))
            || readPlainText(li.querySelector("a.fl"))
            || "";
    }

    function hiddenLetters(value) {
        return new Set(String(value || "").toUpperCase().replace(/[^A-Z]/g, "").split("").filter(Boolean));
    }

    function isMultiQuestion(box) {
        if (box.querySelector(".num_option_dx, li[onclick*='addMultipleChoice']")) return true;
        const qtype = box.querySelector("li[qtype]")?.getAttribute("qtype");
        if (qtype === "1") return true;
        if (qtype === "0" || qtype === "3") return false;
        return /多选/.test(box.querySelector(".newZy_TItle, .fontLabel")?.innerText || "");
    }

    function isOptionChecked(li) {
        const mark = optionMark(li);
        if (mark?.classList.contains("check_answer_dx") || mark?.classList.contains("check_answer")) return true;
        return li.getAttribute("aria-checked") === "true";
    }

    function visualLetters(box) {
        return optionItems(box)
            .filter((li) => isOptionChecked(li))
            .map(optionLetter)
            .filter(Boolean)
            .sort();
    }

    function currentLetters(box, hidden) {
        const marked = visualLetters(box);
        const stored = [...hiddenLetters(hidden?.value)].sort();
        return marked.length >= stored.length ? marked : stored;
    }

    function clickOption(win, li, multi) {
        if (multi && win && typeof win.addMultipleChoice === "function") {
            win.addMultipleChoice(li);
            return;
        }
        if (!multi && win && typeof win.addChoice === "function") {
            win.addChoice(li);
            return;
        }
        li.click();
    }

    function clearSelectedOptions(doc, box) {
        const win = doc.defaultView;
        const multi = isMultiQuestion(box);
        optionItems(box).forEach((li) => {
            if (isOptionChecked(li)) clickOption(win, li, multi);
        });
    }

    function questionHidden(doc, box) {
        const qid = String(box.id || "").replace(/^question/, "")
            || box.querySelector("li[qid]")?.getAttribute("qid")
            || "";
        const byId = qid && doc.getElementById("answer" + qid);
        if (byId && /^answer\d+$/.test(byId.id)) return byId;
        return [...box.querySelectorAll("input[type='hidden']")].find((el) => /^answer\d+$/.test(el.id)) || null;
    }

    function syncHiddenFromVisual(doc, box) {
        const win = doc.defaultView;
        const hidden = questionHidden(doc, box);
        const joined = visualLetters(box).join("");
        if (!hidden) return joined;
        hidden.value = joined;
        hidden.dispatchEvent(new Event("input", { bubbles: true }));
        hidden.dispatchEvent(new Event("change", { bubbles: true }));
        if (win && typeof win.$ === "function") win.$(hidden).val(joined).trigger("change");
        return joined;
    }

    function fillTextAnswer(doc, box, value) {
        const win = doc.defaultView;
        const hidden = questionHidden(doc, box);
        const fields = [...box.querySelectorAll("textarea, input[type='text']")];
        const chunks = String(value).split(/\s*[|／/;；]\s*/).filter(Boolean);
        if (fields.length) {
            fields.forEach((field, i) => {
                const next = chunks.length > 1 ? (chunks[i] ?? "") : (i === 0 ? value : field.value);
                field.value = next;
                field.dispatchEvent(new Event("input", { bubbles: true }));
                field.dispatchEvent(new Event("change", { bubbles: true }));
            });
        }
        if (hidden) {
            hidden.value = value;
            hidden.dispatchEvent(new Event("input", { bubbles: true }));
            hidden.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (win && typeof win.$ === "function" && hidden) {
            win.$(hidden).val(value).trigger("change");
        }
        return !!(fields.length || hidden);
    }

    function selectOptions(doc, box, letters) {
        const win = doc.defaultView;
        const wanted = [...new Set((letters || []).map((letter) => String(letter).toUpperCase()).filter((letter) => /^[A-H]$/.test(letter)))].sort();
        const items = optionItems(box);
        const wantedText = wanted.join("");
        const hidden = questionHidden(doc, box);
        if (!items.length || !wanted.length) {
            console.warn("%c选项节点或字母为空，无法点选", "color:#FF9800");
            return { ok: false, actual: "", wanted: wantedText };
        }
        const multi = isMultiQuestion(box) || wanted.length > 1;
        const clickLetter = (letter) => {
            const li = items.find((item) => optionLetter(item) === letter);
            if (li && !isOptionChecked(li)) clickOption(win, li, multi);
        };

        if (configs.clearBeforeSelect && currentLetters(box, hidden).length) {
            console.log("%c先取消已选选项", "color:#607D8B", currentLetters(box, hidden).join(""));
            clearSelectedOptions(doc, box);
        }
        wanted.forEach(clickLetter);

        const actual = currentLetters(box, questionHidden(doc, box)).join("");
        const ok = actual === wantedText;
        return { ok, actual, wanted: wantedText };
    }

    function matchTfLetters(box, value) {
        const items = [...box.querySelectorAll("ul.Zy_ulTop li, ul.Zy_ulBottom li, li[onclick*='addChoice']")];
        const hit = items.find((li) => {
            const text = optionText(li);
            return value === "对"
                ? /(^|[^错])(对|正确|是)/.test(text) && !/错误/.test(text)
                : /(错|错误|否)/.test(text);
        });
        if (hit) return [optionLetter(hit)];
        return value === "对" ? ["A"] : ["B"];
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function isVisible(el) {
        if (!el) return false;
        const win = el.ownerDocument?.defaultView;
        if (!win) return false;
        const style = win.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function nodeText(el) {
        if (!el) return "";
        return (el.innerText || el.value || el.getAttribute("title") || "").replace(/\s+/g, "");
    }

    function relatedDocs(doc) {
        const docs = [doc];
        try {
            let win = doc.defaultView;
            while (win && win !== window.top) {
                win = win.parent;
                if (win?.document && !docs.includes(win.document)) docs.push(win.document);
            }
            if (!docs.includes(document)) docs.push(document);
        } catch (e) {}
        return docs;
    }

    function visibleSubmitDialog(doc) {
        const nodes = doc.querySelectorAll('#cTipBox, .maskDiv, .maskTipDiv, .popDiv, .layui-layer, [class*="mask"], [class*="pop"]');
        for (const node of nodes) {
            if (!isVisible(node)) continue;
            const text = (node.innerText || "").replace(/\s+/g, "");
            if (text.length > 80) continue;
            if (/提示|确认提交|未做完|未完成|确认吗/.test(text)) return node;
        }
        return null;
    }

    function clickLabeledButton(root, label) {
        const hit = [...root.querySelectorAll("a, button, span, input, div")].find((el) => {
            return nodeText(el) === label && isVisible(el);
        });
        if (!hit) return false;
        hit.click();
        return true;
    }

    function clickMainSubmit(doc) {
        const win = doc.defaultView;
        if (win && typeof win.btnBlueSubmit === "function") {
            console.log("%c调用测验页函数 btnBlueSubmit()", "color:#2196F3");
            win.btnBlueSubmit();
            return true;
        }
        const btn = doc.querySelector('.btnSubmit, #btnSubmit, a[onclick*="btnBlueSubmit"], input[onclick*="btnBlueSubmit"]')
            || [...doc.querySelectorAll("a, button, input")].find((el) => nodeText(el) === "提交" && isVisible(el));
        if (!btn) return false;
        console.log("%c点击测验按钮：提交", "color:#2196F3");
        btn.click();
        return true;
    }

    async function confirmSubmitDialog(doc) {
        const docs = relatedDocs(doc);
        for (let i = 0; i < 15; i++) {
            for (const currentDoc of docs) {
                const dialog = visibleSubmitDialog(currentDoc);
                if (!dialog) continue;
                if (clickLabeledButton(dialog, "提交")) {
                    console.log("%c已确认提交弹窗", "color:#2196F3");
                    return true;
                }
                const win = currentDoc.defaultView;
                for (const name of ["sureSubmit", "confirmSubmit"]) {
                    if (win && typeof win[name] === "function") {
                        console.log(`%c调用测验页函数 ${name}()`, "color:#2196F3");
                        win[name]();
                        return true;
                    }
                }
            }
            await sleep(400);
        }
        return false;
    }

    function isFailPage(doc) {
        const docs = relatedDocs(doc);
        return docs.some((currentDoc) => {
            const text = (currentDoc.body?.innerText || "").replace(/\s+/g, "");
            return /未达到及格线|不及格/.test(text);
        });
    }

    function hasRedoControl(doc) {
        if (!doc) return false;
        const win = doc.defaultView;
        for (const name of ["redoTest", "reDoWork", "retest", "reTest", "repeatWork"]) {
            if (win && typeof win[name] === "function") return true;
        }
        return [...doc.querySelectorAll("a, button, span, input")].some((el) => {
            const text = nodeText(el);
            return /^重做/.test(text) && text.length < 30 && isVisible(el);
        });
    }

    function clickRedo(doc) {
        if (!doc) return false;
        const win = doc.defaultView;
        for (const name of ["redoTest", "reDoWork", "retest", "reTest", "repeatWork"]) {
            if (win && typeof win[name] === "function") {
                console.log(`%c调用测验页函数 ${name}()`, "color:#2196F3");
                win[name]();
                return true;
            }
        }
        const btn = [...doc.querySelectorAll("a, button, span, input")].find((el) => {
            const text = nodeText(el);
            return /^重做/.test(text) && text.length < 30 && isVisible(el);
        });
        if (btn) {
            console.log("%c点击重做", "color:#2196F3", (btn.innerText || "").trim());
            btn.click();
            return true;
        }
        return false;
    }

    async function redoWithStoredAnswers(gradedDoc) {
        const workId = extractWorkId(gradedDoc);
        const limit = getAutoRedoLimit();
        const used = getRedoUsedCount(gradedDoc, workId);
        console.log(`%cautoRedo：处理 ${quizDocLabel(gradedDoc)}（已用 ${used}/${limit}）`, "color:#2196F3;font-size:14px");
        if (limit <= 0) {
            console.warn("%cautoRedo 未启用或 autoRedoTimes=0，跳过重做", "color:#FF9800");
            return false;
        }
        if (used >= limit) {
            console.warn(`%c已达本测验自动重做上限 autoRedoTimes=${limit}，跳过（clearQuizAnswers 可清零计数）`, "color:#FF9800");
            return false;
        }
        if (!hasRedoControl(gradedDoc)) {
            console.warn("%c不能重做：该测验没有「重做」按钮（可能只允许提交一次），跳过此 iframe", "color:#FF9800");
            return false;
        }
        const remaining = parseRedoRemaining(gradedDoc);
        if (remaining === 0) {
            console.warn("%c平台剩余重做次数为 0，跳过", "color:#FF9800");
            return false;
        }
        if (remaining != null) {
            console.log(`%c平台剩余重做 ${remaining} 次，脚本上限 ${limit} 次`, "color:#607D8B");
        }
        if (!clickRedo(gradedDoc)) {
            console.warn("%c不能重做：未找到可用的重做入口，跳过此 iframe", "color:#FF9800");
            return false;
        }
        await confirmRedoDialog(gradedDoc);
        const homeworkDoc = await waitForHomeworkPage(workId);
        if (!homeworkDoc) {
            console.warn("%c重做后未进入对应答题页，autoRedo 中止此 iframe", "color:#FF9800");
            return false;
        }
        await ensureCxFontMap(homeworkDoc);
        const applied = await applyStoredAnswersByOrder(homeworkDoc);
        const leftover = unansweredQuestions(getPageQuestions(homeworkDoc));
        if (applied > 0 && !leftover.length) {
            if (configs.autoSubmit) await submitQuiz(homeworkDoc);
            else console.log("%cautoSubmit=false，已回填但不提交", "color:#607D8B");
            const nextUsed = bumpRedoUsedCount(gradedDoc, workId);
            console.log(`%c本测验自动重做计数 ${nextUsed}/${limit}`, "color:#4CAF50");
            return true;
        }
        console.warn(`%c重做回填未完成，已写入 ${applied} 题，跳过提交（不计入重做次数）`, "color:#FF9800");
        return false;
    }

    async function confirmRedoDialog(doc) {
        const docs = relatedDocs(doc);
        for (let i = 0; i < 10; i++) {
            for (const currentDoc of docs) {
                const nodes = currentDoc.querySelectorAll('#cTipBox, .maskDiv, .maskTipDiv, .popDiv, .layui-layer, [class*="mask"], [class*="pop"]');
                for (const node of nodes) {
                    if (!isVisible(node)) continue;
                    const text = (node.innerText || "").replace(/\s+/g, "");
                    if (text.length > 80) continue;
                    if (!/重做|将清除|重新作答|答题内容会保留/.test(text)) continue;
                    if (clickLabeledButton(node, "重做") || clickLabeledButton(node, "确定")) {
                        console.log("%c已确认重做弹窗", "color:#2196F3");
                        return true;
                    }
                }
            }
            await sleep(300);
        }
        return false;
    }

    async function waitForHomeworkPage(workId) {
        for (let i = 0; i < 40; i++) {
            await sleep(500);
            const docs = findHomeworkDocuments();
            const hit = docs.find((doc) => {
                if (!doc.querySelector(".singleQuesId, ul.Zy_ulTop, li[onclick*='addChoice'], li[onclick*='addMultipleChoice']")) return false;
                if (!workId) return true;
                return extractWorkId(doc) === workId;
            });
            if (hit) return hit;
        }
        return null;
    }

    async function applyStoredAnswersByOrder(doc) {
        doc = doc || getQuizDocument();
        if (!doc) return 0;
        await ensureCxFontMap(doc);
        const questions = getPageQuestions(doc);
        const store = loadAnswerStore(doc);
        const answerMap = {};
        questions.forEach((question, i) => {
            const stored = lookupStoredAnswer(question, store, i);
            if (stored) answerMap[String(i + 1)] = stored;
        });
        if (!Object.keys(answerMap).length) return 0;
        console.log("%c按保存答案回填", "color:#4CAF50", answerMap);
        logPrompt(questions);
        return autoSelect(answerMap, questions);
    }

    function jumpToQuestion(doc, question) {
        if (!doc || !question) return false;
        const win = doc.defaultView;
        const qid = question.qid;
        for (const name of ["gotoQuestion", "goQuestion", "skipTo", "anchorGo", "toQuestion"]) {
            if (win && typeof win[name] === "function") {
                try {
                    win[name](qid || question.num);
                    console.log(`%c跳转到第${question.num}题 (${name})`, "color:#2196F3");
                    return true;
                } catch (e) {}
            }
        }
        const card = (qid && doc.querySelector(`#num${qid}, [qid="${qid}"]`))
            || [...doc.querySelectorAll(".Cy_ulBottom li, .answerCard li, .cardDiv li, a, span")]
                .find((el) => nodeText(el) === String(question.num) && isVisible(el) && el.closest("ul, .Cy_ulBottom, .answerCard"));
        if (card) {
            console.log(`%c点击答题卡第${question.num}题`, "color:#2196F3");
            card.click();
            return true;
        }
        const next = [...doc.querySelectorAll("a, button, span, input")].find((el) => {
            return /下一题/.test(nodeText(el)) && isVisible(el);
        });
        if (next) {
            console.log("%c点击下一题", "color:#2196F3");
            next.click();
            return true;
        }
        if (question.box && typeof question.box.scrollIntoView === "function") {
            question.box.scrollIntoView({ block: "center" });
            return true;
        }
        return false;
    }

    async function submitQuiz(targetDoc) {
        const docs = targetDoc
            ? [targetDoc]
            : [...new Set(getPageQuestions().map((question) => question.box.ownerDocument).filter(Boolean))];
        if (!docs.length) {
            console.warn("%c未找到作业 iframe，无法提交", "color:#FF9800");
            return false;
        }
        console.log("%c=== 准备提交测验 ===", "color:#2196F3;font-size:14px", docs.map(quizDocLabel).join(", "));
        let submitted = 0;
        for (const doc of docs) {
            if (isGradedPage(doc)) {
                console.log(`%c跳过提交：${quizDocLabel(doc)} 已是批阅页`, "color:#607D8B");
                continue;
            }
            if (!clickMainSubmit(doc)) continue;
            const confirmed = await confirmSubmitDialog(doc);
            if (confirmed) {
                console.log("%c============ 已确认提交 ============", "color:#4CAF50;font-weight:bold");
            } else {
                console.log("%c未出现确认弹窗，已发出提交", "color:#607D8B");
            }
            submitted += 1;
        }
        if (!submitted) {
            console.warn("%c未找到提交按钮", "color:#FF9800");
            return false;
        }
        return true;
    }

    async function answerHomeworkDocument(doc) {
        console.log(`%c=== 处理答题 iframe：${quizDocLabel(doc)} ===`, "color:#2196F3;font-size:14px");
        await ensureCxFontMap(doc);
        let round = 0;
        const maxRounds = 20;
        let appliedTotal = 0;
        const done = new Set();

        while (round < maxRounds) {
            round += 1;
            const questions = getPageQuestions(doc);
            if (!questions.length) {
                console.warn("%c该 iframe 未识别到题目", "color:#FF9800");
                break;
            }

            const pending = questions.filter((question) => !done.has(questionKey(question)));
            console.log(
                `%c第 ${round} 轮：待处理 ${pending.length}/${questions.length}`,
                pending.length ? "color:#2196F3" : "color:#4CAF50"
            );
            if (!pending.length) break;

            const ready = pending.filter((question) => question.stem || question.options.length || question.content);
            if (!ready.length) {
                pending.forEach((question) => done.add(questionKey(question)));
                if (jumpToQuestion(doc, pending[0])) {
                    await sleep(800);
                    continue;
                }
                console.warn("%c还有题目，但当前页解析不到题干", "color:#FF9800");
                break;
            }

            logPrompt(ready);

            const store = loadAnswerStore(doc);
            const knownItems = [];
            const unknownQuestions = [];
            ready.forEach((question) => {
                const index = questions.findIndex((item) => item.box === question.box || (item.qid && item.qid === question.qid));
                const stored = lookupStoredAnswer(question, store, index);
                if (stored) knownItems.push({ question, stored });
                else unknownQuestions.push(question);
            });

            let applied = 0;
            if (knownItems.length) {
                console.log(`%c使用已存答案 ${knownItems.length} 题`, "color:#4CAF50");
                const knownMap = {};
                knownItems.forEach((item, i) => {
                    knownMap[String(i + 1)] = item.stored;
                });
                applied += autoSelect(knownMap, knownItems.map((item) => item.question));
            }
            if (unknownQuestions.length) {
                if (!configs.useAI) {
                    console.log(`%cuseAI=false，跳过 AI，剩余 ${unknownQuestions.length} 题不答`, "color:#FF9800");
                } else {
                    console.log(`%c开始生成答案 ${unknownQuestions.length} 题`, "color:#2196F3");
                    const answer = await getAIAnswer(unknownQuestions);
                    applied += autoSelect(answer, unknownQuestions);
                }
            }
            appliedTotal += applied;
            ready.forEach((question) => done.add(questionKey(question)));

            if (!applied) {
                const next = questions.find((question) => !done.has(questionKey(question)));
                if (next && jumpToQuestion(doc, next)) {
                    await sleep(800);
                    continue;
                }
                console.warn("%c本轮没有写入答案", "color:#FF9800");
                break;
            }
            await sleep(400);
        }

        const leftover = unansweredQuestions(getPageQuestions(doc));
        if (leftover.length) {
            console.warn(`%c该 iframe 仍有 ${leftover.length} 道未作答，跳过提交`, "color:#FF9800", leftover.map((q) => q.num));
            return appliedTotal;
        }
        if (appliedTotal > 0) {
            if (configs.autoSubmit) await submitQuiz(doc);
            else console.log("%cautoSubmit=false，已写入但不提交", "color:#607D8B");
        } else {
            console.log("%c该 iframe 没有写入任何答案，跳过提交", "color:#607D8B");
        }
        return appliedTotal;
    }

    function autoSelect(answerText, questions) {
        console.log("%c=== 开始写入选项 ===", "color:#2196F3;font-size:14px");
        console.log("%c传入答案:", "color:#607D8B", answerText);
        if (typeof answerText === "string" && answerText.includes("⚠️")) {
            console.warn("%c收到错误提示文本，跳过自动点击", "color:#FF9800", answerText);
            return 0;
        }

        const list = (questions && questions.length) ? questions : unansweredQuestions(getPageQuestions());
        if (!list.length) {
            console.warn("%c未找到作业 iframe，无法点选", "color:#FF9800");
            return 0;
        }

        const answerMap = parseAnswerMap(answerText);
        console.log("%c解析完毕 answerMap:", "color:#2196F3", answerMap);
        if (!Object.keys(answerMap).length) {
            console.warn("%c答案解析结果为空，没有题号答案对", "color:#FF9800");
            return 0;
        }

        console.log(`%c本轮待写入题目: ${list.map((q) => q.num).join(", ") || "无"}`, "color:#607D8B");
        let applied = 0;
        list.forEach((question, i) => {
            const raw = answerMap[String(i + 1)] ?? answerMap[String(question.num)];
            if (raw == null || raw === "") {
                console.warn(`%c第${i + 1}题没有对应答案`, "color:#FF9800");
                return;
            }
            const parsed = classifyAnswer(raw);
            const box = question.box;
            const doc = box.ownerDocument;
            let result = { ok: false, actual: "", wanted: String(raw) };
            if (parsed.kind === "tf") {
                result = selectOptions(doc, box, matchTfLetters(box, parsed.value));
            } else if (parsed.kind === "letters") {
                result = selectOptions(doc, box, parsed.value);
            } else {
                const hit = optionItems(box).find((li) => optionText(li) && optionText(li).includes(parsed.value));
                result = hit
                    ? selectOptions(doc, box, [optionLetter(hit)])
                    : { ok: fillTextAnswer(doc, box, parsed.value), actual: parsed.value, wanted: parsed.value };
            }
            if (result.ok) {
                question.filled = true;
                console.log(`%c第${i + 1}题已写入: ${result.actual}`, "color:#4CAF50");
                applied += 1;
            } else {
                console.warn(`%c第${i + 1}题写入失败: 目标${result.wanted} 实际${result.actual || "空"}`, "color:#FF9800");
            }
        });
        console.log(`%c============ 点选完成 ${applied}/${list.length} ============`, "color:#4CAF50;font-weight:bold");
        return applied;
    }

window.dumpQuizAnswers = dumpQuizAnswers;
        window.clearQuizAnswers = clearQuizAnswers;
        window[APP_KEY] = {
            configs,
            dumpQuizAnswers,
            clearQuizAnswers,
            run,
            redoWithStoredAnswers: async () => {
                const gradedDocs = findGradedDocuments();
                let ok = 0;
                for (const graded of gradedDocs) {
                    if (await redoWithStoredAnswers(graded)) ok += 1;
                }
                return ok;
            },
        };

        async function run() {
            console.log("%c=== 学习通自动答题脚本启动 ===", "color:#4CAF50;font-size:16px;font-weight:bold");
            console.log("%c当前配置:", "color:#607D8B", {
                autoSubmit: configs.autoSubmit,
                useAI: configs.useAI,
                autoRedo: configs.autoRedo,
                autoRedoTimes: configs.autoRedoTimes,
                clearBeforeSelect: configs.clearBeforeSelect,
                decodeFont: configs.decodeFont,
                model: configs.model,
                apiKey: configs.apiKey ? "已填写" : "未填写",
            });
            try {
        await ensureCxFontMap();
        const allDocs = collectQuizDocuments();
        if (!allDocs.length) {
            console.warn("%c未找到作业 iframe", "color:#FF9800");
            console.log("%c==============答题执行完毕==============", "color:#4CAF50;font-size:16px;font-weight:bold");
            return;
        }

        const gradedDocs = findGradedDocuments();
        const homeworkDocs = findHomeworkDocuments();
        console.log(
            `%c检测到测验 iframe：已批阅 ${gradedDocs.length}，答题中 ${homeworkDocs.length}`,
            "color:#2196F3;font-size:14px"
        );

        for (const gradedDoc of gradedDocs) {
            console.log(`%c=== 处理已批阅 iframe：${quizDocLabel(gradedDoc)} ===`, "color:#2196F3;font-size:14px");
            const questions = getPageQuestions(gradedDoc);
            const { map, added } = harvestCorrectAnswers(gradedDoc, questions);
            console.log(`%c本次写入 ${added} 题，顺序 ${Array.isArray(map.__order) ? map.__order.length : 0} 条`, "color:#4CAF50;font-weight:bold", map);
            console.log("%c查看映射: dumpQuizAnswers()  清空: clearQuizAnswers()", "color:#607D8B");

            if (configs.autoRedo) {
                await redoWithStoredAnswers(gradedDoc);
            } else {
                const failed = isFailPage(gradedDoc);
                console.log(
                    failed
                        ? "%c未及格，但 autoRedo=false，只保存答案，不点重做"
                        : "%cautoRedo=false，只保存答案，不点重做",
                    "color:#607D8B"
                );
            }
        }

        const remainingHomework = findHomeworkDocuments();
        for (const homeworkDoc of remainingHomework) {
            await answerHomeworkDocument(homeworkDoc);
        }

        if (!gradedDocs.length && !remainingHomework.length) {
            console.log("%c没有需要处理的测验 iframe", "color:#607D8B");
        }
        console.log("%c==============答题执行完毕==============", "color:#4CAF50;font-size:16px;font-weight:bold");
    } catch (globalErr) {
        console.error("%c脚本运行失败: ", "color:#F44336;font-weight:bold", globalErr.message || globalErr);
    }
        }

        return {
            run,
            configs,
            dumpQuizAnswers,
            clearQuizAnswers,
            redoWithStoredAnswers: window[APP_KEY].redoWithStoredAnswers,
        };

    }

        window.app = app;
        window[APP_KEY] = app;

        try {
            app.run();
            app._bindPageGuards();
        } catch (error) {
            console.error("%c脚本运行失败: ", "color:#F44336;font-weight:bold", error.message);
            console.log("请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。");
        }
    }
})();
