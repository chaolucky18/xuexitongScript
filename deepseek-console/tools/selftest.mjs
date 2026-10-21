// 端到端自测：不需要真实 DeepSeek Key，也不碰真实 API。
// 用本地 mock 冒充 DeepSeek，验证重试、令牌、Origin 白名单、题目校验。
// 运行：node tools/selftest.mjs
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');
const servicePath = join(appDir, 'deepseek-local.mjs');
const scriptPath = join(appDir, 'xuexitong-console.js');
const tokenPath = join(appDir, '.dsh-token');
const logPath = join(appDir, 'debug.log');

const PORT = 37942;
const ORIGIN_CHAOXING = 'https://mooc1.chaoxing.com';
const ORIGIN_EXT = 'chrome-extension://' + 'a'.repeat(32);

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
    if (condition) {
        passed++;
        console.log(`  PASS  ${name}`);
    } else {
        failed++;
        console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

function waitFor(predicate, timeoutMs = 8000, interval = 100) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const timer = setInterval(() => {
            let ok = false;
            try { ok = predicate(); } catch { ok = false; }
            if (ok) { clearInterval(timer); resolve(); }
            else if (Date.now() - started > timeoutMs) { clearInterval(timer); reject(new Error('等待条件超时')); }
        }, interval);
    });
}

/* ---------- mock DeepSeek ---------- */

const mock = { calls: 0, lastAuth: '', lastBody: null, maxTokensPerCall: [], mode: 'retry' };
const mockServer = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    mock.calls++;
    mock.lastAuth = req.headers.authorization || '';
    mock.lastBody = JSON.parse(raw || '{}');
    mock.maxTokensPerCall.push(mock.lastBody.max_tokens);
    const wanted = mock.lastBody.messages?.[1]?.content ? JSON.parse(mock.lastBody.messages[1].content) : [];
    const answer = { answers: wanted.map((q, i) => ({ id: i + 1, letters: [q.options[0].letter] })) };
    const firstAttempt = mock.mode === 'retry' && mock.calls === 1;
    const payload = firstAttempt
        ? { choices: [{ finish_reason: 'length', message: { content: '' } }], usage: { completion_tokens: mock.lastBody.max_tokens } }
        : { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer) } }], usage: { completion_tokens: 100 } };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
});

/* ---------- 启动/停止服务 ---------- */

let child = null;
let serviceOutput = '';

