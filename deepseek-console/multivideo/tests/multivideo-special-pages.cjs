const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const scriptPath = path.resolve(__dirname, '..', 'xuexitong-deepseek-1.8.4.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function installBrowserStubs(window) {
    window.unsafeWindow = window;
    window.AbortSignal = AbortSignal;
    window.GM_getValue = (key, fallback) => key === 'xuexitongDeepSeekApiKey'
        ? 'sk-test-value-that-is-not-real'
        : fallback;
    window.GM_setValue = () => {};
    window.GM_deleteValue = () => {};
    window.GM_registerMenuCommand = () => {};
    window.fetch = async () => { throw new Error('API should not be called in this test'); };
    window.Element.prototype.getClientRects = function () {
        return [{ width: 800, height: 500, top: 0, left: 0, right: 800, bottom: 500 }];
    };
    window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 500, top: 0, left: 0, right: 800, bottom: 500 };
    };
    window.jQuery = require('jquery')(window);
}

async function waitForApp(window) {
    for (let attempt = 0; attempt < 80; attempt++) {
        if (window.app) return window.app;
        await wait(50);
    }
    throw new Error('app initialization timed out');
}

function installPlayStub(window, video, plays) {
    video.play = async () => {
        plays.push(video.id || video.getAttribute('data-test-id') || 'video');
        video.dispatchEvent(new window.Event('play'));
    };
}

async function createApp(html, setupFrame = null) {
    const dom = new JSDOM(html, {
        url: 'https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=100&courseId=200',
        runScripts: 'outside-only',
    });
    const { window } = dom;
    installBrowserStubs(window);
    if (setupFrame) setupFrame(window);
    window.eval(source);
    const app = await waitForApp(window);
    return { dom, window, app };
}

function baseHtml(content) {
    return `<!doctype html><html><body>
        <div id="coursetree"><ul><li><ul>
            <li class="posCatalog_select posCatalog_active"><span class="posCatalog_name" title="5.2 测试视频">5.2</span></li>
            <li class="posCatalog_select"><span class="posCatalog_name" title="5.3 测试特殊页">5.3</span></li>
            <li class="posCatalog_select"><span class="posCatalog_name" title="5.4 测试完成">5.4</span></li>
        </ul></li></ul></div>
        ${content}
    </body></html>`;
}

async function testVideoDiscoveryAndDynamicQueue() {
    const plays = [];
    const { dom, window, app } = await createApp(baseHtml(`
        <div class="prev_title">视频</div>
        <video id="main-a" data-test-id="main-a"></video>
        <iframe id="frame-a"></iframe>
        <iframe id="frame-b"></iframe>
        <div id="shadow-host"></div>
    `), (win) => {
        const frameA = win.document.getElementById('frame-a');
        frameA.contentDocument.body.innerHTML = '<video id="frame-a-video" data-test-id="frame-a-video"></video>';
        const frameB = win.document.getElementById('frame-b');
        frameB.contentDocument.body.innerHTML = '<video id="frame-b-video" data-test-id="frame-b-video"></video>';
        const shadow = win.document.getElementById('shadow-host').attachShadow({ mode: 'open' });
        shadow.innerHTML = '<video id="shadow-video" data-test-id="shadow-video"></video>';
        for (const frame of [frameA, frameB]) {
            frame.contentWindow.Element.prototype.getClientRects = win.Element.prototype.getClientRects;
            frame.contentWindow.Element.prototype.getBoundingClientRect = win.Element.prototype.getBoundingClientRect;
        }
        installPlayStub(win, win.document.getElementById('main-a'), plays);
        installPlayStub(win, frameA.contentDocument.getElementById('frame-a-video'), plays);
        installPlayStub(win, frameB.contentDocument.getElementById('frame-b-video'), plays);
        installPlayStub(win, shadow.getElementById('shadow-video'), plays);
    });

    assert.equal(app._pageVideoEls.length, 4, 'main document, iframe and Shadow DOM videos must all be collected');
    const firstBindingCount = app._videoBindings.length;
    for (let i = 0; i < 5; i++) app._collectVideos();
    app._videoEventHandle();
    assert.equal(app._videoBindings.length, firstBindingCount, 'repeated scans must not duplicate event handlers');

    const dynamic = window.document.createElement('video');
    dynamic.id = 'main-b';
    dynamic.setAttribute('data-test-id', 'main-b');
    installPlayStub(window, dynamic, plays);
    window.document.body.appendChild(dynamic);
    assert.equal(app._collectVideos().length, 5, 'a late-inserted second video must be discovered');
    assert.equal(app._currentVideo, window.document.getElementById('main-a'));

    app.destroy();
    dom.window.close();
    console.log('PASS: multi-video discovery across main document, iframes and Shadow DOM');
    console.log('PASS: repeated scans are deduplicated and delayed videos are detected');
}

