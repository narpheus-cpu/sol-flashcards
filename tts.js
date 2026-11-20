/* Local Supertonic 3: persistent WAV cache, prioritized worker, and look-ahead. */
(function() {
    'use strict';
    const A = self.TTS_ASSETS, settingsKey = 'solTTSv1';
    let config;
    try { config = JSON.parse(localStorage.getItem(settingsKey)) || {}; } catch (_) { config = {}; }
    config = Object.assign({engine:'supertonic', voice:'M1', steps:8, provider:'auto'}, config);
    if (config.defaultsRevision !== 2) {
        config.engine = 'supertonic'; config.voice = 'M1'; config.steps = 8; config.defaultsRevision = 2;
        localStorage.setItem(settingsKey, JSON.stringify(config));
    }
    let worker, nextId = 0, pending = new Map(), generating = new Map(), audio = new Audio();
    let playback = 0, finishAudio = null, cancelWaiting = null, prefetchVersion = 0, downloadAbort, preparing = false;
    let dbPromise, swPromise, backend = '', prepared = 0;
    const MAX_AUDIO_BYTES = 96 * 1024 * 1024;
    audio.preload = 'auto'; audio.preservesPitch = true;
    function status(message) {
        const el = document.getElementById('ttsStatus');
        if (el) el.textContent = message;
    }
    function timeout(promise, ms, message) {
        let timer;
        return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })])
            .finally(() => clearTimeout(timer));
    }
    function db() {
        if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open('SolSupertonicAudioV1', 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore('audio');
                request.result.createObjectStore('meta', {keyPath:'key'});
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        }).catch(error => { dbPromise = null; throw error; });
        return dbPromise;
    }
    async function readAudio(key) {
        try {
            const database = await db();
            return await new Promise((resolve, reject) => {
                const request = database.transaction('audio').objectStore('audio').get(key);
                request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
            });
        } catch (_) { return null; }
    }
    async function writeAudio(key, blob) {
        try {
            if (blob.size > MAX_AUDIO_BYTES) return;
            const database = await db();
            await new Promise((resolve, reject) => {
                const tx = database.transaction(['audio','meta'], 'readwrite');
                const audioStore = tx.objectStore('audio'), meta = tx.objectStore('meta');
                const request = meta.getAll();
                request.onsuccess = () => {
                    const entries = request.result.filter(e => e.key !== key).sort((a,b) => a.time - b.time);
                    let bytes = entries.reduce((n,e) => n + e.size, 0);
                    while (entries.length && bytes + blob.size > MAX_AUDIO_BYTES) {
                        const old = entries.shift(); bytes -= old.size; audioStore.delete(old.key); meta.delete(old.key);
                    }
                    audioStore.put(blob, key); meta.put({key, size:blob.size, time:Date.now()});
                };
                tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
            });
        } catch (_) { status('기기 저장 공간이 부족해 이번 음성은 임시로 재생합니다.'); }
    }
    async function audioKey(text, lang, opts = config) {
        // Speed is a playback property: changing speed never triggers another synthesis.
        const value = JSON.stringify([A.version, opts.voice, Number(opts.steps), lang, text.trim().replace(/\s+/g,' ')]);
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
        return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2,'0')).join('');
    }
    async function ensureSW() {
        if (self.SolAndroid) return;
        if (swPromise) return swPromise;
        swPromise = (async () => {
            if (!isSecureContext || !('serviceWorker' in navigator) || !self.caches) {
                throw new Error('HTTPS 주소의 일반 브라우저에서 열어주세요. 파일 직접 열기는 지원하지 않습니다.');
            }
            await navigator.serviceWorker.register('./sw.js');
            await timeout(navigator.serviceWorker.ready, 30000, '앱 저장에 실패했습니다. 인터넷 연결 후 다시 시도하세요.');
            if (!navigator.serviceWorker.controller) await timeout(new Promise(resolve => {
                navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true});
            }), 10000, '페이지를 새로고침한 뒤 다시 다운로드하세요.');
        })().catch(e => { swPromise = null; throw e; });
        return swPromise;
    }
    async function installed() {
        if (self.SolAndroid) return (await SolAndroid.request('installed')).installed;
        if (!self.caches) return false;
        const cache = await caches.open(A.cache);
        for (const entry of A.all) if (!(await cache.match(entry.url))) return false;
        return true;
    }
    function getWorker() {
        if (!worker) {
            worker = new Worker('./tts-worker.js');
            worker.onmessage = ({data}) => {
                const entry = pending.get(data.id); if (!entry) return;
                clearTimeout(entry.timer); pending.delete(data.id);
                if (data.error) entry.reject(new Error(data.error));
                else { backend = data.result.backend; entry.resolve(data.result); }
            };
            worker.onerror = () => resetWorker(new Error('음성 엔진을 실행하지 못했습니다. 다른 앱을 닫고 다시 시도하거나 호환 모드를 선택하세요.'));
        }
        return worker;
    }
    function resetWorker(error = new Error('cancelled')) {
        if (worker) worker.terminate(); worker = null; backend = '';
        for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); }
        pending.clear();
    }
    function rpc(job) {
        const id = ++nextId;
        const promise = new Promise((resolve,reject) => {
            const timer = setTimeout(() => resetWorker(new Error('음성 생성 시간이 초과됐습니다. 호환 모드 또는 저장된 음성을 사용하세요.')), 180000);
            pending.set(id,{resolve,reject,timer});
            getWorker().postMessage({...job,id});
        });
        return {promise,id};
    }
    async function generate(text, lang, priority = 'foreground') {
        const opts = {...config};
        const key = await audioKey(text, lang, opts);
        const cached = await readAudio(key);
        if (cached) {
            try {
                const database = await db();
                database.transaction('meta','readwrite').objectStore('meta').put({key,size:cached.size,time:Date.now()});
            } catch (_) {}
            return cached;
        }
        if (self.SolAndroid) {
            const result = await SolAndroid.request('generate', {text, lang, voice:opts.voice, steps:Number(opts.steps), key});
            const response = await fetch(result.url);
            if (!response.ok) throw new Error('저장된 음성을 읽지 못했습니다.');
            return response.blob();
        }
        if (generating.has(key)) {
            const same = generating.get(key);
            if (priority === 'foreground' && worker) worker.postMessage({type:'promote', id:same.id});
            return same.promise;
        }
        await ensureSW();
        if (!(await installed())) throw new Error('먼저 설정에서 오프라인 음성 파일을 다운로드하세요.');
        // Recheck after asynchronous setup: two callers can request the same key.
        if (generating.has(key)) return generating.get(key).promise;
        const request = rpc({type:'synthesize', text, lang, voice:opts.voice, steps:Number(opts.steps), provider:opts.provider, priority});
        const promise = request.promise.then(async result => {
            const blob = new Blob([result.wav], {type:'audio/wav'});
            await writeAudio(key,blob);
            return blob;
        }).finally(() => generating.delete(key));
        generating.set(key,{promise,id:request.id});
        return promise;
    }
    function stop() {
        playback++;
        if (cancelWaiting) { cancelWaiting(); cancelWaiting = null; }
        if ('speechSynthesis' in window) speechSynthesis.cancel();
        audio.pause();
        if (finishAudio) finishAudio();
        if (self.SolAndroid) SolAndroid.request('stop').catch(() => {});
    }
    function unlock() {
        // Reuse this exact audio element after the user's gesture (mobile autoplay).
        if (audio.paused) {
            const buffer = new ArrayBuffer(46), view = new DataView(buffer);
            const str = (offset,text) => Array.from(text).forEach((c,i) => view.setUint8(offset+i,c.charCodeAt(0)));
            str(0,'RIFF'); view.setUint32(4,38,true); str(8,'WAVEfmt '); view.setUint32(16,16,true);
            view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,8000,true); view.setUint32(28,16000,true);
            view.setUint16(32,2,true); view.setUint16(34,16,true); str(36,'data'); view.setUint32(40,2,true);
            const url = URL.createObjectURL(new Blob([buffer],{type:'audio/wav'}));
            audio.src = url; audio.play().catch(() => {}).finally(() => URL.revokeObjectURL(url));
        }
    }
    async function speak(text, lang = 'en-US', rate = 1) {
        stop(); const token = playback;
        const requestedAt = performance.now();
        if (!String(text || '').trim()) return;
        if (self.SolAndroid) {
            await SolAndroid.request('speak', {text:String(text),lang:lang.startsWith('ko')?'ko':'en',rate,...config});
            return;
        }
        if (config.engine === 'system') return systemSpeak(text,lang,rate,token);
        status('음성 준비 중…');
        try {
            const waiting = new Promise(resolve => { cancelWaiting = () => resolve(null); });
            const blob = await Promise.race([generate(String(text), lang.startsWith('ko') ? 'ko' : 'en'), waiting]);
            if (token !== playback || !blob) return;
            cancelWaiting = null;
            await new Promise((resolve,reject) => {
                const url = URL.createObjectURL(blob);
                let timer, done = false;
                const finish = error => {
                    if (done) return; done = true;
                    clearTimeout(timer); audio.onended = audio.onerror = null;
                    URL.revokeObjectURL(url); finishAudio = null;
                    error ? reject(error) : resolve();
                };
                finishAudio = () => finish();
                audio.src = url; audio.playbackRate = Math.max(.5,Math.min(2,rate)); audio.preservesPitch = true;
                audio.onended = () => finish(); audio.onerror = () => finish(new Error('음성을 재생하지 못했습니다.'));
                timer = setTimeout(() => { audio.pause(); finish(new Error('재생이 중단됐습니다. 화면을 켜고 다시 재생하세요.')); }, Math.max(30000,blob.size / 88200 / audio.playbackRate * 1000 + 15000));
                audio.play().then(() => {
                    if (done) return;
                    const readyMs = Math.round(performance.now() - requestedAt);
                    status('Supertonic 3 · ' + (backend || '저장된 음성') + ' · 재생 준비 ' + readyMs + ' ms');
                    document.dispatchEvent(new CustomEvent('sol-tts-metric',{detail:{readyMs,backend}}));
                }).catch(() => finish(new Error('재생 버튼을 다시 눌러 음성을 허용하세요.')));
            });
        } catch (e) {
            if (token !== playback || e.message === 'cancelled') return;
            status(e.message); throw e;
        }
    }
    function systemSpeak(text,lang,rate,token) {
        return new Promise(resolve => {
            if (!('speechSynthesis' in window)) return resolve();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = lang; utterance.rate = rate;
            const voices = speechSynthesis.getVoices();
            utterance.voice = voices.find(v => v.lang.toLowerCase().startsWith(lang.slice(0,2)) && v.localService) || voices.find(v => v.lang.toLowerCase().startsWith(lang.slice(0,2))) || null;
            let timer;
            const finish = () => { clearTimeout(timer); utterance.onend = utterance.onerror = null; finishAudio = null; resolve(); };
            finishAudio = finish; utterance.onend = utterance.onerror = finish;
            timer = setTimeout(() => { if (token === playback) speechSynthesis.cancel(); finish(); }, text.length * 250 / rate + 5000);
            speechSynthesis.speak(utterance);
        });
    }
    function tasks(cards, mode) {
        const out = [];
        for (const q of cards) {
            const ko = String(q.korean || '').replace(/<[^>]+>/g,'').replace(/[()[\]{}]/g,'');
            const en = String(q.english || '');
            if (mode === 'manual') { if (en.trim()) out.push([en,'en']); continue; }
            const front = bmConfig.repeatFront > 0 && ko.trim() ? [[ko,'ko']] : [];
            const back = bmConfig.repeatBack > 0 && en.trim() ? [[en,'en']] : [];
            out.push(...(bmConfig.order === 'ENG_KOR' ? [...back,...front] : [...front,...back]));
        }
        return out;
    }
    function prepare(cards,index = 0,mode = 'manual') {
        if (config.engine !== 'supertonic' || preparing || downloadAbort) return;
        const version = ++prefetchVersion;
        if (worker) worker.postMessage({type:'drop-background'});
        (async () => {
            await ensureSW();
            if (!(await installed())) return;
            // Prioritize current card; keep only a small look-ahead on mobile.
            for (const [text,lang] of tasks(cards.slice(index,index + 4),mode)) {
                if (version !== prefetchVersion || document.hidden) return;
                await generate(text,lang,'background');
            }
        })().catch(e => { if (e.message !== 'cancelled') status(e.message); });
    }
    async function download() {
        if (self.SolAndroid) {
            try { await SolAndroid.request('download'); status('오프라인 음성 준비 완료 · Android'); }
            catch(e) { status(e.message); }
            return;
        }
        if (downloadAbort) return;
        const controller = new AbortController(); downloadAbort = controller;
        let wake;
        try {
            await ensureSW();
            try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (_) {}
            const cache = await caches.open(A.cache);
            let completed = 0;
            for (const item of A.all) {
                if (controller.signal.aborted) throw new DOMException('Aborted','AbortError');
                if (await cache.match(item.url)) { completed++; continue; }
                const response = await fetch(item.url, {signal:controller.signal, cache:'no-store'});
                if (!response.ok || response.type === 'opaque') throw new Error('다운로드 실패: ' + item.path + ' · ' + response.status);
                let received = 0, lastProgress = 0;
                const progress = new TransformStream({transform(chunk,stream) {
                    received += chunk.byteLength;
                    if (performance.now() - lastProgress > 200) {
                        lastProgress = performance.now();
                        status('저장 중 ' + (completed+1) + '/' + A.all.length + ' · ' + item.path.split('/').pop() + ' · ' + Math.round(received/1048576) + ' MB');
                    }
                    stream.enqueue(chunk);
                }});
                await cache.put(item.url, new Response(response.body.pipeThrough(progress), {headers:response.headers, status:200}));
                if (item.size && received !== item.size) { await cache.delete(item.url); throw new Error('파일이 덜 저장됐습니다. 다시 다운로드하세요.'); }
                completed++;
            }
            let persistent = false;
            try { persistent = !!(navigator.storage && navigator.storage.persist && await navigator.storage.persist()); } catch (_) {}
            status('오프라인 준비 완료 · 모델과 앱 저장됨' + (persistent ? ' · 저장 유지 허용' : ' · 브라우저가 공간 부족 시 삭제할 수 있음'));
            if (config.engine === 'supertonic') await warm();
        } catch (e) { status(e.name === 'AbortError' ? '다운로드 중지됨 · 다시 누르면 저장된 파일부터 이어갑니다.' : e.name === 'QuotaExceededError' ? '저장 공간이 부족합니다. 여유 공간을 확보하고 다시 다운로드하세요.' : e.message); }
        finally { downloadAbort = null; if (wake) wake.release().catch(() => {}); }
    }
    async function warm() {
        if (config.engine !== 'supertonic' || !(await installed())) return;
        if (self.SolAndroid) { await SolAndroid.request('warm',config); return; }
        await ensureSW();
        status('첫 재생을 위해 음성 엔진 준비 중…');
        try {
            const result = await rpc({type:'warm', voice:config.voice, steps:Number(config.steps), provider:config.provider, priority:'background'}).promise;
            status('오프라인 준비 완료 · ' + result.backend + ' · 다음 카드 미리 생성');
        } catch (e) { if (e.message !== 'cancelled') status(e.message); }
    }
    function openSettings() {
        document.getElementById('setTtsEngine').value = config.engine;
        document.getElementById('setTtsVoice').value = config.voice;
        document.getElementById('setTtsSteps').value = config.steps;
        document.getElementById('setTtsProvider').value = config.provider;
        installed().then(ok => status(ok ? '음성 파일 저장됨 · ' + (backend || '첫 재생 전 엔진 준비') : '처음 한 번 온라인에서 약 450 MB를 저장하세요.'));
    }
    function saveSettings() {
        stop(); prefetchVersion++; preparing = false;
        const provider = document.getElementById('setTtsProvider').value;
        if (provider !== config.provider) resetWorker();
        config = {engine:document.getElementById('setTtsEngine').value, voice:document.getElementById('setTtsVoice').value,
            steps:Number(document.getElementById('setTtsSteps').value), provider, defaultsRevision:2};
        localStorage.setItem(settingsKey,JSON.stringify(config));
        warm().catch(e => status(e.message));
    }
    async function prepareSlot() {
        if (preparing) { preparing = false; prefetchVersion++; status('음성 미리 저장을 중지했습니다.'); return; }
        if (config.engine !== 'supertonic') { status('Supertonic 3를 선택하고 설정을 먼저 저장하세요.'); return; }
        if (!(await installed())) { status('오프라인 음성 파일을 먼저 다운로드하세요.'); return; }
        const version = ++prefetchVersion; preparing = true;
        if (worker) worker.postMessage({type:'drop-background'});
        let wake;
        try {
            try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (_) {}
            const words = await getWordsBySlot(currentSlotId);
            const all = tasks(words,'both'); prepared = 0;
            for (const [text,lang] of all) {
                if (!preparing || version !== prefetchVersion) break;
                await generate(text,lang,'background');
                status('현재 목록 음성 저장 ' + (++prepared) + '/' + all.length + ' · 저장된 음성은 재생 즉시 시작');
            }
            if (version === prefetchVersion) status('현재 목록 음성 준비 완료 · ' + prepared + '개 (저장 한도 96 MB, 초과 시 오래된 음성부터 정리)');
        } catch (e) { if (e.message !== 'cancelled') status(e.message); }
        finally { if (version === prefetchVersion) preparing = false; if (wake) wake.release().catch(() => {}); }
    }
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            prefetchVersion++; preparing = false;
            if (worker) worker.postMessage({type:'drop-background'});
        }
    });
    self.SolTTS = {speak, stop, unlock, prepare, download, openSettings, saveSettings, prepareSlot, prepareAudio:generate,
        cancelDownload:() => { if (self.SolAndroid) SolAndroid.request('cancelDownload').catch(() => {}); if (downloadAbort) downloadAbort.abort(); },
        get config() { return {...config}; }, installed, audioKey};
    ensureSW().then(async () => { if (config.engine === 'supertonic' && await installed()) await warm(); }).catch(e => status(e.message));
})();
