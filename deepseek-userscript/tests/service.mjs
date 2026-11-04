import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createService } from '../local-service.mjs';

let calls = 0;
const testKey = 'test-only-secret-never-real';
const server = createService({ token: 'test-local-token', fetchImpl: async (url, options) => {
    assert.equal(options.headers.Authorization, `Bearer ${testKey}`);
    if (url.endsWith('/models')) return new Response('{"data":[]}', { status: 200 });
    calls++;
    const request = JSON.parse(options.body);
    assert.equal(request.model, 'deepseek-flash');
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"answers":[{"id":1,"letters":["B"]}]}' } }] }));
} });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const headers = { Origin: 'https://mooc1.chaoxing.com', 'X-Xuexitong-Token': 'test-local-token' };
try {
    assert.equal((await fetch(`${base}/health`)).status, 403);
    assert.equal((await fetch(`${base}/health`, { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(`${base}/health`, { headers: { ...headers, 'X-Xuexitong-Token': 'wrong' } })).status, 403);
    const setup = await fetch(base);
    const html = await setup.text();
    const cookie = setup.headers.get('set-cookie').split(';')[0];
    const nonce = html.match(/name="nonce" value="([a-f0-9]+)"/)[1];
    const form = new URLSearchParams({ nonce, api_key: testKey });
    assert.equal((await fetch(`${base}/configure`, { method: 'POST', headers: { Origin: 'https://mooc1.chaoxing.com', Cookie: cookie }, body: form })).status, 403);
    assert.equal((await fetch(`${base}/configure`, { method: 'POST', redirect: 'manual', headers: { Origin: base, Cookie: cookie }, body: form })).status, 303);
    const health = await (await fetch(`${base}/health`, { headers })).text();
    assert.equal(JSON.parse(health).configured, true);
    assert.equal(health.includes(testKey), false);
    assert.equal((await (await fetch(base)).text()).includes(testKey), false);
    const payload = { questions: [{ id: 1, type: '判断题', question: '测试题目', options: [{ letter: 'A', text: '对' }, { letter: 'B', text: '错' }] }] };
    const answer = () => fetch(`${base}/answer`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal((await answer()).status, 200);
    assert.deepEqual((await (await answer()).json()).answers, [{ id: 1, letters: ['B'] }]);
    assert.equal(calls, 1, 'Same questions must use the cache instead of creating repeated API charges');
    payload.questions[0].question = 'x'.repeat(501);
    assert.equal((await answer()).status, 502);
    assert.equal(calls, 1, 'Reject invalid input before calling DeepSeek');
    console.log('PASS: local setup, origin/token checks, private key handling and answer cache');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
