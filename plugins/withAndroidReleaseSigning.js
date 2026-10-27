const { withAppBuildGradle } = require('@expo/config-plugins');

const signingBlock = `
// FET3D Play upload signing: credentials are supplied by the build environment.
def fet3dSigningKeys = ['FET3D_RELEASE_KEYSTORE_PATH', 'FET3D_RELEASE_STORE_PASSWORD', 'FET3D_RELEASE_KEY_ALIAS', 'FET3D_RELEASE_KEY_PASSWORD']
def fet3dHasSigning = fet3dSigningKeys.every { System.getenv(it)?.trim() }
if (System.getenv('FET3D_RELEASE_BUILD') == '1' && !fet3dHasSigning) {
    throw new GradleException('Missing FET3D Play upload signing environment variables.')
}
if (fet3dHasSigning) {
    android {
        signingConfigs {
            playUpload {
                storeFile file(System.getenv('FET3D_RELEASE_KEYSTORE_PATH'))
                storePassword System.getenv('FET3D_RELEASE_STORE_PASSWORD')
                keyAlias System.getenv('FET3D_RELEASE_KEY_ALIAS')
                keyPassword System.getenv('FET3D_RELEASE_KEY_PASSWORD')
            }
        }
        buildTypes { release { signingConfig signingConfigs.playUpload } }
    }
}
`;

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (value) => {
    if (value.modResults.language !== 'groovy')
      throw new Error('FET3D signing requires Groovy Gradle.');
    if (!value.modResults.contents.includes('// FET3D Play upload signing:'))
      value.modResults.contents += signingBlock;
    return value;
  });
};
