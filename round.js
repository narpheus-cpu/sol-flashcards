/* A continuous media item avoids JS timers between sentences on a locked screen. */
(function() {
    const originalStop = SolTTS.stop, originalSpeak = SolTTS.speak;
    let session = null, token = 0;
    function position(index) { document.dispatchEvent(new CustomEvent('sol-round-position',{detail:{index}})); }
    function pauseEvent(){if('mediaSession' in navigator)navigator.mediaSession.playbackState=session?.paused?'paused':'playing';document.dispatchEvent(new CustomEvent('sol-round-pause',{detail:{paused:!!session?.paused}}));}
    SolTTS.roundPause=async function(){if(!session)return;session.paused=true;if(self.SolAndroid)await SolAndroid.request('pause');else session.audio?.pause();pauseEvent();};
    SolTTS.roundResume=async function(){if(!session)return;session.paused=false;if(self.SolAndroid)await SolAndroid.request('resume');else if(session.audio)await session.audio.play();pauseEvent();};
    function stopRound() {
        token++;
        if (session) {
            const old = session; session = null;
            if (old.audio) { old.audio.pause(); old.audio.removeAttribute('src'); old.audio.load(); }
            if (old.url) URL.revokeObjectURL(old.url);
            if (old.resolve) old.resolve();
        }
    }
    SolTTS.stop = function() { stopRound(); originalStop(); };
    SolTTS.speak = function(...args) { stopRound(); return originalSpeak(...args); };
    SolTTS.canRound = () => !!self.SolAndroid || (SolTTS.config.engine === 'supertonic' && bmConfig.speedFront === bmConfig.speedBack);
    SolTTS.roundActive = () => !!session;
    SolTTS.roundMove = function(delta) {
        if (!session) return;
        if (self.SolAndroid) { SolAndroid.request('move',{delta}).catch(e => showToast(e.message)); return; }
        if (!session.audio || !session.offsets) return;
        const next = Math.max(0,Math.min(session.cards.length-1,session.index+delta));
        session.audio.currentTime = session.offsets[next]; session.index = next; position(next);
    };
    SolTTS.playRound = async function(cards,index,settings) {
        SolTTS.stop();
        settings=SolSpeech.normalize(settings);
        const currentToken = token;
        const job = {cards,index,settings:{...settings},config:SolTTS.config,expiresAt:self.SolReading?.expiresAt||0,sessionId:Date.now()+'-'+Math.random()};
        if (self.SolAndroid) {
            return new Promise((resolve,reject) => {
                session = {...job,resolve,reject};
                SolAndroid.request('startQueue',job).catch(e => { stopRound(); reject(e); });
            });
        }
        session = {...job};
        const pieces = [], offsets = [], sampleRate = 44100;
        let bytes = 0;
        const gap = ms => { const count = Math.floor(sampleRate * ms/1000)*2; pieces.push(new Uint8Array(count)); bytes += count; };
        for (let i=0;i<cards.length;i++) {
            if (currentToken !== token) return;
            offsets[i] = bytes/(sampleRate*2);
            const card = cards[i];
            const front = [SolSpeech.text(card.korean,'Front',settings),'ko',settings.repeatFront,SolSpeech.voice('Front',settings,job.config.voice)];
            const back = [SolSpeech.text(card.english,'Back',settings),'en',settings.repeatBack,SolSpeech.voice('Back',settings,job.config.voice)];
            const sides = settings.order === 'ENG_KOR' ? [back,front] : [front,back];
            for (let side=0;side<sides.length;side++) {
                const [text,lang,repeats,voice] = sides[side];
                for (let r=0;r<repeats && text.trim();r++) {
                    const blob = await SolTTS.prepareAudio(text,lang,'foreground',{voice});
                    if (currentToken !== token) return;
                    const head = new DataView(await blob.slice(0,44).arrayBuffer());
                    if (head.getUint32(24,true)!==sampleRate) throw new Error('음성 파일의 샘플 속도가 다릅니다.');
                    pieces.push(blob.slice(44)); bytes += blob.size-44;
                    if (r<repeats-1) gap(800*settings.speedFront);
                }
                if (side===0 && sides.every(p=>p[2]>0)) gap(400*settings.speedFront);
            }
            gap(Number(settings.interval)*settings.speedFront);
            if (bytes>128*1024*1024) { stopRound(); throw new Error('화면 꺼짐용 음성이 너무 큽니다. 라운드 문장 수를 줄여주세요.'); }
            document.getElementById('bmStatus').textContent='화면 꺼짐용 음성 준비 '+(i+1)+' / '+cards.length;
        }
        if (currentToken!==token) return;
        const header = new ArrayBuffer(44), v = new DataView(header);
        const str=(offset,s)=>Array.from(s).forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
        str(0,'RIFF');v.setUint32(4,36+bytes,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);
        v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);
        v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,bytes,true);
        const url=URL.createObjectURL(new Blob([header,...pieces],{type:'audio/wav'}));
        const audio=new Audio(url);audio.preload='auto';audio.preservesPitch=true;audio.playbackRate=settings.speedFront;
        audio.addEventListener('loadedmetadata',()=>{audio.currentTime=offsets[index];},{once:true});
        session={...job,audio,url,offsets,paused:!!session?.paused};position(index);
        audio.ontimeupdate=()=>{
            if (!session || session.audio!==audio) return;
            let next=index;for(let i=index;i<cards.length;i++){if(offsets[i]<=audio.currentTime)next=i;else break;}
            if(session.index!==next){session.index=next;position(next);}
        };
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata=new MediaMetadata({title:'솔메이트',artist:'자동 읽기',album:'현재 라운드'});
            for(const [action,fn]of Object.entries({play:()=>SolTTS.roundResume(),pause:()=>SolTTS.roundPause(),previoustrack:()=>SolTTS.roundMove(-1),nexttrack:()=>SolTTS.roundMove(1),stop:()=>SolTTS.stop()})) {
                try { navigator.mediaSession.setActionHandler(action,fn); } catch(_) {}
            }
            navigator.mediaSession.playbackState='playing';
        }
        await new Promise((resolve,reject)=>{
            session.resolve=resolve;session.reject=reject;
            audio.onended=()=>{stopRound();resolve();};
            audio.onerror=()=>{stopRound();reject(new Error('백그라운드 음성을 재생하지 못했습니다.'));};
            if(!session.paused)audio.play().catch(e=>{stopRound();reject(new Error('재생 버튼을 다시 눌러 음성을 허용하세요.'));});
        });
    };
    document.addEventListener('sol-native-state',event=>{
        const state=event.detail;
        if(state.message){const el=document.getElementById('ttsStatus');if(el)el.textContent=state.message;}
        if(!session || state.sessionId!==session.sessionId)return;
        session.paused=!!state.paused;pauseEvent();
        if(Number.isInteger(state.index)){session.index=state.index;position(state.index);}
        if(state.error){const reject=session.reject;stopRound();if(reject)reject(new Error(state.error));}
        else if(state.active===false){stopRound();}
    });
    SolTTS.restoreRound = state => new Promise((resolve,reject) => {session={...state,resolve,reject};});
})();

