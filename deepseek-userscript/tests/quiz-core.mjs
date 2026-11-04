import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import core from '../quiz-core.cjs';

function page(html) {
    const dom = new JSDOM(html, { url: 'https://mooc1.chaoxing.com/mycourse/studentstudy' });
    dom.window.Element.prototype.getClientRects = () => [{ width: 100, height: 20 }];
    return dom.window.document;
}

const doc = page(`<section><div>判断题</div><p>在2002年成立了礼仪队。（）</p>
<label><input type="radio" name="quiz" value="A"> A、对</label>
<label><input type="radio" name="quiz" value="B"> B、错</label>
<a id="submit">提交</a></section>`);
const questions = core.extractQuestions(doc);
assert.equal(questions.length, 1, 'Must recognize an inline video question without brackets');
assert.equal(questions[0].kind, '判断题');
assert.match(questions[0].title, /2002/);
assert.deepEqual(questions[0].options.map(o => o.text), ['对', '错']);
let submitted = 0;
doc.querySelector('#submit').addEventListener('click', () => { submitted++; });
core.applyAnswers(questions, [{ id: 1, letters: ['B'] }]);
assert.equal(doc.querySelector('[value=B]').checked, true);
assert.equal(submitted, 0, 'Filling must never submit');
assert.throws(() => core.applyAnswers(questions, [{ id: 1, letters: ['A', 'B'] }]), /单选|判断/);
assert.equal(doc.querySelector('[value=B]').checked, true, 'Invalid output must not change the form');
assert.throws(() => core.validateAnswers(questions, [{ id: 1, letters: ['Z'] }]), /选项/);
console.log('PASS: inline extraction, validation and fill without submit');

const multi = page(`<section><h3>1.【多选题】哪些是偶数？</h3>
<label><input type="checkbox" checked>A、1</label><label><input type="checkbox">B、2</label>
<label><input type="checkbox">C、4</label><button id="send">提交</button></section>`);
const multiQuestions = core.extractQuestions(multi);
assert.equal(multiQuestions.length, 1);
core.applyAnswers(multiQuestions, [{ id: 1, letters: ['B', 'C'] }]);
assert.deepEqual([...multi.querySelectorAll('input')].map(i => i.checked), [false, true, true]);
assert.throws(() => core.validateAnswers(multiQuestions, [{ id: 1, letters: ['B', 'B'] }]), /重复/);
multi.querySelector('section').style.display = 'none';
assert.equal(core.extractQuestions(multi).length, 0, 'Hidden questions must not be sent');
console.log('PASS: multiple choice and hidden question handling');
