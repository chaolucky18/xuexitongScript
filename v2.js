(function () {
    window.app = {
        configs: {
            playbackRate: 2, /// 倍数
            autoplay: true, /// 自动播放
        },
        _videoEl: null,
        _treeContainerEl: null,
        _cellData: {
            cells: 0, /// 总的大节点数量
            nCells: 0, /// 总的小节点数量
            currentCellIndex: 0, // 当前所在的大节点
            currentNCellIndex: 0, /// 当前所在的小节点
            currentVideoTitle: "", /// 当前选中的视频的标题
        },
        get cellData() {
            return this._cellData;
        },
        run() {
            this._getVideoEl();
            this._getTreeContainer();
            this._initCellData();
            this._videoEventHandle();
        },
        async play() {
            try {
                const el = this._getVideoEl();
                /// 设置倍数，并播放
                el.playbackRate = this.configs.playbackRate;
                await el.play();
            } catch (e) {
                console.error("视频播放失败", e)
            }
        },
        playCurrentIndex(nCell) {
            if (!nCell) {
                const el = this._getTreeContainer();
                const cells = el.find(".cells");
                const nCells = $(cells.get(this._cellData.currentCellIndex)).find(".ncells");
                nCell = nCells.get(this._cellData.currentNCellIndex)
            }
            const $nCell = $(nCell);
            const a = $nCell.find("a")[0];
            if (!a) {
                console.error("===========找不到节点A链接，播放下一个视频失败==============")
                return;
            }
            const span = $nCell.find("span")[0];
            $(a).click(); /// 切换菜单
            $(span).click(); //更换视频源
            setTimeout(() => {
                this._initCellData();
                if (this.configs.autoplay) {
                    this.play();
                }
            }, 1000)
        },
        /// 选择并播放下一个视频
        nextVideo() {
            const el = this._getTreeContainer();
            const cells = el.find(".cells");
            const nCells = $(cells.get(this._cellData.currentCellIndex)).find(".ncells");
            if (nCells.length > this._cellData.currentNCellIndex + 1) {
                /// 当前大节点里面的小节点未播放完成
                const nextNIndex = this._cellData.currentNCellIndex + 1;
                this.playCurrentIndex(nCells.get(nextNIndex));
            } else {
                const nextIndex = this._cellData.currentCellIndex + 1;
                if (nextIndex >= cells.length) {
                    /// 当前大节点已经播放完成（最后一个小节点）
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
        _initCellData() {
            const el = this._getTreeContainer();
            const cells = el.find(".cells");
            this._cellData.cells = cells.length;
            let nCellCounts = 0;
            cells.each((i, v) => {
                const nCells = $(v).find('.ncells');
                nCellCounts += nCells.length;
                nCells.each((j, e) => {
                    const _el = $(e);
                    if (_el.find(".currents").length > 0) {
                        /// 当前所在节点
                        this._cellData.currentCellIndex = i;
                        this._cellData.currentNCellIndex = j;
                        const a = _el.find('a')[0];
                        if (a) {
                            this._cellData.currentVideoTitle = $(a).attr('title');
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
                if (!frameObj) {
                    throw new Error("找不到视频播放区域iframe")
                }
                this._videoEl = frameObj.contents().eq(0).find("video#video_html5_api").get(0);
            }
            if (!this._videoEl) {
                throw new Error("找不到视频组件Video")
            }
            return this._videoEl;
        },
        /// 播放器事件处理
        _videoEventHandle() {
            if (this.configs.autoplay) {
                this.play();
            }
            const el = this._getVideoEl();
            el.addEventListener("ended", e => {
                const title = this._cellData.currentVideoTitle;
                console.warn(`============${title} 播放完成=============`)
                this.nextVideo();
            })
            el.addEventListener("loadedmetadata", e => {
                console.log(`============视频加载完成=============`)
                if (this.configs.autoplay) {
                    this.play();
                }
            })
            el.addEventListener("play", e => {
                const title = this._cellData.currentVideoTitle;
                console.info(`============${title} 开始播放=============`)
            })
            el.addEventListener("pause", e => {
                console.log("============视频已暂停=============")
            })
        },

    }
    window.app.run();
})();