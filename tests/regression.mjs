#!/usr/bin/env node
/**
 * V3.4 回归测试（jsdom，不联网）
 *
 * 运行：node tests/regression.mjs            （在 repo/ 目录下执行）
 * 可用 XT_SOURCE=<path> 指向别的源码，用来证明这些用例确实能捕获缺陷，
 * 例如： XT_SOURCE=../br/master/xuexitongScript-master/v3_optimized.js node tests/regression.mjs
 *
 * 覆盖 t3 验收项：
 *   F1 nextUnit() 死锁：失败的 play() 之后仍可再次触发
 *   F2 同一章 3 个视频节点按 1→2→3 推进；解析失败时明确报错且不静默跳章
 *   F3 无视频节点：可识别完成才前进，识别不了则安全停止且连续前进受上限约束
 *   F4 不再劫持 document/window 的 mouseout/mouseleave；恢复播放受冷却与次数上限约束
 *   F5 互动答题弹窗检测与暂停跳转；不存在自动答题与外部网络/大模型调用
 *   F6 _getVideoEl 选择器覆盖、嵌套 frame 深度上限、切换小节时缓存失效
 *   F7 README 仓库内链接有效、默认配置与代码一致、启动失败有可操作提示
 *   F8 历史 V1 脚本 xuexitong.js 的入口点击已加固（无未保护的 querySelector(...).click()，且仍能通过 node --check）
 *
 * 依赖：工作区已装好的 jsdom@24 + jquery@3.7.1（tools/node_modules，repo/node_modules 为目录联接）。
 * 测试注入真实 jQuery（window.jQuery / window.$），只对 jsdom 缺失的排版能力（offsetWidth/getBoundingClientRect）做显式桩；
 * 用虚拟时钟替换 window 的 setTimeout/setInterval，使行为确定、无需等待真实时间，也不会让 node 进程挂住。
 * 本文件既可直接运行，也可被其它测试 import（导出 createEnv / check 等）。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '..');
const workspaceRoot = resolve(repoRoot, '..');
export const sourcePath = resolve(process.env.XT_SOURCE || resolve(repoRoot, 'v3_optimized.js'));

function loadDependency(name) {
    // 依赖必须来自工作区已装好的 tools/node_modules：
    // repo/node_modules 是指向它的目录联接（junction），所以先直接 require(name)，
    // 联接缺失时再回退到绝对路径 require，保证测试不会去联网安装。
    const candidates = [name, resolve(workspaceRoot, 'tools/node_modules', name)];
    const errors = [];
    for (const candidate of candidates) {
        try {
            return require(candidate);
        } catch (error) {
            errors.push(`${candidate}: ${error.message}`);
        }
    }
    throw new Error(`无法加载依赖 ${name}（期望 tools/node_modules 或 repo/node_modules 联接）：\n${errors.join('\n')}`);
}
const { JSDOM } = loadDependency('jsdom');
const jqueryFactory = loadDependency('jquery');

const openEnvs = [];

const drain = () => new Promise((r) => setImmediate(r));

// ---------------------------------------------------------------------------
// 下面三个函数会被 toString() 后注入 jsdom 的 window 里执行，
// 因此只能使用 window 自身的 API，不能引用本文件的模块级变量。
// ---------------------------------------------------------------------------

function installClock(win) {
    const clock = { now: 1000000, seq: 0, timers: new Map(), runs: 0, errors: [] };
    const add = (fn, ms, args, interval) => {
        const id = ++clock.seq;
        clock.timers.set(id, { fn, args, at: clock.now + Math.max(0, Number(ms) || 0), interval });
        return id;
    };
    win.setTimeout = function (fn, ms) { return add(fn, ms, Array.prototype.slice.call(arguments, 2), null); };
    win.setInterval = function (fn, ms) { return add(fn, ms, Array.prototype.slice.call(arguments, 2), Math.max(1, Number(ms) || 1)); };
    win.clearTimeout = function (id) { clock.timers.delete(id); };
    win.clearInterval = function (id) { clock.timers.delete(id); };
    win.Date.now = function () { return clock.now; };
    clock.pending = function () { return clock.timers.size; };
    clock.tick = function (ms) {
        const target = clock.now + Math.max(0, Number(ms) || 0);
        let guard = 0;
        for (;;) {
            let pickId = -1;
            let pick = null;
            for (const entry of clock.timers) {
                const id = entry[0];
                const timer = entry[1];
                if (timer.at > target) continue;
                if (!pick || timer.at < pick.at || (timer.at === pick.at && id < pickId)) {
                    pick = timer;
                    pickId = id;
                }
            }
            if (!pick) break;
            guard++;
            if (guard > 20000) throw new Error('虚拟时钟推进步数超过 20000，疑似死循环');
            clock.now = pick.at;
            if (pick.interval != null) {
                pick.at = clock.now + pick.interval;
            } else {
                clock.timers.delete(pickId);
            }
            clock.runs++;
            try {
                pick.fn.apply(null, pick.args);
            } catch (error) {
                clock.errors.push(String((error && error.stack) || error));
            }
        }
        clock.now = target;
        return guard;
    };
    win.__clock = clock;
}
function installRecorder(win) {
    // 控制台 / 点击记录器（断言用）。
    // 注意：这里不再自带 jQuery 实现 —— jQuery 使用工作区的真实依赖（repo/node_modules 联接 -> tools/node_modules/jquery@3.7.1），
    // 由 createEnv 注入到 window.jQuery / window.$，从而避免测试与真实 jQuery 语义产生偏差。
    const records = { logs: [], clicks: [] };
    win.__xt = records;
    const isStyleArg = (s) => typeof s === 'string' && (/^(color|font|background|border|text-)/i.test(s.trim()));
    const formatArg = (arg) => {
        if (typeof arg === 'string') return arg;
        if (arg && arg.name && arg.message && arg.stack) return `${arg.name}: ${arg.message}`;
        try { return JSON.stringify(arg); } catch (error) { return String(arg); }
    };
    const record = (level) => function () {
        const args = Array.prototype.slice.call(arguments);
        const text = args.map(formatArg).filter((p) => !isStyleArg(p)).join(' ').replace(/%c/g, '').replace(/\s+/g, ' ').trim();
        records.logs.push({ level, text, ts: win.__clock ? win.__clock.now : 0 });
    };
    win.console = { log: record('log'), info: record('info'), warn: record('warn'), error: record('error'), debug: record('debug') };
    records.has = function (needle, level) {
        return records.logs.some((l) => (!level || l.level === level) && l.text.indexOf(needle) >= 0);
    };
    records.count = function (needle, level) {
        return records.logs.filter((l) => (!level || l.level === level) && l.text.indexOf(needle) >= 0).length;
    };
}
function installPageSimulation(win) {
    const records = win.__xt;
    const doc = win.document;

    // jsdom 没有排版，给所有元素一个非零 rect，便于验证「可见性」相关逻辑（互动弹窗检测）。
    win.Element.prototype.getBoundingClientRect = function () {
        return { x: 0, y: 0, width: 120, height: 40, top: 0, left: 0, right: 120, bottom: 40 };
    };
    // jsdom 没有排版引擎：元素 offsetWidth/offsetHeight 恒为 0，会让真实 jQuery 的 :visible 全部判为不可见。
    // 这里显式给出非零尺寸桩，让 $('... :visible') 在测试环境里按「没有被 display:none 隐藏」的语义工作。
    Object.defineProperty(win.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 120; } });
    Object.defineProperty(win.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return 40; } });

    doc.addEventListener('click', (ev) => {
        const target = ev.target;
        if (!target || !target.closest) return;
        const nameEl = target.closest('.posCatalog_name');
        const holder = target.closest('.posCatalog_select, a, li, button, .prev_white, #prevNextFocusNext, .nextChapter');
        records.clicks.push({
            title: nameEl ? String(nameEl.getAttribute('title') || nameEl.textContent || '').trim() : String(target.textContent || '').trim().slice(0, 20),
            className: holder ? String(holder.className || '') : '',
            tag: target.tagName ? target.tagName.toLowerCase() : '',
            ts: win.__clock ? win.__clock.now : 0,
        });
        // 页面行为模拟：点击小节标题后目录会把 active 移到该节点（真实页面重绘目录）。
        if (nameEl) {
            const node = nameEl.closest('.posCatalog_select');
            const tree = doc.querySelector('#coursetree');
            if (node && tree && node.matches('.posCatalog_select:not(.firstLayer)')) {
                for (const old of Array.prototype.slice.call(tree.querySelectorAll('.posCatalog_active'))) {
                    old.classList.remove('posCatalog_active');
                }
                node.classList.add('posCatalog_active');
            }
        }
    }, true);
}

// ---------------------------------------------------------------------------
// 测试脚手架
// ---------------------------------------------------------------------------

export function createEnv(options = {}) {
    const source = options.source || readFileSync(sourcePath, 'utf8');
    const dom = new JSDOM(options.html || '<!doctype html><html><head></head><body></body></html>', {
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        url: options.url || 'https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=1',
    });
    const win = dom.window;
    win.eval(`(${installClock.toString()})(window)`);
    win.eval(`(${installRecorder.toString()})(window)`);
    win.eval(`(${installPageSimulation.toString()})(window)`);
    // 注入真实 jQuery：脚本 IIFE 只在 window.jQuery 缺失时才去拉 CDN，先注入即可确保测试不联网。
    const $ = jqueryFactory(win);
    win.jQuery = $;
    win.$ = $;
    win.__clock.tick(0); // 冲掉 jQuery ready 的 0ms 定时器，保证时钟里只剩被测脚本自己的定时器
    const env = {
        dom,
        window: win,
        xt: win.__xt,
        clock: win.__clock,
        source,
        get logs() { return win.__xt.logs; },
        get clicks() { return win.__xt.clicks; },
        eval(code) { return win.eval(code); },
        async advance(ms, step = 25) {
            let remaining = Math.max(0, Number(ms) || 0);
            while (remaining > 0) {
                const chunk = Math.min(step, remaining);
                env.clock.tick(chunk);
                remaining -= chunk;
                await drain();
            }
            await drain();
        },
        async boot(bootMs = 1100) {
            win.eval(source);
            await env.advance(bootMs);
            return win.app;
        },
        treeClicks() {
            return win.__xt.clicks.filter((c) => c.className.indexOf('posCatalog_select') >= 0);
        },
        lastTreeClickTitle() {
            const clicks = env.treeClicks();
            return clicks.length ? clicks[clicks.length - 1].title : null;
        },
        treeClickTitles() {
            return env.treeClicks().map((c) => c.title);
        },
        close() {
            // 收尾：先 destroy 让脚本自己清定时器，再关掉 jsdom window，避免 node 进程被残留句柄挂住。
            try {
                if (win.app && typeof win.app.destroy === 'function') win.app.destroy();
            } catch (error) {}
            try {
                win.close();
            } catch (error) {}
        },
    };
    openEnvs.push(env);
    return env;
}


export function tree(spec) {
    const chapters = spec.map((chapter) => {
        const activeIndex = chapter.activeIndex == null ? 0 : chapter.activeIndex;
        const nodes = chapter.nodes.map((node, index) => {
            const classes = ['posCatalog_select'];
            if (chapter.active === 'leaf' && index === activeIndex) classes.push('posCatalog_active');
            if (node.extraClass) classes.push(node.extraClass);
            return `<li><div class="${classes.join(' ')}"><span class="posCatalog_name" title="${node.title}">${node.title}</span></div></li>`;
        }).join('');
        const chapterClasses = ['posCatalog_select', 'firstLayer'];
        if (chapter.active === 'firstLayer') chapterClasses.push('posCatalog_active');
        const liClass = chapter.active === 'chapter' ? ' class="posCatalog_active"' : '';
        return `<li${liClass}><div class="${chapterClasses.join(' ')}"><span class="posCatalog_name" title="${chapter.title}">${chapter.title}</span></div>`
            + `<ul>${nodes}</ul></li>`;
    }).join('');
    return `<div id="coursetree"><ul>${chapters}</ul></div>`;
}

export function chapterSpecs(...nodesPerChapter) {
    return nodesPerChapter.map((titles, index) => ({
        title: `第${index + 1}章`,
        active: index === 0 ? 'leaf' : 'none',
        activeIndex: 0,
        nodes: titles.map((title) => ({ title })),
    }));
}

export async function frameDoc(env, frameId) {
    const frame = env.window.document.getElementById(frameId);
    if (!frame) throw new Error('缺少 iframe: ' + frameId);
    for (let i = 0; i < 5; i++) {
        const doc = frame.contentDocument;
        if (doc && doc.body) return doc;
        await drain();
    }
    throw new Error('iframe 文档不可用: ' + frameId);
}

export async function writeFrame(env, frameId, html) {
    const doc = await frameDoc(env, frameId);
    doc.body.innerHTML = html;
    return doc;
}

export async function buildFrameChain(env, depth, innerHtml) {
    let doc = env.window.document;
    for (let level = depth; level >= 1; level--) {
        const frame = doc.createElement('iframe');
        frame.id = 'nested-' + level;
        frame.setAttribute('src', 'about:blank');
        doc.body.appendChild(frame);
        await drain();
        await drain();
        const inner = frame.contentDocument;
        if (!inner) throw new Error('嵌套 iframe 创建失败: level ' + level);
        doc = inner;
    }
    doc.body.innerHTML = innerHtml;
    return doc;
}

export function stubVideo(env, video, options = {}) {
    const win = env.window;
    const state = {
        paused: options.paused !== false,
        ended: false,
        currentTime: options.currentTime || 0,
        muted: false,
        playbackRate: 1,
    };
    const calls = { play: 0, pause: 0 };
    const define = (name, initial) => Object.defineProperty(video, name, {
        configurable: true,
        get: () => state[initial],
        set: (value) => { state[initial] = typeof state[initial] === 'boolean' ? !!value : Number(value) || 0; },
    });
    define('paused', 'paused');
    define('ended', 'ended');
    define('currentTime', 'currentTime');
    define('muted', 'muted');
    define('playbackRate', 'playbackRate');
    video.play = function () {
        calls.play++;
        const behavior = options.playImpl ? options.playImpl(calls.play, state) : 'resolve';
        if (behavior === 'reject') return Promise.reject(new win.Error('NotAllowedError: play() failed'));
        if (options.keepPaused) return Promise.resolve();
        state.paused = false;
        win.setTimeout(() => video.dispatchEvent(new win.Event('play')), 0);
        return Promise.resolve();
    };
    video.pause = function () {
        calls.pause++;
        state.paused = true;
        video.dispatchEvent(new win.Event('pause'));
        return Promise.resolve();
    };
    video.__state = state;
    video.__calls = calls;
    return video;
}

export function stripComments(code) {
    return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
// ---------------------------------------------------------------------------
// 断言与用例注册
// ---------------------------------------------------------------------------

export const results = [];
export function check(name, cond, detail) {
    results.push({ name, ok: !!cond, detail: detail === undefined ? '' : String(detail) });
    return !!cond;
}
const tests = [];
function test(id, fn) { tests.push({ id, fn }); }

async function envWithTree(spec, options = {}) {
    const parts = [tree(spec)];
    if (options.frame !== false) parts.push('<iframe id="player" src="about:blank"></iframe>');
    if (options.stepTitle) parts.push(`<div class="prev_title" title="${options.stepTitle}"></div>`);
    if (options.extraHtml) parts.push(options.extraHtml);
    const env = createEnv({ html: parts.join('') });
    let video = null;
    if (options.frame !== false) {
        const doc = await writeFrame(env, 'player', options.frameHtml || '<video id="video_html5_api" src="https://example.com/a.mp4"></video>');
        const el = doc.getElementById('video_html5_api');
        if (el) video = stubVideo(env, el, options.videoOptions || {});
    }
    return { env, video };
}

// ---------------------------------------------------------------------------
// F1 导航死锁（#9 #24 #27 #37 #50）
// ---------------------------------------------------------------------------

test('F1-a 找不到视频触顶重试后，nextUnit() 仍可再次触发', async () => {
    const env = createEnv({ html: tree(chapterSpecs(['1.1', '1.2', '1.3'])) + '<div class="prev_title" title="视频"></div>' });
    const app = await env.boot();
    app._tryTimes = app.configs.maxRetries;
    app.nextUnit();
    await env.advance(3200);
    check('F1-a play() 失败后导航锁已复位', app._nextUnitPending === false, 'pending=' + app._nextUnitPending);
    check('F1-a 出现达到最大重试的日志', env.xt.has('已达到最大重试次数'), '');
    check('F1-a 第一次 nextUnit() 生效（1.2）', env.lastTreeClickTitle() === '1.2', 'last=' + env.lastTreeClickTitle());
    app.nextUnit();
    await env.advance(3200);
    check('F1-a 失败之后 nextUnit() 仍可再次触发（1.3）', env.lastTreeClickTitle() === '1.3', 'last=' + env.lastTreeClickTitle());
});

test('F1-b 「无视频安全停止」退出路径后，nextUnit() 仍可再次触发', async () => {
    const env = createEnv({ html: tree(chapterSpecs(['1.1', '1.2'], ['2.1'])) });
    const app = await env.boot();
    check('F1-b 已进入无视频安全停止分支', env.xt.has('已安全停止'), '');
    app.nextUnit();
    await env.advance(3200);
    check('F1-b 导航锁复位', app._nextUnitPending === false, 'pending=' + app._nextUnitPending);
    app.nextUnit();
    await env.advance(3200);
    check('F1-b 再触发后切到第 2 章首个节点', env.lastTreeClickTitle() === '2.1', 'last=' + env.lastTreeClickTitle());
});

test('F1-c 静音播放也失败触顶后，nextUnit() 仍可再次触发', async () => {
    const { env } = await envWithTree(chapterSpecs(['1.1', '1.2', '1.3']), {
        stepTitle: '视频',
        videoOptions: { playImpl: () => 'reject' },
    });
    const app = await env.boot();
    app._tryTimes = app.configs.maxRetries;
    app.nextUnit();
    await env.advance(3200);
    check('F1-c 出现静音失败触顶日志', env.xt.has('静音播放失败，已达到最大重试次数'), '');
    check('F1-c 导航锁复位', app._nextUnitPending === false, 'pending=' + app._nextUnitPending);
    app.nextUnit();
    await env.advance(3200);
    check('F1-c 之后 nextUnit() 仍生效（1.3）', env.lastTreeClickTitle() === '1.3', 'last=' + env.lastTreeClickTitle());
});

test('F1-d 正常播放路径下连续 nextUnit() 依次推进 1.1→1.2→1.3', async () => {
    const { env } = await envWithTree(chapterSpecs(['1.1', '1.2', '1.3']), { stepTitle: '视频' });
    const app = await env.boot();
    check('F1-d 初始解析到 1.1', app.cellData.currentCellIndex === 0 && app.cellData.currentNCellIndex === 0, JSON.stringify(app.cellData));
    app.nextUnit();
    await env.advance(3200);
    check('F1-d 推进到 1.2', env.lastTreeClickTitle() === '1.2', 'last=' + env.lastTreeClickTitle());
    check('F1-d 导航锁未卡死', app._nextUnitPending === false, '');
    app.nextUnit();
    await env.advance(3200);
    check('F1-d 推进到 1.3', env.lastTreeClickTitle() === '1.3', 'last=' + env.lastTreeClickTitle());
});

test('F1-e 课程已完成的退出路径也会释放导航锁（V3.3 在此永久卡死）', async () => {
    const env = createEnv({ html: tree(chapterSpecs(['1.1'])) });
    const app = await env.boot();
    app.nextUnit();
    await env.advance(200);
    check('F1-e 出现课程完成日志', env.xt.has('本课程学习完成了'), '');
    check('F1-e 导航锁已释放（V3.3 此处为 true）', app._nextUnitPending === false, 'pending=' + app._nextUnitPending);
    app.nextUnit();
    await env.advance(200);
    check('F1-e 再次 nextUnit() 不再被静默忽略', env.xt.count('已有小节切换正在进行') === 0, 'ignored=' + env.xt.count('已有小节切换正在进行'));
});

test('F1-f 失败的 play() 退出路径会主动释放导航锁（V3.3 在此永久卡死）', async () => {
    // 1) 达到最大重试的退出路径
    const env = createEnv({ html: tree(chapterSpecs(['1.1'], ['2.1'])) + '<div class="prev_title" title="视频"></div>' });
    const app = await env.boot();
    app._nextUnitPending = true;
    app._tryTimes = app.configs.maxRetries;
    await app.play();
    check('F1-f 触顶重试后导航锁被释放', app._nextUnitPending === false, 'pending=' + app._nextUnitPending);
    app.nextUnit();
    await env.advance(200);
    check('F1-f 释放后 nextUnit() 立刻生效', env.lastTreeClickTitle() === '2.1', 'last=' + env.lastTreeClickTitle());

    // 2) 无视频安全停止的退出路径
    const env2 = createEnv({ html: tree(chapterSpecs(['1.1'], ['2.1'])) });
    const app2 = await env2.boot();
    app2._nextUnitPending = true;
    await app2.play();
    check('F1-f 无视频安全停止后导航锁被释放', app2._nextUnitPending === false, 'pending=' + app2._nextUnitPending);
    app2.nextUnit();
    await env2.advance(200);
    check('F1-f 释放后 nextUnit() 立刻生效（切到第 2 章）', env2.lastTreeClickTitle() === '2.1', 'last=' + env2.lastTreeClickTitle());
});
test('F1-g destroy() 同样释放导航锁（所有退出路径一致性，#24 #27）', async () => {
    const { env } = await envWithTree(chapterSpecs(['1.1', '1.2']), { stepTitle: '视频' });
    const app = await env.boot();
    app._nextUnitPending = true;
    app.destroy();
    check('F1-g destroy() 后导航锁已释放', app._nextUnitPending === false, 'pending=' + app._nextUnitPending);
    app.nextUnit();
    await env.advance(200);
    check('F1-g destroy() 后 nextUnit() 不再被静默忽略', env.xt.count('已有小节切换正在进行') === 0, 'ignored=' + env.xt.count('已有小节切换正在进行'));
});
test('F1-h 所有退出路径都显式释放导航锁（静态清点，#9 #24 #27 #37 #50）', () => {
    const code = stripComments(readFileSync(sourcePath, 'utf8'));
    const paths = [
        ['nextUnit 的 finally 兜底', /finally\s*\{[\s\S]{0,300}?_releaseNavLock\('nextUnit 退出'\)/],
        ['play() 达到最大重试', /_releaseNavLock\('play\(\) 达到最大重试次数'\)/],
        ['静音播放失败触顶', /_releaseNavLock\('静音播放失败触顶'\)/],
        ['无视频安全停止', /_releaseNavLock\('无视频安全停止'\)/],
        ['无视频自动前进触顶', /_releaseNavLock\('无视频自动前进触顶'\)/],
        ['playCurrentIndex 解析失败', /_releaseNavLock\('playCurrentIndex 解析失败'\)/],
        ['找不到可点击节点', /_releaseNavLock\('找不到可点击节点'\)/],
        ['play 出错且无视频元素', /_releaseNavLock\('play 错误且无视频元素'\)/],
        ['静音播放未被接受', /_releaseNavLock\('静音播放未被接受'\)/],
        ['destroy() 复位', /destroy\(\)\s*\{[\s\S]{0,200}?this\._nextUnitPending = false;/],
    ];
    for (const pair of paths) check('F1-h 存在释放点：' + pair[0], pair[1].test(code), '');
});

test('F1-i 找不到可点击节点时同样释放导航锁（#24）', async () => {
    const html = '<div id="coursetree"><ul><li>'
        + '<div class="posCatalog_select firstLayer"><span class="posCatalog_name" title="第1章">第1章</span></div>'
        + '<ul><li><div class="posCatalog_select posCatalog_active"></div></li>'
        + '<li><div class="posCatalog_select"><span class="posCatalog_name" title="1.2">1.2</span></div></li></ul>'
        + '</li></ul></div>';
    const env = createEnv({ html });
    const app = await env.boot();
    app._nextUnitPending = true;
    app.playCurrentIndex(null, { chapterIndex: 0, nodeIndex: 0 });
    check('F1-i 打印找不到可点击节点', env.xt.has('找不到可点击的课程节点'), '');
    check('F1-i 导航锁被释放', app._nextUnitPending === false, 'pending=' + app._nextUnitPending);
});
// ---------------------------------------------------------------------------
// F2 小节内多视频 / 下标解析（#14 #15 #24 #27 #37 #49）
// ---------------------------------------------------------------------------

test('F2-1 同一章 3 个视频节点按 1→2→3 推进，不直接跳到下一章', async () => {
    const { env } = await envWithTree(chapterSpecs(['1.1', '1.2', '1.3'], ['2.1']), { stepTitle: '视频' });
    const app = await env.boot();
    check('F2-1 初始下标为 0/0 且解析成功', app.cellData.currentCellIndex === 0 && app.cellData.currentNCellIndex === 0 && app.cellData.resolved === true, JSON.stringify(app.cellData));
    app.nextUnit();
    await env.advance(3200);
    check('F2-1 第 2 个视频节点', env.lastTreeClickTitle() === '1.2', 'last=' + env.lastTreeClickTitle());
    app.nextUnit();
    await env.advance(3200);
    check('F2-1 第 3 个视频节点', env.lastTreeClickTitle() === '1.3', 'last=' + env.lastTreeClickTitle());
    check('F2-1 此时仍在第 1 章', app.cellData.currentCellIndex === 0, JSON.stringify(app.cellData));
    app.nextUnit();
    await env.advance(3200);
    check('F2-1 同章 3 个播完后才进入下一章', env.lastTreeClickTitle() === '2.1', 'last=' + env.lastTreeClickTitle());
    check('F2-1 点击序列完全正确', JSON.stringify(env.treeClickTitles()) === JSON.stringify(['1.2', '1.3', '2.1']), JSON.stringify(env.treeClickTitles()));
});

test('F2-2 active 落在章节 li 上时也能定位到该章节点并逐节推进', async () => {
    const spec = [
        { title: '第1章', active: 'chapter', activeIndex: 0, nodes: [{ title: '1.1' }, { title: '1.2' }] },
        { title: '第2章', active: 'none', activeIndex: 0, nodes: [{ title: '2.1' }] },
    ];
    const { env } = await envWithTree(spec, { stepTitle: '视频' });
    const app = await env.boot();
    check('F2-2 父节点 active 解析到第 1 章第 1 个节点', app.cellData.currentCellIndex === 0 && app.cellData.currentNCellIndex === 0, JSON.stringify(app.cellData));
    app.nextUnit();
    await env.advance(3200);
    check('F2-2 推进到同章 1.2', env.lastTreeClickTitle() === '1.2', 'last=' + env.lastTreeClickTitle());
});

test('F2-3 active 落在收起态 firstLayer 上时也能定位', async () => {
    const spec = [
        { title: '第1章', active: 'firstLayer', activeIndex: 0, nodes: [{ title: '1.1' }, { title: '1.2' }] },
        { title: '第2章', active: 'none', activeIndex: 0, nodes: [{ title: '2.1' }] },
    ];
    const { env } = await envWithTree(spec, { stepTitle: '视频' });
    const app = await env.boot();
    check('F2-3 firstLayer active 解析到 0/0', app.cellData.currentCellIndex === 0 && app.cellData.currentNCellIndex === 0, JSON.stringify(app.cellData));
    app.nextUnit();
    await env.advance(3200);
    check('F2-3 推进到同章 1.2 而不是跳章', env.lastTreeClickTitle() === '1.2', 'last=' + env.lastTreeClickTitle());
});

test('F2-3b 容器节点（firstLayer / lastLayer 包裹）不会被当成可播放节点', async () => {
    const html = '<div id="coursetree"><ul><li>'
        + '<div class="posCatalog_select firstLayer"><span class="posCatalog_name" title="第1章">第1章</span></div>'
        + '<div class="posCatalog_select lastLayer posCatalog_active"><span class="posCatalog_name" title="容器">容器</span><ul>'
        + '<li><div class="posCatalog_select"><span class="posCatalog_name" title="1.1">1.1</span></div></li>'
        + '<li><div class="posCatalog_select"><span class="posCatalog_name" title="1.2">1.2</span></div></li>'
        + '</ul></div></li>'
        + '<li><div class="posCatalog_select firstLayer"><span class="posCatalog_name" title="第2章">第2章</span></div><ul>'
        + '<li><div class="posCatalog_select"><span class="posCatalog_name" title="2.1">2.1</span></div></li>'
        + '</ul></li></ul></div>'
        + '<iframe id="player" src="about:blank"></iframe><div class="prev_title" title="视频"></div>';
    const env = createEnv({ html });
    const doc = await writeFrame(env, 'player', '<video id="video_html5_api" src="https://example.com/a.mp4"></video>');
    stubVideo(env, doc.getElementById('video_html5_api'), {});
    const app = await env.boot();
    check('F2-3b 容器节点没有被计入小节总数（2+1=3）', app.cellData.nCells === 3, 'nCells=' + app.cellData.nCells);
    check('F2-3b active 在容器上时定位到第 1 个真实节点', app.cellData.currentCellIndex === 0 && app.cellData.currentNCellIndex === 0, JSON.stringify(app.cellData));
    app.nextUnit();
    await env.advance(3200);
    check('F2-3b 推进到同章第 2 个真实节点', env.lastTreeClickTitle() === '1.2', 'last=' + env.lastTreeClickTitle());
});
test('F2-4 解析失败时明确报错、不点击、也不静默跳到下一章', async () => {
    const spec = [
        { title: '第1章', active: 'none', activeIndex: 0, nodes: [{ title: '1.1' }, { title: '1.2' }] },
        { title: '第2章', active: 'none', activeIndex: 0, nodes: [{ title: '2.1' }] },
    ];
    const env = createEnv({ html: tree(spec) });
    const app = await env.boot();
    const clicksBefore = env.clicks.length;
    app.nextUnit();
    await env.advance(5000);
    check('F2-4 出现明确的解析失败日志', env.xt.has('无法解析当前课程节点'), '');
    check('F2-4 目录解析失败时给出处理方法', env.xt.has('没有高亮的 .posCatalog_active'), '');
    check('F2-4 没有发生任何点击', env.clicks.length === clicksBefore, 'clicks=' + env.clicks.length + ' before=' + clicksBefore);
    check('F2-4 未出现「切换到下一个章节」', !env.xt.has('切换到下一个章节'), '');
    check('F2-4 导航锁复位', app._nextUnitPending === false, '');
});
test('F2-5 小节内多个视频任务点按顺序播完，全部完成才切下一小节（思路来自 PR #48 @CsuCook1e）', async () => {
    const html = tree(chapterSpecs(['1.1', '1.2']))
        + '<div class="ans-job ans-job-finished"><iframe class="ans-insertvideo-online" id="task-1" src="about:blank"></iframe><span>任务点已完成</span></div>'
        + '<div class="ans-job"><iframe class="ans-insertvideo-online" id="task-2" src="about:blank"></iframe></div>'
        + '<div class="ans-job"><iframe class="ans-insertvideo-online" id="task-3" src="about:blank"></iframe></div>'
        + '<div class="prev_title" title="视频"></div>';
    const env = createEnv({ html });
    const doc1 = await writeFrame(env, 'task-1', '<video id="video_html5_api" src="https://example.com/t1.mp4"></video>');
    stubVideo(env, doc1.getElementById('video_html5_api'), {});
    const doc2 = await writeFrame(env, 'task-2', '<video id="video_html5_api" src="https://example.com/t2.mp4"></video>');
    const v2 = stubVideo(env, doc2.getElementById('video_html5_api'), {});
    const doc3 = await writeFrame(env, 'task-3', '<video id="video_html5_api" src="https://example.com/t3.mp4"></video>');
    const v3 = stubVideo(env, doc3.getElementById('video_html5_api'), {});
    const app = await env.boot();
    check('F2-5 识别出 3 个视频任务点', app._videoTaskCount === 3, 'count=' + app._videoTaskCount);
    check('F2-5 跳过已完成的任务点，命中第 2 个任务点的视频', app._getVideoEl() === v2, '');
    check('F2-5 打印跳过已完成任务点的日志', env.xt.has('跳过已完成的视频任务点'), '');

    v2.__state.ended = true;
    app._isPlaying = true;
    v2.dispatchEvent(new env.window.Event('ended'));
    await env.advance(1500);
    check('F2-5 第 2 个任务点播完后小节内切到第 3 个', app._getVideoEl() === v3, '');
    check('F2-5 此时没有切换目录树节点', env.treeClicks().length === 0, JSON.stringify(env.treeClickTitles()));

    v3.__state.ended = true;
    app._isPlaying = true;
    v3.dispatchEvent(new env.window.Event('ended'));
    await env.advance(1500);
    check('F2-5 小节内任务点全部完成后才切换目录树', env.lastTreeClickTitle() === '1.2', 'last=' + env.lastTreeClickTitle());
});

test('F2-6 小节内视频任务点全部已完成时不再返回视频，交由无视频分支有界前进', async () => {
    const html = tree(chapterSpecs(['1.1'], ['2.1']))
        + '<div class="ans-job ans-job-finished"><iframe class="ans-insertvideo-online" id="task-1" src="about:blank"></iframe></div>'
        + '<div class="ans-job ans-job-finished"><iframe class="ans-insertvideo-online" id="task-2" src="about:blank"></iframe></div>';
    const env = createEnv({ html });
    const doc1 = await writeFrame(env, 'task-1', '<video id="video_html5_api" src="https://example.com/t1.mp4"></video>');
    stubVideo(env, doc1.getElementById('video_html5_api'), {});
    const doc2 = await writeFrame(env, 'task-2', '<video id="video_html5_api" src="https://example.com/t2.mp4"></video>');
    stubVideo(env, doc2.getElementById('video_html5_api'), {});
    const app = await env.boot();
    check('F2-6 任务点全完成时 _getVideoEl() 返回 null', app._getVideoEl() === null, '');
    check('F2-6 打印「视频任务点均已完成」日志', env.xt.has('个视频任务点均已完成'), '');
    check('F2-6 被视为可识别完成并有界前进', env.lastTreeClickTitle() === '2.1', 'last=' + env.lastTreeClickTitle());
});
// ---------------------------------------------------------------------------
// F3 无视频/课件页卡死（#38 #42 #43 #50）
// ---------------------------------------------------------------------------

test('F3-1 无视频且无法识别完成状态 → 安全停止 + 可操作提示 + 零点击', async () => {
    const env = createEnv({ html: tree(chapterSpecs(['1.1'], ['2.1'], ['3.1'], ['4.1'])) });
    const app = await env.boot();
    check('F3-1 进入安全停止分支', env.xt.has('已安全停止'), '');
    check('F3-1 给出可操作处理方法', env.xt.has('执行 app.nextUnit() 跳过') && env.xt.has('autoAdvanceNoVideo'), '');
    await env.advance(120000);
    check('F3-1 长时间空转后仍无自动点击（不会误跳章节）', env.treeClicks().length === 0, JSON.stringify(env.treeClickTitles()));
    check('F3-1 连续自动前进计数未超上限', app._consecutiveNoVideoAdvances <= app.configs.maxConsecutiveNoVideoAdvances, 'count=' + app._consecutiveNoVideoAdvances);
});

test('F3-2 已识别为完成的节点会自动前进，但连续前进次数受上限约束', async () => {
    const spec = [1, 2, 3, 4, 5, 6].map((i) => ({
        title: `第${i}章`,
        active: i === 1 ? 'leaf' : 'none',
        activeIndex: 0,
        nodes: [{ title: `${i}.1`, extraClass: 'icon_Completed' }],
    }));
    const env = createEnv({ html: tree(spec) });
    const app = await env.boot();
    await env.advance(120000);
    check('F3-2 识别出「已完成/无任务点」并自动前进', env.xt.has('已识别为「已完成/无任务点」'), '');
    check('F3-2 自动前进次数不超过配置上限', env.treeClicks().length <= app.configs.maxConsecutiveNoVideoAdvances && env.treeClicks().length >= 1, 'clicks=' + env.treeClicks().length + ' cap=' + app.configs.maxConsecutiveNoVideoAdvances);
    check('F3-2 触顶后停止并给出提示', env.xt.has('连续自动前进已达上限'), '');
    check('F3-2 触顶提示包含处理方法', env.xt.has('请人工确认课程目录结构'), '');
});

test('F3-3 章节测验仍走既有的受限跳转（最多 3 次，不死循环）', async () => {
    const html = tree(chapterSpecs(['1.1'])) + '<div class="prev_title" title="章节测验"></div><a id="prevNextFocusNext" href="#">下一节</a>';
    const env = createEnv({ html });
    const app = await env.boot();
    await env.advance(60000);
    const nextClicks = env.clicks.filter((c) => c.title.indexOf('下一节') >= 0).length;
    check('F3-3 章节测验跳转不超过 3 次', app._chapterAdvanceTimes <= 3 && nextClicks <= 3, 'times=' + app._chapterAdvanceTimes + ' clicks=' + nextClicks);
    check('F3-3 未把章节测验当成互动弹窗', !env.xt.has('检测到视频互动答题弹窗'), '');
});

test('F3-4 任务点未完成弹窗点「去学习」而不是「下一节」，且受冷却与次数上限约束（思路来自 PR #48 @CsuCook1e）', async () => {
    const dialogHtml = '<div class="layui-layer" id="task-dialog">'
        + '<div class="layui-layer-title">提示</div>'
        + '<div class="layui-layer-content">当前章节还有任务点未完成，是否去完成？</div>'
        + '<a class="layui-layer-btn0" id="go-study" href="#">去学习</a>'
        + '<a class="layui-layer-btn1" id="next-section" href="#">下一节</a></div>';
    const env = createEnv({ html: tree(chapterSpecs(['1.1'], ['2.1'])) + dialogHtml });
    const doc = env.window.document;
    const dialog = doc.getElementById('task-dialog');
    dialog.getBoundingClientRect = () => ({ x: 0, y: 0, width: 420, height: 220, top: 0, left: 0, right: 420, bottom: 220 });
    let goStudy = 0;
    let nextSection = 0;
    doc.getElementById('go-study').addEventListener('click', () => { goStudy++; });
    doc.getElementById('next-section').addEventListener('click', () => { nextSection++; });
    const app = await env.boot();
    await env.advance(2000);
    check('F3-4 第一次点击「去学习」', goStudy === 1, 'goStudy=' + goStudy);
    check('F3-4 不点「下一节」硬闯', nextSection === 0, 'nextSection=' + nextSection);
    check('F3-4 日志说明回到未完成任务点', env.xt.has('回到未完成任务点'), '');
    await env.advance(3000);
    check('F3-4 冷却窗口内不重复点击', goStudy === 1, 'goStudy=' + goStudy);
    await env.advance(app.configs.taskDialogClickCooldownMs * 3);
    check('F3-4 每小节点击次数不超过上限', goStudy === app.configs.taskDialogMaxClicksPerUnit, 'goStudy=' + goStudy + ' cap=' + app.configs.taskDialogMaxClicksPerUnit);
    check('F3-4 触顶后打印停止提示', env.xt.has('弹窗处理已达上限'), '');
    check('F3-4 触顶后仍不点「下一节」', nextSection === 0, 'nextSection=' + nextSection);
});
// ---------------------------------------------------------------------------
// F4 异常暂停与风控（#19 #26 #32 #54 #55）
// ---------------------------------------------------------------------------

test('F4-1 源码中不再有 document/window 的 mouseout/mouseleave 劫持', () => {
    const code = stripComments(readFileSync(sourcePath, 'utf8'));
    check('F4-1 不再存在 _bindPageGuards', !/bindPageGuards/.test(code), '');
    check('F4-1 不再注册 mouseout/mouseleave 监听', !/addEventListener\(\s*['"](mouseout|mouseleave)['"]/.test(code), '');
    check('F4-1 全文件没有 preventDefault 调用', !/\.preventDefault\s*\(/.test(code), '');
    check('F4-1 全文件没有 stopPropagation 调用', !/\.stopPropagation\s*\(/.test(code), '');
});

test('F4-2 恢复播放受冷却与次数上限约束（连续触发 100 次）', async () => {
    const { env, video } = await envWithTree(chapterSpecs(['1.1', '1.2']), { stepTitle: '视频', videoOptions: { keepPaused: true } });
    const app = await env.boot();
    await env.advance(1200);
    app._clearCheckInterval();
    video.__state.paused = true;
    app._isPlaying = true;
    app._guardLastWallTs = env.clock.now - 9000;
    app._guardLastTime = video.__state.currentTime;
    const before = video.__calls.play;
    for (let i = 0; i < 100; i++) {
        app._tryResumePlayback('stress-' + i);
        await env.advance(app.configs.guardResumeCooldownMs + 20);
    }
    const attempts = video.__calls.play - before;
    check('F4-2 实际 play() 次数不少于 1（说明条件确实成立）', attempts >= 1, 'attempts=' + attempts);
    check('F4-2 实际 play() 次数不超过上限', attempts <= app.configs.resumeMaxAttemptsPerUnit, 'attempts=' + attempts + ' cap=' + app.configs.resumeMaxAttemptsPerUnit);
    check('F4-2 内部计数与上限一致', app._resumeAttemptsThisUnit === app.configs.resumeMaxAttemptsPerUnit, 'count=' + app._resumeAttemptsThisUnit);
    check('F4-2 触顶提示出现', env.xt.has('恢复播放次数已达上限'), '');
});

test('F4-2b 冷却窗口内的重复触发不会重复抢播', async () => {
    const { env, video } = await envWithTree(chapterSpecs(['1.1', '1.2']), { stepTitle: '视频', videoOptions: { keepPaused: true } });
    const app = await env.boot();
    await env.advance(1200);
    app._clearCheckInterval();
    video.__state.paused = true;
    app._isPlaying = true;
    app._guardLastWallTs = env.clock.now - 9000;
    app._guardLastTime = video.__state.currentTime;
    const before = video.__calls.play;
    const first = app._tryResumePlayback('first');
    const second = app._tryResumePlayback('second');
    check('F4-2b 首次触发被接受', first === true, '');
    check('F4-2b 冷却期内第二次被拒绝', second === false, '');
    check('F4-2b 冷却期内只发生 1 次 play()', video.__calls.play - before === 1, 'plays=' + (video.__calls.play - before));
});

test('F4-3 用户主动暂停后不再抢播，resumeAutoPlay() 后可恢复', async () => {
    const { env, video } = await envWithTree(chapterSpecs(['1.1', '1.2']), { stepTitle: '视频', videoOptions: { keepPaused: true } });
    const app = await env.boot();
    await env.advance(1200);
    app._clearCheckInterval();
    video.ownerDocument.dispatchEvent(new env.window.Event('pointerdown', { bubbles: true }));
    video.__state.paused = true;
    app._isPlaying = true;
    video.dispatchEvent(new env.window.Event('pause'));
    check('F4-3 识别为用户主动暂停', app._userPaused === true, '');
    check('F4-3 给出恢复保活的方法提示', env.xt.has('resumeAutoPlay'), '');
    const before = video.__calls.play;
    for (let i = 0; i < 20; i++) {
        app._guardLastWallTs = env.clock.now - 9000;
        app._tryResumePlayback('user-paused-' + i);
        await env.advance(app.configs.guardResumeCooldownMs + 20);
    }
    check('F4-3 用户暂停期间一次都没有抢播', video.__calls.play === before, 'plays=' + (video.__calls.play - before));
    app.resumeAutoPlay();
    app._guardLastWallTs = env.clock.now - 9000;
    const ok = app._tryResumePlayback('after-resume');
    check('F4-3 resumeAutoPlay() 之后可以恢复抢播', ok === true && video.__calls.play > before, 'ok=' + ok);
});

test('F4-4 destroy() 清理全部定时器，且 destroy() 之后可以重新 run()', async () => {
    const { env } = await envWithTree(chapterSpecs(['1.1', '1.2', '1.3']), { stepTitle: '视频' });
    const app = await env.boot();
    app.destroy();
    const logsAfter = env.logs.length;
    await env.advance(30000);
    check('F4-4 destroy() 后无残留定时器回调', env.logs.length === logsAfter, 'logs +' + (env.logs.length - logsAfter));
    check('F4-4 destroy() 后无待执行定时器', env.clock.pending() === 0, 'pending=' + env.clock.pending());
    app.run();
    await env.advance(4000);
    app.nextUnit();
    await env.advance(3200);
    check('F4-4 重新 run() 后 nextUnit() 仍然生效', env.lastTreeClickTitle() === '1.2', 'last=' + env.lastTreeClickTitle());
});
test('F4-5 不默认强制静音，但记住用户手动选择的静音状态并在切换视频后沿用', async () => {
    const { env, video } = await envWithTree(chapterSpecs(['1.1', '1.2']), { stepTitle: '视频' });
    const app = await env.boot();
    check('F4-5 默认不改动静音状态（不强制静音）', video.__state.muted === false, 'muted=' + video.__state.muted);
    check('F4-5 初始没有用户静音选择', app._userMutedChoice === null || app._userMutedChoice === undefined, 'choice=' + app._userMutedChoice);

    video.__state.muted = true;
    video.dispatchEvent(new env.window.Event('volumechange'));
    check('F4-5 记录用户的静音选择', app._userMutedChoice === true, 'choice=' + app._userMutedChoice);

    const doc = await frameDoc(env, 'player');
    doc.body.innerHTML = '<video id="video_html5_api" src="https://example.com/b.mp4"></video>';
    const newVideo = stubVideo(env, doc.getElementById('video_html5_api'), {});
    app.nextUnit();
    await env.advance(4000);
    check('F4-5 新视频沿用用户静音选择', newVideo.muted === true, 'muted=' + newVideo.muted);
    check('F4-5 打印沿用日志', env.xt.has('沿用用户此前选择的静音状态'), '');
});

test('F4-5b 脚本自身的静音兜底不会被记成用户选择', async () => {
    const { env, video } = await envWithTree(chapterSpecs(['1.1']), {
        stepTitle: '视频',
        videoOptions: { playImpl: (n) => (n === 1 ? 'reject' : 'resolve') },
    });
    const app = await env.boot();
    await env.advance(500);
    check('F4-5b 静音兜底已执行', video.__state.muted === true, 'muted=' + video.__state.muted);
    check('F4-5b 未把兜底记成用户选择', app._userMutedChoice === null || app._userMutedChoice === undefined, 'choice=' + app._userMutedChoice);
});

test('F4-6 保活阶梯：恢复后 2.5 秒复检，仍无进度则回拨重播（PR #56 阶梯），总 play() 受预算约束', async () => {
    const { env, video } = await envWithTree(chapterSpecs(['1.1']), { stepTitle: '视频', videoOptions: { keepPaused: true } });
    const app = await env.boot();
    await env.advance(500);
    app._clearCheckInterval();
    video.__state.paused = true;
    video.__state.currentTime = 30;
    app._isPlaying = true;
    app._guardLastTime = 30;
    app._guardLastWallTs = env.clock.now - 9000;
    const before = video.__calls.play;
    check('F4-6 停滞判定成立时执行恢复', app._tryResumePlayback('no-progress') === true, '');
    await env.advance(app.configs.guardRecoveryProbeMs + 100);
    check('F4-6 复检后执行回拨重播', env.xt.has('回拨 0.15s 后重播'), '');
    check('F4-6 currentTime 被轻微回拨', video.__state.currentTime < 30, 'currentTime=' + video.__state.currentTime);
    check('F4-6 回拨重播计入恢复预算', app._resumeAttemptsThisUnit === 2, 'attempts=' + app._resumeAttemptsThisUnit);
    check('F4-6 回拨次数单独计数', app._seekBackTimesThisUnit === 1, 'seekBack=' + app._seekBackTimesThisUnit);
    for (let i = 0; i < 20; i++) {
        app._guardLastResumeTs = 0;
        app._guardLastWallTs = env.clock.now - 9000;
        app._guardLastTime = video.__state.currentTime;
        app._tryResumePlayback('stress-' + i);
        await env.advance(200);
    }
    check('F4-6 脚本发起的 play() 总数不超过每小节预算', video.__calls.play - before <= app.configs.resumeMaxAttemptsPerUnit, 'plays=' + (video.__calls.play - before) + ' cap=' + app.configs.resumeMaxAttemptsPerUnit);
});

test('F4-7 play() 永不 settle 时有超时保护（PR #56 修复项）', async () => {
    const { env, video } = await envWithTree(chapterSpecs(['1.1']), { stepTitle: '视频' });
    video.play = () => {
        video.__calls.play++;
        return new Promise(() => {});
    };
    const app = await env.boot();
    await env.advance(app.configs.playTimeoutMs + 500);
    check('F4-7 超时后按播放失败处理并打印原因', env.xt.has('play() 超时'), '');
    check('F4-7 触发静音兜底或重试', video.__calls.play >= 2, 'plays=' + video.__calls.play);
});
test('F4-7b 静音兜底的 play() 卡住时也有超时保护（PR #56 修复项）', async () => {
    const { env, video } = await envWithTree(chapterSpecs(['1.1']), { stepTitle: '视频' });
    let calls = 0;
    video.play = () => {
        calls++;
        video.__calls.play++;
        if (calls === 1) return Promise.reject(new env.window.Error('NotAllowedError'));
        return new Promise(() => {});
    };
    await env.boot();
    await env.advance(1000 + 9000 + 2500);
    check('F4-7b 静音兜底超时按失败处理', env.xt.has('静音 play() 超时') || env.xt.has('静音播放也失败'), '');
    check('F4-7b 超时后会安排重试（不会停在半路）', video.__calls.play >= 3, 'plays=' + video.__calls.play);
});

test('F4-8 注册点幂等且 destroy() 可完全注销（行为 + 静态审计）', async () => {
    const { env } = await envWithTree(chapterSpecs(['1.1', '1.2']), { stepTitle: '视频' });
    const app = await env.boot();
    await env.advance(2500);
    const bootPending = env.clock.pending();
    app.run();
    await env.advance(1500);
    app.run();
    await env.advance(1500);
    const afterRerun = env.clock.pending();
    check('F4-8 重复 run() 后待执行定时器不增长', afterRerun <= bootPending, 'boot=' + bootPending + ' after=' + afterRerun);
    app.destroy();
    await env.advance(30000);
    check('F4-8 destroy() 后待执行定时器为 0', env.clock.pending() === 0, 'pending=' + env.clock.pending());

    const code = stripComments(readFileSync(sourcePath, 'utf8'));
    const registrations = [
        ['视频监控 setInterval', /_startVideoMonitoring\(\)\s*\{[\s\S]{0,200}?_clearCheckInterval\(\)/, /_clearCheckInterval\(\)/],
        ['互动弹窗 setInterval', /_startInteractionWatcher\(\)\s*\{[\s\S]{0,300}?if \(this\._interactionWatcher\) return;/, /_stopInteractionWatcher\(\)/],
        ['延时器 _schedule', /_schedule\(fn, ms\)/, /_clearTimers\(\)/],
        ['视频媒体事件', /if \(this\._eventVideoEl === el\) return;/, /_detachVideoEvents\(\)/],
        ['用户交互观察', /if \(!frameDoc \|\| this\._userInteractionDoc === frameDoc\) return;/, /_unbindUserInteractionWatch\(\)/],
        ['静音跟踪', /if \(this\._muteTrackedEl === video\) return;/, /_unbindUserMuteTracking\(\)/],
        ['步骤导航委托事件', /if \(this\._stepNavigationBound\)\s*\{\s*return;/, /off\('\.xuexitongPlayerV3'\)/],
        ['启动轮询 setInterval', /window\[BOOT_TIMER_KEY\] = setInterval/, /clearInterval\(window\[BOOT_TIMER_KEY\]\)/],
        ['播放 Promise 超时', /_withTimeout\(promise, ms, label\)/, /this\._timers\.delete\(timer\)/],
    ];
    for (const item of registrations) {
        check('F4-8 ' + item[0] + ' 有幂等 guard', item[1].test(code), '');
        check('F4-8 ' + item[0] + ' 有清理路径', item[2].test(code), '');
    }
});
// ---------------------------------------------------------------------------
// F5 互动答题弹窗（#29 #39 #42 #45）
// ---------------------------------------------------------------------------

const QUIZ_HTML = '<div class="answerQuestion"><div class="Zy_TItle">判断题：请选择你认为正确的选项</div>'
    + '<ul id="quiz-options"><li>A、正确</li><li>B、错误</li></ul><a class="submitBtn" id="quiz-submit">提交</a></div>';

test('F5-1 检测到互动答题弹窗 → 暂停跳转 + 提示手动处理，且绝不点击选项/提交', async () => {
    const env = createEnv({ html: tree(chapterSpecs(['1.1'], ['2.1'])) + QUIZ_HTML });
    const doc = env.window.document;
    let optionClicks = 0;
    let submitClicks = 0;
    doc.getElementById('quiz-options').addEventListener('click', () => { optionClicks++; });
    doc.getElementById('quiz-submit').addEventListener('click', () => { submitClicks++; });
    const app = await env.boot();
    await env.advance(2000);
    check('F5-1 进入暂停跳转状态', app._interactionBlocked === true, 'blocked=' + app._interactionBlocked);
    check('F5-1 打印人工处理提示', env.xt.has('请手动完成该互动题'), '');
    check('F5-1 明确声明不自动答题', env.xt.has('不会自动答题'), '');
    app.nextUnit();
    await env.advance(5000);
    check('F5-1 弹窗期间 nextUnit() 不跳转', env.treeClicks().length === 0, JSON.stringify(env.treeClickTitles()));
    check('F5-1 弹窗期间 nextUnit() 给出暂停提示', env.xt.has('已暂停自动跳转'), '');
    check('F5-1 没有点击任何选项或提交按钮', optionClicks === 0 && submitClicks === 0, 'option=' + optionClicks + ' submit=' + submitClicks);
    doc.querySelector('.answerQuestion').remove();
    await env.advance(2000);
    check('F5-1 弹窗消失后恢复自动跳转', app._interactionBlocked === false, 'blocked=' + app._interactionBlocked);
    check('F5-1 恢复后打印恢复日志', env.xt.has('互动答题弹窗已消失'), '');
});

test('F5-2 全脚本不含自动答题，也不含任何外部网络/大模型调用', () => {
    const code = stripComments(readFileSync(sourcePath, 'utf8'));
    check('F5-2 无 autoAnswer/自动答题实现', !/autoAnswer/i.test(code), '');
    check('F5-2 无选项点击/提交按钮逻辑', !/submitBtn|firstOption|options\[0\]\.click/.test(code), '');
    check('F5-2 无 fetch() 调用', !/\bfetch\s*\(/.test(code), '');
    check('F5-2 无 XMLHttpRequest / axios', !/XMLHttpRequest|axios/.test(code), '');
    const urls = [...new Set([...code.matchAll(/https?:\/\/[^'"\s)]+/g)].map((m) => m[0]))];
    check('F5-2 唯一外部资源是页面既有的 jQuery CDN', urls.length === 0 || urls.every((u) => u.indexOf('code.jquery.com') >= 0), JSON.stringify(urls));
    check('F5-2 存在互动弹窗检测与暂停跳转逻辑', /_findInteractionDialog/.test(code) && /_interactionBlocked/.test(code), '');
});

// ---------------------------------------------------------------------------
// F6 视频元素发现（#18 #52 #55）
// ---------------------------------------------------------------------------

test('F6-1 嵌套 3 层 iframe 内的视频能被找到', async () => {
    const env = createEnv({ html: tree(chapterSpecs(['1.1'])) + '<div class="prev_title" title="视频"></div>' });
    const deepDoc = await buildFrameChain(env, 3, '<video id="video_html5_api" src="https://example.com/deep.mp4"></video>');
    const deepVideo = stubVideo(env, deepDoc.getElementById('video_html5_api'), {});
    const app = await env.boot();
    check('F6-1 找到 3 层嵌套 frame 里的视频', app._getVideoEl() === deepVideo, '');
});

test('F6-2 超过 videoFrameMaxDepth 的嵌套不再搜索（带上限保护）', async () => {
    const env = createEnv({ html: tree(chapterSpecs(['1.1'])) });
    await buildFrameChain(env, 5, '<video id="video_html5_api" src="https://example.com/too-deep.mp4"></video>');
    const app = await env.boot();
    check('F6-2 超出深度上限的视频不被采用', app._getVideoEl() === null, '');
    check('F6-2 上限配置为 4（V3.3 是硬编码 2）', app.configs.videoFrameMaxDepth === 4, 'depth=' + app.configs.videoFrameMaxDepth);
    const code = stripComments(readFileSync(sourcePath, 'utf8'));
    check('F6-2 源码存在深度上限判断', /depth > this\.configs\.videoFrameMaxDepth/.test(code), '');
});

test('F6-3 切换小节时显式失效缓存，不复用旧视频元素', async () => {
    const { env, video } = await envWithTree(chapterSpecs(['1.1', '1.2']), { stepTitle: '视频' });
    const app = await env.boot();
    check('F6-3 首次命中旧视频元素', app._getVideoEl() === video, '');
    const doc = await frameDoc(env, 'player');
    doc.body.innerHTML = '<video id="video_html5_api" src="https://example.com/b.mp4"></video>';
    const newVideo = stubVideo(env, doc.getElementById('video_html5_api'), {});
    app.nextUnit();
    await env.advance(4000);
    check('F6-3 切换小节时打印缓存失效', env.xt.has('视频元素缓存已失效'), '');
    check('F6-3 切换到新视频元素而不是旧缓存', app._getVideoEl() === newVideo && newVideo !== video, '');
});

test('F6-4 选择器覆盖扩大：vjs-tech / 主文档 video 都能识别', async () => {
    const env = createEnv({
        html: tree(chapterSpecs(['1.1'])) + '<video id="decoy"></video><iframe id="player" src="about:blank"></iframe><div class="prev_title" title="视频"></div>',
    });
    const doc = await writeFrame(env, 'player', '<div class="video-js"><video class="vjs-tech" src="https://example.com/vjs.mp4"></video></div>');
    const real = stubVideo(env, doc.querySelector('video.vjs-tech'), {});
    const app = await env.boot();
    check('F6-4 跳过无 src 的装饰性 video，命中 vjs-tech', app._getVideoEl() === real, '');

    const env2 = createEnv({ html: tree(chapterSpecs(['1.1'])) + '<video id="video_html5_api" src="https://example.com/top.mp4"></video><div class="prev_title" title="视频"></div>' });
    const topVideo = stubVideo(env2, env2.window.document.getElementById('video_html5_api'), {});
    const app2 = await env2.boot();
    check('F6-4 主文档中的 video#video_html5_api 也能找到', app2._getVideoEl() === topVideo, '');
});

test('F6-5 缓存的视频元素脱离文档后自动失效（iframe 重载，#55）', async () => {
    const { env, video } = await envWithTree(chapterSpecs(['1.1']), { stepTitle: '视频' });
    const app = await env.boot();
    check('F6-5 初次命中缓存', app._getVideoEl() === video, '');
    const doc = await frameDoc(env, 'player');
    doc.body.innerHTML = '';
    const found = app._getVideoEl();
    check('F6-5 旧节点脱离文档后返回 null', found === null, 'found=' + !!found);
    check('F6-5 打印缓存失效日志', env.xt.has('缓存的视频节点已脱离文档'), '');
});
// ---------------------------------------------------------------------------
// F7 启动与文档（#4 #5 #12 #16 #17 #23 #33 #47）
// ---------------------------------------------------------------------------

test('F7-1 README 中的仓库内链接全部有效', () => {
    const readmePath = resolve(repoRoot, 'README.md');
    check('F7-1 README 存在', existsSync(readmePath), readmePath);
    const readme = readFileSync(readmePath, 'utf8');
    const links = [...readme.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
    const broken = [];
    for (const target of links) {
        if (/^(https?:|mailto:|#)/i.test(target)) continue;
        const clean = target.split('#')[0].trim();
        if (!clean) continue;
        if (!existsSync(resolve(repoRoot, clean))) broken.push(target);
    }
    check('F7-1 所有仓库内链接都指向存在的文件', broken.length === 0, 'broken=' + JSON.stringify(broken));
    check('F7-1 至少包含源码/油猴/构建脚本链接', ['v3_optimized.js', 'v3_optimized.user.js', 'scripts/build-userscript.mjs'].every((p) => links.some((l) => l.indexOf(p) >= 0)), JSON.stringify(links));
});

test('F7-2 README 记录的默认配置与实际代码一致', async () => {
    const readme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8');
    // 取「配置块」而不是文档里第一个 javascript 代码块：按 playbackRate 关键字定位，避免新增章节导致误判。
    const block = (readme.match(/```javascript\r?\n([\s\S]*?)```/g) || []).map((m) => m.match(/```javascript\r?\n([\s\S]*?)```/)[1]).find((body) => body.indexOf('playbackRate') >= 0) || null;
    check('F7-2 README 含 javascript 配置块', !!block, '');
    const env = createEnv({ html: tree(chapterSpecs(['1.1'])) });
    const app = await env.boot();
    const pairs = block ? [...block.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^,\n]+?),?\s*$/gm)].map((m) => [m[1], m[2].trim()]) : [];
    const parseValue = (raw) => {
        if (raw === 'true') return true;
        if (raw === 'false') return false;
        if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
        return raw.replace(/^['"]|['"]$/g, '');
    };
    const mismatched = [];
    for (const pair of pairs) {
        const key = pair[0];
        const raw = pair[1];
        if (raw.indexOf('{') >= 0 || raw.indexOf('}') >= 0) continue; // 跳过 configs: { 之类的包装行
        if (!(key in app.configs)) { mismatched.push(key + ' 不存在于代码 configs'); continue; }
        if (String(app.configs[key]) !== String(parseValue(raw))) mismatched.push(`${key}: README=${parseValue(raw)} code=${app.configs[key]}`);
    }
    check('F7-2 README 每个配置项都与代码一致', pairs.length > 0 && mismatched.length === 0, JSON.stringify(mismatched));
    for (const key of ['autoAdvanceNoVideo', 'maxConsecutiveNoVideoAdvances', 'resumeMaxAttemptsPerUnit', 'videoFrameMaxDepth']) {
        check('F7-2 README 记录了安全阀配置 ' + key, pairs.some((p) => p[0] === key), '');
    }
});

test('F7-3 启动失败/未就绪时给出可操作提示', async () => {
    const env = createEnv({ html: '<div id="empty"></div>' });
    await env.boot(22000);
    check('F7-3 未检测到课程目录时报启动超时', env.xt.has('脚本启动超时'), '');
    check('F7-3 超时日志包含处理方法', env.xt.has('处理方法'), '');
    check('F7-3 目录缺失时不创建 app', !env.window.app, '');

    const env2 = createEnv({ html: '<div id="coursetree"><ul></ul></div>' });
    await env2.boot(22000);
    check('F7-3 目录已出现但无小节节点时给出等待提示', env2.xt.has('没有渲染出任何小节节点'), '');

    const env3 = createEnv({ html: '<div id="coursetree"><ul></ul></div>' });
    env3.window.eval('delete window.jQuery; delete window.$;');
    env3.window.eval(env3.source);
    const tag = env3.window.document.querySelector('script[src*="code.jquery.com"]');
    check('F7-3 页面缺少 jQuery 时补一个 CDN script（脚本唯一外部资源）', !!tag, '');
    if (tag && typeof tag.onerror === 'function') tag.onerror();
    check('F7-3 CDN 被拦截时给出可操作提示', env3.xt.has('CDN 加载被浏览器/网络拦截'), '');
});

test('修复点注释齐全，可回溯到具体 issue 编号', () => {
    const code = readFileSync(sourcePath, 'utf8');
    for (const f of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7']) {
        check('源码注释包含 ' + f + '（#issue）', new RegExp(f + '（#[0-9]+').test(code), '');
    }
    check('F1 注释说明导航锁复位', /F1（#[^）]*）[^\n]*导航锁/.test(code), '');
    check('F4 注释说明移除 mouseout/mouseleave 劫持', /F4（#[^）]*）[^\n]*mouseleave\/mouseout|mouseleave\/mouseout/.test(code), '');
});

test('V3.4 版本标识与构建脚本一致', () => {
    const code = readFileSync(sourcePath, 'utf8');
    const build = readFileSync(resolve(repoRoot, 'scripts/build-userscript.mjs'), 'utf8');
    check('源码声明 V3.4', /const VERSION = 'V3\.4'/.test(code), '');
    check('构建脚本 @version 为 3.4.0', /@version\s+3\.4\.0/.test(build), '');
});

test('F8 xuexitong.js（V1）入口点击已加固，不再有未保护的 querySelector(...).click()（#14 #15 #16 #17 #18）', () => {
    const v1Path = resolve(repoRoot, 'xuexitong.js');
    check('F8 xuexitong.js 存在', existsSync(v1Path), v1Path);
    const raw = readFileSync(v1Path, 'utf8');
    const code = stripComments(raw);
    const unguarded = [...code.matchAll(/querySelector(?:All)?\s*\([^)]*\)\s*\.\s*click\s*\(/g)].map((m) => m[0]);
    check('F8 不存在 querySelector(...).click() 的无保护写法', unguarded.length === 0, JSON.stringify(unguarded));
    check('F8 保留两种入口选择器兜底（li[title=视频] / button[title=播放视频]）', /li\[title="视频"\]/.test(code) && /button\[title="播放视频"\]/.test(code), '');
    check('F8 兜底失败时改为可操作提示而不是抛异常中断', /console\.warn\(/.test(code) && code.indexOf('已跳过本次点击') >= 0, '');
    let nodeCheckOk = true;
    let nodeCheckDetail = '';
    try {
        execFileSync(process.execPath, ['--check', v1Path], { stdio: 'pipe' });
    } catch (error) {
        nodeCheckOk = false;
        nodeCheckDetail = String((error && error.message) || error);
    }
    check('F8 node --check xuexitong.js 通过', nodeCheckOk, nodeCheckDetail);
    check('F8 V1 其它逻辑未被改动（iframe 取 video 与 2 倍速仍在）', code.indexOf('iframe.ans-insertvideo-online') >= 0 && code.indexOf('video#video_html5_api') >= 0 && code.indexOf('v.playbackRate = 2') >= 0, '');
});
// ---------------------------------------------------------------------------
// 运行入口
// ---------------------------------------------------------------------------

async function main() {
    console.log('XT_SOURCE = ' + sourcePath);
    console.log('');
    for (const t of tests) {
        const start = results.length;
        try {
            await t.fn();
        } catch (error) {
            check(t.id + ' 执行异常', false, String((error && error.stack) || error));
        }
        const group = results.slice(start);
        const failed = group.filter((r) => !r.ok);
        console.log(`${failed.length === 0 ? 'PASS' : 'FAIL'}  ${t.id}  (${group.length - failed.length}/${group.length})`);
        for (const r of failed) console.log('        - ' + r.name + (r.detail ? ' :: ' + r.detail : ''));
    }
    for (const env of openEnvs) env.close();
    const failedAll = results.filter((r) => !r.ok);
    console.log('');
    console.log(`断言统计：${results.length - failedAll.length}/${results.length} 通过`);
    if (failedAll.length) {
        console.log('失败明细：');
        for (const r of failedAll) console.log('  FAIL ' + r.name + (r.detail ? ' :: ' + r.detail : ''));
        process.exitCode = 1;
        return;
    }
    console.log('V3.4 回归测试全部通过（F1-F8）。');
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
