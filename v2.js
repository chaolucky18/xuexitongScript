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
                playbackRate: 1, /// 倍数（默认 1 倍播放）
                autoplay: true, /// 自动播放
            },
            _videoEl: null,
            _treeContainerEl: null,
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
                this._getTreeContainer();
                this._initCellData();
                this._videoEl = null;
                this._getVideoEl();
                this.play();
            },

            /// 选择并播放下一小节视频（需要先调用run方法初始化数据）
            nextUnit() {
                const el = this._getTreeContainer();
                const cells = el.children("ul").children("li");
                const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                if (nCells.length > this._cellData.currentNCellIndex + 1) {
                    /// 当前大节点里面的小节点未播放完成
                    const nextNIndex = this._cellData.currentNCellIndex + 1;
                    this.playCurrentIndex(nCells.get(nextNIndex));
                } else {
                    const nextIndex = this._cellData.currentCellIndex + 1;
                    if (nextIndex >= cells.length) {
                        /// 当前课程已全部播放完成
                        console.log("=====================================")
                        console.log("==============本课程学习完成了==============")
                        console.log("=====================================")
                        return;
                    }
                    console.log("切换下一个大节点", nextIndex)
                    /// 切换下一个大节点
                    this._cellData.currentCellIndex = nextIndex;
                    this._cellData.currentNCellIndex = 0;
                    this.playCurrentIndex();
                }

            },
            _tryTimes: 0,
            /// 播放当前视频（需要先调用run方法初始化数据）
            async play() {
                try {
                    const el = this._getVideoEl();
                    if (el == null) {
                        if (document.getElementsByClassName("prev_title")[0].title !== "章节测验") {
                            throw new Error("播放失败：视频元素为空");
                        }
                        // 没找到视频元素
                        console.log("===========跳过章节测验，2秒后继续播放==============")
                        $("#prevNextFocusNext").click()
                        setTimeout(() => {
                            this.play();
                        }, 2000);
                        return;
                    }
                    /// 挂钩子以便循环播放
                    this._videoEventHandle();
                    /// 设置倍数，并播放
                    el.playbackRate = this.configs.playbackRate;
                    await el.play();
                    this._tryTimes = 0;
                } catch (e) {
                    if (this._tryTimes > 5) {
                        console.error("视频播放失败", e)
                        return;
                    }
                    setTimeout(() => {
                        this._tryTimes++;
                        this.play();
                    }, 1000);
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
                    console.error("===========找不到可点击的课程节点，播放下一个视频失败==============")
                    return;
                }
                $(clickableSpan).click(); /// 切换视频
                this._videoEl = null;

                /// 通过循环尝试的方式进行播放，以应对内容加载延迟
                setTimeout(() => {
                    this._initCellData();
                    if (this.configs.autoplay) {
                        this.play();
                    }
                }, 1500) // 延迟可以适当调整，确保新视频有足够时间加载
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
                if (!this._videoEl) {
                    const frameObj = $("iframe").eq(0).contents().find("iframe.ans-insertvideo-online");
                    if (frameObj.length === 0) {
                        return null;
                    }
                    this._videoEl = frameObj.contents().eq(0).find("video#video_html5_api").get(0);
                }
                if (!this._videoEl) {
                    throw new Error("视频组件Video未加载完成")
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
                el.addEventListener("ended", e => {
                    const title = this._cellData.currentVideoTitle;
                    console.warn(`============'${title}' 播放完成=============`)
                    this.nextUnit();
                })
                el.addEventListener("loadedmetadata", e => {
                    console.log(`============视频加载完成=============`)
                    if (this.configs.autoplay) {
                        this.play();
                    }
                })
                el.addEventListener("play", e => {
                    const title = this._cellData.currentVideoTitle;
                    console.info(`============'${title}' 开始播放=============`)
                })
                el.addEventListener("pause", e => {
                    console.log("============视频已暂停=============")
                })
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
