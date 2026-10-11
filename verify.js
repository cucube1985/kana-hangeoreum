'use strict';
// 실행: node verify.js — 음성 누락, 범위, 같은 발음의 중복 보기, 보기 난이도, 닮은 글자·박자 단원·필순 데이터, 복습 간격·연속 학습일 확인.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
// 화면 요소는 id마다 같은 빈 객체로 흉내 내요 (보기 난이도 값을 바꿔 가며 검사해요).
const elements={};
const context=vm.createContext({window:{speechSynthesis:null},document:{getElementById:id=>elements[id]||(elements[id]={})},console,Math,Date});
vm.runInContext(fs.readFileSync('kana-data.js','utf8'),context);
vm.runInContext(fs.readFileSync('audio-map.js','utf8'),context);
vm.runInContext(fs.readFileSync('stroke-data.js','utf8'),context);
const source=fs.readFileSync('app.js','utf8');
vm.runInContext(source.slice(0,source.indexOf("$('learn-tab').onclick")),context);
const report=vm.runInContext(`(() => {
  const issues=[]; let questions=0;
  for(const script of ['hira','kata'])for(const range of ['basic','voiced','combo','extended','all']){
    if(script==='hira'&&range==='extended')continue;
    state.script=script;state.range=range;state.quizType='reading';
    for(const item of pool()){
      for(let attempt=0;attempt<10;attempt++){
        const options=distractors(item);questions++;
        if(options.length!==4||new Set(options.map(x=>x.romaji)).size!==4||options.filter(x=>x.id===item.id).length!==1)issues.push(item.hira);
      }
      if(!AUDIO_FILES[item.kata]||!AUDIO_FILES[currentExample(item).word])issues.push('Missing audio: '+item.kata);
    }
    state.quizType='word';
    if(eligiblePool().some(item=>!currentExample(item).word.includes(currentChar(item))))issues.push('Invalid blank');
    state.quizType='similar';
    for(const item of eligiblePool()){
      const options=distractors(item,{preferred:similarItems(item)}),chars=options.map(currentChar);questions++;
      if(options.length!==4||new Set(options.map(x=>x.romaji)).size!==4)issues.push('Similar options: '+currentChar(item));
      if(!similarItems(item).some(i=>chars.includes(currentChar(i))))issues.push('No similar distractor: '+currentChar(item));
    }
    state.quizType='match';
    for(const item of eligiblePool()){
      const options=distractors(item,{preferred:similarItems(item,otherScript())});questions++;
      if(options.length!==4||new Set(options.map(x=>x.romaji)).size!==4||new Set(options.map(optionChar)).size!==4)issues.push('Match options: '+currentChar(item));
    }
    // 1글자 문제에는 요음·확장음 보기가 섞이지 않아야 해요 (전체 범위).
    if(range==='all')for(const item of pool())if(distractors(item).some(o=>currentChar(o).length!==currentChar(item).length))issues.push('Mixed option length: '+currentChar(item));
  }
  // 보기 난이도: 모든 난이도에서 보기 4개·발음 중복 없음. 쉬움은 헷갈리는 글자를 빼고, 어려움은 닮은 글자를 넣어요.
  for(const script of ['hira','kata'])for(const range of ['basic','combo','all']){
    state.script=script;state.range=range;state.quizType='reading';
    for(const difficulty of ['easy','normal','hard']){
      document.getElementById('difficulty').value=difficulty;
      for(const item of pool()){
        const plan=distractorPlan(item),options=distractors(item,plan);questions++;
        if(options.length!==4||new Set(options.map(x=>x.romaji)).size!==4)issues.push('Difficulty '+difficulty+' options: '+currentChar(item));
        if(difficulty==='easy'&&range==='basic'&&options.some(o=>o.id!==item.id&&plan.avoid.has(o.id)))issues.push('Easy includes confuser: '+currentChar(item));
        const alike=new Set([...soundAlikes(item),...similarItems(item)].map(i=>i.id));
        if(difficulty==='hard'&&alike.size&&!options.some(o=>alike.has(o.id)))issues.push('Hard has no confuser: '+currentChar(item));
      }
    }
  }
  // 간격 반복: 맞힌 횟수에 따라 1·3·7일 뒤, 틀리면 바로 복습. 예전 기록(due 없음)도 계산돼요.
  {const now=new Date(2026,9,8,15).getTime(),today=startOfDay(now);
   if(nextDue({streak:0},now)!==now||nextDue({streak:1},now)!==addDays(today,1)||nextDue({streak:3},now)!==addDays(today,7)||nextDue({streak:9},now)!==addDays(today,30))issues.push('Review intervals');
   if(dueOf({correct:2,wrong:0,streak:2,last:now})!==addDays(today,3)||dueOf({correct:0,wrong:0,streak:0})!==Infinity)issues.push('Legacy due');}
  // 연속 학습일: 오늘·어제·그제가 이어지고 그 전날이 비면 3일, 오늘을 안 풀었으면 어제까지 세요.
  {const saved=store.days,t=startOfDay();store.days={[dayKey(t)]:3,[dayKey(addDays(t,-1))]:5,[dayKey(addDays(t,-2))]:1,[dayKey(addDays(t,-4))]:2};
   const a=streakDays();delete store.days[dayKey(t)];const b=streakDays();store.days=saved;
   if(a!==3||b!==2)issues.push('Streak days '+a+'/'+b);}
  for(const [script,groups] of Object.entries(SIMILAR_GROUPS))for(const [chars] of groups){
    const items=chars.map(c=>KANA_DATA.find(i=>i[script]===c));
    if(items.some(i=>!i)||new Set(items.map(i=>i.romaji)).size!==chars.length)issues.push('Bad similar group: '+chars.join(''));
  }
  // 입력 문제: 모든 글자가 로마자·한글 답을 받고, 다른 표기 목록의 키가 실제 로마자여야 해요.
  for(const item of KANA_DATA){const answers=acceptedAnswers(item);if(!answers.has(normalizeAnswer(item.romaji))||answers.size<2)issues.push('Input answers: '+item.kata);}
  for(const key of Object.keys(ROMAJI_ALT))if(!KANA_DATA.some(i=>i.romaji===key))issues.push('Unknown ROMAJI_ALT key: '+key);
  if(!acceptedAnswers(KANA_DATA.find(i=>i.hira==='し')).has('si')||!acceptedAnswers(KANA_DATA.find(i=>i.hira==='つ')).has('츠'))issues.push('Input alternative answers');
  // 모든 가나 글자에 필순 데이터가 있고, 획 수와 번호 수가 같아야 해요.
  for(const item of KANA_DATA)for(const c of [...(item.hira||''),...item.kata]){const d=STROKE_DATA[c];if(!d||!d.s.length||d.s.length!==d.n.length)issues.push('Stroke data: '+c);}
  for(const entry of BEAT_PAIRS.flat()){
    if(!AUDIO_FILES[entry.word])issues.push('Missing beat audio: '+entry.word);
    if(entry.marks.some(m=>m>=moraOf(entry.word).length))issues.push('Bad mora mark: '+entry.word);
  }
  for(const lesson of BEAT_LESSONS)for(const rule of lesson.rules||[])if(!AUDIO_FILES[rule[1]])issues.push('Missing rule audio: '+rule[1]);
  return {issues,questions,files:Object.values(AUDIO_FILES),counts:KANA_DATA.reduce((a,x)=>(a[x.group]=(a[x.group]||0)+1,a),{})};
})()`,context);
assert.equal(report.issues.length,0,report.issues.join(', '));
assert.equal(report.counts.basic,46);assert.equal(report.counts.voiced,25);assert.equal(report.counts.combo,33);assert.equal(report.counts.extended,16);
for(const file of report.files)assert.ok(fs.statSync(file).size>500,file);
// 서비스 워커가 미리 저장하는 앱 파일 목록(CORE)이 index.html이 쓰는 파일을 모두 담고, 실제로 있어야 해요.
const sw=fs.readFileSync('sw.js','utf8'),core=JSON.parse(sw.match(/const CORE = (\[[^\]]*\])/)[1].replace(/'/g,'"'));
const used=[...fs.readFileSync('index.html','utf8').matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]).filter(u=>!/^(https?:|data:|#|\.\/index\.html$)/.test(u));
for(const file of used)assert.ok(core.includes(file),'sw.js CORE에 빠진 파일: '+file);
for(const file of core)assert.ok(file==='./'||fs.existsSync(file),'sw.js CORE의 파일이 없음: '+file);
// 안드로이드 8 기본 WebView(Chrome 58)는 CSS min()·max()·clamp()·inset·aspect-ratio를 몰라 그 줄을 통째로 무시해요.
const css=fs.readFileSync('style.css','utf8');
for(const pattern of [/(?<![a-z])min\(/,/(?<![a-z])max\(/,/clamp\(/,/[;{]inset:/,/aspect-ratio/])assert.ok(!pattern.test(css),'Android 8 WebView가 모르는 CSS: '+pattern);
console.log(`PASS: ${report.questions} option sets; ${report.files.length} audio files; 46 + 25 + 33 entries per script + 16 katakana extended.`);
