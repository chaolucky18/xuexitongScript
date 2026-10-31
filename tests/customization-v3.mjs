import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Dependency-free safety smoke test. Real DOM navigation is in navigation-v3.mjs.
const source = readFileSync(new URL('../v3_optimized.js', import.meta.url), 'utf8');
let boot;
let title = '章节测验';
const context = {
    window: { jQuery: {} },
    document: {
        getElementsByClassName: () => [{ title }],
        querySelectorAll: () => [],
        querySelector: () => null,
    },
    $: () => ({ length: 1, off() { return this; }, on() { return this; } }),
    console: { log() {}, warn() {}, error() {}, info() {} },
    setInterval(fn) { boot = fn; return 1; },
    clearInterval() {},
    setTimeout() { assert.fail('Blocked content must not schedule navigation'); },
    clearTimeout() {},
};
// Reviewed runtime now uses durable browser storage and lifecycle listeners.
// Supply those browser capabilities rather than relying on an originless VM.
const storage = new Map();
Object.assign(context.window, { location:{href:'https://mooc1.chaoxing.com/?courseId=synthetic'},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000000'},addEventListener(){},removeEventListener(){} });
context.URL=URL;context.location=context.window.location;context.sessionStorage=context.window.sessionStorage;context.localStorage=context.window.localStorage;
vm.runInNewContext(source, context);
boot();
const app = context.window.app;
assert.ok(app);
assert.equal(app._state, 'BLOCKED');
assert.equal(app._isPlaying, false);
assert.equal(app._checkInterval, null);
assert.equal(app._isChapterTest(), true);
assert.equal(app.configs.playbackRate, 1);
app.configs.playbackRate = 1.25;
assert.equal(app.configs.playbackRate, 1);
title = '本章自测';
assert.equal(app._isChapterTest(), true);
app.nextUnit();
assert.equal(app._state, 'BLOCKED');
title = 'Unknown resource';
app._recovery.resumeExplicitly(); // An explicit test retry must respect terminal recovery semantics.
app.run();
assert.equal(app._state, 'BLOCKED'); // Discovery rejects unknown content.
await app.play();
assert.equal(app._state, 'PAUSED_AUTOMATION'); // Terminal guard refuses automatic reentry.
assert.equal(app._timers.size, 0);
console.log('PASS: fixed 1.0x configuration, assessment detection, and unknown-content safety (VM smoke).');
