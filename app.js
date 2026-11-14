import {parseCSV,toWords,parseSheetUrl,recordRating,recordAssessment,searchKey,createSession,copySession,nextInSession,rateInSession,dueCounts,compareLetters,recoverLegacyProgress,localDayKey,isDueOnCalendarDay,scheduledReviews,todayTrainingStats,dailyRatingStats} from './engine.mjs?v=36';
import {readApiResponse,readAllRows} from './cloud-api.mjs?v=32';
import {mergeReviewMaps,mergeHistoryEvents as mergeHistoryEventsCore} from './sync-merge.mjs?v=32';
import {mergeFlagMaps} from './word-flags.mjs?v=34';
import {missingCloudEvents} from './sync-outbox.mjs?v=32';
const $=id=>document.getElementById(id), cfg=window.APP_CONFIG||{};
const APP_VERSION='0.36.0';
async function fetchPublishedVersion(){
 const response=await fetch(`./version.json?check=${Date.now()}`,{cache:'no-store'});
 if(!response.ok)throw new Error(`HTTP ${response.status}`);
 const data=await response.json();
 if(!/^\d+\.\d+\.\d+$/.test(data.version||''))throw new Error('Некорректная версия');
 return data.version;
}
async function checkAppUpdate(){
 const output=$('update-message');output.textContent='Проверяю обновления…';
 try{
  if('serviceWorker' in navigator){const registration=await navigator.serviceWorker.getRegistration();if(registration)await registration.update();}
  const current=await fetchPublishedVersion();
  if(current===APP_VERSION){output.textContent=`Установлена актуальная версия ${APP_VERSION}.`;return;}
  output.replaceChildren();
  const label=document.createElement('span');label.textContent=`Доступна версия ${current}. `;
  const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Обновить сейчас';
  button.addEventListener('click',async()=>{try{
    if('serviceWorker' in navigator){const registration=await navigator.serviceWorker.getRegistration();if(registration){await registration.update();if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});}}
    location.reload();
  }catch(e){output.textContent=`Не удалось обновить: ${e.message}`;}});
  output.append(label,button);
 }catch(e){output.textContent=`Проверка не удалась: ${e.message}`;}
}
$('check-app-update').addEventListener('click',checkAppUpdate);

const KEY='palabras:v1';
const DEMO=[['Русский','Испанский'],['дом','casa'],['сегодня','hoy'],['говорить','hablar'],['работать','trabajar'],['красивый','lindo, bonito'],['школа','escuela'],['вчера','ayer'],['утро','mañana'],['вода','agua'],['читать','leer']];
let refreshTimer;
const state={words:[],progress:{},sheet:'',range:'',reviewMode:'practice',session:null,displayedId:null,lastAnswer:null,correction:null,accessToken:null,user:null,supabaseSession:null,googleToken:null,source:'',saving:null,history:[],legacy:null,flags:{},studyMode:'repeat',wordFilter:'all',openedAt:Date.now()};
const hasBackend=!!(cfg.supabaseUrl&&cfg.supabaseAnonKey);
let cloudLoading=false;
let needsCloudRepair=false;
let cloudRetryTimer=null;
function scheduleCloudRepair(delay=60000){
 if(!state.user)return;
 if(cloudRetryTimer!==null)clearTimeout(cloudRetryTimer);
 cloudRetryTimer=setTimeout(()=>{
   cloudRetryTimer=null;
   if(!state.user)return;
   if(cloudLoading){scheduleCloudRepair();return;}
   loadCloud();
 },delay);
}
function markCloudRepairNeeded(message){
 needsCloudRepair=true;
 $('study-notice').textContent=message;
 $('study-notice').classList.remove('hidden');
 scheduleCloudRepair();
}
window.addEventListener('online',()=>{if(needsCloudRepair&&state.user)scheduleCloudRepair(0);});
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&needsCloudRepair&&state.user)scheduleCloudRepair(0);
});
const jsonHeaders=()=>({'apikey':cfg.supabaseAnonKey,'Content-Type':'application/json',...(state.accessToken?{'Authorization':`Bearer ${state.accessToken}`}:{})});
const localKey=()=>`${KEY}:${state.user?.id||'guest'}`;
const protectedKey=uid=>`${KEY}:verified-cloud:${uid}`;
const mergeHistoryEvents=(oldEvents,newEvents)=>mergeHistoryEventsCore(oldEvents,newEvents,eventUUID);
function saveVerifiedCloud(){
  if(!state.user?.id)return;
  try{const key=protectedKey(state.user.id);const previous=JSON.parse(localStorage.getItem(key)||'{}');
    localStorage.setItem(key,JSON.stringify({progress:mergeReviewMaps(previous.progress,state.progress),history:mergeHistoryEvents(previous.history,state.history)}));
  }catch(e){console.warn('Verified cloud cache unavailable',e);}
}
function restoreVerifiedCloud(){
  if(!state.user?.id)return;
  try{const previous=JSON.parse(localStorage.getItem(protectedKey(state.user.id))||'{}');
    state.progress=mergeReviewMaps(state.progress,previous.progress);
    state.history=mergeHistoryEvents(state.history,previous.history);
  }catch(e){console.warn('Verified cloud cache unavailable',e);}
}
const storage=()=>{try{return JSON.parse(localStorage.getItem(localKey())||'{}')}catch{return {}}};
function saveLocal(){try{localStorage.setItem(localKey(),JSON.stringify({progress:state.progress,sheet:state.sheet,range:state.range,reviewMode:state.reviewMode,source:state.source,words:state.words,history:state.history,legacy:state.legacy,flags:state.flags}));}catch(e){console.warn('Local save failed',e);}}
function loadLocal(){const s=storage();state.progress=s.progress||{};state.sheet=s.sheet||cfg.defaultSheetUrl||'';state.range=s.range||'';state.reviewMode=s.reviewMode||'practice';state.source=s.source||'';state.words=s.words||[];state.history=Array.isArray(s.history)?s.history:[];state.flags=mergeFlagMaps(state.flags,s.flags);
  // One-time migration from the existing per-word progress (without changing it).
  state.legacy=s.legacy||recoverLegacyProgress(state.progress,state.history);
  if(!s.legacy)saveLocal();
  state.session=null;state.displayedId=null;state.lastAnswer=null;state.correction=null;}
