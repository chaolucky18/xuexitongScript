import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
// Explicit reviewed preservation boundary: later approved planning/partial/UI
// additions are behavioral-tested in navigation-v3, not projected onto 2026's
// earlier controls snapshot. No runtime implementation is replaced by this test.
const ref='5ee97211889c93c402047eefac3bef90d40fb0e2';
const baseline=execFileSync('git',['show',ref+':v3_optimized.js'],{encoding:'utf8'}).replace(/\r\n/g,'\n');
const source=readFileSync(new URL('../v3_optimized.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
function method(text,name){const start=text.indexOf('            '+name+'(');assert.ok(start>=0,name+' exists');const rest=text.slice(start+13);const next=/^            [A-Za-z_][\w]*\(/m.exec(rest);assert.ok(next,name+' boundary');return text.slice(start,start+13+next.index);}
let checked=0;
for(const name of ['_tryResumePlayback','_bindPageGuards','_checkVideoStatus','_continueCompleted','_refreshVideoContext','_navigationEligible','_externalNavigationEligible','playCurrentIndex','_attachmentCredit','_mediaDone','_audioPlayRejected','_renderAudioNotice','_documentContextValid','_taskContextValid','_openNativeLink','_priorProof','_priorCompletionValid','_checkPriorCompletion','_runAction','_actionRule','_actionEnabled']){
 assert.equal(method(source,name),method(baseline,name),name+' frozen since reviewed '+ref);checked++;
}
for(const [begin,end] of [['    function documentViewer(','    const platformTaskAdapter'],['        function readDocument(','        return { createParent, installChild, readDocument'],['    function createTaskPacingCoordinator(','    // The native card is evidenced;'],['    function createUnattendedRecoveryCoordinator(','    function pacingCourse('],['            child(adapter) {','})(typeof unsafeWindow'],['        const bridgeProtocol =','        function readDocument(']]){
 assert.ok(source.includes(begin)&&source.includes(end)&&baseline.includes(begin)&&baseline.includes(end),begin+' boundaries exist');
 assert.equal(source.slice(source.indexOf(begin),source.indexOf(end,source.indexOf(begin))),baseline.slice(baseline.indexOf(begin),baseline.indexOf(end,baseline.indexOf(begin))),begin+' frozen');checked++;
}
assert.match(source,/get: \(\) => 1\.0/);assert.match(source,/if\(this\._partialSession\)return false/);
console.log('PASS: '+checked+' explicit frozen component comparisons; fixed 1.0x and independent partial navigation veto retained. Reviewed baseline '+ref);
