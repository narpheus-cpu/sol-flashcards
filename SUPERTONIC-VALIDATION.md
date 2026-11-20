# Supertonic 3 validation — 2026-11-20

Verified in Microsoft Edge on Windows, using the actual pinned Supertonic 3 ONNX files and ONNX Runtime Web 1.22.0. Responsive layout was inspected at 390 × 844. No physical Android/iOS device was available.

- JavaScript syntax: index.html inline code and all five JS files passed parsing.
- Full model/runtime download completed and cached successfully. Both F1 and M1 styles worked.
- CPU (WASM), fast 2-step profile: first English request including readiness was 4,889 ms, first Korean request 2,092 ms. Repeated cached playback began in 36 ms and 28 ms respectively.
- WebGPU after warm-up, fast 2-step profile: new English and Korean requests were 307 ms and 345 ms; repeats were 39 ms and 36 ms.
- Playback-speed-independent WAV cache keys matched. Repeat playback at different speeds reused stored audio.
- Current-list preparation completed six utterances for three cards.
- Manual playback, moving to another card during playback, automatic reading, previous/next during automatic reading, and exit worked without console errors.
- Offline app-shell simulation: the localhost server was changed to return 503 for app requests. Navigating back to the app still loaded the cached final-version interface and retained test cards.
- With that server blocked, an edited, previously uncached English sentence was generated from local model assets; observed readiness was 86 ms after look-ahead, then 34 ms on repeat.
- The final service worker only caches app navigations into the app entry; navigating to another document does not overwrite the offline app entry.

These timings describe the test computer. Mobile generation speed, memory availability, persistent-storage grants, and operating-system suspension vary. Full device airplane-mode/background-lock behavior was not tested. Users should download while online, prepare the current list in advance, and keep the page foregrounded during live generation. New sentences always require synthesis unless pre-generated; zero generation delay cannot be guaranteed.
