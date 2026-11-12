import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,nextInSession,rateInSession,recordAssessment,searchKey} from './engine.mjs';

test('accent insensitive and substring search',()=>{
 for(const [query,word] of [['panuelo','pañuelo'],['panu','pañuelo'],['camion','camión'],['pinguino','pingüino'],['PINGUINO','pingüino']])
  assert.ok(searchKey(word).includes(searchKey(query)));
 assert.equal(searchKey('año'),searchKey('ano'));
});
test('postpractice only presents hard/again words and ends once all are easy',()=>{
 const words=[{id:'a'},{id:'b'}];
 const progress={a:{lastRating:'hard',due:0},b:{lastRating:'again',due:0}};
 const session=createSession(words,progress,Date.now(),false,()=>0.7,{mode:'post',poolWords:words});
 const presented=[];
 for(let i=0;i<2;i++){
  const id=nextInSession(session);
  assert.ok(id);
  presented.push(id);
  const result=rateInSession(session,'easy');
  assert.equal(result.extra,true);
 }
 assert.equal(new Set(presented).size,2);
 assert.equal(nextInSession(session),null);
});
test('additional practice retains scheduling fields but saves assessment timestamp',()=>{
 const previous={due:100,interval:7,ease:2.5,repetitions:4,lapses:1,updated:50,lastRating:'hard'};
 const result=recordAssessment(previous,'easy',200);
 for(const field of ['due','interval','ease','repetitions','lapses'])assert.equal(result[field],previous[field]);
 assert.equal(result.lastRating,'easy');assert.equal(result.updated,200);
});
