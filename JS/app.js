const STORAGE_KEY='aiStudyPlannerV3Tasks'; // v4 사용자 데이터와 호환 유지
const ANALYSIS_KEY='aiStudyPlannerV3Analysis'; // v4 분석 데이터와 호환 유지
const AVAIL_KEY='aiStudyPlannerAvail'; // v6: 요일별 가용 시간(월~일, 시간 단위)
const DEFAULT_AVAIL=[2,2,2,2,2,3,3];
const USER_KEY='aiStudyPlannerUser'; // 현재 로그인한 닉네임(이 브라우저의 세션)
const ACCOUNTS_KEY='aiStudyPlannerAccounts'; // 이 브라우저의 로컬 계정 {닉네임:{salt,hash}}
const OVR_KEY='aiStudyPlannerAvailOverride'; // v7: 특정 날짜만 가용 시간 수정
const APPT_KEY='aiStudyPlannerAppts'; // v3.0: 개인 약속 [{id,title,date,start,end}] — 가용 시간 계산에만 쓰고 AI로 보내지 않는다
const MAX_NOTICE=2000, AI_TIMEOUT_MS=10000; // v3.0: 공지 입력 길이 제한, AI 응답 대기 한도
// v7: AI 중계 서버 주소. 비워 두면 규칙 기반 Mock으로 동작한다. API 키는 이 파일에 넣지 않는다(중계 서버에서만 보관).
const AI_ENDPOINT='';
// v3.2: 저장소는 이 객체 한곳으로 모은다(localStorage). 구글 시트 연동 때는 이 객체의 구현만 서버 호출로 바꾸고, 화면·계산 코드는 건드리지 않는다.
const Store={
 get(base){try{return JSON.parse(localStorage.getItem(K(base)))}catch(e){return null}},          // 현재 계정의 데이터 읽기
 set(base,v){localStorage.setItem(K(base),JSON.stringify(v));if(Sync&&user)Sync.touch()}, // 서버 모드면 변경을 서버로 보낼 대상으로 표시                                   // 현재 계정의 데이터 쓰기
 del(base){localStorage.removeItem(K(base))},                                                    // 현재 계정의 데이터 삭제
 delFor(base,id){localStorage.removeItem(base+'::'+id)},                                         // 지정한 계정의 데이터 삭제(계정 삭제용)
 session:{get(){try{return localStorage.getItem(USER_KEY)||''}catch(e){return ''}},set(id){try{id?localStorage.setItem(USER_KEY,id):localStorage.removeItem(USER_KEY)}catch(e){}}},
 accounts:{get(){try{return JSON.parse(localStorage.getItem(ACCOUNTS_KEY))||{}}catch(e){return {}}},set(a){localStorage.setItem(ACCOUNTS_KEY,JSON.stringify(a))}}
};
let user=loadUser(), authMode='login', tasks=loadTasks(), avail=loadAvail(), ovr=loadOvr(), appts=loadAppts(), draft=null, extractCtl=null, lastNotice='', formTab='direct', currentView='today', lastMain='today', selectedDate=isoDate(new Date()), weekStart=isoDate(startOfWeek(new Date())), editingId=null, listFilter='전체', listSort='due', pasteState='input', commentCache=null;
const esc=s=>escapeHtml(s);
const CHK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const SPARK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>';
const STATE_LABEL={ok:'여유',tight:'빠듯',bad:'부족',none:'일정 없음'};
const STATE_COLOR={ok:'var(--c-ok)',tight:'var(--c-tight)',bad:'var(--c-bad)',none:'var(--c-none)'};
const $=id=>document.getElementById(id);
function K(base){return user?base+'::'+user:base} // 로그인하면 계정별 키, 로그인 전은 기존 키
function loadTasks(){try{return Store.get(STORAGE_KEY)||[]}catch(e){return []}}
function loadAnalysis(){try{return Store.get(ANALYSIS_KEY)}catch(e){return null}}
function loadAvail(){try{const a=Store.get(AVAIL_KEY);return Array.isArray(a)&&a.length===7?a.map(Number):DEFAULT_AVAIL.slice()}catch(e){return DEFAULT_AVAIL.slice()}}
function loadUser(){return Store.session.get()}
function loadAppts(){try{const a=Store.get(APPT_KEY);return Array.isArray(a)?a:[]}catch(e){return []}}
function persistAppts(){Store.set(APPT_KEY,appts)}
function loadOvr(){try{return Store.get(OVR_KEY)||{}}catch(e){return {}}}
function persist(){commentCache=null;if(user)Store.set(STORAGE_KEY,tasks);$('settingsCount').textContent=tasks.length+'개'}
function isoDate(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`}
function dateObj(s){return new Date(s+'T12:00:00')}
function fmt(s){if(!s)return '-';const d=dateObj(s);return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}

/* ===== v3.0: 화면 이동 — 하단 탭 5개(오늘 / 계획 / ＋ / 일정 / 마이) ===== */
const MAIN=['today','plan','list','settings'];
const NAV_OF={today:'today',plan:'plan',list:'list',detail:'list',settings:'settings',terms:'settings',privacy:'settings'};
function renderView(v){
 if(v==='today')renderToday();
 else if(v==='plan')renderPlan();
 else if(v==='list')renderList();
 else if(v==='settings'){$('settingsCount').textContent=tasks.length+'개';renderAvail();renderProfile()}
 else if(v==='detail')renderDetail();
 else if(v==='auth')renderAuth();
 else if(v==='intro')renderIntro();
}
function navigate(view){
 if(view==='home')view='today';
 if(!user&&view!=='auth'&&view!=='intro'&&view!=='terms'&&view!=='privacy')view='auth'; // v3.1: 로그인 전에는 로그인 화면만 연다
 currentView=view;if(MAIN.includes(view))lastMain=view;
 document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+view));
 document.querySelectorAll('[data-nav]').forEach(b=>{const on=b.dataset.nav===NAV_OF[view];b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 $('shell').dataset.view=view;$('shell').dataset.auth=user?'in':'out';closeSheet();renderView(view);window.scrollTo(0,0);
}
function refresh(){renderView(currentView)}
function goBack(){navigate(lastMain)}
function focusDate(s){selectedDate=s;weekStart=isoDate(startOfWeek(dateObj(s)))}

/* ===== 일정 종류 색 · D-day ===== */
const TYPE_STYLE={'과제':'#3452E1','시험':'#D6455D','발표':'#0F8F83','팀 프로젝트':'#7C5CE0'};
function typeColor(t){return TYPE_STYLE[t]||TYPE_STYLE['과제']}
function daysLeft(t){return Math.round((dateObj(t.date)-dateObj(isoDate(new Date())))/86400000)}
function dday(t){if(t.status==='완료')return {label:'완료',cls:'rd'};const d=daysLeft(t);return d<0?{label:'지남',cls:'r1'}:d===0?{label:'오늘',cls:'r1'}:{label:'D-'+d,cls:d<=1?'r1':d<=3?'r2':'r3'}}
function setStatus(t,st){t.status=st;if(st==='완료')t.doneAt=isoDate(new Date());else delete t.doneAt}
function todayKey(){return isoDate(new Date())}
function sortAlloc(items){return items.slice().sort((a,b)=>{const ta=tasks.find(x=>x.id===a.id),tb=tasks.find(x=>x.id===b.id);return ((ta&&ta.date)||'').localeCompare((tb&&tb.date)||'')||(a.ord||0)-(b.ord||0)})}

/* ===== 주간 계산(요일별 가용 · 배정 · 부족) — 모두 코드가 계산한다 ===== */
function weekDays(base,plan){
 const today=todayKey();
 return Array.from({length:7},(_,i)=>{const d=new Date(base);d.setDate(base.getDate()+i);const k=isoDate(d),n=DAY_NAMES[(d.getDay()+6)%7];
  const x={n,d,k,date:d.getDate(),cap:availOn(d),used:plan.used[k]||0,short:plan.short[k]||0,past:k<today,today:k===today};
  x.state=x.short>0.001?'bad':tightDay(x)?'tight':(x.used>0?'ok':'none');return x});
}
function loadBars(days,h){
 // v3.1: 막대 위에 시간 숫자, 막대 뒤에 연한 트랙, 검은 실선이 내 가용 시간. 범례를 함께 그린다.
 const max=Math.max(4,...days.map(x=>Math.max(x.cap,x.used+x.short)));
 const cols=days.map(x=>{
  const tot=x.used+x.short,fh=tot>0?Math.max(6,tot/max*h):0,ch=x.cap/max*h;
  return `<div class="lb-c ${x.past?'past':''} ${x.today?'today':''}" role="img" aria-label="${x.n}요일 가용 ${hh(x.cap)}, 배정 ${hh(tot)}, ${STATE_LABEL[x.state]}"><span class="lb-v ${x.state}">${tot>0?hh(tot):'–'}</span><div class="lb-b" style="height:${h}px">${x.cap>0?`<i class="lb-cap" style="bottom:${ch.toFixed(0)}px"></i>`:''}<i class="lb-f ${x.state}" style="height:${fh.toFixed(0)}px"></i></div><span class="lb-d">${x.n}</span></div>`}).join('');
 return `<div class="lb">${cols}</div><div class="lb-leg"><span><i class="k fill"></i>배정 시간</span><span><i class="k cap"></i>내 가용 시간</span></div>`;
}
function hh(x){return (Math.round(x*10)/10)+'h'}
function tightDay(x){return x.cap>0&&x.short<=0.001&&x.used/x.cap>=.9}
function startOfWeek(d){const x=new Date(d);x.setHours(12,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}

/* ===== 오늘 ===== */
function doneToday(){
 const k=todayKey(),out=[];
 tasks.forEach(t=>{
  if(t.steps&&t.steps.length){t.steps.forEach(s=>{if(s.done&&s.doneAt===k)out.push({id:t.id,sid:s.id,title:t.title,step:s.name,h:s.h,done:true})})}
  else if(t.status==='완료'&&t.doneAt===k)out.push({id:t.id,sid:'',title:t.title,step:'',h:t.effort/60,done:true});
 });
 return out;
}
function renderToday(){
 const plan=buildPlan(),k=todayKey(),pend=sortAlloc(plan.alloc[k]||[]),dn=doneToday(),left=pend.reduce((a,x)=>a+x.h,0);
 $('todayLabel').textContent=(user?user+'님 · ':'')+new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long'}).format(new Date());
 $('todayTitle').innerHTML=!tasks.length?'일정을 추가해 보세요':pend.length?`오늘 할 일 <em>${pend.length}개</em>, ${hh(left)}`:dn.length?'오늘 할 일을 모두 끝냈어요':'오늘 배정된 일이 없어요';
 renderSummary(plan);
 $('allocMeta').textContent=(pend.length||dn.length)?`${dn.length} / ${pend.length+dn.length} 완료${pend.length?' · 남은 '+hh(left):''}`:'';
 const rows=pend.concat(dn).map(todayRow).join('');
 $('homeAlloc').innerHTML=rows||(tasks.length?'<div class="card empty">오늘 배정된 작업이 없어요.<br>계획 탭에서 이번 주를 확인해 보세요.</div>':'<div class="card empty">등록된 일정이 없어요.<br>아래 ＋ 버튼으로 공지를 붙여넣거나 직접 추가해 보세요.<br><button class="btn sm" style="margin-top:10px" onclick="seedSample()">예시 데이터 넣기</button></div>');
 $('sampleNotice').hidden=!tasks.some(t=>t.sample);
 renderComment();
}
function todayRow(x){
 const t=tasks.find(y=>y.id===x.id);if(!t)return '';
 const d=dday(t),c=typeColor(t.type);
 return `<div class="card tkrow ${x.done?'done':''}"><button class="chk ${x.done?'on':''}" onclick="checkItem('${t.id}','${x.sid||''}')" aria-label="${esc(x.step||t.title)} ${x.done?'완료 취소':'완료로 표시'}" aria-pressed="${!!x.done}"><i>${x.done?CHK:''}</i></button><button class="grow" onclick="openDetail('${t.id}')"><div class="ttl">${esc(x.step||t.title)}${t.sample?' <span class="pill sample">예시</span>':''}</div><div class="sub2"><i class="dot" style="background:${c}"></i>${x.step?esc(t.title):esc(t.type)}</div></button><div class="rt"><b class="num">${hh(x.h)}</b><span class="dday ${d.cls}">${d.label}</span></div></div>`;
}
function checkItem(id,sid){
 const t=tasks.find(x=>x.id===id);if(!t)return;
 if(sid){toggleStep(id,sid);return}
 const was=t.status==='완료';setStatus(t,was?'시작 전':'완료');persist();refresh();toast(was?'완료를 취소했어요.':'완료로 표시했어요.');
}
// 앞으로 7일 판단: 오늘부터 7일의 필요 시간과 가용 시간을 비교한다. 빠듯함 기준(가용 시간의 90% 이상)은 이 프로토타입에서 정한 값이다.
function renderSummary(plan){
 const el=$('homeSummary');if(!el)return;
 const t0=dateObj(todayKey()),days=weekDays(t0,plan),last=days[6].k;
 let cap=0,need=0;days.forEach(x=>{cap+=x.cap;need+=x.used+x.short});
 const active=tasks.some(t=>t.status!=='완료');
 const all=Object.keys(plan.short).filter(k=>plan.short[k]>0.001).sort(),keys=all.filter(k=>k<=last),later=all.filter(k=>k>last);
 const ratio=cap>0?need/cap:(need>0?1.2:0);
 let st='none',title='판단할 일정이 아직 없어요',desc='일정을 추가하면 앞으로 7일을 해낼 수 있는지 판단해 드려요.';
 if(!active&&tasks.length){title='모든 일정을 완료했어요';desc='새 일정을 추가하면 다시 판단해 드려요.'}
 if(active){
  if(keys.length){st='bad';title='앞으로 7일, 시간이 부족해요';desc=`가용 ${hh(cap)}에 필요한 시간은 ${hh(need)}예요. ${dayWord(keys[0])} 마감 일정에서 ${hh(plan.short[keys[0]])}가 모자라요${keys.length>1?` (외 ${keys.length-1}일)`:''}.`}
  else if(ratio>=.9){st='tight';title='앞으로 7일은 빠듯해요';desc=`가용 ${hh(cap)} 중 ${hh(need)}를 써요. 일정이 늘면 부족해질 수 있어요.`}
  else{st='ok';title='앞으로 7일은 여유 있어요';desc=`가용 ${hh(cap)} 중 ${hh(need)}를 써요. 입력한 가용 시간 안에서 끝낼 수 있어요.`}
  if(!keys.length&&later.length)desc+=` 이후 마감인 ${dayWord(later[0])} 일정에서는 ${hh(plan.short[later[0]])}가 부족해요.`;
 }
 const tg={ok:'good',tight:'warn',bad:'bad',none:'rule'}[st];
 el.innerHTML=`<div class="card sum"><div class="row" style="margin-bottom:8px"><span class="tag ${tg}">${title}</span><span class="tag rule">규칙</span><div class="grow"></div>${active?`<span class="num pct">${Math.round(ratio*100)}<small>%</small></span>`:''}</div><div class="d">${desc}</div>${active?loadBars(days,92):''}</div>`;
}
function dayWord(k){const d=Math.round((dateObj(k)-dateObj(todayKey()))/86400000);if(d<=0)return '오늘';if(d===1)return '내일';if(d<7)return DAY_NAMES[(dateObj(k).getDay()+6)%7]+'요일';const x=dateObj(k);return `${x.getMonth()+1}/${x.getDate()}`}
// 코멘트: 서버가 연결되면 AI, 아니면 규칙 문장. 어느 쪽인지 태그로 구분해서 보여준다.
function ruleComment(){
 const plan=buildPlan(),items=sortAlloc(plan.alloc[todayKey()]||[]),adv=buildAdvice(plan);
 let text=items.length?`오늘은 ${items.map(a=>`${a.step||a.title} ${fh(a.h)}`).join(', ')} 순서로 진행하세요.`:'오늘 배정된 작업이 없습니다.';
 if(adv.length)text+=` 다만 ${adv.map(a=>a.title).join(', ')}은(는) 가용 시간이 부족하니 일정이나 가용 시간을 조정해 보세요.`;
 return text;
}
function renderComment(){
 const el=$('aiComment');if(!el)return;
 if(!tasks.some(t=>t.status!=='완료')){el.hidden=true;return}
 el.hidden=false;
 const c=commentCache&&commentCache.day===todayKey()?commentCache:{text:ruleComment(),mode:'규칙'};
 el.innerHTML=`<div class="row">${c.mode==='AI'?`<span class="tag ai">${SPARK}AI 코멘트</span>`:'<span class="tag rule">오늘의 한마디 · 규칙 기반</span>'}<div class="grow"></div>${AI_ENDPOINT?'<button class="link" onclick="getAiComment()">AI로 받기</button>':''}</div><p>${esc(c.text)}</p>${c.mode==='AI'||AI_ENDPOINT?'':'<p class="small muted">AI 서버가 연결되면 AI가 코멘트를 써 줘요.</p>'}`;
}
async function getAiComment(){
 const plan=buildPlan(),items=sortAlloc(plan.alloc[todayKey()]||[]),adv=buildAdvice(plan);
 let text=null,mode='규칙';
 if(AI_ENDPOINT){try{const x=await aiCall('comment',{today:items.map(a=>({title:a.title,hours:a.h})),shortages:adv.map(a=>({title:a.title,shortHours:a.short,days:a.days}))});if(x&&typeof x.comment==='string'&&x.comment.trim()){text=x.comment.trim();mode='AI'}}catch(e){toast('AI 연결에 실패해 기본 문장을 보여줍니다.')}}
 if(!text)text=ruleComment();
 commentCache={text,mode,day:todayKey()};renderComment();
}

/* ===== 계획: 주간 스트립 · 선택한 날의 배정/약속/부족 · 가용 시간 · 주간 부하 ===== */
function shiftWeek(n){const d=dateObj(weekStart);d.setDate(d.getDate()+7*n);weekStart=isoDate(d);const s=dateObj(selectedDate);s.setDate(s.getDate()+7*n);selectedDate=isoDate(s);renderPlan()}
function selectDate(s){focusDate(s);renderPlan()}
function renderPlan(){
 const base=dateObj(weekStart),plan=buildPlan(),days=weekDays(base,plan),end=new Date(base);end.setDate(base.getDate()+6);
 $('planRange').textContent=`${base.getMonth()+1}월 ${base.getDate()}일 – ${end.getMonth()+1}월 ${end.getDate()}일`;
 $('weekGrid').innerHTML=days.map(x=>`<button class="day ${x.k===selectedDate?'sel':''} ${x.today?'today':''}" onclick="selectDate('${x.k}')" aria-label="${x.d.getMonth()+1}월 ${x.date}일 ${x.n}요일, ${STATE_LABEL[x.state]}" aria-pressed="${x.k===selectedDate}"><span class="dn">${x.n}</span><span class="num">${x.date}</span><i class="sdot ${x.state}"></i></button>`).join('');
 renderDayCard(plan);renderDayAvail();renderLoad('scheduleLoad',base,plan,days);
}
function renderDayCard(plan){
 const k=selectedDate,d=dateObj(k),today=todayKey();
 const cap=availOn(d),used=plan.used[k]||0,sh=plan.short[k]||0,x={cap,used,short:sh};
 const state=sh>0.001?'bad':tightDay(x)?'tight':(used>0?'ok':'none');
 const items=sortAlloc(plan.alloc[k]||[]),al=appts.filter(a=>a.date===k).sort((a,b)=>a.start.localeCompare(b.start)),ah=apptHours(k),has=ovr[k]!==undefined;
 const capSub=has?'직접 수정':(al.length?`기본 ${hh(baseAvail(d))} − 약속 ${hh(ah)}`:'요일 기본값');
 const tg={ok:'good',tight:'warn',bad:'bad',none:'rule'}[state];
 const dnRows=k===today?doneToday().map(a=>`<div class="tl"><i class="tl-bar" style="background:var(--c-ok)"></i><span class="grow"><b class="muted" style="text-decoration:line-through">${esc(a.step||a.title)}</b><small>${a.step?esc(a.title):''}</small></span><span class="tag good">완료</span><span class="num muted">${hh(a.h)}</span></div>`).join(''):'';
 const rows=items.map(a=>{const t=tasks.find(y=>y.id===a.id);if(!t)return '';return `<button class="tl" onclick="openDetail('${t.id}')"><i class="tl-bar" style="background:${typeColor(t.type)}"></i><span class="grow"><b>${esc(a.step||t.title)}</b><small>${a.step?esc(t.title):esc(t.type)}</small></span><span class="num">${hh(a.h)}</span></button>`}).join('');
 const arows=al.map(a=>`<div class="tl"><i class="tl-bar hatch"></i><span class="grow"><b class="muted">${esc(a.title)}</b><small>${a.start}–${a.end} · 개인 약속</small></span><span class="num muted">−${hh((toMin(a.end)-toMin(a.start))/60)}</span></div>`).join('');
 const sht=tasks.filter(t=>t.status!=='완료'&&plan.taskShort[t.id]&&(t.date<today?today:t.date)===k),adv=buildAdvice(plan);
 const sbox=sht.length?`<div class="shortbox"><b>배정하지 못한 시간 ${hh(sht.reduce((a,t)=>a+plan.taskShort[t.id],0))}</b><small>${sht.map(t=>esc(t.title)+' '+hh(plan.taskShort[t.id])).join(' · ')}</small><details><summary>조정 방법 보기</summary>${sht.map(t=>{const a=adv.find(y=>y.id===t.id);return a?`<p><b>${esc(t.title)}</b> 마감까지 ${a.days}일 동안 하루 ${fh(a.perDay)}씩 더 확보하거나, 소요 시간을 줄이거나, 다른 일정을 미뤄야 해요.</p>`:''}).join('')}</details></div>`:'';
 const wd=DAY_NAMES[(d.getDay()+6)%7];
 $('dayCard').innerHTML=`<div class="card"><div class="dhead"><h3>${d.getMonth()+1}월 ${d.getDate()}일 ${wd}요일</h3><span class="tag ${tg}">${STATE_LABEL[state]}</span><span class="tag rule">규칙</span></div>
 <div class="stats3"><div><small>가용</small><b class="num">${hh(cap)}</b><small>${capSub}</small></div><div><small>배정</small><b class="num">${hh(used)}</b><small>${items.length}건</small></div><div class="${sh>0.001?'bad':''}"><small>${sh>0.001?'부족':'여유'}</small><b class="num">${hh(sh>0.001?sh:Math.max(0,cap-used))}</b></div></div>
 ${rows}${dnRows}${arows}${sbox}${(rows||dnRows||arows||sbox)?'':'<div class="empty">이 날 배정된 일이 없어요.</div>'}</div>`;
}
function renderDayAvail(){
 const el=$('dayAvail');if(!el)return;
 const d=dateObj(selectedDate),has=ovr[selectedDate]!==undefined,al=appts.filter(x=>x.date===selectedDate).sort((x,y)=>x.start.localeCompare(y.start));
 el.innerHTML=`<div class="lbl">이 날 가용 시간</div><p class="small muted" style="margin:2px 0 10px">${has?'직접 수정한 값이에요. 개인 약속 시간은 따로 빠지지 않아요.':'요일 기본값에서 개인 약속 시간을 뺀 값이에요.'}</p><div class="row"><label class="sr" for="ovrIn">가용 시간(시간)</label><input id="ovrIn" class="ovr num" type="number" min="0" max="16" step="0.5" value="${availOn(d)}" onchange="setOvr('${selectedDate}',this.value)"><span class="muted">시간</span><div class="grow"></div><button class="btn sm" onclick="setOvr('${selectedDate}','')">기본값으로</button></div>${al.length?`<div style="margin-top:8px">${al.map(x=>`<div class="line"><span>${esc(x.title)} · ${x.start}–${x.end}</span><button class="btn sm" onclick="deleteAppt('${x.id}')" aria-label="${esc(x.title)} 약속 삭제">삭제</button></div>`).join('')}</div>`:''}<button class="btn full" onclick="openAppt()">＋ 개인 약속 추가</button>`;
}
function renderLoad(elId,base,plan,days){
 const el=$(elId);if(!el)return;
 plan=plan||buildPlan();days=days||weekDays(base,plan);
 const over=days.filter(x=>x.short>0.001),total=over.reduce((a,x)=>a+x.short,0),has=tasks.some(t=>t.status!=='완료');
 el.innerHTML=`<div class="row" style="margin-bottom:12px"><div class="lbl grow">주간 부하</div></div>${loadBars(days,100)}<p class="lw ${over.length?'bad':''}">${!has?'일정을 등록하면 주간 부하가 표시돼요.':over.length?`가용 시간이 부족한 날이 ${over.length}일 있어요(합계 ${hh(total)}). 빨간 막대는 마감 전까지 배정하지 못한 시간이 있는 날이에요.`:'이 주는 입력한 가용 시간 안에서 소화할 수 있어요.'}</p>`;
}

/* ===== 일정 목록: 필터 · 정렬 · 우선순위(규칙) ===== */
const FILTERS=['전체','과제','시험','발표','팀 프로젝트','완료'];
function setFilter(f){listFilter=f;renderList()}
function toggleSort(){listSort=listSort==='due'?'prio':'due';renderList()}
function prioMap(){
 const m={};tasks.filter(t=>t.status!=='완료').map(t=>({t,s:scoreTask(t).score})).sort((a,b)=>b.s-a.s||a.t.date.localeCompare(b.t.date)).forEach((x,i)=>{m[x.t.id]={rank:i+1,score:x.s}});
 return m;
}
function reasonOf(t,plan){
 const {days}=scoreTask(t);
 let r=days<0?'마감일이 지났어요.':days===0?'마감일이 오늘이에요.':`마감까지 ${days}일 남았어요.`;
 r+=` 중요도 ${t.importance}, 예상 소요 시간 ${effortLabel(t.effort)}을 반영했어요.`;
 if(plan.taskShort[t.id])r+=` 가용 시간 기준으로 마감 전까지 약 ${fh(plan.taskShort[t.id])}이 부족해요.`;
 return r;
}
function renderList(){
 const pm=prioMap(),plan=buildPlan();
 $('chips').innerHTML=FILTERS.map(f=>`<button class="chip ${f===listFilter?'on':''}" onclick="setFilter('${f}')" aria-pressed="${f===listFilter}">${f==='팀 프로젝트'?'팀':f}</button>`).join('');
 $('sortBtn').textContent=listSort==='due'?'마감순':'우선순위순';
 const active=tasks.filter(t=>t.status!=='완료'),shown=tasks.filter(t=>listFilter==='전체'?true:listFilter==='완료'?t.status==='완료':(t.type===listFilter&&t.status!=='완료'));
 const cmp=listSort==='prio'?(a,b)=>(pm[a.id]?.rank||999)-(pm[b.id]?.rank||999):(a,b)=>a.date.localeCompare(b.date);
 const list=shown.filter(t=>t.status!=='완료').sort(cmp).concat(shown.filter(t=>t.status==='완료').sort((a,b)=>b.date.localeCompare(a.date)));
 $('listMeta').textContent=`진행 중 ${active.length}개 · 완료 ${tasks.length-active.length}개`;
 $('listItems').innerHTML=list.length?list.map(t=>listCard(t,pm,plan)).join(''):`<div class="card empty">${tasks.length?'이 조건에 맞는 일정이 없어요.':'등록된 일정이 없어요.<br>아래 ＋ 버튼으로 추가해 보세요.'}</div>`;
}
let openCardId=null; // v3.5: 일정 카드는 접어 두고, 누르면 펼쳐서 나머지 정보를 보여 준다
function toggleCard(id){openCardId=openCardId===id?null:id;renderList()}
function listCard(t,pm,plan){
 const d=dday(t),p=pm[t.id],sh=plan.taskShort[t.id],x=dateObj(t.date),c=typeColor(t.type),n=t.steps?t.steps.length:0,dn=n?t.steps.filter(s=>s.done).length:0,open=openCardId===t.id;
 const kv=(k,v)=>`<div class="kv"><span>${k}</span><b>${v}</b></div>`;
 return `<div class="lc ${open?'open':''} ${t.status==='완료'?'done':''}"><button class="lc-h" onclick="toggleCard('${t.id}')" aria-expanded="${open}"><i class="dot" style="background:${c}" aria-hidden="true"></i><span class="ttl grow">${esc(t.title)}${t.sample?' <span class="pill sample">예시</span>':''}</span><span class="dday ${d.cls}">${d.label}</span><svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg></button>${dn?`<div class="progress" aria-hidden="true"><i style="width:${Math.round(dn/n*100)}%"></i></div>`:''}${sh?`<div class="tags"><span class="tag bad">${hh(sh)} 부족</span></div>`:''}${open?`<div class="lc-x">${kv('종류',esc(t.type))}${kv('마감',`${x.getMonth()+1}월 ${x.getDate()}일 (${DAY_NAMES[(x.getDay()+6)%7]})`)}${n?kv('단계',`${dn} / ${n} 완료`):''}${p?kv('우선순위',`${p.rank}위`):''}<button class="btn full" onclick="openDetail('${t.id}')">자세히 보기</button></div>`:''}</div>`;
}

/* ===== 일정 상세 ===== */
function openDetail(id){editingId=id;navigate('detail')}
function renderDetail(){
 const t=tasks.find(x=>x.id===editingId);
 if(!t){$('detailContent').innerHTML='<div class="card empty">일정을 찾을 수 없어요.</div>';return}
 const plan=buildPlan(),pm=prioMap(),p=pm[t.id],d=dday(t);
 $('detailContent').innerHTML=`<div class="card" style="margin-top:14px"><div class="row"><i class="dot" style="background:${typeColor(t.type)}"></i><span class="small muted">${esc(t.type)}${t.sample?' · 예시':''}</span><div class="grow"></div><span class="dday ${d.cls}">${d.label}</span></div><h1 style="margin:8px 0 10px">${esc(t.title)}</h1>
 <div class="dl"><span>마감 날짜</span><b>${fmt(t.date)}</b></div><div class="dl"><span>중요도</span><b>${esc(t.importance)}</b></div><div class="dl"><span>예상 소요 시간</span><b>${effortLabel(t.effort)}</b></div>
 <div class="dl"><label for="stSel">진행 상태</label><select id="stSel" onchange="changeStatus('${t.id}',this.value)"><option ${t.status==='시작 전'?'selected':''}>시작 전</option><option ${t.status==='진행 중'?'selected':''}>진행 중</option><option ${t.status==='완료'?'selected':''}>완료</option></select></div></div>
 ${p?`<div class="card"><div class="row"><b class="grow">우선순위 ${p.rank}위</b><span class="tag rule">규칙</span><span class="num">${p.score}점</span></div><p class="small muted" style="margin:8px 0 0">${esc(reasonOf(t,plan))}</p></div>`:''}
 ${detailExtra(t)}
 <button class="btn primary full" onclick="editTask('${t.id}')">일정 수정</button><button class="btn danger full" onclick="deleteTask('${t.id}')">일정 삭제</button>`;
}
function detailExtra(t){
 const rq=t.reqs&&t.reqs.length?`<div class="card"><div class="row" style="margin-bottom:10px"><h3 style="margin:0" class="grow">요구사항</h3>${t.from==='AI'?'<span class="tag ai">AI 추출</span>':'<span class="tag rule">규칙 추출</span>'}</div>${t.reqs.map(r=>`<div class="req"><b>${esc(r.text)}</b>${r.evidence?`<div class="q">원문: “${esc(r.evidence)}”</div>`:''}</div>`).join('')}</div>`:'';
 const st=t.steps&&t.steps.length?`<div class="card"><div class="row" style="margin-bottom:6px"><h3 style="margin:0" class="grow">단계</h3><span class="small muted">소요 시간은 추정</span></div>${t.steps.map(x=>`<div class="stp ${x.done?'done':''}"><label class="cbw"><input type="checkbox" ${x.done?'checked':''} onchange="toggleStep('${t.id}','${x.id}')" aria-label="${esc(x.name)} 완료"></label><span>${esc(x.name)}${x.src==='요구사항'?' <span class="tag acc">요구사항</span>':''}</span><b class="num">${hh(x.h)}</b></div>`).join('')}</div>`:'';
 return rq+st;
}
function toggleStep(id,sid){
 const t=tasks.find(x=>x.id===id);if(!t||!t.steps)return;const s=t.steps.find(x=>x.id===sid);if(!s)return;
 s.done=!s.done;if(s.done)s.doneAt=todayKey();else delete s.doneAt;
 const n=t.steps.filter(x=>x.done).length;setStatus(t,n===t.steps.length?'완료':n>0?'진행 중':'시작 전');
 persist();refresh();toast(t.status==='완료'?'모든 단계를 끝내 일정을 완료로 바꿨어요.':s.done?'단계를 완료했어요.':'단계 완료를 취소했어요.');
}
function effortLabel(m){return m>=300?'5시간 이상':m>=180?'3시간':m>=120?'2시간':m>=60?'1시간':'30분'}
function changeStatus(id,status){const t=tasks.find(x=>x.id===id);if(t){setStatus(t,status);persist();refresh();toast('진행 상태가 변경되었어요.')}}
function editTask(id){const t=tasks.find(x=>x.id===id);if(!t)return;editingId=id;$('formHeading').textContent='일정 수정';$('fTitle').value=t.title;$('fType').value=t.type;$('fDate').value=t.date;$('fImportance').value=t.importance;$('fEffort').value=t.effort;$('fStatus').value=t.status;switchTab('direct');navigate('form')}
function deleteTask(id){if(!confirm('이 일정을 삭제할까요?'))return;tasks=tasks.filter(t=>t.id!==id);persist();navigate('list');toast('일정이 삭제되었어요.')}

/* ===== 추가: 직접 입력 · 개인 약속 · 공지 붙여넣기 ===== */
function openAdd(){editingId=null;clearForm();$('formHeading').textContent='일정 등록';switchTab('direct');$('fDate').value=selectedDate||todayKey();navigate('form')}
function openAppt(){editingId=null;clearForm();$('formHeading').textContent='개인 약속 추가';switchTab('appt');$('aDate').value=selectedDate||todayKey();updateApptPreview();navigate('form')}
function openPaste(){editingId=null;clearForm();navigate('paste')}
function switchTab(tab){
 formTab=tab==='appt'?'appt':'direct';
 ['direct','appt'].forEach(x=>{$('tab-'+x).classList.toggle('hidden',x!==formTab);const b=document.querySelector(`[data-tab="${x}"]`);b.classList.toggle('active',x===formTab);b.setAttribute('aria-selected',String(x===formTab))});
 $('formTabs').classList.toggle('hidden',!!editingId);
 if(!editingId)$('formHeading').textContent=formTab==='appt'?'개인 약속 추가':'일정 등록';
 if(formTab==='appt')updateApptPreview();
}
function saveForm(){formTab==='appt'?saveAppt():saveTask()}
function saveTask(){
 const title=$('fTitle').value.trim(),date=$('fDate').value;if(!title||!date){toast('일정명과 마감 날짜를 입력해 주세요.');return}
 const data={title,type:$('fType').value,date,importance:$('fImportance').value,effort:Number($('fEffort').value),status:$('fStatus').value};
 const editing=!!editingId;
 if(editing){const t=tasks.find(x=>x.id===editingId);Object.assign(t,data);setStatus(t,data.status);toast('일정이 수정되었어요.')}
 else{const t={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),...data};if(data.status==='완료')t.doneAt=todayKey();tasks.push(t);toast('일정이 등록되었어요.')}
 persist();focusDate(date);navigate(editing?'list':'plan');
}
function saveAppt(){
 const title=$('aTitle').value.trim(),date=$('aDate').value,st=$('aStart').value,en=$('aEnd').value;
 if(!title||!date||!st||!en){toast('이름, 날짜, 시작·종료 시간을 입력해 주세요.');return}
 if(toMin(en)<=toMin(st)){toast('종료 시간이 시작 시간보다 늦어야 해요.');return}
 appts.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),title,date,start:st,end:en});
 persistAppts();commentCache=null;focusDate(date);navigate('plan');toast('개인 약속을 추가했어요. 그날 가용 시간에서 뺍니다.');
}
function deleteAppt(id){appts=appts.filter(x=>x.id!==id);persistAppts();commentCache=null;refresh();toast('개인 약속을 삭제했어요.')}
function pasteBack(){
 if(pasteState==='steps'){showDraft(draft);return}
 if(pasteState==='result'||pasteState==='failed'){backToInput();return}
 if(pasteState==='loading'){cancelExtract();return}
 goBack();
}

/* ===== 공지 3단계: 붙여넣기 → 확인 → 단계 ===== */
function renderStepper(state){
 const n={input:1,loading:1,failed:1,result:2,steps:3}[state]||1,el=$('stepper');if(!el)return;
 el.innerHTML=['붙여넣기','확인','단계'].map((l,i)=>`<div class="st ${i+1<n?'done':i+1===n?'on':''}" ${i+1===n?'aria-current="step"':''}><b>${i+1<n?CHK:i+1}</b>${l}</div>`).join('<i class="stline"></i>');
}
function setPanel(state,html){const pi=$('pasteInput'),ep=$('extractPanel');if(!pi||!ep)return;pasteState=state;pi.classList.toggle('hidden',state!=='input');ep.innerHTML=state==='input'?'':(html||'');renderStepper(state);if(state!=='input')window.scrollTo(0,0)}
function showDraft(d){
 draft=d;
 const reqs=d.reqs.length?d.reqs.map(r=>`<div class="req"><b>${esc(r.text)}</b><div class="q">원문: “${esc(r.evidence||'-')}” <span class="tag ${r.ok?'good':'bad'}">${r.ok?'근거 확인됨':'근거 없음'}</span></div></div>`).join(''):'<p class="small muted" style="margin:0">공지에서 요구사항을 찾지 못했어요.</p>';
 const flags=d.flags.length?`<div class="flag"><b>확인 필요 ${d.flags.length}건</b><ul>${d.flags.map(f=>`<li>${esc(f)}</li>`).join('')}</ul></div>`:'';
 setPanel('result',`<div class="row" style="margin:4px 0 12px;align-items:flex-start">${tagOf(d.mode)}<span class="small muted grow">${d.mode==='AI'?'AI가 추출한 결과예요.':'규칙으로 추출한 결과예요(AI 아님).'} 확인하고 틀린 곳을 고쳐 주세요.</span></div>${flags}
 <div class="card"><div class="field" style="margin-top:0"><label for="dTitle">일정명</label><input id="dTitle" value="${esc(d.title)}" maxlength="40"></div><div class="grid2"><div class="field" style="margin-bottom:0"><label for="dType">종류</label><select id="dType">${TYPES.map(t=>`<option ${t===d.type?'selected':''}>${t}</option>`).join('')}</select></div><div class="field" style="margin-bottom:0"><label for="dDate">마감 날짜</label><input id="dDate" type="date" value="${d.date}"></div></div>${d.rel?'<p class="small" style="margin:8px 0 0"><span class="tag rule">규칙 계산</span> 상대 날짜를 코드가 계산했어요.</p>':''}${d.ev?`<p class="small muted" style="margin:8px 0 0">날짜 원문: “${esc(d.ev)}”</p>`:''}<div class="row" style="margin-top:12px;flex-wrap:wrap;gap:6px"><span class="tag acc">중요도 ${d.importance}</span><span class="tag acc">예상 ${effortLabel(d.effort)}</span></div></div>
 <div class="card"><h3>요구사항 <span class="small muted" style="font-weight:500">원문 근거와 함께</span></h3>${reqs}</div>
 <div class="actions"><button class="btn primary" onclick="toSteps()">다음: 단계 제안 보기</button><button class="btn" onclick="backToInput()">공지 다시 편집</button></div>`);
}
// 단계 추가 전에, 지금 일정에 이 단계들을 얹으면 어느 날 배정되는지 코드로 미리 계산한다.
function previewAlloc(d){
 const on=d.steps.filter(x=>x.on),save=tasks;
 const tmp={id:'__draft',title:d.title,type:d.type,date:d.date,effort:Math.round(on.reduce((a,x)=>a+x.h,0)*60),status:'시작 전',steps:on.map(x=>({id:x.id,name:x.name,h:x.h,done:false}))};
 tasks=save.concat([tmp]);let pl;try{pl=buildPlan()}finally{tasks=save}
 const days=Object.keys(pl.alloc).sort().map(k=>({k,items:pl.alloc[k].filter(a=>a.id==='__draft').sort((a,b)=>a.ord-b.ord)})).filter(x=>x.items.length);
 return {days,short:pl.taskShort['__draft']||0};
}
function renderStepsPanel(){
 const d=draft,on=d.steps.filter(x=>x.on),tot=on.reduce((a,x)=>a+x.h,0),pv=on.length?previewAlloc(d):{days:[],short:0};
 setPanel('steps',`<div class="card"><b>${esc(d.title)}</b><div class="small muted">마감 ${fmt(d.date)}</div></div>
 <div class="row" style="margin:0 0 10px;align-items:flex-start"><span class="tag rule">규칙 기반 단계</span><span class="small muted grow">요구사항을 고정 단계 유형에 연결한 제안이에요. 소요 시간은 추정이니 고쳐 주세요.</span></div>
 <div class="card">${d.steps.map((x,i)=>`<div class="stp2"><label class="cbw"><input type="checkbox" ${x.on?'checked':''} onchange="toggleDraftStep(${i})" aria-label="${esc(x.name)} 포함"></label><div class="grow"><b>${esc(x.name)}</b><small>${x.src==='요구사항'?'요구사항: “'+esc((x.note||'').slice(0,26))+'”':'기본 단계'}</small></div><button class="btn" onclick="adjDraftStep(${i},-.5)" aria-label="${esc(x.name)} 시간 줄이기">−</button><span class="h num">${hh(x.h)}</span><button class="btn" onclick="adjDraftStep(${i},.5)" aria-label="${esc(x.name)} 시간 늘리기">＋</button></div>`).join('')}<div class="total"><span>총 소요 시간</span><span class="num">${hh(tot)}</span></div></div>
 <div class="card"><div class="row" style="margin-bottom:8px"><b class="grow">배정 미리보기</b><span class="tag rule">규칙</span></div>${pv.days.length?pv.days.map(x=>{const dt=dateObj(x.k);return `<div class="pv"><span class="num">${dt.getMonth()+1}/${dt.getDate()}</span><small>${DAY_NAMES[(dt.getDay()+6)%7]}</small><span>${x.items.map(a=>`${esc(a.step)} ${hh(a.h)}`).join(' · ')}</span></div>`}).join(''):'<p class="small muted" style="margin:0">선택한 단계가 없어요.</p>'}${pv.short>0.001?`<p class="small" style="margin:10px 0 0;color:var(--bad);font-weight:700">가용 시간이 모자라 ${hh(pv.short)}는 배정하지 못해요.</p>`:''}<p class="small muted" style="margin:10px 0 0">마감일부터 거꾸로, 내 가용 시간에 맞춰 코드가 계산해요.</p></div>
 <div class="notice">공지에 없는 요구사항은 단계로 만들지 않아요. 자료 조사·작성 같은 기본 단계는 일정 종류별 고정 유형이에요.</div>
 <div class="actions"><button class="btn primary" onclick="confirmAdd(true)" ${tot>0?'':'disabled'}>모두 추가</button><button class="btn" onclick="confirmAdd(false)">단계 없이 마감만 추가</button><button class="btn" onclick="showDraft(draft)">← 추출 결과로</button></div>`);
}
function confirmAdd(withSteps){
 const d=draft;if(!d)return;
 const steps=withSteps?d.steps.filter(x=>x.on).map(x=>({id:x.id,name:x.name,h:x.h,src:x.src,done:false})):[];
 const sum=steps.reduce((a,x)=>a+x.h,0),t={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),title:d.title,type:d.type,date:d.date,importance:d.importance,effort:steps.length?nearestEffort(sum*60):d.effort,status:'시작 전',from:d.mode,reqs:d.reqs.map(r=>({text:r.text,evidence:r.evidence}))};
 if(steps.length)t.steps=steps;
 tasks.push(t);persist();focusDate(d.date);draft=null;$('noticeInput').value='';updateNoticeCount();setPanel('input');navigate('plan');
 toast(steps.length?`일정과 단계 ${steps.length}개를 추가했어요.`:'일정을 추가했어요.');
}

/* ===== 데이터 관리 ===== */
function seedSample(){
 if(tasks.some(t=>t.sample)){toast('이미 예시 데이터가 있어요.');return}
 const off=n=>{const d=new Date();d.setDate(d.getDate()+n);return isoDate(d)};
 const rows=[['자료구조 과제 제출','과제',2,'높음',180],['생성형 AI 팀 프로젝트 발표','팀 프로젝트',3,'높음',300],['영어 퀴즈 준비','시험',3,'보통',120],['독서 감상문','과제',5,'낮음',60],['데이터베이스 중간고사','시험',6,'높음',300]];
 rows.forEach(r=>tasks.push({id:'sample-'+Date.now()+'-'+r[0].length+r[2],title:r[0],type:r[1],date:off(r[2]),importance:r[3],effort:r[4],status:'시작 전',sample:true,steps:makeSteps({type:r[1],effort:r[4],reqs:[]}).map(s=>({id:s.id,name:s.name,h:s.h,src:s.src,done:false}))}));
 persist();navigate(currentView==='settings'?'settings':'today');toast('예시 데이터 5건을 넣었어요.');
}
function clearSample(){tasks=tasks.filter(t=>!t.sample);persist();refresh();toast('예시 데이터를 삭제했어요.')}
function confirmReset(){
 tasks=[];avail=DEFAULT_AVAIL.slice();ovr={};appts=[];commentCache=null;
 [STORAGE_KEY,ANALYSIS_KEY,AVAIL_KEY,OVR_KEY,APPT_KEY].forEach(k=>Store.del(k));
 hideResetModal();persist();navigate('today');toast('모든 데이터가 초기화되었어요.');
}
/* ===== v3.4: 서비스 소개(처음 방문할 때만, 건너뛰기 가능) ===== */
const INTRO_KEY='aiStudyPlannerIntroSeen';
let introIdx=0;
function introSeen(){try{return localStorage.getItem(INTRO_KEY)==='1'}catch(e){return true}} // 저장소를 못 쓰면 소개를 반복해서 보이지 않게 건너뛴다
function openIntro(){introIdx=0;navigate('intro')}
function finishIntro(){try{localStorage.setItem(INTRO_KEY,'1')}catch(e){}navigate(user?'today':'auth')}
function introNext(d){introIdx=Math.max(0,Math.min(INTRO_SLIDES().length-1,introIdx+d));renderIntro()}
function INTRO_SLIDES(){return [
 {t:'먼저 가용 시간을 정해요',p:'마이 탭에서 요일마다 입력해요'},
 {t:'일정은 + 버튼으로 넣어요',p:'세 가지 중 편한 방법으로 추가해요'},
 {t:'오늘 할 일과 계획을 봐요',p:'여유·빠듯·부족으로 바로 알려 줘요'},
 {t:'“규칙” 표시는 이런 뜻이에요',p:'규칙은 코드가 계산한 값, AI는 AI가 쓴 글이에요',n:AI_ENDPOINT?'':'지금은 AI 미연결이라 규칙으로 처리해요'}
]}
function INTRO_ART(i){
 const T=(x,y,s,t,w,c,a)=>`<text x="${x}" y="${y}" font-size="${s}" font-weight="${w||600}" fill="${c||'var(--ink)'}" text-anchor="${a||'start'}">${t}</text>`;
 const box=(x,y,w,h,r,f,s)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${f||'#fff'}" stroke="${s||'var(--line)'}" stroke-width="1.5"/>`;
 let g='';
 if(i===0){ // 요일별 가용 시간 입력
  const d=['월','화','수','목','금','토','일'],v=[2,2,2,2,2,3,3];
  d.forEach((n,k)=>{const x=20+k*40;g+=T(x+17,26,13,n,700,'var(--muted)','middle')+box(x,36,34,44,10,'#fff',k===2?'var(--accent)':'var(--line)')+T(x+17,65,17,v[k],800,k===2?'var(--accent)':'var(--ink)','middle')});
  g+='<circle cx="94" cy="106" r="9" fill="none" stroke="var(--accent)" stroke-width="2"/><path d="M94 100v6l4 2" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>'+T(110,111,13,'하루에 공부할 수 있는 시간(h)',700,'var(--muted)');
 }else if(i===1){ // 추가 버튼 → 3가지 방법
  g+='<circle cx="48" cy="65" r="28" fill="var(--accent)"/><path d="M48 51v28M34 65h28" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'+T(48,114,13,'추가',800,'var(--accent)','middle');
  g+='<path d="M86 65h14m-5-5l5 5-5 5" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  const rows=[['공지 붙여넣기','<rect x="-6" y="-7" width="12" height="14" rx="2" fill="none" stroke="var(--accent)" stroke-width="1.8"/><path d="M-3 -2h6M-3 2h6" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round"/>'],['직접 입력','<path d="M-6 6l1-4 8-8 3 3-8 8z" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linejoin="round"/>'],['개인 약속','<circle r="7" fill="none" stroke="var(--accent)" stroke-width="1.8"/><path d="M0 -3v3l3 2" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round"/>']];
  rows.forEach((r,k)=>{const y=12+k*40;g+=box(112,y,198,34,12)+`<circle cx="134" cy="${y+17}" r="12" fill="var(--accent-soft)"/><g transform="translate(134 ${y+17})">${r[1]}</g>`+T(154,y+22,14,r[0],700)});
 }else if(i===2){ // 오늘 / 계획 / 일정
  const cards=[['오늘',10],['계획',112],['일정',214]];
  cards.forEach(([n,x])=>{g+=box(x,10,96,100,14)+T(x+48,32,13,n,800,'var(--accent)','middle')});
  // 오늘: 체크리스트
  [52,76].forEach((y,k)=>{g+=`<circle cx="${28}" cy="${y}" r="7" fill="${k?'none':'var(--c-ok)'}" stroke="${k?'var(--line)':'var(--c-ok)'}" stroke-width="1.6"/>`+(k?'':`<path d="M25 ${y}l2.5 2.5 4-5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`)+`<rect x="40" y="${y-3}" width="${k?44:52}" height="6" rx="3" fill="var(--line)"/>`});
  g+=T(58,100,11,'7일 판단',700,'var(--muted)','middle');
  // 계획: 요일 점
  ['var(--c-ok)','var(--c-tight)','var(--c-tight)','var(--c-bad)','var(--c-ok)','var(--c-tight)','var(--c-tight)'].forEach((c,k)=>{g+=`<circle cx="${124+k*11}" cy="56" r="4.5" fill="${c}"/>`});
  g+=box(122,70,72,22,8,'var(--bg)')+T(158,85,11,'가용·배정·부족',700,'var(--muted)','middle');
  // 일정: 우선순위
  [48,74].forEach((y,k)=>{g+=`<rect x="226" y="${y-9}" width="18" height="18" rx="6" fill="var(--accent-soft)"/>`+T(235,y+4,11,k+1,800,'var(--accent)','middle')+`<rect x="250" y="${y-3}" width="${k?30:40}" height="6" rx="3" fill="var(--line)"/>`});
  g+=T(262,100,11,'우선순위',700,'var(--muted)','middle');
  g+=T(58,126,12,'체크',700,'var(--muted)','middle')+T(160,126,12,'날짜별 확인',700,'var(--muted)','middle')+T(262,126,12,'전체 목록',700,'var(--muted)','middle');
 }else{ // 규칙 vs AI
  g+=box(10,10,146,110,16)+box(164,10,146,110,16);
  g+='<rect x="22" y="22" width="48" height="24" rx="12" fill="#fff" stroke="var(--line)" stroke-width="1.5"/>'+T(46,39,13,'규칙',800,'var(--muted)','middle');
  g+=T(24,84,32,'116%',800)+T(24,106,12,'코드가 계산한 값',700,'var(--muted)');
  g+='<rect x="176" y="22" width="48" height="24" rx="12" fill="var(--accent)"/><path d="M190 28l1.6 4.4L196 34l-4.4 1.6L190 40l-1.6-4.4L184 34l4.4-1.6z" fill="#fff" transform="translate(2 0)"/>'+T(209,39,13,'AI',800,'#fff','middle');
  [64,78,92].forEach((y,k)=>{g+=`<rect x="176" y="${y}" width="${k===2?64:118}" height="7" rx="3.5" fill="var(--line)"/>`});
  g+=T(176,112,12,'AI가 쓴 문장',700,'var(--muted)');
 }
 return `<svg viewBox="0 0 320 ${i===2?132:130}" role="img" aria-hidden="true" font-family="inherit">${g}</svg>`;
}
function renderIntro(){
 const el=$('introCard');if(!el)return;
 const S=INTRO_SLIDES(),s=S[introIdx],last=introIdx===S.length-1;
 const sk=$('introSkip');if(sk)sk.textContent=user?'닫기':'건너뛰기'; // 로그인한 사람이 다시 볼 때는 "닫기"
 el.innerHTML=`<div class="intro-hero"><div class="intro-step">${introIdx+1} / ${S.length}</div><h1>${esc(s.t)}</h1></div>
 <div class="card intro-body"><div class="intro-art">${INTRO_ART(introIdx)}</div><p class="intro-p">${esc(s.p)}</p>${s.n?`<p class="intro-n">${esc(s.n)}</p>`:''}
 <div class="intro-dots" aria-hidden="true">${S.map((_,i)=>`<i class="${i===introIdx?'on':''}"></i>`).join('')}</div>
 <div class="row" style="gap:10px">${introIdx>0?'<button class="btn" onclick="introNext(-1)">이전</button>':''}<button class="btn primary grow" onclick="${last?'finishIntro()':'introNext(1)'}">${last?(user?'확인':'시작하기'):'다음'}</button></div></div>`;
}
/* ===== v3.3: 서버(구글 시트) 동기화 — AI_ENDPOINT가 있을 때만 켜진다. 비어 있으면 v3.2처럼 이 브라우저에만 저장한다 ===== */
const TOKEN_KEY='aiStudyPlannerToken',SYNCMETA_KEY='aiStudyPlannerSync';
const SYNC_ERR={invalid_nick:'닉네임은 한글·영문·숫자·_ 2~12자로 입력해 주세요.',invalid_pw:'비밀번호는 6~64자로 입력해 주세요.',nick_taken:'이미 사용 중인 닉네임입니다.',bad_credentials:'닉네임 또는 비밀번호가 올바르지 않습니다.',locked:'로그인에 여러 번 실패해 10분간 잠겼어요. 잠시 뒤 다시 시도해 주세요.',rate_limited:'요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.',busy:'서버가 바빠요. 잠시 뒤 다시 시도해 주세요.'};
async function serverCall(task,extra){
 const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),15000);
 try{
  // text/plain으로 보내 CORS 사전 요청을 피한다(AI 중계와 같은 방식)
  const r=await fetch(AI_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({task,nick:user,token:Sync.token()},extra)),signal:ctl.signal});
  if(!r.ok)throw new Error('http '+r.status);
  return await r.json();
 }finally{clearTimeout(t)}
}
var Sync={
 on:!!AI_ENDPOINT,status:AI_ENDPOINT?'idle':'local',applying:false,timer:null,busy:false,again:false,ver:0,lastPull:0,
 token(){try{return localStorage.getItem(TOKEN_KEY)||''}catch(e){return ''}},
 setToken(t){try{t?localStorage.setItem(TOKEN_KEY,t):localStorage.removeItem(TOKEN_KEY)}catch(e){}},
 meta(){try{return JSON.parse(localStorage.getItem(SYNCMETA_KEY+'::'+user))||{base:0,dirty:false}}catch(e){return {base:0,dirty:false}}},
 setMeta(m){try{localStorage.setItem(SYNCMETA_KEY+'::'+user,JSON.stringify(m))}catch(e){}},
 snapshot(){return {v:1,tasks,avail,ovr,appts}},
 touch(){ // 데이터가 바뀜 → 잠시 모았다가 서버에 저장
  if(!this.on||!user||this.applying)return;
  this.ver++;const m=this.meta();m.dirty=true;this.setMeta(m);this.setStatus('saving');
  clearTimeout(this.timer);this.timer=setTimeout(()=>this.push(),1200);
 },
 async push(force){
  if(!this.on||!user)return;
  clearTimeout(this.timer);
  if(this.busy){this.again=true;return}
  if(!this.token()){this.expired();return}
  this.busy=true;this.setStatus('saving');const v0=this.ver;
  try{
   const m=this.meta(),x=await serverCall('save',{data:JSON.stringify(this.snapshot()),baseUpdatedAt:m.base,force:!!force});
   if(x.ok){this.setMeta({base:x.updatedAt,dirty:this.ver!==v0});this.setStatus('synced');if(this.ver!==v0)this.again=true}
   else if(x.error==='conflict')await this.resolveConflict(x);
   else if(x.error==='unauthorized')this.expired();
   else if(x.error==='too_large')this.setStatus('toolarge');
   else this.setStatus('offline');
  }catch(e){this.setStatus('offline')}
  finally{this.busy=false;if(this.again){this.again=false;this.timer=setTimeout(()=>this.push(),300)}}
 },
 async resolveConflict(x){ // 다른 기기가 더 최근에 저장함
  const mine=confirm('다른 기기에서 더 최근에 저장한 데이터가 있어요.\n\n[확인] 이 기기의 데이터로 서버를 덮어쓰기\n[취소] 서버의 데이터를 불러오기(이 기기의 변경은 사라져요)');
  if(mine){this.setMeta({base:x.updatedAt,dirty:true});this.busy=false;await this.push(true);this.busy=true}
  else{this.applyServer(x.data,x.updatedAt);refresh()}
 },
 applyServer(str,ts){
  let s=null;try{s=JSON.parse(str)}catch(e){}
  if(!s||typeof s!=='object')return false;
  this.applying=true;
  try{
   tasks=Array.isArray(s.tasks)?s.tasks:[];avail=Array.isArray(s.avail)&&s.avail.length===7?s.avail.map(Number):DEFAULT_AVAIL.slice();
   ovr=s.ovr&&typeof s.ovr==='object'&&!Array.isArray(s.ovr)?s.ovr:{};appts=Array.isArray(s.appts)?s.appts:[];commentCache=null;
   Store.set(STORAGE_KEY,tasks);Store.set(AVAIL_KEY,avail);Store.set(OVR_KEY,ovr);Store.set(APPT_KEY,appts);
  }finally{this.applying=false}
  this.setMeta({base:ts,dirty:false});this.setStatus('synced');return true;
 },
 afterLogin(x){ // 로그인·가입 직후: 서버 데이터와 이 기기 캐시를 맞춘다
  const m=this.meta(),hasLocal=tasks.length>0||appts.length>0;
  if(x.data){
   if(m.dirty&&confirm('이 기기에 서버에 저장되지 않은 변경이 있어요.\n\n[확인] 이 기기의 데이터로 서버를 덮어쓰기\n[취소] 서버의 데이터를 불러오기')){this.setMeta({base:x.updatedAt,dirty:true});this.push(true)}
   else this.applyServer(x.data,x.updatedAt);
  }else if(hasLocal){this.setMeta({base:x.updatedAt||0,dirty:true});this.push()} // 서버가 비어 있고 이 기기에 데이터가 있으면 서버로 올린다
  else{this.setMeta({base:x.updatedAt||0,dirty:false});this.setStatus('synced')}
  refresh();
 },
 async pull(){ // 앱을 다시 열었을 때 / 탭으로 돌아왔을 때 서버 변경 확인
  if(!this.on||!user||this.busy)return;
  if(Date.now()-this.lastPull<20000)return;this.lastPull=Date.now();
  const m=this.meta();
  if(m.dirty){this.push();return}
  try{
   const x=await serverCall('load');
   if(x.error==='unauthorized'){this.expired();return}
   if(!x.ok){this.setStatus('offline');return}
   if(x.data&&x.updatedAt!==m.base&&this.applyServer(x.data,x.updatedAt))refresh();else this.setStatus('synced');
  }catch(e){this.setStatus('offline')}
 },
 expired(){
  this.setToken('');this.busy=false;toast('로그인이 만료됐어요. 다시 로그인해 주세요.');switchUser('');
 },
 boot(){
  if(!this.on)return;
  window.addEventListener('online',()=>{if(user&&this.meta().dirty)this.push()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user){this.meta().dirty?this.push():this.pull()}});
  if(!user)return;
  if(!this.token()){switchUser('');return} // 로컬 모드에서 만든 세션이면 서버 로그인부터 다시
  this.setStatus(this.meta().dirty?'saving':'synced');this.pull();
 },
 html(){
  const s=this.status,dot=c=>`<i class="dot ${c}"></i>`;
  if(s==='local')return '이 브라우저에만 저장돼요';
  if(s==='saving')return dot('')+'저장 중…';
  if(s==='offline')return dot('bad')+'서버에 연결하지 못했어요. 이 기기에는 저장돼 있어요.<button onclick="Sync.push()">다시 시도</button>';
  if(s==='toolarge')return dot('bad')+'데이터가 너무 커서 서버에 저장하지 못했어요. 일정을 줄여 주세요.';
  return dot('ok')+'서버에 저장됨';
 },
 setStatus(s){this.status=s;const el=$('syncStatus');if(el)el.innerHTML=this.html()}
};
function switchUser(id){
 user=id;Store.session.set(id);
 authMode='login';tasks=loadTasks();avail=loadAvail();ovr=loadOvr();appts=loadAppts();commentCache=null;
 $('settingsCount').textContent=tasks.length+'개';navigate(id?'today':'auth');
}
function init(){
 $('settingsCount').textContent=tasks.length+'개';renderAvail();
 $('noticeMode').textContent=AI_ENDPOINT?'AI 중계 서버로 추출합니다. 실패하면 결과를 쓰지 않고 대체 방법을 안내해요.':'현재는 규칙 기반 Mock으로 추출해요(AI 서버 미연결). 결과에 “규칙 기반”으로 표시됩니다.';
 $('noticePrivacy').textContent=AI_ENDPOINT?'붙여넣은 공지(최대 2,000자)는 중계 서버(Google Apps Script)를 거쳐 외부 AI로 전송돼요. 이름·학번·연락처 등 개인정보는 지우고 붙여넣어 주세요.':'AI 서버가 연결되어 있지 않아 공지가 외부로 전송되지 않아요. 연결되면 전송되며, 그때 이 안내와 개인정보 취급 안내가 바뀝니다.';
 const t=new Date();$('noticeToday').textContent=`계산 기준일: ${fmt(isoDate(t))}(${DAY_NAMES[(t.getDay()+6)%7]}) — “다음 주 금요일” 같은 표현은 이 날짜를 기준으로 코드가 계산해요.`;
 updateNoticeCount();renderStepper('input');$('fDate').value=todayKey();navigate(user?'today':(introSeen()?'auth':'intro'));applyStorageNotes();Sync.boot();
}
function openSheet(){$('sheet').classList.add('show');document.querySelector('#sheet .sheet-item').focus()}
function closeSheet(){const el=$('sheet');if(el)el.classList.remove('show')}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet()});
function clearForm(){['fTitle','fDate','aTitle','aDate','noticeInput'].forEach(id=>$(id).value='');$('fType').value='과제';$('fImportance').value='보통';$('fEffort').value='60';$('fStatus').value='시작 전';$('aStart').value='19:00';$('aEnd').value='22:00';draft=null;extractCtl=null;setPanel('input');updateNoticeCount();updateApptPreview()}
function scoreTask(t){const days=Math.ceil((dateObj(t.date)-dateObj(isoDate(new Date())))/86400000);const deadline=days<0?100:days===0?100:days===1?85:days<=3?70:days<=7?50:25;const importance={높음:100,보통:60,낮음:30}[t.importance]||60;const effort=t.effort>=300?90:t.effort>=180?75:t.effort>=120?60:t.effort>=60?40:25;let score=Math.round(deadline*.5+importance*.3+effort*.2);if(t.status==='완료')score=0;return {score,days}}
function showResetModal(){$('resetModal').classList.add('show')}function hideResetModal(){$('resetModal').classList.remove('show')}
/* ===== v6: 가용 시간 · 주간 부하 · 예시 데이터 ===== */
const DAY_NAMES=['월','화','수','목','금','토','일'];
function fh(h){return (Math.round(h*10)/10)+'시간'}
function toMin(t){const [h,m]=String(t).split(':').map(Number);return (h||0)*60+(m||0)}
function apptHours(k){return appts.filter(a=>a.date===k).reduce((x,a)=>x+Math.max(0,(toMin(a.end)-toMin(a.start))/60),0)}
function baseAvail(d){return Number(avail[(d.getDay()+6)%7])||0}
// 가용 시간 = 날짜별 직접 수정값(있으면 그 값) 또는 요일 기본값 − 그날 개인 약속 시간. 계산은 코드가 한다.
function availOn(d){const k=isoDate(d);if(ovr[k]!==undefined)return Number(ovr[k])||0;return Math.max(0,baseAvail(d)-apptHours(k))}
// 마감 임박 순으로, 각 일정의 소요 시간을 마감일부터 거꾸로 가용 시간에 채워 넣는다(날짜 계산은 코드가 담당).
// 배정 단위: 단계가 있으면 남은 단계(마지막 단계부터), 없으면 일정 전체 소요 시간
function taskJobs(t){
 if(t.steps&&t.steps.length)return t.steps.map((x,i)=>({label:x.name,h:x.h,sid:x.id,ord:i,done:x.done})).filter(x=>!x.done).reverse();
 return [{label:'',h:t.effort/60,sid:'',ord:0}];
}
function buildPlan(){
 const today=dateObj(isoDate(new Date())),used={},short={},taskShort={},alloc={};
 {const dh=doneToday().reduce((a,x)=>a+x.h,0);if(dh>0)used[isoDate(today)]=Math.min(dh,availOn(today))} // 오늘 이미 끝낸 시간은 오늘 가용 시간에서 먼저 쓴 것으로 계산한다
 tasks.filter(t=>t.status!=='완료').sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{
  let dl=dateObj(t.date);if(dl<today)dl=new Date(today);
  taskJobs(t).forEach(job=>{
   let rem=job.h;
   for(const d=new Date(dl);d>=today&&rem>0;d.setDate(d.getDate()-1)){
    const k=isoDate(d),take=Math.min(Math.max(0,availOn(d)-(used[k]||0)),rem);
    if(take>0){used[k]=(used[k]||0)+take;rem-=take;(alloc[k]=alloc[k]||[]).push({id:t.id,title:t.title,step:job.label,sid:job.sid,ord:job.ord,h:take})}
   }
   if(rem>0.001){const k=isoDate(dl);short[k]=(short[k]||0)+rem;taskShort[t.id]=(taskShort[t.id]||0)+rem}
  });
 });
 return {used,short,taskShort,alloc};
}
function renderAvail(){
 $('availGrid').innerHTML=DAY_NAMES.map((n,i)=>`<label class="avail"><span>${n}</span><input type="number" min="0" max="16" step="0.5" value="${avail[i]}" onchange="setAvail(${i},this.value)"></label>`).join('');
}
function setAvail(i,v){const n=Math.min(16,Math.max(0,Number(v)||0));avail[i]=n;Store.set(AVAIL_KEY,avail);renderAvail();toast('가용 시간이 저장되었습니다.')}
function buildAdvice(plan){
 const today=dateObj(isoDate(new Date()));
 return tasks.filter(t=>plan.taskShort[t.id]).map(t=>{
  let dl=dateObj(t.date);if(dl<today)dl=today;
  const days=Math.round((dl-today)/86400000)+1,sh=plan.taskShort[t.id];
  return {id:t.id,title:t.title,short:sh,days,perDay:sh/days};
 });
}
function updateApptPreview(){
 const el=$('apptPreview');if(!el)return;const date=$('aDate').value,st=$('aStart').value,en=$('aEnd').value;
 if(!date||!st||!en||toMin(en)<=toMin(st)){el.innerHTML='<div class="empty">날짜와 시간을 입력하면 그날 가용 시간이 어떻게 바뀌는지 보여줍니다.</div>';return}
 const d=dateObj(date),k=isoDate(d),add=(toMin(en)-toMin(st))/60,before=availOn(d),has=ovr[k]!==undefined,after=has?before:Math.max(0,baseAvail(d)-apptHours(k)-add);
 el.innerHTML=`<div class="card-title"><span>이 날 가용 시간 변화</span><span class="tag rule">규칙</span></div><div class="calcrow">${hh(before)} → <b>${hh(after)}</b> <small>(약속 ${hh(add)} 반영)</small></div>${has?'<p class="tiny" style="margin:6px 0 0">이 날은 직접 수정한 가용 시간이 있어 약속을 추가해도 값이 바뀌지 않습니다.</p>':''}`;
}
function setOvr(k,v){if(v===''||v===null){delete ovr[k]}else{ovr[k]=Math.min(16,Math.max(0,Number(v)||0))}Store.set(OVR_KEY,ovr);commentCache=null;renderPlan();toast(v===''?'기본값으로 되돌렸습니다.':'이 날의 가용 시간이 저장되었습니다.')}
// ---- AI 연결 지점: 엔드포인트가 있으면 중계 서버로, 없으면 규칙 기반 Mock으로 처리 ----
async function aiCall(task,payload,signal){
 if(!AI_ENDPOINT)return null;
 // text/plain으로 보내 브라우저의 CORS 사전 요청(preflight)을 피한다. Apps Script가 본문을 JSON으로 파싱한다.
 const r=await fetch(AI_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({task,...payload}),signal});
 if(!r.ok)throw new Error('AI 응답 오류 '+r.status);
 return r.json();
}
const TYPES=['과제','시험','발표','팀 프로젝트'],IMPS=['높음','보통','낮음'],EFFORTS=[30,60,120,180,300];
function nearestEffort(m){return EFFORTS.reduce((a,b)=>Math.abs(b-m)<Math.abs(a-m)?b:a)}
function validExtract(o){return o&&typeof o.title==='string'&&o.title.trim()&&TYPES.includes(o.type)&&/^\d{4}-\d{2}-\d{2}$/.test(o.date||'')&&IMPS.includes(o.importance)&&EFFORTS.includes(Number(o.effort))}
function parseDate(text){
 const now=new Date(),today=dateObj(isoDate(now));let m,d=null;
 if(m=text.match(/(\d{4})[.\-\/]\s*(\d{1,2})[.\-\/]\s*(\d{1,2})/))d=new Date(+m[1],+m[2]-1,+m[3],12);
 else if(m=text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/))d=new Date(now.getFullYear(),+m[1]-1,+m[2],12);
 else if(m=text.match(/(\d{1,2})\/(\d{1,2})/))d=new Date(now.getFullYear(),+m[1]-1,+m[2],12);
 else if(/모레/.test(text)){d=new Date(today);d.setDate(d.getDate()+2)}
 else if(/내일/.test(text)){d=new Date(today);d.setDate(d.getDate()+1)}
 else if(/오늘/.test(text))d=new Date(today);
 else if(m=text.match(/(이번|다음)\s*주\s*([월화수목금토일])요일/)){const idx='월화수목금토일'.indexOf(m[2]);d=new Date(startOfWeek(today));d.setDate(d.getDate()+idx+(m[1]==='다음'?7:0))}
 if(d&&d<today&&!/(\d{4})/.test(text)&&!/이번|다음/.test(text))d.setFullYear(d.getFullYear()+1);
 return d?isoDate(d):'';
}
function mockExtract(text){
 const line=(text.split(/\n/).map(x=>x.trim()).find(Boolean)||'').replace(/^[\[\(【](.*?)[\]\)】]\s*/,'$1 ');
 const type=/팀\s*프로젝트|팀플/.test(text)?'팀 프로젝트':/시험|중간고사|기말|퀴즈/.test(text)?'시험':/발표|PT|프레젠/i.test(text)?'발표':'과제';
 const h=text.match(/(\d+(?:\.\d+)?)\s*시간/),effort=h?nearestEffort(parseFloat(h[1])*60):{시험:180,발표:120,'팀 프로젝트':300,과제:120}[type];
 const importance=/중간고사|기말|필수|성적/.test(text)?'높음':'보통';
 return {title:line.slice(0,40),type,date:parseDate(text),importance,effort};
}
/* ===== v3.0: 공지 추출 — 근거 문장·상대 날짜 코드 계산·확인 필요·실패 대체·단계 제안 ===== */
const DATE_RE=/\d{4}[.\-\/]\s*\d{1,2}[.\-\/]\s*\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\/\d{1,2}/;
function updateNoticeCount(){const el=$('noticeCount');if(el)el.textContent=$('noticeInput').value.length.toLocaleString('ko-KR')}
function normTxt(s){return String(s).replace(/\s+/g,'')}
function inText(ev,text){return !!ev&&normTxt(text).includes(normTxt(ev))} // 근거 문장이 원문에 실제로 있는지 코드가 확인한다
// AI는 날짜 "표현"만 구조화해서 돌려주고, 실제 날짜는 코드가 오늘(기준일)로 계산한다.
// deadline: {kind:'absolute',date:'YYYY-MM-DD',evidence} | {kind:'relative_week',weekOffset:0~2,weekday:0(월)~6(일),evidence} | {kind:'relative_days',days:0~60,evidence} | null
function dateFromDeadline(dl){
 if(!dl)return null;const today=dateObj(isoDate(new Date()));
 if(dl.kind==='absolute'&&/^\d{4}-\d{2}-\d{2}$/.test(dl.date||''))return {date:dl.date,rel:false};
 if(dl.kind==='relative_week'&&[0,1,2].includes(dl.weekOffset)&&Number.isInteger(dl.weekday)&&dl.weekday>=0&&dl.weekday<=6){const d=new Date(startOfWeek(today));d.setDate(d.getDate()+dl.weekOffset*7+dl.weekday);return {date:isoDate(d),rel:true}}
 if(dl.kind==='relative_days'&&Number.isInteger(dl.days)&&dl.days>=0&&dl.days<=60){const d=new Date(today);d.setDate(d.getDate()+dl.days);return {date:isoDate(d),rel:true}}
 return null;
}
function validExtract3(o){
 if(!o||typeof o.title!=='string'||!o.title.trim()||!TYPES.includes(o.type)||!IMPS.includes(o.importance)||!EFFORTS.includes(Number(o.effort)))return false;
 if(o.deadline!==null&&o.deadline!==undefined&&!dateFromDeadline(o.deadline))return false;
 if(!Array.isArray(o.requirements)||o.requirements.length>8)return false;
 return o.requirements.every(r=>r&&typeof r.text==='string'&&r.text.trim()&&r.text.length<=80&&typeof r.evidence==='string');
}
function mockDeadline(text){
 const mm=text.match(DATE_RE),ds=parseDate(text);let m;
 if(mm&&ds)return {kind:'absolute',date:ds,evidence:mm[0]};
 if(m=text.match(/(이번|다음)\s*주\s*([월화수목금토일])요일/))return {kind:'relative_week',weekOffset:m[1]==='다음'?1:0,weekday:'월화수목금토일'.indexOf(m[2]),evidence:m[0]};
 if(/모레/.test(text))return {kind:'relative_days',days:2,evidence:'모레'};
 if(/내일/.test(text))return {kind:'relative_days',days:1,evidence:'내일'};
 if(/오늘/.test(text))return {kind:'relative_days',days:0,evidence:'오늘'};
 return null;
}
// 규칙 기반 대체 추출: AI와 같은 형식으로 돌려준다(AI가 없거나 실패해도 같은 화면 흐름을 쓰기 위함).
function mockExtract3(text){
 const m=mockExtract(text),reqs=[];
 text.split(/[\n.。!?]+/).forEach(sent=>sent.split(/[,，]\s*/).forEach(c=>{
  c=c.trim();if(c.length<4||reqs.length>=5||/^[\[\(【]/.test(c))return;
  if(/(이내|이하|이상|포함|필수|반드시|분량|양식|제출)/.test(c)){const t=c.replace(/^.*?(까지|전까지)\s*/,'').trim()||c;reqs.push({text:t.slice(0,60),evidence:c.slice(0,120)})}
 }));
 return {title:m.title,type:m.type,importance:m.importance,effort:m.effort,deadline:mockDeadline(text),requirements:reqs};
}
// 추출 결과를 화면용 초안으로 바꾸면서 "확인 필요" 항목을 코드로 표시한다.
function buildDraft(o,text,mode){
 const dd=dateFromDeadline(o.deadline),flags=[],today=isoDate(new Date());
 if(!dd)flags.push('마감 날짜를 찾지 못했습니다. 아래에서 날짜를 직접 입력해 주세요.');
 else{
  const ev=o.deadline&&o.deadline.evidence;
  if(ev&&!inText(ev,text))flags.push('날짜의 근거 문장을 원문에서 찾지 못했습니다. 날짜를 확인해 주세요.');
  if(dd.rel)flags.push(`상대 날짜(“${ev||'-'}”)를 기준일 ${fmt(today)}로 계산했습니다. 맞는지 확인해 주세요.`);
  if(dd.date<today)flags.push('이미 지난 날짜입니다.');
 }
 const dates=new Set((text.match(new RegExp(DATE_RE.source,'g'))||[]).map(normTxt));
 if(dates.size>1)flags.push('공지에 날짜가 여러 개 있습니다. 마감이 맞는지 확인해 주세요.');
 const reqs=o.requirements.map(r=>({text:r.text.trim(),evidence:r.evidence,ok:inText(r.evidence,text)}));
 if(reqs.some(r=>!r.ok))flags.push('원문에서 근거를 찾지 못한 요구사항이 있습니다.');
 return {mode,title:o.title.trim().slice(0,40),type:o.type,importance:o.importance,effort:Number(o.effort),date:dd?dd.date:'',ev:o.deadline&&o.deadline.evidence||'',rel:!!(dd&&dd.rel),reqs,flags,steps:null};
}
async function extractNotice(){
 const text=$('noticeInput').value.trim();
 if(!text){toast('공지 내용을 붙여넣어 주세요.');return}
 if(text.length>MAX_NOTICE){toast('공지는 2,000자 이내로 붙여넣어 주세요.');return}
 lastNotice=text;
 if(!AI_ENDPOINT){showDraft(buildDraft(mockExtract3(text),text,'규칙'));return}
 runAiExtract(text);
}
async function runAiExtract(text){
 setPanel('loading','<div class="card"><div class="card-title"><span>공지 분석 중</span><span class="tag ai">AI</span></div><div class="progress"><i style="width:60%"></i></div><p class="sub" style="margin:10px 0 0">공지에서 일정·요구사항을 읽고 있어요. 최대 10초까지 기다립니다.</p></div><button class="btn full" onclick="cancelExtract()">취소</button>');
 const ctl=new AbortController();extractCtl=ctl;let timedOut=false;const timer=setTimeout(()=>{timedOut=true;ctl.abort()},AI_TIMEOUT_MS);
 try{
  const x=await aiCall('extract',{text,today:isoDate(new Date())},ctl.signal);clearTimeout(timer);
  if(extractCtl!==ctl)return; // 사용자가 취소함
  if(!validExtract3(x))throw new Error('형식 불일치');
  extractCtl=null;showDraft(buildDraft(x,text,'AI'));
 }catch(e){
  clearTimeout(timer);if(extractCtl!==ctl)return;extractCtl=null;
  showFailed(timedOut?'응답 시간이 초과되었습니다.':'AI 응답을 사용할 수 없거나 형식이 맞지 않습니다.');
 }
}
function cancelExtract(){const c=extractCtl;extractCtl=null;if(c)c.abort();setPanel('input')}
function showFailed(reason){
 setPanel('failed',`<div class="card"><div class="card-title"><span>추출에 실패했습니다</span></div><p class="sub" style="margin:0">${escapeHtml(reason)} 붙여넣은 내용은 그대로 남아 있습니다. AI 응답이 약속된 형식이 아니면 결과를 쓰지 않고 이 화면으로 옵니다.</p></div><button class="btn primary full" onclick="runAiExtract(lastNotice)">다시 시도</button><div class="card"><div class="card-title"><span>규칙 기반으로 대신 추출</span><span class="tag rule">규칙</span></div><p class="sub" style="margin:0 0 8px">날짜가 단순한 공지만 읽을 수 있고 정확도가 낮을 수 있습니다. 결과에 “규칙 기반”으로 표시됩니다.</p><button class="btn small" onclick="useRuleExtract()">규칙 기반으로 추출</button></div><button class="btn full" onclick="backToInput()">공지 다시 편집</button><button class="btn full" onclick="openAdd()">직접 입력으로 전환</button>`);
}
function useRuleExtract(){showDraft(buildDraft(mockExtract3(lastNotice),lastNotice,'규칙'))}
function backToInput(){setPanel('input')}
function tagOf(mode){return mode==='AI'?'<span class="tag ai">AI</span>':'<span class="tag rule">규칙 기반</span>'}
/* --- 단계 제안: 요구사항을 고정된 단계 유형에 연결한다. 공지에 없는 단계는 만들지 않고, 시간은 모두 "추정"이다. --- */
const BASE_STEPS={'과제':[['자료 조사',.25],['작성',.75]],'시험':[['범위 정리',.3],['문제 풀이',.5],['복습',.2]],'발표':[['자료 조사',.3],['슬라이드 제작',.45],['발표 연습',.25]],'팀 프로젝트':[['역할·일정 정리',.15],['작업',.7],['취합·점검',.15]]};
function makeSteps(d){
 const total=d.effort/60,steps=[],uid=()=>'st-'+Math.random().toString(36).slice(2,9);
 (BASE_STEPS[d.type]||BASE_STEPS['과제']).forEach(([n,r])=>steps.push({id:uid(),name:n,h:Math.max(.5,Math.round(total*r*2)/2),src:'기본',on:true}));
 let submit=null,length=null;const extra=[];
 d.reqs.forEach(r=>{
  if(/제출|업로드|e-?class|LMS/i.test(r.text)){if(!submit)submit={id:uid(),name:'제출',h:.5,src:'요구사항',on:true,note:r.text}}
  else if(/분량|이내|이하|쪽|페이지|\d\s*장/.test(r.text)){if(!length)length={id:uid(),name:'분량 점검',h:.5,src:'요구사항',on:true,note:r.text}}
  else if(extra.length<4)extra.push({id:uid(),name:r.text.replace(/\s*(하세요|해야 합니다|바랍니다)\.?$/,'').slice(0,20)+' 반영',h:1,src:'요구사항',on:true,note:r.text});
 });
 return steps.concat(extra,length?[length]:[],submit?[submit]:[]);
}
function toSteps(){
 const title=$('dTitle').value.trim(),date=$('dDate').value;
 if(!title||!date){toast('일정명과 마감 날짜를 입력해 주세요.');return}
 draft.title=title;draft.type=$('dType').value;draft.date=date;draft.steps=makeSteps(draft);renderStepsPanel();
}
function toggleDraftStep(i){draft.steps[i].on=!draft.steps[i].on;renderStepsPanel()}
function adjDraftStep(i,dv){const s=draft.steps[i];s.h=Math.min(12,Math.max(.5,s.h+dv));renderStepsPanel()}
/* ===== 마이 페이지: 이 브라우저 안의 로컬 계정(서버 인증 아님) ===== */
function getAccounts(){return Store.accounts.get()}
function setAccounts(a){Store.accounts.set(a)}
async function hashPw(salt,pw){
 if(!(window.crypto&&crypto.subtle))throw new Error('nocrypto');
 const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+':'+pw));
 return Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
function newSalt(){return Array.from(crypto.getRandomValues(new Uint8Array(8))).map(x=>x.toString(16).padStart(2,'0')).join('')}
function renderProfile(){
 const el=$('profileCard');if(!el||!user)return;
 el.innerHTML=`<div class="card-title"><span>내 계정</span><span class="pill">로그인됨</span></div><p class="profile-name">${escapeHtml(user)}</p><div class="sync" id="syncStatus">${Sync.html()}</div><p class="tiny" style="margin:0 0 12px">일정·가용 시간·분석 결과가 이 닉네임으로 따로 저장됩니다.${Sync.on?' 서버(구글 시트)에도 저장되며, 보안 기능으로 보호되는 서비스는 아닙니다.':' 이 브라우저 안의 로컬 계정이며 서버 인증이 아닙니다.'}</p><button class="btn full" style="margin-top:0" onclick="logout()">로그아웃</button><button class="btn full danger-text" onclick="deleteAccount()">계정 삭제</button>`;
}
// v3.1: 앱은 로그인 화면에서 시작한다. 닉네임 + 비밀번호, 계정마다 localStorage 키를 따로 쓴다.
function setAuthMode(m){authMode=m;renderAuth()}
function renderAuth(){
 const el=$('authCard');if(!el)return;
 const su=authMode==='signup';
 el.innerHTML=`<h2 class="auth-h">${su?'회원가입':'로그인'}</h2>
 <div class="field" style="margin:0 0 12px"><label for="authId">닉네임${su?' <small>(한글·영문·숫자·_ 2~12자)</small>':''}</label><input id="authId" maxlength="16" autocomplete="username" autocapitalize="off" placeholder="닉네임" onkeydown="if(event.key==='Enter')$('authPw').focus()"></div>
 <div class="field" style="margin:0 0 12px"><label for="authPw">비밀번호${su?' <small>(6자 이상)</small>':''}</label><input id="authPw" type="password" autocomplete="${su?'new-password':'current-password'}" placeholder="비밀번호" ${su?'onkeydown="if(event.key===\'Enter\')$(\'authPw2\').focus()"':'onkeydown="if(event.key===\'Enter\')submitAuth()"'}></div>
 ${su?'<div class="field" style="margin:0 0 12px"><label for="authPw2">비밀번호 확인</label><input id="authPw2" type="password" autocomplete="new-password" placeholder="비밀번호 확인" onkeydown="if(event.key===\'Enter\')submitAuth()"></div>':''}
 <button class="btn primary full" style="margin-top:4px" onclick="submitAuth()">${su?'가입하고 시작하기':'로그인'}</button>
 <button class="btn full" onclick="setAuthMode('${su?'login':'signup'}')">${su?'이미 계정이 있어요':'처음이에요, 회원가입'}</button>
 <p class="tiny" style="margin:12px 0 0">${Sync.on?NOTES.auth:'계정과 일정은 이 브라우저 안에만 저장돼요. 서버에 계정이 만들어지지 않아 다른 기기에서는 쓸 수 없고, 비밀번호를 잊으면 찾을 수 없어요.'}</p>
 <div class="auth-links"><button onclick="openIntro()">서비스 소개</button><button onclick="navigate('terms')">이용 약관</button><button onclick="navigate('privacy')">개인정보 안내</button></div>`;
}
var authBusy=false;
function setAuthBusy(b){const el=document.querySelector('#authCard .btn.primary');if(el){el.disabled=b;el.textContent=b?'확인 중…':(authMode==='signup'?'가입하고 시작하기':'로그인')}}
async function submitAuth(){
 if(authBusy)return;
 const id=($('authId').value||'').trim().toLowerCase(),pw=$('authPw').value||'',su=authMode==='signup';
 if(su?!/^[가-힣a-z0-9_]{2,12}$/.test(id):!id){toast(su?'닉네임은 한글·영문·숫자·_ 2~12자로 입력해 주세요.':'닉네임을 입력해 주세요.');return}
 if(pw.length<6){toast('비밀번호는 6자 이상 입력해 주세요.');return}
 if(su&&pw!==$('authPw2').value){toast('비밀번호 확인이 일치하지 않습니다.');return}
 authBusy=true;setAuthBusy(true);
 try{
  if(Sync.on){ // 서버(구글 시트) 계정
   let x;try{x=await serverCall(su?'signup':'login',{nick:id,pw})}catch(e){toast('서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return}
   if(!x||!x.ok){toast(SYNC_ERR[x&&x.error]||'처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return}
   Sync.setToken(x.token);switchUser(id);Sync.afterLogin(x);
  }else{ // 이 브라우저 안의 로컬 계정
   const acc=getAccounts();
   try{
    if(su){if(acc[id]){toast('이미 사용 중인 닉네임입니다.');return}const salt=newSalt();acc[id]={salt,hash:await hashPw(salt,pw)};setAccounts(acc)}
    else if(!acc[id]||acc[id].hash!==await hashPw(acc[id].salt,pw)){toast('닉네임 또는 비밀번호가 올바르지 않습니다.');return}
   }catch(e){toast(e.message==='nocrypto'?'이 환경에서는 로그인 기능을 쓸 수 없습니다(HTTPS 필요).':'처리 중 오류가 발생했습니다.');return}
   switchUser(id);
  }
  toast(`${id}님, ${su?'가입 후 ':''}로그인했습니다.`);
 }finally{authBusy=false;setAuthBusy(false)}
}
async function logout(){
 let unsaved=false;
 if(Sync.on&&user){
  clearTimeout(Sync.timer);
  if(Sync.meta().dirty){try{await Sync.push()}catch(e){}}
  unsaved=Sync.meta().dirty;
  serverCall('logout',{nick:user,token:Sync.token()}).catch(()=>{});Sync.setToken('');
 }
 switchUser('');toast(Sync.on?(unsaved?'로그아웃했어요. 서버에 저장하지 못한 변경은 이 기기에 남아 있어요.':'로그아웃했습니다.'):'로그아웃했습니다. 계정 데이터는 이 브라우저에 남아 있습니다.');
}
async function deleteAccount(){
 if(!user||!confirm(Sync.on?`계정 "${user}"와 서버(구글 시트)에 저장된 이 계정의 모든 데이터를 삭제합니다. 되돌릴 수 없습니다.`:`계정 "${user}"와 이 계정의 일정·설정·분석 결과를 삭제합니다. 되돌릴 수 없습니다.`))return;
 const id=user;
 if(Sync.on){
  let x;try{x=await serverCall('remove',{nick:id,token:Sync.token()})}catch(e){toast('서버에 연결하지 못해 삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return}
  if(x.error==='unauthorized'){Sync.expired();toast('로그인이 만료됐어요. 다시 로그인한 뒤 삭제해 주세요.');return}
  if(!x.ok){toast('서버에서 삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return}
  Sync.setToken('');try{localStorage.removeItem(SYNCMETA_KEY+'::'+id)}catch(e){}
 }else{const acc=getAccounts();delete acc[id];setAccounts(acc)}
 [STORAGE_KEY,ANALYSIS_KEY,AVAIL_KEY,OVR_KEY,APPT_KEY].forEach(k=>Store.delFor(k,id));
 switchUser('');toast('계정을 삭제했습니다.');
}
/* 저장 위치 안내 문구: 서버 모드일 때만 바꿔 끼운다(기본 HTML은 로컬 모드 문구) */
const NOTES={
 auth:'닉네임과 일정은 팀이 만든 구글 시트에 저장돼요. 다른 기기에서도 같은 닉네임으로 로그인할 수 있어요. 비밀번호는 서버에서 해시로 바꿔 저장하지만 팀원이 시트에서 일정 데이터를 볼 수 있으니, 다른 서비스의 비밀번호는 쓰지 마세요. 비밀번호를 잊으면 찾을 수 없어요.',
 myNote:'로그인 정보와 일정은 팀이 만든 구글 시트에 저장되고, 이 기기에도 같은 데이터가 임시로 저장돼요. 보안 기능으로 보호되는 서비스가 아니니 중요한 개인정보는 넣지 마세요.',
 resetNote:'이 계정의 일정·약속·가용 시간을 초기화합니다. 서버에도 반영돼요.',
 apptNote:'개인 약속은 가용 시간 계산에만 쓰이며 AI로 보내지 않아요. 다만 계정 데이터로 구글 시트에는 저장돼요. 하루 안에 끝나는 약속만 입력할 수 있습니다.',
 termsLogin:'닉네임과 비밀번호로 가입·로그인하는 기능이며, 닉네임·비밀번호 해시·일정 데이터는 이 서비스를 운영하는 팀의 구글 시트에 저장되어 다른 기기에서도 같은 계정을 쓸 수 있습니다. 시트를 볼 수 있는 팀원은 닉네임과 일정 데이터를 열람할 수 있습니다. 로그인할 때 비밀번호가 서버(Google Apps Script)에 전달되어 해시로 바뀐 뒤 저장되므로 다른 서비스의 비밀번호를 쓰지 마세요. 프로토타입이라 보안 기능으로 보호되지 않으며, 비밀번호를 잊으면 복구할 수 없습니다.',
 privStore:'닉네임, 비밀번호 해시, 일정 데이터는 이 서비스를 운영하는 팀이 만든 구글 시트(Google Sheets)에 저장됩니다. 시트를 볼 수 있는 팀원이 이 데이터를 열람할 수 있습니다. 로그인할 때 비밀번호는 HTTPS로 서버(Google Apps Script)에 전달되어 해시로 바뀌며, 비밀번호 원문은 시트에 저장하지 않습니다. 같은 데이터가 이 기기에도 임시로 저장됩니다.',
 privDelete:'마이의 “데이터 전체 초기화”는 현재 계정의 일정, 약속, 가용 시간을 지우고 서버에도 반영합니다. “계정 삭제”는 시트에서 계정과 그 계정의 모든 데이터를 지웁니다. 이 기기에 임시 저장된 데이터는 브라우저의 사이트 데이터 삭제로 지워집니다.'
};
function applyStorageNotes(){
 if(!Sync.on)return;
 ['myNote','resetNote','apptNote','termsLogin','privStore','privDelete'].forEach(k=>{const el=$(k);if(el)el.textContent=NOTES[k]});
}
init();
