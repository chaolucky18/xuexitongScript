// ==UserScript==
// @name         学习通自动刷课脚本 V3.4 稳定版
// @namespace    local.codex.xuexitong
// @version      3.4.0
// @description  自动播放、自动切换下一小节；修复导航死锁、小节内多视频、无视频节点卡死、异常暂停风控、互动题弹窗与视频元素发现（详见 README 与 docs/CHANGELOG-v3.4.md）
// @author       Codex
// @match        *://mooc1.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    // 学习通自动刷课脚本 V3.4 —— 唯一源码（油猴版 v3_optimized.user.js 由 scripts/build-userscript.mjs 生成）
    //
    // 本版在 V3.3（master）基础上，针对线上 55 条反馈里最高频的六类缺陷做收敛式修复。
    // 每条修复都用「F编号（#issue 编号）」注释标注依据，便于回溯到具体反馈：
    //   F1 导航死锁          #9 #24 #27 #37 #50
    //   F2 小节内多视频      #14 #15 #24 #27 #37 #49(PR)
    //   F3 无视频/课件页卡死 #38 #42 #43 #50
    //   F4 异常暂停与风控    #19 #26 #32 #54 #55
    //   F5 互动答题弹窗      #29 #39 #42 #45 #53(PR，仅吸收「检测」部分)
    //   F6 视频元素发现      #18 #52 #55
    //   F7 启动与文档        #4 #5 #12 #16 #17 #23 #33 #47 #50
    //
    // 明确不做（硬性约束）：
    //   * 不实现、也不默认开启任何自动答题逻辑（#29 #39 #45 #53 的答题部分一律不吸收）；
    //   * 不引入任何外部大模型/网络请求（唯一的跨域资源是页面原本就依赖的 jQuery CDN，见下方启动逻辑）；
    //   * 不上传、不外发任何账号凭据。
    const VERSION = 'V3.4';
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
    // F7（#33 #47）：启动阶段必须给出可操作提示，不能「粘完没反应」。
    // 说明：页面本身依赖 jQuery；脚本只在页面没有 jQuery 时补一个 CDN <script>（V3.3 既有行为，未新增依赖）。
    if (typeof window.jQuery === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
        script.type = 'text/javascript';
        script.onload = function () {
            console.log('jQuery loaded.');
            waitForCoursePage();
        };
        script.onerror = function () {
            // F7（#12 #16 #17 #33）：CDN 被拦截是最常见的「没效果」原因，这里必须说清楚怎么办。
            console.error('%c脚本启动失败：页面没有 jQuery，且 CDN 加载被浏览器/网络拦截。', 'color:#F44336;font-weight:bold');
            console.log('处理方法：1) 改用油猴版 v3_optimized.user.js；2) 或在页面控制台手动引入 jQuery 后重新粘贴本脚本；'
                + '3) 检查广告拦截插件是否拦截了 code.jquery.com。');
        };
        document.head.appendChild(script);
    } else {
        waitForCoursePage();
    }
    function waitForCoursePage() {
        let attempts = 0;
        const maxAttempts = 20;
        window[BOOT_TIMER_KEY] = setInterval(() => {
            const tree = $('#coursetree');
            const hasTree = tree.length > 0;
            // F7（#47 #50）：mooc1 域下课程目录数据晚于脚本执行，只看 #coursetree 会在
            // 目录还没渲染出小节节点时就初始化，表现为「脚本没反应」或元素为空。
            const hasNodes = hasTree && tree.find('.posCatalog_select').length > 0;
            if (hasTree && hasNodes) {
                clearInterval(window[BOOT_TIMER_KEY]);
                window[BOOT_TIMER_KEY] = null;
                initializePlayer();
                return;
            }
            attempts++;
            if (attempts >= maxAttempts) {
                clearInterval(window[BOOT_TIMER_KEY]);
                window[BOOT_TIMER_KEY] = null;
                if (hasTree) {
                    console.warn('%c课程目录已出现，但 20 秒内没有渲染出任何小节节点，仍先尝试启动；如果无反应请刷新页面。', 'color:#FF9800');
                    initializePlayer();
                } else {
                    console.error('%c脚本启动超时：未检测到课程目录（#coursetree）。', 'color:#F44336;font-weight:bold');
                    console.log('处理方法：1) 确认当前是学习通课程播放页（地址含 /mycourse/studentstudy）；'
                        + '2) 展开左侧目录后执行 app.run()；3) 仍无效请刷新页面重试（#47）。');
                }
            }
        }, 1000);
    }

    function initializePlayer() {
        const app = {
            version: VERSION,
            configs: {
                // 默认改为 1.0 原速（平台约束，不是脚本缺陷）：学习通 reportTimeInterval 每 60 秒向 multimedia/log
                // 上报一次观看时间，部分课程要求观看时长达到 100%，1.5 倍速既容易学时不达标（#28 #31），
                // 也更容易触发反作弊（验证码，见 #54）。证据来自 PR #56 的《ISSUES_REVIEW V3.4》与 PR #48 的 verify-speed-lock 自测。
                // 有倍速需求可手动调高：app.configs.playbackRate = 2; app.run()。
                // 本脚本只设置一次播放倍速，**不做任何 ratechange 强制回写对抗**（那是 #32 #54 反复暂停/风控的来源）。
                playbackRate: 1.0,
                autoplay: true,
                retryInterval: 2000,
                maxRetries: 10,
                videoCheckInterval: 1000,
                guardNoProgressMs: 7000,
                guardResumeCooldownMs: 1500,
                guardPausedGraceMs: 1200,
                // PR #56 的保活阶梯：恢复动作发出后 2.5 秒复检，仍无进度则轻微回拨重播（受次数上限约束）
                guardRecoveryProbeMs: 2500,
                guardSeekBackSeconds: 0.15,
                guardSeekBackMaxPerUnit: 2,
                // 播放 Promise 超时保护：媒体管线冻结时 play() 可能永不 settle
                playTimeoutMs: 8000,
                resumeMaxAttemptsPerUnit: 5,
                userPauseWindowMs: 2500,
                autoAdvanceNoVideo: false,
                maxConsecutiveNoVideoAdvances: 3,
                videoFrameMaxDepth: 4,
                interactionGuard: true,
                interactionPollMs: 1500,
                // 思路移植自 PR #48 @CsuCook1e：任务点弹窗节流与视频任务点上限（本仓库额外加了次数上限，防止异常页面下无限点）
                taskDialogClickCooldownMs: 8000,
                taskDialogMaxClicksPerUnit: 3,
                videoTaskFrameMaxDepth: 4,
                videoTaskFrameMaxCount: 12,
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
            _consecutiveNoVideoAdvances: 0,
            _resumeAttemptsThisUnit: 0,
            _resumeCapLogged: false,
            _userPaused: false,
            _lastUserInteractionTs: 0,
            _userInteractionDoc: null,
            _userInteractionHandler: null,
            _interactionBlocked: false,
            _interactionWatcher: null,
            _timers: null,
            _stepNavigationBound: false,
            // 思路移植自 PR #48 @CsuCook1e：小节内视频任务点与任务点弹窗状态
            _currentVideoTaskIndex: 0,
            _videoTaskCount: 0,
            _videoTaskAllComplete: false,
            _handlingVideoEnd: false,
            _lastTaskPointDialogClickAt: 0,
            _taskDialogClicksThisUnit: 0,
            _taskDialogCapLogged: false,
            _cellData: {
                cells: 0,
                nCells: 0,
                currentCellIndex: 0,
                currentNCellIndex: 0,
                currentVideoTitle: '',
                resolved: false,
                resolveSource: '',
            },
            get cellData() {
                return this._cellData;
            },
            run() {
                console.log(`%c=== 学习通自动刷课脚本 ${VERSION} 启动 ===`, 'color:#4CAF50;font-size:16px;font-weight:bold');
                // F4（#54 #55）：每次 run() 先把上一轮的定时器彻底清掉，避免残留定时器叠加日志/重复点击。
                this._clearTimers();
                this._clearCheckInterval();
                this._nextUnitPending = false;
                this._chapterAdvanceTimes = 0;
                this._consecutiveNoVideoAdvances = 0;
                this._resumeAttemptsThisUnit = 0;
                this._resumeCapLogged = false;
                this._userPaused = false;
                this._interactionBlocked = false;
                this._tryTimes = 0;
                this._currentVideoTaskIndex = 0;
                this._videoTaskCount = 0;
                this._videoTaskAllComplete = false;
                this._handlingVideoEnd = false;
                this._taskDialogClicksThisUnit = 0;
                this._taskDialogCapLogged = false;
                this._seekBackTimesThisUnit = 0;
                this._seekBackCapLogged = false;
                if (this._guardProbeTimer) {
                    this._cancelTimer(this._guardProbeTimer);
                    this._guardProbeTimer = null;
                }
                this._guardLastTime = 0;
                this._guardLastWallTs = 0;
                this._guardLastResumeTs = 0;
                // F2/F6（#24 #52 #55）：目录与视频元素缓存都随每次启动失效。
                this._treeContainerEl = null;
                this._invalidateVideoCache('run() 重新启动');
                this._getTreeContainer();
                this._initCellData();
                this._getVideoEl();
                this._clearCheckInterval();
                this._bindStepNavigation();
                this._startInteractionWatcher();
                this.play();
            },
            nextUnit() {
                // F5（#29 #39）：检测到互动答题弹窗时暂停自动跳转，交给用户手动处理；
                // 脚本不会自动答题（硬性约束），也不需要在弹窗上反复点击。
                if (this._interactionBlocked) {
                    console.warn('%c检测到视频互动答题弹窗，已暂停自动跳转（#29 #39）。请手动完成题目，脚本会在弹窗消失后自动继续。', 'color:#FF9800');
                    return;
                }
                // t6：进入 nextUnit 前先取消任何待执行的「视频结束自动跳转」，避免旧定时器把刚打开的小节又跳一次。
                this._cancelDelayedNextUnit('进入 nextUnit');
                if (this._nextUnitPending) {
                    console.warn('%c已有小节切换正在进行，忽略重复请求', 'color:#FF9800');
                    return;
                }
                this._nextUnitPending = true;
                this._clearCheckInterval();
                console.log('%c=== 准备切换到下一小节 ===', 'color:#2196F3;font-size:14px');
                try {
                    const el = this._getTreeContainer();
                    const chapters = el.children('ul').children('li');
                    // F2（#14 #15 #24 #27 #37 #49）：当前节点下标/同章节点集合统一由
                    // _resolveCatalogPosition() 解析，不再在多个地方各算一套导致下标错位。
                    const position = this._resolveCatalogPosition('nextUnit');
                    if (!position.ok) {
                        // F2 要求：解析失败必须给出明确日志，绝不静默跳到下一章。
                        console.error(`%c无法解析当前课程节点，已停止自动跳转以避免误跳章节：${position.reason}`, 'color:#F44336;font-weight:bold');
                        console.log('处理方法：请在左侧目录中手动点击目标小节后执行 app.run()；'
                            + '如果目录里没有高亮的 .posCatalog_active（反馈 #14 #15），说明页面还没渲染完，刷新即可。');
                        return;
                    }
                    const nodes = position.nodes;
                    if (nodes.length > position.nodeIndex + 1) {
                        const nextNIndex = position.nodeIndex + 1;
                        console.log(`%c切换到同章节下一个视频: ${nextNIndex + 1}/${nodes.length}`, 'color:#FF9800');
                        this._cellData.currentCellIndex = position.chapterIndex;
                        this._cellData.currentNCellIndex = nextNIndex;
                        this.playCurrentIndex(nodes[nextNIndex]);
                    } else {
                        const nextIndex = position.chapterIndex + 1;
                        if (nextIndex >= chapters.length) {
                            console.log('%c=====================================', 'color:#4CAF50;font-size:16px');
                            console.log('%c==============本课程学习完成了==============', 'color:#4CAF50;font-size:16px;font-weight:bold');
                            console.log('%c=====================================', 'color:#4CAF50;font-size:16px');
                            return;
                        }
                        console.log(`%c切换到下一个章节: ${nextIndex + 1}/${chapters.length}`, 'color:#FF9800');
                        this._cellData.currentCellIndex = nextIndex;
                        this._cellData.currentNCellIndex = 0;
                        // 点击后目录 active 才会移动到新章节，这里用已跟踪的下标显式定位第 1 个节点。
                        this.playCurrentIndex(null, { chapterIndex: nextIndex, nodeIndex: 0 });
                    }
                } catch (error) {
                    console.error('切换下一小节失败:', error);
                } finally {
                    // F1（#9 #24 #27 #37 #50）：导航锁必须在**所有**退出路径上复位：
                    // 「无视频安全停止」「达到最大重试」「静音播放失败」「课程已完成」「解析失败」
                    // 以及异常分支，否则该标志会永久为 true，之后所有 nextUnit() 都被静默忽略（导航死锁）。
                    this._releaseNavLock('nextUnit 退出');
                }
            },
            _releaseNavLock(reason) {
                // F1（#24 #27）：任何失败退出路径都要显式释放导航锁，保证后续 nextUnit() 仍可触发。
                if (this._nextUnitPending) {
                    console.log(`%c已释放小节切换锁（${reason}）`, 'color:#607D8B');
                }
                this._nextUnitPending = false;
            },
            _clearCheckInterval() {
                if (this._checkInterval) {
                    clearInterval(this._checkInterval);
                    this._checkInterval = null;
                }
            },
            _schedule(fn, ms) {
                // F4（#32 #54 #55）：所有延时器集中登记，destroy()/run() 时可一次性清理，
                // 避免残留定时器在页面切换后继续触发点击与日志。
                if (!this._timers) this._timers = new Set();
                const id = setTimeout(() => {
                    if (this._timers) this._timers.delete(id);
                    fn();
                }, ms);
                this._timers.add(id);
                return id;
            },
            _cancelDelayedNextUnit(reason) {
                // t6 修复（verifier finding V1）：视频结束后用于自动跳转的定时器必须像其它延时器一样
                // 登记到 `_delayedNextUnitTimer` 账本，否则 _handleVideoPlay / playCurrentIndex /
                // _handleVideoLoaded / nextUnit 入口的取消对它完全无效——陈旧定时器会在 1.2 秒后把
                // 用户刚打开的小节瞬间跳过（对应 #9 #24 #27 #37 #50）。
                // 同时复位 _handlingVideoEnd：定时器被取消后没人再执行「先复位再跳转」的回调，
                // 不在这里复位会让去重标志永久为 true，之后所有视频结束都不再触发跳转。
                if (!this._delayedNextUnitTimer) return false;
                this._cancelTimer(this._delayedNextUnitTimer);
                this._delayedNextUnitTimer = null;
                if (this._handlingVideoEnd) {
                    this._handlingVideoEnd = false;
                    console.log(`%c已取消待执行的自动跳转并复位结束去重标志（${reason}）`, 'color:#607D8B');
                } else {
                    console.log(`%c已取消待执行的自动跳转（${reason}）`, 'color:#607D8B');
                }
                return true;
            },
            _cancelTimer(id) {
                if (!id) return;
                clearTimeout(id);
                if (this._timers) this._timers.delete(id);
            },
            _clearTimers() {
                if (!this._timers) return;
                for (const id of this._timers) {
                    clearTimeout(id);
                }
                this._timers.clear();
                this._delayedNextUnitTimer = null;
                this._guardProbeTimer = null;
            },
            _startVideoMonitoring() {
                this._clearCheckInterval();
                this._guardLastTime = Number((this._getVideoEl() || {}).currentTime || 0);
                this._guardLastWallTs = Date.now();
                this._guardLastResumeTs = 0;
                this._checkInterval = setInterval(() => {
                    this._checkVideoStatus();
                }, this.configs.videoCheckInterval);
            },
            _isProgressStalled(now) {
                // F4（#32 #55）：只有「进度确实停滞」才允许恢复播放：
                //   * 暂停状态：超过 guardPausedGraceMs 宽限期仍未恢复（宽限期用于放过播放器切源/缓冲造成的瞬时 pause）
                //   * 播放状态：超过 guardNoProgressMs 而 currentTime 没有前进
                const video = this._getVideoEl();
                if (!video) return false;
                const baselineTs = this._guardLastWallTs || 0;
                if (!baselineTs) return false;
                const elapsed = now - baselineTs;
                const current = Number(video.currentTime || 0);
                const advanced = Math.abs(current - Number(this._guardLastTime || 0)) >= 0.01;
                if (video.paused) return elapsed >= this.configs.guardPausedGraceMs;
                return !advanced && elapsed >= this.configs.guardNoProgressMs;
            },
            _tryResumePlayback(reason) {
                const now = Date.now();
                if (now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs) return false;
                if (this._userPaused) return false;
                const video = this._getVideoEl();
                if (!video || !this._isPlaying) return false;
                if (!this._isProgressStalled(now)) return false;
                if (this._resumeAttemptsThisUnit >= this.configs.resumeMaxAttemptsPerUnit) {
                    if (!this._resumeCapLogged) {
                        this._resumeCapLogged = true;
                        console.warn(`%c本节恢复播放次数已达上限（${this.configs.resumeMaxAttemptsPerUnit} 次），停止抢播（#32 #54 #55）。`, 'color:#FF9800');
                        console.log('处理方法：如果视频仍然卡住，请手动点击播放或刷新页面；'
                            + '无差别抢播 pause 事件容易触发平台风控/验证码（#54），因此这里刻意限制次数。');
                    }
                    return false;
                }
                this._guardLastResumeTs = now;
                this._resumeAttemptsThisUnit++;
                console.log(`%c触发视频保活恢复(${reason}) ${this._resumeAttemptsThisUnit}/${this.configs.resumeMaxAttemptsPerUnit}`, 'color:#607D8B');
                const attempt = video.play();
                if (attempt && typeof attempt.catch === 'function') {
                    attempt.catch((e) => {
                        console.warn('直接恢复播放失败，尝试静音恢复:', e);
                        this._lastScriptMutedValue = true; // F4：脚本自身的静音兜底不算用户选择
                        video.muted = true;
                        const mutedAttempt = video.play();
                        if (mutedAttempt && typeof mutedAttempt.catch === 'function') {
                            mutedAttempt.catch((err) => console.error('静音恢复播放失败:', err));
                        }
                    });
                }
                this._scheduleGuardProbe(reason);
                return true;
            },
            _withTimeout(promise, ms, label) {
                // PR #56《ISSUES_REVIEW V3.4》修复项：播放 Promise 超时保护。
                // 媒体管线冻结时 play() 可能既不 resolve 也不 reject，await 会一直挂住状态机。
                if (!promise || typeof promise.then !== 'function') return Promise.resolve();
                return new Promise((resolve, reject) => {
                    let settled = false;
                    if (!this._timers) this._timers = new Set();
                    const timer = setTimeout(() => {
                        if (settled) return;
                        settled = true;
                        this._timers.delete(timer);
                        reject(new Error(label));
                    }, ms);
                    this._timers.add(timer);
                    const finish = (error) => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        this._timers.delete(timer);
                        if (error) reject(error);
                        else resolve();
                    };
                    promise.then(() => finish(null), (error) => finish(error || new Error('play() rejected')));
                });
            },
            _scheduleGuardProbe(reason) {
                // F4（#19 #32 #55）+ PR #56 的保活阶梯：
                // 每秒检查 → 连续 7 秒无进度 → pause/play → 2.5 秒复检 → 仍无进度则轻微回拨并重播。
                // 复检与回拨都受冷却/次数上限约束，避免与播放器抢状态触发风控（#54）。
                if (this._guardProbeTimer) this._cancelTimer(this._guardProbeTimer);
                this._guardProbeTimer = this._schedule(() => {
                    this._guardProbeTimer = null;
                    const video = this._getVideoEl();
                    if (!video || !this._isPlaying) return;
                    if (!this._isProgressStalled(Date.now())) {
                        console.log('%c保活复检：进度已恢复，无需回拨重播', 'color:#4CAF50');
                        return;
                    }
                    if (this._resumeAttemptsThisUnit >= this.configs.resumeMaxAttemptsPerUnit) {
                        // F4：回拨重播同样计入「每小节恢复次数」预算，避免阶梯把 play() 调用放大到上限之外。
                        if (!this._resumeCapLogged) {
                            this._resumeCapLogged = true;
                            console.warn(`%c本节恢复/回拨次数已达上限（${this.configs.resumeMaxAttemptsPerUnit} 次），停止保活动作（#32 #54 #55）。`, 'color:#FF9800');
                        }
                        return;
                    }
                    if (this._seekBackTimesThisUnit >= this.configs.guardSeekBackMaxPerUnit) {
                        if (!this._seekBackCapLogged) {
                            this._seekBackCapLogged = true;
                            console.warn(`%c保活回拨次数已达上限（${this.configs.guardSeekBackMaxPerUnit} 次/小节），停止回拨重播（#54）。`, 'color:#FF9800');
                            console.log('处理方法：请手动点击播放或刷新页面；连续与播放器抢状态容易触发平台风控。');
                        }
                        return;
                    }
                    this._seekBackTimesThisUnit++;
                    this._resumeAttemptsThisUnit++;
                    const current = Number(video.currentTime || 0);
                    const target = Math.max(0, current - this.configs.guardSeekBackSeconds);
                    console.log(`%c保活复检仍无进度(${reason})，回拨 ${this.configs.guardSeekBackSeconds}s 后重播 ${this._seekBackTimesThisUnit}/${this.configs.guardSeekBackMaxPerUnit}`, 'color:#607D8B');
                    try {
                        video.currentTime = target;
                    } catch (e) {
                        console.warn('回拨 currentTime 失败:', e);
                    }
                    this._guardLastTime = target;
                    this._guardLastWallTs = Date.now();
                    const attempt = video.play();
                    if (attempt && typeof attempt.catch === 'function') {
                        attempt.catch((e) => console.warn('回拨重播失败:', e));
                    }
                }, this.configs.guardRecoveryProbeMs);
                return this._guardProbeTimer;
            },
            _bindUserMuteTracking(video) {
                // F4（#19 #32）：记住「用户手动选择的静音状态」，切换视频后沿用（PR #56 也强调不要强行改回非静音）。
                // 脚本自身的静音兜底（_handlePlayError）通过「最近一次脚本写入的 muted 值」标记排除，不会被误当成用户选择。
                if (!video || typeof video.addEventListener !== 'function') return;
                if (this._muteTrackedEl === video) return;
                this._unbindUserMuteTracking();
                const handler = () => {
                    if (typeof video.muted !== 'boolean') return;
                    const current = video.muted;
                    // 值与脚本最近一次自己写入的一致 → 这是脚本的兜底/沿用动作，不算用户选择。
                    if (this._lastScriptMutedValue !== null && current === this._lastScriptMutedValue) {
                        this._lastScriptMutedValue = null;
                        return;
                    }
                    this._lastScriptMutedValue = null;
                    this._userMutedChoice = current;
                    console.log(`%c记录用户的静音选择：${current ? '静音' : '非静音'}，切换视频后沿用`, 'color:#607D8B');
                };
                video.addEventListener('volumechange', handler);
                this._muteTrackedEl = video;
                this._muteHandler = handler;
            },
            _unbindUserMuteTracking() {
                if (this._muteTrackedEl && this._muteHandler) {
                    this._muteTrackedEl.removeEventListener('volumechange', this._muteHandler);
                }
                this._muteTrackedEl = null;
                this._muteHandler = null;
            },
            _applyUserMuteChoice(video) {
                if (!video || this._userMutedChoice === null || this._userMutedChoice === undefined) return;
                if (video.muted === this._userMutedChoice) return;
                this._lastScriptMutedValue = this._userMutedChoice;
                video.muted = this._userMutedChoice;
                console.log(`%c沿用用户此前选择的${this._userMutedChoice ? '静音' : '非静音'}状态`, 'color:#607D8B');
            },            resumeAutoPlay() {
                // F4（#32）：用户在播放器里主动暂停后，脚本停止抢播；需要恢复保活时调用本方法。
                this._userPaused = false;
                this._guardLastWallTs = Date.now();
                this._guardLastTime = Number((this._getVideoEl() || {}).currentTime || 0);
                console.log('%c已恢复自动保活（resumeAutoPlay）', 'color:#4CAF50');
            },
            _checkVideoStatus() {
                try {
                    const video = this._getVideoEl();
                    if (!video) return;
                    const now = Date.now();
                    const current = Number(video.currentTime || 0);

                    if (this._guardLastWallTs === 0) {
                        this._guardLastWallTs = now;
                        this._guardLastTime = current;
                    } else if (!video.paused && Math.abs(current - this._guardLastTime) >= 0.01) {
                        this._guardLastWallTs = now;
                        this._guardLastTime = current;
                    }

                    if (video.paused && this._isPlaying) {
                        if (this._isProgressStalled(now)) {
                            console.log('%c检测到视频暂停且进度停滞，按有界策略尝试恢复播放...', 'color:#FF5722');
                            this._tryResumePlayback('paused');
                        }
                    } else if (this._isPlaying && !video.ended) {
                        if (now - this._guardLastWallTs >= this.configs.guardNoProgressMs && this._isProgressStalled(now)) {
                            if (this._tryResumePlayback('no-progress')) {
                                this._guardLastWallTs = now;
                                this._guardLastTime = Number(video.currentTime || 0);
                            }
                        }
                    }

                    if (video.ended && this._isPlaying) {
                        console.log('%c检测到视频结束，准备切换下一个...', 'color:#9C27B0');
                        // 统一走 _handleVideoEnded：内部会先处理「小节内还有未完成的视频任务点」（PR #48 思路），
                        // 并用 _handlingVideoEnd 防止事件与轮询重复触发。
                        this._handleVideoEnded();
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
            _guardProbeTimer: null,
            _seekBackTimesThisUnit: 0,
            _seekBackCapLogged: false,
            _userMutedChoice: null,
            _muteTrackedEl: null,
            _muteHandler: null,
            _lastScriptMutedValue: null,
            async play() {
                try {
                    if (this._interactionBlocked) {
                        console.warn('%c当前有互动答题弹窗，暂停自动播放，等待手动完成（#29 #39）', 'color:#FF9800');
                        return;
                    }
                    const el = this._getVideoEl();
                    if (el == null) {
                        if (this._currentStepTitle() === '视频') {
                            throw new Error('视频组件尚未加载完成');
                        }
                        if (this._advanceLearningStep()) {
                            console.log('%c当前不在视频页，已尝试切到下一学习步骤，2秒后重试', 'color:#607D8B');
                            this._schedule(() => {
                                this.play();
                            }, 2000);
                            return;
                        }
                        if (this._isChapterTest()) {
                            this._advanceChapterTest();
                            return;
                        }
                        this._handleNoVideoNode();
                        return;
                    }

                    this._isPlaying = true;
                    // F3（#38 #43）：重新看到视频即结束「连续自动前进」计数。
                    this._consecutiveNoVideoAdvances = 0;
                    this._videoEventHandle();
                    el.playbackRate = this.configs.playbackRate;
                    // F4（#19 #32）：不默认强制静音；只沿用用户此前手动选择过的静音状态。
                    this._applyUserMuteChoice(el);

                    try {
                        // PR #56：play() 可能永不 settle，这里加超时保护，超时按播放失败处理（重试/静音兜底）。
                        await this._withTimeout(el.play(), this.configs.playTimeoutMs, 'play() 超时，播放器未进入播放状态');
                        this._tryTimes = 0;
                        console.log(`%c视频开始播放，倍速: ${el.playbackRate}x`, 'color:#4CAF50');
                        this._startVideoMonitoring();
                    } catch (playError) {
                        console.error('视频播放失败:', playError);
                        this._handlePlayError(playError);
                    }
                } catch (e) {
                    if (this._tryTimes >= this.configs.maxRetries) {
                        console.error('%c视频播放失败，已达到最大重试次数', 'color:#F44336;font-weight:bold', e);
                        this._clearCheckInterval();
                        // F1（#9 #24 #27 #37 #50）：触顶也是「退出路径」，必须释放导航锁，
                        // 否则后续 nextUnit() 会被静默忽略。
                        this._releaseNavLock('play() 达到最大重试次数');
                        return;
                    }
                    this._tryTimes++;
                    console.log(`%c播放失败，${this.configs.retryInterval / 1000}秒后重试 (${this._tryTimes}/${this.configs.maxRetries})`, 'color:#FF9800');
                    this._schedule(() => {
                        this.play();
                    }, this.configs.retryInterval);
                }
            },
            _handleNoVideoNode() {
                // F3（#38 #42 #43 #50）：无视频/课件页不再默认卡死，但也不能盲目乱跳：
                //   1) 只有「能识别出该节点已完成/无任务点」时才自动前进；
                //   2) 识别不出来时保持安全停止，并打印可操作提示；
                //   3) 两种情况都受 maxConsecutiveNoVideoAdvances 上限约束，避免死循环。
                this._isPlaying = false;
                this._clearCheckInterval();
                const verdict = this._classifyNodeCompletion();
                // 思路移植自 PR #48 @CsuCook1e：小节内视频任务点全部完成时应当前进，而不是判成「无法识别」
                if (this._videoTaskAllComplete) {
                    verdict.completed = true;
                    verdict.signals = (verdict.signals || []).concat(['小节内视频任务点全部完成']);
                }

                if (verdict.completed) {
                    if (this._consecutiveNoVideoAdvances >= this.configs.maxConsecutiveNoVideoAdvances) {
                        console.error(`%c连续自动前进已达上限（${this.configs.maxConsecutiveNoVideoAdvances} 次），已停止以避免死循环（#38 #43）。`, 'color:#F44336;font-weight:bold');
                        console.log('处理方法：请人工确认课程目录结构；确认无误后可执行 app.nextUnit() 逐节跳过，或执行 app.run() 重新开始。');
                        this._releaseNavLock('无视频自动前进触顶');
                        return;
                    }
                    this._consecutiveNoVideoAdvances++;
                    console.warn(`%c当前小节已识别为「已完成/无任务点」（依据：${verdict.signals.join('、')}），自动前进 ${this._consecutiveNoVideoAdvances}/${this.configs.maxConsecutiveNoVideoAdvances}（#38 #43）`, 'color:#FF9800');
                    this.nextUnit();
                    return;
                }

                // 思路移植自 PR #48 @CsuCook1e（_getTaskKind / _handleReadingTask 的分类思路）：
                // 阅读/教材类任务点只给针对性提示，不做自动滚动或代读（那会改动页面内容，不在本版修复范围）。
                if (this._getTaskKind() === 'reading') {
                    console.log('检测到阅读/教材类任务点：脚本不会自动滚动或代读（#42），请手动完成后执行 app.nextUnit()。');
                }
                if (this.configs.autoAdvanceNoVideo) {
                    if (this._consecutiveNoVideoAdvances >= this.configs.maxConsecutiveNoVideoAdvances) {
                        console.error(`%c连续自动前进已达上限（${this.configs.maxConsecutiveNoVideoAdvances} 次），已停止以避免死循环（#38 #43）。`, 'color:#F44336;font-weight:bold');
                        console.log('处理方法：请人工确认课程目录结构；确认无误后可执行 app.nextUnit() 逐节跳过，或执行 app.run() 重新开始。');
                        this._releaseNavLock('无视频自动前进触顶');
                        return;
                    }
                    this._consecutiveNoVideoAdvances++;
                    console.warn(`%c当前小节无法识别完成状态，但 autoAdvanceNoVideo=true，按配置有界前进 ${this._consecutiveNoVideoAdvances}/${this.configs.maxConsecutiveNoVideoAdvances}`, 'color:#FF9800');
                    this.nextUnit();
                    return;
                }

                console.warn('%c当前小节未发现视频，且无法识别「是否已完成/无任务点」，已安全停止（#38 #43）。', 'color:#FF9800');
                console.log('处理方法：1) 确认该小节确实无需完成（纯课件/讨论）后，执行 app.nextUnit() 跳过；'
                    + '2) 也可执行 app.configs.autoAdvanceNoVideo = true 再 app.run()，让脚本有界自动前进；'
                    + '3) 若这本该是视频页，请检查网络与播放器 iframe 是否加载（#52）。');
                this._releaseNavLock('无视频安全停止');
            },
            // ------------------------------------------------------------------
            // 以下视频任务点 / 任务点弹窗 / 任务分类逻辑「思路移植自 PR #48 @CsuCook1e」，
            // 按其函数命名保留可追溯性，并适配本仓库的单一源码、有界动作与跨域安全原则。
            // ------------------------------------------------------------------
            _findVideoTaskFrames(rootWin, depth, result) {
                // 思路移植自 PR #48 @CsuCook1e（_findVideoFramesInWindow）：递归收集小节内的视频任务点 iframe；
                // 跨域 frame 抛 SecurityError 时直接跳过（不当作硬错误打印），并带深度上限保护。
                const found = result || [];
                if (!rootWin || depth > this.configs.videoTaskFrameMaxDepth) return found;
                if (found.length >= this.configs.videoTaskFrameMaxCount) return found;
                let frames = [];
                try {
                    frames = Array.from(rootWin.document.querySelectorAll('iframe'));
                } catch (e) {
                    if (e && e.name === 'SecurityError') return found;
                    console.warn('扫描视频任务点 iframe 失败:', e);
                    return found;
                }
                for (const frame of frames) {
                    if (found.length >= this.configs.videoTaskFrameMaxCount) break;
                    let attrs = '';
                    try {
                        attrs = [frame.className, frame.id, frame.name, frame.title, frame.getAttribute && frame.getAttribute('src')].join(' ').toLowerCase();
                    } catch (e) {
                        attrs = '';
                    }
                    if (attrs.indexOf('ans-insertvideo') >= 0 || attrs.indexOf('insertvideo') >= 0 || attrs.indexOf('video') >= 0) {
                        found.push(frame);
                    }
                    try {
                        if (frame.contentWindow) {
                            this._findVideoTaskFrames(frame.contentWindow, depth + 1, found);
                        }
                    } catch (e) {
                        if (e && e.name === 'SecurityError') continue;
                        console.warn('视频任务点 iframe 递归跳过:', e);
                    }
                }
                return found;
            },
            _getVideoTaskFrames() {
                // 思路移植自 PR #48 @CsuCook1e（_getVideoFrames）
                return this._findVideoTaskFrames(window, 0, []);
            },
            _isCompleteTaskText(text) {
                // 思路移植自 PR #48 @CsuCook1e（_isCompleteTaskText）：显式完成文案，且排除未完成类措辞。
                const normalized = String(text || '').replace(/\s+/g, '');
                const completeTexts = ['任务点已完成', '已完成'];
                const incompleteTexts = ['待完成', '未完成', '未学习', '进行中'];
                return completeTexts.some((value) => normalized.indexOf(value) >= 0)
                    && !incompleteTexts.some((value) => normalized.indexOf(value) >= 0);
            },
            _isCompleteTaskClass(value) {
                // 思路移植自 PR #48 @CsuCook1e（_isCompleteTaskClass）：覆盖 ans-job-finished 这类真实任务点类名。
                const className = String(value || '').toLowerCase();
                return /(ans-)?job-?(finished|finish|done|complete|completed)|finished|complete|completed|done/.test(className)
                    && !/(unfinished|incomplete|uncomplete|doing|todo|wait|waiting)/.test(className);
            },
            _elementHasSingleVideoFrame(el) {
                // 思路移植自 PR #48 @CsuCook1e（_elementHasSingleVideoFrame）：只有「容器里恰好一个视频任务点 iframe」
                // 时，容器上的「已完成」标记才能代表这一个任务点；页面级容器（含多个 iframe）一律不采信。
                if (!el || !el.querySelectorAll) return false;
                try {
                    return el.querySelectorAll('iframe').length <= 1;
                } catch (e) {
                    return false;
                }
            },
            _isVideoTaskFrameComplete(frame) {
                // 思路移植自 PR #48 @CsuCook1e（_isVideoFrameTaskComplete，按本仓库「不确定即视为未完成」的原则收敛）：
                // 只看任务点外观（iframe 自身 / 相邻任务标签 / 单任务点的祖先容器）与 frame 内部明确的任务点完成标记；
                // 文本长度受限，避免把整页文案（例如同页另一个任务点的「任务点已完成」）误当成本任务点已完成。
                if (!frame) return false;
                const checkElement = (el) => {
                    if (!el) return false;
                    if (!this._elementHasSingleVideoFrame(el)) return false;
                    let text = '';
                    try {
                        const ownText = String(el.textContent || '');
                        text = [el.className, el.title, el.getAttribute && el.getAttribute('aria-label')].join(' ')
                            + (ownText.length <= 200 ? ' ' + ownText : '');
                    } catch (e) {
                        text = '';
                    }
                    return this._isCompleteTaskClass(el.className) || this._isCompleteTaskText(text);
                };
                // 兄弟节点只有在「自身不含视频任务点 iframe」时才可能是任务标签（PR #48 的兄弟判定用于标签栏）；
                // 含 iframe 的兄弟属于另一个任务点，不能用来判定当前任务点已完成。
                const checkSibling = (el) => {
                    if (!el || !el.querySelectorAll) return false;
                    try {
                        if (el.querySelectorAll('iframe').length > 0) return false;
                    } catch (e) {
                        return false;
                    }
                    return checkElement(el);
                };
                let current = frame;
                for (let depth = 0; current && depth < 3; depth++) {
                    if (checkElement(current)) return true;
                    if (checkSibling(current.previousElementSibling)) return true;
                    if (checkSibling(current.nextElementSibling)) return true;
                    current = current.parentElement;
                }
                let frameDoc = null;
                try {
                    frameDoc = frame.contentDocument || (frame.contentWindow ? frame.contentWindow.document : null);
                } catch (e) {
                    if (e && e.name === 'SecurityError') return false;
                    return false;
                }
                if (!frameDoc) return false;
                try {
                    const body = frameDoc.body;
                    const bodyText = String((body && (body.innerText || body.textContent)) || '').slice(0, 2000);
                    if (bodyText.length > 0 && bodyText.length <= 200 && this._isCompleteTaskText(bodyText)) return true;
                    const marks = frameDoc.querySelectorAll('[class*="job"], [class*="task"], [class*="complete" i]');
                    for (const mark of marks) {
                        if (this._isCompleteTaskClass(mark.className)) return true;
                        if (mark.textContent && this._isCompleteTaskText(String(mark.textContent).slice(0, 200))) return true;
                    }
                } catch (e) {
                    return false;
                }
                return false;
            },
            _getNextPendingVideoTaskIndex(frames, from) {
                // 思路移植自 PR #48 @CsuCook1e（_getNextPendingVideoTaskIndex）
                const start = Math.max(0, Number(from) || 0);
                for (let i = start; i < frames.length; i++) {
                    if (!this._isVideoTaskFrameComplete(frames[i])) return i;
                }
                return -1;
            },
            _areAllVideoTasksComplete(frames) {
                // 思路移植自 PR #48 @CsuCook1e（_areAllVideoTasksComplete）
                return frames.length > 0 && this._getNextPendingVideoTaskIndex(frames, 0) === -1;
            },
            _videoSelectors() {
                // F6（#18 #52 #55）：播放器 video 选择器的唯一来源，_getVideoEl 与视频任务点查找共用。
                return [
                    'video#video_html5_api',
                    'video[id*="video_html5"]',
                    'video[id*="videoHtml5"]',
                    'video.vjs-tech',
                    'video[src]',
                    'video',
                ];
            },
            _videoElInFrame(frame) {
                // 思路移植自 PR #48 @CsuCook1e（其 _getVideoEl 内的 findVideo）：在指定任务点 frame 内找 video，
                // 跨域 frame 返回 null 且不打印硬错误。
                if (!frame) return null;
                let frameDoc = null;
                try {
                    frameDoc = frame.contentDocument || (frame.contentWindow ? frame.contentWindow.document : null);
                } catch (e) {
                    if (!(e && e.name === 'SecurityError')) console.warn('视频任务点 frame 访问失败:', e);
                    return null;
                }
                if (!frameDoc) return null;
                for (const selector of this._videoSelectors()) {
                    let candidates = [];
                    try {
                        candidates = Array.from(frameDoc.querySelectorAll(selector));
                    } catch (e) {
                        continue;
                    }
                    for (const candidate of candidates) {
                        if (selector === 'video' && !this._videoHasSource(candidate)) continue;
                        return candidate;
                    }
                }
                return null;
            },
            _getDialogButtonCandidates(dialog) {
                // 思路移植自 PR #48 @CsuCook1e（_getDialogButtonCandidates）
                if (!dialog) return [];
                const elements = [dialog];
                try {
                    for (const el of dialog.querySelectorAll('button, a, span, div')) elements.push(el);
                } catch (e) {
                    return elements;
                }
                return elements;
            },
            _isLikelyVisibleDialog(el) {
                // 思路移植自 PR #48 @CsuCook1e（_isLikelyVisibleDialog，简化为不依赖 z-index 栈的版本）：
                // 限制文本长度避免误判整页容器；有排版信息时要求最小尺寸；无排版环境退化为显式隐藏检查。
                if (!el) return false;
                const text = String(el.textContent || '');
                if (text.length > 800) return false;
                let rect = null;
                try {
                    rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
                } catch (e) {
                    rect = null;
                }
                if (rect && (rect.width || rect.height)) {
                    return rect.width >= 160 && rect.height >= 80;
                }
                return this._isVisible(el);
            },
            _handleTaskPointDialog(reason) {
                // 思路移植自 PR #48 @CsuCook1e（_handleTaskPointDialog）：
                // 平台弹「当前章节还有任务点未完成」时，正确做法是点「去学习 / 去完成」回到未完成任务点，
                // 而不是点「下一节」硬闯（#43 的反复横跳、#54 的风控都是这么来的）。
                // 本仓库额外加了「每小节点击次数上限」，避免在异常页面上无限点。
                const now = Date.now();
                if (now - this._lastTaskPointDialogClickAt < this.configs.taskDialogClickCooldownMs) return false;
                if (this._taskDialogClicksThisUnit >= this.configs.taskDialogMaxClicksPerUnit) {
                    if (!this._taskDialogCapLogged) {
                        this._taskDialogCapLogged = true;
                        console.warn(`%c「任务点未完成」弹窗处理已达上限（${this.configs.taskDialogMaxClicksPerUnit} 次/小节），停止点击以免循环（#43 #54）。`, 'color:#FF9800');
                        console.log('处理方法：请手动完成该小节剩余任务点，然后执行 app.nextUnit() 继续。');
                    }
                    return false;
                }
                const normalize = (value) => String(value || '').replace(/\s+/g, '');
                const dialogSelector = '[role="dialog"], .layui-layer, .wayer, .wayer-dialog, .modal, .dialog, [class*="dialog"], [class*="modal"], [class*="layer"]';
                let dialogs = [];
                try {
                    dialogs = $(dialogSelector).filter((_, el) => {
                        const text = normalize($(el).text());
                        return this._isLikelyVisibleDialog(el) && text.indexOf('当前章节还有任务点未完成') >= 0;
                    }).toArray();
                } catch (e) {
                    dialogs = [];
                    if (!(e && e.name === 'SecurityError')) console.warn('任务点弹窗检测失败:', e);
                }
                if (dialogs.length === 0) return false;
                const dialog = dialogs[dialogs.length - 1];
                const targets = ['去学习', '去完成'];
                const buttons = this._getDialogButtonCandidates(dialog).filter((el) => {
                    const text = normalize(el.textContent);
                    if (!targets.some((target) => text === target || (text.indexOf(target) >= 0 && (!el.children || el.children.length === 0)))) return false;
                    return this._isVisible(el);
                });
                const button = buttons[buttons.length - 1];
                if (!button) return false;
                this._lastTaskPointDialogClickAt = now;
                this._taskDialogClicksThisUnit++;
                console.warn(`%c检测到「当前章节还有任务点未完成」弹窗，点击「${normalize(button.textContent)}」回到未完成任务点（${reason}），第 ${this._taskDialogClicksThisUnit}/${this.configs.taskDialogMaxClicksPerUnit} 次`, 'color:#FF9800');
                button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                return true;
            },
            _currentTaskText() {
                // 思路移植自 PR #48 @CsuCook1e（_getCurrentTaskText）
                if (typeof document === 'undefined') return ''; // t6：页面已关闭时保持可用，不抛异常
                const parts = [document.title, this._currentStepTitle()];
                try {
                    const selectors = '.posCatalog_active .posCatalog_name, .prev_white.active, .prev_white.selected, .prev_white[aria-selected="true"]';
                    for (const el of document.querySelectorAll(selectors)) {
                        parts.push(el.getAttribute('title') || el.textContent || '');
                    }
                } catch (e) {
                    // 忽略：任务文本只用于分类与日志
                }
                return String(parts.join(' ')).replace(/\s+/g, '');
            },
            _hasVideoTaskSignal() {
                // 思路移植自 PR #48 @CsuCook1e（_hasVideoTaskSignal）：视频任务信号强于阅读标签。
                if (this._videoEl) return true;
                if (this._getVideoTaskFrames().length > 0) return true;
                try {
                    if ($('video').length > 0) return true;
                } catch (e) {
                    // 忽略
                }
                return this._currentTaskText().indexOf('视频') >= 0;
            },
            _getTaskKind() {
                // 思路移植自 PR #48 @CsuCook1e（_getTaskKind）：先判定任务类型再决定行为
                // （video / quiz / reading / unknown），顺序上「视频信号」优先于「阅读标签」。
                if (this._hasVideoTaskSignal()) return 'video';
                if (this._isChapterTest()) return 'quiz';
                if (/阅读|教材|文档|图书/.test(this._currentTaskText())) return 'reading';
                return 'unknown';
            },
            _classifyNodeCompletion() {
                // F3（#38 #43）：判定当前节点是否「已完成 / 无任务点」。
                // 证据限制：仓库里没有学习通课程树的 DOM 快照，因此这里只使用「节点自带的完成标记」
                // 这类用户可肉眼核对、缺一个信号就返回 false 的判据；宁可安全停止，也不猜测并乱跳。
                const node = this._currentCatalogNode();
                if (!node) return { completed: false, signals: [], reason: '当前节点未定位' };
                const signals = [];
                const doneTokens = ['completed', 'finished', 'done', 'icon_completed', 'poscatalog_completed', 'poscatalog_finished', 'jobfinished'];
                const badTokens = ['uncompleted', 'incomplete', 'notcompleted', 'undone'];
                const tokens = String(node.className || '').toLowerCase().split(/\s+/).filter(Boolean);
                if (tokens.some((t) => doneTokens.includes(t)) && !tokens.some((t) => badTokens.includes(t))) {
                    signals.push(`节点样式类 ${node.className}`);
                }
                let iconCandidates = [];
                try {
                    iconCandidates = Array.from(node.querySelectorAll('[class*="completed" i], [class*="Complet"], [class*="Finish"], .icon_Completed'));
                } catch (e) {
                    iconCandidates = [];
                }
                for (const icon of iconCandidates) {
                    const cls = String(icon.className || '');
                    if (/uncomplet|incomplet/i.test(cls)) continue;
                    signals.push(`完成图标 ${cls}`);
                    break;
                }
                const nameEl = node.querySelector('.posCatalog_name');
                const title = nameEl ? String(nameEl.getAttribute('title') || nameEl.textContent || '').trim() : '';
                if (/已完成|已学完|已通关/.test(title)) signals.push(`标题标记「${title}」`);
                return { completed: signals.length > 0, signals, reason: signals.length ? '' : '未发现完成/无任务点标记' };
            },
            _currentCatalogNode() {
                // F2：当前可播放节点统一走解析器；解析失败时回退到已跟踪下标。
                const position = this._resolveCatalogPosition('_currentCatalogNode');
                if (position.ok) return position.node;
                return this._catalogNodesOfTrackedChapter();
            },
            _catalogNodesOf(chapterEl) {
                // F2（#14 #15 #24 #27 #37 #49）：同章可播放节点集合的唯一来源。
                // 排除 .firstLayer（收起态父节点），也排除任何仍然包含 .posCatalog_select 的容器节点。
                return $(chapterEl)
                    .find('.posCatalog_select:not(.firstLayer)')
                    .toArray()
                    .filter((node) => !node.querySelector('.posCatalog_select'));
            },
            _catalogNodesOfTrackedChapter() {
                try {
                    const el = this._getTreeContainer();
                    const chapters = el.children('ul').children('li');
                    const chapter = chapters.get(this._cellData.currentCellIndex);
                    if (!chapter) return null;
                    const nodes = this._catalogNodesOf(chapter);
                    return nodes[this._cellData.currentNCellIndex] || null;
                } catch (e) {
                    return null;
                }
            },
            _resolveCatalogPosition(reason, override) {
                // F2（#14 #15 #24 #27 #37 #49）：「当前节点下标」与「同章节点集合」的唯一解析入口。
                // 特性：
                //   * 只把 .posCatalog_select:not(.firstLayer) 当作可播放节点；
                //   * active 落在「节点自身」「父级 li / 收起态 firstLayer / 祖先 ul」时都能定位；
                //   * 解析失败返回 ok=false + reason，调用方必须显式报错，禁止静默跳到下一章。
                const el = this._getTreeContainer();
                const chapters = el.children('ul').children('li').toArray();
                const empty = (why) => ({ ok: false, reason: why, source: '', chapters, chapterIndex: -1, nodes: [], nodeIndex: -1, node: null });
                if (chapters.length === 0) return empty('课程目录里没有任何章节节点');

                // F2（#14 #15 #24 #27 #37）：同章可播放节点只认叶子节点，容器节点（firstLayer /
                // lastLayer 等还包含子节点的高亮父级）不算视频节点，否则下标会整体错位。
                const nodesOf = (chapterEl) => this._catalogNodesOf(chapterEl);

                if (override && Number.isInteger(override.chapterIndex) && chapters[override.chapterIndex]) {
                    const nodes = nodesOf(chapters[override.chapterIndex]);
                    if (nodes.length === 0) return empty(`第 ${override.chapterIndex + 1} 章没有可识别的视频节点`);
                    const idx = Math.min(Math.max(Number(override.nodeIndex) || 0, 0), nodes.length - 1);
                    return { ok: true, reason: '', source: 'tracked', chapters, chapterIndex: override.chapterIndex, nodes, nodeIndex: idx, node: nodes[idx] };
                }

                const topUl = el.children('ul').get(0);
                const chapterIndexOf = (node) => {
                    let cur = node;
                    while (cur && cur.parentElement && cur.parentElement !== topUl) {
                        cur = cur.parentElement;
                    }
                    if (!cur || cur.parentElement !== topUl) return -1;
                    return chapters.indexOf(cur);
                };
                const isLeafNode = (node) => !!(node && node.matches && node.matches('.posCatalog_select:not(.firstLayer)'));

                let activeEls = el.find('.posCatalog_active').toArray();
                if (activeEls.length === 0) {
                    return empty(`目录中不存在 .posCatalog_active 高亮节点（调用点=${reason}）`);
                }
                activeEls = activeEls.slice().sort((a, b) => (isLeafNode(b) ? 1 : 0) - (isLeafNode(a) ? 1 : 0));

                let inferred = null;
                for (const activeEl of activeEls) {
                    const chapterIndex = chapterIndexOf(activeEl);
                    if (chapterIndex < 0) continue;
                    const nodes = nodesOf(chapters[chapterIndex]);
                    if (nodes.length === 0) {
                        if (!inferred) inferred = empty(`active 所在章（第 ${chapterIndex + 1} 章）没有可识别的视频节点`);
                        continue;
                    }
                    if (isLeafNode(activeEl)) {
                        const selfIndex = nodes.indexOf(activeEl);
                        if (selfIndex >= 0) {
                            return { ok: true, reason: '', source: 'active-node', chapters, chapterIndex, nodes, nodeIndex: selfIndex, node: nodes[selfIndex] };
                        }
                    }
                    // active 落在父节点（章节 li / firstLayer / 祖先 ul）上：
                    // 优先取该章内同样带 active 的子节点，否则退到第 1 个可播放节点。
                    const activeChildIndex = nodes.findIndex((n) => n.classList && n.classList.contains('posCatalog_active'));
                    const nodeIndex = activeChildIndex >= 0 ? activeChildIndex : 0;
                    if (!inferred) {
                        inferred = { ok: true, reason: '', source: 'active-parent', chapters, chapterIndex, nodes, nodeIndex, node: nodes[nodeIndex] };
                    }
                    continue;
                }

                if (inferred && inferred.ok) return inferred;
                return inferred || empty(`无法从 ${activeEls.length} 个 active 元素定位到可播放节点（调用点=${reason}）`);
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
                if (clickElement(videoTab, '「视频」页签')) {
                    return true;
                }

                return false;
            },
            _currentStepTitle() {
                if (typeof document === 'undefined') return ''; // t6：页面已关闭时保持可用，不抛异常
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
                    // F6（#52 #55）：从其它学习步骤回到视频页时，播放器会被重建，缓存必须显式失效。
                    this._invalidateVideoCache('步骤切回视频页');
                    this._isPlaying = false;
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    this._schedule(() => {
                        try {
                            this._initCellData();
                        } catch (e) {
                            console.warn('重新初始化课程目录失败:', e);
                        }
                        this.play();
                    }, 1800);
                };

                $(document).off('click.xuexitongPlayerV3', '.prev_white').on('click.xuexitongPlayerV3', '.prev_white', (e) => {
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
                if (!video) {
                    // F1（#24 #27）：没有视频可回退时也要释放导航锁。
                    this._releaseNavLock('play 错误且无视频元素');
                    return;
                }
                this._lastScriptMutedValue = true; // F4：脚本自身的静音兜底不算用户选择
                video.muted = true;
                const mutedAttempt = video.play();
                if (!mutedAttempt || typeof mutedAttempt.then !== 'function') {
                    this._releaseNavLock('静音播放未被接受');
                    return;
                }
                // PR #56「播放 Promise 超时保护」同样作用于静音兜底：
                // 否则媒体管线冻结时这里既不会成功也不会失败，监控定时器也不会被重启。
                this._withTimeout(mutedAttempt, this.configs.playTimeoutMs, '静音 play() 超时，播放器未进入播放状态').then(() => {
                    console.log('%c静音播放成功', 'color:#4CAF50');
                    this._tryTimes = 0;
                    this._startVideoMonitoring();
                    this._cancelDelayedNextUnit('静音恢复成功');
                }).catch((e) => {
                    console.error('静音播放也失败:', e);
                    this._cancelDelayedNextUnit('静音恢复失败');
                    this._isPlaying = false;
                    if (this._tryTimes >= this.configs.maxRetries) {
                        console.error('%c静音播放失败，已达到最大重试次数', 'color:#F44336;font-weight:bold', e);
                        // F1（#9 #24 #27 #37）：静音恢复失败同样是退出路径，必须释放导航锁。
                        this._releaseNavLock('静音播放失败触顶');
                        return;
                    }
                    this._tryTimes++;
                    this._delayedNextUnitTimer = this._schedule(() => {
                        this._delayedNextUnitTimer = null;
                        this.play();
                    }, this.configs.retryInterval);
                });
            },
            _invalidateVideoCache(reason) {
                // F6（#52 #55）：显式失效视频元素缓存 —— 切换小节、iframe 重载、播放器换源后
                // 旧节点会脱离文档，继续复用会出现「UI 显示在播放、实际已暂停」以及事件绑定错位。
                if (this._videoEl) {
                    console.log(`%c视频元素缓存已失效（${reason}）`, 'color:#607D8B');
                }
                this._videoEl = null;
                this._detachVideoEvents();
            },
            playCurrentIndex(nCell, override) {
                if (!nCell) {
                    const position = this._resolveCatalogPosition('playCurrentIndex', override || {
                        chapterIndex: this._cellData.currentCellIndex,
                        nodeIndex: this._cellData.currentNCellIndex,
                    });
                    if (!position.ok) {
                        console.error(`%c无法定位要播放的课程节点：${position.reason}`, 'color:#F44336;font-weight:bold');
                        console.log('处理方法：请在左侧目录中手动点击目标小节，或刷新页面后执行 app.run()。');
                        this._releaseNavLock('playCurrentIndex 解析失败');
                        return;
                    }
                    nCell = position.node;
                    this._cellData.currentCellIndex = position.chapterIndex;
                    this._cellData.currentNCellIndex = position.nodeIndex;
                }

                const $nCell = $(nCell);
                const clickableSpan = $nCell.find('.posCatalog_name')[0];
                if (!clickableSpan) {
                    console.error('%c===========找不到可点击的课程节点，播放下一个视频失败==============', 'color:#F44336');
                    // F1（#24 #27）：找不到节点也要释放导航锁，避免死锁。
                    this._releaseNavLock('找不到可点击节点');
                    return;
                }

                console.log(`%c点击切换到: ${$(clickableSpan).attr('title') || '未知标题'}`, 'color:#2196F3');
                // F6（#52 #55）：切换小节时显式失效视频缓存并解绑旧事件。
                this._invalidateVideoCache('切换小节');
                // t6：切小节时取消可能残留的上一段视频的自动跳转定时器（并复位结束去重标志）。
                this._cancelDelayedNextUnit('切换小节');
                this._isPlaying = false;
                this._currentVideoTaskIndex = 0;
                this._videoTaskCount = 0;
                this._videoTaskAllComplete = false;
                this._handlingVideoEnd = false;
                this._taskDialogClicksThisUnit = 0;
                this._taskDialogCapLogged = false;
                this._seekBackTimesThisUnit = 0;
                this._seekBackCapLogged = false;
                if (this._guardProbeTimer) {
                    this._cancelTimer(this._guardProbeTimer);
                    this._guardProbeTimer = null;
                }
                this._resumeAttemptsThisUnit = 0;
                this._resumeCapLogged = false;
                this._userPaused = false;
                this._guardLastTime = 0;
                this._guardLastWallTs = 0;
                this._guardLastResumeTs = 0;
                $(clickableSpan).click();

                console.log('%c等待视频加载...', 'color:#FF9800');
                this._schedule(() => {
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
                cells.each((i, v) => {
                    nCellCounts += this._catalogNodesOf(v).length;
                });
                this._cellData.nCells = nCellCounts;
                // F2（#14 #15 #24 #27 #37 #49）：当前下标解析失败时明确报错并保留上次已知位置，
                // 而不是把 currentCellIndex 当成 0（那正是「一章只播第一个视频」的来源）。
                const position = this._resolveCatalogPosition('_initCellData');
                if (!position.ok) {
                    this._cellData.resolved = false;
                    this._cellData.resolveSource = '';
                    console.error(`%c无法解析当前激活的视频节点：${position.reason}`, 'color:#F44336;font-weight:bold');
                    console.log('处理方法：请在左侧目录中点击目标小节后再执行 app.run()；脚本不会在此情况下自动跳到下一章（#14 #15）。');
                } else {
                    this._cellData.resolved = true;
                    this._cellData.resolveSource = position.source;
                    this._cellData.currentCellIndex = position.chapterIndex;
                    this._cellData.currentNCellIndex = position.nodeIndex;
                    const titleSpan = $(position.node).find('.posCatalog_name')[0];
                    if (titleSpan) {
                        this._cellData.currentVideoTitle = $(titleSpan).attr('title') || $(titleSpan).text() || '';
                    }
                }

                console.log(`%c课程信息: ${this._cellData.cells}章, ${this._cellData.nCells}节, 当前: 第${this._cellData.currentCellIndex + 1}章第${this._cellData.currentNCellIndex + 1}节（解析来源: ${this._cellData.resolveSource || '未解析'}）`, 'color:#607D8B');
                return position;
            },
            _getTreeContainer() {
                if (!this._treeContainerEl || (this._treeContainerEl.length && !this._treeContainerEl.get(0).isConnected)) {
                    // F2/F6：目录被页面重绘后，旧容器会脱离文档，必须重新查询，否则下标解析全部错位。
                    const el = $('#coursetree');
                    if (el.length <= 0) {
                        throw new Error('找不到视频列表');
                    }
                    this._treeContainerEl = el;
                }
                return this._treeContainerEl;
            },
            _videoHasSource(video) {
                if (!video) return false;
                if (video.getAttribute && video.getAttribute('src')) return true;
                if (video.currentSrc) return true;
                return !!(video.querySelector && video.querySelector('source[src]'));
            },
            _getVideoEl() {
                // F6（#18 #52 #55）：扩大选择器覆盖 + 提高嵌套 frame 搜索深度（带上限）+ 缓存失效。
                if (this._videoEl && this._videoEl.isConnected === false) {
                    this._invalidateVideoCache('缓存的视频节点已脱离文档（iframe 重载）');
                }
                if (!this._videoEl) {
                    try {
                        const directSelectors = this._videoSelectors();
                        // 思路移植自 PR #48 @CsuCook1e：同一小节里可能有多个「视频任务点」iframe，
                        // 先按任务顺序挑第一个「未完成且已加载出 video」的任务点；全部完成才交给无视频分支前进。
                        const taskFrames = this._getVideoTaskFrames();
                        this._videoTaskCount = taskFrames.length;
                        if (taskFrames.length > 0) {
                            const pendingIndex = this._getNextPendingVideoTaskIndex(taskFrames, this._currentVideoTaskIndex);
                            if (pendingIndex < 0) {
                                this._currentVideoTaskIndex = taskFrames.length;
                                this._videoTaskAllComplete = true;
                                console.log(`%c小节内 ${taskFrames.length} 个视频任务点均已完成，准备切换下一小节`, 'color:#4CAF50');
                                return null;
                            }
                            if (pendingIndex !== this._currentVideoTaskIndex) {
                                console.log(`%c跳过已完成的视频任务点，切换到第 ${pendingIndex + 1}/${taskFrames.length} 个`, 'color:#FF9800');
                                this._currentVideoTaskIndex = pendingIndex;
                            }
                            for (let i = pendingIndex; i < taskFrames.length; i++) {
                                const taskVideo = this._videoElInFrame(taskFrames[i]);
                                if (taskVideo) {
                                    this._currentVideoTaskIndex = i;
                                    this._videoEl = taskVideo;
                                    return taskVideo;
                                }
                            }
                        }
                        const findVideo = (rootDoc, depth) => {
                            if (!rootDoc) return null;
                            // 深度上限保护：避免在异常/自引用 frame 结构里无限递归。
                            if (depth > this.configs.videoFrameMaxDepth) return null;
                            for (const selector of directSelectors) {
                                let candidates = [];
                                try {
                                    candidates = Array.from(rootDoc.querySelectorAll(selector));
                                } catch (e) {
                                    continue;
                                }
                                for (const candidate of candidates) {
                                    // 兜底选择器只接受真正挂了媒体源的 video，避免抓到装饰性空标签。
                                    if (selector === 'video' && !this._videoHasSource(candidate)) continue;
                                    return candidate;
                                }
                            }
                            let frames = [];
                            try {
                                frames = Array.from(rootDoc.querySelectorAll('iframe.ans-insertvideo-online, iframe[src*="video"], iframe, frame'));
                            } catch (e) {
                                frames = [];
                            }
                            for (const nestedFrame of frames) {
                                let nestedDoc = null;
                                try {
                                    nestedDoc = nestedFrame.contentDocument || (nestedFrame.contentWindow ? nestedFrame.contentWindow.document : null);
                                } catch (e) {
                                    nestedDoc = null;
                                }
                                if (!nestedDoc) continue;
                                const nested = findVideo(nestedDoc, depth + 1);
                                if (nested) return nested;
                            }
                            return null;
                        };
                        // V3.3 只扫描 iframe（深度 2）；这里先扫主文档，再逐层进入 frame（默认深度 4）。
                        const video = findVideo(document, 0);
                        if (video) {
                            this._videoEl = video;
                        }
                    } catch (e) {
                        console.error('获取视频元素失败:', e);
                        return null;
                    }
                }
                if (!this._videoEl) return null;
                return this._videoEl;
            },
            _videoEventHandle() {
                const el = this._videoEl;
                if (!el) {
                    console.log('videoEl未加载');
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
                // F4（#26 #32 #55）：只在播放器文档内被动观察用户交互（不 preventDefault/stopPropagation），
                // 用来区分「用户主动暂停」与「页面异常暂停」。
                this._bindUserInteractionWatch(el.ownerDocument);
                this._bindUserMuteTracking(el);
            },
            _bindUserInteractionWatch(frameDoc) {
                if (!frameDoc || this._userInteractionDoc === frameDoc) return;
                this._unbindUserInteractionWatch();
                const handler = () => {
                    this._lastUserInteractionTs = Date.now();
                };
                frameDoc.addEventListener('pointerdown', handler, true);
                frameDoc.addEventListener('click', handler, true);
                frameDoc.addEventListener('keydown', handler, true);
                this._userInteractionDoc = frameDoc;
                this._userInteractionHandler = handler;
            },
            _unbindUserInteractionWatch() {
                if (!this._userInteractionDoc || !this._userInteractionHandler) return;
                this._userInteractionDoc.removeEventListener('pointerdown', this._userInteractionHandler, true);
                this._userInteractionDoc.removeEventListener('click', this._userInteractionHandler, true);
                this._userInteractionDoc.removeEventListener('keydown', this._userInteractionHandler, true);
                this._userInteractionDoc = null;
                this._userInteractionHandler = null;
            },
            _detachVideoEvents() {
                if (this._eventVideoEl && this._boundVideoHandlers) {
                    this._eventVideoEl.removeEventListener('ended', this._boundVideoHandlers.ended);
                    this._eventVideoEl.removeEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
                    this._eventVideoEl.removeEventListener('play', this._boundVideoHandlers.play);
                    this._eventVideoEl.removeEventListener('pause', this._boundVideoHandlers.pause);
                }
                this._eventVideoEl = null;
                this._boundVideoHandlers = null;
                this._unbindUserInteractionWatch();
                this._unbindUserMuteTracking();
            },
            _handleVideoEnded(e) {
                const title = this._cellData.currentVideoTitle;
                console.warn(`%c============'${title}' 播放完成=============`, 'color:#4CAF50;font-weight:bold');
                if (this._handlingVideoEnd) return;
                this._handlingVideoEnd = true;
                this._isPlaying = false;
                this._clearCheckInterval();

                // 思路移植自 PR #48 @CsuCook1e（_handleVideoTaskEnded）：
                // 小节内还有未完成的视频任务点时，先切到该任务点继续播，而不是直接切下一小节（#24 #37）。
                try {
                    const frames = this._getVideoTaskFrames();
                    this._videoTaskCount = frames.length;
                    const pendingIndex = this._getNextPendingVideoTaskIndex(frames, this._currentVideoTaskIndex + 1);
                    if (pendingIndex >= 0) {
                        this._currentVideoTaskIndex = pendingIndex;
                        this._invalidateVideoCache(`切换到第 ${pendingIndex + 1}/${frames.length} 个视频任务点`);
                        console.log(`%c同一小节还有未完成的视频任务点，切换到第 ${pendingIndex + 1}/${frames.length} 个`, 'color:#FF9800');
                        this._schedule(() => {
                            this._handlingVideoEnd = false;
                            this.play();
                        }, 800);
                        return;
                    }
                } catch (error) {
                    console.warn('检查小节内视频任务点失败:', error);
                }

                // t6：登记到统一定时器账本，使四处入口的取消对它生效（原先这里未登记，取消形同虚设）。
                this._delayedNextUnitTimer = this._schedule(() => {
                    this._delayedNextUnitTimer = null;
                    this._handlingVideoEnd = false;
                    this.nextUnit();
                }, 1000);
            },
            _handleVideoLoaded(e) {
                console.log('%c============视频加载完成=============', 'color:#2196F3');
                // t6：新视频已加载完成，取消可能残留的「上一段视频结束」自动跳转，避免跳过当前小节。
                this._cancelDelayedNextUnit('视频加载完成');
                if (this.configs.autoplay && !this._isPlaying) {
                    this.play();
                }
            },
            _handleVideoPlay(e) {
                const title = this._cellData.currentVideoTitle;
                console.info(`%c============'${title}' 开始播放=============`, 'color:#4CAF50');
                this._isPlaying = true;
                this._stepSwitchPending = false;
                // F4（#32 #55）：重新开始播放即视为暂停问题已解决，清掉用户暂停标记。
                this._userPaused = false;
                this._guardLastTime = Number((this._getVideoEl() || {}).currentTime || 0);
                this._guardLastWallTs = Date.now();
                this._cancelDelayedNextUnit('视频重新开始播放');
            },
            _handleVideoPause(e) {
                const now = Date.now();
                const sinceInteraction = this._lastUserInteractionTs ? now - this._lastUserInteractionTs : Infinity;
                // F4（#26 #32 #54 #55）：只有「用户刚在播放器里操作过」才认定为用户主动暂停。
                // 判定后脚本停止抢播，避免无差别 play() 造成的风控/验证码（#54）与假播放状态（#55）。
                if (sinceInteraction <= this.configs.userPauseWindowMs) {
                    this._userPaused = true;
                    console.warn('%c检测到用户主动暂停：脚本不再自动恢复播放（#26 #32 #55）。', 'color:#FF9800');
                    console.log('处理方法：需要恢复自动保活时，请点击播放按钮或执行 app.resumeAutoPlay()。');
                    return;
                }
                console.log('%c视频暂停（非用户操作），等待进度停滞判定后再按有界策略恢复...', 'color:#FF9800');
            },
            _isVisible(el) {
                // F5（#29 #39 #42）：仅用于「暂停自动跳转」这类安全动作，不用于点击，因此宁可宽松。
                if (!el) return false;
                if (el.hidden) return false;
                let node = el;
                for (let i = 0; node && i < 6; i++, node = node.parentElement) {
                    const style = node.style;
                    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
                    if (node.hasAttribute && node.hasAttribute('hidden')) return false;
                }
                const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
                if (rect && (rect.width > 0 || rect.height > 0)) return true;
                // 无布局环境（隐藏标签页、jsdom）rect 恒为 0：只要没有被显式隐藏就按可见处理，避免漏检。
                return true;
            },
            _findInteractionDialog(rootDoc, depth) {
                // F5（#29 #39 #42）：选择器与「弹窗识别」思路借用自 PR #53 @wangzheng-1；
                // 按队长裁决**只做检测**——不复制其选项点选/提交逻辑，也不实现任何自动作答。
                // #42 反馈指出题目容器 class 为 Zy_TItle、题目文本为 newStyle，这里一并覆盖。
                if (!rootDoc || depth > this.configs.videoFrameMaxDepth) return null;
                const selector = [
                    '.answerQuestion',
                    '.videoInteraction',
                    '.interaction',
                    '.ans-video-question',
                    '.Zy_TItle',
                    '[class*="answerQuestion"]',
                    '[class*="videoInteraction"]',
                ].join(', ');
                let candidates = [];
                try {
                    candidates = Array.from(rootDoc.querySelectorAll(selector));
                } catch (e) {
                    candidates = [];
                }
                const promptRe = /(请选择|请回答|请作答|选择你认为|判断题|单选题|多选题|请你判断)/;
                for (const candidate of candidates) {
                    if (!this._isVisible(candidate)) continue;
                    let scope = candidate;
                    for (let level = 0; level < 3 && scope; level++) {
                        const text = String(scope.textContent || '').replace(/\s+/g, ' ').trim();
                        if (text.length >= 6 && text.length <= 3000 && promptRe.test(text)) {
                            const options = scope.querySelectorAll('li, label, input[type=radio], input[type=checkbox]');
                            if (options.length > 0) {
                                return { el: scope, text: text.slice(0, 120), optionCount: options.length };
                            }
                        }
                        scope = scope.parentElement;
                    }
                }
                let frames = [];
                try {
                    frames = Array.from(rootDoc.querySelectorAll('iframe, frame'));
                } catch (e) {
                    frames = [];
                }
                for (const frame of frames) {
                    let frameDoc = null;
                    try {
                        frameDoc = frame.contentDocument || (frame.contentWindow ? frame.contentWindow.document : null);
                    } catch (e) {
                        frameDoc = null;
                    }
                    if (!frameDoc) continue;
                    const nested = this._findInteractionDialog(frameDoc, depth + 1);
                    if (nested) return nested;
                }
                return null;
            },
            _checkInteractionDialog() {
                if (!this.configs.interactionGuard) return null;
                // 章节测验页自身就有题目容器：那里沿用原有的「受限跳转」逻辑，不做互动弹窗判定，
                // 避免把正常章节测验误判成视频互动弹窗。
                if (this._isChapterTest()) return null;
                const found = this._findInteractionDialog(document, 0);
                if (found) {
                    if (!this._interactionBlocked) {
                        this._interactionBlocked = true;
                        // 暂停自动跳转：清掉待执行的跳转定时器并停止视频监控，避免在弹窗上反复点击导致卡死。
                        this._clearTimers();
                        this._clearCheckInterval();
                        console.warn(`%c检测到视频互动答题弹窗（判断题/选择题），已暂停自动跳转（#29 #39）：${found.text}`, 'color:#FF9800');
                        console.log('处理方法：请手动完成该互动题。按设计脚本不会自动答题（#45 相关需求不实现），'
                            + '也不会绕过任何考核；答题并关闭弹窗后，脚本会自动恢复自动播放与跳转。');
                    }
                } else if (this._interactionBlocked) {
                    this._interactionBlocked = false;
                    console.log('%c互动答题弹窗已消失，恢复自动播放与跳转。', 'color:#4CAF50');
                    this.play();
                }
                return found;
            },
            _startInteractionWatcher() {
                // F5（#29 #39）：只检测、只暂停；全脚本没有任何自动答题/外部模型调用。
                if (!this.configs.interactionGuard) return;
                if (this._interactionWatcher) return;
                this._interactionWatcher = setInterval(() => {
                    try {
                        this._checkInteractionDialog();
                        if (!this._interactionBlocked) {
                            // 思路移植自 PR #48 @CsuCook1e：平台弹「当前章节还有任务点未完成」时，
                            // 点「去学习/去完成」回到未完成任务点（受冷却与次数上限约束），不点「下一节」硬闯。
                            this._handleTaskPointDialog('monitor');
                        }
                    } catch (e) {
                        console.error('互动弹窗检测失败:', e);
                    }
                }, this.configs.interactionPollMs);
            },
            _stopInteractionWatcher() {
                if (this._interactionWatcher) {
                    clearInterval(this._interactionWatcher);
                    this._interactionWatcher = null;
                }
            },
            destroy() {
                this._isPlaying = false;
                this._nextUnitPending = false;
                // 幂等/可注销审计：启动轮询定时器挂在 window[BOOT_TIMER_KEY] 上（不属于 app 实例），
                // destroy() 也要把它停掉，否则「目录未就绪时 destroy() → 20 秒后又被启动」会重新拉起脚本。
                if (window[BOOT_TIMER_KEY]) {
                    clearInterval(window[BOOT_TIMER_KEY]);
                    window[BOOT_TIMER_KEY] = null;
                }
                this._clearCheckInterval();
                this._stopInteractionWatcher();
                // F4（#32 #54 #55）：守卫相关的延时器、视频事件、用户交互监听全部清理干净。
                this._clearTimers();
                this._detachVideoEvents();
                this._invalidateVideoCache('destroy');
                this._treeContainerEl = null;
                this._stepNavigationBound = false;
                $(document).off('.xuexitongPlayerV3');
                // F4（#26 #54）：不再在 document/window 上劫持 mouseleave/mouseout，
                // 因此这里也没有全局 preventDefault 监听需要移除（旧实现的劫持已被整体删除）。
                this._userPaused = false;
                this._interactionBlocked = false;
                this._currentVideoTaskIndex = 0;
                this._videoTaskAllComplete = false;
                this._handlingVideoEnd = false;
                this._taskDialogClicksThisUnit = 0;
                this._taskDialogCapLogged = false;
                this._seekBackTimesThisUnit = 0;
                this._seekBackCapLogged = false;
                this._userMutedChoice = null;
                this._unbindUserMuteTracking();
                this._consecutiveNoVideoAdvances = 0;
                this._resumeAttemptsThisUnit = 0;
                this._resumeCapLogged = false;
                console.log('%c脚本已停止（destroy）：定时器、视频事件与页面监听均已清理。', 'color:#607D8B');
            },
        };

        window.app = app;
        window[APP_KEY] = app;

        try {
            app.run();
        } catch (error) {
            // F7（#4 #5 #16 #17 #18 #23 #33 #47）：启动失败必须给出可操作提示，而不是丢一个看不懂的报错。
            console.error('%c脚本运行失败: ', 'color:#F44336;font-weight:bold', error && error.message ? error.message : error);
            console.log('处理方法：1) 确认当前是学习通课程播放页（地址含 /mycourse/studentstudy）；'
                + '2) 等左侧目录渲染完成后执行 app.run()；3) 仍失败请刷新页面；4) 也可改用油猴版 v3_optimized.user.js。');
        }
    }
})();