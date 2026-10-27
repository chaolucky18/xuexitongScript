#!/usr/bin/env node
/**
 * 豆包桌面版 POC 命令行
 *
 *   node ask.mjs --status                 看有没有连上、是否已登录
 *   node ask.mjs --selftest               只往输入框写一段自检文字再清掉（不发送）
 *   node ask.mjs "你的问题"                发送并打印回答
 *   node ask.mjs --json "你的问题"         输出 JSON
 *   node ask.mjs --debug "你的问题"        额外打印抓取到的节点信息
 */
import { connect, cleanAnswer } from './lib/doubao.mjs';
import { readFile } from 'node:fs/promises';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = [];
let promptFile = null;
let timeoutSeconds = null;
for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--prompt-file') { promptFile = argv[++i]; continue; }
    if (arg === '--timeout') { timeoutSeconds = Number(argv[++i]); continue; }
    if (arg.startsWith('--')) continue;
    positional.push(arg);
}
const question = promptFile
    ? (await readFile(promptFile, 'utf8')).trim()
    : positional.join(' ').trim();

const port = Number(process.env.DOUBAO_DEBUG_PORT || 9333);
const wantJson = flags.has('--json');
const debug = flags.has('--debug');
const noNewChat = flags.has('--no-new-chat');
const timeoutMs = timeoutSeconds ? timeoutSeconds * 1000 : 120000;

function fail(message) {
    if (wantJson) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    else console.error(`[失败] ${message}`);
    process.exitCode = 1;
}

let client;
try {
    client = await connect({ port });

    if (flags.has('--status')) {
        const status = await client.status();
        console.log(JSON.stringify({ ok: true, port, target: client.target.url, ...status }, null, 2));
        client.close();
        process.exit(0);
    }

    if (flags.has('--selftest')) {
        await client.focusEditor();
        await client.clearEditor();
        await client.send('Input.insertText', { text: 'POC 自检：这段文字不会发送' });
        const typed = await client.editorText();
        await client.clearEditor();
        const after = await client.editorText();
        const ok = String(typed).includes('POC 自检') && String(after).trim() === '';
        console.log(JSON.stringify({ ok, typed, afterClear: after }, null, 2));
        client.close();
        process.exit(ok ? 0 : 1);
    }

    if (flags.has('--dump')) {
        const status = await client.status();
        const snapshot = await client.snapshotAnswer();
        const bodyTail = await client.eval(`(document.body.innerText || '').slice(-600)`);
        console.log(JSON.stringify({ ok: true, status, snapshot, bodyTail }, null, 2));
        client.close();
        process.exit(0);
    }

    if (!question) {
        console.log('用法：node ask.mjs "问题"   或   node ask.mjs --status / --selftest / --dump');
        client.close();
        process.exit(0);
    }

    const startedAt = Date.now();
    const result = await client.ask(question, { newChat: !noNewChat, timeoutMs });
    const payload = {
        ok: true,
        question,
        answer: result.text,
        elapsedMs: result.elapsedMs,
        truncated: Boolean(result.truncated),
    };
    if (wantJson) {
        console.log(JSON.stringify(payload, null, 2));
    } else {
        console.log(`—— 回答（${(result.elapsedMs / 1000).toFixed(1)}s${result.truncated ? '，可能被截断' : ''}）——`);
        console.log(result.text);
    }
    if (debug) {
        console.log('\n[debug] 抓取节点：', JSON.stringify(result.debug));
    }
    console.log(`[总耗时] ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    client.close();
} catch (error) {
    client?.close();
    fail(error.message);
    if (/连不上豆包调试端口/.test(error.message)) {
        console.error('提示：先双击 desktop-doubao\\启动豆包自动化实例.cmd，并在这个窗口里登录一次。');
    }
}
