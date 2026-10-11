'use strict';
// 오늘의 수업은 날짜·문자별로 고정합니다. 앱을 껐다 켜도 완료한 단계부터 이어갑니다.
store.course = store.course && typeof store.course === 'object' ? store.course : {plans:{}};
store.course.plans = store.course.plans || {};
// 지난 수업은 60일까지만 보관해요. 저장 공간과 백업 파일이 계속 커지지 않게 해요.
{const cutoff=dayKey(addDays(startOfDay(),-60));for(const key of Object.keys(store.course.plans))if(key.slice(0,10)<cutoff)delete store.course.plans[key];}
const courseScript = () => store.settings.courseScript === 'kata' ? 'kata' : 'hira';
const courseNewGoal = () => [3,5,10].includes(Number(store.settings.courseNew)) ? Number(store.settings.courseNew) : 5;
const courseReviewGoal = () => [5,10,15].includes(Number(store.settings.courseReview)) ? Number(store.settings.courseReview) : 10;
const courseKey = (script=courseScript(),time=Date.now()) => dayKey(time)+':'+script;
const seenStat = s => Boolean(s?.studied || s?.correct || s?.wrong);
const courseItems = script => KANA_DATA.filter(item => item[script]);
function courseTotals(script){
  const items=courseItems(script);
  return {total:items.length,seen:items.filter(i=>seenStat(store.stats[script+':'+i.id])).length,mastered:items.filter(i=>(store.stats[script+':'+i.id]?.streak||0)>=3).length};
}
function makeCoursePlan(script=courseScript(),now=Date.now()){
  const items=courseItems(script),newIds=items.filter(i=>!seenStat(store.stats[script+':'+i.id])).slice(0,courseNewGoal()).map(i=>i.id);
  const seen=items.filter(i=>seenStat(store.stats[script+':'+i.id]));
  seen.sort((a,b)=>{
    const sa=store.stats[script+':'+a.id],sb=store.stats[script+':'+b.id];
    // 복습일이 지난 글자, 최근 틀린 글자, 오래 전에 본 글자 순으로 복습해요.
    return (dueOf(sa)>=addDays(startOfDay(now),1))-(dueOf(sb)>=addDays(startOfDay(now),1)) || (sa.streak>0)-(sb.streak>0) || (sa.last||0)-(sb.last||0);
  });
  const source=seen.length?seen.map(i=>i.id):newIds;
  const reviewIds=source.length?Array.from({length:courseReviewGoal()},(_,index)=>source[index%source.length]):[];
  return {date:dayKey(now),script,newIds,studied:[],confirmDone:[],reviewIds,reviewDone:[],created:now};
}
function currentCoursePlan(){
  const key=courseKey();
  if(!store.course.plans[key]){store.course.plans[key]=makeCoursePlan();saveStore();}
  return store.course.plans[key];
}
function coursePhase(plan){
  if(plan.studied.length<plan.newIds.length)return 'study';
  if(plan.confirmDone.length<plan.newIds.length)return 'confirm';
  if(plan.reviewDone.length<plan.reviewIds.length)return 'review';
  return 'complete';
}
function courseProgress(plan){const total=plan.newIds.length*2+plan.reviewIds.length,done=plan.studied.length+plan.confirmDone.length+plan.reviewDone.length;return {total,done,percent:total?Math.min(100,Math.round(done/total*100)):100};}
function mergeCourseBackup(backup){
  if(!backup?.plans||typeof backup.plans!=='object')return;
  for(const [key,plan] of Object.entries(backup.plans)){
    if(!/^\d{4}-\d{2}-\d{2}:(hira|kata)$/.test(key)||!plan||plan.script!==key.split(':')[1])continue;
    if(!Array.isArray(plan.newIds)||!Array.isArray(plan.reviewIds)||plan.newIds.length>10||plan.reviewIds.length>15)continue;
    if(new Set(plan.newIds).size!==plan.newIds.length)continue;
    if([...plan.newIds,...plan.reviewIds].some(id=>!Number.isInteger(id)||!KANA_DATA[id]?.[plan.script]))continue;
    const unique=(list,valid)=>Array.isArray(list)?[...new Set(list.filter(valid))]:[];
    const safe={date:key.split(':')[0],script:plan.script,newIds:[...new Set(plan.newIds)],reviewIds:plan.reviewIds,created:Number(plan.created)||0,studied:unique(plan.studied,id=>plan.newIds.includes(id)),confirmDone:unique(plan.confirmDone,index=>Number.isInteger(index)&&index>=0&&index<plan.newIds.length),reviewDone:unique(plan.reviewDone,index=>Number.isInteger(index)&&index>=0&&index<plan.reviewIds.length)};
    const current=store.course.plans[key];
    if(!current||courseProgress(safe).done>courseProgress(current).done)store.course.plans[key]=safe;
  }
}
let todayStudyOpen=false, dailyRestore=null;
function renderToday(){
  const plan=currentCoursePlan(),phase=coursePhase(plan),progress=courseProgress(plan),script=courseScript();
  document.querySelectorAll('[data-course-script]').forEach(button=>{const active=button.dataset.courseScript===script;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  $('course-new').value=String(courseNewGoal());$('course-review').value=String(courseReviewGoal());
  $('today-date').textContent=new Date().toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'});
  $('today-title').textContent=phase==='complete'?'오늘의 학습을 마쳤어요!':'오늘도 한 걸음, 가나를 익혀요.';
  $('today-description').textContent=plan.newIds.length?`새 글자 ${plan.newIds.length}개와 확인 ${plan.newIds.length}문제, 복습 ${plan.reviewIds.length}문제 · 약 10~15분`:`복습 ${plan.reviewIds.length}문제로 익힌 글자를 오래 기억해요.`;
  $('today-percent').textContent=progress.percent+'%';$('today-progress').value=progress.done;$('today-progress').max=progress.total||1;
  $('today-streak').textContent=streakDays()?'연속 학습 '+streakDays()+'일':'작은 습관의 첫날';
  $('today-stage-text').textContent=`새 글자 ${plan.studied.length}/${plan.newIds.length} · 확인 ${plan.confirmDone.length}/${plan.newIds.length} · 복습 ${plan.reviewDone.length}/${plan.reviewIds.length}`;
  $('today-start').textContent=({study:todayStudyOpen?'다음 학습 글자 보기 →':'오늘의 학습 시작 →',confirm:'확인 문제 이어 풀기 →',review:'오늘의 복습 이어 풀기 →',complete:'오늘 학습 완료 ✓'}[phase]);
  $('today-start').disabled=phase==='complete';
  $('today-plan-letters').innerHTML=plan.newIds.length?plan.newIds.map(id=>'<span lang="ja" class="'+(plan.studied.includes(id)?'seen':'')+'">'+escapeHtml(KANA_DATA[id][script])+'</span>').join(''):'<span class="muted">이 문자의 새 글자를 모두 만나 봤어요.</span>';
  $('today-settings-note').textContent=progress.done?'학습량을 바꾸면 다음 날부터 적용돼요. 오늘 시작한 수업은 유지합니다.':'처음에는 새 글자 5개와 복습 10문제로 가볍게 시작해 보세요.';
  const summary=$('course-summary');summary.replaceChildren();
  for(const s of ['hira','kata']){
    const totals=courseTotals(s),card=document.createElement('article');card.className='course-stat';
    card.innerHTML='<div><h3>'+(s==='hira'?'히라가나':'가타카나')+'</h3><strong>'+Math.round(totals.mastered/totals.total*100)+'<small>% 익힘</small></strong></div><progress max="'+totals.total+'" value="'+totals.mastered+'" aria-label="'+(s==='hira'?'히라가나':'가타카나')+' 익힌 글자"></progress><p>만난 글자 <b>'+totals.seen+' / '+totals.total+'</b> · 익힌 글자 <b>'+totals.mastered+'</b></p>';
    summary.append(card);
  }
  $('today-study').hidden=!todayStudyOpen||phase!=='study';
  if(todayStudyOpen&&phase==='study'){
    const item=KANA_DATA[plan.newIds.find(id=>!plan.studied.includes(id))],example=item[script+'Example'];
    $('today-char').textContent=item[script];$('today-reading').textContent=item.romaji+' · '+item.ko;
    $('today-word').textContent=example.word;$('today-word-reading').textContent=example.reading;$('today-meaning').textContent=example.meaning;
    $('today-study-position').textContent=(plan.studied.length+1)+' / '+plan.newIds.length;
    $('today-char-audio').onclick=()=>speakKana(item);$('today-word-audio').onclick=()=>speak(example.word);
    $('today-strokes').onclick=()=>{setScript(script);state.range='all';$('range').value='all';state.selected=item.id;setMode('learn');toggleStrokes(true);};
  }
}
function markCourseStudied(){
  const plan=currentCoursePlan(),id=plan.newIds.find(id=>!plan.studied.includes(id));if(id===undefined)return;
  const key=plan.script+':'+id,s=store.stats[key]||{correct:0,wrong:0,streak:0};
  store.stats[key]={...s,studied:true,last:s.last||Date.now(),due:Number.isFinite(s.due)?s.due:addDays(startOfDay(),1)};
  plan.studied.push(id);saveStore();stopAudio();renderToday();
  if(coursePhase(plan)==='confirm'){todayStudyOpen=false;beginCourseQuiz('confirm');}
}
function beginCourseQuiz(phase){
  const plan=currentCoursePlan(),ids=phase==='confirm'?plan.newIds:plan.reviewIds,done=phase==='confirm'?plan.confirmDone:plan.reviewDone;
  const indices=ids.map((_,index)=>index).filter(index=>!done.includes(index));if(!indices.length){renderToday();return;}
  if(!dailyRestore)dailyRestore={script:state.script,range:state.range,type:state.quizType};
  setScript(plan.script);state.range='all';$('range').value='all';setMode('quiz');resetQuiz();
  const items=indices.map(index=>KANA_DATA[ids[index]]);
  startQuiz(items,{ordered:true,count:items.length,daily:{key:courseKey(),phase,indices},types:items.map((item,index)=>{
    const type=['reading','listening','word'][indices[index]%3];return type==='word'&&!item[plan.script+'Example'].word.includes(item[plan.script])?'reading':type;
  })});
}
function startToday(){
  const phase=coursePhase(currentCoursePlan());
  if(phase==='study'){todayStudyOpen=true;renderToday();$('today-study').scrollIntoView({block:'start',behavior:reducedMotion()?'auto':'smooth'});}
  else if(['confirm','review'].includes(phase))beginCourseQuiz(phase);
}
function recordDailyAnswer(){
  const q=state.quiz;if(!q?.daily)return;
  const plan=store.course.plans[q.daily.key];if(!plan)return;
  const done=q.daily.phase==='confirm'?plan.confirmDone:plan.reviewDone,index=q.daily.indices[q.index];
  if(!done.includes(index))done.push(index);
  saveStore();renderToday();
}
function returnToToday(){
  stopAudio();resetQuiz();
  if(dailyRestore){setScript(dailyRestore.script);state.range=dailyRestore.range;$('range').value=state.range;setQuizType(dailyRestore.type);dailyRestore=null;updateRangeOptions();}
  todayStudyOpen=false;setMode('today');window.scrollTo({top:0,behavior:'auto'});
}
// ---- 今日 UI 연결 ----
$('today-tab').onclick=returnToToday;
$('today-start').onclick=startToday;$('today-mark').onclick=markCourseStudied;
document.querySelectorAll('[data-course-script]').forEach(button=>button.onclick=()=>{todayStudyOpen=false;saveSetting('courseScript',button.dataset.courseScript);renderToday();});
for(const [id,key] of [['course-new','courseNew'],['course-review','courseReview']])$(id).onchange=()=>{
  saveSetting(key,Number($(id).value));const plan=currentCoursePlan();
  if(!courseProgress(plan).done){delete store.course.plans[courseKey()];todayStudyOpen=false;}
  saveStore();renderToday();
};
// 잠깐 다른 앱을 보고 돌아와도 보던 학습 카드는 유지해요. 날짜가 바뀌었을 때만 새 수업으로 넘어가요.
let lastTodayKey=dayKey();
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(dayKey()!==lastTodayKey){lastTodayKey=dayKey();todayStudyOpen=false;}renderToday();renderBackupReminder();});
// 안드로이드 뒤로 가기: 한 단계씩 돌아가고, 오늘의 학습 첫 화면에서만 앱을 닫아요.
function handleAndroidBack(){
  if(state.mode==='today'){if(todayStudyOpen){todayStudyOpen=false;renderToday();window.scrollTo(0,0);return 'handled';}return 'exit';}
  if(state.mode==='quiz'&&state.quiz&&!$('quiz-session').hidden&&!state.quiz.daily){
    if(confirm('연습을 그만둘까요? 지금까지 푼 문제는 기록에 남아요.')){stopAudio();resetQuiz();}
    return 'handled';
  }
  if(state.mode==='beat'&&state.beatQuiz){stopAudio();state.beatQuiz=null;renderBeatStart();return 'handled';}
  if(state.mode==='learn'&&state.strokeOpen){toggleStrokes(false);return 'handled';}
  returnToToday();return 'handled';
}
// 구형 Android WebView는 grid의 gap만 지원하고 flex의 gap은 지원하지 않아요.
{const test=document.createElement('div');test.style.cssText='position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px;';
 for(let i=0;i<2;i++){const child=document.createElement('div');child.style.height='1px';test.append(child);}document.body.append(test);
 if(test.scrollHeight!==3)document.documentElement.classList.add('no-flex-gap');test.remove();}
setMode('today');renderBackupReminder();
