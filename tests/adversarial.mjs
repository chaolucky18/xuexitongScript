#!/usr/bin/env node
/**
 * V3.4 对抗性验证套件（独立验证者视角：优先证伪，而不是背书）
 *
 * 运行：cd repo && node tests/adversarial.mjs
 * 环境：jsdom + 真实 jQuery 3.7.1（repo/node_modules -> tools/node_modules），不加载任何外部资源（离线）。
 * 说明：本文件绝不修改 repo/ 下的产品代码；所有注入只作用于测试侧的 jsdom window。
 *
 * 与作者自测（tests/regression.mjs）的区别：
 *   1. 使用真实 jQuery，而不是 jQuery shim；
 *   2. 除了断言「修复存在」，还构造能证伪的用例（竞态、双触发、失效缓存、残留定时器）；
 *   3. 每条结论都打印可粘贴的原始证据。
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const sourcePath = resolve(repoRoot, 'v3_optimized.js');
const userScriptPath = resolve(repoRoot, 'v3_optimized.user.js');
const README_PATH = resolve(repoRoot, 'README.md');
const SOURCE = readFileSync(sourcePath, 'utf8');

const { JSDOM, VirtualConsole } = require(resolve(repoRoot, 'node_modules/jsdom'));
const jqueryFactory = require(resolve(repoRoot, 'node_modules/jquery'));

// ---------------------------------------------------------------------------
// 极简测试框架
// ---------------------------------------------------------------------------
const results = [];
let groupName = '未分组';
const failures = [];
const unhandled = [];
const findings = [];

process.on('unhandledRejection', (e) => unhandled.push('unhandledRejection: ' + (e && e.stack ? e.stack : String(e))));
process.on('uncaughtException', (e) => unhandled.push('uncaughtException: ' + (e && e.stack ? e.stack : String(e))));

function group(name) {
  groupName = name;
  console.log(`\n=== ${name} ===`);
}

function recordFinding(id, severity, problem, requiredFix, evidence) {
  findings.push({ id, severity, problem, requiredFix, evidence });
  console.log(`  [FINDING] ${id} (${severity}) ${problem}`);
}

async function test(name, fn) {
  const record = { group: groupName, name: name, status: 'pass', error: '', notes: [] };
  const note = (s) => { record.notes.push(s); console.log(`      · ${s}`); };
  try {
    await fn({ note });
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    record.status = 'fail';
    record.error = (error && error.stack) || String(error);
    failures.push(record);
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${record.error.split('\n').join('\n         ')}`);
  }
  await closeLeakedEnvs();
  results.push(record);
  return record;
}

function assert(condition, message) {
  if (!condition) throw new Error(`断言失败: ${message}`);
}
function assertEq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`断言失败: ${message}\n    实际 = ${a}\n    期望 = ${e}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

// 所有尚未关闭的 jsdom 环境：测试失败时也要强制清理，否则残留定时器会让 node 挂住
const openEnvs = new Set();
async function closeLeakedEnvs() {
  for (const env of Array.from(openEnvs)) {
    try { await close(env); } catch (e) { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// 静态分析工具
// ---------------------------------------------------------------------------
function stripComments(code) {
  let out = '';
  let i = 0;
  const n = code.length;
  let mode = 'code';
  while (i < n) {
    const c = code[i];
    const c2 = code[i + 1];
    if (mode === 'code') {
      if (c === '/' && c2 === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && c2 === '*') { mode = 'block'; i += 2; continue; }
      if (c === "'" ) { mode = 'sq'; out += c; i++; continue; }
      if (c === '"' ) { mode = 'dq'; out += c; i++; continue; }
      if (c === '`' ) { mode = 'tpl'; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c; } i++; continue; }
    if (mode === 'block') { if (c === '*' && c2 === '/') { mode = 'code'; i += 2; continue; } if (c === '\n') out += c; i++; continue; }
    if (mode === 'sq' || mode === 'dq' || mode === 'tpl') {
      out += c;
      if (c === '\\') { out += code[i + 1] || ''; i += 2; continue; }
      const closer = mode === 'sq' ? "'" : mode === 'dq' ? '"' : '`';
      if (c === closer) mode = 'code';
      i++; continue;
    }
    i++;
  }
  return out;
}
const CODE = stripComments(SOURCE);
const CODE_LINES = CODE.split('\n');

function lineOfSource(needle) {
  const idx = SOURCE.split('\n').findIndex((l) => l.includes(needle));
  return idx < 0 ? -1 : idx + 1;
}
function extractMethodBody(source, header) {
  const start = source.indexOf(header);
  if (start < 0) return '';
  let depth = 0;
  let started = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return source.slice(start, i + 1); }
  }
  return source.slice(start);
}

// ---------------------------------------------------------------------------
// jsdom 环境（含定时器/监听器/网络 打桩）
// ---------------------------------------------------------------------------
function createEnv(opts = {}) {
  const logs = [];
  const jsdomErrors = [];
  const vc = new VirtualConsole();
  const fmt = (args) => args.map((a) => {
    if (typeof a === 'string') return a;
    if (a && a.message) return `${a.name || 'Error'}: ${a.message}`;
    try { return JSON.stringify(a); } catch (e) { return String(a); }
  }).join(' ').replace(/%c/g, '').replace(/\s+/g, ' ').trim();
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    vc.on(level, (...args) => logs.push({ level, text: fmt(args), t: Date.now() }));
  }
  vc.on('jsdomError', (e) => jsdomErrors.push(String((e && e.message) || e)));

  const dom = new JSDOM(opts.html || '<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'outside-only',
    virtualConsole: vc,
    url: opts.url || 'https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=1',
    pretendToBeVisual: false,
  });
  const win = dom.window;
  let $ = null; // jQuery 在定时器/监听器/网络打桩之后再初始化，避免库自身的 ready 监听污染总账

  // jQuery 的 :visible 依赖 offsetWidth/offsetHeight；jsdom 无布局引擎，这里给最小布局桩
  for (const prop of ['offsetWidth', 'offsetHeight']) {
    Object.defineProperty(win.HTMLElement.prototype, prop, { get() { return 100; }, configurable: true });
  }

  const env = { dom, window: win, logs, jsdomErrors };
  openEnvs.add(env);
  env.has = (needle, level) => logs.some((l) => (!level || l.level === level) && l.text.includes(needle));
  env.count = (needle, level) => logs.filter((l) => (!level || l.level === level) && l.text.includes(needle)).length;
  env.text = () => logs.map((l) => `${l.level}: ${l.text}`);
  env.tail = (k = 12) => logs.slice(-k).map((l) => `${l.level}: ${l.text}`);

  // --- 定时器总账 -----------------------------------------------------------
  const timers = new Map();
  const rawST = win.setTimeout.bind(win);
  const rawSI = win.setInterval.bind(win);
  const rawCT = win.clearTimeout.bind(win);
  const rawCI = win.clearInterval.bind(win);
  let intervalSeq = 0;
  const timerEvents = [];
  win.setTimeout = function (fn, ms) {
    const rec = { type: 'timeout', ms: Number(ms) || 0, fired: false };
    const id = rawST(() => { timers.delete(id); rec.fired = true; fn.apply(win, Array.prototype.slice.call(arguments, 2)); }, ms);
    rec.id = id;
    timers.set(id, rec);
    timerEvents.push({ op: 'set', type: 'timeout', ms: rec.ms });
    return id;
  };
  win.setInterval = function (fn, ms) {
    intervalSeq++;
    const effective = (opts.compressBoot !== false && intervalSeq === 1) ? 10 : ms;
    const rec = { type: 'interval', ms: effective, nth: intervalSeq, fired: false };
    const id = rawSI(() => { rec.fired = true; fn.apply(win, Array.prototype.slice.call(arguments, 2)); }, effective);
    rec.id = id;
    timers.set(id, rec);
    timerEvents.push({ op: 'set', type: 'interval', ms: effective });
    return id;
  };
  win.clearTimeout = (id) => { if (timers.delete(id)) timerEvents.push({ op: 'clear', id }); return rawCT(id); };
  win.clearInterval = (id) => { if (timers.delete(id)) timerEvents.push({ op: 'clear', id }); return rawCI(id); };
  env.activeTimers = () => Array.from(timers.values());
  env.activeTimerCount = () => timers.size;
  env.activeTimeouts = (ms) => Array.from(timers.values()).filter((t) => t.type === 'timeout' && (ms === undefined || t.ms === ms));
  env.pendingIntervals = () => Array.from(timers.values()).filter((t) => t.type === 'interval');
  env.timerEvents = timerEvents;

  // --- 监听器总账 -----------------------------------------------------------
  const ownFns = new Set();
  const listenerAdds = [];
  const listenerRemoves = [];
  const targetLabel = (t) => (t === win ? 'window' : (t && t.nodeType === 9 ? 'document' : (t && t.tagName ? `${t.tagName.toLowerCase()}${t.id ? '#' + t.id : ''}` : String(t))));
  const rawAdd = win.EventTarget.prototype.addEventListener;
  const rawRemove = win.EventTarget.prototype.removeEventListener;
  win.EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (!ownFns.has(fn)) listenerAdds.push({ type: String(type), target: targetLabel(this), el: this });
    return rawAdd.call(this, type, fn, opts);
  };
  win.EventTarget.prototype.removeEventListener = function (type, fn, opts) {
    if (!ownFns.has(fn)) listenerRemoves.push({ type: String(type), target: targetLabel(this), el: this });
    return rawRemove.call(this, type, fn, opts);
  };
  env.listenerAdds = listenerAdds;
  env.listenerRemoves = listenerRemoves;
  env.listenerDelta = (target) => {
    const count = (arr) => arr.filter((x) => !target || x.target === target).length;
    return count(listenerAdds) - count(listenerRemoves);
  };
  env.listenersOfType = (type) => listenerAdds.filter((x) => x.type === type);
  env.listenerDeltaOf = (el) => listenerAdds.filter((x) => x.el === el).length - listenerRemoves.filter((x) => x.el === el).length;

  // --- 网络总账 -------------------------------------------------------------
  const net = { fetch: 0, xhr: 0, beacon: 0, urls: [], scripts: [] };
  win.fetch = function (input) { net.fetch++; net.urls.push(String(input)); return Promise.reject(new Error('network blocked by verifier')); };
  const rawOpen = win.XMLHttpRequest.prototype.open;
  win.XMLHttpRequest.prototype.open = function (method, url) { net.xhr++; net.urls.push(String(url)); return rawOpen.apply(this, arguments); };
  if (win.navigator) win.navigator.sendBeacon = function (url) { net.beacon++; net.urls.push(String(url)); return false; };
  const rawCreate = win.document.createElement.bind(win.document);
  win.document.createElement = function (tag) {
    const el = rawCreate.apply(win.document, arguments);
    if (String(tag).toLowerCase() === 'script') net.scripts.push(el);
    return el;
  };
  env.net = net;
  env.externalRequests = () => net.urls.concat(net.scripts.map((s) => s.src || s.getAttribute('src') || '').filter(Boolean));

  // jQuery 在这里才初始化：其自身 ready 机制会注册 DOMContentLoaded/load 监听，作为「基线」排除，
  // 之后的监听器总账只统计产品代码的增减。
  $ = jqueryFactory(win);
  win.jQuery = win.$ = $;
  env.$ = $;
  const baselineAdds = listenerAdds.length;
  const baselineRemoves = listenerRemoves.length;
  env.listenerAddsSinceBaseline = (type) => listenerAdds.slice(baselineAdds).filter((x) => !type || x.type === type);
  // jQuery 自身的 ready 机制（DOMContentLoaded/load）在基线前注册、ready 时注销，与产品代码无关：按类型排除
  const READY_TYPES = ['DOMContentLoaded', 'load', 'unload', 'beforeunload'];
  env.listenerDeltaSinceBaseline = (target) => listenerAdds.slice(baselineAdds).filter((x) => (!target || x.target === target) && !READY_TYPES.includes(x.type)).length
    - listenerRemoves.slice(baselineRemoves).filter((x) => (!target || x.target === target) && !READY_TYPES.includes(x.type)).length;

  // --- 点击记录（捕获阶段，先于任何产品逻辑） --------------------------------
  env.clicks = [];
  const clickRecorder = (e) => {
    const el = e.target;
    env.clicks.push({
      tag: el && el.tagName ? el.tagName.toLowerCase() : '',
      cls: el && el.className ? String(el.className) : '',
      title: (el && el.getAttribute && el.getAttribute('title')) || '',
      text: ((el && el.textContent) || '').trim().slice(0, 40),
      defaultPrevented: e.defaultPrevented,
    });
  };
  ownFns.add(clickRecorder);
  win.document.addEventListener('click', clickRecorder, true);
  env.navClicks = () => env.clicks.filter((c) => c.cls.includes('posCatalog_name'));
  env.navTitles = () => env.navClicks().map((c) => c.title || c.text);
  env.clicksMatching = (re) => env.clicks.filter((c) => re.test(`${c.tag} ${c.cls} ${c.text}`));

  // 模拟真实页面：点击某个小节后，.posCatalog_active 会移动到该节点
  if (opts.simulateActive !== false) {
    const activeSim = (e) => {
      const el = e.target;
      if (!el || !el.closest) return;
      const name = el.closest('.posCatalog_name');
      if (!name) return;
      const leaf = name.parentElement && name.parentElement.classList && name.parentElement.classList.contains('posCatalog_select')
        ? name.parentElement : name.closest('.posCatalog_select');
      if (!leaf) return;
      win.document.querySelectorAll('.posCatalog_active').forEach((n) => n.classList.remove('posCatalog_active'));
      leaf.classList.add('posCatalog_active');
      if (opts.onSectionClick) opts.onSectionClick(env, leaf);
    };
    ownFns.add(activeSim);
    win.document.addEventListener('click', activeSim, false);
  }
  return env;
}

async function boot(env, opts = {}) {
  const { expectApp = true, timeout = 4000, settle = 40 } = opts;
  env.window.eval(SOURCE);
  if (!expectApp) { await sleep(settle); return null; }
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline && !env.window.__xuexitongPlayerV3) await sleep(10);
  await sleep(settle);
  const app = env.window.__xuexitongPlayerV3 || env.window.app;
  if (!app) throw new Error('脚本未完成初始化：window.__xuexitongPlayerV3 未创建；最近日志=' + JSON.stringify(env.tail(8)));
  env.app = app;
  return app;
}

async function close(env) {
  openEnvs.delete(env);
  try { if (env.app && typeof env.app.destroy === 'function') env.app.destroy(); } catch (e) { /* ignore */ }
  await sleep(10);
  try { env.dom.window.close(); } catch (e) { /* ignore */ }
  await sleep(5);
}

