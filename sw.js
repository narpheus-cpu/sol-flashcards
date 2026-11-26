importScripts('./tts-assets.js');
const SHELL = 'solmate-shell-v29';
const ROOT = new URL('./', self.location.href);
const XLSX = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const FILES = ['./pc-quiz-controls.js?v=4', './pc-quiz.css?v=3', './default-files.js?v=1', './default-files.css?v=1', './default-files.json', './pwa-install.js?v=1', './pwa-install.css?v=1', './icons/favicon-16.png', './icons/favicon-32.png', './icons/favicon.ico', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png', './reading-mode.js?v=1', './reading-mode.css?v=1', './mp3-files.js?v=2', './speech-settings.js', './', './index.html', './mp3-export.js?v=6', './mp3-export.css?v=4', './mp3-worker.js?v=3', './vendor/lame.min.js', './vendor/fflate.js', './vendor/soundtouch.js', './vendor/franc.mjs', './tts-assets.js', './native.js', './tts.js', './round.js', './tts-worker.js', './supertonic-core.js', './manifest.webmanifest', './SUPERTONIC-LICENSE.txt', './SUPERTONIC-MODEL-LICENSE.txt', XLSX];
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL);
        // Install atomically: an incomplete shell must never claim offline readiness.
        await cache.addAll(FILES.map(p => new Request(new URL(p, ROOT).href, {cache:'reload'})));
        await self.skipWaiting();
    })());
});
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        for (const key of await caches.keys()) {
            if ((key.startsWith('sol-flashcards-shell-') || key.startsWith('solmate-shell-')) && key !== SHELL) await caches.delete(key);
        }
        await self.clients.claim();
    })());
});
self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.href.split('?')[0] === new URL('default-files.json', ROOT).href) {
        event.respondWith((async () => {
            const cache = await caches.open(SHELL);
            try { const live = await fetch(new Request(req, {cache:'no-store'})); if (live.ok) {await cache.put(req, live.clone()); return live;} return await cache.match(req,{ignoreSearch:true}) || live; }
            catch (_) {return await cache.match(req,{ignoreSearch:true}) || new Response('기본 파일 목록을 불러올 수 없습니다.',{status:503});}
        })());
        return;
    }
    // Desktop quiz updates must not reuse an older script with another version.
    const pcAssets = ['pc-quiz.js', 'pc-quiz-controls.js', 'pc-quiz.css'].map(path => new URL(path, ROOT).href);
    if (pcAssets.includes(url.href.split('?')[0])) {
        event.respondWith((async () => {
            const cache = await caches.open(SHELL);
            try {
                const live = await fetch(new Request(req, {cache:'no-cache'}));
                if (live.ok) { await cache.put(req, live.clone()); return live; }
                return await cache.match(req) || live;
            } catch (_) {
                return await cache.match(req) || new Response('PC 퀴즈 파일을 불러올 수 없습니다.', {status:503});
            }
        })());
        return;
    }
    const runtimePrefix = new URL('tts-runtime/', ROOT).href;
    if (req.url.startsWith(runtimePrefix)) {
        event.respondWith((async () => {
            const name = req.url.slice(runtimePrefix.length);
            const asset = TTS_ASSETS.runtime.find(a => a.path === 'runtime/' + name);
            if (!asset) return new Response('Unknown runtime asset', {status:404});
            const cache = await caches.open(TTS_ASSETS.cache);
            return await cache.match(asset.url) || new Response('오프라인 음성 파일을 먼저 다운로드하세요.', {status:503});
        })());
        return;
    }
    if (url.origin === ROOT.origin && url.pathname.startsWith(ROOT.pathname)) {
        event.respondWith((async () => {
            const cache = await caches.open(SHELL);
            if (req.mode === 'navigate') {
                const isApp = url.pathname === ROOT.pathname || url.pathname === new URL('index.html', ROOT).pathname;
                try {
                    const live = await fetch(req);
                    if (live.ok) { if (isApp) await cache.put(new URL('index.html', ROOT).href, live.clone()); return live; }
                    return await cache.match(isApp ? new URL('index.html', ROOT).href : req) || live;
                } catch (_) { return await cache.match(isApp ? new URL('index.html', ROOT).href : req) || new Response('오프라인에서 열 수 없는 페이지입니다.', {status:503}); }
            }
            return await cache.match(req, {ignoreSearch:true}) || fetch(req);
        })());
    } else if (req.url === XLSX) {
        event.respondWith(caches.open(SHELL).then(async c => await c.match(req) || fetch(req)));
    }
});

