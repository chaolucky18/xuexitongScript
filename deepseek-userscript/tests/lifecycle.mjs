import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const source = ['quiz-core.cjs', 'submit-helper.cjs', 'learning-flow.cjs', 'review-assistant.js'].map(file =>
    readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/^module\.exports = .*;$/m, '')).join('\n');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function setup({ pending = false } = {}) {
    const dom = new JSDOM(`<section><h3>判断题</h3><p>测试问题。</p><label><input type="radio" name="q" value="A">A、对</label><label><input type="radio" name="q" value="B">B、错</label><button id="submit">提交</button></section>`, { url: 'https://mooc1.chaoxing.com/mycourse/studentstudy', runScripts:'outside-only' });
    const w = dom.window;
    w.Element.prototype.getClientRects = () => [{width:100,height:20}];
    const intervals = new Set();
    const set = w.setInterval.bind(w), clear = w.clearInterval.bind(w);
    w.setInterval = (...args) => { const id = set(...args); intervals.add(id); return id; };
    w.clearInterval = id => { intervals.delete(id); clear(id); };
    let resolveAnswer, requests = 0, submissions = 0, aborted = false;
    w.fetch = async (url, options) => {
        if (url.endsWith('/health')) return {ok:true,json:async()=>({configured:true})};
        requests++;
        options.signal.addEventListener('abort', () => {aborted = true;});
        if (pending) await new Promise(resolve => {resolveAnswer = resolve;});
        return {ok:true,json:async()=>({answers:[{id:1,letters:['A']}]})};
    };
    w.document.querySelector('#submit').onclick = () => {submissions++;};
    const app = w.__xuexitongPlayerV3 = {_scriptRunning:false, run(){this._scriptRunning = true;w.__xuexitongDeepSeekReview.start();}, destroy(){this._scriptRunning = false;w.__xuexitongDeepSeekReview.stop();},_clearCheckInterval(){},play(){}};
    w.eval(`(function(){${source}})()`);
    return { w, app, intervals, finish:()=>resolveAnswer?.(), stats:()=>({requests,submissions,aborted}) };
}
{
    const {w,app,intervals,stats} = setup();
    const panel = w.document.querySelector('#xuexitong-deepseek-review-panel');
    assert.ok(panel.hidden, 'Assistant must stay closed before the script starts');
    assert.equal(intervals.size, 0);
    app.run(); await wait(30);
    assert.equal(panel.hidden, false);
    assert.equal(stats().requests, 1);
    w.document.querySelector('#xuexitong-script-stop').click();
    assert.equal(app._scriptRunning,false);
    assert.equal(panel.hidden,true);
    assert.equal(intervals.size,0,'Stopping must clear all assistant polling');
    assert.equal(w.document.querySelector('#xuexitong-script-start').hidden,false);
    await wait(250); assert.equal(stats().submissions,0,'Stopping before submit must prevent it');
    w.document.querySelector('#xuexitong-script-start').click();
    assert.equal(panel.hidden,false);
    assert.equal(intervals.size,2,'Restart must create exactly one set of polling timers');
    app.destroy(); w.close();
}
console.log('PASS: assistant opens with run, closes with stop, clears polling and restarts once');
{
    const {w,app,finish,stats} = setup({pending:true});
    app.run(); await wait(20); app.destroy(); finish(); await wait(200);
    assert.equal(stats().aborted,true,'Stop must abort the active request');
    assert.equal(w.document.querySelector('[value=A]').checked,false,'Late response must not fill answers');
    assert.equal(stats().submissions,0);
    assert.equal(w.document.querySelector('#xuexitong-deepseek-review-panel').hidden,true);
    w.close();
}
console.log('PASS: stopping cancels active requests and ignores late answers');