// ---------------------------------------------------------------------------
// DOM 构造工具
// ---------------------------------------------------------------------------
function nodeHTML(n) {
  const cls = ['posCatalog_select', n.cls, n.active ? 'posCatalog_active' : ''].filter(Boolean).join(' ');
  const name = `<span class="posCatalog_name" title="${n.title}">${n.title}</span>`;
  const kids = n.children ? `<ul>${n.children.map((k) => `<li>${nodeHTML(k)}</li>`).join('')}</ul>` : '';
  return `<div class="${cls}">${name}${kids}</div>`;
}
function treeHTML(chapters) {
  const chs = chapters.map((ch) => {
    const cls = ['chapter', ch.cls, ch.active ? 'posCatalog_active' : ''].filter(Boolean).join(' ');
    const nodes = ch.nodes.map((n) => `<li>${nodeHTML(n)}</li>`).join('');
    return `<li class="${cls}"><div class="posCatalog_select firstLayer${ch.firstLayerActive ? ' posCatalog_active' : ''}">`
      + `<span class="posCatalog_name" title="${ch.title}">${ch.title}</span><ul>${nodes}</ul></div></li>`;
  }).join('');
  return `<div id="coursetree"><ul>${chs}</ul></div>`;
}
function threeLeafTree() {
  return treeHTML([
    { title: '第1章', nodes: [{ title: '1.1', active: true }, { title: '1.2' }, { title: '1.3' }] },
    { title: '第2章', nodes: [{ title: '2.1' }, { title: '2.2' }] },
  ]);
}
function pageHTML(inner, extra = '') {
  return `<!doctype html><html><head></head><body>${inner}${extra}</body></html>`;
}
function makeVideo(env, doc, opts = {}) {
  const target = doc || env.window.document;
  const v = target.createElement('video');
  if (opts.src !== null) v.setAttribute('src', opts.src || 'https://video.invalid/lesson.mp4');
  const state = { paused: true, ended: false, currentTime: 0, muted: false, playCalls: 0, mutedPlayCalls: 0 };
  const def = (name, get, set) => Object.defineProperty(v, name, { get, set, configurable: true });
  def('paused', () => state.paused, (x) => { state.paused = !!x; });
  def('ended', () => state.ended, (x) => { state.ended = !!x; });
  def('currentTime', () => state.currentTime, (x) => { state.currentTime = Number(x) || 0; });
  def('muted', () => state.muted, (x) => { state.muted = !!x; });
  v.play = function () {
    state.playCalls++;
    if (state.muted) state.mutedPlayCalls++;
    if (opts.playImpl) return opts.playImpl(state, v);
    state.paused = false;
    return Promise.resolve();
  };
  v.pause = function () { state.paused = true; };
  v.__state = state;
  target.body.appendChild(v);
  return v;
}
function makeFrame(env, doc, id) {
  const f = doc.createElement('iframe');
  if (id) f.id = id;
  doc.body.appendChild(f);
  return f;
}
function makeDialog(doc, opts = {}) {
  const div = doc.createElement('div');
  div.className = opts.cls || 'answerQuestion';
  div.innerHTML = `<div class="Zy_TItle">请选择你认为正确的答案</div>`
    + `<ul><li>选项A</li><li>选项B</li><li>选项C</li></ul>`
    + `<button id="xtSubmit">提交</button><form id="xtForm"><input type="radio" name="q" value="A"></form>`;
  doc.body.appendChild(div);
  return div;
}

// ---------------------------------------------------------------------------
// 断言辅助
// ---------------------------------------------------------------------------
function assertNav(env, expected, message) {
  assertEq(env.navTitles(), expected, message);
}
function assertReleased(app, env, reasonKeyword, message) {
  assert(app._nextUnitPending === false, `${message}: _nextUnitPending 仍为 true（导航锁未释放）`);
  if (reasonKeyword) {
    assert(env.has(`已释放小节切换锁（${reasonKeyword}）`), `${message}: 未看到释放锁日志「已释放小节切换锁（${reasonKeyword}）」`);
  }
}
// ===========================================================================
// A. 静态与同步：逐字节同步、语法、负向扫描、文档一致性
// ===========================================================================
const SOURCE_SHA_AT_START = sha256(SOURCE);
console.log(`验证目标（启动时快照）：repo/v3_optimized.js ${SOURCE.length}B / ${SOURCE.split('\n').length} 行 / sha256=${SOURCE_SHA_AT_START}`);
console.log(`           repo/v3_optimized.user.js ${readFileSync(userScriptPath, 'utf8').length}B`);
console.log(`           jsdom=${require(resolve(repoRoot, 'node_modules/jsdom/package.json')).version}  jquery=${require(resolve(repoRoot, 'node_modules/jquery/package.json')).version}  node=${process.version}`);

group('A. 静态与同步（同步/语法/负向扫描/文档）');

await test('A1 油猴 payload 与唯一源码逐字节一致（无 BOM 差异）', ({ note }) => {
  const us = readFileSync(userScriptPath, 'utf8');
  const srcNow = readFileSync(sourcePath, 'utf8');
  assert(!srcNow.startsWith('\uFEFF'), 'v3_optimized.js 以 BOM 开头');
  const marker = '// ==/UserScript==' + '\n\n';
  const idx = us.indexOf(marker);
  assert(idx >= 0, '油猴元数据块缺失或格式错误');
  const payload = us.slice(idx + marker.length);
  assert(payload === srcNow, `payload(${payload.length}B) 与磁盘上的源码(${srcNow.length}B) 不一致：油猴版未按唯一源码重新生成`);
  assert(payload === SOURCE, '源码在本次运行期间被修改（验证目标非冻结）');
  assert(!us.startsWith('\uFEFF'), 'v3_optimized.user.js 以 BOM 开头');
  note(`payload=${payload.length}B 与源码逐字节相同；@version=${(us.match(/@version\s+(\S+)/) || [])[1]}；源码 sha256=${sha256(srcNow).slice(0, 16)}`);
});

await test('A2 两个入口 node --check 均通过', ({ note }) => {
  const out = [];
  for (const file of [sourcePath, userScriptPath]) {
    const result = execFileSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    out.push(`${file.split(/[\\/]/).pop()}: ${(result || '').trim() || 'exit=0'}`);
  }
  note(out.join(' | '));
});

await test('A3 每个修复点都有「F编号 + #issue」注释', ({ note }) => {
  const missing = [];
  for (let i = 1; i <= 7; i++) {
    if (!new RegExp(`F${i}[^\\n]*#\\d+`).test(SOURCE)) missing.push(`F${i}`);
  }
  assertEq(missing, [], '缺少 F编号+#issue 注释');
  note('F1..F7 均命中 /F{n}.+#issue/ 注释');
});

