import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeShowCounts,showsByDay} from './show-counts.mjs';

const first={day:'2026-11-21',source_id:'a0000000-0000-4000-8000-000000000001',count:10};
const second={day:first.day,source_id:'a0000000-0000-4000-8000-000000000002',count:1};

test('daily shows add sessions and retry or import only the largest snapshot of each session',()=>{
 const counts=mergeShowCounts(new Map(),[first,second,{...first,day:'2026-11-22',count:4}]);
 mergeShowCounts(counts,[first,{...first,count:7},{...first,source_id:first.source_id.toUpperCase(),count:12}]);
 assert.deepEqual([...showsByDay(counts)],[['2026-11-21',13],['2026-11-22',4]]);
});

test('invalid counters in backup data are skipped',()=>{
 const counts=mergeShowCounts(new Map(),[null,{...first,count:-1},{...first,count:1.5},
   {...first,source_id:'invalid'},{...first,day:'2026-02-30'},first]);
 assert.deepEqual([...counts.values()],[first]);
});
