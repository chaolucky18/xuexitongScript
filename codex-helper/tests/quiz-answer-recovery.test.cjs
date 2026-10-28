const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const full=fs.readFileSync(require('node:path').join(__dirname,'../codex-helper.template.user.js'),'utf8');
const source=full.slice(full.indexOf('async function answerWithReview('),full.indexOf('function createVideoAnswerTools(){'));
const answer=vm.runInNewContext('('+source+')',{Map,Promise,setTimeout,Error});
const questions=()=>[0,1].map(i=>({id:i,card:{isConnected:true}}));
const uncertain=()=>new Error('第1题识别或作答不确定，本次未提交');
const base={isCurrent:()=>true,setStatus:()=>{},wait:async()=>{},validate:(q,raw)=>{
  if(raw.some(a=>a.confidence!=='high'))throw uncertain();return new Map(raw.map((a,i)=>[i+1,a.letters]));
}};
const high=letter=>({confidence:'high',letters:[letter]});
(async()=>{
 let calls=0;const q=questions();
 let result=await answer(q,{...base,ask:async qs=>{calls++;return qs.map(()=>high('A'));}});
 assert.equal(calls,1);assert.deepEqual(result.get(2),['A']);
 calls=0;const sizes=[];
 result=await answer(q,{...base,ask:async qs=>{sizes.push(qs.length);calls++;if(calls===1)throw uncertain();return [high(qs[0].id?'D':'B')];}});
 assert.deepEqual(sizes,[2,1,1]);assert.deepEqual(result.get(1),['B']);assert.deepEqual(result.get(2),['D']);
 calls=0;await assert.rejects(()=>answer(q,{...base,ask:async()=>{calls++;throw uncertain();}}),/两次单题复核仍不确定/);assert.equal(calls,3);
 calls=0;await assert.rejects(()=>answer(q,{...base,ask:async()=>{calls++;throw Error('提交结果未确认');}}),/提交结果未确认/);assert.equal(calls,1);
 calls=0;await assert.rejects(()=>answer(q,{...base,ask:async()=>{calls++;return [{confidence:'low'}];}}),/两次单题复核/);assert.equal(calls,3);
 let current=true;calls=0;
 await assert.rejects(()=>answer(q,{...base,isCurrent:()=>current,wait:async()=>{current=false;},ask:async()=>{calls++;throw uncertain();}}),/已变化或脚本已停止/);assert.equal(calls,1);
 const changed=questions();await assert.rejects(()=>answer(changed,{...base,ask:async()=>{changed[0].card.isConnected=false;return [high('A'),high('A')];}}),/已变化/);
 console.log('PASS: single batch, separate-question review, strict confidence, bounded failure, cancellation and stale DOM');
})().catch(e=>{console.error(e);process.exitCode=1});