await test('A4 负向静态扫描：无事件劫持、无自动答题、无外部网络调用', ({ note }) => {
  const forbidden = [
    ['_bindPageGuards（已被移除的全局守卫）', /_bindPageGuards/],
    ['mouseleave', /mouseleave/],
    ['mouseout', /mouseout/],
    ['.preventDefault(', /\.preventDefault\s*\(/],
    ['.stopPropagation(', /\.stopPropagation\s*\(/],
    ['fetch(', /\bfetch\s*\(/],
    ['XMLHttpRequest', /XMLHttpRequest/],
    ['axios', /axios/],
    ['$.ajax/', /\$\.ajax\s*\(/],
    ['$.post(', /\$\.post\s*\(/],
    ['$.get(', /\$\.get\s*\(/],
    ['form submit()', /\.submit\s*\(/],
    ['选项下标点击 options[0].click()', /(options|opts|choices)\s*\[\s*0\s*\]\s*\.click/],
    ['sendBeacon', /sendBeacon/],
    ['new Image(', /new\s+Image\s*\(/],
    ['localStorage（凭据存储）', /localStorage/],
    ['document.cookie', /document\.cookie/],
  ];
  const hits = [];
  for (const [label, re] of forbidden) {
    const lines = CODE_LINES.map((l, i) => [i + 1, l]).filter(([, l]) => re.test(l));
    if (lines.length) hits.push(`${label} -> 第${lines.map(([n]) => n).join(',')}行`);
  }
  assertEq(hits, [], '去注释源码中仍存在被禁止的写法');
  const urls = Array.from(new Set((CODE.match(/https?:\/\/[^\s'"`)>]+/g) || []).map((s) => s.replace(/[;,)]+$/, ''))));
  assertEq(urls, ['https://code.jquery.com/jquery-3.6.0.min.js'], '存在 jQuery CDN 之外的外部 URL');
  note(`17 类禁止写法全部 0 命中；去注释源码内外域 URL 仅 ${JSON.stringify(urls)}`);
});

await test('A5 F5 正向：互动弹窗检测存在，且检测函数体内无任何点击/提交动作', ({ note }) => {
  for (const symbol of ['_findInteractionDialog', '_checkInteractionDialog', '_interactionBlocked', '不会自动答题', '请手动完成该互动题']) {
    assert(SOURCE.includes(symbol), `缺少 F5 符号: ${symbol}`);
  }
  for (const header of ['_findInteractionDialog(rootDoc, depth) {', '_checkInteractionDialog() {']) {
    const body = stripComments(extractMethodBody(SOURCE, header));
    assert(body.length > 40, `${header} 未定位到函数体`);
    assert(!/\.click\s*\(/.test(body), `${header} 函数体内出现 .click(`);
    assert(!/dispatchEvent/.test(body), `${header} 函数体内出现 dispatchEvent`);
    assert(!/\.submit\s*\(/.test(body), `${header} 函数体内出现 .submit(`);
  }
  const optionSelectorUses = (CODE.match(/input\[type=radio\]/g) || []).length;
  note(`F5 符号齐备；两个检测函数体内 0 次 click/dispatchEvent/submit；选项选择器仅用于计数（出现 ${optionSelectorUses} 次）`);
});

await test('A6 F6 正向：选择器覆盖 + 嵌套深度上限', ({ note }) => {
  for (const sel of ["'video#video_html5_api'", "'video[id*=\"video_html5\"]'", "'video.vjs-tech'", "'video[src]'", "'video'"]) {
    assert(SOURCE.includes(sel), `缺少选择器 ${sel}`);
  }
  assert(/depth > this\.configs\.videoFrameMaxDepth/.test(SOURCE), '缺少嵌套深度上限判断');
  assert(/iframe\.ans-insertvideo-online/.test(SOURCE), '缺少 ans-insertvideo-online iframe 选择器');
  note('5 个视频选择器 + ans-insertvideo-online + depth 上限判断均存在');
});

await test('A7 README 仓库内相对链接全部指向存在的文件', ({ note }) => {
  const md = readFileSync(README_PATH, 'utf8');
  const links = Array.from(md.matchAll(/\]\(([^)]+)\)/g)).map((m) => m[1]).filter((l) => !/^(https?:|mailto:|#)/.test(l));
  const missing = links.filter((l) => !existsSync(resolve(repoRoot, decodeURIComponent(l.split('#')[0]))));
  assertEq(missing, [], 'README 相对链接指向不存在的文件');
  note(`${links.length} 个相对链接全部存在：${links.slice(0, 6).join(', ')} ...`);
});

await test('A8 README 默认配置与运行中的 app.configs 逐项一致', async ({ note }) => {
  const md = readFileSync(README_PATH, 'utf8');
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  const app = await boot(env);
  const block = md.split('```javascript')[1].split('```')[0];
  const pairs = block.trim().split('\n').map((l) => l.split(':').map((s) => s.trim())).filter((p) => p.length === 2);
  assert(pairs.length >= 10, `README 配置块解析异常（${pairs.length} 项）`);
  const mismatches = [];
  for (const [key, raw] of pairs) {
    if (!(key in app.configs)) { mismatches.push(`${key} 在 app.configs 中不存在`); continue; }
    const expected = raw === 'true' ? true : raw === 'false' ? false : (raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw);
    if (JSON.stringify(app.configs[key]) !== JSON.stringify(expected)) {
      mismatches.push(`${key}: README=${raw} 代码=${JSON.stringify(app.configs[key])}`);
    }
  }
  assertEq(mismatches, [], 'README 默认配置与 app.configs 不一致');
  note(`README 配置块 ${pairs.length} 项与运行中的 app.configs 全部一致`);
  await close(env);
});

await test('A9 initializePlayer() 调用点静态审计（仅 boot 定时器两处，且互斥）', ({ note }) => {
  const all = Array.from(SOURCE.matchAll(/initializePlayer\(\)\s*;/g)).length;
  const bootBody = extractMethodBody(SOURCE, 'function waitForCoursePage() {');
  const inside = Array.from(bootBody.matchAll(/initializePlayer\(\)\s*;/g)).length;
  assertEq(inside, 2, 'waitForCoursePage 内 initializePlayer() 调用点数量应为 2');
  assertEq(all, inside, `waitForCoursePage 之外仍存在 initializePlayer() 调用点（总 ${all} / 函数内 ${inside}）`);
  const lines = bootBody.split('\n');
  const callIndexes = lines.map((l, i) => [i, l]).filter(([, l]) => /initializePlayer\(\)\s*;/.test(l)).map(([i]) => i);
  assertEq(callIndexes.length, 2, 'boot 定时器内的调用点数量');
  for (const i of callIndexes) {
    const before = lines.slice(Math.max(0, i - 4), i).join('\n');
    assert(/clearInterval\(window\[BOOT_TIMER_KEY\]\)/.test(before), `调用点第${i + 1}行前未 clearInterval(boot)`);
    assert(/window\[BOOT_TIMER_KEY\]\s*=\s*null/.test(before), `调用点第${i + 1}行前未将 boot 句柄置空`);
  }
  const successReturn = lines.slice(callIndexes[0], callIndexes[0] + 2).join('\n');
  assert(/return/.test(successReturn), '成功分支调用点之后没有 return，可能继续走到超时分支');
  note(`调用点=2（第${callIndexes[0] + 1}行成功分支/第${callIndexes[1] + 1}行超时分支），前置 clearInterval+置空，成功分支后 return`);
});


// ===========================================================================
// B. F1 导航死锁：四条退出路径 + destroy→run
// ===========================================================================
group('B. F1 导航死锁（四条失败/正常路径 + destroy→run）');

await test('B1 F1-a：play() 因找不到视频抛错触顶 maxRetries 后 nextUnit() 仍可用', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree(), '<div class="prev_title" title="视频">视频</div>') });
  const app = await boot(env);
  assert(app._getVideoEl() === null, 'B1 场景不应存在 video 元素');
  app._tryTimes = 0;
  app.configs.maxRetries = 3;
  app.configs.retryInterval = 10;
  app._nextUnitPending = true; // 人为制造 V3.3 式「持锁 + 失败 play」现场
  await app.play();
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && !env.has('已达到最大重试次数')) await sleep(20);
  assert(env.has('已达到最大重试次数'), '未走到触顶分支；最近日志=' + JSON.stringify(env.tail(6)));
  assertReleased(app, env, 'play() 达到最大重试次数', 'B1');
  const before = env.navTitles().length;
  app.nextUnit();
  await sleep(30);
  assert(env.navTitles().length > before, 'B1: 触顶后 nextUnit() 被静默忽略（死锁）');
  assertEq(env.navTitles().slice(-1), ['1.2'], 'B1: 触顶后未在同章内前进到 1.2');
  note(`证据: 触顶日志="${env.text().find((t) => t.includes('已达到最大重试次数'))}"；之后 nextUnit() 点击序列=${JSON.stringify(env.navTitles())}`);
  await close(env);
});

await test('B2 F1-b：走「无视频安全停止」分支后 nextUnit() 仍可用', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) }); // 无 video、无 .prev_title、无视频页签
  const app = await boot(env);
  assert(env.has('已安全停止'), '未进入无视频安全停止分支；最近日志=' + JSON.stringify(env.tail(6)));
  assertEq(app._consecutiveNoVideoAdvances, 0, '安全停止路径不应计入自动前进次数');
  app._nextUnitPending = true;
  await app.play();
  assertReleased(app, env, '无视频安全停止', 'B2');
  const before = env.navTitles().length;
  app.nextUnit();
  await sleep(30);
  assertEq(env.navTitles().slice(before), ['1.2'], 'B2: 安全停止后 nextUnit() 未在同章前进');
  note(`证据: "${env.text().find((t) => t.includes('已安全停止'))}"；释放锁日志 + nextUnit() 点击=${JSON.stringify(env.navTitles())}`);
  await close(env);
});

await test('B3 F1-c：静音播放也失败触顶后 nextUnit() 仍可用', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  const video = makeVideo(env, env.window.document, { playImpl: () => Promise.reject(new Error('NotAllowedError')) });
  const app = await boot(env);
  app.configs.maxRetries = 2;
  app.configs.retryInterval = 10;
  app._tryTimes = 0;
  app._nextUnitPending = true;
  await app.play();
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && !env.has('静音播放失败，已达到最大重试次数')) await sleep(20);
  assert(env.has('静音播放失败，已达到最大重试次数'), '未走到静音失败触顶；最近日志=' + JSON.stringify(env.tail(6)));
  assert(video.__state.muted === true, '静音兜底未被尝试');
  assertReleased(app, env, '静音播放失败触顶', 'B3');
  const before = env.navTitles().length;
  app.nextUnit();
  await sleep(30);
  assertEq(env.navTitles().slice(before), ['1.2'], 'B3: 静音触顶后 nextUnit() 未生效');
  note(`证据: muted=${video.__state.muted}, play() 调用 ${video.__state.playCalls} 次；触顶日志命中；nextUnit() 点击=${JSON.stringify(env.navTitles())}`);
  await close(env);
});

await test('B4 F1-d：正常 playCurrentIndex 之后按 1.2→1.3→2.1 推进，且 destroy()→run() 后仍可用', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree(), '<div class="prev_title" title="视频">视频</div>') });
  makeVideo(env, env.window.document);
  const app = await boot(env);
  assert(app._isPlaying === true, 'B4: run() 后未进入播放态');
  assert(app._checkInterval !== null, 'B4: 未启动视频监控定时器');
  assert(env.has('视频开始播放'), 'B4: 未打印开始播放');
  app.nextUnit(); await sleep(30);
  assertEq(env.navTitles(), ['1.2'], 'B4: 第一次 nextUnit 未进到 1.2');
  assertEq([app.cellData.currentCellIndex, app.cellData.currentNCellIndex], [0, 1], 'B4: 下标未同步');
  app.nextUnit(); await sleep(30);
  assertEq(env.navTitles(), ['1.2', '1.3'], 'B4: 第二次 nextUnit 未进到 1.3');
  app.nextUnit(); await sleep(30);
  assertEq(env.navTitles(), ['1.2', '1.3', '2.1'], 'B4: 第三次 nextUnit 未跨章进到 2.1');
  assertEq([app.cellData.currentCellIndex], [1], 'B4: 跨章后 chapterIndex 未更新');
  app.destroy(); await sleep(20);
  assertEq(env.activeTimerCount(), 0, 'B4: destroy() 后仍有活动定时器');
  assert(app._checkInterval === null && app._interactionWatcher === null, 'B4: destroy() 未清理监控定时器');
  app.run(); await sleep(40);
  assert(app._checkInterval !== null, 'B4: destroy() 后 run() 未重新启动视频监控');
  const before = env.navTitles().length;
  app.nextUnit(); await sleep(30);
  assert(env.navTitles().length > before, 'B4: destroy()→run() 后 nextUnit() 失效');
  note(`推进序列=${JSON.stringify(env.navTitles())}；destroy 后活动定时器=0，run() 后重新监控且 nextUnit 继续生效`);
  await close(env);
});
// ===========================================================================
// C. F2 下标解析：7 种 DOM 形态
// ===========================================================================
group('C. F2 目录下标解析（7 种 DOM 形态 + 解析失败不假装成功）');

