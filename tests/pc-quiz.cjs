const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname+'/../',html=fs.readFileSync(root+'index.html','utf8'),script=fs.readFileSync(root+'pc-quiz.js','utf8');
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
function setup(options={}){
 const ids=new Map(),listeners=new Map(),timers=[],storage=options.storage||new Map(),writes=[],history=[],messages=[];
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
 SolTTS:{stop(){},prepare(){}},updateWord:async q=>writes.push({...q}),recordStudyHistory:async(id,result)=>history.push({id,result}),updateFavoriteBtnUI(){},updateMediaSessionMetadata(){},alert(){},showToast:message=>messages.push(message),enterBrowserModeView(){c.isBrowserModeActive=true;},endQuiz(){c.ended=true;view.classList.remove('active');},setTimeout:fn=>{timers.push(fn);return timers.length;}};
 c.self=c;c.window=c;if(options.native)c.AndroidHost={};vm.createContext(c);
 const extract=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
 vm.runInContext(extract('    function renderMaskedText(','    function updateFavoriteBtnUI('),c);
 vm.runInContext(extract('    function renderCurrentQuestion(','    function toggleEditCard('),c);
 vm.runInContext(extract('    async function handleQuizResult(','    function endQuiz('),c);
 const originals={render:c.renderCurrentQuestion,result:c.handleQuizResult,previous:c.prevQuestion};vm.runInContext(script,c);c.renderCurrentQuestion();
 const key=(name,extra={})=>{const e={key:name,target:body,repeat:false,prevented:false,preventDefault(){this.prevented=true},...extra};for(const fn of listeners.get('keydown')||[])fn(e);return e;};
 return {c,ids,view,back,front,header,editor,storage,writes,history,originals,timers,key,element:tag=>new Element(tag),flush(){for(const fn of timers.splice(0))fn();},masks:()=>back.querySelectorAll('.quiz-mask-word')};
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
 a.key('PageDown');a.key('PageDown');a.key('PageUp');await settle();check(a.writes.length===1&&a.history.length===1&&a.history[0].result===false&&a.c.quizQueue[0].score===-1&&a.c.currentQIdx===0,'PageDown uses the real wrong-answer grader and ignores overlapping navigation');
 a.flush();check(a.c.currentQIdx===1,'grading moves to exactly the next card');
 a.key('PageUp');check(a.c.currentQIdx===0&&a.writes.length===1,'PageUp goes back without a score change');
 a.key('PageDown',{repeat:true});await settle();check(a.writes.length===1,'holding PageDown does not repeatedly penalize cards');
 for(const extra of [{target:a.ids.get('editEnglishInput')},{target:a.element('textarea')},{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{isComposing:true}])check(!a.key('PageDown',extra).prevented,'typing and modified keys keep native behavior');
 a.editor.style.display='block';check(!a.key('ArrowRight').prevented,'inline sentence editing is protected');a.editor.style.display='none';a.c.isBrowserModeActive=true;check(!a.key('PageDown').prevented,'automatic reading is outside manual-quiz shortcuts');a.c.isBrowserModeActive=false;
 a.c.currentQIdx=2;a.c.renderCurrentQuestion();a.key('PageDown');await settle();a.flush();check(a.c.ended&&a.history.at(-1).id==='c'&&a.history.at(-1).result===false,'PageDown grades the last card before finishing the round');
 const mouse=setup(),keyboard=setup();mouse.masks()[0].onclick({stopPropagation(){}});keyboard.key('ArrowRight');await mouse.c.handleQuizResult(true,'X');await keyboard.c.handleQuizResult(true,'X');check(mouse.c.quizQueue[0].score===keyboard.c.quizQueue[0].score&&mouse.c.roundCorrectCount===keyboard.c.roundCorrectCount&&mouse.history[0].result===keyboard.history[0].result,'mouse and keyboard reveals receive identical existing score judgments');
 for(const options of [{native:true},{mobile:true}]){const m=setup(options);check(!m.c.SolPCQuiz&&!m.ids.has('pcQuizSettingsButton')&&m.c.handleQuizResult===m.originals.result&&m.c.prevQuestion===m.originals.previous,'mobile and Android retain their original rendering, controls and scoring');}
 console.log('All PC quiz behavior checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
