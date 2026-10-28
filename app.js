import {parseCSV,toWords,parseSheetUrl,recordRating,createSession,nextInSession,rateInSession,dueCounts,compareLetters,recoverLegacyProgress,localDayKey,isDueOnCalendarDay,scheduledReviews,todayTrainingStats,dailyRatingStats} from './engine.mjs?v=26';
import {readApiResponse} from './cloud-api.mjs?v=26';
const $=id=>document.getElementById(id), cfg=window.APP_CONFIG||{};
const APP_VERSION='0.26.0';
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
const state={words:[],progress:{},sheet:'',range:'',reviewMode:'practice',session:null,accessToken:null,user:null,supabaseSession:null,googleToken:null,source:'',saving:null,history:[],legacy:null,openedAt:Date.now()};
const hasBackend=!!(cfg.supabaseUrl&&cfg.supabaseAnonKey);
const jsonHeaders=()=>({'apikey':cfg.supabaseAnonKey,'Content-Type':'application/json',...(state.accessToken?{'Authorization':`Bearer ${state.accessToken}`}:{})});
const localKey=()=>`${KEY}:${state.user?.id||'guest'}`;
const storage=()=>{try{return JSON.parse(localStorage.getItem(localKey())||'{}')}catch{return {}}};
function saveLocal(){try{localStorage.setItem(localKey(),JSON.stringify({progress:state.progress,sheet:state.sheet,range:state.range,reviewMode:state.reviewMode,source:state.source,words:state.words,history:state.history,legacy:state.legacy}));}catch(e){console.warn('Local save failed',e);}}
function loadLocal(){const s=storage();state.progress=s.progress||{};state.sheet=s.sheet||cfg.defaultSheetUrl||'';state.range=s.range||'';state.reviewMode=s.reviewMode||'practice';state.source=s.source||'';state.words=s.words||[];state.history=Array.isArray(s.history)?s.history:[];
  // One-time migration from the existing per-word progress (without changing it).
  state.legacy=s.legacy||recoverLegacyProgress(state.progress,state.history);
  if(!s.legacy)saveLocal();
  state.session=null;}
