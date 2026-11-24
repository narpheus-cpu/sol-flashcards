/* Reading appearance and wall-clock expiry are independent of speech options. */
(function(){
 'use strict';
 const key='solReadingViewV1',el=id=>document.getElementById(id),waiters=new Set();
 const read=name=>{try{return JSON.parse(localStorage.getItem(name))||{};}catch{return {};}};
 const number=(value,fallback,min,max)=>{const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:fallback;};
 const stored=read(key),legacy=read('bmConfigNew');
 let prefs={frontSize:number(stored.frontSize,32,12,96),backSize:number(stored.backSize,24,12,96),
  parenthesesBreak:stored.parenthesesBreak===true,parenthesesPercent:number(stored.parenthesesPercent,80,30,100),
  autoStopMinutes:number(stored.autoStopMinutes,number(legacy.sleepTimer,0,0,1440),0,1440)};
 if(!localStorage.getItem(key))try{localStorage.setItem(key,JSON.stringify(prefs));}catch{}
 let paused=false,deadline=0,expiryTimer=null,countdown=null;
 const dialog=document.createElement('dialog');dialog.id='readingSettingsDialog';dialog.setAttribute('aria-labelledby','readingSettingsTitle');
 dialog.innerHTML='<h3 id="readingSettingsTitle">자동 읽기 화면 설정</h3>'+
  '<label for="readingFrontSize">1열(한국어 문장) 글꼴 크기 · px</label><input id="readingFrontSize" type="number" min="12" max="96" step="1">'+
  '<label for="readingBackSize">2열(영어 문장) 글꼴 크기 · px</label><input id="readingBackSize" type="number" min="12" max="96" step="1">'+
  '<label for="readingParenthesesBreak">1열 괄호 속 문장 행갈이</label><select id="readingParenthesesBreak"><option value="no">본문과 같은 줄</option><option value="yes">괄호 속 문장만 별도 줄</option></select>'+
  '<label for="readingParenthesesPercent">1열 괄호 글자 크기 · 본문 대비 %</label><input id="readingParenthesesPercent" type="number" min="30" max="100" step="5">'+
  '<p>80%를 선택하면 괄호 속 글자가 본문보다 20% 작게 표시됩니다. 낭독 내용은 음성 설정을 따릅니다.</p>'+
  '<label for="readingAutoStop">자동 종료 · 분</label><input id="readingAutoStop" type="number" min="0" max="1440" step="1">'+
  '<p>0은 사용 안 함. 시간이 되면 낭독을 멈추고 검은 화면으로 전환합니다. 종료 시간은 일시중지 중에도 계속 흐릅니다.</p>'+
  '<p id="readingSettingsError" role="alert"></p><div class="reading-settings-actions"><button type="button" class="btn-outline" id="readingSettingsCancel">취소</button><button type="button" class="btn-primary" id="readingSettingsSave">저장</button></div>';
 document.body.append(dialog);
 function parts(value){
  const source=String(value??''),out=[],stack=[];let start=0,plain=0;
  for(let i=0;i<source.length;i++){
   const c=source[i];
   if(c==='('||c==='（'){if(!stack.length)start=i;stack.push(c);}
   else if((c===')'||c==='）')&&stack.length){
    if((c===')'&&stack[stack.length-1]!=='(')||(c==='）'&&stack[stack.length-1]!=='（'))continue;
    stack.pop();if(!stack.length){if(start>plain)out.push({text:source.slice(plain,start),parenthetical:false});out.push({text:source.slice(start,i+1),parenthetical:true});plain=i+1;}
   }
  }
  if(plain<source.length)out.push({text:source.slice(plain),parenthetical:false});return out;
 }
 function render(card){
  const front=el('bmKor'),back=el('bmEng');front.style.fontSize=prefs.frontSize+'px';back.style.fontSize=prefs.backSize+'px';
  front.style.setProperty('--bm-parentheses-size',prefs.parenthesesPercent+'%');front.replaceChildren();
  for(const part of parts(card.korean)){
   if(!part.parenthetical){front.append(document.createTextNode(part.text));continue;}
   const span=document.createElement('span');span.className='bm-parenthetical'+(prefs.parenthesesBreak?' bm-parenthetical-block':'');span.textContent=part.text;front.append(span);
  }
  back.textContent=String(card.english??'');
 }
 function wake(){for(const resolve of waiters)resolve();waiters.clear();}
 function setPaused(value){paused=!!value;const button=el('bmPauseButton');if(button){button.textContent=paused?'▶ 계속읽기':'⏸ 일시중지';button.setAttribute('aria-pressed',String(paused));}if(!paused)wake();}
 async function setPlaybackPaused(value){
  const previous=paused;setPaused(value);
  try{if(SolTTS.roundActive())await(value?SolTTS.roundPause():SolTTS.roundResume());else if(value)SolTTS.pauseSpeech();else SolTTS.resumeSpeech();}
  catch(error){setPaused(previous);if(self.showToast)showToast(error.message);}
 }
 async function wait(active){while(paused&&active())await new Promise(resolve=>waiters.add(resolve));}
 async function delay(ms,active){let left=ms;while(left>0&&active()){await wait(active);if(!active())return;const slice=Math.min(left,80),at=performance.now();await new Promise(resolve=>setTimeout(resolve,slice));if(!paused)left-=performance.now()-at;}}
 function updateCountdown(){const node=el('bmTimerStatus');if(!node)return;if(!deadline){node.textContent='';return;}const sec=Math.max(0,Math.ceil((deadline-Date.now())/1000));node.textContent='자동 종료까지 '+Math.floor(sec/60)+'분 '+String(sec%60).padStart(2,'0')+'초';}
 function clearTimers(){clearTimeout(expiryTimer);clearInterval(countdown);expiryTimer=countdown=null;}
 function expire(){if(typeof isBrowserModeActive==='undefined'||!isBrowserModeActive)return;exitBrowserModeView();showBlackScreen();if(self.showToast)showToast('설정한 시간이 되어 자동 읽기를 종료했습니다.');}
 function arm(){clearTimers();updateCountdown();if(deadline){expiryTimer=setTimeout(expire,Math.max(0,deadline-Date.now()));countdown=setInterval(updateCountdown,1000);}}
 function start(){setPaused(false);deadline=prefs.autoStopMinutes>0?Date.now()+prefs.autoStopMinutes*60000:0;arm();}
 function stop(){clearTimers();deadline=0;setPaused(false);wake();updateCountdown();if(dialog.open)dialog.close();}
 function restore(state){setPaused(state.paused);deadline=Number(state.expiresAt)||0;arm();}
 function openSettings(){for(const [id,value]of Object.entries({readingFrontSize:prefs.frontSize,readingBackSize:prefs.backSize,readingParenthesesBreak:prefs.parenthesesBreak?'yes':'no',readingParenthesesPercent:prefs.parenthesesPercent,readingAutoStop:prefs.autoStopMinutes}))el(id).value=value;el('readingSettingsError').textContent='';dialog.showModal();}
 el('readingSettingsCancel').onclick=()=>dialog.close();
 el('readingSettingsSave').onclick=async()=>{
  const next={frontSize:Number(el('readingFrontSize').value),backSize:Number(el('readingBackSize').value),parenthesesBreak:el('readingParenthesesBreak').value==='yes',parenthesesPercent:Number(el('readingParenthesesPercent').value),autoStopMinutes:Number(el('readingAutoStop').value)};
  if(![next.frontSize,next.backSize].every(n=>Number.isInteger(n)&&n>=12&&n<=96)||!Number.isFinite(next.parenthesesPercent)||next.parenthesesPercent<30||next.parenthesesPercent>100||!Number.isInteger(next.autoStopMinutes)||next.autoStopMinutes<0||next.autoStopMinutes>1440){el('readingSettingsError').textContent='글꼴은 12~96px, 괄호 크기는 30~100%, 종료 시간은 0~1440분으로 입력하세요.';return;}
  const changed=next.autoStopMinutes!==prefs.autoStopMinutes;
  try{
   localStorage.setItem(key,JSON.stringify(next));prefs=next;
   if(typeof isBrowserModeActive!=='undefined'&&isBrowserModeActive){
    if(changed){deadline=next.autoStopMinutes>0?Date.now()+next.autoStopMinutes*60000:0;arm();if(self.SolAndroid)await SolAndroid.request('setExpiry',{expiresAt:deadline});}
    renderBrowserModeContent();
   }
   dialog.close();
  }catch(error){el('readingSettingsError').textContent='설정 저장 실패 · '+error.message;}
 };
 document.addEventListener('sol-round-pause',event=>setPaused(event.detail.paused));
 document.addEventListener('sol-native-state',event=>{if(event.detail.stoppedByTimer)expire();else if(typeof isBrowserModeActive!=='undefined'&&isBrowserModeActive)setPaused(event.detail.paused);});
 self.SolReading={parts,render,start,stop,restore,openSettings,togglePause:()=>setPlaybackPaused(!paused),pause:()=>setPlaybackPaused(true),resume:()=>setPlaybackPaused(false),wait,delay,get paused(){return paused;},get expiresAt(){return deadline;},get prefs(){return {...prefs};}};
})();
