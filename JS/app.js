const STORAGE_KEY='aiStudyPlannerV3Tasks'; // v4 사용자 데이터와 호환 유지
const ANALYSIS_KEY='aiStudyPlannerV3Analysis'; // v4 분석 데이터와 호환 유지
let tasks=loadTasks(), analysis=loadAnalysis(), currentView='home', selectedDate=isoDate(new Date()), weekOffset=0, editingId=null;
const $=id=>document.getElementById(id);
function loadTasks(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||[]}catch(e){return []}}
function loadAnalysis(){try{return JSON.parse(localStorage.getItem(ANALYSIS_KEY))}catch(e){return null}}
function persist(){localStorage.setItem(STORAGE_KEY,JSON.stringify(tasks));$('settingsCount').textContent=tasks.length+'개'}
function isoDate(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`}
function dateObj(s){return new Date(s+'T12:00:00')}
function fmt(s){if(!s)return '-';const d=dateObj(s);return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function navigate(view){currentView=view;document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+view));document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));const titles={home:'AI 학업 플래너',schedule:'일정 관리',analysis:'AI 분석',settings:'설정',form:editingId?'일정 수정':'일정 등록',detail:'일정 상세'};$('appTitle').textContent=titles[view]||view;if(view==='home')renderHome();if(view==='schedule')renderSchedule();if(view==='analysis')renderAnalysis();if(view==='settings')$('settingsCount').textContent=tasks.length+'개';if(view==='detail')renderDetail()}
function markStale(){ $('staleNotice').hidden=!analysis; }
function renderHome(){
 const done=tasks.filter(t=>t.status==='완료').length,rate=tasks.length?Math.round(done/tasks.length*100):0;
 $('todayLabel').textContent=new Intl.DateTimeFormat('ko-KR',{dateStyle:'full'}).format(new Date());
 $('totalCount').textContent=tasks.length+'개';$('completionRate').textContent=rate+'%';$('completionText').textContent=`${done} / ${tasks.length} 완료`;$('completionBar').style.width=rate+'%';
 const todays=tasks.filter(t=>t.date===isoDate(new Date())).sort((a,b)=>a.title.localeCompare(b.title));
 $('todayTasks').innerHTML=todays.length?todays.map(taskRow).join(''):'<div class="empty">오늘 등록된 일정이 없습니다.<br>일정 관리에서 새 일정을 추가해 보세요.</div>';
 const rec=analysis?.items?.[0];$('homeRecommendation').innerHTML=rec?`<div class="card-title"><span>오늘 먼저 할 일정</span><span class="pill">${rec.grade} · ${rec.score}점</span></div><b>${escapeHtml(rec.title)}</b><p class="sub" style="margin:7px 0 0">${escapeHtml(rec.reason)}</p>`:'<div class="empty">아직 분석 결과가 없습니다.<br>AI 분석 화면에서 분석을 실행해 보세요.</div>';
}
function taskRow(t){return `<div class="task"><div style="min-width:0;flex:1"><div class="task-name">${escapeHtml(t.title)}</div><div class="task-meta">${escapeHtml(t.type)} · ${fmt(t.date)} · ${escapeHtml(t.status)}</div></div><div class="task-actions"><button onclick="openDetail('${t.id}')">상세</button></div></div>`}
function startOfWeek(d){const x=new Date(d);x.setHours(12,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
function renderSchedule(){
 const base=startOfWeek(dateObj(selectedDate));base.setDate(base.getDate()+weekOffset*7);
 const names=['월','화','수','목','금','토','일'];$('weekGrid').innerHTML=names.map((n,i)=>{const d=new Date(base);d.setDate(base.getDate()+i);const s=isoDate(d);return `<button class="day ${s===selectedDate?'selected':''} ${s===isoDate(new Date())?'today':''}" onclick="selectDate('${s}')">${n}<b>${d.getDate()}</b></button>`}).join('');
 $('selectedDateLabel').textContent=fmt(selectedDate)+' 일정';
 const list=tasks.filter(t=>t.date===selectedDate).sort((a,b)=>a.title.localeCompare(b.title));
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
function switchTab(tab){['direct','file','url'].forEach(x=>{$('tab-'+x).classList.toggle('hidden',x!==tab);document.querySelector(`[data-tab="${x}"]`).classList.toggle('active',x===tab)})}
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
 const items=tasks.map(t=>{const {score,days}=scoreTask(t);const grade=score>=75?'높음':score>=50?'보통':'낮음';let reason=days<0?'마감일이 지났습니다.':days===0?'마감일이 오늘입니다.':`마감까지 ${days}일 남았습니다.`;reason+=` 중요도 ${t.importance}, 예상 소요 시간 ${effortLabel(t.effort)}을 반영했습니다.`;let action=t.status==='완료'?'완료된 일정입니다.':days<=1?'남은 작업을 확인하고 제출 또는 준비를 마무리하세요.':'작업을 작은 단계로 나누고 첫 단계부터 진행하세요.';return {id:t.id,title:t.title,score,grade,reason,action,status:t.status}}).sort((a,b)=>b.score-a.score);
 analysis={createdAt:new Date().toISOString(),items};localStorage.setItem(ANALYSIS_KEY,JSON.stringify(analysis));renderAnalysis();renderHome();toast('우선순위 분석이 완료되었습니다.');
}
function renderAnalysis(){
 if(!analysis){$('analysisContent').innerHTML=tasks.length?'<div class="card empty">아직 분석 결과가 없습니다.<br>아래 버튼을 눌러 분석을 시작하세요.</div>':'<div class="card empty">등록된 일정이 없습니다.<br>일정을 먼저 추가해 주세요.</div>';return}
 const first=analysis.items.find(x=>x.status!=='완료')||analysis.items[0];
 $('analysisContent').innerHTML=`<div class="card"><div class="card-title"><span>오늘 가장 먼저 할 일정</span><span class="pill">${first.grade} · ${first.score}점</span></div><b>${escapeHtml(first.title)}</b><p class="sub" style="margin:7px 0 0">${escapeHtml(first.reason)}</p><p class="sub" style="margin:5px 0 0">행동 추천: ${escapeHtml(first.action)}</p></div><h2>일정별 우선순위</h2>${analysis.items.map(x=>`<div class="card"><div class="card-title"><span>${escapeHtml(x.title)}</span><span class="pill">${x.grade} · ${x.score}점</span></div><div class="scorebar"><i style="width:${x.score}%"></i></div><p class="sub"><b>분석 이유</b><br>${escapeHtml(x.reason)}</p><p class="sub"><b>행동 추천</b><br>${escapeHtml(x.action)}</p></div>`).join('')}<p class="tiny">마지막 분석: ${new Date(analysis.createdAt).toLocaleString('ko-KR')}</p>`;
}
function showResetModal(){$('resetModal').classList.add('show')}function hideResetModal(){$('resetModal').classList.remove('show')}
function confirmReset(){tasks=[];analysis=null;localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(ANALYSIS_KEY);hideResetModal();persist();navigate('home');toast('모든 데이터가 초기화되었습니다.')}
function init(){persist();renderHome();renderSchedule();renderAnalysis();$('fDate').value=isoDate(new Date())}
init();
