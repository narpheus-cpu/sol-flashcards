# Supertonic 3 offline speech

Open the HTTPS GitHub Pages URL. In 음성·자동 읽기 설정 choose Supertonic 3, keep 빠름 (2 steps), and save. While online, download the offline speech files and wait for completion. Keep the browser open and the screen awake during this first download. Interrupted downloads retain complete files and resume at the next missing file.

The complete model is approximately 398 MB, plus voice styles and ONNX Runtime Web. Allow around 450 MB for download and additional working memory. Optional generated WAV audio uses a separate, bounded 96 MiB IndexedDB cache. The existing flashcard database is unchanged.

To minimize delays before leaving home, press 현재 목록 음성 미리 저장. Current reading order and repeat settings determine which sides are prepared. Large lists exceeding the audio cache limit may evict earlier WAVs; the model remains installed, so missing WAVs can be regenerated offline.

During a quiz, the current card and next three cards are prepared in a worker, one inference at a time. Current playback requests take priority over queued background jobs. A running inference finishes before another starts. Already cached WAVs bypass inference, including after page reload and playback speed changes. Changing voice or quality selects distinct WAV cache entries. Cache eviction uses access time.

Supertonic uses WebGPU when available and working, otherwise single-thread WASM. Single-thread WASM works on GitHub Pages without cross-origin isolation headers. Use CPU compatibility mode if a device's GPU is unstable. All ONNX sessions stay warm while the page is open. Typed latent arrays and explicit tensor disposal reduce copying and memory accumulation. Long unpunctuated text is split into bounded segments. Low-step generation prioritizes speed; increase quality if pronunciation is unsatisfactory.

Offline requirements: a successful service-worker shell installation, all versioned model/runtime files cached, and ordinary (non-private) browser storage. Reopen the same site in the same browser. Clearing browser site data, private browsing, or browser storage eviction removes offline files. Browser persistent-storage permission is requested where supported, but cannot be guaranteed. Phones may suspend the page when the screen locks or the app is backgrounded; keep it foregrounded for reliable live generation. Prepared audio avoids inference but operating-system background playback restrictions still apply.

Model revision: `aafc6e32416a594460b32413efc49d7fe4ce6d46`, archived Supertonic 3. ONNX Runtime Web: `1.22.0`. No API key, remote speech service, or server is used for synthesis. Only fixed public model/runtime assets are downloaded; card text never leaves the device through TTS.

Adapted browser core: https://github.com/supertone-oss-archive/supertonic/blob/main/web/helper.js — MIT; see SUPERTONIC-LICENSE.txt. Model weights: https://huggingface.co/supertone-oss-archive/supertonic-3 — OpenRAIL-M; see SUPERTONIC-MODEL-LICENSE.txt. ONNX Runtime retains its bundled Microsoft MIT notice.

For a new app release, bump the shell cache version in sw.js whenever app-shell files change. Preserve the model cache name unless model/runtime revisions change. This service worker only handles this repository's path; other GitHub Pages apps on the same origin are not intercepted.
