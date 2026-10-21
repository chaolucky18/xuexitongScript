// 把上一级目录的 xuexitong-console.js 同步进扩展目录。
// 扩展只能加载自己目录内的文件，所以主脚本改了之后跑一次这个脚本。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', '..', 'xuexitong-console.js');
const target = join(here, '..', 'xuexitong-console.js');

const content = readFileSync(source, 'utf8');
if (!content.includes('xxthBridge') || !content.includes("bridgeRequest('answer'")) {
    console.error('主脚本里没有扩展桥接逻辑，拒绝同步。请检查 xuexitong-console.js 是否被回退成旧版本。');
    process.exit(1);
}
writeFileSync(target, content, 'utf8');
console.log(`已同步 ${source} → ${target}（${content.length} 字符）`);