(function xuexitongMain() {
const PAGE = window;
const $ = (...args) => PAGE.jQuery(...args);
const APP_KEY = '__xuexitongConsoleDeepSeek';
const BOOT_TIMER_KEY = '__xuexitongConsoleDeepSeekBootTimer';
const LOCAL_URL = 'http://127.0.0.1:37841';
const LOCAL_TOKEN = '__LOCAL_TOKEN__';
const startedByKeeper = PAGE.__xuexitongAutoInjected === true;
delete PAGE.__xuexitongAutoInjected;
if (!/^https:\/\/([a-z0-9-]+\.)*chaoxing\.com$/i.test(location.origin) ||
!location.pathname.includes('/mycourse/studentstudy')) {
console.error('请在学习通课程播放页的控制台执行本脚本');
return;
}
const SCRIPT_VERSION = '2026-10-27 字形还原 v3（外链字体 + 诊断）';
console.log(`[学习通助手] 脚本版本 ${SCRIPT_VERSION}`);
if (LOCAL_TOKEN === '__LOCAL_TOKEN__') {
console.error('请先启动 DeepSeek 本地服务，再复制更新后的 xuexitong-console.js');
return;
}

const previousApp = PAGE[APP_KEY];
if (previousApp && typeof previousApp.destroy === 'function') {
previousApp.destroy();
}
if (PAGE.__xuexitongPlayerV3 && typeof PAGE.__xuexitongPlayerV3.destroy === 'function') {
PAGE.__xuexitongPlayerV3.destroy();
}
if (PAGE.__xuexitongPlayerV4DeepSeek && typeof PAGE.__xuexitongPlayerV4DeepSeek.destroy === 'function') {
PAGE.__xuexitongPlayerV4DeepSeek.destroy();
}
if (PAGE[BOOT_TIMER_KEY]) {
clearInterval(PAGE[BOOT_TIMER_KEY]);
PAGE[BOOT_TIMER_KEY] = null;
}
if (!startedByKeeper) installNavigationKeeper();
fetch(`${LOCAL_URL}/health`, {
headers: { 'X-Xuexitong-Token': LOCAL_TOKEN },
signal: AbortSignal.timeout(5000),
}).then((response) => {
if (!response.ok) throw new Error(`HTTP ${response.status}`);
response.json().then((info) => {
if (info && info.decoder === false) {
console.warn('本地服务报告字形还原不可用：', info.error || '未检测到可用的 Python 环境');
}
}).catch(() => {});
console.log('DeepSeek 本地服务已连接');
if (typeof PAGE.jQuery === 'undefined') {
const script = document.createElement('script');
script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
script.type = 'text/javascript';
script.onload = function () {
console.log('jQuery loaded.');
waitForCoursePage();
};
script.onerror = () => console.error('jQuery 加载失败，脚本无法启动');
document.head.appendChild(script);
} else {
waitForCoursePage();
}
}).catch((error) => console.error('DeepSeek 本地服务不可用，请先启动服务并检查 Edge 本地网络权限:', error));

function installNavigationKeeper() {
let keeper;
try {
keeper = PAGE.open('', 'xuexitongConsoleKeeper', 'width=360,height=150');
if (!keeper) throw new Error('浏览器阻止了辅助窗口');
keeper.document.title = '学习通自动任务辅助窗口';
keeper.document.body.innerHTML = '<p style="font:16px sans-serif;padding:12px">学习通自动任务正在运行。请保持此窗口打开；课程页整页跳转后，它会重新启动脚本。</p>';
keeper.__xuexitongSource = `(${xuexitongMain.toString()})();`;
keeper.__xuexitongLastUrl = location.href;
keeper.__xuexitongLastInjectionAt = Date.now();
if (!keeper.__xuexitongKeeperTimer) {
keeper.eval(`window.__xuexitongKeeperTimer = setInterval(function () {
                    try {
                        var page = window.opener;
                        if (!page || page.closed) { clearInterval(window.__xuexitongKeeperTimer); window.close(); return; }
                        if (!/^https:\\/\\/([a-z0-9-]+\\.)*chaoxing\\.com\\/mycourse\\/studentstudy/i.test(page.location.href)) return;
                        if (page.location.href !== window.__xuexitongLastUrl) {
                            window.__xuexitongLastUrl = page.location.href;
                            window.__xuexitongLastInjectionAt = Date.now() - 30000;
                        }
                        if (page.document.readyState !== 'complete' || !page.document.querySelector('#coursetree')) return;
                        if (page.__xuexitongConsoleDeepSeek || page.__xuexitongConsoleDeepSeekBootTimer) return;
                        if (Date.now() - window.__xuexitongLastInjectionAt < 30000) return;
                        window.__xuexitongLastInjectionAt = Date.now();
                        page.__xuexitongAutoInjected = true;
                        page.eval(window.__xuexitongSource);
                    } catch (error) {
                        if (Date.now() - (window.__xuexitongLastErrorAt || 0) > 30000) {
                            window.__xuexitongLastErrorAt = Date.now();
                            window.document.body.textContent = '整页跳转后的自动恢复遇到错误：' + error.message;
                            console.warn('学习通整页跳转后的自动恢复暂不可用:', error);
                        }
                    }
                }, 1000);`);
}
keeper.blur();
PAGE.focus();
console.log('整页跳转辅助窗口已启动；请保持它打开');
} catch (error) {
console.warn('整页跳转后无法自动重新启动脚本；请允许此站点打开弹出窗口，或在新页面重新粘贴脚本。', error);
}
}
function waitForCoursePage() {
let attempts = 0;
const maxAttempts = 20;
PAGE[BOOT_TIMER_KEY] = setInterval(() => {
if ($('#coursetree').length > 0) {
clearInterval(PAGE[BOOT_TIMER_KEY]);
PAGE[BOOT_TIMER_KEY] = null;
initializePlayer();
return;
}
attempts++;
if (attempts >= maxAttempts) {
clearInterval(PAGE[BOOT_TIMER_KEY]);
PAGE[BOOT_TIMER_KEY] = null;
console.error('%c脚本启动超时：未检测到课程目录（#coursetree）。请确认当前处于课程播放页。', 'color:#F44336;font-weight:bold');
}
}, 1000);
}
function attachQuizAutomation(app) {
const attemptedQuizzes = new Set();
let quizBusy = false;
let stopped = false;
let lastDecodedQuiz = null;
const originalDestroy = app.destroy.bind(app);
app.destroy = function () {
stopped = true;
originalDestroy();
};

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const visible = (el) => Boolean(el && el.isConnected && el.getClientRects().length &&
el.ownerDocument.defaultView.getComputedStyle(el).visibility !== 'hidden');
const kindPattern = /[\[【](单选题|多选题|判断题)[\]】]/;

function courseDocuments() {
const result = [];
const visit = (doc, depth) => {
if (!doc || depth > 3 || result.includes(doc)) return;
result.push(doc);
for (const frame of doc.querySelectorAll('iframe')) {
try { visit(frame.contentDocument, depth + 1); } catch (_) { /* cross origin */ }
}
};
visit(document, 0);
return result;
}

function quizCompleted() {
const scoreShown = courseDocuments().some((doc) => {
const text = clean(doc.body?.innerText);
const hasGrade = /本次成绩\s*\d+(?:\.\d+)?\s*分/.test(text);
return hasGrade && (/章节测验\s*已完成/.test(text) || /我的答案\s*[:：]/.test(text));
});
if (scoreShown) return true;
const cardsFrame = Array.from(document.querySelectorAll('iframe[src*="/knowledge/cards"]'))
.find((frame) => frame.getClientRects().length > 0);
const isQuizStep = cardsFrame && new URL(cardsFrame.getAttribute('src'), location.href).searchParams.get('num') === '1';
return Boolean(isQuizStep && document.querySelector('.posCatalog_active .icon_Completed'));
}

function optionElements(card) {
const labels = Array.from(card.querySelectorAll('span,div,label,li,p,b,i,strong,a'))
.filter((el) => /^[A-H]$/.test(clean(el.textContent)) &&
!Array.from(el.children).some((child) => /^[A-H]$/.test(clean(child.textContent))));
const found = new Map();
for (const label of labels) {
const letter = clean(label.textContent);
if (found.has(letter)) continue;
let target = label;
for (let n = 0; n < 5; n++) {
const parent = target.parentElement;
if (!parent || parent === card) break;
const otherLetters = Array.from(parent.querySelectorAll('span,div,label,li,p,b,i,strong,a'))
.filter((el) => /^[A-H]$/.test(clean(el.textContent)) && el !== label);
if (otherLetters.some((el) => !el.contains(label) && !label.contains(el))) break;
target = parent;
if (clean(target.innerText).length > 1) break;
}
const text = clean(target.innerText).replace(new RegExp(`^${letter}[.、．]?\\s*`), '');
if (text) found.set(letter, { letter, text, element: target });
}
return Array.from(found.values()).sort((a, b) => a.letter.localeCompare(b.letter));
}

function extractQuestions() {
const questions = [];
for (const doc of courseDocuments()) {
const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
const seenCards = new Set();
let node;
while ((node = walker.nextNode())) {
const kind = clean(node.textContent).match(kindPattern)?.[1];
if (!kind || !visible(node.parentElement)) continue;
let card = node.parentElement;
let options = [];
for (let depth = 0; card && depth < 9; depth++, card = card.parentElement) {
const cardText = clean(card.innerText);
const kinds = cardText.match(new RegExp(kindPattern.source, 'g')) || [];
if (kinds.length > 1) break;
options = optionElements(card);
if (options.length >= 2 && options.length <= 8) break;
}
if (!card || options.length < 2 || options.length > 8 || seenCards.has(card)) continue;
seenCards.add(card);
const full = card.innerText || '';
const firstOption = full.search(/(?:^|\n)\s*A\s*(?:[.、．]|\S)/);
const title = clean(firstOption >= 0 ? full.slice(0, firstOption) :
(node.parentElement.innerText || full))
.replace(/^\d+\s*/, '').replace(kindPattern, '').trim();
if (!title || title.length > 500 || options.some((option) => !option.text || option.text.length > 500)) continue;
questions.push({ kind, title, options, card, doc });
}
}
return questions;
}

function findButton(doc, label) {
const candidates = Array.from(doc.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"],div,span'))
.filter((el) => visible(el) && clean(el.value || el.innerText) === label);
return candidates.find((el) => /^(BUTTON|A|INPUT)$/.test(el.tagName)) ||
candidates.find((el) => !Array.from(el.children).some((child) => clean(child.innerText) === label)) || null;
}

function findNextButton() {
for (const doc of courseDocuments()) {
const known = doc.querySelector('#prevNextFocusNext, #right1, .nextChapter');
if (visible(known) && clean(known.innerText || known.title).includes('下一节')) return known;
const generic = findButton(doc, '下一节');
if (generic) return generic;
}
return null;
}

async function revealQuizQuestions() {
const docs = courseDocuments();
const submit = docs.map((doc) => findButton(doc, '提交')).find(Boolean);
if (!submit) return;
let scroller = submit.parentElement;
while (scroller && scroller !== submit.ownerDocument.body) {
const style = scroller.ownerDocument.defaultView.getComputedStyle(scroller);
if (/(auto|scroll)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight + 100) break;
scroller = scroller.parentElement;
}
if (!scroller || scroller === submit.ownerDocument.body) {
scroller = submit.ownerDocument.scrollingElement;
}
if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 100) return;
scroller.scrollTop = 0;
await sleep(150);
for (let step = 0; step < 50; step++) {
const bottom = scroller.scrollHeight - scroller.clientHeight;
if (scroller.scrollTop >= bottom - 2) break;
scroller.scrollTop = Math.min(bottom, scroller.scrollTop + Math.max(300, scroller.clientHeight * 0.75));
await sleep(120);
}
}

async function waitForQuizQuestions() {
let submitDoc = null;
for (let attempt = 0; attempt < 240; attempt++) {
if (stopped) throw new Error('脚本已停止');
if (quizCompleted()) return null;
submitDoc = courseDocuments().find((doc) => findButton(doc, '提交'));
if (submitDoc) break;
if (attempt > 0 && attempt % 30 === 0) console.log(`测验提交按钮仍在加载，已等待 ${attempt / 2} 秒`);
await sleep(500);
}
if (!submitDoc) throw new Error('进入章节测验后等待 120 秒，仍未找到“提交”按钮。请检查题目框架是否正常加载');

await revealQuizQuestions();
let previousSignature = '';
let stableCount = 0;
for (let attempt = 0; attempt < 240; attempt++) {
if (stopped) throw new Error('脚本已停止');
if (quizCompleted()) return null;
const questions = extractQuestions();
const countText = clean(submitDoc.body.innerText).match(/题量\s*[:：]\s*(\d+)/);
const expected = countText ? Number(countText[1]) : null;
if (questions.length && (!expected || questions.length === expected)) {
const signature = questions.map((q) => `${q.kind}:${q.title}:${q.options.length}`).join('|');
stableCount = signature === previousSignature ? stableCount + 1 : 0;
previousSignature = signature;
if (stableCount >= 3) return questions;
} else {
stableCount = 0;
previousSignature = '';
}
if (attempt > 0 && attempt % 30 === 0) console.log(`测验题目仍在加载，已等待 ${attempt / 2} 秒；当前识别 ${questions.length} 道`);
await sleep(500);
}
throw new Error('测验框架已打开，但等待 120 秒仍未识别完整题目。可运行 app.inspectQuiz() 查看当前识别结果');
}

const FONT_FACE_RE = /@font-face\s*\{[^}]*\}/gi;
const CXSECRET_RE = /cxsecret/i;
const DATA_BASE64_RE = /base64,([A-Za-z0-9+/=\s]+)/;
const SRC_URL_RE = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i;

function collectCssTexts(doc) {
const texts = [];
for (const style of doc.querySelectorAll('style')) texts.push(style.textContent || '');
try {
for (const sheet of doc.styleSheets) {
try {
for (const rule of sheet.cssRules) texts.push(rule.cssText || '');
} catch (_) { /* 跨域样式表读不到 */ }
}
} catch (_) { /* 没有 styleSheets */ }
return texts;
}

function parseFontFace(block) {
if (!CXSECRET_RE.test(block)) return null;
const familyMatch = block.match(/font-family\s*:\s*([^;}]+)/i);
const family = (familyMatch ? familyMatch[1] : '').trim().replace(/^['"]|['"]$/g, '');
const data = block.match(DATA_BASE64_RE);
if (data) return { kind: 'inline', value: data[1].replace(/\s+/g, ''), family };
const src = block.match(SRC_URL_RE);
if (src && !/^data:/i.test(src[1])) return { kind: 'url', value: src[1].trim(), family };
return null;
}

function fontFromCssText(cssText) {
if (!CXSECRET_RE.test(cssText)) return null;
const blocks = cssText.match(FONT_FACE_RE) || [];
for (const block of blocks) {
const font = parseFontFace(block);
if (font) return font;
}
return null;
}

function findObfuscatedFont(questions) {
const docs = courseDocuments();
const preferred = questions && questions[0] && questions[0].doc;
const ordered = [];
if (preferred && docs.includes(preferred)) ordered.push(preferred);
for (const doc of docs) if (!ordered.includes(doc)) ordered.push(doc);
for (const doc of ordered) {
for (const cssText of collectCssTexts(doc)) {
const font = fontFromCssText(cssText);
if (font) return { font, doc };
}
}
return null;
}

function fontSourceLabel(doc) {
try {
if (doc === document) return '主页面';
const path = (doc.location && doc.location.pathname) || '';
return path ? `题目框架 ${path.slice(0, 60)}` : '内嵌框架';
} catch (_) {
return '未知框架';
}
}

function arrayBufferToBase64(buffer) {
const bytes = new Uint8Array(buffer);
let binary = '';
for (let i = 0; i < bytes.length; i += 0x8000) {
binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
}
return btoa(binary);
}

async function loadFontBase64(font, doc) {
if (font.kind === 'inline') return font.value;
const base = (doc && doc.baseURI) || location.href;
const url = new URL(font.value, base).href;
console.log(`字体来自外链，正在下载：${url}`);
const response = await fetch(url, { credentials: 'include' });
if (!response.ok) throw new Error(`下载字体失败：HTTP ${response.status}`);
return arrayBufferToBase64(await response.arrayBuffer());
}

function collectFontFaceInfo() {
const rows = [];
for (const doc of courseDocuments()) {
const label = fontSourceLabel(doc);
for (const cssText of collectCssTexts(doc)) {
const blocks = cssText.match(FONT_FACE_RE) || [];
for (const block of blocks) {
const family = ((block.match(/font-family\s*:\s*([^;}]+)/i) || [])[1] || '').trim();
const isInline = DATA_BASE64_RE.test(block);
const src = (block.match(SRC_URL_RE) || [])[1] || '';
rows.push({
框架: label,
字体名: family.slice(0, 40),
来源: isInline ? '内联 base64' : (src ? src.slice(0, 70) : '无'),
});
}
}
}
return rows;
}

function collectFontResources() {
try {
return performance.getEntriesByType('resource')
.map((entry) => entry.name)
.filter((name) => /\.(woff2?|ttf|otf)(\?|#|$)/i.test(name));
} catch (_) {
return [];
}
}

async function decodeObfuscated(questions) {
const found = findObfuscatedFont(questions);
if (!found) {
console.warn('没有在当前页面找到 font-cxsecret 字体，题目按页面原始文字作答');
const faces = collectFontFaceInfo();
if (faces.length) {
console.log('页面里检测到的 @font-face（可能字体名不是 cxsecret，或来源跨域读不到）：');
console.table(faces);
} else {
console.log('页面里没有读到任何 @font-face 规则（可能样式表跨域）');
}
const resources = collectFontResources();
if (resources.length) console.log('页面已加载的字体文件：', resources);
console.log('可运行 app.diagnoseFont() 复核。若控制台文字与屏幕文字一致，说明这页没有做字形混淆，本来就不用还原');
return false;
}
const font = await loadFontBase64(found.font, found.doc);
console.log(`使用 cxsecret 字体：${font.length} 字符（${found.font.kind === 'inline' ? '内联 base64' : '外链'}，来源 ${fontSourceLabel(found.doc)}，字体名 ${found.font.family || '未知'}）`);
const entries = [];
questions.forEach((q, qIndex) => {
entries.push({
label: `第 ${qIndex + 1} 题题干`,
get: () => q.title,
set: (value) => { q.title = value; },
});
q.options.forEach((option) => entries.push({
label: `第 ${qIndex + 1} 题 ${option.letter} 选项`,
get: () => option.text,
set: (value) => { option.text = value; },
}));
});
const texts = entries.map((entry) => entry.get());
console.log(`检测到 font-cxsecret 字形混淆，正在本地还原 ${texts.length} 段文字（首次约 5–10 秒）...`);
const response = await fetch(`${LOCAL_URL}/decode`, {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'X-Xuexitong-Token': LOCAL_TOKEN },
body: JSON.stringify({ font, texts }),
signal: AbortSignal.timeout(180000),
});
const data = await response.json().catch(() => null);
if (!response.ok) throw new Error(data?.error || `本地服务返回 HTTP ${response.status}`);
if (!data || !Array.isArray(data.texts) || data.texts.length !== texts.length)
throw new Error('字形还原结果条数与输入不一致');
data.texts.forEach((text, index) => entries[index].set(text));
const changes = data.texts
.map((text, index) => ({ index, raw: texts[index], decoded: text }))
.filter((item) => item.raw !== item.decoded);
if (!data.codes)
console.warn('注意：这批文字里没有任何字符命中该字体的 cmap。可能取到的字体不是本题的，或这一页本来就没有做字形混淆');
else if (!changes.length)
console.warn(`识别到 ${data.codes} 个槽位，但还原结果与原文完全一致，请确认字体是否匹配`);
lastDecodedQuiz = questions.map((q, i) => ({
id: i + 1, type: q.kind, question: q.title,
options: q.options.map((o) => `${o.letter}. ${o.text}`),
}));
printDecodedQuiz(questions, changes, entries, data);
return true;
}

function printDecodedQuiz(questions, changes, entries, data) {
console.group(`字形还原结果：${questions.length} 题 / ${changes.length} 段改写 / ${data.codes} 个槽位 / ${data.seconds} 秒${data.cached ? '（缓存命中）' : ''}（请核对）`);
questions.forEach((q, i) => {
const lines = [`${i + 1}. 【${q.kind}】${q.title}`];
q.options.forEach((o) => lines.push(`    ${o.letter}. ${o.text}`));
console.log(lines.join('\n'));
});
if (changes.length) {
console.groupCollapsed(`展开对比 ${changes.length} 段被改写的原文（乱码 → 真字）`);
changes.forEach(({ index, raw, decoded }) => {
console.log(`${entries[index].label}：${raw}  →  ${decoded}`);
});
console.groupEnd();
}
const suspect = Object.entries(data.uncertain || {});
if (suspect.length) {
console.warn(`有 ${suspect.length} 个字各字库判断不一致，提交前重点核对：`);
suspect.slice(0, 20).forEach(([ch, candidates]) => {
console.log(`    ${ch} 可能是：${candidates.join(' / ')}`);
});
}
console.groupEnd();
}

async function askDeepSeek(questions) {
const payload = questions.map((q, i) => ({
id: i + 1,
type: q.kind,
question: q.title,
options: q.options.map((o) => ({ letter: o.letter, text: o.text })),
}));
console.log('以下是本次发送给 DeepSeek 的题干和选项：', payload);
let response;
try {
response = await fetch(`${LOCAL_URL}/answer`, {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'X-Xuexitong-Token': LOCAL_TOKEN },
body: JSON.stringify({ questions: payload }),
signal: AbortSignal.timeout(900000),
});
} catch (error) {
throw new Error(`无法连接本地 DeepSeek 服务。请确认启动窗口仍在运行，且 Edge 允许本地网络访问。详情：${error.message}`);
}
const data = await response.json().catch(() => null);
if (!response.ok) throw new Error(data?.error || `本地 DeepSeek 服务返回 HTTP ${response.status}`);
return data.answers;
}

function validateAnswers(questions, answers) {
if (!Array.isArray(answers) || answers.length !== questions.length) throw new Error('AI 返回的题目数量不匹配');
const result = new Map();
for (const item of answers) {
if (!Number.isInteger(item.id) || result.has(item.id) || !Array.isArray(item.letters))
throw new Error('AI 答案格式错误');
const q = questions[item.id - 1];
if (!q) throw new Error('AI 返回未知题号');
const letters = item.letters.map((letter) => clean(letter).toUpperCase());
if (!letters.length) throw new Error(`第 ${item.id} 题 AI 未给出选项，已停止提交`);
if (new Set(letters).size !== letters.length) throw new Error(`第 ${item.id} 题答案包含重复选项，已停止提交`);
if (q.kind !== '多选题' && letters.length !== 1)
throw new Error(`第 ${item.id} 题是${q.kind}，但 AI 返回了 ${letters.length} 个选项，已停止提交`);
const invalidLetters = letters.filter((letter) => !q.options.some((option) => option.letter === letter));
if (invalidLetters.length)
throw new Error(`第 ${item.id} 题 AI 返回了页面中不存在的选项：${invalidLetters.join('、')}，已停止提交`);
result.set(item.id, letters);
}
return result;
}

async function selectAnswers(questions, answers) {
for (let i = 0; i < questions.length; i++) {
const q = questions[i];
for (const letter of answers.get(i + 1)) {
if (stopped) throw new Error('脚本已停止');
const option = q.options.find((item) => item.letter === letter);
if (!option?.element?.isConnected) throw new Error(`第 ${i + 1} 题选项已变化`);
option.element.scrollIntoView({ block: 'center' });
const before = q.card.outerHTML;
option.element.click();
await sleep(150);
const after = q.card.outerHTML;
const input = option.element.matches('input') ? option.element : option.element.querySelector('input');
const checked = input?.checked || option.element.getAttribute('aria-checked') === 'true';
if (before === after && !checked) throw new Error(`第 ${i + 1} 题 ${letter} 选项未确认选中，已停止提交`);
}
}
}

async function confirmSubmitDialog() {
for (let i = 0; i < 20; i++) {
if (stopped) throw new Error('脚本已停止');
const dialogs = courseDocuments().flatMap((doc) =>
Array.from(doc.querySelectorAll('#popok,[role="dialog"],[role="alertdialog"],.layui-layer-dialog,.el-message-box,.modal')));
const platformButton = dialogs.find((el) => el.id === 'popok' && visible(el));
if (platformButton) {
const message = clean(platformButton.ownerDocument.querySelector('#popcontent')?.innerText);
if (/未作答|请选择|请作答|答完/.test(message) && !/确定提交|确认提交/.test(message))
throw new Error(`平台拒绝提交：${message}`);
console.log(`确认平台提交窗口：${message || '提交'}`);
platformButton.click();
return;
}
const dialog = dialogs.find((el) => el.id !== 'popok' && visible(el) && /提交|交卷/.test(clean(el.innerText)));
if (dialog) {
const confirm = findButton(dialog, '确定') || findButton(dialog, '确认') || findButton(dialog, '提交');
if (!confirm) throw new Error('提交确认窗口未找到确认按钮');
confirm.click();
return;
}
await sleep(250);
}
}

async function submitQuiz(doc) {
if (stopped) throw new Error('脚本已停止');
const submit = findButton(doc, '提交');
if (!submit) throw new Error('未找到测验提交按钮');
submit.scrollIntoView({ block: 'center' });
console.log('选项已选择，点击章节测验的提交按钮');
submit.click();
await confirmSubmitDialog();
console.log('提交已确认，等待学习通生成成绩或任务完成标记；确认后再点击“下一节”');
let elapsedHalfSeconds = 0;
while (!stopped) {
await sleep(500);
elapsedHalfSeconds++;
if (quizCompleted()) return;
if (elapsedHalfSeconds % 30 === 0) console.log(`成绩页仍在加载，已等待 ${elapsedHalfSeconds / 2} 秒`);
}
throw new Error('脚本已停止');
}

async function goToNextStep() {
if (stopped) throw new Error('脚本已停止');
const next = findNextButton();
if (!next) throw new Error('未找到页面下方的“下一节”按钮');
app._nextUnitPending = true;
const previousStep = app._currentStepTitle();
app._clearCheckInterval();
app._videoEl = null;
app._isPlaying = false;
next.scrollIntoView({ block: 'center' });
console.log(`${previousStep || '当前学习步骤'}完成，点击页面“下一节”，等待新内容加载`);
next.click();
let currentStep = '';
let stepReady = false;
for (let attempt = 0; attempt < 240; attempt++) {
if (stopped) throw new Error('脚本已停止');
await sleep(500);
currentStep = app._currentStepTitle();
if (currentStep !== previousStep && currentStep === '章节测验') {
stepReady = true;
break;
}
if (currentStep !== previousStep && currentStep === '视频') {
app._videoEl = null;
if (app._getVideoEl()) {
stepReady = true;
break;
}
}
if (attempt > 0 && attempt % 30 === 0) console.log(`下一学习步骤仍在加载，已等待 ${attempt / 2} 秒；当前页签：${currentStep || '未显示'}`);
}
if (!stepReady) {
throw new Error(`点击“下一节”后等待 120 秒，新学习步骤仍未加载完成；当前页签：${currentStep || '未显示'}`);
}
app._nextUnitPending = false;
app._videoEl = null;
app._initCellData();
app.play();
}

app.nextUnit = function () {
if (stopped || this._nextUnitPending) return;
this._nextUnitPending = true;
goToNextStep().catch((error) => {
this._nextUnitPending = false;
console.error('切换下一学习步骤失败:', error);
});
};

app.inspectQuiz = function () {
return extractQuestions().map((q, i) => ({
id: i + 1, type: q.kind, question: q.title,
options: q.options.map((o) => `${o.letter}. ${o.text}`),
}));
};

app.inspectDecoded = function () {
return lastDecodedQuiz;
};

app.diagnoseFont = function () {
const rows = courseDocuments().map((doc, index) => {
let fontInfo = null;
let styleCount = 0;
let marked = false;
let path = '';
try { styleCount = doc.querySelectorAll('style').length; } catch (_) { /* ignore */ }
try { marked = Boolean(doc.querySelector('.font-cxsecret, .fontLabel')); } catch (_) { /* ignore */ }
try { path = (doc.location && doc.location.pathname) || ''; } catch (_) { /* ignore */ }
for (const cssText of collectCssTexts(doc)) {
fontInfo = fontFromCssText(cssText);
if (fontInfo) break;
}
return {
框架: index === 0 ? '主页面' : `iframe ${index}`,
地址: path,
混淆标记: marked ? '有' : '无',
style标签: styleCount,
cxsecret字体: fontInfo
? (fontInfo.kind === 'inline' ? `内联 ${fontInfo.value.length} 字符` : `外链 ${fontInfo.value}`)
: '无',
};
});
console.table(rows);
const faces = collectFontFaceInfo();
if (faces.length) {
console.log('页面里的 @font-face：');
console.table(faces);
}
const resources = collectFontResources();
if (resources.length) console.log('已加载的字体文件：', resources);
const found = findObfuscatedFont([]);
console.log(found
? `字形还原可用：${found.font.kind === 'inline' ? '内联' : '外链'}字体（${found.font.family || '未知字体名'}），来源 ${fontSourceLabel(found.doc)}`
: '没有找到 cxsecret 字体：题目会按原始文字作答');
return rows;
};

app._advanceChapterTest = function () {
if (stopped || quizBusy) return;
quizBusy = true;
(async () => {
if (quizCompleted()) {
console.log('检测到当前章节测验已完成，点击“下一节”进入新视频');
await goToNextStep();
return;
}
console.log('已进入章节测验，等待题目和提交按钮加载');
const questions = await waitForQuizQuestions();
if (questions === null) {
console.log('检测到当前章节测验已完成，点击“下一节”进入新视频');
await goToNextStep();
return;
}
if (questions.length > 30) throw new Error('题目数量超过 30，已停止自动提交');
const docs = new Set(questions.map((q) => q.doc));
if (docs.size !== 1) throw new Error('题目跨多个框架，已停止自动提交');
const countText = clean(questions[0].doc.body.innerText).match(/题量\s*[:：]\s*(\d+)/);
if (countText && Number(countText[1]) !== questions.length)
throw new Error(`页面显示 ${countText[1]} 道题，脚本只识别 ${questions.length} 道，已停止提交`);
try {
await decodeObfuscated(questions);
} catch (error) {
console.warn('字形还原未完成，按页面原始文字作答（DeepSeek 只能按上下文猜字）：', error.message);
}
const signature = questions.map((q) => `${q.kind}:${q.title}`).join('|');
if (attemptedQuizzes.has(signature)) throw new Error('本次测验已尝试过，已停止重复提交');
console.log(`识别到 ${questions.length} 道题，正在调用 DeepSeek`);
const answers = validateAnswers(questions, await askDeepSeek(questions));
console.table(questions.map((q, i) => ({ 题号: i + 1, 题型: q.kind, 选择: answers.get(i + 1).join('') })));
await selectAnswers(questions, answers);
attemptedQuizzes.add(signature);
await submitQuiz(questions[0].doc);
console.log('章节测验提交已确认，点击“下一节”进入新视频');
quizBusy = false;
await goToNextStep();
})().catch((error) => {
app._nextUnitPending = false;
console.error('章节测验自动作答停止:', error);
})
.finally(() => { quizBusy = false; });
};

}
function initializePlayer() {
const app = {
configs: {
autoplay: true,
retryInterval: 2000,
maxRetries: 10,
videoCheckInterval: 1000,
guardNoProgressMs: 7000,
guardResumeCooldownMs: 1500,
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
console.log("%c=== 学习通视频与章节测验助手 V4 启动 ===", "color:#4CAF50;font-size:16px;font-weight:bold");
this._nextUnitPending = false;
this._chapterAdvanceTimes = 0;
this._getTreeContainer();
this._initCellData();
console.log(`当前学习步骤：${this._currentStepTitle() || '等待页面加载'}`);
this._videoEl = null;
this._getVideoEl();
this._clearCheckInterval();
this._bindStepNavigation();
this.play();
},
nextUnit() {
if (this._nextUnitPending) {
console.warn('%c已有小节切换正在进行，忽略重复请求', 'color:#FF9800');
return;
}
this._nextUnitPending = true;
this._clearCheckInterval();
console.log("%c=== 准备切换到下一小节 ===", "color:#2196F3;font-size:14px");
try {
const el = this._getTreeContainer();
const cells = el.children("ul").children("li");
const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
if (nCells.length > this._cellData.currentNCellIndex + 1) {
const nextNIndex = this._cellData.currentNCellIndex + 1;
console.log(`%c切换到同章节下一个视频: ${nextNIndex + 1}/${nCells.length}`, "color:#FF9800");
this.playCurrentIndex(nCells.get(nextNIndex));
} else {
const nextIndex = this._cellData.currentCellIndex + 1;
if (nextIndex >= cells.length) {
console.log("%c=====================================", "color:#4CAF50;font-size:16px");
console.log("%c==============本课程学习完成了==============", "color:#4CAF50;font-size:16px;font-weight:bold");
console.log("%c=====================================", "color:#4CAF50;font-size:16px");
return;
}
console.log(`%c切换到下一个章节: ${nextIndex + 1}/${cells.length}`, "color:#FF9800");
this._cellData.currentCellIndex = nextIndex;
this._cellData.currentNCellIndex = 0;
this.playCurrentIndex();
}
} catch (error) {
this._nextUnitPending = false;
console.error('切换下一小节失败:', error);
}
},
_clearCheckInterval() {
if (this._checkInterval) {
clearInterval(this._checkInterval);
this._checkInterval = null;
}
},
_startVideoMonitoring() {
this._clearCheckInterval();
this._guardLastTime = 0;
this._guardLastWallTs = 0;
this._guardLastResumeTs = 0;
this._checkInterval = setInterval(() => {
this._checkVideoStatus();
}, this.configs.videoCheckInterval);
},
_tryResumePlayback(reason) {
const now = Date.now();
if (now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs) {
return;
}
this._guardLastResumeTs = now;
const video = this._getVideoEl();
if (!video || !this._isPlaying) return;
video.muted = true;
video.defaultMuted = true;
video.volume = 0;
console.log(`%c触发视频保活恢复(${reason})`, "color:#607D8B");
video.play().catch((e) => {
console.warn("直接恢复播放失败，尝试静音恢复:", e);
video.muted = true;
video.play().catch((err) => {
console.error("静音恢复播放失败:", err);
});
});
},
_checkVideoStatus() {
try {
const video = this._getVideoEl();
if (!video) return;
video.muted = true;
video.defaultMuted = true;
video.volume = 0;
if (video.paused && this._isPlaying) {
console.log("%c检测到视频暂停，尝试恢复播放...", "color:#FF5722");
this._tryResumePlayback("paused");
} else if (this._isPlaying && !video.ended) {
const now = Date.now();
const current = Number(video.currentTime || 0);
if (this._guardLastWallTs === 0) {
this._guardLastWallTs = now;
this._guardLastTime = current;
} else {
const stalled = Math.abs(current - this._guardLastTime) < 0.01;
const stalledMs = now - this._guardLastWallTs;
if (stalled && stalledMs >= this.configs.guardNoProgressMs) {
this._tryResumePlayback("no-progress");
this._guardLastWallTs = now;
this._guardLastTime = Number(video.currentTime || 0);
} else if (!stalled) {
this._guardLastWallTs = now;
this._guardLastTime = current;
}
}
}
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
_stepAdvanceTimes: 0,
_stepSwitchAt: 0,
_stepSwitchPending: false,
_delayedNextUnitTimer: null,
_guardLastTime: 0,
_guardLastWallTs: 0,
_guardLastResumeTs: 0,
async play() {
try {
if (this._isChapterTest()) {
this._videoEl = null;
this._isPlaying = false;
this._clearCheckInterval();
this._advanceChapterTest();
return;
}
const el = this._getVideoEl();
if (el == null) {
if (this._currentStepTitle() === '视频') {
throw new Error('视频组件尚未加载完成');
}
if (this._advanceLearningStep()) {
console.log("%c当前不在视频页，已尝试切到下一学习步骤，2秒后重试", "color:#607D8B");
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
console.warn('%c当前小节未发现视频，按配置切换到下一小节', 'color:#FF9800');
this.nextUnit();
} else {
console.warn('%c当前小节未发现视频或可识别的学习步骤，已安全停止。确认无需完成课件后，可执行 app.nextUnit()。', 'color:#FF9800');
}
return;
}
this._isPlaying = true;
this._videoEventHandle();
try {
el.muted = true;
el.defaultMuted = true;
el.volume = 0;
await el.play();
this._tryTimes = 0;
console.log('%c视频开始播放，保持页面默认播放速度', 'color:#4CAF50');
this._startVideoMonitoring();
} catch (playError) {
console.error("视频播放失败:", playError);
this._handlePlayError(playError);
}
} catch (e) {
if (this._tryTimes >= this.configs.maxRetries) {
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
_advanceLearningStep() {
if (this._stepSwitchPending && Date.now() - this._stepSwitchAt < 4000) {
return true;
}
const currentStepTitle = this._currentStepTitle();

if (currentStepTitle === "章节测验" || currentStepTitle === "视频") {
return false;
}
const clickElement = (el, label) => {
if (!el) return false;
this._stepSwitchPending = true;
this._stepSwitchAt = Date.now();
console.log(`%c尝试点击${label}`, "color:#2196F3");
el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
return true;
};
const videoTab = $(".prev_white:visible").filter((_, el) => {
const text = ($(el).text() || "").replace(/\s+/g, "");
return text === "2视频" || text === "视频";
}).get(0);
if (clickElement(videoTab, "“视频”页签")) {
return true;
}
return false;
},
_currentStepTitle() {
const cardsFrame = Array.from(document.querySelectorAll('iframe[src*="/knowledge/cards"]'))
.find((frame) => frame.getClientRects().length > 0);
if (cardsFrame) {
const num = new URL(cardsFrame.getAttribute('src'), location.href).searchParams.get('num');
if (num === '0') return '视频';
if (num === '1') return '章节测验';
}
const prevTitle = document.getElementsByClassName('prev_title')[0];
const text = prevTitle ? (prevTitle.title || prevTitle.textContent || '').trim() : '';
return text === '视频' || text === '章节测验' ? text : '';
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
setTimeout(() => this.play(), 2000);
},
_bindStepNavigation() {
if (this._stepNavigationBound) {
return;
}
this._stepNavigationBound = true;
const reenterVideoMode = () => {
this._videoEl = null;
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
$(document).off('click.xuexitongPlayerV4', '.prev_white').on('click.xuexitongPlayerV4', '.prev_white', (e) => {
const text = ($(e.currentTarget).text() || "").replace(/\s+/g, "");
if (text.includes("视频") || text.includes("章节测验")) {
console.log(`%c检测到步骤切换点击：${text}，准备重新识别页面`, "color:#607D8B");
reenterVideoMode();
}
});
},
_handlePlayError(error) {
console.error("播放错误详情:", error);
const video = this._getVideoEl();
if (video) {
video.muted = true;
video.play().then(() => {
console.log("%c静音播放成功", "color:#4CAF50");
this._tryTimes = 0;
this._startVideoMonitoring();
if (this._delayedNextUnitTimer) {
clearTimeout(this._delayedNextUnitTimer);
this._delayedNextUnitTimer = null;
}
}).catch(e => {
console.error("静音播放也失败:", e);
if (this._delayedNextUnitTimer) {
clearTimeout(this._delayedNextUnitTimer);
}
this._isPlaying = false;
if (this._tryTimes >= this.configs.maxRetries) {
console.error('%c静音播放失败，已达到最大重试次数', 'color:#F44336;font-weight:bold', e);
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
const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
nCell = nCells.get(this._cellData.currentNCellIndex);
}
const $nCell = $(nCell);
const clickableSpan = $nCell.find(".posCatalog_name")[0];
if (!clickableSpan) {
console.error("%c===========找不到可点击的课程节点，播放下一个视频失败==============", "color:#F44336");
return;
}
console.log(`%c点击切换到: ${$(clickableSpan).attr('title') || '未知标题'}`, "color:#2196F3");
$(clickableSpan).click();
this._videoEl = null;
this._isPlaying = false;
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
const nCells = $(v).find('.posCatalog_select:not(.firstLayer)');
nCellCounts += nCells.length;
nCells.each((j, e) => {
const _el = $(e);
if (_el.hasClass("posCatalog_active")) {
this._cellData.currentCellIndex = i;
this._cellData.currentNCellIndex = j;
foundCurrent = true;
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
_getVideoEl() {
if (!this._videoEl) {
try {
const findVideo = (frame, depth) => {
if (depth > 2) return null;
const frameDocument = frame.contentDocument || frame.contentWindow?.document;
if (!frameDocument) return null;
const $frameDocument = $(frameDocument);
const directVideo = $frameDocument.find('video#video_html5_api, video[id*="video_html5"]').get(0);
if (directVideo) return directVideo;
const nestedFrames = $frameDocument.find('iframe.ans-insertvideo-online, iframe[src*="video"]');
for (const nestedFrame of nestedFrames.toArray()) {
const nestedVideo = findVideo(nestedFrame, depth + 1);
if (nestedVideo) return nestedVideo;
}
return null;
};
for (const frame of $('iframe').toArray()) {
const video = findVideo(frame, 0);
if (video) {
this._videoEl = video;
video.muted = true;
video.defaultMuted = true;
video.volume = 0;
break;
}
}
} catch (e) {
console.error("获取视频元素失败:", e);
return null;
}
}
if (!this._videoEl) return null;
return this._videoEl;
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
pause: this._handleVideoPause.bind(this),
};
el.addEventListener('ended', this._boundVideoHandlers.ended);
el.addEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
el.addEventListener('play', this._boundVideoHandlers.play);
el.addEventListener('pause', this._boundVideoHandlers.pause);
},
_detachVideoEvents() {
if (!this._eventVideoEl || !this._boundVideoHandlers) return;
this._eventVideoEl.removeEventListener('ended', this._boundVideoHandlers.ended);
this._eventVideoEl.removeEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
this._eventVideoEl.removeEventListener('play', this._boundVideoHandlers.play);
this._eventVideoEl.removeEventListener('pause', this._boundVideoHandlers.pause);
this._eventVideoEl = null;
this._boundVideoHandlers = null;
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
this._stepSwitchPending = false;
const video = this._getVideoEl();
this._guardLastTime = Number(video?.currentTime || 0);
this._guardLastWallTs = Date.now();
if (this._delayedNextUnitTimer) {
clearTimeout(this._delayedNextUnitTimer);
this._delayedNextUnitTimer = null;
}
},
_handleVideoPause(e) {
console.log(`%c============视频暂停=============`, "color:#FF9800");
},
_bindPageGuards() {
const preventPause = (e) => {
e.stopPropagation();
e.preventDefault();
};
const resumePlaybackNow = () => this._tryResumePlayback('page-event');
this._pageGuards = { preventPause, resumePlaybackNow };
document.addEventListener('mouseleave', preventPause);
window.addEventListener('mouseleave', preventPause);
document.addEventListener('mouseout', preventPause);
window.addEventListener('mouseout', preventPause);
window.addEventListener('blur', resumePlaybackNow);
document.addEventListener('visibilitychange', resumePlaybackNow);
},
destroy() {
this._isPlaying = false;
this._clearCheckInterval();
this._detachVideoEvents();
if (this._delayedNextUnitTimer) clearTimeout(this._delayedNextUnitTimer);
$(document).off('.xuexitongPlayerV4');
if (this._pageGuards) {
const { preventPause, resumePlaybackNow } = this._pageGuards;
document.removeEventListener('mouseleave', preventPause);
window.removeEventListener('mouseleave', preventPause);
document.removeEventListener('mouseout', preventPause);
window.removeEventListener('mouseout', preventPause);
window.removeEventListener('blur', resumePlaybackNow);
document.removeEventListener('visibilitychange', resumePlaybackNow);
this._pageGuards = null;
}
},
};
attachQuizAutomation(app);
PAGE.app = app;
PAGE[APP_KEY] = app;

try {
app.run();
app._bindPageGuards();
} catch (error) {
console.error("%c脚本运行失败: ", "color:#F44336;font-weight:bold", error.message);
console.log("请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。");
}
}
})();
