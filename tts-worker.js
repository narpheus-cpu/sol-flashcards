importScripts('./tts-assets.js');
let engine = null, backend = '', sessions = [], styles = new Map(), initialization = null, librariesLoaded = false;
let foreground = [], background = [], working = false;
async function asset(path) {
    const entry = TTS_ASSETS.models.find(a => a.path === path);
    const response = entry && await (await caches.open(TTS_ASSETS.cache)).match(entry.url);
    if (!response) throw new Error('음성 모델이 없습니다. 온라인에서 오프라인 파일을 다운로드하세요.');
    return response;
}
async function release() {
    for (const session of sessions) await session.release().catch(() => {});
    sessions = []; engine = null;
    for (const style of styles.values()) { style.ttl.dispose(); style.dp.dispose(); }
    styles.clear();
}
async function initialize(provider = 'auto') {
    if (engine) return;
    if (initialization) return initialization;
    initialization = (async () => {
        if (!librariesLoaded) { importScripts('./tts-runtime/ort.webgpu.min.js', './supertonic-core.js'); librariesLoaded = true; }
        ort.env.wasm.numThreads = 1; // Works without COOP/COEP on GitHub Pages and mobile.
        ort.env.wasm.proxy = false;
        ort.env.wasm.wasmPaths = new URL('./tts-runtime/', self.location.href).href;
        const cfg = await (await asset('onnx/tts.json')).json();
        const indexer = await (await asset('onnx/unicode_indexer.json')).json();
        const providers = provider !== 'wasm' && self.navigator.gpu ? ['webgpu', 'wasm'] : ['wasm'];
        let last;
        for (const ep of providers) {
            try {
                for (const name of ['duration_predictor','text_encoder','vector_estimator','vocoder']) {
                    const buffer = await (await asset('onnx/' + name + '.onnx')).arrayBuffer();
                    sessions.push(await ort.InferenceSession.create(buffer, {executionProviders:[ep], graphOptimizationLevel:'all'}));
                }
                engine = new SupertonicAPI.TextToSpeech(cfg, new SupertonicAPI.UnicodeProcessor(indexer), ...sessions);
                backend = ep;
                break;
            } catch (e) { last = e; await release(); }
        }
        if (!engine) throw last;
    })().finally(() => { initialization = null; });
    return initialization;
}
async function voice(name) {
    if (!styles.has(name)) {
        const json = await (await asset('voice_styles/' + name + '.json')).json();
        styles.set(name, new SupertonicAPI.Style(
            new ort.Tensor('float32', Float32Array.from(json.style_ttl.data.flat(Infinity)), json.style_ttl.dims),
            new ort.Tensor('float32', Float32Array.from(json.style_dp.data.flat(Infinity)), json.style_dp.dims)));
    }
    return styles.get(name);
}
function chunks(text, lang) {
    const max = lang === 'ko' ? 70 : 150;
    const result = [];
    // Hard limits also cover long unpunctuated sentences and URLs.
    while (text.length > max) {
        let cut = text.lastIndexOf(' ', max);
        if (cut < max / 2) cut = max;
        result.push(text.slice(0, cut).trim()); text = text.slice(cut).trim();
    }
    if (text) result.push(text);
    return result;
}
async function run(job) {
    await initialize(job.provider);
    if (job.type === 'warm') {
        try { await engine._infer(['Hi.'], ['en'], await voice(job.voice), job.steps, 1); }
        catch (error) {
            if (backend !== 'webgpu') throw error;
            await release(); await initialize('wasm');
            await engine._infer(['Hi.'], ['en'], await voice(job.voice), job.steps, 1);
        }
        return {backend};
    }
    const style = await voice(job.voice);
    const parts = [], sampleRate = engine.sampleRate;
    const started = performance.now();
    for (const text of chunks(job.text, job.lang)) {
        let result;
        try { result = await engine._infer([text], [job.lang], style, job.steps, 1); }
        catch (error) {
            if (backend !== 'webgpu') throw error;
            // Some mobile GPUs create sessions but fail on a particular operator.
            await release(); await initialize('wasm');
            result = await engine._infer([text], [job.lang], await voice(job.voice), job.steps, 1);
        }
        parts.push(result.wav.subarray(0, Math.floor(result.duration[0] * sampleRate)));
    }
    const silence = Math.floor(sampleRate * 0.12);
    const length = parts.reduce((n, p) => n + p.length, 0) + Math.max(0, parts.length - 1) * silence;
    const pcm = new Float32Array(length); let offset = 0;
    parts.forEach(p => { pcm.set(p, offset); offset += p.length + silence; });
    return {wav:SupertonicAPI.writeWavFile(pcm, sampleRate), backend, ms:performance.now() - started};
}
async function pump() {
    if (working) return;
    working = true;
    while (foreground.length || background.length) {
        const job = foreground.shift() || background.shift();
        try {
            const result = await run(job);
            self.postMessage({id:job.id, result}, result.wav ? [result.wav] : []);
        } catch (e) { self.postMessage({id:job.id, error:String(e.message || e)}); }
    }
    working = false;
}
self.onmessage = ({data}) => {
    if (data.type === 'drop-background') {
        for (const job of background) self.postMessage({id:job.id, error:'cancelled'});
        background = []; return;
    }
    if (data.type === 'promote') {
        const idx = background.findIndex(j => j.id === data.id);
        if (idx >= 0) foreground.unshift(background.splice(idx,1)[0]);
        return;
    }
    (data.priority === 'background' ? background : foreground).push(data);
    pump();
};
