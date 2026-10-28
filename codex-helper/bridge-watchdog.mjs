import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// A separate process can recover a crashed bridge without refreshing the lesson.
export class RecoveryBudget {
    constructor() { this.attempts = []; this.failures = 0; }
    observe(healthy) { this.failures = healthy ? 0 : this.failures + 1; }
    claim(now = Date.now()) {
        this.attempts = this.attempts.filter(t => now - t < 600000);
        if (this.failures < 3 || this.attempts.length >= 5) return false;
        this.attempts.push(now); this.failures = 0; return true;
    }
}

export async function watchBridge(root, { interval = 10000, timeout = 3000, childArgs = ['--resident'] } = {}) {
    const settings = JSON.parse(fs.readFileSync(path.join(root, 'bridge-settings.json'), 'utf8'));
    if (!Number.isInteger(settings.port) || settings.port < 1024 || settings.port > 65535 ||
        typeof settings.token !== 'string' || !/^[a-f0-9]{64}$/.test(settings.token)) throw new Error('本机连接配置无效');
    const endpoint = `http://127.0.0.1:${settings.port}`;
    const stopFile = path.join(root, 'watchdog-stop');
    const statusFile = path.join(root, 'watchdog-status.json');
    const address = process.platform === 'win32' ? `\\\\.\\pipe\\codex-quiz-watchdog-${settings.port}` : path.join(os.tmpdir(), `codex-quiz-watchdog-${settings.port}.sock`);
    const lock = net.createServer(socket => socket.end());
    try {
        await new Promise((resolve, reject) => { lock.once('error', reject); lock.listen(address, resolve); });
    } catch (error) {
        if (error.code === 'EADDRINUSE') return { alreadyRunning: true };
        throw error;
    }
    fs.rmSync(stopFile, { force: true });
    const budget = new RecoveryBudget();
    budget.failures = 2; // First launch is immediate; subsequent outages require three checks.
    let child = null, stopped = false, restarts = 0;
    const headers = { 'X-Xuexitong-Token': settings.token };
    const stop = () => { stopped = true; fs.writeFileSync(stopFile, 'stopped\n'); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    const isStopped = () => stopped || fs.existsSync(stopFile);
    const probe = async () => {
        try {
            const res = await fetch(endpoint + '/health', { headers, signal: AbortSignal.timeout(timeout) });
            if (!res.ok) return { healthy: false, conflict: true };
            const data = await res.json();
            return { healthy: data.ok === true && data.engine === 'codex-cli' && data.sessions === true, conflict: data.engine !== 'codex-cli' };
        } catch { return { healthy: false, conflict: false }; }
    };
    const launch = () => {
        const log = path.join(root, 'watchdog-worker.log');
        if (fs.existsSync(log) && fs.statSync(log).size > 1048576) fs.writeFileSync(log, '');
        const fd = fs.openSync(log, 'a');
        try {
            const worker = spawn(process.execPath, [path.join(root, 'codex-bridge.mjs'), ...childArgs], {
                cwd: root, windowsHide: true, stdio: ['ignore', fd, fd], shell: false,
            });
            child = worker;
            worker.once('error', () => { if (child === worker) child = null; });
            worker.once('exit', () => { if (child === worker) child = null; });
            restarts++;
        } finally { fs.closeSync(fd); }
    };
    try {
        while (!isStopped()) {
            const health = await probe();
            if (isStopped()) break;
            budget.observe(health.healthy);
            if (!health.conflict && !health.healthy && budget.claim()) {
                // Never terminate an existing service that this watchdog did not launch.
                if (child) {
                    const owned = child;
                    owned.kill();
                    await Promise.race([new Promise(r => owned.once('exit', r)), new Promise(r => setTimeout(r, timeout))]);
                }
                if (!isStopped() && !child) launch();
            }
            fs.writeFileSync(statusFile, JSON.stringify({ pid: process.pid, checkedAt: new Date().toISOString(), healthy: health.healthy,
                conflict: health.conflict, restarts, failures: budget.failures, childPid: child?.pid || null, stopped: false }));
            await new Promise(resolve => setTimeout(resolve, interval));
        }
    } finally {
        process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
        // Explicit stop must not be interpreted as a crash and restarted.
        child?.kill();
        fs.writeFileSync(statusFile, JSON.stringify({ pid: process.pid, checkedAt: new Date().toISOString(), restarts, stopped: true }));
        await new Promise(resolve => lock.close(resolve));
    }
    return { stopped: true, restarts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    watchBridge(path.dirname(fileURLToPath(import.meta.url))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
