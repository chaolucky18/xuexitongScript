import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const root = import.meta.dirname;
const out = process.env.XUEXITONG_OUTPUT_DIR
    ? resolve(process.env.XUEXITONG_OUTPUT_DIR)
    : resolve(root, 'dist');
mkdirSync(out, { recursive: true });
const tokenPath = process.env.XUEXITONG_TOKEN_PATH
    ? resolve(process.env.XUEXITONG_TOKEN_PATH)
    : resolve(out, '.service-token');
if (!existsSync(tokenPath)) writeFileSync(tokenPath, randomBytes(24).toString('hex'), { mode: 0o600 });
chmodSync(tokenPath, 0o600);
const token = readFileSync(tokenPath, 'utf8').trim();
let player = readFileSync(resolve(root, '../v3_optimized.user.js'), 'utf8');
function replaceOnce(source, from, to) {
    if (source.split(from).length !== 2) throw new Error(`构建入口不唯一：${from.slice(0, 50)}`);
    return source.replace(from, to);
}
player = replaceOnce(player, '                playbackRate: 1.5,', '                playbackRate: 1,');
player = replaceOnce(player, '                this._chapterAdvanceTimes = 0;', '                this._chapterAdvanceTimes = 0;\n                this._tryTimes = 0;');
player = replaceOnce(player, '            playCurrentIndex(nCell) {', '            playCurrentIndex(nCell) {\n                this._tryTimes = 0;');
player = replaceOnce(player, '                        this._isPlaying = false;\n                        this._clearCheckInterval();\n                        if (this.configs.autoAdvanceNoVideo)', `                        if (this._tryTimes < this.configs.maxRetries) {
                            throw new Error('等待视频组件或学习步骤加载');
                        }
                        this._isPlaying = false;
                        this._clearCheckInterval();
                        if (this.configs.autoAdvanceNoVideo)`);
player = replaceOnce(player, '// @version      3.3.0', '// @version      3.4.8');
player = replaceOnce(player, '// @description  自动播放、自动切换下一节，并在页面结构异常时安全停止', '// @description  自动播放与换节，DeepSeek 识题填答，可切换自动提交');
player = replaceOnce(player, '// @grant        none', '// @grant        none\n// @noframes');
player = replaceOnce(player, '            run() {', `            run() {
                this._scriptRunning = true;
                window.__xuexitongDeepSeekReview?.start();
                if (!this._pageGuards) this._bindPageGuards();`);
player = replaceOnce(player, '            destroy() {', `            destroy() {
                this._scriptRunning = false;
                window.__xuexitongDeepSeekReview?.stop();
                this._getVideoEl()?.pause();`);
for (const method of ['nextUnit()', 'playCurrentIndex(nCell)', '_advanceLearningStep()']) {
    player = replaceOnce(player, `            ${method} {`, `            ${method} {\n                if (!this._scriptRunning) return;`);
}
player = replaceOnce(player, '            _handlePlayError(error) {', `            _handlePlayError(error) {
                if (!this._scriptRunning || window.__xuexitongDeepSeekReview?.waitingForReview || window.__xuexitongDeepSeekReview?.isQuizPage?.()) return;
                if (window.__xuexitongDeepSeekReview?.recoverVideoLine?.()) return;`);
player = replaceOnce(player, '            _checkVideoStatus() {', `            _checkVideoStatus() {
                if (window.__xuexitongDeepSeekReview?.recoverVideoLine?.()) return;`);
player = replaceOnce(player, '            nextUnit() {\n                if (!this._scriptRunning) return;', `            nextUnit() {
                if (!this._scriptRunning) return;
                if (window.__xuexitongDeepSeekReview?.beforeNext?.()) return;
                this._initCellData();`);
player = replaceOnce(player, `                const prevTitle = document.getElementsByClassName("prev_title")[0];
                const currentStepTitle = prevTitle ? (prevTitle.title || prevTitle.textContent || "").trim() : "";`,
    '                const currentStepTitle = this._currentStepTitle();');
player = replaceOnce(player, '            _currentStepTitle() {', `            _currentStepTitle() {
                const active = window.__xuexitongDeepSeekReview?.stepTitle?.();
                if (active) return active;`);
player = replaceOnce(player, '            app._bindPageGuards();', '            // Page guards are bound by run() and removed by destroy().');
player = replaceOnce(player, '            async play() {\n                try {', `            async play() {
                if (!this._scriptRunning) return;
                if (window.__xuexitongDeepSeekReview?.isQuizPage?.()) {
                    this._isPlaying = false;
                    this._clearCheckInterval();
                    window.__xuexitongDeepSeekReview.scan();
                    return;
                }
                if (window.__xuexitongDeepSeekReview?.waitingForReview) {
                    this._isPlaying = false;
                    this._clearCheckInterval();
                    return;
                }
                try {`);
