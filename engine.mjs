// Pure vocabulary + scheduling engine. Timestamps are in milliseconds.
const DAY = 86400000;
export function parseCSV(text) {
  const rows=[];let row=[],cell='',quoted=false;
  text=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"') {if(quoted&&text[i+1]==='"'){cell+='"';i++;} else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell.trim());cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);
  return rows;
}
export function normalizeHeader(s){return String(s||'').trim().toLowerCase().replace(/[\s_\-]+/g,'');}
export function toWords(rows){
  if(!rows.length)return [];
  const header=rows[0].map(normalizeHeader);
  const find=(names)=>header.findIndex(x=>names.includes(x));
  let r=find(['русский','рус','russian','ru','вопрос','question','перевод']);
  let e=find(['испанский','исп','spanish','es','ответ','answer','дубликаты']);
  // Headerless Google Sheet: A = Spanish, B = Russian.
  const hasHeader=r>=0&&e>=0&&r!==e;
  if(!hasHeader&&header.length>=2){e=0;r=1;}
  // A legacy sheet may use unrecognised column titles; avoid treating them as vocabulary.
  const unknownHeading=!hasHeader&&['palabra','word','vocabulary','meaning','translation','значение'].some(x=>header.includes(x));
  const id=find(['id','ид','идентификатор']);
  if(r<0||e<0||r===e)throw new Error('Нужны два столбца: испанское слово и русский перевод.');
  const words=[],seen=new Set();
  for(let i=(hasHeader||unknownHeading?1:0);i<rows.length;i++){
    const ru=String(rows[i][r]||'').trim(),es=String(rows[i][e]||'').split('/')[0].trim();if(!ru||!es)continue;
    const key=(id>=0&&rows[i][id])?`id:${rows[i][id].trim()}`:`text:${ru.toLocaleLowerCase('ru')}|${es.toLocaleLowerCase('es')}`;
    if(seen.has(key))continue;seen.add(key);
    words.push({id:key,ru,es});
  }
  return words;
}
export function parseSheetUrl(raw){
  const url=new URL(raw);
  if(url.hostname!=='docs.google.com')throw new Error('Нужна ссылка на Google Таблицу (docs.google.com).');
  const match=url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if(!match)throw new Error('Неверная ссылка на Google Таблицу.');
  const hashGid=new URLSearchParams(url.hash.replace(/^#/,''));
  const gid=url.searchParams.get('gid')||hashGid.get('gid')||'0';
  if(!/^\d+$/.test(gid))throw new Error('Неверный идентификатор листа.');
  return {id:match[1],gid};
}
const fresh=()=>({repetitions:0,interval:0,ease:2.3,due:0,lapses:0,updated:0,lastRating:null});
export function recordRating(previous,rating,now=Date.now()){
  const p={...fresh(),...previous};
  if(!['again','hard','easy'].includes(rating))throw new Error('Unknown rating');
  let interval,ease=p.ease,repetitions=p.repetitions,lapses=p.lapses;
  if(rating==='again'){
    interval=0;ease=Math.max(1.3,ease-.2);repetitions=0;lapses++;
  } else if(rating==='hard'){
    interval=p.interval>0?Math.max(1,Math.round(p.interval*1.3)):1;
    ease=Math.max(1.3,ease-.12);repetitions++;
  }else{
    interval=p.interval>0?Math.max(p.interval+1,Math.round(p.interval*ease)):(repetitions?3:2);
    ease=Math.min(3.2,ease+.08);repetitions++;
  }
  // Missed cards remain due today; a separate in-session queue controls when they reappear.
  return {repetitions,interval,ease,due:now+interval*DAY,lapses,updated:now,lastRating:rating};
}
function shuffle(items,random=Math.random){
  const result=[...items];
  for(let i=result.length-1;i>0;i--){
    const j=Math.min(i,Math.max(0,Math.floor(random()*(i+1))));
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}
// Compare scheduled reviews by the user's local calendar date, not the exact hour.
export function localDayKey(timestamp){
  const d=new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function isDueOnCalendarDay(due,now=Date.now()){
  return Number.isFinite(due)&&localDayKey(due)<=localDayKey(now);
}
export function scheduledReviews(words,progress,now=Date.now()){
  const today=localDayKey(now),todayWords=[],overdue=[],future=new Map();
  for(const w of words){const p=progress[w.id];if(!p||!Number.isFinite(p.due))continue;
    const date=localDayKey(p.due);
    if(date<today)overdue.push(w.id);
    else if(date===today)todayWords.push(w.id);
    else future.set(date,(future.get(date)||0)+1);
  }
  return {today:todayWords.length,overdue:overdue.length,dates:[...future].sort((a,b)=>a[0].localeCompare(b[0]))};
}
export function createSession(words,progress,now=Date.now(),practice=true,random=Math.random){
  const due=[],newWords=[],later=[];
  for(const w of words){const p=progress[w.id];if(!p)newWords.push(w.id);else if(isDueOnCalendarDay(p.due,now))due.push(w.id);else later.push(w.id);}
  // Preserve due-before-new priority, but remove alphabetical/source-row hints.
  const queue=[...shuffle(due,random),...shuffle(newWords,random)];
  return {queue,retry:[],done:new Set(),words:words.map(w=>w.id),later,practice,random,answered:0,again:0,current:null,sessionRatings:new Map()};
}
export function nextInSession(s){
  if(s.current)return s.current;
  // Retry cards after at least five other answers have been shown, or as soon as the normal queue empties.
  let ready=s.retry.findIndex(x=>x.after<=s.answered);
  if(ready>=0){s.current=s.retry.splice(ready,1)[0].id;return s.current;}
  if(s.queue.length){s.current=s.queue.shift();return s.current;}
  if(s.retry.length){s.current=s.retry.shift().id;return s.current;}
  if(!s.practice)return null;
  // Optional extra practice: completed cards are shown again but do not affect intervals.
  if(!s.words.length)return null;
  const pool=s.words.filter(id=>s.done.has(id));
  // When due/new queue is empty, keep practising random words from the whole
  // connected dictionary until user explicitly ends the session.
  const available=s.words.filter(id=>!s.retry.some(x=>x.id===id));
  if(!available.length)return null;
  if(!s.practiceDeck?.length){
    s.practiceDeck=shuffle(available,s.random);
    if(s.practiceDeck.length>1&&s.practiceDeck[0]===s.lastPractice){
      [s.practiceDeck[0],s.practiceDeck[1]]=[s.practiceDeck[1],s.practiceDeck[0]];
    }
  }
  s.current=s.practiceDeck.shift();s.extra=true;s.lastPractice=s.current;
  return s.current;
}
export function rateInSession(s,rating){
  if(!s.current)throw new Error('No current word');
  const id=s.current,extra=!!s.extra;
  s.current=null;s.extra=false;s.answered++;
  if(rating==='again'){
    s.again++;
    s.done.delete(id);
    s.retry=s.retry.filter(x=>x.id!==id);
    s.retry.push({id,after:s.answered+5});
  }else{s.done.add(id);s.retry=s.retry.filter(x=>x.id!==id);}
  s.sessionRatings.set(id,rating);
  return {id,save:!extra||rating==='again'};
}
export function dueCounts(words,progress,now=Date.now()){
  let due=0,freshCount=0;
  for(const w of words){const p=progress[w.id];if(!p)freshCount++;else if(isDueOnCalendarDay(p.due,now))due++;}
  return {total:words.length,due,new:freshCount};
}

// Highlight differences without counting Spanish accent marks as mistakes.
export function compareLetters(typed, expected){
 // Levenshtein alignment keeps shared letters unmarked even when one
 // character was substituted or inserted (e.g. "chokolate" → "chocolate").
 const chars = value => Array.from(String(value).normalize('NFC'));
 const strip = c => c.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
 const a=chars(typed), b=chars(expected), n=a.length, m=b.length;
 const dp=Array.from({length:n+1},()=>Array(m+1).fill(0));
 for(let i=0;i<=n;i++)dp[i][0]=i;
 for(let j=0;j<=m;j++)dp[0][j]=j;
 for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){
  const cost=strip(a[i-1])===strip(b[j-1])?0:1;
  dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+cost);
 }
 const input=[],answer=[];let i=n,j=m;
 while(i>0||j>0){
  if(i>0&&j>0){
   const error=strip(a[i-1])!==strip(b[j-1]);
   if(dp[i][j]===dp[i-1][j-1]+(error?1:0)){
    input.push({char:a[i-1],error});answer.push({char:b[j-1],error});i--;j--;continue;
   }
  }
  if(i>0&&dp[i][j]===dp[i-1][j]+1){input.push({char:a[--i],error:true});continue;}
  if(j>0){answer.push({char:b[--j],error:true});continue;}
 }
 return {input:input.reverse(),answer:answer.reverse()};
}

// Legacy versions stored the last state of each word, not individual answers.
// Keep an immutable snapshot so later answers do not double-count past reviews.
export function recoverLegacyProgress(progress,history=[]){
  const recorded=new Set((Array.isArray(history)?history:[])
    .filter(e=>e&&Number.isFinite(e.at)).map(e=>`${e.id}|${e.at}`));
  const records=Object.entries(progress||{}).filter(([id,r])=>
    r&&Number.isFinite(r.updated)&&r.updated>0&&!recorded.has(`${id}|${r.updated}`));
  const days=[...new Set(records.map(([,r])=>new Date(r.updated).toLocaleDateString('sv-SE')))].sort();
  const ratingCounts={again:0,hard:0,easy:0};
  for(const [,r] of records)if(Object.hasOwn(ratingCounts,r.lastRating))ratingCounts[r.lastRating]++;
  return {words:records.length,days,ratings:ratingCounts,
    // Each word's latest saved review proves at least one past answer, not its total.
    minimumAnswers:records.length};
}

// Today's training overview counts distinct words, using each word's latest
// assessment today. A repeated "again" never inflates the word count.
export function todayTrainingStats(history, now=Date.now()){
  return dailyRatingStats(history).get(localDayKey(now)) || {reviewed:0,again:0,hard:0,easy:0};
}

// For each local calendar day, keep only the last rating of each distinct word.
// The same reducer powers both the training counters and the history page.
export function dailyRatingStats(history){
  const days=new Map();
  for(const entry of Array.isArray(history)?history:[]){
    if(!entry||typeof entry.id!=='string'||!Number.isFinite(entry.at)||!['again','hard','easy'].includes(entry.rating))continue;
    const day=localDayKey(entry.at);
    if(!days.has(day))days.set(day,new Map());
    const existing=days.get(day).get(entry.id);
    if(!existing||entry.at>=existing.at)days.get(day).set(entry.id,entry);
  }
  const result=new Map();
  for(const [day,last] of days){
    const stats={reviewed:last.size,again:0,hard:0,easy:0};
    for(const e of last.values())stats[e.rating]++;
    result.set(day,stats);
  }
  return result;
}
