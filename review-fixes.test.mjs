import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createSession,copySession,nextInSession,rateInSession,
 recordRating,recordAssessment,dueCounts,todayTrainingStats
} from './engine.mjs';
import {mergeFlagMaps} from './word-flags.mjs';

test('rewind in extra practice restores the previous rating and queue',()=>{
 const baseline=recordRating(null,'hard',1000);
 const progress={a:baseline};
 const s=createSession([{id:'a'}],progress,2000,true,()=>0.5);
 assert.equal(nextInSession(s),'a');
 const before=copySession(s);
 const first=rateInSession(s,'easy');
 assert.equal(first.extra,true);
 assert.equal(nextInSession(s),null);
 const rewound=copySession(before);
 assert.equal(nextInSession(rewound),'a');
 const corrected=rateInSession(rewound,'hard');
 assert.equal(corrected.extra,true);
 assert.equal(nextInSession(rewound),'a');
});

test('correcting extra practice preserves all scheduling parameters',()=>{
 const previous=recordRating(null,'easy',1000);
 const mistaken=recordAssessment(previous,'easy',2000);
 const corrected=recordAssessment(previous,'hard',2001);
 for(const key of ['due','interval','ease','repetitions','lapses']){
  assert.equal(corrected[key],previous[key]);
 }
 assert.equal(mistaken.lastRating,'easy');
 assert.equal(corrected.lastRating,'hard');
 assert.equal(corrected.updated,2001);
});

test('latest assessment updates overall and daily statistics',()=>{
 const initial=recordRating(null,'hard',1000);
 const latest=recordAssessment(initial,'easy',2000);
 assert.equal(latest.lastRating,'easy');
 assert.equal(latest.due,initial.due);
 const now=Date.now();
 const history=[
  {id:'a',at:now-100,rating:'hard'},
  {id:'a',at:now,rating:'easy',extra:true}
 ];
 assert.deepEqual(todayTrainingStats(history,now),
  {reviewed:1,again:0,hard:0,easy:1});
});

test('mastered words stay in dictionary but leave scheduling totals',()=>{
 const words=[{id:'a'},{id:'b'},{id:'c'}];
 const progress={
  a:recordRating(null,'hard',1000),
  b:recordRating(null,'easy',1000)
 };
 const flags={b:{mastered:{enabled:true,at:10}}};
 const active=words.filter(w=>!flags[w.id]?.mastered?.enabled);
 const counts=dueCounts(active,progress,2000);
 assert.equal(words.length,3);
 assert.equal(active.length,2);
 assert.equal(counts.new,1);
 assert.equal(active.length-counts.new,1);
 assert.equal(words.length-active.length,1);
});

test('mastered flag sync respects the newest activation or removal',()=>{
 const local={a:{mastered:{enabled:true,at:10}}};
 const olderRemote={a:{mastered:{enabled:false,at:9}}};
 assert.equal(
  mergeFlagMaps(local,olderRemote).a.mastered.enabled,true
 );
 const newerRemote={a:{mastered:{enabled:false,at:11}}};
 assert.equal(
  mergeFlagMaps(local,newerRemote).a.mastered.enabled,false
 );
});
