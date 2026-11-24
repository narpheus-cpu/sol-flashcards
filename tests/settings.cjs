const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=__dirname+'/../',html=fs.readFileSync(root+'index.html','utf8');
for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
const storage=new Map([['bmConfigNew',JSON.stringify({speed:1.3,order:'ENG_KOR',repeatFront:0,repeatBack:4,interval:5000,sleepTimer:9})]]);
function context(){
 const elements=new Map();
 for(const m of html.matchAll(/<([a-z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
  const e={value:m[0].match(/\bvalue="([^"]*)"/)?.[1]||'',style:{},classList:{add(){},remove(){}},handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}};
  if(m[1]==='select')e.value=html.slice(m.index+m[0].length).match(/<option value="([^"]*)"/)?.[1]||'';
  elements.set(m[2],e);
 }
 const sandbox={console,Intl,Map,Set,Blob,URL,TextEncoder,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,document:{hidden:false,getElementById:id=>elements.get(id),addEventListener(){},dispatchEvent(){},querySelectorAll:()=>[]},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},Audio:class{pause(){}},navigator:{},TTS_ASSETS:{version:'test'},performance,CustomEvent:class{},window:{},alert(message){throw Error(message)},showToast(){},SolTTS:{openSettings(){},saveSettings(){}}};
 sandbox.self=sandbox;sandbox.globalThis=sandbox;
 const c=vm.createContext(sandbox);vm.runInContext(fs.readFileSync(root+'speech-settings.js','utf8'),c);
 const start=html.indexOf('    let bmConfig = SolSpeech.load();'),end=html.indexOf('    async function enterBrowserModeView()',start);
 vm.runInContext(html.slice(start,end),c);
 return {c,e:elements,run:code=>vm.runInContext(code,c)};
}
const check=(value,message)=>{assert.ok(value,message);console.log('PASS '+message);};
const a=context();
check(a.run('bmConfig.speedFront===1.3&&bmConfig.speedBack===1.3&&bmConfig.repeatFront===0&&!("sleepTimer" in bmConfig)'),'legacy speeds persist and the old speech sleep timer is removed');
a.run('openBmSettings()');a.e.get('setBmSpeedFront').value='0.7';a.e.get('setBmSpeedBack').value='1.8';a.e.get('setBmVoiceFront').value='F1';a.e.get('setBmVoiceBack').value='M1';a.e.get('setBmParenthesesFront').value='omit';a.e.get('setBmParenthesesBack').value='include';a.run('saveBmSettings()');
const b=context();
check(b.run('bmConfig.speedFront===.7&&bmConfig.speedBack===1.8&&bmConfig.parenthesesFront==="omit"&&bmConfig.parenthesesBack==="include"'),'different side speeds and parenthesis preferences survive restart');
check(b.run('bmConfig.voiceFront==="F1"&&bmConfig.voiceBack==="M1"'),'front and back voice choices survive restart');
check(b.run('SolSpeech.voice("Front",bmConfig,"M1")==="F1"&&SolSpeech.voice("Back",bmConfig,"F1")==="M1"'),'side voices override the shared voice independently');
check(b.run('SolSpeech.voice("Front",SolSpeech.normalize({}),"F1")==="F1"'),'old settings keep the existing shared voice');
check(b.run('SolSpeech.text("Hello (translation (note)) （extra）.","Front",bmConfig)==="Hello."&&SolSpeech.text("Hello (note).","Back",bmConfig)==="Hello (note)."'),'side-specific annotation filtering handles nested and full-width parentheses');
for(const [id,value]of Object.entries({quizGroupFilter:'FAVORITE',quizSubCondition:'SERIAL',quizSerialStart:'37',quizCount:'26'})){b.e.get(id).value=value;b.e.get(id).handlers.input();}
const c=context();check(c.e.get('quizGroupFilter').value==='FAVORITE'&&c.e.get('quizSubCondition').value==='SERIAL'&&c.e.get('quizSerialStart').value==='37'&&c.e.get('quizCount').value==='26'&&c.e.get('serialInputGroup').style.display==='flex','all round setup fields persist immediately without starting a round');
for(let i=0;i<3;i++){const next=context();next.run('openBmSettings();closeBmSettings()');check(next.e.get('quizCount').value==='26'&&next.run('bmConfig.speedBack===1.8'),'opening and closing settings preserves last values '+(i+1));}
storage.set('solTTSv1',JSON.stringify({engine:'system',voice:'F1',steps:4,provider:'wasm'}));
c.c.SolAndroid={request:async method=>method==='installed'?{installed:false}:{}};vm.runInContext(fs.readFileSync(root+'tts.js','utf8'),c.c);
check(c.c.SolTTS.config.engine==='system'&&c.c.SolTTS.config.voice==='F1'&&c.c.SolTTS.config.steps===4,'saved TTS engine voice and quality are never forced to defaults');
const loadStart=html.indexOf('    window.onload = async () => {'),loadEnd=html.indexOf('\n</script>',loadStart);
c.c.initDB=async()=>{};c.c.SolAndroid.request=async()=>({active:true,cards:[{english:'hello'}],index:0,settings:{speedFront:2,speedBack:2}});c.c.renderBrowserModeContent=()=>{};c.c.SolTTS.restoreRound=()=>new Promise(()=>{});c.c.SolReading={restore(){}};
vm.runInContext(html.slice(loadStart,loadEnd),c.c);
(async()=>{
 await c.c.window.onload();check(c.run('bmConfig.speedFront===.7&&bmConfig.speedBack===1.8'),'restoring an older native playback session never overwrites latest preferences');
 const requests=[];c.c.SolAndroid.request=async(method,payload)=>{requests.push({method,payload});return {};};
 await c.c.SolTTS.speak('Hello','en-US',1.8,{voice:'F1'});
 check(requests.find(x=>x.method==='speak').payload.voice==='F1'&&requests.find(x=>x.method==='speak').payload.rate===1.8,'manual speech sends chosen voice and rate to Android');
 check(await c.c.SolTTS.audioKey('Hello','en',{voice:'M1',steps:8})!==await c.c.SolTTS.audioKey('Hello','en',{voice:'F1',steps:8}),'cached audio stays separate for different voices');
 vm.runInContext(fs.readFileSync(root+'round.js','utf8'),c.c);
 const pending=c.c.SolTTS.playRound([{korean:'안녕',english:'Hello'}],0,c.run('bmConfig'));
 const job=requests.find(x=>x.method==='startQueue').payload;
 check(job.settings.voiceFront==='F1'&&job.settings.voiceBack==='M1'&&job.config.voice==='F1','native queue receives independent side voices without changing shared preference');
 await c.c.SolTTS.roundPause();await c.c.SolTTS.roundResume();
 check(requests.some(x=>x.method==='pause')&&requests.some(x=>x.method==='resume')&&requests.filter(x=>x.method==='startQueue').length===1,'native pause and resume preserve the existing queue');
 c.c.SolTTS.stop();await pending;
 console.log('All settings regression checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
