const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../codex-helper.template.user.js'),'utf8');
const take=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const methods=take('_isCurrentVideo(video) {','_videoEventHandle() {');
const line=take('function createPlaybackLineRecovery(','function createPlaybackSpeedController(');
const selection=take('function selectChapterVideo(','function createVideoPopupQuestions(');
function fixture({code=2,storage=new Map(),session=null,now=200000,names=['公网1','公网2'],selected='公网1',attachment='native-attachment'}={}){
 let clicks=0,reloads=0,notifications=0,clock=now,busy=false;
 const allFrames=[],root={videos:[],frames:[]},win={};
 function doc(owner,frame=null){owner.defaultView={document:owner,frameElement:frame,getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})};owner.querySelectorAll=s=>s==='iframe'?owner.frames||[]:s.startsWith('video')?owner.videos||[]:[];return owner;}
 doc(root);Object.assign(win,root.defaultView);root.defaultView=win;win.document=root;
 root.getElementById=id=>id==='coursetree'?{}:null;
 root.querySelector=s=>s==='#coursetree .posCatalog_active .posCatalog_name'?{textContent:'7.1 Lesson'}:null;
 function addVideo({native=true,error=code,hidden=false,connected=true,stale=false,completed=false,ready=4}={}){
  const owner={videos:[],frames:[]};
  const wrapper={classList:{contains:s=>s==='ans-job-finished'&&completed}};
  const frame={ownerDocument:root,isConnected:true,hidden:false,getClientRects(){return this.hidden?[]:[{}];},getAttribute:name=>name==='src'?(native?'/ananas/modules/video/index.html':'/other'):name==='data'?JSON.stringify({objectid:attachment}):null,closest:()=>native?wrapper:null};
  doc(owner,frame);if(stale)owner.defaultView.document={};frame.contentDocument=owner;root.frames.push(frame);allFrames.push(frame);
  const video={ownerDocument:owner,isConnected:connected,hidden,currentTime:151.3,duration:424.32,readyState:ready,error:error?{code:error}:null,paused:true,ended:false,currentSrc:'https://cdn-one.invalid/path/media.mp4?token=one',getClientRects(){return this.hidden?[]:[{}];},play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;}};
  owner.videos=[video];
  const options=names.map(name=>({textContent:name,querySelector:()=>null,classList:{contains:()=>name===selected},getAttribute:key=>key==='aria-checked'&&name===selected?'true':'false',click(){selected=name;clicks++;video.currentSrc='https://cdn-two.invalid/completely/different/video.mp4?token=two';}}));
  owner.querySelector=s=>s==='video'?video:null;const query=owner.querySelectorAll;
  owner.querySelectorAll=s=>s==='.vjs-menu-item'?options:query(s);
  return {video,frame,owner};
 }
 const item=addVideo();
 class FakeDate extends Date{static now(){return clock;}}
 const state=session||{id:'network-session',deadline:99999999,lastRecovery:0,recoveries:0,videoRecoveries:{}};
 const c=vm.createContext({Date:FakeDate,URL,Map,Set,WeakSet,console,document:root,window:win,APP_KEY:'app',BOOT_TIMER_KEY:'boot',PAGE:{location:{reload(){reloads++;}}},
  sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},courseContext:'test-course',sessionState:state,
  monitorStopped:false,monitorGeneration:0,monitorPending:null,monitorTimer:null,videoQuestionTimer:null,chapterLineRecovery:null,
  monitorMode:'running',checks:0,engineType:'chapter',userStopped:false,endedTransition:null,courseQueue:null,
  lastMessage:'',lastIdentity:'',lastTime:null,lastProgress:clock,lastRecord:0,lastResume:0,monitorRecords:[],
  videoQuestions:{tick(){},dispose(){},isBlocking:()=>busy},playbackSpeed:{apply(){}},remainingTasks:()=>2,
  setStatus:text=>c.lastMessage=text,renderMonitor(){},notifyUser(){notifications++;},stopCodexConnection(){},releaseWakeLock(){},acquireWakeLock:async()=>{},
  checkEndedTransition:()=>'',clearInterval(){},saveSession(){},startButton:{},stopButton:{}});
 vm.runInContext(take('function nativeVideoCompleted(','function engineSnapshot()')+selection+line,c);
 const app=vm.runInContext('({'+methods+'})',c);app.cellData={currentVideoTitle:'Lesson'};app.destroy=()=>{};app.reachedDirectoryEnd=false;app._isChapterTest=()=>false;c.PAGE.app=app;
 vm.runInContext(take('function engineSnapshot()','function disposeIntegrated(')+take('function disposeIntegrated(','function monitorTick(){')+take('function trackPlaybackProgress(','function notifyUser(')+take('async function monitorTickOnce(','function hasChapterQuizLayout('),c);
 return {c,app,...item,root,addVideo,storage,state,get clicks(){return clicks;},get reloads(){return reloads;},get notifications(){return notifications;},advance(ms){clock+=ms;},setBusy(value){busy=value;},tick:()=>c.monitorTickOnce(0),snapshot:()=>c.engineSnapshot()};
}
(async()=>{
 // The actual generated selector and engine snapshot retain network errors for diagnosis.
 let f=fixture();assert.equal(f.app._getVideoEl(),f.video);assert.equal(f.snapshot().time,151.3);assert.equal(f.snapshot().mediaError,2);
 const next=f.addVideo({error:null});assert.equal(f.app._getVideoEl(),f.video,'Native media order must not skip the failed first attachment');
 for(const options of [{hidden:true},{connected:false},{stale:true}]){const bad=f.addVideo(options);assert.equal(f.app._isCurrentVideo(bad.video),false);}
 const hiddenFrame=f.addVideo({error:null});hiddenFrame.frame.hidden=true;assert.equal(f.app._isCurrentVideo(hiddenFrame.video),false);
 const detachedFrame=f.addVideo({error:null});detachedFrame.frame.isConnected=false;assert.equal(f.app._isCurrentVideo(detachedFrame.video),false);
 const unrelated=f.addVideo({native:false,error:null,ready:0});assert.equal(f.app._getVideoEl(),f.video);
 f.video.error=null;assert.equal(f.app._isCurrentVideo(f.video),true);f.video.error={code:2};
 await f.tick();assert.equal(f.clicks,1);assert.equal(f.reloads,0);assert.ok(f.c.chapterLineRecovery.isPending(f.frame));
 f.advance(30000);await f.tick();assert.equal(f.clicks,1);assert.equal(f.reloads,0);
 f.video.error=null;await f.tick();assert.ok(f.c.chapterLineRecovery.isPending(f.frame),'Error disappearance is not successful recovery');
 f.video.currentTime+=1;f.video.paused=false;await f.tick();assert.equal(f.c.chapterLineRecovery.isPending(f.frame),false);assert.equal(f.reloads,0);
 // Browser timer throttling may deliver the next monitor tick after 35 seconds.
 f=fixture();await f.tick();f.video.error=null;f.video.readyState=4;f.video.currentTime+=5;f.video.paused=false;f.advance(36000);await f.tick();
 assert.equal(f.reloads,0,'Already recovered media must not be reloaded by a delayed tick');assert.equal(f.c.chapterLineRecovery.hasFailed(f.frame),false);
 // Clearing an error without real progress still reaches the 35-second failure fallback.
 f=fixture();await f.tick();f.video.error=null;f.advance(35000);await f.tick();assert.equal(f.reloads,1);assert.equal(f.clicks,1);
 assert.equal(f.c.chapterLineRecovery,null,'Reload disposes pending recovery');
 const saved=f.storage,state=f.state;
 f=fixture({storage:saved,session:state,now:235000,selected:'公网2'});f.video.currentSrc='https://another-cdn.invalid/new-path?signature=new';
 await f.tick();assert.equal(f.clicks,0,'CDN/path changes and a fresh controller cannot restart the line cycle');assert.equal(f.reloads,0,'Reload cooldown survives reconstruction');
 f.advance(120001);await f.tick();assert.equal(f.reloads,1);assert.equal(state.recoveries,2);
 f=fixture({storage:saved,session:state,now:475002});await f.tick();assert.equal(f.reloads,0);assert.equal(f.c.monitorMode,'needs_attention');
 f=fixture({session:{id:'network-session',deadline:99999999,lastRecovery:0,recoveries:6,videoRecoveries:{}}});f.setBusy(true);await f.tick();assert.equal(f.clicks,0);assert.equal(f.reloads,0);
 f.setBusy(false);f.video.error={code:3};await f.tick();assert.equal(f.reloads,0);assert.equal(f.c.monitorMode,'needs_attention','Session reload cap remains active');
 for(const options of [{code:1},{code:3},{code:4},{names:['公网1']},{selected:'unknown'}]){f=fixture(options);await f.tick();assert.equal(f.clicks,0);assert.equal(f.reloads,1);}
 // A popup/manual controller blocks both a pending route recovery and subsequent reloads.
 f=fixture();await f.tick();f.setBusy(true);f.advance(40000);await f.tick();assert.equal(f.clicks,1);assert.equal(f.reloads,0);assert.equal(f.c.chapterLineRecovery,null);
 f=fixture();await f.tick();const helper=f.c.chapterLineRecovery;f.c.disposeIntegrated();assert.equal(helper.isPending(f.frame),false);assert.equal(f.c.monitorStopped,true);
 // Metadata-free native attachments use stable frame order; separate attachment IDs stay independent.
 f=fixture({attachment:''});await f.tick();assert.equal(f.clicks,1);const indexed=f.storage;
 f=fixture({attachment:'',storage:indexed,selected:'公网2'});await f.tick();assert.equal(f.clicks,0);assert.equal(f.reloads,1);
 f=fixture({attachment:'different-native-attachment',storage:indexed});await f.tick();assert.equal(f.clicks,1);
 console.log('PASS: actual failed-player selection/snapshot, native order/filtering, chapter alternate line, progress verification, 35s fallback, CDN-stable history, reload caps, popup priority and dispose');
})().catch(error=>{console.error(error);process.exitCode=1});