async function testSequentialQueueAndSingleNavigation() {
    const plays = [];
    const { dom, window, app } = await createApp(baseHtml(`
        <div class="prev_title">视频</div>
        <video id="part-a" data-test-id="part-a"></video>
    `), (win) => {
        installPlayStub(win, win.document.getElementById('part-a'), plays);
    });
    let navigations = 0;
    app.nextUnit = () => { navigations++; };
    app._currentVideo.pause = () => {};
    app._currentVideo.currentTime = 12;
    app._currentVideo.duration = 13;
    app._currentVideo.ended = true;
    app._currentVideo.dispatchEvent(new window.Event('ended'));
    assert.equal(navigations, 0, 'the first completed video must not navigate when it is the only known video yet');

    await wait(100);
    const second = window.document.createElement('video');
    second.id = 'part-b';
    second.setAttribute('data-test-id', 'part-b');
    installPlayStub(window, second, plays);
    window.document.body.appendChild(second);
    await wait(950);
    assert.equal(app._pageVideoEls.length, 2);
    assert.equal(app._currentVideo, second, 'the queue must switch to the second unfinished video');
    assert.ok(plays.includes('part-b'), 'the second video must actually be played');
    assert.equal(navigations, 0, 'finishing the first video must not leave the page');

    app._completeQueuedVideo(second, 'test-second-ended');
    app._completeQueuedVideo(second, 'duplicate-near-end');
    second.dispatchEvent(new window.Event('ended'));
    await wait(1900);
    assert.equal(navigations, 1, 'ended, near-end and duplicate events must result in exactly one navigation');

    app.destroy();
    dom.window.close();
    console.log('PASS: first video completes into the second video without premature navigation');
    console.log('PASS: ended/near-end duplicates navigate exactly once after the final segment');
}

