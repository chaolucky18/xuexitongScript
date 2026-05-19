// ==UserScript==
// @name         学习通自动刷课脚本 V3 稳定版
// @namespace    local.codex.xuexitong
// @version      3.2.0.9
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
                playbackRate: 1,
                autoplay: true,
                retryInterval: 2000,
                maxRetries: 10,
                videoCheckInterval: 1000,
                dialogCheckInterval: 1000,
                taskDialogClickCooldownMs: 8000,
                readingScrollInterval: 800,
                readingScrollStepPx: 420,
                readingBottomGraceMs: 5000,
                readingMaxRounds: 90,
                videoPendingRetryMs: 1200,
                guardNoProgressMs: 7000,
                guardResumeCooldownMs: 1500,
            },
            _videoEl: null,
            _treeContainerEl: null,
            _isPlaying: false,
            _currentRetryCount: 0,
            _checkInterval: null,
            _dialogCheckInterval: null,
            _currentVideoTaskIndex: 0,
            _videoTaskCount: 0,
            _handlingVideoEnd: false,
            _boundVideoEl: null,
            _boundVideoHandlers: null,
            _confirmGuardInstalled: false,
            _lastTaskPointDialogClickAt: 0,
            _readingActive: false,
            _readingScrollTimer: null,
            _readingBottomSince: 0,
            _readingRounds: 0,
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
                this._resetVideoTaskState();
                this._getVideoEl();
                this._clearCheckInterval();
                this._installConfirmGuard();
                this._startDialogMonitoring();
                this._bindStepNavigation();
                this.play();
            },
            nextUnit() {
                this._stopReadingScroll();
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
                        this._clearDialogInterval();
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
            _clearDialogInterval() {
                if (this._dialogCheckInterval) {
                    clearInterval(this._dialogCheckInterval);
                    this._dialogCheckInterval = null;
                }
            },
            _startDialogMonitoring() {
                this._clearDialogInterval();
                this._dialogCheckInterval = setInterval(() => {
                    this._handleTaskPointDialog('monitor');
                }, this.configs.dialogCheckInterval);
            },
            _dispatchClick(el) {
                if (!el) return false;
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                return true;
            },
            _normalizeText(value) {
                return String(value || '').replace(/\s+/g, '');
            },
            _getDialogButtonCandidates(dialog) {
                const elements = [];
                if (dialog && dialog.length) {
                    const root = dialog.get(0);
                    if (root) elements.push(root);
                    dialog.find('button,a,span,div').each((_, el) => elements.push(el));
                }
                return $(elements);
            },
            _isLikelyVisibleDialog(el) {
                if (!el) return false;
                const $el = $(el);
                const text = String($el.text() || '');
                if (text.length > 800) return false;
                let rect;
                try {
                    rect = el.getBoundingClientRect();
                } catch (e) {
                    return false;
                }
                if (!rect || rect.width < 160 || rect.height < 80) return false;
                const style = window.getComputedStyle(el);
                const position = style.position;
                const zIndex = Number.parseInt(style.zIndex, 10);
                const className = String(el.className || '').toLowerCase();
                const role = String(el.getAttribute?.('role') || '').toLowerCase();
                const zScore = Number.isFinite(zIndex) ? zIndex : 0;
                const parentZScore = Math.max(0, ...$el.parents().map((_, parent) => {
                    const parentZ = Number.parseInt(window.getComputedStyle(parent).zIndex, 10);
                    return Number.isFinite(parentZ) ? parentZ : 0;
                }).get());
                return role === 'dialog'
                    || position === 'fixed'
                    || zScore >= 10
                    || parentZScore >= 10
                    || /dialog|modal|layui|layer|wayer|pop/.test(className);
            },
            _handleTaskPointDialog(reason) {
                try {
                    const now = Date.now();
                    if (now - this._lastTaskPointDialogClickAt < this.configs.taskDialogClickCooldownMs) {
                        return false;
                    }
                    const taskPointText = '\u5f53\u524d\u7ae0\u8282\u8fd8\u6709\u4efb\u52a1\u70b9\u672a\u5b8c\u6210';
                    const goStudyText = '\u53bb\u5b66\u4e60';
                    const goCompleteText = '\u53bb\u5b8c\u6210';
                    const nextSectionText = '\u4e0b\u4e00\u8282';
                    const isQuizTask = this._isQuizTaskPage();
                    const targetTexts = isQuizTask ? [nextSectionText] : [goStudyText, goCompleteText];
                    const normalize = (value) => this._normalizeText(value);
                    const dialogs = $('[role="dialog"]:visible,.layui-layer:visible,.wayer:visible,.wayer-dialog:visible,.modal:visible,.dialog:visible,[class*="dialog"]:visible,[class*="modal"]:visible,[class*="layer"]:visible,[class*="pop"]:visible').filter((_, el) => {
                        const text = normalize($(el).text());
                        return this._isLikelyVisibleDialog(el) && text.includes(taskPointText) && targetTexts.some((targetText) => text.includes(targetText));
                    });
                    if (!dialogs.length) return false;

                    const dialog = dialogs.last();
                    const targetButton = this._getDialogButtonCandidates(dialog).filter((_, el) => {
                        const text = normalize($(el).text());
                        return targetTexts.some((targetText) => {
                            return text === targetText || (text.includes(targetText) && $(el).children().length === 0);
                        });
                    }).last();
                    if (!targetButton.length) return false;

                    console.log(`[Xuexitong Script 1x] unfinished-task dialog handled as ${isQuizTask ? 'next section' : 'go study'} (${reason})`);
                    this._lastTaskPointDialogClickAt = now;
                    if (isQuizTask) {
                        this._stepSwitchPending = true;
                        this._stepSwitchAt = now;
                    }
                    return this._dispatchClick(targetButton.get(0));
                } catch (e) {
                    console.warn('[Xuexitong Script 1x] dialog handling failed:', e);
                    return false;
                }
            },
            _installConfirmGuard() {
                if (this._confirmGuardInstalled) return;
                this._confirmGuardInstalled = true;
                const taskPointText = '\u5f53\u524d\u7ae0\u8282\u8fd8\u6709\u4efb\u52a1\u70b9\u672a\u5b8c\u6210';
                const nativeConfirm = window.confirm.bind(window);
                window.confirm = (message) => {
                    if (String(message || '').includes(taskPointText)) {
                        if (this._isQuizTaskPage()) {
                            console.log('[Xuexitong Script 1x] native unfinished-task confirm handled as quiz skip');
                            return false;
                        }
                        console.log('[Xuexitong Script 1x] native unfinished-task confirm handled as go study');
                        return true;
                    }
                    return nativeConfirm(message);
                };
            },
            _resetVideoTaskState() {
                this._detachVideoEventHandlers();
                this._videoEl = null;
                this._currentVideoTaskIndex = 0;
                this._videoTaskCount = 0;
                this._handlingVideoEnd = false;
            },
            _getCurrentStepTitle() {
                const prevTitle = document.getElementsByClassName('prev_title')[0];
                return prevTitle ? (prevTitle.title || prevTitle.textContent || '').trim() : '';
            },
            _getCurrentTaskText() {
                const parts = [document.title, this._getCurrentStepTitle()];
                const activeSelectors = [
                    '.prev_title',
                    '.posCatalog_active .posCatalog_name',
                    '.prev_white.active',
                    '.prev_white.selected',
                    '.prev_white.current',
                    '.prev_white.on',
                    '.prev_white[aria-selected="true"]',
                    '[class*="prev"][class*="active"]:visible',
                    '[class*="prev"][class*="select"]:visible',
                    '[class*="prev"][class*="current"]:visible',
                    '[class*="prev"][class*="cur"]:visible',
                    '[class*="prev"][class*="on"]:visible',
                    'li[aria-selected="true"]:visible',
                ];
                try {
                    $(activeSelectors.join(',')).each((_, el) => {
                        parts.push(el.title || $(el).attr('title') || $(el).text());
                    });
                } catch (e) {}
                return this._normalizeText(parts.join(' '));
            },
            _hasVideoTaskSignal() {
                if (this._videoEl || this._findVideoFramesInWindow(window).length > 0) {
                    return true;
                }
                const videoText = '\u89c6\u9891';
                if (this._getCurrentTaskText().includes(videoText)) {
                    return true;
                }
                try {
                    if ($('video').length > 0) return true;
                    return $('iframe').filter((_, frame) => {
                        const attrs = [
                            frame.className,
                            frame.id,
                            frame.name,
                            frame.title,
                            frame.getAttribute?.('src'),
                        ].join(' ').toLowerCase();
                        return attrs.includes('video') || attrs.includes('insertvideo') || attrs.includes('ans-insertvideo');
                    }).length > 0;
                } catch (e) {
                    return false;
                }
            },
            _isQuizTaskPage(taskText = this._getCurrentTaskText()) {
                const quizText = '\u7ae0\u8282\u6d4b\u9a8c';
                if (taskText.includes(quizText)) return true;
                try {
                    const pageText = this._normalizeText(document.body?.innerText || '');
                    return pageText.includes(quizText)
                        || (pageText.includes('\u9898\u91cf') && (pageText.includes('\u5355\u9009\u9898') || pageText.includes('\u591a\u9009\u9898')));
                } catch (e) {
                    return false;
                }
            },
            _isReadingTaskPage(taskText = this._getCurrentTaskText()) {
                if (this._hasVideoTaskSignal() || this._isQuizTaskPage(taskText)) {
                    return false;
                }
                const labels = [
                    '\u6559\u6750',
                    '\u9605\u8bfb',
                    '\u6587\u6863',
                    '\u56fe\u6587',
                    '\u8d44\u6599',
                ];
                if (labels.some((label) => taskText.includes(label))) {
                    return true;
                }
                try {
                    return $('iframe,[class*="reader"],[class*="document"],[class*="book"],[class*="pdf"]').filter((_, el) => {
                        const attrs = [
                            el.className,
                            el.id,
                            el.title,
                            el.getAttribute?.('src'),
                        ].join(' ').toLowerCase();
                        return attrs.includes('reader') || attrs.includes('document') || attrs.includes('book') || attrs.includes('pdf');
                    }).length > 0;
                } catch (e) {
                    return false;
                }
            },
            _getTaskKind() {
                const taskText = this._getCurrentTaskText();
                if (this._hasVideoTaskSignal()) return 'video';
                if (this._isQuizTaskPage(taskText)) return 'quiz';
                if (this._isReadingTaskPage(taskText)) return 'reading';
                return 'unknown';
            },
            _frameTextIncludes(win, needle, depth = 0) {
                if (depth > 4) return false;
                try {
                    const doc = win.document;
                    if ((doc.body?.innerText || '').includes(needle)) return true;
                    const frames = Array.from(doc.querySelectorAll('iframe'));
                    return frames.some((frame) => {
                        try {
                            return frame.contentWindow && this._frameTextIncludes(frame.contentWindow, needle, depth + 1);
                        } catch (e) {
                            return false;
                        }
                    });
                } catch (e) {
                    return false;
                }
            },
            _isCurrentTaskPointComplete() {
                return this._frameTextIncludes(window, '\u4efb\u52a1\u70b9\u5df2\u5b8c\u6210');
            },
            _isCompleteTaskText(text) {
                const normalized = this._normalizeText(text);
                const completeTexts = [
                    '\u4efb\u52a1\u70b9\u5df2\u5b8c\u6210',
                    '\u5df2\u5b8c\u6210',
                ];
                const incompleteTexts = [
                    '\u5f85\u5b8c\u6210',
                    '\u672a\u5b8c\u6210',
                    '\u672a\u5b66\u4e60',
                    '\u8fdb\u884c\u4e2d',
                ];
                return completeTexts.some((value) => normalized.includes(value))
                    && !incompleteTexts.some((value) => normalized.includes(value));
            },
            _isCompleteTaskClass(value) {
                const className = String(value || '').toLowerCase();
                return /(ans-)?job-?(finished|finish|done|complete|completed)|finished|complete|completed|done/.test(className)
                    && !/(unfinished|incomplete|uncomplete|doing|todo|wait|waiting)/.test(className);
            },
            _elementHasSingleVideoFrame(el) {
                if (!el) return false;
                try {
                    return $(el).find('iframe').filter((_, frame) => {
                        const attrs = [
                            frame.className,
                            frame.id,
                            frame.name,
                            frame.title,
                            frame.getAttribute?.('src'),
                        ].join(' ').toLowerCase();
                        return attrs.includes('ans-insertvideo') || attrs.includes('insertvideo') || attrs.includes('video');
                    }).length <= 1;
                } catch (e) {
                    return false;
                }
            },
            _isVideoFrameTaskComplete(frame) {
                if (!frame) return false;
                const collectText = (el) => {
                    try {
                        return `${el.className || ''} ${el.title || ''} ${el.getAttribute?.('aria-label') || ''} ${$(el).text() || ''}`;
                    } catch (e) {
                        return '';
                    }
                };
                const checkElement = (el) => {
                    if (!el) return false;
                    const text = collectText(el);
                    return this._isCompleteTaskText(text) || this._isCompleteTaskClass(text);
                };

                try {
                    const docText = frame.contentWindow?.document?.body?.innerText || '';
                    if (this._isCompleteTaskText(docText)) return true;
                } catch (e) {}

                const candidates = [];
                let current = frame;
                for (let depth = 0; current && depth < 6; depth++) {
                    candidates.push(current);
                    current = current.parentElement;
                }

                for (const candidate of candidates) {
                    if (candidate !== frame && !this._elementHasSingleVideoFrame(candidate)) continue;
                    if (checkElement(candidate)) return true;
                    try {
                        const siblings = [];
                        if (candidate.previousElementSibling) siblings.push(candidate.previousElementSibling);
                        if (candidate.nextElementSibling) siblings.push(candidate.nextElementSibling);
                        if (siblings.some((sibling) => checkElement(sibling))) return true;
                    } catch (e) {}
                }
                return false;
            },
            _getNextPendingVideoTaskIndex(frames, startIndex = 0) {
                for (let i = Math.max(0, startIndex); i < frames.length; i++) {
                    if (!this._isVideoFrameTaskComplete(frames.get(i))) {
                        return i;
                    }
                    console.log(`[Xuexitong Script 1x] video task ${i + 1}/${frames.length} already complete, skipping`);
                }
                return -1;
            },
            _areAllVideoTasksComplete(frames) {
                return frames.length > 0 && this._getNextPendingVideoTaskIndex(frames, 0) === -1;
            },
            _getReadingScrollTargets() {
                const targets = [];
                const seen = new Set();
                const addElement = (el) => {
                    if (!el || seen.has(el)) return;
                    const max = Math.max(0, Number(el.scrollHeight || 0) - Number(el.clientHeight || 0));
                    if (max < 40) return;
                    let rect = { width: 1, height: 1 };
                    try {
                        rect = el.getBoundingClientRect();
                    } catch (e) {}
                    if (rect.width === 0 && rect.height === 0 && el !== document.body && el !== document.documentElement) return;
                    seen.add(el);
                    targets.push({
                        getTop: () => Number(el.scrollTop || 0),
                        setTop: (value) => {
                            el.scrollTop = value;
                            el.dispatchEvent(new Event('scroll', { bubbles: true }));
                            el.dispatchEvent(new WheelEvent('wheel', { deltaY: this.configs.readingScrollStepPx, bubbles: true }));
                        },
                        getMax: () => Math.max(0, Number(el.scrollHeight || 0) - Number(el.clientHeight || 0)),
                    });
                };
                const collect = (win, depth = 0) => {
                    if (depth > 4) return;
                    try {
                        const doc = win.document;
                        addElement(doc.scrollingElement || doc.documentElement || doc.body);
                        Array.from(doc.querySelectorAll('div,main,section,article,body')).forEach(addElement);
                        Array.from(doc.querySelectorAll('iframe')).forEach((frame) => {
                            try {
                                if (frame.contentWindow) collect(frame.contentWindow, depth + 1);
                            } catch (e) {}
                        });
                    } catch (e) {}
                };
                collect(window);
                return targets;
            },
            _stopReadingScroll() {
                if (this._readingScrollTimer) {
                    clearInterval(this._readingScrollTimer);
                    this._readingScrollTimer = null;
                }
                this._readingActive = false;
                this._readingBottomSince = 0;
                this._readingRounds = 0;
            },
            _finishReadingTask(reason) {
                console.log(`[Xuexitong Script 1x] reading task finished (${reason}), moving to next unit`);
                this._stopReadingScroll();
                setTimeout(() => this.nextUnit(), 1000);
            },
            _readingScrollTick() {
                if (this._handleTaskPointDialog('reading')) return;
                if (this._isCurrentTaskPointComplete()) {
                    this._finishReadingTask('task-complete');
                    return;
                }

                const targets = this._getReadingScrollTargets();
                let allBottom = targets.length > 0;
                targets.forEach((target) => {
                    const max = target.getMax();
                    const nextTop = Math.min(max, target.getTop() + this.configs.readingScrollStepPx);
                    target.setTop(nextTop);
                    if (nextTop < max - 5) allBottom = false;
                });

                if (!targets.length) {
                    window.scrollBy(0, this.configs.readingScrollStepPx);
                    allBottom = false;
                }

                this._readingRounds++;
                if (allBottom) {
                    if (!this._readingBottomSince) this._readingBottomSince = Date.now();
                } else {
                    this._readingBottomSince = 0;
                }

                const bottomWaitMs = this._readingBottomSince ? Date.now() - this._readingBottomSince : 0;
                if (this._isCurrentTaskPointComplete()) {
                    this._finishReadingTask('task-complete-after-scroll');
                } else if (bottomWaitMs >= this.configs.readingBottomGraceMs || this._readingRounds >= this.configs.readingMaxRounds) {
                    console.log('[Xuexitong Script 1x] reading bottom reached, waiting for task completion');
                    this._readingRounds = 0;
                    this._readingBottomSince = Date.now();
                }
            },
            _startReadingScroll() {
                if (this._readingActive) return true;
                this._readingActive = true;
                this._readingBottomSince = 0;
                this._readingRounds = 0;
                console.log('[Xuexitong Script 1x] reading task detected, scrolling document');
                this._readingScrollTick();
                this._readingScrollTimer = setInterval(() => {
                    this._readingScrollTick();
                }, this.configs.readingScrollInterval);
                return true;
            },
            _handleReadingTask() {
                if (this._getTaskKind() !== 'reading') return false;
                if (this._isCurrentTaskPointComplete()) {
                    this._finishReadingTask('already-complete');
                    return true;
                }
                return this._startReadingScroll();
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
            _applyPlaybackRate(video) {
                if (!video) return;
                const targetRate = Number(this.configs.playbackRate || 1);
                if (!Number.isFinite(targetRate) || targetRate <= 0) return;
                const currentRate = Number(video.playbackRate || 0);
                if (Math.abs(currentRate - targetRate) > 0.01) {
                    video.playbackRate = targetRate;
                    console.log(`[Xuexitong Script 1x] playbackRate locked to ${targetRate}x`);
                }
            },
            _checkVideoStatus() {
                try {
                    const video = this._getVideoEl();
                    if (!video) return;
                    this._applyPlaybackRate(video);

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
                        this._handleVideoTaskEnded();
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
                    if (this._handleTaskPointDialog('before-play')) {
                        setTimeout(() => this.play(), 1500);
                        return;
                    }
                    const videoFrames = this._getVideoFrames();
                    if (this._areAllVideoTasksComplete(videoFrames)) {
                        this._stopReadingScroll();
                        this._resetVideoTaskState();
                        console.log('[Xuexitong Script 1x] all video tasks in this section are complete, moving to next unit');
                        setTimeout(() => this.nextUnit(), 800);
                        return;
                    }
                    const el = this._getVideoEl();
                    if (el == null) {
                        const taskKind = this._getTaskKind();
                        if (taskKind === 'video') {
                            this._stopReadingScroll();
                            console.log('[Xuexitong Script 1x] video task detected but video element is still loading');
                            setTimeout(() => this.play(), this.configs.videoPendingRetryMs);
                            return;
                        }
                        if (this._handleReadingTask()) {
                            return;
                        }
                        if (taskKind === 'quiz') {
                            console.log('[Xuexitong Script 1x] chapter quiz detected, trying to skip');
                            this._dispatchClick($('#prevNextFocusNext').get(0));
                            setTimeout(() => {
                                if (this._handleTaskPointDialog('after-quiz-next')) {
                                    setTimeout(() => this.play(), 1500);
                                    return;
                                }
                                this.play();
                            }, 800);
                            return;
                        }
                        if (this._advanceLearningStep()) {
                            console.log('%c当前不在视频页，已尝试切到下一学习步骤，2秒后重试', 'color:#607D8B');
                            setTimeout(() => {
                                this.play();
                            }, 2000);
                            return;
                        }
                        console.log('%c===========跳过章节测验，2秒后继续播放==============', 'color:#607D8B');
                        this._dispatchClick($('#prevNextFocusNext').get(0));
                        setTimeout(() => {
                            if (this._handleTaskPointDialog('after-next-control')) {
                                setTimeout(() => this.play(), 1500);
                                return;
                            }
                            this.play();
                        }, 800);
                        return;
                    }

                    this._tryTimes = 0;
                    this._isPlaying = true;
                    this._videoEventHandle();
                    this._applyPlaybackRate(el);

                    try {
                        await el.play();
                        this._applyPlaybackRate(el);
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

                const currentTaskText = this._getCurrentTaskText();
                const quizText = '\u7ae0\u8282\u6d4b\u9a8c';
                const videoText = '\u89c6\u9891';

                if (currentTaskText.includes(quizText) || currentTaskText.includes(videoText) || this._hasVideoTaskSignal()) {
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
                    const text = this._normalizeText($(el).text());
                    return text === `2${videoText}` || text === videoText || text.includes(videoText);
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
                    this._resetVideoTaskState();
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
                        console.error('静音播放也失败，将继续等待视频而不是切换下一节:', e);
                        if (this._tryTimes < this.configs.maxRetries) {
                            this._tryTimes++;
                            setTimeout(() => this.play(), this.configs.retryInterval);
                        }
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
                this._resetVideoTaskState();
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
            _findVideoFramesInWindow(win, depth = 0, result = []) {
                if (depth > 4) return result;
                try {
                    const doc = win.document;
                    const frames = Array.from(doc.querySelectorAll('iframe'));
                    frames.forEach((frame) => {
                        const frameAttrs = [
                            frame.className,
                            frame.id,
                            frame.name,
                            frame.title,
                            frame.getAttribute?.('src'),
                        ].join(' ').toLowerCase();
                        if (frameAttrs.includes('ans-insertvideo-online') || frameAttrs.includes('insertvideo') || frameAttrs.includes('video')) {
                            result.push(frame);
                        }
                        try {
                            if (frame.contentWindow) {
                                this._findVideoFramesInWindow(frame.contentWindow, depth + 1, result);
                            }
                        } catch (e) {
                            if (e && e.name === 'SecurityError') {
                                return;
                            }
                            console.warn('[Xuexitong Script 1x] iframe scan skipped:', e);
                        }
                    });
                } catch (e) {
                    if (e && e.name === 'SecurityError') {
                        return result;
                    }
                    console.warn('[Xuexitong Script 1x] video frame scan failed:', e);
                }
                return result;
            },
            _getVideoFrames() {
                return $(this._findVideoFramesInWindow(window));
            },
            _getVideoEl() {
                if (!this._videoEl) {
                    try {
                        const frameObj = this._getVideoFrames();
                        this._videoTaskCount = frameObj.length;
                        if (frameObj.length === 0) {
                            return null;
                        }
                        if (this._currentVideoTaskIndex >= frameObj.length) {
                            this._currentVideoTaskIndex = frameObj.length - 1;
                        }
                        if (this._currentVideoTaskIndex < 0) {
                            this._currentVideoTaskIndex = 0;
                        }
                        const pendingIndex = this._getNextPendingVideoTaskIndex(frameObj, this._currentVideoTaskIndex);
                        if (pendingIndex < 0) {
                            this._currentVideoTaskIndex = frameObj.length;
                            return null;
                        }
                        if (pendingIndex !== this._currentVideoTaskIndex) {
                            this._detachVideoEventHandlers();
                            this._videoEl = null;
                            this._currentVideoTaskIndex = pendingIndex;
                        }
                        const findVideo = (frame) => {
                            try {
                                return $(frame).contents().find('video#video_html5_api,video').get(0) || null;
                            } catch (e) {
                                if (e && e.name === 'SecurityError') return null;
                                console.warn('[Xuexitong Script 1x] video frame not ready:', e);
                                return null;
                            }
                        };
                        for (let i = this._currentVideoTaskIndex; i < frameObj.length; i++) {
                            const video = findVideo(frameObj.get(i));
                            if (video) {
                                this._currentVideoTaskIndex = i;
                                this._videoEl = video;
                                break;
                            }
                        }
                    } catch (e) {
                        console.error('获取视频元素失败:', e);
                        return null;
                    }
                }
                return this._videoEl || null;
            },
            _handleVideoTaskEnded() {
                if (this._handlingVideoEnd) return;
                this._handlingVideoEnd = true;
                this._isPlaying = false;
                this._clearCheckInterval();

                const frames = this._getVideoFrames();
                this._videoTaskCount = frames.length;
                const nextPendingIndex = this._getNextPendingVideoTaskIndex(frames, this._currentVideoTaskIndex + 1);
                if (nextPendingIndex >= 0) {
                    this._currentVideoTaskIndex = nextPendingIndex;
                    this._detachVideoEventHandlers();
                    this._videoEl = null;
                    console.log(`[Xuexitong Script 1x] switching to video task ${this._currentVideoTaskIndex + 1}/${frames.length}`);
                    setTimeout(() => {
                        this._handlingVideoEnd = false;
                        this.play();
                    }, 800);
                    return;
                }

                setTimeout(() => {
                    this._handlingVideoEnd = false;
                    this.nextUnit();
                }, 1000);
            },
            _detachVideoEventHandlers() {
                if (!this._boundVideoEl || !this._boundVideoHandlers) return;
                Object.entries(this._boundVideoHandlers).forEach(([eventName, handler]) => {
                    this._boundVideoEl.removeEventListener(eventName, handler);
                });
                this._boundVideoEl = null;
                this._boundVideoHandlers = null;
            },
            _videoEventHandle() {
                const el = this._videoEl;
                if (!el) {
                    console.log('videoEl未加载');
                    return;
                }

                if (this._boundVideoEl === el) return;
                this._detachVideoEventHandlers();
                this._boundVideoEl = el;
                this._boundVideoHandlers = {
                    ended: this._handleVideoEnded.bind(this),
                    loadedmetadata: this._handleVideoLoaded.bind(this),
                    play: this._handleVideoPlay.bind(this),
                    pause: this._handleVideoPause.bind(this),
                    ratechange: this._handleVideoRateChange.bind(this),
                };
                Object.entries(this._boundVideoHandlers).forEach(([eventName, handler]) => {
                    el.addEventListener(eventName, handler);
                });
            },
            _handleVideoEnded(e) {
                const title = this._cellData.currentVideoTitle;
                console.warn(`%c============'${title}' 播放完成=============`, 'color:#4CAF50;font-weight:bold');
                this._handleVideoTaskEnded();
            },
            _handleVideoLoaded(e) {
                console.log('%c============视频加载完成=============', 'color:#2196F3');
                this._applyPlaybackRate(e.currentTarget || this._getVideoEl());
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
                this._applyPlaybackRate(video);
                this._guardLastTime = Number(video?.currentTime || 0);
                this._guardLastWallTs = Date.now();
                if (this._delayedNextUnitTimer) {
                    clearTimeout(this._delayedNextUnitTimer);
                    this._delayedNextUnitTimer = null;
                }
            },
            _handleVideoRateChange(e) {
                this._applyPlaybackRate(e.currentTarget || this._getVideoEl());
            },
            _handleVideoPause(e) {
                console.log('%c============视频暂停=============', 'color:#FF9800');
            },
        };

        try {
            window.app.run();

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
        } catch (error) {
            console.error('%c脚本运行失败: ', 'color:#F44336;font-weight:bold', error.message);
            console.log('请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。');
        }
    }
})();
