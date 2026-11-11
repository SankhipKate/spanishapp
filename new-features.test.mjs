import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,nextInSession,rateInSession,recordAssessment,searchKey} from './engine.mjs';

test('accent insensitive and substring search',()=>{
 for(const [query,word] of [['panuelo','pañuelo'],['panu','pañuelo'],['camion','camión'],['pinguino','pingüino'],['PINGUINO','pingüino']])
  assert.ok(searchKey(word).includes(searchKey(query)));
 assert.equal(searchKey('año'),searchKey('ano'));
});
test('extra practice only presents words not rated easy and ends once all are easy',()=>{
 const w=[{id:'a'},{id:'b'}],s=createSession(w,{},Date.now(),true,()=>0.7);
 while(s.queue.length){nextInSession(s);rateInSession(s,'hard');}
 for(let i=0;i<2;i++){assert.ok(nextInSession(s));rateInSession(s,'easy');}
 assert.equal(nextInSession(s),null);
});
test('additional practice retains scheduling fields but saves assessment timestamp',()=>{
 const previous={due:100,interval:7,ease:2.5,repetitions:4,lapses:1,updated:50,lastRating:'hard'};
 const result=recordAssessment(previous,'easy',200);
 for(const field of ['due','interval','ease','repetitions','lapses'])assert.equal(result[field],previous[field]);
 assert.equal(result.lastRating,'easy');assert.equal(result.updated,200);
});
