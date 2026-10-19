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
      if (!fs.existsSync(marker))
        throw new Error(
          'Run pnpm unity:prepare (pinned S3 artifact) or pnpm unity:prepare --zip <archive> before Android prebuild.',
        );
      const prepared = JSON.parse(fs.readFileSync(marker, 'utf8'));
      const pinned = Boolean(lock.version || lock.sha256);
      // A pinned lock must match exactly; an unpinned lock accepts a local export prepared with --zip.
      if (pinned && (prepared.version !== lock.version || prepared.sha256 !== lock.sha256))
        throw new Error('Prepared Unity artifact differs from unity-artifact.lock.json.');
      if (!pinned && prepared.source !== 'local')
        throw new Error('Pin unity-artifact.lock.json or prepare a local export with --zip.');
      if (!pinned) console.warn(`Using local Unity artifact ${prepared.version} (not pinned).`);
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
    const packageName = value.android?.package ?? 'com.fet3d.app';
    let activity = application.activity.find((item) => item.$['android:name'] === name);
    if (!activity) {
      activity = { $: { 'android:name': name } };
      application.activity.push(activity);
    }
    // Own task in the app process: Mobile reorders tasks instead of finishing Unity (destroy kills the process).
    Object.assign(activity.$, {
      'android:exported': 'false',
      'android:screenOrientation': 'landscape',
      'android:launchMode': 'singleTask',
      'android:taskAffinity': `${packageName}.unity`,
      'android:excludeFromRecents': 'true',
      'android:resizeableActivity': 'false',
      'android:configChanges':
        'keyboard|keyboardHidden|navigation|orientation|screenLayout|screenSize|smallestScreenSize|uiMode',
    });
    return value;
  });
  return config;
};
