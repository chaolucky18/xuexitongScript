import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function build(sourceName, outName, metadata) {
    const source = readFileSync(resolve(root, sourceName), 'utf8').replace(/^\uFEFF/, '');
    writeFileSync(resolve(root, outName), `${metadata}${source}`, 'utf8');
    console.log('written', outName);
}

build(
    'v3_optimized.js',
    'v3_optimized.user.js',
    `// ==UserScript==
// @name         学习通自动刷课脚本 V3 稳定版
// @namespace    local.codex.xuexitong
// @version      3.3.0
// @description  自动播放、自动切换下一节，并在页面结构异常时安全停止
// @author       Codex
// @match        *://mooc1.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

`
);

build(
    'v1_autoAnswer_optimized.js',
    'v1_autoAnswer_optimized.user.js',
    `// ==UserScript==
// @name         学习通刷课+自动答题 V1 Optimized
// @namespace    local.codex.xuexitong
// @version      1.0.0
// @description  自动刷课；章节测验可跳过或自动答题（skipChapterTest 优先于 autoAnswer）
// @author       Codex
// @match        *://mooc1.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

`
);
