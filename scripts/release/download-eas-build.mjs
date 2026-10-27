import { readFileSync, mkdirSync } from 'node:fs';
import { open } from 'node:fs/promises';
const builds = JSON.parse(readFileSync('eas-build-result.json', 'utf8'));
if (
  !Array.isArray(builds) ||
  builds.length !== 1 ||
  builds[0].status !== 'FINISHED' ||
  builds[0].platform !== 'ANDROID'
)
  throw new Error('Expected exactly one finished Android EAS build.');
const build = builds[0];
if (
  build.appVersion !== process.env.FET3D_APP_VERSION ||
  String(build.appBuildVersion) !== process.env.FET3D_ANDROID_VERSION_CODE
)
  throw new Error('Expo build version differs from the release plan.');
const url = new URL(build.artifacts?.applicationArchiveUrl ?? build.artifacts?.buildUrl);
if (url.protocol !== 'https:' || url.username || url.password)
  throw new Error('Invalid EAS artifact URL.');
const response = await fetch(url);
if (!response.ok || !response.body)
  throw new Error(`EAS artifact download failed: ${response.status}`);
mkdirSync('submission', { recursive: true });
const file = await open('submission/app-release.aab', 'wx');
try {
  for await (const chunk of response.body) await file.write(chunk);
} finally {
  await file.close();
}
console.log(`Downloaded Android EAS build ${build.id}; bundle verification follows.`);
