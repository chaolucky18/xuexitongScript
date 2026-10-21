// 扩展链路测试（无需浏览器）：验证
//   页面主世界 → bridge.js → background.js → 本地服务 → 回复原样回到页面
// 这三层之间只是 postMessage / chrome.runtime 消息，所以可以在 Node 里用假 API 跑通。
// 运行：node edge-extension/tools/bridge-test.mjs
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', '..');
const extDir = join(here, '..');
const tokenPath = join(appDir, '.dsh-token');

const MOCK_PORT = 37951;
const SERVICE_PORT = 37952;
const ORIGIN = 'https://mooc1.chaoxing.com';

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
    if (ok) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};
const waitFor = (predicate, timeoutMs = 8000) => new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
        let ok = false;
        try { ok = predicate(); } catch { ok = false; }
        if (ok) { clearInterval(timer); resolve(); }
        else if (Date.now() - started > timeoutMs) { clearInterval(timer); reject(new Error('等待超时')); }
    }, 100);
});

/* 1. mock DeepSeek */
const mockServer = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}');
    const wanted = JSON.parse(body.messages?.[1]?.content || '[]');
    const answers = wanted.map((q, i) => ({ id: i + 1, letters: [q.options[0].letter] }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answers }) } }] }));
});
await new Promise((resolve) => mockServer.listen(MOCK_PORT, '127.0.0.1', resolve));

