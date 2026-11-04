import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(`<section><h3>判断题</h3><p>2002年成立礼仪队。</p>
<label><input type="radio" name="q" value="A">A、对</label><label><input type="radio" name="q" value="B">B、错</label>
<button id="submit">提交</button></section>`, { url: 'https://mooc1.chaoxing.com/mycourse/studentstudy', runScripts: 'outside-only' });
const { window } = dom;
window.localStorage.setItem('xuexitong-ai-auto-submit', 'false');
window.Element.prototype.getClientRects = () => [{ width: 100, height: 20 }];
let submissions = 0;
let answerRequests = 0;
window.document.querySelector('#submit').addEventListener('click', () => { submissions++; });
window.__xuexitongPlayerV3 = { _scriptRunning: true, _isPlaying: true, _clearCheckInterval() {}, play() {} };
window.fetch = async url => {
    if (url.endsWith('/health')) return { ok: true, json: async () => ({ ok: true, configured: true }) };
    answerRequests++;
    return { ok: true, json: async () => ({ answers: [{ id: 1, letters: ['A'] }] }) };
};
const core = readFileSync(new URL('../quiz-core.cjs', import.meta.url), 'utf8').replace('module.exports = createQuizCore();', '');
const flow = readFileSync(new URL('../learning-flow.cjs', import.meta.url), 'utf8').replace('module.exports = createLearningFlow;', '');
const assistant = readFileSync(new URL('../review-assistant.js', import.meta.url), 'utf8');
const submission = readFileSync(new URL('../submit-helper.cjs', import.meta.url), 'utf8').replace('module.exports = createSubmissionHelper;', '');
window.eval(`(function(){${core}\n${submission}\n${flow}\n${assistant}})();`);
await new Promise(resolve => setTimeout(resolve, 80));
assert.equal(answerRequests, 1);
assert.equal(window.document.querySelector('[value=A]').checked, true);
assert.equal(submissions, 0);
assert.match(window.document.querySelector('#xuexitong-deepseek-review-panel').textContent, /答案已填入/);
assert.equal(window.__xuexitongPlayerV3._isPlaying, false);
window.__xuexitongDeepSeekReview.scan();
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(answerRequests, 1, 'Polling must not keep repeating paid requests');
window.close();
console.log('PASS: automatic answer selection pauses playback and never submits');
