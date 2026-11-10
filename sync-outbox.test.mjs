import test from 'node:test';
import assert from 'node:assert/strict';
import {missingCloudEvents} from './sync-outbox.mjs';
const key=e=>`${e.id}|${e.at}|${e.rating}|${!!e.extra}`;
const event=(id,at,rating='easy',extra=false)=>({id,at,rating,extra});
test('old missing events upload after a reconnect, without duplicating cloud events',()=>{
 const local=[event('a',1),event('b',2,'hard'),event('c',3),event('a',1)];
 const cloud=new Set([key(local[0])]);
 assert.deepEqual(missingCloudEvents(local,cloud,key),[local[1],local[2]]);
});
test('successful retry is idempotent',()=>{
 const local=[event('a',1),event('b',2)];
 const cloud=new Set([key(local[0])]);
 const first=missingCloudEvents(local,cloud,key);
 for(const e of first)cloud.add(key(e));
 assert.deepEqual(missingCloudEvents(local,cloud,key),[]);
});
test('corrections and extra practice remain distinct attempts',()=>{
 const local=[event('a',1,'easy'),event('a',2,'hard'),event('a',3,'easy',true)];
 assert.deepEqual(missingCloudEvents(local,new Set([key(local[0])]),key),local.slice(1));
});
test('malformed records are excluded',()=>{
 const good=event('a',1);
 assert.deepEqual(missingCloudEvents([null,{},event('b',2,'wrong'),{...good,at:NaN},good],new Set(),key),[good]);
});
test('source journal remains unchanged after a failed attempt',()=>{
 const local=[event('a',1),event('b',2,'hard')];
 const before=JSON.stringify(local);
 missingCloudEvents(local,new Set(),key);
 assert.equal(JSON.stringify(local),before);
});