function note(id,message){$(id).textContent=message;}
function focusAnswer(){
  // Wait for the current card to be inserted and visible.
  requestAnimationFrame(()=>{const field=$('typed-answer');if(document.querySelector('#page-study.active')&&!field.readOnly&&!$('study-card').classList.contains('hidden'))field.focus({preventScroll:true});});
}
function showPage(page){for(const el of document.querySelectorAll('.page'))el.classList.toggle('active',el.id===`page-${page}`);for(const b of document.querySelectorAll('[data-page]'))b.classList.toggle('active',b.dataset.page===page);if(page==='study'){renderStudy();focusAnswer();}if(page==='words')renderWords();if(page==='settings')renderSettings();if(page==='history')renderHistory();}
for(const b of document.querySelectorAll('[data-page]'))b.addEventListener('click',()=>showPage(b.dataset.page));
$('go-settings').onclick=()=>showPage('settings');
function renderSettings(){$('sheet-url').value=state.sheet;$('sheet-range').value=state.range;$('review-mode').value=state.reviewMode;$('google-sheet-auth').classList.toggle('hidden',!cfg.googleOAuthClientId);}
function renderWords(){const q=$('word-search').value.trim().toLowerCase();const list=state.words.filter(w=>!q||`${w.ru} ${w.es}`.toLowerCase().includes(q));$('words-empty').classList.toggle('hidden',!!list.length);const body=$('words-table');body.replaceChildren();for(const w of list.slice(0,500)){
  const tr=document.createElement('tr');for(const val of [w.ru,w.es,!state.progress[w.id]?'Новое':isDueOnCalendarDay(state.progress[w.id].due)?'К повторению':'Изучается']){const td=document.createElement('td');td.textContent=val;tr.append(td);}body.append(tr);
}}
$('word-search').oninput=renderWords;
function renderStats(){
 const c=dueCounts(state.words,state.progress);
 $('total-words').textContent=c.total;

 $('new-words').textContent=c.new;
 // Training figures cover today's distinct words and their last rating today.
 const today=todayTrainingStats(state.history);
 $('study-reviewed').textContent=today.reviewed;
 $('study-easy').textContent=today.easy;
 $('study-hard').textContent=today.hard;
 $('study-again').textContent=today.again;
}
function renderStudy(){renderStats();const active=state.words.length>0;$('study-empty').classList.toggle('hidden',state.words.length>0);$('study-card').classList.toggle('hidden',!active);if(!active)return;
  if(!state.session)state.session=createSession(state.words,state.progress,Date.now(),true);
  if(!Array.isArray(state.session.queue))state.session=createSession(state.words,state.progress,Date.now(),true);
  const id=nextInSession(state.session);
  if(!id){state.session=createSession(state.words,state.progress,Date.now(),true);const restarted=nextInSession(state.session);if(!restarted){$('study-card').classList.add('hidden');$('study-notice').textContent='Не удалось выбрать слово. Обнови словарь в настройках.';$('study-notice').classList.remove('hidden');return;}}
  const currentId=state.session.current;
  let word=state.words.find(w=>w.id===currentId);
  if(!word){state.session=createSession(state.words,state.progress,Date.now(),true);word=state.words.find(w=>w.id===nextInSession(state.session));if(!word){$('study-notice').textContent='Не удалось выбрать слово из словаря.';$('study-notice').classList.remove('hidden');return;}}
  $('prompt-word').textContent=word.ru;$('answer-word').textContent=word.es;

  $('typed-answer').readOnly=false;$('typed-answer').value='';$('answer-compare').replaceChildren();$('answer-compare').classList.add('hidden');$('revealed-area').classList.add('hidden');$('reveal').classList.remove('hidden');focusAnswer();
}
function beginNew(){state.session=null;renderStudy();}
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
async function rate(rating){const s=state.session;if(!s?.current)return;const result=rateInSession(s,rating);if(result.save)state.progress[result.id]=recordRating(state.progress[result.id],rating);state.history.push({at:Date.now(),id:result.id,rating,extra:!result.save});saveLocal();renderStudy();await syncProgress(result.id);}
$('rate-again').onclick=()=>rate('again');$('rate-hard').onclick=()=>rate('hard');$('rate-easy').onclick=()=>rate('easy');
function renderHistory(){
 renderStats();
 const reviewed=Object.entries(state.progress).filter(([,r])=>r&&Number.isFinite(r.updated)&&r.updated>0);
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

 $('p-learned').textContent=reviewed.length;
 $('p-hard').textContent=ratings.hard;
 $('p-easy').textContent=ratings.easy;
 $('p-again').textContent=ratings.again;
 const total=state.words.length;const percent=total?Math.round(reviewed.length/total*100):0;
 $('learned-progress-fill').style.width=`${Math.min(percent,100)}%`;
 $('learned-progress-bar').setAttribute('aria-valuenow',Math.min(percent,100));
 $('learned-progress-caption').textContent=`Изучено ${reviewed.length} из ${total} слов · ${percent}%`;
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
 const scheduled=scheduledReviews(state.words,state.progress);
 const today=localDayKey(Date.now());
 const items=[[today,scheduled.today],...scheduled.dates];
 for(const [key,num] of items){const line=document.createElement('div');line.className='schedule-row';
   const left=document.createElement('span');left.textContent=key===today?'Сегодня':niceDate(key);
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
$('refresh-words').onclick=async()=>{if(state.source==='sheet'){await refreshSheet();renderWords();showPage('words');}else renderWords();};
function authorizeGoogle(){if(!cfg.googleOAuthClientId){note('sheet-message','В config.js нужен googleOAuthClientId.');return;}
  if(!window.google?.accounts?.oauth2){note('sheet-message','Не удалось загрузить Google Identity Services.');return;}
  const client=window.google.accounts.oauth2.initTokenClient({client_id:cfg.googleOAuthClientId,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',callback:(res)=>{if(res.error){note('sheet-message',res.error);return;}state.googleToken=res.access_token;note('sheet-message','Доступ разрешён. Нажми «Подключить / обновить».');}});client.requestAccessToken({prompt:'consent'});
}
$('google-sheet-auth').onclick=authorizeGoogle;
function download(name,data){const blob=new Blob([data],{type:'application/json;charset=utf-8'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),500);}
$('export-data').onclick=()=>download('slova-progress.json',JSON.stringify({version:1,progress:state.progress,history:state.history,legacy:state.legacy,sheet:state.sheet,range:state.range},null,2));
$('import-data').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());if(data.version!==1||typeof data.progress!=='object'||!data.progress||Array.isArray(data.progress))throw new Error('Неподдерживаемый формат.');state.progress=data.progress;state.history=Array.isArray(data.history)?data.history:[];state.legacy=data.legacy||recoverLegacyProgress(state.progress,state.history);saveLocal();beginNew();note('import-message','Прогресс импортирован локально.');if(state.user)await syncAll();}catch(err){note('import-message',`Ошибка импорта: ${err.message}`);}e.target.value='';};
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
  if(oldUser!==state.user?.id){loadLocal();if(state.user)await loadCloud();}
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
  try{
    const uid=encodeURIComponent(state.user.id);
    const [rows,events]=await Promise.all([
      api(`/rest/v1/word_progress?user_id=eq.${uid}&select=word_id,state`),
      api(`/rest/v1/review_history?user_id=eq.${uid}&select=event_id,word_id,rating,answered_at,extra`)
    ]);
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
    state.history.sort((a,b)=>a.at-b.at);
    saveLocal();beginNew();renderHistory();
    await syncEntries(localNewer,[]);
  }catch(e){console.warn('Cloud load failed:',e);$('study-notice').textContent=`Облачная синхронизация недоступна: ${e.message}. Локальные ответы сохранены.`;$('study-notice').classList.remove('hidden');if(throwOnError)throw e;}
}
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
  try{await syncEntries(state.progress[id]?{[id]:state.progress[id]}:{},state.history.slice(-1));}
  catch(e){console.warn('Cloud sync failed:',e);$('study-notice').textContent='Облачная запись временно недоступна. Локальная копия сохранена.';$('study-notice').classList.remove('hidden');}
}
async function syncAll(){
  if(!state.user)return;
  // Always merge cloud before importing older backups; never overwrite newer values.
  try{await loadCloud({throwOnError:true});await syncEntries(state.progress,state.history);note('import-message','Прогресс и история синхронизированы с облаком.');}
  catch(e){note('import-message',`Локальный импорт сохранён, ошибка синхронизации: ${e.message}`);}
}
async function init(){loadLocal();renderSettings();renderStudy();if(state.sheet&&state.source!=='sheet')refreshSheet();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);

  if(hasBackend)await restoreAuth();
}
init();
