/**
 * 把 Python 的字形反混淆接到 Node 侧。
 *
 * 设计要点：
 * 1. 用「临时文件」传参而不是 stdin/stdout —— Windows 管道默认代码页是 936，
 *    中文经管道会变乱码；某些沙箱也不允许父进程创建匿名管道。
 * 2. Python stderr 重定向到日志文件（不是管道），失败时把最后几行带回错误信息，
 *    避免只看到一个「退出码 1」。
 * 3. 先探测解释器是否真的能 import numpy/PIL/fontTools，再拿它干活；
 *    探测失败会自动换下一个候选，而不是盲信一个叫做 python 的壳。
 * 4. 结果按「字体 + 文本」缓存，同一页重复解码不再等 5～10 秒。
 */
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'font_decode_cli.py');

// 中转文件默认放程序目录，不放系统 Temp：
// 有些安全软件/权限策略会拒绝 python.exe 往 %TEMP% 写文件，而 Node 给 python
// 打开的 stdout 句柄不受影响，所以最坏情况还有 marker 兜底。
const WORK_DIR = process.env.CXXT_WORK_DIR || join(HERE, '..', '.tmp');
const RESULT_MARKER = '__CXDECODE_RESULT__';

async function pickWorkDir() {
    try {
        await mkdir(WORK_DIR, { recursive: true });
        return WORK_DIR;
    } catch (_) {
        return tmpdir();
    }
}

const PYTHON_CANDIDATES = [
    process.env.CXXT_PYTHON,
    join(HERE, '..', '.venv', 'Scripts', 'python.exe'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
    'python',
].filter(Boolean);

const DECODER_CANDIDATES = [
    process.env.CXXT_DECODER,
    join(HERE, '..', '还原题干.py'),
].filter(Boolean);

/** 只看「文件在不在」，用于启动日志和 /health，不做执行探测。 */
export function resolveDecoder() {
    const python = PYTHON_CANDIDATES.find((path) => path === 'python' || existsSync(path)) || 'python';
    const module = DECODER_CANDIDATES.find((path) => existsSync(path)) || '';
    return { python, module, available: Boolean(module) && existsSync(CLI) };
}

function probePython(python) {
    return new Promise((resolve) => {
        if (python !== 'python' && !existsSync(python)) {
            resolve('文件不存在');
            return;
        }
        let settled = false;
        const child = spawn(python, ['-c', 'import numpy, PIL, fontTools'], { windowsHide: true, stdio: 'ignore' });
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill();
            resolve('探测超时');
        }, 20000);
        child.on('error', (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(`无法启动（${error.message}）`);
        });
        child.on('exit', (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(code === 0 ? 'ok' : `退出码 ${code}`);
        });
    });
}

let probePromise = null;

/** 真正验证过解释器和解码脚本才返回 ok，结果在进程内缓存。 */
export function probeDecoder() {
    if (!probePromise) probePromise = runProbe();
    return probePromise;
}

async function runProbe() {
    if (!existsSync(CLI)) {
        return { ok: false, error: `缺少解码入口：${CLI}` };
    }
    const module = DECODER_CANDIDATES.find((path) => existsSync(path)) || '';
    if (!module) {
        return { ok: false, error: '没有找到 还原题干.py（可用 CXXT_DECODER 指定）' };
    }
    const tried = [];
    for (const python of PYTHON_CANDIDATES) {
        const outcome = await probePython(python);
        if (outcome === 'ok') return { ok: true, python, module };
        tried.push(`${python} → ${outcome}`);
    }
    return {
        ok: false,
        error: `没有可用的 Python 解释器（需要能 import numpy / PIL / fontTools）。已尝试：${tried.join('；')}。`
            + ' 可设置环境变量 CXXT_PYTHON 指向 .venv\\Scripts\\python.exe',
    };
}

const cache = new Map();
const CACHE_LIMIT = 8;

