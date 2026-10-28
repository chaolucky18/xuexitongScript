// ==UserScript==
// @name         学习通 Codex 章节练习助手
// @namespace    local.codex.xuexitong.chapter-helper
// @version      4.5.1
// @description  最高可用倍速、线路恢复、文档阅读与章节答题；整课完成后按列表顺序继续未完成课程
// @author       Codex
// @match        *://*.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mycourse/stu*
// @match        *://*.chaoxing.com/mooc2-ans/mycourse/stu*
// @match        *://*.chaoxing.com/visit/interaction*
// @match        *://*.chaoxing.com/mooc2-ans/visit/interaction*
// @match        *://*.chaoxing.com/mooc-ans/zt/portal/*
// @run-at       document-end
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      127.0.0.1
// @noframes
// ==/UserScript==
// Based on upstream 9a23b35, with local player validation and Codex integration.
(function xuexitongMain() {
const PAGE = unsafeWindow;
const window = PAGE;
function topicReaderHash(value){let result=2166136261;for(const char of String(value))result=Math.imul(result^char.charCodeAt(0),16777619);return (result>>>0).toString(36);}
function createTopicReader({adapter,read=()=>null,write=()=>{},now=()=>Date.now(),dwellMs=12000,stableMs=1000,loadTimeoutMs=30000,imageTimeoutMs=45000}){
  const directory=adapter.directory(),ids=directory.map(item=>item.id),order=topicReaderHash(ids.join('|'));
  let saved=null;try{saved=read();}catch{}
  if(!saved||saved.version!==1||saved.order!==order||!Array.isArray(saved.doneIds)||!saved.doneIds.every((id,index)=>ids[index]===id))saved=null;
  let done=saved?saved.doneIds.slice():[],index=done.length,offset=saved&&saved.currentId===ids[index]&&Number.isFinite(saved.offset)?Math.max(0,saved.offset):0;
  let enabled=false,disposed=false,phase='idle',message='点击开始阅读',lastTick=null,dwell=0,foregroundMs=Number(saved?.foregroundMs)||0,screen=Number(saved?.screen)||1,layout=null,layoutFor=0,imageWait=0,pending=null,positioned=false,lastForegroundAt=null,lastAdvanceAt=null;
  const resumeRequested=Boolean(saved?.enabled);
  function save(){try{write({version:1,order,doneIds:done.slice(),currentId:ids[index]||null,offset,screen,foregroundMs,enabled});}catch{}}
  function attention(reason){enabled=false;phase='needs_attention';message=reason;lastTick=null;pending=null;save();}
  function summary(){const active=adapter.active();return {version:'4.5.0',enabled,phase,message,currentSection:index<directory.length?index+1:directory.length,currentTitle:directory[index]?.title||'目录末尾',totalSections:directory.length,browsedSections:done.length,screen,screenDwellMs:Math.floor(dwell),foregroundMs:Math.floor(foregroundMs),visible:active.visible,focused:active.focused,eligible:active.visible&&active.focused,scrollTop:Math.round(adapter.scrollTop()),viewportHeight:Math.round(adapter.viewportHeight()),lastForegroundAt,lastAdvanceAt,loading:Boolean(pending),platformCompletionVerified:false};}
  function start(){if(disposed||phase==='complete')return false;if(!directory.length){attention('没有找到可识别的专题目录');return false;}enabled=true;phase='running';message='准备显示当前章节';lastTick=null;positioned=false;layout=null;layoutFor=0;imageWait=0;dwell=0;save();return true;}
  function pause(){if(disposed)return;enabled=false;phase='paused';message='已暂停，可继续当前阅读位置';lastTick=null;save();}
  function stop(){if(disposed)return;enabled=false;phase='stopped';message='已停止，阅读断点已保留';lastTick=null;pending=null;save();}
  function visibilityChanged(){lastTick=null;if(enabled&&!disposed){const active=adapter.active();if(!active.visible||!active.focused){phase='waiting_focus';message='切回专题页面并保持聚焦后继续';}}}
  function finish(){enabled=false;phase='complete';message='本专题目录已逐屏浏览；平台任务状态请查看原页面';lastTick=null;pending=null;save();}
  function waitForContent(expected,delta){
    const loaded=adapter.loadedIds();
    if(loaded.some(id=>!ids.includes(id))){attention('发现目录之外的内容，已停止自动浏览');return false;}
    if(!loaded.every((id,position)=>ids[position]===id)){attention('专题加载顺序与目录不一致，请检查页面');return false;}
    if(pending){
      if(expected&&adapter.measure(expected)){pending=null;positioned=false;layout=null;layoutFor=0;imageWait=0;return true;}
      if(!expected&&adapter.nativeEnd()){finish();return false;}
      if(expected&&loaded.length>pending.before.length){pending=null;return waitForContent(expected,0);}
      pending.elapsed+=delta;phase='loading';message='正在等待原生页面加载下一节';
      if(pending.elapsed>=loadTimeoutMs)attention('加载更多后未出现目录中的下一节，请检查页面');
      return false;
    }
    if(!expected&&adapter.nativeEnd()){finish();return false;}
    if(expected&&adapter.measure(expected))return true;
    if(!loaded.length||expected&&loaded.includes(expected)){
      pending={expected,elapsed:0,before:loaded.slice()};phase='loading';message='等待原生章节正文显示';return false;
    }
    if(adapter.loadMore()||adapter.loading()){
      pending={expected,elapsed:0,before:loaded.slice()};phase='loading';message='已请求原生加载更多，等待内容显示';return false;
    }
    attention(expected?'尚未找到下一节或可用的原生加载更多按钮':'目录已浏览，原生页面末尾状态尚未确认');return false;
  }
  function tick(){
    if(disposed||!enabled)return summary();
    const instant=now(),active=adapter.active();
    if(!active.visible||!active.focused){lastTick=null;phase='waiting_focus';message='切回专题页面并保持聚焦后继续';return summary();}
    const delta=lastTick===null?0:Math.max(0,Math.min(1500,instant-lastTick));lastTick=instant;lastForegroundAt=instant;
    try{
      if(index>=directory.length){waitForContent(null,delta);return summary();}
      const id=ids[index];if(!waitForContent(id,delta))return summary();
      const measure=adapter.measure(id);
      if(!measure||!Number.isFinite(measure.top)||!Number.isFinite(measure.bottom)||measure.bottom<=measure.top||measure.height<=0){attention('当前正文或滚动区域不可用，请检查页面');return summary();}
      const maxOffset=Math.max(0,measure.bottom-measure.top-measure.height);offset=Math.min(offset,maxOffset);
      const target=Math.max(0,Math.min(measure.top+offset,Number.isFinite(measure.maxScrollTop)?measure.maxScrollTop:Infinity));
      if(!positioned||Math.abs(measure.scrollTop-target)>5){
        adapter.scrollTo(target);positioned=true;layout=null;layoutFor=0;dwell=0;phase='running';message='正在显示第 '+(index+1)+' 节正文';save();return summary();
      }
      if(!measure.imagesReady){imageWait+=delta;dwell=0;layout=null;layoutFor=0;phase='waiting_images';message='等待当前视口图片加载';if(imageWait>=imageTimeoutMs)attention('当前视口图片未加载完成，请检查网络后继续');return summary();}
      imageWait=0;
      const token=[measure.top,measure.bottom,measure.height];
      if(!layout||token.some((value,i)=>Math.abs(value-layout[i])>2)){layout=token;layoutFor=0;dwell=0;phase='stabilizing';message='等待正文布局稳定';return summary();}
      layoutFor+=delta;if(layoutFor<stableMs){phase='stabilizing';message='等待正文布局稳定';return summary();}
      phase='reading';message='前台浏览第 '+(index+1)+' 节 · 第 '+screen+' 屏';dwell+=delta;foregroundMs+=delta;
      if(dwell<dwellMs){save();return summary();}
      if(measure.scrollTop+measure.height>=measure.bottom-2){
        done.push(id);index++;offset=0;screen=1;dwell=0;layout=null;layoutFor=0;positioned=false;lastAdvanceAt=instant;message='本节已浏览，准备显示下一节';save();return summary();
      }
      offset=Math.min(maxOffset,offset+Math.max(1,measure.height*0.75));screen++;dwell=0;layout=null;layoutFor=0;positioned=false;lastAdvanceAt=instant;
      adapter.scrollTo(measure.top+offset);positioned=true;message='已滚动至下一屏，继续前台浏览';save();return summary();
    }catch{attention('专题页面结构发生变化，请检查后继续');return summary();}
  }
  function dispose(){if(disposed)return;save();disposed=true;lastTick=null;pending=null;}
  return {start,resume:start,pause,stop,tick,snapshot:summary,visibilityChanged,dispose,resumeRequested};
}
function createTopicDomAdapter(page){
  const doc=page.document;
  const visible=element=>{if(!element||element.isConnected===false||!element.getClientRects().length)return false;const style=page.getComputedStyle(element);return style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse';};
  const scroller=()=>{const body=doc.getElementById('outerBody');return body===doc.body?body:null;};
  const sections=()=>{const root=doc.getElementById('cardview');return root?Array.from(root.querySelectorAll('div[id^="knowledge-"]')).filter(element=>element.tagName==='DIV'&&visible(element)&&visible(element.querySelector('.ans-cc'))):[];};
  const idFor=element=>element.id.slice('knowledge-'.length);
  function directory(){
    const seen=new Set(),result=[];
    for(const link of doc.querySelectorAll('a.wh.wh1')){
      if(!visible(link))continue;let url;try{url=new URL(link.getAttribute('href'),page.location.href);}catch{continue;}
      if(url.origin!==page.location.origin||!/^\/mooc-ans\/ztnodedetailcontroller\/visitnodedetail\/?$/.test(url.pathname))continue;
      const id=url.searchParams.get('knowledgeId'),title=String(link.innerText||'').replace(/\s+/g,' ').trim();
      if(!id||!/^\d+$/.test(id)||!title||seen.has(id))continue;seen.add(id);result.push({id,title:title.slice(0,120)});
    }
    return result;
  }
  function measure(id){
    const body=scroller(),section=sections().find(element=>idFor(element)===id),content=section?.querySelector('.ans-cc');
    if(!body||!content)return null;
    const bounds=content.getBoundingClientRect(),viewport=body.getBoundingClientRect(),height=body.clientHeight;
    if(bounds.height<=0||height<=0)return null;
    const imagesReady=Array.from(content.querySelectorAll('img')).filter(visible).filter(image=>{const r=image.getBoundingClientRect();return r.bottom>=viewport.top&&r.top<=viewport.top+height;}).every(image=>image.complete&&image.naturalWidth>0);
    return {top:body.scrollTop+bounds.top-viewport.top,bottom:body.scrollTop+bounds.bottom-viewport.top,scrollTop:body.scrollTop,height,maxScrollTop:Math.max(0,body.scrollHeight-height),imagesReady};
  }
  const button=()=>doc.getElementById('loadbutton');
  const text=()=>String(button()?.innerText||'').replace(/\s+/g,' ').trim();
  return {directory,measure,loadedIds:()=>sections().map(idFor),active:()=>({visible:doc.visibilityState==='visible',focused:doc.hasFocus()}),scrollTop:()=>scroller()?.scrollTop||0,viewportHeight:()=>scroller()?.clientHeight||0,
    scrollTo:top=>{const body=scroller();if(!body)throw new Error('Missing topic body');body.scrollTop=Math.max(0,Math.min(top,body.scrollHeight-body.clientHeight));},
    loading:()=>visible(button())&&/加载中|正在加载/.test(text()),
    loadMore:()=>{const element=button();if(!visible(element)||element.disabled||element.getAttribute('aria-disabled')==='true'||!/加载更多/.test(text()))return false;element.click();return true;},
    nativeEnd:()=>{const element=button();return Boolean(element)&&(!visible(element)||/没有更多|已全部加载|已加载全部|没有了/.test(text()));}};
}
function bootTopicReader(page){
  if(!/^\/mooc-ans\/zt\/portal\/[^/]+\/?$/.test(page.location.pathname))return false;
  page.__codexTopicReader?.dispose?.();
  const doc=page.document,adapter=createTopicDomAdapter(page),key='codexTopicReader:'+topicReaderHash(page.location.origin+page.location.pathname);
  const reader=createTopicReader({adapter,read:()=>{try{return JSON.parse(page.sessionStorage.getItem(key)||'null');}catch{return null;}},write:value=>page.sessionStorage.setItem(key,JSON.stringify(value))});
  const panel=doc.createElement('section');panel.id='codex-topic-reader';panel.style.cssText='position:fixed;right:16px;bottom:16px;width:310px;max-width:calc(100vw - 32px);padding:14px;background:white;border:1px solid #dce4ee;border-radius:14px;box-shadow:0 4px 20px #0002;z-index:2147483646;color:#24364d;font:14px/1.6 sans-serif';
  const title=doc.createElement('strong');title.textContent='专题阅读助手';
  const status=doc.createElement('div'),progress=doc.createElement('div'),hint=doc.createElement('small');hint.textContent='仅前台聚焦时逐屏停留；浏览不代表平台任务已完成。';
  const controls=doc.createElement('div'),start=doc.createElement('button'),pause=doc.createElement('button'),stop=doc.createElement('button');
  start.textContent='开始 / 继续';pause.textContent='暂停';stop.textContent='停止';
  for(const control of [start,pause,stop])control.style.cssText='margin:8px 7px 0 0;padding:5px 10px;border:1px solid #ccd9eb;border-radius:7px;background:#fff;cursor:pointer';
  controls.append(start,pause,stop);panel.append(title,status,progress,hint,controls);doc.body.append(panel);
  function render(){const state=reader.snapshot();status.textContent=state.message;progress.textContent=state.currentTitle+' · 已浏览 '+state.browsedSections+' / '+state.totalSections+' 节';start.disabled=state.enabled||state.phase==='complete';pause.disabled=!state.enabled;stop.disabled=!state.enabled&&state.phase==='stopped';panel.dataset.phase=state.phase;}
  start.onclick=()=>{reader.start();render();};pause.onclick=()=>{reader.pause();render();};stop.onclick=()=>{reader.stop();render();};
  const changed=()=>{reader.visibilityChanged();render();};
  doc.addEventListener('visibilitychange',changed);page.addEventListener('focus',changed);page.addEventListener('blur',changed);
  const timer=page.setInterval(()=>{reader.tick();render();},1000);
  let disposed=false;
  const api={start:()=>{const result=reader.start();render();return result;},resume:()=>{const result=reader.resume();render();return result;},pause:()=>{reader.pause();render();},stop:()=>{reader.stop();render();},snapshot:reader.snapshot,
    dispose:()=>{if(disposed)return;disposed=true;reader.dispose();page.clearInterval(timer);doc.removeEventListener('visibilitychange',changed);page.removeEventListener('focus',changed);page.removeEventListener('blur',changed);page.removeEventListener('pagehide',api.dispose);panel.remove();}};
  page.__codexTopicReader=api;page.addEventListener('pagehide',api.dispose,{once:true});
  if(reader.resumeRequested)reader.start();render();return true;
}

if(bootTopicReader(PAGE))return;

function createCourseQueue({read,write,now=()=>Date.now(),navigate,listUrl}){
  const duration=12*60*60*1000;
  const isKey=value=>typeof value==='string'&&value.trim().length>0;
  const clone=value=>JSON.parse(JSON.stringify(value));
  function load(){
    try{
      let state=read();
      if(state==null)return {ok:true,state:null};
      if(typeof state==='string')state=JSON.parse(state);
      if(!state||typeof state!=='object'||Array.isArray(state))return {ok:false,state:null};
      state=clone(state);
      state.completed=Array.isArray(state.completed)?[...new Set(state.completed.filter(isKey))]:[];
      state.attempted=Array.isArray(state.attempted)?[...new Set(state.attempted.filter(isKey))]:[];
      return {ok:true,state};
    }catch{return {ok:false,state:null};}
  }
  function save(state){try{return write(clone(state))!==false;}catch{return false;}}
  const paused=(state,reason)=>({...state,enabled:false,phase:'paused',reason});
  function live(){
    const result=load(),state=result.state;
    if(!result.ok||!state?.enabled)return null;
    if(!Number.isFinite(state.deadline)||Number(now())>=state.deadline){save(paused(state,'跨课程队列已达到12小时上限'));return null;}
    return state;
  }
  function pause(reason='已停止跨课程队列'){
    const result=load();
    return Boolean(result.ok&&result.state&&save(paused(result.state,reason)));
  }
  function go(state,url){
    if(typeof url!=='string'||!url.trim()||typeof navigate!=='function')return false;
    if(!save(state))return false;
    const latest=live();
    if(!latest||latest.id!==state.id||latest.phase!==state.phase||latest.current!==state.current||latest.expected!==state.expected)return false;
    try{if(navigate(url)===false)throw new Error('Navigation rejected');return true;}
    catch{pause('课程页面未能打开，请检查后继续');return false;}
  }
  function start(courseKey){
    if(!isKey(courseKey))return false;
    const result=load();
    if(!result.ok)return false;
    const previous=result.state,instant=Number(now());
    if(!Number.isFinite(instant))return false;
    if(previous?.enabled&&previous.phase==='playing'&&previous.current===courseKey&&previous.deadline>instant)return true;
    const continuing=previous&&previous.phase!=='complete'&&(previous.current===courseKey||previous.expected===courseKey);
    return save({enabled:true,phase:'playing',id:instant.toString(36)+'-'+Math.random().toString(36).slice(2),deadline:instant+duration,current:courseKey,expected:null,completed:continuing?previous.completed:[],attempted:continuing?previous.attempted:[]});
  }
  function startList(){
    const result=load(),instant=Number(now());
    if(!result.ok||!Number.isFinite(instant))return false;
    return save({enabled:true,phase:'selecting',id:instant.toString(36)+'-'+Math.random().toString(36).slice(2),deadline:instant+duration,current:null,expected:null,completed:[],attempted:[]});
  }
  function complete(courseKey){
    const state=live();
    if(!state||state.phase!=='playing'||state.current!==courseKey)return false;
    return go({...state,phase:'selecting',expected:null,completed:[...new Set([...state.completed,courseKey])]},listUrl);
  }
  function select(courses){
    const state=live();
    if(!state||state.phase!=='selecting'||!Array.isArray(courses))return false;
    const next=courses.find(course=>course&&isKey(course.key)&&typeof course.url==='string'&&course.url.trim()&&course.eligible===true&&course.completed!==true&&!state.completed.includes(course.key)&&!state.attempted.includes(course.key));
    if(!next)return save({...state,enabled:false,phase:'complete',expected:null,reason:'列表中已没有可继续的未完成课程'});
    return go({...state,phase:'opening',expected:next.key,attempted:[...new Set([...state.attempted,next.key])]},next.url);
  }
  function enter(courseKey){
    const state=live();
    if(!state||state.phase!=='opening'||state.expected!==courseKey)return false;
    return save({...state,phase:'playing',current:courseKey,expected:null});
  }
  function allow(courseKey){
    const state=live();
    return Boolean(state&&((state.phase==='playing'&&state.current===courseKey)||(state.phase==='opening'&&state.expected===courseKey)));
  }
  function snapshot(){
    const result=load();
    if(!result.ok)return null;
    const state=result.state;
    if(state?.enabled&&(!Number.isFinite(state.deadline)||Number(now())>=state.deadline)){
      const stopped=paused(state,'跨课程队列已达到12小时上限');save(stopped);return stopped;
    }
    return state;
  }
  return {start,startList,pause,complete,select,enter,allow,snapshot};
}

const COURSE_QUEUE_KEY='codexCourseQueue:v1';
const courseQueue=typeof GM_getValue==='function'&&typeof GM_setValue==='function'?createCourseQueue({
 read:()=>GM_getValue(COURSE_QUEUE_KEY,null),write:value=>GM_setValue(COURSE_QUEUE_KEY,value),now:()=>Date.now(),
 navigate:url=>PAGE.location.assign(url),listUrl:'https://mooc2-ans.chaoxing.com/visit/interaction'
}):null;
function courseKeyFromUrl(value=location.href){
 try{const params=Array.from(new URL(value,location.href).searchParams);const get=name=>params.find(([key])=>key.toLowerCase()===name)?.[1]||'';const course=get('courseid'),clazz=get('clazzid');return /^\d+$/.test(course)&&/^\d+$/.test(clazz)?course+':'+clazz:'';}catch{return '';}
}
function readNativeCourseCards(doc=document){
 return Array.from(doc.querySelectorAll('#stuNormalCourseListDiv .learnCourse')).flatMap(card=>{
  const link=card.querySelector('.course-info a[href*="/visit/stucoursemiddle"]');
  const key=link&&courseKeyFromUrl(link.href),progress=card.textContent.match(/任务点进度\s*[:：]\s*(\d+)\s*\/\s*(\d+)/);
  if(!key||!/(^|\.)chaoxing\.com$/.test(new URL(link.href).hostname))return [];
  const done=progress?Number(progress[1]):null,total=progress?Number(progress[2]):null;
  const hundred=/(^|[^\d.])100(?:\.0+)?\s*%/.test(card.textContent);
  return [{key,url:link.href,title:card.querySelector('.course-name')?.textContent.trim()||link.textContent.trim(),completed:hundred||total>0&&done>=total,eligible:!hundred&&total>0&&done<total}];
 });
}
function bootCourseQueuePage(){
 const path=location.pathname;
 const list=/\/(?:mooc2-ans\/)?visit\/interaction$/.test(path),home=/\/(?:mooc2-ans\/)?mycourse\/stu$/.test(path),chapters=/\/(?:mooc2-ans\/)?mycourse\/studentcourse$/.test(path);
 if(!list&&!home&&!chapters)return false;
 if(!courseQueue)return true;
 const box=document.createElement('aside');box.id='codex-course-queue';box.style.cssText='position:fixed;bottom:16px;left:16px;z-index:2147483646;background:white;color:#172b4d;border:1px solid #bcccdc;border-radius:10px;padding:12px 16px;max-width:410px;font:14px sans-serif';
 const text=document.createElement('div'),start=document.createElement('button'),stop=document.createElement('button');start.textContent='开始 / 继续';stop.textContent='停止助手';start.style.cssText=stop.style.cssText='margin-top:8px;margin-right:8px;padding:4px 12px';box.append(text,start,stop);document.getElementById(box.id)?.remove();document.body.append(box);
 let timer=null,navigated=false,startedAt=Date.now();
 const end=message=>{clearInterval(timer);timer=null;text.textContent='课程队列：'+message;start.disabled=false;stop.disabled=true;};
 stop.onclick=()=>{courseQueue.pause('已手动停止');end('已停止');};
 start.onclick=()=>{
  if(list){courseQueue.startList();}
  else{const key=courseKeyFromUrl();if(key)courseQueue.start(key);}
  startedAt=Date.now();navigated=false;if(!timer)timer=setInterval(tick,500);tick();
 };
 function navigateOnce(url){
  const parsed=new URL(url,location.href);
  if(!/^https?:$/.test(parsed.protocol)||!/(^|\.)chaoxing\.com$/.test(parsed.hostname))throw new Error('课程入口不属于学习通');
  if(navigated)return;navigated=true;clearInterval(timer);text.textContent='课程队列：正在进入课程章节';PAGE.location.assign(parsed.href);
 }
 function tick(){
  try{
   const state=courseQueue.snapshot();
   if(!state?.enabled){end(state?.reason||'等待点击开始');return;}
   if(Date.now()>=state.deadline){courseQueue.pause('本轮12小时已结束');end('本轮12小时已结束');return;}
   start.disabled=true;stop.disabled=false;
   if(list){
    if(state.phase!=='selecting'){end('课程正在其他页面运行');return;}
    text.textContent='课程队列：正在读取未完成课程';
    const cards=readNativeCourseCards();
    if(cards.length){courseQueue.select(cards);const next=courseQueue.snapshot();if(next?.phase==='complete')end('列表中可识别的任务点已全部完成');else if(!next?.enabled)end(next?.reason||'需要检查课程列表');return;}
   }else{
    const key=courseKeyFromUrl();
    if(!key||!courseQueue.allow(key)){end('当前课程不在本轮队列中');return;}
    if(home){const frame=document.getElementById('frame_content-zj');if(frame?.src&&new URL(frame.src).pathname.endsWith('/mycourse/studentcourse')){navigateOnce(frame.src);return;}}
    else{
     const first=document.querySelector('.chapter_item[onclick^="toOld("]');
     if(first){navigated=true;clearInterval(timer);text.textContent='课程队列：正在打开 '+(first.getAttribute('title')||'首个章节');first.click();return;}
    }
   }
   if(Date.now()-startedAt>45000){courseQueue.pause('课程入口未能加载，请检查登录或课程页面');end('课程入口未能加载，请检查登录或课程页面');}
  }catch(error){courseQueue.pause(error.message);end(error.message);}
 }
 PAGE.__codexCourseQueue={snapshot:()=>courseQueue.snapshot(),start:()=>start.onclick(),stop:()=>stop.onclick()};
 timer=setInterval(tick,500);tick();PAGE.addEventListener('pagehide',()=>clearInterval(timer),{once:true});return true;
}

if(bootCourseQueuePage())return;

const $ = (...args) => PAGE.jQuery(...args);
const APP_KEY = '__xuexitongCodexQuiz';
const BOOT_TIMER_KEY = '__xuexitongCodexQuizBootTimer';
if(PAGE.__xuexitongPlayerV3?.destroy) PAGE.__xuexitongPlayerV3.destroy();
const LOCAL_URL = 'http://127.0.0.1:__LOCAL_PORT__';
let userStopped=false;
function stoppedByUser(){return userStopped;}
const LOCAL_TOKEN = '__LOCAL_TOKEN__';
PAGE.__xuexitongMonitor?.dispose?.('正在更新脚本');
if (PAGE[APP_KEY]?.destroy) PAGE[APP_KEY].destroy();
if (PAGE[BOOT_TIMER_KEY]) clearInterval(PAGE[BOOT_TIMER_KEY]);
const panel = document.createElement('div');
panel.id = 'codex-quiz-panel';
document.getElementById(panel.id)?.remove();
panel.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:2147483646;background:#fff;color:#172b4d;padding:12px 16px;border:1px solid #bcccdc;border-radius:10px;box-shadow:0 3px 12px #0002;font:14px sans-serif;max-width:380px';
const statusText = document.createElement('div');
statusText.textContent = '学习助手：正在启动';
const stopButton = document.createElement('button');
stopButton.textContent = '停止助手';
stopButton.style.cssText = 'margin-top:8px;padding:4px 12px;cursor:pointer';
stopButton.onclick = () => stopIntegrated('已停止', true);
const monitorText=document.createElement('div');
monitorText.style.cssText='font-size:12px;color:#52677a;margin-top:6px';
const startButton=document.createElement('button');
startButton.textContent='开始 / 继续';startButton.style.cssText='margin-top:8px;margin-right:8px;padding:4px 12px;cursor:pointer';
startButton.onclick=restartIntegrated;
const codexText=document.createElement('div');
codexText.style.cssText='font-size:12px;color:#52677a;margin-top:6px';
panel.append(statusText,monitorText,codexText,startButton,stopButton);document.body.append(panel);
function setStatus(message) { lastMessage=message;statusText.textContent='学习助手：'+message;if(PAGE[APP_KEY])PAGE[APP_KEY].quizStatus=message; }
function bridgeRequest(path, payload, timeout = 190000) {
return new Promise((resolve, reject) => GM_xmlhttpRequest({
method: payload ? 'POST' : 'GET', url: LOCAL_URL + path,
headers: { 'Content-Type': 'application/json', 'X-Xuexitong-Token': LOCAL_TOKEN },
data: payload ? JSON.stringify(path==='/answer'?{...payload,session:{id:sessionState.id,deadline:sessionState.deadline}}:payload) : undefined, timeout,
onload(response) { let data; try { data=JSON.parse(response.responseText); } catch { return reject(new Error('本机服务响应不是 JSON')); }
if(response.status<200||response.status>=300) reject(Object.assign(new Error(data.error || '本机服务出错'),{code:data.code,retryAt:data.retryAt})); else resolve(data); },
onerror: () => reject(new Error('无法连接本机 Codex 服务，正在等待自动重连')),
ontimeout: () => reject(new Error('Codex 调用超时，本次未提交')),
}));
}
const SCRIPT_VERSION='4.5.1';
const courseContext=Array.from(new URL(location.href).searchParams).filter(([key])=>['courseid','clazzid'].includes(key.toLowerCase())).map(([key,value])=>key.toLowerCase()+'='+value).sort().join('&');
const monitorStorageKey='codexIntegratedMonitor:'+courseContext;
let sessionState;
try{sessionState=JSON.parse(sessionStorage.getItem(monitorStorageKey)||'null');}catch{}
function freshSession(){return {id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),startedAt:Date.now(),deadline:Date.now()+12*60*60*1000,stopped:false,recoveries:0,videoRecoveries:{},lastRecovery:0};}
if(!sessionState||sessionState.deadline<Date.now())sessionState=freshSession();
if(!sessionState.id)sessionState.id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
let monitorTimer=null,engineType='',lastMessage='',lastIdentity='',lastTime=null,lastProgress=Date.now(),lastRecord=0,lastResume=0,wakeLock=null,wakePending=false,wakeMessage='等待开始',checks=0,monitorMode='starting',monitorStopped=false;
const monitorRecords=[];
let wakeGeneration=0,monitorPending=null,monitorGeneration=0;
let endedTransition=null;
function checkEndedTransition(snapshot,now=Date.now()){
  if(!snapshot.ended||snapshot.busy||snapshot.reachedDirectoryEnd){endedTransition=null;return '';}
  const key=snapshot.chapter+'|'+snapshot.title;
  if(!endedTransition||endedTransition.key!==key){endedTransition={key,since:now,attempted:false};return '';}
  if(!endedTransition.attempted&&now-endedTransition.since>=6000){endedTransition.attempted=true;endedTransition.since=now;return 'advance';}
  if(endedTransition.attempted&&now-endedTransition.since>=45000)return 'failed';
  return '';
}
let videoQuestions=null,videoQuestionTimer=null;
let chapterLineRecovery=null;
function saveSession(){try{sessionStorage.setItem(monitorStorageKey,JSON.stringify(sessionState));}catch{}}
function remainingTasks(){return Array.from(document.querySelectorAll('#coursetree .posCatalog_select:not(.firstLayer) .orangeNew')).reduce((sum,e)=>sum+Number(e.textContent.trim()||0),0);}
function trackPlaybackProgress(identity,time){
  if(identity!==lastIdentity){lastIdentity=identity;lastTime=time;lastProgress=Date.now();return;}
  if(!Number.isFinite(time))return;
  if(lastTime===null||time>lastTime+0.05){lastTime=time;lastProgress=Date.now();return;}
  // Rebase after a native reload/seek, but require forward movement to reset the stall timer.
  if(time<lastTime-0.05)lastTime=time;
}
function notifyUser(message,complete=false){
  try{if(typeof GM_notification==='function')GM_notification({title:complete?'课程播放已完成':'课程播放需要处理',text:message,tag:'codex-study-'+courseContext,timeout:15000,silent:false,onclick:()=>PAGE.focus()});}catch{}
}
function monitorPlaybackSpeed(){
  try{const video=engineType==='continuous'?PAGE.__codexCoursePlayback?.getVideo?.():PAGE[APP_KEY]?._getVideoEl?.();return playbackSpeed.snapshot(video?.ownerDocument);}catch{return null;}
}
function renderMonitor(){
  const modeText={starting:'启动中',running:'监测中',recovering:'正在恢复',complete:'已完成',needs_attention:'需要处理',stopped:'已停止'}[monitorMode]||monitorMode;
  monitorText.textContent=modeText+' · 已检查 '+checks+' 次 · 自动恢复 '+sessionState.recoveries+' 次 · 保持唤醒：'+wakeMessage;
  if(document.getElementById('coursetree'))monitorText.textContent+=' · 剩余任务：'+remainingTasks();
  const speed=monitorPlaybackSpeed();
  if(speed)monitorText.textContent+=' · 倍速：'+speed.actualRate+'x / 目标'+speed.targetRate+'x'+(speed.status==='restricted'?'（页面限制）':'');
  panel.dataset.mode=monitorMode;
  startButton.disabled=!monitorStopped&&monitorMode!=='starting';
  stopButton.disabled=monitorStopped;
}
async function acquireWakeLock(){
  if(monitorStopped||wakeLock||wakePending)return;
  if(!PAGE.navigator.wakeLock?.request){wakeMessage='浏览器不支持';renderMonitor();return;}
  if(document.visibilityState!=='visible'){wakeMessage='返回课程页后恢复';renderMonitor();return;}
  wakePending=true;
  const generation=wakeGeneration;
  try{
    const sentinel=await PAGE.navigator.wakeLock.request('screen');
    if(monitorStopped||generation!==wakeGeneration){await sentinel.release();return;}
    wakeLock=sentinel;wakeMessage='已启用';
    sentinel.addEventListener('release',()=>{if(wakeLock!==sentinel)return;wakeLock=null;wakeMessage=document.visibilityState==='visible'?'等待恢复':'返回课程页后恢复';renderMonitor();});
  }catch{if(generation===wakeGeneration)wakeMessage='未取得，请保持页面可见';}
  finally{if(generation===wakeGeneration){wakePending=false;renderMonitor();}}
}
function releaseWakeLock(){wakeGeneration++;wakePending=false;const lock=wakeLock;wakeLock=null;wakeMessage='已释放';if(lock&&!lock.released)Promise.resolve(lock.release()).catch(()=>{});}
function nativeVideoCompleted(video){
  try{return Boolean(video?.ownerDocument?.defaultView?.frameElement?.closest('.ans-attach-ct')?.classList.contains('ans-job-finished'));}catch{return false;}
}
function engineSnapshot(){
  if(engineType==='continuous')return PAGE.__codexCoursePlayback?.snapshot()||null;
  const app=PAGE[APP_KEY];if(!app)return null;
  let video=null;try{video=app._getVideoEl();}catch{}
  const reading=app.chapterFlow?.readingSnapshot()||null;
  const videoQuestion=Boolean(videoQuestions?.isBlocking());
  return {running:!userStopped&&!app.reachedDirectoryEnd,reachedDirectoryEnd:Boolean(app.reachedDirectoryEnd),catalogSize:document.querySelectorAll('#coursetree .posCatalog_select:not(.firstLayer)').length,reading,videoQuestion,title:app.cellData?.currentVideoTitle||'',chapter:document.querySelector('#coursetree .posCatalog_active .posCatalog_name')?.textContent.trim()||'',time:video?.currentTime??null,duration:Number.isFinite(video?.duration)?video.duration:null,paused:video?.paused??null,playbackRate:video?.playbackRate??null,ended:video?.ended??false,ready:video?.readyState??null,mediaError:video?.error?.code??null,message:lastMessage,remainingTasks:remainingTasks(),busy:Boolean(!app.reachedDirectoryEnd&&(videoQuestion||reading||app._nextUnitPending||app._isChapterTest?.())),quizFailure:app.quizFailure||null,lastQuizResult:app.lastQuizResult||null};
}
function disposeIntegrated(reason='页面正在切换'){
  endedTransition=null;
  monitorGeneration++;monitorPending=null;
  monitorStopped=true;
  clearInterval(monitorTimer);monitorTimer=null;
  clearInterval(videoQuestionTimer);videoQuestionTimer=null;videoQuestions?.dispose();videoQuestions=null;
  chapterLineRecovery?.dispose();chapterLineRecovery=null;
  stopCodexConnection();
  if(PAGE[BOOT_TIMER_KEY])clearInterval(PAGE[BOOT_TIMER_KEY]);
  PAGE[BOOT_TIMER_KEY]=null;
  try{PAGE[APP_KEY]?.destroy?.();}catch{}
  if(engineType==='continuous')PAGE.__codexCoursePlayback?.stop(reason);
  releaseWakeLock();
}
function stopIntegrated(message='已停止',manual=true){
  if(manual){courseQueue?.pause(message);sessionState.stopped=true;saveSession();}
  disposeIntegrated(message);monitorMode='stopped';setStatus(message);renderMonitor();
}
function finishIntegrated(message,mode){
  disposeIntegrated(message);monitorMode=mode;setStatus(message);renderMonitor();
  notifyUser(message,mode==='complete');
  if(mode==='complete'&&courseQueue?.allow(courseKeyFromUrl())){
    setStatus('本课程已完成，正在返回列表继续下一门课程');
    courseQueue.complete(courseKeyFromUrl());
  }else if(mode==='needs_attention'&&courseQueue?.allow(courseKeyFromUrl()))courseQueue.pause(message);
}
function recoverIntegrated(reason,snapshot){
  if(Date.now()-sessionState.lastRecovery<120000){setStatus('等待播放器恢复：'+reason);return;}
  const identity=snapshot.chapter+'|'+snapshot.title;
  const count=sessionState.videoRecoveries[identity]||0;
  if(count>=2||sessionState.recoveries>=6){finishIntegrated('自动恢复达到上限，请检查课程页面：'+reason,'needs_attention');return;}
  sessionState.videoRecoveries[identity]=count+1;sessionState.recoveries++;sessionState.lastRecovery=Date.now();saveSession();
  monitorMode='recovering';setStatus('正在恢复播放：'+reason);renderMonitor();
  disposeIntegrated('正在重新加载播放器');
  PAGE.location.reload();
}
function chapterNetworkState(snapshot){
  let video,frame;
  try{
    video=PAGE[APP_KEY]?._getVideoEl?.();frame=video?.ownerDocument?.defaultView?.frameElement;
    if(!frame||frame.contentDocument!==video.ownerDocument||!/\/ananas\/modules\/video\//.test(frame.getAttribute('src')||frame.src||''))return '';
  }catch{return '';}
  if(!chapterLineRecovery)chapterLineRecovery=createPlaybackLineRecovery({storageKey:identity=>'codexChapterVideoLines:'+courseContext+':'+sessionState.id+':'+identity,setStatus});
  if(chapterLineRecovery.isPending(frame))return 'pending';
  if(chapterLineRecovery.hasFailed(frame))return 'failed';
  let data={};try{data=JSON.parse(frame.getAttribute('data')||'{}');}catch{}
  const attachment=String(data.objectid||data.objectId||data._jobid||data.jobid||'');
  const index=Array.from(frame.ownerDocument.querySelectorAll('iframe')).filter(item=>/\/ananas\/modules\/video\//.test(item.getAttribute('src')||item.src||'')).indexOf(frame);
  if(!attachment&&index<0)return '';
  // Native attachment identity survives CDN changes and signed media URLs.
  const identity=snapshot.chapter+'|'+snapshot.title+'|'+(attachment?'attachment:'+attachment:'attachment-index:'+index);
  return snapshot.mediaError===2&&chapterLineRecovery.tryRecover(frame,identity)?'pending':'';
}
function monitorTick(){
  if(monitorPending)return monitorPending;
  const generation=monitorGeneration;
  const pending=monitorTickOnce(generation).catch(error=>{if(generation===monitorGeneration)throw error;}).finally(()=>{if(monitorPending===pending)monitorPending=null;});
  monitorPending=pending;return pending;
}
async function monitorTickOnce(generation){
  if(monitorStopped)return;
  if(courseQueue&&!courseQueue.allow(courseKeyFromUrl())){stopIntegrated('跨课程队列已停止，点击开始继续',false);return;}
  videoQuestions?.tick();
  checks++;
  if(Date.now()>sessionState.deadline){finishIntegrated('本次12小时播放监测已结束','needs_attention');return;}
  if(!document.getElementById('coursetree'))return;
  if(engineType==='continuous'&&hasChapterQuizLayout()){
    PAGE[APP_KEY]?.destroy?.();userStopped=false;engineType='chapter';lastIdentity='';lastProgress=Date.now();
    if(!PAGE.jQuery){finishIntegrated('课程播放器尚未就绪，请稍后点击开始','needs_attention');return;}
    initializePlayer();return;
  }
  if(engineType==='chapter'){
    try{playbackSpeed.apply(PAGE[APP_KEY]?._getVideoEl()?.ownerDocument);}catch{}
  }
  const snapshot=engineSnapshot();if(!snapshot)return;
  if(snapshot.quizFailure){finishIntegrated(snapshot.quizFailure,'needs_attention');return;}
  if(engineType==='chapter'){
    const nativeComplete=nativeVideoCompleted(PAGE[APP_KEY]?._getVideoEl?.());
    if(nativeComplete&&!snapshot.busy)try{PAGE[APP_KEY]?._getVideoEl?.()?.pause();}catch{}
    const endedAction=checkEndedTransition(nativeComplete?{...snapshot,ended:true}:snapshot);
    if(endedAction==='advance'){setStatus('视频已结束，正在恢复下一学习步骤');PAGE[APP_KEY]?.nextUnit?.();return;}
    if(endedAction==='failed'){recoverIntegrated('视频已结束，下一学习步骤加载超时',snapshot);return;}
  }
  if(engineType==='chapter'&&snapshot.reachedDirectoryEnd&&snapshot.catalogSize>0&&!snapshot.busy&&!snapshot.mediaError&&snapshot.remainingTasks===0){finishIntegrated('本课程目录中的任务点已全部完成','complete');return;}
  const identity=snapshot.chapter+'|'+snapshot.title;
  trackPlaybackProgress(identity,snapshot.time);
  if(Date.now()-lastRecord>=15000){
    lastRecord=Date.now();monitorRecords.push({at:Date.now(),title:snapshot.title,time:snapshot.time,duration:snapshot.duration,paused:snapshot.paused,playbackRate:snapshot.playbackRate,remainingTasks:snapshot.remainingTasks});
    if(monitorRecords.length>60)monitorRecords.shift();
  }
  if(engineType==='continuous'&&!snapshot.running){
    if(snapshot.reachedDirectoryEnd&&snapshot.catalogSize>0&&!snapshot.busy&&!snapshot.mediaError&&snapshot.remainingTasks===0){finishIntegrated('本课程目录中的任务点已全部完成','complete');return;}
    if(snapshot.remainingTasks===0){finishIntegrated(snapshot.message||'课程完成状态尚未确认，请检查页面','needs_attention');return;}
    if(/加载失败|播放进度超过|播放器未能继续|页面发生变化/.test(snapshot.message)){recoverIntegrated(snapshot.message,snapshot);return;}
    finishIntegrated(snapshot.message,'needs_attention');return;
  }
  if(snapshot.busy){chapterLineRecovery?.dispose();chapterLineRecovery=null;lastProgress=Date.now();renderMonitor();await acquireWakeLock();return;}
  if(engineType==='chapter'){
    const network=chapterNetworkState(snapshot);
    if(network==='pending'){lastProgress=Date.now();setStatus('正在等待备用线路恢复实际播放');renderMonitor();await acquireWakeLock();return;}
    if(network==='failed'){recoverIntegrated('备用线路35秒内未恢复实际播放',snapshot);return;}
  }
  if(snapshot.mediaError){
    if(snapshot.mediaError===2&&engineType==='continuous'&&PAGE.__codexCoursePlayback?.recoverLine?.()){lastProgress=Date.now();renderMonitor();await acquireWakeLock();return;}
    recoverIntegrated('播放器报告媒体加载错误',snapshot);return;
  }
  if(!snapshot.ended&&snapshot.paused&&Date.now()-lastProgress>15000&&Date.now()-lastResume>10000){
    lastResume=Date.now();
    try{if(engineType==='continuous')await PAGE.__codexCoursePlayback.resume();else await PAGE[APP_KEY]?._getVideoEl()?.play();}catch{}
  }
  if(!snapshot.ended&&snapshot.time!==null&&Date.now()-lastProgress>75000){recoverIntegrated('实际播放时间超过75秒未推进',snapshot);return;}
  if(engineType==='chapter'&&snapshot.time!==null)setStatus((snapshot.title||'课程视频')+' · '+Math.floor(snapshot.time)+' / '+Math.floor(snapshot.duration||0)+' 秒');
  if(generation!==monitorGeneration||monitorStopped)return;
  monitorMode='running';renderMonitor();await acquireWakeLock();
}
function hasChapterQuizLayout(){
  return Array.from(document.querySelectorAll('.prev_white')).some(e=>/视频|章节测验/.test(e.textContent||''))||/章节测验/.test(document.querySelector('.prev_title')?.textContent||'');
}
function startIntegratedEngine(){
  if(userStopped||sessionState.stopped)return;
  if(!prepareCourseQueue()){monitorStopped=true;monitorMode='stopped';setStatus('课程队列已停止或正在其他课程运行，点击开始继续');renderMonitor();return;}
  monitorStopped=false;monitorMode='running';lastIdentity='';lastTime=null;lastProgress=Date.now();stopButton.disabled=false;
  startCodexConnection();
  videoQuestions=createVideoPopupQuestions({getVideo:()=>engineType==='continuous'?PAGE.__codexCoursePlayback?.getVideo?.():PAGE[APP_KEY]?._getVideoEl?.(),requestAnswers:requestVideoAnswers,setStatus,onError:message=>{setStatus(message);notifyUser(message);},storageKey:'codexVideoPopup:'+courseContext});
  videoQuestionTimer=setInterval(()=>{try{videoQuestions?.tick();}catch(error){finishIntegrated('视频弹题检查失败：'+error.message,'needs_attention');}},1000);
  if(hasChapterQuizLayout()){
    if(!PAGE.jQuery){finishIntegrated('课程播放器尚未就绪，请稍后点击开始','needs_attention');return;}
    engineType='chapter';initializePlayer();
  }else{
    engineType='continuous';
    const core=createContinuousPlayer();
    PAGE[APP_KEY]={destroy:()=>core.stop('已停止'),run:restartIntegrated,cellData:{get currentVideoTitle(){return core.state.title;}}};
    PAGE.app=PAGE[APP_KEY];
  }
  monitorTimer=setInterval(()=>{monitorTick().catch(error=>finishIntegrated('监测遇到异常：'+error.message,'needs_attention'));},3000);
  monitorTick().catch(error=>finishIntegrated('监测遇到异常：'+error.message,'needs_attention'));
}
function waitForCoursePage(){
  let attempts=0;
  setStatus('正在等待课程页面');
  PAGE[BOOT_TIMER_KEY]=setInterval(()=>{
    if(document.getElementById('coursetree')&&document.querySelectorAll('#coursetree .posCatalog_select:not(.firstLayer)').length){clearInterval(PAGE[BOOT_TIMER_KEY]);PAGE[BOOT_TIMER_KEY]=null;startIntegratedEngine();return;}
    if(++attempts>=60){clearInterval(PAGE[BOOT_TIMER_KEY]);PAGE[BOOT_TIMER_KEY]=null;finishIntegrated('未找到课程目录，请在课程学习页启动','needs_attention');}
  },1000);
}
function restartIntegrated(){
  disposeIntegrated('正在重新启动');courseQueue?.start(courseKeyFromUrl());userStopped=false;sessionState=freshSession();saveSession();monitorStopped=false;checks=0;waitForCoursePage();
}
function prepareCourseQueue(){
  if(!courseQueue)return true;
  const key=courseKeyFromUrl();if(!key)return false;
  let state=courseQueue.snapshot();
  if(!state){if(!courseQueue.start(key))return false;state=courseQueue.snapshot();}
  if(!courseQueue.allow(key))return false;
  if(state.phase==='opening'){
    const first=document.querySelector('#coursetree .posCatalog_select:not(.firstLayer)');
    const number=first?.querySelector('.posCatalog_sbar')?.textContent.trim();
    const course=key.split(':')[0];
    if(!number)return false;
    sessionStorage.setItem('codexCourseOrder:'+course,JSON.stringify({mode:'forward',start:number,cursor:number}));
    sessionStorage.removeItem('codexDocumentResume:'+course);
    if(!courseQueue.enter(key))return false;
    sessionState.stopped=false;
  }
  sessionState.deadline=Math.min(sessionState.deadline,courseQueue.snapshot().deadline);saveSession();return true;
}
PAGE.__codexCourseQueue=courseQueue?{snapshot:()=>courseQueue.snapshot(),stop:()=>stopIntegrated('已停止',true),start:restartIntegrated}:null;
PAGE.__xuexitongMonitor={version:SCRIPT_VERSION,start:restartIntegrated,stop:()=>stopIntegrated('已停止',true),dispose:disposeIntegrated,snapshot:()=>({version:SCRIPT_VERSION,engine:engineType,mode:monitorMode,running:!monitorStopped,checks,recoveries:sessionState.recoveries,deadline:sessionState.deadline,wakeLockHeld:Boolean(wakeLock&&!wakeLock.released),wakeMessage,speed:monitorPlaybackSpeed(),codex:{...codexState},playback:engineSnapshot(),records:monitorRecords.slice()})};
panel.dataset.version=SCRIPT_VERSION;
document.addEventListener('visibilitychange',()=>{if(!monitorStopped&&document.visibilityState==='visible')acquireWakeLock();});
PAGE.addEventListener('pagehide',()=>disposeIntegrated('页面正在切换'),{once:true});

let codexTimer=null,codexPending=null,codexGeneration=0,codexWaitUntil=0;
const codexState={connected:false,message:'等待启动',lastCheckedAt:null,busy:false,calls:0};
function renderCodexConnection(){codexText.textContent='Codex：'+codexState.message;}
async function checkCodexConnection(){
  if(codexPending)return codexPending;
  const generation=codexGeneration;
  const request=(async()=>{
    try{
      const health=await bridgeRequest('/health',null,5000);
      if(!health.ok||health.engine!=='codex-cli'||!health.sessions)throw new Error('本机答题服务需更新');
      if(generation!==codexGeneration)return false;
      const waiting=health.retryAt>Date.now()?health.retryAt:codexWaitUntil;
      const message=waiting>Date.now()?'额度或服务暂不可用 · '+new Date(waiting).toLocaleTimeString()+' 自动重试':health.busy?'已连接 · 正在答题':'已连接 · 遇到章节测验自动答题';
      Object.assign(codexState,{connected:true,message,lastCheckedAt:Date.now(),busy:Boolean(health.busy),calls:health.calls||0});
      return true;
    }catch(error){
      if(generation!==codexGeneration)return false;
      Object.assign(codexState,{connected:false,message:'未连接 · 正在自动重连',lastCheckedAt:Date.now(),busy:false});
      return false;
    }finally{if(generation===codexGeneration)renderCodexConnection();}
  })();
  codexPending=request;
  try{return await request;}finally{if(codexPending===request)codexPending=null;}
}
function startCodexConnection(){
  clearTimeout(codexTimer);const generation=++codexGeneration;
  codexState.message='正在自动连接';renderCodexConnection();
  const poll=async()=>{
    try{await checkCodexConnection();}finally{
      if(generation===codexGeneration)codexTimer=setTimeout(poll,codexState.connected?30000:5000);
    }
  };
  poll();
}
function stopCodexConnection(){
  clearTimeout(codexTimer);codexTimer=null;codexGeneration++;codexPending=null;codexWaitUntil=0;
  codexState.connected=false;codexState.message='已停止';renderCodexConnection();
}
async function ensureCodexReady(isCurrent=()=>true){
  for(let attempt=0;attempt<12;attempt++){
    if(stoppedByUser()||monitorStopped||!isCurrent())throw new Error('脚本已停止或当前弹题已转为人工处理');
    const connected=await checkCodexConnection();
    if(!isCurrent())throw new Error('当前弹题已变化或转为人工处理');
    if(connected)return;
    if(attempt<11){setStatus('正在等待本机服务自动恢复连接');await new Promise(resolve=>setTimeout(resolve,5000));}
  }
  throw new Error('Codex 本机服务未连接，请检查自动接入服务后点击开始继续');
}
renderCodexConnection();

async function requestBridgeAnswers(payload,isCurrent){
  const generation=codexGeneration,sessionId=sessionState.id;
  let temporaryRetries=0,quotaRetries=0;
  const assertCurrent=()=>{
    if(monitorStopped||stoppedByUser()||generation!==codexGeneration||sessionId!==sessionState.id||!isCurrent())throw new Error('等待恢复期间脚本已停止或题目已变化，本次未提交');
    if(Date.now()>=sessionState.deadline)throw new Error('本次12小时答题会话已结束');
  };
  while(true){
    assertCurrent();
    try{return await bridgeRequest('/answer',payload);}
    catch(error){
      assertCurrent();
      const quota=error.code==='usage_limit';
      const temporary=['temporary_connection','rate_limit'].includes(error.code)||/无法连接本机 Codex 服务/.test(error.message||'');
      if(quota){if(++quotaRetries>3)throw new Error('额度恢复检查已达三次，仍暂不可用，请查看 Codex 用量页面');}
      else if(temporary){if(++temporaryRetries>3)throw error;}
      else throw error;
      const fallback=quota?15*60000:[10000,30000,60000][temporaryRetries-1];
      const requested=Number.isFinite(error.retryAt)?error.retryAt:Date.now()+fallback;
      const until=Math.max(Date.now()+1000,requested);
      codexWaitUntil=until;
      try{
        while(Date.now()<until){
          assertCurrent();
          const label=quota?'Codex 额度暂不可用':'答题服务暂时不可用';
          setStatus(label+'，将在 '+new Date(until).toLocaleTimeString()+' 自动重试');
          await new Promise(resolve=>setTimeout(resolve,Math.min(1000,until-Date.now())));
        }
        assertCurrent();setStatus('正在重新连接答题服务');
      }finally{if(generation===codexGeneration&&codexWaitUntil===until)codexWaitUntil=0;}
    }
  }
}

function createDocumentImageRangeRecovery(){
  const segmentBytes=256*1024,maxBytes=16*1024*1024;
  let generation=0,active=null;
  const retainedURLs=new Map();
  function cancel(){
    generation++;
    active?.abort();active=null;
    for(const revoke of retainedURLs.values())revoke();
    retainedURLs.clear();
  }
  async function recover(image,viewer){
    active?.abort();
    const realm=viewer?.defaultView||globalThis;
    const URLImpl=realm.URL||URL,BlobImpl=realm.Blob||Blob,ImageImpl=realm.Image||Image,AbortImpl=realm.AbortController||AbortController;
    const request=typeof realm.fetch==='function'?realm.fetch.bind(realm):fetch;
    const attempt=++generation,controller=new AbortImpl();
    active=controller;
    const source=()=>String(image?.src||image?.currentSrc||'');
    const original=source();
    const alive=()=>generation===attempt&&!controller.signal.aborted&&source()===original;
    let temporaryURL=null;
    const timeout=setTimeout(()=>controller.abort(),30000);
    try{
      if(!original)return false;
      const url=new URLImpl(original,viewer?.location?.href||globalThis.location?.href);
      if(!/^https?:$/.test(url.protocol))return false;
      const options={signal:controller.signal,credentials:'omit',cache:'no-store'};
      const head=await request(url.href,{...options,method:'HEAD'});
      const rawLength=head.headers.get('Content-Length');
      const length=Number(rawLength);
      if(!head.ok||!rawLength||!Number.isInteger(length)||length<=0||length>maxBytes||!alive())return false;
      const chunks=new Array(Math.ceil(length/segmentBytes));
      let cursor=0;
      async function worker(){
        while(cursor<chunks.length){
          if(!alive())throw new Error('Image recovery cancelled');
          const index=cursor++,start=index*segmentBytes,end=Math.min(length,start+segmentBytes)-1;
          const response=await request(url.href,{...options,headers:{Range:'bytes='+start+'-'+end}});
          if(response.status!==206)throw new Error('Image range request was not partial');
          const range=response.headers.get('Content-Range');
          if(range){
            const match=/^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(range.trim());
            if(!match||Number(match[1])!==start||Number(match[2])!==end||Number(match[3])!==length)throw new Error('Image range did not match request');
          }
          const bytes=new Uint8Array(await response.arrayBuffer());
          if(bytes.byteLength!==end-start+1||!alive())throw new Error('Image range was incomplete');
          chunks[index]=bytes;
        }
      }
      await Promise.all(Array.from({length:Math.min(3,chunks.length)},()=>worker()));
      if(!alive())return false;
      const signature=[137,80,78,71,13,10,26,10];
      if(chunks[0].byteLength<signature.length||!signature.every((byte,index)=>chunks[0][index]===byte))return false;
      temporaryURL=URLImpl.createObjectURL(new BlobImpl(chunks,{type:'image/png'}));
      await new Promise((resolve,reject)=>{
        const probe=new ImageImpl();
        const cleanup=()=>{probe.onload=null;probe.onerror=null;controller.signal.removeEventListener('abort',aborted);};
        const failed=()=>{cleanup();reject(new Error('Recovered image could not be decoded'));};
        const aborted=()=>{cleanup();probe.src='';reject(new Error('Image recovery cancelled'));};
        probe.onload=()=>{const valid=probe.naturalWidth>0&&probe.naturalHeight>0;cleanup();valid?resolve():reject(new Error('Recovered image was empty'));};
        probe.onerror=failed;
        controller.signal.addEventListener('abort',aborted,{once:true});
        if(controller.signal.aborted){aborted();return;}
        probe.src=temporaryURL;
      });
      if(!alive())return false;
      image.loading='eager';image.src=temporaryURL;
      const retainedURL=temporaryURL;
      retainedURLs.set(retainedURL,()=>URLImpl.revokeObjectURL(retainedURL));temporaryURL=null;
      return true;
    }catch{return false;}
    finally{
      clearTimeout(timeout);
      controller.abort();
      if(active===controller)active=null;
      if(temporaryURL)URLImpl.revokeObjectURL(temporaryURL);
    }
  }
  return {recover,cancel};
}

function createDocumentReader({courseId,chapterName,setStatus}){
  let current=null;
  const rangeRecovery=createDocumentImageRangeRecovery();
  const storageKey=item=>'codexReadDocument:'+courseId+':'+chapterName()+':'+item.title;
  const recordFor=item=>{try{return JSON.parse(sessionStorage.getItem(storageKey(item))||'null');}catch{return null;}};
  const browsed=item=>Boolean(recordFor(item)?.browsedAt);
  function snapshot(){return current?{title:current.title,page:Math.min(current.index+1,current.total||current.index+1),totalPages:current.total,phase:current.phase,startedAt:current.startedAt,imageRetries:current.imageRetries}:null;}
  function tick(item){
    if(browsed(item))return {done:true};
    const now=Date.now();
    if(!current||current.frame!==item.frame){
      const saved=recordFor(item);
      rangeRecovery.cancel();
      current={frame:item.frame,title:item.title,index:Number.isInteger(saved?.nextPage)&&saved.nextPage>0?saved.nextPage-1:0,savedTotal:saved?.totalPages,total:0,startedAt:now,viewerWaitSince:now,pageSince:now,loadSince:now,loadedSince:null,lastScroll:0,imageRetries:0,lastImageRetry:0,rangeTried:false,rangePending:false,rangeFailed:false,phase:'loading',pageShown:false};
      item.frame.scrollIntoView({block:'center'});
    }
    if(document.visibilityState!=='visible'){setStatus('返回课程页后继续浏览 '+item.title);current.pageSince=now;current.loadSince=now;current.viewerWaitSince=now;if(current.loadedSince!==null)current.loadedSince=now;return {done:false};}
    let viewer,pages;
    try{
      const moduleDoc=item.frame.contentDocument;
      viewer=moduleDoc?.getElementById('panView')?.contentDocument;
      pages=Array.from(viewer?.querySelectorAll('.fileBox li[id^="anchor"]')||[]);
    }catch{}
    if(!viewer||!pages.length){
      setStatus('正在加载文档 / PPT：'+item.title);
      return now-current.viewerWaitSince>45000?{error:'文档 / PPT 阅读器未能加载，请检查页面'}:{done:false};
    }
    if(current.total===0&&(current.savedTotal&&current.savedTotal!==pages.length||current.index>=pages.length))current.index=0;
    current.total=pages.length;
    const page=pages[current.index],image=page.querySelector('img');
    const scroller=viewer.scrollingElement||viewer.documentElement;
    const height=viewer.defaultView.innerHeight||scroller.clientHeight;
    const maxScroll=Math.max(0,scroller.scrollHeight-height);
    if(!current.pageShown){
      const top=Math.min(maxScroll,Math.max(0,page.getBoundingClientRect().top+scroller.scrollTop));
      viewer.defaultView.scrollTo({top,behavior:'smooth'});
      current.pageShown=true;current.pageSince=now;current.loadSince=now;current.lastScroll=now;
    }
    if(image&&(!image.complete||image.naturalWidth===0)){
      current.phase='loading';current.loadedSince=null;
      if(current.rangeFailed)return {error:'文档页面加载失败，请检查网络'};
      if(current.rangePending){setStatus('正在恢复文档第 '+(current.index+1)+' 页的完整图片');return {done:false};}
      if(current.imageRetries>=2&&!current.rangeTried&&now-current.lastImageRetry>=3000){
        const target=current;target.rangeTried=true;target.rangePending=true;
        Promise.resolve().then(()=>rangeRecovery.recover(image,viewer)).then(success=>{if(current===target){target.rangePending=false;target.rangeFailed=!success;target.loadSince=Date.now();}},()=>{if(current===target){target.rangePending=false;target.rangeFailed=true;}});
        setStatus('正在恢复文档第 '+(current.index+1)+' 页的完整图片');return {done:false};
      }
      const mayRetry=image.complete||now-current.loadSince>=10000;
      if(mayRetry&&current.imageRetries<2&&(current.imageRetries===0||now-current.lastImageRetry>=10000)){
        const url=new URL(image.currentSrc||image.src,viewer.location?.href||location.href);
        current.imageRetries++;current.lastImageRetry=now;url.searchParams.set('_codex_retry',now+'-'+current.imageRetries);
        image.loading='eager';image.src=url.href;
      }
      setStatus('正在加载文档第 '+(current.index+1)+' / '+pages.length+' 页'+(current.imageRetries?' · 单页重载 '+current.imageRetries+' / 2 次':''));
      return now-current.loadSince>45000?{error:'文档页面加载失败，请检查网络'}:{done:false};
    }
    if(current.loadedSince===null){current.loadedSince=now;current.pageSince=now;}
    current.phase='reading';
    setStatus('浏览文档 / PPT：'+item.title+' · 第 '+(current.index+1)+' / '+pages.length+' 页');
    const bottomVisible=page.getBoundingClientRect().bottom<=height+2;
    if(!bottomVisible){
      if(now-current.lastScroll>=3000){viewer.defaultView.scrollTo({top:Math.min(maxScroll,scroller.scrollTop+Math.max(100,Math.floor(height*.75))),behavior:'smooth'});current.lastScroll=now;}
      return now-current.pageSince>120000?{error:'文档页面无法继续滚动，请检查阅读器'}:{done:false};
    }
    if(now-current.loadedSince<8000)return {done:false};
    if(current.index<pages.length-1){
      sessionStorage.setItem(storageKey(item),JSON.stringify({nextPage:current.index+2,totalPages:pages.length,title:item.title,updatedAt:now}));
      current.index++;current.pageShown=false;current.pageSince=now;current.loadSince=now;current.loadedSince=null;current.imageRetries=0;current.lastImageRetry=0;current.rangeTried=false;current.rangePending=false;current.rangeFailed=false;current.phase='loading';return {done:false};
    }
    viewer.defaultView.scrollTo({top:maxScroll,behavior:'smooth'});
    current.phase='browsed';
    sessionStorage.setItem(storageKey(item),JSON.stringify({browsedAt:now,totalPages:pages.length,title:item.title}));
    setStatus('已浏览 '+item.title+' 全部 '+pages.length+' 页，正在刷新课程页');
    return {done:true};
  }
  const reset=()=>{rangeRecovery.cancel();current=null;};
  return {tick,browsed,snapshot,isActive:item=>current?.frame===item.frame&&current.phase!=='browsed',reset,dispose:reset};
}

function createPlaybackLineRecovery({storageKey,setStatus}){
  const pending=new Map(),failed=new Set();
  const getVideo=frame=>{try{return frame.contentDocument?.querySelector('video')||null;}catch{return null;}};
  function isPending(frame){
    const wait=pending.get(frame);
    if(!wait)return false;
    const video=getVideo(frame);
    if(video&&!video.error&&video.readyState>=2&&video.currentTime-wait.baseline>0.2){pending.delete(frame);failed.delete(frame);return false;}
    if(!video||Date.now()>=wait.until){pending.delete(frame);failed.add(frame);return false;}
    return true;
  }
  function tryRecover(frame,title){
    if(isPending(frame))return true;
    if(failed.has(frame))return false;
    const video=getVideo(frame);
    if(video?.error?.code!==2)return false;
    try{
      const options=Array.from(frame.contentDocument.querySelectorAll('.vjs-menu-item')).map(element=>({element,name:(element.querySelector('.vjs-menu-item-text')?.textContent||element.textContent||'').trim()})).filter(option=>/^公网\d+$/.test(option.name));
      const selected=options.find(({element})=>element.classList.contains('vjs-selected')||element.getAttribute('aria-checked')==='true');
      if(!selected)return false;
      const key=storageKey(title),saved=JSON.parse(sessionStorage.getItem(key)||'[]');
      if(!Array.isArray(saved))return false;
      const tried=new Set(saved.filter(name=>typeof name==='string'&&/^公网\d+$/.test(name)));
      tried.add(selected.name);
      if(tried.size>=2)return false;
      const next=options.find(option=>option.name!==selected.name&&!tried.has(option.name));
      if(!next)return false;
      tried.add(next.name);
      sessionStorage.setItem(key,JSON.stringify([...tried]));
      pending.set(frame,{baseline:Number(video.currentTime)||0,until:Date.now()+35000});
      next.element.click();
      setStatus('正在切换至 '+next.name+' 恢复视频播放');
      return true;
    }catch{pending.delete(frame);return false;}
  }
  return {tryRecover,isPending,hasFailed:frame=>failed.has(frame),dispose(){pending.clear();failed.clear();}};
}

function createPlaybackSpeedController(){
  const states=new WeakMap();
  function sourceKey(video,doc){
    try{
      const data=JSON.parse(doc.defaultView?.frameElement?.getAttribute?.('data')||'{}');
      if(data.objectid||data.objectId)return 'attachment:'+String(data.objectid||data.objectId);
    }catch{}
    const source=video.currentSrc||video.src||video.querySelector?.('source')?.getAttribute?.('src')||'';
    try{return new URL(source,doc.baseURI).pathname;}catch{return String(source).split(/[?#]/)[0];}
  }
  function stateFor(video,doc){
    const key=sourceKey(video,doc);let state=states.get(video);
    if(!state||state.key!==key){state={key,targetRate:2,nativeAttempted:false,fallbackAttempted:false,requested:false,status:'waiting'};states.set(video,state);}
    return state;
  }
  function apply(doc){
    try{
      const video=doc?.querySelector('video');if(!video||video.readyState===0)return false;
      const state=stateFor(video,doc);
      const choices=Array.from(doc.querySelectorAll('.vjs-playback-rate .vjs-menu-item')).flatMap(element=>{
        const text=(element.querySelector('.vjs-menu-item-text')?.textContent||element.textContent||'').trim();
        const match=/^(\d+(?:\.\d+)?)\s*(?:x|×|倍)/i.exec(text),rate=match?Number(match[1]):0;
        return Number.isFinite(rate)&&rate>0?[{element,rate}]:[];
      });
      const highest=choices.sort((a,b)=>b.rate-a.rate)[0];if(!state.requested)state.targetRate=highest?.rate>1?highest.rate:2;
      const atTarget=()=>Number(video.playbackRate)>=state.targetRate-0.001;
      if(atTarget()){state.status=state.requested?'applied':'already_target';return false;}
      // Observe platform rollbacks without repeatedly fighting the rate restriction.
      if(state.requested){state.status='restricted';return false;}
      if(highest?.rate>1&&!state.nativeAttempted){
        state.nativeAttempted=true;try{highest.element.click();}catch{}
        if(atTarget()){state.requested=true;state.status='native';return true;}
      }
      if(state.fallbackAttempted){state.status='restricted';return false;}
      state.fallbackAttempted=true;state.requested=true;state.targetRate=2;
      try{video.playbackRate=2;state.status=atTarget()?'fallback':'restricted';}catch{state.status='restricted';}
      return true;
    }catch{return false;}
  }
  function snapshot(doc){
    try{
      const video=doc?.querySelector('video');if(!video)return null;
      const state=stateFor(video,doc),actualRate=Number(video.playbackRate);
      if(state.requested&&actualRate<state.targetRate-0.001)state.status='restricted';
      return {targetRate:state.targetRate,actualRate,status:state.status,nativeAttempted:state.nativeAttempted,fallbackAttempted:state.fallbackAttempted};
    }catch{return null;}
  }
  return {apply,snapshot};
}
const playbackSpeed=createPlaybackSpeedController();

function createChapterFlowAdapter(app){
  const courseId=Array.from(new URL(location.href).searchParams).find(([name])=>name.toLowerCase()==='courseid')?.[1]||'';
  const chapterNode=()=>document.querySelector('#coursetree .posCatalog_active');
  const chapterName=()=>String(chapterNode()?.querySelector('.posCatalog_name')?.textContent||'').trim().replace(/\s+/g,' ');
  const reader=createDocumentReader({courseId,chapterName,setStatus:message=>setStatus(message)});
  let timer=null,reading=false,disposed=false,readingChapter=null,readingDocument=null,readingFrames=null;
  const text=element=>String(element?.title||element?.textContent||'').trim().replace(/^\s*\d+\s*/,'').replace(/\s+/g,'');
  function visible(element){
    try{
      if(!element||element.isConnected===false||!element.getClientRects().length)return false;
      const style=element.ownerDocument.defaultView.getComputedStyle(element);
      return style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse';
    }catch{return false;}
  }
  function content(){
    const candidates=Array.from(document.querySelectorAll('iframe[src*="/knowledge/cards"]'));
    const frame=candidates.find(visible)||(visible(document.getElementById('iframe'))?document.getElementById('iframe'):null);
    try{return {frame,doc:frame?.contentDocument||null};}catch{return {frame,doc:null};}
  }
  function items(){
    const root=content(),documents=[],videos=[],videoFrames=[],seen=new Set();
    function scan(doc,depth){
      if(!doc||seen.has(doc)||depth>4)return;seen.add(doc);
      for(const video of doc.querySelectorAll('video'))if(visible(video))videos.push(video);
      for(const frame of doc.querySelectorAll('iframe')){
        if(!visible(frame))continue;
        const src=frame.getAttribute('src')||frame.src||'';
        if(/\/ananas\/modules\/video\//.test(src))videoFrames.push(frame);
        if(/\/ananas\/modules\/(pdf|ppt)\//.test(src)){
          let data={};try{data=JSON.parse(frame.getAttribute('data')||'{}');}catch{}
          documents.push({frame,wrapper:frame.closest('.ans-attach-ct')||frame.parentElement,title:data.name||chapterName()||'课程文档'});
        }else{
          try{scan(frame.contentDocument,depth+1);}catch{}
        }
      }
    }
    scan(root.doc,0);
    return {...root,documents,videos,videoFrames};
  }
  const unfinishedVideo=state=>state.videos.some(video=>!video.ended&&!(typeof nativeVideoCompleted==='function'&&nativeVideoCompleted(video)))||state.videoFrames.some(frame=>{
    if(frame.closest('.ans-attach-ct')?.classList.contains('ans-job-finished'))return false;
    try{const video=frame.contentDocument?.querySelector('video');return !video||!video.ended;}catch{return true;}
  });
  function stopReading(){
    if(timer!==null)clearInterval(timer);timer=null;reading=false;readingChapter=null;readingDocument=null;readingFrames=null;reader.reset();
  }
  function fail(message){
    stopReading();app.quizFailure=message;app._nextUnitPending=false;app._isPlaying=false;app._clearCheckInterval?.();
    try{app._getVideoEl?.()?.pause();}catch{}
    setStatus(message);
  }
  function lastNativeStep(){
    const steps=Array.from(document.querySelectorAll('.prev_white')).filter(visible);
    const title=text(document.querySelector('.prev_title'));
    if(!steps.length)return !title;
    if(!title)return false;
    const matches=steps.map((step,index)=>text(step)===title?index:-1).filter(index=>index>=0);
    return matches.length===1&&matches[0]===steps.length-1;
  }
  function markDirectoryEnd(state,quizDone){
    const nodes=Array.from(document.querySelectorAll('#coursetree .posCatalog_select:not(.firstLayer)'));
    const active=chapterNode();
    if(!nodes.length||nodes[nodes.length-1]!==active||!lastNativeStep()||unfinishedVideo(state))return false;
    for(const node of nodes){
      const marker=node.querySelector('.orangeNew');
      if(!marker&&!node.querySelector('.icon_Completed'))return false;
      if(marker){const value=String(marker.textContent||'').trim();if(!/^0+$/.test(value))return false;}
    }
    const values=Array.from(document.querySelectorAll('#coursetree .posCatalog_select:not(.firstLayer) .orangeNew')).map(element=>Number(String(element.textContent||'').trim()));
    if(values.some(value=>!Number.isFinite(value)||value<0)||values.reduce((sum,value)=>sum+value,0)!==0)return false;
    const knownRead=state.documents.length>0&&state.documents.every(item=>reader.browsed(item));
    if(!quizDone&&!knownRead&&!(state.videos.length>0&&state.videos.every(video=>video.ended)))return false;
    app.reachedDirectoryEnd=true;app._nextUnitPending=false;app._isPlaying=false;app._clearCheckInterval?.();
    for(const video of state.videos)try{video.pause();}catch{}
    stopReading();setStatus('本课程目录中的任务点已全部完成');return true;
  }
  function beforeAdvance({quizDone=false}={}){
    if(disposed)return false;
    if(app.reachedDirectoryEnd){app._nextUnitPending=false;return true;}
    if(reading){app._nextUnitPending=false;return true;}
    const state=items();
    // Ignore late ended callbacks after a user has entered a different playing video.
    if(unfinishedVideo(state)){app._nextUnitPending=false;return true;}
    if(state.documents.some(item=>!reader.browsed(item))){startReading();return true;}
    return markDirectoryEnd(state,quizDone);
  }
  function tickReading(){
    if(disposed||!reading)return;
    try{
      const state=items();
      if(chapterNode()!==readingChapter||state.doc!==readingDocument||unfinishedVideo(state)||readingFrames.some(frame=>!state.documents.some(item=>item.frame===frame))){stopReading();app._nextUnitPending=false;return;}
      const next=state.documents.find(item=>!reader.browsed(item));
      if(next){const result=reader.tick(next);if(result.error)fail(result.error);return;}
      stopReading();app._nextUnitPending=false;
      // Native next-step navigation refreshes the chapter's recorded task state.
      if(!markDirectoryEnd(state,false))app.nextUnit();
    }catch(error){fail('文档 / PPT 阅读遇到异常：'+error.message);}
  }
  function isReadableStep(){
    if(disposed)return false;
    const state=items();return state.documents.length>0&&!unfinishedVideo(state);
  }
  function startReading(){
    if(disposed||app.reachedDirectoryEnd)return false;
    if(reading)return true;
    const state=items();if(!state.documents.length||unfinishedVideo(state))return false;
    app._nextUnitPending=false;app._isPlaying=false;app._clearCheckInterval?.();
    reading=true;readingChapter=chapterNode();readingDocument=state.doc;readingFrames=state.documents.map(item=>item.frame);
    timer=setInterval(tickReading,1000);tickReading();return true;
  }
  function readingSnapshot(){return reading?reader.snapshot()||{phase:'loading',title:chapterName()}:null;}
  function dispose(){disposed=true;stopReading();reader.dispose();}
  return {beforeAdvance,isReadableStep,startReading,readingSnapshot,dispose};
}

function selectChapterVideo(candidates){
  const videos=Array.from(candidates);
  const native=videos.filter(video=>{
    try{
      const frame=video.ownerDocument.defaultView.frameElement;
      return /\/ananas\/modules\/video\//.test(frame.getAttribute('src')||frame.src||'')&&Boolean(frame.closest('.ans-attach-ct'));
    }catch{return false;}
  });
  // Native attachments are ordered course content, including players not yet loaded.
  const pending=native.find(video=>!video.ended&&!nativeVideoCompleted(video));
  if(pending)return pending;
  const score=video=>Number(video.readyState||0)*10+(Number.isFinite(video.duration)&&video.duration>0?2:0)+(!video.paused?1:0);
  return videos.sort((a,b)=>score(b)-score(a))[0]||null;
}
const startedChapterVideos=new WeakSet();
function prepareChapterVideo(video){
  if(!video||video.readyState>0||startedChapterVideos.has(video))return;
  try{
    const frame=video.ownerDocument.defaultView.frameElement;
    if(!/\/ananas\/modules\/video\//.test(frame?.getAttribute('src')||frame?.src||'')||!frame.closest('.ans-attach-ct'))return;
    const button=video.ownerDocument.querySelector('button.vjs-big-play-button');
    if(!button?.getClientRects().length)return;
    const style=video.ownerDocument.defaultView.getComputedStyle(button);
    if(style.display==='none'||style.visibility==='hidden')return;
    startedChapterVideos.add(video);frame.scrollIntoView({block:'center'});button.click();
  }catch{}
}

function createVideoPopupQuestions({getVideo,requestAnswers,setStatus,onError,storageKey}){
  let disposed=false,candidate=null,active=null,requestPending=false,loadingSince=0,manual=null,observed=null,unwatch=null,automationDepth=0;
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  function visible(element){
    try{const style=element?.ownerDocument.defaultView.getComputedStyle(element);return Boolean(element&&element.isConnected!==false&&element.getClientRects().length&&style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse');}catch{return false;}
  }
  function videoSource(video){return String(video.currentSrc||video.src||'');}
  function popupFor(video){
    try{
      const doc=video?.ownerDocument;if(!doc)return null;
      return Array.from(doc.querySelectorAll('.ans-videoquiz')).find(visible)||Array.from(doc.querySelectorAll('.tkTopic')).find(visible)||null;
    }catch{return null;}
  }
  function read(video,popup){
    const card=popup.matches?.('.tkTopic')?popup:popup.querySelector('.tkTopic');
    if(!card||!visible(card))throw new Error('视频弹题内容尚未显示');
    const kind=clean(card.querySelector('.tkTopic_title')?.textContent).match(/单选题|多选题|判断题/)?.[0];
    const title=clean(card.querySelector('.tkItem_title')?.textContent);
    if(!kind||!title)throw new Error('未完整识别视频弹题题型或题干');
    const options=Array.from(card.querySelectorAll('li.ans-videoquiz-opt')).filter(visible).map(row=>{
      const label=row.querySelector('label'),input=row.querySelector('input[name="ans-videoquiz-opt"]');
      const match=/^([A-H])\s*[、.．:：]\s*(.+)$/i.exec(clean(label?.textContent));
      if(!match||!input||input.disabled||input.type!==(kind==='多选题'?'checkbox':'radio'))throw new Error('视频弹题选项结构无法确认');
      // The input value is private platform grading data; only visible option text is used.
      return {letter:match[1].toUpperCase(),text:match[2],element:input};
    });
    if(options.length<2||options.length>8||new Set(options.map(option=>option.letter)).size!==options.length)throw new Error('视频弹题选项数量或字母无法确认');
    const source=videoSource(video);let stableSource=source;try{const url=new URL(source);stableSource=url.origin+url.pathname;}catch{}
    const signature=JSON.stringify([stableSource,kind,title,options.map(option=>[option.letter,option.text])]);
    return {video,popup,card,source,signature,q:{kind,title,options,card,doc:video.ownerDocument}};
  }
  function same(snapshot){
    if(disposed||getVideo()!==snapshot.video||videoSource(snapshot.video)!==snapshot.source||popupFor(snapshot.video)!==snapshot.popup)return false;
    try{const current=read(snapshot.video,snapshot.popup);return current.card===snapshot.card&&current.signature===snapshot.signature&&current.q.options.every((option,index)=>option.element===snapshot.q.options[index].element);}catch{return false;}
  }
  function pause(video){try{video?.pause();}catch{}}
  function nativeClick(element){automationDepth++;try{element.click();}finally{automationDepth--;}}
  function fail(message){
    if(disposed||manual)return;
    waitForManual(observed||active?.snapshot,message);onError(message);
  }
  const keyFor=signature=>typeof storageKey==='function'?storageKey(signature):String(storageKey||'codexVideoPopup:')+signature;
  function readJournal(key){const value=sessionStorage.getItem(key);if(!value)return null;try{const result=JSON.parse(value);return typeof result==='object'?result:{state:String(result)};}catch{return {state:value};}}
  function writeJournal(key,state,details={}){sessionStorage.setItem(key,JSON.stringify({state,at:Date.now(),...details}));}
  const selected=snapshot=>snapshot.q.options.filter(o=>o.element.checked).map(o=>o.letter).sort();
  const wrongVisible=snapshot=>visible(snapshot.card.querySelector('#spanNot'));
  const reviewRequired=snapshot=>['#spanNotBack','#spanNotBackPoint'].some(s=>visible(snapshot.card.querySelector(s)));
  const canCorrect=snapshot=>wrongVisible(snapshot)&&!reviewRequired(snapshot)&&visible(snapshot.card.querySelector('#videoquiz-submit'))&&!visible(snapshot.card.querySelector('#videoquiz-submitting'));
  const answerKey=letters=>[...letters].sort().join('|');
  function waitForManual(snapshot,message='已转为人工接管，请完成当前视频弹题'){
    if(disposed||!snapshot)return;
    active=null;candidate=null;
    const key=snapshot.signature?keyFor(snapshot.signature):null;
    manual={snapshot,baseline:Number(snapshot.video.currentTime)||0,message};
    // This is an assistant ownership marker, never a platform completion record.
    if(key){
      const previous=readJournal(key)||{};
      const {state,at,...history}=previous;
      writeJournal(key,'manual',{...history,previousState:previous.previousState||state||null,reason:message});
    }
    if(popupFor(snapshot.video))pause(snapshot.video);
    setStatus(message);
  }
  function watch(snapshot){
    if(observed?.card===snapshot.card&&observed?.signature===snapshot.signature){observed=snapshot;return;}
    unwatch?.();observed=snapshot;
    const handler=event=>{
      if(!event.isTrusted||disposed||manual||automationDepth>0)return;
      const target=event.target;
      if(event.type==='change'&&snapshot.q.options.some(o=>o.element===target)||
         event.type==='click'&&target?.closest?.('#videoquiz-submit,#videoquiz-continue,li.ans-videoquiz-opt')){
        waitForManual(snapshot);
      }
    };
    snapshot.card.addEventListener?.('change',handler,true);snapshot.card.addEventListener?.('click',handler,true);
    unwatch=()=>{snapshot.card.removeEventListener?.('change',handler,true);snapshot.card.removeEventListener?.('click',handler,true);};
  }
  function observeManual(video){
    const previous=manual.snapshot;
    if(video!==previous.video||videoSource(video)!==previous.source){manual=null;observed=null;unwatch?.();unwatch=null;return false;}
    const popup=popupFor(video);
    if(popup&&previous.signature){try{if(read(video,popup).signature!==previous.signature){manual=null;observed=null;unwatch?.();unwatch=null;return false;}}catch{}}
    if(!popupFor(video)&&!video.paused&&Number(video.currentTime)>manual.baseline+0.05){
      manual=null;observed=null;unwatch?.();unwatch=null;loadingSince=0;
      setStatus('已检测到人工完成视频弹题，继续播放');return false;
    }
    if(popupFor(video))pause(video);
    setStatus(manual.message+' · 完成后将自动继续监测');return true;
  }
  function owns(attempt){
    if(disposed||active!==attempt||!same(attempt.snapshot))return false;
    if(answerKey(selected(attempt.snapshot))!==attempt.selection){waitForManual(attempt.snapshot);return false;}
    return true;
  }
  function begin(snapshot){
    observed=snapshot;
    const key=keyFor(snapshot.signature);
    const journal=readJournal(key);
    let rejected=Array.isArray(journal?.rejected)?journal.rejected:[];
    if(reviewRequired(snapshot)){fail('平台要求回看视频，暂不重新提交');return;}
    if(journal?.state==='manual'){waitForManual(snapshot,journal.reason||'该视频弹题已有人工接管记录，请完成当前题目');return;}
    if(rejected.length>=3){fail('视频弹题已达到三次提交上限，请检查题目');return;}
    if(canCorrect(snapshot)){
      const previous=journal?.submitted||selected(snapshot);
      if(!previous.length){fail('平台提示回答错误，但无法确认上次选项；未重复提交');return;}
      if(!rejected.some(a=>answerKey(a)===answerKey(previous)))rejected=[...rejected,previous];
      writeJournal(key,'rejected',{rejected,submitted:previous});
      if(rejected.length>=3){fail('视频弹题已达到三次提交上限，请检查题目');return;}
    }else if(journal){fail('该视频弹题已有提交记录，请检查平台结果；本次不重复提交');return;}
    const attempt={snapshot,key,rejected,phase:'answering',since:Date.now(),continued:false,selection:answerKey(selected(snapshot))};active=attempt;requestPending=true;
    setStatus(rejected.length?'平台反馈回答错误，正在重新判断并修改答案':'正在调用 Codex 回答视频内弹题');
    Promise.resolve().then(()=>{
      if(!owns(attempt))return null;
      return requestAnswers([{...snapshot.q,retryRejected:attempt.rejected,isCurrent:()=>owns(attempt)}]);
    }).then(answers=>{
      if(!owns(attempt)){if(active===attempt)active=null;return;}
      if(reviewRequired(snapshot)){fail('平台要求回看视频，暂不重新提交');return;}
      const desired=answers?.get?.(1);
      if(!Array.isArray(desired)||!desired.length||new Set(desired).size!==desired.length||desired.some(letter=>!snapshot.q.options.some(option=>option.letter===letter))||snapshot.q.kind!=='多选题'&&desired.length!==1)throw new Error('视频弹题答案验证失败，本次未提交');
      if(attempt.rejected.some(previous=>answerKey(previous)===answerKey(desired)))throw new Error('重新判断仍返回已被平台拒绝的答案，未重复提交');
      attempt.phase='selecting';
      for(const option of snapshot.q.options){
        if(Boolean(option.element.checked)===desired.includes(option.letter))continue;
        if(snapshot.q.kind!=='多选题'&&!desired.includes(option.letter))continue;
        if(!same(snapshot))return;
        nativeClick(option.element);
      }
      if(!same(snapshot)){active=null;return;}
      const actual=snapshot.q.options.filter(option=>option.element.checked).map(option=>option.letter).sort();
      if(actual.join('|')!==[...desired].sort().join('|'))throw new Error('视频弹题未能确认准确选中，本次未提交');
      const submit=snapshot.card.querySelector('#videoquiz-submit');
      if(!visible(submit))throw new Error('未找到可见的视频弹题提交按钮，本次未提交');
      attempt.submitted=[...desired].sort();writeJournal(key,'submitting',{submitted:attempt.submitted,rejected:attempt.rejected});attempt.phase='submitting';attempt.since=Date.now();attempt.baseline=Number(snapshot.video.currentTime)||0;
      setStatus('视频内弹题已选中，等待平台确认提交');nativeClick(submit);
    }).catch(error=>{if(!disposed&&active===attempt){if(attempt.phase==='answering'&&!owns(attempt)){if(active===attempt)active=null;return;}fail('视频内弹题需要处理：'+error.message);}}).finally(()=>{requestPending=false;});
  }
  function confirmSubmission(attempt){
    const {snapshot}=attempt,video=getVideo();
    if(video!==snapshot.video||videoSource(video)!==snapshot.source){fail('视频弹题提交结果尚未确认，播放器已变化，请检查平台结果');return;}
    const samePopup=same(snapshot);
    if(samePopup){
      if(reviewRequired(snapshot)){fail('平台要求回看视频，暂不重新提交');return;}
      if(wrongVisible(snapshot)){
        if(Date.now()-attempt.since<2000)return;
        if(canCorrect(snapshot)){active=null;begin(snapshot);return;}
        if(Date.now()-attempt.since>=60000)fail('答错后平台尚未允许重新提交，请检查');
        return;
      }
      const continuation=snapshot.card.querySelector('#videoquiz-continue');
      if(!attempt.continued&&visible(continuation)&&!visible(snapshot.card.querySelector('#videoquiz-submitting'))){attempt.continued=true;nativeClick(continuation);}
    }
    if((attempt.continued||!samePopup)&&!video.paused&&Number(video.currentTime)>attempt.baseline+0.05){writeJournal(attempt.key,'complete');active=null;candidate=null;setStatus('视频内弹题已完成，视频已继续播放');return;}
    if(Date.now()-attempt.since>=60000){fail('视频弹题提交后60秒仍未确认继续播放，请检查平台结果；本次不重复提交');return;}
    setStatus('等待视频内弹题提交结果 · '+Math.floor((Date.now()-attempt.since)/1000)+' 秒');
  }
  function tick(){
    if(disposed)return;
    const video=getVideo();
    if(manual&&observeManual(video))return;
    if(active?.phase==='submitting'){confirmSubmission(active);return;}
    const popup=popupFor(video);
    if(!popup){candidate=null;loadingSince=0;if(active?.phase==='answering'){waitForManual(active.snapshot,'弹题已关闭，等待原生播放恢复');observeManual(video);}return;}
    pause(video);
    if(active?.phase==='answering'){
      if(!same(active.snapshot)){active=null;candidate=null;}
      else if(!owns(active))return;
      else{if(typeof codexWaitUntil==='number'&&codexWaitUntil>Date.now())setStatus('正在等待答题服务恢复 · '+new Date(codexWaitUntil).toLocaleTimeString()+' 自动重试');else setStatus('Codex 正在回答视频内弹题 · 已等待 '+Math.floor((Date.now()-active.since)/1000)+' 秒');return;}
    }
    let snapshot;
    try{snapshot=read(video,popup);loadingSince=0;}catch(error){observed={video,popup,source:videoSource(video)};if(!loadingSince)loadingSince=Date.now();if(Date.now()-loadingSince>=15000)fail(error.message+'，请检查视频弹题');else setStatus('正在等待视频弹题内容加载');return;}
    watch(snapshot);
    if(!candidate||candidate.card!==snapshot.card||candidate.video!==video||candidate.signature!==snapshot.signature)candidate={...snapshot,hits:1};else candidate.hits++;
    if(requestPending){setStatus('正在等待上一条 Codex 请求结束，再处理当前视频弹题');return;}
    if(candidate.hits>=2){candidate=null;begin(snapshot);}else setStatus('已检测到视频内弹题，正在确认题目');
  }
  function isBlocking(){return !disposed&&(Boolean(manual)||active?.phase==='submitting'||Boolean(popupFor(getVideo())));}
  function dispose(){disposed=true;candidate=null;active=null;manual=null;observed=null;unwatch?.();unwatch=null;}
  return {tick,isBlocking,dispose};
}

async function answerWithReview(questions,{ask,validate,isCurrent,setStatus,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  const assertCurrent=()=>{if(!isCurrent()||questions.some(q=>!q.card?.isConnected))throw new Error('复核期间页面已变化或脚本已停止，本次未提交');};
  const uncertain=error=>/第\s*\d+\s*题识别或(?:作答|答案)不确定/.test(error?.message||'');
  assertCurrent();
  try{
    const raw=await ask(questions);assertCurrent();return validate(questions,raw);
  }catch(error){if(!uncertain(error))throw error;}
  // Re-render each visible question separately. Never relabel low confidence as high.
  const result=new Map();
  for(let index=0;index<questions.length;index++){
    const single=[questions[index]];
    for(let attempt=0;attempt<2;attempt++){
      assertCurrent();
      setStatus('识别未确定，正在单题复核 '+(index+1)+' / '+questions.length+'（'+(attempt+1)+' / 2）');
      await wait(attempt===0?1000:3000);assertCurrent();
      try{
        const raw=await ask(single);assertCurrent();
        const verified=validate(single,raw);
        result.set(index+1,verified.get(1));break;
      }catch(error){
        if(!uncertain(error))throw error;
        if(attempt===1)throw new Error('第 '+(index+1)+' 题经两次单题复核仍不确定，需要处理；本次未提交');
      }
    }
  }
  assertCurrent();return result;
}

function createVideoAnswerTools(){
const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
async function renderQuizImages(questions) {
    const images = [];
    for (let index = 0; index < questions.length; index++) {
        const q = questions[index], doc = q.doc;
        await doc.fonts.ready;
        const runs = [];
        function walk(node) {
            if (node.nodeType === 3) {
                const text = node.textContent.replace(/\s+/g, ' ');
                if (!text.trim()) return;
                const style = doc.defaultView.getComputedStyle(node.parentElement);
                runs.push({text, font: `28px ${style.fontFamily}`});
                return;
            }
            if (node.nodeType !== 1 || /^(SCRIPT|STYLE|INPUT|BUTTON)$/.test(node.tagName)) return;
            const style = doc.defaultView.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden') return;
            if (node.tagName === 'IMG' && node.width > 32 && node.height > 32)
                throw new Error('题目含图片，需要人工检查；本次未提交');
            const block = node.tagName === 'BR' || /^(DIV|P|LI|UL|OL|H\d)$/.test(node.tagName);
            if (block) runs.push({newline: true});
            for (const child of node.childNodes) walk(child);
            if (block) runs.push({newline: true});
        }
        walk(q.card);
        if (runs.some(r => r.font?.includes('font-cxsecret'))) {
            const secretReady=()=>Array.from(doc.fonts).some(f=>f.family.replace(/["']/g,'')==='font-cxsecret'&&f.status==='loaded');
            if(!secretReady()) await doc.fonts.load('28px "font-cxsecret"');
            if(!secretReady()) throw new Error('题目字体未加载成功，本次未提交，请刷新章节后重试');
        }
        const canvas = doc.createElement('canvas');
        canvas.width = 1400;
        const measure = canvas.getContext('2d');
        const commands = [];
        let x = 36, y = 88, lineHasText = false;
        for (const run of runs) {
            if (run.newline) {
                if (lineHasText) { y += 44; x = 36; lineHasText = false; }
                continue;
            }
            measure.font = run.font;
            for (const char of run.text) {
                const width = measure.measureText(char).width;
                if (x + width > 1364) { x = 36; y += 44; }
                commands.push({char, x, y, font: run.font});
                x += width;
                lineHasText = true;
            }
        }
        canvas.height = Math.ceil(y + (q.retryRejected?.length ? 170 : 60));
        if (canvas.height > 6000) throw new Error('题目图片过长，需要人工检查');
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#111'; ctx.textBaseline = 'top'; ctx.font = 'bold 30px sans-serif';
        ctx.fillText(`QUESTION ${index + 1} / ${questions.length} - ${q.kind}`, 36, 24);
        for (const command of commands) {
            ctx.font = command.font;
            ctx.fillText(command.char, command.x, command.y);
        }
        if(q.retryRejected?.length){ctx.font='22px sans-serif';ctx.fillStyle='#9a3412';ctx.fillText('Platform feedback: previous answers were WRONG: '+q.retryRejected.map(a=>a.join('+')).join(', '),36,y+48);ctx.fillText('Reconsider the visible question. Return a different answer only if confident.',36,y+84);}
        images.push(canvas.toDataURL('image/png'));
    }
    return images;
}

async function askCodex(questions,context='章节测验') {
setStatus('正在识别并回答 '+questions.length+' 道'+context);
const payload = questions.map((q,i)=>({ id:i+1, type:q.kind, question:q.title, options:q.options.map(o=>({letter:o.letter,text:o.text})) }));
const images = await renderQuizImages(questions);
await ensureCodexReady(()=>!monitorStopped&&questions.every(q=>q.card.isConnected&&(!q.isCurrent||q.isCurrent())));
if(monitorStopped)throw new Error('脚本已停止');
setStatus('Codex 正在回答 '+questions.length+' 道'+context);
const data = await requestBridgeAnswers({questions:payload,images},()=>!monitorStopped&&questions.every(q=>q.card.isConnected&&(!q.isCurrent||q.isCurrent())));
if(monitorStopped) throw new Error('脚本已停止');
return data.answers;
}
function validateAnswers(questions, answers) {
if (!Array.isArray(answers) || answers.length !== questions.length) throw new Error('AI 返回的题目数量不匹配');
const result = new Map();
for (const item of answers) {
if (!Number.isInteger(item.id) || result.has(item.id) || !Array.isArray(item.letters))
throw new Error('AI 答案格式错误');
if(item.confidence !== 'high') throw new Error(`第 ${item.id} 题识别或答案不确定，本次未提交`);
const q = questions[item.id - 1];
if (!q) throw new Error('AI 返回未知题号');
const letters = item.letters.map((letter) => clean(letter).toUpperCase());
if (!letters.length) throw new Error(`第 ${item.id} 题 AI 未给出选项，已停止提交`);
if (new Set(letters).size !== letters.length) throw new Error(`第 ${item.id} 题答案包含重复选项，已停止提交`);
if (q.kind !== '多选题' && letters.length !== 1)
throw new Error(`第 ${item.id} 题是${q.kind}，但 AI 返回了 ${letters.length} 个选项，已停止提交`);
const invalidLetters = letters.filter((letter) => !q.options.some((option) => option.letter === letter));
if (invalidLetters.length)
throw new Error(`第 ${item.id} 题 AI 返回了页面中不存在的选项：${invalidLetters.join('、')}，已停止提交`);
result.set(item.id, letters);
}
return result;
}


return async questions=>answerWithReview(questions,{ask:qs=>askCodex(qs,'视频弹题'),validate:validateAnswers,isCurrent:()=>!monitorStopped&&questions.every(q=>q.card.isConnected&&(!q.isCurrent||q.isCurrent())),setStatus});
}
const requestVideoAnswers=createVideoAnswerTools();

function createContinuousPlayer(){
  const key='__codexCoursePlayback';
  PAGE[key]?.stop?.('正在重新识别播放器');
  const state={running:true,title:'',message:'正在识别视频',startedAt:Date.now(),switches:0,reachedDirectoryEnd:false};
  const courseId=Array.from(new URL(location.href).searchParams).find(([name])=>name.toLowerCase()==='courseid')?.[1]||'';
  const deferredStorageKey='codexCourseDeferred:'+courseId;
  const orderStorageKey='codexCourseOrder:'+courseId;
  let order;try{order=JSON.parse(sessionStorage.getItem(orderStorageKey)||'null');}catch{}
  const forwardOnly=order?.mode==='forward';
  const resumeStorageKey='codexDocumentResume:'+courseId;
  let savedResume;try{savedResume=JSON.parse(sessionStorage.getItem(resumeStorageKey)||'null');}catch{}
  const intendedChapter=savedResume?.chapter||(forwardOnly&&(order?.cursor||order?.start));
  let restoring=intendedChapter?{chapter:String(intendedChapter),clicked:false,since:Date.now(),previousDocument:null}:null;
  const chapterNumber=node=>node?.querySelector('.posCatalog_sbar')?.textContent.trim()||(node?.querySelector('.posCatalog_name')?.textContent||'').trim().match(/^\d+(?:\.\d+)*/)?.[0]||'';
  const saveCursor=number=>{if(forwardOnly&&number){order={...order,cursor:number};sessionStorage.setItem(orderStorageKey,JSON.stringify(order));}};
  const pageLoadId=window.__codexDocumentLoadId||(window.__codexDocumentLoadId=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  const browsedStorageKey='codexCourseBrowsed:'+courseId;
  let browsedChapters;try{browsedChapters=new Set(JSON.parse(sessionStorage.getItem(browsedStorageKey)||'[]'));}catch{browsedChapters=new Set();}
  const viewedVideosKey='codexViewedVideos:'+courseId;
  let viewedVideos;try{viewedVideos=new Set(JSON.parse(sessionStorage.getItem(viewedVideosKey)||'[]'));}catch{viewedVideos=new Set();}
  let deferred;
  try{deferred=new Set(JSON.parse(sessionStorage.getItem(deferredStorageKey)||'[]'));}catch{deferred=new Set();}
  const nodeLabel=node=>(node?.querySelector('.posCatalog_name')?.textContent||'').trim().replace(/\s+/g,' ');
  const deferCurrent=()=>{const name=nodeLabel(document.querySelector('#coursetree .posCatalog_active'));if(name){deferred.add(name);try{sessionStorage.setItem(deferredStorageKey,JSON.stringify([...deferred]));}catch{}}};
  const deadline=Date.now()+12*60*60*1000;
  let timer,active=null,lastNavigation=0,lastResume=0,resumeAttempts=0,endedAt=0,lastTime=0,lastProgress=Date.now(),currentDocument=null,documentSince=Date.now(),refreshPending=false;
  const setPlayerStatus=message=>{state.message=message;setStatus(message);};
  const reader=createDocumentReader({courseId,chapterName:()=>nodeLabel(document.querySelector('#coursetree .posCatalog_active')),setStatus:message=>setPlayerStatus(message)});
  const lineRecovery=createPlaybackLineRecovery({storageKey:title=>'codexVideoLines:'+courseId+':'+sessionState.id+':'+nodeLabel(document.querySelector('#coursetree .posCatalog_active'))+'|'+title,setStatus:message=>setPlayerStatus(message)});
  const stop=message=>{state.running=false;clearInterval(timer);reader.dispose();lineRecovery.dispose();active?.video?.pause();setPlayerStatus(message||'已停止');};
  const readVideos=doc=>Array.from(doc.querySelectorAll('iframe')).flatMap(frame=>{
    try {
      const video=frame.contentDocument?.querySelector('video');
      if(!video)return [];
      const wrapper=frame.closest('.ans-attach-ct')||frame.parentElement;
      let data={};try{data=JSON.parse(frame.getAttribute('data')||'{}');}catch{}
      return [{frame,video,wrapper,title:data.name||'课程视频'}];
    }catch{return [];}
  });
  const videoIdentity=item=>nodeLabel(document.querySelector('#coursetree .posCatalog_active'))+'|'+item.title;
  const finished=item=>item.wrapper.classList.contains('ans-job-finished')||Boolean(item.video&&viewedVideos.has(videoIdentity(item)));
  const readDocuments=doc=>Array.from(doc.querySelectorAll('iframe')).flatMap(frame=>{
    if(!/\/ananas\/modules\/(pdf|ppt)\//.test(frame.getAttribute('src')||frame.src||''))return [];
    let data={};try{data=JSON.parse(frame.getAttribute('data')||'{}');}catch{}
    return [{frame,wrapper:frame.closest('.ans-attach-ct')||frame.parentElement,title:data.name||nodeLabel(document.querySelector('#coursetree .posCatalog_active'))||'课程文档'}];
  });
  const refreshDocumentChapter=items=>{
    const chapter=nodeLabel(document.querySelector('#coursetree .posCatalog_active'));
    const key='codexDocumentRefresh:'+courseId+':'+chapter+':'+items.map(x=>x.title).join('|');
    let previous;try{previous=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}
    if(previous&&previous.pageLoadId!==pageLoadId)return false;
    refreshPending=true;
    if(!previous){
      const number=chapterNumber(document.querySelector('#coursetree .posCatalog_active'));
      sessionStorage.setItem(key,JSON.stringify({at:Date.now(),pageLoadId}));
      sessionStorage.setItem(resumeStorageKey,JSON.stringify({chapter:number,at:Date.now()}));saveCursor(number);
      setPlayerStatus('文档 / PPT 已浏览，正在刷新学习通课程页');window.location.reload();
    }
    return true;
  };
  const navigateNext=()=>{
    if(Date.now()-lastNavigation<12000)return;
    const nodes=Array.from(document.querySelectorAll('#coursetree .posCatalog_select:not(.firstLayer)'));
    const current=nodes.findIndex(n=>n.classList.contains('posCatalog_active'));
    if(current<0){stop('无法确定当前章节，请检查页面');return;}
    const pending=n=>(forwardOnly?!n.querySelector('.icon_Completed'):Number(n.querySelector('.orangeNew')?.textContent.trim()||'0')>0)&&!deferred.has(nodeLabel(n))&&!browsedChapters.has(nodeLabel(n));
    const next=nodes.slice(current+1).find(pending)||(!forwardOnly&&nodes.slice(0,current).find(pending));
    if(!next){if(nodes.length>0)state.reachedDirectoryEnd=true;const remaining=nodes.reduce((sum,n)=>sum+Number(n.querySelector('.orangeNew')?.textContent.trim()||0),0);stop(remaining===0?'本课程任务点已全部完成':forwardOnly?'已按顺序浏览到目录末尾，仍有 '+remaining+' 个平台任务点未确认':'剩余 '+remaining+' 个文档或其他任务需要处理');return;}
    const link=next.querySelector('.posCatalog_name');
    if(!link){stop('找不到下一小节入口');return;}
    lastNavigation=Date.now();active=null;state.switches++;
    saveCursor(chapterNumber(next));
    setPlayerStatus('正在进入 '+link.textContent.trim());
    link.click();
  };
  const tick=()=>{
    if(!state.running||refreshPending)return;
    if(Date.now()>deadline){stop('连续播放已达到12小时');return;}
    try{
      const doc=document.getElementById('iframe')?.contentDocument;
      if(restoring){
        const current=document.querySelector('#coursetree .posCatalog_active');
        if(!restoring.clicked&&chapterNumber(current)===restoring.chapter){saveCursor(restoring.chapter);restoring=null;sessionStorage.removeItem(resumeStorageKey);}
        else if(!restoring.clicked){
          const target=Array.from(document.querySelectorAll('#coursetree .posCatalog_select:not(.firstLayer)')).find(node=>chapterNumber(node)===restoring.chapter);
          if(!target){stop('刷新后未找到原来的章节，请检查目录');return;}
          restoring.previousDocument=doc;restoring.since=Date.now();restoring.clicked=true;
          setPlayerStatus('刷新后正在恢复第 '+restoring.chapter+' 节');target.querySelector('.posCatalog_name').click();return;
        }else if(chapterNumber(current)===restoring.chapter&&doc&&doc!==restoring.previousDocument&&Date.now()-restoring.since>=1500){saveCursor(restoring.chapter);restoring=null;sessionStorage.removeItem(resumeStorageKey);}
        else{if(Date.now()-restoring.since>45000)stop('刷新后章节未能恢复，请检查页面');return;}
      }
      if(!doc){setPlayerStatus('等待课程内容加载');return;}
      if(doc!==currentDocument){currentDocument=doc;documentSince=Date.now();reader.reset();}
      const videos=readVideos(doc);
      if(active && !videos.some(item=>item.video===active.video))active=null;
      if(active){
        const v=active.video;
        if(videoQuestions?.isBlocking()){videoQuestions.tick();return;}
        playbackSpeed.apply(active.frame.contentDocument);
        if(v.error){if(v.error.code===2&&lineRecovery.tryRecover(active.frame,active.title))return;stop('视频加载失败，请检查网络或播放器');return;}
        if(lineRecovery.isPending(active.frame)){
          if(v.paused&&Date.now()-lastResume>3000){lastResume=Date.now();v.play().catch(()=>{});}
          return;
        }
        if(v.ended){
          if(!endedAt)endedAt=Date.now();
          if((finished(active)||active.optional)&&Date.now()-endedAt>2000){
            if(active.optional){viewedVideos.add(videoIdentity(active));sessionStorage.setItem(viewedVideosKey,JSON.stringify([...viewedVideos]));}
            active=null;endedAt=0;return;
          }
          if(Date.now()-endedAt>30000)stop('视频已结束，任务进度尚未确认，请检查页面');
          return;
        }
        if(v.currentTime!==lastTime){lastTime=v.currentTime;lastProgress=Date.now();resumeAttempts=0;}
        if(Date.now()-lastProgress>120000){stop('播放进度超过2分钟未推进，请检查播放器');return;}
        if(v.paused && Date.now()-lastResume>10000){
          if(++resumeAttempts>3){stop('播放器未能继续，请点击播放按钮');return;}
          lastResume=Date.now();v.play().catch(()=>setPlayerStatus('需要点击播放器继续播放'));
        }
        setPlayerStatus(active.title+' · '+Math.floor(v.currentTime)+' / '+Math.floor(v.duration||0)+' 秒');
        return;
      }
      if(Date.now()-lastNavigation<8000)return;
      const target=videos.find(item=>!finished(item));
      if(!target){
        if(Date.now()-documentSince<8000){setPlayerStatus('等待本节视频、文档或 PPT 加载');return;}
        const current=document.querySelector('#coursetree .posCatalog_active');
        const remaining=Number(current?.querySelector('.orangeNew')?.textContent.trim()||'0');
        const documents=readDocuments(doc);
        const nextDocument=documents.find(item=>!reader.browsed(item)&&(!finished(item)||reader.isActive(item)));
        if(nextDocument){state.title=nextDocument.title;const result=reader.tick(nextDocument);if(result.error)stop(result.error);return;}
        if(documents.length&&(documents.some(item=>reader.browsed(item))||documents.every(finished))){
          if(refreshDocumentChapter(documents))return;
          browsedChapters.add(nodeLabel(current));sessionStorage.setItem(browsedStorageKey,JSON.stringify([...browsedChapters]));
        }else if(!videos.length && remaining>0){
          if(Date.now()-documentSince<30000){setPlayerStatus('正在检查本节阅读或其他任务');return;}
          if(forwardOnly){stop('当前小节存在无法自动处理的任务，已停留等待处理');return;}
          deferCurrent();
        }
        reader.reset();
        navigateNext();return;
      }
      reader.reset();
      active=target;endedAt=0;lastTime=target.video.currentTime;lastProgress=Date.now();lastResume=Date.now();resumeAttempts=0;
      active.optional=Number(document.querySelector('#coursetree .posCatalog_active')?.querySelector('.orangeNew')?.textContent.trim()||'0')===0;
      state.title=target.title;
      for(const item of videos)if(item!==target&&!item.video.paused)item.video.pause();
      target.frame.scrollIntoView({block:'center'});
      const play=target.frame.contentDocument.querySelector('button.vjs-big-play-button');
      if(videoQuestions?.isBlocking()){videoQuestions.tick();return;}
      if(play && target.video.paused)play.click();
      if(target.video.paused)target.video.play().catch(()=>setPlayerStatus('需要点击播放器开始播放'));
      playbackSpeed.apply(target.frame.contentDocument);
      setPlayerStatus('正在播放 '+target.title);
    }catch(error){stop('页面发生变化：'+error.message);}
  };
  PAGE[key]={state,stop,getVideo:()=>active?.video,resume:()=>active?.video.play(),recoverLine:()=>Boolean(state.running&&active&&lineRecovery.tryRecover(active.frame,active.title)),snapshot:()=>({...state,catalogSize:document.querySelectorAll('#coursetree .posCatalog_select:not(.firstLayer)').length,time:active?.video.currentTime??null,duration:active?.video.duration??null,paused:active?.video.paused??null,playbackRate:active?.video.playbackRate??null,ended:active?.video.ended??false,ready:active?.video.readyState??null,mediaError:active?.video.error?.code??null,lastNavigationAt:lastNavigation,lastProgressAt:lastProgress,busy:Boolean(videoQuestions?.isBlocking())||refreshPending||Boolean(restoring)||Boolean(reader.snapshot())||Boolean(active&&lineRecovery.isPending(active.frame)),reading:reader.snapshot(),restoringChapter:restoring?.chapter||null,order:forwardOnly?'forward':'pending',chapter:document.querySelector('#coursetree .posCatalog_active .posCatalog_name')?.textContent.trim()||'',remainingTasks:Array.from(document.querySelectorAll('#coursetree .posCatalog_select:not(.firstLayer) .orangeNew')).reduce((sum,e)=>sum+Number(e.textContent.trim()||0),0),deferredTasks:[...deferred],browsedChapters:[...browsedChapters]})};
  timer=setInterval(tick,1000);tick();
  return PAGE[key];

}

function attachQuizAutomation(app) {
const attemptedQuizzes = new Set();
let quizBusy = false;
let stopped = false;
const originalDestroy = app.destroy.bind(app);
app.lastQuizResult = null;
app.destroy = function () {
stopped = true; userStopped=true;
app._getVideoEl()?.pause();
originalDestroy();
};

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const visible = (el) => Boolean(el && el.isConnected && el.getClientRects().length &&
el.ownerDocument.defaultView.getComputedStyle(el).visibility !== 'hidden');
const kindPattern = /[\[【](单选题|多选题|判断题)[\]】]/;

function courseDocuments() {
const result = [];
const visit = (doc, depth) => {
if (!doc || depth > 3 || result.includes(doc)) return;
result.push(doc);
for (const frame of doc.querySelectorAll('iframe')) {
try { visit(frame.contentDocument, depth + 1); } catch (_) { /* cross origin */ }
}
};
visit(document, 0);
return result;
}

function quizCompleted() {
if(app._currentStepTitle()!=='章节测验') return false;
return courseDocuments().some(doc=>{
const text=clean(doc.body?.innerText);
return /本次成绩\s*\d+(?:\.\d+)?\s*分/.test(text) &&
(/章节测验\s*已完成/.test(text)||/我的答案\s*[:：]/.test(text));
});
}
function optionElements(card) {
const labels = Array.from(card.querySelectorAll('span,div,label,li,p,b,i,strong,a'))
.filter((el) => /^[A-H]$/.test(clean(el.textContent)) &&
!Array.from(el.children).some((child) => /^[A-H]$/.test(clean(child.textContent))));
const found = new Map();
for (const label of labels) {
const letter = clean(label.textContent);
if (found.has(letter)) continue;
let target = label;
for (let n = 0; n < 5; n++) {
const parent = target.parentElement;
if (!parent || parent === card) break;
const otherLetters = Array.from(parent.querySelectorAll('span,div,label,li,p,b,i,strong,a'))
.filter((el) => /^[A-H]$/.test(clean(el.textContent)) && el !== label);
if (otherLetters.some((el) => !el.contains(label) && !label.contains(el))) break;
target = parent;
if (clean(target.innerText).length > 1) break;
}
const text = clean(target.innerText).replace(new RegExp(`^${letter}[.、．]?\\s*`), '');
if (text) found.set(letter, { letter, text, element: target });
}
return Array.from(found.values()).sort((a, b) => a.letter.localeCompare(b.letter));
}

function extractQuestions() {
const questions = [];
for (const doc of courseDocuments()) {
const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
const seenCards = new Set();
let node;
while ((node = walker.nextNode())) {
const kind = clean(node.textContent).match(kindPattern)?.[1];
if (!kind || !visible(node.parentElement)) continue;
let card = node.parentElement;
let options = [];
for (let depth = 0; card && depth < 9; depth++, card = card.parentElement) {
const cardText = clean(card.innerText);
const kinds = cardText.match(new RegExp(kindPattern.source, 'g')) || [];
if (kinds.length > 1) break;
options = optionElements(card);
if (options.length >= 2 && options.length <= 8) break;
}
if (!card || options.length < 2 || options.length > 8 || seenCards.has(card)) continue;
seenCards.add(card);
const full = card.innerText || '';
const firstOption = full.search(/(?:^|\n)\s*A\s*(?:[.、．]|\S)/);
const title = clean(firstOption >= 0 ? full.slice(0, firstOption) :
(node.parentElement.innerText || full))
.replace(/^\d+\s*/, '').replace(kindPattern, '').trim();
if (!title || title.length > 500 || options.some((option) => !option.text || option.text.length > 500)) continue;
questions.push({ kind, title, options, card, doc });
}
}
return questions;
}

function findButton(doc, label) {
const candidates = Array.from(doc.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"],div,span'))
.filter((el) => visible(el) && clean(el.value || el.innerText) === label);
return candidates.find((el) => /^(BUTTON|A|INPUT)$/.test(el.tagName)) ||
candidates.find((el) => !Array.from(el.children).some((child) => clean(child.innerText) === label)) || null;
}

function findNextButton() {
for (const doc of courseDocuments()) {
const known = doc.querySelector('#prevNextFocusNext, #right1, .nextChapter');
if (visible(known) && clean(known.innerText || known.title).includes('下一节')) return known;
const generic = findButton(doc, '下一节');
if (generic) return generic;
}
return null;
}

async function revealQuizQuestions() {
const docs = courseDocuments();
const submit = docs.map((doc) => findButton(doc, '提交')).find(Boolean);
if (!submit) return;
let scroller = submit.parentElement;
while (scroller && scroller !== submit.ownerDocument.body) {
const style = scroller.ownerDocument.defaultView.getComputedStyle(scroller);
if (/(auto|scroll)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight + 100) break;
scroller = scroller.parentElement;
}
if (!scroller || scroller === submit.ownerDocument.body) {
scroller = submit.ownerDocument.scrollingElement;
}
if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 100) return;
scroller.scrollTop = 0;
await sleep(150);
for (let step = 0; step < 50; step++) {
const bottom = scroller.scrollHeight - scroller.clientHeight;
if (scroller.scrollTop >= bottom - 2) break;
scroller.scrollTop = Math.min(bottom, scroller.scrollTop + Math.max(300, scroller.clientHeight * 0.75));
await sleep(120);
}
}

async function waitForQuizQuestions() {
let submitDoc = null;
for (let attempt = 0; attempt < 240; attempt++) {
if (stopped) throw new Error('脚本已停止');
if (quizCompleted()) return null;
submitDoc = courseDocuments().find((doc) => findButton(doc, '提交'));
if (submitDoc) break;
if (attempt > 0 && attempt % 30 === 0) console.log(`测验提交按钮仍在加载，已等待 ${attempt / 2} 秒`);
await sleep(500);
}
if (!submitDoc) throw new Error('进入章节测验后等待 120 秒，仍未找到“提交”按钮。请检查题目框架是否正常加载');

await revealQuizQuestions();
let previousSignature = '';
let stableCount = 0;
for (let attempt = 0; attempt < 240; attempt++) {
if (stopped) throw new Error('脚本已停止');
if (quizCompleted()) return null;
const questions = extractQuestions();
const countText = clean(submitDoc.body.innerText).match(/题量\s*[:：]\s*(\d+)/);
const expected = countText ? Number(countText[1]) : null;
if (questions.length && (!expected || questions.length === expected)) {
const signature = questions.map((q) => `${q.kind}:${q.title}:${q.options.length}`).join('|');
stableCount = signature === previousSignature ? stableCount + 1 : 0;
previousSignature = signature;
if (stableCount >= 3) return questions;
} else {
stableCount = 0;
previousSignature = '';
}
if (attempt > 0 && attempt % 30 === 0) console.log(`测验题目仍在加载，已等待 ${attempt / 2} 秒；当前识别 ${questions.length} 道`);
await sleep(500);
}
throw new Error('测验框架已打开，但等待 120 秒仍未识别完整题目。可运行 app.inspectQuiz() 查看当前识别结果');
}

async function renderQuizImages(questions) {
    const images = [];
    for (let index = 0; index < questions.length; index++) {
        const q = questions[index], doc = q.doc;
        await doc.fonts.ready;
        const runs = [];
        function walk(node) {
            if (node.nodeType === 3) {
                const text = node.textContent.replace(/\s+/g, ' ');
                if (!text.trim()) return;
                const style = doc.defaultView.getComputedStyle(node.parentElement);
                runs.push({text, font: `28px ${style.fontFamily}`});
                return;
            }
            if (node.nodeType !== 1 || /^(SCRIPT|STYLE|INPUT|BUTTON)$/.test(node.tagName)) return;
            const style = doc.defaultView.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden') return;
            if (node.tagName === 'IMG' && node.width > 32 && node.height > 32)
                throw new Error('题目含图片，需要人工检查；本次未提交');
            const block = node.tagName === 'BR' || /^(DIV|P|LI|UL|OL|H\d)$/.test(node.tagName);
            if (block) runs.push({newline: true});
            for (const child of node.childNodes) walk(child);
            if (block) runs.push({newline: true});
        }
        walk(q.card);
        if (runs.some(r => r.font?.includes('font-cxsecret'))) {
            const secretReady=()=>Array.from(doc.fonts).some(f=>f.family.replace(/["']/g,'')==='font-cxsecret'&&f.status==='loaded');
            if(!secretReady()) await doc.fonts.load('28px "font-cxsecret"');
            if(!secretReady()) throw new Error('题目字体未加载成功，本次未提交，请刷新章节后重试');
        }
        const canvas = doc.createElement('canvas');
        canvas.width = 1400;
        const measure = canvas.getContext('2d');
        const commands = [];
        let x = 36, y = 88, lineHasText = false;
        for (const run of runs) {
            if (run.newline) {
                if (lineHasText) { y += 44; x = 36; lineHasText = false; }
                continue;
            }
            measure.font = run.font;
            for (const char of run.text) {
                const width = measure.measureText(char).width;
                if (x + width > 1364) { x = 36; y += 44; }
                commands.push({char, x, y, font: run.font});
                x += width;
                lineHasText = true;
            }
        }
        canvas.height = Math.ceil(y + 60);
        if (canvas.height > 6000) throw new Error('题目图片过长，需要人工检查');
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#111'; ctx.textBaseline = 'top'; ctx.font = 'bold 30px sans-serif';
        ctx.fillText(`QUESTION ${index + 1} / ${questions.length} - ${q.kind}`, 36, 24);
        for (const command of commands) {
            ctx.font = command.font;
            ctx.fillText(command.char, command.x, command.y);
        }
        images.push(canvas.toDataURL('image/png'));
    }
    return images;
}

async function askCodex(questions,context='章节测验') {
setStatus('正在识别并回答 '+questions.length+' 道'+context);
const payload = questions.map((q,i)=>({ id:i+1, type:q.kind, question:q.title, options:q.options.map(o=>({letter:o.letter,text:o.text})) }));
const images = await renderQuizImages(questions);
await ensureCodexReady();
if(stopped)throw new Error('脚本已停止');
setStatus('Codex 正在回答 '+questions.length+' 道'+context);
const data = await requestBridgeAnswers({questions:payload,images},()=>!stopped&&questions.every(q=>q.card.isConnected&&courseDocuments().includes(q.doc)));
if(stopped) throw new Error('脚本已停止');
return data.answers;
}
function validateAnswers(questions, answers) {
if (!Array.isArray(answers) || answers.length !== questions.length) throw new Error('AI 返回的题目数量不匹配');
const result = new Map();
for (const item of answers) {
if (!Number.isInteger(item.id) || result.has(item.id) || !Array.isArray(item.letters))
throw new Error('AI 答案格式错误');
if(item.confidence !== 'high') throw new Error(`第 ${item.id} 题识别或答案不确定，本次未提交`);
const q = questions[item.id - 1];
if (!q) throw new Error('AI 返回未知题号');
const letters = item.letters.map((letter) => clean(letter).toUpperCase());
if (!letters.length) throw new Error(`第 ${item.id} 题 AI 未给出选项，已停止提交`);
if (new Set(letters).size !== letters.length) throw new Error(`第 ${item.id} 题答案包含重复选项，已停止提交`);
if (q.kind !== '多选题' && letters.length !== 1)
throw new Error(`第 ${item.id} 题是${q.kind}，但 AI 返回了 ${letters.length} 个选项，已停止提交`);
const invalidLetters = letters.filter((letter) => !q.options.some((option) => option.letter === letter));
if (invalidLetters.length)
throw new Error(`第 ${item.id} 题 AI 返回了页面中不存在的选项：${invalidLetters.join('、')}，已停止提交`);
result.set(item.id, letters);
}
return result;
}

function selectedLetters(q) {
const hidden = Array.from(q.card.querySelectorAll('input[type="hidden"]')).find(e=>/^answer\d+$/.test(e.name));
if(hidden) {
const value=hidden.value.trim().toLowerCase();
const mappings=q.options.map(o=>({letter:o.letter,key:o.element.querySelector?.('[data]')?.getAttribute('data')?.trim().toLowerCase()}));
if(mappings.every(o=>o.key)) {
if(new Set(mappings.map(o=>o.key)).size!==mappings.length) throw new Error('选项标识重复，无法核对选中状态');
const keys=value==='true'||value==='false'?[value]:[...value].filter(c=>/[a-h]/.test(c));
if(keys.some(key=>!mappings.some(o=>o.key===key))) throw new Error('选中状态包含未知选项标识');
return mappings.filter(o=>keys.includes(o.key)).map(o=>o.letter).sort();
}
if(mappings.some(o=>o.key)) throw new Error('选项标识不完整，无法核对选中状态');
return [...value.toUpperCase()].filter(c=>/[A-H]/.test(c)).sort();
}
return q.options.filter(o=>o.element.querySelector('input:checked') || o.element.getAttribute('aria-checked') === 'true').map(o=>o.letter).sort();
}

async function selectAnswers(questions, answers) {
for(let i=0;i<questions.length;i++) {
const q=questions[i], desired=answers.get(i+1);
if(stopped || !q.card.isConnected || !courseDocuments().includes(q.doc)) throw new Error('页面已变化或脚本停止');
const before=selectedLetters(q);
if(q.kind==='多选题') for(const letter of before.filter(c=>!desired.includes(c))) { q.options.find(o=>o.letter===letter).element.click(); await sleep(100); }
for(const letter of desired) {
if(!selectedLetters(q).includes(letter)) { const option=q.options.find(o=>o.letter===letter); option.element.scrollIntoView({block:'center'}); option.element.click(); await sleep(150); }
}
if(selectedLetters(q).join('') !== [...desired].sort().join('')) throw new Error(`第 ${i+1} 题未确认准确选中，本次未提交`);
}
}
function stepIdentity() { const u=new URL(location.href); return ['courseId','clazzid','chapterId'].map(k=>u.searchParams.get(k)||'').join(':')+'|'+clean(document.querySelector('.prev_title')?.innerText); }
function assertChapterOnly(doc) {
if(app._currentStepTitle() !== '章节测验' || !clean(doc.body.innerText).includes('章节测验') ||
/考试剩余时间|期末考试|期中考试|正式考试|限时考试|剩余时间/.test(clean(doc.body.innerText))) throw new Error('当前不是普通章节测验，已停止');
}
function questionKeys(questions) {
const ids=questions.map(q=>q.card.querySelector('[qid]')?.getAttribute('qid') || q.card.closest('.singleQuesId[id]')?.id);
if(ids.some(id=>!id)||new Set(ids).size!==ids.length) throw new Error('题目缺少稳定标识，本次未提交');
return ids.join(',');
}
function assertChapterOnly(doc) {
if(app._currentStepTitle() !== '章节测验' || !clean(doc.body.innerText).includes('章节测验') ||
/考试剩余时间|期末考试|期中考试|正式考试|限时考试|剩余时间/.test(clean(doc.body.innerText))) throw new Error('当前不是普通章节测验，已停止');
}
async function confirmSubmitDialog() {
for (let i = 0; i < 20; i++) {
if (stopped) throw new Error('脚本已停止');
const dialogs = courseDocuments().flatMap((doc) =>
Array.from(doc.querySelectorAll('#popok,[role="dialog"],[role="alertdialog"],.layui-layer-dialog,.el-message-box,.modal')));
const platformButton = dialogs.find((el) => el.id === 'popok' && visible(el));
if (platformButton) {
const message = clean(platformButton.ownerDocument.querySelector('#popcontent')?.innerText);
if (/未作答|请选择|请作答|答完/.test(message) || !/提交|交卷/.test(message))
throw new Error(`平台拒绝提交：${message}`);
console.log(`确认平台提交窗口：${message || '提交'}`);
platformButton.click();
return;
}
const dialog = dialogs.find((el) => el.id !== 'popok' && visible(el) && /提交|交卷/.test(clean(el.innerText)));
if (dialog) {
const confirm = findButton(dialog, '确定') || findButton(dialog, '确认') || findButton(dialog, '提交');
if (!confirm) throw new Error('提交确认窗口未找到确认按钮');
confirm.click();
return;
}
await sleep(250);
}
}

async function submitQuiz(doc) {
if (stopped) throw new Error('脚本已停止');
const submit = findButton(doc, '提交');
if (!submit) throw new Error('未找到测验提交按钮');
submit.scrollIntoView({ block: 'center' });
console.log('选项已选择，点击章节测验的提交按钮');
submit.click();
await confirmSubmitDialog();
console.log('提交已确认，等待学习通生成成绩或任务完成标记；确认后再点击“下一节”');
let elapsedHalfSeconds = 0;
while (!stopped && elapsedHalfSeconds < 240) {
await sleep(500);
elapsedHalfSeconds++;
if (quizCompleted()) return;
if (elapsedHalfSeconds % 30 === 0) console.log(`成绩页仍在加载，已等待 ${elapsedHalfSeconds / 2} 秒`);
}
throw new Error('提交结果未在120秒内确认，请人工检查，禁止重复提交');
}

async function goToNextStep() {
if (stopped) throw new Error('脚本已停止');
if(app.chapterFlow?.beforeAdvance({quizDone:quizCompleted()}))return;
const next = findNextButton();
if (!next) throw new Error('未找到页面下方的“下一节”按钮');
app._nextUnitPending = true;
const previousStep = app._currentStepTitle();
const previousIdentity = stepIdentity();
app._clearCheckInterval();
app._videoEl = null;
app._isPlaying = false;
next.scrollIntoView({ block: 'center' });
console.log(`${previousStep || '当前学习步骤'}完成，点击页面“下一节”，等待新内容加载`);
next.click();
let currentStep = '';
let stepReady = false;
for (let attempt = 0; attempt < 240; attempt++) {
if (stopped) throw new Error('脚本已停止');
await sleep(500);
currentStep = app._currentStepTitle();
if (currentStep !== previousStep && currentStep === '章节测验') {
stepReady = true;
break;
}
if((currentStep!==previousStep||stepIdentity()!==previousIdentity)&&app.chapterFlow?.isReadableStep()){stepReady=true;break;}
if ((currentStep !== previousStep || stepIdentity() !== previousIdentity) && currentStep === '视频') {
app._videoEl = null;
if (app._getVideoEl()) {
stepReady = true;
break;
}
}
if (attempt > 0 && attempt % 30 === 0) console.log(`下一学习步骤仍在加载，已等待 ${attempt / 2} 秒；当前页签：${currentStep || '未显示'}`);
}
if (!stepReady) {
throw new Error(`点击“下一节”后等待 120 秒，新学习步骤仍未加载完成；当前页签：${currentStep || '未显示'}`);
}
app._nextUnitPending = false;
app._videoEl = null;
app._initCellData();
if(app._currentStepTitle()==='视频') setStatus('播放中：'+app.cellData.currentVideoTitle);
app.play();
}

app.nextUnit = function () {
if (stopped || this._nextUnitPending) return;
this._nextUnitPending = true;
goToNextStep().catch((error) => {
this._nextUnitPending = false;
app.quizFailure=error.message;setStatus(error.message);stopped=true;originalDestroy();
console.error('切换下一学习步骤失败:', error);
});
};

app.inspectQuiz = function () {
return extractQuestions().map((q, i) => ({
id: i + 1, type: q.kind, question: q.title,
options: q.options.map((o) => `${o.letter}. ${o.text}`),
}));
};

app._advanceChapterTest = function () {
if (stopped || quizBusy) return;
quizBusy = true;
(async () => {
if (quizCompleted()) {
console.log('检测到当前章节测验已完成，点击“下一节”进入新视频');
await goToNextStep();
return;
}
console.log('已进入章节测验，等待题目和提交按钮加载');
const questions = await waitForQuizQuestions();
if (questions === null) {
console.log('检测到当前章节测验已完成，点击“下一节”进入新视频');
await goToNextStep();
return;
}
if (questions.length > 30) throw new Error('题目数量超过 30，已停止自动提交');
const docs = new Set(questions.map((q) => q.doc));
if (docs.size !== 1) throw new Error('题目跨多个框架，已停止自动提交');
const countText = clean(questions[0].doc.body.innerText).match(/题量\s*[:：]\s*(\d+)/);
if (countText && Number(countText[1]) !== questions.length)
throw new Error(`页面显示 ${countText[1]} 道题，脚本只识别 ${questions.length} 道，已停止提交`);
assertChapterOnly(questions[0].doc);
const identity=stepIdentity();
const signature=identity+'|'+questionKeys(questions);
const journal='codexQuiz:'+signature;
if(sessionStorage.getItem(journal)==='submitting') throw new Error('上次提交结果未确认，请人工检查，本次不重复提交');
if (attemptedQuizzes.has(signature)) throw new Error('本次测验已尝试过，已停止重复提交');
console.log(`识别到 ${questions.length} 道题，正在调用 Codex`);
const answers = await answerWithReview(questions,{ask:askCodex,validate:validateAnswers,isCurrent:()=>!stopped&&identity===stepIdentity()&&questions.every(q=>courseDocuments().includes(q.doc)),setStatus});
if(stopped || identity!==stepIdentity() || questions.some(q=>!q.card.isConnected || !courseDocuments().includes(q.doc))) throw new Error('等待期间章节已变化，本次不提交');
assertChapterOnly(questions[0].doc);
console.table(questions.map((q, i) => ({ 题号: i + 1, 题型: q.kind, 选择: answers.get(i + 1).join('') })));
await selectAnswers(questions, answers);
if(stopped || identity!==stepIdentity() || questions.some((q,i)=>!courseDocuments().includes(q.doc) || selectedLetters(q).join('')!==[...answers.get(i+1)].sort().join(''))) throw new Error('提交前页面或选项已变化，本次未提交');
assertChapterOnly(questions[0].doc);
attemptedQuizzes.add(signature);
sessionStorage.setItem(journal,'submitting');
setStatus('正在提交章节测验');
await submitQuiz(questions[0].doc);
sessionStorage.setItem(journal,'complete');
app.lastQuizResult={chapter:app.cellData.currentVideoTitle,score:courseDocuments().map(d=>clean(d.body?.innerText)).join(' ').match(/本次成绩\s*(\d+(?:\.\d+)?)/)?.[1] || null};
await bridgeRequest('/event',{kind:'quiz_completed',...app.lastQuizResult},5000).catch(()=>{});
setStatus('章节测验已完成，继续下一节');
console.log('章节测验提交已确认，点击“下一节”进入新视频');
quizBusy = false;
await goToNextStep();
})().catch((error) => {
app._nextUnitPending = false;
app.quizFailure=error.message;setStatus(error.message);
stopped=true; originalDestroy();
console.error('章节测验自动作答停止:', error);
})
.finally(() => { quizBusy = false; });
};

}
function initializePlayer() {
const app = {
configs: {
autoplay: true,
retryInterval: 2000,
maxRetries: 10,
videoCheckInterval: 1000,
guardNoProgressMs: 7000,
guardResumeCooldownMs: 1500,
autoAdvanceNoVideo: false,
},
_videoEl: null,
_treeContainerEl: null,
_isPlaying: false,
_currentRetryCount: 0,
_checkInterval: null,
_eventVideoEl: null,
_boundVideoHandlers: null,
_nextUnitPending: false,
_chapterAdvanceTimes: 0,
_cellData: {
cells: 0,
nCells: 0,
currentCellIndex: 0,
currentNCellIndex: 0,
currentVideoTitle: "",
},
get cellData() {
return this._cellData;
},
run() {
console.log("%c=== 学习通视频与章节测验助手 V4 启动 ===", "color:#4CAF50;font-size:16px;font-weight:bold");
this._nextUnitPending = false;
this._chapterAdvanceTimes = 0;
this._getTreeContainer();
this._initCellData();
console.log(`当前学习步骤：${this._currentStepTitle() || '等待页面加载'}`);
this._videoEl = null;
this._getVideoEl();
this._clearCheckInterval();
this._bindStepNavigation();
this.play();
},
nextUnit() {
if (this._nextUnitPending) {
console.warn('%c已有小节切换正在进行，忽略重复请求', 'color:#FF9800');
return;
}
this._nextUnitPending = true;
this._clearCheckInterval();
console.log("%c=== 准备切换到下一小节 ===", "color:#2196F3;font-size:14px");
try {
const el = this._getTreeContainer();
const cells = el.children("ul").children("li");
const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
if (nCells.length > this._cellData.currentNCellIndex + 1) {
const nextNIndex = this._cellData.currentNCellIndex + 1;
console.log(`%c切换到同章节下一个视频: ${nextNIndex + 1}/${nCells.length}`, "color:#FF9800");
this.playCurrentIndex(nCells.get(nextNIndex));
} else {
const nextIndex = this._cellData.currentCellIndex + 1;
if (nextIndex >= cells.length) {
console.log("%c=====================================", "color:#4CAF50;font-size:16px");
console.log("%c==============本课程学习完成了==============", "color:#4CAF50;font-size:16px;font-weight:bold");
console.log("%c=====================================", "color:#4CAF50;font-size:16px");
return;
}
console.log(`%c切换到下一个章节: ${nextIndex + 1}/${cells.length}`, "color:#FF9800");
this._cellData.currentCellIndex = nextIndex;
this._cellData.currentNCellIndex = 0;
this.playCurrentIndex();
}
} catch (error) {
this._nextUnitPending = false;
console.error('切换下一小节失败:', error);
}
},
_clearCheckInterval() {
if (this._checkInterval) {
clearInterval(this._checkInterval);
this._checkInterval = null;
}
},
_startVideoMonitoring() {
this._clearCheckInterval();
this._guardLastTime = 0;
this._guardLastWallTs = 0;
this._guardLastResumeTs = 0;
this._checkInterval = setInterval(() => {
this._checkVideoStatus();
}, this.configs.videoCheckInterval);
},
_tryResumePlayback(reason) {
if(videoQuestions?.isBlocking())return;
const now = Date.now();
if (now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs) {
return;
}
this._guardLastResumeTs = now;
const video = this._getVideoEl();
if (!video || !this._isPlaying) return;
video.muted = true;
video.defaultMuted = true;
video.volume = 0;
console.log(`%c触发视频保活恢复(${reason})`, "color:#607D8B");
video.play().catch((e) => {
if(videoQuestions?.isBlocking())return;
console.warn("直接恢复播放失败，尝试静音恢复:", e);
video.muted = true;
video.play().catch((err) => {
console.error("静音恢复播放失败:", err);
});
});
},
_checkVideoStatus() {
if(videoQuestions?.isBlocking())return;
try {
if(this._isChapterTest()) {this._isPlaying=false;this._clearCheckInterval();this._advanceChapterTest();return;}
const video = this._getVideoEl();
if (!video) return;
if (video !== this._eventVideoEl) { this._initCellData(); this.play(); return; }
video.muted = true;
video.defaultMuted = true;
video.volume = 0;
if (video.paused && this._isPlaying) {
console.log("%c检测到视频暂停，尝试恢复播放...", "color:#FF5722");
this._tryResumePlayback("paused");
} else if (this._isPlaying && !video.ended) {
const now = Date.now();
const current = Number(video.currentTime || 0);
if (this._guardLastWallTs === 0) {
this._guardLastWallTs = now;
this._guardLastTime = current;
} else {
const stalled = Math.abs(current - this._guardLastTime) < 0.01;
const stalledMs = now - this._guardLastWallTs;
if (stalled && stalledMs >= this.configs.guardNoProgressMs) {
this._tryResumePlayback("no-progress");
this._guardLastWallTs = now;
this._guardLastTime = Number(video.currentTime || 0);
} else if (!stalled) {
this._guardLastWallTs = now;
this._guardLastTime = current;
}
}
}
if (video.ended && this._isPlaying) {
console.log("%c检测到视频结束，准备切换下一个...", "color:#9C27B0");
this._isPlaying = false;
setTimeout(() => this.nextUnit(), 1000);
}
} catch (e) {
console.error("视频状态检查失败:", e);
}
},
_tryTimes: 0,
_stepAdvanceTimes: 0,
_stepSwitchAt: 0,
_stepSwitchPending: false,
_delayedNextUnitTimer: null,
_guardLastTime: 0,
_guardLastWallTs: 0,
_guardLastResumeTs: 0,
async play() {
try {
if(stoppedByUser()||videoQuestions?.isBlocking()) return;
if (this._isChapterTest()) {
this._videoEl = null;
this._isPlaying = false;
this._clearCheckInterval();
this._advanceChapterTest();
return;
}
if(this.chapterFlow?.isReadableStep()){this.chapterFlow.startReading();return;}
const el = this._getVideoEl();
if (el == null) {
if (this._currentStepTitle() === '视频') {
throw new Error('视频组件尚未加载完成');
}
if (this._advanceLearningStep()) {
console.log("%c当前不在视频页，已尝试切到下一学习步骤，2秒后重试", "color:#607D8B");
setTimeout(() => {
this.play();
}, 2000);
return;
}
if (this._isChapterTest()) {
this._advanceChapterTest();
return;
}
this._isPlaying = false;
this._clearCheckInterval();
if (this.configs.autoAdvanceNoVideo) {
console.warn('%c当前小节未发现视频，按配置切换到下一小节', 'color:#FF9800');
this.nextUnit();
} else {
console.warn('%c当前小节未发现视频或可识别的学习步骤，已安全停止。确认无需完成课件后，可执行 app.nextUnit()。', 'color:#FF9800');
}
return;
}
this._isPlaying = true;
this._videoEventHandle();
try {
el.muted = true;
el.defaultMuted = true;
el.volume = 0;
prepareChapterVideo(el);
await el.play();
this._tryTimes = 0;
console.log('%c视频开始播放，保持页面默认播放速度', 'color:#4CAF50');
this._startVideoMonitoring();
} catch (playError) {
console.error("视频播放失败:", playError);
this._handlePlayError(playError);
}
} catch (e) {
if (this._tryTimes >= this.configs.maxRetries) {
console.error("%c视频播放失败，已达到最大重试次数", "color:#F44336;font-weight:bold", e);
this._clearCheckInterval();
return;
}
this._tryTimes++;
console.log(`%c播放失败，${this.configs.retryInterval/1000}秒后重试 (${this._tryTimes}/${this.configs.maxRetries})`, "color:#FF9800");
setTimeout(() => {
this.play();
}, this.configs.retryInterval);
}
},
_advanceLearningStep() {
if (this._stepSwitchPending && Date.now() - this._stepSwitchAt < 4000) {
return true;
}
const currentStepTitle = this._currentStepTitle();

if (currentStepTitle === "章节测验" || currentStepTitle === "视频") {
return false;
}
const clickElement = (el, label) => {
if (!el) return false;
this._stepSwitchPending = true;
this._stepSwitchAt = Date.now();
console.log(`%c尝试点击${label}`, "color:#2196F3");
el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
return true;
};
const videoTab = $(".prev_white:visible").filter((_, el) => {
const text = ($(el).text() || "").replace(/\s+/g, "");
return text === "2视频" || text === "视频";
}).get(0);
if (clickElement(videoTab, "“视频”页签")) {
return true;
}
return false;
},
_currentStepTitle() {
const cardsFrame = Array.from(document.querySelectorAll('iframe[src*="/knowledge/cards"]'))
.find((frame) => frame.getClientRects().length > 0);
if (cardsFrame) {
const num = new URL(cardsFrame.getAttribute('src'), location.href).searchParams.get('num');
if (num === '0') return '视频';
if (num === '1') return '章节测验';
}
const prevTitle = document.getElementsByClassName('prev_title')[0];
const text = prevTitle ? (prevTitle.title || prevTitle.textContent || '').trim() : '';
return text === '视频' || text === '章节测验' ? text : '';
},
_isChapterTest() {
return this._currentStepTitle() === '章节测验';
},
_advanceChapterTest() {
if (this._chapterAdvanceTimes >= 3) {
console.error('%c章节测验页面连续跳转失败，已停止以避免页面循环。请手动处理后执行 app.run()。', 'color:#F44336;font-weight:bold');
return;
}
const nextButton = $('#prevNextFocusNext:visible, #right1:visible, .nextChapter:visible').first().get(0);
if (!nextButton) {
console.warn('%c未找到章节测验的下一步按钮，已停止。', 'color:#FF9800');
return;
}
this._chapterAdvanceTimes++;
console.log('%c检测到章节测验，尝试进入下一学习步骤', 'color:#607D8B');
nextButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
setTimeout(() => this.play(), 2000);
},
_bindStepNavigation() {
if (this._stepNavigationBound) {
return;
}
this._stepNavigationBound = true;
const reenterVideoMode = () => {
this._videoEl = null;
this._isPlaying = false;
this._stepSwitchPending = true;
this._stepSwitchAt = Date.now();
setTimeout(() => {
try {
this._initCellData();
} catch (e) {}
this.play();
}, 1800);
};
$(document).off('click.xuexitongPlayerV4', '.prev_white').on('click.xuexitongPlayerV4', '.prev_white', (e) => {
const text = ($(e.currentTarget).text() || "").replace(/\s+/g, "");
if (text.includes("视频") || text.includes("章节测验")) {
console.log(`%c检测到步骤切换点击：${text}，准备重新识别页面`, "color:#607D8B");
reenterVideoMode();
}
});
},
_handlePlayError(error) {
if(videoQuestions?.isBlocking())return;
console.error("播放错误详情:", error);
const video = this._getVideoEl();
if (video) {
video.muted = true;
video.play().then(() => {
console.log("%c静音播放成功", "color:#4CAF50");
this._tryTimes = 0;
this._startVideoMonitoring();
if (this._delayedNextUnitTimer) {
clearTimeout(this._delayedNextUnitTimer);
this._delayedNextUnitTimer = null;
}
}).catch(e => {
console.error("静音播放也失败:", e);
if (this._delayedNextUnitTimer) {
clearTimeout(this._delayedNextUnitTimer);
}
this._isPlaying = false;
if (this._tryTimes >= this.configs.maxRetries) {
console.error('%c静音播放失败，已达到最大重试次数', 'color:#F44336;font-weight:bold', e);
return;
}
this._tryTimes++;
this._delayedNextUnitTimer = setTimeout(() => {
this._delayedNextUnitTimer = null;
this.play();
}, this.configs.retryInterval);
});
}
},
playCurrentIndex(nCell) {
this._nextUnitPending = false;
if (!nCell) {
const el = this._getTreeContainer();
const cells = el.children("ul").children("li");
const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
nCell = nCells.get(this._cellData.currentNCellIndex);
}
const $nCell = $(nCell);
const clickableSpan = $nCell.find(".posCatalog_name")[0];
if (!clickableSpan) {
console.error("%c===========找不到可点击的课程节点，播放下一个视频失败==============", "color:#F44336");
return;
}
console.log(`%c点击切换到: ${$(clickableSpan).attr('title') || '未知标题'}`, "color:#2196F3");
$(clickableSpan).click();
this._videoEl = null;
this._isPlaying = false;
console.log("%c等待视频加载...", "color:#FF9800");
setTimeout(() => {
this._initCellData();
if (this.configs.autoplay) {
this.play();
}
}, 3000);
},
_initCellData() {
const el = this._getTreeContainer();
const cells = el.children("ul").children("li");
this._cellData.cells = cells.length;
let nCellCounts = 0;
let foundCurrent = false;
cells.each((i, v) => {
const nCells = $(v).find('.posCatalog_select:not(.firstLayer)');
nCellCounts += nCells.length;
nCells.each((j, e) => {
const _el = $(e);
if (_el.hasClass("posCatalog_active")) {
this._cellData.currentCellIndex = i;
this._cellData.currentNCellIndex = j;
foundCurrent = true;
const titleSpan = _el.find('.posCatalog_name')[0];
if (titleSpan) {
this._cellData.currentVideoTitle = $(titleSpan).attr('title');
}
}
});
});
this._cellData.nCells = nCellCounts;

if (!foundCurrent && nCellCounts > 0) {
console.warn("%c未找到当前激活的视频节点，可能需要手动选择", "color:#FF9800");
}
console.log(`%c课程信息: ${this._cellData.cells}章, ${this._cellData.nCells}节, 当前: 第${this._cellData.currentCellIndex + 1}章第${this._cellData.currentNCellIndex + 1}节`, "color:#607D8B");
},
_getTreeContainer() {
if (!this._treeContainerEl) {
const el = $('#coursetree');
if (el.length <= 0) {
throw new Error("找不到视频列表");
}
this._treeContainerEl = el;
}
return this._treeContainerEl;
},
            _isCurrentVideo(video) {
                try {
                    if (!video || !video.isConnected) return false;
                    const visible = (element) => {
                        if (!element.getClientRects().length) return false;
                        const style = element.ownerDocument.defaultView.getComputedStyle(element);
                        return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
                    };
                    if (!visible(video)) return false;
                    let owner = video.ownerDocument;
                    while (owner?.defaultView && owner.defaultView !== window) {
                        const view = owner.defaultView;
                        // isConnected can stay true in an iframe's discarded document.
                        if (view.document !== owner) return false;
                        const frame = view.frameElement;
                        if (!frame || !frame.isConnected || !visible(frame)) return false;
                        owner = frame.ownerDocument;
                    }
                    return owner === document;
                } catch (error) {
                    return false;
                }
            },
            _getVideoEl() {
                const candidates = new Set();
                const scan = (owner, depth) => {
                    if (!owner || depth > 4) return;
                    for (const video of owner.querySelectorAll('video#video_html5_api, video[id*="video_html5"]')) {
                        if (this._isCurrentVideo(video)) candidates.add(video);
                    }
                    for (const frame of owner.querySelectorAll('iframe')) {
                        try {
                            scan(frame.contentDocument || frame.contentWindow?.document, depth + 1);
                        } catch (error) {
                            // Unrelated cross-origin frames must not abort the player search.
                            if (error?.name !== 'SecurityError') console.warn('读取视频框架失败:', error);
                        }
                    }
                };
                scan(document, 0);
                this._videoEl = selectChapterVideo(candidates);
                return this._videoEl;
            },
_videoEventHandle() {
const el = this._videoEl;
if (!el) {
console.log("videoEl未加载");
return;
}
if (this._eventVideoEl === el) return;
this._detachVideoEvents();
this._eventVideoEl = el;
this._boundVideoHandlers = {
ended: this._handleVideoEnded.bind(this),
loadedmetadata: this._handleVideoLoaded.bind(this),
play: this._handleVideoPlay.bind(this),
pause: this._handleVideoPause.bind(this),
};
el.addEventListener('ended', this._boundVideoHandlers.ended);
el.addEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
el.addEventListener('play', this._boundVideoHandlers.play);
el.addEventListener('pause', this._boundVideoHandlers.pause);
},
_detachVideoEvents() {
if (!this._eventVideoEl || !this._boundVideoHandlers) return;
this._eventVideoEl.removeEventListener('ended', this._boundVideoHandlers.ended);
this._eventVideoEl.removeEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
this._eventVideoEl.removeEventListener('play', this._boundVideoHandlers.play);
this._eventVideoEl.removeEventListener('pause', this._boundVideoHandlers.pause);
this._eventVideoEl = null;
this._boundVideoHandlers = null;
},
_handleVideoEnded(e) {
if(e?.target && e.target !== this._getVideoEl()) return;
const title = this._cellData.currentVideoTitle;
console.warn(`%c============'${title}' 播放完成=============`, "color:#4CAF50;font-weight:bold");
this._isPlaying = false;
this._clearCheckInterval();
setTimeout(() => this.nextUnit(), 1000);
},
_handleVideoLoaded(e) {
if(e?.target && e.target !== this._getVideoEl()) return;
console.log(`%c============视频加载完成=============`, "color:#2196F3");
if (this.configs.autoplay && !this._isPlaying) {
this.play();
}
},
_handleVideoPlay(e) {
if(e?.target && e.target !== this._getVideoEl()) return;
const title = this._cellData.currentVideoTitle;
console.info(`%c============'${title}' 开始播放=============`, "color:#4CAF50");
this._isPlaying = true;
this._stepSwitchPending = false;
const video = this._getVideoEl();
this._guardLastTime = Number(video?.currentTime || 0);
this._guardLastWallTs = Date.now();
if (this._delayedNextUnitTimer) {
clearTimeout(this._delayedNextUnitTimer);
this._delayedNextUnitTimer = null;
}
},
_handleVideoPause(e) {
if(e?.target && e.target !== this._getVideoEl()) return;
console.log(`%c============视频暂停=============`, "color:#FF9800");
},
_bindPageGuards() {
const preventPause = (e) => {
e.stopPropagation();
e.preventDefault();
};
const resumePlaybackNow = () => this._tryResumePlayback('page-event');
this._pageGuards = { preventPause, resumePlaybackNow };
document.addEventListener('mouseleave', preventPause);
window.addEventListener('mouseleave', preventPause);
document.addEventListener('mouseout', preventPause);
window.addEventListener('mouseout', preventPause);
window.addEventListener('blur', resumePlaybackNow);
document.addEventListener('visibilitychange', resumePlaybackNow);
},
destroy() {
this._isPlaying = false;
this._clearCheckInterval();
this._detachVideoEvents();
if (this._delayedNextUnitTimer) clearTimeout(this._delayedNextUnitTimer);
$(document).off('.xuexitongPlayerV4');
if (this._pageGuards) {
const { preventPause, resumePlaybackNow } = this._pageGuards;
document.removeEventListener('mouseleave', preventPause);
window.removeEventListener('mouseleave', preventPause);
document.removeEventListener('mouseout', preventPause);
window.removeEventListener('mouseout', preventPause);
window.removeEventListener('blur', resumePlaybackNow);
document.removeEventListener('visibilitychange', resumePlaybackNow);
this._pageGuards = null;
}
},
};
attachQuizAutomation(app);
app.chapterFlow=createChapterFlowAdapter(app);
const destroyChapterApp=app.destroy;app.destroy=function(){app.chapterFlow.dispose();return destroyChapterApp.call(app);};
PAGE.app = app;
PAGE[APP_KEY] = app;

try {
app.run();
setStatus(app._isChapterTest()?'正在处理章节测验':'正常播放视频');
} catch (error) {
console.error("%c脚本运行失败: ", "color:#F44336;font-weight:bold", error.message);
console.log("请检查是否在正确的课程播放页面，或者页面结构是否再次发生改变。");
}
}
function enhanceStudyPanel(panel,statusText,monitorText,codexText,startButton,stopButton){
 if(typeof panel.attachShadow!=='function')return null;
 panel.__studyPanelCleanup?.();
 const doc=panel.ownerDocument,win=doc.defaultView,key='codexStudyPanelLayout';
 let saved={};try{const value=JSON.parse(win.localStorage.getItem(key)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))saved=value;}catch{}
 const root=panel.shadowRoot||panel.attachShadow({mode:'open'});root.replaceChildren();
 const style=doc.createElement('style');style.textContent=`
 :host{font:13px/1.5 "Segoe UI","Microsoft YaHei",sans-serif!important;color:#21324b!important}
 *{box-sizing:border-box} .card{background:#fff;border:1px solid #dbe4ef;border-radius:16px;box-shadow:0 8px 30px #172b4d24;overflow:hidden}
 header{display:flex;align-items:center;gap:9px;padding:12px 14px;cursor:grab;touch-action:none;background:#f6f9fd;user-select:none}
 strong{font-size:14px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.grip{color:#71839b;font-size:11px;white-space:nowrap}header.dragging{cursor:grabbing;background:#eaf2ff}header:focus-visible{outline:2px solid #3984ef;outline-offset:-3px} .badge{font-size:11px;color:#23734e;background:#e6f5ed;border-radius:20px;padding:2px 8px;white-space:nowrap}
 button{font:inherit;border:1px solid #dbe4ef;background:white;color:#35475f;border-radius:8px;padding:7px 12px;cursor:pointer}button:hover{background:#eef3fa}button:focus-visible{outline:2px solid #3984ef;outline-offset:2px}button:disabled{opacity:.45;cursor:default}
 .fold{border:0;padding:2px 7px;font-size:18px;background:transparent}.body{padding:14px}.status{font-size:14px;font-weight:600;overflow-wrap:anywhere;margin-bottom:10px}
 .track{height:5px;background:#eaf0f7;border-radius:5px;overflow:hidden}.fill{height:100%;background:#3e82ef;width:0%;transition:width .3s}
 .time{display:flex;justify-content:space-between;color:#677a91;font-size:12px;margin:5px 0 11px;font-variant-numeric:tabular-nums}
 .meta,.codex{font-size:12px;color:#64758b;line-height:1.7;overflow-wrap:anywhere}.codex{margin-top:5px}.actions{display:flex;gap:8px;margin-top:12px}.actions button{flex:1}.stop{color:#a44747}.compact .body{display:none}
 .attention .badge{background:#fff0dd;color:#98590c}.stopped .badge{background:#edf0f4;color:#64758b}
 `;
 const make=(tag,cls,text)=>{const e=doc.createElement(tag);e.className=cls;if(text)e.textContent=text;return e;};
 const card=make('section','card'),header=make('header',''),title=make('strong','','学习助手'),badge=make('span','badge','运行中'),fold=make('button','fold','−');
 const grip=make('span','grip','⠿ 拖动');header.tabIndex=0;header.setAttribute('aria-label','移动学习助手窗口：拖动标题栏，或用方向键移动');
 fold.type='button';fold.title='折叠面板';header.title='拖动调整位置，双击恢复默认位置';
 const body=make('div','body'),track=make('div','track'),fill=make('div','fill'),time=make('div','time'),elapsed=make('span','','等待播放'),percent=make('span'),actions=make('div','actions');
 for(const e of [statusText,monitorText,codexText,startButton,stopButton])e.removeAttribute('style');
 statusText.className='status';monitorText.className='meta';codexText.className='codex';stopButton.className='stop';
 startButton.textContent='继续';stopButton.textContent='停止';track.append(fill);time.append(elapsed,percent);actions.append(startButton,stopButton);body.append(statusText,track,time,monitorText,codexText,actions);header.append(grip,title,badge,fold);card.append(header,body);root.append(style,card);
 panel.style.cssText='position:fixed;z-index:2147483646;left:16px;bottom:16px;width:340px;max-width:calc(100vw - 24px);background:transparent;padding:0;border:0;box-shadow:none;';
 const persist=()=>{try{win.localStorage.setItem(key,JSON.stringify(saved));}catch{}};
 const clamp=()=>{if(!Number.isFinite(saved.x)||!Number.isFinite(saved.y))return;const r=panel.getBoundingClientRect();saved.x=Math.max(8,Math.min(saved.x,win.innerWidth-r.width-8));saved.y=Math.max(8,Math.min(saved.y,win.innerHeight-r.height-8));panel.style.left=saved.x+'px';panel.style.top=saved.y+'px';panel.style.bottom='auto';};
 const collapse=()=>{card.classList.toggle('compact',Boolean(saved.collapsed));fold.textContent=saved.collapsed?'+':'−';fold.title=saved.collapsed?'展开面板':'折叠面板';fold.setAttribute('aria-expanded',String(!saved.collapsed));clamp();};
 fold.onclick=()=>{saved.collapsed=!saved.collapsed;collapse();persist();};collapse();
 let drag=null;
 const endDrag=()=>{if(!drag)return;const id=drag.id;drag=null;card.classList.remove('dragging');header.classList.remove('dragging');try{if(header.hasPointerCapture(id))header.releasePointerCapture(id);}catch{}persist();};
 const moveDrag=e=>{if(!drag||e.pointerId!==drag.id)return;if(e.buttons===0){endDrag();return;}saved.x=e.clientX-drag.dx;saved.y=e.clientY-drag.dy;clamp();e.preventDefault();};
 header.onpointerdown=e=>{if(e.target.closest('button')||e.button!==0)return;const r=panel.getBoundingClientRect();drag={id:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top};header.classList.add('dragging');try{header.setPointerCapture(e.pointerId);}catch{}e.preventDefault();};
 const pointerEnd=e=>{if(drag&&e.pointerId===drag.id)endDrag();};
 win.addEventListener('pointermove',moveDrag,{capture:true,passive:false});
 win.addEventListener('pointerup',pointerEnd,true);win.addEventListener('pointercancel',pointerEnd,true);win.addEventListener('blur',endDrag);
 header.onlostpointercapture=endDrag;
 const resetPosition=()=>{endDrag();delete saved.x;delete saved.y;panel.style.left='16px';panel.style.top='auto';panel.style.bottom='16px';persist();};
 header.ondblclick=e=>{if(!e.target.closest('button'))resetPosition();};
 header.onkeydown=e=>{if(e.target!==header)return;const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(e.key==='Home'){e.preventDefault();resetPosition();return;}if(!delta)return;e.preventDefault();const r=panel.getBoundingClientRect(),step=e.shiftKey?40:10;saved.x=r.left+delta[0]*step;saved.y=r.top+delta[1]*step;clamp();persist();};
 const format=n=>{n=Math.max(0,Math.floor(n));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
 const update=()=>{const snap=win.__xuexitongMonitor?.snapshot();if(!snap)return;const p=snap.playback,mode=snap.mode;badge.textContent={starting:'启动中',running:'运行中',recovering:'恢复中',needs_attention:'需处理',stopped:'已停止',complete:'已完成'}[mode]||mode;card.classList.toggle('attention',mode==='needs_attention'||mode==='recovering');card.classList.toggle('stopped',mode==='stopped');
 if(Number.isFinite(p?.time)&&p.duration>0){const value=Math.max(0,Math.min(100,p.time/p.duration*100));fill.style.width=value+'%';elapsed.textContent=format(p.time)+' / '+format(p.duration);percent.textContent=Math.floor(value)+'%';if(mode==='running'&&!p.busy)statusText.textContent=p.title||p.chapter||'课程视频';}else{fill.style.width='0%';elapsed.textContent=p?.busy?'正在处理当前任务':'等待播放';percent.textContent='';}
 if(saved.collapsed)title.textContent=p?.title||'学习助手';else title.textContent='学习助手';
 };
 const safeUpdate=()=>{try{update();}catch{badge.textContent='状态更新中';}};
 win.addEventListener('resize',clamp);const timer=win.setInterval(safeUpdate,1000);safeUpdate();
 const observer=typeof win.ResizeObserver==='function'?new win.ResizeObserver(clamp):null;observer?.observe(panel);
 panel.__studyPanelCleanup=()=>{endDrag();win.clearInterval(timer);observer?.disconnect();win.removeEventListener('resize',clamp);win.removeEventListener('pointermove',moveDrag,true);win.removeEventListener('pointerup',pointerEnd,true);win.removeEventListener('pointercancel',pointerEnd,true);win.removeEventListener('blur',endDrag);win.removeEventListener('pagehide',panel.__studyPanelCleanup);};
 win.addEventListener('pagehide',panel.__studyPanelCleanup,{once:true});
 return {update,dispose:panel.__studyPanelCleanup};
}

enhanceStudyPanel(panel,statusText,monitorText,codexText,startButton,stopButton);

const queueArrival=courseQueue?.snapshot();
if(queueArrival?.enabled&&queueArrival.phase==='opening'&&queueArrival.expected===courseKeyFromUrl())sessionState.stopped=false;
saveSession();
if(sessionState.stopped){monitorStopped=true;monitorMode='stopped';setStatus('已停止，点击开始继续');renderMonitor();}else{waitForCoursePage();}
})();
