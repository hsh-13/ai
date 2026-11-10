const STORAGE_KEY='aiStudyPlannerV3Tasks'; // v4 사용자 데이터와 호환 유지
const ANALYSIS_KEY='aiStudyPlannerV3Analysis'; // v4 분석 데이터와 호환 유지
const AVAIL_KEY='aiStudyPlannerAvail'; // v6: 요일별 가용 시간(월~일, 시간 단위)
const DEFAULT_AVAIL=[2,2,2,2,2,3,3];
const USER_KEY='aiStudyPlannerUser'; // 현재 로그인한 아이디(이 브라우저의 세션)
const ACCOUNTS_KEY='aiStudyPlannerAccounts'; // 이 브라우저의 로컬 계정 {아이디:{salt,hash}}
const OVR_KEY='aiStudyPlannerAvailOverride'; // v7: 특정 날짜만 가용 시간 수정
// v7: AI 중계 서버 주소. 비워 두면 규칙 기반 Mock으로 동작한다. API 키는 이 파일에 넣지 않는다(중계 서버에서만 보관).
const AI_ENDPOINT='';
let user=loadUser(), authMode='login', tasks=loadTasks(), analysis=loadAnalysis(), avail=loadAvail(), ovr=loadOvr(), currentView='home', selectedDate=isoDate(new Date()), weekOffset=0, editingId=null;
const $=id=>document.getElementById(id);
function K(base){return user?base+'::'+user:base} // 로그인하면 계정별 키, 로그인 전은 기존 키
function loadTasks(){try{return JSON.parse(localStorage.getItem(K(STORAGE_KEY)))||[]}catch(e){return []}}
function loadAnalysis(){try{return JSON.parse(localStorage.getItem(K(ANALYSIS_KEY)))}catch(e){return null}}
function loadAvail(){try{const a=JSON.parse(localStorage.getItem(K(AVAIL_KEY)));return Array.isArray(a)&&a.length===7?a.map(Number):DEFAULT_AVAIL.slice()}catch(e){return DEFAULT_AVAIL.slice()}}
function loadUser(){try{return localStorage.getItem(USER_KEY)||''}catch(e){return ''}}
function loadOvr(){try{return JSON.parse(localStorage.getItem(K(OVR_KEY)))||{}}catch(e){return {}}}
function persist(){localStorage.setItem(K(STORAGE_KEY),JSON.stringify(tasks));$('settingsCount').textContent=tasks.length+'개'}
function isoDate(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`}
function dateObj(s){return new Date(s+'T12:00:00')}
function fmt(s){if(!s)return '-';const d=dateObj(s);return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function navigate(view){currentView=view;document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+view));document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===(view==='terms'||view==='privacy'?'settings':view)));const titles={home:'AI 학업 플래너',schedule:'일정 관리',analysis:'AI 분석',settings:'마이 페이지',terms:'이용 약관',privacy:'개인정보 취급 안내',form:editingId?'일정 수정':'일정 등록',detail:'일정 상세'};$('appTitle').textContent=titles[view]||view;if(view==='home')renderHome();if(view==='schedule')renderSchedule();if(view==='analysis')renderAnalysis();if(view==='settings'){$('settingsCount').textContent=tasks.length+'개';renderAvail();renderProfile()}if(view==='detail')renderDetail();$('fab').hidden=!(view==='home'||view==='schedule')}
function markStale(){ $('staleNotice').hidden=!analysis; }
function renderHome(){
 const done=tasks.filter(t=>t.status==='완료').length,rate=tasks.length?Math.round(done/tasks.length*100):0;
 $('todayLabel').textContent=(user?user+'님, ':'')+new Intl.DateTimeFormat('ko-KR',{dateStyle:'full'}).format(new Date());
 $('totalCount').textContent=tasks.length+'개';$('completionRate').textContent=rate+'%';$('completionText').textContent=`${done} / ${tasks.length} 완료`;$('completionBar').style.width=rate+'%';
 const todays=tasks.filter(t=>t.date===isoDate(new Date())).sort((a,b)=>a.title.localeCompare(b.title));
 $('todayTasks').innerHTML=todays.length?todays.map(taskRow).join(''):(tasks.length?'<div class="card empty">오늘 등록된 일정이 없습니다.</div>':'<div class="card empty">등록된 일정이 없습니다.<br>일정 관리에서 추가하거나 예시 데이터로 먼저 체험해 보세요.<br><button class="btn small" style="margin-top:10px" onclick="seedSample()">예시 데이터 넣기</button></div>');
 renderLoad('homeLoad',startOfWeek(new Date()));renderAdvice();renderAlloc();renderSummary();renderNearest();
 $('sampleNotice').hidden=!tasks.some(t=>t.sample);
 const rec=analysis?.items?.[0];$('homeRecommendation').innerHTML=rec?`<div class="card-title"><span>오늘 먼저 할 일정</span><span class="pill">${rec.grade} · ${rec.score}점</span></div><b>${escapeHtml(rec.title)}</b><p class="sub" style="margin:7px 0 0">${escapeHtml(rec.reason)}</p>`:'<div class="empty">아직 분석 결과가 없습니다.<br>AI 분석 화면에서 분석을 실행해 보세요.</div>';
}
/* ===== v2.3: 종류별 색·아이콘, D-day, 중요도 점 ===== */
const TYPE_STYLE={'과제':'#2f6fd6','시험':'#d94545','발표':'#0f9f8f','팀 프로젝트':'#8b5cf6'};
const TYPE_ICON={'과제':'<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>','시험':'<path d="M5 4h14v16H5z"/><path d="M9 9l2 2 4-4M9 15h6"/>','발표':'<path d="M4 5h16v11H9l-5 4z"/>','팀 프로젝트':'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M15 15a5 5 0 0 1 6 5"/>'};
function typeColor(t){return TYPE_STYLE[t]||TYPE_STYLE['과제']}
function typeIcon(t){return `<svg viewBox="0 0 24 24" aria-hidden="true">${TYPE_ICON[t]||TYPE_ICON['과제']}</svg>`}
function daysLeft(t){return Math.round((dateObj(t.date)-dateObj(isoDate(new Date())))/86400000)}
function dday(t){if(t.status==='완료')return {label:'완료',cls:'rd'};const d=daysLeft(t);return d<0?{label:'지남',cls:'r1'}:d===0?{label:'오늘',cls:'r1'}:{label:'D-'+d,cls:d<=1?'r1':d<=3?'r2':'r3'}}
function dots(t){const n={높음:3,보통:2,낮음:1}[t.importance]||2;return '●'.repeat(n)+'○'.repeat(3-n)}
function taskRow(t){const d=dday(t);return `<div class="tk ${t.status==='완료'?'done':''}" style="--c:${typeColor(t.type)}" onclick="openDetail('${t.id}')" onkeydown="if(event.key==='Enter')openDetail('${t.id}')" role="button" tabindex="0"><div class="ti">${typeIcon(t.type)}</div><div class="tk-main"><b>${escapeHtml(t.title)}${t.sample?' <span class="pill sample">예시</span>':''}</b><small>${escapeHtml(t.type)} · ${fmt(t.date)} · 중요도 ${dots(t)}</small></div><div class="tk-r"><span class="dd ${d.cls}">${d.label}</span><small>${escapeHtml(t.status)}</small></div></div>`}
function dayWord(k){const d=Math.round((dateObj(k)-dateObj(isoDate(new Date())))/86400000);if(d<=0)return '오늘';if(d===1)return '내일';if(d<7)return DAY_NAMES[(dateObj(k).getDay()+6)%7]+'요일';const x=dateObj(k);return `${x.getMonth()+1}/${x.getDate()}`}
function hh(x){return (Math.round(x*10)/10)+'h'}
function tightDay(x){return x.cap>0&&x.short<=0.001&&x.used/x.cap>=.9}
// 홈 상단 판단 카드: 이번 주(오늘부터) 필요 시간과 가용 시간 비교. 빠듯함 기준(가용 시간의 90% 이상)은 이 프로토타입에서 정한 값이다.
function renderSummary(){
 const el=$('homeSummary');if(!el)return;
 const plan=buildPlan(),base=startOfWeek(new Date()),today=isoDate(new Date());
 let cap=0,need=0;
 for(let i=0;i<7;i++){const d=new Date(base);d.setDate(base.getDate()+i);const k=isoDate(d);if(k<today)continue;cap+=availOn(d);need+=(plan.used[k]||0)+(plan.short[k]||0)}
 const active=tasks.some(t=>t.status!=='완료');
 const keys=Object.keys(plan.short).filter(k=>plan.short[k]>0.001).sort(),allShort=keys.reduce((a,k)=>a+plan.short[k],0);
 const ratio=cap>0?need/cap:(need>0?1.2:0);
 let st='none',title='아직 판단할 일정이 없어요',desc='일정을 추가하면 이번 주를 해낼 수 있는지 바로 판단해 드려요.';
 if(!active&&tasks.length){title='모든 일정을 완료했어요';desc='새 일정을 추가하면 다시 판단해 드려요.'}
 if(active){
  if(keys.length){st='bad';title=`${dayWord(keys[0])}까지 ${hh(allShort)} 부족해요`;const adv=buildAdvice(plan).sort((a,b)=>a.days-b.days)[0];desc=adv?`${escapeHtml(adv.title)} 일정이 가장 급해요. 마감까지 하루 ${hh(adv.perDay)}씩 더 확보하세요.`:''}
  else if(ratio>=.9){st='tight';title='이번 주는 빠듯해요';desc='가용 시간의 90% 이상을 쓰는 주입니다. 일정이 늘면 부족해질 수 있어요.'}
  else{st='ok';title='이번 주는 여유 있어요';desc='등록된 일정을 입력한 가용 시간 안에서 끝낼 수 있습니다.'}
 }
 const col={ok:'#16a34a',tight:'#ee9a2c',bad:'#d94545',none:'#cbd5e6'}[st],C=220;
 const icon=st==='ok'?'<circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M6.5 12.5l4 4 7-8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>':st==='none'?'<circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M12 11v6M12 7v.5" stroke="#fff" stroke-width="3" stroke-linecap="round"/>':'<circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M12 6.5v7M12 17v.5" stroke="#fff" stroke-width="3" stroke-linecap="round"/>';
 const pct=active?Math.round(ratio*100)+'%':'-';
 const chips=active?`<span class="chip">필요 ${hh(need)}</span><span class="chip">가용 ${hh(cap)}</span><span class="chip ${st==='bad'?'bad':''}">${st==='bad'?'부족 '+hh(allShort):'여유 '+hh(Math.max(0,cap-need))}</span>`:'';
 el.innerHTML=`<div class="sumcard st-${st}"><div class="ring"><svg viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="35" fill="none" stroke="#edf2fa" stroke-width="9"/><circle cx="42" cy="42" r="35" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${active?Math.round(C*(1-Math.min(ratio,1))):C}"/></svg><b><span>${pct}<small>이번 주 부하</small></span></b></div><div class="j"><span class="tg"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>이번 주 판단</span><h2>${title}</h2><p>${desc}</p></div></div>${chips?`<div class="chips">${chips}</div>`:''}`;
}
function renderNearest(){
 const list=tasks.filter(t=>t.status!=='완료').sort((a,b)=>a.date.localeCompare(b.date)),t=list[0],box=$('nearestBox');
 if(!t){$('nearestDday').textContent='-';box.classList.remove('hot');return}
 const d=daysLeft(t);$('nearestDday').textContent=d<0?'지남':d===0?'D-DAY':'D-'+d;box.classList.toggle('hot',d<=1);
}
function startOfWeek(d){const x=new Date(d);x.setHours(12,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
function renderSchedule(){
 const base=startOfWeek(dateObj(selectedDate));base.setDate(base.getDate()+weekOffset*7);
 const names=['월','화','수','목','금','토','일'];const wp=buildPlan();$('weekGrid').innerHTML=names.map((n,i)=>{const d=new Date(base);d.setDate(base.getDate()+i);const s=isoDate(d),x={cap:availOn(d),used:wp.used[s]||0,short:wp.short[s]||0},dc=x.short>0.001?'bad':tightDay(x)?'tight':(x.used>0?'ok':'none');return `<button class="day ${s===selectedDate?'selected':''} ${s===isoDate(new Date())?'today':''}" onclick="selectDate('${s}')">${n}<b>${d.getDate()}</b><i class="dot ${dc}"></i></button>`}).join('');
 $('selectedDateLabel').textContent=fmt(selectedDate)+' 일정';
 const list=tasks.filter(t=>t.date===selectedDate).sort((a,b)=>a.title.localeCompare(b.title));
 renderLoad('scheduleLoad',base);renderDayAvail();
 $('selectedTasks').innerHTML=list.length?list.map(taskRow).join(''):'<div class="empty">선택한 날짜에 일정이 없습니다.</div>';markStale();
}
function selectDate(s){selectedDate=s;weekOffset=0;renderSchedule()}
function shiftWeek(n){weekOffset+=n;renderSchedule()}
function openAdd(){editingId=null;clearForm();$('formHeading').textContent='일정 등록';switchTab('direct');$('fDate').value=selectedDate||isoDate(new Date());navigate('form')}
function openDetail(id){editingId=id;navigate('detail')}
function renderDetail(){
 const t=tasks.find(x=>x.id===editingId);if(!t){$('detailContent').innerHTML='<div class="empty">일정을 찾을 수 없습니다.</div>';return}
 $('detailContent').innerHTML=`<h1>${escapeHtml(t.title)}</h1><p class="sub">등록된 일정의 내용을 확인하고 수정할 수 있습니다.</p><div class="card"><div class="task"><span>종류</span><b>${escapeHtml(t.type)}</b></div><div class="task"><span>마감 날짜</span><b>${fmt(t.date)}</b></div><div class="task"><span>중요도</span><b>${escapeHtml(t.importance)}</b></div><div class="task"><span>예상 소요 시간</span><b>${effortLabel(t.effort)}</b></div><div class="task"><span>진행 상태</span><select onchange="changeStatus('${t.id}',this.value)" style="padding:7px;border:1px solid #ddd;border-radius:6px;font-size:10px"><option ${t.status==='시작 전'?'selected':''}>시작 전</option><option ${t.status==='진행 중'?'selected':''}>진행 중</option><option ${t.status==='완료'?'selected':''}>완료</option></select></div></div>${analysis?.items?.find(x=>x.id===t.id)?`<div class="card"><h3>최근 AI 분석</h3><p class="sub">${escapeHtml(analysis.items.find(x=>x.id===t.id).reason)}</p></div>`:''}<button class="btn primary full" onclick="editTask('${t.id}')">일정 수정</button><button class="btn danger full" onclick="deleteTask('${t.id}')">일정 삭제</button>`;
}
function effortLabel(m){return m>=300?'5시간 이상':m>=180?'3시간':m>=120?'2시간':m>=60?'1시간':'30분'}
function changeStatus(id,status){const t=tasks.find(x=>x.id===id);if(t){t.status=status;persist();markStale();renderDetail();toast('진행 상태가 변경되었습니다.');}}
function editTask(id){const t=tasks.find(x=>x.id===id);if(!t)return;editingId=id;$('formHeading').textContent='일정 수정';$('fTitle').value=t.title;$('fType').value=t.type;$('fDate').value=t.date;$('fImportance').value=t.importance;$('fEffort').value=t.effort;$('fStatus').value=t.status;switchTab('direct');navigate('form')}
function deleteTask(id){if(!confirm('이 일정을 삭제할까요?'))return;tasks=tasks.filter(t=>t.id!==id);persist();markStale();navigate('schedule');toast('일정이 삭제되었습니다.')}
function clearForm(){['fTitle','fDate'].forEach(id=>$(id).value='');$('fType').value='과제';$('fImportance').value='보통';$('fEffort').value='60';$('fStatus').value='시작 전';}
function switchTab(tab){['direct','paste','file','url'].forEach(x=>{$('tab-'+x).classList.toggle('hidden',x!==tab);document.querySelector(`[data-tab="${x}"]`).classList.toggle('active',x===tab)})}
function fillSample(){if($('fileInput').files.length===0&&document.querySelector('[data-tab="file"]').classList.contains('active')){toast('먼저 파일을 선택해 주세요.');return} $('fTitle').value='자료구조 과제 제출';$('fType').value='과제';$('fDate').value=isoDate(new Date());$('fImportance').value='보통';$('fEffort').value='120';$('fStatus').value='시작 전';switchTab('direct');toast('예시 추출값을 입력했습니다. 내용을 확인하고 수정하세요.')}
function saveTask(){
 const title=$('fTitle').value.trim(),date=$('fDate').value;if(!title||!date){toast('일정명과 마감 날짜를 입력해 주세요.');return}
 const data={title,type:$('fType').value,date,importance:$('fImportance').value,effort:Number($('fEffort').value),status:$('fStatus').value};
 if(editingId){const t=tasks.find(x=>x.id===editingId);Object.assign(t,data);toast('일정이 수정되었습니다.')}else{tasks.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),...data});toast('일정이 등록되었습니다.')}
 persist();markStale();selectedDate=date;weekOffset=0;navigate('schedule');
}
function scoreTask(t){const days=Math.ceil((dateObj(t.date)-dateObj(isoDate(new Date())))/86400000);const deadline=days<0?100:days===0?100:days===1?85:days<=3?70:days<=7?50:25;const importance={높음:100,보통:60,낮음:30}[t.importance]||60;const effort=t.effort>=300?90:t.effort>=180?75:t.effort>=120?60:t.effort>=60?40:25;let score=Math.round(deadline*.5+importance*.3+effort*.2);if(t.status==='완료')score=0;return {score,days}}
function runAnalysis(){
 if(!tasks.length){toast('먼저 일정을 등록해 주세요.');navigate('schedule');return}
 const plan=buildPlan();
 const items=tasks.map(t=>{const {score,days}=scoreTask(t);const grade=score>=75?'높음':score>=50?'보통':'낮음';let reason=days<0?'마감일이 지났습니다.':days===0?'마감일이 오늘입니다.':`마감까지 ${days}일 남았습니다.`;reason+=` 중요도 ${t.importance}, 예상 소요 시간 ${effortLabel(t.effort)}을 반영했습니다.`;if(plan.taskShort[t.id])reason+=` 입력한 가용 시간 기준으로 마감 전까지 약 ${fh(plan.taskShort[t.id])}이 부족합니다.`;let action=t.status==='완료'?'완료된 일정입니다.':days<=1?'남은 작업을 확인하고 제출 또는 준비를 마무리하세요.':'작업을 작은 단계로 나누고 첫 단계부터 진행하세요.';return {id:t.id,title:t.title,score,grade,reason,action,status:t.status}}).sort((a,b)=>b.score-a.score);
 analysis={createdAt:new Date().toISOString(),items};localStorage.setItem(K(ANALYSIS_KEY),JSON.stringify(analysis));renderAnalysis();renderHome();toast('우선순위 분석이 완료되었습니다.');
}
function renderAnalysis(){
 if(!analysis){$('analysisContent').innerHTML=tasks.length?'<div class="card empty">아직 분석 결과가 없습니다.<br>아래 버튼을 눌러 분석을 시작하세요.</div>':'<div class="card empty">등록된 일정이 없습니다.<br>일정을 먼저 추가해 주세요.</div>';return}
 const plan=buildPlan();
 const first=analysis.items.find(x=>x.status!=='완료')||analysis.items[0];
 const card=(x,i)=>{const t=tasks.find(y=>y.id===x.id),sh=plan.taskShort[x.id];return `<div class="rk"><div class="top"><div class="n ${i>1?'n3':''}">${i+1}</div><div class="rk-t"><b>${escapeHtml(x.title)}</b><small>${t?escapeHtml(t.type)+' · '+dday(t).label:''}</small></div><div class="sc">${x.score}<small> 점</small></div></div><div class="scorebar"><i style="width:${x.score}%"></i></div><p class="sub"><b>분석 이유</b><br>${escapeHtml(x.reason)}</p><p class="sub"><b>행동 추천</b><br>${escapeHtml(x.action)}</p><div class="tags"><span class="tg2">우선순위 ${x.grade}</span>${sh?`<span class="tg2 r">부족 ${hh(sh)}</span>`:''}${t?`<span class="tg2">소요 ${effortLabel(t.effort)}</span>`:''}</div></div>`};
 $('analysisContent').innerHTML=`<div class="card first"><div class="card-title"><span>오늘 가장 먼저 할 일정</span><span class="pill">${first.grade} · ${first.score}점</span></div><b>${escapeHtml(first.title)}</b><p class="sub" style="margin:7px 0 0">${escapeHtml(first.reason)}</p><p class="sub" style="margin:5px 0 0">행동 추천: ${escapeHtml(first.action)}</p></div><div class="sec"><b>일정별 우선순위</b></div>${analysis.items.map(card).join('')}<p class="tiny">마지막 분석: ${new Date(analysis.createdAt).toLocaleString('ko-KR')}</p>`;
}
function showResetModal(){$('resetModal').classList.add('show')}function hideResetModal(){$('resetModal').classList.remove('show')}
function confirmReset(){tasks=[];analysis=null;avail=DEFAULT_AVAIL.slice();ovr={};localStorage.removeItem(K(OVR_KEY));localStorage.removeItem(K(STORAGE_KEY));localStorage.removeItem(K(ANALYSIS_KEY));localStorage.removeItem(K(AVAIL_KEY));hideResetModal();persist();navigate('home');toast('모든 데이터가 초기화되었습니다.')}

