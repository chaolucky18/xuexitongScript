import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : require('playwright');
const source = readFileSync(new URL('../v3_optimized.js', import.meta.url), 'utf8');
const jquery = readFileSync(process.env.JQUERY_PATH, 'utf8');
const fixture = readFileSync(new URL('../fixtures/synthetic/native-live-entry.html', import.meta.url), 'utf8');
const replay = readFileSync(new URL('../fixtures/synthetic/recorded-live-videojs.html', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
console.log(`ENV: Chrome ${browser.version()}; synthetic native handler/DOM; intercepted network; no authenticated platform.`);
let passed = 0;
const failures = [];
async function setup({ delay = false, mutation = null, allowPopup = false, application = false } = {}) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort());
    await context.route('https://mooc1.chaoxing.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
    await context.route('https://zhibo.chaoxing.com/**', route => route.fulfill({ contentType: 'text/html', body: replay }));
    const page = await context.newPage(); await page.goto('https://mooc1.chaoxing.com/synthetic-native');
    await page.addScriptTag({ content: jquery });
    await page.evaluate(({ mutation, allowPopup }) => {
        const doc = document.querySelector('iframe[info="card"]').contentDocument;
        doc.body.innerHTML = document.querySelector('template').innerHTML;
        document.querySelector('#aux-editor').contentDocument.body.innerHTML = '<a class="liveHref" href="javascript:void(0);"><div class="liveCard"><div class="live-ct">Auxiliary only</div></div></a><a id="openUrl" href="https://untrusted.test/aux" target="_blank"></a>';
        window.__calls = []; window.__next = 0; window.__pendingPlatformOpen = null;
        const $ = window.jQuery;
        // Deliberately a synthetic stub. The actual relation function is unknown.
        const setLiveANDCourseRelation = () => window.__calls.push('relation-stub');
        const href = 'https://zhibo.chaoxing.com/synthetic-native-replay';
        const open = () => {
            if (!doc.querySelector('#openUrl')) { const link = doc.createElement('a'); link.id = 'openUrl'; doc.body.append(link); }
            $('#openUrl', doc).attr('href', href); $('#openUrl', doc).attr('target', '_blank');
            $('#openUrl', doc)[0].click();
        };
        window.__platformHandler = function () {
            setLiveANDCourseRelation();
            if (mutation === 'async-create') window.__pendingPlatformOpen = open; else open();
        };
        $(doc.querySelector('a.liveHref')).on('click', window.__platformHandler);
        doc.addEventListener('click', event => {
            if (event.target.closest?.('#openUrl')) { window.__calls.push('native-anchor'); if (!allowPopup) event.preventDefault(); }
        });
        document.querySelector('#node1 span').onclick = () => window.__next++;
        if (mutation === 'async-create') doc.querySelector('#openUrl').remove();
        if (mutation === 'duplicate') doc.body.append(doc.querySelector('a.liveHref').cloneNode(true));
        if (mutation === 'wrong-card') doc.querySelector('.live-ct').remove();
        if (mutation === 'bad-url') doc.querySelector('#openUrl').href = 'https://untrusted.test/not-approved';
        if (mutation === 'duplicate-open') doc.body.append(doc.querySelector('#openUrl').cloneNode(true));
        if (mutation === 'wrong-frame') document.querySelector('iframe[info="card"]').id = 'other-frame';
        window.__timeouts = new Map(); window.__intervals = new Map(); let id = 0;
        window.setTimeout = (fn, delay) => { window.__timeouts.set(++id, { fn, delay }); return id; };
        window.clearTimeout = id => window.__timeouts.delete(id);
        window.setInterval = fn => { window.__intervals.set(++id, fn); return id; };
        window.clearInterval = id => window.__intervals.delete(id);
        window.__openCalls = 0; const openWindow = window.open.bind(window);
        window.open = (...args) => { window.__openCalls++; return openWindow(...args); };
    }, { mutation, allowPopup });
    if(application) await page.evaluate(() => {
        history.replaceState({},'','?courseId=synthetic&chapterId=node0');
        window.__gmStore=new Map();window.__gmListeners=new Map();let next=0;
        window.GM_getValue=(key,fallback)=>structuredClone(window.__gmStore.get(key)??fallback);
        window.GM_setValue=(key,value)=>{window.__gmStore.set(key,structuredClone(value));for(const [name,fn] of window.__gmListeners.values())if(name===key)fn();};
        window.GM_deleteValue=key=>window.__gmStore.delete(key);
        window.GM_addValueChangeListener=(key,fn)=>{window.__gmListeners.set(++next,[key,fn]);return next;};
        window.GM_removeValueChangeListener=id=>window.__gmListeners.delete(id);
        window.__closeCalls=0;window.close=()=>window.__closeCalls++;
    });
    await page.addScriptTag({ content: source });
    await page.evaluate(({delay,application}) => {
        const createParent = window.__xuexitongTaskSupport.createParent;
        window.__xuexitongTaskSupport.createParent = options => {
            const controller = createParent(options); if (options.nativeEntry) window.__lastNative = controller; return controller;
        };
        for (const fn of [...window.__intervals.values()]) fn();
        window.__defaultLive = app.settings.features.live;
        window.__initialState = app._state;
        const settings = structuredClone(app.settings); settings.features.live = true; settings.randomDelaysEnabled = delay;
        settings.delays.liveOpen = { enabled: delay, minMs: 500, maxMs: 500 }; app.updateSettings(settings);
        if(application){app.run();return;}
        // This historical suite specifies the manual-only fallback adapter.
        // Automatic native/GM opening is tested separately, not silently substituted.
        try { const entry=app._taskSet()?.tasks?.[0]?.element;
            app._liveController=window.__xuexitongTaskSupport.createParent({entry,nativeEntry:true,generation:app._generation,threshold:.99,isValid:()=>!app._destroyed,onResult:()=>{throw Error('manual fallback cannot complete');},onError:reason=>app._block(reason)});
            app._state='WAITING_LIVE';app._liveController.start();
        } catch (error) {
            // Only the documented refusal is an expected fixture outcome.
            // Surface implementation exceptions instead of hiding them as BLOCKED.
            if (error.message !== 'Unsupported native live entry') throw error;
            app._block('原生入口无法确认，保持人工处理');
        }
        // Missing-companion fallback is now bounded discovery, not an immediate
        // availability guess. Advance only its start/probe timers in this mock clock.
        for (let i=0;i<22;i++) for (const [id, item] of [...window.__timeouts]) {
            if (item.delay===250 || (item.delay===500 && app._actions.pending.has('live-open'))) {
                window.__timeouts.delete(id);item.fn();
            }
        }
    }, {delay,application});
    return { page, context };
}
async function check(name, options, fn) {
    let env;
    try { env = await setup(options); await fn(env); passed++; console.log(`PASS: ${name}`); }
    catch (error) { failures.push(name); console.error(`FAIL: ${name}\n${error.stack}`); }
    finally { await env?.context.close(); }
}
try {
    await check('application run opens native handler once and establishes pending GM session without credit', {application:true}, async ({page,context}) => {
        assert.equal(await page.evaluate(()=>app._state),'WAITING_LIVE');
        const first=await page.evaluate(()=>GM_getValue('xtx-v34-native-session-v1'));
        assert.equal(first.phase,'pending');assert.equal(first.seq,0);assert.equal(first.refreshUsed,false);
        assert.deepEqual(await page.evaluate(()=>[window.__calls,window.__next,window.__closeCalls,app._platformCompletion]),[['relation-stub','native-anchor'],0,0,null]);
        const status=page.locator('#xuexitong-v3-notice').locator('[role=status]');
        assert.match(await status.textContent(),/等待.*配对|等待.*子页/);
        await page.evaluate(()=>{app.run();app.play();app.nextUnit();});
        assert.equal(await page.evaluate(()=>GM_getValue('xtx-v34-native-session-v1').id),first.id);
        assert.deepEqual(await page.evaluate(()=>[window.__calls.length,window.__next,window.__closeCalls]),[2,0,0]);
        assert.equal(context.pages().length,1);
    });
    await check('built-in profile finds only the unique native card and leaves live disabled by default', {}, async ({ page }) => {
        assert.deepEqual(await page.evaluate(() => [window.__defaultLive, app._taskSet().tasks[0].element.ownerDocument === document.querySelector('#iframe').contentDocument, app._taskSet().tasks[0].nativeEntry]), [false, true, true]);
        assert.equal(await page.evaluate(() => window.__initialState), 'PAUSED_AUTOMATION');
        assert.equal(await page.evaluate(() => app._state), 'BLOCKED');
        assert.match(await page.evaluate(() => app._lastNotice), /手动|人工|核对/);
        assert.match(await page.locator('#xuexitong-v3-notice').locator('[role=status]').textContent(),/手动|人工|核对/);
        assert.match(await page.locator('#xuexitong-v3-settings').locator('[data-task-status]').textContent(),/不会自动推进|手动|人工/);
        assert.deepEqual(await page.evaluate(() => window.__calls), []);
    });
    await check('repeated discovery/run/events cannot invoke the original handler or open duplicate windows', {}, async ({ page, context }) => {
        await page.evaluate(() => { for (let i = 0; i < 5; i++) { app.run(); app.play(); app.nextUnit(); document.querySelector('#iframe').dispatchEvent(new Event('load')); } });
        assert.deepEqual(await page.evaluate(() => [window.__calls, window.__openCalls, window.__next]), [[], 0, 0]);
        assert.equal(context.pages().length, 1);
    });
    await check('manual fallback leaves the registered handler intact and executes its original sequence once', {}, async ({ page }) => {
        const result = await page.evaluate(() => {
            const entry = document.querySelector('#iframe').contentDocument.querySelector('a.liveHref');
            const registered = window.jQuery._data(entry, 'events').click[0].handler;
            const returned = entry.click();
            return [registered === window.__platformHandler, returned === undefined, window.__calls,
                window.__xuexitongTaskSupport.inspectPlatformEntry(entry), app._state];
        });
        assert.deepEqual(result, [true, true, ['relation-stub', 'native-anchor'], 'approved-origin-only', 'BLOCKED']);
    });
    await check('asynchronous #openUrl creation remains platform-owned; inspection never reruns the handler', { mutation: 'async-create' }, async ({ page }) => {
        assert.equal(await page.evaluate(() => window.__xuexitongTaskSupport.inspectPlatformEntry(app._taskSet().tasks[0].element)), 'unresolved');
        await page.evaluate(() => app._taskSet().tasks[0].element.click());
        assert.deepEqual(await page.evaluate(() => window.__calls), ['relation-stub']);
        await page.evaluate(() => window.__pendingPlatformOpen());
        assert.deepEqual(await page.evaluate(() => [window.__calls, window.__xuexitongTaskSupport.inspectPlatformEntry(app._taskSet().tasks[0].element), window.__next]), [['relation-stub', 'native-anchor'], 'approved-origin-only', 0]);
    });
    await check('inspection follows replacement/dynamic destinations without changing links or business listeners', {}, async ({ page }) => {
        const result = await page.evaluate(() => {
            const entry = app._taskSet().tasks[0].element, doc = entry.ownerDocument;
            const replacement = doc.createElement('a'); replacement.id = 'openUrl'; replacement.target = '_blank';
            replacement.href = 'https://zhibo.chaoxing.com/synthetic-replacement'; doc.querySelector('#openUrl').replaceWith(replacement);
            const before = doc.body.innerHTML;
            const trusted = window.__xuexitongTaskSupport.inspectPlatformEntry(entry);
            const unchanged = before === doc.body.innerHTML;
            replacement.href = 'https://untrusted.test/synthetic-replacement';
            return [trusted, unchanged, window.__xuexitongTaskSupport.inspectPlatformEntry(entry), window.__calls, app._state];
        });
        assert.deepEqual(result, ['approved-origin-only', true, 'unresolved', [], 'BLOCKED']);
    });
    for (const mutation of ['duplicate', 'wrong-card', 'bad-url', 'duplicate-open']) {
        await check(`ambiguous/unsupported native entry stops: ${mutation}`, { mutation }, async ({ page }) => {
            assert.equal(await page.evaluate(() => app._state), 'BLOCKED');
            assert.deepEqual(await page.evaluate(() => window.__calls), []);
        });
    }
    await check('the exact evidenced content-frame identity is required', { mutation: 'wrong-frame' }, async ({ page }) => {
        assert.equal(await page.evaluate(() => app._taskSet()), null);
        assert.deepEqual(await page.evaluate(() => window.__calls), []);
    });
    for (const cancel of ['destroy', 'pagehide', 'manual-click', 'replace-entry', 'change-task', 'settings', 'bad-destination']) {
        await check(`disposed native handoff stays inert after ${cancel}; bounded discovery expired safely`, { delay: true }, async ({ page }) => {
            assert.equal(await page.evaluate(() => app._state), 'BLOCKED');
            assert.equal(await page.evaluate(() => app._actions.pending.size), 0);
            await page.evaluate(cancel => {
                const stale = [...window.__timeouts.values()].map(value => value.fn); stale.push(window.__lastNative.start);
                if (cancel === 'destroy') app.destroy();
                if (cancel === 'pagehide') window.dispatchEvent(new Event('pagehide'));
                if (cancel === 'manual-click') document.body.click();
                if (cancel === 'replace-entry') { const entry = app._taskSet().tasks[0].element; entry.replaceWith(entry.cloneNode(true)); }
                if (cancel === 'change-task') { document.querySelector('#node0').classList.remove('posCatalog_active'); document.querySelector('#node1').classList.add('posCatalog_active'); }
                if (cancel === 'settings') { const settings = structuredClone(app.settings); settings.features.live = false; app.updateSettings(settings); }
                if (cancel === 'bad-destination') document.querySelector('#iframe').contentDocument.querySelector('#openUrl').href = 'https://untrusted.test/not-approved';
                for (const callback of stale) callback();
            }, cancel);
            assert.deepEqual(await page.evaluate(() => [window.__calls, window.__openCalls, window.__next]), [[], 0, 0]);
            assert.notEqual(await page.evaluate(() => app._state), 'ADVANCING');
        });
    }
    await check('native _blank popup has no opener in tested Chrome; no ownership or course credit is inferred', { allowPopup: true }, async ({ page, context }) => {
        const popup = context.waitForEvent('page');
        const returned = await page.evaluate(() => app._taskSet().tasks[0].element.click() === undefined);
        const child = await popup; await child.waitForLoadState('domcontentloaded');
        await child.addScriptTag({ content: source });
        assert.equal(returned, true);
        assert.equal(await child.evaluate(() => !!window.opener), false);
        assert.equal(await child.evaluate(() => !!window.__xuexitongLiveChild?.active), false);
        await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://zhibo.chaoxing.com', source: window,
            data: { protocol: 'xuexitong-live-v1', type: 'LIVE_COMPLETED', ended: true } })));
        assert.deepEqual(await page.evaluate(() => [app._state, window.__next, document.querySelector('#node0 input').value]), ['BLOCKED', 0, '1']);
    });
    await check('noopener/noreferrer remain unchanged and mean manual handling only', {}, async ({ page }) => {
        const result = await page.evaluate(() => {
            const entry = app._taskSet().tasks[0].element, link = entry.ownerDocument.querySelector('#openUrl');
            link.href = 'https://zhibo.chaoxing.com/synthetic-native-replay'; link.target = '_blank'; link.rel = 'noopener noreferrer';
            return [window.__xuexitongTaskSupport.inspectPlatformEntry(entry), link.rel];
        });
        assert.deepEqual(result, ['manual-policy', 'noopener noreferrer']);
    });
} finally { await browser.close(); }
console.log(`RESULT: ${passed} passed; ${failures.length} failed. Synthetic native entry/manual fallback and mocked-GM application evidence only.`);
if (failures.length) process.exitCode = 1;
