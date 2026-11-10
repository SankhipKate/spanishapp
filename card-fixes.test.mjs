import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,copySession,nextInSession,rateInSession,recordRating,todayTrainingStats} from './engine.mjs';

test('rewind keeps queue and permits a different rating',()=>{
 const words=['a','b','c'].map(id=>({id}));
 const session=createSession(words,{},1000,false,()=>0);
 const first=nextInSession(session);
 const before=copySession(session);
 rateInSession(session,'easy');
 const next=nextInSession(session);
 const rewound=copySession(before);
 assert.equal(nextInSession(rewound),first);
 rateInSession(rewound,'hard');
 assert.equal(nextInSession(rewound),next);
 assert.deepEqual([...session.queue],[...rewound.queue]);
});
test('changing easy to hard recalculates from prior progress, not the accidental rating',()=>{
 const base=recordRating(undefined,'hard',1000);
 const mistaken=recordRating(base,'easy',2000);
 const revised=recordRating(base,'hard',2001);
 assert.equal(revised.lastRating,'hard');
 assert.notEqual(revised.interval,mistaken.interval);
});
test('latest correcting event supersedes prior rating in daily statistics',()=>{
 const now=Date.now();const history=[{id:'a',at:now-5,rating:'easy'},{id:'a',at:now,rating:'hard'}];
 assert.deepEqual(todayTrainingStats(history,now),{reviewed:1,again:0,hard:1,easy:0});
});
