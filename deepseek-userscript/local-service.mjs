import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { requestAnswers } from './deepseek-request.mjs';
import core from './quiz-core.cjs';

const allowedCourse = value => /^https:\/\/([a-z0-9-]+\.)*chaoxing\.com$/i.test(value || '');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function createService({ token, fetchImpl = fetch }) {
    let apiKey = '';
    let busy = false;
    const setupNonce = randomBytes(24).toString('hex');
    const cache = new Map();
    async function body(req, max = 100000) {
        let raw = '';
        for await (const chunk of req) {
            raw += chunk.toString('utf8');
            if (Buffer.byteLength(raw) > max) throw new Error('请求内容过大');
        }
        return raw;
    }
    function json(res, status, value, origin) {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
            ...(allowedCourse(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) });
        res.end(JSON.stringify(value));
    }
    function setupPage(res, message = '') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
            'Set-Cookie': `ds_setup=${setupNonce}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600` });
        res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DeepSeek 本机配置</title><style>body{font:17px system-ui;background:#f5f6f8;color:#17212b;margin:8vh auto;max-width:580px;padding:24px}main{background:white;border-radius:18px;padding:32px}h1{font-size:25px}p{line-height:1.7}input,button{box-sizing:border-box;font:inherit;padding:13px;width:100%;border:1px solid #cbd5e1;border-radius:9px;margin:10px 0}button{background:#2765db;color:white;border:0;cursor:pointer}.ok{color:#047857}</style>
<main><h1>DeepSeek 本机配置</h1><p class="ok">${apiKey ? '已连接 DeepSeek。可返回学习通查看答题助手。' : '请输入你的 DeepSeek 官方 API Key。'}</p>
<p>${escape(message)}</p><form method="post" action="/configure"><input type="hidden" name="nonce" value="${setupNonce}">
<label>DeepSeek API Key<input type="password" name="api_key" autocomplete="off" spellcheck="false" required placeholder="在这里粘贴 API Key"></label>
<button type="submit">验证并连接</button></form><p>密钥仅保存在本机服务内存，关闭服务后清除。题干和选项会发送给 DeepSeek，调用可能计费。课程页可选择手动或自动提交，以答题助手开关为准。</p></main></html>`);
    }
    const server = createServer(async (req, res) => {
        const port = server.address()?.port;
        const ownOrigin = `http://127.0.0.1:${port}`;
        if (req.headers.host !== `127.0.0.1:${port}`) { json(res, 403, { error: '仅允许本机访问' }); return; }
        const origin = req.headers.origin;
        try {
            if (req.method === 'GET' && req.url === '/') { setupPage(res); return; }
            if (req.method === 'POST' && req.url === '/configure') {
                if (origin !== ownOrigin || !req.headers.cookie?.split(';').some(c => c.trim() === `ds_setup=${setupNonce}`)) {
                    json(res, 403, { error: '配置来源无效，请重新打开本机配置页' }); return;
                }
                const form = new URLSearchParams(await body(req, 4000));
                if (form.get('nonce') !== setupNonce) { json(res, 403, { error: '配置令牌无效' }); return; }
                const candidate = (form.get('api_key') || '').trim();
                if (!candidate || candidate.length > 300) { setupPage(res, '密钥不能为空或过长。'); return; }
                try {
                    const response = await fetchImpl('https://api.deepseek.com/models', {
                        headers: { Authorization: `Bearer ${candidate}` }, signal: AbortSignal.timeout(15000),
                    });
                    if (!response.ok) { setupPage(res, `验证未通过（HTTP ${response.status}），请检查密钥。`); return; }
                } catch (_) { setupPage(res, '暂时无法连接 DeepSeek，请检查网络后重试。'); return; }
                apiKey = candidate;
                cache.clear();
                res.writeHead(303, { Location: '/', 'Cache-Control': 'no-store' }); res.end(); return;
            }
            if (!allowedCourse(origin)) { json(res, 403, { error: '不允许此来源' }); return; }
            if (req.method === 'OPTIONS') {
                res.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, X-Xuexitong-Token', 'Access-Control-Allow-Private-Network': 'true',
                    'Access-Control-Max-Age': '600', Vary: 'Origin' }); res.end(); return;
            }
            if (req.headers['x-xuexitong-token'] !== token) { json(res, 403, { error: '连接令牌不匹配，请重新导入配套脚本' }, origin); return; }
            if (req.method === 'GET' && req.url === '/health') { json(res, 200, { ok: true, configured: Boolean(apiKey), model: 'deepseek-flash' }, origin); return; }
            if (req.method !== 'POST' || req.url !== '/answer') { json(res, 404, { error: '未找到接口' }, origin); return; }
            if (!apiKey) { json(res, 503, { error: '请先在本机配置页连接 API Key' }, origin); return; }
            if (busy) { json(res, 429, { error: '上一批题目仍在处理' }, origin); return; }
            if (!String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 415, { error: '仅接受 JSON' }, origin); return; }
            busy = true;
            try {
                const { questions } = JSON.parse(await body(req));
                if (!Array.isArray(questions) || !questions.length || questions.length > 30 || !questions.every((q, i) =>
                    q.id === i + 1 && ['单选题', '多选题', '判断题'].includes(q.type) && typeof q.question === 'string' && q.question.length > 0 && q.question.length <= 500 &&
                    Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 8 && new Set(q.options.map(o => o.letter)).size === q.options.length &&
                    q.options.every(o => /^[A-H]$/.test(o.letter) && typeof o.text === 'string' && o.text.length > 0 && o.text.length <= 500))) throw new Error('题目格式不正确');
                const signature = JSON.stringify(questions);
                let answers = cache.get(signature)?.expires > Date.now() ? cache.get(signature).answers : null;
                if (!answers) {
                    answers = await requestAnswers(questions, apiKey, fetchImpl);
                    core.validateAnswers(questions.map(q => ({ kind: q.type, options: q.options })), answers);
                    if (cache.size >= 50) cache.delete(cache.keys().next().value);
                    cache.set(signature, { answers, expires: Date.now() + 600000 });
                }
                json(res, 200, { answers }, origin);
            } catch (error) { json(res, 502, { error: String(error.message).replaceAll(apiKey, '[hidden]') }, origin); }
            finally { busy = false; }
        } catch (_) { json(res, 400, { error: '请求无效' }, origin); }
    });
    return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const token = readFileSync(new URL('./.service-token', import.meta.url), 'utf8').trim();
    if (!/^[a-f0-9]{48}$/.test(token)) throw new Error('本机连接配置无效');
    const server = createService({ token });
    server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '端口 37841 已被占用，请检查是否已有本机服务运行。' : '本机服务启动失败。'); process.exitCode = 1; });
    server.listen(37841, '127.0.0.1', () => {
        console.log('DeepSeek 本机服务已启动：http://127.0.0.1:37841/');
        console.log('在配置页输入 API Key，验证后返回学习通。密钥不写入文件。');
        console.log('保持本窗口打开；按 Control+C 或关闭窗口停止服务。');
    });
}
