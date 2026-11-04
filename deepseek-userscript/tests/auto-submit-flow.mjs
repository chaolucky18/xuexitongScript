import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';

async function run({ enabled = true, expected = 1, rejected = false, mode = 'quiz' } = {}) {
    const dom = new JSDOM(`${mode === 'assignment' ? '<div class="prev_title" title="作业">作业</div>' : ''}<main><p>题量: ${expected}</p><section id="question"><h3>判断题</h3><p>测试题目。</p>
    <label><input type="radio" name="q" value="A">A、对</label><label><input type="radio" name="q" value="B">B、错</label></section>
    <button id="submit">提交</button><div id="dialogs"></div></main>`, {
        url: 'https://mooc1.chaoxing.com/mycourse/studentstudy', runScripts: 'outside-only',
    });
    const { window } = dom;
    window.Element.prototype.getClientRects = () => [{ width: 100, height: 20 }];
    if (!enabled) window.localStorage.setItem('xuexitong-ai-auto-submit', 'false');
    let submitted = 0, confirmed = 0, advanced = 0;
    window.__xuexitongPlayerV3 = { _scriptRunning: true, _isPlaying: true, _clearCheckInterval() {}, play() {}, nextUnit() { advanced++; } };
    window.document.querySelector('#submit').addEventListener('click', () => {
        submitted++;
        window.document.querySelector('#dialogs').innerHTML = `<div id="popcontent">${rejected ? '还有未作答的题目' : '确定提交吗？'}</div><button id="popok">确定</button>`;
        window.document.querySelector('#popok').addEventListener('click', () => {
            confirmed++;
            window.document.querySelector('#dialogs').replaceChildren();
            window.document.querySelector('#question').style.display = 'none';
            if (mode === 'assignment') {
                const frame = window.document.createElement('iframe');
                window.document.body.appendChild(frame);
                const result = frame.contentDocument;
                Object.defineProperty(result, 'URL', { configurable: true,
                    value: 'https://mooc1.chaoxing.com/mooc-ans/work/selectWorkQuestionYiPiYue?submit=false' });
                result.body.innerHTML = '<p>章节测验 已完成 第四章作业 第1次作答 我的答案：B</p>';
            } else {
                const grade = window.document.createElement('p'); grade.textContent = '本次成绩 100 分 我的答案：A';
                window.document.querySelector('main').appendChild(grade);
            }
        });
    });
    window.fetch = async url => ({ ok: true, json: async () => url.endsWith('/health') ?
        { ok: true, configured: true } : { answers: [{ id: 1, letters: ['A'] }] } });
    const core = readFileSync(new URL('../quiz-core.cjs', import.meta.url), 'utf8').replace('module.exports = createQuizCore();', '');
    const helperPath = new URL('../submit-helper.cjs', import.meta.url);
    const helper = existsSync(helperPath) ? readFileSync(helperPath, 'utf8').replace('module.exports = createSubmissionHelper;', '') : '';
    const flow = readFileSync(new URL('../learning-flow.cjs', import.meta.url), 'utf8').replace('module.exports = createLearningFlow;', '');
const assistant = readFileSync(new URL('../review-assistant.js', import.meta.url), 'utf8');
    window.eval(`(function(){${core}\n${helper}\n${flow}\n${assistant}})();`);
    assert.ok(window.document.querySelector('#xuexitong-ai-auto-submit'), 'An automatic submit switch must exist');
    for (let i = 0; i < 40; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
        if (!window.__xuexitongDeepSeekReview.busy && window.document.querySelector('[value=A]').checked) break;
    }
    const message = window.document.querySelector('#xuexitong-deepseek-review-panel').textContent;
    window.__xuexitongDeepSeekReview.scan();
    await new Promise(resolve => setTimeout(resolve, 40));
    window.close();
    return { submitted, confirmed, advanced, message };
}

assert.deepEqual(await run().then(({ submitted, confirmed, advanced }) => ({ submitted, confirmed, advanced })), { submitted: 1, confirmed: 1, advanced: 1 });
console.log('PASS: auto-submit confirms once and advances only after a grade appears');
assert.equal((await run({ enabled: false })).submitted, 0);
console.log('PASS: manual submit switch still prevents submission');
assert.equal((await run({ expected: 2 })).submitted, 0);
console.log('PASS: incomplete question count prevents submission');
const rejected = await run({ rejected: true });
assert.equal(rejected.confirmed, 0);
assert.match(rejected.message, /未作答|拒绝/);
console.log('PASS: incomplete-answer warning is never confirmed');
const assignment = await run({ mode: 'assignment' });
assert.deepEqual({ submitted: assignment.submitted, confirmed: assignment.confirmed, advanced: assignment.advanced },
    { submitted: 1, confirmed: 1, advanced: 1 });
console.log('PASS: completed assignments advance to the next section');
