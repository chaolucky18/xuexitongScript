import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../v3_optimized.js', import.meta.url), 'utf8');

function createPage(initiallyLoaded = false) {
    let loaded = initiallyLoaded;
    let playCalls = 0;
    let pauseCalls = 0;
    let pendingPlay = null;
    let nextId = 0;
    const timers = new Map();
    const listeners = new Map();
    const video = {
        paused: true, ended: false, currentTime: 0, playbackRate: 1,
        play() { playCalls++; this.paused = false; return pendingPlay || Promise.resolve(); },
        pause() { pauseCalls++; this.paused = true; },
        addEventListener(name, handler) { listeners.set(name, handler); },
        removeEventListener(name) { listeners.delete(name); },
    };
    const frameDocument = {};
    const frame = { contentDocument: frameDocument };
    const tree = {};
    const pageEvents = new Map();
    const documentEvents = new Map();
    const eventTarget = events => ({ addEventListener(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); }, removeEventListener(name, fn) { events.get(name)?.delete(fn); } });
    const document = { ...eventTarget(documentEvents), getElementsByClassName: () => [] };
    class Collection {
        constructor(items = []) { this.items = items; this.length = items.length; }
        children() { return new Collection(); }
        find(selector) {
            return new Collection(this.items.includes(frameDocument) && selector.startsWith('video#') && loaded ? [video] : []);
        }
        each(fn) { this.items.forEach((value, index) => fn(index, value)); return this; }
        filter(fn) { return new Collection(this.items.filter((value, index) => fn(index, value))); }
        get(index) { return this.items[index]; }
        toArray() { return this.items; }
        off() { navigationHandler = null; return this; }
        on(name, selector, handler) { navigationHandler = handler; return this; }
        text() { return this.items[0]?.textContent || ""; }
    }
    let navigationHandler = null;
    const $ = value => new Collection(value === '#coursetree' ? [tree] : value === 'iframe' ? [frame] : typeof value === 'object' ? [value] : []);
    const schedule = (fn, ms, interval) => { const id = ++nextId; timers.set(id, { fn, ms, interval }); return id; };
    const window = { jQuery: $, ...eventTarget(pageEvents) };
    const context = {
        window, document, $, console: { log() {}, warn() {}, error() {} },
        setTimeout: (fn, ms) => schedule(fn, ms, false),
        setInterval: (fn, ms) => schedule(fn, ms, true),
        clearInterval: id => timers.delete(id), clearTimeout: id => timers.delete(id),
    };
    vm.runInNewContext(source, context);
    async function runTimer(ms) {
        const entry = [...timers].find(([, timer]) => timer.ms === ms);
        assert.ok(entry, `Expected pending ${ms}ms timer`);
        const [id, timer] = entry;
        if (!timer.interval) timers.delete(id);
        timer.fn();
        await new Promise(resolve => setImmediate(resolve));
    }
    return { window, video, timers, listeners, pageEvents, documentEvents, runTimer,
        load: () => { loaded = true; },
        resumePlay: () => { pendingPlay = null; },
        deferPlay() { let resolve, reject; pendingPlay = new Promise((yes, no) => { resolve = yes; reject = no; }); return { resolve, reject }; },
        clickVideoTab() { assert.ok(navigationHandler, 'Navigation handler must be bound'); navigationHandler({currentTarget:{textContent:'2视频'}}); },
        get playCalls() { return playCalls; }, get pauseCalls() { return pauseCalls; },
        get navigationBound() { return Boolean(navigationHandler); },
        async flushTimeouts() { for (const [id, timer] of [...timers]) if (!timer.interval) { timers.delete(id); timer.fn(); } await new Promise(resolve => setImmediate(resolve)); },
    };
}

// A real course can render the directory before the nested video iframe.
{
    const page = createPage();
    await page.runTimer(1000);
    assert.equal(page.playCalls, 0);
    page.load();
    await page.runTimer(2000);
    assert.equal(page.playCalls, 1, 'Late-loading video must start without another manual run');
    console.log('PASS: late video starts after retry');
}

