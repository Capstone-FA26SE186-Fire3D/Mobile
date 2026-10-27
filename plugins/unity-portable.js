const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function verifyPortableRuntime(library, expectedVersion) {
  const manifestPath = path.join(library, 'portable-runtime.json');
  if (!fs.existsSync(manifestPath)) return false;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (
    manifest.format !== 'fet3d.unity-portable/1' ||
    (expectedVersion && manifest.version !== expectedVersion)
  )
    throw new Error('Invalid portable Unity runtime identity.');
  const required = [
    'lib_burst_generated.so',
    'libc++_shared.so',
    'libil2cpp.so',
    'libmain.so',
    'libswappywrapper.so',
    'libunity.so',
  ];
  for (const name of [
    'build.gradle',
    'src/main/AndroidManifest.xml',
    ...required.map((file) => `src/main/jniLibs/arm64-v8a/${file}`),
  ]) {
    if (!manifest.files?.[name]) throw new Error(`Portable runtime is missing ${name}`);
  }
  for (const [name, digest] of Object.entries(manifest.files)) {
    if (/[\\:\x00]/.test(name) || name.startsWith('/') || name.split('/').includes('..'))
      throw new Error('Invalid portable runtime file path.');
    const bytes = fs.readFileSync(path.join(library, name));
    if (createHash('sha256').update(bytes).digest('hex') !== digest)
      throw new Error(`Portable runtime integrity failure: ${name}`);
    if (
      name.endsWith('.so') &&
      (bytes.toString('hex', 0, 5) !== '7f454c4602' || bytes.readUInt16LE(18) !== 183)
    )
      throw new Error(`Portable runtime library is not ARM64 ELF: ${name}`);
  }
  return true;
}
module.exports = { verifyPortableRuntime };
