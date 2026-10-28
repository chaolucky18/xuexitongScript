const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const template=fs.readFileSync(require('node:path').join(__dirname,'../codex-helper.template.user.js'),'utf8');
const source=template.slice(template.indexOf('function selectChapterVideo('),template.indexOf('function createVideoPopupQuestions('));
const api=vm.runInNewContext('(()=>{'+source+';return {selectChapterVideo,prepareChapterVideo}})()',{nativeVideoCompleted:v=>v.completed});
function video({native=true,completed=false,ended=false,ready=4}={}){
 let clicks=0;const button={getClientRects:()=>[{}],click(){clicks++}};
 const frame={getAttribute:()=>native?'/ananas/modules/video/index.html':'/unrelated',closest:()=>native?{}:null,scrollIntoView(){}};
 const doc={defaultView:{frameElement:frame,getComputedStyle:()=>({display:'block',visibility:'visible'})},querySelector:()=>button};
 return {completed,ended,readyState:ready,duration:ready?60:NaN,paused:true,ownerDocument:doc,get clicks(){return clicks}};
}
const done=video({completed:true,ended:true}),next=video({ready:0});
assert.equal(api.selectChapterVideo([done,next]),next,'Loaded completed player must not starve unloaded next attachment');
assert.equal(api.selectChapterVideo([done,next,video()]),next,'Native attachment order is preserved');
api.prepareChapterVideo(next);api.prepareChapterVideo(next);assert.equal(next.clicks,1,'Native lazy-load button is clicked once');
next.readyState=4;assert.equal(api.selectChapterVideo([done,next]),next);
next.ended=true;assert.equal(api.selectChapterVideo([done,next]),done,'All completed videos remain available for normal chapter advancement');
const empty=video({native:false,ready:0}),loaded=video({native:false});assert.equal(api.selectChapterVideo([empty,loaded]),loaded,'Unrelated empty sibling must not replace loaded video');
api.prepareChapterVideo(empty);assert.equal(empty.clicks,0);assert.equal(api.selectChapterVideo([]),null);
console.log('PASS: native multi-video order, lazy loading once, completed fallback, unrelated empty siblings');
