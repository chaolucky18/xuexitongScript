const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.resolve(__dirname, '..', 'xuexitong-deepseek-1.8.4.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function between(startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0, `missing ${startMarker}`);
    assert.ok(end > start, `missing ${endMarker}`);
    return source.slice(start, end);
}

async function testDecisionClassifier() {
    const functionSource = between('async function classifyNavigationWithDeepSeek', 'function validateAnswers');
    let apiKey = 'sk-test-value-that-is-not-real';
    const responses = [
        { action: 'reload_current', reason: '目录已切换但内容为空' },
        { action: 'wait', reason: '页面仍在加载' },
        { action: 'run_arbitrary_command', reason: 'invalid' },
    ];
    const context = {
        DEEPSEEK_API_URL: 'https://api.deepseek.com/chat/completions',
        AbortSignal,
        getStoredApiKey: () => apiKey,
        clean: (value) => String(value || '').replace(/\s+/g, ' ').trim(),
        fetch: async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                choices: [{
                    finish_reason: 'stop',
                    message: { content: JSON.stringify(responses.shift()) },
                }],
            }),
        }),
    };
    vm.runInNewContext(`${functionSource}; globalThis.classify = classifyNavigationWithDeepSeek;`, context);
    assert.deepEqual(
        JSON.parse(JSON.stringify(await context.classify({ contentFrame: false }))),
        { action: 'reload_current', reason: '目录已切换但内容为空' },
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(await context.classify({ contentFrame: false }))),
        { action: 'wait', reason: '页面仍在加载' },
    );
    await assert.rejects(() => context.classify({ contentFrame: false }), /未知动作/);
    apiKey = '';
    await assert.rejects(() => context.classify({ contentFrame: true }), /未配置 DeepSeek API/);
}

function testNearEndStateMachine() {
    const methodSource = between('_isNearVideoEnd(video) {', '_finishCurrentVideo(reason) {')
        .replace(/,\s*$/, '');
    const context = {};
    vm.runInNewContext(`globalThis.state = { configs: { nearEndThresholdSeconds: 0.6 }, ${methodSource} };`, context);
    const state = context.state;
    assert.equal(state._isNearVideoEnd({ duration: 100, currentTime: 99.5, paused: true }), true);
    assert.equal(state._isNearVideoEnd({ duration: 100, currentTime: 99.5, paused: false }), false);
    assert.equal(state._isNearVideoEnd({ duration: 100, currentTime: 97, paused: true }), false);
    for (let i = 0; i < 500; i++) {
        const duration = 10 + (i % 500);
        const currentTime = (i * 37) % duration;
        const paused = i % 2 === 0;
        const expected = currentTime >= duration - 0.6 && paused;
        assert.equal(state._isNearVideoEnd({ duration, currentTime, paused }), expected);
    }
}

function testDisabledControl() {
    const functionSource = between('function isDisabledControl(el) {', 'function findQuizTab() {')
        .replace(/,\s*$/, '');
    const context = {};
    vm.runInNewContext(`${functionSource}; globalThis.check = isDisabledControl;`, context);
    assert.equal(context.check({ disabled: true, className: '' }), true);
    assert.equal(context.check({ disabled: false, className: '', getAttribute: () => 'true' }), true);
    assert.equal(context.check({ disabled: false, className: 'button-disabled' }), true);
    assert.equal(context.check({ disabled: false, className: 'button' }), false);
    for (let i = 0; i < 200; i++) {
        assert.equal(context.check({
            disabled: i % 4 === 0,
            className: i % 7 === 0 ? 'is-disabled-control' : 'button',
            getAttribute: () => i % 9 === 0 ? 'true' : null,
        }), i % 4 === 0 || i % 7 === 0 || i % 9 === 0);
    }
}

function testStaticGuards() {
    assert.match(source, /@version\s+1\.8\.4/);
    assert.doesNotMatch(source, /playbackRate/);
    assert.doesNotMatch(source, /sk-[A-Za-z0-9_-]{20,}/);
    assert.match(source, /attempt < 30/);
    assert.match(source, /attempt % 10 === 0/);
    assert.match(source, /waitedSeconds >= 15/);
    assert.match(source, /目录已切换但内容尚未加载/);
    assert.match(source, /_reloadActiveCatalogNode/);
    assert.match(source, /_aiRecoveryKeys/);
    assert.match(source, /advance_catalog.*snapshot\.contentFrame/s);
    assert.match(source, /ChapterTest/);
    assert.match(source, /function findNextControls/);
    assert.match(source, /clickNextControl/);
    assert.match(source, /提交后等待 15 秒/);
    assert.match(source, /_looksLikePassiveContentPage/);
    assert.match(source, /pageText/);
    assert.match(source, /已跳过.*完成节点/);
    assert.match(source, /function allSearchRoots/);
    assert.match(source, /特殊信息页，点击 Next/);
    assert.match(source, /installChaoxingFrameBridge/);
    assert.match(source, /requestFrameNext/);
    assert.match(source, /FRAME_DIAGNOSTIC_STORAGE/);
    assert.match(source, /contentOnlyPage/);
}

(async () => {
    await testDecisionClassifier();
    testNearEndStateMachine();
    testDisabledControl();
    testStaticGuards();
    console.log('PASS: navigation decision parser');
    console.log('PASS: near-end delayed completion states');
    console.log('PASS: disabled next-button detection');
    console.log('PASS: retry, false-navigation, API guard, language, speed and key checks');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
