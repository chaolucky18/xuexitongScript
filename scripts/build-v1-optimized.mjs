import { readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const v1 = readFileSync(resolve(root, "v1_autoAnswer.js"), "utf8").replace(/^\uFEFF/, "");
const v3 = readFileSync(resolve(root, "v3_optimized.js"), "utf8").replace(/^\uFEFF/, "");

const start = v1.indexOf("(async function () {");
if (start < 0) throw new Error("v1 start not found");
const braceStart = v1.indexOf("{", start);
let depth = 0;
let end = -1;
for (let p = braceStart; p < v1.length; p++) {
    const ch = v1[p];
    if (ch === "{") depth++;
    else if (ch === "}") {
        depth--;
        if (depth === 0) {
            end = p;
            break;
        }
    }
}
if (end < 0) throw new Error("v1 end not found");
let body = v1.slice(braceStart + 1, end);

body = body.replace(/^\s*const APP_KEY = "__xuexitongAutoAnswer";\s*/m, "");
body = body.replace(/const configs = \{[\s\S]*?\};\s*/m, "");
body = body.replace(
    /console\.log\("%c=== 学习通自动答题脚本启动 ==="[\s\S]*?apiKey: configs\.apiKey \? "已填写" : "未填写",\s*\}\);\s*/m,
    ""
);

const marker = "window.dumpQuizAnswers = dumpQuizAnswers;";
const mi = body.lastIndexOf(marker);
if (mi < 0) throw new Error("dump marker not found");
const before = body.slice(0, mi).trimEnd();
let after = body.slice(mi);

after = after.replace(
    /window\.dumpQuizAnswers = dumpQuizAnswers;\s*window\.clearQuizAnswers = clearQuizAnswers;\s*window\[APP_KEY\] = \{[\s\S]*?\};\s*try \{/,
    `window.dumpQuizAnswers = dumpQuizAnswers;
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
            try {`
);

after = after.replace(
    /\}\s*catch \(globalErr\) \{([\s\S]*)\}\s*$/,
    `} catch (globalErr) {$1}
        }

        return {
            run,
            configs,
            dumpQuizAnswers,
            clearQuizAnswers,
            redoWithStoredAnswers: window[APP_KEY].redoWithStoredAnswers,
        };
`
);

const quizFactory = `    function createQuizAutoAnswer(configs) {
        const APP_KEY = "__xuexitongAutoAnswer";
${before}

${after}
    }
`;

let out = v3;
out = out.replace(
    "const APP_KEY = '__xuexitongPlayerV3';",
    "const APP_KEY = '__xuexitongPlayerV1Opt';\n    const BOOT_TIMER_KEY_LEGACY = '__xuexitongPlayerV3BootTimer';"
);

out = out.replace(
    `    const previousApp = window[APP_KEY];
    if (previousApp && typeof previousApp.destroy === 'function') {
        previousApp.destroy();
    }
    if (window[BOOT_TIMER_KEY]) {
        clearInterval(window[BOOT_TIMER_KEY]);
        window[BOOT_TIMER_KEY] = null;
    }`,
    `    const previousApp = window[APP_KEY] || window.__xuexitongPlayerV3;
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
    }`
);

out = out.replace(
    `            configs: {
                playbackRate: 1.5,
                autoplay: true,
                retryInterval: 2000,
                maxRetries: 10,
                videoCheckInterval: 1000,
                guardNoProgressMs: 7000,
                guardResumeCooldownMs: 1500,
                autoAdvanceNoVideo: false,
            },`,
    `            configs: {
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
            },`
);

out = out.replace(
    `            _nextUnitPending: false,
            _chapterAdvanceTimes: 0,`,
    `            _nextUnitPending: false,
            _chapterAdvanceTimes: 0,
            _autoAnswerRunning: false,
            _quizAutoAnswer: null,
            _autoAnswerDoneFor: null,`
);

out = out.replace(
    `                console.log("%c=== 学习通自动刷课脚本 V3 优化版启动 ===", "color:#4CAF50;font-size:16px;font-weight:bold");`,
    `                console.log("%c=== 学习通刷课+自动答题 V1 Optimized 启动 ===", "color:#4CAF50;font-size:16px;font-weight:bold");
                console.log("%c测验策略:", "color:#607D8B", {
                    skipChapterTest: this.configs.skipChapterTest,
                    autoAnswer: this.configs.autoAnswer,
                });`
);

const oldChapterBranch = `                        if (this._isChapterTest()) {
                            this._advanceChapterTest();
                            return;
                        }`;

const newChapterBranch = `                        if (this._isChapterTest()) {
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
                        }`;

if (!out.includes(oldChapterBranch)) throw new Error("chapter branch not found");
out = out.replace(oldChapterBranch, newChapterBranch);

out = out.replace(
    `            _isChapterTest() {
                return this._currentStepTitle() === '章节测验';
            },`,
    `            _quizDocScore(doc) {
                if (!doc) return 0;
                let href = '';
                try { href = doc.defaultView?.location?.href || ''; } catch (e) {}
                return (doc.querySelector('.correctAnswer') ? 8 : 0)
                    + (doc.querySelector('.singleQuesId') ? 4 : 0)
                    + (doc.querySelector('.TiMu') ? 2 : 0)
                    + ([...doc.querySelectorAll("input[type='hidden']")].some((el) => /^answer\\d+$/.test(el.id)) ? 1 : 0)
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
            },`
);

const oldAdvanceMethod = `            _advanceChapterTest() {
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
                setTimeout(() => this.play(), 2000);
            },`;

const newAdvanceMethod = `            _advanceChapterTest() {
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
            },`;

const newMethods = `            _chapterKey() {
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
${newAdvanceMethod}`;

if (!out.includes(oldAdvanceMethod)) throw new Error("advance method not found");
out = out.replace(oldAdvanceMethod, newMethods);

const insertAt = out.indexOf("        window.app = app;");
if (insertAt < 0) throw new Error("window.app not found");
out = out.slice(0, insertAt) + quizFactory + "\n" + out.slice(insertAt);

out = out.replace(
    "$(document).off('.xuexitongPlayerV3');",
    "$(document).off('.xuexitongPlayerV3');\n                this._autoAnswerRunning = false;"
);

const header = `// ==============================================
// 学习通刷课 + 自动答题（v1_autoAnswer_optimized）
// 基于 v3_optimized 播放流程 + v1_autoAnswer 答题逻辑
// 章节测验优先级：skipChapterTest > autoAnswer > 停止
// ==============================================
`;

const target = resolve(root, "v1_autoAnswer_optimized.js");
writeFileSync(target, header + out, "utf8");
console.log("written", target, "bytes", statSync(target).size);
