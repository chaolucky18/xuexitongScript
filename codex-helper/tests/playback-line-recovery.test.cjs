const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const full=fs.readFileSync(path.join(__dirname,'../codex-helper.template.user.js'),'utf8');
const source=full.slice(full.indexOf('function createPlaybackLineRecovery('),full.indexOf('function createPlaybackSpeedController('));
function fixture({storage=new Map(),names=['公网1','公网2'],errorCode=2,selected='公网1',ariaOnly=false}={}){
  let now=100000,clicks=0;
  const statuses=[];
  const video={currentTime:260,readyState:2,error:errorCode?{code:errorCode}:null,playbackRate:1};
  const options=names.map(name=>({textContent:name,querySelector:()=>null,classList:{contains:value=>!ariaOnly&&value==='vjs-selected'&&selected===name},getAttribute:key=>key==='aria-checked'&&selected===name?'true':'false',click(){clicks++;selected=name;}}));
  const frame={contentDocument:{querySelector:selector=>selector==='video'?video:null,querySelectorAll:selector=>selector==='.vjs-menu-item'?options:[]}};
  class FakeDate extends Date{static now(){return now;}}
  const context=vm.createContext({Date:FakeDate,sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))}});
  vm.runInContext(source+'\nthis.factory=createPlaybackLineRecovery;',context);
  const make=()=>context.factory({storageKey:title=>'line:course:'+title,setStatus:text=>statuses.push(text)});
  return {helper:make(),make,frame,video,storage,statuses,advance:ms=>{now+=ms;},get clicks(){return clicks;}};
}

// Use the real player's alternate line once, preserving time and playback speed.
{
  const f=fixture();
  assert.equal(f.helper.tryRecover(f.frame,'lecture'),true);
  assert.equal(f.clicks,1);
  assert.equal(f.video.currentTime,260);
  assert.equal(f.video.playbackRate,1);
  assert.deepEqual(JSON.parse(f.storage.get('line:course:lecture')),['公网1','公网2']);
  assert.equal(f.helper.tryRecover(f.frame,'lecture'),true,'Pending recovery suppresses duplicate switches');
  f.advance(10000);
  assert.equal(f.helper.isPending(f.frame),true);
  assert.equal(f.clicks,1);
  f.video.error=null;
  assert.equal(f.helper.isPending(f.frame),true,'Clearing the error alone is not successful playback');
  f.video.currentTime=260.3;
  f.video.readyState=1;
  assert.equal(f.helper.isPending(f.frame),true,'Require playable media readiness');
  f.video.readyState=2;
  assert.equal(f.helper.isPending(f.frame),false,'Real progress releases pending recovery');
  assert.equal(f.helper.tryRecover(f.frame,'lecture'),false);
}

// A failed alternate route times out and must not switch back into a loop.
{
  const f=fixture();
  assert.equal(f.helper.tryRecover(f.frame,'lecture'),true);
  f.advance(34999);
  assert.equal(f.helper.isPending(f.frame),true);
  f.advance(1);
  assert.equal(f.helper.isPending(f.frame),false);
  assert.equal(f.helper.hasFailed(f.frame),true,'A timeout is retained for immediate bounded fallback');
  assert.equal(f.helper.tryRecover(f.frame,'lecture'),false);
  assert.equal(f.clicks,1);
}

// Progress with a remaining network error is not successful recovery.
{
  const f=fixture();f.helper.tryRecover(f.frame,'lecture');
  f.video.currentTime=261;
  assert.equal(f.helper.isPending(f.frame),true);
}

// A delayed browser tick must recognize recovery before applying its wall-clock timeout.
{
  const f=fixture();f.helper.tryRecover(f.frame,'lecture');
  f.video.error=null;f.video.readyState=4;f.video.currentTime+=5;f.advance(36000);
  assert.equal(f.helper.isPending(f.frame),false);assert.equal(f.helper.hasFailed(f.frame),false);
}
for(const mutate of [
 f=>{f.video.error=null;},
 f=>{f.video.currentTime+=5;},
 f=>{f.video.error=null;f.video.currentTime+=5;f.video.readyState=1;},
 f=>{f.frame.contentDocument.querySelector=()=>null;},
]){
 const f=fixture();f.helper.tryRecover(f.frame,'lecture');mutate(f);f.advance(36000);
 assert.equal(f.helper.isPending(f.frame),false);assert.equal(f.helper.hasFailed(f.frame),true);
}

// Only native network errors with an identified alternate line are eligible.
for(const errorCode of [null,1,3,4]){
  const f=fixture({errorCode});
  assert.equal(f.helper.tryRecover(f.frame,'lecture'),false);
  assert.equal(f.clicks,0);
}
for(const names of [[],['公网1'],['高清','标清']]){
  const f=fixture({names});
  assert.equal(f.helper.tryRecover(f.frame,'lecture'),false);
  assert.equal(f.clicks,0);
}
{
  const f=fixture({selected:'unknown'});
  assert.equal(f.helper.tryRecover(f.frame,'lecture'),false,'Do not guess the active line');
  assert.equal(f.clicks,0);
}
{
  const f=fixture({ariaOnly:true});
  assert.equal(f.helper.tryRecover(f.frame,'lecture'),true,'Support aria-checked native menu selection');
}

// Persistent attempts survive a full reload and explicit stop/dispose.
{
  const f=fixture();f.helper.tryRecover(f.frame,'lecture');
  const saved=f.storage.get('line:course:lecture');
  f.helper.dispose();
  assert.equal(f.helper.isPending(f.frame),false);
  assert.equal(f.helper.hasFailed(f.frame),false);
  assert.equal(f.storage.get('line:course:lecture'),saved,'Dispose preserves the attempt journal');
  const restarted=fixture({storage:f.storage});
  assert.equal(restarted.helper.tryRecover(restarted.frame,'lecture'),false);
  assert.equal(restarted.clicks,0,'Reload must not retry either previously attempted line');
  assert.equal(restarted.helper.tryRecover(restarted.frame,'different lecture'),true,'A different video has its own retry allowance');
}

console.log('PASS: network-only native line switching, single alternate attempt, pending suppression, real-progress verification, 35-second timeout, missing-line handling, persistent reload bounds, and stop/dispose.');
