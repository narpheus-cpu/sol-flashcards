/* The browser owns installation; no executable or separate app package is used. */
(function(){
 'use strict';
 const panel=document.getElementById('pwaInstallPanel'),button=document.getElementById('installSolmate'),hint=document.getElementById('pwaInstallHint');
 if(!panel||!button)return;
 if(self.AndroidHost){panel.hidden=true;return;}
 let installPrompt=null,installed=false;
 const standalone=window.matchMedia('(display-mode: standalone)');
 const help=document.createElement('dialog');help.id='pwaInstallHelp';help.setAttribute('aria-labelledby','pwaInstallHelpTitle');
 help.innerHTML='<img src="./icons/icon-192.png" alt=""><h2 id="pwaInstallHelpTitle">솔메이트를 앱으로 설치</h2>'+
  '<p>작업표시줄 아이콘에서 솔메이트 전용 창으로 실행할 수 있어요.</p>'+
  '<ol><li>Edge 주소창 오른쪽의 <strong>앱 설치</strong> 아이콘을 누르세요.</li>'+
  '<li>아이콘이 없으면 <strong>⋯ 메뉴의 앱</strong>에서 이 사이트를 설치하세요.</li>'+
  '<li>설치가 끝나면 <strong>작업 표시줄에 고정</strong>을 선택하세요.</li></ol>'+
  '<button type="button" class="btn-primary" id="pwaInstallHelpClose">확인</button>';
 document.body.append(help);document.getElementById('pwaInstallHelpClose').onclick=()=>help.close();
 function update(){panel.hidden=installed||standalone.matches||navigator.standalone===true;button.disabled=false;}
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;update();});
 window.addEventListener('appinstalled',()=>{installed=true;installPrompt=null;update();});
 if(standalone.addEventListener)standalone.addEventListener('change',update);
 button.onclick=async()=>{
  if(!installPrompt){help.showModal();return;}
  const event=installPrompt;installPrompt=null;button.disabled=true;
  try{
   await event.prompt();
   const result=await event.userChoice;
   hint.textContent=result.outcome==='accepted'?'Edge에서 설치를 마무리하면 작업표시줄에 고정할 수 있어요.':'다시 설치하려면 이 버튼이나 Edge의 앱 메뉴를 이용하세요.';
  }catch{help.showModal();}
  finally{update();}
 };
 update();
})();