function note(id,message){$(id).textContent=message;}
function focusAnswer(){
  // Wait for the current card to be inserted and visible.
  requestAnimationFrame(()=>{const field=$('typed-answer');if(document.querySelector('#page-study.active')&&!field.readOnly&&!$('study-card').classList.contains('hidden'))field.focus({preventScroll:true});});
}
function showPage(page){for(const el of document.querySelectorAll('.page'))el.classList.toggle('active',el.id===`page-${page}`);for(const b of document.querySelectorAll('[data-page]'))b.classList.toggle('active',b.dataset.page===page);if(page==='study'){renderStudy();focusAnswer();}if(page==='words')renderWords();if(page==='settings')renderSettings();if(page==='history')renderHistory();}
for(const b of document.querySelectorAll('[data-page]'))b.addEventListener('click',()=>showPage(b.dataset.page));
$('go-settings').onclick=()=>showPage('settings');
function renderSettings(){$('sheet-url').value=state.sheet;$('sheet-range').value=state.range;$('review-mode').value=state.reviewMode;$('google-sheet-auth').classList.toggle('hidden',!cfg.googleOAuthClientId);}
function flagActive(id,flag){return !!state.flags[id]?.[flag]?.enabled;}
function flagWord(id){return state.words.find(w=>w.id===id)||state.flags[id]?.snapshot||null;}
function flagButton(word,flag,label){const button=document.createElement('button');button.type='button';button.className='flag-button'+(flagActive(word.id,flag)?' selected':'');button.textContent=flag==='fix'?'✎':flag==='repeat'?'↻':'✓';button.setAttribute('aria-label',`${flagActive(word.id,flag)?'Убрать из':'Добавить в'} ${label}: ${word.ru}`);button.title=label;button.setAttribute('aria-pressed',String(flagActive(word.id,flag)));button.onclick=()=>toggleFlag(word,flag);return button;}
function sheetEditLink(word){if(!state.sheet)return null;const link=document.createElement('a');try{const parsed=parseSheetUrl(state.sheet);link.href=`https://docs.google.com/spreadsheets/d/${parsed.id}/edit#gid=${parsed.gid}${word.sheetRow?'&range=A'+word.sheetRow+':B'+word.sheetRow:''}`;}catch{link.href=state.sheet;}link.target='_blank';link.rel='noopener noreferrer';link.textContent='Открыть таблицу ↗';link.className='sheet-edit-link';link.title='Найти и исправить слово в Google Таблице';return link;}
function renderWords(){const q=searchKey($('word-search').value.trim());const list=state.wordFilter==='all'?state.words:Object.entries(state.flags).filter(([,v])=>v[state.wordFilter]?.enabled).map(([id])=>flagWord(id)).filter(Boolean);
 const filtered=list.filter(w=>!q||searchKey(`${w.ru} ${w.es}`).includes(q));$('words-empty').classList.toggle('hidden',!!filtered.length);const body=$('words-table');body.replaceChildren();
 for(const w of filtered.slice(0,1000)){
  const tr=document.createElement('tr');for(const val of [w.ru,w.es]){const td=document.createElement('td');td.textContent=val;tr.append(td);}
  const actions=document.createElement('td');actions.className='word-actions';actions.append(flagButton(w,'fix','Fix me'),flagButton(w,'repeat','Повторить'),flagButton(w,'mastered','Знаю окончательно'));
  if(state.wordFilter==='fix'){const link=sheetEditLink(w);if(link)actions.append(link);}
  tr.append(actions);body.append(tr);
 }
 updateFlagCounts();
}
function updateFlagCounts(){const repeat=Object.keys(state.flags).filter(id=>flagActive(id,'repeat')).length;const fix=Object.keys(state.flags).filter(id=>flagActive(id,'fix')).length;const mastered=state.words.filter(w=>flagActive(w.id,'mastered')).length;
 $('fix-count').textContent=fix;$('repeat-count').textContent=repeat;$('mastered-count').textContent=mastered;
 $('repeat-training-count').textContent=repeat;
}
for(const button of document.querySelectorAll('[data-word-filter]'))button.addEventListener('click',()=>{state.wordFilter=button.dataset.wordFilter;for(const b of document.querySelectorAll('[data-word-filter]'))b.classList.toggle('active',b===button);renderWords();});
async function toggleFlag(word,tag){const old=state.flags[word.id]?.[tag];const was=!!old?.enabled;state.flags[word.id]??={};state.flags[word.id].snapshot={id:word.id,ru:word.ru,es:word.es,sheetRow:word.sheetRow};state.flags[word.id][tag]={enabled:!was,at:Date.now()};saveLocal();if(tag==='mastered'){renderHistory();}updateFlagCounts();renderWords();renderStudyFlags();if(state.user)try{await pushFlag(word.id,tag);}catch(err){console.warn('Failed to sync flag',err);$('study-notice').textContent='Отметка сохранена на этом устройстве; синхронизация не удалась.';$('study-notice').classList.remove('hidden');}}
function renderStudyFlags(){
 const word=flagWord(state.session?.current);
 const fix=$('study-flags'),repeat=$('study-repeat');
 fix.replaceChildren();repeat.replaceChildren();
 if(word){fix.append(flagButton(word,'fix','Fix me'),flagButton(word,'mastered','Знаю окончательно'));repeat.append(flagButton(word,'repeat','Повторить'));}
 $('previous-word').disabled=!state.lastAnswer||!!state.correction||cloudLoading;
}
function formatPrompt(value){
 const el=$('prompt-word');el.replaceChildren();
 const text=String(value||'').trim();
 const slash=text.indexOf('/');
 const lead=document.createElement('span');
 lead.className='prompt-lead';
 lead.textContent=slash===-1?text:text.slice(0,slash);
 if(slash!==-1){
   const rest=document.createElement('span');
   rest.className='prompt-rest';
   rest.textContent=text.slice(slash);
   lead.append(rest);
 }
 el.append(lead);
}
function setStudyMode(mode){
 state.studyMode=mode;state.session=null;state.displayedId=null;state.lastAnswer=null;state.correction=null;
 for(const [id,value] of [['normal-training','normal'],['repeat-training','repeat'],['post-training','post']])$(id).classList.toggle('active',mode===value);
 $('study-mode-desc').textContent=mode==='repeat'?'Слова из твоего списка ↻.':mode==='post'?'Слова с оценками «Сомневаюсь» и «Не знаю».':'Плановые повторения (включая просроченные) чередуются с новыми словами 1:1.';
 renderStudy();
}
$('normal-training').onclick=()=>setStudyMode('normal');$('repeat-training').onclick=()=>setStudyMode('repeat');$('post-training').onclick=()=>setStudyMode('post');
$('back-normal').onclick=()=>setStudyMode('normal');
$('word-search').oninput=renderWords;
let lastStatsDay=localDayKey(Date.now());
setInterval(()=>{
 const day=localDayKey(Date.now());
 if(day!==lastStatsDay){
  lastStatsDay=day;
  if(document.querySelector('#page-history.active'))renderHistory();
  else if(document.querySelector('#page-study.active'))renderStats();
 }
},60000);
function renderStats(){
 const c=dueCounts(state.words,state.progress);
 $('total-words').textContent=state.words.length;

 $('new-words').textContent=c.new;
 // Training figures cover today's distinct words and their last rating today.
 const today=todayTrainingStats(state.history);
 $('study-reviewed').textContent=today.reviewed;
 $('study-easy').textContent=today.easy;
 $('study-hard').textContent=today.hard;
 $('study-again').textContent=today.again;
}
function renderStudy(){
 renderStats();
 const pool=state.words.filter(w=>!flagActive(w.id,'mastered'));
 const postWords=pool.filter(w=>['hard','again'].includes(state.progress[w.id]?.lastRating));
 const trainingWords=state.studyMode==='repeat'?pool.filter(w=>flagActive(w.id,'repeat')):state.studyMode==='post'?postWords:pool;
 const active=trainingWords.length>0;
 if(!active){
   const title=state.studyMode==='repeat'?'Список «Особенные слова» пуст':state.studyMode==='post'?'Нет слов для Постпрактики':state.words.length?'На сегодня всё':'Подключи словарь';
   $('study-empty').querySelector('h2').textContent=title;
   $('study-empty').querySelector('p').textContent=state.studyMode==='repeat'?'Добавь слова через ↻ на карточке или в словаре.':state.studyMode==='post'?'Для Постпрактики нужны слова с оценками «Сомневаюсь» или «Не знаю».':'Словарь можно обновить в настройках.';
 }
 $('study-empty').classList.toggle('hidden',active);
 $('study-card').classList.toggle('hidden',!active);
 if(!active){$('repeat-finished').classList.add('hidden');return;}
 if(!state.session||!Array.isArray(state.session.queue)){
   state.session=createSession(trainingWords,state.studyMode==='repeat'?{}:state.progress,Date.now(),false,Math.random,{mode:state.studyMode,poolWords:pool});
   if(state.studyMode==='repeat'){
     state.session.hardPool=pool.filter(w=>state.progress[w.id]?.lastRating==='hard').map(w=>w.id);
   }
 }
 const id=nextInSession(state.session);
 if(!id){
   if(state.studyMode==='normal'&&!state.session.blocked&&state.reviewMode==='practice'&&postWords.length){setStudyMode('post');return;}
   $('study-card').classList.add('hidden');$('repeat-finished').classList.remove('hidden');
   $('repeat-finished').querySelector('h2').textContent=state.session.blocked?'Недостаточно разных слов для повторения':state.studyMode==='repeat'?'Особенные слова завершены':'На сегодня всё';
   return;
 }
 $('repeat-finished').classList.add('hidden');
 const word=state.words.find(w=>w.id===id);
 if(!word){state.session=null;state.displayedId=null;renderStudy();return;}
 renderStudyFlags();
 if(state.displayedId===id)return;
 state.displayedId=id;
 formatPrompt(word.ru);$('answer-word').textContent=word.es;
 $('typed-answer').readOnly=false;$('typed-answer').value='';$('answer-compare').replaceChildren();$('answer-compare').classList.add('hidden');$('revealed-area').classList.add('hidden');$('reveal').classList.remove('hidden');focusAnswer();
}
function beginNew(){state.session=null;state.displayedId=null;state.lastAnswer=null;state.correction=null;renderStudy();}
function renderLetterDiff(typed,expected){
 const ref=$('answer-word');ref.replaceChildren();
 if(!typed){ref.textContent=expected;return;}
 const diff=compareLetters(typed,expected);
 // Errors highlighted on the reference; accents are ignored by compareLetters.
 for(const part of diff.answer){const span=document.createElement('span');span.textContent=part.char;if(part.error)span.className='answer-error';ref.append(span);}
}
function playArgentina(text){if(!('speechSynthesis' in window))return;
 try{speechSynthesis.cancel();const utter=new SpeechSynthesisUtterance(text);utter.lang='es-AR';utter.rate=.88;const voices=speechSynthesis.getVoices();const voice=voices.find(v=>v.lang.toLowerCase()==='es-ar')||voices.find(v=>v.lang.toLowerCase().startsWith('es'));if(voice)utter.voice=voice;speechSynthesis.speak(utter);}catch(err){console.warn('Озвучка недоступна:',err);}}
