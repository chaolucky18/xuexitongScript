(function () {
    // 检查页面是否已加载jQuery，如果没有则加载
    if (typeof window.jQuery === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
        script.type = 'text/javascript';
        script.onload = function() {
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
                playbackRate: 1, // 播放速度设置为1倍速
                autoplay: true, // 自动播放
            },
            _videoEl: null, // 当前视频元素
            _treeContainerEl: null, // 课程章节容器
            _tryTimes: 0, // 播放尝试次数
            _cellData: {
                cells: 0, // 总章节数
                nCells: 0, // 总小节数
                currentCellIndex: 0, // 当前章节索引
                currentNCellIndex: 0, // 当前小节索引
                currentVideoTitle: "", // 当前视频标题
                currentVideoIndex: 0, // 当前视频索引
                totalVideos: 0, // 总视频数
            },
            get cellData() {
                return this._cellData;
            },
            run() {
                this._getTreeContainer();
                this._initCellData();
                this._videoEl = null;
                this._countVideos();
                this._waitForVideoEl();
            },
            async _waitForVideoEl() {
                let retries = 10;
                while (retries > 0) {
                    try {
                        const videoEl = this._getVideoEl();
                        if (videoEl) {
                            console.log("找到视频元素，准备播放");
                            console.log("视频状态:", {
                                当前视频: this._cellData.currentVideoIndex + 1,
                                总视频: this._cellData.totalVideos,
                                readyState: videoEl.readyState,
                                src: videoEl.src
                            });
                            if (!videoEl.src || videoEl.src === '') {
                                console.log("视频元素没有有效的src,跳过");
                                this.nextUnit();
                                return;
                            }
                            if (this.configs.autoplay) {
                                await this._waitForVideoReady(videoEl);
                                console.log("视频元数据已加载，开始播放");
                                await this.play();
                            }
                            return;
                        }
                    } catch (e) {
                        console.log("等待视频元素加载...", e.message);
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    retries--;
                }
                console.log("当前没有视频或超时，跳转下一节");
                this.nextUnit();
            },
            async _waitForVideoReady(videoEl) {
                return new Promise((resolve) => {
                    if (videoEl.readyState >= 1) {
                        console.log("视频已准备就绪 (readyState >= 1)");
                        resolve();
                    } else {
                        console.log("等待视频元数据加载...");
                        const onReady = () => {
                            videoEl.removeEventListener('loadedmetadata', onReady);
                            console.log("视频元数据加载完成");
                            resolve();
                        };
                        videoEl.addEventListener('loadedmetadata', onReady);
                        setTimeout(() => {
                            videoEl.removeEventListener('loadedmetadata', onReady);
                            console.log("等待超时，强制继续");
                            resolve();
                        }, 5000);
                    }
                });
            },
            /// 选择并播放下一小节视频
            nextUnit() {
                const el = this._getTreeContainer();
                const cells = el.children("ul").children("li");
                const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                console.log("检查下一个内容...");
                console.log("当前状态:", {
                    当前视频: this._cellData.currentVideoIndex + 1,
                    总视频: this._cellData.totalVideos,
                    当前小节: this._cellData.currentNCellIndex + 1,
                    总小节数: nCells.length
                });
                // 检查当前小节是否还有更多视频
                if (this._cellData.totalVideos > this._cellData.currentVideoIndex + 1) {
                    this._cellData.currentVideoIndex++;
                    console.log(`播放下一个视频: ${this._cellData.currentVideoIndex + 1}/${this._cellData.totalVideos}`);
                    this._videoEl = null;
                    this._tryTimes = 0;
                    setTimeout(() => {
                        this._waitForVideoEl();
                    }, 1000);
                    return;
                }
                // 当前小节所有视频播放完,切换到下一小节
                if (nCells.length > this._cellData.currentNCellIndex + 1) {
                    const nextNIndex = this._cellData.currentNCellIndex + 1;
                    this._cellData.currentVideoIndex = 0;
                    console.log(`切换到下一小节: ${nextNIndex + 1}/${nCells.length}`);
                    this.playCurrentIndex(nCells.get(nextNIndex));
                } else {
                    const nextIndex = this._cellData.currentCellIndex + 1;
                    if (nextIndex >= cells.length) {
                        console.log("==============本课程学习完成了==============")
                        return;
                    }
                    console.log(`切换到下一章: ${nextIndex + 1}/${cells.length}`)
                    this._cellData.currentCellIndex = nextIndex;
                    this._cellData.currentNCellIndex = 0;
                    this._cellData.currentVideoIndex = 0;
                    this.playCurrentIndex();
                }
            },
            // 统计当前小节的视频数量
            _countVideos() {
                try {
                    const frameObj = $("iframe").eq(0).contents().find("iframe.ans-insertvideo-online");
                    this._cellData.totalVideos = frameObj.length;
                    console.log("当前小节包含", this._cellData.totalVideos, "个视频");
                } catch (e) {
                    console.log("统计视频数量失败:", e.message);
                    this._cellData.totalVideos = 0;
                }
            },
            /// 播放当前视频（需要先调用run方法初始化数据）
            async play() {
                this._tryTimes = this._tryTimes || 0;
                try {
                    const el = this._getVideoEl();
                    if (!el) {
                        console.log("当前小节没有视频，跳转下一节");
                        this.nextUnit();
                        return;
                    }
                    console.log("尝试播放视频 (第 " + (this._tryTimes + 1) + " 次)");
                    if (el.readyState < 1) {
                        console.log("视频未准备好，等待中...");
                        await this._waitForVideoReady(el);
                    }
                    el.playbackRate = this.configs.playbackRate;
                    console.log("设置播放速度:", this.configs.playbackRate);
                    const playPromise = el.play();
                    if (playPromise !== undefined) {
                        await playPromise;
                        console.log("视频开始播放");
                        this._tryTimes = 0;
                    }
                } catch (e) {
                    console.error("播放失败:", e.name, e.message);
                    if (e.name === 'NotAllowedError') {
                        console.log("需要用户交互才能播放，尝试点击播放按钮");
                        this._clickPlayButton();
                    }
                    if (this._tryTimes >= 5) {
                        console.error("多次播放失败，跳转下一节");
                        this._tryTimes = 0;
                        this.nextUnit();
                        return;
                    }
                    this._tryTimes++;
                    setTimeout(() => {
                        this.play();
                    }, 1000);
                }
            },
            _clickPlayButton() {
                try {
                    const frameObj = $("iframe").eq(0).contents().find("iframe.ans-insertvideo-online");
                    if (frameObj.length > 0) {
                        const playButton = frameObj.contents().find(".vjs-big-play-button");
                        if (playButton.length > 0) {
                            console.log("点击播放按钮");
                            playButton.click();
                        }
                    }
                } catch (e) {
                    console.log("无法点击播放按钮:", e.message);
                }
            },
            /// 播放当前指向的小节视频（需要先调用run方法初始化数据）
            playCurrentIndex(nCell) {
                if (!nCell) {
                    const el = this._getTreeContainer();
                    const cells = el.children("ul").children("li");
                    const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                    nCell = nCells.get(this._cellData.currentNCellIndex)
                }
                const $nCell = $(nCell);
                const clickableSpan = $nCell.find(".posCatalog_name")[0];
                if (!clickableSpan) {
                    console.error("找不到可点击的课程节点,播放下一个视频失败")
                    this.nextUnit();
                    return;
                }
                $(clickableSpan).click();
                this._videoEl = null;
                this._cellData.currentVideoIndex = 0;
                this._tryTimes = 0;
                setTimeout(() => {
                    this._initCellData();
                    this._countVideos();
                    this._waitForVideoEl();
                }, 3000);
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
                            // 新版HTML中，标题在 .posCatalog_name 的 title 属性里
                            const titleSpan = _el.find('.posCatalog_name')[0];
                            if (titleSpan) {
                                this._cellData.currentVideoTitle = $(titleSpan).attr('title');
                            }
                        }
                    })
                });
                this._cellData.nCells = nCellCounts;
            },
            _getTreeContainer() {
                if (!this._treeContainerEl) {
                    const el = $('#coursetree');
                    if (el.length <= 0) {
                        throw new Error("找不到视频列表")
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
                const frameObj = $("iframe").eq(0).contents().find("iframe.ans-insertvideo-online");
                if (frameObj.length === 0) {
                    console.log("未找到视频iframe");
                    return null;
                }
                console.log("找到", frameObj.length, "个视频iframe");
                if (this._videoEl) {
                    const oldEl = this._videoEl;
                    try {
                        oldEl.removeEventListener("ended", this._onVideoEnded);
                        oldEl.removeEventListener("loadedmetadata", this._onVideoLoaded);
                        oldEl.removeEventListener("play", this._onVideoPlay);
                        oldEl.removeEventListener("pause", this._onVideoPause);
                    } catch (e) {
                        // 忽略
                    }
                }
                const currentIframeIndex = this._cellData.currentVideoIndex < frameObj.length ? this._cellData.currentVideoIndex : 0;
                console.log("尝试获取第", currentIframeIndex + 1, "个iframe的视频");
                this._videoEl = frameObj.contents().eq(currentIframeIndex).find("video#video_html5_api").get(0);
                if (!this._videoEl) {
                    console.log("在iframe中未找到video元素");
                    return null;
                }
                this._videoEventHandle();
                return this._videoEl;
            },
            /// 播放器事件处理
            _videoEventHandle() {
                const el = this._videoEl;
                if (!el) {
                    console.log("videoEl未加载");
                    return;
                }
                this._onVideoEnded = (e) => {
                    const title = this._cellData.currentVideoTitle;
                    console.warn(`============'${title}' 播放完成=============`)
                    this.nextUnit();
                };
                this._onVideoLoaded = (e) => {
                    console.log(`============视频加载完成=============`)
                };
                this._onVideoPlay = (e) => {
                    const title = this._cellData.currentVideoTitle;
                    console.info(`============'${title}' 开始播放=============`)
                };
                this._onVideoPause = (e) => {
                    console.log("============视频已暂停=============")
                };
                el.addEventListener("ended", this._onVideoEnded);
                el.addEventListener("loadedmetadata", this._onVideoLoaded);
                el.addEventListener("play", this._onVideoPlay);
                el.addEventListener("pause", this._onVideoPause);
            },
        }
        try {
            window.app.run();
            // 防止鼠标移出页面后视频自动暂停
            document.onmouseleave = e => {
                e.stopPropagation();
                e.preventDefault();
            };
            window.onmouseleave = e => {
                e.stopPropagation();
                e.preventDefault();
            };
            document.onmouseout = e => {
                e.stopPropagation();
                e.preventDefault();
            };
            window.onmouseout = e => {
                e.stopPropagation();
                e.preventDefault();
            };
        } catch (error) {
            console.error("脚本运行失败: ", error.message);
            console.log("请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。");
        }
    }
})();
