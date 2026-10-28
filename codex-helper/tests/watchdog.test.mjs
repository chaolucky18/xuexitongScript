import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { watchBridge, RecoveryBudget } from '../bridge-watchdog.mjs';

const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(predicate) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) { if (await predicate()) return; await wait(30); }
    throw new Error('condition timed out');
}
test('requires consecutive failures, caps restart storms, and recovers after cooldown', () => {
    const b = new RecoveryBudget();
    b.observe(false); b.observe(false); assert.equal(b.claim(0), false);
    b.observe(true); assert.equal(b.failures, 0);
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 3; j++) b.observe(false);
        assert.equal(b.claim(i), true);
    }
    for (let j = 0; j < 3; j++) b.observe(false);
    assert.equal(b.claim(5000), false);
    assert.equal(b.claim(600001), true);
});
test('real child crash recovers; duplicate watcher and explicit stop cannot resurrect it', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-watchdog-test-'));
    let running;
    t.after(async () => {
        fs.writeFileSync(path.join(root, 'watchdog-stop'), 'stop');
        if (running) await running;
        assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(root).startsWith('codex-watchdog-test-'));
        fs.rmSync(root, { recursive: true, force: true });
    });
    const reserve = net.createServer();
    await new Promise(r => reserve.listen(0, '127.0.0.1', r));
    const port = reserve.address().port;
    await new Promise(r => reserve.close(r));
    fs.writeFileSync(path.join(root, 'bridge-settings.json'), JSON.stringify({ port, token: 'a'.repeat(64) }));
    fs.writeFileSync(path.join(root, 'codex-bridge.mjs'), `
      import http from 'node:http'; import fs from 'node:fs';
      fs.appendFileSync('launches.txt', process.pid+'\\n');
      http.createServer((req,res)=>{
        if(req.url==='/crash')process.exit(2);
        res.end(JSON.stringify({ok:true,engine:'codex-cli',sessions:true}));
      }).listen(${port},'127.0.0.1');
    `);
    const launches = () => fs.existsSync(path.join(root, 'launches.txt')) ? fs.readFileSync(path.join(root, 'launches.txt'), 'utf8').trim().split('\n').length : 0;
    const status = () => { try { return JSON.parse(fs.readFileSync(path.join(root, 'watchdog-status.json'), 'utf8')); } catch { return {}; } };
    running = watchBridge(root, { interval: 60, timeout: 400 });
    await until(() => launches() === 1 && status().healthy);
    assert.deepEqual(await watchBridge(root), { alreadyRunning: true });
    try { await fetch(`http://127.0.0.1:${port}/crash`, { signal: AbortSignal.timeout(500) }); } catch {}
    await until(() => launches() === 2 && status().healthy);
    fs.writeFileSync(path.join(root, 'watchdog-stop'), 'stop');
    await running;
    await wait(250);
    assert.equal(launches(), 2);
    assert.equal(status().stopped, true);
});
