import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,nextInSession,rateInSession,scheduledReviews,dueCounts,recordRating} from './engine.mjs';

const words=(...ids)=>ids.map(id=>({id,ru:id,es:id}));
test('overdue and due today alternate with new words',()=>{
 const today=new Date(2026,10,13,12).getTime();
 const progress={r1:{due:new Date(2026,10,11,12).getTime()},r2:{due:today}};
 const session=createSession(words('r1','r2','n1','n2','n3'),progress,today,false,()=>0.999,{mode:'normal'});
 for(const id of ['r1','n1','r2','n2','n3']){
  assert.equal(nextInSession(session),id);
  rateInSession(session,'easy');
 }
 assert.equal(nextInSession(session),null);
 const schedule=scheduledReviews(words('r1','r2','n1','n2','n3'),progress,today);
 assert.equal(schedule.today+schedule.overdue,2);
 assert.equal(dueCounts(words('r1','r2','n1','n2','n3'),progress,today).due,2);
});
test('review counts decrease after future rating, but unknown stays due',()=>{
 const today=new Date(2026,10,13,12).getTime();
 const ws=words('r1');
 const original={due:new Date(2026,10,12,12).getTime()};
 assert.equal(dueCounts(ws,{r1:original},today).due,1);
 assert.equal(dueCounts(ws,{r1:recordRating(original,'easy',today)},today).due,0);
 assert.equal(dueCounts(ws,{r1:recordRating(original,'again',today)},today).due,1);
});
