// ==UserScript==
// @name         学习通自动刷课脚本 V3 稳定版
// @namespace    local.codex.xuexitong
// @version      3.4.0
// @description  自动播放、自动切换下一节，并在页面结构异常时安全停止
// @author       Codex
// @match        *://mooc1.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @match        https://zhibo.chaoxing.com/*
// @run-at       document-idle
// @sandbox      raw
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        window.close
// ==/UserScript==

(function (window) {
    let $ = typeof window.jQuery === 'function' ? window.jQuery : globalThis.$;
    const gmLive = typeof GM_getValue === 'function' && typeof GM_setValue === 'function' && typeof GM_addValueChangeListener === 'function' && typeof GM_deleteValue === 'function' && typeof GM_removeValueChangeListener === 'function' ? createGMLive(window, { get: GM_getValue, set: GM_setValue, remove: GM_deleteValue, listen: GM_addValueChangeListener, unlisten: GM_removeValueChangeListener, close: () => globalThis.close() }) : null;
    const APP_KEY = '__xuexitongPlayerV3';
    const BOOT_TIMER_KEY = '__xuexitongPlayerV3BootTimer';
    window.__xuexitongTaskSupport?.dispose?.();
    window.__xuexitongTaskSupport = createTaskSupport(window);

    const previousApp = window[APP_KEY];
    if (previousApp && typeof previousApp.destroy === 'function') {
        previousApp.destroy();
    }
    if (window[BOOT_TIMER_KEY]) {
        clearInterval(window[BOOT_TIMER_KEY]);
        window[BOOT_TIMER_KEY] = null;
    }

    function bootCourse() {
        if (typeof window.jQuery === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
            script.type = 'text/javascript';
            script.onload = function () {
                console.log("jQuery loaded.");
                waitForCoursePage();
            };
            document.head.appendChild(script);
        } else {
            waitForCoursePage();
        }
    }
    function waitForCoursePage() {
        if (typeof window.jQuery === 'function') $ = window.jQuery;
        if (window[BOOT_TIMER_KEY] || (window[APP_KEY] && !window[APP_KEY]._destroyed)) return;
        let attempts = 0;
        const maxAttempts = 20;
        window[BOOT_TIMER_KEY] = setInterval(() => {
            if (window[APP_KEY] && !window[APP_KEY]._destroyed) { clearInterval(window[BOOT_TIMER_KEY]); window[BOOT_TIMER_KEY] = null; return; }
            if ($('#coursetree').length > 0) {
                clearInterval(window[BOOT_TIMER_KEY]);
                window[BOOT_TIMER_KEY] = null;
                initializePlayer();
                return;
            }
            attempts++;
            if (attempts >= maxAttempts) {
                clearInterval(window[BOOT_TIMER_KEY]);
                window[BOOT_TIMER_KEY] = null;
                console.error('%c脚本启动超时：未检测到课程目录（#coursetree）。请确认当前处于课程播放页。', 'color:#F44336;font-weight:bold');
            }
        }, 1000);
    }

    // Rules are limited to the supplied outer structures and the existing V3 player.
    const assessmentTitle = text => /测验|测试|自测|作业|考试|验证/.test(text);
    const optionalAssessment = text => ['章节测验', '章节测试', '本章自测'].includes(text.trim());
    const verificationTitle = text => /验证码|验证|认证|登录|人脸|captcha|authentication/i.test(text);
    const videoTitle = text => /^(?:\d+\s*)?视频$/.test(text.trim());
    const catalog = {
        entries() {
            return Array.from(document.querySelectorAll('#coursetree .posCatalog_select'))
                .filter(node => !node.classList.contains('firstLayer') &&
                    node.querySelector('.posCatalog_name') &&
                    !Array.from(node.closest('li')?.querySelectorAll('.posCatalog_select') || [])
                        .some(child => child !== node && !child.classList.contains('firstLayer')));
        },
        current() {
            const active = this.entries().filter(node => node.classList.contains('posCatalog_active'));
            return active.length === 1 ? active[0] : null;
        },
        status(node) {
            if (!node) return 'unknown';
            const own = selector => [...node.querySelectorAll(selector)].filter(el =>
                el.closest('.posCatalog_select') === node && !el.closest('.ans-attach-online'));
            const counts = own('.jobUnfinishCount');
            const values = counts.map(el => String(el.value ?? el.textContent).trim());
            if (values.some(value => !/^\d+$/.test(value))) return 'unknown';
            if (values.some(value => Number(value) > 0)) return 'incomplete';
            return own('.icon_Completed').length ? 'completed' : 'unknown';
        },
    };
    const videoAdapter = {
        cardFrame() {
            const frames = document.querySelectorAll('iframe[info="card"], iframe[src*="/knowledge/cards"]');
            return frames.length === 1 ? frames[0] : null;
        },
        cardDocument() {
            try { return this.cardFrame()?.contentDocument || null; } catch (_) { return null; }
        },
        discover(knownDocuments = new Set(), selection = null) {
            const result = { videos: [], audios: [], rawAudios: [], documents: [], reasons: [],
                unsupported: false, inaccessible: false, pending: false, navigationSafe: true, diagnosticTriggers: [] };
            const block = (reason, element = null, phase = '') => {
                result.unsupported = true; if (!result.reasons.includes(reason)) result.reasons.push(reason);
                if (element) result.diagnosticTriggers.push({ reason, phase, documentIndex: result.documents.indexOf(element.ownerDocument),
                    tag: element.tagName, knownClasses: ['ans-attach-online','ans-insertvideo-online','ans-insertaudio','insertdoc-online-pdf','liveHref'].filter(name => element.classList.contains(name)) });
            };
            const uncertain = reason => { result.navigationSafe = false; if (!result.reasons.includes(reason)) result.reasons.push(reason); };
            const frame = this.cardFrame(), root = this.cardDocument(), node = catalog.current();
            if (!frame) { block('nonunique-course-frame'); return result; }
            if (!root) { result.inaccessible = true; return result; }
            const uniqueLesson = node?.id && Array.from(document.querySelectorAll('[id]')).filter(el => el.id === node.id).length === 1;
            const frames = Array.from(root.querySelectorAll('iframe'));
            const kindOf = owner => {
                const kinds = [['video','ans-insertvideo-online'],['audio','ans-insertaudio'],['document','insertdoc-online-pdf']]
                    .filter(([, name]) => owner.classList.contains(name));
                return kinds.length === 1 && owner.classList.contains('ans-attach-online') ? kinds[0][0] : null;
            };
            const attachments = frames.filter(owner => owner.classList.contains('ans-attach-online'));
            const multi = attachments.length > 1 || !!selection;
            const seen = new Set(), paths = new Map(), branches = new Map(), candidates = [], allMedia = [];
            const active = media => (!media.paused && !media.ended) || media.seeking || (media.autoplay && !media.ended);
            const visible = element => element.getClientRects().length > 0 && !element.hidden && !element.inert && element.getAttribute('aria-hidden') !== 'true';
            const visit = (doc, path, branch = null) => {
                if (!doc || seen.has(doc)) { block('duplicate-task-document'); return; }
                seen.add(doc); result.documents.push(doc); paths.set(doc, path); branches.set(doc, branch);
                const media = Array.from(doc.querySelectorAll('video, audio')); allMedia.push(...media);
                for (const el of media) {
                    if ((el.tagName === 'VIDEO' && el.id.includes('video_html5')) || (el.tagName === 'AUDIO' && el.id === 'audio_html5_api')) candidates.push(el);
                }
                // Ordinary forms/inputs/labels are UI, not evidence of an independent
                // learning task. Explicit attachment/live boundaries still require an adapter.
                if (!knownDocuments.has(doc)) for (const boundary of doc.querySelectorAll('.ans-attach-online, a.liveHref')) {
                    const contained = frames.filter(owner => boundary !== owner && boundary.contains(owner));
                    const container = doc === root && boundary.tagName !== 'IFRAME' && !boundary.matches('a.liveHref') &&
                        contained.length > 0 && contained.every(owner => kindOf(owner));
                    const branchKind = branch && kindOf(branch), boundaryKind = kindOf(boundary);
                    const ownedRepresentation = doc !== root && boundaryKind && boundaryKind === branchKind &&
                        (branchKind === 'document' || media.some(el => boundary.contains(el) && candidates.includes(el)));
                    if (!(boundary.tagName === 'IFRAME' && doc === root && boundaryKind) && !container && !ownedRepresentation) block('unknown-independent-task', boundary, 'task-boundary');
                }
                for (const form of doc.querySelectorAll('form')) {
                    const labels = [form.textContent, ...Array.from(form.querySelectorAll('[title], [aria-label], [placeholder]')).map(el =>
                        ['title','aria-label','placeholder'].map(attr => el.getAttribute(attr) || '').join(' '))].join(' ');
                    const assessment = optionalAssessment(form.textContent.trim()) || (form.querySelector('[name^="answer"]') && assessmentTitle(labels));
                    const verification = /验证码|人脸|captcha|authentication/i.test(labels) || form.querySelector('input[type="password"], input[autocomplete="one-time-code"]');
                    if (verification || assessment) block('assessment-or-verification-required');
                }
                for (const child of doc.querySelectorAll('iframe')) {
                    if (path.length >= 4) { uncertain('task-depth-limit'); if (multi || child.classList.contains('ans-attach-online')) block('task-depth-limit'); continue; }
                    let inner; try { inner = child.contentDocument; } catch (_) { /* Unknown widgets cannot authorize navigation. */ }
                    if (!inner) {
                        uncertain('unreadable-task-content');
                        if (multi || child.classList.contains('ans-attach-online')) result.inaccessible = true;
                        continue;
                    }
                    visit(inner, [...path, child], branch || child);
                }
            };
            visit(root, [frame]);
            result.videos = candidates.filter(el => el.tagName === 'VIDEO');
            result.audios = candidates.filter(el => el.tagName === 'AUDIO');
            result.rawAudios = allMedia.filter(el => el.tagName === 'AUDIO');
            let selected = candidates;
            if (selection) {
                try {
                    const partition = [selection.activeFrame, ...selection.inactiveFrames];
                    const inactive = selection.inactiveFrames;
                    const omitted = candidates.filter(el => branches.get(el.ownerDocument) !== selection.activeFrame);
                    if (!selection.validateScope?.() || partition.length !== frames.length || new Set(partition).size !== frames.length ||
                        !partition.every(owner => frames.includes(owner) && owner.isConnected) || !visible(selection.activeFrame) ||
                        !inactive.every(owner => owner.hidden && owner.inert && owner.getAttribute('aria-hidden') === 'true') ||
                        omitted.some(el => active(el) || el.currentTime !== 0 || el.error)) block('unverified-media-ownership');
                    selected = candidates.filter(el => branches.get(el.ownerDocument) === selection.activeFrame);
                    if (!selected.length) block('missing-owned-player');
                } catch (_) { block('unverified-media-ownership'); }
            }
            const auxiliary = allMedia.filter(el => !candidates.includes(el));
            for (const el of auxiliary) {
                // Known preview/secondary elements are nonblocking while inactive,
                // regardless of their source, error, CSS class, parent or controls.
                if (active(el)) block('competing-media-playback');
                else if (!['auditionAudio','audio1_html5_white'].includes(el.id)) {
                    const wrapper = el.closest('.video-js');
                    if ((visible(el) && (el.tagName === 'VIDEO' || el.controls)) ||
                        (wrapper && visible(wrapper) && !selected.some(player => wrapper.contains(player)))) block('unknown-independent-media');
                }
            }
            for (const el of selected) {
                if (!el.isConnected) block('disconnected-player');
                if (selected.some(other => other !== el && other.ownerDocument === el.ownerDocument && other.id === el.id)) block('ambiguous-player-id');
                if (el.error) block(el.tagName === 'AUDIO' ? 'audio-player-error' : 'video-player-error');
                const path = paths.get(el.ownerDocument);
                if (!path?.every(visible)) block('inactive-player-branch');
            }
            if (selected.filter(el => !el.paused && !el.ended).length > 1) block('competing-primary-playback');
            if (attachments.length) {
                if (!uniqueLesson) block('unverified-attachment-lesson');
                result.tasks = [];
                for (const owner of attachments) {
                    const kind = kindOf(owner), owned = selected.filter(el => branches.get(el.ownerDocument) === owner);
                    if (!kind || !visible(owner)) {
                        const additional = visible(owner) && uniqueLesson && inspectAdditionalAttachment(owner, result.tasks.length, root);
                        if (additional?.validateScope()) {
                            const validateOwner = additional.validateScope, lessonId = node.id;
                            additional.validateScope = () => validateOwner() && node === catalog.current() && node.id === lessonId &&
                                frame === this.cardFrame() && root === this.cardDocument() &&
                                [...document.querySelectorAll('[id]')].filter(el => el.id === lessonId).length === 1;
                            result.tasks.push(additional); block('manual-' + additional.kind);
                        }
                        else block('unknown-attachment');
                        continue;
                    }
                    if (kind === 'document' && owned.length) block('media-in-document-attachment');
                    if (kind !== 'document' && (owned.length > 1 || owned.some(el => el.tagName !== (kind === 'video' ? 'VIDEO' : 'AUDIO')))) block('ambiguous-attachment-player');
                    if (kind !== 'document' && !owned.length) result.pending = true;
                    const el = kind === 'document' ? null : owned[0] || null;
                    const lineage = el ? paths.get(el.ownerDocument) : [frame, owner];
                    const documents = lineage.map(item => { try { return item.contentDocument; } catch (_) { return null; } }).filter(Boolean);
                    result.tasks.push({ kind, attachment: owner, element: el, media: el, lineage, documents,
                        document: el?.ownerDocument || documents.at(-1), lesson: { id: node?.id, node, root, frame }, position: result.tasks.length, status: 'pending' });
                }
                if (selected.some(el => !attachments.includes(branches.get(el.ownerDocument)))) block('ambiguous-player-ownership');
            } else if (!selection && selected.length > 1) {
                // Preserve the existing ordered, single-document video list. Multiple
                // branches/types need an explicit attachment inventory or selection.
                if (new Set(selected.map(el => el.ownerDocument)).size > 1 || selected.some(el => el.tagName === 'AUDIO')) block('ambiguous-player-branches');
            }
            if (multi) {
                // Stricter inventory validation for multi-attachment/explicit selection:
                // a populated unclassified leaf is not silently omitted from the queue.
                for (const doc of result.documents) if (!knownDocuments.has(doc) && doc !== root && !doc.querySelector('video, audio, iframe') &&
                    !result.tasks?.some(task => task.kind === 'document' && task.documents.includes(doc))) {
                    if (attachments.includes(branches.get(doc)) && kindOf(branches.get(doc))) continue; // UI/viewer descendants already belong to a known task.
                    const body = doc.body?.cloneNode(true); body?.querySelectorAll('script, style').forEach(el => el.remove());
                    if (body?.textContent.trim() || body?.querySelector('object, embed, canvas, form, input, img')) {
                        if (attachments.length) uncertain('unassigned-task-content');
                        else block('unknown-independent-task', doc.body, 'unassigned-leaf');
                    }
                }
            }
            if (!candidates.length && !result.tasks?.length && !knownDocuments.size) {
                result.pending = true; // Empty/initializing cards remain bounded by startup/play retries.
            }
            if (result.inaccessible) result.reasons.push('inaccessible-task-frame');
            if (result.pending) result.reasons.push('player-not-ready');
            // UI unreadability may permit playback, but never authorizes leaving a lesson.
            if (result.inaccessible || result.unsupported || result.pending) result.navigationSafe = false;
            if (selection) {
                result.videos = selected.filter(el => el.tagName === 'VIDEO');
                result.audios = selected.filter(el => el.tagName === 'AUDIO');
            }
            return result;
        },
    };

    // Publicly reported structures: recognition is deliberately not execution authority.
    function inspectAdditionalAttachment(owner, position, root) {
        if (!owner?.isConnected || owner.ownerDocument !== root || !owner.matches('iframe.ans-attach-online') ||
            owner.matches('.ans-insertvideo-online,.ans-insertaudio,.insertdoc-online-pdf')) return null;
        let doc, url, metadata;
        try { doc = owner.contentDocument; if (!doc) return null; url = new URL(owner.getAttribute('src') || doc.URL, root.baseURI);
            metadata = JSON.parse(owner.getAttribute('data') || '{}'); } catch (_) { return null; }
        const module = metadata.module || metadata.type;
        const bookRoute = url.protocol === 'https:' && /(^|\.)chaoxing.com$/.test(url.hostname) && /^\/readsvr\/book\/mooc(?:\/|$)/.test(url.pathname);
        const candidates = [];
        if (bookRoute && doc.querySelector('#reader .readerPager') && doc.querySelector('#pagejump')) {
            const dwell = Number(url.searchParams.get('timing'));
            if (Number.isSafeInteger(dwell) && dwell > 0 && dwell <= 86400) candidates.push(['timed-reader','计时阅读：原生逐页控制和完成证据尚未验证']);
        } else if (bookRoute && module === 'insertbook' && doc.querySelector('#ReadWeb')) candidates.push(['book-reader','书籍阅读：原生翻页与完成证据尚未验证']);
        if (doc.querySelector('.swiper-container .swiper-slide') && doc.querySelector('audio')) candidates.push(['audio-slides','音频幻灯：音频与页面归属、翻页及双重完成证据尚未验证']);
        if (doc.querySelector('#hyperlink')) candidates.push(['hyperlink','链接任务：仅诊断，不自动访问或申报完成']);
        if (module === 'insertflash') candidates.push(['legacy-flash','旧版动画：当前浏览器不支持，不安装运行时或申报完成']);
        if (candidates.length !== 1) return null;
        const [kind, reason] = candidates[0];
        const links = kind === 'hyperlink' ? [...doc.querySelectorAll('#hyperlink[href],#hyperlink a[href]')].map(link => {
            try { const target = new URL(link.getAttribute('href'), doc.baseURI); return ['https:','http:'].includes(target.protocol) ? 'web-manual-only' : 'unsafe-scheme'; } catch (_) { return 'invalid-url'; }
        }) : [];
        return { kind, attachment: owner, element: owner, target: null, lineage: [owner], documents: [doc], document: doc,
            position, confidence: 'PUBLICLY_REPORTED_STRUCTURE', executable: false, reason, linkClassification: links,
            validateScope: () => owner.isConnected && owner.ownerDocument === root && owner.contentDocument === doc };
    }

    function createDecisionJournal(env) {
        const key = 'xuexitong.v3.decision-journal.v1', maxAge = 604800000;
        const types = new Set(['LESSON_DISCOVERED','INVENTORY_CONFIRMED','TASK_RECOGNIZED','TASK_DEFERRED','TASK_STARTED','TASK_LOCAL_COMPLETED','TASK_PLATFORM_CREDITED','TASK_FAILED','EXECUTION_CONTINUED','GLOBAL_BLOCKED','MANUAL_RECHECK','CONTEXT_INVALIDATED','LESSON_WAITING_MANUAL','LESSON_NAVIGATION_AUTHORIZED','RECOVERY_EVENT']);
        const kinds = new Set(['lesson','video','audio','document','unknown','book-reader','timed-reader','audio-slides','hyperlink','legacy-flash']);
        const reasons = new Set(['known-owned','isolated-unknown','recognition-only','loading','unsafe-scope','competing-media','inaccessible','context-changed']);
        const evidence = new Set(['owned-inventory','observed-dom','local-operation','platform-marker','none']);
        const ref = () => 'ref-' + env.crypto.randomUUID();
        const session = ref(), references = new Map();
        const valid = e => e && Object.keys(e).every(k => ['timestamp','session','lesson','ordinal','type','kind','reason','evidence'].includes(k)) &&
            Number.isSafeInteger(e.timestamp) && e.timestamp <= Date.now() && e.timestamp >= Date.now()-maxAge &&
            [e.session,e.lesson].every(v => typeof v === 'string' && /^ref-[0-9a-f-]{36}$/.test(v)) &&
            ((e.kind==='lesson'&&e.ordinal===null)||(e.kind!=='lesson'&&Number.isSafeInteger(e.ordinal)&&e.ordinal>=0&&e.ordinal<10000)) && types.has(e.type) && kinds.has(e.kind) && reasons.has(e.reason) && evidence.has(e.evidence);
        const prune = rows => { const clean = rows.filter(valid).slice(-200); while(JSON.stringify({version:1,events:clean}).length*2 > 131072) clean.shift(); return clean; };
        const read = () => { try { const raw=JSON.parse(env.localStorage.getItem(key)||'{"version":1,"events":[]}'); return raw.version===1&&Array.isArray(raw.events)?prune(raw.events):[]; } catch (_) { return []; } };
        return Object.freeze({
            reference(input) { if (!references.has(input)) references.set(input,ref()); return references.get(input); },
            append(event) {
                if (!event || Object.hasOwn(event,'timestamp') || Object.hasOwn(event,'session')) return {durable:false,reason:'reserved-field'};
                const item={...event,timestamp:Date.now(),session};
                if (!valid(item)) return { durable:false,reason:'invalid-event' };
                try { const rows=read(), last=rows.at(-1); const signature=e=>JSON.stringify([e.session,e.lesson,e.ordinal,e.type,e.kind,e.reason,e.evidence]);
                    if (!last || signature(last)!==signature(item)) rows.push(item);
                    const serialized=JSON.stringify({version:1,events:prune(rows)}); env.localStorage.setItem(key,serialized);
                    return {durable:env.localStorage.getItem(key)===serialized};
                } catch (_) { return {durable:false,reason:'storage-unavailable'}; }
            }, read, clear() { try { env.localStorage.removeItem(key); return true; } catch (_) { return false; } },
        });
    }

    function createLessonPlan(app) {
        const node=catalog.current(), frame=videoAdapter.cardFrame(), root=videoAdapter.cardDocument();
        const course=pacingCourse(window), id=node?.id, title=node && app._nodeTitle(node), chapter=node&&app._chapterOf(node), href=location.href;
        const owners=root?[...root.querySelectorAll('iframe.ans-attach-online')]:[];
        const media=videoAdapter.discover();
        let unsafe=!course||!id||!root||!frame||!owners.length||!node.isConnected||
            [...document.querySelectorAll('[id]')].filter(el=>el.id===id).length!==1||app._verificationPresent()||app._isChapterTest()||media.inaccessible;
        if (media.reasons?.some(reason=> !['unknown-attachment','unknown-independent-task','unassigned-task-content','player-not-ready'].includes(reason)&&!reason.startsWith('manual-'))) unsafe=true;
        const existing=app._attachmentSnapshot;
        if(existing && (existing.root!==root || existing.id!==id || existing.tasks.length!==media.tasks?.length || existing.tasks.some((t,i)=>t.attachment!==media.tasks[i]?.attachment)))unsafe=true;
        const wrapperValid = el => el.matches('.ans-attach-ct') && el.querySelectorAll('iframe.ans-attach-online').length === 1 &&
            el.querySelectorAll('.ans-job-icon').length === 1 && [...el.children].every(child=>child.matches('iframe.ans-attach-online,.ans-job-icon,script,style')) &&
            !el.querySelector('.ans-attach-ct');
        if(root && [...root.body.children].some(el=>!el.matches('iframe.ans-attach-online,script,style')&&!wrapperValid(el)))unsafe=true;
        const docs=[];
        const visit=(doc,depth=0)=>{if(!doc||depth>4||docs.includes(doc)){unsafe=true;return;}docs.push(doc);
            for(const el of doc.querySelectorAll('video,audio'))if((!el.paused&&!el.ended)||el.seeking) {
                const owned = media.tasks?.filter(task=>task.element===el && ['video','audio'].includes(task.kind));
                const context=app._videoContext;
                if(el.seeking || owned?.length!==1 || app._videoEl!==el || (!app._isPlaying && app._state!=='AUDIO_STARTING') || app._playNode!==node ||
                    !context || context.video!==el || context.generation!==app._generation || context.playerDocument!==el.ownerDocument ||
                    (context.source && context.source!==(el.currentSrc||el.getAttribute('src')||'')))unsafe=true;
            }
            for(const child of doc.querySelectorAll('iframe')){try{visit(child.contentDocument,depth+1);}catch(_){unsafe=true;}}};
        for(const owner of owners){if(owner.ownerDocument!==root||owner.parentElement.closest('iframe.ans-attach-online'))unsafe=true;try{visit(owner.contentDocument);}catch(_){unsafe=true;}}
        if(media.documents?.some(doc=>doc!==root&&!docs.includes(doc)))unsafe=true;
        const tasks=owners.map((owner,ordinal)=>{
            const known=media.tasks?.find(t=>t.attachment===owner), extra=inspectAdditionalAttachment(owner,ordinal,root);
            const kind=known?.kind||extra?.kind||'unknown';
            const recognized=extra||known?.executable===false;
            const loading=known&&['video','audio'].includes(kind)&&!known.element;
            let metadata;try{const data=JSON.parse(owner.getAttribute('data')||'{}');metadata=JSON.stringify([data.module||null,data.type||null]);}catch(_){metadata='invalid';}
            return Object.freeze({kind,ordinal,owner,target:known?.element||null,recognition:metadata,lineage:Object.freeze([frame,owner]),classification:unsafe?'GLOBAL_UNSAFE':loading?'LOADING':recognized?'DEFERRED_RECOGNIZED':known?'EXECUTABLE_KNOWN':'DEFERRED_UNKNOWN',
                executable:!unsafe&&!loading&&!recognized&&!!known,reason:unsafe?'unsafe-scope':loading?'loading':recognized?'recognition-only':known?'known-owned':'isolated-unknown',completion:'not-authorized-by-plan'});
        });
        const currentDocs=docs.slice();
        const validateScope=()=>{
            if(!node||catalog.current()!==node||!node.isConnected||node.id!==id||pacingCourse(window)!==course||location.href!==href||app._nodeTitle(node)!==title||app._chapterOf(node)!==chapter||frame!==videoAdapter.cardFrame()||root!==videoAdapter.cardDocument())return false;
            if([...document.querySelectorAll('[id]')].filter(el=>el.id===id).length!==1)return false;
            const now=[...root.querySelectorAll('iframe.ans-attach-online')];if(now.length!==owners.length||now.some((o,i)=>o!==owners[i]||!o.isConnected))return false;
            const found=[];let valid=true;const check=(d,depth=0)=>{if(!d||depth>4||found.includes(d)){valid=false;return;}found.push(d);for(const f of d.querySelectorAll('iframe'))try{check(f.contentDocument,depth+1);}catch(_){valid=false;}};
            for(const o of owners)try{check(o.contentDocument);}catch(_){valid=false;}
            if(!valid||found.length!==currentDocs.length||!found.every((d,i)=>d===currentDocs[i]))return false;
            const next=createLessonPlan(app);
            return next.globalSafety!=='GLOBAL_UNSAFE' && next.tasks.length===tasks.length && tasks.every((task,i)=>{
                const other=next.tasks[i];return task.owner===other.owner&&task.target===other.target&&task.kind===other.kind&&
                    task.classification===other.classification&&task.executable===other.executable&&task.reason===other.reason&&task.recognition===other.recognition;
            });
        };
        return Object.freeze({lesson:Object.freeze({course,id,title}),frame,document:root,tasks:Object.freeze(tasks),globalSafety:unsafe?'GLOBAL_UNSAFE':'VERIFIED_PLANNING_ONLY',validateScope});
    }

    const SETTINGS_KEY = 'xuexitong.v3.action-settings.v1';
    const FEATURES = { videoPlayback: '自动播放视频', nextVideo: '自动下一视频', audioPlayback: '自动播放音频', nextAudio: '自动下一音频', nextLesson: '自动下一课节',
        nextChapter: '自动下一章节', assessment: '暂缓章节测验并继续学习', document: '文档阅读', live: '直播窗口协调', background: '后台播放保护' };
    const ACTIONS = {
        videoStart: ['视频开始', 300, 900, 'videoPlayback'], nextVideo: ['课内下一视频', 500, 1500, 'nextVideo'],
        audioStart: ['音频开始', 300, 900, 'audioPlayback'], nextAudio: ['课内下一音频', 500, 1500, 'nextAudio'],
        documentScroll: ['文档逐步滚动', 300, 1000, 'document'], nextDocument: ['下一文档', 500, 1500, 'document'],
        nextContent: ['课内下一独立内容', 3000, 7000, 'nextLesson'],
        nextLesson: ['下一课节', 2000, 8000, 'nextLesson'], nextChapter: ['下一章节', 3000, 8000, 'nextChapter'],
        assessment: ['测验交接', 1000, 2500, 'assessment'], liveOpen: ['打开直播窗口', 500, 1500, 'live'],
        liveReturn: ['直播关闭与返回', 500, 1500, 'live'],
    };
    const navigationActions = new Set(['nextLesson', 'nextChapter', 'assessment', 'liveReturn']);
    function defaultSettings(preset = 'short') {
        return { version: 1, pacingVersion: 1, rest: { enabled: true, taskTargetMin: 3, taskTargetMax: 6, restMinMs: 300000, restMaxMs: 420000 }, preset, collapsed: true, randomDelaysEnabled: true,
            features: Object.fromEntries(Object.keys(FEATURES).map(key => [key, !['document', 'live'].includes(key)])),
            delays: Object.fromEntries(Object.entries(ACTIONS).map(([key, [, minMs, maxMs]]) =>
                [key, { enabled: true, minMs: preset === 'legacy' ? 5000 : minMs, maxMs: preset === 'legacy' ? 12000 : maxMs }])) };
    }
    function validateSettings(input) {
        const result = defaultSettings();
        if (input && !input.pacingVersion) {
            input = JSON.parse(JSON.stringify(input)); input.pacingVersion = 1; input.preset = 'custom';
            input.rest = defaultSettings().rest;
            for (const key of ['nextContent', 'nextLesson', 'nextChapter']) input.delays[key] = defaultSettings().delays[key];
        }
        if (!input || input.version !== 1) throw new Error('设置版本无效');
        if (!['short', 'legacy', 'custom'].includes(input.preset)) throw new Error('预设无效');
        if (input.pacingVersion !== 1) throw new Error('节奏设置版本无效');
        const rest = input.rest;
        if (!rest || typeof rest.enabled !== 'boolean' ||
            !['taskTargetMin','taskTargetMax','restMinMs','restMaxMs'].every(k => Number.isSafeInteger(rest[k]) && rest[k] > 0) ||
            rest.taskTargetMax < rest.taskTargetMin || rest.restMaxMs < rest.restMinMs || rest.restMaxMs > 2147483647) throw new Error('休息参数须为正整数且范围有序');
        result.rest = { ...rest };
        result.preset = input.preset;
        for (const field of ['collapsed', 'randomDelaysEnabled']) {
            if (typeof input[field] !== 'boolean') throw new Error('开关值无效');
            result[field] = input[field];
        }
        for (const key of Object.keys(FEATURES)) {
            if (['audioPlayback', 'nextAudio'].includes(key) && input.features && !Object.hasOwn(input.features, key)) continue;
            if (typeof input.features?.[key] !== 'boolean') throw new Error('功能开关无效');
            result.features[key] = input.features[key];
        }
        for (const key of Object.keys(ACTIONS)) {
            if (['audioStart', 'nextAudio'].includes(key) && input.delays && !Object.hasOwn(input.delays, key)) {
                result.delays[key] = defaultSettings(input.preset).delays[key]; continue;
            }
            const rule = input.delays?.[key];
            if (!rule || typeof rule.enabled !== 'boolean' || !Number.isSafeInteger(rule.minMs) ||
                !Number.isSafeInteger(rule.maxMs) || rule.minMs < 0 || rule.maxMs < rule.minMs || rule.maxMs > 2147483647) {
                throw new Error('延迟范围须为非负整数毫秒，且最小值不大于最大值');
            }
            result.delays[key] = { enabled: rule.enabled, minMs: rule.minMs, maxMs: rule.maxMs };
        }
        return result;
    }
    function loadSettings(env) {
        try { const raw = env.localStorage.getItem(SETTINGS_KEY); const settings = raw ? validateSettings(JSON.parse(raw)) : defaultSettings();
            if (raw && !JSON.parse(raw).pacingVersion) env.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return settings; }
        catch (_) { return defaultSettings(); }
    }
    // The same scheduler serves parent actions, document steps and child-player startup.
    function createActionScheduler(env, { rule, enabled, onQueued = () => {}, onDone = () => {}, onError = () => {} }) {
        const pending = new Map();
        const run = (category, key, callback, options = {}) => {
            if (pending.has(key)) return pending.get(key);
            const range = rule(category);
            if (!ACTIONS[category] || !range || !Number.isSafeInteger(range.minMs) || !Number.isSafeInteger(range.maxMs) ||
                range.minMs < 0 || range.maxMs < range.minMs || range.maxMs > 2147483647) {
                onError('自动动作延迟配置无效'); return null;
            }
            if (!enabled(category)) { options.onCancel?.('feature-disabled'); return null; }
            if (options.isValid && !options.isValid()) { options.onCancel?.('context-stale'); return null; }
            const delay = Number.isSafeInteger(options.deadline) ? Math.max(0, options.deadline - Date.now()) : Number.isSafeInteger(options.delayMs) && options.delayMs >= 0 && options.delayMs <= 2147483647 ? options.delayMs :
                range.enabled ? range.minMs + Math.floor(Math.random() * (range.maxMs - range.minMs + 1)) : 0;
            const action = { category, key, deadline: options.deadline ?? Date.now() + delay, delayMs: delay, done: false, timer: null, cleanup: null, cancel(reason = 'internal-cancel') {
                if (action.done) return;
                action.done = true; pending.delete(key);
                if (action.timer !== null) { env.clearTimeout(action.timer); onDone(action.timer); }
                action.cleanup?.(); options.onCancel?.(reason);
            } };
            const fire = () => {
                if (action.done) return;
                if (options.isValid && !options.isValid()) return action.cancel('context-stale');
                action.done = true; pending.delete(key); action.cleanup?.();
                if (action.timer !== null) onDone(action.timer);
                callback();
            };
            pending.set(key, action); options.onScheduled?.(action);
            if (range.enabled) console.log(`${navigationActions.has(category) ? '导航冷却' : '自动动作 ' + ACTIONS[category][0]} ${(delay / 1000).toFixed(3)}s`);
            if (delay || options.defer) {
                action.cleanup = options.watch?.((reason = 'internal-cancel') => action.cancel(reason)) || null;
                action.timer = env.setTimeout(fire, delay); onQueued(action.timer);
            } else fire();
            return action;
        };
        return { run, pending, cancelAll(reason = 'internal-cancel') { for (const action of [...pending.values()]) action.cancel(reason); },
            cancelWhere(test, reason = 'settings') { for (const action of [...pending.values()]) if (test(action.category)) action.cancel(reason); } };
    }

    function createUnattendedRecoveryCoordinator(env, hooks) {
        const key = 'xuexitong.v3.unattended-recovery.v1';
        let state, timer = null, disposed = false, storageFailed = false;
        const identity = () => hooks.identity();
        const persist = () => { try { env.sessionStorage.setItem(key, JSON.stringify(state)); return true; } catch (_) { if (!storageFailed) { storageFailed = true; hooks.fail('恢复预算无法持久保存'); } return false; } };
        const fresh = id => ({ version: 1, identity: id, attempts: 0, stage: 'idle', reloadUsed: false, reason: '', stopped: false, cycle: Date.now() });
        const restore = () => {
            const id = identity();
            try {
                const raw = env.sessionStorage.getItem(key); state = raw ? JSON.parse(raw) : fresh(id);
                if (state.version !== 1 || !Number.isInteger(state.attempts) || state.attempts < 0 || state.attempts > 3 ||
                    (state.identity !== null && typeof state.identity !== 'string') || !Number.isSafeInteger(state.cycle) || typeof state.reason !== 'string' ||
                    typeof state.stopped !== 'boolean' || typeof state.reloadUsed !== 'boolean' ||
                    !['idle','waiting','observing','reload','terminal'].includes(state.stage)) throw Error();
                if (id && state.identity !== id) state = { ...fresh(id), stopped: state.stopped };
                if (state.stage === 'waiting' && timer === null) state.stage = 'observing';
            } catch (_) { state = { ...fresh(id), stopped: true, stage: 'terminal' }; }
            return state;
        };
        restore();
        const cancel = reason => { if (timer !== null) env.clearTimeout(timer); timer = null; if (['terminal-block','navigation','user-interaction'].includes(reason)) { state.stage = 'terminal'; persist(); } };
        const finish = reason => { cancel(); state.stage = 'terminal'; state.reason = reason; persist(); hooks.fail(reason); };
        const requestRecovery = reason => {
            if (disposed || state.stopped || state.stage === 'terminal') return false;
            if (!identity() || identity() !== state.identity || !['context-stale','frame-replaced','readiness'].includes(reason) || !hooks.safe()) return false;
            if (timer !== null && state.stage === 'waiting') return true;
            cancel();
            if (state.attempts >= 3) { finish('当前小节连续恢复失败，已停止；不会继续刷新'); return true; }
            state.attempts++; state.stage = 'waiting'; state.reason = reason;
            if (!persist()) return false;
            hooks.notice(`自动恢复 ${state.attempts}/3：${['','重新检测当前任务','重新初始化当前小节','安全刷新当前页面'][state.attempts]}`);
            const fingerprint = hooks.fingerprint?.();
            timer = env.setTimeout(() => {
                timer = null;
                if (disposed || state.stopped || identity() !== state.identity || (hooks.fingerprint && hooks.fingerprint() !== fingerprint) || !hooks.safe()) return finish('恢复上下文或安全条件已变化');
                state.stage = 'observing';
                if (state.attempts === 3) {
                    if (state.reloadUsed || !hooks.canReload()) return finish('当前状态不允许安全刷新，已停止');
                    state.reloadUsed = true; state.stage = 'reload'; if (persist()) env.location.reload(); return;
                }
                persist(); hooks.retry(state.attempts);
                observe();
            }, 1000);
            return true;
        };
        const observe = () => {
            if (disposed || state.stopped || !state.attempts || timer !== null) return;
            timer = env.setTimeout(() => { timer = null; if (identity() !== state.identity) return cancel(); if (!hooks.progress()) requestRecovery('readiness'); }, 15000);
        };
        return { restore, requestRecovery, classifyFailure: reason => ['context-stale','frame-replaced','readiness'].includes(reason) && hooks.safe(),
            cancel, dispose() { disposed = true; cancel(); }, getStatus: () => ({ ...state }),
            confirmProgress() { if (!disposed && !state.stopped && state.stage !== 'terminal' && state.attempts && identity() && identity() === state.identity) { cancel(); state = fresh(identity()); persist(); } },
            markExplicitStop() { cancel(); state.stopped = true; persist(); },
            resumeExplicitly() { cancel(); state = fresh(identity()); persist(); },
            observe,
        };
    }

    function pacingCourse(env) {
        try { const url = new URL(env.location.href); return url.searchParams.get('courseId') || url.searchParams.get('courseid'); } catch (_) { return null; }
    }

    // Course-local accounting only: no playback or platform-credit decisions live here.
    function createTaskPacingCoordinator(env, settings, now = () => Date.now(), random = () => Math.random()) {
        const course = pacingCourse(env);
        const key = 'xuexitong.v3.task-pacing.v1:' + encodeURIComponent(course || 'unidentified');
        const draw = (min, max) => min + Math.floor(random() * (max - min + 1));
        const target = () => draw(settings().rest.taskTargetMin, settings().rest.taskTargetMax);
        let state = { version: 1, target: 3, count: 0, ledger: [], restEndsAt: 0, pending: null, consumed: '', last: null }, fault = '';
        const save = () => { try { env.localStorage.setItem(key, JSON.stringify(state)); } catch (_) { fault = '节奏记录无法持久保存，停止新的自动切换'; } };
        const restore = () => {
            try {
                const raw = env.localStorage.getItem(key); if (!raw) { state.target = target(); if (course) save(); return; }
                const r = JSON.parse(raw);
                if (r.version !== 1 || !Number.isSafeInteger(r.target) || r.target < 1 || !Number.isSafeInteger(r.count) || r.count < 0 ||
                    !Array.isArray(r.ledger) || r.ledger.length > 4096 || new Set(r.ledger).size !== r.ledger.length ||
                    !r.ledger.every(x => typeof x === 'string' && x.length < 4096 && typeof JSON.parse(x)?.lesson === 'string') || r.count > r.ledger.length ||
                    !Number.isSafeInteger(r.restEndsAt) || r.restEndsAt < 0 || r.restEndsAt > now() + 2147483647 ||
                    (r.pending && (typeof r.pending.key !== 'string' || !Number.isSafeInteger(r.pending.deadline) || r.pending.deadline < 0 || r.pending.deadline > now() + 2147483647)) ||
                    typeof r.consumed !== 'string' || (r.last && (typeof r.last.lesson !== 'string' || typeof r.last.id !== 'string'))) throw Error();
                state = r;
            } catch (_) { fault = '节奏记录损坏或不兼容，请核对后清除本课程节奏记录'; }
        };
        restore();
        const cycle = () => { state.count = 0; state.target = target(); state.restEndsAt = 0; };
        return {
            restore,
            recordCompletion(identity, evidence) {
                if (fault || !course || !identity || identity.course !== course || pacingCourse(env) !== course || !['natural-ended','verified-bottom','platform-live-ended'].includes(evidence)) return false;
                const id = JSON.stringify(identity);
                if (state.ledger.includes(id)) return false;
                if (state.ledger.some(raw => { const old = JSON.parse(raw); return old.lesson === identity.lesson && old.inventory && identity.inventory && old.inventory !== identity.inventory; })) { fault = '本课附件清单已变化，节奏计数需手动核对'; return false; }
                // Never evict dedupe entries and then count a replay twice. Explicit cleanup at the cap.
                if (state.ledger.length >= 4096) { fault = '本课程节奏记录已达上限，请手动核对并清理'; return false; }
                state.ledger.push(id); state.count++; state.last = { id, lesson: identity.lesson }; save(); return true;
            },
            needsContent(lesson, id) {
                return !!(state.restEndsAt || (settings().rest.enabled && state.count >= state.target) ||
                    (state.last?.lesson === lesson && state.last.id !== id));
            },
            beforeNextContent(kind, boundary, rule) {
                if (fault) throw Error(fault);
                if (pacingCourse(env) !== course) throw Error('课程身份已变化，请重新检测');
                const token = JSON.stringify([state.last?.id || '', boundary]);
                if (state.consumed === token) return { key: token, deadline: now(), delayMs: 0 };
                if (state.pending?.key === token) {
                    if (!settings().rest.enabled && state.restEndsAt) { cycle(); state.pending.deadline = now(); save(); }
                    else if (!state.restEndsAt && !rule.enabled) { state.pending.deadline = now(); save(); }
                    return { ...state.pending, delayMs: Math.max(0, state.pending.deadline - now()) };
                }
                // A persisted rest survives changed DOM and rediscovery, with no reroll.
                let deadline = state.restEndsAt;
                if (!settings().rest.enabled && deadline) { state.restEndsAt = 0; deadline = now(); cycle(); }
                else if (deadline && deadline <= now()) { cycle(); deadline = now(); }
                else if (!deadline && settings().rest.enabled && state.count >= state.target) {
                    deadline = state.restEndsAt = now() + draw(settings().rest.restMinMs, settings().rest.restMaxMs);
                }
                if (!deadline) deadline = now() + (rule.enabled ? draw(rule.minMs, rule.maxMs) : 0);
                state.pending = { key: token, deadline, kind }; save();
                if (fault) throw Error(fault);
                return { ...state.pending, delayMs: Math.max(0, deadline - now()) };
            },
            consume(token) {
                if (state.consumed === token) return true;
                if (state.pending?.key !== token || state.pending.deadline > now()) return false;
                if (state.restEndsAt) cycle();
                state.consumed = token; state.pending = null; save(); return !fault;
            },
            cancelPending() { /* Timers belong to the action scheduler; retain the absolute deadline on Stop/reload. */ },
            dispose() { this.cancelPending(); },
            clearHistory() { state = { version: 1, target: target(), count: 0, ledger: [], restEndsAt: 0, pending: null, consumed: '', last: null }; fault = ''; save(); },
            getStatus() { return { ...state, course, fault }; },
            statusText() {
                const ms = Math.max(0, state.restEndsAt - now());
                return state.restEndsAt ? `本轮已完成 ${state.count}/${state.target} 项，正在休息，剩余 ${String(Math.floor(ms / 60000)).padStart(2,'0')}:${(ms % 60000 / 1000).toFixed(3).padStart(6,'0')}` :
                    `本轮已完成 ${state.count}/${state.target} 项`;
            },
        };
    }

    // The native card is evidenced; its closure URL and native popup handle are not exposed.
    // Recognition is not proof of recorded status or popup ownership.
    const platformLiveEntry = {
        inspect(entry) {
            const doc = entry?.ownerDocument;
            if (!doc || !entry.isConnected) return 'invalid';
            const links = doc.querySelectorAll('[id="openUrl"]');
            if (!links.length) return 'unresolved'; // The platform may create this asynchronously.
            if (links.length !== 1 || links[0].tagName !== 'A') return 'invalid';
            const link = links[0], href = link.getAttribute('href')?.trim();
            if (!href || /^javascript:\s*void\s*\(\s*0\s*\)\s*;?$/i.test(href)) return 'unresolved';
            try {
                const url = new URL(href, doc.baseURI);
                if (url.origin !== 'https://zhibo.chaoxing.com') return 'unresolved';
            } catch (_) { return 'invalid'; }
            if (link.target !== '_blank') return 'unresolved';
            return link.relList.contains('noopener') || link.relList.contains('noreferrer') ? 'manual-policy' : 'approved-origin-only';
        },
        discover({ document: doc }) {
            const frame = videoAdapter.cardFrame();
            if (window.location?.origin !== 'https://mooc1.chaoxing.com' || !doc ||
                frame?.id !== 'iframe' || frame.getAttribute('info') !== 'card' || doc !== videoAdapter.cardDocument()) return null;
            const root = doc, lesson = catalog.current(), found = [], seen = new Set();
            let inaccessible = false;
            const visit = (current, path) => {
                if (!current || seen.has(current) || path.length > 4) { inaccessible = true; return; }
                seen.add(current);
                for (const entry of current.querySelectorAll('a.liveHref')) found.push({ entry, path });
                for (const child of current.querySelectorAll('iframe')) {
                    try { visit(child.contentDocument, [...path, child]); } catch (_) { inaccessible = true; }
                }
            };
            visit(root, []);
            if (!found.length) return null;
            const { entry, path } = found[0];
            const recognized = () => {
                let current = root;
                for (const owner of path) {
                    if (!owner.isConnected || owner.ownerDocument !== current || owner.hidden || owner.inert || !owner.getClientRects().length) return false;
                    try { current = owner.contentDocument; } catch (_) { return false; }
                }
                let count = 0, accessible = true;
                const recount = (inner, depth = 0) => {
                    if (!inner || depth > 4) { accessible = false; return; }
                    count += inner.querySelectorAll('a.liveHref').length;
                    for (const owner of inner.querySelectorAll('iframe')) { try { recount(owner.contentDocument, depth + 1); } catch (_) { accessible = false; } }
                };
                recount(root);
                return accessible && count === 1 && current === entry.ownerDocument && entry.isConnected &&
                    !!entry.querySelector(':scope > div.liveCard > div.live-ct') &&
                    /^javascript:\s*void\s*\(\s*0\s*\)\s*;?$/i.test(entry.getAttribute('href')?.trim() || '') &&
                    this.inspect(entry) !== 'invalid';
            };
            return { tasks: [{ kind: 'live', element: entry, nativeEntry: true }],
                validateScope: () => !inaccessible && found.length === 1 && frame === videoAdapter.cardFrame() &&
                    root === videoAdapter.cardDocument() && lesson === catalog.current() && recognized() };

        },
    };

    // Native attachment identity is observed evidence. Viewer selection uses actual
    // layout/rendering, never a guessed platform-specific scroll-container name.
    function documentViewer(boundary) {
        const documents = [], seen = new Set(); let inaccessible = false, loading = false;
        const visit = (doc, depth) => {
            if (!doc || seen.has(doc) || depth > 4) { inaccessible = true; return; }
            seen.add(doc); documents.push(doc);
            for (const frame of doc.querySelectorAll('iframe')) {
                try {
                    const inner = frame.contentDocument, src = frame.getAttribute('src');
                    if ((src && /^https?:/i.test(new URL(src, doc.baseURI).href) && inner?.URL === 'about:blank') ||
                        (frame.hasAttribute('srcdoc') && inner?.URL !== 'about:srcdoc')) loading = true;
                    visit(inner, depth + 1);
                } catch (_) { inaccessible = true; }
            }
        };
        if (boundary.tagName === 'IFRAME') { try { visit(boundary.contentDocument, 0); } catch (_) { inaccessible = true; } }
        else for (const frame of boundary.querySelectorAll('iframe')) { try { visit(frame.contentDocument, 0); } catch (_) { inaccessible = true; } }
        if (inaccessible) return { reason: '文档包含不可访问的内层框架' };
        const viewers = [];
        for (const doc of documents) {
            if (doc.querySelector('video, audio, form input[type=password], input[autocomplete="one-time-code"]')) return { reason: '文档范围含媒体或验证组件，无法安全自动阅读' };
            const pages = [...doc.querySelectorAll('img, canvas')].filter(el => el.getClientRects().length && el.getBoundingClientRect().height > 0);
            if (!pages.length && doc.readyState !== 'loading' && !doc.querySelector('img,canvas') && (!doc.body?.children.length || doc.querySelector('iframe'))) continue; // A wrapper is not a second, unrendered document.
            if (doc.readyState === 'loading' || !pages.length || pages.some(el => el.tagName === 'IMG' && (!el.complete || !el.naturalHeight))) { loading = true; continue; }
            const candidates = [...new Set([doc.scrollingElement, ...doc.querySelectorAll('*')])].filter(el => el && el.clientHeight > 0 &&
                Number.isFinite(el.scrollHeight) && el.scrollHeight - el.clientHeight > 1 && pages.every(page => el.contains(page)) &&
                (el === doc.scrollingElement || el === doc.documentElement || el === doc.body || /auto|scroll/.test(doc.defaultView.getComputedStyle(el).overflowY)));
            const inner = candidates.filter(el => !candidates.some(other => other !== el && el.contains(other)));
            if (inner.length === 1) viewers.push(inner[0]);
            else if (inner.length > 1) return { reason: '文档滚动区域不唯一' };
        }
        // A reader inside an owned iframe supersedes its containing shell,
        // regardless of which viewport happens to have the larger numeric range.
        const nestedIn = (inner, outer) => {
            let doc = inner.ownerDocument;
            for (let depth = 0; doc && depth < 5; depth++) {
                const owner = doc.defaultView?.frameElement;
                if (!owner) return false;
                if (owner.ownerDocument === outer.ownerDocument) return outer.contains(owner);
                doc = owner.ownerDocument;
            }
            return false;
        };
        const positive = viewers.filter(el => el.scrollHeight - el.clientHeight > 1);
        const actual = positive.filter(outer => !positive.some(inner => inner !== outer && nestedIn(inner, outer)));
        if (!actual.length && !loading) return { reason: '未找到正滚动范围的阅读区；零范围不代表阅读完成，请检查平台信用或手动处理' };
        viewers.splice(0, viewers.length, ...actual);
        if (viewers.length > 1) {
            const scrolling = viewers.filter(el => el.scrollHeight > el.clientHeight + 1);
            if (scrolling.length === 1 && !loading) return { viewer: scrolling[0] };
            return { reason: `存在 ${viewers.length} 个独立候选阅读区域（实际可滚动 ${scrolling.length} 个）；无可靠顺序，请手动选择原生阅读区域` };
        }
        return viewers.length === 1 && !loading ? { viewer: viewers[0] } : { loading: true, reason: '未找到已渲染的可验证文档滚动区域（可能尚在加载或格式不受支持）' };
    }
    const platformTaskAdapter = {
        discover({ document: root, node }) {
            const native = platformLiveEntry.discover({ document: root });
            if (native) return native;
            const frame = videoAdapter.cardFrame();
            if (!root || !frame || !node) return null;
            const boundaries = [...root.querySelectorAll('.ans-attach-online.insertdoc-online-pdf')].filter(el =>
                !el.parentElement?.closest('.ans-attach-online.insertdoc-online-pdf'));
            if (boundaries.length) return {
                tasks: boundaries.map(element => ({ kind: 'document', element, ...documentViewer(element), platformDocument: true })),
                validateScope: () => frame === videoAdapter.cardFrame() && root === videoAdapter.cardDocument() && node === catalog.current() &&
                    boundaries.every(el => el.isConnected && el.ownerDocument === root) &&
                    boundaries.length === [...root.querySelectorAll('.ans-attach-online.insertdoc-online-pdf')].filter(el => !el.parentElement?.closest('.ans-attach-online.insertdoc-online-pdf')).length,
            };
            // Additional native interaction: actual approved-origin links plus live
            // lesson identity, not Chinese card text alone. No URL construction.
            const name = node.querySelector('.posCatalog_name');
            if (location.origin !== 'https://mooc1.chaoxing.com' || !/直播|回放/.test(name?.getAttribute('title') || name?.textContent || '')) return null;
            const links = [], documents = new Set();
            const visit = (doc, depth) => {
                if (!doc || documents.has(doc) || depth > 4) return;
                documents.add(doc);
                for (const link of doc.querySelectorAll('a[href]')) {
                    try { if (new URL(link.getAttribute('href'), doc.baseURI).origin === 'https://zhibo.chaoxing.com' && link.target === '_blank' && link.getClientRects().length) links.push(link); } catch (_) { /* Not a validated link. */ }
                }
                for (const child of doc.querySelectorAll('iframe')) { try { visit(child.contentDocument, depth + 1); } catch (_) { /* No invented cross-origin adapter. */ } }
            };
            visit(root, 0);
            if (links.length !== 1 || [...documents].some(doc => doc.querySelector('.ans-attach-online, a.liveHref, input[type=password], input[autocomplete="one-time-code"]'))) return null;
            const entry = links[0], href = entry.getAttribute('href');
            return { tasks: [{ kind: 'live', element: entry, nativeLink: true }], validateScope: () => frame === videoAdapter.cardFrame() &&
                root === videoAdapter.cardDocument() && node === catalog.current() && entry.isConnected &&
                entry.getAttribute('href') === href && entry.target === '_blank' && entry.getClientRects().length > 0 };
        },
    };

    // The recorded popup uses confirmed evidence only.
    function bootRecordedPopup() {
        if (window.top !== window) return;
        const flag = name => {
            if (typeof window[name] === 'number') return window[name];
            const values = Array.from(document.scripts).flatMap(script => Array.from(script.textContent.matchAll(
                new RegExp('(?:^|[;\\s])(?:var\\s+|let\\s+|const\\s+)?' + name + '\\s*=\\s*(\\d+)\\s*(?=[;,\\r\\n]|$)', 'g')), match => Number(match[1])));
            return values.length && values.every(value => value === values[0]) ? values[0] : null;
        };
        const adapter = {
            kind: 'chaoxing-recorded-videojs', allowNearEnd: false, recoverPlayback: true,
            isRecognized: () => window.location.origin === 'https://zhibo.chaoxing.com' &&
                document.title.trim() === '直播' && flag('liveStatus') === 4 && flag('lookback') === 1 &&
                document.querySelectorAll('div#video.video-js video#video_html5_api.vjs-tech').length === 1,
            getPlayer: () => document.querySelector('div#video.video-js video#video_html5_api.vjs-tech'),
        };
        let attempts = 0;
        const stop = () => { clearInterval(window[BOOT_TIMER_KEY]); window[BOOT_TIMER_KEY] = null; window.removeEventListener('pagehide', stop); };
        const probe = () => {
            if (adapter.isRecognized()) {
                stop();
                if (gmLive) gmLive.child(adapter);
                else if (window.opener) window.__xuexitongTaskSupport.installChild(adapter);
                else { const panel=document.createElement('p'); panel.textContent='用户脚本环境未提供 GM 跨标签页权限，且没有 opener；请手动播放并返回课程核对信用'; panel.style.cssText='position:fixed;bottom:8px;right:8px;z-index:2147483647;background:white;color:#222;padding:8px'; document.body.append(panel); }
            }
            else if (++attempts >= 30) { stop(); console.warn('不支持或未加载的直播回放页面；课程窗口保持等待，请手动处理。'); }
        };
        window[BOOT_TIMER_KEY] = setInterval(probe, 1000);
        window.addEventListener('pagehide', stop);
        probe();
    }
    function createTaskSupport(env) {
        const bridgeProtocol = 'xuexitong-live-bridge-v1';
        const bridgeParents = new Set();
        function createBridgeParent({ generation, isValid, isPlatformComplete, onError, background }) {
            const id = env.crypto.randomUUID(), discoveryId = env.crypto.randomUUID();
            const node = catalog.current(), lessonId = node?.id, cardDocument = videoAdapter.cardDocument(), href = env.location.href;
            const valid = () => isValid() && node?.isConnected && lessonId && node.id === lessonId && catalog.current() === node &&
                Array.from(document.querySelectorAll('[id]')).filter(element => element.id === lessonId).length === 1 &&
                videoAdapter.cardDocument() === cardDocument && env.location.href === href;
            let started, sent = 0, received = 0, timer = null, probeTimer = null, attempts = 0;
            let disposed = false, phase = 'IDLE', paired = false, ended = false, confirmed = false;
            const sendBridge = type => env.postMessage({ protocol: bridgeProtocol, type, id, generation,
                seq: ++sent, timestamp: Date.now(), background: background !== false }, env.location.origin);
            const dispose = () => {
                if (disposed) return;
                const prepared = phase === 'ACTIVE';
                disposed = true; phase = 'DISPOSED'; env.clearInterval(timer); env.clearTimeout(probeTimer);
                bridgeParents.delete(controller);
                if (prepared) sendBridge('CANCEL');
                env.removeEventListener('message', receive);
                for (const type of ['pagehide', 'beforeunload', 'popstate', 'hashchange']) env.removeEventListener(type, dispose);
            };
            const fail = (reason = '直播桥接会话失效或窗口提前关闭，请手动处理') => {
                if (disposed) return;
                dispose(); onError(reason);
            };
            const tick = () => {
                if (disposed) return;
                if (!valid() || Date.now() - started > 86400000) return fail();
                // These messages are advisory: same-window source/origin/IDs do not
                // authenticate the companion. Its isolated side also checks ended/marker.
                if (ended && !confirmed && isPlatformComplete?.() === true) { confirmed = true; sendBridge('CONFIRM'); }
            };
            const probe = () => {
                if (disposed || phase !== 'DISCOVERING') return;
                if (!valid()) return dispose();
                if (attempts >= 20 || Date.now() - started >= 5000) return fail('未在有限等待内发现可选直播桥；请手动处理，脚本不会自动推进');
                attempts++;
                env.postMessage({ protocol: bridgeProtocol, type: 'PING', id, generation, discoveryId, timestamp: Date.now() }, env.location.origin);
                probeTimer = env.setTimeout(probe, 250);
            };
            function receive(event) {
                const data = event.data;
                if (disposed || event.source !== env || event.origin !== 'https://mooc1.chaoxing.com' ||
                    !data || data.protocol !== bridgeProtocol || data.id !== id || data.generation !== generation ||
                    !Number.isFinite(data.timestamp) ||
                    data.timestamp < started || data.timestamp > Date.now() + 30000 || !valid()) return;
                if (data.type === 'AVAILABLE') {
                    if (phase !== 'DISCOVERING' || data.discoveryId !== discoveryId || Date.now() - started >= 5000) return;
                    phase = 'ACTIVE'; env.clearTimeout(probeTimer); probeTimer = null;
                    timer = env.setInterval(tick, 2000); sendBridge('PREPARE'); return;
                }
                if (phase !== 'ACTIVE' || !Number.isSafeInteger(data.seq) || data.seq <= received) return;
                if (!['PAIRED', 'ENDED', 'CLOSED', 'ERROR'].includes(data.type)) return;
                if (['ENDED', 'CLOSED'].includes(data.type) && !paired) return;
                received = data.seq;
                if (data.type === 'PAIRED') paired = true;
                if (data.type === 'ERROR') return fail();
                if (data.type === 'ENDED') { ended = true; tick(); }
                // No page-world message can prove companion provenance or tab closure.
                // There is intentionally no onResult/scheduleClose route in this adapter.
                if (data.type === 'CLOSED') return fail('同页桥接终止消息无法验证发送者；自动续课已禁用，请手动导航');
            }
            const controller = { manualOnly: false, dispose, tick, start() {
                if (disposed || phase !== 'IDLE' || !valid()) return;
                phase = 'DISCOVERING'; started = Date.now(); bridgeParents.add(controller);
                env.addEventListener('message', receive);
                for (const type of ['pagehide', 'beforeunload', 'popstate', 'hashchange']) env.addEventListener(type, dispose);
                probe();
            } };
            bridgeParents.add(controller);
            return controller;
        }
        const protocol = 'xuexitong-live-v1';
        const courseOrigin = 'https://mooc1.chaoxing.com';
        const replayOrigin = 'https://zhibo.chaoxing.com';
        const trustedPair = (parent, child) => parent === courseOrigin && child === replayOrigin;
        const types = new Set(['LIVE_OPENED', 'LIVE_READY', 'LIVE_PLAYING', 'LIVE_NEAR_END', 'LIVE_COMPLETED', 'LIVE_ERROR', 'LIVE_CLOSED', 'LIVE_CANCEL']);
        const send = (peer, session, type, extra = {}) => peer.postMessage({
            protocol, id: session.id, generation: session.generation, seq: ++session.sent,
            timestamp: Date.now(), type, ...(session.documentId ? { documentId: session.documentId, playerKind: 'chaoxing-recorded-videojs' } : {}), ...extra,
        }, session.peerOrigin || env.location.origin);
        const accept = (event, session, peer) => {
            const data = event.data;
            return event.origin === (session.peerOrigin || env.location.origin) && event.source === peer && data &&
                data.protocol === protocol && data.id === session.id && data.generation === session.generation &&
                types.has(data.type) && Number.isSafeInteger(data.seq) && data.seq > session.received &&
                Number.isFinite(data.timestamp) && data.timestamp >= session.started - 5000 && data.timestamp <= Date.now() + 30000;
        };
        function createParent({ entry, nativeEntry = false, generation, threshold, isValid, onResult, onError, scheduleClose = fn => fn(), isPlatformComplete, background }) {
            if (nativeEntry) {
                const scope = platformLiveEntry.discover({ document: videoAdapter.cardDocument() });
                if (!scope?.validateScope() || scope.tasks[0].element !== entry) throw new Error('Unsupported native live entry');
                if (typeof isPlatformComplete === 'function') return createBridgeParent({ generation, isValid,
                    isPlatformComplete, onResult, onError, scheduleClose, background });
                let started = false, disposed = false;
                return {
                    manualOnly: true, dispose() { disposed = true; },
                    start() {
                        if (started || disposed || !isValid()) return;
                        started = true;
                        if (!scope.validateScope()) return onError('直播入口已变化，停止自动处理');
                        // Native anchor.click() returns no WindowProxy. Do not substitute
                        // window.open(), rewrite target/URL, introspect closures or run the
                        // business handler merely to discover its destination.
                        const state = platformLiveEntry.inspect(entry);
                        onError(state === 'invalid' ? '直播目标不受支持，请手动检查原生入口' :
                            '已识别平台直播入口，但原生链接不提供可验证的窗口引用；请手动点击直播卡片并处理，脚本不会自动推进');
                    },
                };
            }
            const url = new URL(entry.href, env.location.href);
            const crossOrigin = url.origin !== env.location.origin;
            if (!entry.isConnected || entry.tagName !== 'A' || entry.target !== '_blank' ||
                entry.relList?.contains('noopener') || entry.relList?.contains('noreferrer') || (crossOrigin && !trustedPair(env.location.origin, url.origin)) ||
                !['http:', 'https:'].includes(url.protocol) || !Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
                throw new Error('Unsupported live entry/origin/threshold');
            }
            const session = { id: env.crypto.randomUUID(), generation, sent: 0, received: 0, started: Date.now(), peerOrigin: url.origin };
            let child, timer, disposed = false, result = null, closeAttempted = false, childDocument = null;
            const dispose = () => {
                if (crossOrigin && !disposed && child && !child.closed && session.documentId) {
                    try { send(child, session, 'LIVE_CANCEL'); } catch (_) { /* Cancellation never closes a window. */ }
                }
                disposed = true; env.clearInterval(timer);
                env.removeEventListener('message', receive); env.removeEventListener('pagehide', dispose);
            };
            const fail = reason => { if (!disposed) { dispose(); onError(reason); } };
            const tick = () => {
                if (disposed) return;
                if (!isValid()) return fail('Original live task changed');
                if (!child) return;
                if (child.closed) {
                    if (!result) return fail('Live window closed before a validated result');
                    if (!closeAttempted) return;
                    dispose(); onResult(result); return;
                }
                try {
                    if (!crossOrigin && ((child.location.origin !== env.location.origin && !(child.location.href === 'about:blank' && !childDocument)) ||
                        (childDocument && child.document !== childDocument))) {
                        return fail('Live window left its supported document/origin');
                    }
                    if (result && !closeAttempted) return;
                    if (closeAttempted) return fail('Live window closure denied or not confirmed; handle manually');
                    send(child, session, 'LIVE_OPENED', { threshold, ...(crossOrigin ? { settings: loadSettings(env) } : {}) });
                } catch (_) { fail('Live window communication unavailable'); }
            };
            function receive(event) {
                if (disposed || !child || !accept(event, session, child) || !isValid()) return;
                const data = event.data;
                if (data.type === 'LIVE_OPENED' || data.type === 'LIVE_CANCEL') return;
                if (crossOrigin) {
                    if (data.playerKind !== 'chaoxing-recorded-videojs' || typeof data.documentId !== 'string' || !/^[\w-]{16,80}$/.test(data.documentId)) return;
                    if (!session.documentId) {
                        if (data.type !== 'LIVE_READY') return;
                        session.documentId = data.documentId;
                    } else if (data.documentId !== session.documentId) return fail('Live child document changed');
                    // Recorded adapter must reach natural ended, never merely a local ratio.
                    if (data.type === 'LIVE_NEAR_END') return;
                }
                if (data.type === 'LIVE_COMPLETED' && data.ended !== true) return;
                if (data.type === 'LIVE_NEAR_END' && !(Number.isFinite(data.duration) && data.duration > 0 &&
                    Number.isFinite(data.position) && data.position >= 0 && data.position <= data.duration + 1 &&
                    data.position / data.duration >= threshold)) return;
                session.received = data.seq;
                if (result) return;
                if (data.type === 'LIVE_ERROR' || data.type === 'LIVE_CLOSED') return fail('Live child stopped unexpectedly');
                if (data.type === 'LIVE_READY') {
                    if (!crossOrigin) try { childDocument = child.document; } catch (_) { return fail('Live document inaccessible'); }
                }
                const ended = data.type === 'LIVE_COMPLETED' && data.ended === true;
                const near = data.type === 'LIVE_NEAR_END' && Number.isFinite(data.duration) && data.duration > 0 &&
                    Number.isFinite(data.position) && data.position >= 0 && data.position / data.duration >= threshold &&
                    data.position <= data.duration + 1;
                if (!ended && !near) return;
                result = { kind: near ? 'near-end' : 'completed', basis: near ? 'local-position' : 'local-ended' };
                scheduleClose(() => {
                    if (disposed || !isValid()) return;
                    closeAttempted = true;
                    try { child.close(); } catch (_) { fail('Live window closure denied; handle manually'); }
                });
                // Closure is confirmed on the next poll, not inferred from close() succeeding.
            }
            return {
                session, get child() { return child; }, tick, dispose,
                start() {
                    if (disposed || child || !isValid()) return;
                    env.addEventListener('message', receive); env.addEventListener('pagehide', dispose);
                    child = env.open(url.href, '_blank');
                    if (!child) return fail('Live popup blocked; open it manually');
                    timer = env.setInterval(tick, 2000);
                    tick();
                },
            };
        }
        function installChild(adapter) {
            if (env.__xuexitongLiveChild && !env.__xuexitongLiveChild.disposed) return env.__xuexitongLiveChild;
            if (!env.opener || !adapter || typeof adapter.isRecognized !== 'function' || !adapter.isRecognized()) return null;
            let session = null, video = null, timer, terminal = false, disposed = false;
            let lastPosition = -1, lastProgress = Date.now(), lastRecovery = -Infinity, playPending = false;
            let settings = loadSettings(env);
            const actions = createActionScheduler(env, {
                rule: category => ({ ...settings.delays[category], enabled: settings.randomDelaysEnabled && settings.delays[category].enabled }),
                enabled: () => settings.features.live && settings.features.videoPlayback,
                onError: () => report('LIVE_ERROR'),
            });
            const listeners = [];
            const listen = (target, type, handler) => { target.addEventListener(type, handler); listeners.push([target, type, handler]); };
            const dispose = () => {
                disposed = true; env.clearInterval(timer); actions.cancelAll();
                for (const [target, type, handler] of listeners) target.removeEventListener(type, handler);
            };
            const report = (type, extra) => { if (session && !disposed && env.opener && !env.opener.closed) send(env.opener, session, type, extra); };
            const applySettings = next => {
                const previous = settings; settings = next;
                if (previous.features.live !== settings.features.live || previous.features.videoPlayback !== settings.features.videoPlayback ||
                    previous.randomDelaysEnabled !== settings.randomDelaysEnabled || JSON.stringify(previous.delays.videoStart) !== JSON.stringify(settings.delays.videoStart)) actions.cancelAll('settings');
                if (!settings.features.live) { report('LIVE_ERROR'); dispose(); }
            };
            const check = () => {
                if (disposed || !session) return;
                if (!env.opener || env.opener.closed) return dispose();
                if (!adapter.isRecognized() || !video.isConnected || video.error) { report('LIVE_ERROR'); return dispose(); }
                if (terminal) return;
                if (video.playbackRate !== 1) video.playbackRate = 1;
                if (video.ended || adapter.sessionFinished?.() === true) {
                    terminal = true; report('LIVE_COMPLETED', { ended: true });
                } else if (adapter.allowNearEnd !== false && Number.isFinite(video.duration) && video.duration > 0 &&
                    Number.isFinite(video.currentTime) && video.currentTime / video.duration >= session.threshold) {
                    terminal = true; report('LIVE_NEAR_END', { position: video.currentTime, duration: video.duration });
                } else {
                    report(video.paused ? 'LIVE_READY' : 'LIVE_PLAYING');
                    if (adapter.recoverPlayback && settings.features.live && settings.features.videoPlayback && settings.features.background) {
                        if (video.currentTime !== lastPosition) { lastPosition = video.currentTime; lastProgress = Date.now(); }
                        if ((video.paused || Date.now() - lastProgress >= 7000) && !actions.pending.size &&
                            !playPending && Date.now() - lastRecovery >= 1500) {
                            lastRecovery = Date.now(); playPending = true;
                            Promise.resolve(video.play()).catch(() => report('LIVE_ERROR')).finally(() => { playPending = false; });
                        }
                    }
                }
            };
            listen(env, 'message', event => {
                const data = event.data;
                if (!data) return;
                if (data.type === 'LIVE_CANCEL') {
                    if (session && accept(event, session, env.opener) && data.documentId === session.documentId) dispose();
                    return;
                }
                if (data.type !== 'LIVE_OPENED') return;
                if (!session) {
                    const crossOrigin = event.origin !== env.location.origin;
                    if ((crossOrigin && (!trustedPair(event.origin, env.location.origin) || adapter.kind !== 'chaoxing-recorded-videojs')) || event.source !== env.opener || !data ||
                        data.protocol !== protocol || data.type !== 'LIVE_OPENED' ||
                        typeof data.id !== 'string' || !/^[\w-]{16,80}$/.test(data.id) ||
                        !Number.isSafeInteger(data.generation) || data.generation < 0 || !Number.isFinite(data.threshold) || data.threshold <= 0 || data.threshold > 1) return;
                    const candidate = { id: data.id, generation: data.generation, started: Date.now(), sent: 0, received: 0, threshold: data.threshold,
                        peerOrigin: event.origin, ...(crossOrigin ? { documentId: env.crypto.randomUUID() } : {}) };
                    if (!accept(event, candidate, env.opener)) return;
                    if (crossOrigin) {
                        let supplied;
                        try { supplied = validateSettings(data.settings); } catch (_) { return; }
                        if (!supplied || !supplied.features.live) return;
                        settings = supplied;
                    }
                    session = candidate;
                    video = adapter.getPlayer();
                    if (!video?.isConnected || typeof video.play !== 'function' || video.tagName !== 'VIDEO') {
                        report('LIVE_ERROR'); return dispose();
                    }
                    video.playbackRate = 1;
                    listen(video, 'ratechange', () => { if (video.playbackRate !== 1) video.playbackRate = 1; });
                    for (const type of ['timeupdate', 'durationchange', 'ended', 'play', ...(adapter.recoverPlayback ? ['pause'] : [])]) listen(video, type, check);
                    report('LIVE_READY');
                    actions.run('videoStart', 'child-video-start', () => video.play().catch(() => report('LIVE_ERROR')),
                        { isValid: () => !disposed && !!env.opener && !env.opener.closed && video.isConnected && adapter.isRecognized() });
                    timer = env.setInterval(check, 10000);
                    if (adapter.recoverPlayback) {
                        listen(env, 'focus', check);
                        listen(env.document, 'visibilitychange', check);
                    }
                }
                if (!accept(event, session, env.opener)) return;
                if (session.peerOrigin !== env.location.origin) {
                    if (data.documentId && data.documentId !== session.documentId) return;
                    try { applySettings(validateSettings(data.settings)); } catch (_) { return; }
                    if (disposed) return;
                }
                session.received = data.seq;
                check();
            });
            listen(env, 'storage', event => { if (event.key === SETTINGS_KEY) {
                applySettings(loadSettings(env));
            } });
            listen(env, 'pagehide', () => { if (!terminal) report('LIVE_CLOSED'); dispose(); });
            if (env[BOOT_TIMER_KEY]) { env.clearInterval(env[BOOT_TIMER_KEY]); env[BOOT_TIMER_KEY] = null; }
            return env.__xuexitongLiveChild = { check, dispose, get active() { return !!session; }, get disposed() { return disposed; } };
        }
        function readDocument({ element, isValid, onComplete, onError, scheduleStep, onProgress = () => {} }) {
            let timer, scheduled, cancelled = false, previous = -1, unchanged = 0, bottomHeight = -1, begun = false, started = null, duration = null;
            const clock = () => env.performance?.now ? env.performance.now() : Date.now();
            const cancel = () => { cancelled = true; env.clearTimeout(timer); scheduled?.cancel(); };
            const fail = reason => { cancel(); onError(reason); };
            const tick = () => {
                if (cancelled) return;
                if (!isValid() || !element.isConnected || element.clientHeight <= 0) return fail('Document viewer unavailable');
                const bottom = element.scrollHeight - element.clientHeight;
                if (!Number.isFinite(bottom) || bottom <= 1) return fail('阅读区已无有效滚动范围；不能据此确认本地阅读完成');
                onProgress(Math.min(100, Math.floor(element.scrollTop / bottom * 100)));
                if (!Number.isFinite(bottom) || bottom < 0) return fail('Document bottom cannot be verified');
                if (begun && clock() - started >= duration && element.scrollTop >= bottom - 1) {
                    if (bottomHeight === element.scrollHeight) { cancel(); onComplete(); return; }
                    bottomHeight = element.scrollHeight;
                    timer = env.setTimeout(tick, 250); // Recheck the real extent after rendering has had time to settle.
                    return;
                }
                bottomHeight = -1;
                if (begun && clock() - started >= duration && element.scrollTop === previous) unchanged++; else unchanged = 0;
                if (unchanged >= 10) return fail('Document scrolling made no progress');
                previous = element.scrollTop;
                const step = () => {
                    if (cancelled) return;
                    if (!isValid() || !element.isConnected || element.clientHeight <= 0) return fail('Document viewer unavailable');
                    if (!begun) { element.scrollTop = 0; begun = true; started = clock(); duration = 5000 + Math.floor(Math.random() * 2001); }
                    const progress = Math.max(0, Math.min(1, (clock() - started) / duration));
                    element.scrollTop = progress * (element.scrollHeight - element.clientHeight);
                    tick();
                };
                if (scheduleStep) scheduled = scheduleStep(step);
                else timer = env.setTimeout(step, 100);
            };
            tick();
            return { cancel, tick, get durationMs() { return duration; } };
        }
        return { createParent, installChild, readDocument, inspectPlatformEntry: entry => platformLiveEntry.inspect(entry), inspectAdditionalAttachment,
            dispose() { for (const parent of [...bridgeParents]) parent.dispose(); } };
    }

    function initializePlayer() {
        const app = {
            configs: {
                playbackRate: 1.0,
                autoplay: true,
                retryInterval: 2000,
                maxRetries: 10,
                videoCheckInterval: 1000,
                guardNoProgressMs: 7000,
                guardResumeCooldownMs: 1500,
                autoAdvanceNoVideo: false,
                liveNearEndThreshold: 0.99,
                randomCooldownEnabled: true,
                randomCooldownMinMs: 5000,
                randomCooldownMaxMs: 12000,
            },
            _videoEl: null,
            _treeContainerEl: null,
            _isPlaying: false,
            _currentRetryCount: 0,
            _checkInterval: null,
            _eventVideoEl: null,
            _boundVideoHandlers: null,
            _nextUnitPending: false,
            _chapterAdvanceTimes: 0,
            _cellData: {
                cells: 0,
                nCells: 0,
                currentCellIndex: 0,
                currentNCellIndex: 0,
                currentVideoTitle: "",
            },
            get cellData() {
                return this._cellData;
            },
            _recoveryEntryAllowed() {
                if (!this._recovery) return true;
                const status = this._recovery.restore();
                if (!status.stopped && status.stage !== 'terminal') return true;
                this.stopAutomation();
                this._notify(status.stopped ? '用户已停止自动操作，请明确重新自动检测' : '当前小节自动恢复已终止；不会再次尝试，请手动重新检测');
                return false;
            },
            _partialPauseApplies() {
                try {
                    const raw=sessionStorage.getItem('xuexitong.v3.partial-pause.v1');if(!raw)return false;
                    const saved=JSON.parse(raw),node=catalog.current(),course=pacingCourse(window);
                    if(!Array.isArray(saved)||saved.length!==2||!saved.every(x=>typeof x==='string'&&x.length>0))return true;
                    if(!course||!node?.id||!node.isConnected||!this._catalogTopology()||[...document.querySelectorAll('[id]')].filter(el=>el.id===node.id).length!==1)return true;
                    if(saved[0]===course&&saved[1]===node.id)return true;
                    sessionStorage.removeItem('xuexitong.v3.partial-pause.v1');return false;
                }catch(_){return true;}
            },
            run({ startup = false, transition = false } = {}) {
                if(this._partialPauseApplies()){this.stopAutomation();this._state='WAITING_MANUAL_TASKS';this._notify('未解决附件等待显式 recheckCurrentLesson()；普通运行不会恢复历史本地完成');return;}
                this._partialSession=null;
                if (!this._recoveryEntryAllowed()) return;
                this._partialSuspended=false;
                console.log("%c=== 学习通自动刷课脚本 V3 优化版启动 ===", "color:#4CAF50;font-size:16px;font-weight:bold");
                if (!transition || this._state !== 'WAITING_CATALOG') this._cancelTasks();
                this._destroyed = false;
                this._recovery?.restore();
                if (this._pacing && this._pacing.getStatus().course !== pacingCourse(window)) this._pacing = createTaskPacingCoordinator(window, () => this.settings);
                this._manualPermit = null; this._manualBusy = false;
                this._detectedKind = null; this._attemptStatus = '';
                this._priorChecked = null; this._completedVisits ||= new Set();
                this._automaticStartup = startup;
                this._state = 'DISCOVERING';
                this._isPlaying = false;
                this._completedVideos = new WeakSet();
                this._failedAudioPlayers = new WeakSet(); this._audioFailureScope = null; this._audioUnresolved = null;
                this._attachmentSnapshot = null;
                this._processedTasks = new WeakSet();
                this._externalCompletion = null;
                this._hadLive = false;
                this._liveReturnPendingNavigation = false;
                this._preparedVideoNode = null;
                this._lastProcessedKind = null;
                this._nextVideoRequested = false;
                this._completionNode = null;
                this._completionVideo = null;
                this._videoContext = null;
                this._tryTimes = 0;
                this._stepSwitchPending = false;
                this._nextUnitPending = false;
                this._chapterAdvanceTimes = 0;
                this._getTreeContainer();
                this._initCellData();
                this._videoEl = null;
                this._clearCheckInterval();
                this._bindStepNavigation();
                this._notify('正在检测当前小节');
                if (this._checkPriorCompletion() || this._observeCredit()) return;
                const scope = startup && this._taskSet();
                if (startup && !this._isChapterTest() && this._currentStepTitle() !== '学习目标' && !scope?.invalid && !scope?.tasks.length) this._waitForStartup(); else this.play();
            },
            _waitForStartup() {
                const generation = this._generation, href = window.location.href;
                const original = catalog.current(), id = original?.id, chapter = original && this._chapterOf(original);
                const topology = this._catalogTopology();
                let timer, attempts = 0, previous = null;
                const cleanup = () => {
                    clearTimeout(timer); this._timers.delete(timer);
                    timer = null;
                    document.removeEventListener('click', interaction, true);
                    for (const type of ['pagehide', 'beforeunload', 'popstate', 'hashchange']) window.removeEventListener(type, cancel);
                    if (this._startupCancel === cleanup) this._startupCancel = null;
                };
                const cancel = () => { cleanup(); this._block('首次自动启动已取消，请手动重新识别'); };
                const interaction = event => { if (event.isTrusted && !event.composedPath().includes(this._settingsPanel)) cancel(); };
                this._startupCancel = cleanup;
                document.addEventListener('click', interaction, true);
                for (const type of ['pagehide', 'beforeunload', 'popstate', 'hashchange']) window.addEventListener(type, cancel);
                const tick = () => {
                    this._timers.delete(timer);
                    if (this._destroyed || generation !== this._generation) return cleanup();
                    if (href !== window.location.href) { cleanup(); return this._block('首次启动时页面已改变，请手动重新识别'); }
                    const node = catalog.current();
                    if (original && node && node !== original && (original.isConnected || !id || node.id !== id ||
                        Array.from(document.querySelectorAll('[id]')).filter(el => el.id === id).length !== 1 ||
                        (this._chapterOf(node) !== chapter && (!topology || this._catalogTopology() !== topology)))) {
                        cleanup(); return this._block('首次启动时课程任务已改变');
                    }
                    const frame = videoAdapter.cardFrame(), doc = videoAdapter.cardDocument(), media = this._playableMedia();
                    if (catalog.status(node) === 'completed') {
                        cleanup(); this._state = 'READY';
                        if (!this._checkPriorCompletion()) this._block('完成标记存在，但任务范围尚无法安全确认');
                        return;
                    }
                    const scope = this._taskSet();
                    if (scope && !scope.invalid && scope.tasks.length && !media.pending && !media.unsupported && !media.inaccessible && scope.validateScope()) {
                        cleanup(); this._state = 'DISCOVERING'; this._initCellData(); this.play(); return;
                    }
                    if (media.reasons?.includes('assessment-or-verification-required')) { cleanup(); return this._block('检测到测验或身份验证，停止自动播放'); }
                    const title = this._currentStepTitle(), label = node?.querySelector('.posCatalog_name');
                    const nodeTitle = (label?.getAttribute('title') || label?.textContent || '').trim();
                    const stepReady = !document.getElementsByClassName('prev_title').length || !!title;
                    const requiredFrames = new Set([frame]);
                    for (const player of media.videos) {
                        let inner = player.ownerDocument;
                        for (let depth=0; inner && inner !== document && depth<5; depth++) {
                            const owner=inner.defaultView?.frameElement;if(!owner)break;
                            requiredFrames.add(owner);inner=owner.ownerDocument;
                        }
                    }
                    const ready = node && stepReady && nodeTitle && frame && doc && document.readyState !== 'loading' && (media.videos.length > 0 || media.tasks?.length > 0) &&
                        !media.pending && !media.inaccessible && [...requiredFrames].every(child => {
                                try {
                                    const nested = child.contentDocument;
                                    const src = child.getAttribute('src')?.trim();
                                    const destination = src ? new URL(src, child.ownerDocument.baseURI) : null;
                                    return nested && nested.readyState !== 'loading' &&
                                        (!destination || !['http:', 'https:'].includes(destination.protocol) || nested.URL !== 'about:blank') &&
                                        (!child.hasAttribute('srcdoc') || nested.URL === 'about:srcdoc');
                                } catch (_) { return false; }
                            });
                    const snapshot = [node, title, nodeTitle, doc, ...media.documents, ...media.videos];
                    if (ready && previous && previous.length === snapshot.length && previous.every((value, index) => value === snapshot[index])) {
                        cleanup(); this._state = 'DISCOVERING'; this._initCellData(); this.play(); return;
                    }
                    if (++attempts >= 40) {
                        cleanup(); return this._block(/直播|回放/.test(nodeTitle) ? '未找到可识别的直播入口；现有页面证据不足，请使用原生入口或提供脱敏结构' : '首次启动等待目录或媒体就绪超时；可在任务面板选择类型后重试');
                    }
                    previous = ready ? snapshot : null;
                    timer = setTimeout(tick, 250); this._timers.add(timer);
                };
                this._state = 'WAITING_STARTUP'; tick();
            },
            nextUnit() {
                if(this._partialSession){this._waitPartialTasks();return;}
                if (['ADVANCING', 'NAVIGATION_COOLDOWN', 'WAITING_STARTUP', 'WAITING_LIVE', 'READING_DOCUMENT', 'ACTION_PENDING', 'PAUSED_AUTOMATION'].includes(this._state) || this._nextUnitPending) return;
                if (this._isChapterTest()) return this._advanceChapterTest();
                if (!this._externalCompletion && !this._platformCompletion && this._state === 'READY_TO_ADVANCE' && !this._refreshVideoContext()) return this._block('视频任务身份无法确认');
                if (this._state !== 'READY_TO_ADVANCE' || catalog.current() !== this._completionNode ||
                    (!this._externalCompletion && catalog.status(this._completionNode) !== 'completed')) {
                    return this._block('平台完成状态尚未确认，停止自动导航');
                }
                const entries = catalog.entries();
                const index = entries.indexOf(this._completionNode);
                if (index < 0) return this._block('当前目录节点已失效');
                const next = this._targetAfter(this._completionNode);
                if (next === null) return this._block('章末测验或下一章节无法安全识别');
                if (!next) {
                    this._state = 'FINISHED';
                    this._notify('已到当前可见目录末尾，自动导航已结束');
                    console.log('已到当前可见目录末尾；不代表整个课程已完成。');
                    return;
                }
                this._queueNavigation(next);
            },
            updateSettings(input, persist = true) {
                let next;
                try { next = validateSettings(input); } catch (error) { this._settingsMessage = error.message; return false; }
                const previous = this.settings;
                this.settings = next;
                if (this._documentWaitCancel && !next.features.document) this.stopAutomation();
                if ((this._mediaReadyCancel || this._audioState?.waiting) && !next.features[this._audioState || this._playableMedia().audios?.length ? 'audioPlayback' : 'videoPlayback']) { this._cancelTasks(); this._state = 'PAUSED_AUTOMATION'; }
                if (this._startupCancel && !next.features[this._playableMedia().audios?.length ? 'audioPlayback' : 'videoPlayback']) { this._cancelTasks(); this._state = 'PAUSED_AUTOMATION'; }
                if (previous.preset !== next.preset && next.preset === 'legacy') {
                    this.configs.randomCooldownMinMs = 5000; this.configs.randomCooldownMaxMs = 12000;
                }
                if (JSON.stringify(previous.rest) !== JSON.stringify(next.rest)) { this._pacing?.cancelPending(); this._actions.cancelAll('settings'); }
                this._actions.cancelWhere(category => (category === 'nextContent' && JSON.stringify(previous.features) !== JSON.stringify(next.features)) || !this._actionEnabled(category) ||
                    previous.randomDelaysEnabled !== next.randomDelaysEnabled ||
                    JSON.stringify(previous.delays[category]) !== JSON.stringify(next.delays[category]));
                if ((!next.features.document && this._documentController) ||
                    (!next.features.live && this._liveController)) this._block('对应功能已关闭');
                if (next.features.background && !this._pageGuards) this._bindPageGuards();
                if (!next.features.background) this._removePageGuards();
                if (persist) {
                    try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); this._settingsMessage = '已保存；取消的动作不会自动重启'; }
                    catch (_) { this._settingsMessage = '存储不可用，本页设置仍生效'; }
                }
                this._renderSettings?.();
                return true;
            },
            _actionEnabled(category) {
                const manual = (this._manualPermit === 'video' && category === 'videoStart') ||
                    (this._manualPermit === 'audio' && category === 'audioStart') ||
                    (this._manualPermit === 'document' && category === 'documentScroll');
                return !this._destroyed && (manual || category === 'nextContent' || this.settings.features[ACTIONS[category][3]]) &&
                    (category !== 'nextAudio' || this.settings.features.audioPlayback) &&
                    (category !== 'nextVideo' || this.settings.features.videoPlayback) &&
                    (category !== 'assessment' || this.settings.features.nextChapter) &&
                    (manual || !['videoStart', 'nextVideo'].includes(category) || this.configs.autoplay);
            },
            _actionRule(category) {
                const canonical = ['nextVideo','nextAudio','nextDocument'].includes(category) ? 'nextContent' : category;
                const value = { ...this.settings.delays[canonical] };
                if (this.settings.preset === 'legacy' && navigationActions.has(category)) {
                    value.minMs = this.configs.randomCooldownMinMs; value.maxMs = this.configs.randomCooldownMaxMs;
                }
                value.enabled = value.enabled && this.settings.randomDelaysEnabled;
                return value;
            },
            _runAction(category, key, callback, options = {}) {
                const generation = this._generation, node = catalog.current(), title = this._currentStepTitle();
                const href = window.location.href, content = videoAdapter.cardDocument();
                const valid = () => navigationActions.has(category) && key === 'navigation' ?
                    !this._destroyed && generation === this._generation && this._actionEnabled(category) && !!options.isValid?.() :
                    !this._destroyed && generation === this._generation && this._sameTaskNode(node) &&
                    title === this._currentStepTitle() && href === window.location.href && content === videoAdapter.cardDocument() &&
                    this._actionEnabled(category) && (!options.isValid || options.isValid());
                let pace = null;
                if (key === 'navigation' || options.pacingBoundary) {
                    if (this._actions.pending.has(key)) return this._actions.pending.get(key);
                    if (!valid()) return null;
                    try { pace = this._pacing.beforeNextContent(category, options.pacingBoundary || JSON.stringify(['navigation', this._navigationIntent.sourceId, this._navigationIntent.targetId]), this._actionRule(category)); }
                    catch (error) { this._block(error.message); return null; }
                }
                return this._actions.run(category, key, () => {
                    this._clearNavigationPreview();
                    const wasResting = !!this._pacing?.getStatus().restEndsAt;
                    if (pace && !this._pacing.consume(pace.key)) return this._block('节奏状态未满足或持久存储不可用');
                    if (pace && wasResting) this._notify(`休息结束，本轮目标：${this._pacing.getStatus().target} 项，继续自动学习`);
                    callback();
                }, { ...options, ...(pace ? { deadline: pace.deadline } : {}), isValid: valid,
                    onCancel: reason => {
                        options.onCancel?.(reason);
                        if (['user-interaction','navigation','page-unload','feature-disabled','explicit-stop'].includes(reason)) this._recovery?.cancel(reason);
                        if (this._destroyed || ['BLOCKED', 'ADVANCING'].includes(this._state)) return;
                        if (['context-stale','frame-replaced'].includes(reason) && this._recovery?.requestRecovery(reason)) { this._state = 'RECOVERING'; return; }
                        if (['user', 'stale','user-interaction','context-stale','frame-replaced','navigation','page-unload'].includes(reason)) this._block(key === 'navigation' ? (this._navigationFailure || '导航已被用户操作或页面切换取消') : '自动动作上下文已变化');
                        else {
                            if (this._isPlaying) return;
                            this._documentController?.cancel(); this._documentController = null;
                            this._liveController?.dispose(); this._liveController = null;
                            this._state = 'PAUSED_AUTOMATION'; this._playPending = false;
                            this._notify('自动动作已取消；请明确重新检测后继续');
                        }
                    },
                    watch: cancel => {
                        const observer = new MutationObserver(() => { if (!valid()) cancel('context-stale'); });
                        const listeners = [];
                        const listen = (el, type, handler = () => cancel('navigation')) => { el.addEventListener(type, handler, true); listeners.push([el, type, handler]); };
                        const click = event => { if (event.isTrusted && !event.composedPath().includes(this._settingsPanel) && !event.composedPath().includes(this._noticePanel)) cancel('user-interaction'); };
                        for (const doc of new Set([document, ...this._playableMedia().documents])) {
                            if (key !== 'navigation') observer.observe(doc, { subtree: true, attributes: true, childList: true, characterData: true });
                            listen(doc, 'click', click);
                            for (const frame of doc.querySelectorAll('iframe')) if (doc !== document || frame === videoAdapter.cardFrame()) {
                                listen(frame, 'load', () => { if (navigationActions.has(category) ? !valid() : (!this._automaticStartup || !['videoStart', 'audioStart'].includes(category) || !valid())) cancel('frame-replaced'); });
                            }
                        }
                        if (this._completionVideo) listen(this._completionVideo, 'play');
                        for (const type of ['pagehide', 'beforeunload', 'popstate', 'hashchange']) listen(window, type, () => cancel(['pagehide','beforeunload'].includes(type) ? 'page-unload' : 'navigation'));
                        return () => { observer.disconnect(); for (const [el, type, fn] of listeners) el.removeEventListener(type, fn, true); this._cooldownCleanup = null; };
                    },
                });
            },
            _removePageGuards() {
                if (!this._pageGuards) return;
                const { preventPause, resumePlaybackNow } = this._pageGuards;
                for (const type of ['mouseleave', 'mouseout']) {
                    document.removeEventListener(type, preventPause); window.removeEventListener(type, preventPause);
                }
                window.removeEventListener('blur', resumePlaybackNow);
                document.removeEventListener('visibilitychange', resumePlaybackNow);
                this._pageGuards = null;
            },
            _notify(message, status = '') {
                try { this._refreshDiagnostics?.(); } catch (_) { /* Diagnostics must not interrupt playback or safety notices. */ }
                this._lastNotice = message; if (status) this._attemptStatus = status;
                const output = this._noticePanel?.shadowRoot?.querySelector('[role=status]');
                if (output && output.textContent !== message) output.textContent = message;
                const task = this._settingsPanel?.shadowRoot?.querySelector('[data-task-status]');
                if (task) task.textContent = `${this._attemptStatus || '检测状态'} · ${this._state}：${message}`;
                const detected = this._settingsPanel?.shadowRoot?.querySelector('[data-detected]');
                if (detected) detected.textContent = `自动检测：${this._detectedKind || '尚未识别'} · ${this._state}`;
            },
            stopAutomation() {
                this._partialSuspended=true;this._partialSession=null;
                this._manualPermit = null; this._manualBusy = false; this._isPlaying = false;
                this._state = 'PAUSED_AUTOMATION'; this._cancelTasks(); this._detachVideoEvents();
                this._notify('已停止自动操作；可点击“重新自动检测”或选择任务后重试', '安全阻断');
            },
            _mountNoticePanel() {
                if (typeof document.createElement !== 'function') return;
                const host = document.createElement('div'); host.id = 'xuexitong-v3-notice';
                host.style.cssText = 'position:fixed;right:8px;bottom:86px;max-width:290px;z-index:2147483646';
                host.attachShadow({ mode: 'open' }).innerHTML = '<style>:host{font:12px/1.5 sans-serif;color:#222}div{background:#fff;border:1px solid #aaa;border-radius:5px;padding:7px}p{margin:0 0 5px}button{font:inherit}</style><div><p role="status" aria-live="polite">正在检测当前小节</p><button data-stop>停止自动操作</button> <button data-resume>重新自动检测</button></div>';
                host.shadowRoot.querySelector('[data-stop]').onclick = () => { this._recovery?.markExplicitStop(); this.stopAutomation(); };
                host.shadowRoot.querySelector('[data-resume]').onclick = () => { if (!this._destroyed) { this._recovery?.resumeExplicitly(); this.run({ startup: true }); } };
                this._noticePanel = host; document.body.append(host);
            },
            _inspectTask() {
                const scope = this._taskSet(), media = this._playableMedia();
                const node = catalog.current();
                const card = this._cardIdentity(), oldCard = this._observedCard;
                const sameCard = oldCard && card.length === oldCard.length && card.every((value, index) => value === oldCard[index]);
                if (!node || !this._catalogTopology() || ['WAITING_CATALOG','ADVANCING'].includes(this._state) ||
                    (this._observedLessonId && node.id !== this._observedLessonId && sameCard)) return { blocked: true, reason: '安全阻断：目录与内容切换尚未确认' };
                if (this._verificationPresent() || this._isChapterTest() || scope?.invalid || ((!this._priorProof(node)) && ((media.unsupported && !media.localExecutionEligible) || media.inaccessible))) return { blocked: true, reason: '安全阻断：任务归属、媒体或验证条件无法确认' };
                const pending = media.tasks?.find(task => task.kind === 'document' ? !this._processedTasks.has(task.attachment) : !this._mediaDone(task.element));
                const task = scope?.tasks.find(task => !this._processedTasks.has(task.element));
                const player = media.videos.find(el => !this._mediaDone(el));
                const kind = pending?.kind || task?.kind || (player ? player.tagName === 'AUDIO' ? 'audio' : 'video' : null);
                return { kind, task, player, scope, media, completed: !!catalog.current() && this._priorProof(catalog.current()) };
            },
            _diagnosticReport() {
                const session=this._partialSession, valid=!!session?.plan.validateScope();
                const state=/^[A-Z_]{1,40}$/.test(this._state)?this._state:'UNKNOWN';
                const tasks=valid?session.plan.tasks.map(task=>({ordinal:task.ordinal+1,kind:task.kind,classification:task.classification,reason:task.reason,
                    locallyProcessed:task.classification==='EXECUTABLE_KNOWN'&&(task.kind==='document'?this._processedTasks.has(task.owner):this._completedVideos.has(task.target))})):null;
                return {currentBlock:this._state==='BLOCKED'?this._currentDiagnosticBlock||null:null,version:'3.4.0',session:this._decisionJournal?.reference?.(this)||null,generatedAt:new Date().toISOString(),state,inventory:tasks,
                    inventoryStatus:valid?'current':'stale-or-unavailable',platformCredit:this._priorProof(catalog.current())===true,
                    events:this._decisionJournal?.read?.()||[]};
            },
            _appendDiagnostics(section) {
                const details=document.createElement('details');details.dataset.diagnostics='';
                const summary=document.createElement('summary');summary.textContent='任务记录与诊断';details.append(summary);
                const output=document.createElement('p'),history=document.createElement('pre'),status=document.createElement('p'),fallback=document.createElement('textarea');
                output.dataset.diagnosticSummary='';history.style.cssText='white-space:pre-wrap;max-height:120px;overflow:auto;font-size:11px';fallback.hidden=true;fallback.readOnly=true;fallback.setAttribute('aria-label','手动复制诊断报告');fallback.style.width='100%';
                const refresh=()=>{
                    const report=this._diagnosticReport(),tasks=report.inventory;
                    const labels={WAITING_MANUAL_TASKS:'等待人工处理',BLOCKED:'安全阻断',PAUSED_AUTOMATION:'已暂停',PLAYING:'运行中',READING_DOCUMENT:'运行中',FINISHED:'已结束'};
                    const deferred=tasks?.filter(t=>t.classification.startsWith('DEFERRED'));
                    output.textContent=`状态：${labels[report.state]||'检测中'}；本地已处理：${tasks?tasks.filter(t=>t.locallyProcessed).length:'未知'}；未解决：${deferred?deferred.length:'未知'}；整课平台信用：${report.platformCredit?'已观察确认':'未确认'}。`+
                        (report.currentBlock?'当前安全阻断：'+report.currentBlock.reason+'（课节级，附件身份未确认）。':'')+
                        (tasks?deferred.map(t=>`${t.ordinal}.${t.kind}：${t.reason==='isolated-unknown'?'独立未知附件，需人工处理':'已识别，缺少执行证据'}`).join('；'):'等待重新检测；不能从历史日志恢复完成状态');
                    if(details.open)history.textContent=report.events.slice(-8).map(e=>`${e.type} · ${e.ordinal===null?'课节':e.ordinal+1}.${e.kind} · ${e.reason}`).join('\n')||'暂无记录';
                };
                for(const [action,label]of [['copy','复制诊断报告'],['clear','清除诊断历史'],['recheck','重新核对当前小节']]){
                    const button=document.createElement('button');button.type='button';button.dataset.diagnosticAction=action;button.textContent=label;
                    button.onclick=async event=>{
                        if(!event.isTrusted)return;
                        if(action==='clear'){status.textContent=this._decisionJournal?.clear()?'诊断历史已清除；任务状态保持不变':'清除失败';refresh();return;}
                        if(action==='recheck'){this.recheckCurrentLesson();refresh();return;}
                        const text=JSON.stringify(this._diagnosticReport(),null,2);
                        try{await window.navigator.clipboard.writeText(text);status.textContent='已复制脱敏诊断报告';fallback.hidden=true;}
                        catch(_){fallback.value=text;fallback.hidden=false;fallback.focus();fallback.select();status.textContent='剪贴板不可用，请选中下方报告手动复制';}
                    };details.append(button);
                }
                details.append(output,history,status,fallback);details.addEventListener('toggle',refresh);section.append(details);this._refreshDiagnostics=refresh;refresh();
            },
            _appendTaskControls(section) {
                const details = document.createElement('details'); details.dataset.taskControls = '';
                details.innerHTML = '<summary>当前小节 · 检测与手动执行</summary><label>任务类型 <select data-task-type><option value="video">视频</option><option value="audio">音频</option><option value="document">文档</option><option value="live">直播 / 回放</option><option value="completed">已完成小节 / 安全前进</option></select></label><p data-auto-setting></p><p data-detected>自动检测：等待检测</p><p data-task-status></p><button data-inspect>检测</button> <button data-attempt>尝试执行</button> <button data-stop-task>停止自动操作</button>';
                const select = details.querySelector('select'); select.value = this._selectedTask || 'video';
                details.open = !!this._taskControlsOpen;
                details.addEventListener('toggle', () => { this._taskControlsOpen = details.open; });
                const describe = () => {
                    this._selectedTask = select.value;
                    const feature = { video: 'videoPlayback', audio: 'audioPlayback', document: 'document', live: 'live', completed: 'nextLesson' }[select.value];
                    details.querySelector('[data-auto-setting]').textContent = select.value === 'completed' ?
                        `自动前进使用上方下一小节（${this.settings.features.nextLesson ? '开' : '关'}）/ 下一章节（${this.settings.features.nextChapter ? '开' : '关'}）开关` :
                        `自动执行：${this.settings.features[feature] ? '已启用' : '已关闭'}（使用上方对应功能开关；手动尝试仅执行本次）`;
                };
                select.onchange = describe; describe();
                details.querySelector('[data-inspect]').onclick = () => {
                    const info = this._inspectTask();
                    const inventory = info.media?.tasks || [];
                    details.querySelector('[data-task-status]').textContent = inventory.length ? `附件 ${inventory.length} 项：` + inventory.map((task,i) => `${i+1}.${task.kind}：${task.status || 'unknown'}（唯一任务包装标记或本次自然结束；未知按顺序处理）`).join('；') : '未发现可验证的附件级完成信号';
                    details.querySelector('[data-detected]').textContent = `自动检测：${info.blocked ? info.reason : ({ video:'视频',audio:'音频',document:'文档',live:'直播 / 回放' }[info.kind] || '未识别')}${info.completed ? '；平台已有完成标记' : ''}`;
                };
                details.querySelector('[data-attempt]').onclick = event => { if (event.isTrusted) this._attemptTask(select.value); };
                details.querySelector('[data-stop-task]').onclick = () => { this._recovery?.markExplicitStop(); this.stopAutomation(); };
                section.prepend(details);
                details.querySelector('[data-task-status]').textContent = this._lastNotice || '尚未手动执行';
            },
            _attemptTask(kind) {
                if (this._destroyed) return;
                if (kind === 'live' && gmLive?.retryBlocked(this)) { this._notify('回放子页仍在线或正在确认配对，不能重复打开'); return; }
                if (this._manualBusy || this._isPlaying || ['READING_DOCUMENT','WAITING_CATALOG','ADVANCING'].includes(this._state) || (this._state === 'WAITING_LIVE' && this._liveController)) {
                    this._notify('已有任务正在执行；请先停止自动操作再重试', '安全阻断'); return;
                }
                // A deliberate retry cancels the old generation and rebuilds the
                // inventory; stale discovery caches must not make BLOCKED permanent.
                this._cancelTasks(); this._detachVideoEvents(); this._attachmentSnapshot = null;
                this._state = 'PAUSED_AUTOMATION';
                const info = this._inspectTask();
                if (info.blocked) { this._notify(info.reason, '安全阻断'); return; }
                if ((kind === 'completed' && !info.completed) || (kind !== 'completed' && info.kind !== kind)) {
                    this._notify(kind === 'live' ? '未找到可识别的直播入口；文字标签不足以确认可点击目标' : kind === 'document' ?
                        '未识别到此类型：缺少有归属的文档附件与可验证阅读区域；不会滚动外层网页' : '未识别到此类型；不会改为执行其他任务', '未识别到此类型'); return;
                }
                this._videoEl = null; this._videoContext = null;
                this._externalCompletion = null; this._completionNode = null; this._completionVideo = null;
                this._nextUnitPending = false; this._playPending = false; this._tryTimes = 0;
                this._state = 'READY'; this._manualBusy = true; this._manualPermit = kind; this._automaticStartup = false;
                this._initCellData(); this._notify('已识别，尝试执行所选任务', '已识别，尝试执行');
                if (kind === 'completed') { this._priorChecked = null; if (!this._checkPriorCompletion()) this._block(this._priorFailure || '当前目录身份或平台完成证据尚未稳定，不能安全前进'); }
                else if (kind === 'live' && (info.task?.nativeLink || info.task?.nativeEntry)) this._openNativeLink(info.task, info.scope, true);
                else this.play();
            },
            _openNativeLink(task, scope, manual) {
                const media = this._playableMedia();
                if (!scope.validateScope() || (media.unsupported && !media.localExecutionEligible) || media.inaccessible || media.videos.length || this._verificationPresent()) return this._block('直播入口与任务范围不一致');
                this._state = 'WAITING_LIVE'; this._isPlaying = false;
                this._detectedKind = '直播 / 回放';
                if (gmLive && !gmLive.begin(this, task, scope, manual)) return;
                if (!manual) {
                    this._nativeOpenAttempts ||= new WeakSet();
                    if (gmLive || !this._nativeOpenAttempts.has(task.element)) { this._nativeOpenAttempts.add(task.element); task.element.click(); }
                    this._manualBusy = false;
                    this._notify(gmLive ? gmLive.openingNotice() : '已识别原生直播卡片并请求打开；弹窗结果未验证。如未打开，请点击尝试执行；本环境需手动返回核对信用', '已识别，等待就绪'); return;
                }
                this._manualBusy = true;
                task.element.click(); // Native handler/target/URL remain untouched; no unowned window.close().
                this._notify(gmLive ? '已通过用户操作请求打开，等待 GM 配对；无法确认新窗口或弹窗是否被拦截' : '已请求平台原生入口打开；无法确认新窗口或弹窗是否被拦截。完成后请手动处理，自动返回保持禁用', '已识别，尝试执行');
            },
            _waitForDocument(task) {
                if (this._documentWaitCancel) return;
                if (task.reason && !task.loading) return this._block(task.reason);
                const node = catalog.current(), id = node?.id, title = this._currentStepTitle(), doc = videoAdapter.cardDocument(), generation = this._generation, href = location.href;
                let timer, attempts = 0, cancelled = false;
                const cancel = () => { cleanup(); this._block('页面变化，文档等待已取消'); };
                const cleanup = () => {
                    cancelled = true; clearTimeout(timer); this._timers.delete(timer);
                    for (const type of ['pagehide','beforeunload','popstate','hashchange']) window.removeEventListener(type, cancel);
                    if (this._documentWaitCancel === cleanup) this._documentWaitCancel = null;
                };
                const tick = () => {
                    this._timers.delete(timer); if (cancelled || generation !== this._generation || this._destroyed) return;
                    if (node !== catalog.current() || node?.id !== id || title !== this._currentStepTitle() || doc !== videoAdapter.cardDocument() || href !== location.href || !task.element.isConnected) { cleanup(); return this._block('文档等待期间任务身份已变化'); }
                    const view = documentViewer(task.element);
                    if (view.viewer) { cleanup(); this._state = 'READY'; this.play(); return; }
                    if (!view.loading || ++attempts >= 20) { cleanup(); return this._block(view.reason || '文档加载失败或格式不受支持'); }
                    timer = setTimeout(tick, 500); this._timers.add(timer);
                };
                this._documentWaitCancel = cleanup; this._state = 'WAITING_DOCUMENT';
                this._detectedKind = '文档';
                for (const type of ['pagehide','beforeunload','popstate','hashchange']) window.addEventListener(type, cancel);
                this._notify('检测到文档任务，正在寻找可滚动阅读区域', '已识别，等待就绪'); tick();
            },
            _clearNavigationPreview() {
                clearInterval(this._previewInterval); this._previewInterval = null;
            },
            _navigationPreview(deadline, within = false) {
                this._clearNavigationPreview();
                const prefix = this._platformCompletion ? '当前小节已经学习完成' : this._externalCompletion?.kind === 'assessment' ? '已确认可安全前往下一学习项（测验保持未完成）' : '当前小节已完成并通过平台验证';
                const tick = () => this._notify(this._pacing?.getStatus().restEndsAt ? this._pacing.statusText() : within ? `${this._pacing.statusText()}，下一内容等待 ${(Math.max(0, deadline - Date.now()) / 1000).toFixed(3)} 秒` : `${prefix}，${(Math.max(0, deadline - Date.now()) / 1000).toFixed(3)} 秒后进入下一节。可点击“停止自动操作”。`, '已完成');
                tick(); this._previewInterval = setInterval(tick, 250);
            },
            _mountSettingsPanel() {
                if (typeof document.createElement !== 'function') return;
                const host = document.createElement('div'); host.id = 'xuexitong-v3-settings';
                host.style.cssText = 'position:fixed;right:8px;top:8px;z-index:2147483647;pointer-events:none';
                const root = host.attachShadow({ mode: 'open' });
                this._settingsPanel = host;
                const render = () => {
                    const previousControls = root.querySelector('[data-task-controls]');
                    if (previousControls) this._taskControlsOpen = previousControls.open;
                    root.innerHTML = '<style>:host{font:12px/1.5 sans-serif;color:#222}details{pointer-events:auto;background:#fff;border:1px solid #aaa;border-radius:6px;box-shadow:0 2px 8px #0002}summary{padding:5px 9px;cursor:pointer}section{width:264px;max-height:65vh;overflow:auto;padding:8px;box-sizing:border-box}label{display:block;margin:3px 0}input[type=number]{width:65px;font:inherit}fieldset{margin:5px 0;padding:4px;border:1px solid #ddd}button,select{font:inherit}p{margin:5px 0}</style><details><summary>学习设置</summary><section><label><input type="checkbox" data-global>短随机延迟（不控制周期休息）</label><label>预设 <select data-preset><option value="short">短延迟</option><option value="legacy">旧版长延迟</option><option value="custom">自定义</option></select></label><fieldset data-rest><legend>周期休息（独立开关）</legend></fieldset><div data-features></div><div data-delays></div><button type="button" data-reset>恢复默认</button> <button type="button" data-clear-pacing>清理本课程节奏记录</button><p>修改范围下次生效；切换开关取消当前动作，重新检测后继续。活动休息不重抽；关闭休息后重新检测可继续。</p><p>文档、直播仍需已验证适配器。更改设置不会重启已完成任务。</p><p role="status" data-status></p></section></details>';
                    root.querySelector('details').open = !this.settings.collapsed;
                    root.querySelector('[data-global]').checked = this.settings.randomDelaysEnabled;
                    root.querySelector('[data-preset]').value = this.settings.preset;
                    for (const [key, label] of Object.entries({ enabled:'启用周期休息', taskTargetMin:'任务数最小', taskTargetMax:'任务数最大', restMinMs:'休息最小毫秒', restMaxMs:'休息最大毫秒' })) {
                        const row = document.createElement('label'), input = document.createElement('input');
                        input.dataset.rest = key; input.type = key === 'enabled' ? 'checkbox' : 'number'; input.step = '1'; input.min = '1';
                        if (key === 'enabled') input.checked = this.settings.rest.enabled; else input.value = this.settings.rest[key];
                        row.append(label, input); root.querySelector('[data-rest]').append(row);
                    }
                    for (const [key, label] of Object.entries(FEATURES)) {
                        const row = document.createElement('label'); const input = document.createElement('input');
                        input.type = 'checkbox'; input.dataset.feature = key; input.checked = this.settings.features[key];
                        row.append(input, label); root.querySelector('[data-features]').append(row);
                    }
                    for (const [key, [label]] of Object.entries(ACTIONS)) {
                        if (['nextVideo','nextAudio','nextDocument','assessment','liveReturn'].includes(key)) continue;
                        const row = document.createElement('fieldset'); row.dataset.category = key;
                        const legend = document.createElement('legend'); const check = document.createElement('input');
                        check.type = 'checkbox'; check.dataset.enable = key; check.checked = this.settings.delays[key].enabled; legend.append(check, label); row.append(legend);
                        for (const [bound, text] of [['minMs', '最小'], ['maxMs', '最大']]) {
                            const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = '2147483647'; input.step = '1';
                            input.dataset.category = key; input.dataset.bound = bound; input.value = this.settings.delays[key][bound]; input.setAttribute('aria-label', `${label}${text}毫秒`);
                            row.append(text, input);
                        }
                        row.append(' ms'); root.querySelector('[data-delays]').append(row);
                    }
                    root.querySelector('[data-status]').textContent = this._settingsMessage || '设置仅存本机；节奏记录使用课程与附件标识，不保存账号或媒体链接';
                    this._appendTaskControls(root.querySelector('section'));
                    this._appendDiagnostics(root.querySelector('section'));
                    root.querySelector('details').addEventListener('toggle', event => {
                        this.settings.collapsed = !event.target.open;
                        try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(validateSettings(this.settings))); } catch (_) { /* Page-only settings remain usable. */ }
                    });
                };
                const change = event => {
                    const input = event.target, next = JSON.parse(JSON.stringify(this.settings));
                    if (input.hasAttribute('data-task-type')) return;
                    if (input.dataset.rest) next.rest[input.dataset.rest] = input.dataset.rest === 'enabled' ? input.checked : input.value.trim() === '' ? NaN : Number(input.value);
                    else if (input.dataset.feature) next.features[input.dataset.feature] = input.checked;
                    else if (input.hasAttribute('data-global')) next.randomDelaysEnabled = input.checked;
                    else if (input.hasAttribute('data-preset')) {
                        if (input.value !== 'custom') next.delays = defaultSettings(input.value).delays;
                        next.preset = input.value;
                    } else if (input.dataset.enable) next.delays[input.dataset.enable].enabled = input.checked;
                    else if (input.dataset.bound) {
                        next.delays[input.dataset.category][input.dataset.bound] = input.value.trim() === '' ? NaN : Number(input.value); next.preset = 'custom';
                    }
                    if (!this.updateSettings(next)) root.querySelector('[data-status]').textContent = this._settingsMessage;
                };
                root.addEventListener('change', change);
                root.addEventListener('click', event => { if (event.target.hasAttribute('data-clear-pacing')) { this.stopAutomation(); this._pacing.clearHistory(); this._notify('本课程节奏记录已清理，请明确重新检测'); } if (event.target.hasAttribute('data-reset')) { this.updateSettings(defaultSettings()); render(); } });
                this._settingsStorage = event => { if (event.key === SETTINGS_KEY) { this.updateSettings(loadSettings(window), false); render(); } };
                window.addEventListener('storage', this._settingsStorage);
                this._renderSettings = render;
                render(); document.body.append(host);
            },
            taskAdapter: null, // Explicit adapters override the built-in native-entry/manual-handoff profile.
            _processedTasks: new WeakSet(),
            _chapterOf(node) {
                for (let el = node; el; el = el.parentElement) {
                    if (el.matches?.('#coursetree > ul > li')) return el;
                }
                return null;
            },
            _nodeTitle(node) {
                return node?.querySelector('.posCatalog_name')?.getAttribute('title') || node?.textContent.trim() || '';
            },
            _verificationPresent() {
                const visit = (doc, depth) => {
                    if (!doc || depth > 4) return true;
                    const visible = el => el.getClientRects().length && !el.closest('[hidden], [inert], [aria-hidden="true"]');
                    for (const el of doc.querySelectorAll('input[type=password], input[autocomplete="one-time-code"], form, button, [role=button]')) {
                        if (!visible(el)) continue;
                        if (el.matches('input[type=password], input[autocomplete="one-time-code"]') ||
                            (el.matches('form') && el.querySelector('input') && /验证码|captcha|人脸识别|身份验证/i.test(el.textContent)) ||
                            (el.matches('button,[role=button]') && /^(开始人脸识别|进行身份验证|人脸认证)$/.test(el.textContent.trim()))) return true;
                    }
                    for (const frame of doc.querySelectorAll('iframe')) {
                        try { if (visit(frame.contentDocument, depth + 1)) return true; } catch (_) { return true; }
                    }
                    return false;
                };
                return visit(videoAdapter.cardDocument(), 0);
            },
            _assessmentTarget(node) {
                if (this._verificationPresent()) return null;
                const entries = catalog.entries();
                let index = entries.indexOf(node);
                if (index < 0 || !this._chapterOf(node) || !optionalAssessment(this._nodeTitle(node))) return null;
                // Defer consecutive known assessments, never skip another learning leaf.
                while (index < entries.length && optionalAssessment(this._nodeTitle(entries[index]))) {
                    if (entries[index].closest('[aria-disabled="true"], [disabled]')) return null;
                    index++;
                }
                const target = entries[index], title = target && this._nodeTitle(target);
                return target && target.isConnected && this._chapterOf(target) && title &&
                    !assessmentTitle(title) && !verificationTitle(title) &&
                    !/锁定|未解锁|不可访问/.test(target.textContent) &&
                    !target.closest('[aria-disabled="true"], [disabled]') ? target : null;
            },
            _targetAfter(node) {
                const entries = catalog.entries();
                const next = entries[entries.indexOf(node) + 1];
                if (!next) return undefined;
                if (verificationTitle(this._nodeTitle(next))) return null;
                if (!assessmentTitle(this._nodeTitle(next))) return next;
                return this._assessmentTarget(next);
            },
            _taskSet() {
                try {
                    const scope = (this.taskAdapter || platformTaskAdapter).discover({ node: catalog.current(), document: videoAdapter.cardDocument() });
                    if (!scope) return null;
                    if (!Array.isArray(scope.tasks) || typeof scope.validateScope !== 'function' || !scope.validateScope()) return { invalid: true };
                    const belongs = element => {
                        if (!element?.isConnected) return false;
                        let doc = element.ownerDocument;
                        const content = videoAdapter.cardDocument();
                        for (let depth = 0; doc && depth <= 4; depth++) {
                            if (doc === content) return true;
                            try { doc = doc.defaultView?.frameElement?.ownerDocument; } catch (_) { return false; }
                        }
                        return false;
                    };
                    if (!scope.tasks.every(task => ['document', 'live'].includes(task.kind) && belongs(task.element))) return { invalid: true };
                    return scope;
                } catch (_) { return { invalid: true }; }
            },
            _attachmentCredit(player) {
                if (!player?.isConnected) return 'unknown';
                let doc = player.ownerDocument, owner;
                const root = videoAdapter.cardDocument();
                for (let depth=0; doc && doc !== root && depth<4; depth++) {
                    owner = doc.defaultView?.frameElement;
                    if (!owner || owner.contentDocument !== doc) return 'unknown';
                    if (owner.ownerDocument === root) break;
                    doc = owner.ownerDocument;
                }
                if (!owner?.matches('iframe.ans-attach-online.ans-insertvideo-online')) return 'unknown';
                const wrapper = owner.closest('.ans-attach-ct');
                const icons = wrapper && [...wrapper.querySelectorAll('.ans-job-icon')].filter(icon => icon.closest('.ans-attach-ct') === wrapper);
                if (!wrapper || wrapper.querySelectorAll('iframe.ans-attach-online').length !== 1 || icons.length !== 1 ||
                    !(wrapper.classList.contains('ans-job-finished') || icons[0].classList.contains('ans-job-finished'))) return 'unknown';
                this._creditSamples ||= new WeakMap();
                const previous = this._creditSamples.get(player);
                this._creditSamples.set(player, { wrapper, icon: icons[0], owner });
                return previous?.wrapper === wrapper && previous.icon === icons[0] && previous.owner === owner ? 'platform-completed' : 'unknown';
            },
            _mediaDone(player) {
                return this._completedVideos.has(player) || this._attachmentCredit(player) === 'platform-completed';
            },
            _discoverMedia() {
                const scope = this._taskSet();
                if (scope?.invalid) return { videos: [], documents: [], unsupported: true, inaccessible: false };
                const media = videoAdapter.discover(new Set(scope?.tasks.filter(task => task.kind === 'live').map(task => task.element.ownerDocument) || []), scope?.mediaOwnership);
                if (media.tasks) {
                    const snapshot = this._attachmentSnapshot;
                    if (snapshot && (snapshot.root !== media.tasks[0]?.lesson.root || snapshot.id !== catalog.current()?.id ||
                        snapshot.tasks.length !== media.tasks.length || snapshot.tasks.some((task, i) => task.kind !== media.tasks[i].kind || task.attachment !== media.tasks[i].attachment ||
                            task.element !== media.tasks[i].element || task.documents.some((doc, j) => doc !== media.tasks[i].documents[j]) ||
                            task.documents.length !== media.tasks[i].documents.length))) {
                        media.unsupported = true; media.reasons.push('attachment-inventory-changed');
                    }
                    if (!snapshot && !media.pending && !media.unsupported && !media.inaccessible) this._attachmentSnapshot = {
                        root: media.tasks[0]?.lesson.root, id: catalog.current()?.id, tasks: media.tasks };
                    for (const task of media.tasks) {
                        // Execution readiness is not platform-completion evidence.
                        task.platformCredit = this._attachmentCredit(task.element);
                        task.status = this._completedVideos.has(task.element) ? 'locally-ended' :
                            task.platformCredit === 'platform-completed' ? 'platform-completed' : 'pending';
                    }
                }
                return media;
            },
            _partialEvent(type, task, reason, required = false) {
                const journal=this._decisionJournal, session=this._partialSession;
                if(!journal||!session)return !required;
                const result=journal.append({lesson:session.reference,ordinal:task?.ordinal||0,type,kind:task?.kind||'unknown',reason,evidence:type==='TASK_LOCAL_COMPLETED'?'local-operation':type==='TASK_PLATFORM_CREDITED'?'platform-marker':'owned-inventory'});
                return result.durable || !required;
            },
            _partialSelect(media) {
                let session=this._partialSession;
                if(!session && !this._partialSuspended && !this._destroyed && !this._priorProof(catalog.current())){
                    const plan=this._planningSnapshot();
                    if(plan.globalSafety==='VERIFIED_PLANNING_ONLY'&&plan.validateScope()&&plan.tasks.some(t=>t.classification.startsWith('DEFERRED'))){
                        if(plan.tasks.some(t=>t.classification==='LOADING'))return {loading:true};
                        try { sessionStorage.setItem('xuexitong.v3.partial-pause.v1',JSON.stringify([plan.lesson.course,plan.lesson.id])); } catch (_) { return {invalid:true}; }
                        session=this._partialSession={plan,href:location.href,topology:this._catalogTopology(),credited:new Set(),started:new Set(),decisions:new Set(),reference:this._decisionJournal?.reference(catalog.current()),selected:null};
                        this._partialEvent('INVENTORY_CONFIRMED',null,'known-owned');
                        for(const task of plan.tasks)this._partialEvent('TASK_RECOGNIZED',task,task.kind==='unknown'?'isolated-unknown':'known-owned');
                    }
                }
                if(!session)return null;
                if(!session.plan.validateScope()){this._partialEvent('CONTEXT_INVALIDATED',null,'context-changed');return {invalid:true};}
                for(const task of session.plan.tasks){
                    if(task.classification.startsWith('DEFERRED')){
                        if(!session.decisions.has(task.ordinal)){
                            if(!this._partialEvent('TASK_DEFERRED',task,task.kind==='unknown'?'isolated-unknown':'recognition-only',true))return {invalid:true};
                            session.decisions.add(task.ordinal);this._partialEvent('EXECUTION_CONTINUED',task,'known-owned');
                        }
                        continue;
                    }
                    if(task.classification!=='EXECUTABLE_KNOWN')return {invalid:true};
                    const original=media.tasks?.find(t=>t.attachment===task.owner);
                    const done=task.kind==='document'?this._processedTasks.has(task.owner):original?.element&&this._mediaDone(original.element);
                    if(done&&original?.element&&!this._completedVideos.has(original.element)&&!session.credited.has(task.ordinal)){session.credited.add(task.ordinal);this._partialEvent('TASK_PLATFORM_CREDITED',task,'known-owned');}
                    if(!done){session.selected=task;return {task,original};}
                }
                session.selected=null;return {waiting:true};
            },
            _waitPartialTasks() {
                if(!this._partialSession)return false;
                const media=this._discoverMedia(),choice=this._partialSelect(media);
                if(choice?.invalid){this._block('部分执行归属或日志持久化失效');return true;}
                if(!choice?.waiting)return false;
                this._state='WAITING_MANUAL_TASKS';this._isPlaying=false;this._clearCheckInterval();this._recovery?.cancel('manual-wait');
                this._partialEvent('LESSON_WAITING_MANUAL',null,'recognition-only');
                const tasks=this._partialSession.plan.tasks.filter(t=>t.classification.startsWith('DEFERRED'));
                this._notify(`尚有 ${tasks.length} 项需人工处理：`+tasks.map(t=>`${t.ordinal+1}.${t.kind}`).join('、'));return true;
            },
            recheckCurrentLesson() {
                const old=this._partialSession,node=catalog.current(),course=pacingCourse(window),doc=videoAdapter.cardDocument(),topology=this._catalogTopology();
                let saved;try{saved=JSON.parse(sessionStorage.getItem('xuexitong.v3.partial-pause.v1')||'null');}catch(_){return this._block('人工复核暂停记录无效');}
                const identity=old?.plan.lesson;
                if(!course||!node?.id||!node.isConnected||!doc||!topology||[...document.querySelectorAll('[id]')].filter(el=>el.id===node.id).length!==1||
                    (identity&&(identity.course!==course||identity.id!==node.id||identity.title!==this._nodeTitle(node)||old.topology!==topology||old.href!==location.href||old.plan.frame!==videoAdapter.cardFrame()||old.plan.document!==doc))||
                    (saved&&(!Array.isArray(saved)||saved.length!==2||saved[0]!==course||saved[1]!==node.id)))return this._block('人工复核课程身份或安全条件无法确认');
                const credited=this._priorProof(node);
                if(credited){
                    const record={node,doc,id:node.id,topology,chapter:this._chapterOf(node),generation:this._generation,href:location.href,title:this._currentStepTitle(),name:this._nodeTitle(node)};
                    const media=videoAdapter.discover();
                    if(media.documents.some(d=>[...d.querySelectorAll('video,audio')].some(el=>!el.paused&&!el.ended||el.seeking))||!this._priorCompletionValid(record))return this._block('整课信用存在，但当前安全或身份验证未通过');
                }else{
                    const fresh=this._planningSnapshot();
                    // Missing owners never establish completion or authorize execution.
                    if(fresh.globalSafety!=='VERIFIED_PLANNING_ONLY'||!fresh.validateScope()){
                        this._cancelTasks();this._detachVideoEvents();this._partialSession=null;this._partialSuspended=true;this._state='WAITING_MANUAL_TASKS';this._notify('附件范围尚不可验证，且平台未确认整课完成；保持人工等待');return;
                    }
                }
                this._partialEvent('MANUAL_RECHECK',null,'context-changed');
                this._cancelTasks();this._detachVideoEvents();this._partialSession=null;this._partialSuspended=true;
                if(!credited){this._state='WAITING_MANUAL_TASKS';this._notify('附件已重新发现，但平台尚未确认整课完成；保持人工等待，不重放历史任务');return;}
                sessionStorage.removeItem('xuexitong.v3.partial-pause.v1');this._recovery?.resumeExplicitly();this.run({startup:true});
            },
            _playableMedia() {
                let media = this._discoverMedia();
                const choice=this._partialSelect(media);
                if(choice&&!choice.invalid){const known=media.tasks?.filter(t=>['video','audio','document'].includes(t.kind))||[];media={...media,tasks:known,localExecutionEligible:!!choice.task||!!choice.waiting,localReadinessEligible:!!choice.loading,partialWaiting:!!choice.waiting};}
                // The public inventory retains videos/audio separately; the existing
                // completion/recovery coordinator consumes one selected native media list.
                const players = media.tasks ? media.tasks.filter(task => ['video', 'audio'].includes(task.kind) && task.element).map(task => task.element) : [...media.videos, ...(media.audios || [])];
                return { ...media, videos: players };
            },
            _pacedIdentity(element, kind) {
                const session=this._partialSession;
                if(session?.plan.validateScope()){
                    const task=session.plan.tasks.find(t=>t.kind===kind&&(t.owner===element||t.target===element));
                    if(task&&task.classification==='EXECUTABLE_KNOWN')return {course:session.plan.lesson.course,lesson:session.plan.lesson.id,kind,inventory:session.plan.tasks.map(t=>t.kind).join(','),ordinal:task.ordinal};
                }
                const node = catalog.current();
                const course = pacingCourse(window);
                if (!course || !node?.id || [...document.querySelectorAll('[id]')].filter(el => el.id === node.id).length !== 1) return null;
                const media = this._discoverMedia();
                if ((media.unsupported && !media.localExecutionEligible) || media.inaccessible || media.pending) return null;
                const items = media.tasks?.length ? media.tasks.map(t => ({ kind: t.kind, element: t.element, attachment: t.attachment })) :
                    [...(media.videos || []).map(element => ({ kind: 'video', element })), ...(media.audios || []).map(element => ({ kind: 'audio', element })),
                    ...(this._taskSet()?.tasks || [])];
                const indexes = items.map((t,i) => (t.element === element || t.attachment === element) && t.kind === kind ? i : -1).filter(i => i >= 0);
                if (indexes.length !== 1) return null;
                return { course, lesson: node.id, kind, inventory: items.map(t => t.kind).join(','), ordinal: indexes[0] };
            },
            _recordPacedCompletion(element, kind, evidence) {
                if(this._partialSession)this._partialEvent('TASK_LOCAL_COMPLETED',this._partialSession.plan.tasks.find(t=>t.owner===element||t.target===element),'known-owned');
                const id = this._pacedIdentity(element, kind);
                if (!id) { this._notify('内容已完成，但缺少稳定附件身份，未计入休息任务数'); return; }
                this._pacing.recordCompletion(id, evidence);
            },
            _recordPacedLive(r) {
                // Called only by the parent's positive platform-credit branch, never by child messages.
                const node = catalog.current(), course = pacingCourse(window);
                const scope = platformLiveEntry.discover({ document: videoAdapter.cardDocument() });
                if (!course || course !== r.ids?.course || !node?.id || node.id !== r.lesson ||
                    [...document.querySelectorAll('[id]')].filter(el => el.id === node.id).length !== 1 ||
                    !scope?.validateScope() || scope.tasks.length !== 1 || scope.tasks[0].kind !== 'live' || !scope.tasks[0].nativeEntry) {
                    this._notify('回放已核实平台完成，但直播内容身份不唯一，未计入休息任务数'); return false;
                }
                // Earlier pacing versions stored execution IDs. A previously counted live item
                // in this now-verified single-card lesson must not be counted again after upgrade.
                if (this._pacing.getStatus().ledger.some(raw => {
                    const old = JSON.parse(raw);
                    return old.course === course && old.lesson === node.id && old.kind === 'live' && typeof old.session === 'string';
                })) return false;
                return this._pacing.recordCompletion({ course, lesson: node.id, kind: 'live', inventory: 'live', ordinal: 0 }, 'platform-live-ended');
            },
            _paceContent(element, kind, resume) {
                if (!this._pacing) return false;
                const identity = this._pacedIdentity(element, kind), lesson = catalog.current()?.id;
                const id = identity && JSON.stringify(identity);
                if (!this._pacing.needsContent(lesson, id)) return false;
                if (['video','audio'].includes(kind) && !element.paused && !element.ended) { this._notify('平台已自行播放当前内容，脚本未对本次切换实施等待；保留后续休息状态'); return false; }
                if (!identity) { this._block('切换内容缺少稳定附件身份，不能安全恢复节奏'); return true; }
                const boundary = 'content:' + id + ':' + (this._pacing.getStatus().last?.id || '');
                if (this._pacedReady === boundary && !this._pacing.getStatus().restEndsAt && !(this.settings.rest.enabled && this._pacing.getStatus().count >= this._pacing.getStatus().target)) return false;
                this._state = 'ACTION_PENDING';
                this._runAction('nextContent', 'content-pacing', () => { this._pacedReady = boundary; resume(); }, {
                    pacingBoundary: boundary,
                    isValid: () => element.isConnected && JSON.stringify(this._pacedIdentity(element, kind)) === id,
                    onScheduled: action => this._navigationPreview(action.deadline, true),
                });
                return true;
            },
            _mediaAction(element, next = false) {
                return element?.tagName === 'AUDIO' ? (next ? 'nextAudio' : 'audioStart') : (next ? 'nextVideo' : 'videoStart');
            },
            _documentContextValid(record) {
                if (record?.kind !== 'document' || !record.identity) return false;
                const initial = record.identity, node = catalog.current(), chapter = node && this._chapterOf(node);
                const unique = id => id && [...document.querySelectorAll('[id]')].filter(el => el.id === id).length === 1;
                if (this._destroyed || record.generation !== this._generation || record.href !== location.href ||
                    record.document !== videoAdapter.cardDocument() || record.title !== this._currentStepTitle() ||
                    record.adapter !== this.taskAdapter || !node || node.id !== initial.id || !unique(initial.id) ||
                    this._nodeTitle(node) !== initial.name || this._catalogTopology() !== initial.topology ||
                    !chapter || (initial.chapterId && (chapter.id !== initial.chapterId || !unique(initial.chapterId))) ||
                    (chapter !== initial.chapter && initial.chapter.isConnected)) return false;
                if (node !== record.node && record.node.isConnected) return false;
                const fresh = this._taskSet();
                if (!fresh || fresh.invalid || fresh.tasks.length !== initial.tasks.length || !fresh.validateScope() ||
                    !fresh.tasks.every((task,i) => task.kind === initial.tasks[i].kind && task.element === initial.tasks[i].element &&
                        task.element.isConnected && task.viewer === initial.tasks[i].viewer)) return false;
                if (this._verificationPresent()) return false;
                const old = record.node;
                record.scope = fresh; record.node = node; initial.nodes.add(node);
                if (this._completionNode === old) this._completionNode = node;
                return true;
            },
            _sameTaskNode(node) {
                const record = this._externalCompletion;
                if (record?.kind === 'document' && record.identity?.nodes.has(node)) return this._documentContextValid(record);
                return this._sameVideoTaskNode(node);
            },
            _taskContextValid(record) {
                if (record?.kind === 'document' && record.identity) return this._documentContextValid(record);
                try {
                    return !this._destroyed && record.href === window.location.href && record.generation === this._generation &&
                        record.node === catalog.current() && record.title === this._currentStepTitle() &&
                        record.document === videoAdapter.cardDocument() && this.taskAdapter === record.adapter &&
                        record.scope.validateScope() && record.scope.tasks.every(task => task.element.isConnected);
                } catch (_) { return false; }
            },
            _processSupportedTask() {
                if(this._waitPartialTasks())return true;
                if (this._isPlaying) return false;
                const inventory = this._discoverAttachmentTask();
                if (inventory === true) return true;
                if (['video','audio'].includes(inventory?.kind)) return false;
                const scope = this._taskSet();
                if (!scope) return false;
                if (scope.invalid) { this._block('任务范围无效：入口不唯一、框架归属变化或卡片已替换'); return true; }
                if (this._verificationPresent()) { this._block('检测到活动登录、验证码或身份验证控件'); return true; }
                const pending = scope.tasks.find(task => !this._processedTasks.has(task.element));
                if (!pending) {
                    if (!scope.tasks.length) return false;
                    const media = this._playableMedia();
                    if (media.videos.some(video => !this._mediaDone(video))) return false;
                    this._verifyExternal(0); return true;
                }
                this._detectedKind = pending.kind === 'document' ? '文档' : '直播 / 回放';
                if (!this.settings.features[pending.kind === 'document' ? 'document' : 'live'] && this._manualPermit !== pending.kind) { this._state = 'PAUSED_AUTOMATION'; this._notify('已识别任务，对应自动执行已关闭'); return true; }
                if (pending.platformDocument && !pending.viewer) { this._waitForDocument(pending); return true; }
                if (this._paceContent(pending.element, pending.kind, () => this._processSupportedTask())) return true;
                if (pending.nativeLink || pending.nativeEntry) { this._openNativeLink(pending, scope, this._manualPermit === 'live'); return true; }
                this._cancelTasks();
                this._detachVideoEvents();
                this._videoEl = null;
                this._isPlaying = false;
                this._playStepTitle = this._currentStepTitle();
                const record = { node: catalog.current(), title: this._playStepTitle,
                    generation: this._generation, href: window.location.href, document: videoAdapter.cardDocument(), adapter: this.taskAdapter, scope,
                    kind: pending.kind, localDone: false };
                if (record.kind === 'document' && record.node) {
                    const chapter = this._chapterOf(record.node);
                    record.identity = { id: record.node.id, name: this._nodeTitle(record.node), chapter, chapterId: chapter?.id || '',
                        topology: this._catalogTopology(), nodes: new WeakSet([record.node]),
                        tasks: scope.tasks.map(task => ({ kind: task.kind, element: task.element, viewer: task.viewer })) };
                }
                this._completionNode = record.node;
                this._completionVideo = null;
                this._externalCompletion = record;
                if (!record.node || !record.document) { this._block('无法识别任务上下文'); return true; }
                const completed = result => {
                    if (!this._taskContextValid(record)) return this._block('任务完成回调已失效');
                    this._documentController = null;
                    this._liveController = null;
                    this._recovery?.confirmProgress();
                    this._processedTasks.add(pending.element);
                    this._lastProcessedKind = pending.kind;
                    record.localDone = true; record.result = result;
                    if (pending.kind === 'document') this._recordPacedCompletion(pending.element, 'document', 'verified-bottom');
                    this._manualPermit = null; this._manualBusy = false;
                    this._notify(record.kind === 'document' ? '文档本地阅读已完成，正在核对平台完成标记' : '直播会话已结束，正在核对平台完成标记', '已完成');
                    console.log(record.kind === 'document' ? '文档已到可验证底部，仅记为本地操作完成。' : '直播窗口已关闭；本地结束信号不代表平台已计入完成。');
                    this._verifyExternal(0);
                };
                const failed = reason => {
                    if (pending.nativeEntry) {
                        this._settingsMessage = reason;
                        this._renderSettings?.();
                        const summary = this._settingsPanel?.shadowRoot?.querySelector('summary');
                        if (summary) summary.textContent = '学习设置 · 直播需手动处理';
                    }
                    this._block(pending.kind === 'document' ? `文档读取失败：${reason}` : reason);
                };
                if (pending.kind === 'document') {
                    this._state = 'READING_DOCUMENT';
                    if(this._partialSession)this._partialEvent('TASK_STARTED',this._partialSession.selected,'known-owned');
                    const viewport = pending.viewer || pending.element;
                    this._notify(`文档阅读区已确认：页面图元 ${viewport.querySelectorAll('img,canvas').length}，滚动距离 ${viewport.scrollHeight - viewport.clientHeight}px`, '正在执行');
                    try {
                        let first = true;
                        this._documentController = window.__xuexitongTaskSupport.readDocument({ element: pending.viewer || pending.element,
                            scheduleStep: tick => {
                                const category = 'documentScroll'; first = false;
                                return this._runAction(category, 'document-step', tick, { delayMs: 100, defer: true, isValid: () => this._taskContextValid(record) && (pending.viewer || pending.element).clientHeight > 0 });
                            },
                            isValid: () => this._taskContextValid(record) && (!pending.platformDocument || documentViewer(pending.element).viewer === pending.viewer),
                            onProgress: value => { if (value > (record.recoveryProgress || 0) && this._taskContextValid(record)) this._recovery?.confirmProgress(); record.recoveryProgress = value; this._notify(`文档本地阅读 ${value}%（不代表平台已计入完成）`, '正在执行'); },
                            onComplete: () => completed('local-bottom'), onError: failed });
                    } catch (_) { failed('文档视图不支持可验证的滚动'); }
                } else {
                    this._notify('检测到直播回放任务，正在验证入口', '已识别，等待就绪');
                    this._hadLive = true;
                    this._state = 'WAITING_LIVE'; // Set before window.open(), including popup-block failure.
                    try {
                        this._liveController = window.__xuexitongTaskSupport.createParent({ entry: pending.element, nativeEntry: pending.nativeEntry === true,
                            isPlatformComplete: () => this._taskContextValid(record) && catalog.status(record.node) === 'completed',
                            background: this.settings.features.background,
                            generation: record.generation, threshold: this.configs.liveNearEndThreshold,
                            isValid: () => this._state === 'WAITING_LIVE' && this._taskContextValid(record),
                            onResult: completed, onError: failed, scheduleClose: close => this._runAction('liveReturn', 'live-return', () => {
                                this._liveReturnPendingNavigation = true; close();
                            }, { isValid: () => this._taskContextValid(record) && this._state === 'WAITING_LIVE' }) });
                        if (this._liveController.manualOnly) this._liveController.start(); // Safety notice, not an opening action.
                        else this._runAction('liveOpen', 'live-open', () => this._liveController?.start(),
                            { isValid: () => this._taskContextValid(record) && this._state === 'WAITING_LIVE' });
                    } catch (_) { failed('直播入口或通信来源尚不受支持'); }
                }
                return true;
            },
            _classifyAttachmentReadiness(media) {
                if (this._verificationPresent() || media.inaccessible || (media.unsupported && !media.localExecutionEligible) ||
                    media.reasons?.some(reason => reason !== 'player-not-ready')) return 'blocked';
                const root = videoAdapter.cardDocument();
                const scope = platformTaskAdapter.discover({ document: root, node: catalog.current() });
                if (!scope?.validateScope()) return 'ready';
                const documents = scope.tasks.filter(task => task.kind === 'document' && task.platformDocument);
                if (documents.some(task => documentViewer(task.element).loading === true)) return 'loading';
                const loading = root && [...root.querySelectorAll('iframe.ans-attach-online.ans-insertvideo-online, iframe.ans-attach-online.ans-insertaudio')].some(frame => {
                    try { return frame.isConnected && frame.contentDocument && frame.contentDocument.readyState === 'loading'; }
                    catch (_) { return false; }
                });
                return media.pending && loading ? 'loading' : 'ready';
            },
            _waitForAttachmentReadiness() {
                if (this._attachmentReadiness) return;
                const context = { node: catalog.current(), doc: videoAdapter.cardDocument(), href: location.href, chapter: this._chapterOf(catalog.current()), started: Date.now() };
                this._attachmentReadiness = context;
                const tick = () => {
                    if (this._attachmentReadiness !== context) return;
                    if (location.href !== context.href || catalog.current() !== context.node || videoAdapter.cardDocument() !== context.doc || this._chapterOf(catalog.current()) !== context.chapter) return this._block('附件加载等待期间课程身份已变化');
                    const readiness = this._classifyAttachmentReadiness(this._playableMedia());
                    if (readiness === 'blocked') return this._block('附件加载出现不可访问或不支持的任务');
                    if (readiness === 'ready') { this._attachmentReadiness = null; this._state = 'READY'; this.play(); return; }
                    if (Date.now() - context.started >= 10000) return this._block('已知附件加载等待超过10秒，未视为完成');
                    this._schedule(tick, 250);
                };
                this._state = 'WAITING_ATTACHMENT'; this._notify('已知附件正在加载，最多等待10秒'); this._schedule(tick, 250);
            },
            _discoverAttachmentTask() {
                if (this._audioUnresolved && !this._audioFailureScope) {
                    this._audioStopUnresolved('失败音频没有可验证的后续附件范围'); return true;
                }
                const media = this._playableMedia();
                if(media.partialWaiting){this._waitPartialTasks();return true;}
                if (!media.tasks) return null;
                if (this._classifyAttachmentReadiness(media) === 'loading') { this._waitForAttachmentReadiness(); return true; }
                if (media.pending && (!media.unsupported || media.localReadinessEligible) && !media.inaccessible) { this._waitForStartup(); return true; }
                if ((media.unsupported && !media.localExecutionEligible) || media.inaccessible) { this._block((media.tasks?.find(task => task.executable === false)?.reason || '附件清单无法验证') + '：' + (media.reasons || []).filter(code => /^[a-z][a-z0-9-]{0,63}$/.test(code)).slice(0,5).join('、')); return true; }
                const pending = this._audioFailureScope ? this._audioFollowingTask(media) :
                    media.tasks.find(task => task.kind === 'document' ? !this._processedTasks.has(task.attachment) : !this._mediaDone(task.element));
                if (this._audioFailureScope && !pending) return true;
                if (pending?.kind === 'document') {
                    const scope = this._taskSet();
                    if (scope?.tasks.some(task => task.kind === 'document' && task.element === pending.attachment)) return pending;
                    this._block('文档附件已保留，但缺少可验证的阅读视图，需手动处理'); return true;
                }
                // A playing, seeking or already-ended unprocessed sibling is not silently adopted.
                if (media.tasks.some(task => ['video', 'audio'].includes(task.kind) && task !== pending && !this._mediaDone(task.element) &&
                    (!task.element.paused || task.element.seeking || task.element.ended))) {
                    this._block('其他附件播放器正在活动或完成来源不明确'); return true;
                }
                return pending;
            },
            _verifyExternal(attempt) {
                if(this._waitPartialTasks())return;
                const record = this._externalCompletion;
                if (!record?.localDone || !this._taskContextValid(record)) return this._block('本地任务完成上下文无效');
                this._state = 'VERIFYING_COMPLETION';
                const scope = this._taskSet();
                if (!scope || scope.invalid) return this._block('任务范围无法验证');
                const media = this._playableMedia();
                if (media.inaccessible || (media.unsupported && !media.localExecutionEligible) || (media.navigationSafe === false && !media.localExecutionEligible)) return this._block('任务包含未知或不可访问的内容');
                if (scope.tasks.some(task => !this._processedTasks.has(task.element)) ||
                    media.videos.some(video => !this._mediaDone(video))) {
                    this._liveReturnPendingNavigation = false;
                    this._state = 'DISCOVERING'; this.play(); return;
                }
                if ((record.kind === 'document' || this._hadLive || media.videos.length) && catalog.status(record.node) !== 'completed') {
                    if (attempt >= this.configs.maxRetries) return this._block('本地操作已结束，但平台尚未确认完成；不会跳过未完成任务');
                    this._schedule(() => this._verifyExternal(attempt + 1), this.configs.retryInterval); return;
                }
                this._state = 'READY_TO_ADVANCE';
                this.nextUnit();
            },
            _externalNavigationEligible(target) {
                if(this._partialSession)return false;
                const record = this._externalCompletion;
                if (record?.kind === 'document' && !this._taskContextValid(record)) return false;
                if (!record || this._isPlaying || !record.localDone || record.node !== catalog.current() ||
                    record.title !== this._currentStepTitle() || record.href !== window.location.href || record.generation !== this._generation || this._destroyed) return false;
                if (record.kind === 'assessment') return this._assessmentTarget(record.node) === target;
                if (this._isChapterTest() || !this._taskContextValid(record) || this._targetAfter(record.node) !== target) return false;
                const media = this._playableMedia();
                if (media.inaccessible || (media.unsupported && !media.localExecutionEligible) || (media.navigationSafe === false && !media.localExecutionEligible) || record.scope.tasks.some(task => !this._processedTasks.has(task.element))) return false;
                if ((record.kind === 'document' || this._hadLive || media.videos.length) && catalog.status(record.node) !== 'completed') return false;
                return media.videos.every(video => (this._attachmentCredit(video) === 'platform-completed' || (video.ended && this._completedVideos.has(video))));
            },
            _navigationEligible(target) {
                if(this._partialSession)return false;
                if (this._platformCompletion) return this._priorCompletionValid(this._platformCompletion) && this._targetAfter(this._completionNode) === target && !this._isPlaying;
                if (this._externalCompletion) return this._externalNavigationEligible(target);
                if (!this._refreshVideoContext()) return false;
                if (this._destroyed || this._isPlaying || this._isChapterTest() ||
                    catalog.current() !== this._completionNode ||
                    this._currentStepTitle() !== this._playStepTitle ||
                    catalog.status(this._completionNode) !== 'completed' ||
                    !this._completionVideo?.isConnected || !this._completionVideo.ended ||
                    document.querySelectorAll('.prev_list .prev_white').length > 1) return false;
                const entries = catalog.entries();
                const index = entries.indexOf(this._completionNode);
                if (index < 0 || this._targetAfter(this._completionNode) !== target ||
                    assessmentTitle(target?.querySelector('.posCatalog_name')?.getAttribute('title') ||
                        target?.textContent || '')) return false;
                const tasks = this._playableMedia();
                return !tasks.inaccessible && !tasks.unsupported && tasks.navigationSafe !== false &&
                    (!tasks.tasks || tasks.tasks.every(task => ['video', 'audio'].includes(task.kind) && this._mediaDone(task.element))) &&
                    tasks.videos.includes(this._completionVideo) &&
                    tasks.videos.every(video => (this._attachmentCredit(video) === 'platform-completed' || (video.ended && this._completedVideos.has(video))));
            },
            _queueNavigation(target) {
                if (this._state !== 'READY_TO_ADVANCE') return;
                if (this._actions.pending.has('navigation')) return;
                if (!this._navigationEligible(target)) return this._block('导航条件已变化');
                const entries = catalog.entries(), adjacent = entries[entries.indexOf(this._completionNode) + 1];
                const assessment = this._externalCompletion?.kind === 'assessment' || adjacent !== target;
                const chapter = this._chapterOf(target) !== this._chapterOf(this._completionNode);
                const category = chapter ? 'nextChapter' : 'nextLesson';
                if (assessment && !this.settings.features.assessment) { this._state = 'PAUSED_AUTOMATION'; return; }
                if (!this.settings.features[chapter ? 'nextChapter' : 'nextLesson'] || !this._actionEnabled(category)) {
                    this._state = 'PAUSED_AUTOMATION'; return;
                }
                const uniqueId = element => element?.id && Array.from(document.querySelectorAll('[id]')).filter(other => other.id === element.id).length === 1 ? element.id : '';
                const targetId = uniqueId(target), targetTitle = this._nodeTitle(target), targetChapter = this._chapterOf(target);
                if (!targetId || !this._completionNode?.id) return this._block('导航节奏缺少稳定目录标识');
                const chapterId = uniqueId(targetChapter);
                const topology = this._catalogTopology();
                this._navigationIntent = Object.freeze({ sourceId: this._completionNode.id, sourceTitle: this._nodeTitle(this._completionNode),
                    targetId, targetTitle, topology, href: location.href, generation: this._generation,
                    evidence: this._platformCompletion ? 'platform-credit' : this._externalCompletion?.kind || 'natural-ended' });
                const resolveTarget = () => {
                    if (!target.isConnected) {
                        if (!targetId) return false;
                        const matches = Array.from(document.querySelectorAll('[id]')).filter(el => el.id === targetId);
                        if (matches.length !== 1 || !catalog.entries().includes(matches[0])) return false;
                        target = matches[0];
                    }
                    const chapter = this._chapterOf(target);
                    return this._nodeTitle(target) === targetTitle && (!targetId || (target.id === targetId &&
                        Array.from(document.querySelectorAll('[id]')).filter(el => el.id === targetId).length === 1)) &&
                        (chapter === targetChapter || (!targetChapter?.isConnected && chapterId && chapter?.id === chapterId &&
                            Array.from(document.querySelectorAll('[id]')).filter(el => el.id === chapterId).length === 1) ||
                            (!targetChapter?.isConnected && !chapterId && topology && this._catalogTopology() === topology));
                };
                this._state = 'NAVIGATION_COOLDOWN';
                this._manualBusy = false; this._manualPermit = null;
                this._runAction(category, 'navigation', () => {
                    this._clearNavigationPreview();
                    if (this._state !== 'NAVIGATION_COOLDOWN' || !resolveTarget() || !this._navigationEligible(target)) return this._block('冷却后导航条件失效');
                    this._liveReturnPendingNavigation = false;
                    this._state = 'READY_TO_ADVANCE'; this.playCurrentIndex(target);
                }, { onScheduled: action => this._navigationPreview(action.deadline), isValid: () => {
                    this._navigationFailure = '';
                    if (location.href !== this._navigationIntent.href) this._navigationFailure = '导航预告期间路由已变化';
                    else if (!resolveTarget()) this._navigationFailure = '授权目标缺失或身份不唯一';
                    else if (!this._navigationEligible(target)) this._navigationFailure = '来源身份、平台完成证据或任务归属已失效';
                    return !this._navigationFailure;
                }, onCancel: () => this._clearNavigationPreview() });
            },
            _cooldownCleanup: null,
            _state: 'DISCOVERING',
            _generation: 0,
            _timers: new Set(),
            _completedVideos: new WeakSet(),
            _completionNode: null,
            _completionVideo: null,
            _catalogTopology() {
                const entries = catalog.entries(), chapters = Array.from(document.querySelectorAll('#coursetree > ul > li'));
                const keyedElements = Array.from(document.querySelectorAll('[id]'));
                const keys = entries.map(node => [chapters.indexOf(this._chapterOf(node)), node.id]);
                if (!keys.length || keys.some(([chapter, id]) => chapter < 0 || !id || keyedElements.filter(el => el.id === id).length !== 1)) return null;
                return JSON.stringify(keys); // In-memory ordered keys/grouping, never persisted or logged.
            },
            _refreshVideoContext() {
                const context = this._videoContext, node = catalog.current();
                if (!context || this._destroyed || context.generation !== this._generation ||
                    context.href !== window.location.href || context.document !== videoAdapter.cardDocument() ||
                    context.video !== this._videoEl || !context.video.isConnected || !node ||
                    context.video.ownerDocument !== context.playerDocument ||
                    context.stepTitle !== this._currentStepTitle() || this._nodeTitle(node) !== context.nodeTitle) return false;
                const keyedElements = Array.from(document.querySelectorAll('[id]'));
                if (context.id && (node.id !== context.id || keyedElements.filter(el => el.id === context.id).length !== 1)) return false;
                const chapter = this._chapterOf(node);
                const sameChapter = chapter && (!context.chapterId || (chapter.id === context.chapterId &&
                    keyedElements.filter(el => el.id === context.chapterId).length === 1)) && (chapter === context.chapter ||
                    (!context.chapter?.isConnected && context.chapterId && chapter.id === context.chapterId &&
                        keyedElements.filter(el => el.id === context.chapterId).length === 1) ||
                    (!context.chapter?.isConnected && !context.chapterId && context.topology && this._catalogTopology() === context.topology));
                if (!sameChapter) return false;
                const media = this._playableMedia();
                if (media.inaccessible || (media.unsupported && !media.localExecutionEligible) || !media.videos.includes(context.video)) return false;
                const source = context.video.currentSrc || context.video.getAttribute('src') || '';
                if (context.source && source !== context.source) return false;
                if (!context.source && source) context.source = source;
                if (node === this._playNode) return true;
                // Only replace a detached member of this task's proven lineage. A title
                // match never authorizes rebinding a connected or different task node.
                if (this._playNode?.isConnected || !context.nodes.has(this._playNode) || !context.id) return false;
                const previous = this._playNode;
                context.nodes.add(node); this._playNode = node;
                if (this._completionNode === previous) this._completionNode = node;
                return true;
            },
            _sameVideoTaskNode(node) {
                return node === catalog.current() || (!!node && !node.isConnected &&
                    this._videoContext?.nodes.has(node) && this._refreshVideoContext());
            },
            _schedule(callback, delay, validateContext = null) {
                const generation = this._generation;
                const node = catalog.current();
                const timer = setTimeout(() => {
                    this._timers.delete(timer);
                    if (generation !== this._generation || this._destroyed) return;
                    if (!(validateContext ? validateContext() : this._sameTaskNode(node))) return this._block('页面目录已变化，请执行 app.run() 重新识别');
                    callback();
                }, delay);
                this._timers.add(timer);
                return timer;
            },
            _cancelTasks() {
                this._attachmentReadiness = null;
                this._pacing?.cancelPending();
                this._documentWaitCancel?.(); this._clearNavigationPreview();
                this._mediaReadyCancel?.(); this._clearAudioNotice?.();
                this._platformCompletion = null;
                this._catalogTransitionCancel?.();
                this._startupCancel?.(); this._automaticStartup = false;
                this._actions?.cancelAll();
                this._documentController?.cancel();
                this._documentController = null;
                this._liveController?.dispose();
                this._liveController = null;
                this._generation++;
                this._playPending = false;
                for (const timer of this._timers) clearTimeout(timer);
                this._timers.clear();
                if (this._delayedNextUnitTimer) clearTimeout(this._delayedNextUnitTimer);
                this._delayedNextUnitTimer = null;
                this._clearCheckInterval();
            },
            _block(reason) {
                this._currentDiagnosticBlock={type:'GLOBAL_BLOCKED',reason:'unsafe-scope',evidence:'none',kind:'lesson',ordinal:null};
                try { const journal=this._decisionJournal;if(journal)journal.append({lesson:journal.reference(catalog.current()||this),...this._currentDiagnosticBlock}); } catch (_) { /* Blocking must succeed even without diagnostic storage. */ }
                this._recovery?.cancel('terminal-block');
                this._state = 'BLOCKED';
                this._isPlaying = false;
                this._nextUnitPending = false;
                this._cancelTasks();
                this._detachVideoEvents();
                this._manualBusy = false; this._manualPermit = null;
                this._notify(reason, '安全阻断');
                console.warn(`自动导航已停止：${reason}。请手动处理后执行 app.run()。`);
            },
            _completeVideo(video) {
                if (!video || !video.isConnected || !video.ended || video !== this._videoEl ||
                    this._completedVideos.has(video) || this._state !== 'PLAYING') return;
                if (!this._refreshVideoContext()) {
                    return this._block('播放器完成事件属于已离开的页面');
                }
                console.log('视频自然播放结束，等待内容发现及平台完成确认。');
                this._recordPacedCompletion(video, video.tagName === 'AUDIO' ? 'audio' : 'video', 'natural-ended');
                this._recovery?.confirmProgress();
                this._completedVideos.add(video);
                this._completionVideo = video;
                this._completionNode = catalog.current();
                this._isPlaying = false;
                this._clearCheckInterval();
                this._state = 'VERIFYING_COMPLETION';
                this._notify('媒体已自然结束，正在等待平台完成确认', '已完成');
                this._schedule(() => this._continueCompleted(0), 1000);
            },
            _continueCompleted(attempt) {
                if (this._state !== 'VERIFYING_COMPLETION') return;
                if (!this._refreshVideoContext()) return this._block('完成事件的任务或播放器身份无法确认');
                if (this._isChapterTest()) return this._advanceChapterTest();
                if (this._processSupportedTask()) return;
                if (!this._completionNode || catalog.current() !== this._completionNode ||
                    this._currentStepTitle() !== this._playStepTitle) {
                    return this._block('完成事件与当前目录不匹配');
                }
                const tasks = this._playableMedia();
                if (tasks.inaccessible || (tasks.unsupported && !tasks.localExecutionEligible)) return this._block('存在不可访问或不支持的媒体组件');
                if ((tasks.navigationSafe === false && !tasks.localExecutionEligible)) return this._block('未确认的任务内容禁止自动离开课节');
                if (!tasks.videos.includes(this._completionVideo)) return this._block('播放器已替换，完成状态不明确');
                const next = tasks.videos.find(video => !this._mediaDone(video));
                if (next) {
                    this._videoEl = next;
                    this._state = 'READY';
                    this._nextVideoRequested = true;
                    this.play();
                    return;
                }
                // Outer samples provide no mapping from numeric tabs to task types.
                if (document.querySelectorAll('.prev_list .prev_white').length > 1) {
                    return this._block('多个内容页签的完成关系尚未验证');
                }
                if (catalog.status(this._completionNode) === 'completed') {
                    this._state = 'READY_TO_ADVANCE';
                    this.nextUnit();
                } else if (attempt < this.configs.maxRetries) {
                    this._schedule(() => this._continueCompleted(attempt + 1), this.configs.retryInterval);
                } else {
                    this._block('视频自然结束，但平台尚未确认当前节点完成');
                }
            },
            _clearCheckInterval() {
                if (this._checkInterval) {
                    clearInterval(this._checkInterval);
                    this._checkInterval = null;
                }
            },
            _startVideoMonitoring() {
                const partial=this._partialSession, task=partial?.selected;
                if(task&&!partial.started.has(task.ordinal)){partial.started.add(task.ordinal);this._partialEvent('TASK_STARTED',task,'known-owned');}
                this._clearCheckInterval();
                this._guardLastTime = 0;
                this._guardLastWallTs = 0;
                this._guardLastResumeTs = 0;
                this._checkInterval = setInterval(() => {
                    this._checkVideoStatus();
                }, this.configs.videoCheckInterval);
            },
            _tryResumePlayback(reason) {
                if (!this.settings.features.background) return;
                const now = Date.now();
                if (now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs) {
                    return;
                }
                this._guardLastResumeTs = now;

                const video = this._getVideoEl();
                if (!video || !this._isPlaying) return;
                if (video.ended) { this._completeVideo(video); return; }
                const generation = this._generation;

                console.log(`%c触发视频保活恢复(${reason})`, "color:#607D8B");
                video.play().catch((e) => {
                    if (generation !== this._generation || !this._isPlaying || !video.isConnected ||
                        video !== this._videoEl || !this._refreshVideoContext()) return;
                    if (video.ended) { this._completeVideo(video); return; }
                    if (video.tagName === 'AUDIO') { this._audioPlayRejected(video, e); return; }
                    console.warn("直接恢复播放失败，尝试静音恢复:", e);
                    video.muted = true;
                    video.play().catch((err) => {
                        console.error("静音恢复播放失败:", err);
                    });
                });
            },
            _checkVideoStatus() {
                try {
                    const video = this._getVideoEl();
                    if (!video) return;
                    if (video.ended) { this._completeVideo(video); return; }

                    if (video.paused && this._isPlaying) {
                        console.log("%c检测到视频暂停，尝试恢复播放...", "color:#FF5722");
                        this._tryResumePlayback("paused");
                    } else if (this._isPlaying && !video.ended) {
                        const now = Date.now();
                        const current = Number(video.currentTime || 0);
                        if (this._guardLastWallTs === 0) {
                            this._guardLastWallTs = now;
                            this._guardLastTime = current;
                        } else {
                            const stalled = Math.abs(current - this._guardLastTime) < 0.01;
                            const stalledMs = now - this._guardLastWallTs;
                            if (stalled && stalledMs >= this.configs.guardNoProgressMs) {
                                this._tryResumePlayback("no-progress");
                                this._guardLastWallTs = now;
                                this._guardLastTime = Number(video.currentTime || 0);
                            } else if (!stalled) {
                                this._guardLastWallTs = now;
                                this._guardLastTime = current;
                            }
                        }
                    }

                } catch (e) {
                    console.error("视频状态检查失败:", e);
                }
            },
            _tryTimes: 0,
            _stepAdvanceTimes: 0,
            _stepSwitchAt: 0,
            _stepSwitchPending: false,
            _delayedNextUnitTimer: null,
            _guardLastTime: 0,
            _guardLastWallTs: 0,
            _guardLastResumeTs: 0,
            // Prior platform credit is independent of local ended events. Require an
            // own zero-count AND own completion marker; attachment icons cannot prove a lesson.
            _observeCredit() {
                let node = catalog.current(); const doc = videoAdapter.cardDocument();
                if (!node || !doc || this._videoContext || catalog.status(node) !== 'unknown' ||
                    (this._creditObserved?.node === node && this._creditObserved.doc === doc)) return false;
                this._creditObserved = { node, doc };
                const id = node.id, title = this._nodeTitle(node), generation = this._generation;
                const topology = this._catalogTopology(), chapter = this._chapterOf(node), href = location.href;
                const valid = () => {
                    const active = catalog.current();
                    if (generation !== this._generation || this._destroyed || location.href !== href || doc !== videoAdapter.cardDocument() ||
                        !active || active.id !== id || this._nodeTitle(active) !== title || !topology || this._catalogTopology() !== topology ||
                        [...document.querySelectorAll('[id]')].filter(el => el.id === id).length !== 1) return false;
                    if (this._chapterOf(active) !== chapter && chapter?.isConnected) return false;
                    if (node !== active) { if (node.isConnected) return false; node = active; this._creditObserved.node = active; }
                    return true;
                };
                let attempts = 0;
                const tick = () => {
                    if (generation !== this._generation || this._destroyed) return;
                    if (catalog.current() !== node || node.id !== id || this._nodeTitle(node) !== title || videoAdapter.cardDocument() !== doc) return this._block('完成观察期间任务身份已变化');
                    if (catalog.status(node) === 'completed') { this._state = 'READY'; this.play(); return; }
                    if (catalog.status(node) === 'incomplete' || ++attempts >= 12) {
                        const media = this._playableMedia();
                        if (catalog.status(node) === 'unknown' && !media.videos.length && !media.tasks?.length && !this._taskSet()?.tasks.length) return this._block('平台完成状态仍未知，有限观察已结束；未跳过当前小节');
                        this._state = 'READY'; this.play(); return;
                    }
                    this._schedule(tick, 500, valid);
                };
                this._state = 'WAITING_CREDIT'; this._notify('平台完成状态暂未确定，正在有限观察；超时不会视为完成');
                this._schedule(tick, 500, valid); return true;
            },
            _priorProof(node) {
                return catalog.status(node) === 'completed';
            },
            _priorCompletionValid(record) {
                const active = catalog.current();
                if (record.node !== active && !record.node.isConnected && active?.id === record.id &&
                    this._nodeTitle(active) === record.name && record.topology && this._catalogTopology() === record.topology &&
                    [...document.querySelectorAll('[id]')].filter(el => el.id === record.id).length === 1) {
                    const chapter = this._chapterOf(active);
                    if (chapter !== record.chapter && record.chapter?.isConnected) return false;
                    if (record.doc !== videoAdapter.cardDocument()) return false;
                    const candidate = { ...record, node: active, chapter };
                    if (!this._priorCompletionValid(candidate)) return false;
                    if (this._completionNode === record.node) this._completionNode = active;
                    Object.assign(record, candidate);
                }
                if (this._destroyed || record.generation !== this._generation || record.href !== location.href ||
                    catalog.current() !== record.node || record.node.id !== record.id || !record.node.isConnected || !this._priorProof(record.node) ||
                    this._catalogTopology() !== record.topology || this._chapterOf(record.node) !== record.chapter ||
                    this._currentStepTitle() !== record.title || !videoAdapter.cardDocument() ||
                    this._nodeTitle(record.node) !== record.name || this._isChapterTest()) return false;
                const media = this._playableMedia();
                // Whole-lesson credit is authoritative; media readiness is not
                // completion evidence. Security/active-task contradictions remain blocking.
                if (this._verificationPresent() || media.reasons?.some(reason => /assessment|verification/.test(reason))) { this._priorFailure = '检测到测验或身份验证，不能自动前进'; return false; }
                if (media.inaccessible) { this._priorFailure = '存在不可访问的任务框架，不能确认安全范围'; return false; }
                if (media.reasons?.some(reason => /competing/.test(reason))) { this._priorFailure = '存在竞争播放任务，不能自动前进'; return false; }
                this._priorFailure = ''; return true;
            },
            _checkPriorCompletion() {
                if(this._partialSession)return false;
                if (this._videoContext || this._isPlaying) return false;
                const node = catalog.current(), doc = videoAdapter.cardDocument();
                if (!node || !doc || (this._priorChecked?.node === node && this._priorChecked.doc === doc) || !this._priorProof(node)) return false;
                const entry = this._entryCredit;
                if (entry && entry.id === node.id && entry.name === this._nodeTitle(node) && entry.course === pacingCourse(window) &&
                    entry.topology === this._catalogTopology() && entry.status !== 'completed') {
                    const scope = this._taskSet();
                    if (scope?.validateScope() && scope.tasks.some(task => task.kind === 'document' && !this._processedTasks.has(task.element))) return false;
                }
                const media = this._playableMedia();
                if (this._classifyAttachmentReadiness(media) === 'loading') { this._waitForAttachmentReadiness(); return true; }
                const record = { node, doc, id: node.id, topology: this._catalogTopology(), chapter: this._chapterOf(node), generation: this._generation, href: location.href, title: this._currentStepTitle(),
                    name: this._nodeTitle(node), players: [...media.videos], sources: media.videos.map(el => el.currentSrc || el.getAttribute('src') || ''),
                    attachments: (media.tasks || []).map(task => task.attachment) };
                if (!this._priorCompletionValid(record)) return false;
                if (!node.id || document.querySelectorAll(`[id="${CSS.escape(node.id)}"]`).length !== 1 ||
                    this._completedVisits?.has(node.id)) { this._block('已完成目录重复或身份不明确'); return true; }
                this._state = 'VERIFYING_PLATFORM_COMPLETION';
                this._schedule(() => {
                    if (!this._priorCompletionValid(record)) return this._block('既有平台完成证据或课程身份已变化');
                    this._priorChecked = { node: record.node, doc: record.doc }; this._completedVisits ||= new Set();
                    this._platformCompletion = record; this._completionNode = record.node;
                    this._state = 'READY_TO_ADVANCE'; this.nextUnit();
                }, 250, () => this._priorCompletionValid(record));
                return true;
            },
            _waitForMediaReady(el, actionReady) {
                if (this._mediaReadyCancel) return;
                const generation = this._generation, node = catalog.current(), doc = videoAdapter.cardDocument(), href = location.href;
                const id = node?.id, title = this._nodeTitle(node), source = el.currentSrc || el.getAttribute('src') || '';
                let timer, tries = 0, closed = false;
                const cleanup = () => {
                    closed = true;
                    clearTimeout(timer); this._timers.delete(timer);
                    el.removeEventListener('loadeddata', tick); el.removeEventListener('canplay', tick);
                    for (const type of ['pagehide','beforeunload','popstate','hashchange']) window.removeEventListener(type, cancel);
                    document.removeEventListener('click', interaction, true);
                    if (this._mediaReadyCancel === cleanup) this._mediaReadyCancel = null;
                };
                const cancel = () => { cleanup(); this._block('媒体等待已取消'); };
                const interaction = event => { if (event.isTrusted && !event.composedPath().includes(this._settingsPanel)) cancel(); };
                const tick = () => {
                    if (closed) return;
                    clearTimeout(timer); this._timers.delete(timer);
                    if (generation !== this._generation || this._destroyed) return cleanup();
                    const media = this._playableMedia();
                    if (node !== catalog.current() || node?.id !== id || this._nodeTitle(node) !== title ||
                        (source && source !== (el.currentSrc || el.getAttribute('src') || '')) || doc !== videoAdapter.cardDocument() || href !== location.href ||
                        !el.isConnected || (media.unsupported && !media.localExecutionEligible) || media.inaccessible || !media.videos.includes(el)) { cleanup(); return this._block('等待期间媒体任务已变化'); }
                    if (el.readyState >= 2) { cleanup(); this._state = 'READY'; this.play(actionReady); return; }
                    if (++tries >= 80) { cleanup(); return this._block('选中媒体未就绪，请手动加载后重试'); }
                    timer = setTimeout(tick, 250); this._timers.add(timer);
                };
                this._state = 'WAITING_MEDIA'; this._mediaReadyCancel = cleanup;
                this._notify('已识别媒体，等待播放器就绪', '已识别，等待就绪');
                el.addEventListener('loadeddata', tick); el.addEventListener('canplay', tick);
                for (const type of ['pagehide','beforeunload','popstate','hashchange']) window.addEventListener(type, cancel);
                document.addEventListener('click', interaction, true);
                // Waiting never resets a resumed position with load().
                tick();
            },
            _clearAudioNotice() {
                const state = this._audioState;
                state?.readinessCancel?.();
                if (state) state.el.removeEventListener('volumechange', state.listener);
                this._audioNotice?.remove(); this._audioNotice = null; this._audioState = null;
            },
            _prepareAudio(el) {
                if (this._audioState?.el === el && this._audioState.generation === this._generation) return;
                this._clearAudioNotice();
                this._audioState = { el, generation: this._generation, waiting: false, listener: () => this._renderAudioNotice() };
                el.removeAttribute('muted'); el.defaultMuted = false; el.muted = false;
                if (el.volume === 0) el.volume = 1;
                el.addEventListener('volumechange', this._audioState.listener);
            },
            _audioPlayRejected(el, error) {
                const state = this._audioState;
                const valid = () => state && state === this._audioState && state.generation === this._generation &&
                    !this._destroyed && el === state.el && el.isConnected &&
                    (this.settings.features.audioPlayback || this._manualPermit === 'audio') && this._refreshVideoContext();
                const cancelStale = () => {
                    if (state === this._audioState && state.generation === this._generation && this._state === 'AUDIO_STARTING')
                        this._block('音频任务或自动播放设置已变化，静音重试已取消');
                };
                if (!valid() || el.ended || state.fallbackPending || state.exhausted || state.readinessCancel) return;
                if (error?.name === 'NotAllowedError' && !state.mutedFallbackUsed) {
                    state.mutedFallbackUsed = true; state.fallbackPending = true;
                    this._state = 'AUDIO_STARTING'; this._isPlaying = false; this._playPending = true;
                    this._clearCheckInterval(); el.muted = true; el.playbackRate = 1;
                    this._notify('有声自动播放被浏览器拒绝，正在尝试一次静音播放');
                    Promise.resolve().then(() => { if (valid() && this._state === 'AUDIO_STARTING' && !el.ended) return el.play(); })
                        .then(() => {
                            if (!valid() || this._state !== 'AUDIO_STARTING') { cancelStale(); return; }
                            state.fallbackPending = false; this._playPending = false;
                            if (el.paused && !el.ended) return this._audioPlayRejected(el, new Error('静音播放未实际启动'));
                            state.waiting = false; this._state = 'PLAYING'; this._isPlaying = true;
                            this._manualBusy = false; this._manualPermit = null;
                            this._startVideoMonitoring(); this._renderAudioNotice();
                            this._notify('音频静音播放中（1.0x）；不会自动取消静音', '正在执行');
                            if (el.ended) this._completeVideo(el);
                        }, failure => {
                            if (!valid() || this._state !== 'AUDIO_STARTING') { cancelStale(); return; }
                            state.fallbackPending = false; this._playPending = false; this._audioPlayRejected(el, failure);
                        });
                    return;
                }
                if (error?.name !== 'NotAllowedError' && el.readyState < 2 && !el.error && !state.readinessUsed) {
                    state.readinessUsed = true; state.waiting = true;
                    this._state = 'WAITING_MEDIA'; this._isPlaying = false; this._clearCheckInterval();
                    const deadline = Date.now() + 5000;
                    let timer, cancelled = false;
                    const cleanup = () => {
                        cancelled = true; clearTimeout(timer); this._timers.delete(timer);
                        el.removeEventListener('canplay', tick); el.removeEventListener('loadeddata', tick);
                        for (const type of ['pagehide','beforeunload','popstate','hashchange']) window.removeEventListener(type, invalidated);
                        state.readinessCancel = null;
                    };
                    const invalidated = () => { cleanup(); this._audioStopUnresolved('音频等待期间页面已变化'); };
                    const tick = () => {
                        if (cancelled) return;
                        clearTimeout(timer); this._timers.delete(timer);
                        if (!valid() || el.ended) return invalidated();
                        if (el.error || Date.now() >= deadline) {
                            cleanup(); this._audioExhausted(el, el.error ? 'media-error' : 'readiness-timeout'); return;
                        }
                        if (el.readyState >= 2) {
                            cleanup(); state.waiting = false; state.mutedFallbackUsed = false;
                            el.muted = false; this._playPending = false; this._state = 'READY'; this.play(true); return;
                        }
                        timer = setTimeout(tick, 250); this._timers.add(timer);
                    };
                    state.readinessCancel = cleanup;
                    el.addEventListener('canplay', tick); el.addEventListener('loadeddata', tick);
                    for (const type of ['pagehide','beforeunload','popstate','hashchange']) window.addEventListener(type, invalidated);
                    this._notify('音频暂未就绪，等待一次就绪恢复（最多 5 秒）'); tick(); return;
                }
                this._audioExhausted(el, error?.name || 'playback-rejected');
            },
            _audioStopUnresolved(reason) {
                this._recovery?.cancel('audio-unresolved'); this.stopAutomation();
                this._videoEl = null; this._videoContext = null;
                this._notify(`音频未解决：${reason}；保留未完成状态，不会因此离开当前小节`, '执行失败');
            },
            _audioExhausted(el, category) {
                const state = this._audioState;
                if (el?.tagName !== 'AUDIO' || !state || state.el !== el || state.exhausted || state.generation !== this._generation) return;
                state.exhausted = true; state.readinessCancel?.();
                this._failedAudioPlayers ||= new WeakSet(); this._failedAudioPlayers.add(el);
                this._audioUnresolved = { player: el, category, generation: this._generation };
                this._clearCheckInterval(); this._playPending = false; this._isPlaying = false;
                const media = this._playableMedia(), node = catalog.current();
                if (this._partialSession) return this._audioStopUnresolved('活动 partial session 的选择策略受保护，失败音频不能跨越');
                const index = media.tasks?.findIndex(task => task.kind === 'audio' && task.element === el) ?? -1;
                if (index < 0 || !this._refreshVideoContext()) return this._audioStopUnresolved(category + '，音频归属无法验证');
                if (!this._audioFailureScope) this._audioFailureScope = { node, id: node?.id, course: pacingCourse(window), generation: this._generation,
                    title: this._currentStepTitle(), name: this._nodeTitle(node), topology: this._catalogTopology(), href: location.href,
                    root: videoAdapter.cardDocument(), frame: videoAdapter.cardFrame(), snapshot: this._attachmentSnapshot,
                    tasks: media.tasks.map(task => ({ ...task, source: task.element?.currentSrc || task.element?.getAttribute('src') || '' })) };
                this._audioFailureScope.index = index;
                this._audioFailureScope.tasks[index].audioFailure = category;
                this._detachVideoEvents(); this._videoEl = null; this._videoContext = null;
                this._manualPermit = null; this._manualBusy = false;
                if (!this._audioFollowingTask(media)) return;
                this._nextVideoRequested = true; this._state = 'READY'; this.play();
            },
            _audioFollowingTask(media) {
                const r = this._audioFailureScope, node = catalog.current();
                const refuse = reason => { this._audioStopUnresolved(reason); return null; };
                if (r && r.generation !== this._generation) {
                    const doc = this._externalCompletion;
                    if (doc?.kind !== 'document' || !doc.localDone || doc.generation !== this._generation || !this._taskContextValid(doc))
                        return refuse('音频失败后的执行代次已失效');
                    r.generation = this._generation; // Only the existing verified document handoff may change generation.
                }
                if (!r || this._partialSession || !r.course || r.course !== pacingCourse(window) || node !== r.node || !node?.id || node.id !== r.id ||
                    [...document.querySelectorAll('[id]')].filter(el => el.id === r.id).length !== 1 ||
                    this._nodeTitle(node) !== r.name || this._currentStepTitle() !== r.title || !r.topology || this._catalogTopology() !== r.topology ||
                    location.href !== r.href || videoAdapter.cardDocument() !== r.root || videoAdapter.cardFrame() !== r.frame ||
                    !r.snapshot || this._attachmentSnapshot !== r.snapshot || media.inaccessible || media.unsupported || media.pending || this._verificationPresent())
                    return refuse('当前归属、课节或附件范围不再安全');
                if (media.tasks?.length !== r.tasks.length || !media.tasks.every((t,i) => {
                    const old = r.tasks[i];
                    return t.kind === old.kind && t.attachment === old.attachment && t.element === old.element && t.document === old.document &&
                        t.documents.length === old.documents.length && t.documents.every((doc,j) => doc === old.documents[j]) &&
                        (t.element?.currentSrc || t.element?.getAttribute('src') || '') === old.source;
                })) return refuse('附件身份、来源或顺序已变化');
                const failed = media.tasks[r.index];
                if (failed?.kind !== 'audio' || !this._failedAudioPlayers.has(failed.element) ||
                    media.tasks.some(t => this._failedAudioPlayers.has(t.element) && (!t.element.paused || t.element.seeking || t.element.ended)))
                    return refuse('失败音频不再是可确认的停止状态');
                for (const task of media.tasks.slice(r.index + 1)) {
                    if (!['audio','video','document'].includes(task.kind) || task.executable === false) return refuse('后续附件不支持独立执行');
                    if (task.kind === 'document' ? this._processedTasks.has(task.attachment) : this._mediaDone(task.element)) continue;
                    if (task.kind === 'document') {
                        const scope = this._taskSet();
                        if (!this.settings.features.document || !scope?.validateScope() || !scope.tasks.some(t => t.kind === 'document' && t.element === task.attachment && t.viewer))
                            return refuse('后续文档未启用或缺少已验证的阅读适配器');
                    } else if (!task.element || (!task.element.paused && task.element !== this._videoEl) || task.element.seeking || task.element.ended ||
                        !this.settings.features[task.kind === 'audio' ? 'audioPlayback' : 'videoPlayback'] ||
                        ((!this._isPlaying || this._videoEl !== task.element) && !this.settings.features[task.kind === 'audio' ? 'nextAudio' : 'nextVideo'])) return refuse('后续媒体未启用或正在活动');
                    return task;
                }
                return refuse('没有可安全执行的后续附件');
            },
            _renderAudioNotice() {
                const state = this._audioState, el = state?.el;
                if (!el?.isConnected || state.generation !== this._generation) return this._clearAudioNotice();
                this._audioNotice?.remove(); this._audioNotice = null;
                if (!state.waiting && !el.muted && el.volume > 0) return;
                const host = document.createElement('div'); this._audioNotice = host;
                host.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483646;max-width:280px';
                const root = host.attachShadow({ mode: 'open' });
                const label = document.createElement('div'); label.style.cssText = 'padding:10px;background:#fff;color:#222;border:1px solid #888;font:13px sans-serif';
                label.textContent = state.waiting ? `音频需要手动播放（${state.error}）` : el.muted ? '音频已静音' : '音频音量为零';
                for (const [text, muted] of [['有声播放', false], ['本次允许静音继续', true]]) {
                    const button = document.createElement('button'); button.textContent = text;
                    button.addEventListener('click', event => {
                        if (!event.isTrusted || state !== this._audioState || state.generation !== this._generation ||
                            (!this.settings.features.audioPlayback && this._manualPermit !== 'audio') || !this._refreshVideoContext() || el.ended || this._playPending) return;
                        el.defaultMuted = false; el.muted = muted; if (!muted && el.volume === 0) el.volume = 1;
                        el.playbackRate = 1; this._state = 'PLAYING'; this._isPlaying = true; this._playPending = true;
                        const result = el.play();
                        Promise.resolve(result).then(() => {
                            if (state !== this._audioState || !this._refreshVideoContext()) return;
                            this._playPending = false; state.waiting = false; this._startVideoMonitoring(); this._renderAudioNotice();
                            this._manualBusy = false; this._manualPermit = null; this._notify('音频正在播放（1.0x）', '正在执行');
                        }, error => { if (state === this._audioState) { this._playPending = false; this._audioPlayRejected(el, error); } });
                    }); label.append(button);
                }
                root.append(label); document.body.append(host);
            },
            async play(actionReady = false) {
                if (!this._recoveryEntryAllowed()) return;
                try {
                    if (this._isChapterTest()) {
                        this._advanceChapterTest();
                        return;
                    }
                    if (this._destroyed || ['BLOCKED', 'ADVANCING', 'WAITING_CATALOG', 'WAITING_STARTUP', 'WAITING_CREDIT', 'WAITING_MEDIA', 'WAITING_MANUAL_TASKS', 'WAITING_DOCUMENT', 'WAITING_ATTACHMENT', 'WAITING_AUDIO_GESTURE', 'AUDIO_STARTING', 'VERIFYING_PLATFORM_COMPLETION', 'VERIFYING_COMPLETION', 'NAVIGATION_COOLDOWN', 'WAITING_LIVE', 'READING_DOCUMENT', 'PAUSED_AUTOMATION', 'FINISHED'].includes(this._state)) return;
                    if (this._state === 'PLAYING' && !this._refreshVideoContext()) {
                        return this._block('当前播放页面或播放器已变化');
                    }
                    if (this._playPending || this._actions.pending.has('video-start') || this._actions.pending.has('video-tab')) return;
                    if (this._checkPriorCompletion() || this._observeCredit()) return;
                    if (this._processSupportedTask()) return;
                    this._state = 'DISCOVERING';
                    const tasks = this._playableMedia();
                    if (tasks.inaccessible || (tasks.unsupported && !tasks.localExecutionEligible)) return this._block('存在不可访问或不支持的媒体组件');
                    const el = this._getVideoEl();
                    if (el == null) {
                        if (this._advanceLearningStep()) {
                            this._state = 'LOADING';
                            this._schedule(() => this.play(), 2000);
                            return;
                        }
                        const hasCards = document.querySelector('iframe[info="card"], iframe[src*="/knowledge/cards"]');
                        if (hasCards || videoTitle(this._currentStepTitle())) {
                            this._state = 'LOADING';
                            throw new Error('视频组件尚未加载完成或当前组件不受支持');
                        }
                        return this._block('未知或不支持的内容，禁止自动跳过');
                    }
                    if (!catalog.current()) return this._block('无法唯一确定当前目录节点');
                    if (this._completedVideos.has(el)) return;
                    if (this._isPlaying && !el.paused && !el.ended) { this._state = 'PLAYING'; return; }
                    if (!this._actionEnabled(this._mediaAction(el, this._nextVideoRequested))) { this._state = 'PAUSED_AUTOMATION'; return; }
                    if (!actionReady && this._paceContent(el, el.tagName === 'AUDIO' ? 'audio' : 'video', () => { this._state = 'READY'; this.play(true); })) return;
                    const sourcePresent = !!(el.currentSrc || el.getAttribute('src') || el.querySelector('source[src]'));
                    if (el.readyState < 2 && !sourcePresent) { this._waitForMediaReady(el, actionReady); return; }
                    if (!actionReady && !this._pacedReady?.startsWith('content:' + JSON.stringify(this._pacedIdentity(el, el.tagName === 'AUDIO' ? 'audio' : 'video')) + ':') && this._preparedVideoNode !== catalog.current()) {
                        const category = this._mediaAction(el, this._nextVideoRequested);
                        this._state = 'ACTION_PENDING';
                        this._runAction(category, 'video-start', () => { this._state = 'READY'; this.play(true); },
                            { isValid: () => el.isConnected && !el.ended && !this._mediaDone(el) && el === this._getVideoEl() });
                        return;
                    }
                    this._preparedVideoNode = null;
                    this._nextVideoRequested = false;
                    const generation = this._generation;
                    const node = catalog.current();
                    this._playNode = node;
                    this._playStepTitle = this._currentStepTitle();
                    const chapter = this._chapterOf(node);
                    const uniqueId = element => element?.id && Array.from(document.querySelectorAll('[id]')).filter(other => other.id === element.id).length === 1 ? element.id : '';
                    this._videoContext = { id: uniqueId(node), nodeTitle: this._nodeTitle(node), stepTitle: this._playStepTitle,
                        chapter, chapterId: uniqueId(chapter), video: el, playerDocument: el.ownerDocument, document: videoAdapter.cardDocument(),
                        source: el.currentSrc || el.getAttribute('src') || '',
                        topology: this._catalogTopology(),
                        href: window.location.href, generation, nodes: new WeakSet([node]) };
                    this._state = 'PLAYING';
                    this._isPlaying = true;
                    this._detectedKind = el.tagName === 'AUDIO' ? '音频' : '视频';
                    this._notify(`检测到${this._detectedKind}任务，正在尝试播放`, '已识别，尝试执行');
                    this._videoEventHandle();
                    el.playbackRate = 1.0;
                    if (el.tagName === 'AUDIO') this._prepareAudio(el); else this._clearAudioNotice();

                    try {
                        this._playPending = true;
                        if (el.tagName === 'AUDIO') { this._state = 'AUDIO_STARTING'; this._isPlaying = false; }
                        await el.play();
                        if (el.tagName === 'AUDIO' && generation === this._generation && this._state === 'AUDIO_STARTING' && this._refreshVideoContext()) { this._state = 'PLAYING'; this._isPlaying = true; }
                        if (generation === this._generation) this._playPending = false;
                        if (generation !== this._generation || !this._sameVideoTaskNode(node) ||
                            !el.isConnected || this._state !== 'PLAYING') return;
                        this._tryTimes = 0;
                        this._automaticStartup = false;
                        this._observedLessonId = node.id; this._observedCard = this._cardIdentity();
                        console.log(`%c视频开始播放，倍速: ${el.playbackRate}x`, "color:#4CAF50");
                        this._startVideoMonitoring();
                        this._manualBusy = false; this._manualPermit = null;
                        this._notify(`${this._detectedKind}正在播放（1.0x）`, '正在执行');
                        if (el.tagName === 'AUDIO') this._renderAudioNotice();
                    } catch (playError) {
                        if (generation === this._generation) this._playPending = false;
                        console.error("视频播放失败:", playError);
                        if (generation === this._generation && this._sameVideoTaskNode(node) && (this._state === 'PLAYING' || (el.tagName === 'AUDIO' && this._state === 'AUDIO_STARTING'))) {
                            if (el.ended) this._completeVideo(el); else this._handlePlayError(playError);
                        }
                    }
                } catch (e) {
                    if (this._tryTimes >= this.configs.maxRetries) {
                        console.error("%c视频播放失败，已达到最大重试次数", "color:#F44336;font-weight:bold", e);
                        this._block('播放器加载或播放重试已达上限');
                        return;
                    }
                    this._tryTimes++;
                    console.log(`%c播放失败，${this.configs.retryInterval/1000}秒后重试 (${this._tryTimes}/${this.configs.maxRetries})`, "color:#FF9800");
                    this._schedule(() => {
                        this.play();
                    }, this.configs.retryInterval);
                }
            },
            _advanceLearningStep() {
                if (this._currentStepTitle() !== '学习目标') return false;
                const tabs = $('.prev_white:visible').filter((_, el) => videoTitle($(el).text())).toArray();
                if (tabs.length !== 1 || this._stepSwitchPending) return false;
                this._stepSwitchPending = true;
                this._stepSwitchAt = Date.now();
                this._runAction('videoStart', 'video-tab', () => {
                    tabs[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    this._preparedVideoNode = catalog.current();
                }, { isValid: () => tabs[0].isConnected });
                return true;
            },
            _currentStepTitle() {
                const prevTitle = document.getElementsByClassName('prev_title')[0];
                return prevTitle ? (prevTitle.title || prevTitle.textContent || '').trim() : '';
            },
            _isChapterTest() {
                return assessmentTitle(this._currentStepTitle()) ||
                    assessmentTitle(catalog.current()?.querySelector('.posCatalog_name')?.getAttribute('title') || '');
            },
            _advanceChapterTest() {
                if (['NAVIGATION_COOLDOWN', 'WAITING_LIVE', 'READING_DOCUMENT', 'ADVANCING'].includes(this._state)) return;
                const node = catalog.current();
                const target = node && this._assessmentTarget(node);
                if (!target || !optionalAssessment(this._currentStepTitle())) {
                    return this._block('测验、作业或验证内容无法安全跨章，不会自动提交或跳过');
                }
                this._cancelTasks();
                this._isPlaying = false;
                this._detachVideoEvents();
                this._completionNode = node;
                this._completionVideo = null;
                this._externalCompletion = { kind: 'assessment', localDone: true, node, generation: this._generation,
                    title: this._currentStepTitle(), href: window.location.href };
                this._state = 'READY_TO_ADVANCE';
                this._queueNavigation(target);
            },
            _bindStepNavigation() {
                this._bindCatalogNavigation();
                if (this._stepNavigationBound) {
                    return;
                }
                this._stepNavigationBound = true;

                const reenterVideoMode = () => {
                    this._cancelTasks();
                    this._state = 'LOADING';
                    this._tryTimes = 0;
                    this._videoEl = null;
                    this._isPlaying = false;
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    this._schedule(() => {
                        try {
                            this._initCellData();
                        } catch (e) {}
                        this.play();
                    }, 1800);
                };

                $(document).off('click.xuexitongPlayerV3', '.prev_white').on('click.xuexitongPlayerV3', '.prev_white', (e) => {
                    const text = ($(e.currentTarget).text() || "").replace(/\s+/g, "");
                    if (videoTitle(text)) {
                        console.log(`%c检测到步骤切换点击：${text}，准备重新接管视频页`, "color:#607D8B");
                        reenterVideoMode();
                    }
                });
            },
            _cardIdentity() {
                const media = videoAdapter.discover();
                return [videoAdapter.cardFrame(), videoAdapter.cardDocument(), ...media.documents, ...media.videos,
                    ...(media.audios || []), ...(media.tasks || []).map(task => task.attachment),
                    ...media.documents.flatMap(doc => Array.from(doc.querySelectorAll('a.liveHref, form')))];
            },
            _bindCatalogNavigation() {
                if (this._catalogObserver || typeof MutationObserver === 'undefined') return;
                this._observedLessonId = catalog.current()?.id;
                this._observedCard = this._cardIdentity();
                this._catalogClick = event => {
                    const label = event.target.closest?.('#coursetree .posCatalog_name');
                    const target = label?.closest('.posCatalog_select');
                    if (this._destroyed || this._state === 'ADVANCING' || !target || !catalog.entries().includes(target) ||
                        !target.id || (target.id === this._observedLessonId && !this._catalogTransitionCancel)) return;
                    this._beginCatalogTransition(target.id);
                };
                document.addEventListener('click', this._catalogClick, true);
                this._catalogObserver = new MutationObserver(() => {
                    if (this._destroyed || ['BLOCKED', 'ADVANCING', 'WAITING_CATALOG'].includes(this._state)) return;
                    const node = catalog.current();
                    if (!this._observedLessonId && node?.id) { this._observedLessonId = node.id; return; }
                    if (node?.id && node.id !== this._observedLessonId) {
                        if (this._state === 'NAVIGATION_COOLDOWN') { this.stopAutomation(); this._notify('平台或用户已切换小节，旧倒计时已取消；请明确重新检测'); return; }
                        this._beginCatalogTransition(node.id);
                    }
                });
                this._catalogObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
            },
            _beginCatalogTransition(id) {
                const old = this._observedCard || this._cardIdentity();
                this._cancelTasks(); this._detachVideoEvents();
                this._videoEl = null; this._videoContext = null; this._isPlaying = false;
                this._attachmentSnapshot = null;
                this._nextUnitPending = false;
                this._state = 'WAITING_CATALOG';
                const generation = this._generation, href = window.location.href;
                let attempts = 0, timer, previous = null;
                const same = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
                const cancel = () => this._block('侧栏切换已取消');
                const cleanup = () => {
                    clearTimeout(timer); this._timers.delete(timer);
                    for (const type of ['pagehide', 'beforeunload', 'popstate', 'hashchange']) window.removeEventListener(type, cancel);
                    if (this._catalogTransitionCancel === cleanup) this._catalogTransitionCancel = null;
                };
                this._catalogTransitionCancel = cleanup;
                for (const type of ['pagehide', 'beforeunload', 'popstate', 'hashchange']) window.addEventListener(type, cancel);
                const wait = () => {
                    this._timers.delete(timer);
                    if (generation !== this._generation || this._destroyed) return cleanup();
                    if (href !== window.location.href) { cleanup(); return this._block('侧栏切换时页面已离开'); }
                    const node = catalog.current(), now = this._cardIdentity();
                    const valid = node?.id === id && Array.from(document.querySelectorAll('[id]')).filter(el => el.id === id).length === 1 &&
                        now[1] && !same(old, now) && now[1].readyState !== 'loading';
                    if (valid && previous && same(previous, now)) {
                        cleanup(); this._observedLessonId = id; this._observedCard = now;
                        this.run({ startup: true, transition: true }); return;
                    }
                    if (++attempts >= 40) { cleanup(); return this._block('侧栏课节与新内容未能稳定确认'); }
                    previous = valid ? now : null;
                    timer = setTimeout(wait, 250); this._timers.add(timer);
                };
                wait();
            },
            _handlePlayError(error) {
                console.error("播放错误详情:", error);
                const video = this._getVideoEl();
                if (video?.ended) { this._completeVideo(video); return; }
                const generation = this._generation;
                const node = catalog.current();
                if (video?.tagName === 'AUDIO') { this._audioPlayRejected(video, error); return; }
                if (video) {
                    video.muted = true;
                    video.play().then(() => {
                        if (generation !== this._generation || !this._sameVideoTaskNode(node) ||
                            !video.isConnected || this._state !== 'PLAYING') return;
                        console.log("%c静音播放成功", "color:#4CAF50");
                        this._tryTimes = 0;
                        this._startVideoMonitoring();
                        if (this._delayedNextUnitTimer) {
                            clearTimeout(this._delayedNextUnitTimer);
                            this._delayedNextUnitTimer = null;
                        }
                    }).catch(e => {
                        if (generation !== this._generation || !this._sameVideoTaskNode(node)) return;
                        if (video.ended) { this._completeVideo(video); return; }
                        console.error("静音播放也失败:", e);
                        if (this._delayedNextUnitTimer) {
                            clearTimeout(this._delayedNextUnitTimer);
                        }
                        this._isPlaying = false;
                        if (this._tryTimes >= this.configs.maxRetries) {
                            console.error('%c静音播放失败，已达到最大重试次数', 'color:#F44336;font-weight:bold', e);
                            this._block('静音播放重试已达上限');
                            return;
                        }
                        this._tryTimes++;
                        this._delayedNextUnitTimer = this._schedule(() => {
                            this._delayedNextUnitTimer = null;
                            this.play();
                        }, this.configs.retryInterval);
                    });
                }
            },
            playCurrentIndex(nCell) {
                const target = nCell?.querySelector('.posCatalog_name');
                if (!target || !nCell.isConnected || !catalog.entries().includes(nCell)) {
                    return this._block('找不到有效的目录导航目标');
                }
                if (assessmentTitle(target.getAttribute('title') || target.textContent)) {
                    return this._block('下一目录为测验或作业，请手动进入');
                }
                if (this._nextUnitPending || this._state === 'ADVANCING') return;
                if (this._state !== 'READY_TO_ADVANCE' || catalog.current() !== this._completionNode ||
                    (!this._externalCompletion && catalog.status(this._completionNode) !== 'completed')) {
                    return this._block('当前内容尚未确认完成');
                }
                this._entryCredit = { id: nCell.id, name: this._nodeTitle(nCell), course: pacingCourse(window), status: catalog.status(nCell), topology: this._catalogTopology() };
                const destinationChapter = this._chapterOf(nCell), destinationTopology = this._catalogTopology();
                const destinationId = nCell.id, destinationTitle = this._nodeTitle(nCell), destinationHref = new URL(location.href);
                const sourceId = this._completionNode?.id;
                const routeValid = () => {
                    const now = new URL(location.href);
                    if (now.origin !== destinationHref.origin || now.pathname !== destinationHref.pathname) return false;
                    const keys = new Set([...destinationHref.searchParams.keys(), ...now.searchParams.keys()]);
                    return [...keys].every(key => /^(chapterid|knowledgeid)$/i.test(key) ||
                        JSON.stringify(now.searchParams.getAll(key)) === JSON.stringify(destinationHref.searchParams.getAll(key)));
                };
                const oldCard = this._cardIdentity();
                const oldMarkup = videoAdapter.cardDocument()?.body?.innerHTML;
                const oldDocument = videoAdapter.cardDocument();
                if (!oldDocument) return this._block('无法唯一识别 cards 内容 iframe');
                this._attachmentSnapshot = null;
                this._cancelTasks();
                this._externalCompletion = null;
                this._hadLive = false;
                this._detachVideoEvents();
                this._state = 'ADVANCING';
                this._nextUnitPending = true;
                this._videoEl = null;
                this._videoContext = null;
                this._isPlaying = false;
                const generation = this._generation;
                this._notify('已发起导航，正在确认目标小节');
                target.click();
                // Navigation has its own context: the active node must change to the target,
                // and a new iframe document must arrive before an old player can be reused.
                let attempts = 0, previous = null;
                const wait = () => {
                    if (generation !== this._generation || this._destroyed) return;
                    if (!nCell.isConnected) {
                        const matches = catalog.entries().filter(el => el.id === destinationId);
                        if (matches.length !== 1) {
                            if (++attempts >= this.configs.maxRetries) return this._block('目标目录重建未能唯一确认');
                            const timer = setTimeout(() => { this._timers.delete(timer); wait(); }, 250); this._timers.add(timer); return;
                        }
                        if (this._catalogTopology() !== destinationTopology || this._nodeTitle(matches[0]) !== destinationTitle) return this._block('重建目标的章节关系或标题不符');
                        nCell = matches[0];
                    }
                    if (!routeValid() || nCell.id !== destinationId || this._nodeTitle(nCell) !== destinationTitle) return this._block('导航期间页面或目标身份已变化');
                    const contentDocument = videoAdapter.cardDocument();
                    const card = this._cardIdentity(), markup = contentDocument?.body?.innerHTML;
                    const changed = contentDocument !== oldDocument || card.length !== oldCard.length || card.some((value,i) => value !== oldCard[i]) || markup !== oldMarkup;
                    const destination = catalog.current();
                    if (destination && destination !== nCell && destination !== this._completionNode) return this._block('导航到达非预期小节，已停止');
                    const valid = destination === nCell && nCell.isConnected && catalog.entries().includes(nCell) &&
                        contentDocument && contentDocument.readyState !== 'loading' && changed;
                    const snapshot = [...card, markup];
                    if (valid && previous && previous.length === snapshot.length && previous.every((value,i) => value === snapshot[i])) {
                        this._observedLessonId = nCell.id; this._observedCard = card;
                        this._nextUnitPending = false;
                        this._completedVisits ||= new Set();
                        if (sourceId) this._completedVisits.add(sourceId);
                        if (this._completedVisits.has(nCell.id)) return this._block('已确认返回历史小节，阻止导航循环');
                        this._notify('目标小节已确认，重新检查平台完成状态');
                        this.run({ startup: true, transition: true });
                    } else if (++attempts >= this.configs.maxRetries) {
                        this._block('目录切换或内容 iframe 加载未确认');
                    } else {
                        previous = valid ? snapshot : null;
                        const timer = setTimeout(() => { this._timers.delete(timer); wait(); }, 250);
                        this._timers.add(timer);
                    }
                };
                wait();
            },
            _initCellData() {
                const entries = catalog.entries();
                const current = catalog.current();
                this._cellData.cells = document.querySelectorAll('#coursetree > ul > li').length;
                this._cellData.nCells = entries.length;
                this._cellData.currentNCellIndex = entries.indexOf(current);
                this._cellData.currentVideoTitle = current?.querySelector('.posCatalog_name')?.getAttribute('title') || '';
                // Counts describe directory entries, never a video/task count.
                console.log(`已识别 ${entries.length} 个目录内容节点；媒体数量由播放器发现。`);
            },
            _getTreeContainer() {
                if (!this._treeContainerEl) {
                    const el = $('#coursetree');
                    if (el.length <= 0) {
                        throw new Error("找不到视频列表");
                    }
                    this._treeContainerEl = el;
                }
                return this._treeContainerEl;
            },
            _getVideoEl() {
                if (['WAITING_CATALOG', 'WAITING_STARTUP', 'WAITING_MEDIA', 'WAITING_LIVE', 'READING_DOCUMENT', 'VERIFYING_PLATFORM_COMPLETION'].includes(this._state)) return null;
                if (this._state === 'PLAYING' && !this._refreshVideoContext()) {
                    this._block('当前播放页面或播放器已变化');
                    this._videoEl = null;
                    return null;
                }
                const tasks = this._playableMedia();
                if (this._audioUnresolved) {
                    const next = this._audioFollowingTask(tasks);
                    if (!next || next.kind === 'document') return null;
                    if (this._videoEl !== next.element) { this._detachVideoEvents(); this._videoEl = next.element; }
                    return this._videoEl;
                }
                if (tasks.inaccessible || (tasks.unsupported && !tasks.localExecutionEligible)) {
                    if (this._state !== 'BLOCKED') this._block('存在不可访问或不支持的媒体组件');
                    return null;
                }
                if (!this._videoEl?.isConnected || !tasks.videos.includes(this._videoEl)) {
                    this._detachVideoEvents();
                    this._videoEl = tasks.videos.find(video => !this._mediaDone(video)) || null;
                }
                return this._videoEl;
            },
            _videoEventHandle() {
                const el = this._videoEl;
                if (!el) {
                    console.log("videoEl未加载");
                    return;
                }

                if (this._eventVideoEl === el) return;
                this._detachVideoEvents();
                this._eventVideoEl = el;
                this._boundVideoHandlers = {
                    ended: this._handleVideoEnded.bind(this),
                    loadedmetadata: this._handleVideoLoaded.bind(this),
                    play: this._handleVideoPlay.bind(this),
                    pause: this._handleVideoPause.bind(this),
                    ratechange: () => { if (el.playbackRate !== 1.0) el.playbackRate = 1.0; },
                };

                el.addEventListener('ended', this._boundVideoHandlers.ended);
                el.addEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
                el.addEventListener('play', this._boundVideoHandlers.play);
                el.addEventListener('pause', this._boundVideoHandlers.pause);
                el.addEventListener('ratechange', this._boundVideoHandlers.ratechange);
            },
            _detachVideoEvents() {
                if (!this._eventVideoEl || !this._boundVideoHandlers) return;
                this._eventVideoEl.removeEventListener('ended', this._boundVideoHandlers.ended);
                this._eventVideoEl.removeEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
                this._eventVideoEl.removeEventListener('play', this._boundVideoHandlers.play);
                this._eventVideoEl.removeEventListener('pause', this._boundVideoHandlers.pause);
                this._eventVideoEl.removeEventListener('ratechange', this._boundVideoHandlers.ratechange);
                this._eventVideoEl = null;
                this._boundVideoHandlers = null;
            },
            _handleVideoEnded(e) {
                this._completeVideo(e?.target);
            },
            _handleVideoLoaded(e) {
                console.log(`%c============视频加载完成=============`, "color:#2196F3");
                if (this.configs.autoplay && !this._isPlaying) {
                    this.play();
                }
            },
            _handleVideoPlay(e) {
                const title = this._cellData.currentVideoTitle;
                console.info(`%c============'${title}' 开始播放=============`, "color:#4CAF50");
                this._isPlaying = true;
                this._stepSwitchPending = false;
                const video = this._getVideoEl();
                this._guardLastTime = Number(video?.currentTime || 0);
                this._guardLastWallTs = Date.now();
                if (this._delayedNextUnitTimer) {
                    clearTimeout(this._delayedNextUnitTimer);
                    this._delayedNextUnitTimer = null;
                }
            },
            _handleVideoPause(e) {
                console.log(`%c============视频暂停=============`, "color:#FF9800");
            },
            _bindPageGuards() {
                const preventPause = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                };
                const resumePlaybackNow = () => this._tryResumePlayback('page-event');
                this._pageGuards = { preventPause, resumePlaybackNow };
                document.addEventListener('mouseleave', preventPause);
                window.addEventListener('mouseleave', preventPause);
                document.addEventListener('mouseout', preventPause);
                window.addEventListener('mouseout', preventPause);
                window.addEventListener('blur', resumePlaybackNow);
                document.addEventListener('visibilitychange', resumePlaybackNow);
            },
            destroy() {
                this._catalogObserver?.disconnect(); this._catalogObserver = null;
                document.removeEventListener?.('click', this._catalogClick, true);
                this._destroyed = true;
                this._settingsPanel?.remove();
                this._recovery?.dispose(); clearInterval(this._recoveryProgressTimer);
                this._noticePanel?.remove(); this._noticePanel = null;
                this._renderSettings = null;
                window.removeEventListener('storage', this._settingsStorage);
                this._cancelTasks();
                this._state = 'BLOCKED';
                this._isPlaying = false;
                this._clearCheckInterval();
                this._detachVideoEvents();
                if (this._delayedNextUnitTimer) clearTimeout(this._delayedNextUnitTimer);
                $(document).off('.xuexitongPlayerV3');
                if (this._pageGuards) {
                    const { preventPause, resumePlaybackNow } = this._pageGuards;
                    document.removeEventListener('mouseleave', preventPause);
                    window.removeEventListener('mouseleave', preventPause);
                    document.removeEventListener('mouseout', preventPause);
                    window.removeEventListener('mouseout', preventPause);
                    window.removeEventListener('blur', resumePlaybackNow);
                    document.removeEventListener('visibilitychange', resumePlaybackNow);
                    this._pageGuards = null;
                }
            },
        };

        Object.defineProperty(app.configs, 'playbackRate', {
            enumerable: true,
            get: () => 1.0,
            set: () => {},
        });
        app._planningSnapshot = () => createLessonPlan(app);
        app._decisionJournal = null;
        try { app._decisionJournal = createDecisionJournal(window); } catch (_) { /* Diagnostics never gate existing playback. */ }
        app.settings = loadSettings(window);
        app._pacing = createTaskPacingCoordinator(window, () => app.settings);
        app._actions = createActionScheduler(window, {
            rule: category => app._actionRule(category), enabled: category => app._actionEnabled(category),
            onQueued: timer => app._timers.add(timer), onDone: timer => app._timers.delete(timer), onError: reason => app._block(reason),
        });
        Object.defineProperty(app.configs, 'randomCooldownEnabled', {
            enumerable: true, get: () => app.settings.randomDelaysEnabled,
            set: value => { const next = JSON.parse(JSON.stringify(app.settings)); next.randomDelaysEnabled = !!value; app.updateSettings(next); },
        });
        Object.defineProperty(app.configs, 'autoplay', {
            enumerable: true, get: () => app.settings.features.videoPlayback,
            set: value => { const next = JSON.parse(JSON.stringify(app.settings)); next.features.videoPlayback = !!value; app.updateSettings(next); },
        });
        const recoveryIdentity = () => {
            try { const url = new URL(location.href), node = catalog.current();
                if (!pacingCourse(window) || !node?.id || [...document.querySelectorAll('[id]')].filter(el => el.id === node.id).length !== 1) return null;
                return JSON.stringify([pacingCourse(window),url.searchParams.get('clazzid') || url.searchParams.get('classId') || '',node.id]);
            } catch (_) { return null; }
        };
        let recoverySample = null;
        const recoverySafe = () => {
            const media = app._playableMedia();
            return !!recoveryIdentity() && !app._destroyed && !app._isPlaying && !app._documentController && !app._liveController &&
                !['WAITING_LIVE','READING_DOCUMENT','VERIFYING_COMPLETION','VERIFYING_PLATFORM_COMPLETION','NAVIGATION_COOLDOWN','ADVANCING','FINISHED'].includes(app._state) &&
                !app._pacing.getStatus().restEndsAt && !media.unsupported && !media.inaccessible && media.navigationSafe !== false &&
                !app._verificationPresent() && !app._isChapterTest() && !gmLive?.retryBlocked(app) &&
                media.videos.every(el => el.paused && !el.seeking && !el.ended);
        };
        app._recovery = createUnattendedRecoveryCoordinator(window, {
            identity: recoveryIdentity, safe: recoverySafe,
            fingerprint: () => JSON.stringify([location.href, app._nodeTitle(catalog.current()), app._catalogTopology(), app._chapterOf(catalog.current())?.id || '', videoAdapter.cardFrame()?.id || '']),
            canReload: () => recoverySafe() && !app._entryCredit && !app._externalCompletion && !app._platformCompletion,
            notice: text => app._notify(text), fail: reason => app._block(reason),
            retry: stage => { if (stage === 1) { app._state = 'READY'; app.play(); } else app.run({ startup: true }); },
            progress: () => !app._recovery.getStatus().attempts,
        });
        app._recoveryProgressTimer = setInterval(() => {
            const el = app._videoEl, now = Date.now();
            if (el && el === app._getVideoEl() && app._isPlaying && !el.paused && !el.seeking && !el.ended) {
                if (recoverySample?.el === el && now - recoverySample.at >= 3000 && now - recoverySample.at <= 10000 &&
                    el.currentTime > recoverySample.time && el.currentTime - recoverySample.time <= (now - recoverySample.at) / 1000 + 1) app._recovery.confirmProgress();
                if (!recoverySample || recoverySample.el !== el || now - recoverySample.at >= 3000) recoverySample = { el, at: now, time: el.currentTime };
            } else recoverySample = null;
        }, 1000);
        for (const type of ['pagehide','popstate','hashchange']) window.addEventListener(type, () => app._recovery.cancel(type));
        app._mountNoticePanel(); app._mountSettingsPanel();
        window.app = app;
        window[APP_KEY] = app;

        try {
            const partialPaused=app._partialPauseApplies();
            if(partialPaused){app.stopAutomation();app._state='WAITING_MANUAL_TASKS';app._notify('此前有未解决附件，请显式 recheckCurrentLesson() 重新核对；不会恢复历史播放完成证据');}
            else if (app._recoveryEntryAllowed()) { if (!gmLive?.restore(app)) app.run({ startup: true }); app._recovery.observe(); }
            if (app.settings.features.background && !app._pageGuards) app._bindPageGuards();
        } catch (error) {
            console.error("%c脚本运行失败: ", "color:#F44336;font-weight:bold", error.message);
            console.log("请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。");
        }
    }
    if (window.location?.origin === 'https://zhibo.chaoxing.com') bootRecordedPopup();
    else bootCourse();
    function createGMLive(env, gm) {
        const key = 'xtx-v34-native-session-v1', now = () => Date.now();
        const random = () => env.crypto.randomUUID();
        const instance = random();
        const identities = () => {
            const params = new URL(env.location.href).searchParams, result = {};
            for (const [name, aliases] of Object.entries({ course: ['courseId','courseid'], clazz: ['clazzid','classId','classid'], lesson: ['chapterId','knowledgeId','chapterid','knowledgeid'] })) {
                const values = aliases.flatMap(alias => params.getAll(alias)).filter(Boolean);
                if (new Set(values).size > 1) return null;
                if (values.length) result[name] = values[0];
            }
            return result;
        };
        const matches = (a,b) => a && b && a.course && a.course === b.course &&
            a.lesson && a.lesson === b.lesson &&
            ['course','clazz','lesson'].every(k => !a[k] || !b[k] || a[k] === b[k]);
        const fresh = r => r && r.version === 1 && r.expires > now();
        let parentTimer, childTimer, listener, owned, parentNonce, acceptedChild, completed = false;
        const notice = text => {
            let panel = env.document.getElementById('xtx-native-replay-status');
            if (!panel) { panel = env.document.createElement('div'); panel.id = 'xtx-native-replay-status'; panel.style.cssText = 'position:fixed;right:8px;bottom:10px;z-index:2147483647;background:white;color:#222;padding:8px;max-width:300px;font:13px sans-serif'; env.document.body.append(panel); }
            panel.textContent = text;
        };
        const save = r => gm.set(key, r);
        const validParent = (app,r) => fresh(r) && !app._destroyed && app._generation === r.generation &&
            app.settings.features.live && app.settings.features.videoPlayback && matches(r.ids,identities()) && app._nodeTitle(catalog.current()) === r.title && catalog.current()?.id === r.lesson;
        const returnCredit = (app,r) => {
            if (!fresh(r) || !matches(r.ids,identities()) || catalog.current()?.id !== r.lesson) return false;
            if (!['ended','verify','done'].includes(r.phase)) return false;
            if (r.phase === 'done') {
                if (app._priorProof(catalog.current())) return false;
                app.stopAutomation(); app._notify('回放会话已处理，但平台未确认完成；请手动核对，不会重复打开或刷新'); return true;
            }
            app.stopAutomation();
            if (app._priorProof(catalog.current())) { app._recordPacedLive?.(r); save({ ...r, phase:'done' }); app.run(); return true; }
            if (!r.refreshUsed) { save({ ...r, phase:'verify', refreshUsed:true }); env.location.reload(); return true; }
            app._notify('回放自然结束，但平台仍未确认完成；已停止，刷新不会重复执行'); return true;
        };
        const arm = app => {
            env.clearInterval(parentTimer);
            const tick = () => {
                const r = gm.get(key,null); if (r?.parentToken && r.parentToken !== instance) { env.clearInterval(parentTimer); if(listener != null){gm.unlisten(listener);listener=null;} return; } if (!fresh(r) || r.id !== owned || r.nonce !== parentNonce) { env.clearInterval(parentTimer); app._manualBusy=false; app._notify('回放会话过期或身份已变化，停止自动续课'); return; }
                if (!validParent(app,r)) { if (listener != null) { gm.unlisten(listener); listener=null; } if (!['ended','verify','done','cancelled'].includes(r.phase)) save({ ...r,phase:'cancelled' }); env.clearInterval(parentTimer); return; }
                if (r.phase === 'cancelled') { env.clearInterval(parentTimer); if(listener != null){gm.unlisten(listener);listener=null;} return; }
                if (r.phase === 'active') {
                    const pulse=gm.get(key+':child',null);
                    const last=pulse?.id===r.id&&pulse.nonce===r.nonce&&pulse.child===r.child&&pulse.at>=r.created ? pulse.at : r.childBoundAt;
                    if (!Number.isFinite(last)||now()-last>180000) { save({...r,phase:'cancelled',reason:'child-inactive'}); app._manualBusy=false; app._notify('回放子页已失联，未认定完成；可明确点击尝试执行重试'); return; }
                }
                if (r.phase === 'active' && now()-r.heartbeat>10000) { save({...r,heartbeat:now(),background:app.settings.features.background}); return; }
                if (r.phase === 'pending' && now()-r.created>120000) { save({...r,phase:'cancelled'}); app._manualBusy=false; app._notify('回放配对超时；可能是弹窗限制或页面标识不匹配，尚不能确认原因；可重试'); return; }
                if (r.phase === 'pending') {
                    const claim = gm.get(key+':claim',null);
                    if (claim && claim.id === r.id && claim.nonce === r.nonce && claim.created >= r.created && now()-claim.created < 120000 && matches(r.ids,claim.ids)) { acceptedChild=claim.child; save({ ...r,phase:'active',child:claim.child,childBoundAt:now(),seq:1 }); }
                }
                if (r.phase === 'ended' && r.seq === 2 && r.child === acceptedChild) { env.clearInterval(parentTimer); env.setTimeout(()=>{const terminal=gm.get(key,null);if(validParent(app,terminal))returnCredit(app,terminal);},2000); }
            };
            if (listener != null) gm.unlisten(listener);
            listener = gm.listen(key, tick); parentTimer=env.setInterval(tick,1000); tick();
        };
        const adopt = (app,r) => { owned=r.id;parentNonce=r.nonce;acceptedChild=r.child||null;save({...r,parentToken:instance,generation:app._generation});arm(app); };
        return {
            openingNotice() { const r=gm.get(key,null); return r?.id===owned&&r.autoRecovered ? '已恢复失效会话，已请求原生打开，正在等待 GM 子页配对' : '已请求打开原生回放，等待 GM 子页配对；配对后将自动核对平台信用'; },
            restore(app) { const r=gm.get(key,null); return returnCredit(app,r); },
            retryBlocked(app) {
                const r=gm.get(key,null); if(!fresh(r)||r.lesson!==catalog.current()?.id||!matches(r.ids,identities()))return false;
                const pulse=gm.get(key+':child',null), claim=gm.get(key+':claim',null);
                if(r.phase==='pending')return claim?.id===r.id&&claim.nonce===r.nonce&&now()-r.created<=120000;
                const last=pulse?.id===r.id&&pulse.nonce===r.nonce&&pulse.child===r.child?pulse.at:r.childBoundAt;
                return r.phase==='active'&&Number.isFinite(last)&&now()-last<=180000;
            },
            begin(app,task,scope,manual = false) {
                if (env.location.origin !== 'https://mooc1.chaoxing.com' || !scope.validateScope() || !app.settings.features.live) return false;
                const ids=identities();
                if (!ids?.course || (!ids.clazz && !ids.lesson)) { app._notify('回放会话缺少可匹配的课程/班级/章节标识，请手动打开和返回'); return manual; }
                let r=gm.get(key,null), recovered=false;
                if (r && r.lesson === catalog.current()?.id && matches(r.ids,ids)) {
                    if (['ended','verify','done'].includes(r.phase)) {
                        if (!returnCredit(app,r)) {
                            if (r.phase === 'done' && fresh(r) && app._priorProof(catalog.current())) {
                                if (!app._checkPriorCompletion?.()) { app.stopAutomation(); app._notify('既有平台信用暂未通过上下文验证，请明确重新检测；不会重新打开回放'); }
                            } else app._notify('已结束会话的信用确认已过期，请手动核对；不会重新播放');
                        }
                        return false;
                    }
                    const pulse=gm.get(key+':child',null);
                    const childLast=pulse?.id===r.id&&pulse.nonce===r.nonce&&pulse.child===r.child ? pulse.at : r.childBoundAt;
                    const abandoned=r.phase==='active'&&(!Number.isFinite(childLast)||now()-childLast>180000);
                    const recoverable=!fresh(r)||r.phase==='cancelled'||(r.phase==='pending'&&(now()-r.created>120000||!gm.get(key+':claim',null)))||abandoned;
                    const stale = !fresh(r) || r.phase === 'cancelled' || abandoned || (r.phase === 'pending' && now()-r.created>120000);
                    const claim=gm.get(key+':claim',null);
                    const viableClaim=fresh(r)&&r.phase==='pending'&&now()-r.created<=120000&&claim?.id===r.id&&claim.nonce===r.nonce&&now()-claim.created<=120000;
                    if (recoverable && !manual && stale && !viableClaim) {
                        const guards=(gm.get(key+':recovery',[]) || []).filter(item=>item.until>now());
                        if (guards.some(item=>item.lesson===r.lesson&&matches(item.ids,ids))) {
                            app._notify('本轮自动恢复额度已用完；请明确点击尝试执行重试'); return false;
                        }
                        gm.set(key+':recovery',[...guards,{lesson:r.lesson,ids,until:now()+600000}]);
                        save({...r,phase:'cancelled'});gm.remove(key+':claim');gm.remove(key+':child');r=null;
                        recovered=true; app._notify('已恢复失效回放会话，将请求原生打开并等待子页配对');
                    } else if (recoverable && manual && !viableClaim) { save({...r,phase:'cancelled'}); gm.remove(key+':claim'); gm.remove(key+':child'); r=null; }
                    else if (recoverable) { if(fresh(r)&&r.phase==='pending'&&!stale)adopt(app,r); app._notify('原生打开已请求，正在等待子页配对；新鲜会话不会被提前重置'); return false; }
                }
                if (fresh(r) && r.lesson === catalog.current()?.id && matches(r.ids,ids)) {
                    if (!manual && ['pending','active'].includes(r.phase)) { adopt(app,r); app._notify('保留现有回放会话，等待配对或播放结束；不会重复打开'); return false; }
                    if (['ended','verify','done'].includes(r.phase)) { if (!returnCredit(app,r) && r.phase === 'done' && app._priorProof(catalog.current())) app._checkPriorCompletion?.(); return false; }
                    if (manual && owned === r.id && r.phase === 'pending' && !r.manualRetried) { save({...r,generation:app._generation,manualRetried:true}); arm(app); return true; }
                    if (r.phase !== 'pending' || r.generation !== app._generation) { app._notify('该回放会话已打开或取消，请手动核对，禁止重复打开'); return false; }
                    if (owned === r.id) { app._notify('原生回放已请求打开；自动重复打开已取消，请使用手动重试'); return false; }
                    app._notify('已有待处理回放会话；请直接使用平台卡片，自动重复打开已禁用'); return false;
                }
                if (fresh(r) && ['pending','active'].includes(r.phase)) { app._notify('另一个回放会话仍有效，拒绝并行打开'); return false; }
                r={version:1,id:random(),nonce:random(),parentToken:instance,autoRecovered:recovered,ids,lesson:catalog.current().id,title:app._nodeTitle(catalog.current()),generation:app._generation,videoEnabled:app.settings.features.videoPlayback,background:app.settings.features.background,created:now(),heartbeat:now(),expires:now()+14400000,phase:'pending',seq:0,refreshUsed:false};
                owned=r.id; parentNonce=r.nonce; acceptedChild=null;
                env.addEventListener('pagehide',()=>{const current=gm.get(key,null);if(current?.id===owned&&['pending','active'].includes(current.phase))save({...current,phase:'cancelled'});});
                gm.remove(key+':claim'); gm.remove(key+':child'); save(r); arm(app); return true;
            },
            child(adapter) {
                if (env.location.origin !== 'https://zhibo.chaoxing.com' || !adapter.isRecognized()) return;
                const r=gm.get(key,null), ids=identities();
                if (!fresh(r) || r.phase !== 'pending' || now()-r.created>120000 || !matches(r.ids,ids)) { notice('回放未匹配唯一有效课程会话；请手动播放及返回'); return; }
                const existing=gm.get(key+':claim',null); if(existing?.id===r.id) { notice('回放会话已被其他标签页申请，拒绝重复接管'); return; }
                const child=random(), childHref=env.location.href; gm.set(key+':claim',{id:r.id,nonce:r.nonce,child,ids,created:now()});
                let player, initial, progressed=false, started=false, lastResume=0, playPending=false, attempted=false, lastPosition=0, lastProgress=now(), pulseSeq=0;
                const valid = () => { const current=gm.get(key,null); return fresh(current)&&current.id===r.id&&current.nonce===r.nonce&&current.child===child&&current.phase==='active'&&env.location.href===childHref&&now()-current.heartbeat<180000&&current.videoEnabled!==false&&matches(r.ids,identities())&&adapter.isRecognized(); };
                const finish = () => {
                    if(completed || !valid() || !player?.ended || !progressed || player!==adapter.getPlayer()) return;
                    completed=true;env.clearInterval(childTimer);const current=gm.get(key,null);save({...current,phase:'ended',seq:2});
                    notice('回放已自然结束；课程窗口将独立核对平台信用');
                    env.setTimeout(()=>{const terminal=gm.get(key,null);if(!fresh(terminal)||terminal.id!==r.id||terminal.child!==child||env.location.href!==childHref||!adapter.isRecognized()||adapter.getPlayer()!==player||!player.ended)return;try{gm.close();}catch(_){}env.setTimeout(()=>notice('浏览器未允许关闭，请手动关闭本回放标签页；不会重复打开'),1500);},2000);
                };
                const tick = () => {
                    const current=gm.get(key,null);
                    if(!fresh(current)||current.id!==r.id||!['pending','active'].includes(current.phase)){env.clearInterval(childTimer);return;}
                    if(current.phase==='pending'){notice('等待课程窗口确认回放会话');return;}
                    if(!valid()){env.clearInterval(childTimer);notice('会话身份或播放器已变化，停止自动控制');return;}
                    gm.set(key+':child',{id:r.id,nonce:r.nonce,child,at:now(),seq:++pulseSeq});
                    const candidate=adapter.getPlayer();
                    if(!started){
                        if(!candidate||candidate.ended){notice('已结束或未就绪的播放器不能证明本会话播放完成');return;}
                        player=candidate;initial=player.currentTime;started=true;player.addEventListener('ended',finish);
                        player.addEventListener('timeupdate',()=>{if(valid()&&player.currentTime>initial)progressed=true;});
                        env.addEventListener('pagehide',()=>{env.clearInterval(childTimer);player.removeEventListener('ended',finish);});
                    }
                    if(candidate!==player){env.clearInterval(childTimer);notice('播放器已替换，请手动处理');return;}
                    player.playbackRate=1;
                    if(player.currentTime>initial)progressed=true;
                    if(player.currentTime!==lastPosition){lastPosition=player.currentTime;lastProgress=now();}
                    if((player.paused||(current.background&&now()-lastProgress>7000))&&!player.ended&&!playPending&&(!attempted||current.background)&&now()-lastResume>1500){lastResume=now();attempted=true;playPending=true;Promise.resolve(player.play()).catch(()=>notice('浏览器拒绝回放播放，请点击原播放器；不会视为完成')).finally(()=>{playPending=false;});}
                    notice('已匹配课程会话，回放正常播放（1.0x），等待自然结束');
                };
                env.__xuexitongLiveChild={gmSession:true,dispose(){env.clearInterval(childTimer);if(player)player.removeEventListener('ended',finish);}};
                childTimer=env.setInterval(tick,1000);tick();
            },
        };
    }
})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
