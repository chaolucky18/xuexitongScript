import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../codex-helper.template.user.js', import.meta.url), 'utf8');

function helpers(context) {
    const start = source.indexOf('function validateAnswers(', source.indexOf('function attachQuizAutomation(app)'));
    const end = source.indexOf('async function confirmSubmitDialog()', start);
    return vm.runInNewContext('(()=>{' + source.slice(start, end) + ';return{validateAnswers,selectAnswers,selectedLetters,questionKeys}})()', context);
}

test('multi-choice selection removes obsolete values and is idempotent', async () => {
    let actual = ['A', 'B'];
    const doc = {};
    const card = { isConnected: true, querySelectorAll: () => [{ name: 'answer123', get value() { return actual.join(''); } }] };
    const q = { kind: '多选题', card, doc, options: ['A', 'B', 'C'].map(letter => ({ letter, element: {
        isConnected: true, scrollIntoView() {}, click() { actual = actual.includes(letter) ? actual.filter(l => l !== letter) : [...actual, letter]; },
    } })) };
    const methods = helpers({ clean: x => String(x).trim(), stopped: false, sleep: async () => {}, courseDocuments: () => [doc] });
    const answers = methods.validateAnswers([q], [{ id: 1, letters: ['B', 'C'], confidence: 'high' }]);
    await methods.selectAnswers([q], answers);
    assert.equal(actual.sort().join(''), 'BC');
    await methods.selectAnswers([q], answers);
    assert.equal(actual.sort().join(''), 'BC');
    card.isConnected = false;
    await assert.rejects(() => methods.selectAnswers([q], answers));
    card.isConnected = true;
    q.doc = {};
    await assert.rejects(() => methods.selectAnswers([q], answers));
});

test('judge values map to displayed letters and uncertain answers stop', () => {
    const methods = helpers({ clean: x => String(x).trim(), stopped: false, courseDocuments: () => [] });
    const q = { kind: '判断题', card: { querySelectorAll: () => [{ name: 'answer456', value: 'false' }] },
        options: ['A', 'B'].map((letter, i) => ({ letter, element: { querySelector: () => ({ getAttribute: () => i ? 'false' : 'true' }) } })) };
    assert.equal(methods.selectedLetters(q).join(''), 'B');
    assert.throws(() => methods.validateAnswers([q], [{ id: 1, letters: ['B'], confidence: 'low' }]));
    assert.throws(() => methods.validateAnswers([q], [{ id: 1, letters: ['C'], confidence: 'high' }]));
});

test('completion requires actual grade and submitted-answer evidence', () => {
    let text = '章节测验 待完成 满分100分';
    const start = source.indexOf('function quizCompleted() {'), end = source.indexOf('function optionElements(', start);
    const complete = vm.runInNewContext('(()=>{' + source.slice(start, end) + 'return quizCompleted})()', {
        app: { _currentStepTitle: () => '章节测验' }, clean: x => x,
        courseDocuments: () => [{ body: { get innerText() { return text; } } }],
    });
    assert.equal(complete(), false);
    text = '章节测验 已完成 本次成绩 100 分 我的答案：A';
    assert.equal(complete(), true);
});

test('submission identity stays stable when copied font-obfuscated text changes', () => {
    const methods = helpers({});
    const card = { querySelector: () => ({ getAttribute: () => '123' }) };
    assert.equal(methods.questionKeys([{ card, title: '旧替换字' }]), methods.questionKeys([{ card, title: '新替换字' }]));
    assert.throws(() => methods.questionKeys([{ card }, { card }]));
    assert.throws(() => methods.questionKeys([{ card: { querySelector: () => null, closest: () => null } }]));
});
