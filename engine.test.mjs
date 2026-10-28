import test from 'node:test';import assert from 'node:assert/strict';
import {parseCSV,toWords,recordRating,createSession,nextInSession,rateInSession,parseSheetUrl,dueCounts,compareLetters} from './engine.mjs';
test('quoted commas and line breaks in CSV',()=>{const rows=parseCSV('Русский,Испанский\n"красивый, милый","lindo, bonito"\n"строка\n2",casa');assert.equal(rows[1][0],'красивый, милый');assert.equal(rows[2][0],'строка\n2');});
test('header mapping and persistent IDs',()=>{const words=toWords([['ES','ID','RU'],['casa','one','дом']]);assert.deepEqual(words,[{id:'id:one',ru:'дом',es:'casa'}]);});
test('Google sheet URL recognizes gid in fragment',()=>assert.equal(parseSheetUrl('https://docs.google.com/spreadsheets/d/abc_123/edit#gid=456').gid,'456'));
test('missed word returns after five other answers, including a second miss',()=>{
 const words=['A','B','C','D','E','F','G','H','I','J','K','L'].map(id=>({id,ru:id,es:id}));const q=createSession(words,{},1000,false,()=>0.999);
 assert.equal(nextInSession(q),'A');rateInSession(q,'again');
 for(let i=0;i<5;i++){assert.equal(nextInSession(q),words[i+1].id);rateInSession(q,'easy');}
 assert.equal(nextInSession(q),'A');rateInSession(q,'again');
 for(let i=0;i<5;i++){assert.equal(nextInSession(q),words[i+6].id);rateInSession(q,'easy');}
 assert.equal(nextInSession(q),'A');rateInSession(q,'hard');assert.equal(nextInSession(q),'L');
});
test('hard and easy have distinct intervals; again is due now',()=>{const now=100000;const hard=recordRating(null,'hard',now),easy=recordRating(null,'easy',now),again=recordRating(null,'again',now);assert.ok(hard.due<easy.due);assert.equal(again.due,now);assert.equal(dueCounts([{id:'a',ru:'a',es:'a'}],{a:again},now).due,1);});
test('extra practice does not request a scheduled update for successful answers',()=>{const s=createSession([{id:'a'}],{},1000,true);nextInSession(s);rateInSession(s,'easy');assert.equal(nextInSession(s),'a');const result=rateInSession(s,'easy');assert.equal(result.save,false);});

test('existing Google columns map Spanish A to Russian B and first verb form only',()=>{
 const words=toWords([['Дубликаты','Перевод'],['abrir/abro/abres/abre','открывать'],['a la derecha','справа']]);
 assert.equal(words.length,2);assert.equal(words[0].es,'abrir');assert.equal(words[0].ru,'открывать');assert.equal(words[1].es,'a la derecha');
});
test('fallback for arbitrary two-column header uses A as Spanish',()=>{
 const words=toWords([['Palabra','Meaning'],['vivir/vivo/vivís','жить']]);
 assert.equal(words[0].es,'vivir');assert.equal(words[0].ru,'жить');
});

test('new and due words are randomized independently of their source order',()=>{
 const words=['A','B','C','D','E','F'].map(id=>({id,ru:id,es:id}));
 const progress={A:{due:0},B:{due:0}};
 const s=createSession(words,progress,1000,false,()=>0);
 assert.deepEqual(s.queue.slice(0,2),['B','A']);
 assert.notDeepEqual(s.queue.slice(2),['C','D','E','F']);
 assert.equal(new Set(s.queue).size,words.length);
});
test('extra practice shuffles each pass and avoids same word across pass boundary',()=>{
 const s=createSession(['A','B','C','D'].map(id=>({id})),{},1000,true,()=>0);
 for(let i=0;i<4;i++){nextInSession(s);rateInSession(s,'easy');}
 const first=[];for(let i=0;i<4;i++){first.push(nextInSession(s));rateInSession(s,'easy');}
 assert.equal(new Set(first).size,4);
 const next=nextInSession(s);assert.notEqual(next,first.at(-1));
});

test('letter highlighting ignores accents and marks missing letters',()=>{assert.ok(compareLetters('arbol','árbol').input.every(x=>!x.error));assert.ok(compareLetters('csa','casa').answer.some(x=>x.error));});

import {recoverLegacyProgress} from './engine.mjs';
test('legacy migration retains earliest available last-review days and per-word minimums',()=>{
 const x=recoverLegacyProgress({a:{updated:Date.parse('2026-10-26T10:00:00Z'),lastRating:'hard'},b:{updated:Date.parse('2026-10-27T10:00:00Z'),lastRating:'easy'}});
 assert.equal(x.minimumAnswers,2);
 assert.equal(x.ratings.hard,1);
 assert.equal(x.days.length,2);
});
test('migration excludes already logged latest event',()=>{
 const at=Date.parse('2026-10-26T10:00:00Z');
 const x=recoverLegacyProgress({a:{updated:at,lastRating:'easy'},b:{updated:at+10,lastRating:'hard'}},[{id:'a',at,rating:'easy'}]);
 assert.equal(x.words,1);
});

