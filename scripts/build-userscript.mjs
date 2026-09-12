import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 单一源码约定：repo/v3_optimized.js 是唯一实现，本脚本只负责拼接油猴元数据块。
const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'v3_optimized.js'), 'utf8').replace(/^\uFEFF/, '');
const metadata = `// ==UserScript==
// @name         学习通自动刷课脚本 V3.4 稳定版
// @namespace    local.codex.xuexitong
// @version      3.4.0
// @description  自动播放、自动切换下一小节；修复导航死锁、小节内多视频、无视频节点卡死、异常暂停风控、互动题弹窗与视频元素发现（详见 README 与 docs/CHANGELOG-v3.4.md）
// @author       Codex
// @match        *://mooc1.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

`;

writeFileSync(resolve(root, 'v3_optimized.user.js'), `${metadata}${source}`, 'utf8');
console.log('generated v3_optimized.user.js from v3_optimized.js');