function startService() {
    serviceOutput = '';
    child = spawn(process.execPath, [servicePath], {
        cwd: appDir,
        env: {
            ...process.env,
            DEEPSEEK_API_KEY: 'sk-selftest-not-a-real-key',
            DEEPSEEK_API_URL: `http://127.0.0.1:${PORT}/chat/completions`,
            XUEXITONG_PORT: '37943',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { serviceOutput += chunk.toString(); });
    child.stderr.on('data', (chunk) => { serviceOutput += chunk.toString(); });
}

function stopService() {
    if (!child) return Promise.resolve();
    const proc = child;
    child = null;
    return new Promise((resolve) => {
        proc.once('exit', resolve);
        proc.kill();
        setTimeout(resolve, 2000);
    });
}

async function callHealth(token, origin) {
    const response = await fetch('http://127.0.0.1:37943/health', {
        headers: { 'X-Xuexitong-Token': token, Origin: origin },
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
}

async function callAnswer(token, questions, origin, contentType = 'application/json') {
    const response = await fetch('http://127.0.0.1:37943/answer', {
        method: 'POST',
        headers: { 'Content-Type': contentType, 'X-Xuexitong-Token': token, Origin: origin },
        body: JSON.stringify({ questions }),
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
}

const sampleQuestions = [
    { id: 1, type: '单选题', question: '1+1=?', options: [{ letter: 'A', text: '2' }, { letter: 'B', text: '3' }] },
    { id: 2, type: '多选题', question: '下列哪些是质数', options: [{ letter: 'A', text: '2' }, { letter: 'B', text: '4' }, { letter: 'C', text: '5' }] },
];

/* ---------- 主流程 ---------- */

await new Promise((resolve) => mockServer.listen(PORT, '127.0.0.1', resolve));
console.log(`mock DeepSeek 已启动：http://127.0.0.1:${PORT}`);

const hadTokenFile = existsSync(tokenPath);
const originalScript = readFileSync(scriptPath, 'utf8');
if (hadTokenFile) rmSync(tokenPath);

try {
    console.log('\n[1] 首次启动（生成令牌）');
    startService();
    await waitFor(() => existsSync(tokenPath) && serviceOutput.includes('本地服务已启动'));
    const token = readFileSync(tokenPath, 'utf8').trim();
    check('生成 48 位十六进制令牌', /^[a-f0-9]{48}$/i.test(token), token);
    check('服务打印了令牌', serviceOutput.includes(`令牌：${token}`));
    check('令牌已写入控制台脚本', readFileSync(scriptPath, 'utf8').includes(`const LOCAL_TOKEN = '${token}';`));

    console.log('\n[2] 令牌与 Origin 白名单');
    check('正确令牌 + 学习通来源 → 200', (await callHealth(token, ORIGIN_CHAOXING)).status === 200);
    check('正确令牌 + 扩展来源 → 200', (await callHealth(token, ORIGIN_EXT)).status === 200);
    check('错误令牌 → 403', (await callHealth('0'.repeat(48), ORIGIN_CHAOXING)).status === 403);
    check('缺令牌 → 403', (await callHealth('', ORIGIN_CHAOXING)).status === 403);
    check('陌生来源 → 403', await (async () => {
        const response = await fetch('http://127.0.0.1:37943/health', {
            headers: { 'X-Xuexitong-Token': token, Origin: 'https://evil.example' },
        });
        return response.status === 403;
    })());

    console.log('\n[3] 截断自动重试（本次修复的核心）');
    mock.calls = 0;
    mock.maxTokensPerCall = [];
    mock.mode = 'retry';
    const answered = await callAnswer(token, sampleQuestions, ORIGIN_CHAOXING);
    check('返回 200', answered.status === 200, JSON.stringify(answered.body));
    check('返回 2 个答案', answered.body?.answers?.length === 2);
    check('第一次 finish_reason=length 后发起了第二次请求', mock.calls === 2, `实际 ${mock.calls} 次`);
    check('第一次失败后发起了第二次请求，且额度更宽', mock.calls === 2 && mock.maxTokensPerCall[1] > mock.maxTokensPerCall[0], JSON.stringify(mock.maxTokensPerCall));
    check('第二次请求带了 API Key', mock.lastAuth === 'Bearer sk-selftest-not-a-real-key', mock.lastAuth);

    console.log('\n[4] 请求校验');
    const bad = await callAnswer(token, [{ ...sampleQuestions[0], options: [{ letter: 'Z', text: 'x' }, { letter: 'Y', text: 'y' }] }], ORIGIN_CHAOXING);
    check('非法选项字母 → 502 且不调用 API', bad.status === 502 && /题目格式不正确/.test(bad.body?.error || ''));
    const wrongType = await callAnswer(token, sampleQuestions, ORIGIN_CHAOXING, 'text/plain');
    check('非 JSON 内容类型 → 415', wrongType.status === 415);

    console.log('\n[5] 重启后令牌保持一致');
    const tokenBefore = token;
    await stopService();
    startService();
    await waitFor(() => serviceOutput.includes('本地服务已启动'));
    const tokenAfter = readFileSync(tokenPath, 'utf8').trim();
    check('令牌未变化', tokenBefore === tokenAfter, `${tokenBefore} vs ${tokenAfter}`);
    check('启动窗口提示沿用旧令牌', serviceOutput.includes('本次沿用上一次的令牌'));
    const stillOk = await callHealth(tokenBefore, ORIGIN_EXT);
    check('旧令牌仍可用（扩展无需重新配置）', stillOk.status === 200);
} finally {
    await stopService();
    mockServer.close();
    if (!hadTokenFile) rmSync(tokenPath, { force: true });
    writeFileSync(scriptPath, originalScript, 'utf8');
}

/* ---------- 页面脚本纯函数回归 ---------- */

console.log('\n[6] 题干/选项切分（P1 修复）');
const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, table: () => {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    AbortSignal,
    fetch: () => Promise.reject(new Error('selftest: 不访问网络')),
    location: { origin: 'https://mooc1.chaoxing.com', pathname: '/mycourse/studentstudy', href: 'https://mooc1.chaoxing.com/mycourse/studentstudy' },
    document: {
        // 走扩展模式分支，避免脚本因为 LOCAL_TOKEN 还是占位符而提前 return
        documentElement: { dataset: { xxthBridge: '1' } },
        querySelector: () => null,
        createElement: () => ({ style: {}, appendChild: () => {} }),
        body: { appendChild: () => {} },
    },
};
sandbox.window = sandbox;
sandbox.window.open = () => null;
sandbox.window.addEventListener = () => {};
sandbox.window.postMessage = () => {};
runInContext(readFileSync(scriptPath, 'utf8'), createContext(sandbox));

const internals = sandbox.__xuexitongInternals;
check('脚本导出了内部函数', Boolean(internals?.cutIndexForOptions));
if (internals) {
    const cut = internals.cutIndexForOptions;
    const normal = '【单选题】以下说法正确的是\nA. 甲\nB. 乙';
    const tricky = '【单选题】关于下列实验结论\nABC 三种方案均需复核。\nA. 甲\nB. 乙';
    const loose = '【单选题】下列说法正确\nA 甲\nB 乙';
    const noOption = '【单选题】这是一道没有选项的题干';

    check('普通题干按 A. 处切分', cut(normal) === normal.indexOf('\n'));
    check('正文行以 ABC 开头时不误切（原 bug）', cut(tricky) === tricky.indexOf('\nA. 甲'), `得到 ${cut(tricky)}`);
    check('A 后无标点但有空格 + B 行时仍能切分', cut(loose) === loose.indexOf('\nA 甲'));
    check('无选项时返回 -1', cut(noOption) === -1);
    check('切分后标题保留完整多行题干',
        tricky.slice(0, cut(tricky)).replace(/\s+/g, ' ').includes('ABC 三种方案均需复核'));
}

/* 兜底：服务启动时会改写脚本里的令牌，这里再还原一次，
   保证测试跑完后脚本内容与跑之前完全一致（尤其不能把真令牌留在待提交的副本里）。
   用 exit 钩子覆盖所有退出路径。 */
function restoreScript() {
    try {
        writeFileSync(scriptPath, originalScript, 'utf8');
        if (existsSync(tokenPath)) rmSync(tokenPath, { force: true });
        if (existsSync(logPath)) rmSync(logPath, { force: true });
    } catch { /* ignore */ }
}
process.on('exit', restoreScript);
process.on('SIGINT', () => { restoreScript(); process.exit(130); });
restoreScript();

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);