/* ===== v6: 가용 시간 · 주간 부하 · 예시 데이터 ===== */
const DAY_NAMES=['월','화','수','목','금','토','일'];
function fh(h){return (Math.round(h*10)/10)+'시간'}
function availOn(d){const k=isoDate(d);if(ovr[k]!==undefined)return Number(ovr[k])||0;return Number(avail[(d.getDay()+6)%7])||0}
// 마감 임박 순으로, 각 일정의 소요 시간을 마감일부터 거꾸로 가용 시간에 채워 넣는다(날짜 계산은 코드가 담당).
function buildPlan(){
 const today=dateObj(isoDate(new Date())),used={},short={},taskShort={},alloc={};
 tasks.filter(t=>t.status!=='완료').sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{
  let rem=t.effort/60,dl=dateObj(t.date);if(dl<today)dl=new Date(today);
  for(const d=new Date(dl);d>=today&&rem>0;d.setDate(d.getDate()-1)){
   const k=isoDate(d),take=Math.min(Math.max(0,availOn(d)-(used[k]||0)),rem);
   if(take>0){used[k]=(used[k]||0)+take;rem-=take;(alloc[k]=alloc[k]||[]).push({id:t.id,title:t.title,h:take})}
  }
  if(rem>0.001){const k=isoDate(dl);short[k]=(short[k]||0)+rem;taskShort[t.id]=rem}
 });
 return {used,short,taskShort,alloc};
}
function renderLoad(elId,base){
 const el=$(elId);if(!el)return;
 const plan=buildPlan(),today=isoDate(new Date());
 const days=DAY_NAMES.map((n,i)=>{const d=new Date(base);d.setDate(base.getDate()+i);const k=isoDate(d);return {n,k,cap:availOn(d),used:plan.used[k]||0,short:plan.short[k]||0,past:k<today}});
 const max=Math.max(4,...days.map(x=>Math.max(x.cap,x.used+x.short)));
 const over=days.filter(x=>x.short>0.001),total=over.reduce((a,x)=>a+x.short,0);
 const hasData=tasks.some(t=>t.status!=='완료');
 el.innerHTML=`<div class="card-title"><span>주간 부하</span><span class="tiny">점선 = 내 가용 시간</span></div>
 <div class="load">${days.map(x=>`<div class="load-col ${x.past?'past':''} ${x.k===today?'today':''}"><div class="load-bar"><i class="cap" style="bottom:${x.cap/max*100}%"></i><i class="use ${tightDay(x)?'tight':''}" style="height:${x.used/max*100}%"></i><i class="short" style="height:${x.short/max*100}%;bottom:${x.used/max*100}%"></i></div><b class="${x.short>0.001?'bad':tightDay(x)?'tight':''}">${x.short>0.001?'+'+fh(x.short).replace('시간','h'):tightDay(x)?'빠듯':(x.used?fh(x.used).replace('시간','h'):'-')}</b><span>${x.n}</span></div>`).join('')}</div>
 <p class="load-msg ${over.length?'bad':''}">${!hasData?'일정을 등록하면 주간 부하가 표시됩니다.':over.length?`⚠ 가용 시간이 부족한 날이 ${over.length}일 있습니다 (합계 +${fh(total)}). 막대 위 빨간 부분은 마감 전까지 배정하지 못한 시간입니다.`:'이 주는 입력한 가용 시간 안에서 소화할 수 있습니다.'}</p>`;
}
function renderAvail(){
 $('availGrid').innerHTML=DAY_NAMES.map((n,i)=>`<label class="avail"><span>${n}</span><input type="number" min="0" max="16" step="0.5" value="${avail[i]}" onchange="setAvail(${i},this.value)"></label>`).join('');
}
function setAvail(i,v){const n=Math.min(16,Math.max(0,Number(v)||0));avail[i]=n;localStorage.setItem(K(AVAIL_KEY),JSON.stringify(avail));renderAvail();markStale();toast('가용 시간이 저장되었습니다.')}
function seedSample(){
 if(tasks.some(t=>t.sample)){toast('이미 예시 데이터가 있습니다.');return}
 const off=n=>{const d=new Date();d.setDate(d.getDate()+n);return isoDate(d)};
 const rows=[['자료구조 과제 제출','과제',2,'높음',180],['생성형 AI 팀 프로젝트 발표','팀 프로젝트',3,'높음',300],['영어 퀴즈 준비','시험',3,'보통',120],['독서 감상문','과제',5,'낮음',60],['데이터베이스 중간고사','시험',6,'높음',300]];
 rows.forEach(r=>tasks.push({id:'sample-'+Date.now()+'-'+r[0].length+r[2],title:r[0],type:r[1],date:off(r[2]),importance:r[3],effort:r[4],status:'시작 전',sample:true}));
 persist();markStale();navigate(currentView==='settings'?'settings':'home');toast('예시 데이터 5건을 넣었습니다.');
}
function clearSample(){tasks=tasks.filter(t=>!t.sample);persist();markStale();analysis=null;localStorage.removeItem(K(ANALYSIS_KEY));navigate(currentView);toast('예시 데이터를 삭제했습니다.')}

