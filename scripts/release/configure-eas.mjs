import { readFileSync, writeFileSync } from 'node:fs';
const config = JSON.parse(readFileSync('eas.json', 'utf8'));
const names = [
  'FET3D_APP_VERSION',
  'FET3D_ANDROID_VERSION_CODE',
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
];
for (const name of names) {
  if (!process.env[name]?.trim()) throw new Error(`Missing EAS build setting: ${name}`);
}
// Only public app configuration; never copy signing passwords or EXPO_TOKEN into the archive.
config.build.production.env = Object.fromEntries(names.map((name) => [name, process.env[name]]));
writeFileSync('eas.json', JSON.stringify(config, null, 2) + '\n');
