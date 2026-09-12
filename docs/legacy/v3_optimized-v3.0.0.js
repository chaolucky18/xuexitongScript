(function () {
    // 检查页面是否已加载jQuery，如果没有则加载
    if (typeof window.jQuery === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
        script.type = 'text/javascript';
        script.onload = function () {
            console.log("jQuery loaded.");
            initializePlayer();
        };
        document.head.appendChild(script);
    } else {
        initializePlayer();
    }

    function initializePlayer() {
        window.app = {
            configs: {
                playbackRate: 2, /// 倍数（某些平台高倍数可能导致视频暂停，2倍是比较稳妥的速率）
                autoplay: true, /// 自动播放
                retryInterval: 2000, /// 重试间隔（毫秒）
                maxRetries: 10, /// 最大重试次数
                videoCheckInterval: 1000, /// 视频状态检查间隔
            },
            _videoEl: null,
            _treeContainerEl: null,
            _isPlaying: false,
            _currentRetryCount: 0,
            _checkInterval: null,
            _cellData: {
                cells: 0, /// 总的章数量
                nCells: 0, /// 总的课时（节点）数量
                currentCellIndex: 0, // 当前所在的章
                currentNCellIndex: 0, /// 当前所在的课时
                currentVideoTitle: "", /// 当前选中视频的标题
            },
            get cellData() {
                return this._cellData;
            },
            run() {
                console.log("%c=== 学习通自动刷脚脚本 V3 优化版启动 ===", "color:#4CAF50;font-size:16px;font-weight:bold");
                this._getTreeContainer();
                this._initCellData();
                this._videoEl = null;
                this._getVideoEl();
                this._clearCheckInterval();
                this.play();
            },

            /// 选择并播放下一小节视频（需要先调用run方法初始化数据）
            nextUnit() {
                console.log("%c=== 准备切换到下一小节 ===", "color:#2196F3;font-size:14px");
                const el = this._getTreeContainer();
                const cells = el.children("ul").children("li");
                const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                
                if (nCells.length > this._cellData.currentNCellIndex + 1) {
                    /// 当前大节点里面的小节点未播放完成
                    const nextNIndex = this._cellData.currentNCellIndex + 1;
                    console.log(`%c切换到同章节下一个视频: ${nextNIndex + 1}/${nCells.length}`, "color:#FF9800");
                    this.playCurrentIndex(nCells.get(nextNIndex));
                } else {
                    const nextIndex = this._cellData.currentCellIndex + 1;
                    if (nextIndex >= cells.length) {
                        /// 当前课程已全部播放完成
                        console.log("%c=====================================", "color:#4CAF50;font-size:16px");
                        console.log("%c==============本课程学习完成了==============", "color:#4CAF50;font-size:16px;font-weight:bold");
                        console.log("%c=====================================", "color:#4CAF50;font-size:16px");
                        this._clearCheckInterval();
                        return;
                    }
                    console.log(`%c切换到下一个章节: ${nextIndex + 1}/${cells.length}`, "color:#FF9800");
                    /// 切换下一个大节点
                    this._cellData.currentCellIndex = nextIndex;
                    this._cellData.currentNCellIndex = 0;
                    this.playCurrentIndex();
                }
            },
            
            /// 清除检查间隔
            _clearCheckInterval() {
                if (this._checkInterval) {
                    clearInterval(this._checkInterval);
                    this._checkInterval = null;
                }
            },
            
            /// 开始视频状态监控
            _startVideoMonitoring() {
                this._clearCheckInterval();
                this._checkInterval = setInterval(() => {
                    this._checkVideoStatus();
                }, this.configs.videoCheckInterval);
            },
            
            /// 检查视频状态
            _checkVideoStatus() {
                try {
                    const video = this._getVideoEl();
                    if (!video) return;
                    
                    // 如果视频暂停了，尝试恢复播放
                    if (video.paused && this._isPlaying) {
                        console.log("%c检测到视频暂停，尝试恢复播放...", "color:#FF5722");
                        video.play().catch(e => {
                            console.error("恢复播放失败:", e);
                        });
                    }
                    
                    // 检查视频是否结束
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
            /// 播放当前视频（需要先调用run方法初始化数据）
            async play() {
                try {
                    const el = this._getVideoEl();
                    if (el == null) {
                        if (document.getElementsByClassName("prev_title")[0] && 
                            document.getElementsByClassName("prev_title")[0].title !== "章节测验") {
                            throw new Error("播放失败：视频元素为空");
                        }
                        // 没找到视频元素，可能是章节测验或其他内容
                        console.log("%c===========跳过章节测验，2秒后继续播放==============", "color:#607D8B");
                        $("#prevNextFocusNext").click();
                        setTimeout(() => {
                            this.play();
                        }, 2000);
                        return;
                    }
                    
                    // 重置重试计数
                    this._tryTimes = 0;
                    this._isPlaying = true;
                    
                    /// 设置事件监听
                    this._videoEventHandle();
                    
                    /// 设置倍数并播放
                    el.playbackRate = this.configs.playbackRate;
                    
                    // 尝试播放
                    try {
                        await el.play();
                        console.log(`%c视频开始播放，倍速: ${el.playbackRate}x`, "color:#4CAF50");
                        this._startVideoMonitoring();
                    } catch (playError) {
                        console.error("视频播放失败:", playError);
                        this._handlePlayError(playError);
                    }
                    
                } catch (e) {
                    if (this._tryTimes > this.configs.maxRetries) {
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
            
            /// 处理播放错误
            _handlePlayError(error) {
                console.error("播放错误详情:", error);
                // 尝试静音播放
                const video = this._getVideoEl();
                if (video) {
                    video.muted = true;
                    video.play().then(() => {
                        console.log("%c静音播放成功", "color:#4CAF50");
                        // 2秒后尝试恢复声音
                        setTimeout(() => {
                            video.muted = false;
                        }, 2000);
                    }).catch(e => {
                        console.error("静音播放也失败:", e);
                        // 如果静音播放也失败，跳到下一个视频
                        setTimeout(() => this.nextUnit(), 3000);
                    });
                }
            },
            
            /// 播放当前指向的小节视频（需要先调用run方法初始化数据）
            playCurrentIndex(nCell) {
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
                    // 尝试跳到下一个
                    setTimeout(() => this.nextUnit(), 2000);
                    return;
                }
                
                console.log(`%c点击切换到: ${$(clickableSpan).attr('title') || '未知标题'}`, "color:#2196F3");
                $(clickableSpan).click(); /// 切换视频
                this._videoEl = null;
                this._isPlaying = false;

                /// 增加等待时间，确保新视频有足够时间加载
                console.log("%c等待视频加载...", "color:#FF9800");
                setTimeout(() => {
                    this._initCellData();
                    if (this.configs.autoplay) {
                        this.play();
                    }
                }, 3000); // 增加延迟时间到3秒
            },
            
            /**
             * 初始化课程章节数据
             */
            _initCellData() {
                const el = this._getTreeContainer();
                // 新版HTML中，章是 #coursetree > ul > li
                const cells = el.children("ul").children("li");
                this._cellData.cells = cells.length;
                let nCellCounts = 0;
                let foundCurrent = false;
                
                cells.each((i, v) => {
                    // 新版HTML中，课时节点是 .posCatalog_select，并且要排除作为章标题的 .firstLayer
                    const nCells = $(v).find('.posCatalog_select:not(.firstLayer)');
                    nCellCounts += nCells.length;
                    nCells.each((j, e) => {
                        const _el = $(e);
                        // 新版HTML中，当前播放的课时用 .posCatalog_active 标记
                        if (_el.hasClass("posCatalog_active")) {
                            /// 当前所在节点
                            this._cellData.currentCellIndex = i;
                            this._cellData.currentNCellIndex = j;
                            foundCurrent = true;
                            // 新版HTML中，标题在 .posCatalog_name 的 title 属性里
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
            
            /**
             * 获取视频元素Video
             * @return {HTMLVideoElement}
             * @private
             */
            _getVideoEl() {
                if (!this._videoEl) {
                    try {
                        const frameObj = $("iframe").eq(0).contents().find("iframe.ans-insertvideo-online");
                        if (frameObj.length === 0) {
                            return null;
                        }
                        this._videoEl = frameObj.contents().eq(0).find("video#video_html5_api").get(0);
                    } catch (e) {
                        console.error("获取视频元素失败:", e);
                        return null;
                    }
                }
                if (!this._videoEl) {
                    throw new Error("视频组件Video未加载完成");
                }
                return this._videoEl;
            },
            
            /// 播放器事件处理
            _videoEventHandle() {
                const el = this._videoEl;
                if (!el) {
                    console.log("videoEl未加载");
                    return;
                }
                
                // 移除之前的事件监听器，避免重复绑定
                el.removeEventListener("ended", this._handleVideoEnded);
                el.removeEventListener("loadedmetadata", this._handleVideoLoaded);
                el.removeEventListener("play", this._handleVideoPlay);
                el.removeEventListener("pause", this._handleVideoPause);
                
                // 绑定新的事件监听器
                el.addEventListener("ended", this._handleVideoEnded.bind(this));
                el.addEventListener("loadedmetadata", this._handleVideoLoaded.bind(this));
                el.addEventListener("play", this._handleVideoPlay.bind(this));
                el.addEventListener("pause", this._handleVideoPause.bind(this));
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
            },
            
            _handleVideoPause(e) {
                console.log(`%c============视频暂停=============`, "color:#FF9800");
                // 不立即设置_isPlaying为false，给监控系统时间处理
            },
        };

        try {
            window.app.run();

            // 防止鼠标移出页面后视频自动暂停
            const preventPause = (e) => {
                e.stopPropagation();
                e.preventDefault();
            };
            
            document.addEventListener("mouseleave", preventPause);
            window.addEventListener("mouseleave", preventPause);
            document.addEventListener("mouseout", preventPause);
            window.addEventListener("mouseout", preventPause);
            
            // 防止页面失去焦点时暂停
            window.addEventListener("blur", (e) => {
                console.log("%c页面失去焦点，保持播放状态", "color:#607D8B");
                const video = window.app._getVideoEl();
                if (video && video.paused && window.app._isPlaying) {
                    video.play().catch(err => console.log("自动恢复播放失败:", err));
                }
            });
            
        } catch (error) {
            console.error("%c脚本运行失败: ", "color:#F44336;font-weight:bold", error.message);
            console.log("请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。");
        }
    }
})();