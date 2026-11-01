import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE
    ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
    : require('playwright');
const jquery = readFileSync(process.env.JQUERY_PATH, 'utf8');
const source = process.env.REGRESSION_REF ? execFileSync('git',['show',process.env.REGRESSION_REF+':v3_optimized.js'],{encoding:'utf8'}) : readFileSync(new URL('../v3_optimized.js', import.meta.url), 'utf8');
const reviewedStartup = execFileSync('git', ['show', 'd7ea26ac373522b250f4bf573fada7c75687c909:v3_optimized.js'], { encoding: 'utf8' });
const regressionBaseline = execFileSync('git', ['show', 'f587605e91e14d39429168c88936a83840ea19cf:v3_optimized.js'], { encoding: 'utf8' });
const auxiliaryErrorBaseline = execFileSync('git', ['show', '06ca05808b4ca5c2b68f43e7720cfe82b68168be:v3_optimized.js'], { encoding: 'utf8' });
const policyBaseline = execFileSync('git', ['show', '8bf8930f990ff1c13929b50c822a2be2e35cd8bc:v3_optimized.js'], { encoding: 'utf8' });
const permissiveUI = readFileSync(new URL('../fixtures/synthetic/permissive-player-ui.html',import.meta.url),'utf8');
const scopeOuter = readFileSync(new URL('../fixtures/synthetic/course-with-auxiliary-frames.html', import.meta.url), 'utf8');
const scopeMedia = readFileSync(new URL('../fixtures/synthetic/course-task-video.html', import.meta.url), 'utf8');
const replayPopup = readFileSync(new URL('../fixtures/synthetic/recorded-live-videojs.html', import.meta.url), 'utf8');
const auditionTask = readFileSync(new URL('../fixtures/synthetic/audition-audio-task.html', import.meta.url), 'utf8');
const rerenderCatalog = readFileSync(new URL('../fixtures/synthetic/catalog-rerender.html', import.meta.url), 'utf8');
const complexMedia = readFileSync(new URL('../fixtures/synthetic/complex-media-task.html', import.meta.url), 'utf8');
const audioFixture = readFileSync(new URL('../fixtures/synthetic/native-audio-task.html', import.meta.url), 'utf8');
const diagnosticFixtures = Object.fromEntries(['video','audio'].map(kind => [kind,readFileSync(new URL(`../fixtures/synthetic/diagnostic-${kind}-attachment.html`,import.meta.url),'utf8')]));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
console.log(`ENV: Chrome ${browser.version()}; headless; network blocked; media and timers simulated.`);
let passed = 0;
const failures = [];
const node = (i, active = false, complete = false) => `<li><div class="posCatalog_select ${active ? 'posCatalog_active' : ''}" id="node${i}"><span class="posCatalog_name" title="Content ${i}">Content ${i}</span>${complete ? '<span class="icon_Completed"></span>' : '<input class="jobUnfinishCount" value="1">'}</div></li>`;
const outer = (entries = 1, complete = false, title = '视频') => `<div class="prev_title" title="${title}"></div><div id="coursetree"><ul><li><ul>${Array.from({ length: entries }, (_, i) => node(i, i === 0, complete)).join('')}</ul></li></ul></div><iframe info="card"></iframe>`;
async function setup(html = outer(), count = 1, nested = false, scopeCase = null, enableCooldown = false, syntheticOrigin = false, automatic = false, scriptSource = source) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort());
    await context.route('https://course.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><video id="live-player"></video></body></html>' }));
    if (syntheticOrigin === 'recorded') {
        await context.route('https://mooc1.chaoxing.com/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic course</title>' }));
        await context.route('https://zhibo.chaoxing.com/**', route => route.fulfill({ contentType: 'text/html', body: replayPopup }));
    }
    const page = await context.newPage();
    if (syntheticOrigin) await page.goto(syntheticOrigin === 'recorded' ? 'https://mooc1.chaoxing.com/synthetic-course' : syntheticOrigin === 'pacing' ? 'https://course.test/course?courseId=synthetic' : 'https://course.test/course');
    if (!syntheticOrigin) await page.goto('https://course.test/course'+(process.env.FIXTURE_COURSE_ID==='1'?'?courseId=synthetic':'')); // Real storage-capable origin for current browser lifecycle APIs.
    // DOMParser is inert. Strip executable/resource-bearing content before insertion.
    const sanitized = await page.evaluate(html => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script,object,embed,link,base,meta').forEach(el => el.remove());
        doc.querySelectorAll('*').forEach(el => {
            for (const attr of [...el.attributes]) {
                if (/^on/i.test(attr.name) || ['src', 'srcdoc', 'href', 'action'].includes(attr.name)) el.removeAttribute(attr.name);
            }
        });
        return doc.documentElement.outerHTML;
    }, html);
    await page.setContent(sanitized);
    await page.addScriptTag({ content: jquery });
    await page.evaluate(({ count, nested, scopeCase, scopeMedia, auditionTask, complexMedia }) => {
        window.__clock = 100000;
        Date.now = () => window.__clock;
        Object.defineProperty(performance,'now',{configurable:true,value:()=>window.__clock});
        let id = 0;
        window.__timeouts = new Map(); window.__intervals = new Map();
        window.__timeoutDeadlines = new Map(); window.__timeoutDelays = new Map(); window.__logs = [];
        const log = console.log.bind(console);
        console.log = (...args) => { window.__logs.push(args.join(' ')); log(...args); };
        window.setTimeout = (fn, delay) => { window.__timeouts.set(++id, fn); window.__timeoutDelays.set(id, delay); window.__timeoutDeadlines.set(id,window.__clock+delay); return id; };
        window.clearTimeout = id => { window.__timeouts.delete(id); window.__timeoutDelays.delete(id); window.__timeoutDeadlines.delete(id); };
        window.setInterval = fn => { window.__intervals.set(++id, fn); return id; };
        window.clearInterval = id => window.__intervals.delete(id);
        window.__addVideos = (count, nested = false) => {
            let doc = document.querySelector('iframe[info="card"]').contentDocument;
            if (nested) {
                const frame = doc.createElement('iframe'); doc.body.append(frame); doc = frame.contentDocument;
            }
            if (scopeCase && count) doc.body.innerHTML = new DOMParser().parseFromString(scopeMedia, 'text/html').body.innerHTML;
            for (let i = 0; i < count; i++) {
                const v = doc.querySelectorAll('video')[i] || doc.createElement('video'); v.id = `video_html5_api_${i}`;
                v.__ended = false; v.__paused = true; v.__plays = 0; // Each unstarted player is paused; competition is tested explicitly.
                Object.defineProperties(v, { readyState: { configurable: true, get: () => v.__readyState ?? 4 },
                    ended: { get: () => v.__ended },
                    paused: { get: () => v.__paused },
                });
                v.play = () => { v.__plays++; v.__paused = false; return Promise.resolve(); };
                doc.body.append(v);
            }
        };
        window.__addVideos(count, nested);
        if (scopeCase === 'auto-missing-card') document.querySelector('iframe[info="card"]').remove();
        if (scopeCase === 'auto-document-loading') {
            window.__documentReady = 'loading'; Object.defineProperty(document, 'readyState', { get: () => window.__documentReady });
        }
        if (scopeCase === 'auto-blank-leaf') {
            const player = document.querySelector('iframe').contentDocument.querySelector('iframe').contentDocument;
            const leaf = player.createElement('iframe'); player.body.append(leaf);
            const attribute = leaf.getAttribute.bind(leaf);
            leaf.getAttribute = name => name === 'src' ? 'javascript:void(0);' : attribute(name); // Metadata only; never execute a captured URL.
        }
        if (scopeCase?.startsWith('complex-')) {
            const root = document.querySelector('iframe[info="card"]').contentDocument;
            const videos = [...root.querySelectorAll('video')]; root.body.innerHTML = complexMedia;
            const roots = [...root.querySelectorAll('iframe')];
            roots.forEach((branch, index) => {
                const doc = branch.contentDocument;
                if (!index) doc.body.append(videos[0]);
                for (let i = 0; i < (index === 4 ? 2 : 3); i++) {
                    const child = doc.createElement('iframe'); doc.body.append(child);
                    if (index === 1 && i === 2) child.contentDocument.body.append(videos[1]);
                }
            });
            videos[1].__paused = true;
            window.__complexRoot = root; window.__complexFrames = roots; window.__complexVideos = videos;
            window.__ownershipVerified = true;
            window.__audioApproved = scopeCase !== 'complex-unclassified-audio';
            window.__ownershipAdapter = { discover: () => document.querySelector('.posCatalog_active')?.id === 'node0' ? ({ tasks: [], validateScope: () => root === document.querySelector('iframe[info="card"]').contentDocument,
                mediaOwnership: { activeFrame: roots[0], inactiveFrames: roots.slice(1), auxiliaryAudio: window.__audioApproved ? root.querySelector('audio') : null,
                    validateScope: () => window.__ownershipVerified } }) : null };
            if (scopeCase === 'complex-visible-inactive') { roots[1].hidden = false; roots[1].inert = false; roots[1].removeAttribute('aria-hidden'); }
            if (scopeCase === 'complex-playing-inactive') videos[1].__paused = false;
            if (scopeCase === 'complex-no-active-player') videos[0].remove();
            if (scopeCase === 'complex-unknown-audio') root.body.append(root.createElement('audio'));
            if (scopeCase === 'complex-unknown-leaf') roots[2].contentDocument.querySelector('iframe').contentDocument.body.textContent = 'Unrecognized synthetic task';
            if (scopeCase === 'complex-wrapper-form') root.body.append(root.createElement('form'));
            if (scopeCase === 'complex-inaccessible') Object.defineProperty(roots[2], 'contentDocument', { get() { throw new DOMException('Synthetic denial', 'SecurityError'); } });
            if (scopeCase === 'complex-unverified') window.__ownershipVerified = false;
        }
        if (scopeCase?.startsWith('audition-')) {
            const root = document.querySelector('iframe[info="card"]').contentDocument;
            const video = root.querySelector('video'); root.body.innerHTML = auditionTask;
            const player = root.querySelector('iframe').contentDocument;
            player.body.append(video, player.createElement('iframe'));
            const leafFrame = player.querySelector('iframe'), audio = root.querySelector('audio');
            const leaf = leafFrame.contentDocument;
            if (scopeCase === 'audition-id') audio.id = 'unrelatedAudio';
            if (scopeCase === 'audition-visible') audio.style.display = '';
            if (scopeCase === 'audition-playing') Object.defineProperty(audio, 'paused', { get: () => false });
            if (scopeCase === 'audition-duplicate') audio.parentElement.append(audio.cloneNode());
            if (scopeCase === 'audition-no-video') video.remove();
            if (scopeCase === 'audition-nested') { const div = player.createElement('div'); player.body.append(div); div.append(audio); }
            if (scopeCase === 'audition-class') audio.className = 'task';
            if (scopeCase === 'audition-controls') audio.controls = false;
            if (scopeCase === 'audition-parent') root.body.append(audio);
            if (scopeCase === 'audition-progress') Object.defineProperty(audio, 'currentTime', { get: () => 1 });
            if (scopeCase === 'audition-autoplay') audio.autoplay = true;
            if (scopeCase === 'audition-seeking') Object.defineProperty(audio, 'seeking', { get: () => true });
            if (scopeCase === 'audition-extra-video') player.body.append(video.cloneNode());
            if (scopeCase === 'audition-extra-frame') leaf.body.append(leaf.createElement('iframe'));
            if (scopeCase === 'audition-unknown-leaf') leaf.body.textContent = 'Unknown task';
            if (scopeCase === 'audition-other-audio') leaf.body.append(leaf.createElement('audio'));
            if (scopeCase === 'audition-inaccessible') Object.defineProperty(leafFrame, 'contentDocument', { get() { throw new DOMException('Synthetic denial', 'SecurityError'); } });
        }
        if (scopeCase) {
            window.__auxReads = 0;
            for (const aux of document.querySelectorAll('iframe[id^="aux-"]')) {
                aux.contentDocument.body.textContent = 'Synthetic auxiliary UI';
            }
            if (scopeCase === 'unsupported-aux') {
                document.querySelector('#aux-editor').contentDocument.body.append(document.createElement('audio'));
            }
            if (scopeCase === 'inaccessible-aux') {
                Object.defineProperty(document.querySelector('#aux-report'), 'contentDocument', { get() {
                    window.__auxReads++;
                    throw new DOMException('Synthetic access denial', 'SecurityError');
                } });
            }
        }
    }, { count, nested, scopeCase, scopeMedia, auditionTask, complexMedia });
    await page.addScriptTag({ content: scriptSource });
    await page.evaluate(async ({ enableCooldown, automatic }) => {
        window.__bootFunction = [...window.__intervals.values()][0];
        for (const fn of [...window.__intervals.values()]) fn();
        await Promise.resolve();
        window.__settingsDefaults = JSON.parse(JSON.stringify(app.settings));
        window.__cooldownDefaults = [app.configs.randomCooldownEnabled, app.configs.randomCooldownMinMs, app.configs.randomCooldownMaxMs];
        if (automatic) return; // Deliberately never call app.run() in automatic-start tests.
        // Historical scenarios explicitly choose legacy navigation timing and immediate other actions.
        const settings = JSON.parse(JSON.stringify(app.settings));
        settings.preset = 'legacy'; settings.randomDelaysEnabled = enableCooldown;
        settings.features.document = true; settings.features.live = true;
        for (const [category, rule] of Object.entries(settings.delays)) {
            rule.enabled = enableCooldown && ['nextLesson', 'nextChapter', 'assessment'].includes(category);
            if (['nextLesson', 'nextChapter', 'assessment'].includes(category)) { rule.minMs = 5000; rule.maxMs = 12000; }
        }
        app.updateSettings(settings);
        app.run(); await Promise.resolve();
    }, { enableCooldown, automatic });
    return { page, close: () => context.close() };
}
async function flush(page, rounds = 1) {
    await page.evaluate(async rounds => {
        for (let i = 0; i < rounds; i++) {
            const callbacks = [...window.__timeouts].map(([id,fn])=>({id,fn,deadline:window.__timeoutDeadlines.get(id)??window.__clock})).sort((a,b)=>a.deadline-b.deadline);
            for (const {id,fn,deadline} of callbacks) {
                // Earlier callbacks may cancel a later callback in this batch.
                if (!window.__timeouts.has(id)) continue;
                window.clearTimeout(id); window.__clock=Math.max(window.__clock,deadline); fn();
                await Promise.resolve(); await Promise.resolve();
            }
            await Promise.resolve(); await Promise.resolve();
        }
    }, rounds);
}
async function check(label, fn) {
    if (process.env.TEST_FILTER && !new RegExp(process.env.TEST_FILTER).test(label)) return;
    try { await fn(); passed++; console.log(`PASS ${label}`); }
    catch (e) { failures.push(label); console.error(`FAIL ${label}: ${e.message}`); }
}
async function using(options, fn) {
    const fixture = await setup(...options);
    try { await fn(fixture.page); } finally { await fixture.close(); }
}
// Test-only platform marker: deliberately separate from natural media ended.
async function creditCurrentLesson(page) {
    await page.evaluate(() => {
        const current=document.querySelector('.posCatalog_active');
        current.querySelectorAll('.jobUnfinishCount').forEach(el=>el.value='0');
        if(!current.querySelector('.icon_Completed')) current.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');
    });
}
const state = page => page.evaluate(() => app._state);
try {
    await check('acceptance timer ordering preserves cancellation and defers newly queued callbacks',()=>using([],async page=>{
        await page.evaluate(()=>{window.__timerOrder=[];let cancelled;setTimeout(()=>{window.__timerOrder.push('first');clearTimeout(cancelled);setTimeout(()=>window.__timerOrder.push('new'),1);},10);cancelled=setTimeout(()=>window.__timerOrder.push('cancelled'),20);});
        await flush(page);assert.deepEqual(await page.evaluate(()=>window.__timerOrder),['first']);
        await flush(page);assert.deepEqual(await page.evaluate(()=>window.__timerOrder),['first','new']);
    }));
    async function diagnosticLesson(page, kind='video', variant='', automatic=true) {
        await page.evaluate(({html,kind,variant,automatic})=>{
            const root=document.querySelector('iframe[info="card"]').contentDocument;
            root.body.innerHTML=new DOMParser().parseFromString(html,'text/html').body.innerHTML;
            const template=root.querySelector('template'),markup=template.innerHTML;template.remove();
            window.__diagnosticRoot=root;window.__diagnosticPlayers=[];
            window.__installDiagnosticPlayer=()=>{
                const branch=root.querySelector('iframe'),doc=branch.contentDocument;doc.body.innerHTML=markup;
                const player=doc.querySelector(kind==='video'?'video':'#audio_html5_api');
                player.__plays=0;player.__paused=true;player.__ended=false;
                Object.defineProperties(player,{readyState:{configurable:true,get:()=>player.__readyState??4},paused:{get:()=>player.__paused},ended:{get:()=>player.__ended}});
                player.play=()=>{player.__plays++;player.__paused=false;return Promise.resolve();};window.__diagnosticPlayers.push(player);
                if(variant==='independent-form'){const form=doc.createElement('form');form.innerHTML='<input type="text">';doc.body.append(form);}
                if(variant==='form-action')doc.querySelector('form')?.setAttribute('action','/synthetic-unsupported-submit');
                if(variant==='wrong-target')doc.querySelector('input').setAttribute('aria-controls','unrelated-player');
                if(variant==='named-control')doc.querySelector('input').name='independent-task';
                if(['object','embed','canvas'].includes(variant))doc.querySelector('.vjs-control-bar').append(doc.createElement(variant));
                if(variant==='unknown-media')doc.body.append(doc.createElement(kind==='video'?'audio':'video'));
                if(variant==='duplicate-player')player.parentElement.append(player.cloneNode());
                if(variant==='inactive-player')doc.querySelector('.video-js').style.display='none';
                if(variant==='secondary-active')Object.defineProperty(doc.querySelector('#audio1_html5_white'),'paused',{get:()=>false});
                if(variant==='secondary-visible')doc.querySelector('#audio1_html5').style.display='';
            };
            if(!['late','missing','refresh-late'].includes(variant))window.__installDiagnosticPlayer();
            const aux=root.querySelector('#auditionAudio');
            if(variant==='aux-active')Object.defineProperty(aux,'paused',{get:()=>false});
            if(variant==='aux-visible')aux.style.display='';
            if(variant==='aux-duplicate')aux.parentElement.append(aux.cloneNode());
            if(variant==='aux-controls')aux.controls=false;
            if(variant==='aux-class')aux.className='unknown-role';
            if(variant==='aux-parent')root.body.append(aux);
            if(variant==='inaccessible')Object.defineProperty(root.querySelector('iframe'),'contentDocument',{get:()=>null});
            const settings=structuredClone(app.settings);settings.randomDelaysEnabled=false;
            if(variant==='disabled')settings.features.audioPlayback=false;
            if(kind==='audio')settings.features.videoPlayback=false;
            app.updateSettings(settings);app.run({startup:automatic});
        },{html:diagnosticFixtures[kind],kind,variant,automatic});
    }
    async function auxiliaryError(page, variant='', code=4) {
        await page.evaluate(({variant,code})=>{
            const root=window.__diagnosticRoot,aux=root.querySelector('#auditionAudio');window.__errorAux=aux;
            aux.__plays=0;aux.play=()=>{aux.__plays++;return Promise.resolve();};
            Object.defineProperty(aux,'error',{configurable:true,get:()=>code===null?null:{code}});
            if(variant==='active')Object.defineProperty(aux,'paused',{get:()=>false});
            if(variant==='visible')aux.style.display='';
            if(variant==='duplicate')aux.parentElement.append(aux.cloneNode());
            if(variant==='seeking')Object.defineProperty(aux,'seeking',{get:()=>true});
            if(variant==='autoplay')aux.autoplay=true;
            if(variant==='progress')Object.defineProperty(aux,'currentTime',{get:()=>1});
            if(variant==='controls')aux.controls=false;
            if(variant==='class')aux.className='independent-task';
            if(variant==='parent')root.body.append(aux);
            if(variant==='unknown-id')aux.id='unrecognized-audio';
            if(variant==='nested'){
                const doc=window.__diagnosticPlayers[0].ownerDocument,div=doc.createElement('div');doc.body.append(div);div.append(aux);
            }
            if(variant==='src')aux.setAttribute('src','https://media.invalid/synthetic-unavailable.wav');
            if(variant==='empty-src')aux.setAttribute('src','');
            if(variant==='source-child')aux.append(root.createElement('source'));
            if(variant==='current-src')Object.defineProperty(aux,'currentSrc',{get:()=> 'https://media.invalid/synthetic-unavailable.wav'});
            if(variant==='stream')Object.defineProperty(aux,'srcObject',{get:()=>({})});
            if(variant==='unobservable-src')Object.defineProperty(aux,'currentSrc',{get(){throw new Error('Synthetic unavailable source evidence');}});
            if(variant==='primary-error')Object.defineProperty(window.__diagnosticPlayers[0],'error',{get:()=>({code:4})});
            if(variant==='secondary-error')Object.defineProperty(window.__diagnosticPlayers[0].ownerDocument.querySelector('#audio1_html5_white'),'error',{get:()=>({code:4})});
            if(variant==='missing-primary')window.__diagnosticPlayers[0].remove();
            if(variant==='legacy')root.querySelector('iframe').className='';
        },{variant,code});
    }
    async function ordinaryUI(page, kind, variant='') {
        await diagnosticLesson(page,kind,variant==='late'?'late':'');
        await page.evaluate(({html,variant})=>{
            window.__addOrdinaryUI=()=>{
                const root=window.__diagnosticRoot,player=window.__diagnosticPlayers[0],doc=player.ownerDocument;
                const aux=root.querySelector('#auditionAudio');aux.className='platform-preview';aux.controls=false;
                aux.setAttribute('src','https://media.invalid/synthetic-preview');Object.defineProperty(aux,'error',{get:()=>({code:4})});
                const aside=root.createElement('aside');root.body.append(aside);aside.append(aux);
                player.className='';doc.body.append(player);doc.querySelector('.video-js')?.remove();
                const ui=doc.createElement('section');ui.innerHTML=new DOMParser().parseFromString(html,'text/html').body.innerHTML;doc.body.append(ui);
                const nested=doc.createElement('iframe');doc.body.append(nested);nested.contentDocument.body.innerHTML=ui.innerHTML;
                window.__ordinaryWidget=nested;
                if(variant==='unreadable')Object.defineProperty(nested,'contentDocument',{get(){throw new DOMException('Synthetic UI denial','SecurityError');}});
                if(variant==='task')nested.className='ans-attach-online unknown-learning-task';
                if(variant==='assessment')ui.innerHTML='<form>章节测验<input name="answer"></form>';
                if(variant==='verification')ui.innerHTML='<form><input placeholder="验证码"></form>';
            };
            if(variant!=='late')window.__addOrdinaryUI();
        },{html:permissiveUI,variant});
    }
    for(const kind of ['video','audio']){
        await check(`permissive ${kind} authenticated-shaped failures reproduce on previous policy`,()=>using([outer(2),0,false,null,false,false,false,policyBaseline],async page=>{
            await ordinaryUI(page,kind);await flush(page,42);assert.equal(await state(page),'BLOCKED');
        }));
        await check(`permissive ${kind} primary survives preview errors and ordinary forms/wrappers on entry and reboot`,()=>using([outer(2),0],async page=>{
            await ordinaryUI(page,kind);await flush(page,6);
            assert.deepEqual(await page.evaluate(()=>[app._state,app._videoEl.__plays,app._videoEl.playbackRate]),['PLAYING',1,1]);
            await page.addScriptTag({content:source});await page.evaluate(()=>{for(const callback of [...window.__intervals.values()])callback();});await flush(page,6);
            assert.deepEqual(await page.evaluate(()=>[app._state,app._videoEl.__plays]),['PLAYING',2]);
        }));
        await check(`permissive ${kind} waits for delayed media instead of rejecting initial UI`,()=>using([outer(2),0],async page=>{
            await ordinaryUI(page,kind,'late');await flush(page,5);assert.equal(await state(page),'WAITING_STARTUP');
            await page.evaluate(()=>{window.__installDiagnosticPlayer();window.__addOrdinaryUI();});await flush(page,6);
            assert.deepEqual(await page.evaluate(()=>[app._state,app._videoEl.__plays]),['PLAYING',1]);
        }));
        await check(`permissive ${kind} unreadable widget permits playback but cannot authorize navigation`,()=>using([outer(2),0],async page=>{
            await ordinaryUI(page,kind,'unreadable');await flush(page,6);assert.equal(await state(page),'PLAYING');
            await page.evaluate(()=>{window.__policyClicks=0;document.querySelector('#node1 span').onclick=()=>window.__policyClicks++;const n=document.querySelector('#node0');n.querySelector('input').value='0';n.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');const p=app._videoEl;p.__ended=true;p.__paused=true;p.dispatchEvent(new Event('ended'));});
            await flush(page,3);assert.deepEqual(await page.evaluate(()=>[app._state,window.__policyClicks]),['BLOCKED',0]);
        }));
        for(const variant of ['task','assessment','verification'])await check(`permissive ${kind} still refuses independent ${variant}`,()=>using([outer(2),0],async page=>{
            await ordinaryUI(page,kind,variant);await flush(page,6);assert.equal(await state(page),'BLOCKED');
            assert.equal(await page.evaluate(()=>window.__diagnosticPlayers[0].__plays),0);
        }));
        await check(`permissive ${kind} dynamic UI frames do not replace the active player or restart playback`,()=>using([outer(2),0],async page=>{
            await ordinaryUI(page,kind);await flush(page,6);
            const generation=await page.evaluate(()=>app._generation);
            await page.evaluate(()=>{const p=app._videoEl,doc=p.ownerDocument,f=doc.createElement('iframe');doc.body.append(f);f.contentDocument.body.innerHTML='<form><input name="ui-search"></form>';f.dispatchEvent(new Event('load'));app._checkVideoStatus();});
            assert.deepEqual(await page.evaluate(()=>[app._state,app._videoEl.__plays,app._generation]),['PLAYING',1,generation]);
        }));
    }
    await check('permissive competing primary playback stops automation rather than controlling two players',()=>using([outer(2),2],async page=>{
        assert.equal(await state(page),'PLAYING');
        await page.evaluate(()=>{const other=app._videoEl.ownerDocument.querySelectorAll('video')[1];other.__paused=false;app._checkVideoStatus();});
        assert.equal(await state(page),'BLOCKED');assert.deepEqual(await page.evaluate(()=>[...document.querySelector('iframe').contentDocument.querySelectorAll('video')].map(p=>p.__plays)),[1,0]);
    }));
    await check('permissive visible independent audio player is not mistaken for an idle preview',()=>using([outer(2),1],async page=>{
        await page.evaluate(()=>{const doc=app._videoEl.ownerDocument,a=doc.createElement('audio');a.controls=true;doc.body.append(a);app.play();});
        assert.equal(await state(page),'BLOCKED');assert.equal(await page.evaluate(()=>app._discoverMedia().reasons.includes('unknown-independent-media')),true);
    }));
    await check('permissive hidden native audio with an independent visible player UI still blocks',()=>using([outer(2),1],async page=>{
        await page.evaluate(()=>{const doc=app._videoEl.ownerDocument,ui=doc.createElement('div');ui.className='video-js';ui.innerHTML='<audio id="unknown-task-audio" style="display:none"></audio><div>Independent audio controls</div>';doc.body.append(ui);app.play();});
        assert.equal(await state(page),'BLOCKED');assert.equal(await page.evaluate(()=>app._discoverMedia().reasons.includes('unknown-independent-media')),true);
    }));
    await check('permissive inactive preview with errors does not discard the pending fifth PDF',()=>using([outer(2),0],async page=>{
        await attachments(page);await page.evaluate(()=>{const a=document.querySelector('iframe').contentDocument.querySelector('audio');a.controls=false;a.className='preview';a.setAttribute('src','https://media.invalid/synthetic-preview');Object.defineProperty(a,'error',{get:()=>({code:4})});});
        for(let i=0;i<4;i++){await page.evaluate(i=>{const p=window.__attachmentVideos[i];p.__ended=true;p.__paused=true;p.dispatchEvent(new Event('ended'));},i);await flush(page,2);}
        assert.equal(await state(page),'PAUSED_AUTOMATION');assert.equal(await page.evaluate(()=>app._discoverMedia().tasks[4].status),'pending');
        assert.deepEqual(await page.evaluate(()=>{const t=app._discoverMedia().tasks[4];return [t.platformCredit,app._processedTasks.has(t.element),app._platformCompletion===null];}),['unknown',false,true]);
        assert.equal(await page.evaluate(()=>document.querySelector('.posCatalog_active').id),'node0');
    }));
    for(const kind of ['video','audio']){
        await check(`auxiliary error ${kind} baseline reproduces code 4 not-idle rejection`,()=>using([outer(2),0,false,null,false,false,false,auxiliaryErrorBaseline],async page=>{
            await diagnosticLesson(page,kind);await auxiliaryError(page);await flush(page,4);
            assert.equal(await state(page),'BLOCKED');
            assert.ok(await page.evaluate(()=>['unclassified-audio','auxiliary-audio-not-idle'].every(reason=>app._discoverMedia().reasons.includes(reason))));
        }));
        for(const code of [null,4])await check(`auxiliary error ${kind} inactive root with code ${code} permits only the real player`,()=>using([outer(2),0],async page=>{
            await diagnosticLesson(page,kind);await auxiliaryError(page,'',code);await flush(page,4);
            assert.deepEqual(await page.evaluate(()=>[app._state,app._videoEl.__plays,app._videoEl.playbackRate,window.__errorAux.__plays]),['PLAYING',1,1,0]);
            assert.deepEqual(await page.evaluate(()=>{const a=window.__errorAux;return[a.paused,a.autoplay,a.seeking,a.currentTime,a.error?.code??null];}),[true,false,false,0,code]);
            assert.ok(await page.evaluate(()=>!app._discoverMedia().reasons.some(reason=>['unclassified-audio','auxiliary-audio-not-idle'].includes(reason))));
        }));
        for(const variant of ['active','visible','duplicate','seeking','autoplay','progress','controls','class','parent','unknown-id','nested','src','empty-src','source-child','current-src','stream','unobservable-src','primary-error','missing-primary'])await check(`auxiliary error ${kind} policy for ${variant}`,()=>using([outer(2),0],async page=>{
            await diagnosticLesson(page,kind);await auxiliaryError(page,variant);await flush(page,42);
            const blocked=['active','seeking','autoplay','primary-error','missing-primary'].includes(variant);
            assert.equal(await state(page),blocked?'BLOCKED':'PLAYING');assert.equal(await page.evaluate(()=>window.__diagnosticPlayers[0].__plays),blocked?0:1);
            assert.equal(await page.evaluate(()=>document.querySelector('.posCatalog_active').id),'node0');
            if(['src','empty-src','source-child','current-src','stream','unobservable-src'].includes(variant)){
                assert.equal(await page.evaluate(()=>app._discoverMedia().unsupported),false); // Inactive previews no longer require source classification.
                assert.ok(await page.evaluate(()=>!app._discoverMedia().reasons.includes('auxiliary-audio-not-idle')));
            }
            if(variant==='primary-error')assert.ok(await page.evaluate(kind=>app._discoverMedia().reasons.includes(`${kind}-player-error`),kind));
        }));
        for(const code of [0,1,2,3,5])await check(`auxiliary error ${kind} inactive preview code ${code} is nonblocking`,()=>using([outer(2),0],async page=>{
            await diagnosticLesson(page,kind);await auxiliaryError(page,'',code);await flush(page,4);
            assert.equal(await state(page),'PLAYING');assert.equal(await page.evaluate(()=>window.__errorAux.__plays),0);
        }));
    }
    await check('auxiliary error inactive secondary code 4 does not become a playable task',()=>using([outer(2),0],async page=>{
        await diagnosticLesson(page,'audio');await auxiliaryError(page,'secondary-error');await flush(page,4);assert.equal(await state(page),'PLAYING');
        assert.equal(await page.evaluate(()=>app._discoverMedia().audios.length),1);
    }));
    await check('auxiliary error legacy ordinary video applies the same root error boundary',()=>using([outer(2),0],async page=>{
        await diagnosticLesson(page,'video');await auxiliaryError(page,'legacy');await flush(page,4);assert.equal(await state(page),'PLAYING');
        await page.evaluate(()=>{const a=window.__errorAux;Object.defineProperty(a,'error',{get:()=>({code:2})});app.play();});
        assert.equal(await state(page),'PLAYING'); // An idle preview error is advisory even on the legacy-shaped single-media page.
    }));
    await check('auxiliary error source changes on an inactive preview do not stop the primary',()=>using([outer(2),0],async page=>{
        await diagnosticLesson(page,'video');await auxiliaryError(page);await flush(page,4);assert.equal(await state(page),'PLAYING');
        await page.evaluate(()=>{window.__errorAux.setAttribute('src','');app._checkVideoStatus();});
        assert.equal(await state(page),'PLAYING');assert.equal(await page.evaluate(()=>document.querySelector('.posCatalog_active').id),'node0');
    }));
    for(const kind of ['video','audio'])await check(`auxiliary error ${kind} real-player failure cannot turn ended into completion`,()=>using([outer(2),0],async page=>{
        await diagnosticLesson(page,kind);await auxiliaryError(page);await flush(page,4);assert.equal(await state(page),'PLAYING');
        await page.evaluate(()=>{const player=app._videoEl;Object.defineProperty(player,'error',{get:()=>({code:4})});player.__ended=true;player.dispatchEvent(new Event('ended'));});
        assert.deepEqual(await page.evaluate(()=>[app._state,app._completedVideos.has(window.__diagnosticPlayers[0]),document.querySelector('.jobUnfinishCount').value]),['BLOCKED',false,'1']);
    }));
    for(const kind of ['video','audio']) {
        await check(`diagnostic ${kind} reviewed baseline reproduces attachment dispatch or control rejection`,()=>using([outer(2),0,false,null,false,false,false,regressionBaseline],async page=>{
            await diagnosticLesson(page,kind,'',false);assert.equal(await state(page),'BLOCKED');
            assert.ok(await page.evaluate(kind=>app._discoverMedia().reasons.includes(kind==='audio'?'unknown-attachment':'unknown-attachment-content'),kind));
            if(kind==='audio')assert.equal(await page.evaluate(()=>app._discoverMedia().documents.length),1);
        }));
        await check(`diagnostic ${kind} attachment starts once with owned controls on entry and refresh-style reboot`,()=>using([outer(2),0],async page=>{
            await diagnosticLesson(page,kind);await flush(page,4);
            assert.deepEqual(await page.evaluate(()=>[app._state,app._videoEl.__plays,app._videoEl.playbackRate]),['PLAYING',1,1]);
            assert.equal(await page.evaluate(()=>app._discoverMedia().unsupported),false);
            await page.addScriptTag({content:source});await page.evaluate(()=>{for(const fn of [...window.__intervals.values()])fn();});await flush(page,4);
            assert.equal(await state(page),'PLAYING');assert.equal(await page.evaluate(()=>app._videoEl.__plays),2);
            await page.evaluate(()=>app.play());assert.equal(await page.evaluate(()=>app._videoEl.__plays),2);
        }));
        await check(`diagnostic ${kind} delayed iframe waits without freezing an incomplete inventory`,()=>using([outer(2),0],async page=>{
            await diagnosticLesson(page,kind,'late');await flush(page,4);assert.equal(await state(page),'WAITING_STARTUP');
            assert.equal(await page.evaluate(()=>app._attachmentSnapshot),null);
            await page.evaluate(()=>window.__installDiagnosticPlayer());await flush(page,4);
            assert.deepEqual(await page.evaluate(()=>[app._state,app._videoEl.__plays]),['PLAYING',1]);
        }));
        for(const variant of ['independent-form','wrong-target','named-control','object','embed','canvas','unknown-media','duplicate-player','aux-active','aux-visible','aux-duplicate','aux-controls','aux-class','aux-parent','inaccessible']) await check(`diagnostic ${kind} permissive discovery policy for ${variant}`,()=>using([outer(2),0],async page=>{
            await diagnosticLesson(page,kind,variant,false);await flush(page,42);
            const blocked=['duplicate-player','aux-active','inaccessible'].includes(variant)||(kind==='audio'&&variant==='unknown-media');
            assert.equal(await state(page),blocked?'BLOCKED':'PLAYING');assert.equal(await page.evaluate(()=>window.__diagnosticPlayers.reduce((n,p)=>n+p.__plays,0)),blocked?0:1);
        }));
        await check(`diagnostic ${kind} missing player has a bounded stop`,()=>using([outer(2),0],async page=>{
            await diagnosticLesson(page,kind,'missing');await flush(page,42);assert.equal(await state(page),'BLOCKED');assert.equal(await page.evaluate(()=>app._timers.size),0);
        }));
    }
    await check('diagnostic inactive auxiliary controls are not task-ownership requirements',()=>using([outer(2),0],async page=>{
        await diagnosticLesson(page,'video','aux-controls',false);
        assert.equal(await state(page),'PLAYING');assert.equal(await page.evaluate(()=>app._discoverMedia().unsupported),false);
        assert.equal(await page.evaluate(()=>app._discoverMedia().rawAudios.length),1);
    }));
    for(const variant of ['inactive-player','secondary-active','secondary-visible','disabled'])await check(`diagnostic native audio UI/feature policy: ${variant}`,()=>using([outer(2),0],async page=>{
        await diagnosticLesson(page,'audio',variant,false);
        const expected=variant==='disabled'?'PAUSED_AUTOMATION':variant==='secondary-active'?'BLOCKED':'PLAYING';
        assert.equal(await state(page),expected);
        assert.equal(await page.evaluate(()=>window.__diagnosticPlayers[0].__plays),expected==='PLAYING'?1:0);
    }));
    await check('diagnostic ordinary UI form does not block playback or get submitted',()=>using([outer(2),0],async page=>{
        await diagnosticLesson(page,'video','form-action',false);assert.equal(await state(page),'PLAYING');
    }));
    for(const withAuxiliaryError of [false,true])for(const kind of ['video','audio']) await check(`diagnostic ${kind} natural ended waits for platform marker then navigates once despite stale callbacks; auxiliary code4=${withAuxiliaryError}`,()=>using([outer(2),0],async page=>{
        await diagnosticLesson(page,kind,'',false);
        if(withAuxiliaryError)await auxiliaryError(page);
        await page.evaluate(()=>{
            window.__diagnosticClicks=0;window.__originalDiagnostic=app._videoEl;
            document.querySelector('#node1 .posCatalog_name').onclick=()=>{
                window.__diagnosticClicks++;document.querySelector('#node0').classList.remove('posCatalog_active');document.querySelector('#node1').classList.add('posCatalog_active');
                const f=document.createElement('iframe');f.setAttribute('info','card');document.querySelector('iframe[info="card"]').replaceWith(f);window.__addVideos(1);
            };
            const v=window.__originalDiagnostic;v.__paused=true;v.__ended=true;v.dispatchEvent(new Event('ended'));v.dispatchEvent(new Event('ended'));
        });
        await flush(page,2);assert.equal(await state(page),'VERIFYING_COMPLETION');assert.equal(await page.evaluate(()=>window.__diagnosticClicks),0);
        await page.evaluate(()=>{
            window.__oldDiagnosticCallbacks=[...window.__timeouts.values()];
            const node=document.querySelector('#node0');node.querySelector('input').value='0';node.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');
            if(!app.settings.features.videoPlayback){const s=structuredClone(app.settings);s.features.videoPlayback=true;app.updateSettings(s);}
        });
        await flush(page,3);
        await page.evaluate(()=>{for(const callback of window.__oldDiagnosticCallbacks)callback();window.__originalDiagnostic.dispatchEvent(new Event('ended'));});
        assert.deepEqual(await page.evaluate(()=>[app._state,window.__diagnosticClicks,window.__originalDiagnostic.__plays,app._videoEl.__plays,app._videoEl.playbackRate]),['PLAYING',1,1,1,1]);
    }));
    for(const nextEnabled of [true,false])await check(`diagnostic ordered audio attachments honor independent nextAudio=${nextEnabled}`,()=>using([outer(2),0],async page=>{
        await diagnosticLesson(page,'audio');
        await page.evaluate(nextEnabled=>{
            const root=window.__diagnosticRoot,old=root.querySelector('iframe'),extra=root.createElement('iframe');extra.className=old.className;root.body.append(extra);
            extra.contentDocument.body.innerHTML=old.contentDocument.body.innerHTML;
            const second=extra.contentDocument.querySelector('#audio_html5_api');second.__paused=true;second.__ended=false;second.__plays=0;
            Object.defineProperties(second,{readyState:{configurable:true,get:()=>second.__readyState??4},paused:{get:()=>second.__paused},ended:{get:()=>second.__ended}});second.play=()=>{second.__plays++;second.__paused=false;return Promise.resolve();};
            window.__secondDiagnostic=second;
            const s=structuredClone(app.settings);s.features.nextAudio=nextEnabled;s.randomDelaysEnabled=true;
            for(const [key,rule]of Object.entries(s.delays))rule.enabled=key==='nextAudio';app.updateSettings(s);app.run({startup:true});
        },nextEnabled);
        await flush(page,3);assert.equal(await state(page),'PLAYING');
        await page.evaluate(()=>{const v=app._videoEl;v.__paused=true;v.__ended=true;v.dispatchEvent(new Event('ended'));});await flush(page);
        if(nextEnabled){assert.equal(await page.evaluate(()=>app._actions.pending.get('video-start')?.category),'nextAudio');await flush(page);}
        assert.deepEqual(await page.evaluate(()=>[app._state,window.__diagnosticPlayers[0].__plays,window.__secondDiagnostic.__plays]),[nextEnabled?'PLAYING':'PAUSED_AUTOMATION',1,nextEnabled?1:0]);
        assert.equal(await page.evaluate(()=>document.querySelector('.posCatalog_active').id),'node0');
    }));
    async function audioLesson(page, variant = '', automatic = false, restart = true) {
        await page.evaluate(({ html, variant, automatic, restart }) => {
            const root = document.querySelector('iframe[info="card"]').contentDocument;
            root.body.innerHTML = '<div><audio id="auditionAudio" controls style="display:none"></audio></div><iframe></iframe>';
            const doc = root.querySelector('iframe').contentDocument; doc.body.innerHTML = html;
            const audio = doc.querySelector('#audio_html5_api'); window.__audio = audio;
            audio.__plays = 0; audio.__paused = true; audio.__ended = false;
            Object.defineProperties(audio, { readyState: { configurable: true, get: () => audio.__readyState ?? 4 }, paused: { get: () => audio.__paused }, ended: { get: () => audio.__ended } });
            audio.play = () => { audio.__plays++; audio.__paused = false; return Promise.resolve(); };
            if (variant === 'secondary-playing') Object.defineProperty(doc.querySelector('#audio1_html5_white'), 'paused', { get: () => false });
            if (variant === 'secondary-visible') doc.querySelector('#audio1_html5').style.display = '';
            if (variant === 'unknown') doc.body.append(doc.createElement('audio'));
            if (variant === 'no-ui') doc.querySelector('.vjs-control-bar').remove();
            if (variant === 'wrong-class') audio.className = '';
            if (variant === 'duplicate') doc.querySelector('.video-js').append(audio.cloneNode());
            if (variant === 'aux-playing') Object.defineProperty(root.querySelector('audio'), 'paused', { get: () => false });
            if (variant === 'unknown-frame') { const f = root.createElement('iframe'); root.body.append(f); f.contentDocument.body.textContent = 'Unknown task'; }
            if (variant === 'inaccessible') Object.defineProperty(root.querySelector('iframe'), 'contentDocument', { get: () => null });
            const settings = JSON.parse(JSON.stringify(app.settings)); settings.randomDelaysEnabled = false;
            if (automatic) settings.features.videoPlayback = false;
            if (variant === 'disabled') settings.features.audioPlayback = false;
            app.updateSettings(settings); if (restart) app.run({ startup: automatic });
        }, { html: audioFixture, variant, automatic, restart });
    }
    await check('audio native primary and inactive secondary preserve fixed speed and marker-gated natural completion', () => using([outer(2), 0], async page => {
        await audioLesson(page);
        assert.deepEqual(await page.evaluate(() => [app._state, window.__audio.__plays, window.__audio.playbackRate, app._discoverMedia().videos.length, app._discoverMedia().audios.length]), ['PLAYING',1,1,0,1]);
        await page.evaluate(() => { window.__audio.__paused = true; app._tryResumePlayback('synthetic focus'); });
        assert.equal(await page.evaluate(() => window.__audio.__plays), 2);
        await page.evaluate(() => { window.__audio.__ended = true; window.__audio.dispatchEvent(new Event('ended')); window.__audio.dispatchEvent(new Event('ended')); });
        await flush(page, 2); assert.equal(await state(page), 'VERIFYING_COMPLETION');
        assert.equal(await page.evaluate(() => document.querySelector('.posCatalog_active').id), 'node0');
        await page.evaluate(() => { const n=document.querySelector('.posCatalog_active'); n.querySelector('input').remove(); n.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>'); });
        await flush(page); assert.equal(await state(page), 'NAVIGATION_COOLDOWN'); // The required five-second preview also applies when random delays are disabled.
        assert.ok(await page.evaluate(() => app._lastNotice.includes('5 秒')));
        await flush(page); assert.equal(await state(page), 'ADVANCING');
        assert.equal(await page.evaluate(() => window.__audio.__plays), 2);
    }));
    await check('audio automatic readiness starts once without video feature dependency', () => using([outer(2), 0], async page => {
        await audioLesson(page, '', true); await flush(page,3);
        assert.equal(await state(page), 'PLAYING'); assert.equal(await page.evaluate(() => window.__audio.__plays),1);
    }));
    for (const variant of ['secondary-playing','secondary-visible','unknown','no-ui','duplicate','aux-playing','unknown-frame','inaccessible']) await check(`audio single-media policy for ${variant}`, () => using([outer(2),0], async page => {
        await audioLesson(page,variant);if(variant==='inaccessible')await flush(page,42);const blocked=['secondary-playing','duplicate','aux-playing','inaccessible'].includes(variant);
        assert.equal(await state(page),blocked?'BLOCKED':'PLAYING'); assert.equal(await page.evaluate(() => window.__audio.__plays),blocked?0:1);
    }));
    await check('audio switch disables playback and new delay categories are independently configured', () => using([outer(2),0], async page => {
        await audioLesson(page,'disabled'); assert.equal(await state(page),'PAUSED_AUTOMATION');
        assert.deepEqual(await page.evaluate(() => [app.settings.delays.audioStart.minMs,app.settings.delays.nextAudio.maxMs,window.__audio.__plays]),[300,1500,0]);
    }));
    await check('audio settings migrate version one without resetting customized legacy fields', () => using([outer(),1], async page => {
        assert.equal(await page.evaluate(() => {
            const old=JSON.parse(JSON.stringify(app.settings)); delete old.features.audioPlayback; delete old.features.nextAudio;
            delete old.delays.audioStart; delete old.delays.nextAudio;
            old.features.background=false; old.preset='custom'; old.delays.videoStart={enabled:false,minMs:234,maxMs:789};
            if (!app.updateSettings(old)) return false;
            const s=app.settings;
            const malformed=JSON.parse(JSON.stringify(s)); malformed.delays.audioStart.minMs=-1;
            return !s.features.background && s.delays.videoStart.minMs===234 && !s.delays.videoStart.enabled && s.features.audioPlayback &&
                s.delays.audioStart.minMs===300 && !app.updateSettings(malformed) && app.settings===s;
        }),true);
    }));
    async function attachments(page, variant = '', restart = true) {
        await page.evaluate(({ variant, restart }) => {
            const root = document.querySelector('iframe[info="card"]').contentDocument;
            root.body.innerHTML = '<div><audio id="auditionAudio" controls style="display:none"></audio></div>';
            window.__attachmentVideos = [];
            for (let i = 0; i < 5; i++) {
                const frame = root.createElement('iframe'); frame.className = 'ans-attach-online ' + (i < 4 ? 'ans-insertvideo-online' : 'insertdoc-online-pdf');
                root.body.append(frame);
                if (i < 4) {
                    const v = frame.contentDocument.createElement('video'); v.id = 'video_html5_api';
                    v.__paused = true; v.__ended = false; v.__plays = 0;
                    Object.defineProperties(v, { readyState: { configurable: true, get: () => v.__readyState ?? 4 }, paused: { get: () => v.__paused }, ended: { get: () => v.__ended } });
                    v.play = () => { v.__paused = false; v.__plays++; return Promise.resolve(); };
                    frame.contentDocument.body.append(v); window.__attachmentVideos.push(v);
                }
            }
            const frames = root.querySelectorAll('iframe');
            if (variant === 'unknown') frames[2].className = 'unknown';
            if (variant === 'inaccessible') Object.defineProperty(frames[2], 'contentDocument', { get: () => null });
            if (variant === 'extra') frames[1].contentDocument.body.append(frames[1].contentDocument.querySelector('video').cloneNode());
            if (variant === 'audio') root.querySelector('audio').id = 'unknownAudio';
            if (variant === 'sibling') window.__attachmentVideos[2].__paused = false;
            const settings = JSON.parse(JSON.stringify(app.settings)); settings.features.document = false;
            settings.randomDelaysEnabled = false; app.updateSettings(settings); if (restart) (app._recovery?.resumeExplicitly(),app.run());
        }, { variant, restart });
    }
    async function selectSidebar(page, index = 1) {
        await page.evaluate(index => {
            window.__obsoleteMedia = app._videoEl;
            const labels = [...document.querySelectorAll('#coursetree .posCatalog_name')];
            labels[index].onclick = () => {
                document.querySelector('.posCatalog_active').classList.remove('posCatalog_active');
                labels[index].closest('.posCatalog_select').classList.add('posCatalog_active');
            };
            labels[index].click();
        }, index);
    }
    await check('sidebar single video to single video without reload cancels obsolete ended and starts once', () => using([outer(3),1], async page => {
        const generation = await page.evaluate(() => app._generation);
        await selectSidebar(page); assert.equal(await state(page),'WAITING_CATALOG');
        await page.evaluate(() => {
            window.__obsoleteMedia.__ended=true; window.__obsoleteMedia.dispatchEvent(new Event('ended'));
            document.querySelector('iframe').contentDocument.body.replaceChildren(); window.__addVideos(1);
        });
        await flush(page,5);
        assert.deepEqual(await page.evaluate(() => [app._state,app._videoEl.__plays,app._generation]),['PLAYING',1,generation+1]);
    }));
    await check('sidebar video to audio and audio to ordered attachments reuse bounded readiness', () => using([outer(3),1], async page => {
        await selectSidebar(page); await audioLesson(page,'',false,false); await flush(page,5);
        assert.deepEqual(await page.evaluate(() => [app._state,app._videoEl.tagName,app._videoEl.__plays]),['PLAYING','AUDIO',1]);
        await selectSidebar(page,2); await attachments(page,'',false); await flush(page,5);
        assert.deepEqual(await page.evaluate(() => [app._state,app._videoEl.tagName,window.__attachmentVideos.map(v=>v.__plays)]),['PLAYING','VIDEO',[1,0,0,0]]);
    }));
    await check('sidebar fast repeated selections invalidate stale wait callbacks', () => using([outer(3),1], async page => {
        await selectSidebar(page,1);
        await page.evaluate(() => { window.__oldWait=[...window.__timeouts.values()][0]; });
        await selectSidebar(page,2);
        await page.evaluate(() => { document.querySelector('iframe').contentDocument.body.replaceChildren(); window.__addVideos(1); window.__oldWait(); });
        await flush(page,5); assert.equal(await state(page),'PLAYING');
        assert.equal(await page.evaluate(() => [app._videoEl.__plays,document.querySelector('.posCatalog_active').id].join(',')),'1,node2');
    }));
    await check('sidebar unchanged catalog replacement does not restart completed logical media', () => using([outer(2),1], async page => {
        const generation=await page.evaluate(()=>app._generation);
        await page.evaluate(()=>{const n=document.querySelector('.posCatalog_active'); n.replaceWith(n.cloneNode(true));});
        await flush(page,2);
        assert.equal(await page.evaluate(()=>app._generation),generation);
        assert.equal(await page.evaluate(()=>app._videoEl.__plays),1);
    }));
    await check('sidebar after delayed boot cannot reuse old media as evidence of new lesson content', () => using([outer(2),0,false,'auto-missing-card',false,false,true],async page=>{
        await page.evaluate(()=>{const f=document.createElement('iframe');f.setAttribute('info','card');document.body.append(f);window.__addVideos(1);});
        await flush(page,4);assert.equal(await state(page),'PLAYING');
        await selectSidebar(page);await flush(page,4);assert.equal(await state(page),'WAITING_CATALOG');
        assert.equal(await page.evaluate(()=>window.__obsoleteMedia.__plays),1);
    }));
    await check('multi-attachment document-only startup preserves disabled PDF as pending',()=>using([outer(2),0],async page=>{
        await page.evaluate(()=>{const root=document.querySelector('iframe').contentDocument;root.body.innerHTML='<iframe class="ans-attach-online insertdoc-online-pdf"></iframe>';const s=JSON.parse(JSON.stringify(app.settings));s.features.document=false;app.updateSettings(s);app.run({startup:true});});
        await flush(page,3);assert.equal(await state(page),'PAUSED_AUTOMATION');
        assert.equal(await page.evaluate(()=>app._discoverMedia().tasks[0].status),'pending');
    }));
    await check('sidebar no proven content change times out safely and destruction cancels waits', () => using([outer(2),1], async page => {
        await selectSidebar(page); await flush(page,41); assert.equal(await state(page),'BLOCKED');
        await selectSidebar(page,0); await page.evaluate(()=>app.destroy()); await flush(page,41);
        assert.equal(await page.evaluate(()=>app._timers.size),0);
    }));
    await check('sidebar assessment remains unanswered and unsupported live remains manual', () => using([outer(3),1,false,null,false,'recorded'], async page => {
        await selectSidebar(page);
        await page.evaluate(()=>{document.querySelector('.prev_title').title='章节测验'; document.querySelector('iframe').contentDocument.body.innerHTML='<form>Assessment</form>';});
        await flush(page,4); assert.equal(await page.evaluate(()=>app._isPlaying),false);
        await selectSidebar(page,2);
        await page.evaluate(()=>{document.querySelector('.prev_title').title='直播'; const f=document.querySelector('iframe[info="card"]'); f.id='iframe'; f.contentDocument.body.innerHTML='<a class="liveHref" href="javascript:void(0);"><div class="liveCard"><div class="live-ct">Synthetic live</div></div></a>';});
        await flush(page,25); assert.equal(await state(page),'BLOCKED'); // Bounded optional-companion discovery expires.
    }));
    await check('multi-attachment inventory preserves ordered four videos and pending PDF', () => using([outer(2), 0], async page => {
        await attachments(page);
        assert.deepEqual(await page.evaluate(() => app._discoverMedia().tasks.map(t => [t.kind, t.position])), [['video',0],['video',1],['video',2],['video',3],['document',4]]);
        for (let i = 0; i < 4; i++) {
            assert.deepEqual(await page.evaluate(() => window.__attachmentVideos.map(v => v.__plays)), [0,1,2,3].map(j => j <= i ? 1 : 0));
            await page.evaluate(i => { const v = window.__attachmentVideos[i]; v.__paused = true; v.__ended = true; v.dispatchEvent(new Event('ended')); v.dispatchEvent(new Event('ended')); }, i);
            await flush(page, 2);
        }
        assert.equal(await state(page), 'PAUSED_AUTOMATION');
        assert.equal(await page.evaluate(() => app._discoverMedia().tasks[4].status), 'pending');
        assert.equal(await page.evaluate(() => document.querySelector('.posCatalog_active').id), 'node0');
        assert.equal(await page.evaluate(() => document.querySelector('iframe').contentDocument.querySelector('audio').paused), true);
    }));
    for (const variant of ['unknown', 'inaccessible', 'extra', 'audio', 'sibling']) await check(`multi-attachment rejects ${variant}`, () => using([outer(2), 0], async page => {
        await attachments(page, variant); assert.equal(await state(page), variant==='audio'?'PLAYING':'BLOCKED');
        assert.equal(await page.evaluate(() => window.__attachmentVideos.reduce((n, v) => n + v.__plays, 0)), variant==='audio'?1:0);
    }));
    await check('multi-attachment replacement invalidates completion and enabled unknown PDF stays unfinished', () => using([outer(2), 0], async page => {
        await attachments(page);
        await page.evaluate(() => { const f = document.querySelector('iframe').contentDocument.querySelector('iframe'); f.remove(); app.play(); });
        assert.equal(await state(page), 'BLOCKED');
        await attachments(page);
        await page.evaluate(() => { const s = JSON.parse(JSON.stringify(app.settings)); s.features.document = true; app.updateSettings(s); });
        for (let i = 0; i < 4; i++) { await page.evaluate(i => { const v=window.__attachmentVideos[i]; v.__paused=true; v.__ended=true; v.dispatchEvent(new Event('ended')); },i); await flush(page,2); }
        assert.equal(await state(page), 'BLOCKED');
    }));
    const autoOptions = [outer(2), 1, false, null, false, false, true];
    const bootRuns = page => page.evaluate(() => window.__logs.filter(line => line.includes('优化版启动')).length);
    await check('automatic startup reviewed baseline reproduces premature missing-frame failure', () => using([outer(2), 0, false, 'auto-missing-card', false, false, true, reviewedStartup], async page => {
        assert.equal(await state(page), 'BLOCKED');
        await page.evaluate(() => { const frame = document.createElement('iframe'); frame.setAttribute('info', 'card'); document.body.append(frame); window.__addVideos(1); });
        await flush(page, 4); assert.equal(await state(page), 'BLOCKED');
        assert.equal(await bootRuns(page), 1);
    }));
    await check('automatic startup starts one ordinary video without manual app.run', () => using(autoOptions, async page => {
        assert.equal(await state(page), 'WAITING_STARTUP');
        await flush(page, 3);
        assert.deepEqual(await page.evaluate(() => [app._state, app._videoEl.__plays, app._videoEl.playbackRate]), ['PLAYING', 1, 1]);
        assert.equal(await bootRuns(page), 1);
    }));
    await check('automatic startup waits for a delayed course iframe without repeated runs', () => using([outer(2), 0, false, 'auto-missing-card', false, false, true], async page => {
        await flush(page, 4); assert.equal(await state(page), 'WAITING_STARTUP');
        await page.evaluate(() => { const frame = document.createElement('iframe'); frame.setAttribute('info', 'card'); document.body.append(frame); window.__addVideos(1); });
        await flush(page, 4);
        assert.equal(await state(page), 'PLAYING'); assert.equal(await bootRuns(page), 1);
    }));
    await check('automatic startup waits for document readiness', () => using([outer(2), 1, false, 'auto-document-loading', false, false, true], async page => {
        await flush(page, 3); assert.equal(await state(page), 'WAITING_STARTUP');
        await page.evaluate(() => { window.__documentReady = 'complete'; }); await flush(page, 3);
        assert.equal(await state(page), 'PLAYING'); assert.equal(await bootRuns(page), 1);
    }));
    await check('automatic startup accepts an already loaded empty placeholder leaf without executing its URL', () => using([outer(2), 1, true, 'auto-blank-leaf', false, false, true], async page => {
        await flush(page, 4); assert.equal(await state(page), 'PLAYING'); assert.equal(await bootRuns(page), 1);
    }));
    await check('automatic startup waits for delayed catalog activation', () => using([outer(0), 1, false, null, false, false, true], async page => {
        await flush(page, 3); assert.equal(await state(page), 'WAITING_STARTUP');
        await page.evaluate(markup => { document.querySelector('#coursetree ul li ul').innerHTML = markup; }, node(0, true));
        await flush(page, 4); assert.equal(await state(page), 'PLAYING'); assert.equal(await bootRuns(page), 1);
    }));
    await check('automatic startup waits for task/step titles before capturing action context', () => using([outer(2, false, '').replace('title="Content 0">Content 0', 'title="">'), 1, false, null, false, false, true], async page => {
        await flush(page, 3); assert.equal(await state(page), 'WAITING_STARTUP');
        await page.evaluate(() => { document.querySelector('.prev_title').title = '视频'; const label = document.querySelector('#node0 .posCatalog_name'); label.title = 'Content 0'; label.textContent = 'Content 0'; });
        await flush(page, 4); assert.equal(await state(page), 'PLAYING'); assert.equal(await bootRuns(page), 1);
    }));
    await check('automatic startup preserves ordinary video pages without a step-title widget', () => using([outer(2).replace('<div class="prev_title" title="视频"></div>', ''), 1, false, null, false, false, true], async page => {
        await flush(page, 4); assert.equal(await state(page), 'PLAYING'); assert.equal(await bootRuns(page), 1);
    }));
    await check('automatic startup manual takeover cancels the pending boot rather than doubling playback', () => using(autoOptions, async page => {
        await page.evaluate(() => { const pending = [...window.__timeouts.values()]; app.run(); for (const fn of pending) fn(); });
        await flush(page, 4);
        assert.deepEqual(await page.evaluate(() => [app._state, app._videoEl.__plays, app._startupCancel]), ['PLAYING', 1, null]);
        assert.equal(await bootRuns(page), 2);
    }));
    await check('automatic startup waits for nested audition player initialization and preserves background playback', () => using([outer(2), 1, false, 'audition-match', false, false, true], async page => {
        await page.evaluate(() => { window.__lateVideo = document.querySelector('iframe').contentDocument.querySelector('iframe').contentDocument.querySelector('video'); window.__lateVideo.remove(); });
        await flush(page, 3); assert.equal(await state(page), 'WAITING_STARTUP');
        await page.evaluate(() => window.__lateVideo.ownerDocument.body.append(window.__lateVideo)); await flush(page, 4);
        assert.equal(await state(page), 'PLAYING');
        await page.evaluate(() => { app._guardLastResumeTs = -Infinity; app._videoEl.__paused = true; window.dispatchEvent(new Event('blur')); });
        assert.deepEqual(await page.evaluate(() => [app._state, app._videoEl.__paused, app._videoEl.playbackRate]), ['PLAYING', false, 1]);
        assert.equal(await bootRuns(page), 1);
    }));
    await check('automatic startup tolerates only same-document initial frame load signals', () => using(autoOptions, async page => {
        await flush(page); assert.equal(await state(page), 'ACTION_PENDING');
        await page.evaluate(() => document.querySelector('iframe').dispatchEvent(new Event('load')));
        assert.equal(await page.evaluate(() => app._actions.pending.size), 1);
        await flush(page); assert.equal(await state(page), 'PLAYING');
    }));
    await check('automatic startup rejects a changed document during the start delay', () => using(autoOptions, async page => {
        await flush(page); assert.equal(await state(page), 'ACTION_PENDING');
        await page.evaluate(() => { const frame = document.createElement('iframe'); frame.setAttribute('info', 'card'); document.querySelector('iframe').replaceWith(frame); window.__addVideos(1); });
        await flush(page, 3); assert.equal(await state(page), 'BLOCKED');
    }));
    await check('automatic startup has bounded failure and a safe manual retry without stale boot actions', () => using([outer(2), 0, false, 'auto-missing-card', false, false, true], async page => {
        await page.evaluate(() => { window.__oldBootCallbacks = [...window.__timeouts.values()]; });
        await flush(page, 45); assert.equal(await state(page), 'BLOCKED');
        assert.equal(await bootRuns(page), 1);
        await page.evaluate(async () => {
            const frame = document.createElement('iframe'); frame.setAttribute('info', 'card');
            const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
            document.body.append(frame); await loaded; window.__addVideos(1);
        });
        await page.evaluate(() => { app._recovery.resumeExplicitly(); app.run(); for (const fn of window.__oldBootCallbacks) fn(); }); await flush(page, 3);
        assert.deepEqual(await page.evaluate(() => [app._state, app._videoEl.__plays]), ['PLAYING', 1]);
        assert.equal(await bootRuns(page), 2);
    }));
    await check('automatic startup duplicate boot callbacks never create another controller or play action', () => using(autoOptions, async page => {
        await page.evaluate(() => { window.__originalApp = app; window.__bootFunction(); window.__bootFunction(); });
        await flush(page, 6);
        assert.deepEqual(await page.evaluate(() => [app === window.__originalApp, app._videoEl.__plays, document.querySelectorAll('#xuexitong-v3-settings').length]), [true, 1, 1]);
        assert.equal(await bootRuns(page), 1);
    }));
    for (const cancel of ['destroy', 'pagehide', 'disable', 'click', 'task-change']) {
        await check(`automatic startup cancels before playback: ${cancel}`, () => using(autoOptions, async page => {
            if (cancel === 'click') await page.locator('#node0 .posCatalog_name').click();
            else await page.evaluate(cancel => {
                if (cancel === 'destroy') app.destroy();
                if (cancel === 'pagehide') window.dispatchEvent(new Event('pagehide'));
                if (cancel === 'disable') { const settings = structuredClone(app.settings); settings.features.videoPlayback = false; app.updateSettings(settings); }
                if (cancel === 'task-change') { document.querySelector('#node0').classList.remove('posCatalog_active'); document.querySelector('#node1').classList.add('posCatalog_active'); }
            }, cancel);
            await flush(page, 5);
            assert.notEqual(await state(page), 'PLAYING');
            assert.equal(await page.evaluate(() => document.querySelector('iframe').contentDocument.querySelector('video').__plays), 0);
        }));
    }
    await check('complex 20-document topology without ownership remains blocked and exposes redacted reasons', () => using([outer(2), 2, false, 'complex-normal'], async page => {
        const result = await page.evaluate(() => { const m = app._discoverMedia(); return [m.documents.length, m.videos.length, m.inaccessible, m.unsupported, m.reasons]; });
        assert.deepEqual(result.slice(0, 4), [20, 2, false, true]);
        assert.ok(result[4].includes('ambiguous-player-branches'));
        assert.equal(await state(page), 'BLOCKED');
    }));
    await check('complex explicit synthetic ownership selects active player and never wakes inactive player', () => using([outer(2), 2, false, 'complex-normal'], async page => {
        await page.evaluate(() => { app.taskAdapter = window.__ownershipAdapter; app._recovery.resumeExplicitly(); app.run(); });
        assert.deepEqual(await page.evaluate(() => [app._state, app._discoverMedia().documents.length, app._discoverMedia().videos.length, ...window.__complexVideos.map(v => v.__plays)]), ['PLAYING', 20, 1, 1, 0]);
        const indices = await page.evaluate(() => { const docs = app._discoverMedia().documents; return window.__complexVideos.map(v => docs.indexOf(v.ownerDocument)); });
        assert.deepEqual(indices, [1, 8]);
    }));
    await check('complex explicit synthetic ownership can start automatically without app.run', () => using([outer(2), 2, false, 'complex-normal', false, false, true], async page => {
        await page.evaluate(() => { app.taskAdapter = window.__ownershipAdapter; }); await flush(page, 5);
        assert.deepEqual(await page.evaluate(() => [app._state, ...window.__complexVideos.map(v => v.__plays)]), ['PLAYING', 1, 0]);
        assert.equal(await bootRuns(page), 1);
    }));
    for (const variant of ['visible-inactive', 'playing-inactive', 'no-active-player', 'unknown-audio', 'unknown-leaf', 'wrapper-form', 'inaccessible', 'unverified', 'unclassified-audio']) {
        await check(`complex ownership distinguishes task boundaries from UI: ${variant}`, () => using([outer(2), 2, false, `complex-${variant}`], async page => {
            await page.evaluate(() => { app.taskAdapter = window.__ownershipAdapter; app._recovery.resumeExplicitly(); app.run(); });
            const uiOnly=['unknown-audio','wrapper-form','unclassified-audio'].includes(variant);
            assert.equal(await state(page),uiOnly?'PLAYING':'BLOCKED');
            assert.deepEqual(await page.evaluate(() => window.__complexVideos.map(v => v.__plays)),uiOnly?[1,0]:[0,0]);
        }));
    }
    await check('complex ownership loss stops old callbacks rather than switching players', () => using([outer(2), 2, false, 'complex-normal'], async page => {
        await page.evaluate(() => { app.taskAdapter = window.__ownershipAdapter; app._recovery.resumeExplicitly(); app.run(); window.__ownershipVerified = false; app._checkVideoStatus(); });
        assert.equal(await state(page), 'BLOCKED');
        assert.deepEqual(await page.evaluate(() => window.__complexVideos.map(v => v.__plays)), [1, 0]);
    }));
    for (const complex of [false, true]) {
        await check(`automatic startup completion and catalog replacement navigate once; complex profile=${complex}`, () => using([
            outer(2), complex ? 2 : 1, false, complex ? 'complex-normal' : null, false, false, true,
        ], async page => {
            if (complex) await page.evaluate(() => { app.taskAdapter = window.__ownershipAdapter; });
            await flush(page, 5); assert.equal(await state(page), 'PLAYING');
            await page.evaluate(() => {
                window.__autoOld = app._videoEl; window.__autoClicks = 0;
                document.querySelector('#node1 span').onclick = () => {
                    window.__autoClicks++; document.querySelector('.posCatalog_active').classList.remove('posCatalog_active'); document.querySelector('#node1').classList.add('posCatalog_active');
                    const frame = document.createElement('iframe'); frame.setAttribute('info', 'card'); document.querySelector('iframe[info="card"]').replaceWith(frame); window.__addVideos(1);
                };
                const node = document.querySelector('#node0'), replacement = node.cloneNode(true); replacement.querySelector('input').value = '0'; replacement.insertAdjacentHTML('beforeend', '<span class="icon_Completed"></span>'); node.replaceWith(replacement);
                window.__autoOld.__ended = true; window.__autoOld.__paused = true; window.__autoOld.dispatchEvent(new Event('ended')); window.__autoOld.dispatchEvent(new Event('ended'));
            });
            await flush(page); assert.equal(await state(page), 'NAVIGATION_COOLDOWN');
            await flush(page); await page.waitForTimeout(20); await flush(page, 3);
            assert.deepEqual(await page.evaluate(() => [app._state, window.__autoClicks, window.__autoOld.__plays, app._videoEl?.playbackRate]), ['PLAYING', 1, 1, 1]);
            if (complex) assert.equal(await page.evaluate(() => window.__complexVideos[1].__plays), 0);
        }));
    }
    async function prepareRerender(page) {
        await page.evaluate(() => {
            window.__originalVideo = app._videoEl; window.__navigationClicks = 0;
            window.__markCurrent = (confirmed = true) => {
                const node = document.querySelector('.posCatalog_active');
                node.querySelector('input').value = '0';
                if (confirmed && !node.querySelector('.icon_Completed')) node.insertAdjacentHTML('beforeend', '<span class="icon_Completed"></span>');
            };
            window.__replaceCurrent = (scope = 'node') => {
                const node = document.querySelector('.posCatalog_active');
                const old = scope === 'tree' ? document.querySelector('#coursetree') : scope === 'chapter' ? app._chapterOf(node) : node;
                old.replaceWith(old.cloneNode(true));
            };
            window.__endOriginal = (native = true) => {
                window.__originalVideo.__ended = true; window.__originalVideo.__paused = true;
                if (native) window.__originalVideo.dispatchEvent(new Event('ended'));
            };
            document.addEventListener('click', event => {
                if (event.target.closest?.('.posCatalog_name')?.parentElement.id !== 'node1') return;
                window.__navigationClicks++;
                document.querySelector('.posCatalog_active').classList.remove('posCatalog_active');
                document.querySelector('#node1').classList.add('posCatalog_active');
                const frame = document.createElement('iframe'); frame.setAttribute('info', 'card');
                window.__navigationLoad=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
                document.querySelector('iframe[info="card"]').replaceWith(frame); window.__addVideos(1);
            });
        });
    }
    for (const phase of ['playing', 'before-ended', 'monitor-first', 'after-ended', 'late-marker', 'cooldown', 'cooldown-tree', 'chapter', 'tree', 'chapter-no-ids', 'tree-no-ids', 'cooldown-tree-no-ids']) {
        const html = phase.endsWith('no-ids') ? rerenderCatalog.replaceAll(/id="synthetic-chapter-[ab]"/g, '') : rerenderCatalog;
        await check(`catalog rerender ${phase}: actual next-task click and normal playback`, () => using([html, 1, false, null, true], async page => {
            await prepareRerender(page);
            if (['after-ended', 'late-marker'].includes(phase)) {
                await page.evaluate(() => window.__endOriginal());
                if (phase === 'late-marker') await flush(page);
                await page.evaluate(() => { window.__replaceCurrent(); window.__markCurrent(); });
            } else if (phase.startsWith('cooldown')) {
                await page.evaluate(() => { window.__markCurrent(); window.__endOriginal(); }); await flush(page);
                assert.equal(await state(page), 'NAVIGATION_COOLDOWN');
                await page.evaluate(phase => window.__replaceCurrent(phase.startsWith('cooldown-tree') ? 'tree' : 'node'), phase);
                assert.equal(await page.evaluate(() => app._actions.pending.size), 1);
            } else {
                await page.evaluate(phase => {
                    window.__replaceCurrent(phase.startsWith('chapter') ? 'chapter' : phase.startsWith('tree') ? 'tree' : 'node');
                    if (phase === 'playing') app._checkVideoStatus();
                    window.__markCurrent(); window.__endOriginal(phase !== 'monitor-first');
                    if (phase === 'monitor-first') { app._checkVideoStatus(); app._tryResumePlayback('ended-focus'); window.__originalVideo.dispatchEvent(new Event('ended')); }
                }, phase);
            }
            await flush(page, 3); await page.evaluate(()=>window.__navigationLoad); await flush(page,6);
            assert.deepEqual(await page.evaluate(() => [window.__navigationClicks, app._state, app._videoEl !== window.__originalVideo, app._videoEl.playbackRate,
                window.__originalVideo.__plays]), [1, 'PLAYING', true, 1, 1]);
        }));
    }
    await check('catalog rerender nested audition video survives leaf replacement without a chapter ID', () => using([
        rerenderCatalog.replace('id="synthetic-chapter-a"', ''), 1, false, 'audition-match', true,
    ], async page => {
        await prepareRerender(page);
        await page.evaluate(() => { window.__replaceCurrent(); window.__markCurrent(); window.__endOriginal(); });
        await flush(page, 3); await page.evaluate(()=>window.__navigationLoad); await flush(page,6);
        assert.deepEqual(await page.evaluate(() => [app._state, window.__navigationClicks, window.__originalVideo.__plays, app._videoEl.playbackRate]), ['PLAYING', 1, 1, 1]);
    }));
    for (const failure of ['different-task', 'same-title-wrong-id', 'duplicate-id', 'ambiguous-active', 'wrong-chapter', 'player', 'document', 'url', 'no-node-key', 'no-chapter-key', 'mutated-node-key', 'mutated-chapter-key', 'topology-missing-key', 'topology-order', 'topology-group', 'topology-duplicate-key']) {
        let html = rerenderCatalog;
        if (failure === 'no-node-key') html = html.replace('id="node0"', '');
        if (failure === 'no-chapter-key') html = html.replace('id="synthetic-chapter-a"', '');
        if (failure.startsWith('topology-')) html = html.replaceAll(/id="synthetic-chapter-[ab]"/g, '');
        await check(`catalog rerender refuses unproven continuity: ${failure}`, () => using([html, 1], async page => {
            await prepareRerender(page);
            await page.evaluate(failure => {
                if (failure === 'different-task') { document.querySelector('#node0').classList.remove('posCatalog_active'); document.querySelector('#node1').classList.add('posCatalog_active'); }
                else if (failure === 'player') { window.__originalVideo.remove(); window.__addVideos(1); }
                else if (failure === 'document') { const frame = document.createElement('iframe'); frame.setAttribute('info', 'card'); document.querySelector('iframe').replaceWith(frame); window.__addVideos(1); }
                else if (failure === 'url') location.hash = 'different-task';
                else if (failure === 'mutated-node-key') document.querySelector('#node0').id = 'other-task';
                else if (failure === 'mutated-chapter-key') document.querySelector('#synthetic-chapter-a').id = 'other-chapter';
                else if (failure.startsWith('topology-')) {
                    window.__replaceCurrent('tree');
                    const current = document.querySelector('#node0'), target = document.querySelector('#node1');
                    if (failure === 'topology-missing-key') target.removeAttribute('id');
                    if (failure === 'topology-order') document.querySelector('#coursetree > ul').prepend(target.closest('#coursetree > ul > li'));
                    if (failure === 'topology-group') current.closest('ul').append(target.closest('li'));
                    if (failure === 'topology-duplicate-key') target.closest('ul').append(target.closest('li').cloneNode(true));
                }
                else if (failure === 'no-chapter-key') {
                    window.__replaceCurrent('chapter');
                    const li = document.createElement('li'); li.innerHTML = '<div id="new-learning-item" class="posCatalog_select"><span class="posCatalog_name" title="New content">New content</span></div>';
                    document.querySelector('.posCatalog_active').closest('ul').append(li);
                }
                else {
                    window.__replaceCurrent(); const node = document.querySelector('.posCatalog_active');
                    if (failure === 'same-title-wrong-id') node.id = 'other-task';
                    if (failure === 'duplicate-id' || failure === 'ambiguous-active') {
                        const duplicate = node.cloneNode(true);
                        if (failure === 'duplicate-id') duplicate.classList.remove('posCatalog_active'); else duplicate.id = 'same-title-other-key';
                        const li = document.createElement('li'); li.append(duplicate); node.closest('ul').append(li);
                    }
                    if (failure === 'wrong-chapter') document.querySelector('#synthetic-chapter-b ul').append(node);
                }
                app._checkVideoStatus(); window.__endOriginal();
            }, failure);
            await flush(page, 3);
            assert.equal(await state(page), 'BLOCKED');
            assert.equal(await page.evaluate(() => window.__navigationClicks), 0);
        }));
    }
    for (const marker of ['absent', 'zero-only']) {
        await check(`catalog rerender cannot replace completion evidence: ${marker}`, () => using([rerenderCatalog, 1], async page => {
            await prepareRerender(page);
            await page.evaluate(marker => { window.__replaceCurrent(); if (marker === 'zero-only') window.__markCurrent(false); window.__endOriginal(); }, marker);
            await flush(page, 12);
            assert.equal(await state(page), 'BLOCKED'); assert.equal(await page.evaluate(() => window.__navigationClicks), 0);
        }));
    }
    await check('catalog rerender duplicates/stale completion callbacks never navigate or replay twice', () => using([rerenderCatalog, 1], async page => {
        await prepareRerender(page);
        await page.evaluate(() => {
            window.__replaceCurrent(); window.__markCurrent(); window.__endOriginal(false);
            app._guardLastResumeTs = -Infinity; app._tryResumePlayback('ended-focus');
            window.__endOriginal(); app._checkVideoStatus(); window.__endOriginal();
            window.__staleCompletionTimers = [...window.__timeouts.values()];
        });
        assert.equal(await page.evaluate(() => app._timers.size), 1);
        await flush(page, 3);
        await page.evaluate(() => { for (const fn of window.__staleCompletionTimers) fn(); app._handleVideoEnded({ target: window.__originalVideo }); });
        assert.deepEqual(await page.evaluate(() => [app._state, window.__navigationClicks, app._videoEl.__plays, window.__originalVideo.__plays]), ['PLAYING', 1, 1, 1]);
    }));
    await check('catalog rerender while play promise resolves still starts monitoring and eventually navigates once', () => using([rerenderCatalog, 1], async page => {
        await prepareRerender(page);
        await page.evaluate(async () => {
            app._cancelTasks(); app._state = 'READY'; app._isPlaying = false;
            const v = window.__originalVideo; v.__plays = 0;
            v.play = () => { v.__plays++; return new Promise(resolve => { window.__resolvePlay = resolve; }); };
            const pending = app.play(true); window.__replaceCurrent(); window.__resolvePlay(); await pending;
        });
        assert.equal(await page.evaluate(() => app._checkInterval !== null), true);
        await page.evaluate(() => { window.__markCurrent(); window.__endOriginal(); }); await flush(page, 3);
        assert.deepEqual(await page.evaluate(() => [app._state, window.__navigationClicks, window.__originalVideo.__plays]), ['PLAYING', 1, 1]);
    }));
    for (const pending of ['recovery', 'initial-play', 'muted-error']) {
        await check(`catalog rerender ended before ${pending} rejection cannot trigger another play`, () => using([rerenderCatalog, 1], async page => {
            await prepareRerender(page);
            await page.evaluate(async pending => {
                const video = window.__originalVideo; video.__plays = 0; video.__paused = true;
                video.play = () => { video.__plays++; return new Promise((_, reject) => { window.__rejectPlay = reject; }); };
                let playing;
                if (pending === 'initial-play') { app._cancelTasks(); app._state = 'READY'; app._isPlaying = false; playing = app.play(true); }
                else if (pending === 'recovery') { app._guardLastResumeTs = -Infinity; app._tryResumePlayback('synthetic-recovery'); }
                else app._handlePlayError(new Error('Synthetic initial failure'));
                window.__replaceCurrent(); window.__markCurrent(); window.__endOriginal(false);
                window.__rejectPlay(new Error('Synthetic pending rejection'));
                if (playing) await playing; else { await Promise.resolve(); await Promise.resolve(); }
            }, pending);
            assert.equal(await state(page), 'VERIFYING_COMPLETION');
            await flush(page, 3);
            assert.deepEqual(await page.evaluate(() => [app._state, window.__navigationClicks, window.__originalVideo.__plays]), ['PLAYING', 1, 1]);
        }));
    }
    await check('catalog rerender rejects a changed media source even when the same video element is reused', () => using([rerenderCatalog, 1], async page => {
        await prepareRerender(page);
        await page.evaluate(async () => {
            app._cancelTasks(); app._state = 'READY'; app._isPlaying = false;
            window.__mediaSource = 'https://media.test/synthetic-original.mp4';
            Object.defineProperty(window.__originalVideo, 'currentSrc', { get: () => window.__mediaSource });
            await app.play(true);
            window.__replaceCurrent(); window.__mediaSource = 'https://media.test/synthetic-different.mp4'; app._checkVideoStatus();
        });
        await flush(page, 3);
        assert.deepEqual(await page.evaluate(() => [app._state, window.__navigationClicks]), ['BLOCKED', 0]);
    }));
    for (const invalid of ['duplicate-target', 'changed-target', 'duplicate-current-key']) {
        await check(`catalog rerender cancels ambiguous cooldown destination: ${invalid}`, () => using([rerenderCatalog, 1, false, null, true], async page => {
            await prepareRerender(page);
            await page.evaluate(() => { window.__markCurrent(); window.__endOriginal(); }); await flush(page);
            assert.equal(await state(page), 'NAVIGATION_COOLDOWN');
            await page.evaluate(invalid => {
                window.__replaceCurrent('tree');
                const target = document.querySelector(invalid === 'duplicate-current-key' ? '#node0' : '#node1');
                if (invalid === 'changed-target') target.id = 'other-target';
                else { const duplicate = target.cloneNode(true); duplicate.classList.remove('posCatalog_active'); const li = document.createElement('li'); li.append(duplicate); target.closest('ul').append(li); }
            }, invalid);
            await flush(page, 3);
            assert.deepEqual(await page.evaluate(() => [app._state, window.__navigationClicks]), ['BLOCKED', 0]);
        }));
    }
    await check('catalog rerender defers the approved assessment without completing or submitting it', () => using([rerenderCatalog.replace('</ul></li>\n<li id="synthetic-chapter-b"', '<li><div id="deferred-assessment" class="posCatalog_select"><span class="posCatalog_name" title="章节测试">章节测试</span><input value="1"></div></li></ul></li>\n<li id="synthetic-chapter-b"'), 1], async page => {
        await prepareRerender(page);
        await page.evaluate(() => { window.__submits = 0; document.addEventListener('submit', () => window.__submits++); window.__replaceCurrent(); window.__markCurrent(); window.__endOriginal(); });
        await flush(page, 3);
        assert.deepEqual(await page.evaluate(() => [app._state, window.__navigationClicks, document.querySelector('#deferred-assessment input').value, window.__submits]), ['PLAYING', 1, '1', 0]);
    }));
    for (const variant of ['match', 'id', 'visible', 'playing', 'duplicate', 'no-video', 'nested', 'class', 'controls', 'parent', 'progress', 'autoplay', 'seeking', 'extra-video', 'extra-frame', 'unknown-leaf', 'other-audio', 'inaccessible']) {
        await check(`audition audio structural classification: ${variant}`, () => using([outer(2), 1, false, `audition-${variant}`], async page => {
            if(variant==='no-video')await flush(page,45);
            const blocked=['playing','autoplay','seeking','extra-video','no-video'].includes(variant);
            assert.equal(await state(page),blocked?'BLOCKED':'PLAYING');
            if (variant === 'unknown-leaf') await page.evaluate(() => {
                const root = document.querySelector('iframe').contentDocument;
                const leaf = root.querySelector('iframe').contentDocument.querySelector('iframe').contentDocument;
                app.taskAdapter = { discover: () => ({ tasks: [{ kind: 'document', element: leaf.body }], validateScope: () => true }) };
            }); // An explicit adapter's known-document set must not widen this exception.
            const media = await page.evaluate(() => { const m = app._discoverMedia(); return { videos: m.videos.length, documents: m.documents.length, unsupported: m.unsupported, inaccessible: m.inaccessible }; });
            if (variant === 'match') {
                assert.deepEqual(media, { videos: 1, documents: 3, unsupported: false, inaccessible: false });
                assert.equal(await page.evaluate(() => app._videoEl.playbackRate), 1);
            } else if(blocked)assert.equal(media.unsupported || media.inaccessible || await page.evaluate(()=>app._discoverMedia().pending), true);
            else assert.equal(media.unsupported || media.inaccessible,false);
            assert.equal(await page.evaluate(() => document.querySelector('#node0 input').value), '1');
        }));
    }
    await check('audition exception never replaces platform completion verification', () => using([outer(2), 1, false, 'audition-match'], async page => {
        await page.evaluate(() => { window.__clicks = 0; document.querySelector('#node1 span').onclick = () => window.__clicks++; const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
        await flush(page, 12);
        assert.equal(await state(page), 'BLOCKED');
        assert.equal(await page.evaluate(() => window.__clicks), 0);
    }));
    await check('audition exception permits legitimate ended plus platform marker only', () => using([outer(1, false), 1, false, 'audition-match'], async page => {
        await creditCurrentLesson(page);
        assert.equal(await state(page), 'PLAYING');
        await page.evaluate(() => { const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
        await flush(page); assert.equal(await state(page), 'FINISHED');
    }));
    await check('audition classification is rechecked when previously inactive audio starts playing', () => using([outer(2, false), 1, false, 'audition-match'], async page => {
        await page.evaluate(() => {
            const audio = document.querySelector('iframe').contentDocument.querySelector('audio');
            Object.defineProperty(audio, 'paused', { get: () => false });
            const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended'));
        });
        assert.equal(await page.evaluate(() => app._discoverMedia().unsupported), true);
        await flush(page); assert.equal(await state(page), 'BLOCKED');
    }));
    for (let i = 1; i <= 8; i++) {
        await check(`private sample-${String(i).padStart(2, '0')}: inert outer structure and safe fallback`, async () => {
            const html = readFileSync(new URL(`../fixtures/private/sample-${String(i).padStart(2, '0')}.html`, import.meta.url), 'utf8');
            await using([html, 0], async page => {
                assert.equal(await page.evaluate(() => app.cellData.nCells), 1);
                assert.ok([3,7].includes(i)?await state(page)==='BLOCKED':['LOADING','WAITING_STARTUP'].includes(await state(page)));
                await flush(page, 45);
                assert.equal(await state(page), 'BLOCKED');
                assert.equal(await page.evaluate(() => app._timers.size), 0);
            });
        });
    }
    for (const count of [1, 3, 4]) {
        await check(`synthetic ${count} videos: dynamic discovery, natural end, platform confirmation`, () => using([outer(1, false), count], async page => {
            for (let i = 0; i < count; i++) {
                assert.equal(await state(page), 'PLAYING');
                if (i === count-1) await creditCurrentLesson(page);
                await page.evaluate(() => { const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
                await flush(page);
            }
            assert.equal(await state(page), 'FINISHED');
            assert.deepEqual(await page.evaluate(() => [...document.querySelector('iframe').contentDocument.querySelectorAll('video')].map(v => v.__plays)), Array(count).fill(1));
        }));
    }
    await check('synthetic unfinished counter is never used as video count', () => using([outer(), 4], async page => {
        assert.equal(await page.evaluate(() => app.cellData.nCells), 1);
        assert.equal(await page.evaluate(() => app._getVideoEl().ownerDocument.querySelectorAll('video').length), 4);
    }));
    await check('synthetic completion absent: bounded wait and no navigation', () => using([], async page => {
        await page.evaluate(() => { const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
        assert.equal(await state(page), 'VERIFYING_COMPLETION');
        await flush(page, 12); assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic delayed platform completion', () => using([], async page => {
        await page.evaluate(() => { const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
        await flush(page);
        await page.evaluate(() => { document.querySelector('.jobUnfinishCount').remove(); document.querySelector('.posCatalog_active').insertAdjacentHTML('beforeend', '<span class="icon_Completed"></span>'); });
        await flush(page); assert.equal(await state(page), 'FINISHED');
    }));
    await check('synthetic duplicate ended and monitor callbacks schedule one completion', () => using([outer(1, false)], async page => {
        await creditCurrentLesson(page);
        const result = await page.evaluate(() => {
            const v = app._videoEl; v.__ended = true;
            app._checkVideoStatus();
            v.dispatchEvent(new Event('ended')); v.dispatchEvent(new Event('ended'));
            return app._timers.size;
        });
        assert.equal(result, 1); await flush(page); assert.equal(await state(page), 'FINISHED');
    }));
    await check('synthetic delayed player retry', () => using([outer(), 0], async page => {
        assert.equal(await state(page), 'LOADING');
        await page.evaluate(() => window.__addVideos(1));
        await flush(page); assert.equal(await state(page), 'PLAYING');
    }));
    await check('synthetic nested same-origin player', () => using([outer(), 1, true], async page => {
        assert.equal(await state(page), 'PLAYING');
    }));
    await check('synthetic stale player removed: detached player never reused', () => using([], async page => {
        const result = await page.evaluate(() => { const old = app._videoEl; old.remove(); return app._getVideoEl() === old; });
        assert.equal(result, false);
    }));
    await check('synthetic inaccessible unmarked widget permits playback but not navigation', () => using([], async page => {
        await page.evaluate(() => { const f = document.createElement('iframe'); document.querySelector('iframe[info="card"]').contentDocument.body.append(f); Object.defineProperty(f, 'contentDocument', { get() { throw new DOMException('denied', 'SecurityError'); } }); app.play(); });
        assert.equal(await state(page), 'PLAYING');assert.equal(await page.evaluate(()=>app._discoverMedia().navigationSafe),false);
    }));
    await check('synthetic inert empty audio beside video is not a competing task', () => using([], async page => {
        await page.evaluate(() => { document.querySelector('iframe').contentDocument.body.append(document.createElement('audio')); app.play(); });
        assert.equal(await state(page), 'PLAYING');
    }));
    await check('synthetic unknown content never auto-skips', () => using([outer(2, false, 'Unknown resource'), 0], async page => {
        await page.evaluate(() => { app.configs.autoAdvanceNoVideo = true; });
        await flush(page, 12); assert.equal(await state(page), 'BLOCKED');
        assert.equal(await page.evaluate(() => document.querySelector('.posCatalog_active').id), 'node0');
    }));
    await check('synthetic quiz wins over cached player and pending callbacks', () => using([], async page => {
        await page.evaluate(() => { document.querySelector('.prev_title').title = '本章自测'; app.play(); });
        await flush(page, 12); assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic unsupported multi-tab completion stops', () => using([outer(1, false)], async page => {
        await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<div class="prev_list"><div class="prev_white">1</div><div class="prev_white">2</div></div>'); const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
        await flush(page); assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic fixed normal rate after config assignment and ratechange', () => using([], async page => {
        await page.evaluate(() => { app.configs.playbackRate = 2; app._videoEl.playbackRate = 2; app._videoEl.dispatchEvent(new Event('ratechange')); });
        assert.deepEqual(await page.evaluate(() => [app.configs.playbackRate, app._videoEl.playbackRate]), [1, 1]);
    }));
    await check('synthetic absent navigation target', () => using([], async page => {
        await page.evaluate(() => app.playCurrentIndex(null)); assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic missing active node blocks playback', () => using([outer().replace('posCatalog_active', '')], async page => {
        assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic dynamic nested directory rescan', () => using([], async page => {
        await page.evaluate(() => { document.querySelector('#coursetree ul ul').insertAdjacentHTML('beforeend', '<li><div class="posCatalog_select firstLayer"><span class="posCatalog_name">Group</span></div><ul><li><div class="posCatalog_select"><span class="posCatalog_name">Nested</span></div></li></ul></li>'); app._initCellData(); });
        assert.equal(await page.evaluate(() => app.cellData.nCells), 2);
    }));
    await check('synthetic navigation target: lock, active-node change and new iframe required', () => using([outer(2, false)], async page => {
        await creditCurrentLesson(page);
        await page.evaluate(() => {
            window.__clicks = 0;
            document.querySelector('#node1 .posCatalog_name').onclick = () => {
                window.__clicks++;
                document.querySelector('#node0').classList.remove('posCatalog_active');
                document.querySelector('#node1').classList.add('posCatalog_active');
                const old = document.querySelector('iframe'); const frame = document.createElement('iframe'); frame.setAttribute('info', 'card'); window.__navigationLoad=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true})); old.replaceWith(frame); window.__addVideos(3);
            };
            const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); v.dispatchEvent(new Event('ended'));
        });
        await flush(page); await page.evaluate(()=>window.__navigationLoad); await flush(page,3);
        assert.equal(await page.evaluate(() => window.__clicks), 1);
        assert.equal(await state(page), 'PLAYING');
        assert.equal(await page.evaluate(() => document.querySelector('.posCatalog_active').id), 'node1');
    }));
    await check('synthetic navigation not acknowledged: bounded stop', () => using([outer(2, false)], async page => {
        await creditCurrentLesson(page);
        await page.evaluate(() => { const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
        await flush(page, 12); assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic blur/visibilitychange resume with cooldown', () => using([], async page => {
        const results = await page.evaluate(() => {
            const v = app._videoEl; const before = v.__plays;
            window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange'));
            const immediate = v.__plays - before;
            window.__clock += 1600; document.dispatchEvent(new Event('visibilitychange'));
            return [immediate, v.__plays - before];
        });
        assert.deepEqual(results, [1, 2]);
    }));
    await check('synthetic mouseleave/mouseout guards retained on document/window', () => using([], async page => {
        assert.equal(await page.evaluate(() => [document, window].every(target => ['mouseleave', 'mouseout'].every(type => !target.dispatchEvent(new Event(type, { cancelable: true }))))), true);
    }));
    await check('synthetic unexpected pause recovery and cooldown', () => using([], async page => {
        assert.equal(await page.evaluate(() => { const v = app._videoEl; const before = v.__plays; v.__paused = true; app._checkVideoStatus(); v.__paused = true; app._checkVideoStatus(); return v.__plays - before; }), 1);
    }));
    await check('synthetic stall detection avoids repeated recovery', () => using([], async page => {
        assert.equal(await page.evaluate(() => { const v = app._videoEl; const before = v.__plays; app._checkVideoStatus(); window.__clock += 7100; app._checkVideoStatus(); app._checkVideoStatus(); return v.__plays - before; }), 1);
    }));
    await check('synthetic destroy cancels callbacks and removes guards', () => using([outer(1, false)], async page => {
        await page.evaluate(() => { const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); app.destroy(); });
        await flush(page, 12);
        assert.deepEqual(await page.evaluate(() => [app._timers.size, document.dispatchEvent(new Event('mouseleave', { cancelable: true }))]), [0, true]);
    }));
    await check('synthetic conflict: positive unfinished count overrides completed icon', () => using([outer(1, false)], async page => {
        await page.evaluate(() => { document.querySelector('.posCatalog_active').insertAdjacentHTML('beforeend', '<input class="jobUnfinishCount" value="1">'); const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
        await flush(page, 12); assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic zero unfinished counter without completion icon is ambiguous', () => using([], async page => {
        await page.evaluate(() => { document.querySelector('.jobUnfinishCount').value = '0'; const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
        await flush(page, 12); assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic unmarked text iframe alongside video is UI rather than an inferred task', () => using([], async page => {
        await page.evaluate(() => { const f = document.createElement('iframe'); document.querySelector('iframe').contentDocument.body.append(f); f.contentDocument.body.textContent = 'Unknown resource'; app.play(); });
        assert.equal(await state(page), 'PLAYING');
    }));
    await check('synthetic user changes chapter before old completion', () => using([outer(2, false)], async page => {
        await page.evaluate(() => { document.querySelector('#node0').classList.remove('posCatalog_active'); document.querySelector('#node1').classList.add('posCatalog_active'); const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
        assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic pending play promise invalidated by quiz stop', () => using([], async page => {
        await page.evaluate(() => {
            const v = app._videoEl; app._isPlaying = false; v.__paused = true; v.play = () => new Promise(resolve => { window.__resolvePlay = resolve; });
            app.play(); document.querySelector('.prev_title').title = '章节测验'; app.play(); window.__resolvePlay();
        });
        assert.equal(await state(page), 'BLOCKED');
        assert.equal(await page.evaluate(() => app._checkInterval), null);
    }));
    await check('synthetic video completion while navigation is pending is ignored', () => using([outer(2, false)], async page => {
        await creditCurrentLesson(page);
        await page.evaluate(() => { const v = app._videoEl; window.__old = v; v.__ended = true; v.dispatchEvent(new Event('ended')); });
        await flush(page);
        assert.equal(await state(page), 'ADVANCING');
        const size = await page.evaluate(() => app._timers.size);
        await page.evaluate(() => app._completeVideo(window.__old));
        assert.equal(await page.evaluate(() => app._timers.size), size);
    }));
    await check('synthetic muted fallback remains active', () => using([], async page => {
        await page.evaluate(async () => { const v = app._videoEl; app._isPlaying = false; v.__paused = true; let calls = 0; v.play = () => ++calls === 1 ? Promise.reject(new Error('autoplay blocked')) : Promise.resolve(); await app.play(); await Promise.resolve(); });
        assert.equal(await page.evaluate(() => app._videoEl.muted), true);
        assert.equal(await state(page), 'PLAYING');
        assert.notEqual(await page.evaluate(() => app._checkInterval), null);
    }));
    await check('synthetic course has chapters with 1/3/4 videos, one transition each', () => using([outer(1, false)], async page => {

        await page.evaluate(() => {
            window.__chapter = 0; window.__transitions = 0;
            const root = document.querySelector('#coursetree > ul');
            root.insertAdjacentHTML('beforeend', [1, 2].map(i => `<li><ul><li><div id="node${i}" class="posCatalog_select"><span class="posCatalog_name" title="Content ${i}">Content ${i}</span><input class="jobUnfinishCount" value="1"></div></li></ul></li>`).join(''));
            for (const i of [1, 2]) document.querySelector(`#node${i} .posCatalog_name`).onclick = () => {
                window.__chapter = i; window.__transitions++;
                document.querySelector('.posCatalog_active').classList.remove('posCatalog_active'); document.querySelector(`#node${i}`).classList.add('posCatalog_active');
                const frame = document.createElement('iframe'); frame.setAttribute('info', 'card'); window.__navigationLoad=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true})); document.querySelector('iframe').replaceWith(frame); window.__addVideos([1, 3, 4][i]);
            };
        });
        for (let i = 0; i < 8; i++) {
            assert.equal(await state(page), 'PLAYING');
            if (await page.evaluate(()=>[...app._videoEl.ownerDocument.querySelectorAll('video')].filter(v=>!v.ended).length===1)) await creditCurrentLesson(page);
            await page.evaluate(() => { const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
            await flush(page); await page.evaluate(()=>window.__navigationLoad); await flush(page,3);
        }
        assert.equal(await state(page), 'FINISHED');
        assert.equal(await page.evaluate(() => window.__transitions), 2);
    }));
    await check('synthetic stale completion after player replacement cannot navigate', () => using([outer(1, false)], async page => {
        await page.evaluate(() => { const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); v.remove(); window.__addVideos(1); });
        await flush(page); assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic unrelated iframe update cannot acknowledge chapter navigation', () => using([outer(2, false)], async page => {
        await creditCurrentLesson(page);
        await page.evaluate(() => {
            document.querySelector('#node1 .posCatalog_name').onclick = () => {
                document.querySelector('#node0').classList.remove('posCatalog_active'); document.querySelector('#node1').classList.add('posCatalog_active');
                document.body.append(document.createElement('iframe'));
            };
            const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended'));
        });
        await flush(page); assert.equal(await state(page), 'ADVANCING');
        await flush(page, 12); assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic retained learning-objective tab rule accepts arbitrary numeric prefix', () => using([outer(1, false, '学习目标') + '<div class="prev_white">12视频</div>', 0], async page => {
        const clicked = await page.evaluate(() => {
            let clicked = 0; const tab = document.querySelector('.prev_white');
            tab.onclick = () => { clicked++; document.querySelector('.prev_title').title = '视频'; window.__addVideos(1); };
            app.run(); return clicked;
        });
        assert.equal(clicked, 1); await flush(page); assert.equal(await state(page), 'PLAYING');
    }));
    await check('synthetic private reference sanitization does not execute scripts or handlers', () => using([outer() + '<script>window.__unsafe = true</script><img src="https://invalid.example/image" onerror="window.__unsafe=true">'], async page => {
        assert.equal(await page.evaluate(() => window.__unsafe), undefined);
        assert.equal(await page.locator('img').getAttribute('onerror'), null);
    }));
    await check('synthetic content title changes during completion verification: stop', () => using([outer(1, false)], async page => {
        await page.evaluate(() => { const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); document.querySelector('.prev_title').title = 'Unknown content'; });
        await flush(page); assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic pending recovery rejection cannot restart playback after safe stop', () => using([], async page => {
        await page.evaluate(async () => {
            const v = app._videoEl; window.__lateFallbacks = 0;
            v.play = () => new Promise((_, reject) => { window.__rejectRecovery = reject; });
            window.dispatchEvent(new Event('blur'));
            app._block('Synthetic stop');
            v.play = () => { window.__lateFallbacks++; return Promise.resolve(); };
            window.__rejectRecovery(new Error('late recovery rejection'));
            await Promise.resolve(); await Promise.resolve();
        });
        assert.equal(await page.evaluate(() => window.__lateFallbacks), 0);
    }));
    for (const variant of ['normal-aux', 'unsupported-aux', 'inaccessible-aux']) {
        await check(`synthetic scoped discovery with 65 nodes / 7 frames: ${variant}`, () => using([scopeOuter, 1, true, variant], async page => {
            assert.equal(await state(page), 'PLAYING');
            assert.deepEqual(await page.evaluate(() => [
                document.querySelectorAll('#coursetree .posCatalog_select').length,
                document.querySelectorAll('body > iframe').length,
                app.cellData.nCells,
                app.cellData.currentNCellIndex,
                document.querySelector('.posCatalog_active').id,
                app._videoEl.ownerDocument.defaultView.frameElement.ownerDocument.defaultView.frameElement.id,
                app._videoEl.playbackRate,
                window.__auxReads,
            ]), [65, 7, 50, 37, 'leaf-37', 'iframe', 1, 0]);
            const before = await page.evaluate(() => app._videoEl.__plays);
            await page.evaluate(() => window.dispatchEvent(new Event('blur')));
            assert.equal(await page.evaluate(() => app._videoEl.__plays), before + 1);
        }));
    }
    for (const kind of ['audio', 'unknown', 'inaccessible']) {
        await check(`synthetic unmarked ${kind} UI does not block the selected primary`, () => using([scopeOuter, 1, true, 'normal-aux'], async page => {
            assert.equal(await state(page), 'PLAYING');
            await page.evaluate(kind => {
                const doc = document.querySelector('iframe[info="card"]').contentDocument;
                if (kind === 'audio') doc.body.append(doc.createElement('audio'));
                else {
                    const frame = doc.createElement('iframe'); doc.body.append(frame);
                    if (kind === 'unknown') frame.contentDocument.body.textContent = 'Synthetic unsupported task';
                    else Object.defineProperty(frame, 'contentDocument', { get() { throw new DOMException('denied', 'SecurityError'); } });
                }
                app.play();
            }, kind);
            assert.equal(await state(page), 'PLAYING');
            assert.equal(await page.evaluate(() => app._isPlaying), true);
            if(kind==='inaccessible')assert.equal(await page.evaluate(()=>app._discoverMedia().navigationSafe),false);
        }));
    }
    await check('synthetic inaccessible selected cards root blocks', () => using([scopeOuter, 1, true, 'normal-aux'], async page => {
        assert.equal(await state(page), 'PLAYING');
        await page.evaluate(() => { Object.defineProperty(document.querySelector('iframe[info="card"]'), 'contentDocument', { get() { throw new DOMException('denied', 'SecurityError'); } }); app.play(); });
        assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic ambiguous cards roots block instead of falling back to auxiliary frames', () => using([scopeOuter, 1, true, 'normal-aux'], async page => {
        await page.evaluate(() => { document.querySelector('#aux-editor').setAttribute('info', 'card'); app.play(); });
        assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic missing cards root blocks instead of scanning outer videos', () => using([scopeOuter, 1, true, 'normal-aux'], async page => {
        await page.evaluate(() => { document.querySelector('iframe[info="card"]').removeAttribute('info'); document.body.append(document.createElement('video')); app.play(); });
        assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic large-directory completion advances leaf 37 to leaf 38 only', () => using([scopeOuter, 1, true, 'inaccessible-aux'], async page => {
        assert.equal(await state(page), 'PLAYING');
        await page.evaluate(() => {
            window.__scopeClicks = 0;
            document.querySelector('#leaf-37 .jobUnfinishCount').value = '0';
            document.querySelector('#leaf-37').insertAdjacentHTML('beforeend', '<span class="icon_Completed"></span>');
            document.querySelector('#leaf-38 .posCatalog_name').onclick = () => {
                window.__scopeClicks++;
                document.querySelector('#leaf-37').classList.remove('posCatalog_active'); document.querySelector('#leaf-38').classList.add('posCatalog_active');
                const frame = document.createElement('iframe'); frame.id = 'iframe'; frame.setAttribute('info', 'card'); document.querySelector('iframe[info="card"]').replaceWith(frame); window.__addVideos(1, true);
            };
            const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); v.dispatchEvent(new Event('ended'));
        });
        await flush(page);
        assert.equal(await state(page), 'PLAYING');
        assert.deepEqual(await page.evaluate(() => [document.querySelector('.posCatalog_active').id, window.__scopeClicks, app.cellData.currentNCellIndex, window.__auxReads]), ['leaf-38', 1, 38, 0]);
    }));
    const cooldownOptions = [outer(2, false), 1, false, null, true];
    async function enterCooldown(page, random = 0.5) {
        await page.evaluate(random => {
            Math.random = () => { window.__randomDraws = (window.__randomDraws || 0) + 1; return random; };
            window.__navClicks = 0;
            document.querySelector('#node1 .posCatalog_name').onclick = () => window.__navClicks++;
            const node=document.querySelector('.posCatalog_active');node.querySelector('input')?.remove();node.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');
            const v = app._videoEl; v.__ended = true; v.__paused=true; v.dispatchEvent(new Event('ended'));
        }, random);
        await flush(page);
        assert.equal(await state(page), 'NAVIGATION_COOLDOWN');
    }
    for (const [random, expected] of [[0, 5000], [0.999999999, 12000], [327 / 7001, 5327], [4684 / 7001, 9684]]) {
        await check(`synthetic cooldown integer milliseconds ${expected}`, () => using(cooldownOptions, async page => {
            await enterCooldown(page, random);
            assert.deepEqual(await page.evaluate(() => [window.__cooldownDefaults, [...window.__timeoutDelays.values()], window.__randomDraws, window.__navClicks]), [[true, 5000, 12000], [expected], 1, 0]);
            assert.equal(await page.evaluate(() => window.__logs.filter(line => line.startsWith('导航冷却 ')).at(-1)), `导航冷却 ${(expected / 1000).toFixed(3)}s`);
            await flush(page);
            assert.equal(await page.evaluate(() => window.__navClicks), 1);
        }));
    }
    await check('synthetic independent random draw for every eligible navigation', () => using([outer(4, false), 1, false, null, true], async page => {
        await creditCurrentLesson(page);
        await page.evaluate(() => {
            const values = [0, 1 / 7001, 0.5]; window.__draws = 0;
            Math.random = () => values[window.__draws++];
            for (const index of [1, 2, 3]) document.querySelector(`#node${index} .posCatalog_name`).onclick = () => {
                document.querySelector('.posCatalog_active').classList.remove('posCatalog_active'); document.querySelector(`#node${index}`).classList.add('posCatalog_active');
                const f = document.createElement('iframe'); f.setAttribute('info', 'card'); window.__navigationLoad=new Promise(resolve=>f.addEventListener('load',resolve,{once:true})); document.querySelector('iframe[info="card"]').replaceWith(f); window.__addVideos(1);
            };
        });
        const delays = [];
        for (let index = 0; index < 3; index++) {
            await creditCurrentLesson(page);
            await page.evaluate(() => { const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
            await flush(page);
            delays.push(await page.evaluate(() => [...window.__timeoutDelays.values()][0]));
            await flush(page); await page.evaluate(()=>window.__navigationLoad); await flush(page,3); assert.equal(await state(page), 'PLAYING');
        }
        assert.deepEqual(delays, [5000, 5001, 8500]);
        assert.equal(await page.evaluate(() => window.__draws), 3);
    }));
    await check('synthetic active playback and unconfirmed completion never draw a cooldown', () => using([outer(2), 1, false, null, true], async page => {
        await page.evaluate(() => { window.__draws = 0; Math.random = () => { window.__draws++; return 0.5; }; });
        assert.equal(await state(page), 'PLAYING');
        assert.equal(await page.evaluate(() => app._timers.size), 0);
        await page.evaluate(() => { const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
        await flush(page, 12); assert.equal(await state(page), 'BLOCKED');
        assert.equal(await page.evaluate(() => window.__draws), 0);
    }));
    await check('synthetic duplicate completion and nextUnit schedule only one cooldown', () => using(cooldownOptions, async page => {
        await enterCooldown(page);
        await page.evaluate(() => { const v = app._videoEl; v.dispatchEvent(new Event('ended')); app._checkVideoStatus(); app.nextUnit(); app.nextUnit(); });
        assert.deepEqual(await page.evaluate(() => [app._timers.size, window.__randomDraws, window.__navClicks]), [1, 1, 0]);
        await flush(page); assert.equal(await page.evaluate(() => window.__navClicks), 1);
    }));
    for (const cancel of ['destroy', 'block', 'click', 'chapter', 'title', 'pagehide', 'popstate', 'unsupported-task', 'player-replacement', 'target-removal', 'assessment', 'replay', 'content-reload', 'nested-click', 'completion-marker']) {
        await check(`synthetic cooldown cancellation and stale callback: ${cancel}`, () => using(cooldownOptions, async page => {
            await enterCooldown(page);
            await page.evaluate(async cancel => {
                window.__staleCooldown = [...window.__timeouts.values()][0];
                if (cancel === 'destroy') app.destroy();
                if (cancel === 'block') app._block('Synthetic stop');
                if (cancel === 'click') document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                if (cancel === 'chapter') { document.querySelector('#node0').classList.remove('posCatalog_active'); document.querySelector('#node1').classList.add('posCatalog_active'); }
                if (cancel === 'title') document.querySelector('.prev_title').title = 'Unknown resource';
                if (cancel === 'pagehide' || cancel === 'popstate') window.dispatchEvent(new Event(cancel));
                if (cancel === 'unsupported-task') {const task=document.createElement('div');task.className='ans-attach-online unknown-task';document.querySelector('iframe').contentDocument.body.append(task);}
                if (cancel === 'player-replacement') app._videoEl.remove();
                if (cancel === 'target-removal') document.querySelector('#node1').remove();
                if (cancel === 'assessment') document.querySelector('.prev_title').title = '章节测验';
                if (cancel === 'replay') app._videoEl.dispatchEvent(new Event('play'));
                if (cancel === 'content-reload') document.querySelector('iframe[info="card"]').dispatchEvent(new Event('load'));
                if (cancel === 'nested-click') app._videoEl.ownerDocument.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                if (cancel === 'completion-marker') document.querySelector('#node0 .icon_Completed').remove();
                await Promise.resolve(); await Promise.resolve();
                window.__staleCooldown();
            }, cancel);
            assert.equal(await state(page), 'BLOCKED');
            assert.deepEqual(await page.evaluate(() => [app._timers.size, window.__navClicks, app._cooldownCleanup]), [0, 0, null]);
        }));
    }
    await check('synthetic expiry revalidates completion even without a mutation event', () => using(cooldownOptions, async page => {
        await enterCooldown(page);
        await page.evaluate(() => { document.querySelector('.jobUnfinishCount')?.remove(); document.querySelector('#node0').insertAdjacentHTML('beforeend', '<input class="jobUnfinishCount" value="0">'); });
        // Let the observer see valid state, then change only the value property.
        await page.evaluate(() => { document.querySelector('#node0 .jobUnfinishCount').value = '1'; });
        await flush(page);
        assert.equal(await state(page), 'BLOCKED');
        assert.equal(await page.evaluate(() => window.__navClicks), 0);
    }));
    await check('synthetic expiry revalidates task ended state and generation', () => using(cooldownOptions, async page => {
        await enterCooldown(page);
        await page.evaluate(() => { app._completionVideo.__ended = false; });
        await flush(page); assert.equal(await state(page), 'BLOCKED');
        assert.equal(await page.evaluate(() => window.__navClicks), 0);
    }));
    await check('synthetic run invalidates stale cooldown generation', () => using(cooldownOptions, async page => {
        await enterCooldown(page);
        await page.evaluate(() => { const stale = [...window.__timeouts.values()][0]; app.run(); stale(); });
        assert.equal(await page.evaluate(() => window.__navClicks), 0);
        assert.notEqual(await state(page), 'ADVANCING');
    }));
    await check('synthetic disabled cooldown navigates without drawing randomness', () => using([outer(2, false)], async page => {
        await creditCurrentLesson(page);
        await page.evaluate(() => { Math.random = () => { throw new Error('disabled cooldown drew randomness'); }; window.__clicks = 0; document.querySelector('#node1 .posCatalog_name').onclick = () => window.__clicks++; const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
        await flush(page); assert.equal(await page.evaluate(() => window.__clicks), 1);
    }));
    for (const [min, max] of [[7000, 5000], [1.5, 12000], [0, 2147483648]]) {
        await check(`synthetic invalid cooldown range ${min}/${max} safely blocks`, () => using(cooldownOptions, async page => {
            await page.evaluate(({ min, max }) => { app.configs.randomCooldownMinMs = min; app.configs.randomCooldownMaxMs = max; const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); }, { min, max });
            await flush(page); assert.equal(await state(page), 'BLOCKED');
        }));
    }
    await check('synthetic cooldown does not weaken fixed rate or background recovery', () => using(cooldownOptions, async page => {
        assert.deepEqual(await page.evaluate(() => { const v = app._videoEl; const before = v.__plays; app.configs.playbackRate = 2; window.dispatchEvent(new Event('blur')); return [v.__plays - before, v.playbackRate, app.configs.playbackRate, app._timers.size]; }), [1, 1, 1, 0]);
    }));
    await check('synthetic auxiliary-frame load does not cancel a valid cooldown', () => using([scopeOuter, 1, true, 'inaccessible-aux', true], async page => {
        await page.evaluate(() => { const n = document.querySelector('#leaf-37'); n.querySelector('input').value = '0'; n.insertAdjacentHTML('beforeend', '<span class="icon_Completed"></span>'); const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
        await flush(page); assert.equal(await state(page), 'NAVIGATION_COOLDOWN');
        await page.evaluate(() => document.querySelector('#aux-editor').dispatchEvent(new Event('load')));
        assert.equal(await state(page), 'NAVIGATION_COOLDOWN');
        assert.equal(await page.evaluate(() => window.__auxReads), 0);
    }));
    await check('synthetic successful cooldown callback cannot navigate twice', () => using(cooldownOptions, async page => {
        await enterCooldown(page);
        await page.evaluate(() => { const callback = [...window.__timeouts.values()][0]; callback(); callback(); });
        assert.equal(await page.evaluate(() => window.__navClicks), 1);
    }));
    await check('synthetic configurable fixed integer range is respected', () => using(cooldownOptions, async page => {
        await page.evaluate(() => { app.configs.randomCooldownMinMs = 7041; app.configs.randomCooldownMaxMs = 7041; });
        await enterCooldown(page);
        assert.deepEqual(await page.evaluate(() => [...window.__timeoutDelays.values()]), [7041]);
        assert.equal(await page.evaluate(() => window.__logs.filter(line => line.startsWith('导航冷却 ')).at(-1)), '导航冷却 7.041s');
    }));
    async function installDocuments(page, count = 1, mixed = false) {
        await page.evaluate(({ count, mixed }) => {
            const doc = document.querySelector('iframe[info="card"]').contentDocument;
            if (!mixed) doc.body.innerHTML = '';
            for (let i = 0; i < count; i++) {
                const el = doc.createElement('div'); el.className = 'synthetic-document';
                el.style.cssText = 'height:100px;overflow:auto;width:200px;scroll-behavior:auto';
                el.innerHTML = '<div style="height:700px">Synthetic document</div>'; doc.body.append(el);
            }
            app.taskAdapter = { discover() {
                if (document.querySelector('.posCatalog_active').id !== 'node0') return null;
                return { tasks: [...doc.querySelectorAll('.synthetic-document')].map(element => ({ kind: 'document', element })),
                    validateScope: () => doc === document.querySelector('iframe[info="card"]').contentDocument && !doc.querySelector('.synthetic-unknown') };
            } };
            app.settings.randomDelaysEnabled = true; app.settings.delays.documentScroll.enabled = true;
            app.settings.delays.documentScroll.minMs = 400; app.settings.delays.documentScroll.maxMs = 1200;
            window.__scrollPositions = []; window.__docDelays = [];
            let draw = 0; const values = [0.1, 0.5, 0.9]; Math.random = () => values[draw++ % values.length];
            (app._recovery?.resumeExplicitly(),app.run());
        }, { count, mixed });
    }
    await check('synthetic document scrolls incrementally from start to actual bottom without platform polling', () => using([outer(2), 0, false, null, true], async page => {
        await installDocuments(page);
        assert.equal(await state(page), 'READING_DOCUMENT');
        const positions = [], delays = [];
        for (let i = 0; i < 40 && await state(page) === 'READING_DOCUMENT'; i++) {
            delays.push(...await page.evaluate(() => [...window.__timeoutDelays.values()]));
            await flush(page);
            positions.push(await page.evaluate(() => document.querySelector('iframe').contentDocument.querySelector('.synthetic-document').scrollTop));
        }
        assert.equal(await state(page), 'NAVIGATION_COOLDOWN');
        assert.ok(positions.some(pos => pos > 0 && pos < 600));
        assert.equal(positions.at(-1), 600);
        assert.ok(new Set(delays.filter(delay => delay <= 1200)).size > 1);
        assert.ok(new Set(positions.slice(1).map((pos, i) => pos - positions[i]).filter(step => step > 0)).size > 1);
        assert.equal(await page.evaluate(() => document.querySelector('.jobUnfinishCount').value), '1');
    }));
    await check('synthetic multiple documents finish locally then await navigation cooldown', () => using([outer(2), 0, false, null, true], async page => {
        await installDocuments(page, 3);
        await flush(page, 60);
        assert.ok(['ADVANCING', 'BLOCKED'].includes(await state(page))); // No target click handler installed.
        assert.deepEqual(await page.evaluate(() => [...document.querySelector('iframe').contentDocument.querySelectorAll('.synthetic-document')].map(el => el.scrollTop)), [600, 600, 600]);
    }));
    await check('synthetic mixed document/video keeps video confirmation requirement', () => using([outer(2), 1, false, null, true], async page => {
        await page.evaluate(() => { app._isPlaying = false; });
        await installDocuments(page, 1, true);
        for (let i = 0; i < 180 && await state(page) === 'READING_DOCUMENT'; i++) await flush(page);
        assert.equal(await state(page), 'PLAYING');
        await page.evaluate(() => { const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
        await flush(page, 12);
        assert.equal(await state(page), 'BLOCKED');
        assert.equal(await page.evaluate(() => app._videoEl.playbackRate), 1);
    }));
    await check('synthetic document scope invalidation and destruction cancel scrolling', () => using([outer(), 0], async page => {
        await installDocuments(page);
        await page.evaluate(() => { document.querySelector('iframe').contentDocument.body.insertAdjacentHTML('beforeend', '<div class="synthetic-unknown">Unknown</div>'); });
        await flush(page); assert.equal(await state(page), 'BLOCKED');
        assert.equal(await page.evaluate(() => app._documentController), null);
    }));
    await check('synthetic unsupported document viewers stay stopped without an adapter', () => using([outer(), 0], async page => {
        await page.evaluate(() => { document.querySelector('iframe').contentDocument.body.textContent = 'Unknown viewer'; app.run(); });
        await flush(page,45); // No player is retried within the bounded loading window, never skipped.
        assert.equal(await state(page), 'BLOCKED');
    }));
    const assessmentPage = (assessment = '章节测验', priorComplete = true, includeNextChapter = true) =>
        `<div class="prev_title" title="${assessment}"></div><div id="coursetree"><ul><li><ul>${node(0, false, priorComplete)}<li><div id="assessment" class="posCatalog_select posCatalog_active"><span class="posCatalog_name" title="${assessment}">${assessment}</span><input class="jobUnfinishCount" value="1"></div></li></ul></li>${includeNextChapter ? `<li><ul>${node(1, false)}</ul></li>` : ''}</ul></div><iframe info="card"></iframe>`;
    for (const label of ['章节测验', '章节测试', '本章自测']) {
        await check(`synthetic optional chapter-end ${label} stays unfinished and targets next chapter`, () => using([assessmentPage(label), 0, false, null, true], async page => {
            assert.equal(await state(page), 'NAVIGATION_COOLDOWN');
            assert.equal(await page.evaluate(() => document.querySelector('#assessment input').value), '1');
            await page.evaluate(() => { window.__assessmentClicks = 0; document.querySelector('#node1 .posCatalog_name').onclick = () => window.__assessmentClicks++; });
            await flush(page);
            assert.equal(await page.evaluate(() => window.__assessmentClicks), 1);
            assert.equal(await page.evaluate(() => document.querySelector('#assessment input').value), '1');
        }));
    }
    for (const [label, prior, next] of [['身份验证', true, true], ['考试', true, true], ['章节测验', true, false]]) {
        await check(`synthetic ambiguous/mandatory assessment stops: ${label}/${prior}/${next}`, () => using([assessmentPage(label, prior, next), 0], async page => {
            assert.equal(await state(page), 'BLOCKED');
        }));
    }
    await check('deferred current assessment does not require previous unfinished lessons to be marked completed', () => using([assessmentPage('章节测试', false), 0, false, null, true], async page => {
        assert.equal(await state(page), 'NAVIGATION_COOLDOWN');
        assert.equal(await page.evaluate(() => document.querySelector('#node0 input').value), '1');
        assert.equal(await page.evaluate(() => document.querySelector('#assessment input').value), '1');
    }));
    for (const nextChapter of [false, true]) {
        await check(`deferred consecutive assessments preserve next learning order; next chapter=${nextChapter}`, () => using([
            `<div class="prev_title" title="视频"></div><div id="coursetree"><ul><li><ul>${node(0, true, false)}${['章节测验', '章节测试', '本章自测'].map((label, i) => `<li><div id="defer-${i}" class="posCatalog_select"><span class="posCatalog_name" title="${label}">${label}</span><input value="1"></div></li>`).join('')}${nextChapter ? '</ul></li><li><ul>' : ''}${node(1)}${node(2)}</ul></li></ul></div><iframe info="card"></iframe>`, 1, false, null, true,
        ], async page => {
            await creditCurrentLesson(page);
            await page.evaluate(() => { window.__destinations = []; for (const i of [1, 2]) document.querySelector(`#node${i} .posCatalog_name`).onclick = () => window.__destinations.push(i); const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
            await flush(page);
            assert.equal(await state(page), 'NAVIGATION_COOLDOWN');
            assert.equal(await page.evaluate(() => app._actions.pending.size), 1);
            await flush(page);
            assert.deepEqual(await page.evaluate(() => window.__destinations), [1]);
            assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('[id^="defer-"] input')].map(el => el.value)), ['1', '1', '1']);
        }));
    }
    for (const restriction of ['aria-disabled', 'disabled', 'locked-text', 'authentication']) {
        await check(`deferred assessment stops at restricted destination: ${restriction}`, () => using([assessmentPage(), 0, false, null, true], async page => {
            await page.evaluate(restriction => {
                app._cancelTasks(); const node = document.querySelector('#node1');
                if (restriction === 'locked-text') node.append('未解锁');
                else if (restriction === 'authentication') node.querySelector('span').title = '身份认证';
                else node.setAttribute(restriction, restriction === 'disabled' ? '' : 'true');
                app.run();
            }, restriction);
            assert.equal(await state(page), 'BLOCKED');
            assert.equal(await page.evaluate(() => document.querySelector('#assessment input').value), '1');
        }));
    }
    async function startLive(page, { duration = 100, deniedClose = false, beforeOpen = null, recorded = false } = {}) {
        const popupPromise = page.context().waitForEvent('page');
        await page.evaluate(recorded => {
            const doc = document.querySelector('iframe[info="card"]').contentDocument;
            doc.body.innerHTML = '<a id="synthetic-live" target="_blank" href="https://course.test/live">Synthetic lecture</a>';
            if (recorded) doc.querySelector('a').href = 'https://zhibo.chaoxing.com/synthetic-replay';
            const entry = doc.querySelector('a');
            app.taskAdapter = { discover() {
                if (document.querySelector('.posCatalog_active').id !== 'node0') return null;
                return { tasks: [{ kind: 'live', element: entry }], validateScope: () => entry.isConnected && doc === document.querySelector('iframe[info="card"]').contentDocument };
            } };
            window.__openCalls = 0; window.__stateAtOpen = null; window.__liveTypes = [];
            window.addEventListener('message', event => { if (event.data?.protocol === 'xuexitong-live-v1') window.__liveTypes.push(event.data.type); });
            const open = window.open.bind(window);
            window.open = (...args) => { window.__openCalls++; window.__stateAtOpen = app._state; return open(...args); };
            Math.random = () => 0;
            document.querySelector('#node1 .posCatalog_name').onclick = () => {
                document.querySelector('#node0').classList.remove('posCatalog_active'); document.querySelector('#node1').classList.add('posCatalog_active');
                const f = document.createElement('iframe'); f.setAttribute('info', 'card'); document.querySelector('iframe[info="card"]').replaceWith(f); window.__addVideos(1);
            };
            (app._recovery?.resumeExplicitly(),app.run());
        }, recorded);
        if (beforeOpen) await beforeOpen(page);
        const child = await popupPromise;
        await child.waitForLoadState();
        await child.addScriptTag({ content: jquery });
        await child.evaluate(duration => {
            window.__clock = 100000; Date.now = () => window.__clock;
            window.__duration = duration === 'infinite' ? Infinity : duration;
            window.__position = 0; window.__ended = false; window.__plays = 0;
            const video = document.querySelector('video');
            Object.defineProperties(video, { duration: { get: () => window.__duration }, currentTime: { get: () => window.__position }, ended: { get: () => window.__ended }, paused: { get: () => false } });
            video.play = () => { window.__plays++; return Promise.resolve(); };
        }, duration);
        await child.addScriptTag({ content: source });
        await child.evaluate(recorded => {
            window.__child = recorded ? window.__xuexitongLiveChild : window.__xuexitongTaskSupport.installChild({ isRecognized: () => !!document.querySelector('video'), getPlayer: () => document.querySelector('video'), sessionFinished: () => window.__sessionFinished === true });
        }, recorded);
        if (deniedClose) await page.evaluate(() => { window.__closeAttempts = 0; app._liveController.child.close = () => { window.__closeAttempts++; }; });
        await page.evaluate(() => app._liveController.tick());
        await page.waitForFunction(() => window.__liveTypes.includes('LIVE_READY'));
        return child;
    }
    async function confirmParentMarker(page) {
        await page.evaluate(() => { document.querySelector('#node0 input').value = '0'; document.querySelector('#node0').insertAdjacentHTML('beforeend', '<span class="icon_Completed"></span>'); });
    }
    const liveOptions = [outer(2), 0, false, null, true, true];
    for (const confirmation of ['late', 'missing']) {
        await check(`recorded cross-origin popup ${confirmation} platform marker controls parent continuation`, () => using([outer(2), 0, false, null, true, 'recorded'], async page => {
            await page.evaluate(() => { const s = structuredClone(app.settings); s.delays.liveReturn.enabled = true; app.updateSettings(s); });
            const child = await startLive(page, { recorded: true });
            assert.equal(await state(page), 'WAITING_LIVE');
            const closed = child.waitForEvent('close');
            await child.evaluate(() => { window.__ended = true; window.__child.check(); });
            await page.waitForFunction(() => app._actions.pending.has('live-return'));
            await flush(page); await closed;
            await page.evaluate(() => app._liveController.tick());
            assert.equal(await state(page), 'VERIFYING_COMPLETION');
            assert.equal(await page.evaluate(() => document.querySelector('#node0 input').value), '1');
            if (confirmation === 'late') {
                await confirmParentMarker(page); await flush(page);
                assert.equal(await state(page), 'PLAYING');
            } else {
                await flush(page, 12); assert.equal(await state(page), 'BLOCKED');
            }
        }));
    }
    await check('synthetic real popup: parent waits first, duplicates cannot open another window', () => using(liveOptions, async page => {
        const child = await startLive(page);
        assert.deepEqual(await page.evaluate(() => [window.__stateAtOpen, app._state, window.__openCalls, app._isPlaying]), ['WAITING_LIVE', 'WAITING_LIVE', 1, false]);
        await page.evaluate(() => { app.play(); app.nextUnit(); window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange')); });
        assert.equal(await state(page), 'WAITING_LIVE');
        assert.equal(await page.evaluate(() => window.__openCalls), 1);
        assert.equal(await child.evaluate(() => document.querySelector('video').playbackRate), 1);
    }));
    await check('synthetic two-hour true live stream remains waiting with unknown duration', () => using(liveOptions, async page => {
        const child = await startLive(page, { duration: 'infinite' });
        await page.evaluate(() => { window.__clock += 7200000; app._liveController.tick(); });
        await child.evaluate(() => { window.__clock += 7200000; window.__position = 7200; window.__child.check(); });
        assert.equal(await state(page), 'WAITING_LIVE');
        assert.equal(await page.evaluate(() => app._timers.size), 0);
        assert.equal(await child.evaluate(() => window.__child.disposed), false);
    }));
    for (const completion of ['ended', 'near-end']) {
        await check(`synthetic live ${completion}: associated child closes, marker then cooldown, normal video resumes`, () => using(liveOptions, async page => {
            const child = await startLive(page);
            await confirmParentMarker(page);
            const closed = child.waitForEvent('close');
            await child.evaluate(completion => { if (completion === 'ended') window.__ended = true; else window.__position = 99; window.__child.check(); }, completion);
            await closed;
            await page.evaluate(() => app._liveController.tick());
            assert.equal(await state(page), 'PLAYING'); // Return already consumed its one logical delay (disabled in this fixture).
            assert.equal(await page.evaluate(() => document.querySelector('.posCatalog_active').id), 'node1');
        }));
    }
    await check('synthetic local near-end never fabricates platform completion', () => using(liveOptions, async page => {
        const child = await startLive(page);
        const closed = child.waitForEvent('close');
        await child.evaluate(() => { window.__position = 99; window.__child.check(); }); await closed;
        await page.evaluate(() => app._liveController.tick());
        assert.equal(await state(page), 'VERIFYING_COMPLETION');
        assert.equal(await page.evaluate(() => document.querySelector('#node0 input').value), '1');
        await flush(page, 12); assert.equal(await state(page), 'BLOCKED');
        assert.equal(await page.evaluate(() => window.__logs.some(line => line.startsWith('导航冷却 '))), false);
    }));
    await check('synthetic unexpected child closure safely blocks without navigation', () => using(liveOptions, async page => {
        const child = await startLive(page); await child.close();
        await page.evaluate(() => app._liveController?.tick());
        assert.equal(await state(page), 'BLOCKED');
        assert.equal(await page.evaluate(() => window.__openCalls), 1);
    }));
    await check('synthetic denied child close is attempted once and requires manual handling', () => using(liveOptions, async page => {
        const child = await startLive(page, { deniedClose: true });
        await confirmParentMarker(page);
        await child.evaluate(() => { window.__ended = true; window.__child.check(); });
        await page.waitForFunction(() => window.__closeAttempts === 1);
        await page.evaluate(() => app._liveController.tick());
        assert.equal(await state(page), 'BLOCKED');
        assert.equal(await page.evaluate(() => window.__closeAttempts), 1);
        assert.equal(child.isClosed(), false);
    }));
    await check('synthetic parent closure disposes child coordination without navigation', () => using(liveOptions, async page => {
        const child = await startLive(page); await page.close();
        await child.evaluate(() => window.__child.check());
        assert.equal(await child.evaluate(() => window.__child.disposed), true);
    }));
    await check('synthetic strict message origin/source/generation and duplicate sequence validation', () => using(liveOptions, async page => {
        const child = await startLive(page);
        await page.evaluate(() => {
            const controller = app._liveController; const s = controller.session;
            const data = { protocol: 'xuexitong-live-v1', id: s.id, generation: s.generation, seq: 1000, timestamp: Date.now(), type: 'LIVE_COMPLETED', ended: true };
            window.dispatchEvent(new MessageEvent('message', { data, origin: 'https://untrusted.test', source: controller.child }));
            window.dispatchEvent(new MessageEvent('message', { data, origin: location.origin, source: window }));
            window.dispatchEvent(new MessageEvent('message', { data: { ...data, generation: s.generation - 1 }, origin: location.origin, source: controller.child }));
            window.dispatchEvent(new MessageEvent('message', { data: { ...data, seq: s.received }, origin: location.origin, source: controller.child }));
        });
        assert.equal(await state(page), 'WAITING_LIVE'); assert.equal(child.isClosed(), false);
    }));
    await check('synthetic blocked popup and cross-origin live entry never retry or advance', () => using(liveOptions, async page => {
        await page.evaluate(() => {
            const doc = document.querySelector('iframe').contentDocument; doc.body.innerHTML = '<a target="_blank" href="https://course.test/live">Synthetic live</a>';
            app.taskAdapter = { discover: () => ({ tasks: [{ kind: 'live', element: doc.querySelector('a') }], validateScope: () => true }) };
            window.__popupCalls = 0; window.open = () => { window.__popupCalls++; return null; }; app.run();
        });
        assert.equal(await state(page), 'BLOCKED'); assert.equal(await page.evaluate(() => window.__popupCalls), 1);
        await page.evaluate(() => { document.querySelector('iframe').contentDocument.querySelector('a').href = 'https://other.test/live'; app.run(); });
        assert.equal(await state(page), 'BLOCKED'); assert.equal(await page.evaluate(() => window.__popupCalls), 1);
    }));
    await check('synthetic document destruction cancels even an already queued tick', () => using([outer(), 0], async page => {
        await installDocuments(page);
        const positions = await page.evaluate(() => { const el = document.querySelector('iframe').contentDocument.querySelector('.synthetic-document'); const tick = app._documentController.tick; const before = el.scrollTop; app.destroy(); tick(); return [before, el.scrollTop, app._timers.size]; });
        assert.deepEqual(positions, [0, 0, 0]);
    }));
    await check('synthetic unverifiable document bottom safely stops', () => using([outer(), 0], async page => {
        await installDocuments(page);
        await page.evaluate(() => { document.querySelector('iframe').contentDocument.querySelector('.synthetic-document').style.display = 'none'; });
        await flush(page); assert.equal(await state(page), 'BLOCKED');
    }));
    await check('synthetic task invalidation disposes live parent; stale child result cannot advance', () => using(liveOptions, async page => {
        const child = await startLive(page);
        await page.evaluate(() => { document.querySelector('#node0').classList.remove('posCatalog_active'); document.querySelector('#node1').classList.add('posCatalog_active'); app._liveController.tick(); });
        assert.equal(await state(page), 'BLOCKED');
        await child.evaluate(() => { window.__ended = true; window.__child.check(); });
        assert.equal(await state(page), 'BLOCKED'); assert.equal(child.isClosed(), false);
    }));
    await check('synthetic lost/reloaded live communication blocks without reopening', () => using(liveOptions, async page => {
        const child = await startLive(page);
        await child.goto('https://course.test/reloaded');
        await page.evaluate(() => app._liveController.tick());
        assert.equal(await state(page), 'BLOCKED'); assert.equal(await page.evaluate(() => window.__openCalls), 1);
    }));
    await check('synthetic duplicate terminal child messages request closure only once', () => using(liveOptions, async page => {
        const child = await startLive(page, { deniedClose: true });
        await page.evaluate(() => {
            const c = app._liveController, s = c.session;
            const data = { protocol: 'xuexitong-live-v1', id: s.id, generation: s.generation, seq: s.received + 1, timestamp: Date.now(), type: 'LIVE_COMPLETED', ended: true };
            for (const seq of [data.seq, data.seq, data.seq + 1]) window.dispatchEvent(new MessageEvent('message', { data: { ...data, seq }, origin: location.origin, source: c.child }));
        });
        assert.equal(await page.evaluate(() => window.__closeAttempts), 1);
        await page.evaluate(() => app._liveController.tick()); assert.equal(await state(page), 'BLOCKED');
        assert.equal(child.isClosed(), false);
    }));
    await check('synthetic true live session-finished evidence hands off without invented duration', () => using(liveOptions, async page => {
        const child = await startLive(page, { duration: 'infinite' }); await confirmParentMarker(page);
        const closed = child.waitForEvent('close');
        await child.evaluate(() => { window.__sessionFinished = true; window.__child.check(); }); await closed;
        await page.evaluate(() => app._liveController.tick()); assert.equal(await state(page), 'PLAYING');
    }));
    await check('synthetic malformed or unrelated live completion cannot close the child', () => using(liveOptions, async page => {
        const child = await startLive(page);
        await page.evaluate(() => {
            const c = app._liveController, s = c.session;
            const base = { protocol: 'xuexitong-live-v1', id: s.id, generation: s.generation, seq: 100, timestamp: Date.now(), type: 'LIVE_NEAR_END', duration: Infinity, position: 99 };
            window.dispatchEvent(new MessageEvent('message', { data: base, origin: location.origin, source: c.child }));
            window.dispatchEvent(new MessageEvent('message', { data: { ...base, id: 'unrelated-session-id', seq: 101, duration: 100 }, origin: location.origin, source: c.child }));
        });
        assert.equal(await state(page), 'WAITING_LIVE'); assert.equal(child.isClosed(), false);
        const closed = child.waitForEvent('close');
        await child.evaluate(() => { window.__ended = true; window.__child.check(); }); await closed;
    }));
    for (const kind of ['video', 'document']) {
        await check(`synthetic finished ${kind} bypasses only trailing optional assessment into next chapter`, () => using([
            `<div class="prev_title" title="视频"></div><div id="coursetree"><ul><li><ul>${node(0, true, false)}<li><div id="optional" class="posCatalog_select"><span class="posCatalog_name" title="章节测验">章节测验</span><input value="1"></div></li></ul></li><li><ul>${node(1)}</ul></li></ul></div><iframe info="card"></iframe>`,
            kind === 'video' ? 1 : 0, false, null, true,
        ], async page => {
            await page.evaluate(() => { window.__nextChapter = 0; document.querySelector('#node1 .posCatalog_name').onclick = () => window.__nextChapter++; });
            if (kind === 'document') {
                await installDocuments(page);
                for (let i = 0; i < 40 && await state(page) === 'READING_DOCUMENT'; i++) await flush(page);
            } else {
                await creditCurrentLesson(page);
                await page.evaluate(() => { const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); }); await flush(page);
            }
            assert.equal(await state(page), 'NAVIGATION_COOLDOWN');
            await flush(page); assert.equal(await page.evaluate(() => window.__nextChapter), 1);
            assert.equal(await page.evaluate(() => document.querySelector('#optional input').value), '1');
            if (kind === 'document') assert.equal(await page.evaluate(() => document.querySelector('#node0 input').value), '1');
        }));
    }
    await check('synthetic live closure never closes an unrelated tab', () => using(liveOptions, async page => {
        const child = await startLive(page); const unrelated = await page.context().newPage(); await unrelated.goto('https://course.test/unrelated');
        await confirmParentMarker(page); const closed = child.waitForEvent('close');
        await child.evaluate(() => { window.__ended = true; window.__child.check(); }); await closed;
        await page.evaluate(() => app._liveController.tick());
        assert.equal(await state(page), 'PLAYING'); assert.equal(unrelated.isClosed(), false);
    }));
    await check('synthetic same-document parent URL change invalidates live waiting', () => using(liveOptions, async page => {
        const child = await startLive(page);
        await page.evaluate(() => { history.pushState({}, '', '/elsewhere'); app._liveController.tick(); });
        assert.equal(await state(page), 'BLOCKED'); assert.equal(child.isClosed(), false);
    }));
    await check('synthetic assessment-only chapter defers without changing unfinished status', () => using([
        '<div class="prev_title" title="章节测验"></div><div id="coursetree"><ul><li><ul><li><div class="posCatalog_select posCatalog_active"><span class="posCatalog_name" title="章节测验">章节测验</span></div></li></ul></li><li><ul>' + node(1) + '</ul></li></ul></div><iframe info="card"></iframe>', 0,
    ], async page => { assert.notEqual(await state(page), 'BLOCKED'); }));
    await check('synthetic verification inside an optional assessment prevents handoff', () => using([assessmentPage(), 0, false, null, true], async page => {
        await page.evaluate(() => { app._cancelTasks(); document.querySelector('iframe').contentDocument.body.innerHTML = '<input placeholder="请输入验证码">'; app.run(); });
        assert.equal(await state(page), 'BLOCKED');
        assert.equal(await page.evaluate(() => document.querySelector('#assessment input').value), '1');
    }));
    await check('synthetic noopener live link is unsupported without changing browser security policy', () => using(liveOptions, async page => {
        await page.evaluate(() => {
            const doc = document.querySelector('iframe').contentDocument; doc.body.innerHTML = '<a target="_blank" rel="noopener" href="https://course.test/live">Synthetic live</a>';
            app.taskAdapter = { discover: () => ({ tasks: [{ kind: 'live', element: doc.querySelector('a') }], validateScope: () => true }) };
            window.__popupCalls = 0; window.open = () => { window.__popupCalls++; return null; }; app.run();
        });
        assert.equal(await state(page), 'BLOCKED'); assert.equal(await page.evaluate(() => window.__popupCalls), 0);
    }));
    await check('synthetic live-like page without an evidence adapter never opens a window', () => using(liveOptions, async page => {
        await page.evaluate(() => { document.querySelector('iframe').contentDocument.body.innerHTML = '<a target="_blank" href="https://course.test/live">Synthetic lecture</a>'; window.open = () => { throw new Error('Unrecognized task opened a window'); }; app.run(); });
        await flush(page,45);
        assert.equal(await state(page), 'BLOCKED'); assert.equal(await page.evaluate(() => app.taskAdapter), null);
    }));
    await check('synthetic duplicate child installation keeps one player and one session listener', () => using(liveOptions, async page => {
        const child = await startLive(page);
        assert.deepEqual(await child.evaluate(() => {
            const first = window.__child;
            const second = window.__xuexitongTaskSupport.installChild({ isRecognized: () => true, getPlayer: () => document.querySelector('video') });
            return [first === second, window.__plays];
        }), [true, 1]);
        assert.equal(await state(page), 'WAITING_LIVE');
    }));
    async function shortSettings(page, { allFeatures = false, disableVideoStart = false } = {}) {
        await page.evaluate(({ allFeatures, disableVideoStart }) => {
            const settings = JSON.parse(JSON.stringify(window.__settingsDefaults));
            if (allFeatures) for (const key of Object.keys(settings.features)) settings.features[key] = true;
            if (disableVideoStart) settings.delays.videoStart.enabled = false;
            app.updateSettings(settings);
            window.__actionDraws = 0; Math.random = () => { window.__actionDraws++; return 0; };
        }, { allFeatures, disableVideoStart });
    }
    const ranges = { videoStart: [300, 900], nextVideo: [3000, 7000], documentScroll: [300, 1000], nextDocument: [3000, 7000], nextLesson: [2000, 8000], nextChapter: [3000, 8000], assessment: [1000, 2500], liveOpen: [500, 1500], liveReturn: [500, 1500] };
    for (const [category, bounds] of Object.entries(ranges)) for (const maximum of [false, true]) {
        await check(`action settings ${category} ${maximum ? 'maximum' : 'minimum'} integer bound`, () => using([], async page => {
            await shortSettings(page, { allFeatures: true });
            await page.evaluate(({ category, maximum }) => {
                window.__actionFired = 0; Math.random = () => maximum ? 0.999999999 : 0;
                app._runAction(category, 'range-test', () => window.__actionFired++);
            }, { category, maximum });
            assert.deepEqual(await page.evaluate(() => [...window.__timeoutDelays.values()]), [bounds[maximum ? 1 : 0]]);
            await flush(page); assert.equal(await page.evaluate(() => window.__actionFired), 1);
        }));
    }
    await check('action settings independently draw single-millisecond values and log three decimals', () => using([], async page => {
        await shortSettings(page);
        await page.evaluate(() => {
            const values = [0, 1.1 / 6001, 0.5]; let draws = 0; Math.random = () => values[draws++]; window.__fired = 0;
            for (let i = 0; i < 3; i++) app._runAction('nextLesson', `independent-${i}`, () => window.__fired++);
            window.__drawCount = draws;
        });
        assert.deepEqual(await page.evaluate(() => [...window.__timeoutDelays.values()]), [2000, 2001, 5000]);
        assert.equal(await page.evaluate(() => window.__drawCount), 3);
        assert.ok(await page.evaluate(() => window.__logs.includes('导航冷却 2.001s')));
        await flush(page); assert.equal(await page.evaluate(() => window.__fired), 3);
    }));
    for (const mode of ['global', 'category']) {
        await check(`action settings disabled ${mode} delays do not sample or queue a wait`, () => using([], async page => {
            await shortSettings(page);
            const result = await page.evaluate(mode => {
                const settings = JSON.parse(JSON.stringify(app.settings));
                if (mode === 'global') settings.randomDelaysEnabled = false; else settings.delays.nextLesson.enabled = false;
                app.updateSettings(settings); window.__fired = 0;
                Math.random = () => { throw new Error('Disabled delay sampled RNG'); };
                app._runAction('nextLesson', 'disabled', () => window.__fired++);
                return [window.__fired, app._actions.pending.size];
            }, mode);
            assert.deepEqual(result, [1, 0]);
        }));
    }
    for (const [feature, category] of [['videoPlayback', 'videoStart'], ['nextVideo', 'nextVideo'], ['nextLesson', 'nextLesson'], ['nextChapter', 'nextChapter'], ['assessment', 'assessment'], ['document', 'documentScroll'], ['live', 'liveOpen']]) {
        await check(`action settings independent feature switch ${feature}`, () => using([], async page => {
            await shortSettings(page, { allFeatures: true });
            await page.evaluate(({ feature, category }) => {
                window.__fired = 0;
                app._runAction(category, 'feature-pending', () => window.__fired++);
                window.__staleAction = [...window.__timeouts.values()][0];
                const settings = JSON.parse(JSON.stringify(app.settings)); settings.features[feature] = false; app.updateSettings(settings);
                window.__staleAction(); settings.features[feature] = true; app.updateSettings(settings);
            }, { feature, category });
            assert.equal(await page.evaluate(() => window.__fired), 0);
            assert.equal(await page.evaluate(() => app._actions.pending.size), 0);
            assert.equal(await page.evaluate(() => app._videoEl.playbackRate), 1);
        }));
    }
    await check('action settings default video startup delays once and does not replay active video', () => using([], async page => {
        await shortSettings(page);
        await page.evaluate(() => { app._videoEl.__plays = 0; app._videoEl.__paused = true; app.run(); app.play(); app.play(); });
        assert.equal(await state(page), 'ACTION_PENDING');
        assert.equal(await page.evaluate(() => app._actions.pending.size), 1);
        assert.deepEqual(await page.evaluate(() => [...window.__timeoutDelays.values()]), [300]);
        await flush(page); assert.equal(await page.evaluate(() => app._videoEl.__plays), 1);
        await page.evaluate(() => app.play()); assert.equal(await page.evaluate(() => app._videoEl.__plays), 1);
        assert.equal(await state(page), 'PLAYING');
    }));
    await check('action settings within-lesson next video uses only nextVideo category', () => using([outer(1, false), 3], async page => {
        await shortSettings(page, { disableVideoStart: true });
        await page.evaluate(() => { const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); });
        await flush(page);
        assert.equal(await page.evaluate(() => app._actions.pending.get('video-start').category), 'nextVideo');
        assert.deepEqual(await page.evaluate(() => [...window.__timeoutDelays.values()]), [ranges.nextVideo[0]]);
        await flush(page); assert.equal(await state(page), 'PLAYING');
    }));
    for (const category of ['nextLesson', 'nextChapter', 'assessment']) {
        await check(`action settings navigation precedence ${category} creates one timer and click`, () => using([
            category === 'assessment' ? assessmentPage() : category === 'nextChapter'
                ? '<div class="prev_title" title="视频"></div><div id="coursetree"><ul><li><ul>' + node(0, true, false) + '</ul></li><li><ul>' + node(1) + '</ul></li></ul></div><iframe info="card"></iframe>' : outer(2, false),
            category === 'assessment' ? 0 : 1,
        ], async page => {
            await shortSettings(page, { disableVideoStart: true });
            if(category!=='assessment') await creditCurrentLesson(page);
            await page.evaluate(category => {
                window.__clickCount = 0; document.querySelector('#node1 .posCatalog_name').onclick = () => window.__clickCount++;
                if (category === 'assessment') app.run(); else { const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); }
            }, category);
            if (category !== 'assessment') await flush(page);
            assert.equal(await page.evaluate(() => app._actions.pending.get('navigation').category), category);
            assert.equal(await page.evaluate(() => app._actions.pending.size), 1);
            assert.deepEqual(await page.evaluate(() => [...window.__timeoutDelays.values()]), [ranges[category][0]]);
            await page.evaluate(() => { app.nextUnit(); app.nextUnit(); });
            await flush(page); assert.equal(await page.evaluate(() => window.__clickCount), 1);
        }));
    }
    await check('action settings next document first step has one nextDocument delay', () => using([outer(2), 0], async page => {
        await shortSettings(page, { allFeatures: true }); await installDocuments(page, 2);
        for (let i = 0; i < 40; i++) {
            if (await page.evaluate(() => app._actions.pending.get('document-step')?.category === 'nextDocument')) break;
            await flush(page);
        }
        assert.equal(await page.evaluate(() => app._actions.pending.get('document-step').category), 'nextDocument');
        assert.equal(await page.evaluate(() => app._actions.pending.size), 1);
        const delay = await page.evaluate(() => [...window.__timeoutDelays.values()][0]); assert.ok(delay >= 500 && delay <= 1500);
        await flush(page); assert.equal(await page.evaluate(() => app._actions.pending.get('document-step').category), 'documentScroll');
    }));
    await check('action settings live open and return are delayed once with no stacked catalog cooldown', () => using(liveOptions, async page => {
        await shortSettings(page, { allFeatures: true });
        const child = await startLive(page, { beforeOpen: async page => {
            assert.equal(await state(page), 'WAITING_LIVE');
            assert.equal(await page.evaluate(() => window.__openCalls), 0);
            assert.equal(await page.evaluate(() => app._actions.pending.get('live-open').category), 'liveOpen');
            await flush(page);
        } });
        await child.waitForFunction(() => window.__plays === 1);
        await confirmParentMarker(page);
        await child.evaluate(() => { window.__ended = true; window.__child.check(); });
        await page.waitForFunction(() => app._actions.pending.has('live-return'));
        assert.equal(child.isClosed(), false); assert.equal(await page.evaluate(() => app._actions.pending.get('live-return').category), 'liveReturn');
        await page.evaluate(() => app._liveController.tick());
        const closed = child.waitForEvent('close'); await flush(page); await closed;
        await page.evaluate(() => app._liveController.tick());
        assert.equal(await page.evaluate(() => app._actions.pending.has('navigation')), false);
        assert.equal(await page.evaluate(() => app._actions.pending.get('video-start').category), 'videoStart');
        await flush(page); assert.equal(await state(page), 'PLAYING');
        assert.equal(await page.evaluate(() => window.__openCalls), 1);
    }));
    await check('action settings background toggle preserves immediate recovery without action timers', () => using([], async page => {
        await shortSettings(page);
        const result = await page.evaluate(() => {
            const v = app._videoEl, before = v.__plays; const settings = JSON.parse(JSON.stringify(app.settings));
            settings.features.background = false; app.updateSettings(settings); window.dispatchEvent(new Event('blur'));
            v.__paused = true; app._checkVideoStatus(); const disabled = v.__plays - before;
            settings.features.background = true; app.updateSettings(settings); const beforeEvent = v.__plays - before;
            window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange'));
            return [disabled, beforeEvent, v.__plays - before, app._actions.pending.size, v.playbackRate];
        });
        assert.deepEqual(result, [0, 0, 1, 0, 1]);
    }));
    for (const reason of ['user', 'page', 'blocked', 'destroy']) {
        await check(`action settings cancellation ${reason} rejects stale callbacks`, () => using([], async page => {
            await shortSettings(page);
            await page.evaluate(reason => {
                window.__fired = 0; app._runAction('nextLesson', 'cancel-test', () => window.__fired++);
                window.__stale = [...window.__timeouts.values()][0];
                if (reason === 'user') document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                if (reason === 'page') document.querySelector('.prev_title').title = 'Different content';
                if (reason === 'blocked') app._block('Synthetic safety stop');
                if (reason === 'destroy') app.destroy();
            }, reason);
            await page.evaluate(() => window.__stale());
            assert.equal(await page.evaluate(() => window.__fired), 0);
            assert.equal(await page.evaluate(() => app._actions.pending.size), 0);
        }));
    }
    await check('action settings UI mounts compact, expands, validates and restores defaults', () => using([outer(), 1, false, null, false, true], async page => {
        const host = page.locator('#xuexitong-v3-settings'); assert.equal(await host.count(), 1);
        assert.equal(await host.locator('details').first().evaluate(el => el.open), false);
        await host.locator('summary').first().click(); assert.equal(await host.locator('details').first().evaluate(el => el.open), true);
        await host.locator('[data-preset]').selectOption('short');
        assert.equal(await host.locator('input[data-feature]').count(), 10); // Two independently configurable audio switches.
        assert.equal(await host.locator('input[data-enable]').count(), 7); // nextContent unifies video/audio/document transitions; rest has its own controls.
        const min = host.locator('input[data-category="nextLesson"][data-bound="minMs"]');
        await min.fill('-1'); await min.dispatchEvent('change');
        assert.equal(await page.evaluate(() => app.settings.delays.nextLesson.minMs), ranges.nextLesson[0]);
        assert.ok((await host.locator('[data-status]').textContent()).includes('整数毫秒'));
        await min.fill('1137'); await min.dispatchEvent('change');
        assert.equal(await page.evaluate(() => app.settings.delays.nextLesson.minMs), 1137);
        await host.locator('[data-preset]').selectOption('legacy');
        assert.equal(await page.evaluate(() => app.settings.delays.nextChapter.maxMs), 12000);
        await host.locator('[data-reset]').click();
        assert.equal(await page.evaluate(() => app.settings.preset), 'short');
        assert.deepEqual(await page.evaluate(() => [app.settings.features.document, app.settings.features.live, app.settings.features.background]), [false, false, true]);
        await page.evaluate(() => app.destroy()); assert.equal(await host.count(), 0);
    }));
    await check('action settings panel clicks do not cancel actions until a relevant setting changes', () => using([outer(), 1, false, null, false, true], async page => {
        await shortSettings(page);
        await page.evaluate(() => { window.__fired = 0; app._runAction('nextLesson', 'panel-test', () => window.__fired++); });
        const host = page.locator('#xuexitong-v3-settings'); await host.locator('summary').first().click();
        assert.equal(await page.evaluate(() => app._actions.pending.size), 1);
        await host.locator('input[data-feature="nextLesson"]').uncheck();
        assert.equal(await page.evaluate(() => app._actions.pending.size), 0);
        await host.locator('input[data-feature="nextLesson"]').check();
        await flush(page); assert.equal(await page.evaluate(() => window.__fired), 0);
        assert.equal(await page.evaluate(() => app._videoEl.playbackRate), 1);
    }));
    await check('action settings persist whitelisted fields across a new document without account data', () => using([outer(), 1, false, null, false, true], async page => {
        await shortSettings(page);
        await page.evaluate(() => {
            const settings = JSON.parse(JSON.stringify(app.settings)); settings.features.nextLesson = false; settings.personalAccount = 'discard-me'; app.updateSettings(settings);
        });
        await page.evaluate(() => { app.settings.extraIdentity = 'discard-this-field'; });
        await page.locator('#xuexitong-v3-settings').locator('summary').first().click();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('xuexitong.v3.action-settings.v1')).collapsed === false);
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('xuexitong.v3.action-settings.v1')));
        assert.equal(saved.extraIdentity, undefined);
        assert.equal(saved.personalAccount, undefined); assert.equal(saved.features.nextLesson, false);
        await page.reload(); await page.setContent(outer()); await page.addScriptTag({ content: jquery });
        await page.evaluate(() => { window.setInterval = fn => { window.__boot = fn; return 1; }; });
        await page.addScriptTag({ content: source }); await page.evaluate(() => window.__boot());
        assert.equal(await page.evaluate(() => app.settings.features.nextLesson), false);
        assert.equal(await page.locator('#xuexitong-v3-settings').count(), 1);
    }));
    await check('action settings edits never restart a completed task', () => using([outer(1, false)], async page => {
        await creditCurrentLesson(page);
        await page.evaluate(() => { window.__finishedVideo = app._videoEl; const v = app._videoEl; v.__ended = true; v.dispatchEvent(new Event('ended')); }); await flush(page);
        assert.equal(await state(page), 'FINISHED');
        const before = await page.evaluate(() => window.__finishedVideo.__plays);
        await shortSettings(page); await page.evaluate(() => { const s = JSON.parse(JSON.stringify(app.settings)); s.features.videoPlayback = false; app.updateSettings(s); s.features.videoPlayback = true; app.updateSettings(s); });
        await flush(page); assert.equal(await state(page), 'FINISHED');
        assert.equal(await page.evaluate(() => window.__finishedVideo.__plays), before);
        assert.equal(await page.evaluate(() => app._completedVideos.has(window.__finishedVideo)), true);
    }));
    for (const disableDuringLoad of [false, true]) {
        await check(`action settings video tab consumes one start delay; disabled during load=${disableDuringLoad}`, () => using([outer(1, false, '学习目标') + '<div class="prev_white">2视频</div>', 0], async page => {
            await shortSettings(page);
            await page.evaluate(() => {
                document.querySelector('.prev_white').onclick = () => { document.querySelector('.prev_title').title = '视频'; window.__addVideos(1); };
                app.run();
            });
            assert.equal(await page.evaluate(() => app._actions.pending.get('video-tab').category), 'videoStart');
            await flush(page);
            if (disableDuringLoad) await page.evaluate(() => { const s = JSON.parse(JSON.stringify(app.settings)); s.features.videoPlayback = false; app.updateSettings(s); });
            await flush(page);
            assert.equal(await page.evaluate(() => window.__actionDraws), 1);
            assert.equal(await page.evaluate(() => document.querySelector('iframe').contentDocument.querySelector('video').__plays), disableDuringLoad ? 0 : 1);
        }));
    }
    await check('action settings ended player invalidates pending startup without replay', () => using([], async page => {
        await shortSettings(page);
        await page.evaluate(() => { const v = app._videoEl; v.__plays = 0; v.__paused = true; app.run(); v.__ended = true; });
        await flush(page);
        assert.equal(await state(page), 'BLOCKED');
        assert.equal(await page.evaluate(() => app._videoEl.__plays), 0);
    }));
    await check('action settings disabling next chapter also cancels a pending assessment handoff', () => using([assessmentPage(), 0], async page => {
        await shortSettings(page);
        await page.evaluate(() => {
            window.__handoff = 0; document.querySelector('#node1 .posCatalog_name').onclick = () => window.__handoff++;
            app.run(); const stale = [...window.__timeouts.values()][0];
            const s = JSON.parse(JSON.stringify(app.settings)); s.features.nextChapter = false; app.updateSettings(s); stale();
        });
        assert.equal(await page.evaluate(() => app._actions.pending.size), 0);
        assert.equal(await page.evaluate(() => window.__handoff), 0);
    }));
    await check('action settings disabling live cancels a delayed popup before creation', () => using(liveOptions, async page => {
        await shortSettings(page, { allFeatures: true });
        await page.evaluate(() => {
            const doc = document.querySelector('iframe').contentDocument;
            doc.body.innerHTML = '<a target="_blank" href="https://course.test/live">Synthetic lecture</a>';
            app.taskAdapter = { discover: () => ({ tasks: [{ kind: 'live', element: doc.querySelector('a') }], validateScope: () => true }) };
            window.__opens = 0; window.open = () => { window.__opens++; return null; }; app.run();
            const stale = [...window.__timeouts.values()][0]; const s = JSON.parse(JSON.stringify(app.settings)); s.features.live = false; app.updateSettings(s); stale();
        });
        assert.equal(await page.evaluate(() => window.__opens), 0);
        assert.equal(await page.evaluate(() => app._actions.pending.size), 0);
    }));
    await check('action settings zero-delay document steps remain incremental and nonblocking', () => using([outer(), 0], async page => {
        await shortSettings(page, { allFeatures: true }); await installDocuments(page);
        await page.evaluate(() => { const s = JSON.parse(JSON.stringify(app.settings)); s.randomDelaysEnabled = false; app.updateSettings(s); app.run(); });
        assert.equal(await state(page), 'READING_DOCUMENT');
        assert.deepEqual(await page.evaluate(() => [...window.__timeoutDelays.values()]), [0]);
        assert.equal(await page.evaluate(() => document.querySelector('iframe').contentDocument.querySelector('.synthetic-document').scrollTop), 0);
        await flush(page);
        const top = await page.evaluate(() => document.querySelector('iframe').contentDocument.querySelector('.synthetic-document').scrollTop);
        assert.ok(top > 0 && top < 600);
        assert.deepEqual(await page.evaluate(() => [...window.__timeoutDelays.values()]), [0]);
    }));
    await check('action settings custom long video-tab wait does not consume loading retries', () => using([outer(1, false, '学习目标') + '<div class="prev_white">2视频</div>', 0], async page => {
        await shortSettings(page);
        await page.evaluate(() => {
            const s = JSON.parse(JSON.stringify(app.settings)); s.preset = 'custom'; s.delays.videoStart.minMs = 120000; s.delays.videoStart.maxMs = 120000; app.updateSettings(s);
            app.run(); for (let i = 0; i < 50; i++) app.play();
        });
        assert.equal(await page.evaluate(() => app._actions.pending.size), 1);
        assert.equal(await page.evaluate(() => app._tryTimes), 0);
        assert.ok(await page.evaluate(() => [...window.__timeoutDelays.values()].includes(120000)));
    }));
    // A: native inventory plus player/viewer UI must not become extra tasks.
    async function ownedAttachmentUI(page) {
        const html=readFileSync(new URL('../fixtures/synthetic/owned-attachment-ui.html',import.meta.url),'utf8');
        await attachments(page,'',false);
        await page.evaluate(html=>{
            const root=document.querySelector('iframe[info="card"]').contentDocument;
            const wrap=root.createElement('div');wrap.className='ans-attach-online';root.body.append(wrap);
            for(const frame of [...root.querySelectorAll('iframe')])wrap.append(frame);
            for(const [i,frame] of [...root.querySelectorAll('iframe')].entries()) {
                const doc=frame.contentDocument;
                if(i<4) {
                    doc.body.innerHTML=html;
                    const v=doc.querySelector('video');v.__paused=true;v.__ended=false;v.__plays=0;v.__readyState=0;
                    Object.defineProperties(v,{readyState:{get:()=>v.__readyState},paused:{get:()=>v.__paused},ended:{get:()=>v.__ended}});
                    v.play=()=>{v.__plays++;v.__paused=false;return Promise.resolve();};window.__attachmentVideos[i]=v;
                    doc.querySelector('iframe').contentDocument.body.innerHTML='<form><input value="owned control"></form>';
                } else {
                    doc.body.innerHTML='<div class="ans-attach-online insertdoc-online-pdf"><iframe></iframe></div>';
                    doc.querySelector('iframe').contentDocument.body.innerHTML='<canvas></canvas><button>Next page</button>';
                }
            }
            (app._recovery?.resumeExplicitly(),app.run());
        },html);
    }
    await check('repair A exact four video and PDF inventory waits only for selected readiness; owned UI nonblocking',()=>using([outer(),1],async page=>{
        await ownedAttachmentUI(page);
        assert.deepEqual(await page.evaluate(()=>{const m=app._discoverMedia();return[m.tasks.length,m.unsupported,m.reasons,app._state,window.__attachmentVideos.map(v=>v.__plays)];}),[5,false,[],'WAITING_MEDIA',[0,0,0,0]]);
        await page.evaluate(()=>{const v=window.__attachmentVideos[0];v.__readyState=4;v.dispatchEvent(new Event('canplay'));});await flush(page);
        assert.deepEqual(await page.evaluate(()=>[app._state,window.__attachmentVideos.map(v=>v.__plays)]),['PLAYING',[1,0,0,0]]);
        for(let i=0;i<4;i++){
            if(i>0){await page.evaluate(i=>{const v=window.__attachmentVideos[i];v.__readyState=4;v.dispatchEvent(new Event('canplay'));},i);await flush(page);}
            await page.evaluate(i=>{const v=window.__attachmentVideos[i];v.__ended=true;v.__paused=true;v.dispatchEvent(new Event('ended'));},i);await flush(page,2);
        }
        assert.equal(await state(page),'PAUSED_AUTOMATION');
        assert.equal(await page.evaluate(()=>app._discoverMedia().tasks[4].status),'pending');
        assert.deepEqual(await page.evaluate(()=>window.__attachmentVideos.map(v=>v.__plays)),[1,1,1,1]);
    }));
    for(const variant of ['unknown','competing','missing','change','cancel']) await check(`repair A ${variant} remains safe`,()=>using([outer(),1],async page=>{
        await ownedAttachmentUI(page);
        await page.evaluate(variant=>{
            const root=document.querySelector('iframe[info="card"]').contentDocument;
            if(variant==='unknown'){const el=root.createElement('iframe');el.className='ans-attach-online unknown';root.body.append(el);}
            if(variant==='competing')window.__attachmentVideos[2].__paused=false;
            if(variant==='missing')window.__attachmentVideos[0].remove();
            if(variant==='change')document.querySelector('#node0').id='changed';
            if(variant==='cancel')app.destroy();
            const v=window.__attachmentVideos[0];v.__readyState=4;v.dispatchEvent(new Event('canplay'));
        },variant);await flush(page,85);
        assert.equal(await page.evaluate(()=>window.__attachmentVideos.reduce((n,v)=>n+v.__plays,0)),0);
        if(variant==='unknown')assert.ok(await page.evaluate(()=>app._discoverMedia().diagnosticTriggers.some(t=>t.phase==='task-boundary'&&t.tag==='IFRAME')));
    }));
    // B: both own platform indicators must agree before any playback is bypassed.
    async function priorCredit(page,variant='single') {
        if(variant==='multi'||variant==='partial')await attachments(page,'',false);
        await page.evaluate(variant=>{
            app._cancelTasks();app._videoContext=null;app._isPlaying=false;
            const node=document.querySelector('#node0');node.querySelector('.jobUnfinishCount').value=variant==='partial'?'4':'0';
            if(variant==='partial')node.insertAdjacentHTML('beforeend','<div class="ans-attach-online"><span class="icon_Completed"></span></div>');
            else node.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');
            if(variant==='missing-count')node.querySelector('input').remove();
            if(variant==='missing-marker')node.querySelector('.icon_Completed').remove();
            window.__creditPlayers=[...app._playableMedia().videos];for(const v of window.__creditPlayers){v.__plays=0;v.__paused=true;}
            (app._recovery?.resumeExplicitly(),app.run());
        },variant);
    }
    for(const variant of ['single','multi'])await check(`repair B reliable ${variant} platform credit avoids replay without fabricated ended`,()=>using([outer(),1],async page=>{
        await priorCredit(page,variant);assert.equal(await state(page),'VERIFYING_PLATFORM_COMPLETION');await flush(page,2);
        assert.equal(await state(page),'FINISHED');
        assert.ok(await page.evaluate(()=>window.__creditPlayers.every(v=>v.__plays===0&&!v.ended&&!app._completedVideos.has(v))));
    }));
    for(const variant of ['partial','missing-count','missing-marker'])await check(`repair B ${variant} does not prove full lesson complete`,()=>using([outer(),1],async page=>{
        await priorCredit(page,variant);await flush(page,2);
        assert.equal(await state(page),'PLAYING');assert.equal(await page.evaluate(()=>window.__creditPlayers[0].__plays),1);
    }));
    for(const variant of ['marker','identity','document'])await check(`repair B ${variant} change invalidates prior credit before navigation`,()=>using([outer(2),1],async page=>{
        await priorCredit(page);
        await page.evaluate(variant=>{if(variant==='marker')document.querySelector('#node0 input').value='1';if(variant==='identity')document.querySelector('#node0').id='changed';if(variant==='document'){const f=document.querySelector('iframe[info="card"]');f.remove();document.body.insertAdjacentHTML('beforeend','<iframe info="card"></iframe>');}},variant);
        await flush(page,2);assert.equal(await state(page),'BLOCKED');assert.equal(await page.evaluate(()=>window.__creditPlayers[0].__plays),0);
    }));
    await check('repair B completed lesson uses shared navigation and rejects repeated completed identity',()=>using([outer(2),1],async page=>{
        await page.evaluate(()=>{window.__creditClicks=0;document.querySelector('#node1 span').onclick=()=>window.__creditClicks++;});
        await priorCredit(page);await flush(page,2);assert.equal(await page.evaluate(()=>window.__creditClicks),1);
        await page.evaluate(()=>{app._cancelTasks();app._state='READY';app._platformCompletion=null;app._priorChecked=null;app._videoContext=null;app._checkPriorCompletion();});
        assert.equal(await state(page),'BLOCKED');
    }));
    // C: native audio gets an audible first attempt; rejection never auto-mutes it.
    for(const property of ['muted','defaultMuted','volume'])await check(`repair C audible initial audio corrects ${property}`,()=>using([outer(),1],async page=>{
        await audioLesson(page,'',false,false);
        await page.evaluate(property=>{const a=window.__audio;if(property==='volume')a.volume=0;else a[property]=true;app.run();},property);await flush(page);
        assert.deepEqual(await page.evaluate(()=>[app._state,window.__audio.muted,window.__audio.defaultMuted,window.__audio.volume,window.__audio.playbackRate]),['PLAYING',false,false,1,1]);
    }));
    await check('repair C autoplay denial uses one muted fallback then optional trusted gesture',()=>using([outer(),1],async page=>{
        await audioLesson(page,'',false,false);
        await page.evaluate(()=>{const a=window.__audio;a.__plays=0;a.play=()=>{a.__plays++;return Promise.reject(new DOMException('Synthetic autoplay denial','NotAllowedError'));};app.run();});await flush(page,3);
        assert.deepEqual(await page.evaluate(()=>[app._state,window.__audio.muted,window.__audio.__plays]),['WAITING_AUDIO_GESTURE',true,2]);
        await page.evaluate(()=>app._audioNotice.shadowRoot.querySelector('button').click());
        assert.equal(await page.evaluate(()=>window.__audio.__plays),2);
        await page.evaluate(()=>{const a=window.__audio;a.play=()=>{a.__plays++;a.__paused=false;return Promise.resolve();};});
        await page.getByRole('button',{name:'有声播放',exact:true}).click();
        assert.deepEqual(await page.evaluate(()=>[app._state,window.__audio.muted,window.__audio.__plays,window.__audio.playbackRate]),['PLAYING',false,3,1]);
        await page.evaluate(()=>{window.__audio.volume=0;window.__audio.dispatchEvent(new Event('volumechange'));});
        assert.ok(await page.evaluate(()=>app._audioNotice.shadowRoot.textContent.includes('音量为零')));
        await page.getByRole('button',{name:'本次允许静音继续',exact:true}).click();
        assert.equal(await page.evaluate(()=>window.__audio.muted),true);
        assert.ok(await page.evaluate(()=>app._audioNotice.shadowRoot.textContent.includes('已静音')));
        await page.evaluate(()=>app.destroy());assert.equal(await page.evaluate(()=>!!app._audioNotice),false);
    }));
    await check('repair C immediate audio recovery rejection waits; video mute fallback unchanged',()=>using([outer(),1],async page=>{
        await audioLesson(page);await flush(page);
        await page.evaluate(()=>{const a=window.__audio;a.__paused=true;a.__plays=0;a.play=()=>{a.__plays++;return Promise.reject(new DOMException('denied','NotAllowedError'));};app._tryResumePlayback('synthetic focus');});
        await flush(page,2);assert.deepEqual(await page.evaluate(()=>[app._state,window.__audio.__plays,window.__audio.muted]),['WAITING_AUDIO_GESTURE',2,true]);
        await flush(page,5);assert.equal(await page.evaluate(()=>window.__audio.__plays),2);
    }));
    await check('controls manual type hint retries BLOCKED once, respects type and stops without parallel playback',()=>using([outer(),1],async page=>{
        await page.evaluate(()=>{app.stopAutomation();app._block('synthetic prior failure');const s=JSON.parse(JSON.stringify(app.settings));s.features.videoPlayback=false;app.updateSettings(s);app._settingsPanel.shadowRoot.querySelector('details').open=true;app._settingsPanel.shadowRoot.querySelector('[data-task-controls]').open=true;});
        const controls=page.locator('#xuexitong-v3-settings');
        await controls.locator('[data-task-type]').selectOption('audio');await controls.locator('[data-attempt]').click();
        assert.ok(await page.evaluate(()=>app._lastNotice.includes('未识别到此类型')));
        await controls.locator('[data-task-type]').selectOption('video');await controls.locator('[data-attempt]').click();
        assert.equal(await state(page),'PLAYING');
        const before=await page.evaluate(()=>app._videoEl.__plays);
        await controls.locator('[data-attempt]').click();assert.equal(await page.evaluate(()=>app._videoEl.__plays),before);
        await page.locator('#xuexitong-v3-notice').locator('[data-stop]').click();assert.equal(await state(page),'PAUSED_AUTOMATION');
        assert.equal(await page.evaluate(()=>app._videoEl.paused),false);
        assert.equal(await page.evaluate(()=>{document.querySelector('#node0').id='different-task';return app._inspectTask().blocked;}),true);
        await page.evaluate(()=>app.destroy());assert.equal(await page.locator('#xuexitong-v3-notice').count(),0);
    }));
    await check('controls five-second navigation preview replaces legacy delay; stop and stale identity prevent clicks',()=>using([outer(2),1],async page=>{
        await page.evaluate(()=>{window.__previewClicks=0;document.querySelector('#node1 span').onclick=()=>window.__previewClicks++;});
        await priorCredit(page);await flush(page);
        assert.equal(await state(page),'NAVIGATION_COOLDOWN');
        assert.deepEqual(await page.evaluate(()=>[...window.__timeoutDelays.values()]),[5000]);
        assert.ok(await page.evaluate(()=>app._lastNotice.includes('5 秒')));
        await page.evaluate(()=>{window.__oldNavigation=[...window.__timeouts.values()][0];window.__clock+=2000;for(const fn of window.__intervals.values())fn();});
        assert.ok(await page.evaluate(()=>app._lastNotice.includes('3 秒')));
        await page.locator('#xuexitong-v3-notice').locator('[data-stop]').click();
        await page.evaluate(()=>window.__oldNavigation());assert.equal(await page.evaluate(()=>window.__previewClicks),0);
        await page.evaluate(()=>app._attemptTask('completed'));await flush(page);
        await page.evaluate(()=>document.querySelector('#node0').id='obsolete');await flush(page,2);
        assert.equal(await page.evaluate(()=>window.__previewClicks),0);assert.equal(await state(page),'BLOCKED');
    }));
    async function installDocument(page, delayed=false) {
        await page.evaluate(delayed=>{
            app.stopAutomation();const root=document.querySelector('iframe[info="card"]').contentDocument;
            root.body.innerHTML='<iframe class="ans-attach-online insertdoc-online-pdf"></iframe>';
            const wrapper=root.querySelector('iframe').contentDocument;wrapper.body.innerHTML='<iframe title="owned document wrapper"></iframe>';
            wrapper.documentElement.style.height='184px';wrapper.body.insertAdjacentHTML('beforeend','<canvas width=10 height=10></canvas>');
            wrapper.body.append(wrapper.createElement('iframe')); // Empty auxiliary leaf must not poison rendered inner reader.
            const doc=wrapper.querySelector('iframe').contentDocument;
            const shell=wrapper.createElement('iframe');wrapper.body.append(shell);shell.contentDocument.body.innerHTML='<canvas width=10 height=10></canvas>'; // Fitting shell is not a second scrolling reader.
            doc.body.innerHTML='<div style="height:100px;overflow-y:auto;width:200px" id="synthetic-scroll"><div style="height:900px"></div></div>';
            window.__documentFrame=root.querySelector('iframe');window.__documentScroll=doc.querySelector('#synthetic-scroll');
            if(!delayed)window.__documentScroll.firstChild.innerHTML='<canvas width="180" height="900"></canvas>';
            if(!delayed){const zeroLeaf=doc.createElement('iframe');zeroLeaf.style.cssText='position:absolute;top:0;height:100px;width:100px';window.__documentScroll.firstChild.append(zeroLeaf);zeroLeaf.contentDocument.body.innerHTML='<canvas width=10 height=10></canvas>';}
            const s=JSON.parse(JSON.stringify(app.settings));s.features.document=false;app.updateSettings(s);
            if(delayed)app._attachmentSnapshot={root,id:'obsolete-inventory',tasks:[]}; // Explicit retry must rediscover, not retain a failed cache.
            app._settingsPanel.shadowRoot.querySelector('details').open=true;app._settingsPanel.shadowRoot.querySelector('[data-task-controls]').open=true;
        },delayed);
        const controls=page.locator('#xuexitong-v3-settings');await controls.locator('[data-task-type]').selectOption('document');await controls.locator('[data-attempt]').click();
    }
    await check('controls owned document scroll is gradual; local bottom without platform credit cannot navigate',()=>using([outer(2,false,'文档'),0],async page=>{
        await installDocument(page);assert.equal(await state(page),'READING_DOCUMENT');await flush(page,2);
        assert.ok(await page.evaluate(()=>window.__documentScroll.scrollTop>0&&window.__documentScroll.scrollTop<800));
        await flush(page,90);assert.equal(await state(page),'BLOCKED');
        assert.equal(await page.evaluate(()=>window.__documentScroll.scrollTop),800);
        assert.equal(await page.evaluate(()=>document.querySelector('.posCatalog_active').id),'node0');
        assert.ok(await page.evaluate(()=>app._lastNotice.includes('平台尚未确认完成')));
    }));
    await check('controls delayed document rendering resumes bounded wait and credited reading gets navigation preview',()=>using([outer(2,false,'文档'),0],async page=>{
        await installDocument(page,true);assert.equal(await state(page),'WAITING_DOCUMENT');
        await page.evaluate(()=>{window.__documentScroll.firstChild.innerHTML='<canvas width="180" height="900"></canvas>';});await flush(page);
        assert.equal(await state(page),'READING_DOCUMENT');
        await page.evaluate(()=>{document.querySelector('#node0 input').value='0';document.querySelector('#node0').insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');});
        // Stop flushing when the preview appears: mock timers have no wall-clock delay.
        for(let i=0;i<30&&await state(page)==='READING_DOCUMENT';i++)await flush(page);
        assert.equal(await state(page),'NAVIGATION_COOLDOWN');assert.ok(await page.evaluate(()=>app._lastNotice.includes('5 秒')));
        await page.locator('#xuexitong-v3-notice').locator('[data-stop]').click();await flush(page,3);
        assert.equal(await page.evaluate(()=>document.querySelector('.posCatalog_active').id),'node0');
    }));
    await check('controls native approved-origin replay link opens only by explicit action; text-only cards stay unsupported',()=>using([outer(2,false,'直播'),0,false,null,false,'recorded'],async page=>{
        await page.evaluate(()=>{
            app.stopAutomation();const label=document.querySelector('#node0 .posCatalog_name');label.title=label.textContent='专题讲座直播';
            const root=document.querySelector('iframe[info="card"]').contentDocument;
            root.body.innerHTML='<a target="_blank" href="https://zhibo.chaoxing.com/synthetic-replay">可回放</a>';
            window.__nativeClicks=0;root.querySelector('a').onclick=e=>{e.preventDefault();window.__nativeClicks++;window.__stateAtOpen=app._state;};
            const s=JSON.parse(JSON.stringify(app.settings));s.features.live=true;app.updateSettings(s);app.run();
            app._settingsPanel.shadowRoot.querySelector('details').open=true;app._settingsPanel.shadowRoot.querySelector('[data-task-controls]').open=true;
        });
        assert.equal(await state(page),'WAITING_LIVE');assert.equal(await page.evaluate(()=>window.__nativeClicks),0);
        const controls=page.locator('#xuexitong-v3-settings');await controls.locator('[data-task-type]').selectOption('live');await controls.locator('[data-attempt]').click();
        assert.deepEqual(await page.evaluate(()=>[window.__nativeClicks,window.__stateAtOpen]),[1,'WAITING_LIVE']);
        assert.ok(await page.evaluate(()=>app._lastNotice.includes('无法确认新窗口')));
        await controls.locator('[data-attempt]').click();assert.equal(await page.evaluate(()=>window.__nativeClicks),1);
        await page.evaluate(()=>{app.stopAutomation();document.querySelector('iframe[info="card"]').contentDocument.body.innerHTML='<div>可回放，观看90%</div>';});
        await controls.locator('[data-attempt]').click();assert.ok(await page.evaluate(()=>app._lastNotice.includes('未找到可识别的直播入口')));
    }));
    await check('credit marker-only text lesson advances without media; contradictory count prevents bypass',()=>using([outer(2),0],async page=>{
        await page.evaluate(()=>{app.stopAutomation();const n=document.querySelector('#node0');n.querySelector('input').remove();n.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');document.querySelector('iframe[info="card"]').contentDocument.body.innerHTML='<iframe></iframe>';app._attemptTask('completed');});
        await flush(page);assert.equal(await state(page),'NAVIGATION_COOLDOWN');
        await page.evaluate(()=>{document.querySelector('#node0').insertAdjacentHTML('beforeend','<input class="jobUnfinishCount" value="1">');});
        await flush(page);assert.equal(await state(page),'BLOCKED');
    }));
    await check('credit unknown text lesson observes delayed marker without inventing completion',()=>using([outer(2),0],async page=>{
        await page.evaluate(()=>{app.stopAutomation();document.querySelector('#node0 input').remove();app.run();});
        assert.equal(await state(page),'WAITING_CREDIT');await flush(page,8);assert.equal(await state(page),'WAITING_CREDIT');
        await page.evaluate(()=>document.querySelector('#node0').insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>'));
        await flush(page,2);assert.equal(await state(page),'NAVIGATION_COOLDOWN');
    }));
    for(const incomplete of [false,true])await check(`lifecycle reused document consecutive credit; final incomplete=${incomplete}`,()=>using([outer(3),0],async page=>{
        await page.evaluate(incomplete=>{
            app.stopAutomation();window.__transitionClicks=0;
            for(const [i,node] of [...document.querySelectorAll('.posCatalog_select')].entries()){
                if(!incomplete||i<2){node.querySelector('input').remove();node.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');}
                node.querySelector('span').onclick=()=>{
                    window.__transitionClicks++;document.querySelector('.posCatalog_active').classList.remove('posCatalog_active');node.classList.add('posCatalog_active');
                    document.querySelector('iframe[info="card"]').contentDocument.body.innerHTML='<p>Destination '+i+'</p>';
                    if(incomplete&&i===2)window.__addVideos(1);
                    node.replaceWith(node.cloneNode(true)); // Platform sidebar re-render preserves identity, not object reference.
                };
            }
            app.run();
        },incomplete);
        await flush(page,20);
        assert.equal(await state(page),incomplete?'PLAYING':'FINISHED');
        assert.equal(await page.evaluate(()=>window.__transitionClicks),2);
        assert.equal(await page.evaluate(()=>app._completedVisits.size),2);
        assert.ok(await page.evaluate(()=>!app._lastNotice.includes('0 秒')));
    }));
    await check('lifecycle startup wait accepts delayed credit without waiting for media',()=>using([outer(2),0],async page=>{
        await page.evaluate(()=>{app.stopAutomation();app.run({startup:true});});assert.equal(await state(page),'WAITING_STARTUP');
        await page.evaluate(()=>{const n=document.querySelector('#node0');n.querySelector('input').value='0';n.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');});
        await flush(page,2);assert.equal(await state(page),'NAVIGATION_COOLDOWN');
    }));
    await check('resumption frame load keeps countdown; in-course route changes resume unfinished video',()=>using([outer(2),0,false,null,false,true],async page=>{
        await page.evaluate(()=>{
            app.stopAutomation();history.replaceState(null,'','?courseId=synthetic&chapterId=old');
            const first=document.querySelector('#node0');first.querySelector('input').remove();first.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');
            window.__routeClicks=0;document.querySelector('#node1 span').onclick=()=>{
                window.__routeClicks++;history.replaceState(null,'','?courseId=synthetic&chapterId=new');
                document.querySelector('.posCatalog_active').classList.remove('posCatalog_active');document.querySelector('#node1').classList.add('posCatalog_active');
                document.querySelector('iframe[info="card"]').contentDocument.body.innerHTML='';window.__addVideos(1);
            };app.run();
        });await flush(page);
        await page.evaluate(()=>{const n=document.querySelector('#node0');n.replaceWith(n.cloneNode(true));document.body.append(document.createElement('aside'));document.querySelector('iframe[info="card"]').dispatchEvent(new Event('load'));});
        assert.equal(await state(page),'NAVIGATION_COOLDOWN');assert.equal(await page.evaluate(()=>app._completedVisits.size),0);
        await flush(page,6);assert.equal(await state(page),'PLAYING');assert.equal(await page.evaluate(()=>window.__routeClicks),1);
        assert.equal(await page.evaluate(()=>app._completedVisits.size),1);
    }));
    await check('native evidence source-present idle attachment starts selected player without load or seeking',()=>using([outer(),1],async page=>{
        await attachments(page,'',false);await page.evaluate(()=>{
            for(const v of window.__attachmentVideos){v.__readyState=0;v.setAttribute('src','https://course.test/synthetic.mp4');Object.defineProperty(v,'networkState',{get:()=>1});v.load=()=>{throw new Error('must not reset load');};}
            window.__attachmentVideos[1].currentTime=60;app.run();
        });await flush(page);assert.equal(await state(page),'PLAYING');
        assert.deepEqual(await page.evaluate(()=>window.__attachmentVideos.map(v=>v.__plays)),[1,0,0,0]);
        assert.equal(await page.evaluate(()=>window.__attachmentVideos[1].currentTime),60);
    }));
    await check('native evidence nested live card with unresolved target invokes original handler manually',()=>using([outer(2,false,'直播'),0,false,null,false,'recorded'],async page=>{
        await page.evaluate(()=>{
            app.stopAutomation();const frame=document.querySelector('iframe[info="card"]');frame.id='iframe';frame.contentDocument.body.innerHTML='<iframe></iframe>';
            const doc=frame.contentDocument.querySelector('iframe').contentDocument;
            doc.body.innerHTML='<a class="liveHref" href="javascript:void(0);"><div class="liveCard"><div class="live-ct"><span class="liveBtn live_blue">可回放</span></div></div></a><a id="openUrl"></a>';
            doc.body.insertAdjacentHTML('beforeend','<p>课程讨论：登录认证与验证技术</p>');
            window.__nestedOpen=0;doc.querySelector('a').onclick=()=>window.__nestedOpen++;
            const settings=JSON.parse(JSON.stringify(app.settings));settings.features.live=true;app.updateSettings(settings);
            app.run();
        });assert.equal(await state(page),'WAITING_LIVE');assert.equal(await page.evaluate(()=>window.__nestedOpen),1);
        assert.ok(await page.evaluate(()=>app._lastNotice.includes('弹窗结果未验证')));
        assert.equal(await page.evaluate(()=>{
            const unrelated=document.createElement('a');document.body.append(unrelated);
            try{window.__xuexitongTaskSupport.createParent({entry:unrelated,nativeEntry:true});return false;}
            catch(error){return error.message==='Unsupported native live entry';}
        }),true);
        await page.evaluate(()=>{app._settingsPanel.shadowRoot.querySelector('details').open=true;app._settingsPanel.shadowRoot.querySelector('[data-task-controls]').open=true;});
        const controls=page.locator('#xuexitong-v3-settings');await controls.locator('[data-task-type]').selectOption('live');
        await controls.locator('[data-attempt]').click();
        assert.equal(await page.evaluate(()=>window.__nestedOpen),2);
        assert.ok(await page.evaluate(()=>app._lastNotice.includes('无法确认新窗口')));
        await controls.locator('[data-attempt]').click();assert.equal(await page.evaluate(()=>window.__nestedOpen),2);
    }));
    await check('owned credit skips only unique finished task wrappers without local ended fabrication',()=>using([outer(),1],async page=>{
        await attachments(page,'',false);await page.evaluate(()=>{
            const root=document.querySelector('iframe[info="card"]').contentDocument;
            for(const [i,frame] of [...root.querySelectorAll('iframe')].entries()){
                if(i>=4)break;const wrapper=root.createElement('div');wrapper.className='ans-attach-ct';frame.before(wrapper);const player=window.__attachmentVideos[i];wrapper.append(frame);frame.contentDocument.body.append(player);
                wrapper.insertAdjacentHTML('beforeend','<span class="ans-job-icon '+(i<2?'ans-job-finished':'')+'"></span>');
            }app.run();
        });await flush(page);
        assert.deepEqual(await page.evaluate(()=>window.__attachmentVideos.map(v=>v.__plays)),[0,0,1,0]);
        assert.ok(await page.evaluate(()=>window.__attachmentVideos.slice(0,2).every(v=>!app._completedVideos.has(v)&&!v.ended)));
        await page.evaluate(()=>{app.stopAutomation();const w=window.__attachmentVideos[0].ownerDocument.defaultView.frameElement.closest('.ans-attach-ct');w.insertAdjacentHTML('beforeend','<span class="ans-job-icon"></span>');});
        assert.equal(await page.evaluate(()=>app._attachmentCredit(window.__attachmentVideos[0])),'unknown');
        await page.evaluate(()=>{const d=document.querySelector('iframe[info="card"]').contentDocument;d.body.insertAdjacentHTML('beforeend','<input type="password">');});
        assert.equal(await page.evaluate(()=>app._verificationPresent()),true);
    }));
    for(const mutation of ['same','changed','duplicate'])await check(`document continuity catalog replacement ${mutation}`,()=>using([outer(2,false,'文档'),0],async page=>{
        await installDocument(page);await flush(page,2);
        await page.evaluate(mutation=>{
            window.__originalDocumentRecord=app._externalCompletion;
            const old=document.querySelector('#node0'),replacement=old.cloneNode(true);
            if(mutation==='changed')replacement.id='different-lesson';
            old.replaceWith(replacement);
            if(mutation==='duplicate'){const duplicate=replacement.cloneNode(true);duplicate.classList.remove('posCatalog_active');document.querySelector('#coursetree').append(duplicate);}
            if(mutation==='same'){replacement.querySelector('input').value='0';replacement.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');}
        },mutation);
        if(mutation==='same'){
            for(let i=0;i<35&&await state(page)==='READING_DOCUMENT';i++)await flush(page);
            assert.equal(await state(page),'NAVIGATION_COOLDOWN');
            assert.equal(await page.evaluate(()=>app._externalCompletion.node===document.querySelector('#node0')),true);
            assert.equal(await page.evaluate(()=>window.__documentScroll.scrollTop),800);
        }else{await flush(page,3);assert.notEqual(await state(page),'NAVIGATION_COOLDOWN');assert.equal(await page.evaluate(()=>window.__originalDocumentRecord.localDone),false);}
    }));
    await check('knowledge map zero range never declares local reading complete',()=>using([outer(),0],async page=>{
        const result=await page.evaluate(()=>{const el=document.createElement('div');el.style.cssText='height:100px';document.body.append(el);let complete=false,error='';window.__xuexitongTaskSupport.readDocument({element:el,isValid:()=>true,onComplete:()=>complete=true,onError:reason=>error=reason});return{complete,error};});
        assert.equal(result.complete,false);assert.ok(result.error.includes('无有效滚动范围'));
    }));
    await check('knowledge map real positive HTML is not displaced by fitting BODY or outer shell',()=>using([outer(2,false,'文档'),0],async page=>{
        await page.evaluate(()=>{
            app.stopAutomation();const root=document.querySelector('iframe[info="card"]').contentDocument;
            root.body.innerHTML='<iframe class="ans-attach-online insertdoc-online-pdf" style="height:600px"></iframe>';
            const shell=root.querySelector('iframe').contentDocument;shell.body.style.margin='0';shell.body.innerHTML='<canvas height="634" width="20"></canvas><iframe style="position:absolute;top:0;height:546px"></iframe>';
            const inner=shell.querySelector('iframe').contentDocument;inner.body.style.margin='0';inner.body.innerHTML='<canvas height="2335" width="100"></canvas>';
            window.__realMap=inner;app._attemptTask('document');
        });assert.equal(await state(page),'READING_DOCUMENT');
        assert.equal(await page.evaluate(()=>app._externalCompletion.scope.tasks[0].viewer.ownerDocument===window.__realMap),true);
        assert.ok(await page.evaluate(()=>{const v=app._externalCompletion.scope.tasks[0].viewer;return v.scrollHeight-v.clientHeight>1000;}));
        await flush(page,2);assert.ok(await page.evaluate(()=>app._externalCompletion.scope.tasks[0].viewer.scrollTop>0));
    }));
    for(const stopped of [false,true])await check(`audio bounded fallback promise and stale stop=${stopped}`,()=>using([outer(2),1,false,null,false,'pacing'],async page=>{
        await audioLesson(page,'',false,false);
        await page.evaluate(()=>{const a=window.__audio;a.__plays=0;a.play=()=>{a.__plays++;return a.__plays===1?Promise.reject(new DOMException('denied','NotAllowedError')):new Promise(resolve=>window.__mutedResolve=()=>{a.__paused=false;resolve();});};app._recovery.resumeExplicitly();app.run();});
        assert.equal(await state(page),'AUDIO_STARTING');assert.equal(await page.evaluate(()=>app._isPlaying),false);
        if(stopped)await page.evaluate(()=>app.stopAutomation());
        await page.evaluate(()=>window.__mutedResolve());await flush(page,2);
        assert.equal(await state(page),stopped?'PAUSED_AUTOMATION':'PLAYING');assert.equal(await page.evaluate(()=>window.__audio.__plays),2);
        if(!stopped){
            assert.deepEqual(await page.evaluate(()=>[window.__audio.muted,window.__audio.playbackRate]),[true,1]);
            await page.evaluate(()=>{const a=window.__audio;a.__ended=true;a.__paused=true;a.dispatchEvent(new Event('ended'));});await flush(page,2);
            assert.equal(await state(page),'VERIFYING_COMPLETION');assert.equal(await page.evaluate(()=>app._completedVideos.has(window.__audio)),true);
        }
    }));
    await check('GM raw compatibility course still exposes page globals and starts ordinary player',()=>using([outer(),1,false,null,false,true,false,
        'const unsafeWindow=window;const GM_getValue=(k,d)=>d,GM_setValue=()=>{},GM_deleteValue=()=>{},GM_addValueChangeListener=()=>1,GM_removeValueChangeListener=()=>{};'+source],async page=>{
        assert.equal(await state(page),'PLAYING');assert.equal(await page.evaluate(()=>window.app===window.__xuexitongPlayerV3&&!!window.__xuexitongTaskSupport),true);
        assert.equal(await page.evaluate(()=>app._videoEl.playbackRate),1);
    }));
    await check('pacing natural ended counts once and next content uses one exact deadline',()=>using([outer(),2,false,null,false,'pacing'],async page=>{
        await page.evaluate(()=>{const s=structuredClone(app.settings);s.preset='short';s.randomDelaysEnabled=true;s.delays.nextContent={enabled:true,minMs:3827,maxMs:3827};app.updateSettings(s);
            const v=app._videoEl;v.__ended=true;v.__paused=true;v.dispatchEvent(new Event('ended'));v.dispatchEvent(new Event('ended'));});
        assert.equal(await page.evaluate(()=>app._pacing.getStatus().count),1);
        await flush(page,1);
        assert.equal(await page.evaluate(()=>app._actions.pending.get('content-pacing')?.delayMs),3827);
        assert.equal(await page.evaluate(()=>app._getVideoEl().__plays),0);
        await page.evaluate(()=>{window.__clock+=3827;});await flush(page,1);
        assert.equal(await state(page),'PLAYING');assert.equal(await page.evaluate(()=>app._videoEl.__plays),1);
        assert.equal(await page.evaluate(()=>app._actions.pending.size),0);
        assert.equal(await page.evaluate(()=>app._pacing.getStatus().count),1);
    }));
    await check('pacing navigation preview and random action share deadline with no fixed five seconds',()=>using([outer(2),1,false,null,false,'pacing'],async page=>{
        await page.evaluate(()=>{const s=structuredClone(app.settings);s.preset='short';s.randomDelaysEnabled=true;s.delays.nextLesson={enabled:true,minMs:2432,maxMs:2432};app.updateSettings(s);
            const n=document.querySelector('#node0');n.querySelector('input').remove();n.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');
            const v=app._videoEl;v.__ended=true;v.__paused=true;v.dispatchEvent(new Event('ended'));});
        await flush(page,1);
        assert.equal(await state(page),'NAVIGATION_COOLDOWN');
        assert.deepEqual(await page.evaluate(()=>{const a=app._actions.pending.get('navigation');return [a.delayMs,a.deadline-window.__clock,app._lastNotice.includes('2.432')];}),[2432,2432,true]);
        await page.evaluate(()=>app.stopAutomation());await page.evaluate(()=>{window.__clock+=9000;});await flush(page,1);
        assert.equal(await state(page),'PAUSED_AUTOMATION');
        assert.equal(await page.evaluate(()=>document.querySelector('#node0').classList.contains('posCatalog_active')),true);
    }));
    await check('pacing due rest replaces navigation delay and Stop retains deadline without restart',()=>using([outer(2),1,false,null,false,'pacing'],async page=>{
        await page.evaluate(()=>{
            const s=structuredClone(app.settings);s.preset='short';s.randomDelaysEnabled=true;s.rest.restMinMs=300000;s.rest.restMaxMs=300000;app.updateSettings(s);
            const quota=app._pacing.getStatus().target;
            for(let i=0;i<quota-1;i++)app._pacing.recordCompletion({course:'synthetic',lesson:'prior',kind:'video',ordinal:i},'natural-ended');
            const n=document.querySelector('#node0');n.querySelector('input').remove();n.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');
            const v=app._videoEl;v.__ended=true;v.__paused=true;v.dispatchEvent(new Event('ended'));
        });await flush(page,1);
        assert.deepEqual(await page.evaluate(()=>{const a=app._actions.pending.get('navigation');return [a.delayMs,app._pacing.getStatus().restEndsAt===a.deadline,app._lastNotice.includes('正在休息')];}),[300000,true,true]);
        const deadline=await page.evaluate(()=>app._pacing.getStatus().restEndsAt);
        await page.evaluate(()=>app.stopAutomation());await page.evaluate(()=>{window.__clock+=420000;});await flush(page,2);
        assert.equal(await state(page),'PAUSED_AUTOMATION');assert.equal(await page.evaluate(()=>app._pacing.getStatus().restEndsAt),deadline);
        assert.equal(await page.evaluate(()=>app._actions.pending.size),0);
        await page.evaluate(()=>app.run());await flush(page,2);
        assert.equal(await page.evaluate(()=>app._pacing.getStatus().count),0);
        assert.equal(await page.evaluate(()=>app._pacing.getStatus().restEndsAt),0);
        assert.equal(await page.evaluate(()=>app._actions.pending.has('navigation')),false);
    }));
    for (const mode of ['same','different','duplicate']) await check(`prior completion detached document catalog rebind ${mode}`,()=>using([outer(2,true,'文档'),0,false,null,false,'pacing'],async page=>{
        assert.equal(await state(page),'VERIFYING_PLATFORM_COMPLETION');
        const before=await page.evaluate(()=>JSON.stringify(app._pacing.getStatus()));
        await page.evaluate(mode=>{app.settings.randomDelaysEnabled=true;app.settings.preset='short';app.settings.delays.nextLesson.enabled=true;const timer=[...window.__timeoutDelays].find(([,delay])=>delay===250)?.[0];if(!timer)throw Error('missing verification callback');const verify=window.__timeouts.get(timer);window.__timeouts.delete(timer);const n=document.querySelector('#node0'),copy=n.cloneNode(true);window.__replacement=copy;
            if(mode==='different')copy.id='unrelated';
            if(mode==='duplicate')n.after(copy);else n.replaceWith(copy);verify();
        },mode);
        if(mode==='same'){
            assert.equal(await state(page),'NAVIGATION_COOLDOWN');
            assert.equal(await page.evaluate(()=>app._platformCompletion.node===window.__replacement&&app._completionNode===window.__replacement),true);
            assert.equal(await page.evaluate(()=>app._pacing.getStatus().count),0);
            const deadline=await page.evaluate(()=>app._actions.pending.get('navigation').deadline);
            await page.evaluate(()=>app._priorCompletionValid(app._platformCompletion));
            assert.equal(await page.evaluate(()=>app._actions.pending.get('navigation').deadline),deadline);
        }else{assert.equal(await state(page),'BLOCKED');assert.equal(await page.evaluate(()=>JSON.stringify(app._pacing.getStatus())),before);}
    }));
    await check('attachment readiness requires positive owned loading and rejects contradictions',()=>using([outer(),0],async page=>{
        const result=await page.evaluate(()=>{app.stopAutomation();const root=document.querySelector('iframe[info="card"]').contentDocument;root.body.innerHTML='<iframe class="ans-attach-online insertdoc-online-pdf" src="about:blank"></iframe>';
            const frame=root.querySelector('iframe');frame.contentDocument.body.innerHTML='<img src="pending.png">';Object.defineProperty(frame.contentDocument,'readyState',{get:()=> 'loading'});
            const m={pending:false,reasons:[]};return [app._classifyAttachmentReadiness(m),app._classifyAttachmentReadiness({...m,inaccessible:true}),app._classifyAttachmentReadiness({...m,unsupported:true}),app._classifyAttachmentReadiness({...m,reasons:['competing-player']})];});
        assert.deepEqual(result,['loading','blocked','blocked','blocked']);
    }));
    for(const mode of ['stop','route','timeout'])await check(`owned document readiness cancellation ${mode}`,()=>using([outer(),0,false,null,false,'pacing'],async page=>{
        await page.evaluate(()=>{app.stopAutomation();const root=document.querySelector('iframe[info="card"]').contentDocument;root.body.innerHTML='<iframe class="ans-attach-online insertdoc-online-pdf"></iframe>';const inner=root.querySelector('iframe').contentDocument;inner.body.innerHTML='<img src="pending.png">';Object.defineProperty(inner,'readyState',{get:()=> 'loading'});app._state='READY';app._waitForAttachmentReadiness();});
        assert.equal(await state(page),'WAITING_ATTACHMENT');
        await page.evaluate(mode=>{app.play();if(mode==='stop')app.stopAutomation();if(mode==='route')history.pushState({},'','?courseId=different');if(mode==='timeout')window.__clock+=10001;},mode);
        await flush(page,1);assert.equal(await state(page),mode==='stop'?'PAUSED_AUTOMATION':'BLOCKED');
        assert.equal(await page.evaluate(()=>app._pacing.getStatus().count),0);
    }));
    await check('entry credit does not replace actual positive-range document reading',()=>using([outer(2,false,'文档'),0,false,null,false,'pacing'],async page=>{
        await page.evaluate(()=>{const n=document.querySelector('#node0');app._entryCredit={id:n.id,name:app._nodeTitle(n),course:'synthetic',status:'incomplete',topology:app._catalogTopology()};n.querySelector('input').remove();n.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');});
        await installDocument(page);assert.equal(await state(page),'READING_DOCUMENT');assert.equal(await page.evaluate(()=>app._externalCompletion.localDone),false);
        await flush(page,2);assert.ok(await page.evaluate(()=>window.__documentScroll.scrollTop>0));
    }));
    for(const mode of ['same','different','duplicate'])await check(`credit observation reconstruction ${mode}`,()=>using([outer(2),0],async page=>{
        await page.evaluate(mode=>{app.stopAutomation();const n=document.querySelector('#node0');n.querySelector('input')?.remove();app._state='READY';app._creditObserved=null;app._observeCredit();const id=[...window.__timeoutDelays].find(([,d])=>d===500)?.[0];const tick=window.__timeouts.get(id);window.__timeouts.delete(id);const copy=n.cloneNode(true);if(mode==='different')copy.id='other';if(mode==='duplicate')n.after(copy);else n.replaceWith(copy);copy.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');tick();},mode);
        assert.equal(await state(page),mode==='same'?'VERIFYING_PLATFORM_COMPLETION':'BLOCKED');
    }));
    await check('generated click preserves navigation but trusted user click cancels',()=>using([outer(2,true),0,false,null,true,'pacing'],async page=>{
        await flush(page,1);assert.equal(await state(page),'NAVIGATION_COOLDOWN');
        const deadline=await page.evaluate(()=>app._actions.pending.get('navigation').deadline);
        await page.evaluate(()=>document.body.dispatchEvent(new MouseEvent('click',{bubbles:true})));
        assert.equal(await page.evaluate(()=>app._actions.pending.get('navigation').deadline),deadline);
        await page.mouse.click(400,400);
        assert.equal(await state(page),'BLOCKED');
    }));
    await check('recovery app initial stale failure and observation failure share durable budget',()=>using([outer(),1,false,null,false,'pacing'],async page=>{
        await page.evaluate(()=>{app.stopAutomation();app._videoEl.__paused=true;app._state='READY';app._runAction('videoStart','recover-test',()=>{}, {isValid:()=>false});});
        assert.equal(await page.evaluate(()=>app._recovery.getStatus().attempts),1);assert.equal(await state(page),'RECOVERING');
        await page.evaluate(()=>{const id=[...window.__timeoutDelays].find(([,d])=>d===1000)?.[0];const fn=window.__timeouts.get(id);window.__timeouts.delete(id);fn();});
        await page.evaluate(()=>{app._isPlaying=false;app._videoEl.__paused=true;app._state='READY';app._runAction('videoStart','recover-test-two',()=>{}, {isValid:()=>false});});
        assert.equal(await page.evaluate(()=>app._recovery.getStatus().attempts),2);assert.equal(await state(page),'RECOVERING');
        await page.evaluate(()=>{const root=document.querySelector('#coursetree');root.replaceWith(root.cloneNode(true));app._recovery.restore();});
        assert.equal(await page.evaluate(()=>app._recovery.getStatus().attempts),2);
        await page.evaluate(()=>app._block('synthetic terminal'));const attempts=await page.evaluate(()=>app._recovery.getStatus().attempts);await flush(page,2);assert.equal(await state(page),'BLOCKED');assert.equal(await page.evaluate(()=>app._recovery.getStatus().attempts),attempts);
    }));
    await check('terminal recovery blocks actual reinjected bootstrap until explicit Resume',()=>using([outer(),1,false,null,false,'pacing'],async page=>{
        await page.evaluate(()=>{app.stopAutomation();const key='xuexitong.v3.unattended-recovery.v1';const record=app._recovery.getStatus();sessionStorage.setItem(key,JSON.stringify({...record,attempts:3,stage:'terminal',reloadUsed:true,stopped:false}));app._recovery.restore();window.__terminalPlayer=app._videoEl;window.__terminalPlays=app._videoEl.__plays;app._recovery.confirmProgress();});
        const saved=await page.evaluate(()=>sessionStorage.getItem('xuexitong.v3.unattended-recovery.v1'));
        const bootSource='sessionStorage.setItem("xuexitong.v3.unattended-recovery.v1",'+JSON.stringify(saved)+');'+source;
        await using([outer(),1,false,null,false,'pacing',true,bootSource],async reloaded=>{
            assert.equal(await reloaded.evaluate(()=>app._recovery.getStatus().stage),'terminal');
            assert.equal(await reloaded.evaluate(()=>app._videoEl),null);
        });
        for(let i=0;i<2;i++){
            await page.addScriptTag({content:source});
            await page.evaluate(()=>{for(const fn of [...window.__intervals.values()])fn();});
            assert.equal(await page.evaluate(()=>app._recovery.getStatus().stage),'terminal');
            assert.equal(await page.evaluate(()=>window.__terminalPlayer.__plays===window.__terminalPlays),true);
            await page.evaluate(()=>{app.run({startup:true});app.play();app._recovery.confirmProgress();});
            assert.equal(await page.evaluate(()=>app._recovery.getStatus().attempts),3);
        }
        await page.evaluate(()=>{const n=document.querySelector('#node0');n.replaceWith(n.cloneNode(true));app.run({startup:true});});
        assert.equal(await page.evaluate(()=>app._recovery.getStatus().stage),'terminal');
        await page.evaluate(()=>{app._noticePanel.shadowRoot.querySelector('[data-resume]').click();});await flush(page,2);
        assert.equal(await page.evaluate(()=>app._recovery.getStatus().attempts),0);
        assert.notEqual(await page.evaluate(()=>app._recovery.getStatus().stage),'terminal');
    }));
    for(const sequence of [['video','manual','audio'],['video','unknown','audio','document','video'],['unknown','video'],['video','unknown'],['unknown','unknown','video'],['video','audio','document'],['video','audio'],['audio','video'],['audio','document'],['document','audio'],['video','document','audio','document'],['audio','audio','video','document']])await check(`composable dispatcher ${sequence.join(' -> ')}`,()=>using([outer(2),0,false,null,false,'pacing'],async page=>{
        await page.evaluate(({sequence,audioFixture})=>{
            app.stopAutomation();app._recovery.resumeExplicitly();const root=document.querySelector('iframe[info="card"]').contentDocument;root.body.innerHTML='';window.__mixed=[];
            Object.defineProperty(performance,'now',{configurable:true,value:()=>window.__clock});
            for(const kind of sequence){const frame=root.createElement('iframe');frame.className='ans-attach-online '+({video:'ans-insertvideo-online',audio:'ans-insertaudio',document:'insertdoc-online-pdf'}[kind]||'');frame.style.height='150px';root.body.append(frame);const d=frame.contentDocument;
                if(kind==='manual'){frame.setAttribute('data','{"module":"insertflash"}');d.body.innerHTML='<object type="application/x-shockwave-flash"></object>';window.__mixed.push({kind,frame});continue;}
                if(kind==='unknown'){d.body.innerHTML='<p>Independent unsupported task</p>';window.__mixed.push({kind,frame});continue;}
                if(kind==='document'){d.body.style.margin='0';d.body.innerHTML='<canvas width="100" height="1200"></canvas>';window.__mixed.push({kind,frame});continue;}
                d.body.innerHTML=kind==='audio'?audioFixture:'<video id="video_html5_api"></video>';const el=d.querySelector(kind==='audio'?'#audio_html5_api':'video');el.__paused=true;el.__ended=false;el.__plays=0;
                Object.defineProperties(el,{readyState:{get:()=>4},paused:{get:()=>el.__paused},ended:{get:()=>el.__ended}});el.play=()=>{el.__paused=false;el.__plays++;return Promise.resolve();};window.__mixed.push({kind,frame,el});
            }
            const players=window.__mixed.filter(t=>t.el);
            if(players.length>1){players[0].el.__paused=false;players[1].el.__paused=false;if(!app._discoverMedia().unsupported)throw Error('competing players accepted');players[0].el.__paused=true;players[1].el.__paused=true;players[1].el.autoplay=true;}
            const s=structuredClone(app.settings);s.features.document=true;s.randomDelaysEnabled=false;s.rest.enabled=false;app.updateSettings(s);app.run();
        },{sequence,audioFixture});
        for(let i=0;i<sequence.length;i++){
            if(['unknown','manual'].includes(sequence[i]))continue;
            await page.evaluate(async()=>{for(let n=0;n<6;n++)await Promise.resolve();});
            if(sequence[i]==='document'){
                await page.evaluate(async()=>{await Promise.resolve();await Promise.resolve();});
                assert.equal(await state(page),'READING_DOCUMENT');
                await page.evaluate(async()=>{for(let n=0;n<90&&app._state==='READING_DOCUMENT';n++){const entry=[...window.__timeoutDelays].sort((a,b)=>a[1]-b[1])[0];if(!entry)break;const [id,delay]=entry;const fn=window.__timeouts.get(id);window.__timeouts.delete(id);window.__timeoutDelays.delete(id);window.__clock+=delay;fn();await Promise.resolve();}});
            }else{
                assert.equal(await page.evaluate(i=>app._videoEl===window.__mixed[i].el,i),true);
                await page.evaluate(i=>{const el=window.__mixed[i].el;el.__paused=true;el.__ended=true;el.dispatchEvent(new Event('ended'));},i);await flush(page,2);
            }
            assert.equal(await page.evaluate(()=>document.querySelector('.posCatalog_active').id),'node0');
        }
        if(sequence.includes('unknown')||sequence.includes('manual')){
            assert.equal(await state(page),'WAITING_MANUAL_TASKS');
            const count=await page.evaluate(()=>app._pacing.getStatus().count);assert.equal(count,sequence.filter(k=>!['unknown','manual'].includes(k)).length);
            assert.equal(await page.evaluate(()=>app._decisionJournal.read().filter(e=>e.type==='TASK_LOCAL_COMPLETED').every(e=>e.evidence==='local-operation')),true);
            const plays=await page.evaluate(()=>window.__mixed.filter(t=>t.el).map(t=>t.el.__plays));
            await page.evaluate(()=>{app.run();app.stopAutomation();app.run();});assert.equal(await state(page),'WAITING_MANUAL_TASKS');assert.deepEqual(await page.evaluate(()=>window.__mixed.filter(t=>t.el).map(t=>t.el.__plays)),plays);
            await page.evaluate(()=>{const item=window.__mixed.find(t=>['unknown','manual'].includes(t.kind));const copy=item.frame.cloneNode(true);item.frame.replaceWith(copy);item.frame=copy;app._decisionJournal.clear();app.recheckCurrentLesson();});assert.equal(await state(page),'WAITING_MANUAL_TASKS');
            if(sequence.join(',')==='unknown,video'){
                await page.addScriptTag({content:source});await page.evaluate(()=>{for(const fn of [...window.__intervals.values()])fn();});assert.equal(await state(page),'WAITING_MANUAL_TASKS');
                assert.deepEqual(await page.evaluate(()=>window.__mixed.filter(t=>t.el).map(t=>t.el.__plays)),plays);
            }
            await page.evaluate(()=>{const n=document.querySelector('#node0');n.querySelector('input')?.remove();n.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');app.recheckCurrentLesson();});await flush(page,1);
            assert.notEqual(await state(page),'WAITING_MANUAL_TASKS');
        }
    }));
    await check('optional adapters recognize owned public structures without execution or navigation',()=>using([outer(),0,false,null,false,'pacing'],async page=>{
        const fixtures=readFileSync(new URL('../fixtures/synthetic/additional-readers.html',import.meta.url),'utf8');
        const result=await page.evaluate(html=>{app.stopAutomation();const templates=new DOMParser().parseFromString(html,'text/html');const root=document.querySelector('iframe[info="card"]').contentDocument;const rows=[];
            for(const kind of ['book-reader','timed-reader','audio-slides','hyperlink','legacy-flash']){
                root.body.innerHTML='<iframe class="ans-attach-online"></iframe>';const owner=root.querySelector('iframe');owner.contentDocument.body.innerHTML=templates.querySelector('#'+kind).innerHTML;
                owner.setAttribute('data',JSON.stringify({module:kind==='legacy-flash'?'insertflash':'insertbook'}));const get=owner.getAttribute.bind(owner);owner.getAttribute=name=>name==='src'?'https://mooc1.chaoxing.com/readsvr/book/mooc?timing=60':get(name);
                const task=window.__xuexitongTaskSupport.inspectAdditionalAttachment(owner,0,root);rows.push([task?.kind,task?.executable,task?.validateScope(),task?.linkClassification]);
                owner.classList.add('ans-insertaudio');if(window.__xuexitongTaskSupport.inspectAdditionalAttachment(owner,0,root))throw Error('claimed existing owner');
            }return rows;
        },fixtures);
        assert.deepEqual(result.map(r=>r.slice(0,3)),['book-reader','timed-reader','audio-slides','hyperlink','legacy-flash'].map(k=>[k,false,true]));assert.deepEqual(result[3][3],['unsafe-scheme']);
    }));
    for(const kind of ['book-reader','timed-reader','audio-slides','hyperlink','legacy-flash'])await check(`additional actual discovery and app diagnostic ${kind}`,()=>using([outer(2),0,false,null,false,'recorded'],async page=>{
        const fixtures=readFileSync(new URL('../fixtures/synthetic/additional-readers.html',import.meta.url),'utf8');
        const markup=await page.evaluate(({fixtures,kind})=>new DOMParser().parseFromString(fixtures,'text/html').querySelector('#'+kind).innerHTML,{fixtures,kind});
        await page.context().route('https://mooc1.chaoxing.com/readsvr/book/mooc**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html>'+markup}));
        await page.evaluate(kind=>{history.replaceState({},'','?courseId=synthetic');app.stopAutomation();app._recovery.resumeExplicitly();const root=document.querySelector('iframe[info="card"]').contentDocument;root.body.innerHTML='';const f=root.createElement('iframe');f.className='ans-attach-online';f.setAttribute('data',JSON.stringify({module:kind==='legacy-flash'?'insertflash':'insertbook'}));f.src='https://mooc1.chaoxing.com/readsvr/book/mooc?timing=60';root.body.append(f);window.__additionalOwner=f;},kind);
        await page.waitForFunction(()=>window.__additionalOwner.contentDocument?.URL.includes('/readsvr/book/mooc'));
        const result=await page.evaluate(()=>{const m=app._discoverMedia();window.__additionalTask=m.tasks?.find(t=>t.executable===false);app.run();return {k:window.__additionalTask?.kind,state:app._state,notice:app._lastNotice,count:app._pacing.getStatus().count};});
        assert.equal(result.k,kind);assert.equal(result.state,'WAITING_MANUAL_TASKS');assert.ok(result.notice.includes(kind));assert.equal(result.count,0);assert.equal(await page.evaluate(()=>app._actions.pending.has('navigation')),false);
        assert.equal(await page.evaluate(()=>app._planningSnapshot().tasks.find(t=>t.kind===window.__additionalTask.kind)?.classification),'DEFERRED_RECOGNIZED');
        const recognitionChanged=await page.evaluate(({kind,markup})=>{const plan=app._planningSnapshot(),f=window.__additionalOwner,d=f.contentDocument;const valid=plan.validateScope();
            if(kind==='legacy-flash')f.setAttribute('data','{}');else if(kind==='book-reader')d.querySelector('#ReadWeb').remove();else if(kind==='timed-reader')d.querySelector('#pagejump').remove();else if(kind==='audio-slides')d.querySelector('.swiper-slide').remove();else d.querySelector('#hyperlink').remove();
            const invalid=!plan.validateScope();d.body.innerHTML=markup;f.setAttribute('data',JSON.stringify({module:kind==='legacy-flash'?'insertflash':'insertbook'}));return {valid,invalid};
        },{kind,markup});assert.deepEqual(recognitionChanged,{valid:true,invalid:true});
        for(const known of ['video','audio','document']){
            const mixed=await page.evaluate(({known,audioFixture})=>{const root=window.__additionalOwner.ownerDocument;const f=root.createElement('iframe');f.className='ans-attach-online '+({video:'ans-insertvideo-online',audio:'ans-insertaudio',document:'insertdoc-online-pdf'}[known]);root.body.insertBefore(f,window.__additionalOwner);f.contentDocument.body.innerHTML=known==='audio'?audioFixture:known==='video'?'<video id="video_html5_api"></video>':'<canvas height="1200"></canvas>';
                app._recovery.resumeExplicitly();app.run();const m=app._discoverMedia();const row={kinds:m.tasks.map(t=>t.kind),claimed:!!window.__xuexitongTaskSupport.inspectAdditionalAttachment(f,0,root),state:app._state,count:app._pacing.getStatus().count,nav:app._actions.pending.has('navigation')};app.stopAutomation();f.remove();return row;
            },{known,audioFixture});assert.deepEqual(mixed.kinds,[known,kind]);assert.equal(mixed.claimed,false);assert.ok(['PLAYING','AUDIO_STARTING','READING_DOCUMENT','WAITING_STARTUP','WAITING_DOCUMENT','WAITING_ATTACHMENT','WAITING_MANUAL_TASKS'].includes(mixed.state),mixed.state);assert.equal(mixed.count,0);assert.equal(mixed.nav,false);
        }
        const stale=await page.evaluate(()=>{const n=document.querySelector('.posCatalog_active');const old=n.id;n.id='different-lesson';const valid=window.__additionalTask.validateScope();n.id=old;return valid;});assert.equal(stale,false);
        for(const variant of ['missing','near-match','metadata','inaccessible']){
            const matched=await page.evaluate(({variant,kind,markup})=>{const f=window.__additionalOwner,d=f.contentDocument;d.body.innerHTML=markup;f.setAttribute('data',JSON.stringify({module:kind==='legacy-flash'?'insertflash':'insertbook'}));
                if(variant==='missing'||variant==='near-match'){if(kind==='legacy-flash')f.setAttribute('data','{}');else if(kind==='audio-slides')d.querySelector('.swiper-slide').className='unrelated-slide';else if(kind==='timed-reader')d.querySelector('#pagejump').id='unrelated';else d.querySelector(kind==='book-reader'?'#ReadWeb':'#hyperlink').id='unrelated';}
                if(variant==='metadata')f.setAttribute('data','invalid-json');
                if(variant==='inaccessible')Object.defineProperty(f,'contentDocument',{configurable:true,get:()=>null});
                const m=app._discoverMedia();const matched=m.tasks?.some(t=>t.kind===kind)||false;
                if(variant==='inaccessible')delete f.contentDocument;
                return matched;
            },{variant,kind,markup});assert.equal(matched,false);
        }
        await page.evaluate(()=>{window.__additionalOwner.remove();});assert.equal(await page.evaluate(()=>window.__additionalTask.validateScope()),false);
    }));
    await check('read-only lesson plan classifies owned modules and invalidates stale inventory',()=>using([outer(),0,false,null,false,'pacing'],async page=>{
        const result=await page.evaluate(({audioFixture})=>{
            app.stopAutomation();const root=document.querySelector('iframe[info="card"]').contentDocument;root.body.innerHTML='';
            for(const kind of ['video','audio','document','unknown']){const f=root.createElement('iframe');f.className='ans-attach-online '+({video:'ans-insertvideo-online',audio:'ans-insertaudio',document:'insertdoc-online-pdf',unknown:''}[kind]);root.body.append(f);f.contentDocument.body.innerHTML=kind==='audio'?audioFixture:kind==='video'?'<video id="video_html5_api"></video>':kind==='document'?'<canvas height="1200"></canvas>':'<p>Unsupported independent item</p>';}
            for(const f of root.querySelectorAll('iframe'))for(const el of f.contentDocument.querySelectorAll('video,audio'))Object.defineProperty(el,'readyState',{configurable:true,get:()=>4});app._attachmentSnapshot=null;const plan=app._planningSnapshot();const classes=plan.tasks.map(t=>t.classification);const valid=plan.validateScope();
            const player=root.querySelector('iframe').contentDocument.querySelector('video');Object.defineProperty(player,'paused',{configurable:true,get:()=>false});if(app._planningSnapshot().globalSafety!=='GLOBAL_UNSAFE')throw Error('active media accepted');delete player.paused;
            const hidden=root.querySelectorAll('iframe')[3];Object.defineProperty(hidden,'contentDocument',{configurable:true,get:()=>null});if(app._planningSnapshot().globalSafety!=='GLOBAL_UNSAFE')throw Error('inaccessible accepted');delete hidden.contentDocument;
            const lesson=document.querySelector('.posCatalog_active'),oldId=lesson.id;lesson.id='changed';if(plan.validateScope())throw Error('stale lesson valid');lesson.id=oldId;const first=root.querySelector('iframe');first.after(first.cloneNode());const replaced=plan.validateScope();root.querySelectorAll('iframe')[1].remove();root.body.append(first);const reordered=plan.validateScope();
            return {reasons:app._discoverMedia().reasons,classes,valid,replaced,reordered,unsupported:app._discoverMedia().unsupported};
        },{audioFixture});
        assert.deepEqual(result.classes,['EXECUTABLE_KNOWN','EXECUTABLE_KNOWN','EXECUTABLE_KNOWN','DEFERRED_UNKNOWN'],JSON.stringify(result));assert.equal(result.valid,true);assert.equal(result.replaced,false);assert.equal(result.reordered,false);assert.equal(result.unsupported,true);
    }));
    for(const kind of ['video','audio'])await check(`planning managed ${kind} continuity and verified wrapper`,()=>using([outer(),0,false,null,false,'pacing'],async page=>{
        const result=await page.evaluate(({kind,audioFixture})=>{
            app.stopAutomation();app._recovery.resumeExplicitly();const root=document.querySelector('iframe[info="card"]').contentDocument;root.body.innerHTML='<div class="ans-attach-ct"><span class="ans-job-icon"></span><iframe class="ans-attach-online '+(kind==='video'?'ans-insertvideo-online':'ans-insertaudio')+'"></iframe></div>';
            const owner=root.querySelector('iframe');owner.contentDocument.body.innerHTML=kind==='audio'?audioFixture:'<video id="video_html5_api"></video>';const el=owner.contentDocument.querySelector(kind==='audio'?'#audio_html5_api':'video');el.__paused=true;Object.defineProperties(el,{readyState:{get:()=>4},paused:{configurable:true,get:()=>el.__paused}});el.play=()=>{el.__paused=false;return Promise.resolve();};
            app.run();return Promise.resolve().then(()=>{
                const playing=app._planningSnapshot();const safety=playing.globalSafety;const valid=playing.validateScope();el.__paused=true;const paused=app._planningSnapshot();el.__paused=false;const resumed=paused.validateScope();
                owner.setAttribute('data','{"module":"changed"}');const changed=playing.validateScope();owner.removeAttribute('data');
                root.querySelector('.ans-attach-ct').insertAdjacentHTML('beforeend','<div>unassigned content</div>');const misleading=app._planningSnapshot().globalSafety;
                return {safety,valid,resumed,changed,misleading};
            });
        },{kind,audioFixture});assert.deepEqual(result,{safety:'VERIFIED_PLANNING_ONLY',valid:true,resumed:true,changed:false,misleading:'GLOBAL_UNSAFE'});
    }));
    await check('partial session refuses crossing when required journal write fails',()=>using([outer(),1,false,null,false,'pacing'],async page=>{
        await page.evaluate(()=>{app.stopAutomation();app._recovery.resumeExplicitly();const root=document.querySelector('iframe[info="card"]').contentDocument,v=root.querySelector('video');root.body.innerHTML='<iframe class="ans-attach-online"></iframe><iframe class="ans-attach-online ans-insertvideo-online"></iframe>';const frames=root.querySelectorAll('iframe');frames[0].contentDocument.body.innerHTML='<p>Independent unknown</p>';frames[1].contentDocument.body.append(v);v.__paused=true;window.__blockedPlayer=v;app._decisionJournal={reference:()=> 'ref-00000000-0000-4000-8000-000000000000',append:()=>({durable:false})};app.run();});
        assert.equal(await state(page),'BLOCKED');assert.equal(await page.evaluate(()=>window.__blockedPlayer.__plays),1); // Only initial fixture playback, never crossed the unknown.
        assert.equal(await page.evaluate(()=>app._actions.pending.has('navigation')),false);
    }));
    await check('partial pause survives unresolved catalog identity and clears only verified mismatch',()=>using([outer(),1,false,null,false,'pacing'],async page=>{
        const result=await page.evaluate(()=>{app.stopAutomation();const key='xuexitong.v3.partial-pause.v1',marker=JSON.stringify(['synthetic','node0']);sessionStorage.setItem(key,marker);const n=document.querySelector('#node0');n.classList.remove('posCatalog_active');const missing=app._partialPauseApplies();n.classList.add('posCatalog_active');const matching=app._partialPauseApplies();sessionStorage.setItem(key,'broken');const malformed=app._partialPauseApplies();sessionStorage.setItem(key,JSON.stringify(['different','node0']));const mismatch=app._partialPauseApplies();return{missing,matching,malformed,mismatch,cleared:sessionStorage.getItem(key)===null};});
        assert.deepEqual(result,{missing:true,matching:true,malformed:true,mismatch:false,cleared:true});
    }));
    await check('partial actual page reload pauses before active catalog identity is ready',()=>using([outer(),1,false,null,false,'pacing'],async page=>{
        await page.evaluate(()=>{app.stopAutomation();sessionStorage.setItem('xuexitong.v3.partial-pause.v1',JSON.stringify(['synthetic','node0']));});
        await page.context().route('https://course.test/course?courseId=synthetic',route=>route.fulfill({contentType:'text/html',body:outer().replace('posCatalog_active','')}));
        await page.reload();await page.addScriptTag({content:jquery});await page.addScriptTag({content:source});await page.waitForFunction(()=>!!window.app);
        assert.equal(await state(page),'WAITING_MANUAL_TASKS');
        await page.evaluate(()=>{document.querySelector('#node0').classList.add('posCatalog_active');app.run({startup:true});});assert.equal(await state(page),'WAITING_MANUAL_TASKS');
        assert.equal(await page.evaluate(()=>app._recovery.getStatus().attempts),0);
    }));
    for(const mode of ['credit','no-credit','verification','duplicate','course','active'])await check(`manual recheck missing owners ${mode}`,()=>using([outer(2),0,false,null,false,'pacing'],async page=>{
        await page.evaluate(()=>{app.stopAutomation();app._recovery.resumeExplicitly();const root=document.querySelector('iframe[info="card"]').contentDocument;root.body.innerHTML='<iframe class="ans-attach-online"></iframe>';root.querySelector('iframe').contentDocument.body.innerHTML='<p>Independent manual task</p>';app.run();});
        assert.equal(await state(page),'WAITING_MANUAL_TASKS');
        await page.evaluate(mode=>{const root=document.querySelector('iframe[info="card"]').contentDocument;root.body.innerHTML='';const n=document.querySelector('#node0');if(mode!=='no-credit'){n.querySelector('input')?.remove();n.insertAdjacentHTML('beforeend','<span class="icon_Completed"></span>');}
            if(mode==='verification')root.body.innerHTML='<input type="password">';
            if(mode==='duplicate')n.after(n.cloneNode(true));
            if(mode==='course')history.pushState({},'','?courseId=other');
            if(mode==='active'){const a=root.createElement('audio');a.controls=true;Object.defineProperty(a,'paused',{get:()=>false});root.body.append(a);}
            app.recheckCurrentLesson();
        },mode);await flush(page,1);
        if(mode==='credit')assert.ok(['ADVANCING','WAITING_CATALOG','NAVIGATION_COOLDOWN','VERIFYING_PLATFORM_COMPLETION'].includes(await state(page)),await state(page));
        else assert.equal(await state(page),mode==='no-credit'?'WAITING_MANUAL_TASKS':'BLOCKED');
        assert.equal(await page.evaluate(()=>app._pacing.getStatus().count),0);
    }));
    await check('diagnostics mounted UI copy fallback clear privacy and explicit recheck',()=>using([outer(2),0,false,null,false,'pacing'],async page=>{
        await page.evaluate(()=>{app.stopAutomation();app._recovery.resumeExplicitly();const root=document.querySelector('iframe[info="card"]').contentDocument;root.body.innerHTML='<iframe class="ans-attach-online"></iframe>';root.querySelector('iframe').contentDocument.body.innerHTML='<p>SECRET_STUDENT_TOKEN https://private.invalid/?token=secret</p>';app.run();app._settingsPanel.shadowRoot.querySelector('details').open=true;app._settingsPanel.shadowRoot.querySelector('[data-diagnostics]').open=true;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(Error('denied'))}});});
        const host=page.locator('#xuexitong-v3-settings');assert.equal(await host.locator('[data-diagnostics]').count(),1);assert.match(await host.locator('[data-diagnostic-summary]').textContent(),/未解决：1/);
        await host.locator('[data-diagnostic-action="copy"]').click();const text=await host.locator('textarea[aria-label="手动复制诊断报告"]').inputValue();assert.ok(text.includes('WAITING_MANUAL_TASKS'));assert.ok(!text.includes('SECRET_STUDENT_TOKEN'));assert.ok(!text.includes('private.invalid'));assert.ok(!text.includes('courseId'));assert.ok(!text.includes('<p>'));
        const marker=await page.evaluate(()=>sessionStorage.getItem('xuexitong.v3.partial-pause.v1'));await host.locator('[data-diagnostic-action="clear"]').click();assert.equal(await page.evaluate(()=>app._decisionJournal.read().length),0);assert.equal(await state(page),'WAITING_MANUAL_TASKS');assert.equal(await page.evaluate(()=>sessionStorage.getItem('xuexitong.v3.partial-pause.v1')),marker);
        await host.locator('[data-diagnostic-action="recheck"]').click();assert.equal(await state(page),'WAITING_MANUAL_TASKS');assert.equal(await page.evaluate(()=>app._pacing.getStatus().count),0);
    }));
    await check('diagnostics clear and copy preserve unrelated managed playback',()=>using([outer(),1,false,null,false,'pacing'],async page=>{
        const plays=await page.evaluate(()=>app._videoEl.__plays);await page.evaluate(()=>{app._settingsPanel.shadowRoot.querySelector('details').open=true;app._settingsPanel.shadowRoot.querySelector('[data-diagnostics]').open=true;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:text=>{window.__copiedDiagnostics=text;return Promise.resolve();}}});});
        const host=page.locator('#xuexitong-v3-settings');await host.locator('[data-diagnostic-action="copy"]').click();await host.locator('[data-diagnostic-action="clear"]').click();assert.equal(await state(page),'PLAYING');assert.equal(await page.evaluate(()=>app._videoEl.__plays),plays);assert.equal(await page.evaluate(()=>JSON.parse(window.__copiedDiagnostics).inventoryStatus),'stale-or-unavailable');
    }));
    for(const mode of ['unowned','inaccessible','verification','storage'])await check(`global block journal without partial session ${mode}`,()=>using([outer(),0,false,null,false,'pacing'],async page=>{
        await page.evaluate(mode=>{app.stopAutomation();app._recovery.resumeExplicitly();const root=document.querySelector('iframe[info="card"]').contentDocument;root.body.innerHTML='<iframe></iframe>';const f=root.querySelector('iframe');f.contentDocument.body.innerHTML='<p>PRIVATE_TOKEN https://private.invalid/?credential=secret</p>';
            if(mode==='inaccessible')Object.defineProperty(f,'contentDocument',{get:()=>null});
            if(mode==='verification')root.body.innerHTML='<input type="password">';
            app._decisionJournal.clear();if(mode==='storage')app._decisionJournal={append:()=>{throw Error('quota');},reference:()=> 'ref-00000000-0000-4000-8000-000000000000',read:()=>[]};app.run();
        },mode);
        await flush(page,15);
        assert.equal(await state(page),'BLOCKED');assert.equal(await page.evaluate(()=>!!app._partialSession),false);
        const report=await page.evaluate(()=>app._diagnosticReport());assert.deepEqual(report.currentBlock,{type:'GLOBAL_BLOCKED',reason:'unsafe-scope',evidence:'none',kind:'lesson',ordinal:null});
        assert.ok(!JSON.stringify(report).includes('PRIVATE_TOKEN'));assert.ok(!JSON.stringify(report).includes('private.invalid'));
        if(mode!=='storage'){assert.equal(report.events.at(-1).type,'GLOBAL_BLOCKED');assert.equal(report.events.at(-1).ordinal,null);}
    }));
    console.log(`RESULT: ${passed} passed, ${failures.length} failed; local Chrome DOM tests, simulated media/timers, no live platform.`);
    if (failures.length) process.exitCode = 1;
} finally { await browser.close(); }
