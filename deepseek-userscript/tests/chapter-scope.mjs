import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<iframe></iframe>',{url:'https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=101',runScripts:'outside-only'});
const w=dom.window;w.Element.prototype.getClientRects=()=>[{width:100,height:20}];
const doc=w.document.querySelector('iframe').contentDocument;
doc.defaultView.Element.prototype.getClientRects=()=>[{width:100,height:20}];
Object.defineProperty(doc,'URL',{value:'https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?knowledgeid=100',configurable:true});
doc.body.innerHTML='<section><h3>判断题</h3><p>上一小节题目。</p><label><input type="radio" name="q" value="A">A、对</label><label><input type="radio" name="q" value="B">B、错</label></section>';
const core=readFileSync(new URL('../quiz-core.cjs',import.meta.url),'utf8').replace('module.exports = createQuizCore();','');
const helper=readFileSync(new URL('../submit-helper.cjs',import.meta.url),'utf8').replace('module.exports = createSubmissionHelper;','');
w.eval(`${core}\n${helper}\nwindow.core=createQuizCore();window.submission=createSubmissionHelper({root:document,core:window.core,isEnabled:()=>true,onStatus(){}});`);
try{
 assert.equal(w.core.extractQuestions(w.document).length,0,'An old iframe still visible during navigation must not supply questions');
 doc.body.innerHTML='<p>章节测验 已完成 本次成绩 100 分 我的答案：A</p>';
 assert.equal(w.submission.completed(),false,'An old iframe grade must not complete the current chapter');
 Object.defineProperty(doc,'URL',{value:'https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?knowledgeid=101',configurable:true});
 assert.equal(w.submission.completed(),true);
 console.log('PASS: old chapter iframes cannot provide questions or completion evidence');
}finally{w.close();}