async function testSpecialPageDetection() {
    const { dom, window, app } = await createApp(baseHtml(`
        <iframe id="course-content" src="about:blank?custom-widget=1"></iframe>
    `));
    const frame = window.document.getElementById('course-content');
    const writeFrame = (html) => {
        frame.contentDocument.open();
        frame.contentDocument.write(html);
        frame.contentDocument.close();
    };
    const writeAndClassify = async (html) => {
        writeFrame(html);
        await wait(20);
        return app._looksLikePassiveContentPage();
    };

    assert.equal(await writeAndClassify('<h1>普通图文</h1><p>这个 iframe 的地址没有 knowledge 或 video 标记，但正文完整可读。</p>'),
        true, 'an accessible content iframe must not depend on URL keywords');
    assert.equal(await writeAndClassify('<h1>学习任务</h1><p>开始学习。本页需要先阅读任务说明，再继续后续内容。</p>'),
        true, 'actionable task text is a special-page signal rather than an exclusion');
    assert.equal(await writeAndClassify('<body></body>'), false, 'an empty iframe is not a content page');

    frame.contentDocument.open();
    frame.contentDocument.write('<body></body>');
    frame.contentDocument.close();
    const main = window.document.createElement('div');
    main.className = 'course-content';
    main.textContent = '主文档中的课程说明正文。这里没有视频，也没有测验，但存在可读取的课程内容。';
    window.document.body.appendChild(main);
    assert.equal(app._looksLikePassiveContentPage(), true, 'main-document course content must be recognized');
    main.remove();
    window.document.body.appendChild(Object.assign(window.document.createElement('div'), {
        textContent: '侧栏目录很长，但这里不是课程正文。'.repeat(20),
    }));
    assert.equal(app._looksLikePassiveContentPage(), false, 'sidebar/body text must not masquerade as course content');

    const loading = window.document.createElement('div');
    loading.className = 'course-content';
    loading.textContent = '正在加载课程内容，请稍候';
    window.document.body.appendChild(loading);
    assert.equal(app._isLoadingPlaceholder(), true);
    assert.equal(app._looksLikePassiveContentPage(), false, 'loading placeholders should reset the node, not be auto-advanced immediately');

    loading.className = 'course-content';
    loading.textContent = '本页是任务说明，页面同时显示“视频”页签和 Next 按钮。';
    const videoTab = window.document.createElement('div');
    videoTab.className = 'prev_white';
    videoTab.textContent = '1 视频';
    const pageNext = window.document.createElement('button');
    pageNext.id = 'right1';
    pageNext.textContent = 'Next';
    let videoTabClicks = 0;
    let pageNextClicks = 0;
    videoTab.addEventListener('click', () => { videoTabClicks++; });
    pageNext.addEventListener('click', () => { pageNextClicks++; });
    window.document.body.append(videoTab, pageNext);
    app._stepSwitchPending = false;
    assert.equal(app._advanceLearningStep(), true);
    assert.equal(pageNextClicks, 1, 'special pages should use their own Next before retrying a video tab');
    assert.equal(videoTabClicks, 0, 'a special page with a video tab must not loop back to the video tab');

    app.destroy();
    dom.window.close();
    console.log('PASS: generic content iframes and main-document content are recognized');
    console.log('PASS: task, empty, sidebar-only and loading pages are separated');
}

async function testFallbackPriorityAndSingleAttempt() {
    const { dom, window, app } = await createApp(baseHtml(`
        <div class="prev_title">视频</div>
        <button id="right1">Next</button>
    `));
    app.play = async () => {};
    let pageNextClicks = 0;
    let frameNextClicks = 0;
    let catalogClicks = 0;
    window.document.getElementById('right1').addEventListener('click', () => { pageNextClicks++; });
    window.document.querySelectorAll('.posCatalog_name')[1].addEventListener('click', () => { catalogClicks++; });

    app._loadRetrySince = Date.now() - 16000;
    app._scheduleLoadRetry('15-second test');
    await wait(120);
    assert.equal(pageNextClicks, 1, 'the page Next button must be the first fallback');
    assert.equal(catalogClicks, 0);
    assert.equal(frameNextClicks, 0);

    app._loadRetrySince = Date.now() - 16000;
    app._scheduleLoadRetry('15-second duplicate test');
    await wait(120);
    assert.equal(pageNextClicks, 1, 'the same no-video node must run the automatic fallback only once');

    app._noVideoFallbackKey = '';
    window.document.getElementById('right1').remove();
    app._requestFrameNext = async () => { frameNextClicks++; return true; };
    app._loadRetrySince = Date.now() - 16000;
    app._scheduleLoadRetry('frame fallback test');
    await wait(120);
    assert.equal(frameNextClicks, 1, 'frame Next is used after the page-level Next is absent');
    assert.equal(catalogClicks, 0, 'catalog navigation must follow the frame fallback');

    app._noVideoFallbackKey = '';
    app._requestFrameNext = () => null;
    app._loadRetrySince = Date.now() - 16000;
    app._scheduleLoadRetry('catalog fallback test');
    await wait(120);
    assert.equal(catalogClicks, 1, 'catalog navigation is the final local fallback');
    assert.ok(app._noVideoFallbackKey.includes('视频'));

    app.destroy();
    dom.window.close();
    console.log('PASS: fallback order is page Next, iframe Next, then course catalog');
    console.log('PASS: one no-video node cannot trigger repeated automatic fallbacks');
}

