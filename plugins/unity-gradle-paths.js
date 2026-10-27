const fs = require('node:fs');
const path = require('node:path');
const { verifyPortableRuntime } = require('./unity-portable');

// Rewrite only the GENERATED copy. The pinned archive and vendor cache stay intact.
function relocateUnityLibrary(library, env = process.env) {
  if (verifyPortableRuntime(library)) return;
  const sdk = env.FET3D_UNITY_SDK_PATH;
  const ndk = env.FET3D_UNITY_NDK_PATH;
  if (!sdk && !ndk) return;
  if (!sdk || !ndk) throw new Error('Set both FET3D_UNITY_SDK_PATH and FET3D_UNITY_NDK_PATH.');
  for (const folder of [sdk, ndk]) {
    if (!fs.existsSync(folder))
      throw new Error('Configured Unity SDK/NDK directory does not exist.');
  }
  const gradlePath = path.join(library, 'build.gradle');
  const gradle = fs.readFileSync(gradlePath, 'utf8');
  const expectedNdk = /ndkVersion\s+["']([^"']+)["']/.exec(gradle)?.[1];
  const installedNdk = /Pkg\.Revision\s*=\s*(\S+)/.exec(
    fs.readFileSync(path.join(ndk, 'source.properties'), 'utf8'),
  )?.[1];
  if (!expectedNdk || expectedNdk !== installedNdk)
    throw new Error('Unity export and installed NDK versions differ.');
  if (!/ndkPath\s+["'][^"']+["']/.test(gradle))
    throw new Error('Unity export has no recognized ndkPath to relocate.');
  const normalized = (value) => {
    const result = value.replace(/\\/g, '/');
    if (/[\r\n"']/.test(result)) throw new Error('Invalid SDK/NDK path.');
    return result;
  };
  fs.writeFileSync(
    gradlePath,
    gradle.replace(/ndkPath\s+["'][^"']+["']/, `ndkPath "${normalized(ndk)}"`),
  );
  const propertiesPath = path.join(library, 'gradle.properties');
  const properties = fs.readFileSync(propertiesPath, 'utf8').split(/\r?\n/);
  const replacements = {
    'unity.androidSdkPath': normalized(sdk),
    'unity.androidNdkPath': normalized(ndk),
    ...(env.JAVA_HOME ? { 'unity.jdkPath': normalized(env.JAVA_HOME) } : {}),
  };
  const kept = properties.filter((line) => !(line.split('=')[0] in replacements));
  fs.writeFileSync(
    propertiesPath,
    [
      ...kept.filter(Boolean),
      ...Object.entries(replacements).map(([key, value]) => `${key}=${value}`),
    ].join('\n') + '\n',
  );
}

module.exports = { relocateUnityLibrary };
