const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../codex-helper.template.user.js'),'utf8');
const start=source.indexOf('function validateAnswers(',source.indexOf('function attachQuizAutomation(app)')),end=source.indexOf('async function confirmSubmitDialog()',start);
const card={isConnected:true};const doc={};let actual=[];
card.querySelectorAll=()=>[{name:'answer123',get value(){return actual.join('')}}];
const q={kind:'多选题',card,doc,options:['A','B','C'].map(letter=>({letter,element:{isConnected:true,scrollIntoView(){},click(){actual=actual.includes(letter)?actual.filter(l=>l!==letter):[...actual,letter]}}}))};
const helpers=vm.runInNewContext('(()=>{'+source.slice(start,end)+';return{validateAnswers,selectAnswers,selectedLetters}})()', {clean:x=>String(x).trim(),stopped:false,sleep:async()=>{},courseDocuments:()=>[doc]});
let pageText='章节测验 待完成 满分100分';
const completedStart=source.indexOf('function quizCompleted() {'),completedEnd=source.indexOf('function optionElements(',completedStart);
const isCompleted=vm.runInNewContext('(()=>{'+source.slice(completedStart,completedEnd)+'return quizCompleted})()', {app:{_currentStepTitle:()=> '章节测验'},clean:x=>x,courseDocuments:()=>[{body:{get innerText(){return pageText}}}]});
assert.equal(isCompleted(),false,'Video completion or full marks label does not prove quiz submission');
pageText='章节测验 已完成 本次成绩 100 分 我的答案：A';assert.equal(isCompleted(),true,'Require actual grade and submitted-answer evidence');
const valid=[{id:1,letters:['B','C'],confidence:'high'}];
const answers=helpers.validateAnswers([q],valid);
const judge={card:{querySelectorAll:()=>[{name:'answer456',value:'false'}]},options:['A','B'].map((letter,i)=>({letter,element:{querySelector:()=>({getAttribute:()=>i?'false':'true'})}}))};
assert.equal(helpers.selectedLetters(judge).join(''),'B','Judge boolean value maps to displayed option letter');
actual=['A','B'];
(async()=>{
await helpers.selectAnswers([q],answers);assert.equal(actual.sort().join(''),'BC','Unselect obsolete multi-choice and choose exact desired answers');
await helpers.selectAnswers([q],answers);assert.equal(actual.sort().join(''),'BC','Repeated selection must not toggle correct answers off');
assert.throws(()=>helpers.validateAnswers([q],[{id:1,letters:['B','B'],confidence:'high'}]));
assert.throws(()=>helpers.validateAnswers([q],[{id:1,letters:['D'],confidence:'high'}]));
assert.throws(()=>helpers.validateAnswers([q],[{id:1,letters:['B'],confidence:'low'}]));
const mapping={A:'D',B:'A',C:'C'};
for(const option of q.options){
option.element.querySelector=()=>({getAttribute:()=>mapping[option.letter]});
option.element.click=()=>{const key=mapping[option.letter];actual=actual.includes(key)?actual.filter(k=>k!==key):[...actual,key];};
}
actual=['D','A'];
await helpers.selectAnswers([q],answers);
assert.equal(actual.sort().join(''),'AC','Shuffled internal IDs map to displayed B/C');
await helpers.selectAnswers([q],answers);
assert.equal(actual.sort().join(''),'AC','Repeated shuffled selections remain stable');
actual=['B'];assert.throws(()=>helpers.selectedLetters(q),'Unknown internal option ID must stop submission');
q.card.isConnected=false;await assert.rejects(()=>helpers.selectAnswers([q],answers));
console.log('PASS: exact selection verification, idempotent checkbox handling, duplicate/unknown/uncertain answer rejection and page-change stop.');
})().catch(e=>{console.error(e);process.exitCode=1});
