import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requestAnswers, providerStatus } from './doubao-request.mjs';
import { decodeTexts, probeDecoder } from '../deepseek-console/font-bridge/font-bridge.mjs';

const PORT = 37842;
const PROVIDER = 'doubao';
const scriptPath = fileURLToPath(new URL('./xuexitong-console.js', import.meta.url));
const token = randomBytes(24).toString('hex');
const allowedOrigin = (origin) => /^https:\/\/([a-z0-9-]+\.)*chaoxing\.com$/i.test(origin || '');

const script = readFileSync(scriptPath, 'utf8');
if (!/const LOCAL_TOKEN = '[^']*';/.test(script)) throw new Error('控制台脚本缺少本地令牌位置');

function send(res, status, data, origin) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': origin,
        'Vary': 'Origin',
    });
    res.end(JSON.stringify(data));
}

async function readJson(req, limit) {
    let raw = '';
    for await (const chunk of req) {
        raw += chunk.toString('utf8');
        if (raw.length > limit) throw new Error('请求内容过大');
    }
    return JSON.parse(raw);
}

function validDecodeRequest(body) {
    const font = body?.font;
    const texts = body?.texts;
    return typeof font === 'string' && font.length > 100 && font.length <= 6000000 &&
        Array.isArray(texts) && texts.length >= 1 && texts.length <= 300 &&
        texts.every((text) => typeof text === 'string' && text.length <= 5000);
}

function validQuestions(questions) {
    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 30) return false;
    return questions.every((q, i) => Number.isInteger(q.id) && q.id === i + 1 &&
        ['单选题', '多选题', '判断题'].includes(q.type) &&
        typeof q.question === 'string' && q.question.length > 0 && q.question.length <= 500 &&
        Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 8 &&
        new Set(q.options.map((o) => o.letter)).size === q.options.length &&
        q.options.every((o) => /^[A-H]$/.test(o.letter) && typeof o.text === 'string' && o.text.length > 0 && o.text.length <= 500));
}

let busy = false;
let decoding = false;
let decoderProbe = null;
let providerState = { ok: null };
const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (!allowedOrigin(origin)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Origin not allowed');
        return;
    }
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Xuexitong-Token',
            'Access-Control-Allow-Private-Network': 'true',
            'Access-Control-Max-Age': '600',
            'Vary': 'Origin',
        });
        res.end();
        return;
    }
    if (req.headers['x-xuexitong-token'] !== token) {
        send(res, 403, { error: '本地令牌不匹配，请重新复制控制台脚本' }, origin);
        return;
    }
    if (req.method === 'GET' && req.url === '/health') {
        send(res, 200, {
            ok: true,
            provider: PROVIDER,
            decoder: decoderProbe ? decoderProbe.ok : null,
            python: decoderProbe ? decoderProbe.python || null : null,
            error: decoderProbe && !decoderProbe.ok ? decoderProbe.error : undefined,
            doubao: providerState,
        }, origin);
        return;
    }
    if (req.method === 'POST' && req.url === '/decode') {
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
            send(res, 415, { error: '仅接受 JSON' }, origin);
            return;
        }
        if (decoding) {
            send(res, 429, { error: '上一批字形仍在还原' }, origin);
            return;
        }
        decoding = true;
        try {
            const body = await readJson(req, 8000000);
            if (!validDecodeRequest(body)) throw new Error('字体或文本格式不正确');
            const result = await decodeTexts({ fontBase64: body.font, texts: body.texts });
            send(res, 200, result, origin);
        } catch (error) {
            send(res, 502, { error: error.message }, origin);
        } finally {
            decoding = false;
        }
        return;
    }
    if (req.method !== 'POST' || req.url !== '/answer') {
        send(res, 404, { error: '未找到接口' }, origin);
        return;
    }
    if (busy) {
        send(res, 429, { error: '上一批题目仍在处理' }, origin);
        return;
    }
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
        send(res, 415, { error: '仅接受 JSON' }, origin);
        return;
    }
    busy = true;
    try {
        let raw = '';
        for await (const chunk of req) {
            raw += chunk.toString('utf8');
            if (raw.length > 100000) throw new Error('请求内容过大');
        }
        const questions = JSON.parse(raw).questions;
        if (!validQuestions(questions)) throw new Error('题目格式不正确');
        const answers = await requestAnswers(questions);
        send(res, 200, { answers }, origin);
    } catch (error) {
        send(res, 502, { error: error.message }, origin);
    } finally {
        busy = false;
    }
});

server.listen(PORT, '127.0.0.1', async () => {
    const updatedScript = script
        .replace(/const LOCAL_TOKEN = '[^']*';/, `const LOCAL_TOKEN = '${token}';`)
        .replace(/const LOCAL_URL = 'http:\/\/127\.0\.0\.1:\d+';/, `const LOCAL_URL = 'http://127.0.0.1:${PORT}';`);
    writeFileSync(scriptPath, updatedScript, 'utf8');
    console.log(`豆包版本地服务已启动：http://127.0.0.1:${PORT}（不新建对话：${process.env.DOUBAO_NEW_CHAT === '1' ? '否' : '是'}）`);

    const probe = await probeDecoder().catch((error) => ({ ok: false, error: error.message }));
    decoderProbe = probe;
    console.log(probe.ok
        ? `字形还原已就绪：${probe.python}`
        : `字形还原不可用：${probe.error}`);

    providerState = await providerStatus();
    if (providerState.ok) {
        console.log(`豆包已连接：${providerState.title}（${providerState.href}）`);
    } else if (providerState.loggedOut) {
        console.log('豆包未登录：请先在「豆包自动化实例」窗口里扫码登录');
    } else {
        console.log(`豆包不可用：${providerState.error || '请先运行 desktop-doubao\\启动豆包自动化实例.cmd'}`);
    }

    console.log('请复制同目录 xuexitong-console.js 的全部内容，粘贴到学习通页面的 Edge 控制台并按 Enter。');
    console.log('关闭本窗口即可停止服务。');
});
