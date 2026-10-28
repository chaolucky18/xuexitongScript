import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function invocationForFile(filename) {
    if (!fs.existsSync(filename)) throw new Error('找不到 Codex 程序：' + filename);
    if (/\.m?js$/i.test(filename)) return { command: process.execPath, prefix: [filename] };
    if (/\.(cmd|bat|ps1)$/i.test(filename)) {
        const entry = path.join(path.dirname(filename), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
        if (fs.existsSync(entry)) return { command: process.execPath, prefix: [entry] };
        throw new Error('无法解析 Codex 脚本入口，请用 CODEX_QUIZ_EXECUTABLE 指定 codex.exe 或 codex.js');
    }
    return { command: filename, prefix: [] };
}

export function resolveCodex() {
    if (process.env.CODEX_QUIZ_EXECUTABLE) return invocationForFile(process.env.CODEX_QUIZ_EXECUTABLE);
    if (process.platform !== 'win32') return { command: 'codex', prefix: [] };
    if (process.env.LOCALAPPDATA) {
        const desktop = path.join(process.env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe');
        if (fs.existsSync(desktop)) return invocationForFile(desktop);
    }
    let candidates;
    try {
        candidates = execFileSync('where.exe', ['codex'], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
            .split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    } catch {
        throw new Error('未找到 Codex CLI，请先安装并执行 codex login');
    }
    for (const candidate of candidates) {
        try { return invocationForFile(candidate); } catch { /* try another supported entry */ }
    }
    throw new Error('未找到支持的 Codex 入口，请设置 CODEX_QUIZ_EXECUTABLE');
}
