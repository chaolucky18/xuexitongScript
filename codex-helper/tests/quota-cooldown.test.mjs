import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('HTTP quota response exposes retry time and cooldown blocks further CLI launches', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-quota-test-'));
    const repo = fileURLToPath(new URL('../', import.meta.url));
    for (const name of ['codex-bridge.mjs','bridge-failures.mjs','resolve-codex.mjs','build-userscript.mjs','answer-schema.json','codex-helper.template.user.js']) fs.copyFileSync(path.join(repo,name),path.join(root,name));
    const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));
    const port=reserve.address().port;await new Promise(r=>reserve.close(r));
    const token='b'.repeat(64),headers={'X-Xuexitong-Token':token,'Content-Type':'application/json'};
    fs.writeFileSync(path.join(root,'bridge-settings.json'),JSON.stringify({port,token}));
    const fake=path.join(root,'fake-codex.mjs'), counter=path.join(root,'counter.txt');
    fs.writeFileSync(fake,`import fs from 'node:fs';fs.appendFileSync(${JSON.stringify(counter)},'call\\n');console.error("You've hit your usage limit.");process.exit(1);`);
    const child=spawn(process.execPath,[path.join(root,'codex-bridge.mjs'),'--resident'],{env:{...process.env,CODEX_QUIZ_EXECUTABLE:fake},windowsHide:true,stdio:'ignore'});
    const url=`http://127.0.0.1:${port}`;
    t.after(async()=>{
        const exited=child.exitCode!==null?Promise.resolve():new Promise(r=>child.once('exit',r));
        try{await fetch(url+'/stop',{method:'POST',headers,signal:AbortSignal.timeout(1000)});}catch{}
        if(child.exitCode===null)child.kill();await exited;
        assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('codex-quota-test-'));
        fs.rmSync(root,{recursive:true,force:true});
    });
    let ready=false;
    for(let i=0;i<60;i++){
        try{ready=(await fetch(url+'/health',{headers,signal:AbortSignal.timeout(200)})).ok;if(ready)break;}catch{}
        await new Promise(r=>setTimeout(r,50));
    }
    assert.ok(ready,'bridge is ready');
    const payload={questions:[{id:1,type:'判断题',question:'test',options:[{letter:'A',text:'yes'},{letter:'B',text:'no'}]}],images:['data:image/png;base64,iVBORw0KGgo='],session:{id:'session-test',deadline:Date.now()+600000}};
    for(let i=0;i<2;i++){
        const res=await fetch(url+'/answer',{method:'POST',headers,body:JSON.stringify(payload)});
        assert.equal(res.status,429);const data=await res.json();assert.equal(data.code,'usage_limit');assert.ok(data.retryAt>Date.now());
    }
    const health=await(await fetch(url+'/health',{headers})).json();assert.equal(health.calls,1);assert.equal(health.unavailableReason,'usage_limit');
    assert.equal(fs.readFileSync(counter,'utf8'),'call\n');
});
