const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const template=fs.readFileSync(path.join(__dirname,'../codex-helper.template.user.js'),'utf8');
const source=template.slice(template.indexOf('function createDocumentReader('),template.indexOf('function createPlaybackLineRecovery('))+'\n'+template.slice(template.indexOf('function createChapterFlowAdapter('),template.indexOf('function selectChapterVideo('));

function fixture({documents=0,video=false,ended=false,step='阅读',steps=[step],pending=0,last=true,viewerReady=true,hiddenDocument=false,missingCounts=false,completedIcons=false}={}){
  let now=1000000,nextCalls=0,clearCalls=0,pauseCalls=0,timerId=0;
  const intervals=new Map(),storage=new Map(),statuses=[];
  const defaultView={getComputedStyle:element=>({display:element.hidden?'none':'block',visibility:'visible'})};
  const element=(textContent='',extra={})=>({textContent,ownerDocument:{defaultView},isConnected:true,getClientRects(){return this.hidden?[]:[{}];},...extra});
  const nodes=[element('',{id:'one'}),element('',{id:'two'})];
  let active=last?nodes[1]:nodes[0];
  const title=element(step,{title:step});
  const stepNodes=steps.map((name,index)=>element((index+1)+name));
  const orange=element(String(pending));
  const zero=element('0');
  for(const node of nodes)node.querySelector=selector=>selector==='.posCatalog_name'?element(node.id):selector==='.orangeNew'&&!missingCounts?(node===active?orange:zero):selector==='.icon_Completed'&&completedIcons?element():null;
  const media=video?element('',{ended,paused:false,currentTime:0,duration:50,pause(){this.paused=true;pauseCalls++;}}):null;
  const videoDoc={defaultView,querySelectorAll:selector=>selector==='video'?[media]:[],querySelector:selector=>selector==='video'?media:null};
  if(media)media.ownerDocument=videoDoc;
  const docFrames=Array.from({length:documents},(_,index)=>{
    const scroller={scrollTop:0,scrollHeight:450,clientHeight:600};
    const page={getBoundingClientRect:()=>({top:0,bottom:450}),querySelector:()=>({complete:true,naturalWidth:800})};
    const viewer={defaultView:{...defaultView,innerHeight:600,scrollTo({top}){scroller.scrollTop=top;}},scrollingElement:scroller,querySelectorAll:()=>[page]};
    const moduleDoc={defaultView,getElementById:id=>id==='panView'&&viewerReady?{contentDocument:viewer}:null};
    return element('',{hidden:hiddenDocument,src:'https://example.invalid/ananas/modules/pdf/index.html',contentDocument:moduleDoc,
      getAttribute(name){return name==='src'?this.src:name==='data'?JSON.stringify({name:'slides-'+index+'.pdf'}):null;},
      closest:()=>({classList:{contains:()=>false}}),scrollIntoView(){}});
  });
  const videoFrame=media?element('',{contentDocument:videoDoc,getAttribute:()=>'/ananas/modules/video/index.html',closest:()=>null}):null;
  const cardsDoc={defaultView,querySelectorAll:selector=>selector==='iframe'?[...docFrames,...(videoFrame?[videoFrame]:[])]:[]};
  const cardsFrame=element('',{contentDocument:cardsDoc});
  const doc={defaultView,visibilityState:'visible',
    getElementById:id=>id==='iframe'?cardsFrame:null,
    querySelector:selector=>selector==='#coursetree .posCatalog_active'?active:selector==='.prev_title'?title:null,
    querySelectorAll:selector=>selector==='iframe[src*="/knowledge/cards"]'?[cardsFrame]:selector==='.prev_white'?stepNodes:
      selector==='#coursetree .posCatalog_select:not(.firstLayer)'?nodes:selector==='#coursetree .posCatalog_select:not(.firstLayer) .orangeNew'?(missingCounts?[]:[orange,zero]):[]};
  cardsFrame.ownerDocument=doc;
  const app={_nextUnitPending:false,_isPlaying:false,_clearCheckInterval(){clearCalls++;},nextUnit(){nextCalls++;},_getVideoEl:()=>media};
  class FakeDate extends Date{static now(){return now;}}
  const context=vm.createContext({URL,Date:FakeDate,document:doc,location:{href:'https://example.invalid/study?courseId=demo'},
    sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))},
    setInterval:callback=>{const id=++timerId;intervals.set(id,callback);return id;},clearInterval:id=>intervals.delete(id),
    createDocumentImageRangeRecovery:()=>({cancel(){},recover:async()=>false}),setStatus:message=>statuses.push(message),app});
  vm.runInContext(source+'\nthis.flow=createChapterFlowAdapter(app);',context);
  return {flow:context.flow,app,media,title,orange,stepNodes,storage,statuses,docFrames,videoFrame,videoDoc,
    get nextCalls(){return nextCalls;},get clearCalls(){return clearCalls;},get pauseCalls(){return pauseCalls;},get activeTimers(){return intervals.size;},
    tick(ms=1000){now+=ms;for(const callback of [...intervals.values()])callback();},
    setActive(node){active=node;},nodes};
}

