# 솔메이트 1.1.0 validation

Defaults and naming: Supertonic 3 / M1 / 8-step high quality. Browser title, installed web-app manifest, and Android application label are 솔메이트. A one-time defaults migration was observed in the browser; later saved preferences are preserved.

Web checks in Edge on Windows: all scripts parsed; a three-card round was synthesized using the actual pinned Supertonic 3 model, played as a single continuous WAV, advanced to its result screen, and could be restarted, skipped forward/back, hidden behind the built-in black screen, and stopped. No console errors were observed. Closing a browser or tab cannot preserve web playback. Physical mobile lock-screen behavior was not tested.

Android: SDK 36 build tools / target 35 / min 26, arm64-v8a and armeabi-v7a. Compilation, DEX generation, resources, application metadata, and APK v2/v3 signatures verified successfully. The packaged web assets are copied directly from the same web sources; Android inference/playback use the native service instead of WebView timers. Model assets download separately on first use.

No Android device or configured emulator was available for installation or foreground-service lifecycle testing. A separate desktop Java ONNX smoke test was attempted but blocked by a Windows native DLL initialization failure before model inference. Consequently, native audio generation, actual Android screen-lock playback, task removal, and device-specific battery behavior remain unverified. The build should be treated as an initial installable Android release requiring device validation.

Native design checks: non-exported mediaPlayback foreground service; notification transport controls; platform MediaSession and audio focus; partial CPU wake lock during playback/generation; stopWithTask=false; sticky active playback with persisted queue; state restoration when reopening the same app. Explicit force-stop, device shutdown, and restrictive manufacturer policies can terminate the app. Stopping playback releases the wake lock/audio focus and stops the started service.

Signing material is private and is not present in the public repository.
