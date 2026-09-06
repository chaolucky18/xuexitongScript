import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'v3_optimized.js'), 'utf8').replace(/^\uFEFF/, '');
const metadata = `// ==UserScript==
// @name         学习通自动刷课脚本 V3.4
// @namespace    local.codex.xuexitong
// @version      3.4.0
// @description  自动播放、自动切换下一节，并在页面结构异常时安全停止
// @author       Codex
// @match        *://mooc1.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

`;

writeFileSync(resolve(root, 'v3_optimized.user.js'), `${metadata}${source}`, 'utf8');
