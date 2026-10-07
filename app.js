'use strict';
const $ = id => document.getElementById(id);
const state = {mode:'learn',script:'hira',range:'basic',selected:0,quizType:'reading',quiz:null,beatQuiz:null};
let japaneseVoices = [], voiceTimer, activeAudio = null;
const synthesis = window.speechSynthesis;
const hasRecordedAudio = typeof AUDIO_FILES !== 'undefined';
// 학습 기록과 설정은 이 브라우저에만 저장합니다. 저장소를 쓸 수 없으면 기록 없이 동작해요.
const STORE_KEY = 'kana-step-v1';
const store = (() => {let data;try{data=JSON.parse(localStorage.getItem(STORE_KEY));}catch{}data=data&&typeof data==='object'?data:{};data.stats=data.stats||{};data.settings=data.settings||{};data.beat=data.beat||{correct:0,total:0};return data;})();
function saveStore(){try{localStorage.setItem(STORE_KEY,JSON.stringify(store));}catch{}}
function saveSetting(key,value){store.settings[key]=value;saveStore();}
const statFor = item => store.stats[state.script+':'+item.id]||{correct:0,wrong:0,streak:0};
function recordAnswer(item,correct){
  const s={...statFor(item)};if(correct){s.correct++;s.streak++;}else{s.wrong++;s.streak=0;}s.last=Date.now();
  store.stats[state.script+':'+item.id]=s;saveStore();
}
function levelOf(item){const s=statFor(item);if(!s.correct&&!s.wrong)return 'new';if(s.streak>=3)return 'mastered';if(s.wrong&&s.streak===0)return 'weak';return 'learning';}
const LEVEL_WEIGHT = {new:2,weak:4,learning:1.5,mastered:0.4};
function audioPlaying(){return Boolean(activeAudio)||Boolean(synthesis?.speaking);}
function stopAudio(){if(activeAudio){activeAudio.pause();activeAudio=null;}synthesis?.cancel();if(hasRecordedAudio||japaneseVoices.length)audioMessage('▶ 버튼으로 일본어 발음을 들어 보세요.');}
const currentChar = item => item[state.script];
const otherChar = item => item[state.script==='hira'?'kata':'hira'];
const currentExample = item => item[state.script+'Example'];
const pool = () => KANA_DATA.filter(item => state.range === 'all' || item.group === state.range);
const escapeHtml = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shuffle = items => {const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
// 가중치가 클수록 앞쪽에 올 확률이 높은 무작위 정렬 (Efraimidis–Spirakis).
const weightedShuffle = (items,weight) => items.map(item=>({item,key:Math.random()**(1/weight(item))})).sort((a,b)=>b.key-a.key).map(x=>x.item);
function audioMessage(message,warning=false){$('audio-status').textContent=message;$('audio-status').classList.toggle('warning',warning);}
function refreshVoices(){
  const old=store.settings.voice||$('voice').value;
  japaneseVoices=synthesis?synthesis.getVoices().filter(v=>/^ja(?:[-_]|$)/i.test(v.lang)):[];
  $('voice').replaceChildren();
  if(hasRecordedAudio){const option=document.createElement('option');option.value='recorded';option.textContent='기본 일본어 음성 · 내장';$('voice').append(option);}
  // 재생 중에는 안내 문구를 덮어쓰지 않아요.
  const message=(text,warning)=>{if(!audioPlaying())audioMessage(text,warning);};
  if(japaneseVoices.length){
    japaneseVoices.forEach(v=>{const option=document.createElement('option');option.value=v.voiceURI;option.textContent=v.name;$('voice').append(option);});
    if(japaneseVoices.some(v=>v.voiceURI===old))$('voice').value=old;
    message('▶ 버튼으로 일본어 발음을 들어 보세요.');
  }else if(!hasRecordedAudio){
    const option=document.createElement('option');option.value='';option.textContent='일본어 음성을 찾지 못했어요';$('voice').append(option);
    message('일본어 음성이 필요해요. Edge 또는 Chrome에서 열고, 음성이 없으면 Windows 설정 → 시간 및 언어 → 언어 및 지역에서 일본어 음성 기능을 추가하세요.',true);
  }
  if(hasRecordedAudio){if(old==='recorded'||!old||!japaneseVoices.some(v=>v.voiceURI===old))$('voice').value='recorded';message('일본어 음성이 준비되어 있어요. ▶ 버튼을 눌러 들어 보세요.');}
  updateStartButton();
}
function speak(text){
  if(hasRecordedAudio&&($('voice').value==='recorded'||!japaneseVoices.length)&&AUDIO_FILES[text]){
    stopAudio();const player=new Audio(AUDIO_FILES[text]);activeAudio=player;player.playbackRate=Number($('speed').value);player.preservesPitch=true;
    player.onplaying=()=>audioMessage('재생 중… 소리를 듣고 따라 해 보세요.');
    player.onended=()=>{if(activeAudio===player){activeAudio=null;audioMessage('▶ 버튼으로 다시 들을 수 있어요.');}};
    player.play().catch(()=>{if(activeAudio===player)audioMessage('음성 파일을 재생하지 못했어요. audio 폴더를 index.html과 같은 위치에 두고 다시 열어 주세요.',true);});
    return true;
  }
  if(!synthesis||!japaneseVoices.length){refreshVoices();return false;}
  stopAudio();
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.lang='ja-JP';utterance.rate=Number($('speed').value);
  utterance.voice=japaneseVoices.find(v=>v.voiceURI===$('voice').value)||japaneseVoices[0];
  utterance.onstart=()=>audioMessage('재생 중… 소리를 듣고 따라 해 보세요.');
  utterance.onend=()=>audioMessage('▶ 버튼으로 다시 들을 수 있어요.');
  utterance.onerror=event=>{if(!['interrupted','canceled'].includes(event.error))audioMessage('음성을 재생하지 못했어요. 다른 일본어 음성을 선택하거나 브라우저의 소리 설정을 확인해 주세요.',true);};
  synthesis.speak(utterance);return true;
}
function speakKana(item){return speak(item.kata);}
function similarGroupsFor(item){return SIMILAR_GROUPS[state.script].filter(([chars])=>chars.includes(currentChar(item)));}
function similarItems(item){
  const chars=new Set(similarGroupsFor(item).flatMap(([chars])=>chars));chars.delete(currentChar(item));
  return KANA_DATA.filter(i=>chars.has(currentChar(i)));
}
function noteFor(item){
  let note='';
  if(item.hira==='を')note='を는 보통 ‘오’로 읽으며 목적어를 나타내는 조사로 써요. 로마자 wo로 적기도 해요.';
  if(item.hira==='は')note='は는 ‘하’. 주제를 나타내는 조사로 쓰일 때는 ‘와’로 읽어요.';
  if(item.hira==='へ')note='へ는 ‘헤’. 방향을 나타내는 조사로 쓰일 때는 ‘에’로 읽어요.';
  if(item.hira==='ふ')note='ふ / フ는 한국어 ‘후’와 완전히 같지 않아요. 입술 사이로 가볍게 바람을 내보내요.';
  if(item.hira==='ん')note='ん / ン은 뒤에 오는 소리에 따라 ㄴ·ㅁ·ㅇ과 비슷해져요. 독립된 한 박자로 읽어요.';
  if(item.hira==='ぢ')note='ぢ / ヂ는 현대 표준어에서 じ / ジ와 보통 같은 ‘지’ 소리예요. 단어의 철자를 기억하세요.';
  if(item.hira==='づ')note='づ / ヅ는 현대 표준어에서 ず / ズ와 보통 같은 ‘즈’ 소리예요. 단어의 철자를 기억하세요.';
  if(['ざ','じゃ'].includes(item.hira))note='ざ(za)와 じゃ(ja)는 둘 다 ‘자’에 가깝게 들려요. じゃ는 혀를 입천장에 더 붙여 ‘쟈’처럼 내요.';
  if(['ぞ','じょ'].includes(item.hira))note='ぞ(zo)와 じょ(jo)는 둘 다 ‘조’에 가깝게 들려요. じょ는 ‘죠’처럼 혀를 입천장에 붙여요.';
  if(item.hira==='じゅ')note='じゅ(ju)는 ‘쥬’처럼 혀를 입천장에 붙여요. ず(zu, 즈)와 구별해요.';
  if(item.group==='combo')note+=(note?' ':'')+'작은 ゃ·ゅ·ょ / ャ·ュ·ョ를 앞 글자와 붙여 한 박자로 읽어요.';
  if(!currentExample(item).word.includes(currentChar(item)))note+=(note?' ':'')+(state.script==='kata'?'이 글자의 일상적인 가타카나 단어는 드물어, 대응하는 히라가나 예시로 익혀요.':'이 글자로 쓰는 일상적인 히라가나 단어는 드물어, 대응하는 가타카나 예시로 익혀요.');
  return note;
}
function highlightedWord(item){
  const example=currentExample(item),target=example.word.includes(currentChar(item))?currentChar(item):otherChar(item);
  const index=example.word.indexOf(target);
  if(index<0)return escapeHtml(example.word);
  return escapeHtml(example.word.slice(0,index))+'<mark>'+escapeHtml(target)+'</mark>'+escapeHtml(example.word.slice(index+target.length));
}
function recordText(item){
  const s=statFor(item),total=s.correct+s.wrong;
  if(!total)return '아직 풀어 본 기록이 없어요.';
  return '풀이 기록: '+total+'번 중 '+s.correct+'번 정답'+({mastered:' · 익힌 글자예요',weak:' · 최근에 틀렸어요. 한 번 더 들어 보세요',learning:''}[levelOf(item)]||'');
}
function selectCharacter(id){
  if(!pool().some(i=>i.id===id)){state.range='all';$('range').value='all';saveSetting('range','all');resetQuiz();}
  state.selected=id;stopAudio();renderStudy();
}
function renderStudy(){
  const items=pool();if(!items.some(i=>i.id===state.selected))state.selected=items[0].id;
  const item=KANA_DATA[state.selected],position=items.findIndex(i=>i.id===item.id);
  $('alphabet-title').textContent=(state.script==='hira'?'히라가나':'가타카나')+' '+({basic:'기본표',voiced:'탁음 · 반탁음',combo:'요음',all:'전체표'}[state.range]);
  $('letter-count').textContent=items.length+(state.range==='combo'||state.range==='all'?'개':'자');
  const grid=$('kana-grid');grid.replaceChildren();grid.style.gridTemplateColumns=state.range==='combo'?'repeat(3,1fr)':'repeat(5,1fr)';
  let lastGroup='';
  items.forEach(i=>{
    if(state.range==='all'&&i.group!==lastGroup){const title=document.createElement('div');title.className='row-label';title.textContent={basic:'기본 46자',voiced:'탁음 · 반탁음 25자',combo:'요음 33개'}[i.group];grid.append(title);lastGroup=i.group;}
    // 오십음도에서 や・ゆ・よ / わ・を・ん은 실제 자리로 배치합니다.
    const addGap=()=>{const gap=document.createElement('div');gap.className='grid-gap';gap.setAttribute('aria-hidden','true');grid.append(gap);};
    if(i.group==='basic'&&['ゆ','よ'].includes(i.hira))addGap();
    if(i.hira==='を')for(let n=0;n<3;n++)addGap();
    const level=levelOf(i),levelLabel={mastered:', 익힌 글자',weak:', 다시 볼 글자'}[level]||'';
    const button=document.createElement('button');button.className='kana-cell'+(i.id===item.id?' active':'')+(level==='mastered'||level==='weak'?' lv-'+level:'');button.setAttribute('aria-label',currentChar(i)+' '+i.romaji+levelLabel);button.setAttribute('aria-pressed',String(i.id===item.id));
    button.innerHTML='<span lang="ja">'+currentChar(i)+'</span><small>'+i.romaji+'</small>';
    button.onclick=()=>{state.selected=i.id;stopAudio();renderStudy();};grid.append(button);
    if(state.range==='all'&&i.group==='combo'&&(i.id-71)%3===2){addGap();addGap();}
  });
  $('card-position').textContent=(position+1)+' / '+items.length;
  $('study-char').textContent=currentChar(item);$('study-reading').innerHTML=escapeHtml(item.romaji)+'<span>'+escapeHtml(item.ko)+'</span>';
  $('char-note').textContent=noteFor(item);$('example-word').innerHTML=highlightedWord(item);
  const similar=$('similar-chars');similar.replaceChildren();
  const similarList=similarItems(item);
  if(similarList.length){
    const label=document.createElement('span');label.className='setting-label';label.textContent='닮은 글자와 구별하기';similar.append(label);
    const row=document.createElement('div');row.className='similar-row';
    similarList.forEach(i=>{const b=document.createElement('button');b.className='similar-chip';b.innerHTML='<span lang="ja">'+currentChar(i)+'</span>'+escapeHtml(i.romaji);b.setAttribute('aria-label','닮은 글자 '+currentChar(i)+' '+i.romaji+' 보기');b.onclick=()=>selectCharacter(i.id);row.append(b);});
    similar.append(row);
    const tip=document.createElement('p');tip.textContent=similarGroupsFor(item).map(([,text])=>text).join(' ');similar.append(tip);
  }
  $('study-record').textContent=recordText(item);
  const example=currentExample(item);$('example-reading').textContent=example.reading;$('example-meaning').textContent=example.meaning;
  $('prev-char').disabled=position===0;$('next-char').disabled=position===items.length-1;
  $('study-tip-text').textContent=state.script==='hira'?'히라가나는 일본어의 기본 문자예요. 예시 단어는 읽기 연습을 위해 가나로 적었으며, 실제로는 한자를 쓰는 단어도 있어요. 빵·펜 같은 외래어는 보통 가타카나로 적어요.':'가타카나는 외래어·외국 이름·의성어 등에 써요. ー는 앞 모음을 한 박자 더 늘이는 장음 기호예요. 일부 드문 글자는 대응하는 히라가나 예시를 함께 보여 줘요.';
}
function moveCharacter(step){const items=pool(),index=items.findIndex(i=>i.id===state.selected),next=index+step;if(next>=0&&next<items.length){state.selected=items[next].id;stopAudio();renderStudy();}}
function setMode(mode){
  stopAudio();state.mode=mode;
  ['learn','quiz','beat'].forEach(name=>{$(name+'-tab').classList.toggle('active',name===mode);$(name+'-tab').setAttribute('aria-pressed',String(name===mode));$(name+'-panel').hidden=name!==mode;});
  // 박자 단원은 문자·범위 설정과 상관없어요.
  $('script-setting').hidden=$('range-setting').hidden=mode==='beat';
  if(mode==='learn')renderStudy();
  if(mode==='quiz')updateStartButton();
  if(mode==='beat')renderBeat();
}
function eligiblePool(type=state.quizType){
  if(type==='word')return pool().filter(item=>currentExample(item).word.includes(currentChar(item)));
  if(type==='similar')return pool().filter(item=>similarGroupsFor(item).length);
  return pool();
}
function updateStartButton(){
  const needsAudio=['reading','listening'].includes(state.quizType),available=eligiblePool().length;
  $('start-quiz').disabled=(needsAudio&&!japaneseVoices.length&&!hasRecordedAudio)||!available;
  const omitted=pool().length-available;
  let note='';
  if(state.quizType==='word'&&omitted)note=`현재 범위에서 다른 문자 표기로 예시를 제공하는 ${omitted}개는 빈칸 문제에서 제외해요.`;
  if(state.quizType==='similar')note=available?`현재 범위에서 닮은 글자가 있는 ${available}개로 문제를 내요.`:'요음 범위에는 닮은 글자 문제가 없어요. 기본표나 전체를 골라 주세요.';
  $('quiz-scope-note').textContent=note;
  renderProgressSummary();
}
function renderProgressSummary(){
  const items=pool(),stats=items.map(i=>statFor(i)),answered=stats.reduce((n,s)=>n+s.correct+s.wrong,0),correct=stats.reduce((n,s)=>n+s.correct,0);
  const weak=items.filter(i=>levelOf(i)==='weak'),mastered=items.filter(i=>levelOf(i)==='mastered').length;
  $('progress-summary').innerHTML=answered?'이 범위 기록: '+answered+'문제 · 정답률 '+Math.round(correct/answered*100)+'% · 익힌 글자 '+mastered+' / '+items.length+(weak.length?'<br>다시 볼 글자: <span lang="ja">'+weak.slice(0,12).map(i=>escapeHtml(currentChar(i))).join(' ')+(weak.length>12?' …':'')+'</span>':''):'아직 이 범위의 풀이 기록이 없어요. 기록은 이 브라우저에만 저장돼요.';
  $('reset-progress').hidden=!Object.keys(store.stats).length&&!store.beat.total;
}
function resetQuiz(){state.quiz=null;$('quiz-setup').hidden=false;$('quiz-session').hidden=true;$('quiz-results').hidden=true;updateStartButton();}
function startQuiz(items){
  if(['reading','listening'].includes(state.quizType)&&!japaneseVoices.length&&!hasRecordedAudio){refreshVoices();return;}
  const available=items||eligiblePool(),count=Number($('question-count').value)||available.length;
  const ordered=!items&&$('weak-first').checked?weightedShuffle(available,i=>LEVEL_WEIGHT[levelOf(i)]):shuffle(available);
  state.quiz={items:shuffle(ordered.slice(0,Math.min(count,available.length))),index:0,correct:0,mistakes:[],answered:false,options:[]};
  $('quiz-setup').hidden=true;$('quiz-results').hidden=true;$('quiz-session').hidden=false;renderQuestion();
}
// 같은 종류(1글자 / 요음)의 보기를 먼저 고르고, 발음이 같은 글자는 함께 내지 않아요.
function distractors(item,preferred=[]){
  const isCombo=i=>i.group==='combo';
  const rest=shuffle(pool().filter(i=>i.id!==item.id)).sort((a,b)=>(isCombo(a)!==isCombo(item))-(isCombo(b)!==isCombo(item)));
  const unique=[],seen=new Set([item.romaji]);
  for(const candidate of [...shuffle(preferred),...rest]){if(!seen.has(candidate.romaji)){seen.add(candidate.romaji);unique.push(candidate);}if(unique.length===3)break;}
  return shuffle([item,...unique]);
}
function renderQuestion(){
  stopAudio();const q=state.quiz,item=q.items[q.index],example=currentExample(item);q.answered=false;q.options=distractors(item,state.quizType==='similar'?similarItems(item):[]);
  $('question-label').textContent=({reading:'읽는 법 고르기',listening:'듣고 문자 고르기',word:'단어 빈칸 채우기',similar:'닮은 글자 구별'}[state.quizType])+' · '+(q.index+1)+' / '+q.items.length;
  $('quiz-progress').style.width=(q.index/q.items.length*100)+'%';$('score-label').textContent='현재 '+q.correct+'문제 정답';
  $('feedback').replaceChildren();$('next-question').hidden=true;
  const display=$('question-display');display.replaceChildren();display.className='';
  if(state.quizType==='reading'){
    $('question-prompt').textContent='이 글자는 어떤 소리로 읽을까요?';display.textContent=currentChar(item);
    $('question-hint').textContent='각 보기의 ▶ 버튼을 듣고, 맞는 발음을 선택하세요.';
  }else if(state.quizType==='listening'){
    $('question-prompt').textContent='발음을 듣고 맞는 글자를 골라요.';const button=document.createElement('button');button.className='primary question-speaker';button.textContent='♫ 문제 발음 듣기';button.onclick=()=>speakKana(item);display.append(button);
    $('question-hint').textContent='필요한 만큼 다시 들을 수 있어요.';
  }else if(state.quizType==='similar'){
    $('question-prompt').textContent='이 소리의 글자를 골라요.';display.className='romaji-question';display.innerHTML=escapeHtml(item.romaji)+'<small>'+escapeHtml(item.ko)+'</small>';
    $('question-hint').textContent='모양이 닮은 글자가 섞여 있어요. 획의 방향과 끝 모양을 살펴보세요. ';
    const button=document.createElement('button');button.className='text-button';button.textContent='▶ 발음 듣기';button.onclick=()=>speakKana(item);$('question-hint').append(button);
  }else{
    $('question-prompt').textContent='빈칸에 들어갈 가나를 골라요.';display.className='word-question';
    const start=example.word.indexOf(currentChar(item));display.textContent=example.word.slice(0,start)+'□'+example.word.slice(start+currentChar(item).length);
    $('question-hint').textContent=example.meaning;
    const button=document.createElement('button');button.className='text-button';button.textContent='▶ 단어 듣기';button.onclick=()=>speak(example.word);$('question-hint').append(' · ',button);
  }
  const options=$('answer-options');options.replaceChildren();
  const lockAudio=['listening','similar'].includes(state.quizType);
  q.options.forEach((option,index)=>{
    const wrapper=document.createElement('div');wrapper.className='answer-option';wrapper.dataset.id=option.id;
    const answer=document.createElement('button');answer.className='answer-main';answer.innerHTML='<span class="option-number">'+(index+1)+'</span><span class="option-label">'+(state.quizType==='reading'?'발음 '+(index+1):currentChar(option))+'</span>';answer.onclick=()=>answerQuestion(option.id);
    const play=document.createElement('button');play.className='option-audio';play.textContent='▶';play.setAttribute('aria-label','보기 '+(index+1)+' 발음 듣기');play.onclick=()=>speakKana(option);
    play.disabled=lockAudio;play.title=lockAudio?'정답 확인 후 발음을 들을 수 있어요.':'발음 듣기';wrapper.append(answer,play);options.append(wrapper);
  });
  $('question-prompt').setAttribute('tabindex','-1');$('question-prompt').focus({preventScroll:true});
}
function answerQuestion(id){
  const q=state.quiz;if(!q||q.answered)return;q.answered=true;
  const item=q.items[q.index],example=currentExample(item),correct=id===item.id;
  if(correct)q.correct++;else q.mistakes.push({item,chosen:KANA_DATA[id]});
  recordAnswer(item,correct);
  document.querySelectorAll('.answer-option').forEach(wrapper=>{
    const option=KANA_DATA[Number(wrapper.dataset.id)];wrapper.querySelector('.answer-main').disabled=true;wrapper.classList.add('answer-locked');wrapper.querySelector('.option-audio').disabled=false;
    if(option.id===item.id)wrapper.classList.add('correct');else if(option.id===id)wrapper.classList.add('wrong');
    if(state.quizType==='reading')wrapper.querySelector('.option-label').textContent=option.romaji+' · '+option.ko;
    if(state.quizType==='similar')wrapper.querySelector('.option-label').innerHTML=escapeHtml(currentChar(option))+'<small class="reading-note"> '+escapeHtml(option.romaji)+'</small>';
  });
  const similarTip=state.quizType==='similar'?similarGroupsFor(item).map(([,text])=>text).join(' '):'';
  $('feedback').innerHTML='<strong class="'+(correct?'success':'failure')+'">'+(correct?'정답이에요!':'조금 아쉬워요. 함께 다시 익혀요.')+'</strong><span lang="ja">'+escapeHtml(currentChar(item))+'</span> = '+escapeHtml(item.romaji)+' · '+escapeHtml(item.ko)+'<br><span lang="ja">'+highlightedWord(item)+'</span> ('+escapeHtml(example.reading)+') · '+escapeHtml(example.meaning)+(similarTip?'<br>구별 요령: '+escapeHtml(similarTip):noteFor(item)?'<br>'+escapeHtml(noteFor(item)):'');
  const play=document.createElement('button');play.className='text-button';play.textContent='▶ 정답 듣기';play.onclick=()=>speakKana(item);$('feedback').append(play);
  $('score-label').textContent='현재 '+q.correct+'문제 정답';$('quiz-progress').style.width=((q.index+1)/q.items.length*100)+'%';
  $('next-question').hidden=false;$('next-question').textContent=q.index===q.items.length-1?'결과 보기 →':'다음 문제 →';
}
function showResults(){
  stopAudio();const q=state.quiz;$('quiz-session').hidden=true;$('quiz-results').hidden=false;
  const results=$('quiz-results');results.innerHTML='<span class="eyebrow">오늘의 연습 완료</span><h2>'+(q.correct===q.items.length?'모두 맞혔어요!':'한 걸음 더 익숙해졌어요.')+'</h2><div class="result-score">'+q.correct+'<small> / '+q.items.length+'</small></div><p class="result-caption">정답률 '+Math.round(q.correct/q.items.length*100)+'%'+(q.mistakes.length?' · 헷갈렸던 '+q.mistakes.length+'개를 다시 들어 보세요.':' · 다른 문자나 문제 유형에도 도전해 보세요.')+'</p>';
  if(q.mistakes.length){
    const list=document.createElement('div');list.className='review-list';list.innerHTML='<h3>다시 익힐 글자</h3>';
    q.mistakes.forEach(({item,chosen})=>{const example=currentExample(item),row=document.createElement('div');row.className='review-item';row.innerHTML='<span lang="ja">'+escapeHtml(currentChar(item))+'</span><div>'+escapeHtml(item.romaji)+' · '+escapeHtml(item.ko)+'<small>내 선택: '+escapeHtml(currentChar(chosen))+' ('+escapeHtml(chosen.romaji)+')<br>'+escapeHtml(example.word)+' · '+escapeHtml(example.meaning)+'</small></div>';const play=document.createElement('button');play.className='outline';play.textContent='▶ 듣기';play.onclick=()=>speakKana(item);row.append(play);list.append(row);});results.append(list);
  }
  const actions=document.createElement('div');actions.className='result-actions';
  if(q.mistakes.length){const retry=document.createElement('button');retry.className='primary';retry.textContent='틀린 글자만 다시 풀기';retry.onclick=()=>startQuiz(q.mistakes.map(m=>m.item));actions.append(retry);}
  const again=document.createElement('button');again.className=q.mistakes.length?'outline':'primary';again.textContent='새 연습 고르기';again.onclick=resetQuiz;actions.append(again);
  const learn=document.createElement('button');learn.className='outline';learn.textContent='학습 모드로';learn.onclick=()=>{if(q.mistakes.length)state.selected=q.mistakes[0].item.id;resetQuiz();setMode('learn');};actions.append(learn);results.append(actions);
}
// ---- 박자 익히기 ----
const SMALL_KANA = 'ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ';
function moraOf(word){const out=[];for(const c of word){if(SMALL_KANA.includes(c)&&out.length)out[out.length-1]+=c;else out.push(c);}return out;}
function moraBoxes(entry){
  const boxes=moraOf(entry.word).map((m,i)=>'<span class="mora'+(entry.marks.includes(i)?' mark':'')+'">'+escapeHtml(m)+'</span>').join('');
  return '<span class="mora-row" lang="ja">'+boxes+'</span><span class="mora-count">'+moraOf(entry.word).length+'박</span>';
}
function beatWord(entry){
  const row=document.createElement('div');row.className='beat-word';
  const play=document.createElement('button');play.className='option-audio beat-play';play.textContent='▶';play.setAttribute('aria-label',entry.word+' 듣기');play.onclick=()=>speak(entry.word);
  const body=document.createElement('div');body.innerHTML=moraBoxes(entry)+'<small>'+escapeHtml(entry.reading)+' · '+escapeHtml(entry.meaning)+'</small>';
  row.append(play,body);return row;
}
function renderBeat(){
  const lessons=$('beat-lessons');
  if(!lessons.childElementCount)BEAT_LESSONS.forEach(lesson=>{
    const card=document.createElement('section');card.className='panel beat-card';
    card.innerHTML='<span class="eyebrow">'+escapeHtml(lesson.sub)+'</span><h3>'+escapeHtml(lesson.title)+'</h3><p class="muted">'+escapeHtml(lesson.text)+'</p>';
    if(lesson.rules){
      const rules=document.createElement('div');rules.className='beat-rules';
      lesson.rules.forEach(([rule,word,reading,meaning])=>{const b=document.createElement('button');b.className='beat-rule';b.innerHTML='<span>'+escapeHtml(rule)+'</span><strong lang="ja">'+escapeHtml(word)+'</strong><small>'+escapeHtml(reading)+' · '+escapeHtml(meaning)+'</small>';b.setAttribute('aria-label',rule+' 예시 '+word+' 듣기');b.onclick=()=>speak(word);rules.append(b);});
      card.append(rules);
    }
    lesson.pairs.forEach(pair=>{
      const entries=pair.map(([word,reading,meaning,marks])=>({word,reading,meaning,marks:marks||[]}));
      const row=document.createElement('div');row.className='beat-pair';row.append(beatWord(entries[0]));
      const vs=document.createElement('span');vs.className='beat-vs';vs.textContent='vs';row.append(vs,beatWord(entries[1]));card.append(row);
    });
    lessons.append(card);
  });
  if(!state.beatQuiz)renderBeatStart();
}
function renderBeatStart(){
  const box=$('beat-quiz'),b=store.beat;
  box.innerHTML='<span class="eyebrow">듣고 구별하기</span><h2>어느 쪽 단어일까요?</h2><p class="muted">짝지은 두 단어 중 하나가 들려요. 박자 수를 세면서 맞는 쪽을 고르세요. 숫자 키 1·2로도 고를 수 있어요.</p>'+(b.total?'<p class="muted">지금까지 '+b.total+'문제 중 '+b.correct+'문제 정답 ('+Math.round(b.correct/b.total*100)+'%)</p>':'');
  const start=document.createElement('button');start.className='primary';start.textContent='10문제 시작 →';start.disabled=!hasRecordedAudio&&!japaneseVoices.length;start.onclick=startBeatQuiz;box.append(start);
}
function startBeatQuiz(){
  const questions=shuffle(BEAT_PAIRS).slice(0,10).map(pair=>({pair,answer:Math.random()<.5?0:1}));
  state.beatQuiz={questions,index:0,correct:0,answered:false};renderBeatQuestion();
}
function renderBeatQuestion(){
  const q=state.beatQuiz,{pair,answer}=q.questions[q.index];q.answered=false;
  const box=$('beat-quiz');
  box.innerHTML='<div class="quiz-top"><span class="eyebrow">듣고 구별하기 · '+(q.index+1)+' / '+q.questions.length+'</span><span class="muted">'+q.correct+'문제 정답</span></div><div class="progress-track"><div style="width:'+(q.index/q.questions.length*100)+'%"></div></div>';
  const listen=document.createElement('button');listen.className='primary question-speaker';listen.textContent='♫ 단어 듣기';listen.onclick=()=>speak(pair[answer].word);
  const center=document.createElement('div');center.className='beat-listen';center.append(listen);box.append(center);
  const options=document.createElement('div');options.className='answer-options';
  pair.forEach((entry,index)=>{const b=document.createElement('button');b.className='answer-option beat-option';b.dataset.index=index;b.innerHTML='<span class="option-number">'+(index+1)+'</span><span lang="ja" class="beat-option-word">'+escapeHtml(entry.word)+'</span><small>'+escapeHtml(entry.meaning)+'</small>';b.onclick=()=>answerBeat(index);options.append(b);});
  box.append(options);
  const feedback=document.createElement('div');feedback.className='feedback';feedback.id='beat-feedback';feedback.setAttribute('role','status');box.append(feedback);
  speak(pair[answer].word);listen.focus({preventScroll:true});
}
function answerBeat(index){
  const q=state.beatQuiz;if(!q||q.answered)return;q.answered=true;
  const {pair,answer}=q.questions[q.index],correct=index===answer;
  if(correct)q.correct++;store.beat.total++;if(correct)store.beat.correct++;saveStore();
  document.querySelectorAll('.beat-option').forEach(b=>{b.disabled=true;const i=Number(b.dataset.index);if(i===answer)b.classList.add('correct');else if(i===index)b.classList.add('wrong');});
  const feedback=$('beat-feedback');
  feedback.innerHTML='<strong class="'+(correct?'success':'failure')+'">'+(correct?'정답이에요!':'아쉬워요. 두 단어를 번갈아 들어 보세요.')+'</strong>';
  pair.forEach(entry=>feedback.append(beatWord(entry)));
  const next=document.createElement('button');next.className='primary';next.id='beat-next';next.textContent=q.index===q.questions.length-1?'결과 보기 →':'다음 문제 →';next.onclick=nextBeat;
  const row=document.createElement('div');row.className='next-row';row.append(document.createElement('span'),next);$('beat-quiz').append(row);next.focus({preventScroll:true});
}
function nextBeat(){
  const q=state.beatQuiz;if(!q?.answered)return;
  if(q.index+1<q.questions.length){q.index++;renderBeatQuestion();return;}
  stopAudio();state.beatQuiz=null;renderBeatStart();
  $('beat-quiz').insertAdjacentHTML('afterbegin','<div class="beat-result"><div class="result-score">'+q.correct+'<small> / '+q.questions.length+'</small></div><p class="result-caption">'+(q.correct===q.questions.length?'박자를 정확히 구별했어요!':'틀린 짝은 위의 카드에서 번갈아 들어 보세요.')+'</p></div>');
}
// ---- 이벤트 연결 ----
$('learn-tab').onclick=()=>setMode('learn');$('quiz-tab').onclick=()=>setMode('quiz');$('beat-tab').onclick=()=>setMode('beat');
function setScript(script){state.script=script;document.querySelectorAll('[data-script]').forEach(b=>{b.classList.toggle('active',b.dataset.script===script);b.setAttribute('aria-pressed',String(b.dataset.script===script));});}
function setQuizType(type){state.quizType=type;document.querySelectorAll('[data-type]').forEach(b=>{b.classList.toggle('active',b.dataset.type===type);b.setAttribute('aria-pressed',String(b.dataset.type===type));});}
document.querySelectorAll('[data-script]').forEach(button=>button.onclick=()=>{stopAudio();setScript(button.dataset.script);saveSetting('script',state.script);renderStudy();resetQuiz();});
$('range').onchange=()=>{stopAudio();state.range=$('range').value;saveSetting('range',state.range);renderStudy();resetQuiz();};
$('speed').onchange=()=>saveSetting('speed',$('speed').value);
$('voice').onchange=()=>saveSetting('voice',$('voice').value);
$('question-count').onchange=()=>saveSetting('count',$('question-count').value);
$('weak-first').onchange=()=>saveSetting('weakFirst',$('weak-first').checked);
$('reset-progress').onclick=()=>{if(!confirm('글자별 풀이 기록과 박자 연습 기록을 모두 지울까요? 설정은 그대로 남아요.'))return;store.stats={};store.beat={correct:0,total:0};saveStore();updateStartButton();renderStudy();};
$('prev-char').onclick=()=>moveCharacter(-1);$('next-char').onclick=()=>moveCharacter(1);
$('play-char').onclick=()=>speakKana(KANA_DATA[state.selected]);$('play-word').onclick=()=>speak(currentExample(KANA_DATA[state.selected]).word);
document.querySelectorAll('[data-type]').forEach(button=>button.onclick=()=>{setQuizType(button.dataset.type);saveSetting('quizType',state.quizType);updateStartButton();});
$('start-quiz').onclick=()=>startQuiz();$('quit-quiz').onclick=()=>{stopAudio();resetQuiz();};
$('next-question').onclick=()=>{const q=state.quiz;if(!q?.answered)return;if(q.index+1<q.items.length){q.index++;renderQuestion();}else showResults();};
document.addEventListener('keydown',event=>{
  // 입력 칸에서는 무시하고, 버튼에 포커스가 있어도 숫자·화살표 단축키는 동작해요 (Enter는 버튼 고유 동작 유지).
  if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)||event.ctrlKey||event.metaKey||event.altKey)return;
  const onButton=event.target.tagName==='BUTTON';
  if(state.mode==='learn'&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();moveCharacter(event.key==='ArrowRight'?1:-1);}
  if(state.mode==='quiz'&&state.quiz&&!$('quiz-session').hidden){if(['1','2','3','4'].includes(event.key)){const option=state.quiz.options[Number(event.key)-1];if(option)answerQuestion(option.id);}else if(event.key==='Enter'&&!onButton&&state.quiz.answered){event.preventDefault();$('next-question').click();}}
  if(state.mode==='beat'&&state.beatQuiz){if(['1','2'].includes(event.key))answerBeat(Number(event.key)-1);else if(event.key==='Enter'&&!onButton&&state.beatQuiz.answered){event.preventDefault();nextBeat();}}
});
if(synthesis)synthesis.addEventListener('voiceschanged',refreshVoices);
window.addEventListener('beforeunload',stopAudio);
(function restoreSettings(){
  const s=store.settings;
  if(['hira','kata'].includes(s.script))setScript(s.script);
  if(['basic','voiced','combo','all'].includes(s.range)){state.range=s.range;$('range').value=s.range;}
  if([...$('speed').options].some(o=>o.value===s.speed))$('speed').value=s.speed;
  if([...$('question-count').options].some(o=>o.value===s.count))$('question-count').value=s.count;
  if(typeof s.weakFirst==='boolean')$('weak-first').checked=s.weakFirst;
  if(['reading','listening','word','similar'].includes(s.quizType))setQuizType(s.quizType);
})();
renderStudy();refreshVoices();voiceTimer=setTimeout(refreshVoices,1500);
