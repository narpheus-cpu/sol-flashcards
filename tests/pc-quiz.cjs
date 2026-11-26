const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname+'/../',html=fs.readFileSync(root+'index.html','utf8'),script=fs.readFileSync(root+'pc-quiz-controls.js','utf8');
const speechSource=fs.readFileSync(root+'speech-settings.js','utf8');
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
function setup(options={}){
 const ids=new Map(),listeners=new Map(),windowListeners=[],timers=[],storage=options.storage||new Map(),writes=[],history=[],messages=[],renderStates=[];
 let doc;
 class Text{constructor(value){this.nodeType=3;this.nodeValue=value;this.parentNode=null;}get textContent(){return this.nodeValue;}replaceWith(node){this.parentNode.replace(this,node);}}
 class Element{
  constructor(tag='div',type=1){this.tagName=tag.toUpperCase();this.nodeType=type;this.childNodes=[];this.parentNode=null;this.className='';this.attrs={};this.open=false;this._value='';this.style={setProperty:(k,v)=>this.style[k]=v};
   this.classList={contains:n=>this.className.split(/\s+/).includes(n),add:(...ns)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...ns])].join(' ')},remove:(...ns)=>{this.className=this.className.split(/\s+/).filter(n=>!ns.includes(n)).join(' ')},toggle:(n,force)=>{const on=force===undefined?!this.classList.contains(n):force;on?this.classList.add(n):this.classList.remove(n);return on;}};
  }
  set id(v){this.attrs.id=v;ids.set(v,this);}get id(){return this.attrs.id;}
  set value(v){this._value=String(v);}get value(){return this._value;}
  get children(){return this.childNodes.filter(c=>c.nodeType===1);}
  append(...nodes){for(let node of nodes){if(typeof node==='string')node=new Text(node);if(node.nodeType===11){this.append(...[...node.childNodes]);continue;}if(node.parentNode)node.parentNode.remove(node);this.childNodes.push(node);node.parentNode=this;}}
  appendChild(node){this.append(node);return node;}
  remove(node){this.childNodes.splice(this.childNodes.indexOf(node),1);node.parentNode=null;}
  replace(old,node){const at=this.childNodes.indexOf(old);this.remove(old);const items=node.nodeType===11?[...node.childNodes]:[node];for(let i=0;i<items.length;i++){const n=items[i];if(n.parentNode)n.parentNode.remove(n);this.childNodes.splice(at+i,0,n);n.parentNode=this;}}
  replaceWith(node){this.parentNode.replace(this,node);}
  after(node){const at=this.parentNode.childNodes.indexOf(this);this.parentNode.childNodes.splice(at+1,0,node);node.parentNode=this.parentNode;}
  set textContent(v){this.childNodes.forEach(c=>c.parentNode=null);this.childNodes=[];if(v!=='')this.append(new Text(String(v)));}get textContent(){return this.childNodes.map(c=>c.textContent).join('');}
  set innerText(v){this.textContent=v;}get innerText(){return this.textContent;}
  set innerHTML(value){
   this.textContent='';const stack=[this],decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"');
   for(const match of String(value).matchAll(/<\/?[a-zA-Z][^>]*>|[^<]+/g)){
    const token=match[0];if(token.startsWith('</')){stack.pop();continue;}
    if(token.startsWith('<')){const tag=token.match(/^<(\w+)/)[1],node=new Element(tag);for(const a of token.matchAll(/([\w-]+)="([^"]*)"/g))node.setAttribute(a[1],a[2]);stack.at(-1).append(node);if(!['input','br','img','meta','link'].includes(tag))stack.push(node);}
    else stack.at(-1).append(new Text(decode(token)));
   }
  }
  setAttribute(k,v){if(k==='id')this.id=v;else if(k==='class')this.className=v;else this.attrs[k]=v;}
  matches(selector){if(selector==='dialog[open]')return this.tagName==='DIALOG'&&this.open;if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));if(selector.startsWith('[onclick='))return this.attrs.onclick==='toggleEditCard()';if(selector.startsWith('[contenteditable]'))return this.attrs.contenteditable!==undefined&&this.attrs.contenteditable!=='false';return this.tagName===selector.toUpperCase();}
  closest(selector){for(let node=this;node;node=node.parentNode)if(selector.split(',').some(s=>node.nodeType===1&&node.matches(s)))return node;return null;}
  querySelectorAll(selector){const out=[];const walk=node=>{for(const child of node.children){if(child.matches(selector))out.push(child);walk(child);}};walk(this);return out;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  showModal(){this.open=true;}close(){this.open=false;}focus(){doc.activeElement=this;}
  getBoundingClientRect(){return {left:100,top:120,width:600,height:400};}
 }
 const element=(id,tag='div',parent)=>{const node=new Element(tag);node.id=id;if(parent)parent.append(node);return node;};
 const htmlRoot=new Element('html'),body=new Element('body');htmlRoot.append(body);
 const view=element('viewQuizPlay','div',body);view.className='view-content active';const header=new Element();header.className='quiz-header-row';view.append(header);
 const edit=new Element('button');edit.attrs.onclick='toggleEditCard()';header.append(edit);
 const card=element('quizCard','div',view),front=element('qKorean','div',card),back=element('qEnglishMasked','div',card);element('quizStatus','div',header);
 const editor=element('quizEditCard','div',card);editor.style.display='none';element('editKoreanInput','input',editor);element('editEnglishInput','input',editor);
 doc={readyState:'complete',documentElement:htmlRoot,body,head:new Element('head'),getElementById:id=>ids.get(id),createElement:tag=>new Element(tag),createTextNode:value=>new Text(value),createDocumentFragment:()=>new Element('fragment',11),querySelector:s=>htmlRoot.querySelector(s),addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);}};
 const c={document:doc,navigator:{userAgent:options.mobile?'Mozilla Android Mobile':'Mozilla Windows NT 10.0',platform:'Win32',maxTouchPoints:0},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},console,Map,Set,Date,Array,Object,Number,innerWidth:1000,innerHeight:800,card,
 quizQueue:[{id:'a',korean:'나는 / 집에 간다.',english:'I/read/it and you / go.',score:0,serialNum:1,totalSlotCount:3},{id:'b',korean:'둘째 / 문장',english:'Second card.',score:2,serialNum:2,totalSlotCount:3},{id:'c',korean:'마지막',english:'Last card.',score:0,serialNum:3,totalSlotCount:3}],currentQIdx:0,roundCorrectCount:0,isBrowserModeActive:false,
 SolTTS:{stop(){},prepare(){renderStates.push({transition:card.style.transition,animation:card.style.animation});}},updateWord:async q=>writes.push({...q}),recordStudyHistory:async(id,result)=>history.push({id,result}),updateFavoriteBtnUI(){},updateMediaSessionMetadata(){},alert(){},showToast:message=>messages.push(message),enterBrowserModeView(){c.isBrowserModeActive=true;},endQuiz(){c.ended=true;view.classList.remove('active');},setTimeout:fn=>{timers.push(fn);return timers.length;}};
 c.addEventListener=(name,fn,options)=>windowListeners.push({name,fn,capture:options===true||!!options?.capture});
 c.playManualTTS=()=>{c.readCount=(c.readCount||0)+1;};
 c.bmConfig={speedBack:.85,voiceBack:'F1',parenthesesBack:options.omitExisting?'omit':'include'};c.speeches=[];c.unlockAudioAndTTS=()=>{c.unlockCount=(c.unlockCount||0)+1;};c.SolTTS.config={voice:'M1'};c.SolTTS.speak=async(text,lang,rate,options)=>{c.readCount=(c.readCount||0)+1;c.speeches.push({text,lang,rate,options});};
 c.self=c;c.window=c;if(options.native)c.AndroidHost={};vm.createContext(c);
 vm.runInContext(speechSource.slice(speechSource.indexOf(' function voice('),speechSource.indexOf(' function normalize(')),c);
 vm.runInContext(speechSource.slice(speechSource.indexOf(' function text('),speechSource.indexOf(' function save(')),c);c.SolSpeech={text:c.text,voice:c.voice};
 const extract=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
 vm.runInContext(extract('    function renderMaskedText(','    function updateFavoriteBtnUI('),c);
 vm.runInContext(extract('    function renderCurrentQuestion(','    function toggleEditCard('),c);
 vm.runInContext(extract('    async function handleQuizResult(','    function endQuiz('),c);
 const originals={render:c.renderCurrentQuestion,result:c.handleQuizResult,previous:c.prevQuestion};vm.runInContext(script,c);c.renderCurrentQuestion();
 const key=(name,extra={})=>{
  const e={key:name,target:body,repeat:false,prevented:false,stopped:false,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},stopPropagation(){this.stopped=true},...extra};
  for(const listener of windowListeners.filter(l=>l.name==='keydown'&&l.capture)){listener.fn(e);if(e.stopped)break;}
  if(!e.stopped)e.target.onkeydown?.(e);
  if(!e.stopped)for(const fn of listeners.get('keydown')||[]){fn(e);if(e.stopped)break;}
  if(!e.stopped)for(const listener of windowListeners.filter(l=>l.name==='keydown'&&!l.capture)){listener.fn(e);if(e.stopped)break;}
  if(!e.prevented&&['ArrowUp','ArrowDown'].includes(name))c.focusMoves=(c.focusMoves||0)+1;
  return e;
 };
 return {c,ids,view,back,front,header,editor,storage,writes,history,originals,timers,key,renderStates,element:tag=>new Element(tag),flush(){for(const fn of timers.splice(0))fn();},masks:()=>back.querySelectorAll('.quiz-mask-word')};
}
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
const check=(value,message)=>{assert.ok(value,message);console.log('PASS '+message);};
(async()=>{
 const a=setup();check(a.header.querySelector('.pc-quiz-header-actions').children.at(-1).id==='pcQuizSettingsButton','settings button is immediately to the right of edit');
 check(a.masks().length===3&&a.masks()[0].querySelector('.real-layer').textContent==='I/read/it','one mask unit is a whole whitespace-delimited group, including internal slashes');
 a.key('ArrowRight');check(a.masks()[0].classList.contains('revealed')&&!a.masks()[1].classList.contains('revealed'),'right arrow reveals exactly one whole mask unit');
 a.key('ArrowRight');a.key('ArrowLeft');check(a.masks()[0].classList.contains('revealed')&&!a.masks()[1].classList.contains('revealed')&&a.masks()[1].classList.contains('pc-keyboard-hidden'),'left arrow closes the most recent unit and overrides a lingering hover');
 a.masks()[2].onclick({stopPropagation(){}});a.key('ArrowLeft');check(!a.masks()[2].classList.contains('revealed'),'mouse clicks and arrow keys share reveal history');
 const first=a.masks()[0];a.c.SolPCQuiz.openSettings();
 check(!a.key('PageDown').prevented&&a.writes.length===0,'dialog input keeps PageDown and arrows free of quiz actions');
 const values={frontSize:24,backSize:21,frontLeading:1.8,backLeading:1.6,columnGap:20,slashSize:70,slashBefore:4,slashAfter:6};for(const [name,value]of Object.entries(values))a.ids.get('pcQuiz-'+name).value=value;a.ids.get('pcQuizSettingsSave').onclick();
 check(a.view.style['--pc-quiz-front-size']==='24pt'&&a.view.style['--pc-quiz-back-size']==='21pt'&&a.view.style['--pc-quiz-slash-before']==='4pt'&&a.view.style['--pc-quiz-slash-after']==='6pt','saved font sizes, line heights, column gap and forced slash spacing apply in points');
 check(a.masks()[0]===first&&first.classList.contains('revealed'),'saving appearance settings preserves already opened masks');
 check(first.querySelectorAll('.pc-quiz-slash').length===4&&a.front.textContent==='나는 / 집에 간다.','slash styling preserves original text and uses identical markup for mask and answer');
 const b=setup({storage:a.storage});check(b.c.SolPCQuiz.settings.backSize===21&&b.c.SolPCQuiz.settings.slashSize===70,'PC appearance preferences persist after reopening');
 const speech=setup(),sentence='I (really (truly)) read （quietly） books.',autoSettings=JSON.stringify(speech.c.bmConfig);speech.c.quizQueue[0].english=sentence;speech.c.renderCurrentQuestion();const masksBefore=speech.masks();
 speech.c.SolPCQuiz.openSettings();speech.ids.get('pcQuiz-readParentheses').checked=false;speech.ids.get('pcQuizSettingsSave').onclick();await speech.c.playManualTTS();speech.key('ArrowDown');await settle();
 check(speech.c.speeches.length===2&&speech.c.speeches.every(s=>s.text==='I read books.'),'the reading button and down arrow both omit nested and full-width parentheses when unchecked');
 check(speech.c.speeches.every(s=>s.lang==='en-US'&&s.rate===.85&&s.options.voice==='F1')&&JSON.stringify(speech.c.bmConfig)===autoSettings,'manual parentheses preference keeps selected voice, speed and automatic reading settings');
 check(speech.c.quizQueue[0].english===sentence&&speech.masks()[0]===masksBefore[0],'speech-only omission preserves the original sentence and current masks');
 const reopened=setup({storage:speech.storage});reopened.c.quizQueue[0].english=sentence;await reopened.c.playManualTTS();check(reopened.c.SolPCQuiz.settings.readParentheses===false&&reopened.c.speeches[0].text==='I read books.','the manual reading checkbox remains saved after reopening');
 speech.c.SolPCQuiz.openSettings();speech.ids.get('pcQuiz-readParentheses').checked=true;speech.ids.get('pcQuizSettingsSave').onclick();await speech.c.playManualTTS();speech.key('ArrowDown');await settle();check(speech.c.speeches.slice(-2).every(s=>s.text===sentence),'checking the option restores parentheses for both reading controls');
 check(setup({omitExisting:true}).c.SolPCQuiz.settings.readParentheses===false,'first use respects the existing reading preference');
 a.key('PageDown');check(a.c.currentQIdx===1&&a.writes.length===0&&a.history.length===0&&a.c.quizQueue[0].score===0,'PageDown moves past a partly masked card without grading');
 a.key('PageUp');check(a.c.currentQIdx===0&&a.writes.length===0&&a.history.length===0,'PageUp moves past a fully masked card without grading');
 for(const unit of a.masks())unit.onclick({stopPropagation(){}});a.key('PageDown');for(const unit of a.masks())unit.onclick({stopPropagation(){}});a.key('PageUp');check(a.c.currentQIdx===0&&a.writes.length===0&&a.history.length===0,'PageUp and PageDown also leave fully revealed cards ungraded');
 a.key('PageDown',{repeat:true});check(a.c.currentQIdx===0,'holding PageDown does not skip multiple cards');
 a.key('ArrowDown');a.key('ArrowDown',{repeat:true});check(a.c.readCount===1&&a.writes.length===0,'down arrow invokes the existing reading button action once without grading');
 const focused=setup(),focusedButton=focused.element('button');let buttonKeyCalls=0;focusedButton.onkeydown=e=>{buttonKeyCalls++;e.stopPropagation();};focusedButton.focus();
 const down=focused.key('ArrowDown',{target:focusedButton});check(down.prevented&&down.stopped&&focused.c.readCount===1&&!buttonKeyCalls&&!focused.c.focusMoves,'capture handles down arrow before a focused button and prevents native focus movement');
 const up=focused.key('ArrowUp',{target:focusedButton});await settle();check(up.prevented&&up.stopped&&focused.history.length===1&&focused.history[0].result===false&&!buttonKeyCalls&&!focused.c.focusMoves,'capture handles up arrow before a focused button and grades instead of moving focus');
 const still=setup();still.c.card.style.transition='transform .25s, opacity .2s';still.c.card.style.animation='sample .2s';still.key('PageDown');check(still.renderStates.at(-1).transition==='none'&&still.renderStates.at(-1).animation==='none'&&still.c.currentQIdx===1&&still.history.length===0,'PageDown renders the next card with transitions and animations disabled');still.key('PageUp');check(still.renderStates.at(-1).transition==='none'&&still.renderStates.at(-1).animation==='none'&&still.c.currentQIdx===0&&still.history.length===0,'PageUp renders the previous card without motion or grading');check(still.c.card.style.transition==='transform .25s, opacity .2s'&&still.c.card.style.animation==='sample .2s','navigation restores the existing grading animation only after the stationary card is laid out');
 const graded=setup(),flash=graded.c.document.querySelector('.pc-quiz-feedback');
 graded.key('Enter');await settle();check(graded.writes.length===0&&flash.textContent==='','Enter does nothing while any mask is closed');
 graded.masks()[0].onclick({stopPropagation(){}});graded.key('ArrowRight');graded.key('ArrowRight');graded.key('ArrowLeft');graded.key('Enter');check(graded.writes.length===0,'hiding a revealed group blocks Enter again');graded.key('ArrowRight');
 graded.key('Enter');graded.key('Enter');graded.key('ArrowUp');graded.key('PageDown');graded.key('PageUp');await settle();
 check(graded.writes.length===1&&graded.history.length===1&&graded.history[0].result===true&&graded.c.quizQueue[0].score===1&&graded.c.roundCorrectCount===1,'Enter grades a fully revealed card exactly once and blocks overlapping actions');
 check(flash.textContent==='O'&&flash.style.color==='#2b8a3e'&&flash.style.left==='400px'&&flash.style.top==='320px'&&flash.classList.contains('pc-quiz-feedback-show'),'correct feedback flashes a green O centered over the card');
 graded.flush();check(graded.c.currentQIdx===1,'Enter advances exactly one card after recording the result');
 graded.key('Enter',{repeat:true});graded.key('ArrowUp',{repeat:true});check(graded.writes.length===1,'holding a grading key cannot grade the following card');
 graded.key('ArrowUp');await settle();check(graded.history.at(-1).result===false&&graded.c.quizQueue[1].score===1&&flash.textContent==='X'&&flash.style.color==='#e03131','up arrow grades an unopened card wrong and flashes a red X');graded.flush();check(graded.c.currentQIdx===2,'up arrow advances exactly one card');
 for(const extra of [{target:a.ids.get('editEnglishInput')},{target:a.element('textarea')},{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{isComposing:true}])check(!a.key('PageDown',extra).prevented,'typing and modified keys keep native behavior');
 a.editor.style.display='block';check(!a.key('ArrowRight').prevented,'inline sentence editing is protected');a.editor.style.display='none';a.c.isBrowserModeActive=true;check(!a.key('PageDown').prevented,'automatic reading is outside manual-quiz shortcuts');a.c.isBrowserModeActive=false;
 a.c.currentQIdx=2;a.c.renderCurrentQuestion();a.key('PageDown');check(a.c.ended&&a.history.length===0&&a.c.quizQueue[2].score===0,'PageDown finishes the last card without recording any result');
 graded.key('ArrowUp');await settle();graded.flush();check(graded.c.ended&&graded.history.at(-1).id==='c'&&graded.history.at(-1).result===false,'up arrow records the last card wrong before finishing');
 const mouse=setup(),keyboard=setup();mouse.masks()[0].onclick({stopPropagation(){}});keyboard.key('ArrowRight');await mouse.c.handleQuizResult(true,'X');await keyboard.c.handleQuizResult(true,'X');check(mouse.c.quizQueue[0].score===keyboard.c.quizQueue[0].score&&mouse.c.roundCorrectCount===keyboard.c.roundCorrectCount&&mouse.history[0].result===keyboard.history[0].result,'mouse and keyboard reveals receive identical existing score judgments');
 for(const options of [{native:true},{mobile:true}]){const m=setup(options);check(!m.c.SolPCQuiz&&!m.ids.has('pcQuizSettingsButton')&&m.c.handleQuizResult===m.originals.result&&m.c.prevQuestion===m.originals.previous,'mobile and Android retain their original rendering, controls and scoring');}
 console.log('All PC quiz behavior checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
