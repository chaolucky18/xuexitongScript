import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { spawnSync, spawn } from 'node:child_process';
import { join } from 'node:path';
import { requestAnswers } from './deepseek-request.mjs';

const PORT = Number(process.env.XUEXITONG_PORT || 37841);
const HOST = '127.0.0.1';
const scriptPath = fileURLToPath(new URL('./xuexitong-console.js', import.meta.url));
const tokenPath = fileURLToPath(new URL('./.dsh-token', import.meta.url));
const debugLogPath = fileURLToPath(new URL('./debug.log', import.meta.url));
const dumpDir = fileURLToPath(new URL('./dump', import.meta.url));
const ocrScriptPath = fileURLToPath(new URL('./tools/win-ocr.ps1', import.meta.url));
const apiUrl = process.env.DEEPSEEK_API_URL || undefined;

// 允许学习通各子域（控制台/页面直连）与任意 Edge 扩展（扩展后台转发）。
// 真正的准入靠令牌；Origin 只是第一层过滤，挡掉普通网页的跨站调用。
const allowedOrigin = (origin) => {
    if (!origin) return true; // curl / Node 等非浏览器客户端
    if (/^chrome-extension:\/\/[a-p]{32}$/i.test(origin)) return true;
    return /^https:\/\/([a-z0-9-]+\.)*chaoxing\.com$/i.test(origin);
};

function loadToken() {
    try {
        if (existsSync(tokenPath)) {
            const saved = readFileSync(tokenPath, 'utf8').trim();
            if (/^[a-f0-9]{48}$/i.test(saved)) return { token: saved, reused: true };
        }
    } catch (error) {
        console.warn(`读取令牌文件失败，将重新生成：${error.message}`);
    }
    const token = randomBytes(24).toString('hex');
    try {
        writeFileSync(tokenPath, token, 'utf8');
    } catch (error) {
        console.warn(`令牌无法保存到 .dsh-token（下次启动会变化）：${error.message}`);
    }
    return { token, reused: false };
}

const { token, reused } = loadToken();

// 令牌恒定后，控制台版脚本只需同步一次，不必每次重新复制粘贴。
function syncScriptToken() {
    try {
        const script = readFileSync(scriptPath, 'utf8');
        if (!/const LOCAL_TOKEN = '[^']*';/.test(script)) {
            console.warn('xuexitong-console.js 中缺少令牌占位，跳过同步。');
            return;
        }
        const updated = script.replace(/const LOCAL_TOKEN = '[^']*';/, `const LOCAL_TOKEN = '${token}';`);
        if (updated === script) return;
        writeFileSync(scriptPath, updated, 'utf8');
        console.log('已把当前令牌写入 xuexitong-console.js（仅控制台粘贴模式需要）。');
    } catch (error) {
        console.warn(`无法写入 xuexitong-console.js：${error.message}`);
        console.warn('扩展模式无需该文件里的令牌；控制台模式请手动替换脚本第 7 行的 LOCAL_TOKEN。');
    }
}

function copyToClipboard(text) {
    try {
        const result = spawnSync('clip', [], { input: text, windowsHide: true });
        return result.status === 0;
    } catch {
        return false;
    }
}

async function readApiKey() {
    const fromEnv = String(process.env.DEEPSEEK_API_KEY || '').trim();
    if (fromEnv) {
        console.log('已从环境变量 DEEPSEEK_API_KEY 读取 API Key。');
        return fromEnv;
    }
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

const apiKey = await readApiKey().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
if (!apiKey) {
    console.error('未输入 DeepSeek API Key，本地服务未启动。');
    process.exit(1);
}

function send(res, status, data, origin) {
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        Vary: 'Origin',
    };
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    res.writeHead(status, headers);
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
// 用 Windows 自带 OCR 读页面渲染出来的文字。
// 学习通把题干里部分汉字换成生僻字、再用内嵌字体渲染回正确字形（字体反爬），
// DOM 里拿不到真字；但"看到的字"是对的，画成图再 OCR 就能还原，且不依赖具体映射。
function runOcr(imagePath) {
    return new Promise((resolve) => {
        const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ocrScriptPath, imagePath], {
            windowsHide: true,
        });
        let out = '';
        let err = '';
        const timer = setTimeout(() => {
            try { child.kill(); } catch { /* ignore */ }
        }, 25000);
        child.stdout.on('data', (chunk) => { out += chunk.toString('utf8'); });
        child.stderr.on('data', (chunk) => { err += chunk.toString('utf8'); });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, text: out.replace(/\r/g, '').trim(), error: err.trim().slice(0, 200) });
        });
        child.on('error', (error) => {
            clearTimeout(timer);
            resolve({ code: -1, text: '', error: error.message });
        });
    });
}