await test('C1 形态1：active 落在子节点（同章 3 个视频）→ 下标/节点集合唯一解析', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  const app = await boot(env);
  assertEq([app.cellData.resolved, app.cellData.resolveSource], [true, 'active-node'], 'C1: 解析来源应为 active-node');
  assertEq([app.cellData.cells, app.cellData.nCells], [2, 5], 'C1: 章数/叶子节点数');
  assertEq([app.cellData.currentCellIndex, app.cellData.currentNCellIndex], [0, 0], 'C1: 初始下标');
  app.nextUnit(); await sleep(25);
  app.nextUnit(); await sleep(25);
  assertEq(env.navTitles(), ['1.2', '1.3'], 'C1: 未按同章 1→2→3 推进');
  assertEq([app.cellData.currentCellIndex, app.cellData.currentNCellIndex], [0, 2], 'C1: 第二次推进后下标');
  note(`解析来源=active-node；推进序列=${JSON.stringify(env.navTitles())}（未直接跳章）`);
  await close(env);
});

await test('C2 形态2：active 落在章节 li（父节点）→ 定位该章首个可播放节点', async ({ note }) => {
  const env = createEnv({ html: pageHTML(treeHTML([
    { title: '第1章', active: true, nodes: [{ title: '1.1' }, { title: '1.2' }, { title: '1.3' }] },
    { title: '第2章', nodes: [{ title: '2.1' }] },
  ])) });
  const app = await boot(env);
  assertEq([app.cellData.resolved, app.cellData.resolveSource], [true, 'active-parent'], 'C2: 解析来源应为 active-parent');
  assertEq([app.cellData.currentCellIndex, app.cellData.currentNCellIndex], [0, 0], 'C2: 下标');
  app.nextUnit(); await sleep(25);
  assertEq(env.navTitles(), ['1.2'], 'C2: 父节点 active 时未在同章内前进');
  note(`解析来源=active-parent（active 在 li 上），nextUnit 点击=${JSON.stringify(env.navTitles())}`);
  await close(env);
});

await test('C3 形态3：active 落在 firstLayer 收起态父容器 → 不把容器当视频节点', async ({ note }) => {
  const env = createEnv({ html: pageHTML(treeHTML([
    { title: '第1章', firstLayerActive: true, nodes: [{ title: '1.1' }, { title: '1.2' }] },
    { title: '第2章', nodes: [{ title: '2.1' }] },
  ])) });
  const app = await boot(env);
  assertEq([app.cellData.resolved, app.cellData.resolveSource], [true, 'active-parent'], 'C3: 解析来源');
  assertEq(app.cellData.nCells, 3, 'C3: firstLayer 容器不应计入节点数');
  app.nextUnit(); await sleep(25);
  assertEq(env.navTitles(), ['1.2'], 'C3: 点击目标错误');
  note(`nCells=${app.cellData.nCells}（容器被排除），点击=${JSON.stringify(env.navTitles())}`);
  await close(env);
});

await test('C4 形态4：lastLayer 容器节点（含嵌套子节点）→ 容器不计入、下标不前移', async ({ note }) => {
  const env = createEnv({ html: pageHTML(treeHTML([
    { title: '第1章', nodes: [{ title: '1.1' }, { title: '容器', cls: 'lastLayer', active: true, children: [{ title: '1.2' }, { title: '1.3' }] }] },
    { title: '第2章', nodes: [{ title: '2.1' }] },
  ])) });
  const app = await boot(env);
  assertEq(app.cellData.nCells, 4, 'C4: 叶子节点数应为 4（1.1/1.2/1.3/2.1，容器不算）');
  assertEq([app.cellData.currentCellIndex, app.cellData.currentNCellIndex], [0, 0], 'C4: 容器 active 时应退到该章第 1 个叶子');
  app.nextUnit(); await sleep(25);
  assertEq(env.navTitles(), ['1.2'], 'C4: 推进序列错误');
  note(`nCells=${app.cellData.nCells}（lastLayer 容器被排除），点击=${JSON.stringify(env.navTitles())}`);
  await close(env);
});

await test('C5 形态5：完全没有 .posCatalog_active → 解析失败必须报错且零点击（不假装成功）', async ({ note }) => {
  const env = createEnv({ html: pageHTML(treeHTML([
    { title: '第1章', nodes: [{ title: '1.1' }, { title: '1.2' }] },
    { title: '第2章', nodes: [{ title: '2.1' }] },
  ])) });
  const app = await boot(env);
  assertEq(app.cellData.resolved, false, 'C5: 无 active 时不应声称已解析');
  assert(env.has('无法解析当前激活的视频节点'), 'C5: _initCellData 未报解析失败');
  const before = env.navTitles().length;
  app.nextUnit(); await sleep(25);
  assertEq(env.navTitles().length, before, 'C5: 解析失败时仍然点击了节点（假装成功）');
  assert(env.has('无法解析当前课程节点'), 'C5: nextUnit 未给出明确失败日志');
  assert(!env.has('切换到下一个章节'), 'C5: 解析失败时静默跳到下一章');
  assertReleased(app, env, 'nextUnit 退出', 'C5');
  note(`解析失败日志命中「无法解析当前课程节点」；点击增量=0；无「切换到下一个章节」`);
  await close(env);
});

await test('C6 形态6：最后一个小节（本章唯一节点、最后一章）→ 明确「学习完成」而非死锁', async ({ note }) => {
  const env = createEnv({ html: pageHTML(treeHTML([{ title: '第1章', nodes: [{ title: '1.1', active: true }] }])) });
  const app = await boot(env);
  app.nextUnit(); await sleep(25);
  assertEq(env.navTitles(), [], 'C6: 已完成课程不应再点击任何节点');
  assert(env.has('本课程学习完成了'), 'C6: 未给出完成提示');
  assertReleased(app, env, 'nextUnit 退出', 'C6');
  note('结束态命中「本课程学习完成了」，零点击，导航锁已释放');
  await close(env);
});

await test('C7 形态7：active 落在第 2 章第 2 个节点 → 同章末尾才跨到第 3 章', async ({ note }) => {
  const env = createEnv({ html: pageHTML(treeHTML([
    { title: '第1章', nodes: [{ title: '1.1' }, { title: '1.2' }, { title: '1.3' }] },
    { title: '第2章', nodes: [{ title: '2.1' }, { title: '2.2', active: true }] },
    { title: '第3章', nodes: [{ title: '3.1' }, { title: '3.2' }] },
  ])) });
  const app = await boot(env);
  assertEq([app.cellData.currentCellIndex, app.cellData.currentNCellIndex], [1, 1], 'C7: 初始下标');
  app.nextUnit(); await sleep(25);
  assertEq(env.navTitles(), ['3.1'], 'C7: 应从第 2 章跨到第 3 章第 1 节');
  assert(!env.navTitles().some((t) => t.startsWith('1.')), 'C7: 不应回跳到第 1 章');
  note(`初始(ch2,node2) → 点击=${JSON.stringify(env.navTitles())}，未回跳第 1 章`);
  await close(env);
});

// ===========================================================================
// D. F3 有界前进
// ===========================================================================
group('D. F3 无视频/课件页：有界前进与安全停止');

await test('D1 无视频且无法识别完成状态 → 安全停止、零点击、计数不增长', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  const app = await boot(env);
  assert(env.has('已安全停止'), 'D1: 未安全停止');
  for (let i = 0; i < 5; i++) { await app.play(); await sleep(15); }
  assertEq(env.navTitles(), [], 'D1: 无法识别完成状态时不应自动前进');
  assertEq(app._consecutiveNoVideoAdvances, 0, 'D1: 不应计入自动前进次数');
  assert(env.has('app.configs.autoAdvanceNoVideo = true'), 'D1: 缺少可操作提示');
  note(`连续 5 次 play() 后点击=0，_consecutiveNoVideoAdvances=0，提示语齐全`);
  await close(env);
});

await test('D2 无视频但节点带完成标记 → 有界自动前进，严格 3 次后触顶停止', async ({ note }) => {
  const env = createEnv({ html: pageHTML(treeHTML([
    { title: '第1章', nodes: [{ title: '1.1', cls: 'poscatalog_completed', active: true }, { title: '1.2', cls: 'poscatalog_completed' }, { title: '1.3', cls: 'poscatalog_completed' }] },
    { title: '第2章', nodes: [{ title: '2.1', cls: 'poscatalog_completed' }, { title: '2.2', cls: 'poscatalog_completed' }] },
  ])) });
  const app = await boot(env);
  assertEq(app.configs.autoAdvanceNoVideo, false, 'D2: 默认应为安全优先（false）');
  for (let i = 0; i < 8; i++) { await app.play(); await sleep(25); }
  assertEq(env.navTitles(), ['1.2', '1.3', '2.1'], 'D2: 自动前进序列/次数不符');
  assertEq(app._consecutiveNoVideoAdvances, 3, 'D2: 计数应停在上限 3');
  assert(env.has('连续自动前进已达上限'), 'D2: 缺少触顶日志');
  const clicksAtCap = env.navTitles().length;
  for (let i = 0; i < 6; i++) { await app.play(); await sleep(20); }
  assertEq(env.navTitles().length, clicksAtCap, 'D2: 触顶后仍在继续前进（无界）');
  assert(app._timers === null || app._timers.size <= 4, `D2: 待执行定时器异常膨胀（${app._timers ? app._timers.size : 0}）`);
  note(`自动前进序列=${JSON.stringify(env.navTitles())}；触顶后再 6 次 play() 点击不再增长（上限=${app.configs.maxConsecutiveNoVideoAdvances}）`);
  await close(env);
});

