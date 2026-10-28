const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync(require('node:path').join(__dirname,'../codex-helper.template.user.js'),'utf8');
const recover=s.slice(s.indexOf('function recoverIntegrated('),s.indexOf('function monitorTick(){'));
const tick=s.slice(s.indexOf('async function monitorTickOnce('),s.indexOf('function hasChapterQuizLayout('));
let reloads=0,finishes=0,now=200000;
const snapshot={ended:true,busy:false,title:'lesson',chapter:'chapter',time:60,duration:60};
const c=vm.createContext({Date:{now:()=>now},monitorStopped:false,courseQueue:null,videoQuestions:null,checks:0,engineType:'chapter',
  sessionState:{deadline:99999999,lastRecovery:0,recoveries:0,videoRecoveries:{}},APP_KEY:'app',
  document:{getElementById:()=>true},PAGE:{app:{_getVideoEl:()=>null},location:{reload:()=>reloads++}},
  playbackSpeed:{apply:()=>{}},engineSnapshot:()=>snapshot,nativeVideoCompleted:()=>false,checkEndedTransition:()=> 'failed',
  setStatus:()=>{},saveSession:()=>{},renderMonitor:()=>{},disposeIntegrated:()=>{},finishIntegrated:()=>finishes++});
vm.runInContext(recover+tick,c);
(async()=>{
  await c.monitorTickOnce(0);assert.equal(reloads,1);assert.equal(finishes,0);
  now+=1000;await c.monitorTickOnce(0);assert.equal(reloads,1);
  now+=120000;await c.monitorTickOnce(0);assert.equal(reloads,2);
  now+=120000;await c.monitorTickOnce(0);assert.equal(reloads,2);assert.equal(finishes,1);
  console.log('PASS: ended transition reloads with cooldown and preserves per-video recovery limit');
})().catch(e=>{console.error(e);process.exitCode=1});
