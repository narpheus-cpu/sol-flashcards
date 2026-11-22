(function(){
'use strict';
const languageCodes=['en','ko','ja','ar','bg','cs','da','de','el','es','et','fi','fr','hi','hr','hu','id','it','lt','lv','nl','pl','pt','ro','ru','sk','sl','sv','tr','uk','vi'];
const languageNames=new Intl.DisplayNames(['ko'],{type:'language'});
const voices=['M','F'].flatMap(sex=>[1,2,3,4,5].map(n=>'<option value="'+sex+n+'">'+(sex==='M'?'남성':'여성')+' '+n+'</option>')).join('');
const langs='<option value="auto">자동</option>'+languageCodes.map(lang=>'<option value="'+lang+'">'+languageNames.of(lang)+'</option>').join('');
const dialog=document.createElement('dialog');
dialog.id='mp3ExportDialog';
dialog.setAttribute('aria-labelledby','mp3ExportTitle');
dialog.innerHTML='<header><strong id="mp3ExportTitle"></strong><button type="button" id="mp3ExportClose">닫기</button></header>'+
 '<fieldset class="mp3-column"><legend>다운로드 대상</legend>'+
 '<label for="mp3SelectionMode">범위</label><select id="mp3SelectionMode"><option value="all">목록 전체</option><option value="serials">일련번호 선택</option></select>'+
 '<div id="mp3SelectionGroup" hidden><label for="mp3SerialInput">일련번호 또는 구간</label>'+
 '<input id="mp3SerialInput" type="text" placeholder="0003~0100 또는 0003, 0005, 0010" autocomplete="off" aria-describedby="mp3SerialHelp">'+
 '<p id="mp3SerialHelp">구간과 개별 번호를 함께 입력할 수 있습니다. 예: 0003~0010, 0015, 0020</p></div></fieldset>'+
 '<p>입력순으로 항목마다 하나의 MP3를 만듭니다. 1열 다음 2열 순서로 읽으며 반복 0회는 제외합니다.</p>'+
 [1,2].map(n=>'<fieldset class="mp3-column"><legend>'+n+'열</legend><div class="mp3-options">'+
 '<label>Supertonic 목소리<select id="mp3Voice'+n+'">'+voices+'</select></label>'+
 '<label>언어<select id="mp3Lang'+n+'">'+langs+'</select></label>'+
 '<label>속도 <output id="mp3RateLabel'+n+'">1.00배</output><input id="mp3Rate'+n+'" type="range" min="0.6" max="1.4" step="0.05" value="1"></label>'+
 '<label>괄호 안 내용<select id="mp3Parentheses'+n+'"><option value="include">읽기</option><option value="omit">읽지 않기</option></select></label>'+
 '<label>반복횟수<input id="mp3Repeat'+n+'" type="number" min="0" max="20" step="1" value="1"></label></div></fieldset>').join('')+
 '<progress id="mp3ExportProgress" max="100" value="0"></progress><output id="mp3ExportPercent">0%</output>'+
 '<div id="mp3ExportStatus" role="status" aria-live="polite"></div>'+
 '<div class="mp3-actions"><button id="mp3ExportStart" class="btn-primary">MP3 ZIP 만들기</button><button id="mp3ExportCancel" class="btn-outline" disabled>취소</button></div>'+
 '<button type="button" id="mp3ExportShowDownload" class="btn-primary" hidden>완성된 ZIP 다운로드</button>';
document.body.append(dialog);
const downloadDialog=document.createElement('dialog');
downloadDialog.id='mp3DownloadDialog';
downloadDialog.setAttribute('aria-labelledby','mp3DownloadTitle');
downloadDialog.setAttribute('aria-describedby','mp3DownloadSummary');
downloadDialog.innerHTML='<header><h2 id="mp3DownloadTitle">MP3 생성 완료</h2><button type="button" id="mp3DownloadClose">닫기</button></header>'+
 '<p id="mp3DownloadSummary"></p><a id="mp3ExportDownload" class="btn-primary" hidden download autofocus>ZIP 다운로드</a>'+
 '<p class="mp3-download-help">버튼을 눌러 저장하세요. 이 창을 닫아도 설정 창에서 다시 다운로드할 수 있습니다.</p>';
document.body.append(downloadDialog);
const el=id=>document.getElementById(id);
let running=null,downloadUrl,slotId,title;
let saved;
try{saved=JSON.parse(localStorage.getItem('solMp3OptionsV1'));}catch{}
for(let col=1;col<=2;col++){
 for(const field of ['Voice','Lang','Rate','Repeat','Parentheses']){
  const input=el('mp3'+field+col);
  if(saved?.[col]?.[field]!==undefined)input.value=String(saved[col][field]);
  input.addEventListener('input',()=>{
   el('mp3RateLabel'+col).value=Number(el('mp3Rate'+col).value).toFixed(2)+'배';
   try{localStorage.setItem('solMp3OptionsV1',JSON.stringify(readOptions()));}
   catch{el('mp3ExportStatus').textContent='옵션을 저장하지 못했습니다.';}
  });
 }
 el('mp3RateLabel'+col).value=Number(el('mp3Rate'+col).value).toFixed(2)+'배';
}
el('mp3SelectionMode').onchange=()=>{
 el('mp3SelectionGroup').hidden=el('mp3SelectionMode').value!=='serials';
};
function selectedSerials(text,total){
 const source=text.normalize('NFKC').trim().replace(/^\((.*)\)$/,'$1').trim();
 if(!source)throw Error('다운로드할 일련번호나 구간을 입력해 주세요.');
 const result=new Set();
 for(const token of source.split(',')){
  const match=token.trim().match(/^(\d+)(?:\s*[~〜\-–—]\s*(\d+))?$/);
  if(!match)throw Error('번호 형식을 확인해 주세요. 예: 0003~0100, 0105');
  const first=Number(match[1]),last=Number(match[2]||match[1]);
  if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||first<1||last>total)
   throw Error('일련번호는 0001~'+String(total).padStart(4,'0')+' 범위로 입력해 주세요.');
  if(first>last)throw Error('구간의 시작 번호는 끝 번호보다 작거나 같아야 합니다.');
  for(let serial=first;serial<=last;serial++)result.add(serial);
 }
 return result;
}
function speechText(text,parentheses){
 const source=String(text||'').trim();
 if(parentheses!=='omit')return source;
 // Remove balanced annotations, including nested and full-width parentheses.
 // Unmatched parentheses stay in the sentence instead of truncating its tail.
 let result=source,previous;
 do{
  previous=result;
  result=result.replace(/\([^()]*\)|（[^（）]*）/g,' ');
 }while(result!==previous);
 return result.replace(/\s+/g,' ').replace(/\s+([,.;:!?。，、！？；：])/g,'$1').trim();
}
function readOptions(){
 const values={};
 for(let col=1;col<=2;col++){
  const option={};
  for(const field of ['Voice','Lang','Rate','Repeat','Parentheses'])option[field]=el('mp3'+field+col).value;
  const repeat=Number(option.Repeat),rate=Number(option.Rate);
  if(!Number.isInteger(repeat)||repeat<0||repeat>20||!Number.isFinite(rate)||rate<.6||rate>1.4)throw Error('속도는 0.6~1.4배, 반복은 0~20회로 선택해 주세요.');
  if(!/^[MF][1-5]$/.test(option.Voice)||!(option.Lang==='auto'||languageCodes.includes(option.Lang)))throw Error('목소리와 언어를 확인해 주세요.');
  if(!['include','omit'].includes(option.Parentheses))throw Error('괄호 안 내용의 읽기 여부를 선택해 주세요.');
  values[col]=option;
 }
 return values;
}
async function autoLanguage(text){
 if(/[가-힣ᄀ-ᇿ]/u.test(text))return 'ko';
 if(/[ぁ-ヿ]/u.test(text))return 'ja';
 if(/[؀-ۿ]/u.test(text))return 'ar';
 if(/[ऀ-ॿ]/u.test(text))return 'hi';
 if(/[α-ωΑ-Ω]/u.test(text))return 'el';
 if(/[а-яА-Я]/u.test(text))return /[іїєґІЇЄҐ]/u.test(text)?'uk':'ru';
 if(/[一-鿿]/u.test(text))return 'ko';
 const {franc}=await import('./vendor/franc.mjs');
 const iso={eng:'en',bul:'bg',ces:'cs',dan:'da',deu:'de',spa:'es',est:'et',fin:'fi',fra:'fr',hrv:'hr',hun:'hu',ind:'id',ita:'it',lit:'lt',lav:'lv',nld:'nl',pol:'pl',por:'pt',ron:'ro',slk:'sk',slv:'sl',swe:'sv',tur:'tr',vie:'vi'};
 return iso[franc(text,{only:Object.keys(iso),minLength:10})]||'en';
}
function filename(index,text){
 const label=String(text).normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g,'_').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'');
 return String(index).padStart(4,'0')+'_'+(Array.from(label).slice(0,60).join('')||'빈 항목')+'.mp3';
}
function progress(value,message){
 el('mp3ExportProgress').value=value;el('mp3ExportPercent').value=value+'%';el('mp3ExportStatus').textContent=message;
}
function busy(active){
 dialog.querySelectorAll('fieldset input,fieldset select').forEach(e=>e.disabled=active);
 el('mp3ExportStart').disabled=active;el('mp3ExportCancel').disabled=!active;
}
function rpc(run,action,data={},transfer=[]){
 if(run.error)return Promise.reject(run.error);
 return new Promise((resolve,reject)=>{
  const id=++run.serial;
  run.pending.set(id,{resolve,reject});
  run.worker.postMessage({id,action,...data},transfer);
 });
}
function release(run){
 run.worker?.terminate();
 for(const p of run.pending.values())p.reject(new DOMException('취소됨','AbortError'));
 run.pending.clear();
 if(running===run){running=null;busy(false);}
 run.wake?.release().catch(()=>{});
}
function cancel(){
 const run=running;if(!run)return;
 release(run);progress(0,'취소했습니다.');
}
function resetDownload(){
 if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null;}
 const link=el('mp3ExportDownload');
 link.hidden=true;link.removeAttribute('href');
 el('mp3ExportShowDownload').hidden=true;
}
el('mp3DownloadClose').onclick=()=>downloadDialog.close();
el('mp3ExportShowDownload').onclick=()=>{if(downloadUrl)downloadDialog.showModal();};
el('openMp3Export').onclick=()=>{
 if(running)return;
 slotId=currentSlotId;title=slotNames[slotId-1]||'목록';
 el('mp3ExportTitle').textContent=title+' · MP3 ZIP';
 resetDownload();progress(0,'열별 옵션을 선택하세요.');dialog.showModal();
};
el('mp3ExportClose').onclick=()=>{cancel();dialog.close();};
el('mp3ExportCancel').onclick=cancel;
dialog.addEventListener('cancel',()=>cancel());
el('mp3ExportStart').onclick=async()=>{
 if(running)return;
 let run;
 try{
  resetDownload();
  const options=readOptions();
  const selectionMode=el('mp3SelectionMode').value;
  const selectionText=el('mp3SerialInput').value;
  if(!Object.values(options).some(o=>Number(o.Repeat)>0))throw Error('한 열 이상 반복횟수를 1회 이상으로 선택해 주세요.');
  run={serial:0,pending:new Map(),worker:null};
  running=run;busy(true);progress(0,'목록을 확인하는 중…');
  const words=inputOrderedWords(await getWordsBySlot(slotId));
  if(running!==run)return;
  const selected=selectionMode==='serials'?selectedSerials(selectionText,words.length):null;
  const jobs=words.map((word,i)=>({serial:i+1,name:filename(i+1,word.korean||''),segments:[1,2].map(col=>({
   text:speechText(word[col===1?'korean':'english'],options[col].Parentheses),...options[col]
  })).filter(s=>s.text&&Number(s.Repeat)>0)})).filter(job=>(!selected||selected.has(job.serial))&&job.segments.length);
  if(!jobs.length)throw Error('선택한 열에 읽을 내용이 없습니다.');
  if(!await SolTTS.installed())throw Error('설정에서 오프라인 음성 파일을 먼저 다운로드해 주세요.');
  if(running!==run)return;
  SolTTS.stop();
  el('mp3ExportDownload').hidden=true;
  progress(0,'합성을 준비하는 중…');
  run.worker=new Worker('./mp3-worker.js?v=2');
  run.worker.onmessage=({data})=>{
   if(data.event==='zip'){run.blob=data.blob;return;}
   const p=run.pending.get(data.id);if(!p)return;
   run.pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve();
  };
  run.worker.onerror=()=>{
   run.error=Error('MP3 인코더를 실행하지 못했습니다. 새로고침 후 다시 시도해 주세요.');
   for(const p of run.pending.values())p.reject(Error('MP3 인코더를 실행하지 못했습니다. 새로고침 후 다시 시도해 주세요.'));
   run.pending.clear();
  };
  try{run.wake=await navigator.wakeLock?.request('screen');}catch{}
  const total=jobs.reduce((n,j)=>n+j.segments.reduce((sum,s)=>sum+s.text.length*Number(s.Repeat),0),0);
  let done=0,completed=0;
  await rpc(run,'init');
  for(const job of jobs){
   if(running!==run)return;
   await rpc(run,'track',{name:job.name});
   for(const s of job.segments){
    progress(Math.floor(95*done/total),completed+'/'+jobs.length+'개 완료 · '+job.name+' 합성 중');
    const blob=await SolTTS.prepareAudio(s.text,s.Lang==='auto'?await autoLanguage(s.text):s.Lang,'foreground',{voice:s.Voice,steps:8});
    if(running!==run)return;
    const wav=await blob.arrayBuffer();
    await rpc(run,'segment',{wav,speed:Number(s.Rate),repeats:Number(s.Repeat)},[wav]);
    done+=s.text.length*Number(s.Repeat);
    progress(Math.floor(95*done/total),completed+'/'+jobs.length+'개 완료 · MP3 변환 중');
   }
   await rpc(run,'endTrack');completed++;
  }
  progress(96,completed+'/'+jobs.length+'개 완료 · ZIP 마무리 중');
  await rpc(run,'finish');
  if(running!==run)return;
  if(!run.blob?.size)throw Error('ZIP 파일을 완성하지 못했습니다.');
  if(downloadUrl)URL.revokeObjectURL(downloadUrl);
  downloadUrl=URL.createObjectURL(run.blob);
  const link=el('mp3ExportDownload');link.href=downloadUrl;
  link.download=filename(0,title).replace(/^0000_/,'').replace(/\.mp3$/,'.zip');
  link.hidden=false;link.textContent='ZIP 다운로드 ('+jobs.length+'개 MP3)';
  progress(100,jobs.length+'개 MP3와 ZIP 생성 완료');
  el('mp3DownloadSummary').textContent=title+' · '+jobs.length+'개 MP3를 ZIP 파일로 묶었습니다.';
  el('mp3ExportShowDownload').hidden=false;
  downloadDialog.showModal();
 }catch(error){
  if(!run||running===run){progress(Math.min(99,Number(el('mp3ExportProgress').value)||0),'실패 · '+error.message);}
 }finally{if(run)release(run);}
};
})();