async function testWatchedUnitSkip() {
    const completedPlays = [];
    const completed = await createApp(baseHtml(`
        <div class="prev_title">视频</div>
        <video id="watched-video"></video>
    `).replace(
        'class="posCatalog_select posCatalog_active"><span class="posCatalog_name" title="5.2 测试视频">5.2</span>',
        'class="posCatalog_select posCatalog_active"><span class="posCatalog_name" title="5.2 测试视频">5.2</span><span class="icon_Completed"></span>',
    ), (win) => {
        const video = win.document.getElementById('watched-video');
        Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
        Object.defineProperty(video, 'currentTime', { configurable: true, value: 100 });
        Object.defineProperty(video, 'paused', { configurable: true, value: true });
        installPlayStub(win, video, completedPlays);
    });
    completed.app._nextUnitPending = true;
    await wait(380);
    assert.equal(completedPlays.length, 0, 'a completed sidebar node must be skipped without starting playback');
    assert.match(completed.app._watchSkipKey, /5\.2 测试视频/);
    assert.match(
        completed.window.document.getElementById('xuexitong-deepseek-status').textContent,
        /已标记当前小节完成|正在跳到下一项/,
    );
    completed.app.destroy();
    completed.dom.window.close();

    const nearEndPlays = [];
    const nearEnd = await createApp(baseHtml(`
        <div class="prev_title">视频</div>
        <video id="near-end-video"></video>
    `), (win) => {
        const video = win.document.getElementById('near-end-video');
        Object.defineProperty(video, 'duration', { configurable: true, value: 600 });
        Object.defineProperty(video, 'currentTime', { configurable: true, value: 599.5 });
        Object.defineProperty(video, 'paused', { configurable: true, value: true });
        installPlayStub(win, video, nearEndPlays);
    });
    nearEnd.app._nextUnitPending = true;
    await wait(380);
    assert.equal(nearEndPlays.length, 0, 'a video already at its end must be skipped');
    assert.match(nearEnd.app._watchSkipKey, /5\.2 测试视频/);
    assert.equal(
        nearEnd.app._videoIsCompleted({
            ended: false,
            duration: 100,
            currentTime: 50,
            paused: true,
            querySelector: () => null,
            parentElement: null,
            parentNode: null,
        }),
        false,
        'a partially watched video must still play normally',
    );
    nearEnd.app.destroy();
    nearEnd.dom.window.close();

    console.log('PASS: completed sidebar nodes and near-end videos are skipped without replay');
    console.log('PASS: partially watched videos remain eligible for playback');
}

