import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
const require = createRequire(import.meta.url);
const createSurveyFlow = require('../survey-flow.cjs');
const titles = ['知识量（课程内容是否充实，有价值）', '趣味性（教学过程是否有趣，吸引人）',
    '教师参与（教师是否积极参与交流和互动）', '课程设计（课程是否合理，形式丰富）'];
function setup(rule = {scores: [5, 4, 3, 2], comment: '暂无建议'}) {
    const dom = new JSDOM('<div class="voteContainer" hidden><iframe id="voteIframe"></iframe></div>',
        {url: 'https://mooc1.chaoxing.com/mycourse/studentstudy?courseId=10&chapterId=101'});
    const entry = new JSDOM('<div id="render">课程章节内容评价</div>',
        {url: 'https://mooc1.chaoxing.com/ananas/modules/zt/vote/index-pc-new.html'});
    const root = dom.window.document, doc = root.querySelector('iframe').contentDocument;
    doc.body.innerHTML = titles.map(title => `<div class="question-item"><div class="topic-title"><span class="topic-txt">${title}</span></div>${[5,4,3,2,1].map(score => `<label role="radio" aria-checked="false"><input type="radio">${score}分</label>`).join('')}</div>`).join('') +
        '<div class="question-item"><span class="topic-txt">其他建议</span><textarea></textarea></div><a id="submitSuccess">提交</a><a class="icon-back">返回</a>';
    let opened = 0, submitted = 0, next = 0, done = false, held = 0, status = '', clock = 0, active = true, autoSubmit = true;
    let navigationPending = false;
    entry.window.checkJobFinish = () => done;
    entry.window.document.querySelector('#render').onclick = () => {
        opened++; root.querySelector('.voteContainer').hidden = false;
    };
    for (const item of doc.querySelectorAll('.question-item')) for (const radio of item.querySelectorAll('[role=radio]')) {
        radio.onclick = () => {
            for (const other of item.querySelectorAll('[role=radio]')) other.setAttribute('aria-checked', String(other === radio));
        };
    }
    doc.querySelector('#submitSuccess').onclick = () => { submitted++; };
    doc.querySelector('.icon-back').onclick = () => { root.querySelector('.voteContainer').hidden = true; };
    const visible = element => Boolean(element?.isConnected && !element.closest('[hidden]'));
    const flow = createSurveyFlow({root, core: {documents: () => [root, entry.window.document], visible,
        clean: s => String(s || '').replace(/\s+/g, ' ').trim()}, isActive: () => active,
        getRule: () => rule, isAutoSubmit: () => autoSubmit, onHold: () => { held++; },
        onStatus: text => { status = text; }, onComplete: () => {
            if (!navigationPending) { next++; navigationPending = true; }
        }, now: () => clock});
    return {root, doc, flow, setDone: () => { done = true; }, advance: ms => { clock += ms; },
        stop: () => {active = false;}, manualSubmit: () => {autoSubmit = false;},
        finishNavigation: () => {navigationPending = false;},
        counts: () => ({opened, submitted, next, held}), status: () => status,
        close: () => {dom.window.close();entry.window.close();}};
}
{
    const p = setup();
    assert.equal(p.flow.observe(), true);
    assert.equal(p.counts().opened, 1);
    p.flow.observe(); p.flow.observe();
    assert.equal(p.counts().opened, 1);
    assert.equal(p.counts().submitted, 1);
    assert.equal(p.counts().next, 0, 'Filling and clicking submit do not prove completion');
    assert.equal(p.doc.querySelector('textarea').value, '暂无建议');
    assert.deepEqual([...p.doc.querySelectorAll('[aria-checked=true]')].map(e => e.textContent), ['5分', '4分', '3分', '2分']);
    p.setDone(); p.flow.observe(); p.flow.observe();
    assert.equal(p.counts().next, 1);
    assert.equal(p.root.querySelector('.voteContainer').hidden, true);
    p.close();
}
{
    const p = setup(); p.flow.observe(); p.flow.observe();
    p.setDone(); p.flow.observe();
    assert.equal(p.counts().next, 1);
    p.root.querySelector('.voteContainer').hidden = true;
    p.finishNavigation();
    p.flow.observe();
    assert.equal(p.counts().next, 2, 'Navigation must be retried if the completed survey has no entry frame');
    assert.equal(p.flow.present(), true, 'Playback stays paused until the section actually changes');
    p.close();
}
{
    const p = setup(null); p.flow.observe(); p.flow.observe();
    assert.equal(p.counts().submitted, 0);
    assert.equal(p.doc.querySelector('[aria-checked=true]'), null);
    assert.match(p.status(), /问卷评分设置|手动/); p.close();
}
{
    const p = setup(); p.doc.querySelector('.topic-txt').textContent = '不认识的个人信息问卷';
    p.flow.observe(); p.flow.observe();
    assert.equal(p.counts().submitted, 0);
    assert.equal(p.doc.querySelector('[aria-checked=true]'), null);
    assert.match(p.status(), /不匹配|不支持/); p.close();
}
{
    const p = setup(); p.flow.observe(); p.flow.observe(); p.flow.observe();
    p.advance(120001); p.flow.observe();
    assert.match(p.status(), /未确认|超时/);
    assert.equal(p.counts().submitted, 1);
    assert.equal(p.counts().next, 0); p.close();
}
{
    const p = setup();
    assert.equal(p.flow.resultComplete({
        location: {pathname: '/questionnaire/studentQuestionChapter'},
        body: {innerText: '课程章节内容评价 已交 我的答案: 暂无建议'},
        querySelector: () => null,
    }), true, 'The submitted-result page must be accepted as completion evidence');
    assert.equal(p.flow.resultComplete({
        location: {pathname: '/questionnaire/studentQuestionChapter'},
        body: {innerText: '课程章节内容评价 已交'},
        querySelector: () => ({}),
    }), false, 'An editable result page is not completed evidence');
    p.close();
}
{
    const p = setup(); p.manualSubmit(); p.flow.observe(); p.flow.observe(); p.flow.observe();
    assert.equal(p.counts().submitted, 0); assert.match(p.status(), /手动提交/); p.close();
}
{
    const p = setup(); p.flow.observe(); p.flow.observe(); p.stop(); p.flow.observe();
    assert.equal(p.counts().submitted, 0); p.close();
}
{
    const p = setup(); p.doc.querySelector('[role=radio]:nth-of-type(2)').click();
    p.flow.observe(); p.flow.observe();
    assert.equal(p.counts().submitted, 0); assert.match(p.status(), /未覆盖/); p.close();
}
{
    const p = setup(); p.root.querySelector('iframe').setAttribute('src', '/mooc-ans/api/work?knowledgeid=999');
    p.flow.observe(); p.flow.observe(); p.flow.observe();
    assert.equal(p.counts().submitted, 0, 'An old questionnaire must not use the current section rule'); p.close();
}
console.log('PASS: survey opens once, uses an explicit rating rule and advances only after platform completion');
