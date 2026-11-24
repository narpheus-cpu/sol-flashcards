const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../reading-mode.js','utf8');
function setup(storage=new Map()){
 const nodes=new Map(),events=new Map(),timers=new Map(),requests=[];let clock=1000000,nextId=1,stopCount=0,black=0,paused=0,resumed=0;
 class Element{
  constructor(){this.style={setProperty:(k,v)=>this.style[k]=v};this.children=[];this.value='';this.open=false;this.textContent='';}
  set innerHTML(value){for(const m of value.matchAll(/id="([^"]+)"/g))nodes.set(m[1],new Element());}
  setAttribute(k,v){this[k]=v;}append(value){this.children.push(value);}replaceChildren(){this.children=[];}showModal(){this.open=true;}close(){this.open=false;}
 }
 for(const id of ['bmKor','bmEng','bmPauseButton','bmTimerStatus'])nodes.set(id,new Element());
 const c={Blob,Map,Set,Promise,console,performance,Date:class extends Date{static now(){return clock;}},setTimeout:(fn,ms)=>{const id=nextId++;timers.set(id,{fn,at:clock+ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>nextId++,clearInterval(){},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById:id=>nodes.get(id),createElement:()=>new Element(),createTextNode:text=>({textContent:text}),body:{append(){}},addEventListener:(event,fn)=>events.set(event,fn)},
 isBrowserModeActive:true,SolTTS:{roundActive:()=>false,pauseSpeech(){paused++;},resumeSpeech(){resumed++;},stop(){stopCount++;}},SolAndroid:{request:async(method,payload)=>{requests.push({method,payload});return {};}},showToast(){},showBlackScreen(){black++;},renderBrowserModeContent(){c.SolReading.render({korean:'본문 (설명 (중첩)) 다음 （해설） 끝 <img>',english:'English (note)'});},
 exitBrowserModeView(){c.isBrowserModeActive=false;c.SolReading.stop();c.SolTTS.stop();}};c.self=c;vm.createContext(c);vm.runInContext(source,c);
 return {c,nodes,storage,timers,requests,setClock:n=>clock=n,getClock:()=>clock,counts:()=>({stopCount,black,paused,resumed}),fireDue(){for(const [id,t]of [...timers])if(t.at<=clock){timers.delete(id);t.fn();}}};
}
const check=(v,n)=>{assert.ok(v,n);console.log('PASS '+n);};
(async()=>{
 const a=setup(new Map([['bmConfigNew',JSON.stringify({sleepTimer:9})]]));check(a.c.SolReading.prefs.autoStopMinutes===9,'legacy timer moves into reading settings');
 a.c.renderBrowserModeContent();const front=a.nodes.get('bmKor');check(front.children.map(n=>n.textContent).join('')==='본문 (설명 (중첩)) 다음 （해설） 끝 <img>'&&front.children.filter(n=>n.className).length===2,'balanced nested parentheses render safely without changing original text');
 a.c.SolReading.openSettings();for(const [id,value]of Object.entries({readingFrontSize:'44',readingBackSize:'28',readingParenthesesBreak:'yes',readingParenthesesPercent:'60',readingAutoStop:'3'}))a.nodes.get(id).value=value;
 await a.nodes.get('readingSettingsSave').onclick();const deadline=a.c.SolReading.expiresAt;
 check(front.style.fontSize==='44px'&&a.nodes.get('bmEng').style.fontSize==='28px'&&front.style['--bm-parentheses-size']==='60%'&&front.children.filter(n=>n.className).every(n=>n.className.includes('block')),'font sizes and parenthetical line breaks apply immediately');
 check(deadline===a.getClock()+180000&&a.requests.at(-1).method==='setExpiry','timer setting sends an absolute deadline to Android');
 a.setClock(a.getClock()+30000);a.c.SolReading.openSettings();a.nodes.get('readingFrontSize').value='46';await a.nodes.get('readingSettingsSave').onclick();check(a.c.SolReading.expiresAt===deadline,'font changes do not restart an existing timer');
 const b=setup(a.storage);check(b.c.SolReading.prefs.frontSize===46&&b.c.SolReading.prefs.parenthesesBreak===true&&b.c.SolReading.prefs.autoStopMinutes===3,'reading preferences survive reopening');
 await a.c.SolReading.pause();let released=false;const waiting=a.c.SolReading.wait(()=>true).then(()=>released=true);await Promise.resolve();check(a.c.SolReading.paused&&!released&&a.counts().paused===1,'pause holds the fallback reading loop');
 await a.c.SolReading.resume();await waiting;check(released&&a.counts().resumed===1&&!a.c.SolReading.paused&&a.c.SolReading.expiresAt===deadline,'resume releases the loop without resetting the deadline');
 await a.c.SolReading.pause();a.setClock(deadline);a.fireDue();check(!a.c.isBrowserModeActive&&a.counts().stopCount===1&&a.counts().black===1,'expiry stops speech and darkens the view even while paused');
 b.c.SolReading.restore({paused:true,expiresAt:b.getClock()+60000});check(b.c.SolReading.paused&&b.c.SolReading.expiresAt===b.getClock()+60000,'restoring Android playback restores pause and expiry');
 b.c.SolReading.openSettings();b.nodes.get('readingAutoStop').value='0';await b.nodes.get('readingSettingsSave').onclick();check(b.c.SolReading.expiresAt===0&&b.timers.size===0,'zero minutes cancels both UI and native expiry');
 console.log('All reading-mode tests passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