async function testLazyMultiVideoSlot() {
    const plays = [];
    const { dom, window, app } = await createApp(baseHtml(`
        <div class="prev_title">视频</div>
        <iframe id="course-module" src="about:blank#knowledge/cards"></iframe>
    `), (win) => {
        const moduleFrame = win.document.getElementById('course-module');
        moduleFrame.contentDocument.open();
        moduleFrame.contentDocument.write(`
            <div class="ans-attach-ct" id="video-card-a">
                <iframe class="ans-insertvideo-online" id="video-slot-a"></iframe>
            </div>
            <div class="ans-attach-ct" id="video-card-b" style="display:none">
                <iframe class="ans-insertvideo-online" id="video-slot-b"></iframe>
            </div>
        `);
        moduleFrame.contentDocument.close();
        moduleFrame.contentWindow.Element.prototype.getClientRects = win.Element.prototype.getClientRects;
        moduleFrame.contentWindow.Element.prototype.getBoundingClientRect = win.Element.prototype.getBoundingClientRect;
        const slotA = moduleFrame.contentDocument.getElementById('video-slot-a');
        slotA.contentDocument.body.innerHTML = '<video id="video_html5_api" data-test-id="lazy-first"></video>';
        installPlayStub(win, slotA.contentDocument.getElementById('video_html5_api'), plays);
        const cardB = moduleFrame.contentDocument.getElementById('video-card-b');
        const slotB = moduleFrame.contentDocument.getElementById('video-slot-b');
        slotB.contentWindow.HTMLMediaElement.prototype.play = async function () {
            plays.push(this.getAttribute('data-test-id') || 'lazy-second');
            this.dispatchEvent(new win.Event('play'));
        };
        cardB.addEventListener('click', () => {
            slotB.contentDocument.body.innerHTML = '<video id="video_html5_api" data-test-id="lazy-second"></video>';
            cardB.style.display = 'block';
        });
    });

    let navigations = 0;
    app.nextUnit = () => { navigations++; };
    const firstVideo = app._currentVideo;
    assert.equal(app._pageVideoEls.length, 1, 'the second Chaoxing video slot is initially lazy');
    app._completeQueuedVideo(firstVideo, 'lazy-first-ended');
    await wait(2200);
    assert.equal(app._pageVideoEls.length, 2, 'the lower video slot must be activated and loaded');
    assert.ok(plays.includes('lazy-second'), 'the lower video must start automatically');
    assert.equal(navigations, 0, 'the page must not navigate while the lower video remains');
    assert.equal(app._currentVideo?.getAttribute('data-test-id'), 'lazy-second');

    app.destroy();
    dom.window.close();
    console.log('PASS: hidden Chaoxing video cards are activated and the lower video plays');
    console.log('PASS: lazy multi-video pages do not skip directly to the next unit');
}

async function testSharedContainerCompletionIsolation() {
    const plays = [];
    const { dom, window, app } = await createApp(baseHtml(`
        <div class="prev_title">视频</div>
        <div class="ans-attach-ct" id="shared-video-card">
            <div class="icon_Completed" aria-label="任务点已完成"></div>
            <video id="shared-a" data-test-id="shared-a"></video>
            <video id="shared-b" data-test-id="shared-b"></video>
        </div>
    `), (win) => {
        installPlayStub(win, win.document.getElementById('shared-a'), plays);
        installPlayStub(win, win.document.getElementById('shared-b'), plays);
    });
    let navigations = 0;
    app.nextUnit = () => { navigations++; };
    const first = window.document.getElementById('shared-a');
    const second = window.document.getElementById('shared-b');
    assert.equal(app._videoIsCompleted(first), false, 'a shared page-level completion icon must not mark video A complete');
    assert.equal(app._videoIsCompleted(second), false, 'a shared page-level completion icon must not mark video B complete');

    app._completeQueuedVideo(first, 'shared-first-ended');
    await wait(100);
    assert.equal(app._currentVideo, second, 'the second video in the shared container must be selected');
    assert.ok(plays.includes('shared-b'));
    assert.equal(navigations, 0);

    app.destroy();
    dom.window.close();
    console.log('PASS: shared completion markers no longer contaminate sibling videos');
}

