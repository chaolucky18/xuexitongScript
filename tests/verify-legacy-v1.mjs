#!/usr/bin/env node
/**
 * F8 验证：V1 控制台脚本 repo/xuexitong.js 的入口点击加固
 * 对应 issue：#14 #15 #16 #17 #18
 *
 * 根因（与线上堆栈逐行对上）：
 *   repo/xuexitong.js 共 119 行（由 PR #13 引入），第 39 行
 *   `document.querySelector('li[title="视频"]').click();` 没有空值保护，
 *   第 119 行 `main();`。页面结构变化或目录/步骤标签未渲染完时抛
 *   `TypeError: Cannot read properties of null (reading 'click')`（main 39:45 / 119:1）并中断整个 V1。
 *
 * 运行：node tests/verify-legacy-v1.mjs   （在 repo/ 下执行）
 * 特性：只读检查——不修改任何文件，也不依赖 jsdom/网络。
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const v1Path = resolve(repoRoot, 'xuexitong.js');

const results = [];
const check = (name, ok, detail) => {
    results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
};

check('xuexitong.js 存在', existsSync(v1Path), v1Path);
const raw = existsSync(v1Path) ? readFileSync(v1Path, 'utf8') : '';
// 去注释后再做静态检查：避免把注释里引用的旧写法误判成缺陷
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// 1) 根因本身：不得再有未保护的 querySelector(...).click()
const unguarded = [...code.matchAll(/querySelector(?:All)?\s*\([^)]*\)\s*\.\s*click\s*\(/g)].map((m) => m[0]);
check('不存在未保护的 querySelector(...).click()（#16 #17 #18 的崩溃写法）', unguarded.length === 0, JSON.stringify(unguarded));

// 2) 多选择器兜底 + 空值保护
check('保留 li[title="视频"] 入口选择器', /li\[title="视频"\]/.test(code));
check('新增 button[title="播放视频"] 兜底（issue #18 评论给出的另一种写法）', /button\[title="播放视频"\]/.test(code));
check('存在 clickFirstAvailable 兜底函数', /function clickFirstAvailable\s*\(/.test(code));
check('命中元素前有空值/可调用性判断', /if \(el && typeof el\.click === "function"\)/.test(code));
check('入口点击被 if 保护（找不到也不会抛异常中断 V1）', /if \(!clickFirstAvailable\(/.test(code));

// 3) 找不到时的可操作提示
check('找不到入口时打印 console.warn 提示', /console\.warn\(/.test(code) && code.indexOf('已跳过本次点击') >= 0);
check('提示包含「处理方法」等可操作内容', code.indexOf('处理方法') >= 0);

// 4) V1 的其它逻辑保持原样（倍速、iframe 取视频、nextUnit）
check('V1 的 iframe 取视频逻辑仍在', code.indexOf('iframe.ans-insertvideo-online') >= 0);
check('V1 的 video#video_html5_api 仍在', code.indexOf('video#video_html5_api') >= 0);
check('V1 的 2 倍速设置仍在（未改动 V1 语义）', code.indexOf('v.playbackRate = 2') >= 0);
check('V1 的 nextUnit / watchVideo 仍在', code.indexOf('function nextUnit()') >= 0 && code.indexOf('function watchVideo(') >= 0);

// 5) 语法合法
let nodeCheckOk = true;
let nodeCheckDetail = '';
try {
    execFileSync(process.execPath, ['--check', v1Path], { stdio: 'pipe' });
} catch (error) {
    nodeCheckOk = false;
    nodeCheckDetail = String((error && error.message) || error);
}
check('node --check xuexitong.js 通过', nodeCheckOk, nodeCheckDetail);

const failed = results.filter((r) => !r.ok);
for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : (r.detail ? ' :: ' + r.detail : '')}`);
}
console.log('');
console.log(`F8 验证：${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
    process.exitCode = 1;
} else {
    console.log('V1（xuexitong.js）入口点击加固验证通过（只读检查，未修改任何文件）。');
}