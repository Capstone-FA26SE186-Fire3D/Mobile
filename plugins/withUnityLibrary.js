const {
  withDangerousMod,
  withSettingsGradle,
  withAppBuildGradle,
  withAndroidManifest,
} = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

module.exports = function withUnityLibrary(config) {
  config = withDangerousMod(config, [
    'android',
    async (value) => {
      const root = value.modRequest.projectRoot;
      const lock = JSON.parse(fs.readFileSync(path.join(root, 'unity-artifact.lock.json'), 'utf8'));
      const source = path.join(root, 'vendor', 'unityLibrary');
      const marker = path.join(source, '.unity-artifact.json');
      if (!lock.version || !/^[a-f0-9]{64}$/.test(lock.sha256) || !fs.existsSync(marker))
        throw new Error(
          'Run pnpm unity:prepare with a pinned S3 artifact before Android prebuild.',
        );
      const prepared = JSON.parse(fs.readFileSync(marker, 'utf8'));
      if (prepared.version !== lock.version || prepared.sha256 !== lock.sha256)
        throw new Error('Prepared Unity artifact differs from unity-artifact.lock.json.');
      fs.cpSync(source, path.join(value.modRequest.platformProjectRoot, 'unityLibrary'), {
        recursive: true,
      });
      return value;
    },
  ]);
  config = withSettingsGradle(config, (value) => {
    if (!value.modResults.contents.includes("include ':unityLibrary'"))
      value.modResults.contents +=
        "\ninclude ':unityLibrary'\nproject(':unityLibrary').projectDir = new File(rootProject.projectDir, 'unityLibrary')\n";
    return value;
  });
  config = withAppBuildGradle(config, (value) => {
    if (!value.modResults.contents.includes("implementation project(':unityLibrary')"))
      value.modResults.contents += "\ndependencies { implementation project(':unityLibrary') }\n";
    return value;
  });
  config = withAndroidManifest(config, (value) => {
    const application = value.modResults.manifest.application?.[0];
    if (!application) throw new Error('Generated AndroidManifest has no application.');
    application.activity ??= [];
    const name = 'com.fet3d.unity.UnityHostActivity';
    if (!application.activity.some((activity) => activity.$['android:name'] === name))
      application.activity.push({
        $: {
          'android:name': name,
          'android:exported': 'false',
          'android:screenOrientation': 'landscape',
          'android:configChanges':
            'keyboard|keyboardHidden|navigation|orientation|screenLayout|screenSize|smallestScreenSize|uiMode',
        },
      });
    return value;
  });
  return config;
};