$('reveal').onclick=()=>{const value=$('typed-answer').value.trim();const word=state.words.find(w=>w.id===state.session?.current);if(!word)return;
 $('answer-word').textContent=word.es;renderLetterDiff(value,word.es);$('typed-answer').readOnly=true;$('reveal').classList.add('hidden');$('revealed-area').classList.remove('hidden');playArgentina(word.es);
};
// Enter reveals the answer first; after reveal Enter means "Знаю".
// Handle keyboard from the input and rating controls without double-triggering.
document.addEventListener('keydown',e=>{
 if(e.key!=='Enter'||e.repeat||e.isComposing||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
 if(!document.querySelector('#page-study.active')||$('study-card').classList.contains('hidden'))return;
 if(e.target.closest('button')&& !e.target.matches('#reveal, #rate-easy'))return;
 e.preventDefault();
 if(!$('reveal').classList.contains('hidden'))$('reveal').click();
 else if(!$('revealed-area').classList.contains('hidden'))$('rate-easy').click();
});
function returnToPrevious(){
 const last=state.lastAnswer;
 if(!last||cloudLoading||state.correction)return;
 state.correction=last;state.lastAnswer=null;
 state.session=copySession(last.beforeSession);state.displayedId=null;
 renderStudy();
 if(state.session?.current!==last.id)return;
 $('typed-answer').value=last.typed;
 $('answer-word').textContent=last.expected;
 renderLetterDiff(last.typed,last.expected);
 $('typed-answer').readOnly=true;
 $('reveal').classList.add('hidden');$('revealed-area').classList.remove('hidden');
}
$('previous-word').onclick=returnToPrevious;
let progressSyncQueue=Promise.resolve();
async function rate(rating){
 if(cloudLoading)return;
 const s=state.session;if(!s?.current)return;
 const correction=state.correction;
 const beforeSession=copySession(s);
 const id=s.current;
 const beforeProgress=correction?correction.beforeProgress:state.progress[id];
 const typed=correction?correction.typed:$('typed-answer').value.trim();
 const word=state.words.find(w=>w.id===id);
 const at=Math.max(Date.now(),(correction?.at||0)+1,(state.progress[id]?.updated||0)+1);
 const result=rateInSession(s,rating),special=state.studyMode==='repeat';
 const save=!special&&(!result.filler||rating==='again')&&(!flagActive(id,'mastered')||rating==='again');
 if(save)state.progress[id]=result.extra&&rating!=='again'?recordAssessment(beforeProgress,rating,at):recordRating(beforeProgress,rating,at);
 const event={at,id,rating,extra:special||result.extra};
 state.history.push(event);
 state.correction=null;
 state.lastAnswer={id,beforeSession,beforeProgress,typed,expected:word?.es||'',at,saved:save};
 state.displayedId=null;
 saveLocal();renderStudy();
 // Serialize cloud writes: an earlier slow request must not overwrite a correction.
 const progress=save?{[id]:{...state.progress[id]}}:{};
 progressSyncQueue=progressSyncQueue.catch(()=>{}).then(async()=>{
   if(!state.user)return;
   await syncEntries(progress,[event]);saveVerifiedCloud();
 }).catch(err=>{
   console.warn('Cloud sync failed:',err);
   markCloudRepairNeeded('Облачная запись временно недоступна. Локальные ответы сохранены; повторная отправка запланирована.');
 });
 await progressSyncQueue;
}
$('rate-again').onclick=()=>rate('again');$('rate-hard').onclick=()=>rate('hard');$('rate-easy').onclick=()=>rate('easy');
function renderHistory(){
 renderStats();updateFlagCounts();
 const currentWordIds=new Set(state.words.map(w=>w.id));
 const reviewed=Object.entries(state.progress).filter(([id,r])=>currentWordIds.has(id)&&r&&Number.isFinite(r.updated)&&r.updated>0);
 const ratings={again:0,hard:0,easy:0};
 for(const [,r] of reviewed)if(Object.hasOwn(ratings,r.lastRating))ratings[r.lastRating]++;
 const journal=(state.history||[]).filter(x=>x&&Number.isFinite(x.at));
 const dayKey=ts=>localDayKey(ts);
 const daily=dailyRatingStats(journal);
 const buckets=new Map();
 const getDay=key=>{if(!buckets.has(key))buckets.set(key,{legacy:new Set(),summary:daily.get(key)||null});return buckets.get(key)};
 for(const key of daily.keys())getDay(key);
 // Retain recoverable old-day evidence without double-counting later journal entries.
 const recorded=new Set(journal.map(e=>`${e.id}|${e.at}`));
 for(const [id,r] of reviewed){
   if(recorded.has(`${id}|${r.updated}`)||journal.some(e=>e.id===id&&Math.abs(e.at-r.updated)<2000))continue;
   getDay(dayKey(r.updated)).legacy.add(id);
 }
 for(const oldDay of state.legacy?.days||[])getDay(oldDay);

 const counts=dueCounts(state.words,state.progress);
 const learned=counts.total-counts.new;
 $('p-learned').textContent=learned;
 $('p-hard').textContent=ratings.hard;
 $('p-easy').textContent=ratings.easy;
 $('p-again').textContent=ratings.again;
 const total=state.words.length;const percent=total?Math.round(learned/total*100):0;
 $('learned-progress-fill').style.width=`${Math.min(percent,100)}%`;
 $('learned-progress-bar').setAttribute('aria-valuenow',Math.min(percent,100));
 $('learned-progress-caption').textContent=`Изучено ${learned} из ${total} слов · ${percent}%`;
 $('p-days').textContent=`${buckets.size} ${plural(buckets.size,'день','дня','дней')} занятий`;
 const root=$('history-list');root.replaceChildren();
 const sorted=[...buckets].sort((a,b)=>b[0].localeCompare(a[0]));
 const niceDate=s=>s.split('-').reverse().join('.');
 for(const [key,d] of sorted){
   const line=document.createElement('div');line.className='progress-history-row';
   const date=document.createElement('strong');date.textContent=niceDate(key);
   const details=document.createElement('span');
   const summary=d.summary;
   if(summary){details.textContent=`${summary.reviewed} ${plural(summary.reviewed,'ответ','ответа','ответов')} · Не знаю ${summary.again} · Сомневаюсь ${summary.hard} · Знаю ${summary.easy}`;
     if(d.legacy.size)details.textContent+=` · ещё ${d.legacy.size} ${plural(d.legacy.size,'слово','слова','слов')} без полной истории`;
   }else if(d.legacy.size){details.textContent=`${d.legacy.size} ${plural(d.legacy.size,'изученное слово','изученных слова','изученных слов')}`;}
   else{details.textContent='Ранее занимались · подробности не сохранились';}
   line.append(date,details);root.append(line);
 }
 if(!sorted.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='После первой тренировки здесь появятся результаты.';root.append(empty);}
 $('history-note').textContent='';
 const schedule=$('schedule-list');schedule.replaceChildren();
 const scheduled=scheduledReviews(state.words.filter(w=>!flagActive(w.id,'mastered')),state.progress);
 const today=localDayKey(Date.now());
 const items=[[today,scheduled.today+scheduled.overdue],...scheduled.dates];
 for(const [key,num] of items){const line=document.createElement('div');line.className='schedule-row';
   const left=document.createElement('span');left.textContent=key===today?'На повторение сегодня':niceDate(key);
   const right=document.createElement('strong');right.textContent=`${num} ${plural(num,'слово','слова','слов')}`;
   line.append(left,right);schedule.append(line);
 }
}
function plural(n,one,few,many){const m=Math.abs(n)%100,k=m%10;return m>=11&&m<=14?many:k===1?one:k>=2&&k<=4?few:many;}
$('review-mode').onchange=()=>{state.reviewMode=$('review-mode').value;saveLocal();saveProfile();beginNew();};
$('load-demo').onclick=()=>{state.words=toWords(DEMO);state.source='demo';state.sheet='';state.progress={};state.history=[];state.legacy=recoverLegacyProgress({});saveLocal();beginNew();};
async function readPublicSheet(sheet){const urls=[`https://docs.google.com/spreadsheets/d/${sheet.id}/export?format=csv&gid=${sheet.gid}`,`https://docs.google.com/spreadsheets/d/${sheet.id}/gviz/tq?tqx=out%3Acsv&gid=${sheet.gid}`];let last;
  for(const url of urls){try{const r=await fetch(url);if(!r.ok)throw new Error(`HTTP ${r.status}`);const data=await r.text();if(/^\s*<!doctype html|^\s*<html/i.test(data))throw new Error('Google вернул страницу вместо CSV');return toWords(parseCSV(data));}catch(e){last=e;}}
  throw new Error(`Не удалось прочитать таблицу без авторизации: ${last?.message||'ошибка сети'}. Попробуй предоставить доступ по ссылке или подключить Google OAuth.`);
}
async function readPrivateSheet(sheet){if(!state.googleToken)throw new Error('Сначала разреши доступ Google.');
  const base=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheet.id)}`;
  const headers={Authorization:`Bearer ${state.googleToken}`};
  const meta=await fetch(`${base}?fields=sheets.properties`,{headers});if(!meta.ok)throw new Error(`Google Sheets API: ${meta.status}`);
  const data=await meta.json(),pages=data.sheets.map(s=>s.properties);
  const page=(state.range?pages.find(p=>p.title===state.range):pages.find(p=>String(p.sheetId)===sheet.gid))||pages[0];
  if(!page)throw new Error('В таблице нет листов.');
  const range=`'${page.title.replace(/'/g,"''")}'!A:ZZ`;
  const r=await fetch(`${base}/values/${encodeURIComponent(range)}`,{headers});if(!r.ok)throw new Error(`Нет доступа к данным листа: HTTP ${r.status}`);
  return toWords((await r.json()).values||[]);
}
async function refreshSheet(){if(!state.sheet){note('sheet-message','Сначала добавь ссылку на таблицу.');return;}
  note('sheet-message','Читаю Google Таблицу…');try{const parsed=parseSheetUrl(state.sheet);let words;
    try{words=await readPublicSheet(parsed);}catch(e){if(state.googleToken)words=await readPrivateSheet(parsed);else throw e;}
    if(!words.length)throw new Error('В таблице не найдены слова с заполненными русским и испанским переводами.');
    state.words=words;state.source='sheet';state.session=null;saveLocal();await saveProfile();
    note('sheet-message',`Загружено ${words.length} слов. Прогресс сохранён.`);renderStudy();
  }catch(e){note('sheet-message',e.message);}}
