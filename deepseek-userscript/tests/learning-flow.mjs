import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const coreSource=readFileSync(new URL('../quiz-core.cjs',import.meta.url),'utf8').replace('module.exports = createQuizCore();','');
const assistant=readFileSync(new URL('../review-assistant.js',import.meta.url),'utf8');
const submit=readFileSync(new URL('../submit-helper.cjs',import.meta.url),'utf8').replace('module.exports = createSubmissionHelper;','');
const flowPath=new URL('../learning-flow.cjs',import.meta.url);
let flow='';try {flow=readFileSync(flowPath,'utf8').replace('module.exports = createLearningFlow;','');} catch {}
function setup({tabs=true}={}) {
 const dom=new JSDOM(`${tabs?'<div class="prev_title" title="4.2 章节标题">4.2 章节标题</div><ul><li class="active"><div class="prev_white"><span>1</span><span>视频</span></div></li><li><div class="prev_white"><span>2</span><span>章节测验</span></div></li></ul>':''}<main></main>`,{url:'https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=101',runScripts:'outside-only'});
 const w=dom.window;
 w.Element.prototype.getClientRects=()=>[{width:100,height:20}];
 let next=0,opens=0,plays=0;
 w.__xuexitongPlayerV3={_scriptRunning:true,_clearCheckInterval(){},play(){plays++;},nextUnit(){if(w.__xuexitongDeepSeekReview.beforeNext?.())return;next++;}};
 w.fetch=async url=>({ok:true,json:async()=>url.endsWith('/health')?{configured:true}:{answers:[{id:1,letters:['A']}]}});
 const tabElements=[...w.document.querySelectorAll('.prev_white')];
 tabElements.forEach((el,i)=>el.onclick=()=>{tabElements.forEach(t=>t.parentElement.classList.remove('active'));el.parentElement.classList.add('active');if(i===1)opens++;});
 w.eval(`(function(){${coreSource}\n${submit}\n${flow}\n${assistant}})()`);
 return {w,tabElements,stats:()=>({next,opens,plays}),close:()=>w.close(),grade(){w.document.querySelector('main').innerHTML='<p>章节测验 已完成 第1次作答 本次成绩 100 分 我的答案：A</p>';}};
}
{
 const p=setup();
 p.w.__xuexitongPlayerV3.nextUnit();
 assert.equal(p.stats().next,0,'Video end must not skip its quiz');
 assert.equal(p.stats().opens,1,'Video end must click the chapter quiz tab');
 p.w.__xuexitongPlayerV3.nextUnit();assert.equal(p.stats().opens,1,'Repeated end signals must not reopen quiz');
 p.w.__xuexitongDeepSeekReview.scan();assert.equal(p.stats().next,0,'Unloaded quiz must hold navigation');
 p.grade();p.w.__xuexitongDeepSeekReview.scan();
 assert.equal(p.stats().next,1,'Only confirmed quiz completion permits next section');
 p.w.__xuexitongDeepSeekReview.scan();assert.equal(p.stats().next,1,'Completed grade must not advance twice');
 p.w.__xuexitongPlayerV3.nextUnit();assert.equal(p.stats().next,1,'A delayed second end callback must not advance twice before the URL changes');
 p.close();
}
console.log('PASS: video end opens quiz once, waits for completion and advances once');
{
 const p=setup({tabs:false});p.w.__xuexitongPlayerV3.nextUnit();assert.equal(p.stats().next,1);p.close();
}
console.log('PASS: sections without a quiz keep ordinary next-section navigation');
{
 const p=setup();p.w.__xuexitongPlayerV3.nextUnit();p.w.__xuexitongDeepSeekReview.stop();p.grade();p.w.__xuexitongDeepSeekReview.scan();assert.equal(p.stats().next,0);p.close();
}
console.log('PASS: stop cancels pending quiz navigation');
{
 const p=setup();p.w.__xuexitongPlayerV3.nextUnit();p.grade();p.w.history.replaceState({},'', '?chapterId=102');p.tabElements[0].click();p.w.__xuexitongDeepSeekReview.scan();assert.equal(p.stats().next,0,'Old grade cannot advance a newly selected section');p.close();
}
console.log('PASS: a stale grade cannot advance another section');
