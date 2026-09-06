(function () {
  const APP_KEY = "__xuexitongPlayerV3";
  const BOOT_TIMER_KEY = "__xuexitongPlayerV3BootTimer";

  const previousApp = window[APP_KEY];
  if (previousApp && typeof previousApp.destroy === "function") {
    previousApp.destroy();
  }
  if (window[BOOT_TIMER_KEY]) {
    clearInterval(window[BOOT_TIMER_KEY]);
    window[BOOT_TIMER_KEY] = null;
  }

  if (typeof window.jQuery === "undefined") {
    const script = document.createElement("script");
    script.src = "https://code.jquery.com/jquery-3.6.0.min.js";
    script.type = "text/javascript";
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
      if ($("#coursetree").length > 0) {
        clearInterval(window[BOOT_TIMER_KEY]);
        window[BOOT_TIMER_KEY] = null;
        initializePlayer();
        return;
      }
      attempts++;
      if (attempts >= maxAttempts) {
        clearInterval(window[BOOT_TIMER_KEY]);
        window[BOOT_TIMER_KEY] = null;
        console.error(
          "%c脚本启动超时：未检测到课程目录（#coursetree）。请确认当前处于课程播放页。",
          "color:#F44336;font-weight:bold",
        );
      }
    }, 1000);
  }

  function initializePlayer() {
    const app = {
      configs: {
        playbackRate: 1.0,
        muted: true,
        autoplay: true,
        retryInterval: 2000,
        maxRetries: 10,
        initialPlayTimeoutMs: 10000,
        videoCheckInterval: 1000,
        guardNoProgressMs: 7000,
        guardResumeCooldownMs: 1500,
        guardRecoveryProbeMs: 2500,
        guardProgressEpsilon: 0.05,
        guardSeekBackSeconds: 0.15,
        autoAdvanceNoVideo: false,
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
        console.log(
          "%c=== 学习通自动刷课脚本 V3 优化版启动 ===",
          "color:#4CAF50;font-size:16px;font-weight:bold",
        );
        this._nextUnitPending = false;
        this._chapterAdvanceTimes = 0;
        this._getTreeContainer();
        this._initCellData();
        this._invalidateVideoEl();
        this._getVideoEl();
        this._clearCheckInterval();
        this._bindStepNavigation();
        this.play();
      },
      nextUnit() {
        if (this._nextUnitPending) {
          console.warn("%c已有小节切换正在进行，忽略重复请求", "color:#FF9800");
          return;
        }
        this._nextUnitPending = true;
        this._clearCheckInterval();
        console.log(
          "%c=== 准备切换到下一小节 ===",
          "color:#2196F3;font-size:14px",
        );
        try {
          const el = this._getTreeContainer();
          const cells = el.children("ul").children("li");
          const nCells = $(cells.get(this._cellData.currentCellIndex)).find(
            ".posCatalog_select:not(.firstLayer)",
          );

          if (nCells.length > this._cellData.currentNCellIndex + 1) {
            const nextNIndex = this._cellData.currentNCellIndex + 1;
            console.log(
              `%c切换到同章节下一个视频: ${nextNIndex + 1}/${nCells.length}`,
              "color:#FF9800",
            );
            this.playCurrentIndex(nCells.get(nextNIndex));
          } else {
            const nextIndex = this._cellData.currentCellIndex + 1;
            if (nextIndex >= cells.length) {
              console.log(
                "%c=====================================",
                "color:#4CAF50;font-size:16px",
              );
              console.log(
                "%c==============本课程学习完成了==============",
                "color:#4CAF50;font-size:16px;font-weight:bold",
              );
              console.log(
                "%c=====================================",
                "color:#4CAF50;font-size:16px",
              );
              return;
            }
            console.log(
              `%c切换到下一个章节: ${nextIndex + 1}/${cells.length}`,
              "color:#FF9800",
            );
            this._cellData.currentCellIndex = nextIndex;
            this._cellData.currentNCellIndex = 0;
            this.playCurrentIndex();
          }
        } catch (error) {
          this._nextUnitPending = false;
          console.error("切换下一小节失败:", error);
        }
      },
      _clearCheckInterval() {
        if (this._checkInterval) {
          clearInterval(this._checkInterval);
          this._checkInterval = null;
        }
      },
      _clearRecoveryProbe() {
        if (this._guardRecoveryTimer) {
          clearTimeout(this._guardRecoveryTimer);
          this._guardRecoveryTimer = null;
        }
      },
      _resetPlaybackGuard(video) {
        this._clearRecoveryProbe();
        this._guardLastTime = Number(video?.currentTime || 0);
        this._guardLastWallTs = Date.now();
        this._guardLastResumeTs = 0;
        this._guardRecoveryAttempts = 0;
      },
      _startVideoMonitoring() {
        this._clearCheckInterval();
        this._resetPlaybackGuard(this._getVideoEl());
        this._checkInterval = setInterval(() => {
          this._checkVideoStatus("interval");
        }, this.configs.videoCheckInterval);
      },
      _noteVideoProgress(video) {
        if (!video || video !== this._videoEl) return false;

        const current = Number(video.currentTime);
        if (!Number.isFinite(current)) return false;
        if (this._guardLastWallTs === 0) {
          this._guardLastTime = current;
          this._guardLastWallTs = Date.now();
          return false;
        }

        const delta = current - this._guardLastTime;
        if (Math.abs(delta) < this.configs.guardProgressEpsilon) {
          return false;
        }

        this._guardLastTime = current;
        this._guardLastWallTs = Date.now();
        if (delta > this.configs.guardProgressEpsilon) {
          this._guardRecoveryAttempts = 0;
          this._clearRecoveryProbe();
        }
        return true;
      },
      _scheduleRecoveryProbe(video, baselineTime) {
        this._clearRecoveryProbe();
        this._guardRecoveryTimer = setTimeout(() => {
          this._guardRecoveryTimer = null;
          if (!this._isPlaying) return;

          const activeVideo = this._getVideoEl(true);
          if (!activeVideo) return;
          if (activeVideo !== video) {
            this._checkVideoStatus("video-replaced");
            return;
          }

          const current = Number(activeVideo.currentTime || 0);
          if (
            Math.abs(current - baselineTime) >=
            this.configs.guardProgressEpsilon
          ) {
            this._noteVideoProgress(activeVideo);
            return;
          }
          this._guardLastWallTs = Date.now() - this.configs.guardNoProgressMs;
          this._checkVideoStatus("recovery-probe");
        }, this.configs.guardRecoveryProbeMs);
      },
      _videoState(video) {
        return {
          currentTime: Number(video?.currentTime || 0),
          duration: Number.isFinite(video?.duration)
            ? Number(video.duration)
            : null,
          paused: Boolean(video?.paused),
          ended: Boolean(video?.ended),
          seeking: Boolean(video?.seeking),
          readyState: video?.readyState,
          networkState: video?.networkState,
          mediaError: video?.error?.code || null,
        };
      },
      _playVideoWithTimeout(video, timeoutMs = 4000) {
        let timeoutId = null;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            const error = new Error(
              `play() 在 ${timeoutMs}ms 内未进入播放状态`,
            );
            error.name = "PlaybackTimeoutError";
            reject(error);
          }, timeoutMs);
        });

        let playPromise;
        try {
          playPromise = Promise.resolve(video.play());
        } catch (error) {
          playPromise = Promise.reject(error);
        }

        return Promise.race([playPromise, timeoutPromise]).finally(() => {
          if (timeoutId) clearTimeout(timeoutId);
        });
      },
      _seekBackForRecovery(video, resumeAt) {
        if (!Number.isFinite(resumeAt) || resumeAt <= 0) return;

        let target = Math.max(0, resumeAt - this.configs.guardSeekBackSeconds);
        try {
          const ranges = video.seekable;
          for (let i = 0; i < ranges.length; i++) {
            const start = ranges.start(i);
            const end = ranges.end(i);
            if (resumeAt >= start && resumeAt <= end + 0.25) {
              target = Math.max(start, Math.min(target, end));
              break;
            }
          }
          video.currentTime = target;
        } catch (error) {
          console.warn("恢复播放时轻微回拨失败，将直接重播:", error);
        }
      },
      async _tryResumePlayback(reason) {
        const now = Date.now();
        if (
          this._guardRecoveryInFlight ||
          now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs
        ) {
          return;
        }

        const isNoProgress =
          reason.startsWith("no-progress") || reason === "recovery-probe";
        const video = this._getVideoEl(
          isNoProgress || reason === "video-replaced",
        );
        if (!video || !this._isPlaying || video.ended) return;

        this._guardLastResumeTs = now;
        this._guardRecoveryInFlight = true;
        const recoveryAttempt = isNoProgress
          ? Math.max(1, this._guardRecoveryAttempts)
          : 0;
        const resumeAt = Number(video.currentTime || 0);
        const hardRestart = isNoProgress && !video.paused;

        console.warn(`%c触发视频保活恢复(${reason})`, "color:#607D8B", {
          attempt: recoveryAttempt,
          hardRestart,
          ...this._videoState(video),
        });

        try {
          video.playbackRate = this.configs.playbackRate;
          if (hardRestart) {
            video.pause();
            await new Promise((resolve) => setTimeout(resolve, 80));
            if (recoveryAttempt >= 2) {
              this._seekBackForRecovery(video, resumeAt);
            }
          }

          try {
            await this._playVideoWithTimeout(video);
          } catch (error) {
            if (!video.muted && error?.name === "NotAllowedError") {
              console.warn("直接恢复播放失败，尝试静音恢复:", error);
              video.muted = true;
              await this._playVideoWithTimeout(video);
            } else {
              throw error;
            }
          }
        } catch (error) {
          console.error(
            "视频保活恢复失败，稍后继续重试:",
            error,
            this._videoState(video),
          );
        } finally {
          this._guardRecoveryInFlight = false;
          if (video === this._videoEl && this._isPlaying) {
            this._guardLastTime = Number(video.currentTime || 0);
            this._guardLastWallTs = Date.now();
            this._scheduleRecoveryProbe(video, this._guardLastTime);
          }
        }
      },
      _checkVideoStatus(source = "manual") {
        try {
          const video = this._getVideoEl(source !== "interval");
          if (!video) return;
          if (!this._isPlaying) return;

          if (video.ended) {
            console.log("%c检测到视频结束，准备切换下一个...", "color:#9C27B0");
            this._isPlaying = false;
            this._clearRecoveryProbe();
            setTimeout(() => this.nextUnit(), 1000);
            return;
          }

          if (video.paused) {
            console.log("%c检测到视频暂停，尝试恢复播放...", "color:#FF5722");
            this._tryResumePlayback(`paused:${source}`);
            return;
          }

          if (this._noteVideoProgress(video)) return;

          const now = Date.now();
          if (this._guardLastWallTs === 0) {
            this._guardLastTime = Number(video.currentTime || 0);
            this._guardLastWallTs = now;
            return;
          }

          const stalledMs = now - this._guardLastWallTs;
          if (stalledMs >= this.configs.guardNoProgressMs) {
            this._guardRecoveryAttempts++;
            this._guardLastWallTs = now;
            this._guardLastTime = Number(video.currentTime || 0);
            this._tryResumePlayback(`no-progress:${source}`);
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
      _guardRecoveryAttempts: 0,
      _guardRecoveryInFlight: false,
      _guardRecoveryTimer: null,
      _pageWakeTimer: null,
      async play() {
        try {
          const el = this._getVideoEl();
          if (el == null) {
            if (this._currentStepTitle() === "视频") {
              throw new Error("视频组件尚未加载完成");
            }
            if (this._advanceLearningStep()) {
              console.log(
                "%c当前不在视频页，已尝试切到下一学习步骤，2秒后重试",
                "color:#607D8B",
              );
              setTimeout(() => {
                this.play();
              }, 2000);
              return;
            }
            if (this._isChapterTest()) {
              this._advanceChapterTest();
              return;
            }
            this._isPlaying = false;
            this._clearCheckInterval();
            if (this.configs.autoAdvanceNoVideo) {
              console.warn(
                "%c当前小节未发现视频，按配置切换到下一小节",
                "color:#FF9800",
              );
              this.nextUnit();
            } else {
              console.warn(
                "%c当前小节未发现视频或可识别的学习步骤，已安全停止。确认无需完成课件后，可执行 app.nextUnit()。",
                "color:#FF9800",
              );
            }
            return;
          }

          this._isPlaying = true;
          this._videoEventHandle();
          el.playbackRate = this.configs.playbackRate;
          el.defaultMuted = this.configs.muted;
          el.muted = this.configs.muted;

          try {
            await this._playVideoWithTimeout(
              el,
              this.configs.initialPlayTimeoutMs,
            );
            this._tryTimes = 0;
            console.log(
              `%c视频开始播放，倍速: ${el.playbackRate}x`,
              "color:#4CAF50",
            );
            this._startVideoMonitoring();
          } catch (playError) {
            console.error("视频播放失败:", playError);
            this._handlePlayError(playError);
          }
        } catch (e) {
          if (this._tryTimes >= this.configs.maxRetries) {
            console.error(
              "%c视频播放失败，已达到最大重试次数",
              "color:#F44336;font-weight:bold",
              e,
            );
            this._clearCheckInterval();
            return;
          }
          this._tryTimes++;
          console.log(
            `%c播放失败，${this.configs.retryInterval / 1000}秒后重试 (${this._tryTimes}/${this.configs.maxRetries})`,
            "color:#FF9800",
          );
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
        const currentStepTitle = prevTitle
          ? (prevTitle.title || prevTitle.textContent || "").trim()
          : "";

        if (currentStepTitle === "章节测验" || currentStepTitle === "视频") {
          return false;
        }

        const clickElement = (el, label) => {
          if (!el) return false;
          this._stepSwitchPending = true;
          this._stepSwitchAt = Date.now();
          console.log(`%c尝试点击${label}`, "color:#2196F3");
          el.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
            }),
          );
          return true;
        };

        const videoTab = $(".prev_white:visible")
          .filter((_, el) => {
            const text = ($(el).text() || "").replace(/\s+/g, "");
            return text === "2视频" || text === "视频";
          })
          .get(0);
        if (clickElement(videoTab, "“视频”页签")) {
          return true;
        }

        return false;
      },
      _currentStepTitle() {
        const prevTitle = document.getElementsByClassName("prev_title")[0];
        return prevTitle
          ? (prevTitle.title || prevTitle.textContent || "").trim()
          : "";
      },
      _isChapterTest() {
        return this._currentStepTitle() === "章节测验";
      },
      _advanceChapterTest() {
        if (this._chapterAdvanceTimes >= 3) {
          console.error(
            "%c章节测验页面连续跳转失败，已停止以避免页面循环。请手动处理后执行 app.run()。",
            "color:#F44336;font-weight:bold",
          );
          return;
        }

        const nextButton = $(
          "#prevNextFocusNext:visible, #right1:visible, .nextChapter:visible",
        )
          .first()
          .get(0);
        if (!nextButton) {
          console.warn(
            "%c未找到章节测验的下一步按钮，已停止。",
            "color:#FF9800",
          );
          return;
        }

        this._chapterAdvanceTimes++;
        console.log("%c检测到章节测验，尝试进入下一学习步骤", "color:#607D8B");
        nextButton.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
          }),
        );
        setTimeout(() => this.play(), 2000);
      },
      _bindStepNavigation() {
        if (this._stepNavigationBound) {
          return;
        }
        this._stepNavigationBound = true;

        const reenterVideoMode = () => {
          this._invalidateVideoEl();
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

        $(document)
          .off("click.xuexitongPlayerV3", ".prev_white")
          .on("click.xuexitongPlayerV3", ".prev_white", (e) => {
            const text = ($(e.currentTarget).text() || "").replace(/\s+/g, "");
            if (text.includes("视频")) {
              console.log(
                `%c检测到步骤切换点击：${text}，准备重新接管视频页`,
                "color:#607D8B",
              );
              reenterVideoMode();
            }
          });
      },
      _handlePlayError(error) {
        console.error("播放错误详情:", error);
        const video = this._getVideoEl();
        if (video) {
          video.muted = true;
          this._playVideoWithTimeout(video, this.configs.initialPlayTimeoutMs)
            .then(() => {
              console.log("%c静音播放成功", "color:#4CAF50");
              this._tryTimes = 0;
              this._startVideoMonitoring();
              if (this._delayedNextUnitTimer) {
                clearTimeout(this._delayedNextUnitTimer);
                this._delayedNextUnitTimer = null;
              }
            })
            .catch((e) => {
              console.error("静音播放也失败:", e);
              if (this._delayedNextUnitTimer) {
                clearTimeout(this._delayedNextUnitTimer);
              }
              this._isPlaying = false;
              if (this._tryTimes >= this.configs.maxRetries) {
                console.error(
                  "%c静音播放失败，已达到最大重试次数",
                  "color:#F44336;font-weight:bold",
                  e,
                );
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
          const nCells = $(cells.get(this._cellData.currentCellIndex)).find(
            ".posCatalog_select:not(.firstLayer)",
          );
          nCell = nCells.get(this._cellData.currentNCellIndex);
        }

        const $nCell = $(nCell);
        const clickableSpan = $nCell.find(".posCatalog_name")[0];
        if (!clickableSpan) {
          console.error(
            "%c===========找不到可点击的课程节点，播放下一个视频失败==============",
            "color:#F44336",
          );
          return;
        }

        console.log(
          `%c点击切换到: ${$(clickableSpan).attr("title") || "未知标题"}`,
          "color:#2196F3",
        );
        this._isPlaying = false;
        this._clearCheckInterval();
        this._invalidateVideoEl();
        $(clickableSpan).click();

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
          const nCells = $(v).find(".posCatalog_select:not(.firstLayer)");
          nCellCounts += nCells.length;
          nCells.each((j, e) => {
            const _el = $(e);
            if (_el.hasClass("posCatalog_active")) {
              this._cellData.currentCellIndex = i;
              this._cellData.currentNCellIndex = j;
              foundCurrent = true;
              const titleSpan = _el.find(".posCatalog_name")[0];
              if (titleSpan) {
                this._cellData.currentVideoTitle = $(titleSpan).attr("title");
              }
            }
          });
        });

        this._cellData.nCells = nCellCounts;

        if (!foundCurrent && nCellCounts > 0) {
          console.warn(
            "%c未找到当前激活的视频节点，可能需要手动选择",
            "color:#FF9800",
          );
        }

        console.log(
          `%c课程信息: ${this._cellData.cells}章, ${this._cellData.nCells}节, 当前: 第${this._cellData.currentCellIndex + 1}章第${this._cellData.currentNCellIndex + 1}节`,
          "color:#607D8B",
        );
      },
      _getTreeContainer() {
        if (!this._treeContainerEl) {
          const el = $("#coursetree");
          if (el.length <= 0) {
            throw new Error("找不到视频列表");
          }
          this._treeContainerEl = el;
        }
        return this._treeContainerEl;
      },
      _isElementVisible(el) {
        if (!el) return false;
        try {
          const view = el.ownerDocument?.defaultView;
          const style = view?.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return (
            style?.display !== "none" &&
            style?.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        } catch (error) {
          return false;
        }
      },
      _isVideoAttached(video) {
        if (!video) return false;
        try {
          if (
            !video.isConnected ||
            !video.ownerDocument?.documentElement?.contains(video)
          ) {
            return false;
          }

          let ownerWindow = video.ownerDocument.defaultView;
          if (!ownerWindow || ownerWindow.closed) return false;
          while (ownerWindow !== window) {
            const frame = ownerWindow.frameElement;
            if (!frame || !frame.isConnected) return false;
            ownerWindow = ownerWindow.parent;
          }
          return true;
        } catch (error) {
          return false;
        }
      },
      _findVideoEl() {
        const candidates = [];
        const visitedDocuments = new Set();

        const framePriority = (frame) => {
          let score = frame.id === "iframe" ? 100 : 0;
          const className = String(frame.className || "");
          const src = String(frame.getAttribute("src") || "");
          if (/ans-(?:insertvideo|attach)/i.test(className)) score += 50;
          if (/video|ananas/i.test(src)) score += 25;
          return score;
        };

        const visitDocument = (doc, depth, ancestorsVisible) => {
          if (!doc || depth > 5 || visitedDocuments.has(doc)) return;
          visitedDocuments.add(doc);

          let videos = [];
          try {
            videos = Array.from(
              doc.querySelectorAll(
                'video#video_html5_api, video[id*="video_html5"], video.vjs-tech, video',
              ),
            );
          } catch (error) {}

          for (const video of videos) {
            let score = 0;
            if (ancestorsVisible && this._isElementVisible(video))
              score += 1000;
            if (video.id === "video_html5_api") score += 100;
            if (video.classList?.contains("vjs-tech")) score += 50;
            if (video.currentSrc || video.getAttribute("src")) score += 30;
            if (video.readyState > 0) score += 20;
            if (!video.ended) score += 10;
            if (video === this._videoEl) score += 1;
            candidates.push({ video, score });
          }

          let frames = [];
          try {
            frames = Array.from(doc.querySelectorAll("iframe"));
            frames.sort((a, b) => framePriority(b) - framePriority(a));
          } catch (error) {}

          for (const frame of frames) {
            try {
              const childDocument =
                frame.contentDocument || frame.contentWindow?.document;
              if (childDocument) {
                visitDocument(
                  childDocument,
                  depth + 1,
                  ancestorsVisible && this._isElementVisible(frame),
                );
              }
            } catch (error) {}
          }
        };

        visitDocument(document, 0, true);
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0]?.video || null;
      },
      _getVideoEl(forceRefresh = false) {
        if (!forceRefresh && this._isVideoAttached(this._videoEl)) {
          return this._videoEl;
        }

        const previousVideo = this._videoEl;
        const nextVideo = this._findVideoEl();
        if (nextVideo !== previousVideo) {
          this._detachVideoEvents();
          this._videoEl = nextVideo;
          this._clearRecoveryProbe();

          if (nextVideo && this._isPlaying) {
            nextVideo.playbackRate = this.configs.playbackRate;
            nextVideo.defaultMuted = this.configs.muted;
            nextVideo.muted = this.configs.muted;
            this._videoEventHandle();
            this._resetPlaybackGuard(nextVideo);
            if (previousVideo) {
              console.info(
                "%c检测到播放器节点已更换，已重新绑定",
                "color:#607D8B",
              );
            }
          }
        }

        return this._videoEl || null;
      },
      _invalidateVideoEl() {
        this._detachVideoEvents();
        this._videoEl = null;
        this._clearRecoveryProbe();
        this._guardLastTime = 0;
        this._guardLastWallTs = 0;
        this._guardRecoveryAttempts = 0;
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
          playing: this._handleVideoPlaying.bind(this),
          timeupdate: this._handleVideoTimeUpdate.bind(this),
          pause: this._handleVideoPause.bind(this),
        };

        el.addEventListener("ended", this._boundVideoHandlers.ended);
        el.addEventListener(
          "loadedmetadata",
          this._boundVideoHandlers.loadedmetadata,
        );
        el.addEventListener("play", this._boundVideoHandlers.play);
        el.addEventListener("playing", this._boundVideoHandlers.playing);
        el.addEventListener("timeupdate", this._boundVideoHandlers.timeupdate);
        el.addEventListener("pause", this._boundVideoHandlers.pause);
      },
      _detachVideoEvents() {
        if (!this._eventVideoEl || !this._boundVideoHandlers) return;
        this._eventVideoEl.removeEventListener(
          "ended",
          this._boundVideoHandlers.ended,
        );
        this._eventVideoEl.removeEventListener(
          "loadedmetadata",
          this._boundVideoHandlers.loadedmetadata,
        );
        this._eventVideoEl.removeEventListener(
          "play",
          this._boundVideoHandlers.play,
        );
        this._eventVideoEl.removeEventListener(
          "playing",
          this._boundVideoHandlers.playing,
        );
        this._eventVideoEl.removeEventListener(
          "timeupdate",
          this._boundVideoHandlers.timeupdate,
        );
        this._eventVideoEl.removeEventListener(
          "pause",
          this._boundVideoHandlers.pause,
        );
        this._eventVideoEl = null;
        this._boundVideoHandlers = null;
      },
      _handleVideoEnded(e) {
        if (e.currentTarget !== this._videoEl) return;
        const title = this._cellData.currentVideoTitle;
        console.warn(
          `%c============'${title}' 播放完成=============`,
          "color:#4CAF50;font-weight:bold",
        );
        this._isPlaying = false;
        this._clearCheckInterval();
        this._clearRecoveryProbe();
        setTimeout(() => this.nextUnit(), 1000);
      },
      _handleVideoLoaded(e) {
        if (e.currentTarget !== this._videoEl) return;
        console.log(`%c============视频加载完成=============`, "color:#2196F3");
        if (this.configs.autoplay && !this._isPlaying) {
          this.play();
        }
      },
      _handleVideoPlay(e) {
        if (e.currentTarget !== this._videoEl) return;
        const title = this._cellData.currentVideoTitle;
        console.info(
          `%c============'${title}' 开始播放=============`,
          "color:#4CAF50",
        );
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
      _handleVideoPlaying(e) {
        if (e.currentTarget !== this._videoEl) return;
        if (this._guardLastWallTs === 0) {
          this._guardLastTime = Number(e.currentTarget.currentTime || 0);
          this._guardLastWallTs = Date.now();
        }
      },
      _handleVideoTimeUpdate(e) {
        this._noteVideoProgress(e.currentTarget);
      },
      _handleVideoPause(e) {
        if (e.currentTarget !== this._videoEl) return;
        console.log(`%c============视频暂停=============`, "color:#FF9800");
        if (this._isPlaying && !e.currentTarget.ended) {
          this._schedulePlaybackCheck("video-pause", 120);
        }
      },
      _schedulePlaybackCheck(reason, delay = 0) {
        if (!this._isPlaying) return;
        if (this._pageWakeTimer) clearTimeout(this._pageWakeTimer);
        this._pageWakeTimer = setTimeout(() => {
          this._pageWakeTimer = null;
          if (!this._isPlaying) return;
          this._checkVideoStatus(reason);
        }, delay);
      },
      _bindPageGuards() {
        const resumePlaybackNow = (event) => {
          const pageState = document.hidden ? "hidden" : "visible";
          const delay = document.hidden || event.type === "blur" ? 250 : 50;
          this._schedulePlaybackCheck(`page-${event.type}-${pageState}`, delay);
        };
        this._pageGuards = { resumePlaybackNow };
        window.addEventListener("blur", resumePlaybackNow);
        window.addEventListener("focus", resumePlaybackNow);
        window.addEventListener("pageshow", resumePlaybackNow);
        window.addEventListener("online", resumePlaybackNow);
        document.addEventListener("visibilitychange", resumePlaybackNow);
      },
      destroy() {
        this._isPlaying = false;
        this._clearCheckInterval();
        this._clearRecoveryProbe();
        if (this._pageWakeTimer) {
          clearTimeout(this._pageWakeTimer);
          this._pageWakeTimer = null;
        }
        this._invalidateVideoEl();
        if (this._delayedNextUnitTimer)
          clearTimeout(this._delayedNextUnitTimer);
        $(document).off(".xuexitongPlayerV3");
        if (this._pageGuards) {
          const { resumePlaybackNow } = this._pageGuards;
          window.removeEventListener("blur", resumePlaybackNow);
          window.removeEventListener("focus", resumePlaybackNow);
          window.removeEventListener("pageshow", resumePlaybackNow);
          window.removeEventListener("online", resumePlaybackNow);
          document.removeEventListener("visibilitychange", resumePlaybackNow);
          this._pageGuards = null;
        }
      },
    };

    window.app = app;
    window[APP_KEY] = app;

    try {
      app.run();
      app._bindPageGuards();
    } catch (error) {
      console.error(
        "%c脚本运行失败: ",
        "color:#F44336;font-weight:bold",
        error.message,
      );
      console.log(
        "请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。",
      );
    }
  }
})();
