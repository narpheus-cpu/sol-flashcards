/* Shared export metadata. Source text stays independent of spoken text. */
(function(scope){
 'use strict';
 function utf16(text){
  const value=String(text??''),bytes=new Uint8Array(5+value.length*2);
  bytes[0]=1;bytes[1]=255;bytes[2]=254;
  for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);bytes[3+i*2]=c&255;bytes[4+i*2]=c>>>8;}
  return bytes;
 }
 function id3(title,serial){
  const frames=[['TIT2',title],['TPE1','솔메이트'],['TRCK',String(serial)]].map(([name,value])=>{
   const text=utf16(value),frame=new Uint8Array(10+text.length);
   for(let i=0;i<4;i++)frame[i]=name.charCodeAt(i);
   new DataView(frame.buffer).setUint32(4,text.length,false);frame.set(text,10);return frame;
  });
  const size=frames.reduce((n,f)=>n+f.length,0),tag=new Uint8Array(10+size);
  tag.set([73,68,51,3,0,0,(size>>>21)&127,(size>>>14)&127,(size>>>7)&127,size&127]);
  let at=10;for(const frame of frames){tag.set(frame,at);at+=frame.length;}return tag;
 }
 function label(value){return Array.from(String(value??'').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g,'_').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'')).slice(0,60).join('')||'빈 항목';}
 function workbook(rows,XLSX){
  if(!rows.length)throw Error('엑셀에 저장할 문장이 없습니다.');
  const data=[['일련번호','1열 문장','2열 문장'],...rows.map(row=>[String(row.serial).padStart(4,'0'),row.first,row.second])];
  if(data.some(row=>row.some(cell=>String(cell).length>32767)))throw Error('엑셀 한 셀의 최대 길이(32,767자)를 넘는 문장이 있습니다.');
  const sheet=XLSX.utils.aoa_to_sheet(data);
  sheet['!cols']=[{wch:12},{wch:70},{wch:70}];sheet['!autofilter']={ref:sheet['!ref']};
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'문장 목록');
  return {
   name:String(rows[0].serial).padStart(4,'0')+'_'+label(rows[0].first)+' 외 '+(rows.length-1)+'개 문장.xlsx',
   blob:new Blob([XLSX.write(book,{bookType:'xlsx',type:'array',compression:true})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
  };
 }
 function zipName(rows,slot){if(!rows.length)throw Error('다운로드할 문장이 없습니다.');return label(slot)+'_'+String(rows[0].serial).padStart(5,'0')+'-'+String(rows[rows.length-1].serial).padStart(5,'0')+'.ZIP';}
 scope.SolMp3Files={id3,workbook,zipName};
})(self);
