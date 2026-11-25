/* PC-only GitHub-backed shared study files. Slot progress and credentials are never committed by this module. */
(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    if(root.document)api.install(root);
})(typeof globalThis==='object'?globalThis:this,function(){
    'use strict';
    const REPO='narpheus-cpu/sol-flashcards',BRANCH='main',MANIFEST='default-files.json';
    const API='https://api.github.com/repos/'+REPO,MAX_BYTES=20*1024*1024;
    const SEEDS=[['seed-battery','배터리가 없어'],['seed-challenge','암기챌린지'],['seed-canenglish','캔잉글리시'],['seed-radio','10년의 영어방송 회화표현 9400'],['seed-synopsis','영화 시놉시스']].map(([id,name])=>({id,name,fileName:name+'.txt',path:name+'.txt'}));
    const seedPaths=new Set(SEEDS.map(f=>f.path));
    const extension=name=>String(name).split('.').pop().toLowerCase();
    const supported=name=>['txt','csv','tsv','xls','xlsx'].includes(extension(name));
    function validPath(path){
        return typeof path==='string'&&!/[\\\u0000-\u001f]/.test(path)&&path.split('/').every(p=>p&&p!=='.'&&p!=='..')&&supported(path)&&(seedPaths.has(path)||path.startsWith('default-files/'));
    }
    function catalog(value){
        if(!value||value.version!==1||!Array.isArray(value.files))throw new Error('기본 파일 목록 형식이 올바르지 않습니다.');
        const ids=new Set(),paths=new Set();
        const files=value.files.map(f=>{
            if(!f||typeof f.id!=='string'||!f.id||typeof f.name!=='string'||!f.name.trim()||!validPath(f.path)||ids.has(f.id)||paths.has(f.path))throw new Error('기본 파일 목록에 올바르지 않은 항목이 있습니다.');
            ids.add(f.id);paths.add(f.path);
            return {id:f.id,name:f.name.trim().slice(0,300),fileName:String(f.fileName||f.path.split('/').pop()),path:f.path,...(f.size>=0?{size:Number(f.size)}:{}),...(f.addedAt?{addedAt:String(f.addedAt)}:{})};
        });return {version:1,files};
    }
    function base64(bytes){
        let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);
    }
    function unbase64(text){const s=atob(String(text).replace(/\s/g,''));return Uint8Array.from(s,c=>c.charCodeAt(0));}
    function rawURL(file,ref=BRANCH){return 'https://raw.githubusercontent.com/'+REPO+'/'+encodeURIComponent(ref)+'/'+file.path.split('/').map(encodeURIComponent).join('/');}
    function safeName(name){
        const clean=String(name||'').normalize('NFC').replace(/[\\/\u0000-\u001f]/g,'_').trim();
        if(!clean||clean.length>240||!supported(clean))throw new Error('TXT·CSV·TSV·XLS·XLSX 파일을 선택해 주세요.');
        return clean;
    }
    function errorMessage(status){
        if(status===401)return 'GitHub 인증 정보가 올바르지 않거나 만료됐습니다. 다시 연결해 주세요.';
        if(status===403||status===429)return 'GitHub 쓰기 권한 또는 요청 한도를 확인해 주세요. 이 저장소의 Contents 읽기·쓰기 권한이 필요합니다.';
        if(status===409||status===422)return '다른 변경 사항이 먼저 반영됐습니다. 목록을 새로 불러온 뒤 다시 시도해 주세요.';
        return 'GitHub 요청을 완료하지 못했습니다. ('+status+')';
    }
    function client(options={}){
        const fetcher=options.fetch||globalThis.fetch.bind(globalThis),token=options.getToken||(()=>''),timeout=options.timeout||30000;
        async function request(path,method='GET',body){
            const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
            const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
            if(token())headers.Authorization='Bearer '+token();
            if(body!==undefined)headers['Content-Type']='application/json';
            try{
                const response=await fetcher(API+(path?'/'+path:''),{method,headers,cache:'no-store',signal:controller.signal,...(body===undefined?{}:{body:JSON.stringify(body)})});
                if(!response.ok){const error=new Error(errorMessage(response.status));error.status=response.status;throw error;}
                return await response.json();
            }catch(error){if(error.name==='AbortError')throw new Error('GitHub 응답 시간이 길어졌습니다. 잠시 후 다시 시도해 주세요.');throw error;}
            finally{clearTimeout(timer);}
        }
        async function snapshot(){
            const ref=await request('git/ref/heads/'+encodeURIComponent(BRANCH));
            const head=ref.object.sha,commit=await request('git/commits/'+head),tree=await request('git/trees/'+commit.tree.sha+'?recursive=1');
            if(tree.truncated)throw new Error('파일 목록이 너무 큽니다. GitHub에서 목록을 확인해 주세요.');
            const manifest=tree.tree.find(t=>t.path===MANIFEST&&t.type==='blob');
            let data={version:1,files:SEEDS};
            if(manifest){const blob=await request('git/blobs/'+manifest.sha);data=JSON.parse(new TextDecoder().decode(unbase64(blob.content)));}
            const dataCatalog=catalog(data),byPath=new Map(tree.tree.filter(t=>t.type==='blob').map(t=>[t.path,t]));
            const files=dataCatalog.files.filter(f=>byPath.has(f.path)).map(f=>({...f,sha:byPath.get(f.path).sha,size:byPath.get(f.path).size??f.size}));
            return {head,tree:commit.tree.sha,catalog:dataCatalog,files,byPath};
        }
        async function verifyAccess(){
            if(!token())throw new Error('GitHub에 먼저 연결해 주세요.');
            const repo=await request('');
            if(repo.permissions&&repo.permissions.push===false)throw new Error('이 GitHub 계정에는 기본 파일을 추가·삭제할 권한이 없습니다.');
            return true;
        }
        async function transaction(change){
            if(!token())throw new Error('GitHub에 먼저 연결해 주세요.');
            for(let attempt=0;attempt<3;attempt++){
                const before=await snapshot(),patch=change(before);
                const tree=await request('git/trees','POST',{base_tree:before.tree,tree:[...patch.entries,{path:MANIFEST,mode:'100644',type:'blob',content:JSON.stringify(patch.catalog,null,2)+'\n'}]});
                const commit=await request('git/commits','POST',{message:patch.message,tree:tree.sha,parents:[before.head]});
                try{await request('git/refs/heads/'+encodeURIComponent(BRANCH),'PATCH',{sha:commit.sha,force:false});}
                catch(error){
                    if((error.status===409||error.status===422)&&attempt<2)continue;
                    if(!error.status){
                        // A lost response must not cause a duplicate upload or an unsafe retry.
                        try{const latest=await request('git/ref/heads/'+encodeURIComponent(BRANCH));if(latest.object.sha===commit.sha)return {head:commit.sha,catalog:patch.catalog,files:patch.files,commitURL:'https://github.com/'+REPO+'/commit/'+commit.sha};}catch(_){}
                        throw new Error('Git 반영 완료 여부를 확인하지 못했습니다. 기본 파일 목록을 다시 열어 확인해 주세요.');
                    }
                    throw error;
                }
                return {head:commit.sha,catalog:patch.catalog,files:patch.files,commitURL:'https://github.com/'+REPO+'/commit/'+commit.sha};
            }
        }
        async function upload(file,name){
            const fileName=safeName(file.name);
            if(!file.size||file.size>MAX_BYTES)throw new Error('0바이트보다 크고 20MB 이하인 파일을 선택해 주세요.');
            const title=String(name||fileName.replace(/\.[^.]+$/,'')).trim().slice(0,300);
            if(!title)throw new Error('기본 파일 이름을 입력해 주세요.');
            if(!token())throw new Error('GitHub에 먼저 연결해 주세요.');
            const bytes=new Uint8Array(await file.arrayBuffer());
            if(!bytes.byteLength||bytes.byteLength>MAX_BYTES)throw new Error('0바이트보다 크고 20MB 이하인 파일을 선택해 주세요.');
            const blob=await request('git/blobs','POST',{content:base64(bytes),encoding:'base64'});
            const id=globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
            const item={id,name:title,fileName,path:'default-files/'+id+'_'+fileName,size:bytes.byteLength,addedAt:new Date().toISOString()};
            return transaction(before=>{
                if(before.byPath.has(item.path))throw new Error('동일한 파일 경로가 있습니다. 다시 추가해 주세요.');
                const next=catalog({version:1,files:[...before.catalog.files,item]});
                return {catalog:next,files:[...before.files,{...item,sha:blob.sha}],entries:[{path:item.path,mode:'100644',type:'blob',sha:blob.sha}],message:'Add default study file: '+title};
            });
        }
        async function remove(selected){
            if(!selected.length)throw new Error('삭제할 기본 파일을 선택해 주세요.');
            const selectedById=new Map(selected.map(f=>[f.id,f]));
            return transaction(before=>{
                const items=before.catalog.files.filter(f=>selectedById.has(f.id));
                if(items.length!==selectedById.size)throw new Error('목록이 변경됐습니다. 다시 열어 삭제할 파일을 선택해 주세요.');
                const entries=[];
                for(const f of items){
                    const chosen=selectedById.get(f.id),actual=before.byPath.get(f.path);
                    if(f.path!==chosen.path||!validPath(f.path)||!chosen.sha||!actual||actual.sha!==chosen.sha)throw new Error('선택한 파일이 변경됐습니다. 다시 열어 내용을 확인한 뒤 삭제해 주세요.');
                    entries.push({path:f.path,mode:'100644',type:'blob',sha:null});
                }
                return {catalog:catalog({version:1,files:before.catalog.files.filter(f=>!selectedById.has(f.id))}),files:before.files.filter(f=>!selectedById.has(f.id)),entries,message:'Remove default study files: '+items.map(f=>f.name).join(', ')};
            });
        }
        async function download(file,head){
            if(!file||!validPath(file.path))throw new Error('기본 파일을 다시 선택해 주세요.');
            try{const response=await fetcher(rawURL(file,head||BRANCH),{cache:'no-store'});if(response.ok)return {buffer:await response.arrayBuffer(),fileName:file.fileName,title:file.name};}catch(_){}
            if(!file.sha)throw new Error('기본 파일을 내려받지 못했습니다. 인터넷 연결을 확인해 주세요.');
            const blob=await request('git/blobs/'+file.sha);
            return {buffer:unbase64(blob.content).buffer,fileName:file.fileName,title:file.name};
        }
        return {snapshot,verifyAccess,upload,remove,download};
    }

    function isPC(env){
        const nav=env.navigator||{},ua=nav.userAgent||'';
        return !env.AndroidHost&&!env.SolAndroid&&!nav.userAgentData?.mobile&&!/Android|iPhone|iPad|iPod/i.test(ua)&&!(nav.platform==='MacIntel'&&nav.maxTouchPoints>1);
    }
    function install(env){
        if(!isPC(env))return;
        function start(){
            const doc=env.document,select=doc.getElementById('presetUrlSelect'),add=doc.getElementById('addDefaultFile'),del=doc.getElementById('deleteDefaultFile');
            if(!select||!add||!del)return;
            doc.documentElement.classList.add('sol-pc-default-files');add.hidden=del.hidden=false;
            doc.getElementById('importLocalFile').textContent='파일 직접 불러오기';
            const status=doc.getElementById('defaultFilesStatus'),cacheKey='solmate-default-files-v1:'+REPO;
            let accessToken='',data={head:BRANCH,catalog:{version:1,files:SEEDS},files:SEEDS},lastFetch=0,pending=null,busy=false,revision=0;
            const git=client({fetch:env.fetch.bind(env),getToken:()=>accessToken});
            function message(text){status.textContent=text||'';status.hidden=!text;}
            function options(){
                const previous=select.selectedOptions?.[0]?.dataset.fileId;
                select.replaceChildren(new env.Option('기본 파일 선택...',''));
                data.files.forEach(f=>{const option=new env.Option(f.name,rawURL(f,data.head));option.dataset.fileId=f.id;select.append(option);if(f.id===previous)option.selected=true;});
            }
            function accept(next){revision++;data=next;options();try{env.localStorage.setItem(cacheKey,JSON.stringify({head:data.head,catalog:data.catalog,files:data.files}));}catch(_){}lastFetch=Date.now();}
            try{const saved=JSON.parse(env.localStorage.getItem(cacheKey)||'null');if(saved){const safe=catalog(saved.catalog),byId=new Map(safe.files.map(f=>[f.id,f]));data={head:/^[a-f0-9]{40}$/.test(saved.head)?saved.head:BRANCH,catalog:safe,files:(saved.files||[]).filter(f=>byId.has(f.id)&&byId.get(f.id).path===f.path).map(f=>({...byId.get(f.id),...(/^[a-f0-9]{40}$/.test(f.sha)?{sha:f.sha}:{})}))};}}catch(_){}
            options();
            async function refresh(force=false){
                if(pending)return pending;
                if(!force&&Date.now()-lastFetch<60000)return data;
                const requestedRevision=revision;
                pending=git.snapshot().then(next=>{if(revision===requestedRevision&&!busy){accept(next);message('');}return data;}).catch(error=>{if(revision!==requestedRevision||busy)return data;message('기본 파일 목록을 새로 불러오지 못했어요. 기존 목록을 표시합니다. '+error.message);throw error;}).finally(()=>{pending=null;});return pending;
            }
            function element(tag,attrs={},text){const e=doc.createElement(tag);Object.entries(attrs).forEach(([k,v])=>{if(k==='class')e.className=v;else e.setAttribute(k,v);});if(text!==undefined)e.textContent=text;return e;}
            function modal(title){
                const dialog=element('dialog',{class:'sol-default-dialog','aria-label':title});
                const heading=element('h2',{},title),body=element('div'),error=element('p',{class:'default-error',role:'status'}),actions=element('div',{class:'default-dialog-actions'});
                const close=element('button',{type:'button',class:'btn-outline'},'닫기');close.onclick=()=>dialog.close();actions.append(close);dialog.append(heading,body,error,actions);doc.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});
                return {dialog,body,error,actions,close};
            }
            function auth(box){
                const wrap=element('div',{class:'default-auth'});box.body.append(wrap);
                if(accessToken){
                    wrap.append(element('p',{class:'default-hint'},'현재 창에서 GitHub에 연결되어 있어요.'));
                    const reset=element('button',{type:'button',class:'btn-outline'},'GitHub 연결 변경');reset.onclick=()=>{accessToken='';wrap.remove();auth(box);};wrap.append(reset);return;
                }
                const label=element('label',{for:'defaultGithubToken'},'GitHub 연결'),input=element('input',{id:'defaultGithubToken',type:'password',autocomplete:'off',placeholder:'이 저장소에 쓸 수 있는 개인 액세스 토큰'});
                const hint=element('p',{class:'default-hint'},'GitHub에서 Only select repositories → sol-flashcards를 선택하고 Contents 권한을 Read and write로 지정하세요. 인증 정보는 이 페이지를 새로고침하거나 앱 창·탭을 닫으면 지워지고 파일·저장소에 저장되지 않습니다.');
                const help=element('a',{href:'https://github.com/settings/personal-access-tokens/new',target:'_blank',rel:'noopener noreferrer'},'GitHub에서 연결용 토큰 만들기');
                const connect=element('button',{type:'button',class:'btn-outline'},'GitHub 연결');
                connect.onclick=async()=>{
                    if(!input.value.trim()){box.error.textContent='GitHub 연결용 토큰을 입력해 주세요.';return;}
                    accessToken=input.value.trim();input.value='';connect.disabled=true;box.error.textContent='연결을 확인하고 있어요…';
                    try{await git.verifyAccess();box.error.textContent='';wrap.remove();auth(box);}
                    catch(error){accessToken='';box.error.textContent=error.message;connect.disabled=false;}
                };
                wrap.append(label,input,hint,help,connect);
            }
            async function uploadDialog(){
                if(busy)return;
                const box=modal('기본 파일 추가하기');
                box.body.append(element('p',{},'등록하면 공용 기본 파일 목록에서 선택해 내려받을 수 있어요.'));
                const file=element('input',{type:'file',accept:'.txt,.csv,.tsv,.xls,.xlsx','aria-label':'Git에 등록할 기본 파일'}),title=element('input',{type:'text',maxlength:'300','aria-label':'기본 파일 이름'});
                file.onchange=()=>{const selected=file.files?.[0];if(selected)title.value=selected.name.replace(/\.[^.]+$/,'');};
                box.body.append(file,element('label',{},'목록에 표시할 이름'),title,element('p',{class:'default-hint'},'TXT·CSV·TSV·XLS·XLSX · 최대 20MB'));
                auth(box);
                const submit=element('button',{type:'button',class:'btn-primary'},'기본 파일 추가');box.actions.append(submit);
                submit.onclick=async()=>{
                    if(!file.files?.[0]){box.error.textContent='추가할 파일을 선택해 주세요.';return;}
                    busy=true;submit.disabled=box.close.disabled=true;box.dialog.oncancel=event=>event.preventDefault();box.error.textContent='Git에 파일과 목록을 등록하고 있어요…';
                    try{const next=await git.upload(file.files[0],title.value);accept(next);box.dialog.close();message('기본 파일을 추가했어요. 위의 기본 파일 선택에서 내려받을 수 있어요.');}
                    catch(error){box.error.textContent=error.message;}
                    finally{busy=false;submit.disabled=box.close.disabled=false;box.dialog.oncancel=null;}
                };
                box.dialog.showModal();
            }
            async function deleteDialog(){
                if(busy)return;
                const box=modal('기본 파일 삭제하기');box.body.append(element('p',{},'Git에서 삭제할 기본 파일을 선택하세요. 이미 슬롯에 내려받은 학습 데이터는 유지됩니다.'));
                const rows=element('div');box.body.append(rows);auth(box);
                const submit=element('button',{type:'button',class:'btn-primary'},'선택한 기본 파일 삭제');submit.disabled=true;box.actions.append(submit);
                const chosen=new Map();
                submit.onclick=async()=>{
                    const selected=[...chosen.values()];if(!selected.length)return;
                    if(!env.confirm(selected.map(f=>f.name).join('\n')+'\n\n선택한 기본 파일 '+selected.length+'개를 Git에서 삭제할까요?'))return;
                    busy=true;submit.disabled=box.close.disabled=true;box.dialog.oncancel=event=>event.preventDefault();box.error.textContent='Git에서 파일과 목록을 삭제하고 있어요…';
                    try{const next=await git.remove(selected);accept(next);box.dialog.close();message('선택한 기본 파일을 삭제했어요. 슬롯의 학습 데이터는 그대로예요.');}
                    catch(error){box.error.textContent=error.message;}
                    finally{busy=false;submit.disabled=chosen.size===0;box.close.disabled=false;box.dialog.oncancel=null;}
                };
                box.dialog.showModal();rows.textContent='기본 파일 목록을 불러오고 있어요…';
                try{
                    const next=await refresh(true);rows.replaceChildren();
                    next.files.forEach((f,index)=>{
                        const row=element('div',{class:'default-file-row'}),check=element('input',{type:'checkbox',id:'default-delete-'+index}),label=element('label',{for:check.id},f.name);
                        label.append(element('small',{},f.fileName+(f.size?' · '+Math.ceil(f.size/1024).toLocaleString()+' KB':'')));
                        check.onchange=()=>{if(check.checked)chosen.set(f.id,f);else chosen.delete(f.id);submit.disabled=chosen.size===0;};row.append(check,label);rows.append(row);
                    });
                    if(!next.files.length)rows.textContent='등록된 기본 파일이 없어요.';
                }catch(error){rows.textContent='';box.error.textContent=error.message;}
            }
            add.onclick=uploadDialog;del.onclick=deleteDialog;
            select.addEventListener('focus',()=>refresh().catch(()=>{}));
            const view=doc.getElementById('viewWordManage');
            if(env.MutationObserver&&view)new env.MutationObserver(()=>{if(view.classList.contains('active'))refresh().catch(()=>{});}).observe(view,{attributes:true,attributeFilter:['class']});
            env.SolDefaultFiles={active:true,refresh,readSelected:async()=>{
                const id=select.selectedOptions?.[0]?.dataset.fileId,file=data.files.find(f=>f.id===id);
                return git.download(file,data.head);
            }};
        }
        if(env.document.readyState==='loading')env.document.addEventListener('DOMContentLoaded',start,{once:true});else start();
    }
    return {client,catalog,validPath,rawURL,safeName,isPC,MAX_BYTES,install};
});