async function testAdjacentTaskHeaderCompletion() {
    const plays = [];
    const { dom, window, app } = await createApp(baseHtml(`
        <div class="prev_title">视频</div>
        <div class="video-card" id="task-card-a">
            <div><span class="icon_Completed"></span> 任务点已完成</div>
            <iframe class="ans-insertvideo-online" id="task-video-a"></iframe>
        </div>
        <div class="video-card" id="task-card-b">
            <div>任务点 完成条件：观看时长不少于总时长的90%</div>
            <iframe class="ans-insertvideo-online" id="task-video-b"></iframe>
        </div>
    `), (win) => {
        const frameA = win.document.getElementById('task-video-a');
        frameA.contentWindow.HTMLMediaElement.prototype.play = async function () {
            plays.push(this.getAttribute('data-test-id') || 'header-first');
            this.dispatchEvent(new win.Event('play'));
        };
        frameA.contentDocument.body.innerHTML = '<video id="video_html5_api" data-test-id="header-first"></video>';
        const frameB = win.document.getElementById('task-video-b');
        frameB.contentWindow.HTMLMediaElement.prototype.play = async function () {
            plays.push(this.getAttribute('data-test-id') || 'header-second');
            this.dispatchEvent(new win.Event('play'));
        };
        frameB.contentDocument.body.innerHTML = '<video id="video_html5_api" data-test-id="header-second"></video>';
    });
    await wait(100);
    assert.ok(!plays.includes('header-first'), 'the video under the completed task header must not replay');
    assert.ok(plays.includes('header-second'), 'the lower unfinished task video must play');
    assert.equal(app._currentVideo?.getAttribute('data-test-id'), 'header-second');

    app.destroy();
    dom.window.close();
    console.log('PASS: adjacent task headers select the first unfinished video');
}

async function testNearbyTaskMarkerWithoutCardClass() {
    const plays = [];
    const { dom, window, app } = await createApp(baseHtml(`
        <div class="prev_title">视频</div>
        <div id="shared-results">
            <div><span class="icon_Completed"></span> 任务点已完成</div>
            <div><iframe class="ans-insertvideo-online" id="plain-video-a"></iframe></div>
            <div>任务点 完成条件：观看时长不少于总时长的90%</div>
            <div><iframe class="ans-insertvideo-online" id="plain-video-b"></iframe></div>
        </div>
    `), (win) => {
        const frameA = win.document.getElementById('plain-video-a');
        frameA.contentWindow.HTMLMediaElement.prototype.play = async function () {
            plays.push(this.getAttribute('data-test-id') || 'plain-first');
            this.dispatchEvent(new win.Event('play'));
        };
        frameA.contentDocument.body.innerHTML = '<video id="video_html5_api" data-test-id="plain-first"></video>';
        const frameB = win.document.getElementById('plain-video-b');
        frameB.contentWindow.HTMLMediaElement.prototype.play = async function () {
            plays.push(this.getAttribute('data-test-id') || 'plain-second');
            this.dispatchEvent(new win.Event('play'));
        };
        frameB.contentDocument.body.innerHTML = '<video id="video_html5_api" data-test-id="plain-second"></video>';
    });
    await wait(100);
    assert.ok(!plays.includes('plain-first'), 'the video after a completed plain header must be skipped');
    assert.ok(plays.includes('plain-second'), 'the video after the unfinished plain header must play');
    assert.equal(app._currentVideo?.getAttribute('data-test-id'), 'plain-second');

    app.destroy();
    dom.window.close();
    console.log('PASS: ordinary sibling task headers pair with the correct videos');
}

async function main() {
    assert.match(source, /@version\s+1\.8\.4/);
    assert.doesNotMatch(source, /playbackRate/);
    assert.match(source, /app\._catalogClickingUntil = Date\.now\(\) \+ 3000/);
    assert.match(source, /_pageVideoEls/);
    assert.match(source, /_completeQueuedVideo/);
    assert.match(source, /_runNavigationFallback/);
    assert.match(source, /waitedSeconds >= 15/);
    assert.doesNotMatch(source, /等待 120 秒/);

    await testVideoDiscoveryAndDynamicQueue();
    await testSequentialQueueAndSingleNavigation();
    await testSpecialPageDetection();
    await testFallbackPriorityAndSingleAttempt();
    await testWatchedUnitSkip();
    await testLazyMultiVideoSlot();
    await testSharedContainerCompletionIsolation();
    await testAdjacentTaskHeaderCompletion();
    await testNearbyTaskMarkerWithoutCardClass();
    console.log('ALL PASS: 1.8.4 multi-video and special-page stress tests');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