/* ===== v7: 오늘 할 일 · 조정 제안 · 날짜별 가용 시간 · 공지 붙여넣기 · AI 연결 지점 ===== */
function renderAlloc(){
 const el=$('homeAlloc');if(!el)return;
 const plan=buildPlan(),items=plan.alloc[isoDate(new Date())]||[],tot=items.reduce((a,x)=>a+x.h,0);
 $('allocMeta').textContent=items.length?`${items.length}건 · 총 ${hh(tot)}`:'';
 el.innerHTML=items.length?items.map(x=>{const t=tasks.find(y=>y.id===x.id);if(!t)return '';const d=dday(t),sh=plan.taskShort[x.id];return `<div class="tk" style="--c:${typeColor(t.type)}" onclick="openDetail('${t.id}')" onkeydown="if(event.key==='Enter')openDetail('${t.id}')" role="button" tabindex="0"><div class="ti">${typeIcon(t.type)}</div><div class="tk-main"><b>${escapeHtml(t.title)}</b><small>${escapeHtml(t.type)} · ${sh?'부족 '+hh(sh):'마감 '+fmt(t.date)}</small></div><div class="tk-r"><b class="hrs">${hh(x.h)}</b><span class="dd ${d.cls}">${d.label}</span></div></div>`}).join('')+`<p class="tiny" style="margin:4px 2px 0">마감일부터 거꾸로 가용 시간에 배정한 오늘 몫입니다.</p>`:'<div class="card empty">오늘 배정된 작업이 없습니다.</div>';
}
function buildAdvice(plan){
 const today=dateObj(isoDate(new Date()));
 return tasks.filter(t=>plan.taskShort[t.id]).map(t=>{
  let dl=dateObj(t.date);if(dl<today)dl=today;
  const days=Math.round((dl-today)/86400000)+1,sh=plan.taskShort[t.id];
  return {title:t.title,short:sh,days,perDay:sh/days};
 });
}
function renderAdvice(){
 const el=$('homeAdvice');if(!el)return;
 const list=buildAdvice(buildPlan());
 el.innerHTML=list.length?`<div class="card advice"><div class="card-title"><span>조정이 필요한 일정</span></div>${list.map(a=>`<p><b>${escapeHtml(a.title)}</b><br>마감 전까지 ${fh(a.short)}이 부족합니다. 마감까지 ${a.days}일 동안 하루 ${fh(a.perDay)}씩 더 확보하거나, 소요 시간을 줄이거나, 다른 일정을 미뤄야 합니다.</p>`).join('')}</div>`:'';
}
function renderDayAvail(){
 const el=$('dayAvail');if(!el)return;
 const d=dateObj(selectedDate),has=ovr[selectedDate]!==undefined;
 el.innerHTML=`<div class="card-title"><span>${fmt(selectedDate)} 가용 시간</span><span class="tiny">${has?'이 날만 수정됨':'요일 기본값 사용'}</span></div><div class="row"><input class="num" type="number" min="0" max="16" step="0.5" value="${availOn(d)}" onchange="setOvr('${selectedDate}',this.value)"><button class="btn small" onclick="setOvr('${selectedDate}','')">기본값으로</button></div><p class="tiny" style="margin:8px 0 0">알바·약속 등으로 이 날만 시간이 다르면 여기서 바꾸세요. 부하 막대에 바로 반영됩니다.</p>`;
}
function setOvr(k,v){if(v===''||v===null){delete ovr[k]}else{ovr[k]=Math.min(16,Math.max(0,Number(v)||0))}localStorage.setItem(K(OVR_KEY),JSON.stringify(ovr));markStale();renderSchedule();toast(v===''?'기본값으로 되돌렸습니다.':'이 날의 가용 시간이 저장되었습니다.')}

