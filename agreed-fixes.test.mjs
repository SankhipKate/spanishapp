import test from 'node:test';
import assert from 'node:assert/strict';
import {interleaveReviewsAndNew,createSession,scheduledReviews,dueCounts,recordRating} from './engine.mjs';

const words=(...ids)=>ids.map(id=>({id,ru:id,es:id}));
test('review/new interleave 1:1',()=>{
 assert.deepEqual(interleaveReviewsAndNew(['r1','r2','r3'],['n1','n2']),['r1','n1','r2','n2','r3']);
 assert.deepEqual(interleaveReviewsAndNew([],['n1','n2']),['n1','n2']);
 assert.deepEqual(interleaveReviewsAndNew(['r1'],[]),['r1']);
});
test('overdue and due today interleave with new words',()=>{
 const today=new Date(2026,10,13,12).getTime();
 const progress={r1:{due:new Date(2026,10,11,12).getTime()},r2:{due:today}};
 const session=createSession(words('r1','r2','n1','n2'),progress,today,false,()=>0.999,{mode:'normal'});
 assert.deepEqual(session.queue,['r1','n1','r2','n2']);
 const schedule=scheduledReviews(words('r1','r2','n1','n2'),progress,today);
 assert.equal(schedule.today+schedule.overdue,2);
 assert.equal(dueCounts(words('r1','r2','n1','n2'),progress,today).due,2);
});
test('review counts decrease after future rating, but unknown stays due',()=>{
 const today=new Date(2026,10,13,12).getTime();
 const ws=words('r1');
 const original={due:new Date(2026,10,12,12).getTime()};
 assert.equal(dueCounts(ws,{r1:original},today).due,1);
 assert.equal(dueCounts(ws,{r1:recordRating(original,'easy',today)},today).due,0);
 assert.equal(dueCounts(ws,{r1:recordRating(original,'again',today)},today).due,1);
});
