"""Package the exact native runtime from a verified AAB for host-independent builds."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[2]
lock = json.loads((root / 'unity-artifact.lock.json').read_text(encoding='utf-8'))
lock = lock.get('sourceExport', lock)
parser = argparse.ArgumentParser()
parser.add_argument('--source-zip', type=Path, required=True)
args = parser.parse_args()
source_zip = args.source_zip.resolve()
if hashlib.sha256(source_zip.read_bytes()).hexdigest() != lock['sha256']:
    raise SystemExit('Source archive differs from the pinned Unity export.')
marker = lock
aab = root / 'android/app/build/outputs/bundle/release/app-release.aab'
version = marker['version'] + '-portable.1'
folder = root / '.codex/local/unity-portable'
folder.mkdir(parents=True, exist_ok=True)
output = folder / ('fet3d-unityLibrary-' + version + '.zip')
if output.exists():
    raise SystemExit('Refusing to overwrite an existing runtime archive.')
gradle = """apply plugin: 'com.android.library'
dependencies { api fileTree(dir: 'libs', include: ['*.jar']) }
android {
    namespace 'com.unity3d.player'
    compileSdk 36
    defaultConfig {
        minSdk 29
        targetSdk 36
        consumerProguardFiles 'proguard-unity.txt'
        ndk { abiFilters 'arm64-v8a' }
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
    androidResources {
        ignoreAssetsPattern = '!.svn:!.git:!.ds_store:!*.scc:!CVS:!thumbs.db:!picasa.ini:!*~'
        noCompress = ['.unity3d', '.ress', '.resource', '.obb', '.bundle', '.unityexp', '.bin']
    }
    packaging { jniLibs { useLegacyPackaging true } }
}
"""
files = {}
with zipfile.ZipFile(source_zip) as original:
    for entry in original.infolist():
        name = entry.filename.removeprefix('unityLibrary/')
        if entry.is_dir():
            continue
        if name.startswith(('libs/', 'src/main/assets/', 'src/main/java/', 'src/main/res/', 'src/main/resources/')) or name in ['src/main/AndroidManifest.xml', 'proguard-unity.txt']:
            if name.startswith('/') or '..' in name.split('/') or '\\' in name:
                raise SystemExit('Invalid source path.')
            files[name] = original.read(entry)
# Native binaries come from the SAME bundle as its packaged Unity data, not a loose cache.
expected = {'lib_burst_generated.so', 'libc++_shared.so', 'libil2cpp.so', 'libmain.so', 'libswappywrapper.so', 'libunity.so'}
with zipfile.ZipFile(aab) as bundle:
    for file, data in list(files.items()):
        if file.startswith('src/main/assets/'):
            if bundle.read('base/assets/' + file[len('src/main/assets/'):]) != data:
                raise SystemExit('Unity source assets differ from the verified AAB: ' + file)
    for name in sorted(expected):
        data = bundle.read('base/lib/arm64-v8a/' + name)
        if data[:5] != b'\x7fELF\x02' or int.from_bytes(data[18:20], 'little') != 183:
            raise SystemExit('Not an Android ARM64 ELF library: ' + name)
        files['src/main/jniLibs/arm64-v8a/' + name] = data
files['build.gradle'] = gradle.encode()
files['gradle.properties'] = b'unityStreamingAssets=.bin\n'
metadata = {
    'format': 'fet3d.unity-portable/1', 'version': version,
    'sourceVersion': marker['version'], 'sourceSha256': marker['sha256'],
    'bundleSha256': hashlib.sha256(aab.read_bytes()).hexdigest(),
    'files': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())},
}
files['portable-runtime.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name, data in sorted(files.items()):
        info = zipfile.ZipInfo('unityLibrary/' + name, date_time=(2026, 10, 27, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, data)
sha = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.json').write_text(json.dumps({'version': version, 'sha256': sha}, indent=2) + '\n')
print(json.dumps({'path': str(output), 'version': version, 'sha256': sha, 'bytes': output.stat().st_size}))