// Unknown/unsupported sections must stop after bounded retries, without skipping.
{
    const page = createPage();
    await page.runTimer(1000);
    let advances = 0;
    page.window.app.nextUnit = () => { advances++; };
    for (let i = 0; i < 10; i++) await page.runTimer(2000);
    assert.equal(page.timers.size, 0);
    assert.equal(advances, 0);
    assert.equal(page.playCalls, 0);
    console.log('PASS: missing video stops without skipping');
}

// Use the ordinary playback speed on courses that forbid speed changes.
{
    const page = createPage(true);
    await page.runTimer(1000);
    assert.equal(page.video.playbackRate, page.window.app.configs.playbackRate);
    let advances = 0;
    page.window.app.nextUnit = () => { advances++; };
    page.video.ended = true;
    page.listeners.get('ended')();
    await page.runTimer(1000);
    assert.equal(advances, 1);
    console.log('PASS: video end schedules next section');
}

// Stopping during iframe loading cancels retries and does not resume later.
{
    const page = createPage();
    await page.runTimer(1000);
    page.window.app.destroy(); page.load();
    await page.flushTimeouts();
    assert.equal(page.playCalls, 0);
    assert.equal(page.timers.size, 0);
    console.log('PASS: destroy cancels pending startup retries');
}

// Stop must cancel a queued next-section transition, including after restart.
{
    const page = createPage(true);
    await page.runTimer(1000);
    let advances = 0;
    page.window.app.nextUnit = () => { advances++; };
    page.listeners.get('ended')();
    page.window.app.destroy(); page.window.app.run();
    await page.flushTimeouts();
    assert.equal(advances, 0);
    assert.equal(page.playCalls, 2);
    assert.equal([...page.timers.values()].filter(t => t.interval).length, 1);
    console.log('PASS: stop and restart cannot run stale navigation');
}

// Late play promises cannot recreate monitoring after stop.
for (const rejected of [false, true]) {
    const page = createPage(true);
    const pending = page.deferPlay();
    await page.runTimer(1000);
    page.window.app.destroy();
    if (rejected) pending.reject(new Error('Interrupted')); else pending.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.timers.size, 0);
    assert.equal(page.playCalls, 1);
    assert.equal(page.listeners.size, 0);
    assert.ok(page.video.paused);
}
console.log('PASS: late play success and rejection stay stopped');

// Restart restores step navigation and page guards exactly once.
{
    const page = createPage(true);
    await page.runTimer(1000);
    page.window.app.destroy();
    assert.equal(page.navigationBound, false);
    assert.ok([...page.pageEvents.values(), ...page.documentEvents.values()].every(set => set.size === 0));
    page.window.app.run(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.navigationBound, true);
    assert.ok([...page.pageEvents.values(), ...page.documentEvents.values()].every(set => set.size === 1));
    page.clickVideoTab();
    page.window.app.destroy(); await page.flushTimeouts();
    assert.equal(page.playCalls, 2);
    assert.ok(page.video.paused, 'Stop must pause the attached video even when tab reentry cleared the cache');
    console.log('PASS: restart restores one set of listeners and stop cancels tab reentry');
}

// A response from before restart must not affect the new run.
{
    const page = createPage(true);
    const pending = page.deferPlay();
    await page.runTimer(1000);
    page.window.app.destroy(); page.resumePlay(); page.window.app.run();
    await new Promise(resolve => setImmediate(resolve));
    pending.reject(new Error('Old play request interrupted'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.playCalls, 2);
    assert.equal([...page.timers.values()].filter(t => t.interval).length, 1);
    assert.equal([...page.timers.values()].filter(t => !t.interval).length, 0);
    console.log('PASS: an old play rejection cannot trigger retries in a new run');
}

// A new run gets a fresh loading budget after the old run exhausted it.
{
    const page = createPage();
    await page.runTimer(1000);
    for (let i = 0; i < 10; i++) await page.runTimer(2000);
    page.window.app.run();
    assert.equal(page.playCalls, 0);
    page.load(); await page.runTimer(2000);
    assert.equal(page.playCalls, 1);
    console.log('PASS: restarting resets the iframe loading retry budget');
}
