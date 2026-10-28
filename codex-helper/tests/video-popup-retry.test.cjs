const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const full=fs.readFileSync(path.join(__dirname,'../codex-helper.template.user.js'),'utf8');
const source=full.slice(full.indexOf('function createVideoPopupQuestions('),full.indexOf('async function answerWithReview('));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

function fixture({kind='判断题',options=['A、对','B、错'],desired=['A'],request,storage=new Map(),autoResume=false,initialChecked=[],ignoreClicks=false,derivedTrustedChange=false}={}){
  let now=1000000,popupVisible=true,requests=0,submits=0,continues=0,valueReads=0,pauses=0,currentVideo=null;
  const statuses=[],errors=[],requested=[];
  const doc={defaultView:{getComputedStyle:element=>({display:element.hidden?'none':'block',visibility:'visible'})}};
  const element=(textContent='',extra={})=>({textContent,ownerDocument:doc,isConnected:true,hidden:false,getClientRects(){return !this.hidden&&popupVisible?[{}]:[];},...extra});
  const video={ownerDocument:doc,isConnected:true,currentSrc:'https://example.invalid/video.mp4?token=fixture',currentTime:100,paused:false,pause(){this.paused=true;pauses++;}};
  currentVideo=video;
  const title=element('这是题目'),type=element(kind);
  const inputs=options.map((_,index)=>element('',{type:kind==='多选题'?'checkbox':'radio',disabled:false,checked:initialChecked.includes(index),clicks:0,
    click(){this.clicks++;if(ignoreClicks)return;if(this.type==='radio'){for(const option of inputs)option.checked=false;this.checked=true;}else this.checked=!this.checked;if(derivedTrustedChange)listeners.change?.({type:'change',target:this,isTrusted:true});}}));
  for(const input of inputs)Object.defineProperty(input,'value',{get(){valueReads++;throw new Error('Platform grading value must never be read');}});
  const labels=options.map(label=>element(label));
  const rows=options.map((_,index)=>element('',{querySelector:selector=>selector==='label'?labels[index]:selector==='input[name="ans-videoquiz-opt"]'?inputs[index]:null}));
  const submitting=element('提交中',{hidden:true}),continuation=element('继续',{hidden:true,click(){continues++;popupVisible=false;video.paused=false;}});
  const wrong=element('答错',{hidden:true});
  const submit=element('提交',{click(){submits++;submitting.hidden=false;if(autoResume){popupVisible=false;video.paused=false;}}});
  const selectors={'.tkTopic_title':type,'.tkItem_title':title,'#videoquiz-submit':submit,'#videoquiz-submitting':submitting,'#videoquiz-continue':continuation,'#spanNot':wrong};
  const card=element('',{matches:selector=>selector==='.tkTopic',querySelector:selector=>selectors[selector]||null,querySelectorAll:selector=>selector==='li.ans-videoquiz-opt'?rows:[]});
  const listeners={};card.addEventListener=(type,handler)=>{listeners[type]=handler;};card.removeEventListener=(type,handler)=>{if(listeners[type]===handler)delete listeners[type];};
  const popup=element('',{matches:()=>false,querySelector:selector=>selector==='.tkTopic'?card:null});
  doc.querySelectorAll=selector=>selector==='.ans-videoquiz'?[popup]:selector==='.tkTopic'?[card]:[];
  class FakeDate extends Date{static now(){return now;}}
  const context=vm.createContext({URL,Date:FakeDate,sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))},
    getVideo:()=>currentVideo,requestAnswers:questions=>{requests++;requested.push(questions);return request?request(questions):Promise.resolve(new Map([[1,desired]]));},
    setStatus:message=>statuses.push(message),onError:message=>errors.push(message)});
  vm.runInContext(source+'\nthis.api=createVideoPopupQuestions({getVideo,requestAnswers,setStatus,onError,storageKey:signature=>"test:"+signature});',context);
  const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
  return {api:context.api,video,storage,statuses,errors,requested,inputs,labels,title,card,submitting,continuation,wrong,
    requireReview(){selectors['#spanNotBack']=element('请回看视频');},
    userSelect(index){if(kind!=='多选题')for(const input of inputs)input.checked=false;inputs[index].checked=!inputs[index].checked;listeners.change?.({type:'change',target:inputs[index],isTrusted:true});},
    userSubmit(){listeners.click?.({type:'click',target:{closest:()=>submit},isTrusted:true});submit.click();},
    get requests(){return requests;},get submits(){return submits;},get continues(){return continues;},get valueReads(){return valueReads;},get pauses(){return pauses;},
    hide(){popupVisible=false;},show(){popupVisible=true;},setVideo(value){currentVideo=value;},
    async tick(ms=1000){now+=ms;context.api.tick();await flush();},flush,
    advance(seconds=.2){video.currentTime+=seconds;video.paused=false;},
    journals(){return [...storage.values()].map(value=>JSON.parse(value));}};
}