await test('D3 章节测验页 → 受限跳转最多 3 次后停止', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree(), '<div class="prev_title" title="章节测验">章节测验</div><button id="prevNextFocusNext">下一步</button>') });
  const app = await boot(env);
  for (let i = 0; i < 6; i++) { await app.play(); await sleep(20); }
  const buttonClicks = env.clicks.filter((c) => c.tag === 'button').length;
  assertEq(buttonClicks, 3, 'D3: 章节测验「下一步」点击次数应被限制为 3');
  assertEq(app._chapterAdvanceTimes, 3, 'D3: 章节测验计数应为 3');
  assert(env.has('章节测验页面连续跳转失败'), 'D3: 缺少触顶提示');
  note(`章节测验「下一步」实际点击 ${buttonClicks} 次后触顶停止（日志命中「章节测验页面连续跳转失败」）`);
  await close(env);
});

await test('D3b 反例：章节测验页（含 .Zy_TItle 题目容器）不得被误判为互动弹窗', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree(), '<div class="prev_title" title="章节测验">章节测验</div>') });
  makeDialog(env.window.document);
  const app = await boot(env);
  assertEq(app._checkInteractionDialog(), null, 'D3b: 章节测验页被误判为互动答题弹窗');
  assertEq(app._interactionBlocked, false, 'D3b: 章节测验页被错误暂停');
  await sleep(1600); // 真实 1500ms 轮询至少跑一次
  assertEq(app._interactionBlocked, false, 'D3b: 轮询后仍被误判');
  note('含 .Zy_TItle 的章节测验页：直接调用 + 1.5s 真实轮询后 _interactionBlocked 始终为 false');
  await close(env);
});

// ===========================================================================
// E. F4 事件劫持与恢复播放上限
// ===========================================================================
group('E. F4 事件劫持 / 恢复播放冷却与上限');

await test('E1 动态：不存在 mouseout/mouseleave 劫持；destroy() 后监听器净额归零', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  makeVideo(env, env.window.document);
  const app = await boot(env);
  await sleep(30);
  const hijackAdds = env.listenerAddsSinceBaseline().filter((l) => ['mouseout', 'mouseleave', 'mouseover', 'mouseenter'].includes(l.type));
  assertEq(hijackAdds, [], '仍然注册了 mouseout/mouseleave 等全局监听');
  app.destroy(); await sleep(30);
  const docDelta = env.listenerDeltaSinceBaseline('document');
  const winDelta = env.listenerDeltaSinceBaseline('window');
  const videoDelta = env.listenerDeltaSinceBaseline('video');
  assertEq(docDelta, 0, `destroy() 后 document 上残留监听器 ${docDelta} 个`);
  assertEq(winDelta, 0, `destroy() 后 window 上残留监听器 ${winDelta} 个`);
  assertEq(videoDelta, 0, `destroy() 后 video 上残留监听器 ${videoDelta} 个`);
  // 动态验证：mouseout 事件未被 preventDefault，且仍可冒泡
  const target = env.window.document.querySelector('.posCatalog_name');
  const ev = new env.window.MouseEvent('mouseout', { bubbles: true, cancelable: true });
  let seen = 0;
  const probe = () => { seen++; };
  env.window.document.addEventListener('mouseout', probe);
  target.dispatchEvent(ev);
  assertEq(ev.defaultPrevented, false, 'mouseout 事件被 preventDefault');
  assertEq(seen, 1, 'mouseout 事件未正常冒泡到 document');
  note(`document/window/video 监听器净额=0/0/0；mouseout 冒泡正常且 defaultPrevented=false`);
  await close(env);
});

await test('E2 冷却生效：同一冷却窗口内连续 100 次触发只产生 1 次 play()', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  const video = makeVideo(env, env.window.document);
  const app = await boot(env);
  app._isPlaying = true;
  video.__state.paused = true; video.__state.currentTime = 0;
  app._guardLastTime = 0;
  app._guardLastWallTs = Date.now() - 5000;
  app._guardLastResumeTs = 0;
  app._resumeAttemptsThisUnit = 0;
  app._resumeCapLogged = false;
  video.__state.playCalls = 0;
  for (let i = 0; i < 100; i++) app._tryResumePlayback('cooldown-' + i);
  await sleep(10);
  assertEq(video.__state.playCalls, 1, '冷却窗口内 100 次触发产生的 play() 次数应为 1');
  assertEq(app._resumeAttemptsThisUnit, 1, '计数应为 1');
  note(`100 次连续触发 -> video.play() 实际调用 ${video.__state.playCalls} 次（guardResumeCooldownMs=${app.configs.guardResumeCooldownMs}）`);
  await close(env);
});

await test('E3 次数上限生效：跨冷却窗口连续 100 次触发，play() 恰好 5 次后触顶', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  // play() 被接受但仍保持 paused=true：模拟「播放器接受了 play() 却依旧停滞」的现场
  const video = makeVideo(env, env.window.document, { playImpl: () => Promise.resolve() });
  const app = await boot(env);
  app._isPlaying = true;
  video.__state.paused = true; video.__state.currentTime = 0;
  app._guardLastTime = 0;
  app._guardLastWallTs = Date.now() - 5000;
  app._resumeAttemptsThisUnit = 0;
  app._resumeCapLogged = false;
  video.__state.playCalls = 0;
  for (let i = 0; i < 100; i++) {
    app._guardLastResumeTs = Date.now() - 5000;
    app._tryResumePlayback('cap-' + i);
  }
  await sleep(10);
  assertEq(video.__state.playCalls, 5, '每次冷却都放行的情况下 play() 总数应为上限 5');
  assertEq(app._resumeAttemptsThisUnit, 5, 'resumeAttemptsThisUnit 应为 5');
  assert(env.has('停止抢播'), '缺少触顶提示日志');
  note(`跨冷却 100 次触发 -> video.play() 恰好 ${video.__state.playCalls} 次（resumeMaxAttemptsPerUnit=${app.configs.resumeMaxAttemptsPerUnit}），触顶日志命中`);
  await close(env);
});

await test('E4 用户主动暂停后不抢播；resumeAutoPlay() 后恢复', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  const video = makeVideo(env, env.window.document);
  const app = await boot(env);
  app._isPlaying = true;
  video.__state.paused = true;
  env.window.document.dispatchEvent(new env.window.Event('pointerdown', { bubbles: true }));
  video.dispatchEvent(new env.window.Event('pause'));
  assertEq(app._userPaused, true, 'E4: 用户主动暂停未被识别');
  app._guardLastWallTs = Date.now() - 5000;
  video.__state.playCalls = 0;
  app._resumeAttemptsThisUnit = 0;
  for (let i = 0; i < 100; i++) { app._guardLastResumeTs = 0; app._tryResumePlayback('user-paused-' + i); }
  assertEq(video.__state.playCalls, 0, 'E4: 用户主动暂停后仍在抢播');
  app.resumeAutoPlay();
  app._guardLastWallTs = Date.now() - 5000;
  app._guardLastResumeTs = 0;
  app._tryResumePlayback('after-resume');
  assertEq(video.__state.playCalls, 1, 'E4: resumeAutoPlay() 后未恢复保活');
  note('用户暂停后 100 次触发 0 次 play()；resumeAutoPlay() 后 1 次 play()（保活恢复）');
  await close(env);
});

await test('E5 反向：进度仍在前进 / 暂停宽限期内 → 不抢播', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  const video = makeVideo(env, env.window.document);
  const app = await boot(env);
  app._isPlaying = true;
  app._userPaused = false;
  video.__state.paused = false;
  video.__state.currentTime = 100;
  app._guardLastTime = 0;
  app._guardLastWallTs = Date.now() - 10000;
  app._guardLastResumeTs = 0;
  video.__state.playCalls = 0;
  app._tryResumePlayback('progressing');
  assertEq(video.__state.playCalls, 0, 'E5: 进度在前进时不应抢播');
  video.__state.paused = true;
  video.__state.currentTime = 0;
  app._guardLastWallTs = Date.now() - 100;
  app._guardLastResumeTs = 0;
  app._tryResumePlayback('grace');
  assertEq(video.__state.playCalls, 0, 'E5: 暂停宽限期内不应抢播');
  note(`进度前进(10s 内 currentTime 前进 100s) -> 0 次 play()；暂停 100ms（< 宽限 ${app.configs.guardPausedGraceMs}ms）-> 0 次 play()`);
  await close(env);
});
// ===========================================================================
// F. F5 互动弹窗：只检测、只暂停、零答题动作、零外部网络
// ===========================================================================
group('F. F5 互动弹窗（只检测/只提示/只暂停，不代答）');

await test('F1 弹窗检测 → 暂停跳转 → 选项零点击 → 无网络；弹窗消失后自愈', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  const video = makeVideo(env, env.window.document);
  const dialog = makeDialog(env.window.document);
  const app = await boot(env);
  const found = app._checkInteractionDialog();
  assert(found, 'F1: 未检测到互动答题弹窗');
  assert(found.optionCount >= 3, `F1: 选项计数异常 ${found.optionCount}`);
  assertEq(app._interactionBlocked, true, 'F1: 未进入互动暂停态');
  assert(env.has('检测到视频互动答题弹窗'), 'F1: 缺少检测提示');
  assert(env.has('按设计脚本不会自动答题'), 'F1: 缺少「不会自动答题」声明');
  assert(env.has('请手动完成该互动题'), 'F1: 缺少人工处理提示');
  const beforeNav = env.navTitles().length;
  app.nextUnit(); await sleep(20);
  assertEq(env.navTitles().length, beforeNav, 'F1: 弹窗期间仍然自动跳转');
  assert(env.has('已暂停自动跳转'), 'F1: 弹窗期间缺少暂停提示');
  assertReleased(app, env, null, 'F1');
  const answerClicks = env.clicks.filter((c) => ['li', 'input', 'button', 'form', 'label'].includes(c.tag) || c.cls.includes('Zy_TItle')).length;
  assertEq(answerClicks, 0, 'F1: 互动题选项/提交控件被点击（存在代答风险）');
  assertEq([env.net.fetch, env.net.xhr, env.net.beacon], [0, 0, 0], 'F1: 发生 fetch/XHR/sendBeacon 调用');
  assertEq(env.externalRequests(), [], 'F1: 出现外部请求 URL');
  assertEq(env.net.scripts.length, 0, 'F1: 动态创建了 script 元素');
  // 真实轮询路径（缩短间隔后重启 watcher，验证不是只靠直接调用）
  app._stopInteractionWatcher();
  app.configs.interactionPollMs = 40;
  app.run();
  await sleep(150);
  assertEq(app._interactionBlocked, true, 'F1: 真实轮询未检测到弹窗');
  dialog.remove();
  await sleep(250);
  assertEq(app._interactionBlocked, false, 'F1: 弹窗消失后未恢复');
  assert(env.has('互动答题弹窗已消失'), 'F1: 缺少恢复日志');
  assertEq([env.net.fetch, env.net.xhr, env.net.beacon], [0, 0, 0], 'F1: 恢复过程中发生网络调用');
  note(`optionCount=${found.optionCount}；文本="${found.text}"；答题控件点击=0；fetch/XHR/beacon=0/0/0；弹窗移除后自愈`);
  await close(env);
});