/* 2. 真本地服务 */
const hadToken = existsSync(tokenPath);
let serviceOut = '';
const service = spawn(process.execPath, [join(appDir, 'deepseek-local.mjs')], {
    cwd: appDir,
    env: {
        ...process.env,
        DEEPSEEK_API_KEY: 'sk-bridge-test',
        DEEPSEEK_API_URL: `http://127.0.0.1:${MOCK_PORT}/chat/completions`,
        XUEXITONG_PORT: String(SERVICE_PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
});
service.stdout.on('data', (c) => { serviceOut += c.toString(); });
service.stderr.on('data', (c) => { serviceOut += c.toString(); });

/* 3. 假扩展 API：storage + runtime */
const store = { endpoint: `http://127.0.0.1:${SERVICE_PORT}`, token: '' };
const messageListeners = [];
const chromeStub = {
    storage: {
        local: {
            get: async (defaults) => ({ ...defaults, ...store }),
            set: async (values) => Object.assign(store, values),
        },
    },
    runtime: {
        lastError: null,
        getPlatformInfo: (cb) => { if (cb) cb({ os: 'win' }); },
        onMessage: { addListener: (fn) => messageListeners.push(fn) },
        sendMessage: (message) => new Promise((resolve) => {
            let handled = false;
            for (const listener of messageListeners) {
                const keepsOpen = listener(message, {}, (value) => { handled = true; resolve(value); });
                if (keepsOpen === true) return;
            }
            if (!handled) resolve(undefined);
        }),
    },
};

/* 4. 后台 */
const backgroundContext = createContext({
    chrome: chromeStub,
    fetch,
    AbortSignal,
    setInterval,
    clearInterval,
    console: { log: () => {}, warn: () => {}, error: () => {} },
});
runInContext(readFileSync(join(extDir, 'background.js'), 'utf8'), backgroundContext);

/* 5. 桥接（模拟页面主世界） */
const sentToPage = [];
const messageHandlers = [];
const pageSandbox = {
    location: { origin: ORIGIN },
    document: { documentElement: { dataset: {} } },
    addEventListener: (type, fn) => { if (type === 'message') messageHandlers.push(fn); },
    postMessage: (data) => sentToPage.push(data),
    chrome: chromeStub,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Promise,
    setTimeout,
    Error,
};
pageSandbox.window = pageSandbox;
const bridgeContext = createContext(pageSandbox);
runInContext(readFileSync(join(extDir, 'bridge.js'), 'utf8'), bridgeContext);
// 隔离世界里的 window 是上下文全局代理，和外部对象不是同一个引用；
// 发消息时必须用它真正的那个全局，模拟浏览器里 event.source === window。
const pageGlobal = runInContext('globalThis', bridgeContext);

function sendFromPage(op, payload, id) {
    sentToPage.length = 0;
    const event = { source: pageGlobal, origin: ORIGIN, data: { __xxth: 'request', id, op, payload } };
    for (const handler of messageHandlers) handler(event);
}

async function waitForReply(id, timeoutMs = 15000) {
    await waitFor(() => sentToPage.some((m) => m.__xxth === 'reply' && m.id === id), timeoutMs);
    return sentToPage.find((m) => m.__xxth === 'reply' && m.id === id);
}

console.log(`mock DeepSeek :${MOCK_PORT} / 本地服务 :${SERVICE_PORT}`);
await waitFor(() => existsSync(tokenPath) && serviceOut.includes('本地服务已启动'));
store.token = readFileSync(tokenPath, 'utf8').trim();

try {
    console.log('\n[1] 桥接握手');
    check('bridge.js 在 document 上打好了标记', pageSandbox.document.documentElement.dataset.xxthBridge === '1');
    check('后台注册了消息监听', messageListeners.length === 1);

    console.log('\n[2] health 链路');
    sendFromPage('health', null, 'h1');
    const healthReply = await waitForReply('h1');
    check('回复使用 __xxth=reply 协议', healthReply?.__xxth === 'reply');
    check('回复带上原始 id', healthReply?.id === 'h1');
    check('health 成功', healthReply?.ok === true && healthReply?.data?.ok === true, JSON.stringify(healthReply));
    check('health 带回模型名', healthReply?.data?.model === 'deepseek-flash');

    console.log('\n[3] answer 链路');
    const questions = [
        { id: 1, type: '单选题', question: '1+1=?', options: [{ letter: 'A', text: '2' }, { letter: 'B', text: '3' }] },
        { id: 2, type: '判断题', question: '地球是圆的', options: [{ letter: 'A', text: '对' }, { letter: 'B', text: '错' }] },
    ];
    sendFromPage('answer', { questions }, 'a1');
    const answerReply = await waitForReply('a1');
    check('answer 成功', answerReply?.ok === true, JSON.stringify(answerReply));
    check('答案数量与题目一致', answerReply?.data?.answers?.length === 2);
    check('答案结构符合主脚本 validateAnswers 的预期',
        answerReply?.data?.answers?.every((a) => Number.isInteger(a.id) && Array.isArray(a.letters)));

    console.log('\n[4] 错误透传');
    store.token = 'wrong-token';
    sendFromPage('health', null, 'h2');
    const badReply = await waitForReply('h2');
    check('令牌错误时 ok=false', badReply?.ok === false);
    check('错误信息带回页面而不是静默', typeof badReply?.error === 'string' && /令牌|403/.test(badReply.error), badReply?.error);

    store.token = '';
    sendFromPage('health', null, 'h3');
    const noTokenReply = await waitForReply('h3');
    check('未配置令牌时给出可操作提示', /配置本地服务令牌/.test(noTokenReply?.error || ''), noTokenReply?.error);

    console.log('\n[5] 陌生页面发来的请求不被处理');
    sentToPage.length = 0;
    const evil = { source: pageGlobal, origin: 'https://evil.example', data: { __xxth: 'request', id: 'x1', op: 'health', payload: null } };
    for (const handler of messageHandlers) handler(evil);
    await new Promise((r) => setTimeout(r, 300));
    check('跨源消息被丢弃', sentToPage.length === 0, JSON.stringify(sentToPage));

    console.log('\n[6] source 容错');
    const nullSource = { source: null, origin: ORIGIN, data: { __xxth: 'request', id: 'h4', op: 'health', payload: null } };
    store.token = readFileSync(tokenPath, 'utf8').trim();
    for (const handler of messageHandlers) handler(nullSource);
    const nullReply = await waitForReply('h4');
    check('source 为空的同源消息仍能处理（避免静默全断）', nullReply?.ok === true);
} finally {
    service.kill();
    mockServer.close();
    if (!hadToken) rmSync(tokenPath, { force: true });
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);