player = replaceOnce(player, '                        await el.play();', `                        await el.play();
                        if (!this._scriptRunning || window.__xuexitongDeepSeekReview?.waitingForReview || window.__xuexitongDeepSeekReview?.isQuizPage?.()) {
                            el.pause(); this._isPlaying = false; this._clearCheckInterval(); return;
                        }`);
player = replaceOnce(player, '                video.play().catch((e) => {', `                video.play().catch((e) => {
                    if (!this._scriptRunning || window.__xuexitongDeepSeekReview?.waitingForReview || window.__xuexitongDeepSeekReview?.isQuizPage?.()) return;`);
player = replaceOnce(player, '                    video.play().then(() => {', `                    video.play().then(() => {
                        if (!this._scriptRunning || window.__xuexitongDeepSeekReview?.waitingForReview || window.__xuexitongDeepSeekReview?.isQuizPage?.()) { video.pause(); return; }`);
player = replaceOnce(player, '                    }).catch(e => {', `                    }).catch(e => {
                        if (!this._scriptRunning || window.__xuexitongDeepSeekReview?.waitingForReview || window.__xuexitongDeepSeekReview?.isQuizPage?.()) return;`);
player = replaceOnce(player, '                setTimeout(() => {\n                    this._initCellData();', '                setTimeout(() => {\n                    if (!this._scriptRunning) return;\n                    this._initCellData();');
player = replaceOnce(player, '                            console.log("%c==============本课程学习完成了==============",', '                            this.destroy();\n                            console.log("%c==============本课程学习完成了==============",');
player = replaceOnce(player, "                            console.warn('%c当前小节未发现视频或可识别的学习步骤，已安全停止。", "                            this.destroy();\n                            console.warn('%c当前小节未发现视频或可识别的学习步骤，已安全停止。");
player = replaceOnce(player, '            _advanceChapterTest() {', `            _advanceChapterTest() {
                if (window.__xuexitongDeepSeekReview) {
                    window.__xuexitongDeepSeekReview.scan();
                    return;
                }`);
player = replaceOnce(player, "                        for (const frame of $('iframe').toArray()) {", "                        for (const frame of $('iframe').toArray()) {\n                            try { const owner = new URL(frame.src, location.href).searchParams.get('knowledgeid'); if (owner && owner !== new URL(location.href).searchParams.get('chapterId')) continue; } catch (_) {}");
player = replaceOnce(player, '            _getVideoEl() {', `            _getVideoEl() {
                const review = window.__xuexitongDeepSeekReview;
                if (review?.findVideo) {
                    const current = review.findVideo();
                    if (current !== this._videoEl) {
                        this._detachVideoEvents();
                        this._videoEl = current;
                    }
                    if (current) this._videoEventHandle();
                    return current;
                }`);
const core = readFileSync(resolve(root, 'quiz-core.cjs'), 'utf8').replace('module.exports = createQuizCore();', '');
const submission = readFileSync(resolve(root, 'submit-helper.cjs'), 'utf8').replace('module.exports = createSubmissionHelper;', '');
const flow = readFileSync(resolve(root, 'learning-flow.cjs'), 'utf8').replace('module.exports = createLearningFlow;', '');
const navigation = readFileSync(resolve(root, 'section-navigation.cjs'), 'utf8').replace('module.exports = createSectionNavigation;', '');
const lineRecovery = readFileSync(resolve(root, 'video-line-recovery.cjs'), 'utf8').replace('module.exports = createVideoLineRecovery;', '');
const assistant = readFileSync(resolve(root, 'review-assistant.js'), 'utf8').replace("const LOCAL_TOKEN = '__LOCAL_TOKEN__';", `const LOCAL_TOKEN = '${token}';`);
writeFileSync(resolve(out, '学习通-DeepSeek.user.js'), player + '\n(function () {\n' + core + '\n' + submission + '\n' + flow + '\n' + navigation + '\n' + lineRecovery + '\n' + assistant + '\n})();\n', { mode: 0o600 });
for (const file of ['local-service.mjs', 'deepseek-request.mjs', 'quiz-core.cjs']) {
    writeFileSync(resolve(out, file), readFileSync(resolve(root, file)));
}
writeFileSync(resolve(out, '启动 DeepSeek.command'), `#!/bin/zsh
cd -- "\$(dirname -- "$0")" || exit 1
NODE_RUNTIME="\$(command -v node 2>/dev/null || true)"
if [[ -z "$NODE_RUNTIME" ]]; then
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node(N); do NODE_RUNTIME="$candidate"; done
fi
if [[ -z "$NODE_RUNTIME" ]]; then
  print '未找到 Node.js，请检查运行环境。'
else
  "$NODE_RUNTIME" local-service.mjs
fi
print '\\n服务已停止。按回车关闭窗口。'
read -r
`, { mode: 0o755 });
chmodSync(resolve(out, '启动 DeepSeek.command'), 0o755);
console.log('Built Mac local service and review userscript.');
