import assert from 'node:assert/strict';
import {requestAnswers} from '../deepseek-request.mjs';

const questions = [
    {id: 1, type: '单选题', question: '题目一', options: [{letter: 'A', text: '甲'}, {letter: 'B', text: '乙'}]},
    {id: 2, type: '单选题', question: '题目二', options: [{letter: 'A', text: '甲'}, {letter: 'B', text: '乙'}]},
    {id: 3, type: '单选题', question: '题目三', options: [{letter: 'A', text: '甲'}, {letter: 'B', text: '乙'}]},
    {id: 4, type: '单选题', question: '题目四', options: [{letter: 'A', text: '甲'}, {letter: 'B', text: '乙'}]},
];

function response(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {'Content-Type': 'application/json'},
    });
}

{
    const bodies = [];
    const answers = await requestAnswers(questions, 'test-key', async (_url, options) => {
        const body = JSON.parse(options.body);
        bodies.push(body);
        return response({
            choices: [{
                finish_reason: 'stop',
                message: {content: JSON.stringify({answers: questions.map(q => ({id: q.id, letters: ['A']}))})},
            }],
        });
    });
    assert.equal(answers.length, 4);
    assert.equal(bodies.length, 1);
    assert.deepEqual(bodies[0].thinking, {type: 'disabled'},
        'Thinking is enabled by default by the API, so answer requests must explicitly disable it');
    assert.ok(bodies[0].max_tokens <= 3000, 'Answer-only JSON needs a compact token budget');
}

{
    let call = 0;
    const batches = [];
    const answers = await requestAnswers(questions, 'test-key', async (_url, options) => {
        call++;
        const body = JSON.parse(options.body);
        const batch = JSON.parse(body.messages[1].content);
        batches.push(batch.map(q => q.id));
        if (call === 1) {
            return response({
                choices: [{finish_reason: 'length', message: {content: ''}}],
                usage: {completion_tokens: 2200},
            });
        }
        return response({
            choices: [{
                finish_reason: 'stop',
                message: {content: JSON.stringify({answers: batch.map(q => ({id: q.id, letters: ['B']}))})},
            }],
        });
    });
    assert.deepEqual(batches, [[1, 2, 3, 4], [1, 2], [3, 4]],
        'A truncated batch must be split into smaller complete requests');
    assert.deepEqual(answers.map(answer => answer.id), [1, 2, 3, 4]);
}

{
    await assert.rejects(
        requestAnswers([questions[0]], 'test-key', async () => response({
            choices: [{finish_reason: 'length', message: {content: ''}}],
            usage: {completion_tokens: 3000},
        })),
        /长度上限/,
    );
}

console.log('PASS: concise answer requests and automatic batch splitting avoid incomplete length responses');
