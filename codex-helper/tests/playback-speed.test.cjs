const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const full=fs.readFileSync(path.join(__dirname,'../codex-helper.template.user.js'),'utf8');
const source=full.slice(full.indexOf('function createPlaybackSpeedController(){'),full.indexOf('const playbackSpeed=createPlaybackSpeedController();'));
const context=vm.createContext({URL});vm.runInContext(source+'\nthis.factory=createPlaybackSpeedController;',context);
function fixture({rates=[],initial=1,reject=false,nativeFail=false,nativeThrow=false}={}){
  let actual=initial,writes=0;const clicks=[];
  const video={currentSrc:'https://media.example/lesson-a.mp4?signature=first',readyState:4};
  Object.defineProperty(video,'playbackRate',{get:()=>actual,set:value=>{writes++;if(!reject)actual=value;}});
  const choices=rates.map(rate=>({textContent:String(rate)+'x',querySelector:()=>null,click(){clicks.push(rate);if(nativeThrow)throw Error('Native menu rejected');if(!nativeFail)actual=rate;}}));
  const doc={baseURI:'https://course.example/',querySelector:s=>s==='video'?video:null,querySelectorAll:s=>s==='.vjs-playback-rate .vjs-menu-item'?choices:[]};
  return {video,doc,clicks,get writes(){return writes;},forceRate:value=>{actual=value;}};
}
{
  const f=fixture({rates:[0.5,1,1.5,2]}),c=context.factory();
  assert.equal(c.apply(f.doc),true);assert.deepEqual(f.clicks,[2]);assert.equal(f.writes,0);
  for(let i=0;i<20;i++)assert.equal(c.apply(f.doc),false);
  assert.equal(f.clicks.length,1,'Native highest is not clicked repeatedly');
  f.forceRate(1);c.apply(f.doc);assert.equal(c.snapshot(f.doc).status,'restricted');
  assert.equal(f.clicks.length,1);assert.equal(f.writes,0,'Native rollback is not fought');
}
{
  const f=fixture(),c=context.factory();c.apply(f.doc);assert.equal(f.video.playbackRate,2);assert.equal(f.writes,1);
  for(let i=0;i<20;i++)c.apply(f.doc);assert.equal(f.writes,1);
  f.forceRate(1);for(let i=0;i<20;i++)c.apply(f.doc);
  assert.equal(c.snapshot(f.doc).actualRate,1);assert.equal(c.snapshot(f.doc).status,'restricted');assert.equal(f.writes,1);
  f.video.currentSrc='https://media.example/lesson-a.mp4?signature=renewed';c.apply(f.doc);assert.equal(f.writes,1,'Signed URL renewal is the same source');
  f.video.currentSrc='https://media.example/lesson-b.mp4';c.apply(f.doc);assert.equal(f.writes,2,'A different lesson on a reused node may request once');assert.equal(f.video.playbackRate,2);
}
for(const nativeThrow of [false,true]){
  const f=fixture({rates:[1,2],nativeFail:true,nativeThrow}),c=context.factory();c.apply(f.doc);
  assert.equal(f.writes,1);assert.equal(f.video.playbackRate,2);assert.equal(f.clicks.length,1);
}
{
  const f=fixture({reject:true}),c=context.factory();c.apply(f.doc);for(let i=0;i<20;i++)c.apply(f.doc);
  assert.equal(f.writes,1);assert.equal(c.snapshot(f.doc).status,'restricted');assert.equal(c.snapshot(f.doc).actualRate,1);
}
{
  const f=fixture({rates:[1,2,3],nativeFail:true}),c=context.factory();c.apply(f.doc);c.apply(f.doc);
  assert.equal(c.snapshot(f.doc).targetRate,2,'Failed native 3x falls back to the standard 2x request');assert.equal(f.writes,1);
}
{
  const f=fixture({initial:2}),c=context.factory();c.apply(f.doc);assert.equal(f.writes,0);assert.equal(f.clicks.length,0);
  f.video.readyState=0;f.forceRate(1);c.apply(f.doc);assert.equal(f.writes,0);f.video.readyState=4;c.apply(f.doc);assert.equal(f.writes,1);
}
{
  const f=fixture({rates:['normal','最高','0x','Infinityx']}),c=context.factory();c.apply(f.doc);
  assert.equal(f.clicks.length,0,'Unrelated/invalid menu entries are never clicked');assert.equal(f.writes,1);
  assert.equal(c.apply(null),false);assert.equal(c.snapshot(null),null);
  assert.equal(c.apply({querySelector(){throw Error('Detached document');}}),false);
}
assert.doesNotMatch(source,/currentTime\s*=|duration\s*=|defineProperty|setInterval|setTimeout/,'No clock changes, property overrides or autonomous forcing loop');
console.log('PASS: native highest, one standard request, rejected/rolled-back rates, source identity, unrelated menus, and actual-rate feedback.');