function cacheKey(fontBase64, texts) {
    return createHash('sha256').update(fontBase64).update('\u0000').update(texts.join('\u0000')).digest('hex');
}

function runPython(python, module, inputPath, outputPath, logPath, timeoutMs) {
    return new Promise((resolve, reject) => {
        const args = [CLI, '--input', inputPath, '--output', outputPath];
        if (module) args.push('--module', module);
        let logFd = null;
        try {
            logFd = openSync(logPath, 'w');
        } catch (_) {
            logFd = null;
        }
        let child;
        try {
            child = spawn(python, args, {
                windowsHide: true,
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
                stdio: [
                    'ignore',
                    logFd === null ? 'ignore' : logFd,
                    logFd === null ? 'ignore' : logFd,
                ],
            });
        } finally {
            if (logFd !== null) closeSync(logFd);
        }

        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill();
            reject(new Error(`字形还原超时（${Math.round(timeoutMs / 1000)} 秒）`));
        }, timeoutMs);
        child.on('error', (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(new Error(`无法启动 Python（${python}）：${error.message}`));
        });
        child.on('exit', (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(code);
        });
    });
}

async function readText(path) {
    try {
        return await readFile(path, 'utf8');
    } catch (_) {
        return '';
    }
}

/** 结果文件被安全软件挡住时，从 stdout 日志里那行 marker 里捞结果。 */
function extractResult(log) {
    const index = log.lastIndexOf(RESULT_MARKER);
    if (index < 0) return null;
    const line = log.slice(index + RESULT_MARKER.length).split(/\r?\n/)[0];
    try {
        return JSON.parse(line);
    } catch (_) {
        return null;
    }
}

/**
 * @param {{fontBase64: string, texts: string[], timeoutMs?: number}} options
 * @returns {Promise<{texts: string[], uncertain: Record<string,string[]>, codes: number, seconds: number, cached: boolean}>}
 */
export async function decodeTexts({ fontBase64, texts, timeoutMs = 180000 }) {
    if (typeof fontBase64 !== 'string' || fontBase64.length < 100) {
        throw new Error('字体数据无效');
    }
    if (!Array.isArray(texts) || !texts.length) throw new Error('没有要还原的文本');
    if (texts.some((text) => typeof text !== 'string')) throw new Error('文本必须是字符串');

    const key = cacheKey(fontBase64, texts);
    if (cache.has(key)) return { ...cache.get(key), cached: true };

    const decoder = await probeDecoder();
    if (!decoder.ok) throw new Error(decoder.error);

    const dir = await pickWorkDir();
    const id = randomUUID();
    const inputPath = join(dir, `cxdecode-${id}.json`);
    const outputPath = join(dir, `cxdecode-${id}.out.json`);
    const logPath = join(dir, `cxdecode-${id}.log`);
    try {
        await writeFile(inputPath, JSON.stringify({ font_b64: fontBase64, texts }), 'utf8');
        const code = await runPython(decoder.python, decoder.module, inputPath, outputPath, logPath, timeoutMs);

        let result = null;
        try {
            result = JSON.parse(await readFile(outputPath, 'utf8'));
        } catch (_) {
            result = null;
        }
        if (!result) {
            const log = await readText(logPath);
            result = extractResult(log);
            if (!result) {
                const tail = log.trim().slice(-1500);
                throw new Error(`Python 没有产出结果（退出码 ${code}，解释器 ${decoder.python}）${tail ? `：${tail}` : '，且没有任何错误输出'}`);
            }
        }
        if (!result.ok) throw new Error(result.error || '字形还原失败');
        const value = {
            texts: result.texts,
            uncertain: result.uncertain || {},
            codes: result.codes || 0,
            seconds: result.seconds || 0,
        };
        cache.set(key, value);
        if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
        return { ...value, cached: false };
    } finally {
        await rm(inputPath, { force: true }).catch(() => {});
        await rm(outputPath, { force: true }).catch(() => {});
        await rm(logPath, { force: true }).catch(() => {});
    }
}
