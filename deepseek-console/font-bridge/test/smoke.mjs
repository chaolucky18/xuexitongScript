/** 端到端冒烟测试：fixture.json 里的假混淆字体 -> Node 桥 -> Python 解码。 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTexts, resolveDecoder } from '../font-bridge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(await readFile(join(HERE, 'fixture.json'), 'utf8'));

console.log('解码器配置：', resolveDecoder());

const started = Date.now();
const result = await decodeTexts({ fontBase64: fixture.font_b64, texts: fixture.texts });

let bad = 0;
result.texts.forEach((text, index) => {
    const want = fixture.expected[index];
    const ok = text === want;
    if (!ok) bad += 1;
    console.log(`${ok ? '[OK  ]' : '[DIFF]'} ${text}`);
    if (!ok) console.log(`        期望 ${want}`);
});

console.log(`\n槽位 ${result.codes}，Python 耗时 ${result.seconds}s，总耗时 ${((Date.now() - started) / 1000).toFixed(2)}s，缓存 ${result.cached}`);
if (Object.keys(result.uncertain).length) console.log('存疑：', result.uncertain);

const second = await decodeTexts({ fontBase64: fixture.font_b64, texts: fixture.texts });
console.log('第二次调用走了缓存：', second.cached);

if (bad) {
    console.log(`结论：FAIL（${bad} 段不一致）`);
    process.exit(1);
}
console.log('结论：PASS');
