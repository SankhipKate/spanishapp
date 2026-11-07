import test from 'node:test';
import assert from 'node:assert/strict';
import {readAllRows} from './cloud-api.mjs';
import {dailyRatingStats} from './engine.mjs';

function paged(data,cap,calls=[]){return async path=>{
 const u=new URL(path,'https://example.test');calls.push(u);
 const offset=Number(u.searchParams.get('offset'));
 return data.slice(offset,offset+Math.min(cap,Number(u.searchParams.get('limit'))));
};}
test('loads 2186 events, preserving order, filters and all daily totals',async()=>{
 const data=Array.from({length:2186},(_,i)=>({id:`word-${i}`,at:new Date(2026,10,1+i%6,12).getTime(),rating:['again','hard','easy'][i%3]}));
 const calls=[];
 const result=await readAllRows(paged(data,1000,calls),'/rest/v1/review_history?user_id=eq.user&order=answered_at.asc,event_id.asc');
 assert.deepEqual(result,data);
 assert.deepEqual(dailyRatingStats(result),dailyRatingStats(data));
 assert.equal(calls.length,6);
 for(const u of calls){assert.equal(u.searchParams.get('user_id'),'eq.user');assert.equal(u.searchParams.get('order'),'answered_at.asc,event_id.asc');}
});
test('server cap below requested size still loads every row',async()=>{
 const data=Array.from({length:1101},(_,id)=>({id}));
 assert.deepEqual(await readAllRows(paged(data,200),'/rows?order=id.asc'),data);
});
test('empty dataset finishes immediately',async()=>{
 assert.deepEqual(await readAllRows(async()=>[],'/rows?order=id.asc'),[]);
});
test('later page failure rejects instead of returning incomplete success',async()=>{
 let n=0;await assert.rejects(readAllRows(async()=>{if(n++)throw Error('offline');return [{id:1}];},'/rows?order=id.asc'),/offline/);
});
test('repeated page and malformed response report an error',async()=>{
 await assert.rejects(readAllRows(async()=>[{id:1}],'/rows?order=id.asc'),/повторяет/);
 await assert.rejects(readAllRows(async()=>null,'/rows?order=id.asc'),/Некорректный/);
});
