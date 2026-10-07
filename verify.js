'use strict';
// 실행: node verify.js — 음성 누락, 범위, 같은 발음의 중복 보기, 닮은 글자·박자 단원 데이터 확인.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context=vm.createContext({window:{speechSynthesis:null},document:{getElementById:()=>({})},console,Math});
vm.runInContext(fs.readFileSync('kana-data.js','utf8'),context);
vm.runInContext(fs.readFileSync('audio-map.js','utf8'),context);
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
      const options=distractors(item,similarItems(item)),chars=options.map(currentChar);questions++;
      if(options.length!==4||new Set(options.map(x=>x.romaji)).size!==4)issues.push('Similar options: '+currentChar(item));
      if(!similarItems(item).some(i=>chars.includes(currentChar(i))))issues.push('No similar distractor: '+currentChar(item));
    }
    state.quizType='match';
    for(const item of eligiblePool()){
      const options=distractors(item,similarItems(item,otherScript()));questions++;
      if(options.length!==4||new Set(options.map(x=>x.romaji)).size!==4||new Set(options.map(optionChar)).size!==4)issues.push('Match options: '+currentChar(item));
    }
    // 1글자 문제에는 요음·확장음 보기가 섞이지 않아야 해요 (전체 범위).
    if(range==='all')for(const item of pool())if(distractors(item).some(o=>currentChar(o).length!==currentChar(item).length))issues.push('Mixed option length: '+currentChar(item));
  }
  for(const [script,groups] of Object.entries(SIMILAR_GROUPS))for(const [chars] of groups){
    const items=chars.map(c=>KANA_DATA.find(i=>i[script]===c));
    if(items.some(i=>!i)||new Set(items.map(i=>i.romaji)).size!==chars.length)issues.push('Bad similar group: '+chars.join(''));
  }
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
console.log(`PASS: ${report.questions} option sets; ${report.files.length} audio files; 46 + 25 + 33 entries per script + 16 katakana extended.`);
