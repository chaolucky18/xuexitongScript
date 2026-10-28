const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const full=fs.readFileSync(require('node:path').join(__dirname,'../codex-helper.template.user.js'),'utf8');
const s=full.slice(full.indexOf('let codexTimer='),full.indexOf('async function requestBridgeAnswers('));
let connected=false,resolvePending=null,timers=[],calls=0;
const context=vm.createContext({codexText:{},Date,monitorStopped:false,stoppedByUser:()=>false,setStatus:()=>{},
  bridgeRequest:async()=>{calls++;if(resolvePending)await new Promise(r=>resolvePending=r);if(!connected)throw Error('offline');return {ok:true,engine:'codex-cli',sessions:true};},
  setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{timers=[];}});
vm.runInContext(s+';globalThis.state=codexState;',context);
const settle=()=>new Promise(r=>setImmediate(r));
(async()=>{
  context.startCodexConnection();await settle();assert.equal(timers.at(-1).ms,5000);
  connected=true;await timers.pop().fn();assert.equal(timers.at(-1).ms,30000);assert.equal(context.state.connected,true);
  context.stopCodexConnection();assert.equal(timers.length,0);
  resolvePending=true;context.startCodexConnection();await settle();
  const finish=resolvePending;context.stopCodexConnection();finish();await settle();
  assert.equal(timers.length,0);assert.equal(context.state.connected,false);
  assert.equal(context.state.message,'已停止');console.log('PASS: fast offline reconnect, healthy backoff, stop invalidates pending callbacks');
})().catch(e=>{console.error(e);process.exitCode=1});
