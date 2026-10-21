(function xuexitongMain() {
    const PAGE = window;
    const $ = (...args) => PAGE.jQuery(...args);
    const APP_KEY = '__xuexitongConsoleDeepSeek';
    const BOOT_TIMER_KEY = '__xuexitongConsoleDeepSeekBootTimer';
    const LOCAL_URL = 'http://127.0.0.1:37841';
    const LOCAL_TOKEN = '__LOCAL_TOKEN__';
    const QUIZ_RESULT_GRACE_MS = 10000;
    const SELECTION_CONFIRM_MS = 2000;
    const EXT_MODE = Boolean(document.documentElement && document.documentElement.dataset.xxthBridge === '1');
    const kindPattern = /[\[【](单选题|多选题|判断题)[\]】]/;
    const QUIZ_MARKER_RE = /题量\s*[:：]?\s*\d+|满分\s*[:：]?\s*\d+|[\[【［〖「(（]\s*(单选题|多选题|判断题)\s*[\]】］〗」)）]/;
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // 内容识别优先于 URL 识别：不同部署的 cards iframe 路径、参数并不一致，
    // 也有的把测验直接渲染在顶层文档里。但"题量：N""【单选题】"是页面自身特征，跨改版更稳。
    function sameOriginDocuments() {
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

    function documentShowsQuiz(doc) {
        try {
            const text = documentText(doc);
            return Boolean(text) && QUIZ_MARKER_RE.test(text);
        } catch {
            return false;
        }
    }

    // 学习通某些 cards 框架里 innerText 会返回空（布局在 Chrome 眼里不可渲染），
    // 但 textContent 是完整的——只是它会把防复制的隐藏干扰字一并读出来。
    // 所以优先级：innerText → 逐文本节点筛掉不可见字 → textContent。
    function documentText(doc) {
        try {
            if (!doc || !doc.body) return '';
            const inner = doc.body.innerText || '';
            if (inner.trim()) return inner;
            return doc.body.textContent || '';
        } catch {
            return '';
        }
    }

    // 只拼接"真的看得见"的文本节点，跳过反爬插入的隐藏字。
    function visibleText(root) {
        const view = root.ownerDocument && root.ownerDocument.defaultView;
        if (!view) return '';
        const parts = [];
        const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
            const raw = node.nodeValue || '';
            if (raw.trim()) {
                const parent = node.parentElement;
                if (parent && isRenderable(parent, node, view)) parts.push(raw);
            }
            node = walker.nextNode();
        }
        return parts.join('');
    }

    function isRenderable(element, textNode, view) {
        try {
            const style = view.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (style.opacity === '0') return false;
            if (parseFloat(style.fontSize) === 0) return false;
            const color = style.color || '';
            if (/rgba\([^)]*,\s*0\s*\)/.test(color) || color === 'transparent') return false;
            const indent = parseFloat(style.textIndent);
            if (Number.isFinite(indent) && indent < -500) return false;
            const range = element.ownerDocument.createRange();
            range.selectNodeContents(textNode);
            const rect = range.getBoundingClientRect();
            if (!rect || (!rect.width && !rect.height)) return false;
            if (rect.right < 0 || rect.bottom < 0) return false;
            return true;
        } catch {
            return false;
        }
    }

    function textOf(el) {
        if (!el) return '';
        try {
            const inner = el.innerText || '';
            if (inner.trim()) return inner;
        } catch { /* ignore */ }
        try {
            const visible = visibleText(el);
            if (visible.trim()) return visible;
        } catch { /* ignore */ }
        try {
            return el.textContent || '';
        } catch {
            return '';
        }
    }

    function quizLooksPresent() {
        return sameOriginDocuments().some(documentShowsQuiz);
    }

    // 只认"真的显示在屏幕上"的测验内容：隐藏 iframe 里残留的题目不算数。
    function visibleQuizDocument() {
        if (documentShowsQuiz(document)) return document;
        for (const frame of document.querySelectorAll('iframe')) {
            if (!frame.getClientRects().length) continue;
            let doc = null;
            try { doc = frame.contentDocument; } catch { continue; }
            if (doc && documentShowsQuiz(doc)) return doc;
        }
        return null;
    }

    // 一句话证据：几帧、几帧跨域、cards 帧的 num。
    function buildProbe() {
        const frames = [];
        let idx = 0;
        for (const frame of document.querySelectorAll('iframe')) {
            idx++;
            const item = { idx, visible: frame.getClientRects().length > 0 };
            try {
                const doc = frame.contentDocument;
                item.href = String(frame.contentWindow?.location?.href || frame.getAttribute('src') || '').slice(0, 150);
                if (!doc || !doc.body) {
                    item.empty = true;
                } else {
                    const inner = doc.body.innerText || '';
                    item.innerLen = inner.length;
                    item.textLen = (doc.body.textContent || '').length;
                    item.quiz = documentShowsQuiz(doc);
                    item.slice = (inner || doc.body.textContent || '').replace(/\s+/g, ' ').slice(0, 150);
                }
            } catch (error) {
                item.error = String(error.message).slice(0, 60);
            }
            frames.push(item);
        }
        const topInner = document.body?.innerText || '';
        const prevTitle = document.querySelector('.prev_title');
        return {
            topInnerLen: topInner.length,
            topQuiz: documentShowsQuiz(document),
            topSlice: topInner.replace(/\s+/g, ' ').slice(0, 150),
            prevTitle: (prevTitle?.getAttribute('title') || prevTitle?.textContent || '').trim(),
            frames,
        };
    }

    function describeFrames() {
        const frames = Array.from(document.querySelectorAll('iframe')).map((frame) => {
            const src = frame.getAttribute('src') || '';
            let num = '';
            let sameOrigin = false;
            try { num = new URL(src, location.href).searchParams.get('num') || ''; } catch { /* ignore */ }
            try { sameOrigin = Boolean(frame.contentDocument); } catch { sameOrigin = false; }
            return { src, num, visible: frame.getClientRects().length > 0, sameOrigin };
        });
        const cards = frames.filter((frame) => frame.src.includes('/knowledge/cards'));
        return {
            total: frames.length,
            cross: frames.filter((frame) => !frame.sameOrigin).length,
            cards: cards.map((frame) => `num=${frame.num || '?'}${frame.visible ? '' : '(隐藏)'}`).join(' ') || '无 cards 帧',
            srcs: frames.map((frame) => {
                let path = frame.src;
                try {
                    const url = new URL(frame.src, location.href);
                    path = `${url.host}${url.pathname}${url.search.slice(0, 120)}`;
                } catch { /* ignore */ }
                return `${frame.visible ? '显' : '隐'}/${frame.sameOrigin ? '同源' : '跨域'} ${path}`;
            }),
        };
    }

    function anyVideoPresent() {
        return sameOriginDocuments().some((doc) => {
            try { return Boolean(doc.querySelector('video')); } catch { return false; }
        });
    }

    function frameSummary() {
        const frames = Array.from(document.querySelectorAll('iframe'));
        let cross = 0;
        for (const frame of frames) {
            try {
                if (!frame.contentDocument) cross++;
            } catch {
                cross++;
            }
        }
        return { total: frames.length, cross };
    }

    /* ---------- 页面内的状态悬浮窗 ----------
       学习通有 debugger 反调试，一按 F12 页面就全局暂停，控制台没法用来确认状态，
       所以运行进度、识别结果和报错都直接显示在页面上。 */
    const css = (el, styles) => {
        for (const key of Object.keys(styles)) el.style[key] = styles[key];
        return el;
    };

    const ui = (() => {
        let root = null;
        let stateDot = null;
        let stateText = null;
        let bodyEl = null;
        let logEl = null;
        let powerEl = null;
        let collapsed = false;
        let powerOn = true;
        const infoRows = {};
        const entries = [];

        function applyPowerVisual() {
            if (!powerEl) return;
            powerEl.textContent = powerOn ? '开' : '关';
            powerEl.style.background = powerOn ? 'rgba(76,175,80,.22)' : 'rgba(255,255,255,.10)';
            powerEl.style.borderColor = powerOn ? 'rgba(76,175,80,.55)' : 'rgba(255,255,255,.25)';
            powerEl.style.color = powerOn ? '#7BD88F' : '#B9C0C8';
        }

        function togglePower() {
            const app = PAGE.app;
            if (!app) return;
            powerOn = !powerOn;
            applyPowerVisual();
            if (powerOn) app.resume?.();
            else app.pause?.();
        }

        function ensure() {
            if (root && root.isConnected) return true;
            if (!document.body) return false;
            try {
                root = document.createElement('div');
                root.id = '__xuexitongAssistantPanel';
                css(root, {
                    position: 'fixed', left: '16px', bottom: '96px', zIndex: '2147483647',
                    width: '320px', boxSizing: 'border-box', borderRadius: '10px',
                    font: '12px/1.65 "Microsoft YaHei",system-ui,sans-serif',
                    color: '#E6E9ED', background: 'rgba(24,31,39,.95)',
                    border: '1px solid rgba(255,255,255,.14)', boxShadow: '0 8px 28px rgba(0,0,0,.4)',
                    overflow: 'hidden',
                });

                const head = document.createElement('div');
                css(head, {
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                    background: 'rgba(255,255,255,.06)', cursor: 'pointer',
                });
                const title = document.createElement('span');
                title.textContent = '学习通助手';
                css(title, { fontWeight: '600', fontSize: '12.5px', flex: '0 0 auto' });
                stateDot = document.createElement('span');
                css(stateDot, { width: '8px', height: '8px', borderRadius: '50%', background: '#8A8F98', flex: '0 0 auto' });
                stateText = document.createElement('span');
                stateText.textContent = '启动中';
                css(stateText, { flex: '1 1 auto', color: '#B9C0C8', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
                const toggle = document.createElement('span');
                toggle.textContent = '收起';
                css(toggle, { flex: '0 0 auto', color: '#8FA0B3', fontSize: '11px' });

                powerEl = document.createElement('span');
                powerEl.textContent = '开';
                css(powerEl, {
                    flex: '0 0 auto', cursor: 'pointer', padding: '1px 8px', borderRadius: '999px',
                    fontSize: '11px', border: '1px solid rgba(76,175,80,.55)',
                    background: 'rgba(76,175,80,.22)', color: '#7BD88F',
                });
                powerEl.addEventListener('click', (event) => {
                    event.stopPropagation();
                    togglePower();
                });
                head.append(title, stateDot, stateText, powerEl, toggle);

                bodyEl = document.createElement('div');
                css(bodyEl, { padding: '8px 10px 10px' });
                for (const label of ['步骤', '题量', '服务']) {
                    const row = document.createElement('div');
                    css(row, { display: 'flex', gap: '8px', marginBottom: '2px' });
                    const key = document.createElement('span');
                    key.textContent = label;
                    css(key, { flex: '0 0 30px', color: '#7E8A97' });
                    const value = document.createElement('span');
                    value.textContent = '—';
                    css(value, { flex: '1 1 auto', color: '#D5DBE2', wordBreak: 'break-all' });
                    row.append(key, value);
                    bodyEl.appendChild(row);
                    infoRows[label] = value;
                }
                logEl = document.createElement('div');
                css(logEl, {
                    marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed rgba(255,255,255,.14)',
                    color: '#9AA6B2', fontSize: '11.5px',
                });
                bodyEl.appendChild(logEl);

                // 标题栏：点右侧“收起/展开”折叠，拖标题栏可以整体移动。
                css(head, { cursor: 'move', userSelect: 'none' });
                toggle.addEventListener('click', (event) => {
                    event.stopPropagation();
                    collapsed = !collapsed;
                    bodyEl.style.display = collapsed ? 'none' : 'block';
                    toggle.textContent = collapsed ? '展开' : '收起';
                });
                head.addEventListener('mousedown', (event) => {
                    if (event.button !== 0) return;
                    if (event.target === powerEl || event.target === toggle) return;
                    const rect = root.getBoundingClientRect();
                    const offsetX = event.clientX - rect.left;
                    const offsetY = event.clientY - rect.top;
                    let moved = false;
                    const onMove = (moveEvent) => {
                        moved = true;
                        const maxX = Math.max(0, window.innerWidth - rect.width);
                        const maxY = Math.max(0, window.innerHeight - rect.height);
                        const x = Math.min(maxX, Math.max(0, moveEvent.clientX - offsetX));
                        const y = Math.min(maxY, Math.max(0, moveEvent.clientY - offsetY));
                        root.style.left = `${x}px`;
                        root.style.top = `${y}px`;
                        root.style.bottom = 'auto';
                    };
                    const onUp = () => {
                        window.removeEventListener('mousemove', onMove, true);
                        window.removeEventListener('mouseup', onUp, true);
                        if (moved) root.dataset.moved = '1';
                    };
                    window.addEventListener('mousemove', onMove, true);
                    window.addEventListener('mouseup', onUp, true);
                    event.preventDefault();
                });

                root.append(head, bodyEl);
                document.body.appendChild(root);
                applyPowerVisual();
                return true;
            } catch {
                return false;
            }
        }

        return {
            state(kind, text) {
                if (!ensure()) return;
                const colors = { ok: '#4CAF50', work: '#4C9AFF', bad: '#F4544A', idle: '#8A8F98' };
                stateDot.style.background = colors[kind] || colors.idle;
                stateText.textContent = text;
            },
            info(label, value) {
                if (!ensure()) return;
                if (infoRows[label]) infoRows[label].textContent = String(value);
            },
            power(on) {
                powerOn = Boolean(on);
                if (!ensure()) return;
                applyPowerVisual();
            },
            log(text) {
                const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
                entries.push(`${stamp} ${text}`);
                while (entries.length > 6) entries.shift();
                serviceLog('page', text);
                if (!ensure()) return;
                logEl.textContent = '';
                for (const line of entries) {
                    const div = document.createElement('div');
                    div.textContent = line;
                    logEl.appendChild(div);
                }
            },
        };
    })();

    function setStatus(kind, text) {
        ui.state(kind, text);
    }

    // 选项行识别：优先要求"行首 A + 分隔标点"，避免题干里以 A 开头的正文被误切成选项区。
    const OPTION_LINE_RE = /(?:^|\n)[ \t]*A[ \t]*[.、．)）:：][ \t]*\S/;
    const OPTION_LINE_LOOSE_RE = /(?:^|\n)[ \t]*A[ \t]+\S/;
    const SECOND_OPTION_RE = /(?:^|\n)[ \t]*B[ \t]*[.、．)）:：]?[ \t]*\S/;

    const startedByKeeper = PAGE.__xuexitongAutoInjected === true;
    delete PAGE.__xuexitongAutoInjected;
    if (!/^https:\/\/([a-z0-9-]+\.)*chaoxing\.com$/i.test(location.origin) ||
        !location.pathname.includes('/mycourse/studentstudy')) {
        console.error('请在学习通课程播放页的控制台执行本脚本');
        return;
    }
    // 没有令牌 / 连不上本地服务时，退化成"基础模式"：只自动播放视频，
// 遇到章节测验就停下等你自己处理，不会尝试作答。
    let serviceAvailable = false;

    /* ---------- 通信层：扩展模式走 postMessage → 后台转发；控制台模式直连 ---------- */

    let bridgeSeq = 0;
    const bridgePending = new Map();

    if (EXT_MODE) {
        PAGE.addEventListener('message', (event) => {
            if (event.source && event.source !== PAGE) return;
            const data = event.data;
            if (!data || data.__xxth !== 'reply') return;
            const pending = bridgePending.get(data.id);
            if (!pending) return;
            bridgePending.delete(data.id);
            clearTimeout(pending.timer);
            if (data.ok) pending.resolve(data.data);
            else pending.reject(new Error(data.error || '扩展通信失败'));
        });
    }

    function bridgeRequest(op, payload, timeoutMs) {
        const id = `${Date.now()}-${++bridgeSeq}`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                bridgePending.delete(id);
                reject(new Error('扩展后台未在预期时间内响应，请重新加载页面'));
            }, timeoutMs);
            bridgePending.set(id, { resolve, reject, timer });
            PAGE.postMessage({ __xxth: 'request', id, op, payload }, location.origin);
        });
    }

    async function serviceHealth() {
        if (EXT_MODE) return bridgeRequest('health', null, 15000);
        const response = await fetch(`${LOCAL_URL}/health`, {
            headers: { 'X-Xuexitong-Token': LOCAL_TOKEN },
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }

    async function serviceAnswer(payload) {
        if (EXT_MODE) {
            const data = await bridgeRequest('answer', { questions: payload }, 900000);
            return data.answers;
        }
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

    // 把运行状态写进本地服务的日志文件，排查时直接看文件，不用开 DevTools
    // （学习通有 debugger 反调试，F12 会让整页暂停）。
    async function serviceLog(event, data) {
        const payload = { event, data, url: location.href };
        try {
            if (EXT_MODE) {
                await bridgeRequest('log', payload, 5000);
            } else {
                await fetch(`${LOCAL_URL}/log`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Xuexitong-Token': LOCAL_TOKEN },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(5000),
                });
            }
        } catch { /* 日志失败不影响主流程 */ }
    }

    // 把页面内嵌的 font-cxsecret（base64 data URI）存到本机 dump/，供离线还原字符映射。
    async function saveFile(name, base64) {
        const payload = { name, base64 };
        try {
            if (EXT_MODE) {
                await bridgeRequest('file', payload, 60000);
            } else {
                await fetch(`${LOCAL_URL}/file`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Xuexitong-Token': LOCAL_TOKEN },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(60000),
                });
            }
            return true;
        } catch {
            return false;
        }
    }

    let fontSaved = false;
    // ---- font-cxsecret 解密表（假字 → 真字）----
    // 学习通把题干里的部分汉字换成生僻字，再用内嵌字体把它们渲染回正确的字形。
    // 表由 tools/render-glyphs.mjs 把字形渲成图片、逐个辨认得到，存在本地服务上。
    // 只有真正套用了加密字体的那段文字才需要"看图还原"。
    function isSecretElement(el) {
        try {
            return Boolean(el && el.closest && el.closest('.font-cxsecret'));
        } catch {
            return false;
        }
    }

    // 把一段文字按目标元素的字体渲染成图片，交给本机 Windows OCR 读回来。
    // 字体反爬是把真字换成生僻字、再用内嵌字体渲染回正确字形，
    // 所以"看图"永远是对的，跟当前页面用哪套映射无关。
    async function ocrRenderText(doc, fontSourceEl, text) {
        try {
            const raw = String(text || '').replace(/\s+/g, ' ').trim();
            if (!raw) return null;
            const view = doc.defaultView;
            const style = fontSourceEl ? view.getComputedStyle(fontSourceEl) : null;
            const family = (style && style.fontFamily) || '"Microsoft YaHei", sans-serif';
            const canvas = doc.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const measure = (size) => {
                ctx.font = `${size}px ${family}`;
                return ctx.measureText(raw).width + 40;
            };
            let fontSize = 36;
            let width = measure(fontSize);
            if (width > 3000) {
                fontSize = Math.max(16, Math.floor(fontSize * 3000 / width));
                width = measure(fontSize);
            }
            canvas.width = Math.max(64, Math.ceil(width));
            canvas.height = Math.ceil(fontSize * 2.2);
            const paint = canvas.getContext('2d');
            paint.fillStyle = '#ffffff';
            paint.fillRect(0, 0, canvas.width, canvas.height);
            paint.fillStyle = '#000000';
            paint.font = `${fontSize}px ${family}`;
            paint.textBaseline = 'middle';
            paint.fillText(raw, 20, canvas.height / 2);
            const base64 = canvas.toDataURL('image/png').split(',')[1];
            let result = null;
            if (EXT_MODE) {
                result = await bridgeRequest('ocr', { image: base64 }, 40000);
            } else {
                const response = await fetch(`${LOCAL_URL}/ocr`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Xuexitong-Token': LOCAL_TOKEN },
                    body: JSON.stringify({ image: base64 }),
                    signal: AbortSignal.timeout(40000),
                });
                result = await response.json().catch(() => null);
            }
            const out = String((result && result.text) || '').replace(/\s+/g, '').trim();
            return out || null;
        } catch {
            return null;
        }
    }

    async function saveSecretFont() {
        if (fontSaved) return [];
        const saved = [];
        const skippedSheets = [];
        try {
            for (const doc of sameOriginDocuments()) {
                for (const sheet of Array.from(doc.styleSheets || [])) {
                    let rules = null;
                    try { rules = sheet.cssRules; } catch {
                        // 跨域样式表读不到规则，至少把地址记下来
                        if (sheet.href) skippedSheets.push(String(sheet.href).slice(0, 160));
                        continue;
                    }
                    for (const rule of Array.from(rules || [])) {
                        const text = String(rule.cssText || '');
                        if (!/@font-face/i.test(text) || !/cxsecret/i.test(text)) continue;
                        const match = /base64,([A-Za-z0-9+/=]{200,})/.exec(text);
                        if (!match) continue;
                        const base64 = match[1];
                        const name = `cxsecret-${base64.length}.ttf`;
                        if (await saveFile(name, base64)) saved.push(`${name}(${base64.length})`);
                    }
                }
            }
        } catch { /* ignore */ }
        if (saved.length) {
            fontSaved = true;
            serviceLog('font-saved', saved);
        } else {
            serviceLog('font-miss', { skippedSheets });
        }
        return saved;
    }

    /* ---------- 启动 ---------- */

    // 把页面里每一条 console 输出也镜像到 debug.log，否则只看得到 ui.log 那几条。
    (function mirrorConsole() {
        const isCssArg = (value) => typeof value === 'string' &&
            (/^(color|font|background|padding|margin|border)/i.test(value) || value.includes('font-size'));
        let lastText = '';
        let lastAt = 0;
        for (const level of ['log', 'info', 'warn', 'error']) {
            const native = console[level].bind(console);
            console[level] = function (...args) {
                try { native(...args); } catch { /* ignore */ }
                try {
                    const parts = [];
                    for (const arg of args) {
                        if (typeof arg === 'string') {
                            if (isCssArg(arg)) continue;
                            parts.push(arg.replace(/%c/g, ''));
                        } else if (arg instanceof Error) {
                            parts.push(arg.message);
                        } else if (arg && typeof arg === 'object') {
                            try { parts.push(JSON.stringify(arg).slice(0, 300)); } catch { parts.push('[object]'); }
                        } else {
                            parts.push(String(arg));
                        }
                    }
                    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
                    if (!text) return;
                    const now = Date.now();
                    if (text === lastText && now - lastAt < 2000) return;
                    lastText = text;
                    lastAt = now;
                    serviceLog('console', { level, text: text.slice(0, 500) });
                } catch { /* ignore */ }
            };
        }
        PAGE.addEventListener('error', (event) => {
            serviceLog('window-error', {
                message: String(event.message || '').slice(0, 300),
                source: String(event.filename || '').slice(-60),
                line: event.lineno,
            });
        });
        PAGE.addEventListener('unhandledrejection', (event) => {
            serviceLog('unhandled-rejection', { reason: String(event.reason?.message || event.reason).slice(0, 300) });
        });
    })();

    // 只要脚本被注入就立刻上报一次：能区分"没注入"和"注入了但没识别"。
    serviceLog('boot', {
        extMode: EXT_MODE,
        readyState: document.readyState,
        hasTree: Boolean(document.querySelector('#coursetree')),
    });

    const previousApp = PAGE[APP_KEY];
    if (previousApp && typeof previousApp.destroy === 'function') previousApp.destroy();
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
    if (startedByKeeper || EXT_MODE) {
        if (EXT_MODE) console.log('Edge 扩展环境：整页跳转后由扩展自动接管，无需辅助窗口');
    } else {
        installNavigationKeeper();
    }

    // 启动页面自动化。full 为 false 时是基础模式：只刷视频，不答题。
    function startPageAutomation() {
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
    }

    serviceHealth().then(() => {
        serviceAvailable = true;
        console.log(`DeepSeek 本地服务已连接（${EXT_MODE ? '扩展通道' : '控制台直连'}）`);
        ui.state('ok', '本地服务已连接');
        ui.info('服务', EXT_MODE ? '已连接（扩展通道）' : '已连接（控制台直连）');
        ui.log('本地服务已连接');
        startPageAutomation();
    }).catch((error) => {
        // 连不上服务不算失败：基础模式只负责播放视频，测验留给用户自己处理
        serviceAvailable = false;
        const detail = error?.message || String(error);
        console.warn(`本地服务不可用，进入基础模式（仅自动播放视频，不处理章节测验）：${detail}`);
        setStatus('idle', '基础模式：仅自动刷视频');
        ui.info('服务', '未连接（基础模式）');
        ui.log('本地服务未连接，进入基础模式');
        startPageAutomation();
    });

    function installNavigationKeeper() {
        try {
            const keeper = PAGE.open('', 'xuexitongConsoleKeeper', 'width=360,height=150');
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
            console.warn('整页跳转后无法自动重新启动脚本；请允许此站点打开弹出窗口，或改用 Edge 扩展。', error);
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
                serviceLog('boot-timeout', { frames: describeFrames(), body: (document.body?.innerText || '').slice(0, 200) });
            }
        }, 1000);
    }

    function cutIndexForOptions(full) {
        const strict = full.search(OPTION_LINE_RE);
        if (strict >= 0) return strict;
        const loose = full.search(OPTION_LINE_LOOSE_RE);
        if (loose < 0) return -1;
        return SECOND_OPTION_RE.test(full.slice(loose)) ? loose : -1;
    }

    // 暴露给 tools/selftest.mjs 做回归测试；也方便在控制台直接调 app.inspectQuiz() 之外的底层判断。
    PAGE.__xuexitongInternals = { cutIndexForOptions, EXT_MODE };

    /* ---------- 章节测验 ---------- */

    function attachQuizAutomation(app) {
        const attemptedQuizzes = new Set();
        let quizBusy = false;
        let stopped = false;
        const originalDestroy = app.destroy.bind(app);
        app.destroy = function () {
            stopped = true;
            originalDestroy();
        };
        // 悬浮窗上的"开/关"用它来暂停、恢复，不必销毁实例。
        app._setStopped = (value) => { stopped = Boolean(value); };
        app._setQuizBusy = (value) => { quizBusy = Boolean(value); };

        const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const visible = (el) => Boolean(el && el.isConnected && el.getClientRects().length &&
            el.ownerDocument.defaultView.getComputedStyle(el).visibility !== 'hidden');

        function courseDocuments() {
            return sameOriginDocuments();
        }

        function quizCompleted() {
            const scoreShown = courseDocuments().some((doc) => {
                const text = clean(documentText(doc));
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
                    if (clean(textOf(target)).length > 1) break;
                }
                const optionRaw = clean(textOf(target)).replace(new RegExp(`^${letter}[.、．]?\\s*`), '');
                // 被加密的选项稍后统一走 OCR 还原，这里先保留原文
                const text = optionRaw;
                if (text) found.set(letter, { letter, text, element: target });
            }
            return Array.from(found.values()).sort((a, b) => a.letter.localeCompare(b.letter));
        }

        // 不依赖 innerText 的换行：克隆卡片、摘掉选项节点，剩下的文本就是题干。
        function titleWithoutOptions(card, options) {
            const marked = [];
            try {
                for (const option of options) {
                    if (!option.element) continue;
                    option.element.setAttribute('data-xxth-opt', '1');
                    marked.push(option.element);
                }
                const clone = card.cloneNode(true);
                for (const el of clone.querySelectorAll('[data-xxth-opt]')) el.remove();
                return clone.textContent || '';
            } catch {
                return '';
            } finally {
                for (const el of marked) {
                    try { el.removeAttribute('data-xxth-opt'); } catch { /* ignore */ }
                }
            }
        }

        // 排查"干扰字"用：把第一道题卡片的文本节点逐条转储，
// 看看到底是隐藏节点插入（每段文字有不同的 display/尺寸）
// 还是同节点字体映射（节点正常、码点被替换）。
        // 收集页面里自定义加密字体的 @font-face 定义和实际加载状态，
// 用来判断能不能直接从字体文件里还原字符映射。
        function fontProbe() {
            const faces = [];
            const loaded = [];
            try {
                for (const doc of sameOriginDocuments()) {
                    for (const sheet of Array.from(doc.styleSheets || [])) {
                        let rules = null;
                        try { rules = sheet.cssRules; } catch { continue; }
                        for (const rule of Array.from(rules || [])) {
                            const cssText = String(rule.cssText || '');
                            if (!/@font-face/i.test(cssText)) continue;
                            faces.push(cssText.replace(/\s+/g, ' ').slice(0, 420));
                        }
                    }
                }
            } catch { /* ignore */ }
            try {
                for (const face of Array.from(document.fonts || [])) {
                    loaded.push(`${face.family}|${face.status}|${(face.unicodeRange || '').slice(0, 80)}`);
                }
            } catch { /* ignore */ }
            return { faces: faces.filter((text) => /cxsecret|cx_|secret/i.test(text) || faces.length < 4).slice(0, 6), loaded: loaded.slice(0, 8) };
        }

        // 页面的无障碍属性里有时保留了明文（选项的 aria-label 就是干净的）。
        function attributeProbe(card) {
            const out = [];
            const keys = ['aria-label', 'title', 'data', 'alt'];
            let current = card;
            for (let depth = 0; current && depth < 4; depth++, current = current.parentElement) {
                const targets = [current, ...Array.from(current.querySelectorAll('[aria-label],[title]'))];
                for (const el of targets) {
                    for (const key of keys) {
                        const value = el.getAttribute ? el.getAttribute(key) : null;
                        if (value && value.trim() && out.length < 16) {
                            out.push(`${el.tagName}[${key}]=${value.trim().slice(0, 70)}`);
                        }
                    }
                }
            }
            return out;
        }

        function dumpCard(question) {
            try {
                const card = question.card;
                const doc = question.doc;
                const view = doc.defaultView;
                const nodes = [];
                const walker = doc.createTreeWalker(card, NodeFilter.SHOW_TEXT);
                let node;
                while ((node = walker.nextNode()) && nodes.length < 30) {
                    const text = (node.nodeValue || '').trim();
                    if (!text) continue;
                    const parent = node.parentElement;
                    const style = parent ? view.getComputedStyle(parent) : null;
                    let rect = null;
                    try {
                        const range = doc.createRange();
                        range.selectNodeContents(node);
                        const box = range.getBoundingClientRect();
                        rect = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : null;
                    } catch { /* ignore */ }
                    nodes.push({
                        t: text.slice(0, 40),
                        tag: parent?.tagName || null,
                        cls: (parent?.getAttribute('class') || '').slice(0, 40),
                        style: style
                            ? `${style.display}|${style.visibility}|${style.fontSize}|${style.color}|${style.fontFamily.slice(0, 30)}`
                            : null,
                        rect,
                    });
                }
                let resources = [];
                try {
                    resources = Array.from(performance.getEntriesByType('resource'))
                        .map((entry) => entry.name)
                        .filter((name) => /cards|work|api|question|quiz/i.test(name))
                        .slice(-12)
                        .map((name) => name.slice(0, 140));
                } catch { /* ignore */ }
                return {
                    html: (card.outerHTML || '').slice(0, 2500),
                    cleaned: textOf(card).slice(0, 200),
                    secretNodeCount: card.querySelectorAll('.font-cxsecret').length,
                    attrs: attributeProbe(card),
                    fonts: fontProbe(),
                    fontFamilyOfBody: (() => {
                        try { return view.getComputedStyle(card).fontFamily.slice(0, 80); } catch { return null; }
                    })(),
                    nodes,
                    resources,
                };
            } catch (error) {
                return { error: String(error.message) };
            }
        }

        function extractQuestions() {
            const questions = [];
            for (const doc of courseDocuments()) {
                if (!doc.body) continue;
                const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
                const seenCards = new Set();
                let node;
                while ((node = walker.nextNode())) {
                    const kind = clean(node.textContent).match(kindPattern)?.[1];
                    if (!kind || !visible(node.parentElement)) continue;
                    let card = node.parentElement;
                    let options = [];
                    for (let depth = 0; card && depth < 9; depth++, card = card.parentElement) {
                        const cardText = clean(textOf(card));
                        const kinds = cardText.match(new RegExp(kindPattern.source, 'g')) || [];
                        if (kinds.length > 1) break;
                        options = optionElements(card);
                        if (options.length >= 2 && options.length <= 8) break;
                    }
                    if (!card || options.length < 2 || options.length > 8 || seenCards.has(card)) continue;
                    seenCards.add(card);
                    const full = textOf(card);
                    const firstOption = cutIndexForOptions(full);
                    const title = clean(firstOption >= 0
                        ? full.slice(0, firstOption)
                        : (titleWithoutOptions(card, options) || textOf(node.parentElement) || full))
                        .replace(/^\d+\s*/, '').replace(kindPattern, '').trim();
                    if (!title || title.length > 500 || options.some((option) => !option.text || option.text.length > 500)) continue;
                    questions.push({ kind, title, options, card, doc });
                }
            }
            return questions;
        }

        function findButton(doc, label) {
            const candidates = Array.from(doc.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"],div,span'))
                .filter((el) => visible(el) && clean(el.value || textOf(el)) === label);
            return candidates.find((el) => /^(BUTTON|A|INPUT)$/.test(el.tagName)) ||
                candidates.find((el) => !Array.from(el.children).some((child) => clean(textOf(child)) === label)) || null;
        }

        function findNextButton() {
            for (const doc of courseDocuments()) {
                const known = doc.querySelector('#prevNextFocusNext, #right1, .nextChapter');
                if (visible(known) && clean(textOf(known) || known.title).includes('下一节')) return known;
                const generic = findButton(doc, '下一节');
                if (generic) return generic;
            }
            return null;
        }

        function catalogAtEnd() {
            try {
                const tree = document.querySelector('#coursetree');
                if (!tree) return false;
                const all = Array.from(tree.querySelectorAll('.posCatalog_select'));
                const active = tree.querySelector('.posCatalog_select.posCatalog_active') ||
                    tree.querySelector('.posCatalog_active');
                if (!active || !all.length) return false;
                const index = all.indexOf(active);
                return index >= 0 && index === all.length - 1;
            } catch {
                return false;
            }
        }

        function reportCourseFinished() {
            app._finished = true;
            app._nextUnitPending = false;
            app._isPlaying = false;
            app._clearCheckInterval();
            console.log('%c=====================================', 'color:#4CAF50;font-size:16px');
            console.log('%c==============本课程学习完成了==============', 'color:#4CAF50;font-size:16px;font-weight:bold');
            console.log('%c=====================================', 'color:#4CAF50;font-size:16px');
            console.log('已到课程目录的最后一项，脚本停止。切换到其他课程后重新运行即可。');
            ui.state('ok', '本课程已学完');
            ui.log('已到最后一节，停止');
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
                const countText = clean(documentText(submitDoc)).match(/题量\s*[:：]\s*(\d+)/);
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

        async function askDeepSeek(questions) {
            const payload = questions.map((q, i) => ({
                id: i + 1,
                type: q.kind,
                question: q.title,
                options: q.options.map((o) => ({ letter: o.letter, text: o.text })),
            }));
            console.log('以下是本次发送给 DeepSeek 的题干和选项：', payload);
            return serviceAnswer(payload);
        }

        // 用 OCR 把题干（和少数被加密的选项）还原成真正的文字。
        // 学习通把部分汉字换成生僻字、再用内嵌字体渲染回正确字形，且映射每页都变；
        // 渲染成图再 OCR 读"看到的字形"，与具体映射无关。
        async function refineTitles(questions) {
            let viaOcr = 0;
            let failed = 0;
            for (let i = 0; i < questions.length; i++) {
                const question = questions[i];
                ui.state('work', `OCR 还原题干 ${i + 1}/${questions.length}`);
                const fontEl = question.card.querySelector('.font-cxsecret') || question.card;
                const ocr = await ocrRenderText(question.doc, fontEl, question.title);
                const baseline = question.title.length;
                if (ocr && ocr.length >= 4 && Math.abs(ocr.length - baseline) <= Math.max(10, Math.round(baseline * 0.5))) {
                    question.title = ocr;
                    viaOcr++;
                } else {
                    failed++;
                }
                for (const option of question.options) {
                    if (!isSecretElement(option.element)) continue;
                    const optionOcr = await ocrRenderText(question.doc, option.element, `${option.letter}. ${option.text}`);
                    if (optionOcr && optionOcr.length >= 2) {
                        option.text = optionOcr.replace(/^[A-H][.、．]?\s*/, '');
                    }
                }
            }
            // OCR 有失败时才把字体存下来，方便事后排查；正常情况不落盘
            if (failed && !fontSaved) {
                serviceLog('ocr-failed', { total: questions.length, failed });
                saveSecretFont();
            }
            ui.log(`题干 OCR 还原 ${viaOcr}/${questions.length} 题`);
            serviceLog('titles', { total: questions.length, viaOcr, failed });
            return viaOcr;
        }

        function validateAnswers(questions, answers) {
            if (!Array.isArray(answers) || answers.length !== questions.length) throw new Error('AI 返回的题目数量不匹配');
            const result = new Map();
            for (const item of answers) {
                if (!Number.isInteger(item.id) || result.has(item.id) || !Array.isArray(item.letters)) {
                    throw new Error('AI 答案格式错误');
                }
                const q = questions[item.id - 1];
                if (!q) throw new Error('AI 返回未知题号');
                const letters = item.letters.map((letter) => clean(letter).toUpperCase());
                if (!letters.length) throw new Error(`第 ${item.id} 题 AI 未给出选项，已停止提交`);
                if (new Set(letters).size !== letters.length) throw new Error(`第 ${item.id} 题答案包含重复选项，已停止提交`);
                if (q.kind !== '多选题' && letters.length !== 1) {
                    throw new Error(`第 ${item.id} 题是${q.kind}，但 AI 返回了 ${letters.length} 个选项，已停止提交`);
                }
                const invalidLetters = letters.filter((letter) => !q.options.some((option) => option.letter === letter));
                if (invalidLetters.length) {
                    throw new Error(`第 ${item.id} 题 AI 返回了页面中不存在的选项：${invalidLetters.join('、')}，已停止提交`);
                }
                result.set(item.id, letters);
            }
            return result;
        }

        async function selectionConfirmed(element, card, previousHtml) {
            const deadline = Date.now() + SELECTION_CONFIRM_MS;
            while (Date.now() < deadline) {
                if (!element.isConnected) throw new Error('选项元素已从页面移除，已停止提交');
                const input = element.matches('input') ? element : element.querySelector('input');
                if (input && input.checked) return true;
                if (element.getAttribute('aria-checked') === 'true') return true;
                const className = typeof element.className === 'string' ? element.className : '';
                if (/(active|checked|selected|light)/i.test(className)) return true;
                if (card.outerHTML !== previousHtml) return true;
                await sleep(100);
            }
            return false;
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
                    if (!(await selectionConfirmed(option.element, q.card, before))) {
                        throw new Error(`第 ${i + 1} 题 ${letter} 选项未确认选中（等待 ${SELECTION_CONFIRM_MS / 1000} 秒仍无变化），已停止提交`);
                    }
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
                    const message = clean(textOf(platformButton.ownerDocument.querySelector('#popcontent')));
                    if (/未作答|请选择|请作答|答完/.test(message) && !/确定提交|确认提交/.test(message)) {
                        throw new Error(`平台拒绝提交：${message}`);
                    }
                    console.log(`确认平台提交窗口：${message || '提交'}`);
                    platformButton.click();
                    return;
                }
                const dialog = dialogs.find((el) => el.id !== 'popok' && visible(el) && /提交|交卷/.test(clean(textOf(el))));
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
            console.log('提交已确认，等待学习通记录结果；出现完成标记就立刻进入下一节');
            const startedAt = Date.now();
            while (!stopped) {
                await sleep(400);
                if (quizCompleted()) return true;
                // 成绩页往往一闪而过，没必要一直等；到点就走，反正下一步是点“下一节”。
                if (Date.now() - startedAt >= QUIZ_RESULT_GRACE_MS) {
                    console.log(`%c${QUIZ_RESULT_GRACE_MS / 1000} 秒内未捕捉到成绩/完成标记，直接进入下一节`, 'color:#FF9800');
                    return false;
                }
            }
            throw new Error('脚本已停止');
        }

        async function goToNextStep() {
            if (stopped) throw new Error('脚本已停止');
            const next = findNextButton();
            if (!next) {
                if (catalogAtEnd()) {
                    reportCourseFinished();
                    return;
                }
                throw new Error('未找到页面下方的“下一节”按钮');
            }
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
                if (currentStep !== previousStep && (currentStep === '章节测验' || (!currentStep && quizLooksPresent()))) {
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
                if (attempt > 0 && attempt % 30 === 0) {
                    console.log(`下一学习步骤仍在加载，已等待 ${attempt / 2} 秒；当前页签：${currentStep || '未显示'}`);
                }
            }
            if (!stepReady) {
                throw new Error(`点击“下一节”后等待 120 秒，新学习步骤仍未加载完成；当前页签：${currentStep || '未显示'}`);
            }
            app._nextUnitPending = false;
            app._waitedForContent = false;
            app._videoEl = null;
            app._initCellData();
            app.play();
        }

        app.nextUnit = function () {
            if (stopped || this._paused || this._nextUnitPending || this._finished) return;
            this._nextUnitPending = true;
            goToNextStep().catch((error) => {
                this._nextUnitPending = false;
                if (this._paused) return;
                console.error('切换下一学习步骤失败:', error);
                setStatus('bad', error.message);
                ui.log(`停止：${error.message}`);
                serviceLog('error', { where: 'nextUnit', message: error.message });
            });
        };

        app.inspectQuiz = function () {
            return extractQuestions().map((q, i) => ({
                id: i + 1,
                type: q.kind,
                question: q.title,
                options: q.options.map((o) => `${o.letter}. ${o.text}`),
            }));
        };

        // 手动把第一题的 DOM 结构写到 debug.log，用来判断干扰字是哪种机制。
        app.dump = function () {
            const questions = extractQuestions();
            if (!questions.length) {
                ui.log('当前没识别到题目，无法转储');
                return null;
            }
            const report = dumpCard(questions[0]);
            serviceLog('dom-dump', report);
            ui.log('已把第一题结构写入 debug.log');
            return report;
        };

        // 页面里直接调 app.diag() 就能看到识别依据；也会同步显示在悬浮窗的日志里。
        app.diag = function () {
            const frames = Array.from(document.querySelectorAll('iframe')).map((frame) => {
                let sameOrigin = false;
                let hasQuizMarker = false;
                try {
                    sameOrigin = Boolean(frame.contentDocument);
                    if (sameOrigin) hasQuizMarker = documentShowsQuiz(frame.contentDocument);
                } catch {
                    sameOrigin = false;
                }
                return {
                    src: frame.getAttribute('src') || '',
                    visible: frame.getClientRects().length > 0,
                    sameOrigin,
                    hasQuizMarker,
                };
            });
            const prevTitle = document.querySelector('.prev_title');
            const report = {
                url: location.href,
                step: this._currentStepTitle(),
                isChapterTest: this._isChapterTest(),
                quizLooksPresent: quizLooksPresent(),
                treeFound: Boolean(document.querySelector('#coursetree')),
                prevTitle: (prevTitle?.getAttribute('title') || prevTitle?.textContent || '').trim(),
                frames,
                questions: (() => {
                    try { return this.inspectQuiz().length; } catch (e) { return `error: ${e.message}`; }
                })(),
            };
            ui.log(`步骤=${report.step || '未识别'} 帧=${frames.length} 跨域=${frames.filter((f) => !f.sameOrigin).length} 题=${report.questions}`);
            return report;
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
                // 基础模式：没有本地服务就不作答，停下把控制权交回用户
                if (!serviceAvailable) {
                    console.log('%c检测到章节测验：当前是基础模式（未连接本地服务），不会自动作答。' +
                        '配置好 DeepSeek 服务并刷新页面即可开启自动答题。', 'color:#FF9800;font-weight:bold');
                    ui.state('idle', '基础模式：遇到测验，已暂停');
                    ui.log('遇到章节测验，基础模式不自动作答');
                    setStatus('idle', '基础模式：遇到测验，已暂停');
                    return;
                }
                console.log('已进入章节测验，等待题目和提交按钮加载');
                ui.info('步骤', '章节测验');
                ui.state('work', '正在等待题目加载');
                ui.log('已进入章节测验');
                const questions = await waitForQuizQuestions();
                if (questions === null) {
                    console.log('检测到当前章节测验已完成，点击“下一节”进入新视频');
                    await goToNextStep();
                    return;
                }
                if (questions.length > 30) throw new Error('题目数量超过 30，已停止自动提交');
                const docs = new Set(questions.map((q) => q.doc));
                if (docs.size !== 1) throw new Error('题目跨多个框架，已停止自动提交');
                const countText = clean(documentText(questions[0].doc)).match(/题量\s*[:：]\s*(\d+)/);
                ui.info('题量', `识别 ${questions.length} 题${countText ? ` / 页面 ${countText[1]} 题` : ''}`);
                if (countText && Number(countText[1]) !== questions.length) {
                    throw new Error(`页面显示 ${countText[1]} 道题，脚本只识别 ${questions.length} 道，已停止提交`);
                }
                const signature = questions.map((q) => `${q.kind}:${q.title}`).join('|');
                if (attemptedQuizzes.has(signature)) throw new Error('本次测验已尝试过，已停止重复提交');
                console.log(`识别到 ${questions.length} 道题，正在调用 DeepSeek`);
                serviceLog('dom-dump', dumpCard(questions[0]));
                await refineTitles(questions);
                ui.state('work', `已识别 ${questions.length} 题，正在请求答案`);
                ui.log(`识别到 ${questions.length} 道题，正在请求 DeepSeek`);
                const answers = validateAnswers(questions, await askDeepSeek(questions));
                console.table(questions.map((q, i) => ({ 题号: i + 1, 题型: q.kind, 选择: answers.get(i + 1).join('') })));
                ui.state('work', '答案已返回，开始勾选');
                await selectAnswers(questions, answers);
                attemptedQuizzes.add(signature);
                ui.state('work', '已全部勾选，正在提交');
                await submitQuiz(questions[0].doc);
                console.log('章节测验提交已确认，点击“下一节”进入新视频');
                ui.state('work', '已提交，等待成绩');
                ui.log('已提交，等待成绩页');
                quizBusy = false;
                await goToNextStep();
            })().catch((error) => {
                app._nextUnitPending = false;
                if (app._paused || app._finished) return;
                console.error('章节测验自动作答停止:', error);
                setStatus('bad', error.message);
                ui.log(`停止：${error.message}`);
                serviceLog('error', { where: 'quiz', message: error.message, stack: String(error.stack || '').slice(0, 800) });
            }).finally(() => { quizBusy = false; });
        };
    }

    /* ---------- 播放器 ---------- */

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
            _finished: false,
            _waitedForContent: false,
            _paused: false,
            _cellData: {
                cells: 0,
                nCells: 0,
                currentCellIndex: 0,
                currentNCellIndex: 0,
                currentVideoTitle: '',
            },
            get cellData() {
                return this._cellData;
            },
            run() {
                console.log('%c=== 学习通视频与章节测验助手 V5 启动 ===', 'color:#4CAF50;font-size:16px;font-weight:bold');
                this._nextUnitPending = false;
                this._finished = false;
                this._waitedForContent = false;
                this._paused = false;
                this._getTreeContainer();
                this._initCellData();
                console.log(`当前学习步骤：${this._currentStepTitle() || '等待页面加载'}`);
                ui.power(true);
                ui.log('脚本已启动');
                ui.info('步骤', this._currentStepTitle() || '识别中');
                this._startUiRefresh();
                {
                    serviceLog('start', {
                        extMode: EXT_MODE,
                        step: this._currentStepTitle(),
                        treeFound: Boolean(document.querySelector('#coursetree')),
                        probe: buildProbe(),
                    });
                    for (const delay of [6000, 18000]) {
                        setTimeout(() => {
                            try {
                                serviceLog('probe', { delay, step: this._currentStepTitle(), probe: buildProbe() });
                            } catch { /* ignore */ }
                        }, delay);
                    }
                }
                this._videoEl = null;
                this._getVideoEl();
                this._clearCheckInterval();
                this._bindStepNavigation();
                this.play();
            },
            _startUiRefresh() {
                if (this._uiTimer) clearInterval(this._uiTimer);
                let lastStep = null;
                let lastCount = '';
                this._uiTimer = setInterval(() => {
                    try {
                        const step = this._currentStepTitle();
                        if (step !== lastStep) {
                            lastStep = step;
                            ui.info('步骤', step || '未识别');
                            if (step) serviceLog('step', { step });
                        }
                        if (step === '章节测验') {
                            const count = this.inspectQuiz().length;
                            const label = count ? `识别 ${count} 题` : '等待题目加载';
                            if (label !== lastCount) {
                                lastCount = label;
                                ui.info('题量', label);
                            }
                        } else if (lastCount !== '') {
                            lastCount = '';
                            ui.info('题量', '—');
                        }
                    } catch { /* 面板刷新失败不影响主流程 */ }
                }, 2000);
            },
            pause() {
                if (this._paused) return;
                this._paused = true;
                this._isPlaying = false;
                this._nextUnitPending = false;
                this._clearCheckInterval();
                if (this._setStopped) this._setStopped(true);
                if (this._setQuizBusy) this._setQuizBusy(false);
                const video = this._videoEl;
                if (video) {
                    try { video.pause(); } catch { /* ignore */ }
                }
                ui.state('idle', '已暂停');
                ui.log('已暂停。点右上角“开”继续');
            },
            resume() {
                if (!this._paused) return;
                this._paused = false;
                if (this._setStopped) this._setStopped(false);
                this._waitedForContent = false;
                this._tryTimes = 0;
                this._nextUnitPending = false;
                ui.state('work', '运行中');
                ui.log('已恢复运行');
                this.play();
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
                if (now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs) return;
                this._guardLastResumeTs = now;
                const video = this._getVideoEl();
                if (!video || !this._isPlaying) return;
                video.muted = true;
                video.defaultMuted = true;
                video.volume = 0;
                console.log(`%c触发视频保活恢复(${reason})`, 'color:#607D8B');
                video.play().catch((e) => {
                    console.warn('直接恢复播放失败，尝试静音恢复:', e);
                    video.muted = true;
                    video.play().catch((err) => {
                        console.error('静音恢复播放失败:', err);
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
                        console.log('%c检测到视频暂停，尝试恢复播放...', 'color:#FF5722');
                        this._tryResumePlayback('paused');
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
                                this._tryResumePlayback('no-progress');
                                this._guardLastWallTs = now;
                                this._guardLastTime = Number(video.currentTime || 0);
                            } else if (!stalled) {
                                this._guardLastWallTs = now;
                                this._guardLastTime = current;
                            }
                        }
                    }
                    if (video.ended && this._isPlaying) {
                        console.log('%c检测到视频结束，准备切换下一个...', 'color:#9C27B0');
                        this._isPlaying = false;
                        setTimeout(() => this.nextUnit(), 1000);
                    }
                } catch (e) {
                    console.error('视频状态检查失败:', e);
                }
            },
            _tryTimes: 0,
            _stepSwitchAt: 0,
            _stepSwitchPending: false,
            _delayedNextUnitTimer: null,
            _guardLastTime: 0,
            _guardLastWallTs: 0,
            _guardLastResumeTs: 0,
            async play() {
                if (this._paused) return;
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
                        if (this._currentStepTitle() === '视频') throw new Error('视频组件尚未加载完成');
                        if (this._advanceLearningStep()) {
                            console.log('%c当前不在视频页，已尝试切到下一学习步骤，2秒后重试', 'color:#607D8B');
                            setTimeout(() => { this.play(); }, 2000);
                            return;
                        }
                        if (this._isChapterTest()) {
                            this._advanceChapterTest();
                            return;
                        }
                        // 内容区往往比页面主体晚加载，等一会儿再判断，不要一次判死
                        if (!this._waitedForContent && await this._waitForContent(20000)) {
                            console.log('%c内容区已加载，重新识别页面', 'color:#607D8B');
                            this.play();
                            return;
                        }
                        this._isPlaying = false;
                        this._clearCheckInterval();
                        if (this.configs.autoAdvanceNoVideo) {
                            console.warn('%c当前小节未发现视频，按配置切换到下一小节', 'color:#FF9800');
                            this.nextUnit();
                        } else {
                            const frames = frameSummary();
                            const why = frames.cross
                                ? `读不到学习内容：页面有 ${frames.total} 个 iframe，其中 ${frames.cross} 个跨域，脚本没有权限读取。`
                                : '当前小节未发现视频或可识别的学习步骤，已安全停止（可执行 app.diag() 看详情）。';
                            console.warn(`%c${why}`, 'color:#FF9800');
                            setStatus('bad', why);
                            serviceLog('giveup', { reason: why, frames: describeFrames() });
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
                        ui.state('work', '视频播放中');
                        ui.info('步骤', '视频');
                        ui.log('开始播放');
                        this._startVideoMonitoring();
                    } catch (playError) {
                        console.error('视频播放失败:', playError);
                        this._handlePlayError(playError);
                    }
                } catch (e) {
                    if (this._tryTimes >= this.configs.maxRetries) {
                        console.error('%c视频播放失败，已达到最大重试次数', 'color:#F44336;font-weight:bold', e);
                        this._clearCheckInterval();
                        return;
                    }
                    this._tryTimes++;
                    console.log(`%c播放失败，${this.configs.retryInterval / 1000}秒后重试 (${this._tryTimes}/${this.configs.maxRetries})`, 'color:#FF9800');
                    setTimeout(() => { this.play(); }, this.configs.retryInterval);
                }
            },
            _advanceLearningStep() {
                if (this._stepSwitchPending && Date.now() - this._stepSwitchAt < 4000) return true;
                const currentStepTitle = this._currentStepTitle();
                if (currentStepTitle === '章节测验' || currentStepTitle === '视频' || quizLooksPresent()) return false;
                const clickElement = (el, label) => {
                    if (!el) return false;
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    console.log(`%c尝试点击${label}`, 'color:#2196F3');
                    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    return true;
                };
                const videoTab = $('.prev_white:visible').filter((_, el) => {
                    const text = ($(el).text() || '').replace(/\s+/g, '');
                    return text === '2视频' || text === '视频';
                }).get(0);
                if (clickElement(videoTab, '“视频”页签')) return true;
                return false;
            },
            _currentStepTitle() {
                // 1) 屏幕上真的显示着题目 → 就是测验
                if (visibleQuizDocument()) return '章节测验';
                // 2) 站点自己渲染的页签文字。实测比 cards 帧的 num 可信：
                //    切换内容时若 iframe 的 src 还是旧的，num 会停留在上一步。
                const prevTitle = document.getElementsByClassName('prev_title')[0];
                const text = prevTitle ? (prevTitle.title || prevTitle.textContent || '').trim() : '';
                if (text === '视频' || text === '章节测验') return text;
                // 3) cards 框架的 num 参数
                const cardsFrame = Array.from(document.querySelectorAll('iframe[src*="/knowledge/cards"]'))
                    .find((frame) => frame.getClientRects().length > 0);
                if (cardsFrame) {
                    const num = new URL(cardsFrame.getAttribute('src'), location.href).searchParams.get('num');
                    if (num === '0') return '视频';
                    if (num === '1') return '章节测验';
                }
                // 4) 兜底
                if (quizLooksPresent()) return '章节测验';
                if (anyVideoPresent()) return '视频';
                return '';
            },
            _isChapterTest() {
                return this._currentStepTitle() === '章节测验';
            },
            async _waitForContent(maxWaitMs) {
                const deadline = Date.now() + maxWaitMs;
                while (Date.now() < deadline) {
                    if (this._currentStepTitle()) return true;
                    await pause(500);
                }
                this._waitedForContent = true;
                return false;
            },
            _bindStepNavigation() {
                if (this._stepNavigationBound) return;
                this._stepNavigationBound = true;
                const reenterVideoMode = () => {
                    this._videoEl = null;
                    this._isPlaying = false;
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    setTimeout(() => {
                        try { this._initCellData(); } catch (e) { /* ignore */ }
                        this.play();
                    }, 1800);
                };
                $(document).off('click.xuexitongPlayerV4', '.prev_white').on('click.xuexitongPlayerV4', '.prev_white', (e) => {
                    const text = ($(e.currentTarget).text() || '').replace(/\s+/g, '');
                    if (text.includes('视频') || text.includes('章节测验')) {
                        console.log(`%c检测到步骤切换点击：${text}，准备重新识别页面`, 'color:#607D8B');
                        reenterVideoMode();
                    }
                });
            },
            _handlePlayError(error) {
                console.error('播放错误详情:', error);
                const video = this._getVideoEl();
                if (!video) return;
                video.muted = true;
                video.play().then(() => {
                    console.log('%c静音播放成功', 'color:#4CAF50');
                    this._tryTimes = 0;
                    this._startVideoMonitoring();
                    if (this._delayedNextUnitTimer) {
                        clearTimeout(this._delayedNextUnitTimer);
                        this._delayedNextUnitTimer = null;
                    }
                }).catch((e) => {
                    console.error('静音播放也失败:', e);
                    if (this._delayedNextUnitTimer) clearTimeout(this._delayedNextUnitTimer);
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
            },
            _initCellData() {
                const el = this._getTreeContainer();
                const cells = el.children('ul').children('li');
                this._cellData.cells = cells.length;
                let nCellCounts = 0;
                let foundCurrent = false;
                cells.each((i, v) => {
                    const nCells = $(v).find('.posCatalog_select:not(.firstLayer)');
                    nCellCounts += nCells.length;
                    nCells.each((j, e) => {
                        const _el = $(e);
                        if (_el.hasClass('posCatalog_active')) {
                            this._cellData.currentCellIndex = i;
                            this._cellData.currentNCellIndex = j;
                            foundCurrent = true;
                            const titleSpan = _el.find('.posCatalog_name')[0];
                            if (titleSpan) this._cellData.currentVideoTitle = $(titleSpan).attr('title');
                        }
                    });
                });
                this._cellData.nCells = nCellCounts;
                if (!foundCurrent && nCellCounts > 0) {
                    console.warn('%c未找到当前激活的视频节点，可能需要手动选择', 'color:#FF9800');
                }
                console.log(`%c课程信息: ${this._cellData.cells}章, ${this._cellData.nCells}节, 当前: 第${this._cellData.currentCellIndex + 1}章第${this._cellData.currentNCellIndex + 1}节`, 'color:#607D8B');
            },
            _getTreeContainer() {
                if (!this._treeContainerEl) {
                    const el = $('#coursetree');
                    if (el.length <= 0) throw new Error('找不到视频列表');
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
                        console.error('获取视频元素失败:', e);
                        return null;
                    }
                }
                if (!this._videoEl) return null;
                return this._videoEl;
            },
            _videoEventHandle() {
                const el = this._videoEl;
                if (!el) {
                    console.log('videoEl未加载');
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
            _handleVideoEnded() {
                const title = this._cellData.currentVideoTitle;
                console.warn(`%c============'${title}' 播放完成=============`, 'color:#4CAF50;font-weight:bold');
                this._isPlaying = false;
                this._clearCheckInterval();
                setTimeout(() => this.nextUnit(), 1000);
            },
            _handleVideoLoaded() {
                console.log('%c============视频加载完成=============', 'color:#2196F3');
                if (this.configs.autoplay && !this._isPlaying) this.play();
            },
            _handleVideoPlay() {
                const title = this._cellData.currentVideoTitle;
                console.info(`%c============'${title}' 开始播放=============`, 'color:#4CAF50');
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
            _handleVideoPause() {
                console.log('%c============视频暂停=============', 'color:#FF9800');
            },
            _bindPageGuards() {
                const resumePlaybackNow = () => this._tryResumePlayback('page-event');
                this._pageGuards = { resumePlaybackNow };
                document.addEventListener('mouseleave', resumePlaybackNow);
                window.addEventListener('mouseleave', resumePlaybackNow);
                window.addEventListener('blur', resumePlaybackNow);
                document.addEventListener('visibilitychange', resumePlaybackNow);
            },
            destroy() {
                this._isPlaying = false;
                this._clearCheckInterval();
                if (this._uiTimer) {
                    clearInterval(this._uiTimer);
                    this._uiTimer = null;
                }
                this._detachVideoEvents();
                if (this._delayedNextUnitTimer) clearTimeout(this._delayedNextUnitTimer);
                $(document).off('.xuexitongPlayerV4');
                if (this._pageGuards) {
                    const { resumePlaybackNow } = this._pageGuards;
                    document.removeEventListener('mouseleave', resumePlaybackNow);
                    window.removeEventListener('mouseleave', resumePlaybackNow);
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
            console.error('%c脚本运行失败: ', 'color:#F44336;font-weight:bold', error.message);
            console.log('请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。');
        }
    }
})();