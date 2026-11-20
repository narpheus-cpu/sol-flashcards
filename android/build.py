"""Reproducible SDK-only Android build. Signing keys are private, outside Git."""
import os, pathlib, shutil, subprocess, zipfile, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
WEB = ROOT.parent
SDK = pathlib.Path(os.environ.get('SOLMATE_ANDROID_SDK', str(pathlib.Path.home() / 'AppData/Local/Android/Sdk')))
JAVA = pathlib.Path(os.environ.get('SOLMATE_JAVA_HOME', 'C:/Program Files/Android/Android Studio/jbr'))
TOOLS = SDK / 'build-tools/36.0.0'
ANDROID = SDK / 'platforms/android-36/android.jar'
BUILD = ROOT / 'build'
env = dict(os.environ, JAVA_HOME=str(JAVA))
def run(*args):
    subprocess.run([str(x) for x in args], check=True, env=env)
for part in ['classes','gen','dex','assets/web/vendor']:
    (BUILD/part).mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(ROOT/'deps/onnxruntime-android.aar') as archive:
    archive.extract('classes.jar', ROOT/'deps')
    for item in archive.infolist():
        if item.filename.startswith(('jni/arm64-v8a/','jni/armeabi-v7a/')) and item.filename.endswith('.so'):
            target = BUILD/'lib'/pathlib.Path(item.filename).relative_to('jni')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(item))
files = ['index.html','tts-assets.js','native.js','tts.js','round.js','tts-worker.js','supertonic-core.js','sw.js','manifest.webmanifest','SUPERTONIC-LICENSE.txt','SUPERTONIC-MODEL-LICENSE.txt']
for name in files:
    shutil.copyfile(WEB/name, BUILD/'assets/web'/name)
vendor = ROOT/'assets/web/vendor/xlsx.full.min.js'
if not vendor.exists():
    vendor.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', vendor)
shutil.copyfile(vendor, BUILD/'assets/web/vendor/xlsx.full.min.js')
run(TOOLS/'aapt2.exe','compile','--dir',ROOT/'res','-o',BUILD/'resources.zip')
run(TOOLS/'aapt2.exe','link','-o',BUILD/'base.apk','-I',ANDROID,'--manifest',ROOT/'AndroidManifest.xml','--java',BUILD/'gen',BUILD/'resources.zip')
sources = list((ROOT/'src').rglob('*.java')) + list((BUILD/'gen').rglob('*.java'))
run(JAVA/'bin/javac.exe','-encoding','UTF-8','-source','8','-target','8','-cp',str(ANDROID)+os.pathsep+str(ROOT/'deps/classes.jar'),'-d',BUILD/'classes',*sources)
run(JAVA/'bin/jar.exe','cf',BUILD/'app-classes.jar','-C',BUILD/'classes','.')
run(TOOLS/'d8.bat','--release','--min-api','26','--lib',ANDROID,'--output',BUILD/'dex',BUILD/'app-classes.jar',ROOT/'deps/classes.jar')
shutil.copyfile(BUILD/'base.apk', BUILD/'unsigned.apk')
with zipfile.ZipFile(BUILD/'unsigned.apk','a',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for folder in ['assets','lib']:
        for file in (BUILD/folder).rglob('*'):
            if file.is_file(): archive.write(file, file.relative_to(BUILD).as_posix())
    for file in (BUILD/'dex').glob('*.dex'): archive.write(file,file.name)
run(TOOLS/'zipalign.exe','-f','4',BUILD/'unsigned.apk',BUILD/'aligned.apk')
key = pathlib.Path(os.environ['SOLMATE_KEYSTORE'])
run(TOOLS/'apksigner.bat','sign','--ks',key,'--ks-key-alias','solmate','--ks-pass','env:SOLMATE_KEY_PASS','--key-pass','env:SOLMATE_KEY_PASS','--out',BUILD/'Solmate-1.1.0.apk',BUILD/'aligned.apk')
run(TOOLS/'apksigner.bat','verify','--verbose',BUILD/'Solmate-1.1.0.apk')
print(BUILD/'Solmate-1.1.0.apk')
