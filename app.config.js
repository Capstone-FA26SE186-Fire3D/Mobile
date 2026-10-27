// CI supplies the store version independently of the Unity runtime catalog version.
module.exports = ({ config }) => {
  const version = process.env.FET3D_APP_VERSION || config.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid FET3D_APP_VERSION.');
  const rawCode = process.env.FET3D_ANDROID_VERSION_CODE;
  const versionCode = rawCode ? Number(rawCode) : config.android?.versionCode;
  if (
    rawCode &&
    (!/^\d+$/.test(rawCode) ||
      !Number.isSafeInteger(versionCode) ||
      versionCode < 1 ||
      versionCode > 2100000000)
  )
    throw new Error('FET3D_ANDROID_VERSION_CODE must be an integer from 1 to 2100000000.');
  return {
    ...config,
    version,
    // EAS verifies that these identify the project whose immutable ID is in app.json.
    ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
    ...(process.env.EXPO_PROJECT_SLUG ? { slug: process.env.EXPO_PROJECT_SLUG } : {}),
    android: { ...config.android, ...(versionCode ? { versionCode } : {}) },
  };
};
