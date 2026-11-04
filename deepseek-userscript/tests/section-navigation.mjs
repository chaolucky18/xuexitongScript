import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
const require=createRequire(import.meta.url);
const createNavigation=require('../section-navigation.cjs');
function setup({autoNavigate = false} = {}){
 const dom=new JSDOM('<div id="coursetree"><div class="posCatalog_select posCatalog_active" id="cur101"><span class="posCatalog_name">Current</span></div><div class="posCatalog_select" id="cur102"><span class="posCatalog_name">Next</span></div><div class="posCatalog_select" id="cur103"><span class="posCatalog_name">Third</span></div></div><iframe></iframe>',{url:'https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=101'});
 const w=dom.window;let now=0,clicks=0,plays=0,active=true;
 const target=w.document.querySelector('#cur102 .posCatalog_name');
 target.onclick=()=>{clicks++;if(autoNavigate)w.history.replaceState({}, '', '?chapterId=102');};
 w.document.querySelector('#cur103 .posCatalog_name').onclick=()=>{
  clicks++;if(autoNavigate)w.history.replaceState({}, '', '?chapterId=103');
 };
 const core={visible:()=>true,documents:()=>[w.document]};
 const nav=createNavigation({root:w.document,core,isActive:()=>active,now:()=>now,onStatus(){},onVideo:()=>plays++});
 return {w,nav,target,get clicks(){return clicks},get plays(){return plays},tick(ms=0){now+=ms;nav.observe()},stop(){active=false;nav.reset()},close(){w.close()}};
}
{
 const p=setup();p.nav.start();assert.equal(p.clicks,1);p.tick(7999);assert.equal(p.clicks,1);p.tick(1);assert.equal(p.clicks,2,'Retry the same target when first click did not navigate');
 p.w.history.replaceState({},'', '?chapterId=102');p.w.document.querySelector('#cur101').classList.remove('posCatalog_active');p.w.document.querySelector('#cur102').classList.add('posCatalog_active');
 p.tick();assert.equal(p.plays,0,'Wait for destination video rather than use the old iframe');p.w.document.body.appendChild(p.w.document.createElement('video'));p.tick();assert.equal(p.plays,1);p.tick(10000);assert.equal(p.clicks,2,'Do not skip another section after success');p.close();
}
{
 const p=setup();p.nav.start();p.stop();p.tick(10000);assert.equal(p.clicks,1,'Stop cancels retries');p.close();
}
{
 const p=setup();p.nav.start();p.w.history.replaceState({},'', '?chapterId=999');p.tick(10000);assert.equal(p.clicks,1,'Manual navigation cancels old target');p.close();
}
{
 const p=setup({autoNavigate:true});p.nav.start();p.tick();
 assert.equal(p.clicks,1);
 p.nav.start();assert.equal(p.clicks,1,'An arrived destination still waits for its video');
 p.nav.start({supersedeArrived:true});
 assert.equal(p.clicks,2,'A completed review page can hand navigation to the following section');
 assert.match(p.w.location.search,/chapterId=103/);
 p.close();
}
{
 const p=setup();p.nav.start();for(let i=0;i<8;i++)p.tick(8000);assert.equal(p.clicks,3,'Retries must be bounded');p.close();
}
{
 const p=setup();p.nav.start();p.w.history.replaceState({},'', '?chapterId=102');p.tick();
 p.w.history.replaceState({},'', '?chapterId=101');p.tick(10000);assert.equal(p.clicks,1,'Returning to source after arrival cancels navigation');p.close();
}
{
 const p=setup();const doc=p.w.document;let headers=0,lessons=0;
 doc.querySelector('#coursetree').innerHTML='<ul><li><div class="posCatalog_select posCatalog_active" id="cur101"><span class="posCatalog_name">Previous</span></div></li><li><div class="posCatalog_select" id="cur200"><span class="posCatalog_name">Group</span></div><ul><li><div class="posCatalog_select" id="cur201"><span class="posCatalog_name">First lesson</span></div></li></ul></li></ul>';
 doc.querySelector('#cur200 .posCatalog_name').onclick=()=>headers++;
 doc.querySelector('#cur201 .posCatalog_name').onclick=()=>lessons++;
 p.nav.start();assert.equal(headers,0,'A group heading with a sibling UL must not be selected as the next lesson');assert.equal(lessons,1);p.close();
}
console.log('PASS: failed click retries same target, waits for destination video, stop/manual navigation cancel, retries bounded');
