const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const scriptPath = path.resolve(__dirname, '..', 'xuexitong-deepseek-1.8.4.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    const dom = new JSDOM(`<!doctype html><html><body>
        <div id="coursetree">
            <ul>
                <li>
                    <ul>
                        <li class="posCatalog_select"><span class="posCatalog_name" title="5.2 顺手牵羊">5.2</span></li>
                        <li class="posCatalog_select posCatalog_active"><span class="posCatalog_name" title="5.3 浑水摸鱼">5.3</span></li>
                        <li class="posCatalog_select"><span class="posCatalog_name" title="5.4 防范偷盗两三招">5.4</span></li>
                    </ul>
                </li>
            </ul>
        </div>
        <div class="prev_title">视频</div>
        <div class="prev_white">1 视频</div>
        <div class="prev_white">2 章节测验</div>
    </body></html>`, {
        url: 'https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=1256335724&courseId=267617372',
        runScripts: 'outside-only',
    });
    const { window } = dom;
    window.unsafeWindow = window;
    window.AbortSignal = AbortSignal;
    window.GM_getValue = (key, fallback) => key === 'xuexitongDeepSeekApiKey'
        ? 'sk-test-value-that-is-not-real'
        : fallback;
    window.GM_setValue = () => {};
    window.GM_deleteValue = () => {};
    window.GM_registerMenuCommand = () => {};
    window.Element.prototype.getClientRects = function () {
        return [{ width: 100, height: 30, top: 0, left: 0, right: 100, bottom: 30 }];
    };
    window.Element.prototype.getBoundingClientRect = function () {
        return { width: 100, height: 30, top: 0, left: 0, right: 100, bottom: 30 };
    };
    let apiCalls = 0;
    window.fetch = async () => {
        apiCalls++;
        return {
            ok: true,
            status: 200,
            json: async () => ({
                choices: [{
                    finish_reason: 'stop',
                    message: { content: JSON.stringify({ action: 'reload_current', reason: '当前节点内容为空' }) },
                }],
            }),
        };
    };
    window.jQuery = require('jquery')(window);

    window.eval(source);
    await wait(1200);

    const app = window.app;
    assert.ok(app, 'app should initialize');
    assert.equal(app._activeCatalogTitle(), '5.3 浑水摸鱼');
    assert.equal(app._hasVisibleContentFrame(), false);

    let reloadClicks = 0;
    const activeName = window.document.querySelector('.posCatalog_active .posCatalog_name');
    activeName.addEventListener('click', () => { reloadClicks++; });

    let firstNextClicks = 0;
    let secondNextClicks = 0;
    const firstNext = window.document.createElement('div');
    firstNext.id = 'prevNextFocusNext';
    firstNext.textContent = 'Next';
    firstNext.addEventListener('click', () => { firstNextClicks++; });
    const secondNext = window.document.createElement('div');
    secondNext.className = 'nextChapter';
    secondNext.textContent = 'Next';
    secondNext.addEventListener('click', () => { secondNextClicks++; });
    window.document.body.append(firstNext, secondNext);
    const controls = app._findNextControls();
    assert.ok(controls.length >= 2, 'both visible next controls should be discovered');
    app._clickNextControl(firstNext, true);
    app._clickNextControl(secondNext, false);
    assert.equal(firstNextClicks, 1);
    assert.equal(secondNextClicks, 1);
    for (let i = 0; i < 100; i++) {
        app._clickNextControl(i % 2 === 0 ? firstNext : secondNext, i % 3 === 0);
    }
    assert.equal(firstNextClicks, 51);
    assert.equal(secondNextClicks, 51);
    firstNext.setAttribute('aria-disabled', 'true');
    assert.notEqual(app._findNextButton(), firstNext, 'disabled next control must be skipped');

    assert.equal(app._quizCompleted(), false);
    const completedIcon = window.document.createElement('span');
    completedIcon.className = 'icon_Completed';
    window.document.querySelector('.posCatalog_active').appendChild(completedIcon);
    assert.equal(app._quizCompleted(), true);

    app._loadRetrySince = Date.now() - 8000;
    app._loadRetryCount = 4;
    app._scheduleLoadRetry('目录已切换但内容尚未加载');
    assert.match(window.document.getElementById('xuexitong-deepseek-status').textContent, /重新加载当前节点/);
    await wait(100);
    assert.ok(reloadClicks >= 1, 'a blank node should be reloaded once before the 15-second fallback');
    assert.match(window.document.getElementById('xuexitong-deepseek-status').textContent, /重新加载当前节点/);
    assert.equal(apiCalls, 0, 'the API must not be called before local fallbacks are exhausted');

    const originalAdvanceViaCourseTree = app._advanceViaCourseTree;
    const originalRequestFrameNext = app._requestFrameNext;
    app._advanceViaCourseTree = () => false;
    app._requestFrameNext = () => null;
    firstNext.setAttribute('aria-disabled', 'true');
    secondNext.setAttribute('aria-disabled', 'true');
    app._loadRetrySince = Date.now() - 16000;
    app._loadRetryCount = 8;
    app._scheduleLoadRetry('目录已切换但内容尚未加载');
    await wait(200);
    assert.equal(apiCalls, 1, '15-second fallback should call the API only after local navigation fails');
    assert.equal(reloadClicks, 1, 'the active-node reload must not loop');
    app._advanceViaCourseTree = originalAdvanceViaCourseTree;
    app._requestFrameNext = originalRequestFrameNext;

    firstNext.removeAttribute('aria-disabled');
    secondNext.removeAttribute('aria-disabled');
    firstNext.addEventListener('click', () => {
        window.document.querySelector('.posCatalog_active')?.classList.remove('posCatalog_active');
        window.document.querySelectorAll('.posCatalog_select')[2]?.classList.add('posCatalog_active');
    });
    const clicksBeforeNextStep = firstNextClicks;
    await app._goToNextStep();
    await wait(150);
    assert.equal(firstNextClicks, clicksBeforeNextStep + 1);
    assert.equal(app._activeCatalogTitle(), '5.4 防范偷盗两三招');

    app.destroy();
    dom.window.close();
    console.log('PASS: blank 5.3 false-navigation detection');
    console.log('PASS: active-node retry and API-guided reload_current');
    console.log('PASS: status rendering and duplicate-recovery guard');
    console.log('PASS: native/event next-button rotation and disabled-button filtering');
    console.log('PASS: 5.2 next-button click changes the active course node');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
