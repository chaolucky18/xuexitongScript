const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const full=fs.readFileSync(require('node:path').join(__dirname,'../codex-helper.template.user.js'),'utf8');
const source=full.slice(full.indexOf('async function requestBridgeAnswers('),full.indexOf('function createDocumentImageRangeRecovery()'));
const cases=[];
function fixture(replies){
 let now=10000,calls=0,waits=0,current=true;
 class FakeDate extends Date {static now(){return now;}}
 const c=vm.createContext({Date:FakeDate,Number,Promise,Error,Math,monitorStopped:false,stoppedByUser:()=>false,
  codexGeneration:1,codexWaitUntil:0,sessionState:{id:'session',deadline:5000000},setStatus:()=>{},
  setTimeout:fn=>{now+=1000;waits++;Promise.resolve().then(fn);},
  bridgeRequest:async()=>{calls++;const reply=replies.shift();if(reply instanceof Error)throw reply;return reply;}});
 vm.runInContext(source,c);
 return {c,run:()=>c.requestBridgeAnswers({questions:['unchanged']},()=>current),get calls(){return calls;},get waits(){return waits;},stop:()=>current=false};
}
const error=(code,retryAt=12000)=>Object.assign(new Error(code),{code,retryAt});
(async()=>{
 let f=fixture([error('usage_limit'),{answers:['verified']}]);assert.equal((await f.run()).answers[0],'verified');assert.equal(f.calls,2);assert.ok(f.waits>=2);assert.equal(f.c.codexWaitUntil,0);
 f=fixture(Array.from({length:4},()=>error('usage_limit')));await assert.rejects(f.run(),/已达三次/);assert.equal(f.calls,4);
 f=fixture(Array.from({length:4},()=>error('temporary_connection')));await assert.rejects(f.run(),/temporary_connection/);assert.equal(f.calls,4);
 f=fixture([error('authentication')]);await assert.rejects(f.run(),/authentication/);assert.equal(f.calls,1);
 f=fixture([error('usage_limit')]);f.c.setTimeout=fn=>{f.stop();Promise.resolve().then(fn);};await assert.rejects(f.run(),/题目已变化/);assert.equal(f.calls,1);
 f=fixture([error('usage_limit')]);f.c.setTimeout=fn=>{f.c.codexGeneration++;Promise.resolve().then(fn);};await assert.rejects(f.run(),/已停止/);assert.equal(f.calls,1);
 f=fixture([error('usage_limit',9999999)]);f.c.sessionState.deadline=11000;await assert.rejects(f.run(),/12小时/);assert.equal(f.calls,1);
 f=fixture([error('unknown')]);await assert.rejects(f.run(),/unknown/);assert.equal(f.calls,1);
 console.log('PASS: quota and transient recovery, retry caps, authentication, cancellation, generation and deadline guards');
})().catch(e=>{console.error(e);process.exitCode=1});
