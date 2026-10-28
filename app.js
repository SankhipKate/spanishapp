import {parseCSV,toWords,parseSheetUrl,recordRating,createSession,nextInSession,rateInSession,dueCounts,compareLetters,recoverLegacyProgress,localDayKey,isDueOnCalendarDay,scheduledReviews,todayTrainingStats,dailyRatingStats} from './engine.mjs?v=23';
const $=id=>document.getElementById(id), cfg=window.APP_CONFIG||{};
const KEY='palabras:v1';
const DEMO=[['Русский','Испанский'],['дом','casa'],['сегодня','hoy'],['говорить','hablar'],['работать','trabajar'],['красивый','lindo, bonito'],['школа','escuela'],['вчера','ayer'],['утро','mañana'],['вода','agua'],['читать','leer']];
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
async function api(path,options={}){if(!hasBackend)throw new Error('Supabase пока не настроен.');const r=await fetch(`${cfg.supabaseUrl.replace(/\/$/,'')}${path}`,{...options,headers:{...jsonHeaders(),...(options.headers||{})}});if(!r.ok){let msg;try{msg=JSON.stringify(await r.json())}catch{msg=r.statusText}throw new Error(`${r.status}: ${msg}`);}return r.status===204?null:r.json();}
let refreshTimer;
async function receiveSession(session){state.supabaseSession=session;state.accessToken=session?.access_token||null;state.user=session?.user||null;if(session)localStorage.setItem(`${KEY}:auth`,JSON.stringify(session));else localStorage.removeItem(`${KEY}:auth`);
  $('account-status').textContent=state.user?.email||'Гостевой режим';$('account-button').textContent=state.user?'Аккаунт':'Войти';$('logout').classList.toggle('hidden',!state.user);
  clearTimeout(refreshTimer);if(session?.expires_in)refreshTimer=setTimeout(()=>refreshSession(),Math.max(30000,(session.expires_in-60)*1000));
  loadLocal();if(state.user)await loadCloud();renderSettings();renderStudy();}
async function refreshSession(){if(!state.supabaseSession?.refresh_token)return;try{const r=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:state.supabaseSession.refresh_token})});await receiveSession(r);}catch(e){console.warn('Session refresh failed:',e);}}
async function restoreAuth(){if(!hasBackend)return;let existing;try{existing=JSON.parse(localStorage.getItem(`${KEY}:auth`)||'null')}catch{}if(existing?.refresh_token){state.supabaseSession=existing;state.accessToken=existing.access_token;if(!existing.expires_at||existing.expires_at*1000<Date.now()+60000)await refreshSession();else await receiveSession(existing);}
  const url=new URL(location.href);if(url.searchParams.has('code')){note('login-message','Подтверждаю вход…');try{const res=await api('/auth/v1/token?grant_type=pkce',{method:'POST',body:JSON.stringify({auth_code:url.searchParams.get('code')})});await receiveSession(res);}catch(e){console.error(e);}url.searchParams.delete('code');history.replaceState({},'',url);} }
function tokenFromHash(){const h=new URLSearchParams(location.hash.substring(1));if(h.has('access_token')){const t={access_token:h.get('access_token'),refresh_token:h.get('refresh_token'),expires_in:parseInt(h.get('expires_in')||'3600',10)};history.replaceState({},'',location.pathname+location.search);return t;}return null;}
$('account-button').onclick=()=>{note('login-message',hasBackend?'':'Синхронизация будет доступна после настройки Supabase.');$('login-dialog').showModal();};
$('send-login').onclick=async()=>{if(!hasBackend){note('login-message','Владелец приложения ещё не настроил Supabase.');return;}const email=$('login-email').value.trim();if(!email){note('login-message','Введи email.');return;}
  try{await api('/auth/v1/otp',{method:'POST',body:JSON.stringify({email,create_user:true,options:{email_redirect_to:location.origin+location.pathname}})});note('login-message','Проверь почту: ссылка для входа отправлена.');}catch(e){note('login-message',`Не удалось отправить письмо: ${e.message}`);}};
$('logout').onclick=async()=>{try{await api('/auth/v1/logout',{method:'POST'});}catch{}await receiveSession(null);$('login-dialog').close();};
async function loadCloud(){try{const [settings,rows]=await Promise.all([api(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(state.user.id)}&select=sheet_url,sheet_range,review_mode`),api(`/rest/v1/reviews?user_id=eq.${encodeURIComponent(state.user.id)}&select=word_id,data`)]);
    if(settings?.length){state.sheet=settings[0].sheet_url||state.sheet;state.range=settings[0].sheet_range||state.range;state.reviewMode=settings[0].review_mode||state.reviewMode;}
    for(const r of rows||[]){if(!state.progress[r.word_id]||r.data.updated>state.progress[r.word_id].updated)state.progress[r.word_id]=r.data;}
    if(!state.history.length&&!state.legacy?.words)state.legacy=recoverLegacyProgress(state.progress,state.history);
    saveLocal();if(state.sheet&&(!state.words.length||state.source!=='sheet')){state.source='sheet';await refreshSheet();}
  }catch(e){console.warn('Cloud unavailable:',e);$('study-notice').textContent='Синхронизация временно недоступна, результаты сохраняются на устройстве.';$('study-notice').classList.remove('hidden');}}
async function saveProfile(){if(!state.user)return;try{await api('/rest/v1/profiles?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:state.user.id,sheet_url:state.sheet,sheet_range:state.range,review_mode:state.reviewMode})});}catch(e){console.warn('Profile sync:',e);}}
async function syncProgress(id){if(!state.user||!state.progress[id])return;try{await api('/rest/v1/reviews?on_conflict=user_id,word_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:state.user.id,word_id:id,data:state.progress[id]})});}catch(e){console.warn('Review sync:',e);$('study-notice').textContent='Сейчас нет связи с сервером. Результат сохранён на устройстве, экспорт доступен в настройках.';$('study-notice').classList.remove('hidden');}}
async function syncAll(){for(const id of Object.keys(state.progress))await syncProgress(id);}
async function init(){loadLocal();renderSettings();renderStudy();if(state.sheet&&state.source!=='sheet')refreshSheet();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);
  if(cfg.googleOAuthClientId){const el=document.createElement('script');el.src='https://accounts.google.com/gsi/client';el.async=true;document.head.append(el);}
  if(hasBackend){const hash=tokenFromHash();if(hash){try{const u=await api('/auth/v1/user',{headers:{Authorization:`Bearer ${hash.access_token}`}});hash.user=u;await receiveSession(hash);}catch(e){console.warn(e);}}else await restoreAuth();}
}
init();