// ---- AI 연결 지점: 엔드포인트가 있으면 중계 서버로, 없으면 규칙 기반 Mock으로 처리 ----
async function aiCall(task,payload){
 if(!AI_ENDPOINT)return null;
 const r=await fetch(AI_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task,...payload})});
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
async function extractNotice(){
 const text=$('noticeInput').value.trim();if(!text){toast('공지 내용을 붙여넣어 주세요.');return}
 let r=null,mode='규칙 기반(Mock)';
 try{const x=await aiCall('extract',{text,today:isoDate(new Date())});if(validExtract(x)){r=x;mode='AI'}}catch(e){toast('AI 연결에 실패해 규칙 기반으로 추출했습니다.')}
 if(!r)r=mockExtract(text);
 $('fTitle').value=r.title;$('fType').value=r.type;$('fDate').value=r.date;$('fImportance').value=r.importance;$('fEffort').value=String(r.effort);$('fStatus').value='시작 전';
 switchTab('direct');
 toast(r.date?`${mode}으로 추출했습니다. 내용을 확인하고 수정하세요.`:'날짜를 찾지 못했습니다. 마감 날짜를 직접 입력해 주세요.');
}
async function getAiComment(){
 const plan=buildPlan(),today=plan.alloc[isoDate(new Date())]||[],adv=buildAdvice(plan);
 let text=null,mode='규칙 기반(Mock)';
 try{const x=await aiCall('comment',{today:today.map(a=>({title:a.title,hours:a.h})),shortages:adv.map(a=>({title:a.title,shortHours:a.short,days:a.days}))});if(x&&typeof x.comment==='string'&&x.comment.trim()){text=x.comment.trim();mode='AI'}}catch(e){toast('AI 연결에 실패해 기본 문장을 보여줍니다.')}
 if(!text){
  text=today.length?`오늘은 ${today.map(a=>`${a.title} ${fh(a.h)}`).join(', ')} 순서로 진행하세요.`:'오늘 배정된 작업이 없습니다.';
  if(adv.length)text+=` 다만 ${adv.map(a=>a.title).join(', ')}은(는) 가용 시간이 부족하니 일정이나 가용 시간을 조정해 보세요.`;
 }
 $('aiComment').innerHTML=`<div class="bubble"><div class="l">AI 코멘트<span>${mode}</span></div><p>${escapeHtml(text)}</p></div>`;
}

