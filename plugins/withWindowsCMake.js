const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The Android Gradle Plugin defaults to SDK CMake 3.22.1, whose ninja 1.10 is not long-path aware: inside a deep
// checkout the react-native-gesture-handler codegen paths pass 260 characters and buildCMake fails even with
// LongPathsEnabled. ninja 1.12 (bundled with SDK CMake 4.1.2) handles long paths, so Windows builds use it.
const CMAKE_VERSION = '4.1.2';

function sdkRoot() {
  return (
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'Android',
      'Sdk',
    )
  );
}

module.exports = function withWindowsCMake(config) {
  return withDangerousMod(config, [
    'android',
    async (value) => {
      if (process.platform !== 'win32') return value;
      const cmake = path.join(sdkRoot(), 'cmake', CMAKE_VERSION);
      if (!fs.existsSync(path.join(cmake, 'bin', 'ninja.exe')))
        throw new Error(
          `Android SDK CMake ${CMAKE_VERSION} is missing (${cmake}). Install it: sdkmanager "cmake;${CMAKE_VERSION}".`,
        );
      const file = path.join(value.modRequest.platformProjectRoot, 'local.properties');
      const lines = fs.existsSync(file)
        ? fs
            .readFileSync(file, 'utf8')
            .split(/\r?\n/)
            .filter((line) => line && !line.startsWith('cmake.dir='))
        : [];
      lines.push(`cmake.dir=${cmake.replace(/\\/g, '/')}`);
      fs.writeFileSync(file, lines.join('\n') + '\n');
      return value;
    },
  ]);
};
