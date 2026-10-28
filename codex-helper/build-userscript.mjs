import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export function validateSettings(settings) {
    if (!Number.isInteger(settings.port) || settings.port < 1024 || settings.port > 65535 ||
        typeof settings.token !== 'string' || !/^[a-f0-9]{64}$/.test(settings.token)) {
        throw new Error('bridge-settings.json 格式错误，请检查端口和本机令牌');
    }
    return settings;
}

export function prepareRuntime(directory = root) {
    const configPath = path.join(directory, 'bridge-settings.json');
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({ port: 37843, token: crypto.randomBytes(32).toString('hex') }, null, 2),
            { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    }
    const settings = validateSettings(JSON.parse(fs.readFileSync(configPath, 'utf8')));
    const template = fs.readFileSync(path.join(root, 'codex-helper.template.user.js'), 'utf8');
    if (template.split('__LOCAL_TOKEN__').length !== 2 || template.split('__LOCAL_PORT__').length !== 2) {
        throw new Error('油猴模板的连接占位符异常');
    }
    const script = template.replace('__LOCAL_TOKEN__', settings.token).replace('__LOCAL_PORT__', String(settings.port));
    const scriptPath = path.join(directory, 'codex-helper.user.js');
    fs.writeFileSync(scriptPath, script, { encoding: 'utf8', mode: 0o600 });
    return { settings, scriptPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    prepareRuntime();
    console.log('已生成 codex-helper.user.js。请将生成文件导入油猴；不要安装 template 文件。');
}
