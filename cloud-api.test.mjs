import test from 'node:test';
import assert from 'node:assert/strict';
import {readApiResponse} from './cloud-api.mjs';
test('Supabase HTTP 201 empty body counts as successful insert', async()=>{
  assert.equal(await readApiResponse(new Response('',{status:201})), null);
});
test('Supabase HTTP 204 empty body counts as success', async()=>{
  assert.equal(await readApiResponse(new Response(null,{status:204})), null);
});
test('Supabase JSON read works', async()=>{
  assert.deepEqual(await readApiResponse(new Response('{"id":1}',{status:200})), {id:1});
});
test('Supabase error shows HTTP code and message', async()=>{
  await assert.rejects(()=>readApiResponse(new Response('{"message":"permission denied"}',{status:403})),/403: permission denied/);
});
