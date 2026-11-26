/* The Android shell exposes this bridge only to packaged, trusted app assets. */
(function() {
    if (!self.AndroidHost) return;
    let serial = 0;
    const waiting = new Map();
    self.__solAndroidReply = function(id,result,error) {
        const pending = waiting.get(id); if (!pending) return;
        waiting.delete(id); error ? pending.reject(new Error(error)) : pending.resolve(result);
    };
    self.__solAndroidState = function(state) {
        document.dispatchEvent(new CustomEvent('sol-native-state',{detail:state}));
    };
    self.SolAndroid = {request(method,payload={}) {
        const id = ++serial;
        return new Promise((resolve,reject) => {
            waiting.set(id,{resolve,reject});
            try { AndroidHost.request(JSON.stringify({id,method,payload})); }
            catch(e) { waiting.delete(id); reject(e); }
        });
    }};
    let exportTail=Promise.resolve();
    function base64(blob){return new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);
        reader.onerror=()=>reject(reader.error||new Error('저장할 파일을 읽지 못했습니다.'));reader.readAsDataURL(blob);
    });}
    SolAndroid.saveBlob=function(blob,name){
        const job=exportTail.then(async()=>{
            const result=await SolAndroid.request('exportBegin',{name,mime:blob.type||'application/octet-stream'});
            if(result.cancelled)return false;
            try{
                for(let at=0;at<blob.size;at+=192*1024){
                    const data=await base64(blob.slice(at,at+192*1024));
                    await SolAndroid.request('exportChunk',{data});
                }
                await SolAndroid.request('exportFinish');return true;
            }catch(error){await SolAndroid.request('exportAbort').catch(()=>{});throw error;}
        });
        exportTail=job.catch(()=>{});return job;
    };
    SolAndroid.saveFiles=async function(files){
        for(const file of files)if(!await SolAndroid.saveBlob(file.blob,file.name))return false;
        return true;
    };
    document.addEventListener('DOMContentLoaded',()=>{
        const version=document.querySelector('.version-badge');
        if(version)version.textContent='솔메이트 앱 v1.2.1';
        const option=document.querySelector('#setTtsProvider option[value="auto"]');
        if(option)option.textContent='자동 · Android 네이티브';
    });
    document.addEventListener('click',async event => {
        const anchor = event.target.closest('a[download]'); if (!anchor) return;
        const href = anchor.href;
        if (!href.startsWith('blob:') && !href.startsWith('data:')) return;
        event.preventDefault();
        try {
            const blob = await (await fetch(href)).blob();
            await SolAndroid.saveBlob(blob,anchor.download||'solmate-backup.json');
        } catch(e) { if (self.showToast) showToast(e.message); }
    },true);
})();


