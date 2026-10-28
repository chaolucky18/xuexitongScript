import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { validatePayload, validateAnswers } from '../codex-bridge.mjs';
import { prepareRuntime, validateSettings } from '../build-userscript.mjs';
import { invocationForFile } from '../resolve-codex.mjs';

const q = [{ id: 1, type: '单选题', question: '测试', options: [{ letter: 'A', text: '甲' }, { letter: 'B', text: '乙' }] }];
const payload = { questions: q, images: ['data:image/png;base64,iVBORw0KGgo='] };
const answer = [{ id: 1, letters: ['A'], confidence: 'high', reason: '测试' }];

function temporary(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-helper-test-'));
    t.after(() => {
        const resolved = path.resolve(directory);
        assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
        assert.ok(path.basename(resolved).startsWith('codex-helper-test-'));
        fs.rmSync(resolved, { recursive: true, force: true });
    });
    return directory;
}

test('reject mismatched images, unsupported types and duplicate options', () => {
    assert.equal(validatePayload(payload), payload);
    assert.throws(() => validatePayload({ ...payload, images: [] }));
    assert.throws(() => validatePayload({ ...payload, questions: [{ ...q[0], type: '考试' }] }));
    assert.throws(() => validatePayload({ ...payload, questions: [{ ...q[0], options: [q[0].options[0], q[0].options[0]] }] }));
    assert.throws(() => validatePayload({ ...payload, images: ['https://example.com/question.png'] }));
});

test('validate all answer identities, options, cardinality and confidence', () => {
    assert.equal(validateAnswers(q, answer), answer);
    for (const change of [{ letters: ['A', 'B'] }, { letters: ['C'] }, { letters: ['A', 'A'] }, { confidence: 'low' }, { id: 2 }]) {
        assert.throws(() => validateAnswers(q, [{ ...answer[0], ...change }]));
    }
    assert.throws(() => validateAnswers(q, []));
});

test('generate private runtime files and reuse local configuration', t => {
    const directory = temporary(t);
    const first = prepareRuntime(directory);
    assert.match(first.settings.token, /^[a-f0-9]{64}$/);
    const script = fs.readFileSync(first.scriptPath, 'utf8');
    assert.ok(script.includes(first.settings.token));
    assert.ok(!script.includes('__LOCAL_TOKEN__'));
    assert.ok(!script.includes('__LOCAL_PORT__'));
    new vm.Script(script);
    assert.equal(prepareRuntime(directory).settings.token, first.settings.token);
    assert.throws(() => validateSettings({ port: 80, token: first.settings.token }));
    assert.throws(() => validateSettings({ port: 37843, token: 'invalid' }));
    const template = fs.readFileSync(fileURLToPath(new URL('../codex-helper.template.user.js', import.meta.url)), 'utf8');
    assert.ok(!template.includes(first.settings.token));
});

test('resolve npm Codex entry without executing a shell shim', t => {
    const directory = temporary(t);
    const shim = path.join(directory, 'codex.cmd');
    const entry = path.join(directory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(shim, '@echo off'); fs.writeFileSync(entry, '');
    assert.deepEqual(invocationForFile(shim), { command: process.execPath, prefix: [entry] });
    assert.deepEqual(invocationForFile(entry), { command: process.execPath, prefix: [entry] });
    assert.throws(() => invocationForFile(path.join(directory, 'missing.exe')));
});
