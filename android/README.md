# 솔메이트 Android

The APK packages the exact web interface from the repository root. `native.js` is a bridge only when the trusted Android host exists. Ordinary web browsers continue to use the browser implementation.

Version 1.2.1 includes shared default-file selection, GitHub upload, and selected-file deletion in the packaged Android app. The three import buttons share one row and fit narrow screens. Network access is required for shared-file operations; write access uses a GitHub token retained only in the current app page. Removing a shared default does not remove data already imported into a slot.

Android API 26 or newer; arm64-v8a and armeabi-v7a. Target SDK 35. Native ONNX Runtime Android 1.22.0, pinned Supertonic 3 model revision aafc6e32416a594460b32413efc49d7fe4ce6d46.

PlaybackService owns native inference, WAV caching, MediaPlayer, platform MediaSession, audio focus, the playback notification, and a partial CPU wake lock. It is a started foreground mediaPlayback service with stopWithTask=false and START_STICKY. No WebView timers are used to advance the Android playlist. Dismissing the activity task does not stop the service. The notification offers previous, pause/play, next and stop. A saved queue supports sticky-process restart and reopening the UI.

Explicit Android force-stop, device shutdown, revoked permissions, and manufacturer process restrictions can stop playback. No ordinary app can guarantee continued execution after a user force-stops it. Web browsers cannot continue after their process or playing tab is closed; the web version prepares one continuous audio item to reduce lock-screen transitions, subject to browser/OS rules.

The first model download stores about 405 MB in private application files, independently of browser storage. Thereafter inference is offline. Model files are not embedded into the APK. File import uses the Android document picker; data/blob exports use the save-document picker. Existing browser data can be moved using the app's JSON backup/import functions. Web and APK have separate storage.

Build with Android SDK build-tools 36.0.0, android-36/android.jar and JDK 21. Run build.py after placing the official onnxruntime-android 1.22.0 AAR in deps/onnxruntime-android.aar. The script copies the root web assets and bundles the pinned xlsx library. Signing keys and downloaded dependencies must never be committed. Models retain OpenRAIL-M; the upstream browser code is MIT. See the root license files.

