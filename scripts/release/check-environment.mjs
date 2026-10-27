import { readFileSync } from 'node:fs';
const lock = JSON.parse(
  readFileSync(new URL('../../unity-artifact.lock.json', import.meta.url), 'utf8'),
);
const required = [
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'ANDROID_UPLOAD_KEYSTORE_BASE64',
  'FET3D_RELEASE_STORE_PASSWORD',
  'FET3D_RELEASE_KEY_ALIAS',
  'FET3D_RELEASE_KEY_PASSWORD',
];
if (!lock.githubRelease) required.push('UNITY_ARTIFACT_S3_URI', 'AWS_ROLE_ARN', 'AWS_REGION');
required.push('EXPO_TOKEN', 'EXPO_OWNER');
const githubNames = {
  EXPO_TOKEN: 'EXPO_TOKEN_FET3D',
  FET3D_RELEASE_STORE_PASSWORD: 'ANDROID_UPLOAD_KEYSTORE_PASSWORD',
  FET3D_RELEASE_KEY_ALIAS: 'ANDROID_UPLOAD_KEY_ALIAS',
  FET3D_RELEASE_KEY_PASSWORD: 'ANDROID_UPLOAD_KEY_PASSWORD',
};
const missing = required
  .filter((key) => !process.env[key]?.trim())
  .map((key) => githubNames[key] ?? key);
if (missing.length)
  throw new Error(`Configure GitHub Actions secrets/variables: ${missing.join(', ')}`);
const api = new URL(process.env.EXPO_PUBLIC_API_BASE_URL);
if (api.protocol !== 'https:' || api.username || api.password)
  throw new Error('Production API must use HTTPS without embedded credentials.');
