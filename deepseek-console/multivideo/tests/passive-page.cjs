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
                        <li class="posCatalog_select posCatalog_active">
                            <span class="posCatalog_name" title="13.1 健康与健康行为">13.1</span>
                        </li>
                        <li class="posCatalog_select">
                            <span class="posCatalog_name" title="13.2 合理膳食与健康促进">13.2</span>
                            <span class="icon_Completed"></span>
                        </li>
                        <li class="posCatalog_select">
                            <span class="posCatalog_name" title="13.3 健康的概念">13.3</span>
                        </li>
                    </ul>
                </li>
            </ul>
        </div>
        <div class="prev_title">健康与健康行为</div>
        <iframe id="course-content" src="about:blank#knowledge/cards"></iframe>
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
    const storedValues = new Map();
    window.GM_setValue = (key, value) => { storedValues.set(key, value); };
    window.GM_deleteValue = () => {};
    window.GM_registerMenuCommand = () => {};
    window.Element.prototype.getClientRects = function () {
        return [{ width: 800, height: 500, top: 0, left: 0, right: 800, bottom: 500 }];
    };
    window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 500, top: 0, left: 0, right: 800, bottom: 500 };
    };
    window.jQuery = require('jquery')(window);
    window.fetch = async () => {
        throw new Error('API must not be needed for a confirmed passive page');
    };

    const frame = window.document.getElementById('course-content');
    frame.contentDocument.open();
    frame.contentDocument.write('<article><h1>健康与健康行为</h1><p>此课程无直播课，本页为课程说明和资料介绍。</p><p>没有播放、提交或上传任务。</p></article>');
    frame.contentDocument.close();

    window.eval(source);
    await wait(1200);

    const app = window.app;
    assert.ok(app, 'app should initialize');
    assert.equal(app._activeCatalogTitle(), '13.1 健康与健康行为');
    assert.equal(app._looksLikePassiveContentPage(), true);

    let activeNodeClicks = 0;
    const activeName = window.document.querySelector('.posCatalog_active .posCatalog_name');
    activeName.addEventListener('click', () => { activeNodeClicks++; });
    let nextClicks = 0;
    const nextName = window.document.querySelectorAll('.posCatalog_name')[2];
    nextName.addEventListener('click', () => {
        nextClicks++;
        window.document.querySelector('.posCatalog_active')?.classList.remove('posCatalog_active');
        nextName.closest('.posCatalog_select').classList.add('posCatalog_active');
    });

    app._loadRetrySince = Date.now() - 4000;
    app._loadRetryCount = 2;
    app._scheduleLoadRetry('特殊图文页面');
    await wait(100);
    assert.equal(activeNodeClicks, 0, 'passive page must not reload the active node at 4 seconds');
    assert.match(window.document.getElementById('xuexitong-deepseek-status').textContent, /图文信息页已识别/);

    app._loadRetrySince = Date.now() - 16000;
    app._loadRetryCount = 8;
    app._scheduleLoadRetry('特殊图文页面');
    await wait(100);

    assert.equal(nextClicks, 1, 'passive page should advance by clicking the next non-completed node');
    assert.equal(app._activeCatalogTitle(), '13.3 健康的概念');
    assert.match(window.document.getElementById('xuexitong-deepseek-status').textContent, /图文信息页|切换|下一节点/);
    const diagnostic = JSON.parse(storedValues.get('xuexitongDeepSeekLastDiagnostic'));
    assert.equal(diagnostic.scriptVersion, '1.8.4');
    assert.equal(diagnostic.specialContentPage, true);

    app.destroy();
    dom.window.close();
    console.log('PASS: passive information page classified without API');
    console.log('PASS: passive page does not reload-loop at four seconds');
    console.log('PASS: completed sidebar nodes are skipped');
    console.log('PASS: 15-second fallback advances to the first unfinished node');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