await test('F2 反例：互动弹窗藏在 2 层 iframe 内也能检出（且不点击）', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  const f1 = makeFrame(env, env.window.document, 'f1');
  const f2 = makeFrame(env, f1.contentDocument, 'f2');
  makeDialog(f2.contentDocument);
  const app = await boot(env);
  const found = app._findInteractionDialog(env.window.document, 0);
  assert(found, 'F2: 嵌套 frame 内的互动弹窗未被检出');
  assert(found.text.includes('请选择'), 'F2: 检出的弹窗文本不正确');
  const answerClicks = env.clicks.filter((c) => ['li', 'input', 'button', 'label'].includes(c.tag)).length;
  assertEq(answerClicks, 0, 'F2: 嵌套弹窗场景出现点击');
  note(`嵌套深度 2 的弹窗被检出：text="${found.text}", optionCount=${found.optionCount}, 点击=0`);
  await close(env);
});

await test('F3 运行窗口内零外部请求（含自动跳转全链路）', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree(), '<div class="prev_title" title="视频">视频</div>') });
  const video = makeVideo(env, env.window.document);
  const app = await boot(env);
  app.nextUnit();
  video.dispatchEvent(new env.window.Event('ended'));
  await sleep(1300);
  assertEq([env.net.fetch, env.net.xhr, env.net.beacon], [0, 0, 0], 'F3: 全链路发生网络调用');
  assertEq(env.externalRequests(), [], 'F3: 存在外部请求 URL');
  assertEq(env.net.scripts.length, 0, 'F3: 页面已提供 jQuery 时不应再插入 CDN script');
  note(`完整「播放→结束→自动跳转」链路结束后：fetch/XHR/beacon=0/0/0，外部 URL=0，动态 script=0`);
  await close(env);
});

// ===========================================================================
// G. F6 视频元素发现
// ===========================================================================
group('G. F6 视频元素发现（嵌套 frame / 深度边界 / 缓存失效）');

await test('G1 3 层嵌套 frame 内的 video 能被找到并接管播放', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree(), '<div class="prev_title" title="视频">视频</div>') });
  const f1 = makeFrame(env, env.window.document, 'f1');
  const f2 = makeFrame(env, f1.contentDocument, 'f2');
  const f3 = makeFrame(env, f2.contentDocument, 'f3');
  const deep = makeVideo(env, f3.contentDocument);
  const app = await boot(env);
  assertEq(app._getVideoEl(), deep, 'G1: 3 层嵌套 frame 内的 video 未被找到');
  assert(app._isPlaying === true, 'G1: 未进入播放态');
  assertEq(app._eventVideoEl, deep, 'G1: 事件未绑定到深层 video');
  note(`深度 3 的 video 被找到，_isPlaying=true，事件已绑定；ownerDocument 监听已挂上`);
  await close(env);
});

await test('G2 深度边界：深度 4 命中、深度 5 被上限拒绝（无无限递归）', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  let doc = env.window.document;
  const frames = [];
  for (let i = 0; i < 5; i++) { const f = makeFrame(env, doc, 'n' + i); frames.push(f); doc = f.contentDocument; }
  const atDepth4 = makeVideo(env, frames[3].contentDocument);
  const app = await boot(env);
  assertEq(app._getVideoEl(), atDepth4, 'G2: 深度 4 的 video 应命中');
  atDepth4.remove();
  const atDepth5 = makeVideo(env, frames[4].contentDocument);
  assertEq(app._getVideoEl(), null, 'G2: 超过 videoFrameMaxDepth 仍被找到，深度保护失效');
  assertEq(app.configs.videoFrameMaxDepth, 4, 'G2: 深度上限配置不为 4');
  note(`深度4命中、深度5被拒（videoFrameMaxDepth=${app.configs.videoFrameMaxDepth}），未出现无限递归`);
  void atDepth5;
  await close(env);
});

await test('G3 反例：切换小节后 video 元素被替换，不得复用已失效元素', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  const v1 = makeVideo(env, env.window.document);
  let v2 = null;
  const app = await boot(env);
  assertEq(app._videoEl, v1, 'G3: 初始未缓存 v1');
  v1.remove();
  v2 = makeVideo(env, env.window.document);
  await app.play(); await sleep(20);
  assertEq(app._videoEl, v2, 'G3: 旧 video 脱离文档后仍被复用');
  assert(env.has('视频元素缓存已失效'), 'G3: 缺少缓存失效日志');
  assertEq(app._eventVideoEl, v2, 'G3: 视频事件未重新绑定到新元素');
  assertEq(env.listenerDeltaOf(v1), 0, `G3: 旧 video 上仍残留 ${env.listenerDeltaOf(v1)} 个监听器`);
  note(`旧元素脱离文档 -> 缓存失效 -> 重新绑定到新元素；旧元素监听器净额=0`);
  await close(env);
});

await test('G4 反例：playCurrentIndex 切换小节时缓存立即失效，随后绑定新元素', async ({ note }) => {
  const env = createEnv({
    html: pageHTML(threeLeafTree()),
    onSectionClick: (e) => {
      const old = e.window.document.querySelector('video');
      if (old) old.remove();
      if (!e.window.document.__v2) e.window.document.__v2 = makeVideo(e, e.window.document);
    },
  });
  const v1 = makeVideo(env, env.window.document);
  const app = await boot(env);
  assertEq(app._videoEl, v1, 'G4: 初始未缓存 v1');
  app.nextUnit(); await sleep(30);
  assert(env.has('切换小节'), 'G4: 未记录切换小节');
  assertEq(app._videoEl, null, 'G4: 切换小节后仍复用旧 video 缓存');
  assertEq(env.listenerDeltaOf(v1), 0, 'G4: 旧 video 监听器未清理');
  await app.play(); await sleep(20);
  assertEq(app._videoEl, env.window.document.__v2, 'G4: 未绑定到切换后的新 video');
  assertEq(app._eventVideoEl, env.window.document.__v2, 'G4: 事件未绑定到新 video');
  note(`切换小节：点击=${JSON.stringify(env.navTitles())}，旧元素监听净额=0，play() 后绑定新元素成功`);
  await close(env);
});

// ===========================================================================
// H. 定时器/监听器总账
// ===========================================================================
group('H. 定时器与监听器总账（重复 run / destroy 无残留）');

await test('H1 定时器登记点静态审计：所有 setTimeout 均登记 _timers + 3 处 setInterval', ({ note }) => {
  const stLines = CODE_LINES.map((l, i) => [i + 1, l]).filter(([, l]) => /setTimeout\s*\(/.test(l));
  const siLines = CODE_LINES.map((l, i) => [i + 1, l]).filter(([, l]) => /setInterval\s*\(/.test(l));
  assert(stLines.length >= 1, '未找到 setTimeout 登记点');
  const unregistered = stLines.filter(([n]) => {
    const scope = CODE_LINES.slice(n - 1, n + 6).join('\n');
    return !/_timers\.add\(timer\)|_timers\.add\(id\)/.test(scope);
  }).map(([n]) => n);
  assertEq(unregistered, [], `存在未登记到 _timers 的 setTimeout 调用点（第${unregistered.join(',')}行），destroy() 后可能残留`);
  assertEq(siLines.length, 3, `setInterval 调用点应为 3（boot / 视频监控 / 互动轮询），实际 ${siLines.length}: 第${siLines.map(([n]) => n).join(',')}行`);
  const intervalsText = siLines.map(([n, l]) => `第${n}行: ${l.trim().slice(0, 56)}`).join(' | ');
  note(`setTimeout 登记点 ${stLines.length} 处（第${stLines.map(([n]) => n).join('/')}行，均写入 _timers）；setInterval ${siLines.length} 处 -> ${intervalsText}`);
});

await test('H2 重复 run() 不叠加定时器/不重复点击', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree(), '<div class="prev_title" title="视频">视频</div>') });
  makeVideo(env, env.window.document);
  const app = await boot(env);
  await sleep(30);
  const intervals1 = env.pendingIntervals().length;
  for (let i = 0; i < 3; i++) { app.run(); await sleep(40); }
  assertEq(env.pendingIntervals().length, intervals1, `重复 run() 后活动 interval 从 ${intervals1} 变为 ${env.pendingIntervals().length}`);
  assert(app._checkInterval !== null && app._interactionWatcher !== null, 'H2: run() 后监控定时器缺失');
  assertEq(env.count('=== 学习通自动刷课脚本 V3.4 启动 ==='), 4, 'H2: 启动日志次数应等于 run() 调用次数');
  assertEq(env.navTitles(), [], 'H2: 重复 run() 造成额外点击');
  note(`活动 interval 数在 1 次与 4 次 run() 后均为 ${intervals1}；启动日志=4；额外点击=0`);
  await close(env);
});

await test('H3 destroy() 后定时器/监听器净零，且不再产生日志与点击', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree(), '<div class="prev_title" title="视频">视频</div>') });
  const video = makeVideo(env, env.window.document);
  const app = await boot(env);
  await sleep(30);
  app.destroy(); await sleep(20);
  assertEq(env.activeTimerCount(), 0, 'H3: destroy() 后仍有活动定时器: ' + JSON.stringify(env.activeTimers()));
  assertEq([app._checkInterval, app._interactionWatcher], [null, null], 'H3: 监控句柄未清空');
  const logsAfter = env.logs.length;
  const clicksAfter = env.clicks.length;
  await sleep(400);
  assertEq(env.logs.length, logsAfter, `H3: destroy() 后仍有 ${env.logs.length - logsAfter} 条定时器日志`);
  assertEq(env.clicks.length, clicksAfter, 'H3: destroy() 后仍有定时器触发点击');
  assertEq(env.listenerDeltaSinceBaseline('document'), 0, 'H3: document 监听器未净零');
  assertEq(env.listenerDeltaSinceBaseline('window'), 0, 'H3: window 监听器未净零');
  assertEq(env.listenerDeltaOf(video), 0, 'H3: video 监听器未净零');
  // destroy -> run -> destroy 循环
  for (let i = 0; i < 3; i++) {
    app.run(); await sleep(40);
    assert(env.activeTimerCount() > 0, 'H3: run() 未重新建立定时器');
    app.destroy(); await sleep(20);
    assertEq(env.activeTimerCount(), 0, `H3: 第 ${i + 1} 轮 destroy() 后仍有定时器`);
  }
  assertEq(env.listenerDeltaSinceBaseline('document'), 0, 'H3: 3 轮 destroy→run 后 document 监听器未净零');
  note(`destroy 后活动定时器=0、400ms 内新增日志=0/点击=0；3 轮 destroy→run 后监听器净额仍为 0`);
  await close(env);
});

// ===========================================================================
// I. 队长指定用例：initializePlayer 二次调用可达性 + 自动跳转定时器竞态
// ===========================================================================
group('I. initializePlayer 二次调用可达性 / 自动跳转定时器竞态');

