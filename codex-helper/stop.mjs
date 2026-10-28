import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSettings } from './build-userscript.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
try {
    const settings = validateSettings(JSON.parse(fs.readFileSync(path.join(root, 'bridge-settings.json'), 'utf8')));
    fs.writeFileSync(path.join(root, 'watchdog-stop'), 'stopped\n');
    const response = await fetch(`http://127.0.0.1:${settings.port}/stop`, {
        method: 'POST', headers: { 'X-Xuexitong-Token': settings.token }, signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error('本机令牌不匹配或服务拒绝停止');
    console.log('本机服务已停止。网页上也请点击“停止助手”，或禁用油猴脚本并刷新。');
} catch (error) {
    console.error('未能停止服务：' + error.message);
    process.exitCode = 1;
}
