/* Desktop web only: shares mask state and the existing grading functions. */
(function(){
 'use strict';
 function desktop(){
  const nav=navigator,ua=nav.userAgent||'';
  return !self.AndroidHost&&!self.SolAndroid&&!nav.userAgentData?.mobile&&!/Android|iPhone|iPad|iPod|Mobile/i.test(ua)&&!(nav.platform==='MacIntel'&&nav.maxTouchPoints>1);
 }
 function init(){
  if(!desktop()||self.SolPCQuiz)return;
  const view=document.getElementById('viewQuizPlay'),header=view?.querySelector('.quiz-header-row'),edit=header?.querySelector('[onclick="toggleEditCard()"]');
  if(!view||!header||!edit)return;
  const key='solPcQuizAppearanceV1',defaults={frontSize:18,backSize:16.5,frontLeading:1.4,backLeading:1.3,columnGap:12,slashSize:100,slashBefore:0,slashAfter:0};
  const limits={frontSize:[6,72],backSize:[6,72],frontLeading:[.8,3],backLeading:[.8,3],columnGap:[0,120],slashSize:[10,200],slashBefore:[0,48],slashAfter:[0,48]};
  const el=id=>document.getElementById(id);let prefs={...defaults,readParentheses:bmConfig.parenthesesBack!=='omit'},busy=false,revealOrder=[];
  try{const stored=JSON.parse(localStorage.getItem(key));for(const name of Object.keys(defaults)){const n=Number(stored?.[name]);if(stored?.[name]!==undefined&&Number.isFinite(n)&&n>=limits[name][0]&&n<=limits[name][1])prefs[name]=n;}if(typeof stored?.readParentheses==='boolean')prefs.readParentheses=stored.readParentheses;}catch{}
  document.documentElement.classList.add('sol-pc-quiz');
  const actions=document.createElement('div');actions.className='pc-quiz-header-actions';edit.replaceWith(actions);actions.append(edit);
  const button=document.createElement('button');button.id='pcQuizSettingsButton';button.type='button';button.textContent='설정';button.setAttribute('aria-haspopup','dialog');actions.append(button);
  const dialog=document.createElement('dialog');dialog.id='pcQuizSettingsDialog';dialog.setAttribute('aria-labelledby','pcQuizSettingsTitle');
  const field=(name,label,step)=>'<label for="pcQuiz-'+name+'">'+label+'<input id="pcQuiz-'+name+'" type="number" min="'+limits[name][0]+'" max="'+limits[name][1]+'" step="'+step+'" required></label>';
  dialog.innerHTML='<h2 id="pcQuizSettingsTitle">PC 퀴즈 화면 설정</h2><p>마스킹 글자도 해당 열의 글꼴 크기에 맞춰 함께 조절됩니다.</p>'+
   '<fieldset><legend>1열 · 한국어 문장</legend><div class="pc-quiz-settings-grid">'+field('frontSize','글꼴 크기 · pt',.5)+field('frontLeading','줄간격 · 배',.05)+'</div></fieldset>'+
   '<fieldset><legend>2열 · 영어 문장과 마스킹</legend><div class="pc-quiz-settings-grid">'+field('backSize','글꼴 크기 · pt',.5)+field('backLeading','줄간격 · 배',.05)+'</div></fieldset>'+
   '<fieldset><legend>문장 사이</legend>'+field('columnGap','1열과 2열 사이 간격 · pt',1)+'</fieldset>'+
   '<fieldset><legend>슬래시 / · 두 열에 공통 적용</legend><div class="pc-quiz-settings-grid">'+field('slashSize','글자 크기 · 해당 본문 대비 %',5)+field('slashBefore','/ 앞 강제 여백 · pt',.5)+field('slashAfter','/ 뒤 강제 여백 · pt',.5)+'</div></fieldset>'+
   '<fieldset><legend>낭독</legend><label for="pcQuiz-readParentheses" class="pc-quiz-checkbox"><input id="pcQuiz-readParentheses" type="checkbox">괄호 안 내용 읽기</label><p>낭독 버튼과 ↓ 키에 적용됩니다.</p></fieldset>'+
   '<p>PageUp / PageDown: 채점 없이 이전 / 다음 카드<br>Enter: 마스킹을 모두 열었을 때 정답 처리 후 다음 카드<br>↑: 오답 처리 후 다음 카드 · ↓: 낭독<br>→: 마스킹 한 묶음 열기 · ←: 최근에 연 묶음 닫기</p>'+
   '<p id="pcQuizSettingsError" role="alert"></p><div class="pc-quiz-settings-actions"><button type="button" id="pcQuizSettingsCancel" class="btn-outline">취소</button><button type="button" id="pcQuizSettingsSave" class="btn-primary">저장</button></div>';
  document.body.append(dialog);
  const feedback=document.createElement('div');feedback.className='pc-quiz-feedback';feedback.setAttribute('aria-hidden','true');document.body.append(feedback);
  function gradeFromKeyboard(correct){
   if(!quizQueue[currentQIdx])return;
   const rect=el('quizCard').getBoundingClientRect();
   feedback.textContent=correct?'O':'X';feedback.style.color=correct?'#2b8a3e':'#e03131';
   feedback.style.left=(rect.left+rect.width/2)+'px';feedback.style.top=(rect.top+rect.height/2)+'px';
   feedback.classList.remove('pc-quiz-feedback-show');void feedback.offsetWidth;feedback.classList.add('pc-quiz-feedback-show');
   handleQuizResult(correct,correct?'X':'Y');
  }
  function apply(){
   const variables={'front-size':prefs.frontSize+'pt','back-size':prefs.backSize+'pt','front-leading':prefs.frontLeading,'back-leading':prefs.backLeading,'column-gap':prefs.columnGap+'pt','slash-size':prefs.slashSize+'%','slash-before':prefs.slashBefore+'pt','slash-after':prefs.slashAfter+'pt'};
   for(const [name,value]of Object.entries(variables))view.style.setProperty('--pc-quiz-'+name,String(value));
  }
  function openSettings(){for(const name of Object.keys(defaults))el('pcQuiz-'+name).value=prefs[name];el('pcQuiz-readParentheses').checked=prefs.readParentheses;el('pcQuizSettingsError').textContent='';dialog.showModal();}
  button.onclick=openSettings;el('pcQuizSettingsCancel').onclick=()=>dialog.close();
  el('pcQuizSettingsSave').onclick=()=>{
   const next={};
   for(const name of Object.keys(defaults)){const input=el('pcQuiz-'+name),n=Number(input.value);if(input.value.trim()===''||!Number.isFinite(n)||n<limits[name][0]||n>limits[name][1]){el('pcQuizSettingsError').textContent='각 항목의 허용 범위 안에서 숫자를 입력하세요.';input.focus();return;}next[name]=n;}
   next.readParentheses=el('pcQuiz-readParentheses').checked;
   try{localStorage.setItem(key,JSON.stringify(next));prefs=next;apply();dialog.close();}catch{el('pcQuizSettingsError').textContent='설정을 저장하지 못했습니다. 저장 공간을 확인해 주세요.';}
  };
  self.playManualTTS=async function(){
   unlockAudioAndTTS();
   const q=quizQueue[currentQIdx];if(!q)return;
   const settings={...bmConfig,parenthesesBack:prefs.readParentheses?'include':'omit'};
   try{await SolTTS.speak(SolSpeech.text(q.english,'Back',settings),'en-US',settings.speedBack,{voice:SolSpeech.voice('Back',settings,SolTTS.config.voice)});}
   catch(error){showToast(error.message);}
  };
  function slashText(root){
   if(!root)return;const leaves=[];
   function walk(node){for(const child of Array.from(node.childNodes)){if(child.nodeType===3&&child.nodeValue.includes('/'))leaves.push(child);else if(child.nodeType===1&&!child.classList.contains('pc-quiz-slash'))walk(child);}}
   walk(root);
   for(const node of leaves){const parts=node.nodeValue.split('/'),fragment=document.createDocumentFragment();parts.forEach((part,i)=>{if(i){const slash=document.createElement('span');slash.className='pc-quiz-slash';slash.textContent='/';fragment.append(slash);}if(part)fragment.append(document.createTextNode(part));});node.replaceWith(fragment);}
  }
  function masks(){return Array.from(el('qEnglishMasked').querySelectorAll('.quiz-mask-word'));}
  function setRevealed(unit,value,keyboard=false){
   if(busy)return;
   unit.classList.toggle('revealed',value);unit.classList.toggle('pc-keyboard-hidden',keyboard&&!value);
   revealOrder=revealOrder.filter(node=>node!==unit);if(value)revealOrder.push(unit);
  }
  function bindMasks(container){
   revealOrder=[];const children=Array.from(container.children);
   children.forEach((child,i)=>{if(i<children.length-1)child.after(document.createTextNode(' '));});
   for(const unit of masks()){
    unit.onclick=function(event){event.stopPropagation();setRevealed(this,!this.classList.contains('revealed'));};
    unit.onmouseenter=()=>unit.classList.remove('pc-keyboard-hidden');
   }
   slashText(container);
  }
  const originalMasked=renderMaskedText;
  self.renderMaskedText=function(container,...args){const value=originalMasked(container,...args);if(container.id==='qEnglishMasked')bindMasks(container);return value;};
  const originalRender=renderCurrentQuestion;
  self.renderCurrentQuestion=function(...args){try{const result=originalRender(...args);revealOrder=[];slashText(el('qKorean'));apply();return result;}finally{busy=false;}};
  const originalResult=handleQuizResult;
  self.handleQuizResult=async function(...args){
   if(busy||!view.classList.contains('active')||isBrowserModeActive||!quizQueue[currentQIdx])return;
   busy=true;
   try{return await originalResult(...args);}catch(error){busy=false;if(self.showToast)showToast(error.message||'학습 결과를 저장하지 못했습니다.');}
  };
  for(const name of ['prevQuestion','skipQuestion','enterBrowserModeView']){const original=self[name];self[name]=function(...args){if(!busy)return original(...args);};}
  function blocked(event){
   if(!view.classList.contains('active')||isBrowserModeActive)return true;
   if(event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.isComposing)return true;
   const target=event.target;if(target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return true;
   if(document.querySelector('dialog[open]'))return true;
   const editor=el('quizEditCard');return !!editor&&editor.style.display!=='none'&&editor.style.display!=='';
  }
  function navigateWithoutMotion(move){
   const card=el('quizCard'),transition=card.style.transition,animation=card.style.animation;
   card.style.transition='none';card.style.animation='none';
   try{return move();}finally{void card.offsetWidth;card.style.transition=transition;card.style.animation=animation;}
  }
  // Capture before focused buttons and cancel browser focus navigation as well.
  self.addEventListener('keydown',event=>{
   const keys=['PageUp','PageDown','Enter','ArrowUp','ArrowDown','ArrowRight','ArrowLeft'];
   const aliases={Up:'ArrowUp',Down:'ArrowDown',Right:'ArrowRight',Left:'ArrowLeft'};
   const pressed=keys.includes(event.key)?event.key:aliases[event.key]||event.code||({13:'Enter',33:'PageUp',34:'PageDown',37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown'}[event.keyCode]);
   if(!keys.includes(pressed)||blocked(event))return;
   event.preventDefault();event.stopImmediatePropagation();if(busy)return;
   if(pressed==='PageUp'){if(!event.repeat)navigateWithoutMotion(prevQuestion);return;}
   if(pressed==='PageDown'){if(!event.repeat)navigateWithoutMotion(skipQuestion);return;}
   if(pressed==='ArrowDown'){if(!event.repeat)playManualTTS();return;}
   if(pressed==='ArrowUp'){if(!event.repeat)gradeFromKeyboard(false);return;}
   const units=masks();
   if(pressed==='Enter'){if(!event.repeat&&units.every(unit=>unit.classList.contains('revealed')))gradeFromKeyboard(true);return;}
   if(pressed==='ArrowRight'){const next=units.find(unit=>!unit.classList.contains('revealed'));if(next)setRevealed(next,true,true);}
   else{const recent=[...revealOrder].reverse().find(unit=>units.includes(unit)&&unit.classList.contains('revealed'))||[...units].reverse().find(unit=>unit.classList.contains('revealed'));if(recent)setRevealed(recent,false,true);}
  },{capture:true,passive:false});
  apply();if(view.classList.contains('active')){bindMasks(el('qEnglishMasked'));slashText(el('qKorean'));}self.SolPCQuiz={openSettings,get settings(){return {...prefs};}};
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
