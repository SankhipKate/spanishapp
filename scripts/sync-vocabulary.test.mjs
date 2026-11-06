import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSnapshot} from './sync-vocabulary.mjs';

test('Recognizes Duolingo list and mirrors app vocabulary logic',()=>{
  const csv='Дубликаты,Перевод\n"hablar/hablo/hablas","говорить"\n"casa","дом"\n';
  const result=makeSnapshot(csv,null,new Date('2026-11-06T00:00:00Z'));
  assert.equal(result.count,2);
  assert.deepEqual(result.words,[{es:'hablar',ru:'говорить'},{es:'casa',ru:'дом'}]);
});

test('Fails closed on empty and HTML downloads',()=>{
  assert.throws(()=>makeSnapshot('<html>Login</html>'));
  assert.throws(()=>makeSnapshot('Дубликаты,Перевод\n'));
});

test('Protects against accidental deletion of existing vocabulary',()=>{
  const csv='Дубликаты,Перевод\n"casa","дом"\n';
  assert.throws(()=>makeSnapshot(csv,{count:100}),/decreased/);
});

test('Handles quoted commas and multiline CSV',()=>{
  const snapshot=makeSnapshot('Дубликаты,Перевод\n"qué pena","какая жалость, жаль"\n');
  assert.deepEqual(snapshot.words,[{es:'qué pena',ru:'какая жалость, жаль'}]);
});
