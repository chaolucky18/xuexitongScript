const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../codex-helper.template.user.js'),'utf8');
const moduleCode=source.slice(source.indexOf('function topicReaderHash('),source.indexOf('if(bootTopicReader(PAGE))return;'));
const helper=vm.runInNewContext(moduleCode+';({topicReaderHash})',{Math});
function page(pathname,storage=new Map()){
 const timers=new Map(),queue={unchanged:true};let sequence=0,network=0,settings=0;
 const element=()=>({style:{},dataset:{},children:[],append(...nodes){this.children.push(...nodes);},remove(){}});
 const body=element();Object.assign(body,{id:'outerBody',scrollTop:0,scrollHeight:500,clientHeight:100});
 const links=['1','2'].map(id=>({isConnected:true,innerText:'1.'+id,getClientRects:()=>[{}],getAttribute:()=>'/mooc-ans/ztnodedetailcontroller/visitnodedetail?knowledgeId='+id}));
 const doc={body,visibilityState:'visible',hasFocus:()=>true,createElement:element,addEventListener(){},removeEventListener(){},
  getElementById:id=>id==='outerBody'?body:id==='cardview'?{querySelectorAll:()=>[]}:null,querySelectorAll:()=>links};
 const win={document:doc,location:{origin:'https://example.invalid',pathname,href:'https://example.invalid'+pathname},getComputedStyle:()=>({display:'block',visibility:'visible'}),
  sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},addEventListener(){},removeEventListener(){},
  setInterval:fn=>{timers.set(++sequence,fn);return sequence;},clearInterval:id=>timers.delete(id),__codexCourseQueue:queue,
  __xuexitongMonitor:{dispose(){throw Error('Normal course monitor must not be touched by topic route');}}};
 const context=vm.createContext({unsafeWindow:win,document:doc,URL,Math,Date,
  GM_xmlhttpRequest(){network++;throw Error('No Codex requests on a topic page');},GM_getValue(){settings++;throw Error('No queue settings on a topic page');}});
 vm.runInContext(source,context);
 return {win,doc,queue,timers,get network(){return network;},get settings(){return settings;}};
}
const storage=new Map(),route='/mooc-ans/zt/portal/topic-one';
const first=page(route,storage);assert.ok(first.win.__codexTopicReader);assert.equal(first.win.__codexTopicReader.snapshot().enabled,false);
assert.equal(first.win.__codexCourseQueue,first.queue);assert.equal(first.network,0);assert.equal(first.settings,0);assert.equal(first.timers.size,1);
first.win.__codexTopicReader.start();assert.equal(first.win.__codexTopicReader.snapshot().enabled,true);first.win.__codexTopicReader.dispose();assert.equal(first.timers.size,0);
const same=page(route,storage);assert.equal(same.win.__codexTopicReader.snapshot().enabled,true,'A previously enabled topic may resume its own checkpoint');same.win.__codexTopicReader.pause();
const other=page('/mooc-ans/zt/portal/topic-two',storage);assert.equal(other.win.__codexTopicReader.snapshot().enabled,false,'Another topic cannot inherit enabled state');
const serialized=JSON.stringify(other.win.__codexTopicReader.snapshot());assert.ok(!serialized.includes('/mooc-ans/'));assert.ok(!serialized.includes('token'));assert.ok(!serialized.includes('SCRIPT'));
assert.ok(source.indexOf('if(bootTopicReader(PAGE))return;')<source.indexOf('if(bootCourseQueuePage())return;'));
assert.ok(source.includes('// @match        *://*.chaoxing.com/mooc-ans/zt/portal/*'));
console.log('PASS: full userscript topic router precedes queue/player/Codex initialization, independent enabled checkpoints and private-free summaries');