$('save-sheet').onclick=async()=>{state.sheet=$('sheet-url').value.trim();state.range=$('sheet-range').value.trim();saveLocal();await refreshSheet();};

function authorizeGoogle(){if(!cfg.googleOAuthClientId){note('sheet-message','В config.js нужен googleOAuthClientId.');return;}
  if(!window.google?.accounts?.oauth2){note('sheet-message','Не удалось загрузить Google Identity Services.');return;}
  const client=window.google.accounts.oauth2.initTokenClient({client_id:cfg.googleOAuthClientId,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',callback:(res)=>{if(res.error){note('sheet-message',res.error);return;}state.googleToken=res.access_token;note('sheet-message','Доступ разрешён. Нажми «Подключить / обновить».');}});client.requestAccessToken({prompt:'consent'});
}
$('google-sheet-auth').onclick=authorizeGoogle;
function download(name,data){const blob=new Blob([data],{type:'application/json;charset=utf-8'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),500);}
$('export-data').onclick=()=>download('slova-progress.json',JSON.stringify({version:1,progress:state.progress,history:state.history,legacy:state.legacy,flags:state.flags,sheet:state.sheet,range:state.range},null,2));
$('import-data').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());if(data.version!==1||typeof data.progress!=='object'||!data.progress||Array.isArray(data.progress))throw new Error('Неподдерживаемый формат.');state.progress=mergeReviewMaps(state.progress,data.progress);state.history=mergeHistoryEvents(state.history,Array.isArray(data.history)?data.history:[]);state.flags=mergeFlagMaps(state.flags,data.flags);state.legacy=data.legacy||recoverLegacyProgress(state.progress,state.history);saveLocal();beginNew();note('import-message','Прогресс импортирован локально.');if(state.user)await syncAll();}catch(err){note('import-message',`Ошибка импорта: ${err.message}`);}e.target.value='';};
// Supabase Auth + REST. Row-level security in schema.sql protects each user's rows.
async function api(path,options={}) {
  if(!hasBackend)throw new Error('Supabase пока не настроен.');
  const response=await fetch(`${cfg.supabaseUrl.replace(/\/$/,'')}${path}`,{
    ...options,headers:{...jsonHeaders(),...(options.headers||{})}
  });
  return readApiResponse(response);
}
async function receiveSession(session){
  const oldUser=state.user?.id;
  state.supabaseSession=session;state.accessToken=session?.access_token||null;state.user=session?.user||null;
  if(session)localStorage.setItem(`${KEY}:auth`,JSON.stringify(session));else localStorage.removeItem(`${KEY}:auth`);
  $('account-status').textContent=state.user?.email||'Гостевой режим';
  $('account-button').textContent=state.user?'Аккаунт':'Войти';
  $('logout').classList.toggle('hidden',!state.user);
  clearTimeout(refreshTimer);
  if(session?.expires_at)refreshTimer=setTimeout(()=>refreshSession(),Math.max(30000,session.expires_at*1000-Date.now()-60000));
  if(oldUser!==state.user?.id){
    // Changing account must not replace an already loaded cloud snapshot with a tiny cache.
    const current=state.progress,previousHistory=state.history,previousFlags=state.flags;
    loadLocal();
    if(state.user){
      if(oldUser===state.user.id){state.progress=mergeReviewMaps(current,state.progress);state.history=mergeHistoryEvents(previousHistory,state.history);state.flags=mergeFlagMaps(previousFlags,state.flags);}
      restoreVerifiedCloud();
      saveLocal();
      await loadCloud();
    }
  }
  renderSettings();renderStudy();renderHistory();
}
async function refreshSession(){
  if(!state.supabaseSession?.refresh_token)return;
  try{const r=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:state.supabaseSession.refresh_token})});await receiveSession(r);}
  catch(e){console.warn('Session refresh failed:',e);await receiveSession(null);}
}
async function restoreAuth(){
  if(!hasBackend)return;
  const hash=new URLSearchParams(location.hash.slice(1));
  if(hash.has('access_token')){
    const token=hash.get('access_token');
    history.replaceState({},'',location.pathname+location.search);
    try{
      const user=await api('/auth/v1/user',{headers:{Authorization:`Bearer ${token}`}});
      await receiveSession({access_token:token,refresh_token:hash.get('refresh_token'),expires_at:Math.floor(Date.now()/1000)+Number(hash.get('expires_in')||3600),user});
    }catch(e){note('login-message',`Вход не завершён: ${e.message}`);}
    return;
  }
  let previous=null;
  try{previous=JSON.parse(localStorage.getItem(`${KEY}:auth`)||'null');}catch{}
  if(previous?.refresh_token){state.supabaseSession=previous;state.accessToken=previous.access_token;
    if((previous.expires_at||0)*1000<Date.now()+60000)await refreshSession();
    else{try{const user=await api('/auth/v1/user');await receiveSession({...previous,user});}catch{await refreshSession();}}
  }
}
$('account-button').onclick=()=>{note('login-message',hasBackend?'':'Синхронизация ещё не настроена.');$('login-dialog').showModal();};
$('google-login').onclick=()=>{
  if(!hasBackend){note('login-message','Синхронизация ещё не настроена.');return;}
  const redirect=location.origin+location.pathname;
  const url=new URL(cfg.supabaseUrl.replace(/\/$/,'')+'/auth/v1/authorize');
  url.searchParams.set('provider','google');url.searchParams.set('redirect_to',redirect);
  location.assign(url.toString());
};
$('send-login').onclick=async()=>{if(!hasBackend)return;const email=$('login-email').value.trim();if(!email)return;
  try{await api('/auth/v1/otp',{method:'POST',body:JSON.stringify({email,create_user:true,options:{email_redirect_to:location.origin+location.pathname}})});note('login-message','Проверь почту: ссылка для входа отправлена.');}catch(e){note('login-message',`Ошибка: ${e.message}`);}};