(async()=>{
// Two stable observations are required; native click/submit is single flight and does not read hidden grading values.
{
  const f=fixture({autoResume:true});
  assert.equal(f.api.isBlocking(),true);
  await f.tick();assert.equal(f.requests,0);assert.equal(f.video.paused,true);
  await f.tick();assert.equal(f.requests,1);assert.equal(f.submits,1);
  assert.equal(f.inputs[0].checked,true);assert.equal(f.inputs[1].checked,false);
  assert.equal(f.journals()[0].state,'submitting');
  await f.tick();assert.equal(f.api.isBlocking(),true,'Disappearance alone is not playback confirmation');
  f.advance();await f.tick();assert.equal(f.journals()[0].state,'complete');
  assert.equal(f.api.isBlocking(),false);assert.equal(f.submits,1);assert.equal(f.valueReads,0);
  assert.equal(f.requested[0][0].kind,'判断题');
  assert.equal(f.requested[0][0].options[0].text,'对');
}

// A real visible native continue control may be clicked once; success still requires actual time progression.
{
  const f=fixture();await f.tick();await f.tick();
  f.submitting.hidden=true;f.continuation.hidden=false;
  await f.tick();assert.equal(f.continues,1);assert.equal(f.journals()[0].state,'submitting');
  await f.tick();assert.equal(f.continues,1);
  f.advance();await f.tick();assert.equal(f.journals()[0].state,'complete');
}

// Multiselect uses only normal clicks, clearing previously checked undesired choices.
{
  const f=fixture({kind:'多选题',options:['A、甲','B、乙','C、丙'],desired:['A','C'],initialChecked:[1],autoResume:true});
  await f.tick();await f.tick();
  assert.deepEqual(f.inputs.map(input=>input.checked),[true,false,true]);
  assert.equal(f.submits,1);assert.equal(f.valueReads,0);
}

// A changed/disappeared question invalidates its pending answer before any option or submit click.
for(const mutate of [f=>f.hide(),f=>{f.title.textContent='另一道题';},f=>{f.labels[1].textContent='B、另一个选项';},f=>{f.card.isConnected=false;},f=>{f.video.currentSrc='https://example.invalid/different.mp4';}]){
  const wait=deferred(),f=fixture({request:()=>wait.promise});await f.tick();await f.tick();
  assert.equal(f.requests,1);mutate(f);await f.tick();wait.resolve(new Map([[1,['A']]]));await f.flush();
  assert.equal(f.inputs.reduce((sum,input)=>sum+input.clicks,0),0);assert.equal(f.submits,0);assert.equal(f.errors.length,0);
}

// A new question waits for the stale request to finish rather than issuing concurrent calls.
{
  const wait=deferred(),f=fixture({request:()=>wait.promise});await f.tick();await f.tick();
  f.title.textContent='第二道题';await f.tick();await f.tick();assert.equal(f.requests,1);
  wait.resolve(new Map([[1,['A']]]));await f.flush();assert.equal(f.submits,0);
  await f.tick();assert.equal(f.requests,2);
}

// Reassessment must never resubmit the same rejected answer.
{
  const f=fixture();await f.tick();await f.tick();f.wrong.hidden=false;
  f.submitting.hidden=true;f.continuation.hidden=false;await f.tick();await f.tick();
  assert.equal(f.errors.length,1);assert.match(f.errors[0],/已被平台拒绝/);
  assert.equal(f.submits,1);assert.equal(f.continues,0);assert.equal(f.api.isBlocking(),true);
}

// Explicit wrong feedback permits a different answer, and carries feedback to the next request.
{
 let n=0;const f=fixture({request:()=>Promise.resolve(new Map([[1,[++n===1?'A':'B']]]))});
 await f.tick();await f.tick();f.wrong.hidden=false;f.submitting.hidden=true;
 await f.tick(2000);assert.equal(f.requests,2);assert.equal(f.submits,2);
 assert.equal(JSON.stringify(f.requested[1][0].retryRejected),'[["A"]]');
 assert.equal(f.inputs[1].checked,true);assert.equal(f.valueReads,0);
 f.wrong.hidden=true;f.submitting.hidden=true;f.continuation.hidden=false;
 await f.tick();f.advance();await f.tick();assert.equal(f.journals()[0].state,'complete');
}
// At most three distinct submissions, even if the platform keeps rejecting.
{
 let n=0;const f=fixture({kind:'单选题',options:['A、甲','B、乙','C、丙','D、丁'],request:()=>Promise.resolve(new Map([[1,['ABCD'[n++]]]]))});
 await f.tick();await f.tick();
 for(let i=0;i<3;i++){f.wrong.hidden=false;f.submitting.hidden=true;await f.tick(2000);}
 assert.equal(f.submits,3);assert.equal(f.requests,3);assert.match(f.errors[0],/上限/);
 const journal=f.journals()[0];assert.equal(journal.state,'manual');assert.equal(journal.rejected.length,3);assert.deepEqual(journal.submitted,['C']);
 for(let restart=0;restart<2;restart++){
   const next=fixture({kind:'单选题',options:['A、甲','B、乙','C、丙','D、丁'],storage:f.storage,desired:['D'],initialChecked:[2]});
   next.wrong.hidden=false;await next.tick();await next.tick();
   assert.equal(next.requests,0,'Three-rejection cap survives controller recreation');assert.equal(next.submits,0);
   assert.equal(next.journals()[0].rejected.length,3);assert.equal(next.journals()[0].state,'manual');
 }
}
// Visible rejection can be recovered after a controller restart, with saved rejected choices.
{
 const f=fixture();await f.tick();await f.tick();
 const next=fixture({storage:f.storage,desired:['B'],initialChecked:[0]});next.wrong.hidden=false;
 await next.tick();await next.tick();assert.equal(next.submits,1);assert.equal(JSON.stringify(next.requested[0][0].retryRejected),'[["A"]]');
}

// Submission ambiguity times out without duplicate requests or submits, and persists across a fresh controller.
{
  const f=fixture();await f.tick();await f.tick();await f.tick(60000);
  assert.equal(f.errors.length,1);assert.match(f.errors[0],/60秒/);assert.equal(f.submits,1);
  const before=f.journals()[0];assert.equal(before.state,'manual');assert.equal(before.previousState,'submitting');assert.deepEqual(before.submitted,['A']);
  const next=fixture({storage:f.storage});next.wrong.hidden=false;await next.tick();await next.tick();
  assert.equal(next.requests,0);assert.equal(next.submits,0);assert.ok(next.statuses.some(s=>/60秒/.test(s)));
  assert.deepEqual(next.journals()[0].submitted,['A']);assert.equal(next.journals()[0].state,'manual');
}

// Manual ownership and a native review requirement remain authoritative after a fresh controller.
for(const reason of ['human','review']){
 const wait=deferred(),f=fixture({request:()=>wait.promise});await f.tick();await f.tick();
 if(reason==='human')f.userSelect(1);else{f.requireReview();wait.resolve(new Map([[1,['A']]]));await f.flush();await f.tick();assert.equal(f.submits,0);}
 const before=f.journals()[0];assert.equal(before.state,'manual');
 const next=fixture({storage:f.storage,desired:['A'],initialChecked:[1]});next.wrong.hidden=false;
 await next.tick();await next.tick();assert.equal(next.requests,0);assert.equal(next.submits,0);
 assert.equal(next.inputs[1].checked,true);assert.equal(next.journals()[0].state,'manual');
 if(reason==='human'){wait.reject(Error('late failure'));await f.flush();assert.equal(f.errors.length,0);}
}

// Shared validator failures and native selection failures do not submit or create a submitting journal.
for(const options of [{desired:['Z']},{ignoreClicks:true},{request:()=>Promise.reject(new Error('confidence not high'))}]){
  const f=fixture(options);await f.tick();await f.tick();
  assert.equal(f.errors.length,1);assert.equal(f.submits,0);assert.equal(f.journals().some(j=>j.state==='submitting'),false);
}

// Human selection owns the question even when an asynchronous model returns a different answer.
for(const kind of ['单选题','多选题']){
 const f=fixture({kind,derivedTrustedChange:true,autoResume:true});await f.tick();await f.tick();
 assert.equal(f.submits,1,'Trusted change derived from a script click is not human takeover');assert.equal(f.errors.length,0);
 assert.equal(f.journals()[0].state,'submitting');f.advance();await f.tick();assert.equal(f.api.isBlocking(),false);
}
for(const kind of ['单选题','多选题']){
 const wait=deferred(),f=fixture({kind,request:()=>wait.promise});await f.tick();await f.tick();
 f.userSelect(1);assert.equal(f.requested[0][0].isCurrent(),false);
 wait.resolve(new Map([[1,['A']]]));await f.flush();
 assert.equal(f.inputs[1].checked,true);assert.equal(f.inputs[0].checked,false);
 assert.equal(f.inputs.reduce((n,input)=>n+input.clicks,0),0);assert.equal(f.submits,0);assert.equal(f.errors.length,0);
 await f.tick();await f.tick();assert.equal(f.requests,1,'Same manually owned question is not restarted');
 f.hide();await f.tick();assert.equal(f.api.isBlocking(),true,'Popup disappearance alone is not completion');
 f.advance();await f.tick();assert.equal(f.api.isBlocking(),false);assert.equal(f.submits,0);
}
// Selection-change fallback also protects events not observed by the listener.
{
 const wait=deferred(),f=fixture({request:()=>wait.promise});await f.tick();await f.tick();f.inputs[1].checked=true;
 wait.resolve(new Map([[1,['A']]]));await f.flush();assert.equal(f.submits,0);assert.equal(f.inputs[1].checked,true);assert.equal(f.errors.length,0);
}
// A trusted submit invalidates old success and rejection without duplicate submission or a global error.
for(const outcome of ['success','reject']){
 const wait=deferred(),f=fixture({request:()=>wait.promise});await f.tick();await f.tick();
 f.userSubmit();f.hide();await f.tick();
 if(outcome==='success')wait.resolve(new Map([[1,['A']]]));else wait.reject(Error('old request failed'));
 await f.flush();assert.equal(f.submits,1);assert.equal(f.errors.length,0);
 f.advance();await f.tick();assert.equal(f.api.isBlocking(),false);
}
// A local model failure leaves manual completion observable, and the next question can still run.
{
 const wait=deferred();let calls=0;
 const f=fixture({request:()=>++calls===1?wait.promise:Promise.resolve(new Map([[1,['B']]]))});
 await f.tick();await f.tick();wait.reject(Error('service unavailable'));await f.flush();
 assert.equal(f.errors.length,1);assert.equal(f.api.isBlocking(),true);assert.equal(f.submits,0);
 f.hide();await f.tick();assert.equal(f.api.isBlocking(),true);f.advance();await f.tick();assert.equal(f.api.isBlocking(),false);
 f.title.textContent='下一道弹题';f.show();await f.tick();await f.tick();assert.equal(f.requests,2);assert.equal(f.submits,1);
}

// Hidden popups and disposed pending requests cause no side effects.
{
  const f=fixture();f.hide();await f.tick();await f.tick();assert.equal(f.requests,0);assert.equal(f.pauses,0);assert.equal(f.api.isBlocking(),false);
}
{
  const wait=deferred(),f=fixture({request:()=>wait.promise});await f.tick();await f.tick();f.api.dispose();
  wait.resolve(new Map([[1,['A']]]));await f.flush();assert.equal(f.submits,0);assert.equal(f.api.isBlocking(),false);assert.equal(f.errors.length,0);
}
console.log('Video popup checks passed: stable native extraction, Codex single flight, no grading-value reads, stale-answer rejection, exact selection, one submit, native confirmation, errors and disposal.');
})().catch(error=>{console.error(error);process.exitCode=1;});
