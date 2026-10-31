import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const core = readFileSync(new URL('../v3_optimized.js', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../xuexitong-live-bridge.user.js', import.meta.url), 'utf8');
const jquery = readFileSync(process.env.JQUERY_PATH, 'utf8');
const course = 'https://mooc1.chaoxing.com', replay = 'https://zhibo.chaoxing.com';
const protocol = 'xuexitong-live-bridge-v1';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
let passed = 0;
const failures = [];
// Locally generated short WAV: real browser media events, no authenticated resource.
const wav = Buffer.alloc(44 + 8000); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(8000, 40); wav.fill(128, 44);
async function check(label, action) {
    if (process.env.TEST_FILTER && !new RegExp(process.env.TEST_FILTER).test(label)) return;
    try { await action(); passed++; console.log(`PASS ${label}`); }
    catch (error) { failures.push(label); console.error(`FAIL ${label}: ${error.stack}`); }
}
async function setup({ natural = false, wrongFlags = false, wrongHref = false, nextLesson = false,
    coreFirst = false, companionDelay = 0, missingCompanion = false, discoveryCleanup = null } = {}) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort());
    await context.route(`${course}/**`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div class="prev_title" title="直播"></div><div id="coursetree"><ul><li><ul><li><div id="synthetic-leaf" class="posCatalog_select posCatalog_active"><span class="posCatalog_name">Synthetic replay</span><input class="jobUnfinishCount" value="1"></div></li></ul></li></ul></div><iframe id="iframe" info="card"></iframe>' }));
    await context.route(`${replay}/**`, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>直播</title><script>var liveStatus=${wrongFlags ? 1 : 4}; var lookback=1;</script><div id="video" class="video-js"><video id="video_html5_api" class="vjs-tech" ${natural ? `src="data:audio/wav;base64,${wav.toString('base64')}"` : ''}></video></div>` }));
    const pages = [], values = new Map();
    const publish = async (sender, key, value) => {
        const old = values.get(key); if (value === undefined) values.delete(key); else values.set(key, value);
        for (const page of pages) if (!page.isClosed()) await page.evaluate(({ key, value, old, remote }) => {
            if (!window.__gm) return;
            if (value === undefined) delete window.__gm.values[key]; else window.__gm.values[key] = value;
            for (const item of [...window.__gm.listeners.values()]) if (item.key === key) item.callback(key, old, value, remote);
        }, { key, value, old, remote: page !== sender });
    };
    async function prepare(url) {
        const page = await context.newPage(); pages.push(page);
        await page.exposeBinding('__publishGM', (_source, key, value) => publish(page, key, value));
        await page.addInitScript(() => {
            // Test-only inspection of closed shadow roots; production uses a closed root.
            window.__roots = []; const attach = Element.prototype.attachShadow;
            Element.prototype.attachShadow = function (options) { const root = attach.call(this, options); window.__roots.push(root); return root; };
            window.__gm = { values: {}, listeners: new Map(), next: 0 };
            window.__bridgePublic = [];
            window.addEventListener('message', event => { if (event.data?.protocol === 'xuexitong-live-bridge-v1') window.__bridgePublic.push(event.data); });
            window.GM_getValue = (key, fallback) => window.__gm.values[key] ?? fallback;
            window.GM_setValue = (key, value) => { window.__gm.values[key] = value; void window.__publishGM(key, value); };
            window.GM_deleteValue = key => { delete window.__gm.values[key]; void window.__publishGM(key); };
            window.GM_addValueChangeListener = (key, callback) => { const id = ++window.__gm.next; window.__gm.listeners.set(id, { key, callback }); return id; };
            window.GM_removeValueChangeListener = id => window.__gm.listeners.delete(id);
        });
        await page.goto(url);
        await page.evaluate(entries => { window.__gm.values = Object.fromEntries(entries); }, [...values]);
        return page;
    }
    const parent = await prepare(`${course}/mycourse/studentstudy-synthetic`);
    await parent.evaluate(({ replay, nextLesson }) => {
        const doc = document.querySelector('iframe').contentDocument;
        doc.body.innerHTML = `<a class="liveHref" href="javascript:void(0);"><div class="liveCard"><div class="live-ct">Synthetic native entry</div></div></a><a id="openUrl" target="_blank" href="${replay}/synthetic-replay">Synthetic native destination</a>`;
        window.__nativeCalls = 0; doc.querySelector('a.liveHref').addEventListener('click', () => window.__nativeCalls++);
        window.__nextCalls = 0;
        if (nextLesson) {
            const leaf=document.createElement('li'); leaf.innerHTML='<div id="synthetic-next" class="posCatalog_select"><span class="posCatalog_name">Synthetic next lesson</span></div>';
            leaf.querySelector('span').onclick=()=>window.__nextCalls++;document.querySelector('#coursetree ul li ul').append(leaf);
        }
        localStorage.setItem('xuexitong.v3.action-settings.v1', JSON.stringify({ version:1,preset:'custom',collapsed:true,randomDelaysEnabled:false,
            features:Object.fromEntries(['videoPlayback','nextVideo','nextLesson','nextChapter','assessment','document','live','background'].map(key=>[key,true])),
            delays:Object.fromEntries(['videoStart','nextVideo','documentScroll','nextDocument','nextLesson','nextChapter','assessment','liveOpen','liveReturn'].map(key=>[key,{enabled:false,minMs:0,maxMs:0}])) }));
    }, { replay, nextLesson });
    await parent.addScriptTag({ content: jquery });
    if (!coreFirst && !missingCompanion) await parent.addScriptTag({ content: bridge });
    await parent.addScriptTag({ content: core });
    await parent.waitForFunction(() => ['WAITING_LIVE','BLOCKED','WAITING_MANUAL_TASKS','PAUSED_AUTOMATION'].includes(window.app?._state));
    assert.equal(await parent.evaluate(()=>app._state),'WAITING_LIVE','bridge fixture must reach the original WAITING_LIVE prerequisite');
    // Native replay now uses its separately reviewed GM lifecycle. Exercise the
    // optional companion adapter explicitly instead of assuming it is auto-selected.
    await parent.evaluate(()=>{
        window.__startOptionalBridge=()=>{
        const entry=document.querySelector('iframe').contentDocument.querySelector('a.liveHref'),generation=app._generation;
        app._liveController=window.__xuexitongTaskSupport.createParent({entry,nativeEntry:true,generation,threshold:.99,
            isValid:()=>app._state==='WAITING_LIVE'&&app._generation===generation&&entry.isConnected,
            isPlatformComplete:()=>app._priorProof(document.querySelector('.posCatalog_active')),
            onResult:()=>{throw Error('unauthenticated companion must not authorize continuation');},onError:reason=>app._block(reason)});
        app._liveController.start();
        };window.__startOptionalBridge();
    });
    await parent.waitForFunction(() => window.__bridgePublic.some(message => message.type === 'PING'));
    if (discoveryCleanup) await parent.evaluate(kind => {
        if (kind === 'destroy') app.destroy();
        if (kind === 'pagehide') window.dispatchEvent(new Event('pagehide'));
        if (kind === 'dispose') window.__xuexitongTaskSupport.dispose();
        if (kind === 'settings') { const settings=structuredClone(app.settings);settings.features.live=false;app.updateSettings(settings); }
        if (kind === 'task') { document.querySelector('.posCatalog_active').id='different-synthetic-task'; }
        if (kind === 'restart') { app.run(); window.__startOptionalBridge(); }
    }, discoveryCleanup);
    if (companionDelay) await parent.waitForTimeout(companionDelay);
    if (coreFirst && !missingCompanion) await parent.addScriptTag({ content: bridge });
    if (missingCompanion) await parent.waitForFunction(() => app._state === 'BLOCKED',null,{timeout:8000});
    else if (!discoveryCleanup) await parent.waitForFunction(() => window.__roots.some(root => root.querySelector('button')?.textContent.includes('原生打开')));
    const child = await prepare(`${replay}/${wrongHref ? 'other-replay' : 'synthetic-replay'}`);
    if (!natural) await child.evaluate(() => {
        const player = document.querySelector('video'); window.__plays=0; window.__ended=false; window.__paused=true;
        Object.defineProperties(player, { ended:{get:()=>window.__ended},paused:{get:()=>window.__paused},duration:{get:()=>100} });
        player.play=()=>{window.__plays++;window.__paused=false;return Promise.resolve();};
    });
    await child.addScriptTag({ content: bridge });
    const ui = async (page, selector, text) => {
        const box = await page.evaluate(selector => {
            const target = [...window.__roots].reverse().find(root => root.querySelector(selector))?.querySelector(selector);
            if (!target) throw new Error('UI element missing'); const r=target.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};
        },selector);
        await page.mouse.click(box.x, box.y);
        if (text !== undefined) await page.keyboard.type(text);
    };
    const meta = () => [...values.entries()].find(([key]) => key.endsWith('.meta'))?.[1];
    const packet = side => [...values.entries()].find(([key]) => key.endsWith(`.${side}`))?.[1];
    const pair = async () => {
        await parent.frameLocator('iframe').locator('a.liveHref').click(); await ui(parent,'button');
        await parent.waitForFunction(() => Object.keys(window.__gm.values).some(key=>key.endsWith('.meta')));
        const id=meta().id; await child.evaluate(entries=>{window.__gm.values=Object.fromEntries(entries);},[...values]);
        await ui(child,'input',id); await ui(child,'button');
    };
    const confirmMarker = () => parent.evaluate(()=>{const node=document.querySelector('.posCatalog_active');node.querySelector('input').value='0';node.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');app._liveController.tick();});
    return { context,parent,child,values,publish,ui,pair,meta,packet,confirmMarker,close:()=>context.close() };
}
async function using(options, fn) { const env=await setup(options); try { await fn(env); } finally { await env.close(); } }
try {
    for (const options of [{}, {coreFirst:true}, {coreFirst:true,companionDelay:1250}]) await check(`bridge discovery injection order ${JSON.stringify(options)}`,()=>using(options,async e=>{
        assert.equal(await e.parent.evaluate(()=>window.__bridgePublic.filter(m=>m.type==='PREPARE').length),1);
        await e.pair();await e.child.waitForFunction(()=>window.__plays===1);
        assert.equal(await e.parent.evaluate(()=>app._state),'WAITING_LIVE');
        assert.equal([...e.values.keys()].filter(key=>key.endsWith('.meta')).length,1);
    }));
    await check('bridge discovery missing companion has a finite deadline and ignores late installation',()=>using({missingCompanion:true},async e=>{
        const pings=await e.parent.evaluate(()=>window.__bridgePublic.filter(m=>m.type==='PING').length);
        assert.ok(pings>0 && pings<=20);
        await e.parent.addScriptTag({content:bridge});
        await e.parent.evaluate(protocol=>{const ping=window.__bridgePublic.find(m=>m.type==='PING');window.postMessage({...ping,protocol,type:'AVAILABLE',timestamp:Date.now()},location.origin);},protocol);
        await e.parent.waitForTimeout(600);
        assert.deepEqual(await e.parent.evaluate(()=>[app._state,window.__bridgePublic.filter(m=>m.type==='PING').length,window.__bridgePublic.filter(m=>m.type==='PREPARE').length]),['BLOCKED',pings,0]);
        assert.equal(e.values.size,0);
    }));
    for (const kind of ['destroy','pagehide','dispose','settings','task']) await check(`bridge discovery cleanup ${kind} rejects stale availability and never prepares`,()=>using({coreFirst:true,discoveryCleanup:kind,companionDelay:400},async e=>{
        const pings=await e.parent.evaluate(()=>window.__bridgePublic.filter(m=>m.type==='PING').length);
        await e.parent.evaluate(protocol=>{const ping=window.__bridgePublic.find(m=>m.type==='PING');window.postMessage({...ping,protocol,type:'AVAILABLE',timestamp:Date.now()},location.origin);},protocol);
        await e.parent.waitForTimeout(400);
        assert.deepEqual(await e.parent.evaluate(()=>[window.__bridgePublic.filter(m=>m.type==='PREPARE').length,window.__bridgePublic.filter(m=>m.type==='PING').length]),[0,pings]);
        assert.equal(e.values.size,0);
    }));
    await check('bridge duplicate AVAILABLE responses never prepare twice or replace the session',()=>using({},async e=>{
        await e.parent.evaluate(protocol=>{const ping=window.__bridgePublic.find(m=>m.type==='PING');for(let i=0;i<5;i++)window.postMessage({...ping,protocol,type:'AVAILABLE',timestamp:Date.now()},location.origin);},protocol);
        await e.pair();await e.child.waitForFunction(()=>window.__plays===1);
        assert.equal(await e.parent.evaluate(()=>window.__bridgePublic.filter(m=>m.type==='PREPARE').length),1);
        assert.equal([...e.values.keys()].filter(key=>key.endsWith('.meta')).length,1);
    }));
    await check('bridge replacement generation rejects prior discovery responses and prepares only the new session',()=>using({coreFirst:true,discoveryCleanup:'restart',companionDelay:400},async e=>{
        await e.parent.waitForFunction(()=>window.__bridgePublic.some(m=>m.type==='PREPARE'));
        await e.parent.evaluate(protocol=>{const old=window.__bridgePublic.find(m=>m.type==='PING');window.postMessage({...old,protocol,type:'AVAILABLE',timestamp:Date.now()},location.origin);},protocol);
        await e.parent.waitForTimeout(300);
        assert.deepEqual(await e.parent.evaluate(()=>{
            const first=window.__bridgePublic.find(m=>m.type==='PING'),prepares=window.__bridgePublic.filter(m=>m.type==='PREPARE');
            return [prepares.length,prepares[0].id!==first.id,prepares[0].generation>first.generation];
        }),[1,true,true]);
    }));
    await check('bridge fabricated same-window CLOSED after genuine ended and platform marker cannot navigate',()=>using({natural:true,nextLesson:true},async e=>{
        await e.pair();await e.parent.waitForFunction(()=>Object.values(window.__gm.values).some(v=>v?.type==='ENDED'));
        await e.confirmMarker();await e.child.waitForFunction(()=>Object.values(window.__gm.values).some(v=>v?.type==='CONFIRMED'));
        await e.parent.evaluate(protocol=>{
            const exposed=window.__bridgePublic.find(message=>message.type==='PREPARE');
            window.postMessage({protocol,type:'CLOSED',id:exposed.id,generation:exposed.generation,seq:999,timestamp:Date.now()},location.origin);
        },protocol);
        await e.parent.waitForFunction(()=>app._state!=='WAITING_LIVE');
        assert.deepEqual(await e.parent.evaluate(()=>[app._state,window.__nextCalls,app._actions.pending.size]),['BLOCKED',0,0]);
        assert.equal(e.child.isClosed(),false);
    }));
    await check('bridge fabricated ENDED plus CLOSED cannot replace the companion natural-ended state',()=>using({nextLesson:true},async e=>{
        await e.pair();await e.child.waitForFunction(()=>window.__plays===1);await e.confirmMarker();
        await e.parent.evaluate(protocol=>{
            const exposed=window.__bridgePublic.find(m=>m.type==='PREPARE');
            for(const [type,seq] of [['ENDED',998],['CLOSED',999]]) window.postMessage({protocol,type,id:exposed.id,generation:exposed.generation,seq,timestamp:Date.now()},location.origin);
        },protocol);
        await e.parent.waitForFunction(()=>app._state==='BLOCKED');
        assert.equal(await e.parent.evaluate(()=>window.__nextCalls),0);
        assert.equal(await e.child.evaluate(()=>window.__ended),false);
        assert.equal(e.child.isClosed(),false);
    }));
    await check('bridge openerless explicit pairing preserves native handler and stores hashes only',()=>using({},async e=>{
        assert.equal(await e.child.evaluate(()=>window.opener),null); await e.pair();
        await e.child.waitForFunction(()=>window.__plays===1);
        assert.equal(await e.parent.evaluate(()=>app._state),'WAITING_LIVE');
        assert.equal(await e.parent.evaluate(()=>window.__nativeCalls),1);
        assert.equal(JSON.stringify([...e.values]).includes('https://'),false);
        assert.equal(await e.child.evaluate(()=>document.querySelector('video').playbackRate),1);
    }));
    await check('bridge real browser ended and genuine user closure confirmation still cannot bypass provenance boundary',()=>using({natural:true},async e=>{
        await e.pair(); await e.parent.waitForFunction(()=>Object.values(window.__gm.values).some(v=>v?.type==='ENDED'),null,{timeout:6000}).catch(async error=>{throw new Error(error.message+' '+JSON.stringify({packets:[...e.values],child:await e.child.evaluate(()=>({ended:document.querySelector('video').ended,error:document.querySelector('video').error?.code,text:window.__roots.map(r=>r.textContent)}))}));});
        assert.equal(await e.parent.evaluate(()=>app._state),'WAITING_LIVE');
        assert.equal(e.packet('parent').type,'ACCEPT');
        await e.confirmMarker(); await e.child.waitForFunction(()=>Object.values(window.__gm.values).some(v=>v?.type==='CONFIRMED'));
        assert.equal(await e.parent.evaluate(()=>app._state),'WAITING_LIVE');
        // Simulated pagehide is departure evidence ONLY, never proof of tab closure.
        await e.child.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
        await e.parent.waitForFunction(()=>window.__roots.some(root=>root.textContent.includes('这不能证明已关闭')));
        assert.equal(await e.parent.evaluate(()=>app._state),'WAITING_LIVE');
        await e.parent.evaluate(()=>{const s=JSON.parse(JSON.stringify(app.settings));s.randomDelaysEnabled=true;s.delays.liveReturn={enabled:true,minMs:1200,maxMs:1200};app.updateSettings(s);window.__draws=0;Math.random=()=>{window.__draws++;return .5;};});
        await e.child.close(); await e.ui(e.parent,'button');
        await e.parent.waitForFunction(()=>app._state==='BLOCKED');
        assert.deepEqual(await e.parent.evaluate(()=>[app._actions.pending.size,window.__draws]),[0,0]);
        assert.equal(e.values.size,0);
    }));
    for (const option of ['wrongFlags','wrongHref']) await check(`bridge rejects ${option} pairing`,()=>using({[option]:true},async e=>{
        await e.pair(); assert.equal(e.packet('child'),undefined);
        assert.equal(await e.parent.evaluate(()=>app._state),'WAITING_LIVE');
    }));
    await check('bridge native activation evidence requires a trusted user click',()=>using({},async e=>{
        await e.parent.evaluate(()=>document.querySelector('iframe').contentDocument.querySelector('a.liveHref').click());
        await e.ui(e.parent,'button'); assert.equal(e.meta(),undefined);
    }));
    await check('bridge duplicate preparation cannot create another session or window',()=>using({},async e=>{
        await e.pair(); await e.child.waitForFunction(()=>window.__plays===1);
        const count=e.context.pages().length;
        await e.parent.evaluate(protocol=>{for(let i=0;i<3;i++)window.postMessage({protocol,type:'PREPARE',id:crypto.randomUUID(),generation:1,seq:1,timestamp:Date.now()},location.origin);},protocol);
        assert.equal(e.context.pages().length,count); assert.equal([...e.values.keys()].filter(key=>key.endsWith('.meta')).length,1);
    }));
    await check('bridge premature child departure blocks parent rather than completing',()=>using({},async e=>{
        await e.pair(); await e.child.waitForFunction(()=>window.__plays===1);
        await e.child.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
        await e.parent.waitForFunction(()=>app._state==='BLOCKED');
    }));
    await check('bridge synthetic ended and 99 percent alone cannot report completion',()=>using({},async e=>{
        await e.pair(); await e.child.waitForFunction(()=>window.__plays===1);
        await e.child.evaluate(()=>{const v=document.querySelector('video');v.currentTime=99;window.__ended=true;v.dispatchEvent(new Event('ended'));});
        assert.equal(e.packet('child').type,'READY'); assert.equal(await e.parent.evaluate(()=>app._state),'WAITING_LIVE');
    }));
    await check('bridge stale sequence wrong session nonce and foreign child are rejected',()=>using({},async e=>{
        await e.pair(); await e.child.waitForFunction(()=>window.__plays===1);
        const original=e.packet('child'), key=[...e.values.keys()].find(k=>k.endsWith('.child'));
        for(const patch of [{seq:original.seq,type:'ENDED'},{nonce:crypto.randomUUID(),seq:99,type:'ENDED'},{childId:crypto.randomUUID(),seq:99,type:'ENDED'},{id:crypto.randomUUID(),seq:99,type:'ENDED'}]) await e.publish(null,key,{...original,...patch});
        assert.equal(e.packet('parent').type,'ACCEPT'); assert.equal(await e.parent.evaluate(()=>app._state),'WAITING_LIVE');
    }));
    await check('bridge core rejects foreign origin source generation and stale timestamps',()=>using({},async e=>{
        await e.pair();await e.child.waitForFunction(()=>window.__plays===1);
        await e.parent.evaluate(({protocol,meta})=>{
            const data={protocol,id:meta.id,generation:meta.generation,seq:999,timestamp:Date.now(),type:'ENDED'};
            for(const event of [
                {origin:'https://untrusted.test',source:window,data},
                {origin:location.origin,source:null,data},
                {origin:location.origin,source:window,data:{...data,generation:data.generation+1}},
                {origin:location.origin,source:window,data:{...data,timestamp:0}},
            ])window.dispatchEvent(new MessageEvent('message',event));
        },{protocol,meta:e.meta()});
        await e.confirmMarker();assert.equal(e.packet('parent').type,'ACCEPT');assert.equal(await e.parent.evaluate(()=>app._state),'WAITING_LIVE');
    }));
    await check('bridge ended before pairing cannot consume the receive sequence or authorize continuation',()=>using({},async e=>{
        await e.parent.frameLocator('iframe').locator('a.liveHref').click();await e.ui(e.parent,'button');
        await e.parent.waitForFunction(()=>Object.keys(window.__gm.values).some(k=>k.endsWith('.meta')));
        const meta=e.meta();
        await e.parent.evaluate(({protocol,meta})=>window.postMessage({protocol,type:'ENDED',id:meta.id,generation:meta.generation,seq:999,timestamp:Date.now()},location.origin),{protocol,meta});
        await e.confirmMarker();assert.equal(e.packet('parent'),undefined);
        await e.child.evaluate(entries=>{window.__gm.values=Object.fromEntries(entries);},[...e.values]);
        await e.ui(e.child,'input',meta.id);await e.ui(e.child,'button');await e.child.waitForFunction(()=>window.__plays===1);
        assert.equal(await e.parent.evaluate(()=>app._state),'WAITING_LIVE');
    }));
    await check('bridge two-hour throttled clock never manufactures completion',()=>using({},async e=>{
        await e.pair();await e.child.waitForFunction(()=>window.__plays===1);
        for(const page of [e.parent,e.child])await page.evaluate(()=>{const now=Date.now();Date.now=()=>now+7200001;});
        await e.parent.evaluate(()=>app._liveController.tick());
        assert.equal(await e.parent.evaluate(()=>app._state),'WAITING_LIVE');assert.equal(e.packet('child').type,'READY');
    }));
    await check('bridge missing real native destination cannot open managed tab or issue pairing metadata',()=>using({},async e=>{
        await e.parent.frameLocator('iframe').locator('a.liveHref').click();
        await e.parent.evaluate(()=>document.querySelector('iframe').contentDocument.querySelector('#openUrl').href='https://untrusted.test/not-a-replay');
        const before=e.context.pages().length;await e.ui(e.parent,'button');
        assert.equal(e.meta(),undefined);assert.equal(e.context.pages().length,before);
    }));
    await check('bridge recorded document or player replacement fails safely',()=>using({},async e=>{
        await e.pair();await e.child.waitForFunction(()=>window.__plays===1);
        await e.child.evaluate(()=>document.querySelector('video').remove());
        await e.parent.waitForFunction(()=>app._state==='BLOCKED');assert.equal(e.child.isClosed(),false);
    }));
    await check('bridge interruption and denied automatic closure never count as completion',()=>using({},async e=>{
        await e.pair();await e.child.waitForFunction(()=>window.__plays===1);
        await e.child.evaluate(()=>{window.close=()=>{throw new Error('Synthetic closure denial');};window.__paused=true;});
        assert.equal(await e.parent.evaluate(()=>app._state),'WAITING_LIVE');
        assert.equal(e.packet('child').type,'READY');assert.equal(e.child.isClosed(),false);
    }));
    await check('bridge expired session cannot pair',()=>using({},async e=>{
        await e.parent.frameLocator('iframe').locator('a.liveHref').click(); await e.ui(e.parent,'button');
        await e.parent.waitForFunction(()=>Object.keys(window.__gm.values).some(key=>key.endsWith('.meta')));
        const meta=e.meta(), key=[...e.values.keys()].find(k=>k.endsWith('.meta'));
        await e.publish(null,key,{...meta,created:Date.now()-90000000,expires:Date.now()-3600000});
        await e.ui(e.child,'input',meta.id);await e.ui(e.child,'button');assert.equal(e.packet('child'),undefined);
    }));
    await check('bridge parent cancellation invalidates child without closing unrelated tabs',()=>using({},async e=>{
        await e.pair();await e.child.waitForFunction(()=>window.__plays===1);
        const unrelated=await e.context.newPage();await e.parent.evaluate(()=>app.destroy());
        await e.parent.waitForFunction(()=>Object.keys(window.__gm.values).length===0);
        assert.equal(unrelated.isClosed(),false);assert.equal(e.child.isClosed(),false);
    }));
    await check('bridge refuses page-requested managed opening and exports no privileged APIs',async()=>{
        assert.ok(!bridge.includes('GM_openInTab'));assert.ok(!bridge.includes('unsafeWindow'));assert.ok(!bridge.includes('window.close('));
        assert.ok(bridge.includes('event.isTrusted'));assert.ok(bridge.includes("if (packet.type === 'LEFT')"));
        assert.ok(!core.includes('@grant        GM_'));assert.ok(!bridge.includes('currentTime ='));
        const helper=core.slice(core.indexOf('        function createBridgeParent('),core.indexOf("        const protocol = 'xuexitong-live-v1'"));
        assert.ok(!/\bonResult\s*\(/.test(helper));assert.ok(!/\bscheduleClose\s*\(/.test(helper));
    });
    console.log(`RESULT: ${passed} passed, ${failures.length} failed; mocked GM storage across openerless Chrome pages; one local WAV natural-ended case; no Tampermonkey or authenticated platform.`);
    if(failures.length)process.exitCode=1;
} finally { await browser.close(); }
