importScripts('./vendor/lame.min.js','./vendor/fflate.js');
let zip,track,encoder,zipChunks,bytes=0;
let rate=0;
function output(buffer){if(buffer.length)track.push(new Uint8Array(buffer),false);}
function beginZip(){
 zipChunks=[];bytes=0;
 zip=new fflate.Zip((error,data,final)=>{
  if(error)throw error;
  bytes+=data.length;
  if(bytes>256*1024*1024)throw Error('ZIP이 256 MB를 넘었습니다. 목록을 나눠서 저장해 주세요.');
  zipChunks.push(data);
  if(final)postMessage({event:'zip',blob:new Blob(zipChunks,{type:'application/zip'})});
 });
}
function pcmWave(buffer){
 const d=new DataView(buffer);let at=12,rate,channels,bits,format,start,length;
 if(d.getUint32(0)!==0x52494646||d.getUint32(8)!==0x57415645)throw Error('WAV 형식이 아닙니다.');
 while(at+8<=d.byteLength){
  const tag=d.getUint32(at),size=d.getUint32(at+4,true),body=at+8;
  if(body+size>d.byteLength)throw Error('음성 데이터가 잘렸습니다.');
  if(tag===0x666d7420){format=d.getUint16(body,true);channels=d.getUint16(body+2,true);rate=d.getUint32(body+4,true);bits=d.getUint16(body+14,true);}
  if(tag===0x64617461){start=body;length=size;}
  at=body+size+(size%2);
 }
 if(format!==1||channels!==1||bits!==16||start===undefined)throw Error('지원하지 않는 음성 형식입니다.');
 const pcm=new Float32Array(length/2);
 for(let n=0;n<pcm.length;n++)pcm[n]=d.getInt16(start+n*2,true)/32768;
 return {pcm,rate};
}
async function encodeSegment(buffer,speed,repeats){
 const wave=pcmWave(buffer);
 if(!encoder){rate=wave.rate;encoder=new lamejs.Mp3Encoder(1,rate,128);}
 if(wave.rate!==rate)throw Error('음성 샘플레이트가 다릅니다.');
 const {SoundTouch,SimpleFilter}=await import('./vendor/soundtouch.js');
 for(let repeat=0;repeat<repeats;repeat++){
  const samples=wave.pcm,limit=Math.round(samples.length/speed);
  let filter;
  if(speed!==1){
   const sound=new SoundTouch();sound.tempo=speed;
   filter=new SimpleFilter({extract(out,count,position){
    const n=Math.max(0,Math.min(count,samples.length+16384-position));
    for(let k=0;k<n;k++){const value=samples[position+k]||0;out[k*2]=value;out[k*2+1]=value;}
    return n;
   }},sound);
  }
  const stereo=new Float32Array(2304),mono=new Int16Array(1152);
  for(let at=0;at<limit;){
   const wanted=Math.min(1152,limit-at);
   const n=filter?filter.extract(stereo,wanted):wanted;
   if(!n)throw Error('배속 음성 변환을 완료하지 못했습니다.');
   for(let i=0;i<n;i++){
    const sample=filter?stereo[i*2]:samples[at+i];
    mono[i]=Math.round(Math.max(-1,Math.min(1,sample))*32767);
   }
   output(encoder.encodeBuffer(mono.subarray(0,n)));at+=n;
  }
 }
}
let queue=Promise.resolve();
onmessage=({data:m})=>{
 queue=queue.then(async()=>{
  try{
   if(m.action==='init')beginZip();
   if(m.action==='track'){track=new fflate.ZipPassThrough(m.name);zip.add(track);encoder=null;}
   if(m.action==='segment')await encodeSegment(m.wav,m.speed,m.repeats);
   if(m.action==='endTrack'){if(!encoder)throw Error('이 항목에 읽을 내용이 없습니다.');output(encoder.flush());track.push(new Uint8Array(),true);encoder=null;track=null;}
   if(m.action==='finish'){zip.end();zipChunks=[];}
   postMessage({id:m.id,ok:true});
  }catch(error){postMessage({id:m.id,error:error.message||String(error)});}
 });
};
