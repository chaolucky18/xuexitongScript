/**
 * 学习通
 */
/**
 * 仍然存在问题：
 * 1. 学习通可能要求必须完成每一节的答题才能进入下一节，这种情况下脚本会卡住，需要手动完成答题
 * 2. 视频播放完毕后可能会出现悬浮答题界面，但可以通过等待或点击下一节按钮跳过
 */

// 新版学习通元素Selectors，便于后续修改
const videoButtonSelector = "#video button";
const courseTreeNodeSelector = "#coursetree";
const courseLayerSelector = ".posCatalog_select";
const courseTitleSelector = ".posCatalog_name";
const courseSectionSelector = ".posCatalog_sbar";
const courseCompletedSelector = "span.icon_Completed.prevTips";
/**
 *
 * @returns {Array<{section: string, course: string, element: HTMLElement}>}
 * @description 获取所有课程数据
 */
function GetAllCourses() {
	let courseData = [];

	const courseTree = document.querySelector(courseTreeNodeSelector);

	// 所有层级课程元素都含有 .posCatalog_select 类名
	// 但是章节名称元素还有一个额外的 .firstLayer 类名
	const courses = courseTree.querySelectorAll(
		courseLayerSelector + ":not(.firstLayer)"
	);

	courses.forEach((course) => {
		const courseName = course
			.querySelector(courseTitleSelector)
			?.getAttribute("title");
		const sectionName = course.querySelector(
			courseSectionSelector
		)?.textContent;

		if (courseName && sectionName) {
			courseData.push({
				section: sectionName.trim(),
				course: courseName.trim(),
				element: course,
			});
		} else {
			console.warn("未找到课程名称或章节名称！这可能会是一个错误！", course);
		}
	});

	return courseData;
}

const courseDatas = GetAllCourses();
const courseCount = courseDatas.length;
console.log("课程数量：", courseCount);
let unitCount = 0;
try {
	// section是章节，例如"1.1.2"，取小数点前的数字即为章节数
	unitCount = courseDatas[courseCount - 1].section?.split(".")[0];
	console.log("章节数量：", unitCount);
} catch (error) {
	console.error("获取章节数量失败！(并不影响程序运作)", error);
}
// 当前小节
// 页面中激活的小节元素
const completedCourses = document.querySelectorAll(courseCompletedSelector);
if (completedCourses.length > 0) {
	// 选取当前小节
	const currentCourseData = courseDatas[completedCourses.length];
	//console.log("当前小节：", currentCourseData);
	let currentCourse = currentCourseData?.element;
	if (currentCourse) {
		// 跳转到当前小节
		Array.from(currentCourse.querySelectorAll("*")).forEach(
			(e) => e.hasAttribute("onclick") && e.click()
		)
			? [0].click()
			: null;
	}
	window.currentCourseCount = courseDatas.indexOf(currentCourseData);
}
// 获取小节数量
window.unit = $(".posCatalog_level span em").length;

function main() {
	// 尝试点击视频按钮
	document.querySelector('li[title="视频"]').click();
	// 等待几秒后执行视频存在性检查和其他操作
	setTimeout(() => {
		const frameObj = $("iframe")
			.eq(0)
			.contents()
			.find("iframe.ans-insertvideo-online");
		const videoNum = frameObj.length;
		if (videoNum > 0) {
			console.log(
				"%c当前小节中包含 " + videoNum + " 个视频",
				"color:#FF7A38;font-size:18px"
			);
			var v_done = 0;
			// 添加事件处理程序
			addEventListener("playdone", () => {
				v_done++;
				if (v_done > videoNum) {
					// 下一节
				} else if (v_done < videoNum) {
					watchVideo(frameObj, v_done);
				} else {
					console.log(
						"%c本小节视频播放完毕，等待跳转至下一小节...",
						"font-size:18px"
					);
					nextUnit();
				}
			});
			// 播放
			watchVideo(frameObj, v_done);
		} else {
			if (window.unitCount < window.unit) {
				console.log(
					"%c当前小节中无视频，6秒后将跳转至下一节",
					"font-size:18px"
				);
				nextUnit();
			} else {
				console.log("%c好了好了，毕业了", "color:red;font-size:18px");
			}
		}
	}, 3000); // 3000毫秒（即3秒）后执行
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
		console.error(
			"倍速设置失败！此节可能有需要回复内容，不影响，跳至下一节。错误信息：" + e
		);
		nextUnit();
		return;
	}
	// 播放
	v.play();
	console.log(
		"%c正在 " + v.playbackRate + " 倍速播放第 " + (v_done + 1) + " 个视频",
		"font-size:18px"
	);
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
		$("#prevNextFocusNext").click();
		$(".nextChapter").eq(0).click();
		$("#prevNextFocusNext").click();
		$(".nextChapter").eq(0).click();
		console.log(
			"%c行了别看了，我知道你学会了，下一节",
			"color:red;font-size:18px"
		); // (已经跳转" +(++window.unitCount)+"次)");
		if (window.unitCount++ < window.unit) {
			setTimeout(() => main(), 10000);
		}
	}, 6000);
}

console.log(
	"%c 欢迎使用本脚本，此科目有%c %d %c个小节，当前为 %c第%d小节 %c-chao",
	"color:#6dbcff",
	"color:red",
	window.unit,
	"color:#6dbcff",
	"color:red",
	window.unitCount,
	"font-size:8px"
);
main();