/* ===== 마이 페이지: 이 브라우저 안의 로컬 계정(서버 인증 아님) ===== */
function getAccounts(){try{return JSON.parse(localStorage.getItem(ACCOUNTS_KEY))||{}}catch(e){return {}}}
function setAccounts(a){localStorage.setItem(ACCOUNTS_KEY,JSON.stringify(a))}
async function hashPw(salt,pw){
 if(!(window.crypto&&crypto.subtle))throw new Error('nocrypto');
 const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+':'+pw));
 return Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
function newSalt(){return Array.from(crypto.getRandomValues(new Uint8Array(8))).map(x=>x.toString(16).padStart(2,'0')).join('')}
function renderProfile(){
 const el=$('profileCard');if(!el)return;
 if(user){
  el.innerHTML=`<div class="card-title"><span>내 계정</span><span class="pill">로그인됨</span></div><p class="profile-name">${escapeHtml(user)}</p><p class="tiny" style="margin:0 0 12px">일정·가용 시간·분석 결과가 이 아이디로 따로 저장됩니다. 이 브라우저 안의 로컬 계정이며 서버 인증이 아닙니다.</p><button class="btn full" style="margin-top:0" onclick="logout()">로그아웃</button><button class="btn full danger-text" onclick="deleteAccount()">계정 삭제</button>`;
  return;
 }
 const su=authMode==='signup';
 el.innerHTML=`<div class="card-title"><span>${su?'회원가입':'로그인'}</span><span class="pill">로그인 전</span></div>
 <div class="field" style="margin:0 0 10px"><label>아이디 (영문 소문자·숫자·_ 4~16자)</label><input id="authId" maxlength="16" autocomplete="username" autocapitalize="off"></div>
 <div class="field" style="margin:0 0 10px"><label>비밀번호 (6자 이상)</label><input id="authPw" type="password" autocomplete="${su?'new-password':'current-password'}" ${su?'':'onkeydown="if(event.key===\'Enter\')submitAuth()"'}></div>
 ${su?'<div class="field" style="margin:0 0 10px"><label>비밀번호 확인</label><input id="authPw2" type="password" autocomplete="new-password" onkeydown="if(event.key===\'Enter\')submitAuth()"></div>':''}
 <button class="btn primary full" style="margin-top:0" onclick="submitAuth()">${su?'가입하고 로그인':'로그인'}</button>
 <button class="btn full" onclick="authMode='${su?'login':'signup'}';renderProfile()">${su?'이미 계정이 있어요':'회원가입'}</button>
 <p class="tiny" style="margin:9px 0 0">이 브라우저 안에서만 동작하는 계정입니다. 서버에 계정이 만들어지지 않고 다른 기기에서는 쓸 수 없으며, 비밀번호를 잊으면 찾을 수 없습니다. 로그인 전에 입력한 일정은 로그인한 계정에서 보이지 않습니다(로그아웃하면 다시 보입니다).</p>`;
}
async function submitAuth(){
 const id=($('authId').value||'').trim().toLowerCase(),pw=$('authPw').value||'';
 if(!/^[a-z0-9_]{4,16}$/.test(id)){toast('아이디는 영문 소문자·숫자·_ 4~16자로 입력해 주세요.');return}
 if(pw.length<6){toast('비밀번호는 6자 이상 입력해 주세요.');return}
 const acc=getAccounts();
 try{
  if(authMode==='signup'){
   if(pw!==$('authPw2').value){toast('비밀번호 확인이 일치하지 않습니다.');return}
   if(acc[id]){toast('이미 있는 아이디입니다.');return}
   const salt=newSalt();acc[id]={salt,hash:await hashPw(salt,pw)};setAccounts(acc);
  }else{
   if(!acc[id]||acc[id].hash!==await hashPw(acc[id].salt,pw)){toast('아이디 또는 비밀번호가 올바르지 않습니다.');return}
  }
 }catch(e){toast(e.message==='nocrypto'?'이 환경에서는 로그인 기능을 쓸 수 없습니다(HTTPS 필요).':'처리 중 오류가 발생했습니다.');return}
 const wasSignup=authMode==='signup';switchUser(id);toast(`${id}님, ${wasSignup?'가입 후 ':''}로그인했습니다.`);
}
function switchUser(id){
 user=id;try{id?localStorage.setItem(USER_KEY,id):localStorage.removeItem(USER_KEY)}catch(e){}
 authMode='login';tasks=loadTasks();analysis=loadAnalysis();avail=loadAvail();ovr=loadOvr();
 persist();renderHome();renderSchedule();renderAnalysis();markStale();navigate('settings');
}
function logout(){switchUser('');toast('로그아웃했습니다. 계정 데이터는 이 브라우저에 남아 있습니다.')}
function deleteAccount(){
 if(!user||!confirm(`계정 "${user}"와 이 계정의 일정·설정·분석 결과를 삭제합니다. 되돌릴 수 없습니다.`))return;
 const id=user,acc=getAccounts();delete acc[id];setAccounts(acc);
 [STORAGE_KEY,ANALYSIS_KEY,AVAIL_KEY,OVR_KEY].forEach(k=>localStorage.removeItem(k+'::'+id));
 switchUser('');toast('계정을 삭제했습니다.');
}
function init(){persist();$('fab').hidden=false;renderAvail();$('noticeMode').textContent=AI_ENDPOINT?'AI 중계 서버로 추출합니다.':'현재는 규칙 기반 Mock으로 추출합니다(AI 서버 미연결).';renderHome();renderSchedule();renderAnalysis();$('fDate').value=isoDate(new Date())}
init();