await test('I1 单次 eval 内 initializePlayer() 不可达第二次（静态+动态证据）', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  const app = await boot(env);
  const bootLogs1 = env.count('=== 学习通自动刷课脚本 V3.4 启动 ===');
  assertEq(bootLogs1, 1, 'I1: 单次 eval 后初始化次数应为 1');
  await sleep(150);
  assertEq(env.count('=== 学习通自动刷课脚本 V3.4 启动 ==='), 1, 'I1: boot 定时器在初始化之后再次初始化');
  assertEq(env.window.__xuexitongPlayerV3BootTimer, null, 'I1: boot 定时器句柄未置空（可能二次触发）');
  assertEq(env.pendingIntervals().filter((t) => t.nth === 1).length, 0, 'I1: boot interval 仍在活动');
  assert(env.window.app === env.window.__xuexitongPlayerV3, 'I1: window.app 与 APP_KEY 指向不同实例');
  const firstApp = app;
  // 等价于「再次粘贴脚本」：旧实例必须被 destroy，且不得留下第二套定时器
  env.window.eval(SOURCE);
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && env.window.__xuexitongPlayerV3 === firstApp) await sleep(20);
  const second = env.window.__xuexitongPlayerV3;
  assert(second && second !== firstApp, 'I1: 二次粘贴未创建新实例');
  assertEq([firstApp._checkInterval, firstApp._interactionWatcher, firstApp._nextUnitPending], [null, null, false], 'I1: 前一实例未被 destroy 干净');
  assertEq(env.count('=== 学习通自动刷课脚本 V3.4 启动 ==='), 2, 'I1: 初始化次数应为 2（两次 eval）');
  assert(env.pendingIntervals().length <= 2, `I1: interval 叠加到 ${env.pendingIntervals().length} 个`);
  note(`单次 eval 内 initializePlayer 只发生 1 次；boot 句柄置空、interval 停止；二次 eval 会先 destroy 旧实例（旧实例定时器/监听器全清）`);
  await close(env);
});

await test('I2 防御验证：轮询 tick 与 ended 事件双触发时，_handlingVideoEnd 去重只跳一节', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree(), '<div class="prev_title" title="视频">视频</div>') });
  const video = makeVideo(env, env.window.document);
  const app = await boot(env);
  assert(app._isPlaying === true, 'I2: 未进入播放态');
  video.__state.ended = true;
  app._checkVideoStatus();
  const afterTick = env.activeTimeouts(1000).length;
  video.dispatchEvent(new env.window.Event('ended'));
  const afterEvent = env.activeTimeouts(1000).length;
  const endedLogs = env.count('播放完成');
  note(`轮询 tick 后 1000ms 跳转定时器=${afterTick}；ended 事件后=${afterEvent}；「播放完成」日志=${endedLogs} 次（双触发确实发生）`);
  assertEq(afterEvent, afterTick, `I2: 双触发产生了重复的自动跳转定时器（${afterTick} -> ${afterEvent}）`);
  await sleep(1300);
  const navCount = env.count('准备切换到下一小节');
  assertEq(navCount, 1, `I2: 单次播放结束触发了 ${navCount} 次小节切换（应恰好 1 次）`);
  assertEq(env.navTitles(), ['1.2'], 'I2: 跳转序列异常（疑似跳过小节）');
  note(`去重生效：单次结束仅 1 次「准备切换到下一小节」，点击=${JSON.stringify(env.navTitles())}，未跳过 1.2`);
  await close(env);
});

await test('I3 回归验证（原 V1）：视频结束的自动跳转定时器已登记、可被取消、不再多跳一节', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree(), '<div class="prev_title" title="视频">视频</div>') });
  const video = makeVideo(env, env.window.document);
  const app = await boot(env);
  video.__state.ended = true;
  video.dispatchEvent(new env.window.Event('ended'));
  assertEq(env.activeTimeouts(1000).length, 1, 'I3: 未排定自动跳转定时器');
  assert(app._delayedNextUnitTimer !== null && app._delayedNextUnitTimer !== undefined, 'I3: 自动跳转定时器未登记到 _delayedNextUnitTimer（V1 复现）');
  app.nextUnit();
  await sleep(20);
  assertEq(env.navTitles(), ['1.2'], 'I3: 手动前进失败');
  assertEq(app._delayedNextUnitTimer, null, 'I3: nextUnit 入口未取消陈旧定时器');
  video.dispatchEvent(new env.window.Event('play'));
  await sleep(1300);
  assertEq(env.navTitles(), ['1.2'], 'I3: 陈旧定时器仍然多跳了一节（V1 回归）');
  assertEq(env.activeTimeouts(1000).length, 0, 'I3: 仍有待执行的自动跳转定时器');
  assertEq(app._handlingVideoEnd, false, 'I3: 结束去重标志未复位');
  // playCurrentIndex 会解绑旧视频事件；先重新 play() 让 ended 监听重新绑定，再验「取消后仍能正常跳转」
  await app.play();
  await sleep(20);
  video.__state.ended = true;
  video.dispatchEvent(new env.window.Event('ended'));
  assert(app._delayedNextUnitTimer !== null && app._delayedNextUnitTimer !== undefined, 'I3: 取消后下一次结束未再排定跳转（去重标志卡死）');
  await sleep(1200);
  assertEq(env.navTitles(), ['1.2', '1.3'], 'I3: 下一次结束应正常跳到 1.3');
  note('ended 后定时器已登记并被 nextUnit 取消：手动到 1.2 后 1.2s 未再跳；再次 ended 仍能正常跳到 1.3（去重标志已复位）');
  await close(env);
});

// ===========================================================================
// J. 新增交互面抽查（PR #48 移植代码会主动点击页面按钮，必须验证范围与上限）
// ===========================================================================
group('J. 新增交互面抽查（任务点弹窗自动点击）');

await test('J1 「任务点未完成」弹窗：只点「去学习/去完成」，绝不点「下一节」，且受每小节上限约束', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  const doc = env.window.document;
  const dialog = doc.createElement('div');
  dialog.className = 'layui-layer';
  dialog.innerHTML = '<div class="layui-layer-title">提示</div><div>当前章节还有任务点未完成</div>'
    + '<button id="goLearn">去学习</button><button id="goNext">下一节</button>';
  doc.body.appendChild(dialog);
  const app = await boot(env);
  app._taskDialogClicksThisUnit = 0;
  app._taskDialogCapLogged = false;
  const before = env.clicks.length;
  let handled = 0;
  for (let i = 0; i < 10; i++) {
    app._lastTaskPointDialogClickAt = 0; // 跳过 8s 冷却，单独验证「每小节次数上限」
    if (app._handleTaskPointDialog('verifier-' + i)) handled++;
  }
  const clicks = env.clicks.slice(before);
  const goLearn = clicks.filter((c) => c.text.includes('去学习')).length;
  const goNext = clicks.filter((c) => c.text.includes('下一节')).length;
  assert(handled >= 1, 'J1: 未识别到「任务点未完成」弹窗');
  assertEq(goNext, 0, 'J1: 点击了「下一节」（契约要求点「去学习/去完成」回到未完成任务点）');
  assertEq(goLearn, app.configs.taskDialogMaxClicksPerUnit, 'J1: 「去学习」点击次数应等于每小节上限 ' + app.configs.taskDialogMaxClicksPerUnit);
  assert(env.has('停止点击以免循环'), 'J1: 缺少触顶提示日志');
  note('识别到弹窗后「去学习」点击 ' + goLearn + ' 次（上限=' + app.configs.taskDialogMaxClicksPerUnit + '）、「下一节」点击 ' + goNext + ' 次；触顶提示命中');
  await close(env);
});

// ===========================================================================
// K. PR #48 移植面专项（任务点弹窗 / 任务点下标 / 任务类型优先级 / 递归上限）
// ===========================================================================
group('K. PR #48 移植面专项（任务点弹窗 / 任务点下标 / 任务类型 / 递归上限）');

await test('K1 「任务点未完成」弹窗：原生 confirm 零调用、冷却生效、只点「去学习/去完成」；假弹窗不误吞', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  const doc = env.window.document;
  let confirmCalls = 0;
  env.window.confirm = function () { confirmCalls++; return true; };
  const decoy = doc.createElement('div');
  decoy.className = 'layui-layer';
  decoy.innerHTML = '<div>当前小节还有任务点未完成</div><button id="decoyNext">下一节</button>';
  doc.body.appendChild(decoy);
  const app = await boot(env);
  const beforeDecoy = env.clicks.length;
  const decoyHandled = app._handleTaskPointDialog('decoy-probe');
  assertEq(decoyHandled, false, 'K1: 假弹窗（文案相近但不是任务点弹窗）被误判');
  assertEq(env.clicks.length, beforeDecoy, 'K1: 假弹窗场景发生了点击');
  const dialog = doc.createElement('div');
  dialog.className = 'layui-layer';
  dialog.innerHTML = '<div>当前章节还有任务点未完成</div><button id="goLearn">去学习</button><button id="goFinish">去完成</button><button id="goNext">下一节</button>';
  doc.body.appendChild(dialog);
  app._taskDialogClicksThisUnit = 0;
  app._taskDialogCapLogged = false;
  app._lastTaskPointDialogClickAt = 0;
  const before = env.clicks.length;
  const first = app._handleTaskPointDialog('k1-first');
  const second = app._handleTaskPointDialog('k1-cooldown');
  const afterCooldown = env.clicks.length - before;
  assertEq(first, true, 'K1: 真实弹窗未被识别');
  assertEq(second, false, 'K1: 冷却期内仍然点击');
  assertEq(afterCooldown, 1, 'K1: 冷却期内点击次数应为 1，实际 ' + afterCooldown);
  for (let i = 0; i < 10; i++) { app._lastTaskPointDialogClickAt = 0; app._handleTaskPointDialog('k1-cap-' + i); }
  const clicks = env.clicks.slice(before);
  const goTarget = clicks.filter((c) => c.text.includes('去学习') || c.text.includes('去完成')).length;
  const goNext = clicks.filter((c) => c.text.includes('下一节')).length;
  assertEq(goNext, 0, 'K1: 点击了「下一节」（契约要求点「去学习/去完成」）');
  assertEq(goTarget, app.configs.taskDialogMaxClicksPerUnit, 'K1: 目标按钮点击次数应等于上限 ' + app.configs.taskDialogMaxClicksPerUnit);
  assertEq(confirmCalls, 0, 'K1: 调用了原生 confirm（不应自动确认平台弹窗）');
  assert(env.has('停止点击以免循环'), 'K1: 缺少触顶提示');
  note('假弹窗返回 false 且零点击；真实弹窗冷却期内仅 1 次点击；总计「去学习/去完成」' + goTarget + ' 次（上限=' + app.configs.taskDialogMaxClicksPerUnit + '）、「下一节」' + goNext + ' 次、原生 confirm ' + confirmCalls + ' 次');
  await close(env);
});

