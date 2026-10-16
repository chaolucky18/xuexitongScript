import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { requestAnswers } from './deepseek-request.mjs';

const PORT = 37841;
const scriptPath = fileURLToPath(new URL('./xuexitong-console.js', import.meta.url));
const token = randomBytes(24).toString('hex');
const allowedOrigin = (origin) => /^https:\/\/([a-z0-9-]+\.)*chaoxing\.com$/i.test(origin || '');

async function readApiKey() {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const value = await rl.question('DeepSeek API Key: ');
        rl.close();
        return value.trim();
    }
    process.stdout.write('请粘贴 DeepSeek API Key 后按 Enter（输入不显示）：');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    return new Promise((resolve, reject) => {
        let value = '';
        const onData = (chunk) => {
            for (const char of chunk) {
                if (char === '\r' || char === '\n') {
                    process.stdin.off('data', onData);
                    process.stdin.setRawMode(false);
                    process.stdout.write('\n');
                    resolve(value.trim());
                    return;
                }
                if (char === '\u0003') {
                    process.stdin.off('data', onData);
                    process.stdin.setRawMode(false);
                    reject(new Error('已取消'));
                    return;
                }
                if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
                else value += char;
            }
        };
        process.stdin.on('data', onData);
    });
}

const apiKey = await readApiKey();
if (!apiKey) throw new Error('未输入 DeepSeek API Key');
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
        send(res, 200, { ok: true }, origin);
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
        const answers = await requestAnswers(questions, apiKey);
        send(res, 200, { answers }, origin);
    } catch (error) {
        send(res, 502, { error: error.message }, origin);
    } finally {
        busy = false;
    }
});

server.listen(PORT, '127.0.0.1', () => {
    writeFileSync(scriptPath, script.replace(/const LOCAL_TOKEN = '[^']*';/, `const LOCAL_TOKEN = '${token}';`), 'utf8');
    console.log(`本地服务已启动：http://127.0.0.1:${PORT}`);
    console.log('请复制同目录 xuexitong-console.js 的全部内容，粘贴到学习通页面的 Edge 控制台并按 Enter。');
    console.log('关闭本窗口即可停止服务；API Key 不会写入文件。');
});
