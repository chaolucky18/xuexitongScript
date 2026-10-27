/**
 * 豆包桌面版 CDP 客户端（POC）
 *
 * 前提：豆包以 --remote-debugging-port=<port> 启动（见 启动豆包自动化实例.cmd）。
 * 原理：Electron/Chromium 暴露 DevTools 协议，直接操作页面 DOM，
 *       不抢前台焦点、不需要 OCR、窗口藏在托盘里也能用。
 */
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const DEFAULT_PORT = Number(process.env.DOUBAO_DEBUG_PORT || 9333);
const CHAT_URL_HINT = 'doubao-chat';

export class DoubaoClient {
    constructor({ port = DEFAULT_PORT, timeoutMs = 15000 } = {}) {
        this.port = port;
        this.timeoutMs = timeoutMs;
        this.ws = null;
        this.nextId = 1;
        this.pending = new Map();
        this.target = null;
    }

    async connect() {
        const list = await this.httpJson(`http://127.0.0.1:${this.port}/json/list`);
        const pages = (Array.isArray(list) ? list : []).filter((t) => t.type === 'page');
        this.target = pages.find((t) => t.url.includes(CHAT_URL_HINT))
            || pages.find((t) => String(t.url).startsWith('doubao://'))
            || pages[0];
        if (!this.target) throw new Error('没有找到豆包页面，请确认客户端是用调试端口启动的');

        this.ws = new WebSocket(this.target.webSocketDebuggerUrl);
        this.ws.addEventListener('message', (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch { return; }
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject, timer } = this.pending.get(msg.id);
                clearTimeout(timer);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
                else resolve(msg.result);
            }
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('连接 CDP 超时')), this.timeoutMs);
            this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('连接 CDP 失败')); }, { once: true });
        });
        return this;
    }

    async httpJson(url) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            throw new Error(`连不上豆包调试端口 ${this.port}：${error.message}。请先运行 启动豆包自动化实例.cmd`);
        } finally {
            clearTimeout(timer);
        }
    }

    send(method, params = {}) {
        if (!this.ws) return Promise.reject(new Error('尚未连接'));
        return new Promise((resolve, reject) => {
            const id = this.nextId++;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`${method} 超时`));
            }, this.timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async eval(expression) {
        const result = await this.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });
        if (result.exceptionDetails) {
            const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
            throw new Error(`页面脚本异常：${detail}`);
        }
        return result.result?.value;
    }

    async status() {
        return this.eval(`(() => {
            const text = document.body.innerText || '';
            const hasEditor = Boolean(document.querySelector('div.tiptap.ProseMirror'));
            const hasLoginEntry = [...document.querySelectorAll('button,[role="button"],a,div,span')]
                .some((el) => (el.innerText || '').trim() === '登录');
            return {
                title: document.title,
                href: location.href,
                hasEditor,
                looksLoggedOut: hasLoginEntry,
                bodyHead: text.slice(0, 160).replace(/\\s+/g, ' '),
            };
        })()`);
    }

    async editorText() {
        return this.eval(`document.querySelector('div.tiptap.ProseMirror')?.innerText ?? null`);
    }

    async focusEditor() {
        const ok = await this.eval(`(() => {
            const el = document.querySelector('div.tiptap.ProseMirror');
            if (!el) return false;
            el.focus();
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
            return document.activeElement === el;
        })()`);
        if (!ok) throw new Error('找不到输入框（页面结构可能变了，或还停在登录页）');
        return true;
    }

    async clearEditor() {
        await this.eval(`(() => {
            const el = document.querySelector('div.tiptap.ProseMirror');
            if (!el) return false;
            el.focus();
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('delete');
            return true;
        })()`);
        await sleep(120);
    }

    async newChat() {
        const clicked = await this.eval(`(() => {
            const nodes = [...document.querySelectorAll('button,[role="button"],a,div,span')];
            const label = nodes.find((node) => (node.innerText || '').trim() === '新对话');
            if (!label) return false;
            const target = label.closest('button,[role="button"],a') || label;
            target.click();
            return true;
        })()`);
        if (clicked) { await sleep(700); return true; }
        return false;
    }

    async pressEnter() {
        const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
        await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
        await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    }

    async mouseClick(x, y) {
        await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }

    async getTitle() {
        return this.eval(`(() => {
            const el = [...document.querySelectorAll('div')].find((n) =>
                String(n.className).includes('w-fit') && (n.innerText || '').trim() && n.getBoundingClientRect().top < 80);
            return el ? (el.innerText || '').trim() : '';
        })()`);
    }

    /** 把当前会话改名（通过标题下拉菜单 → 重命名 → 确定）。 */
    async renameConversation(name) {
        const current = await this.getTitle();
        if (current === name) return { renamed: false, title: current, ok: true };

        const titleBox = await this.eval(`(() => {
            const el = [...document.querySelectorAll('div')].find((n) =>
                String(n.className).includes('w-fit') && (n.innerText || '').trim() && n.getBoundingClientRect().top < 80);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()`);
        if (!titleBox) throw new Error('找不到会话标题，无法重命名');

        let entry = null;
        for (let attempt = 0; attempt < 2 && !entry; attempt += 1) {
            await this.mouseClick(titleBox.x, titleBox.y);
            await sleep(700);
            entry = await this.eval(`(() => {
                const el = [...document.querySelectorAll('div,button,li')]
                    .find((n) => (n.innerText || '').trim() === '重命名' && n.getBoundingClientRect().width > 0);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
            })()`);
        }
        if (!entry) throw new Error('标题菜单里没有“重命名”');

        await this.mouseClick(entry.x, entry.y);
        await sleep(700);

        const inputBox = await this.eval(`(() => {
            const input = [...document.querySelectorAll('input.semi-input')].find((el) => el.getBoundingClientRect().width > 0);
            if (!input) return null;
            input.focus();
            input.select();
            const r = input.getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), value: input.value };
        })()`);
        if (!inputBox) throw new Error('重命名输入框没有出现');

        await this.mouseClick(inputBox.x, inputBox.y);
        await this.send('Input.insertText', { text: name });
        await sleep(250);
        await this.eval(`(() => {
            const btn = [...document.querySelectorAll('button')]
                .find((el) => (el.innerText || '').trim() === '确定' && el.getBoundingClientRect().width > 0);
            if (btn) { btn.click(); return true; }
            return false;
        })()`);
        await sleep(1000);

        const title = await this.getTitle();
        return { renamed: true, title, ok: title === name };
    }

    async clickSendButton() {
        return this.eval(`(() => {
            const nodes = [...document.querySelectorAll('button,[role="button"]')];
            const hit = nodes.find((node) => /发送|send/i.test(
                (node.getAttribute('aria-label') || '') + (node.innerText || '')
            ));
            if (!hit) return false;
            hit.click();
            return true;
        })()`);
    }

    /**
     * 统计助手消息（含 blockLayout 正文容器）。
     * anchor 给定时，只统计「包含该标记的那一行（本次提问）之后」的回答，
     * 这样在同一个对话里连续提问也不会把上一条回答当成本次结果。
     */
    async snapshotAnswer({ anchor = '' } = {}) {
        return this.eval(`(() => {
            const anchor = ${JSON.stringify(anchor)};
            const rows = [...document.querySelectorAll('.v_list_row')];
            let start = 0;
            if (anchor) {
                for (let i = rows.length - 1; i >= 0; i -= 1) {
                    if ((rows[i].innerText || '').includes(anchor)) { start = i + 1; break; }
                }
                if (start === 0) return { count: 0, text: '', hasAnswer: false, anchored: false, rows: [] };
            }
            const answers = [];
            for (let i = start; i < rows.length; i += 1) {
                const el = rows[i].querySelector('[class*="blockLayout-"]');
                if (!el) continue;               // 用户提问那一行没有这个容器
                answers.push((el.innerText || '').trim());
            }
            return {
                count: answers.length,
                text: answers.length ? answers[answers.length - 1] : '',
                hasAnswer: answers.length > 0,
                anchored: Boolean(anchor),
                rows: rows.slice(-4).map((el) => ({
                    cls: String(el.className).trim().slice(0, 30),
                    head: (el.innerText || '').trim().slice(0, 40).replace(/\\s+/g, ' '),
                })),
            };
        })()`);
    }

    async isGenerating() {
        return this.eval(`(() => {
            const text = document.body.innerText || '';
            if (/停止生成|停止回答|停止响应/.test(text)) return true;
            return [...document.querySelectorAll('button,[role="button"]')]
                .some((el) => /停止/.test((el.getAttribute('aria-label') || '') + (el.innerText || '')));
        })()`);
    }

    /** 发送问题并等待回答完成。 */
    async ask(question, { newChat = true, timeoutMs = 120000, stableMs = 1500 } = {}) {
        if (!question || !question.trim()) throw new Error('问题为空');
        const before = await this.status();
        if (before.looksLoggedOut) {
            throw new Error('豆包未登录：请先在「豆包自动化实例」窗口里扫码登录，再重试');
        }

        await this.focusEditor();
        await this.clearEditor();
        if (newChat) await this.newChat();
        await this.focusEditor();

        // 每次提问带一个短标记，回复后用它定位「这次提问」那一行，
        // 避免同一个对话里把上一条回答当成本次结果。
        const anchor = `#${randomUUID().slice(0, 8)}`;
        const payload = `${question}\n\n[${anchor}]`;
        await this.send('Input.insertText', { text: payload });
        await sleep(250);

        const typed = (await this.editorText() || '').replace(/\s+/g, '');
        if (!typed.includes(question.replace(/\s+/g, '').slice(0, 12))) {
            throw new Error('文字没有写进输入框（页面结构可能变了）');
        }

        await this.pressEnter();
        await sleep(900);

        let sent = (await this.editorText() || '').trim() === '';
        if (!sent) {
            const clicked = await this.clickSendButton();
            if (clicked) {
                await sleep(900);
                sent = (await this.editorText() || '').trim() === '';
            }
        }
        if (!sent) throw new Error('没能把问题发送出去（找不到发送按钮，回车也未生效）');

        const startedAt = Date.now();
        let lastText = '';
        let stableSince = 0;
        while (Date.now() - startedAt < timeoutMs) {
            const snapshot = await this.snapshotAnswer({ anchor });
            if (snapshot.text) {
                if (snapshot.text !== lastText) {
                    lastText = snapshot.text;
                    stableSince = Date.now();
                }
                if (Date.now() - stableSince >= stableMs && !(await this.isGenerating())) {
                    return { text: cleanAnswer(lastText), elapsedMs: Date.now() - startedAt, debug: snapshot };
                }
            } else if (!lastText && Date.now() - startedAt > 8000) {
                const page = await this.status();
                if (page.looksLoggedOut || /扫码登录|登录后即可|请先登录/.test(page.bodyHead)) {
                    throw new Error('豆包要求登录后才能回答：请先在自动化实例窗口里扫码登录');
                }
            }
            await sleep(400);
        }
        if (lastText) return { text: cleanAnswer(lastText), elapsedMs: Date.now() - startedAt, truncated: true };
        throw new Error(`等待回答超时（${Math.round(timeoutMs / 1000)} 秒），没有抓到任何回答文本`);
    }

    close() {
        try { this.ws?.close(); } catch { /* ignore */ }
        for (const { timer } of this.pending.values()) clearTimeout(timer);
        this.pending.clear();
    }
}

export function cleanAnswer(text) {
    const uiNoise = /^(复制|重新生成|点赞|点踩|分享|参考|收藏|朗读|编辑|收起|展开|查看全部|返回顶部)$/;
    const lines = String(text || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !uiNoise.test(line));
    while (lines.length && /内容由\s*AI\s*生成|仅供参考|请仔细甄别/.test(lines[lines.length - 1])) {
        lines.pop();
    }
    return lines.join('\n').trim();
}

export async function connect(options = {}) {
    return new DoubaoClient(options).connect();
}
