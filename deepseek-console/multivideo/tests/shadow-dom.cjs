const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const scriptPath = path.resolve(__dirname, '..', 'xuexitong-deepseek-1.8.4.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    const dom = new JSDOM(`<!doctype html><html><body>
        <div id="coursetree"><ul><li><ul>
            <li class="posCatalog_select posCatalog_active"><span class="posCatalog_name" title="13.1 健康与健康行为">13.1</span></li>
            <li class="posCatalog_select"><span class="posCatalog_name" title="13.2 合理膳食与健康促进">13.2</span></li>
        </ul></li></ul></div>
        <div class="prev_title">视频</div>
        <iframe id="course-content" src="about:blank?num=0#/knowledge/cards"></iframe>
    </body></html>`, {
        url: 'https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=1&courseId=2',
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
        return [{ width: 800, height: 500, top: 0, left: 0, right: 800, bottom: 500 }];
    };
    window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 500, top: 0, left: 0, right: 800, bottom: 500 };
    };
    window.jQuery = require('jquery')(window);
    window.fetch = async () => { throw new Error('API should not be needed'); };

    const frame = window.document.getElementById('course-content');
    frame.contentDocument.open();
    frame.contentDocument.write('<body></body>');
    frame.contentDocument.close();
    frame.contentWindow.Element.prototype.getClientRects = function () {
        return [{ width: 200, height: 40, top: 0, left: 0, right: 200, bottom: 40 }];
    };
    frame.contentWindow.Element.prototype.getBoundingClientRect = function () {
        return { width: 200, height: 40, top: 0, left: 0, right: 200, bottom: 40 };
    };
    const host = frame.contentDocument.createElement('div');
    frame.contentDocument.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
        <article>
            <h1>健康与健康行为</h1>
            <p>此课程无直播课。你需要输入邀请码进入尔雅直播圈。</p>
            <p>掌握直播信息、观看多样直播、提问尔雅名师。</p>
        </article>
        <button id="shadow-next">Next</button>`;
    let clicks = 0;
    shadow.getElementById('shadow-next').addEventListener('click', () => { clicks++; });

    window.eval(source);
    await wait(3500);

    const app = window.app;
    assert.ok(app, 'app should initialize');
    assert.equal(app._looksLikePassiveContentPage(), true);
    assert.ok(app._findNextButton(), 'Next inside open Shadow DOM should be found');
    assert.equal(clicks, 1, 'special information page should click its own Next');
    window.dispatchEvent(new window.Event('focus'));
    assert.doesNotMatch(
        window.document.getElementById('xuexitong-deepseek-status').textContent,
        /正在立即检查测验/,
        'focus must not overwrite a non-quiz page with a quiz status',
    );
    assert.match(window.document.getElementById('xuexitong-deepseek-status').textContent, /特殊信息页|等待|API/);

    app.destroy();
    dom.window.close();
    console.log('PASS: deep Shadow DOM Next button discovery');
    console.log('PASS: special information page clicks its own Next');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
