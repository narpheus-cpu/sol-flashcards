const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let resolveAudio;const pendingAudio=new Promise(r=>resolveAudio=r),audios=[],events=[];
function wave(){const buffer=new ArrayBuffer(46);new DataView(buffer).setUint32(24,44100,true);return new Blob([buffer]);}
class Audio{constructor(){this.currentTime=0;this.paused=true;this.playCount=0;audios.push(this);}addEventListener(){}play(){this.playCount++;this.paused=false;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){}load(){}}
const context={Blob,URL,Audio,ArrayBuffer,DataView,Uint8Array,MediaMetadata:class{},navigator:{mediaSession:{setActionHandler(){}}},document:{getElementById:()=>({}),addEventListener(){},dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,value){this.type=type;Object.assign(this,value);}},bmConfig:{speedFront:1,speedBack:1},SolSpeech:{normalize:v=>v,text:v=>v||'',voice:()=> 'M1'},SolTTS:{stop(){},speak(){},config:{engine:'supertonic'},prepareAudio:()=>pendingAudio}};context.self=context;
vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/../round.js','utf8'),context);
(async()=>{
 const playing=context.SolTTS.playRound([{korean:'한글',english:'English'}],0,{speedFront:1,speedBack:1,repeatFront:1,repeatBack:1,interval:1000});
 await context.SolTTS.roundPause();resolveAudio(wave());
 for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));
 const audio=audios[0];assert.ok(audio);assert.equal(audio.playCount,0);assert.ok(audio.paused);
 console.log('PASS pausing during preparation prevents automatic audio playback');
 await context.SolTTS.roundResume();audio.currentTime=7.25;await context.SolTTS.roundPause();assert.equal(audio.currentTime,7.25);assert.ok(audio.paused);
 await context.SolTTS.roundResume();assert.equal(audio.currentTime,7.25);assert.equal(audios.length,1);assert.equal(context.navigator.mediaSession.playbackState,'playing');
 console.log('PASS pause and resume use the same audio object and preserve the exact playback position');
 context.SolTTS.stop();await playing;console.log('All prepared-round pause tests passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
