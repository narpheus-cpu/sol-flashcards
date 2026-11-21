/* Versioned, public assets. Synthesis never sends text over the network. */
(function(root) {
    const revision = 'aafc6e32416a594460b32413efc49d7fe4ce6d46';
    const modelBase = 'https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/' + revision + '/';
    const runtimeBase = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
    const models = [
        ['onnx/tts.json', 8253], ['onnx/unicode_indexer.json', 277676],
        ['onnx/duration_predictor.onnx', 3700147], ['onnx/text_encoder.onnx', 36416150],
        ['onnx/vector_estimator.onnx', 256534781], ['onnx/vocoder.onnx', 101424195],
        ...['M','F'].flatMap(sex => [1,2,3,4,5].map(n => ['voice_styles/'+sex+n+'.json',0])), ['LICENSE', 0]
    ].map(([path, size]) => ({path, size, url: modelBase + path}));
    const runtime = ['ort.webgpu.min.js', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']
        .map(path => ({path: 'runtime/' + path, url: runtimeBase + path, size: 0}));
    root.TTS_ASSETS = {version: 'supertonic3-1', cache: 'sol-supertonic3-assets-v1', models, runtime,
        all: [...models, ...runtime], modelBase, runtimeBase};
})(self);
