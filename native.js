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
    document.addEventListener('DOMContentLoaded',()=>{
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
            const reader = new FileReader();
            reader.onload = () => SolAndroid.request('export',{name:anchor.download||'solmate-backup.json',data:String(reader.result).split(',')[1],mime:blob.type||'application/json'});
            reader.readAsDataURL(blob);
        } catch(e) { if (self.showToast) showToast(e.message); }
    },true);
})();
