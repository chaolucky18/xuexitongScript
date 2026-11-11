const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const scriptPath = path.resolve(__dirname, '..', 'xuexitong-deepseek-1.8.4.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function between(startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0 && end > start, `missing ${startMarker}`);
    return source.slice(start, end);
}

async function main() {
    const dom = new JSDOM(`<!doctype html><html><body>
        <div id="coursetree"><ul><li><ul>
            <li class="posCatalog_select posCatalog_active"><span class="posCatalog_name" title="13.1 健康与健康行为">13.1</span></li>
        </ul></li></ul></div>
        <div class="prev_title">视频</div>
        <iframe id="course-content" src="about:blank?num=0#/knowledge/cards"></iframe>
    </body></html>`, {
        url: 'https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=1&courseId=2',
        runScripts: 'outside-only',
    });
    const { window } = dom;
    const frame = window.document.getElementById('course-content');
    frame.contentDocument.open();
    frame.contentDocument.write('<body><article><h1>健康与健康行为</h1><p>此课程无直播课</p></article><button id="frame-next">Next</button></body>');
    frame.contentDocument.close();
    let clicks = 0;
    frame.contentDocument.getElementById('frame-next').addEventListener('click', () => { clicks++; });

    window.unsafeWindow = window;
    window.AbortSignal = AbortSignal;
    window.GM_getValue = (key, fallback) => key === 'xuexitongDeepSeekApiKey'
        ? 'sk-test-value-that-is-not-real'
        : fallback;
    const storedValues = new Map();
    window.GM_setValue = (key, value) => { storedValues.set(key, value); };
    window.GM_deleteValue = () => {};
    window.GM_registerMenuCommand = () => {};
    frame.contentWindow.FRAME_DIAGNOSTIC_STORAGE = 'xuexitongDeepSeekLastFrameDiagnostic';
    frame.contentWindow.GM_setValue = (key, value) => { storedValues.set(key, value); };
    window.Element.prototype.getClientRects = function () {
        return [{ width: 800, height: 500, top: 0, left: 0, right: 800, bottom: 500 }];
    };
    frame.contentWindow.Element.prototype.getClientRects = window.Element.prototype.getClientRects;
    window.jQuery = require('jquery')(window);
    window.fetch = async () => { throw new Error('API should not be needed'); };

    const bridgeSource = between('function installChaoxingFrameBridge()', 'function setScriptStatus');
    frame.contentWindow.eval(`(${bridgeSource})();`);
    window.eval(source);
    await wait(1200);

    const app = window.app;
    assert.ok(app, 'top app should initialize');
    const clicked = await app._requestFrameNext();
    assert.equal(clicked, true);
    assert.equal(clicks, 1);
    const diagnostic = JSON.parse(storedValues.get('xuexitongDeepSeekLastFrameDiagnostic'));
    assert.match(diagnostic.url, /^about:blank/);
    assert.ok(diagnostic.visibleControlLabels.includes('Next'));

    app.destroy();
    dom.window.close();
    console.log('PASS: frame bridge receives click_next request');
    console.log('PASS: nested iframe Next button is clicked');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
