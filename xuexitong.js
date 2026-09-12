/**
 * 学习通
 */

// 当前小节
// 确保页面中存在至少一个激活的小节元素
const activeElement = $(".posCatalog_select.posCatalog_active");

if (activeElement.length) {
    // 先获取所有章节标题元素的父级（假设章节标题和小节同级）
    const chapterTitles = $(".posCatalog_select:has(.posCatalog_title)");

    // 获取章节标题之外的所有小节元素
    const substantiveSiblings = $(".posCatalog_select").not(chapterTitles);

    // 在实质性小节中找到当前活跃小节的索引
    let unitCount = substantiveSiblings.index(activeElement);

    // jQuery 的 .index() 方法返回值是从0开始的，如果需要从1开始计数，可以加1
    unitCount += 1;

    // 若找不到有效的小节同级元素，则设定默认值
    if (!substantiveSiblings.length || unitCount === -1) {
        console.warn("未找到有效的.posCatalog_select同级元素！");
        unitCount = -1;
    }

    // 将结果赋值到全局作用域
    window.unitCount = unitCount;
} else {
    console.error("未找到激活的小节元素！");
}
// 获取小节数量
window.unit = $(".posCatalog_level span em").length;


// F8（#14 #15 #16 #17 #18）：V1 版本的最小空值保护 + 多选择器兜底。
// 旧写法 document.querySelector('li[title="视频"]').click() 在页面结构变化或目录/步骤标签尚未渲染完成时
// 会抛 "Cannot read properties of null (reading 'click')"（issue #16 #17 #18 的堆栈正是 main() 第 39 行），
// 并且会中断整个 V1 脚本。这里只做最小加固，不改动 V1 的其他逻辑（倍速、iframe 取视频等）。
function clickFirstAvailable(selectors) {
    for (const selector of selectors) {
        let el = null;
        try {
            el = document.querySelector(selector);
        } catch (e) {
            el = null;
        }
        if (el && typeof el.click === "function") {
            el.click();
            return true;
        }
    }
    return false;
}

function main() {
    // 尝试点击视频按钮（F8：多选择器兜底 + 空值保护；两种写法来自 issue #18 的评论）
    if (!clickFirstAvailable(['li[title="视频"]', 'button[title="播放视频"]'])) {
        console.warn('%c未找到「视频」步骤入口（li[title="视频"] / button[title="播放视频"]），已跳过本次点击，脚本继续执行。', 'color:#FF9800');
        console.log('处理方法：1) 确认已进入课程播放页，且左侧目录与顶部步骤标签已经渲染完成；2) 也可以手动点开「视频」步骤后再运行脚本；3) V1 已不再维护，建议改用 V3.4 的 v3_optimized.js。');
    }
    // 等待几秒后执行视频存在性检查和其他操作
    setTimeout(() => {
        const frameObj = $("iframe").eq(0).contents().find("iframe.ans-insertvideo-online");
        const videoNum = frameObj.length;
        if (videoNum > 0) {
            console.log("%c当前小节中包含 " + videoNum + " 个视频", "color:#FF7A38;font-size:18px");
            var v_done = 0;
            // 添加事件处理程序
            addEventListener("playdone", () => {
                v_done++;
                if (v_done > videoNum) {
                    // 下一节
                } else if (v_done < videoNum) {
                    watchVideo(frameObj, v_done)
                } else {
                    console.log("%c本小节视频播放完毕，等待跳转至下一小节...", "font-size:18px");
                    nextUnit();
                }
            });
            // 播放
            watchVideo(frameObj, v_done);
        } else {
            if (window.unitCount < window.unit) {
                console.log("%c当前小节中无视频，6秒后将跳转至下一节", "font-size:18px");
                nextUnit();
            } else {
                console.log("%c好了好了，毕业了", "color:red;font-size:18px");
            }
        }
    }, 3000);// 3000毫秒（即3秒）后执行
}

function watchVideo(frameObj, v_done) {
    // 添加播放事件
    var playDoneEvent = new Event("playdone");
    // 获取播放对象
    var v = undefined;
    v = frameObj.contents().eq(v_done).find("video#video_html5_api").get(0);
    window.a = v;
    // 设置倍速
    try {
        v.playbackRate = 2;
    } catch (e) {
        console.error("倍速设置失败！此节可能有需要回复内容，不影响，跳至下一节。错误信息：" + e);
        nextUnit();
        return;
    }
    // 播放
    v.play();
    console.log("%c正在 " + v.playbackRate + " 倍速播放第 " + (v_done + 1) + " 个视频", "font-size:18px");
    // 循环获取播放进度
    window.inter = setInterval(() => {
        v = window.a;
        if (v.currentTime >= v.duration) {
            dispatchEvent(playDoneEvent);
            clearInterval(window.inter);
        }
        if (v.paused) {
            v.play();
        }
    }, 1000);
}

function nextUnit() {
    console.log("%c即将进入下一节...", "color:red;font-size:18px");
    setTimeout(() => {
        $(document).scrollTop($(document).height() - $(window).height());
        $("#prevNextFocusNext").click()
        $(".nextChapter").eq(0).click()
        $("#prevNextFocusNext").click()
        $(".nextChapter").eq(0).click()
        console.log("%c行了别看了，我知道你学会了，下一节", "color:red;font-size:18px");// (已经跳转" +(++window.unitCount)+"次)");
        if (window.unitCount++ < window.unit) {
            setTimeout(() => main(), 10000)
        }
    }, 6000);
}

console.log("%c 欢迎使用本脚本，此科目有%c %d %c个小节，当前为 %c第%d小节 %c-chao", "color:#6dbcff", "color:red", window.unit, "color:#6dbcff", "color:red", window.unitCount, "font-size:8px");
main();