await test('K2 _getNextPendingVideoTaskIndex：跳过已完成、不回头重播、全完成返回 -1', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree()) });
  const doc = env.window.document;
  const wrap = doc.createElement('div');
  doc.body.appendChild(wrap);
  const makeTask = (id, cls) => {
    const cell = doc.createElement('div');
    wrap.appendChild(cell);
    const f = doc.createElement('iframe');
    f.id = id;
    if (cls) f.className = cls;
    cell.appendChild(f);
    return f;
  };
  const A = makeTask('taskA', 'ans-job-finished');
  const B = makeTask('taskB', 'ans-job-finished');
  const C = makeTask('taskC', '');
  const D = makeTask('taskD', '');
  const app = await boot(env);
  const frames = [A, B, C, D];
  assertEq(app._isVideoTaskFrameComplete(A), true, 'K2: A 应被判为已完成');
  assertEq(app._isVideoTaskFrameComplete(C), false, 'K2: C 应被判为未完成');
  assertEq(app._areAllVideoTasksComplete(frames), false, 'K2: 存在未完成任务点时应为 false');
  assertEq(app._getNextPendingVideoTaskIndex(frames, 0), 2, 'K2: 从 0 起应跳过已完成的 A/B 落到 C');
  assertEq(app._getNextPendingVideoTaskIndex(frames, 2), 2, 'K2: from=2 应返回 2');
  assertEq(app._getNextPendingVideoTaskIndex(frames, 3), 3, 'K2: from=3 应返回 3');
  assertEq(app._getNextPendingVideoTaskIndex([A, B], 0), -1, 'K2: 全完成应返回 -1');
  assertEq(app._areAllVideoTasksComplete([A, B]), true, 'K2: 全完成应为 true');
  assertEq(app._areAllVideoTasksComplete([]), false, 'K2: 空集合应为 false');
  note('A/B 已完成、C/D 未完成：from=0→2、from=2→2、from=3→3、[A,B] 全完成→-1（不回退重播）');
  await close(env);
});

await test('K3 任务点全完成 → 交回无视频分支且有界前进，触顶后不再前进（无死循环）', async ({ note }) => {
  const html = pageHTML(treeHTML([
    { title: '第1章', nodes: [{ title: '1.1', active: true }, { title: '1.2' }, { title: '1.3' }] },
    { title: '第2章', nodes: [{ title: '2.1' }, { title: '2.2' }] },
  ]), '<iframe class="ans-insertvideo-online ans-job-finished" id="taskVideo"></iframe>');
  const env = createEnv({ html });
  const app = await boot(env);
  assert(app._getVideoEl() === null, 'K3: 全完成后应返回 null 交给无视频分支');
  assertEq(app._videoTaskCount, 1, 'K3: 应识别到 1 个视频任务点');
  assertEq(app._videoTaskAllComplete, true, 'K3: 应标记任务点全部完成');
  assert(env.has('视频任务点均已完成，准备切换下一小节'), 'K3: 缺少任务点完成日志');
  assert(env.navTitles().length >= 1, 'K3: boot 后应已按任务点完成自动前进至少一次');
  for (let i = 0; i < 8; i++) { await app.play(); await sleep(20); }
  assertEq(env.navTitles(), ['1.2', '1.3', '2.1'], 'K3: 有界前进序列不符');
  assertEq(app._consecutiveNoVideoAdvances, 3, 'K3: 计数应停在上限 3');
  assert(env.has('连续自动前进已达上限'), 'K3: 缺少触顶日志');
  const atCap = env.navTitles().length;
  for (let i = 0; i < 5; i++) { await app.play(); await sleep(15); }
  assertEq(env.navTitles().length, atCap, 'K3: 触顶后仍在前进（疑似死循环）');
  note('任务点全完成 → _getVideoEl()=null 且标记 _videoTaskAllComplete=true；有界前进 ' + JSON.stringify(env.navTitles()) + '，上限 ' + app.configs.maxConsecutiveNoVideoAdvances + ' 次后点击数不再增长');
  await close(env);
});

await test('K4 任务类型判定：视频信号优先于阅读标签；无视频时按 reading/quiz/unknown 分类', async ({ note }) => {
  const envA = createEnv({ html: pageHTML(threeLeafTree(), '<div class="prev_title" title="阅读">阅读</div>') });
  makeVideo(envA, envA.window.document);
  const appA = await boot(envA);
  const signalA = appA._hasVideoTaskSignal();
  const kindA = appA._getTaskKind();
  assertEq(signalA, true, 'K4: 视频信号未被识别');
  assertEq(kindA, 'video', 'K4: 阅读标签 + 视频任务时应按视频处理（优先级错误）');
  await close(envA);
  const envB = createEnv({ html: pageHTML(threeLeafTree(), '<div class="prev_title" title="阅读">阅读</div>') });
  const appB = await boot(envB);
  const signalB = appB._hasVideoTaskSignal();
  const kindB = appB._getTaskKind();
  assertEq(signalB, false, 'K4: 无视频时不应有视频信号');
  assertEq(kindB, 'reading', 'K4: 仅阅读标签时应为 reading');
  await close(envB);
  const envC = createEnv({ html: pageHTML(threeLeafTree(), '<div class="prev_title" title="章节测验">章节测验</div>') });
  const appC = await boot(envC);
  const kindC = appC._getTaskKind();
  assertEq(kindC, 'quiz', 'K4: 章节测验应为 quiz');
  await close(envC);
  const envD = createEnv({ html: pageHTML(threeLeafTree()) });
  const appD = await boot(envD);
  const kindD = appD._getTaskKind();
  assertEq(kindD, 'unknown', 'K4: 无信号时应为 unknown');
  await close(envD);
  note('A(阅读标签+video)=' + kindA + '；B(仅阅读)=' + kindB + '；C(章节测验)=' + kindC + '；D(无信号)=' + kindD);
});

await test('K6 披露核查：t6 的 document 守卫只在窗口已销毁时生效，活跃页面语义不变', async ({ note }) => {
  const env = createEnv({ html: pageHTML(threeLeafTree(), '<div class="prev_title" title="章节测验">章节测验</div>') });
  const app = await boot(env);
  const activeTitle = app._currentStepTitle();
  const activeText = app._currentTaskText();
  assertEq(activeTitle, '章节测验', 'K6: 活跃页面上 _currentStepTitle 被守卫影响（语义变化）');
  assert(activeText.indexOf('章节测验') >= 0, 'K6: 活跃页面上 _currentTaskText 未包含页面文本');
  app.destroy();
  env.dom.window.close();
  await sleep(5);
  let afterTitle = null;
  let afterThrew = null;
  try { afterTitle = app._currentStepTitle(); } catch (e) { afterThrew = String(e && e.message); }
  assertEq(afterThrew, null, 'K6: 窗口销毁后 _currentStepTitle 仍抛异常（守卫未生效）');
  assertEq(afterTitle, '', 'K6: 窗口销毁后 _currentStepTitle 应返回空串');
  let afterText = null;
  try { afterText = app._currentTaskText(); } catch (e) { afterThrew = String(e && e.message); }
  assertEq(afterThrew, null, 'K6: 窗口销毁后 _currentTaskText 仍抛异常');
  assertEq(afterText, '', 'K6: 窗口销毁后 _currentTaskText 应返回空串');
  note('活跃页面：_currentStepTitle="' + activeTitle + '"、_currentTaskText 含页面文本（守卫零影响）；window.close() 之后：两个方法均返回空串而非抛 TypeError（防御性 no-op，已钉扎）');
  await close(env);
});

await test('K5 _findInteractionDialog：递归深度有上限、深层弹窗不误判、扇出不卡死', async ({ note }) => {
  const envDeep = createEnv({ html: pageHTML(threeLeafTree()) });
  let d = envDeep.window.document;
  for (let i = 0; i < 6; i++) { const f = makeFrame(envDeep, d, 'deep' + i); d = f.contentDocument; }
  makeDialog(d);
  const appDeep = await boot(envDeep);
  const t0 = Date.now();
  const deepFound = appDeep._findInteractionDialog(envDeep.window.document, 0);
  const deepMs = Date.now() - t0;
  assertEq(deepFound, null, 'K5: 超过深度上限的弹窗仍被递归检出（无上限保护）');
  assert(deepMs < 2000, 'K5: 深层扫描耗时异常 ' + deepMs + 'ms');
  assertEq(appDeep._checkInteractionDialog(), null, 'K5: 深层弹窗不应被当作互动弹窗');
  assertEq(appDeep._interactionBlocked, false, 'K5: 深层弹窗误触发暂停');
  await close(envDeep);
  const envShallow = createEnv({ html: pageHTML(threeLeafTree()) });
  const f1 = makeFrame(envShallow, envShallow.window.document, 's1');
  const f2 = makeFrame(envShallow, f1.contentDocument, 's2');
  makeDialog(f2.contentDocument);
  const appShallow = await boot(envShallow);
  assert(appShallow._findInteractionDialog(envShallow.window.document, 0), 'K5: 2 层内的弹窗未被检出');
  await close(envShallow);
  const envFan = createEnv({ html: pageHTML(threeLeafTree()) });
  for (let i = 0; i < 20; i++) makeFrame(envFan, envFan.window.document, 'fan' + i);
  const appFan = await boot(envFan);
  const t1 = Date.now();
  assertEq(appFan._findInteractionDialog(envFan.window.document, 0), null, 'K5: 无弹窗时应返回 null');
  const fanMs = Date.now() - t1;
  assert(fanMs < 2000, 'K5: 扇出扫描耗时异常 ' + fanMs + 'ms');
  await close(envFan);
  note('6 层嵌套（上限 ' + appDeep.configs.videoFrameMaxDepth + '）→ null，耗时 ' + deepMs + 'ms；2 层内弹窗正常检出；20 路 iframe 扇出 ' + fanMs + 'ms 无卡死');
});

// ===========================================================================
// 汇总
// ===========================================================================
console.log('\n================ 汇总 ================');
for (const r of results) {
  console.log(`${r.status === 'pass' ? 'PASS' : 'FAIL'}  ${r.group} :: ${r.name}`);
}
const passed = results.filter((r) => r.status === 'pass').length;
const failed = results.length - passed;
console.log(`\n通过 ${passed}/${results.length}，失败 ${failed}`);
if (unhandled.length) {
  console.log('未处理的异常/拒绝:');
  for (const u of unhandled) console.log('  ' + u);
}
const sourceAtEnd = readFileSync(sourcePath, 'utf8');
const sourceStable = sha256(sourceAtEnd) === SOURCE_SHA_AT_START;
console.log(`验证目标稳定性：${sourceStable ? '源码在运行期间未被修改（结论有效）' : '源码在运行期间被修改，本次结论作废，必须重跑'}`);
if (!sourceStable) process.exitCode = 1;

if (failed || unhandled.length) {
  console.log('\n失败明细:');
  for (const f of failures) console.log(`- ${f.name}\n${f.error}`);
  process.exitCode = 1;
} else {
  if (findings.length) {
    console.log(`\n复现缺陷 ${findings.length} 条（需产品修复后重验）:`);
    for (const f of findings) {
      console.log(`  [${f.severity}] ${f.id}: ${f.problem}`);
      console.log(`      证据: ${f.evidence}`);
      console.log(`      修复建议: ${f.requiredFix}`);
    }
  } else {
    console.log('对抗性验证全部通过（未发现可证伪缺陷）。');
  }
}