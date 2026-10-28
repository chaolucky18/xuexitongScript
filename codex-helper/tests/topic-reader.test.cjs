const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const full=fs.readFileSync(require('node:path').join(__dirname,'../codex-helper.template.user.js'),'utf8');
const source=full.slice(full.indexOf('function topicReaderHash('),full.indexOf('if(bootTopicReader(PAGE))return;'));
const api=vm.runInNewContext(source+';({createTopicReader,createTopicDomAdapter,bootTopicReader,topicReaderHash})',{URL,Math,Date});
function fixture({count=3,loaded=2,height=300,checkpoint=null}={}){
 let instant=10000,y=0,visible=true,focused=true,clicks=0,end=false,images=true,bottomShift=0,saved=checkpoint;
 const directory=Array.from({length:count},(_,i)=>({id:String(i+1),title:'1.'+(i+1)+' Section'})),sections=new Set(directory.slice(0,loaded).map(x=>x.id));
 const adapter={directory:()=>directory,loadedIds:()=>[...sections],active:()=>({visible,focused}),scrollTop:()=>y,viewportHeight:()=>100,
  measure:id=>sections.has(id)?{top:(Number(id)-1)*height,bottom:Number(id)*height+bottomShift,height:100,maxScrollTop:Math.max(0,count*height-100),scrollTop:y,imagesReady:images}:null,
  scrollTo:top=>{y=top;},loading:()=>false,loadMore:()=>{clicks++;return true;},nativeEnd:()=>end};
 const reader=api.createTopicReader({adapter,read:()=>saved,write:value=>{saved=JSON.parse(JSON.stringify(value));},now:()=>instant,dwellMs:2000,stableMs:0,loadTimeoutMs:3000,imageTimeoutMs:3000});
 return {reader,adapter,directory,get clicks(){return clicks;},get y(){return y;},get saved(){return saved;},
  tick(ms=1000){instant+=ms;return reader.tick();},steps(n){for(let i=0;i<n;i++)this.tick();},add:id=>sections.add(id),focus:value=>focused=value,visible:value=>visible=value,end:value=>end=value,images:value=>images=value,shift:value=>bottomShift=value};
}
{
 const f=fixture();assert.equal(f.reader.snapshot().enabled,false);f.steps(5);assert.equal(f.y,0);f.reader.start();
 for(let i=0;i<30&&f.reader.snapshot().browsedSections===0;i++)f.tick();
 assert.equal(f.reader.snapshot().browsedSections,1);assert.equal(f.reader.snapshot().currentSection,2);assert.ok(f.y>=200);
 assert.equal(f.clicks,0,'Already appended 1.2 is loaded, not automatically read or clicked');
}
{
 const f=fixture();f.reader.start();f.steps(3);const before=f.reader.snapshot(),position=f.y;
 f.visible(false);f.reader.visibilityChanged();f.tick(60000);assert.equal(f.y,position);assert.equal(f.reader.snapshot().foregroundMs,before.foregroundMs);
 f.visible(true);f.focus(false);f.reader.visibilityChanged();f.tick(60000);assert.equal(f.y,position);assert.equal(f.reader.snapshot().foregroundMs,before.foregroundMs);
 f.focus(true);f.reader.visibilityChanged();f.tick(60000);assert.equal(f.reader.snapshot().foregroundMs,before.foregroundMs,'Focus recovery does not retroactively count background time');
 f.reader.pause();const paused=f.reader.snapshot();f.tick(60000);assert.equal(f.y,position);assert.equal(f.reader.snapshot().foregroundMs,paused.foregroundMs);
 f.reader.start();f.steps(2);f.reader.stop();const stopped=f.reader.snapshot();f.tick(60000);assert.equal(f.reader.snapshot().foregroundMs,stopped.foregroundMs);assert.equal(f.clicks,0);
}
{
 const f=fixture({height:50,loaded:1,count:2});f.reader.start();while(f.reader.snapshot().browsedSections<1)f.tick();f.tick();
 assert.equal(f.clicks,1);f.tick();assert.equal(f.clicks,1,'Native loadMore is single flight');f.reader.pause();f.add('2');f.tick(60000);
 assert.equal(f.reader.snapshot().browsedSections,1,'Native content appended while paused is not treated as read');f.reader.start();f.steps(2);assert.equal(f.reader.snapshot().browsedSections,1);
}
{
 const f=fixture({height:50,loaded:1,count:2});f.reader.start();while(f.reader.snapshot().browsedSections<1)f.tick();f.steps(5);
 assert.equal(f.reader.snapshot().phase,'needs_attention');assert.equal(f.clicks,1);f.steps(10);assert.equal(f.clicks,1);
}
{
 const f=fixture();f.images(false);f.reader.start();f.steps(7);assert.equal(f.reader.snapshot().phase,'needs_attention');assert.equal(f.reader.snapshot().browsedSections,0);assert.equal(f.y,0);
 f.images(true);f.reader.start();f.steps(3);f.shift(20);const before=f.reader.snapshot().foregroundMs;f.tick();assert.equal(f.reader.snapshot().foregroundMs,before,'A layout shift resets dwell');
}
{
 const f=fixture({height:50,loaded:2,count:2});f.reader.start();while(f.reader.snapshot().browsedSections<2)f.tick();f.tick();
 assert.equal(f.y,0,'Short last section uses actual BODY maximum instead of repeatedly repositioning');
 assert.notEqual(f.reader.snapshot().phase,'complete','Directory exhaustion without native end evidence is not completion');assert.equal(f.clicks,1);
 f.end(true);f.tick();assert.equal(f.reader.snapshot().phase,'complete');assert.equal(f.reader.snapshot().platformCompletionVerified,false);
}
{
 const checkpoint={version:1,order:api.topicReaderHash('1|2|3|4'),doneIds:['1','2','3'],currentId:'4',offset:75,foregroundMs:100,enabled:true};
 const f=fixture({count:4,loaded:1,checkpoint});f.reader.start();f.tick();assert.equal(f.clicks,1);
 f.tick();assert.equal(f.clicks,1);f.add('2');f.tick();assert.equal(f.clicks,2);f.add('3');f.tick();assert.equal(f.clicks,3);
 f.add('4');f.tick();assert.equal(f.y,975);assert.equal(f.reader.snapshot().currentSection,4);assert.equal(f.reader.snapshot().browsedSections,3);
 assert.equal(f.saved.doneIds.join(','),'1,2,3','Loading the saved prefix does not re-mark sections');
}
{
 const f=fixture({height:50,loaded:1,count:2});f.reader.start();while(f.reader.snapshot().browsedSections<1)f.tick();f.tick();f.add('999');f.tick();
 assert.equal(f.reader.snapshot().phase,'needs_attention');assert.equal(f.reader.snapshot().browsedSections,1,'Unknown appended content cannot cross the topic boundary');
}
{
 const f=fixture();f.reader.start();f.steps(7);const checkpoint=f.saved,position=f.y;f.reader.dispose();f.tick(60000);assert.equal(f.y,position);
 const next=fixture({checkpoint});assert.equal(next.reader.resumeRequested,true);next.reader.start();next.steps(1);assert.equal(next.y,checkpoint.offset);
 const other=fixture({checkpoint:{...checkpoint,order:'different-topic'}});assert.equal(other.reader.resumeRequested,false);assert.equal(other.reader.snapshot().browsedSections,0);
 assert.notEqual(api.topicReaderHash('https://example.invalid/mooc-ans/zt/portal/one'),api.topicReaderHash('https://example.invalid/mooc-ans/zt/portal/two'));
}
// DOM adapter rejects duplicate SCRIPT IDs, hidden sections, unrelated directory links, and HTML scrollingElement.
{
 const body={id:'outerBody',scrollTop:0,clientHeight:100,scrollHeight:400,getBoundingClientRect:()=>({top:0})},html={scrollTop:0};
 const element=(extra={})=>({isConnected:true,getClientRects:()=>[{}],...extra});
 const image=element({complete:false,naturalWidth:0,getBoundingClientRect:()=>({top:20,bottom:50})});
 const offscreen=element({complete:false,naturalWidth:0,getBoundingClientRect:()=>({top:1000,bottom:1050})});
 const content=element({getBoundingClientRect:()=>({top:-body.scrollTop,bottom:300-body.scrollTop,height:300}),querySelectorAll:()=>[image,offscreen]});
 const real=element({id:'knowledge-1',tagName:'DIV',querySelector:()=>content});
 const script=element({id:'knowledge-1',tagName:'SCRIPT',querySelector(){throw Error('Script must not be inspected');}});Object.defineProperty(script,'innerText',{get(){throw Error('Script/config must not be read');}});
 const hidden=element({id:'knowledge-2',tagName:'DIV',hidden:true,querySelector:()=>content});
 const links=[['1','1.1 First'],['2','1.2 Second'],['10','1.10 Tenth']].map(([id,title])=>element({innerText:title,getAttribute:()=>'/mooc-ans/ztnodedetailcontroller/visitnodedetail?knowledgeId='+id}));
 links.unshift(element({innerText:'group',getAttribute:()=>'/unrelated?knowledgeId=999'}));
 const button=element({innerText:'加载更多',getAttribute:()=>null,click(){}});
 const page={location:{href:'https://example.invalid/mooc-ans/zt/portal/one',origin:'https://example.invalid'},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'}),document:{body,scrollingElement:html,visibilityState:'visible',hasFocus:()=>true,getElementById:id=>id==='outerBody'?body:id==='cardview'?{querySelectorAll:()=>[script,real,hidden]}:id==='loadbutton'?button:null,querySelectorAll:()=>links}};
 const adapter=api.createTopicDomAdapter(page);assert.equal(adapter.loadedIds().join(','),'1');assert.equal(adapter.directory().map(x=>x.id).join(','),'1,2,10');
 assert.equal(adapter.measure('1').imagesReady,false);image.complete=true;image.naturalWidth=100;assert.equal(adapter.measure('1').imagesReady,true);
 adapter.scrollTo(75);assert.equal(body.scrollTop,75);assert.equal(html.scrollTop,0);assert.equal(adapter.measure('1').top,0);
 assert.equal(adapter.nativeEnd(),false);button.hidden=true;assert.equal(adapter.nativeEnd(),true);
 assert.equal(api.bootTopicReader({location:{pathname:'/mycourse/studentstudy'}}),false);
}
console.log('PASS: topic foreground dwell, body scrolling, strict DIV filtering, native single-flight loading, timeout/boundaries, checkpoint isolation and completion evidence');