import {isDueOnCalendarDay,scheduledReviews} from './engine.mjs';
test('scheduled later today is visible and in the training queue now',()=>{
 const now=new Date(2026,9,27,9,0).getTime();
 const later=new Date(2026,9,27,22,0).getTime();
 const words=[{id:'hard',ru:'трудно',es:'difícil'}], progress={hard:{due:later}};
 assert.equal(isDueOnCalendarDay(later,now),true);
 assert.equal(dueCounts(words,progress,now).due,1);
 assert.equal(scheduledReviews(words,progress,now).today,1);
 assert.equal(createSession(words,progress,now,false).queue[0],'hard');
});
test('overdue entries are included in due counters and today listing',()=>{
 const now=new Date(2026,9,27,13,0).getTime();
 const yesterday=new Date(2026,9,26,23,50).getTime();
 const tomorrow=new Date(2026,9,28,1,0).getTime();
 const words=['old','future'].map(id=>({id}));
 const progress={old:{due:yesterday},future:{due:tomorrow}};
 const v=scheduledReviews(words,progress,now);
 assert.equal(v.overdue,1);assert.equal(v.today,0);
 assert.equal(v.dates.length,1);assert.equal(dueCounts(words,progress,now).due,1);
});

test('continuous training includes future-due words in extra practice instead of auto finishing',()=>{
 const words=[{id:'a'},{id:'b'}],now=Date.now();
 const progress={a:{due:now+86400000*3},b:{due:now+86400000*4}};
 const session=createSession(words,progress,now,true,()=>0.4);
 const first=nextInSession(session);assert.ok(words.some(x=>x.id===first));
 const out=rateInSession(session,'easy');assert.equal(out.save,false);
 assert.ok(nextInSession(session));
});

test('headerless spreadsheet includes first word and first two columns',()=>{
 const words=toWords([['a la derecha','справа'],['abrir/abro/abres','открывать'],['actor','актёр']]);
 assert.equal(words.length,3);
 assert.deepEqual(words.map(w=>w.es),['a la derecha','abrir','actor']);
 assert.equal(words[0].ru,'справа');
});

import {todayTrainingStats} from './engine.mjs';
test("todayTrainingStats counts only today’s distinct words and latest rating",()=>{
 const now=new Date(2026,9,27,18,0).getTime();
 const t=(day,h)=>new Date(2026,9,day,h).getTime();
 const out=todayTrainingStats([
  {id:'a',at:t(26,14),rating:'hard'},
  {id:'a',at:t(27,10),rating:'again'},
  {id:'b',at:t(27,11),rating:'hard'},
  {id:'a',at:t(27,12),rating:'easy'},
  {id:'c',at:t(27,13),rating:'again'}
 ],now);
 assert.deepEqual(out,{reviewed:3,again:1,hard:1,easy:1});
});
test('todayTrainingStats ignores old days and invalid entries',()=>{
 const now=new Date(2026,9,27,12).getTime();
 assert.deepEqual(todayTrainingStats([{id:'a',at:new Date(2026,9,26,23).getTime(),rating:'easy'}],now),{reviewed:0,again:0,hard:0,easy:0});
});

import {dailyRatingStats,localDayKey} from './engine.mjs';
test('history uses the last rating per word per calendar date exactly like training',()=>{
 const at=(day,h)=>new Date(2026,9,day,h).getTime();
 const log=[
  {id:'uno',at:at(27,10),rating:'again'},
  {id:'dos',at:at(27,11),rating:'easy'},
  {id:'uno',at:at(27,12),rating:'easy'},
  {id:'tres',at:at(27,13),rating:'hard'},
  {id:'uno',at:at(28,10),rating:'hard'},
 ];
 const day27=dailyRatingStats(log).get(localDayKey(at(27,18)));
 assert.deepEqual(day27,{reviewed:3,again:0,hard:1,easy:2});
 assert.deepEqual(day27,todayTrainingStats(log,at(27,18)));
 assert.deepEqual(dailyRatingStats(log).get(localDayKey(at(28,18))),{reviewed:1,again:0,hard:1,easy:0});
});
test('history ignores invalid entries and keeps the latest click on same timestamp',()=>{
 const at=new Date(2026,9,27,18).getTime();
 assert.deepEqual(dailyRatingStats([{id:'a',at,rating:'again'},{id:'a',at,rating:'easy'},{id:'b',at,rating:'invalid'}]).get(localDayKey(at)),{reviewed:1,again:0,hard:0,easy:1});
});

test('only the substituted letter is marked in chocolate',()=>{
 const comparison=compareLetters('chokolate','chocolate');
 assert.deepEqual(comparison.answer.filter(x=>x.error).map(x=>x.char),['c']);
 assert.deepEqual(comparison.input.filter(x=>x.error).map(x=>x.char),['k']);
});
test('diacritics alone do not mark spelling errors',()=>{
 const comparison=compareLetters('detras','detrás');
 assert.equal(comparison.answer.filter(x=>x.error).length,0);
});