// A side-by-side PDF must never take control from a playing video.
{
  const f=fixture({documents:1,video:true,step:'视频',steps:['视频','章节测验']});
  assert.equal(f.flow.isReadableStep(),false);
  assert.equal(f.flow.startReading(),false);
  assert.equal(f.flow.readingSnapshot(),null);
  f.app._nextUnitPending=true;
  assert.equal(f.flow.beforeAdvance(),true,'A late ended callback cannot skip a new playing video');
  assert.equal(f.app._nextUnitPending,false);
  assert.equal(f.nextCalls,0);
}

// Read all native document pages after the video, then resume the native quiz transition.
{
  const f=fixture({video:true,ended:true,step:'视频',steps:['视频','章节测验']});
  f.videoDoc.querySelectorAll=()=>[];f.videoDoc.querySelector=()=>null;
  assert.equal(f.flow.beforeAdvance(),true,'A native video iframe with a loading player must block advancement');
  assert.equal(f.nextCalls,0);assert.equal(f.app.reachedDirectoryEnd,undefined);
  f.videoFrame.closest=()=>({classList:{contains:()=>true}});
  assert.equal(f.flow.beforeAdvance(),false,'A natively completed loading attachment does not block the quiz');
}
{
  const f=fixture({documents:2,video:true,ended:true,step:'视频',steps:['视频','章节测验'],pending:1});
  f.app._nextUnitPending=true;
  assert.equal(f.flow.beforeAdvance(),true);
  assert.equal(f.app._nextUnitPending,false);
  assert.equal(f.flow.readingSnapshot().title,'slides-0.pdf');
  f.tick(7999);assert.equal(f.nextCalls,0);
  f.tick(1);assert.equal(f.nextCalls,0);
  f.tick();assert.equal(f.flow.readingSnapshot().title,'slides-1.pdf');
  f.tick(8000);assert.equal(f.nextCalls,0);
  f.tick();assert.equal(f.nextCalls,1);
  assert.equal(f.flow.readingSnapshot(),null);
  assert.equal(f.activeTimers,0);
  assert.equal(f.app.reachedDirectoryEnd,undefined);
  assert.equal(f.flow.beforeAdvance(),false,'Already browsed documents do not intercept again');
  assert.equal([...f.storage.values()].filter(value=>JSON.parse(value).browsedAt).length,2);
}

// The final zero-task reading node completes only after real reader dwell and traversal.
{
  const f=fixture({documents:1});
  assert.equal(f.flow.isReadableStep(),true);
  assert.equal(f.flow.startReading(),true);
  assert.equal(f.app.reachedDirectoryEnd,undefined);
  f.tick(8000);assert.equal(f.app.reachedDirectoryEnd,undefined);
  f.tick();assert.equal(f.app.reachedDirectoryEnd,true);
  assert.equal(f.app._nextUnitPending,false);
  assert.equal(f.app._isPlaying,false);
  assert.equal(f.nextCalls,0);
  assert.equal(f.activeTimers,0);
}

