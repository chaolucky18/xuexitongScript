const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../codex-helper.template.user.js'),'utf8');
const begin=source.indexOf('function createVideoAnswerTools(){');
const start=source.indexOf('async function askCodex(',begin),end=source.indexOf('function validateAnswers(',start);
const connection=source.slice(source.indexOf('let codexTimer='),source.indexOf('async function requestBridgeAnswers('));
const ready=connection.slice(connection.indexOf('async function ensureCodexReady('),connection.lastIndexOf('renderCodexConnection();'));
function fixture(){
 let current=true,requests=0,health=0,resolveHealth;
 const timers=[];
 const context=vm.createContext({monitorStopped:false,stoppedByUser:()=>false,setStatus:()=>{},
   renderQuizImages:async()=>[],checkCodexConnection:()=>{health++;return new Promise(r=>resolveHealth=r);},
   setTimeout:fn=>{timers.push(fn);},requestBridgeAnswers:async(_,predicate)=>{assert.equal(predicate(),true);requests++;return {answers:[]};}});
 vm.runInContext(ready+source.slice(start,end),context);
 const q={kind:'判断题',title:'fixture',card:{isConnected:true},options:[{letter:'A',text:'是'},{letter:'B',text:'否'}],isCurrent:()=>current};
 return {context,q,timers,get requests(){return requests;},get health(){return health;},takeover:()=>current=false,resolve:value=>resolveHealth(value)};
}
const settle=()=>new Promise(r=>setImmediate(r));
(async()=>{
 // Manual takeover during an in-flight health probe must prevent the later answer request.
 let f=fixture(),pending=f.context.askCodex([f.q]);await settle();assert.equal(f.health,1);
 f.takeover();f.resolve(true);await assert.rejects(pending,/人工处理/);assert.equal(f.requests,0);
 // Manual takeover during offline backoff also cancels before another health/model attempt.
 f=fixture();pending=f.context.askCodex([f.q]);await settle();f.resolve(false);await settle();assert.equal(f.timers.length,1);
 f.takeover();f.timers.shift()();await assert.rejects(pending,/人工处理/);assert.equal(f.health,1);assert.equal(f.requests,0);
 assert.match(source.slice(begin,source.indexOf('function createContinuousPlayer()',begin)),/isCurrent:\(\)=>!monitorStopped&&questions\.every/);
 console.log('PASS: generated video answer pipeline cancels after manual takeover during health and offline waits');
})().catch(e=>{console.error(e);process.exitCode=1});