$('logout').onclick=async()=>{try{await api('/auth/v1/logout',{method:'POST'});}catch{}await receiveSession(null);$('login-dialog').close();};
const validReview=(x)=>x&&typeof x==='object'&&Number.isFinite(x.updated);
function eventUUID(x){
  // Event keys are deterministic across devices; no duplicate history after re-sync.
  const value=`${x.id}|${x.at}|${x.rating}|${Boolean(x.extra)}`;
  let a=2166136261,b=2166136261,c=2166136261,d=2166136261;
  for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);a=Math.imul(a^code,16777619);b=Math.imul(b^(code+i),16777619);c=Math.imul(c^(code*31),16777619);d=Math.imul(d^(code+97),16777619);}
  const hex=v=>(v>>>0).toString(16).padStart(8,'0');
  const full=hex(a)+hex(b)+hex(c)+hex(d);
  return `${full.slice(0,8)}-${full.slice(8,12)}-4${full.slice(13,16)}-a${full.slice(17,20)}-${full.slice(20,32)}`;
}
async function loadCloud({throwOnError=false}={}){
  if(!state.user)return;
  if(cloudLoading){if(throwOnError)throw new Error('Синхронизация уже выполняется.');return;}
  cloudLoading=true;
  try{
    const uid=encodeURIComponent(state.user.id);
    const [rows,events]=await Promise.all([
      readAllRows(api,`/rest/v1/word_progress?user_id=eq.${uid}&select=word_id,state&order=word_id.asc`),
      readAllRows(api,`/rest/v1/review_history?user_id=eq.${uid}&select=event_id,word_id,rating,answered_at,extra&order=answered_at.asc,event_id.asc`)
    ]);
    const cloudEventIds=new Set((events||[]).map(event=>event.event_id));
    const localNewer={};
    for(const row of rows||[]){
      const local=state.progress[row.word_id];
      if(!validReview(local)||row.state.updated>local.updated)state.progress[row.word_id]=row.state;
      else if(local.updated>row.state.updated)localNewer[row.word_id]=local;
    }
    const cloudIDs=new Set((rows||[]).map(r=>r.word_id));
    for(const [id,v] of Object.entries(state.progress))if(!cloudIDs.has(id))localNewer[id]=v;
    const seen=new Set(state.history.map(eventUUID));
    for(const e of events||[]){const entry={id:e.word_id,at:Date.parse(e.answered_at),rating:e.rating,extra:e.extra};if(Number.isFinite(entry.at)&&!seen.has(e.event_id)){state.history.push(entry);seen.add(e.event_id);}}
    try{const flagRows=await readAllRows(api,`/rest/v1/word_flags?user_id=eq.${uid}&select=word_id,flag,enabled,updated_at,ru,es&order=word_id.asc,flag.asc`);const remoteFlags={};for(const r of flagRows||[]){remoteFlags[r.word_id]??={snapshot:{id:r.word_id,ru:r.ru,es:r.es}};remoteFlags[r.word_id][r.flag]={enabled:r.enabled,at:Date.parse(r.updated_at)||0};}const flagUpdates=[];for(const [id,tags] of Object.entries(state.flags))for(const tag of ['fix','repeat','mastered'])if(tags?.[tag]&&tags[tag].at>(remoteFlags[id]?.[tag]?.at||0))flagUpdates.push([id,tag]);state.flags=mergeFlagMaps(state.flags,remoteFlags);updateFlagCounts();if(state.session?.words?.some(id=>flagActive(id,'mastered'))){state.session=null;state.displayedId=null;}for(const [id,tag] of flagUpdates)await pushFlag(id,tag);}catch(e){console.warn('Word flags unavailable; run migration SQL',e);$('study-notice').textContent='Синхронизация отметок пока не настроена: требуется word-flags-migration.sql';$('study-notice').classList.remove('hidden');}
    state.history.sort((a,b)=>a.at-b.at);
    // The complete local journal is a durable outbox: repair all attempts that
    // never reached Supabase, including failures from older app versions.
    const unsent=missingCloudEvents(state.history,cloudEventIds,eventUUID);
    saveVerifiedCloud();
    saveLocal();if(!state.session)renderStudy();else renderStats();renderHistory();
    await syncEntries(localNewer,unsent);
    saveVerifiedCloud();
    needsCloudRepair=false;
    if(cloudRetryTimer!==null){clearTimeout(cloudRetryTimer);cloudRetryTimer=null;}
    if($('study-notice').textContent.includes('повторная отправка')||$('study-notice').textContent.startsWith('Облачная синхронизация недоступна'))$('study-notice').classList.add('hidden');
  }catch(e){console.warn('Cloud load failed:',e);
    markCloudRepairNeeded(`Облачная синхронизация недоступна: ${e.message}. Локальные ответы сохранены; повторная отправка запланирована.`);
    if(throwOnError)throw e;
  }finally{cloudLoading=false;}
}
async function pushFlag(id,tag){if(!state.user||!state.flags[id]?.[tag])return;const f=state.flags[id][tag],w=flagWord(id)||{ru:'',es:''};const latest=await api(`/rest/v1/word_flags?user_id=eq.${encodeURIComponent(state.user.id)}&word_id=eq.${encodeURIComponent(id)}&flag=eq.${tag}&select=enabled,updated_at,ru,es`);if(latest?.[0]&&Date.parse(latest[0].updated_at)>f.at){state.flags[id][tag]={enabled:latest[0].enabled,at:Date.parse(latest[0].updated_at)};saveLocal();updateFlagCounts();return;}await api('/rest/v1/word_flags?on_conflict=user_id,word_id,flag',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:state.user.id,word_id:id,flag:tag,enabled:f.enabled,updated_at:new Date(f.at).toISOString(),ru:w.ru,es:w.es})});}
async function syncFlags(){for(const [id,flags] of Object.entries(state.flags))for(const tag of ['fix','repeat','mastered'])if(flags?.[tag])await pushFlag(id,tag);}
async function syncEntries(progress,events){
  if(!state.user)return;
  const uid=state.user.id;
  for(const [id,data] of Object.entries(progress)){
    if(!validReview(data))continue;
    await api('/rest/v1/word_progress?on_conflict=user_id,word_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:uid,word_id:id,state:data})});
  }
  for(let i=0;i<events.length;i+=100){
    const batch=events.slice(i,i+100).filter(x=>Number.isFinite(x.at)&&['easy','hard','again'].includes(x.rating)).map(x=>({user_id:uid,event_id:eventUUID(x),word_id:x.id,rating:x.rating,answered_at:new Date(x.at).toISOString(),extra:!!x.extra}));
    if(batch.length)await api('/rest/v1/review_history?on_conflict=user_id,event_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:JSON.stringify(batch)});
  }
}
async function saveProfile(){} // Google Sheet remains configured locally per device.
async function syncProgress(id){
  if(!state.user)return;
  try{await syncEntries(state.progress[id]?{[id]:state.progress[id]}:{},state.history.slice(-1));saveVerifiedCloud();}
  catch(e){console.warn('Cloud sync failed:',e);$('study-notice').textContent='Облачная запись временно недоступна. Локальная копия сохранена.';$('study-notice').classList.remove('hidden');}
}
async function syncAll(){
  if(!state.user)return;
  // Always merge cloud before importing older backups; never overwrite newer values.
  try{await loadCloud({throwOnError:true});await syncFlags();saveVerifiedCloud();note('import-message','Прогресс и история синхронизированы с облаком.');}
  catch(e){note('import-message',`Локальный импорт сохранён, ошибка синхронизации: ${e.message}`);}
}
async function init(){loadLocal();renderSettings();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);

  if(hasBackend)await restoreAuth();updateFlagCounts();if(state.sheet&&state.source!=='sheet')await refreshSheet();setStudyMode('repeat');
}
init();