// Directory position, native step position and remaining platform tasks all constrain completion.
for(const options of [{last:false},{steps:['章节测验','阅读']},{pending:1}]){
  const f=fixture({step:'章节测验',...options});
  assert.equal(f.flow.beforeAdvance({quizDone:true}),false,JSON.stringify(options));
  assert.equal(f.app.reachedDirectoryEnd,undefined);
}
{
  const f=fixture({step:'章节测验'});
  f.app._nextUnitPending=true;
  assert.equal(f.flow.beforeAdvance({quizDone:true}),true);
  assert.equal(f.app.reachedDirectoryEnd,true);
  assert.equal(f.app._nextUnitPending,false);
}
{
  const f=fixture({step:'视频',video:true,ended:true});
  assert.equal(f.flow.beforeAdvance(),true);
  assert.equal(f.app.reachedDirectoryEnd,true);
  assert(f.pauseCalls>0);
}
{
  const f=fixture({step:'章节测验'});
  f.setActive(null);
  assert.equal(f.flow.beforeAdvance({quizDone:true}),false,'A missing active node is not directory completion');
}
{
  const f=fixture({documents:1,step:'',steps:[]});
  f.flow.startReading();f.tick(8000);f.tick();
  assert.equal(f.app.reachedDirectoryEnd,true,'A standalone final PDF need not have native step tabs');
}
{
  const f=fixture({step:'章节测验',missingCounts:true});
  assert.equal(f.flow.beforeAdvance({quizDone:true}),false,'Absent task counts cannot be inferred as zero');
}
{
  const f=fixture({step:'章节测验',missingCounts:true,completedIcons:true});
  assert.equal(f.flow.beforeAdvance({quizDone:true}),true,'Native completed icons provide explicit completion evidence');
}
{
  const f=fixture({step:'章节测验'});f.orange.textContent='';
  assert.equal(f.flow.beforeAdvance({quizDone:true}),false,'An empty task marker is still loading, not a confirmed zero');
}

// Unknown HTML and hidden document frames do not count as browsed reading content.
for(const options of [{},{documents:1,hiddenDocument:true}]){
  const f=fixture(options);
  assert.equal(f.flow.isReadableStep(),false);
  assert.equal(f.flow.startReading(),false);
  assert.equal(f.flow.beforeAdvance(),false);
  assert.equal(f.app.reachedDirectoryEnd,undefined);
}

// A reader failure propagates to the existing monitor attention path and stops its timers.
{
  const f=fixture({documents:1,viewerReady:false});
  f.flow.startReading();f.tick(45001);
  assert.match(f.app.quizFailure,/阅读器未能加载/);
  assert.equal(f.activeTimers,0);
  assert.equal(f.flow.readingSnapshot(),null);
  assert.equal(f.nextCalls,0);
}

// Navigation while reading cancels the obsolete reader without advancing the new page.
{
  const f=fixture({documents:1});
  f.flow.startReading();f.setActive(f.nodes[0]);f.tick();
  assert.equal(f.activeTimers,0);assert.equal(f.nextCalls,0);
}
{
  const f=fixture({documents:1});
  f.flow.startReading();f.docFrames.length=0;f.tick();
  assert.equal(f.activeTimers,0);assert.equal(f.nextCalls,0,'Removed documents cannot be mistaken for finished reading');
}
{
  const f=fixture({documents:1});
  f.flow.startReading();f.flow.dispose();f.tick(60000);
  assert.equal(f.activeTimers,0);assert.equal(f.nextCalls,0);
  assert.equal(f.flow.startReading(),false);
}

console.log('Chapter adapter checks passed: playing-video guard, native PDF reading, final-node completion, quiz preservation, failure and disposal.');
