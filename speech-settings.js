/* Persistent playback preferences shared by manual speech, prefetch and rounds. */
(function(){
 'use strict';
 const parse=key=>{try{const value=JSON.parse(localStorage.getItem(key));return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}};
 function rate(value,fallback=1){const n=Number(value);return Number.isFinite(n)&&n>=.5&&n<=2?n:fallback;}
 function voice(side,settings,fallback='M1'){const selected=settings['voice'+side];return ['M1','F1'].includes(selected)?selected:(['M1','F1'].includes(fallback)?fallback:'M1');}
 function normalize(value={}){
  const legacy=rate(value.speed);
  const {sleepTimer,...rest}=value;
  return {...{order:'KOR_ENG',repeatFront:1,repeatBack:1,interval:2000},...rest,
   speed:legacy,speedFront:rate(value.speedFront,legacy),speedBack:rate(value.speedBack,legacy),
   voiceFront:['M1','F1'].includes(value.voiceFront)?value.voiceFront:'default',
   voiceBack:['M1','F1'].includes(value.voiceBack)?value.voiceBack:'default',
   parenthesesFront:value.parenthesesFront==='omit'?'omit':'include',
   parenthesesBack:value.parenthesesBack==='omit'?'omit':'include'};
 }
 function text(value,side,settings){
  let result=String(value||'');
  if(side==='Front')result=result.replace(/<[^>]+>/g,'');
  if(settings['parentheses'+side]==='omit'){
   let previous;
   do{previous=result;result=result.replace(/\([^()]*\)|（[^（）]*）/g,' ');}while(result!==previous);
   result=result.replace(/\s+/g,' ').replace(/\s+([,.;:!?。，、！？；：])/g,'$1');
  }
  return result.trim();
 }
 function save(key,value){localStorage.setItem(key,JSON.stringify(value));}
 const quizIds=['quizGroupFilter','quizSubCondition','quizSerialStart','quizCount'];
 const quizKey='solQuizSetupV1';
 function saveQuiz(){
  const values={};for(const id of quizIds)values[id]=document.getElementById(id).value;
  try{save(quizKey,values);}catch{if(self.showToast)showToast('설정을 저장하지 못했습니다. 저장 공간을 확인해 주세요.');}
 }
 function restoreQuiz(){
  const values=parse(quizKey);
  for(const id of quizIds){const input=document.getElementById(id);if(values[id]!==undefined)input.value=String(values[id]);}
  document.getElementById('serialInputGroup').style.display=document.getElementById('quizSubCondition').value==='SERIAL'?'flex':'none';
 }
 self.SolSpeech={rate,voice,normalize,text,load:()=>normalize(parse('bmConfigNew')),save:value=>save('bmConfigNew',normalize(value)),restoreQuiz,saveQuiz};
 restoreQuiz();
 for(const id of quizIds){const input=document.getElementById(id);for(const event of ['input','change'])input.addEventListener(event,saveQuiz);}
})();