let ocrBusy = false;
const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (!allowedOrigin(origin)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Origin not allowed');
        return;
    }
    if (req.method === 'OPTIONS') {
        const headers = {
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Xuexitong-Token',
            'Access-Control-Allow-Private-Network': 'true',
            'Access-Control-Max-Age': '600',
            Vary: 'Origin',
        };
        if (origin) headers['Access-Control-Allow-Origin'] = origin;
        res.writeHead(204, headers);
        res.end();
        return;
    }
    if (req.headers['x-xuexitong-token'] !== token) {
        send(res, 403, { error: '本地令牌不匹配，请重新复制控制台脚本或在扩展里更新令牌' }, origin);
        return;
    }
    if (req.method === 'GET' && req.url === '/health') {
        send(res, 200, { ok: true, model: process.env.DEEPSEEK_MODEL || 'deepseek-flash', port: PORT }, origin);
        return;
    }
    // 页面脚本的运行日志落到 debug.log，排查时直接看文件，不用开 DevTools
    // （学习通有 debugger 反调试，一按 F12 整页暂停）。
    if (req.method === 'POST' && req.url === '/log') {
        let raw = '';
        try {
            for await (const chunk of req) {
                raw += chunk.toString('utf8');
                if (raw.length > 40000) break;
            }
            const entry = JSON.parse(raw || '{}');
            appendFileSync(debugLogPath, `${JSON.stringify({ ...entry, receivedAt: new Date().toISOString() })}\n`, 'utf8');
        } catch { /* 日志写失败不影响答题 */ }
        send(res, 200, { ok: true }, origin);
        return;
    }
    if (req.method === 'POST' && req.url === '/file') {
        let raw = '';
        try {
            for await (const chunk of req) {
                raw += chunk.toString('utf8');
                if (raw.length > 12000000) throw new Error('文件过大');
            }
            const { name, base64 } = JSON.parse(raw || '{}');
            if (!/^[A-Za-z0-9._-]{1,60}$/.test(String(name || ''))) throw new Error('文件名不合法');
            mkdirSync(dumpDir, { recursive: true });
            const buffer = Buffer.from(String(base64 || ''), 'base64');
            writeFileSync(join(dumpDir, name), buffer);
            console.log(`已保存：dump/${name} (${buffer.length} 字节)`);
        } catch (error) {
            send(res, 400, { error: error.message }, origin);
            return;
        }
        send(res, 200, { ok: true }, origin);
        return;
    }
    // 页面渲染好的题目图片交给 Windows OCR 还原成真文字
    if (req.method === 'POST' && req.url === '/ocr') {
        let raw = '';
        try {
            for await (const chunk of req) {
                raw += chunk.toString('utf8');
                if (raw.length > 12000000) throw new Error('图片过大');
            }
            const { image } = JSON.parse(raw || '{}');
            if (!image || typeof image !== 'string') throw new Error('缺少图片数据');
            if (ocrBusy) throw new Error('上一张图片还在识别');
            ocrBusy = true;
            mkdirSync(dumpDir, { recursive: true });
            const imagePath = join(dumpDir, 'ocr-latest.png');
            writeFileSync(imagePath, Buffer.from(image, 'base64'));
            const started = Date.now();
            const result = await runOcr(imagePath);
            const ms = Date.now() - started;
            try {
                appendFileSync(debugLogPath, `${JSON.stringify({ event: 'ocr', data: { ms, code: result.code, chars: result.text.length, text: result.text.slice(0, 300), error: result.error || null }, receivedAt: new Date().toISOString() })}\n`, 'utf8');
            } catch { /* ignore */ }
            if (result.code !== 0 && !result.text) {
                send(res, 500, { error: result.error || `OCR 进程退出码 ${result.code}` }, origin);
                return;
            }
            send(res, 200, { ok: true, text: result.text, ms }, origin);
        } catch (error) {
            send(res, 500, { error: error.message }, origin);
        } finally {
            ocrBusy = false;
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
        const answers = await requestAnswers(questions, apiKey, {
            apiUrl,
            onUsage: (info) => {
                try {
                    appendFileSync(debugLogPath, `${JSON.stringify({ event: 'api', data: info, receivedAt: new Date().toISOString() })}\n`, 'utf8');
                } catch { /* ignore */ }
            },
        });
        send(res, 200, { answers }, origin);
    } catch (error) {
        send(res, 502, { error: error.message }, origin);
    } finally {
        busy = false;
    }
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`端口 ${PORT} 已被占用：可能已经有一个本地服务在运行，请先关闭旧的窗口。`);
    } else {
        console.error('本地服务启动失败：', error.message);
    }
    process.exit(1);
});

server.listen(PORT, HOST, () => {
    syncScriptToken();
    try {
        writeFileSync(debugLogPath, '', 'utf8');
    } catch { /* ignore */ }
    const copied = copyToClipboard(token);
    console.log('');
    console.log(`本地服务已启动：http://${HOST}:${PORT}`);
    console.log(`令牌：${token}${copied ? '（已复制到剪贴板）' : '（请手动复制）'}`);
    console.log(reused
        ? '本次沿用上一次的令牌，已配置过的扩展无需重新粘贴。'
        : '首次启动已生成令牌，并保存到同目录 .dsh-token；以后启动都使用这个令牌。');
    console.log('');
    console.log('【Edge 扩展】首次使用：点击工具栏的“学习通助手”图标，把令牌粘贴进输入框并保存。之后打开课程页即自动运行。');
    console.log('【控制台模式】不使用扩展时：打开 xuexitong-console.js，全选复制，粘贴到课程页控制台。');
    console.log('');
    console.log('关闭本窗口即可停止服务；API Key 只保存在内存中，不会写入文件。');
});