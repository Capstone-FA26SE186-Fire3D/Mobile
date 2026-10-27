import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { androidVersionCode, hasAppChanges, nextVersion } from './version.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const lines = (value) => value.split('\n').filter(Boolean);
const tag = lines(git('tag', '--merged', 'HEAD', '--sort=-version:refname', '--list', 'v*')).find(
  (value) => /^v\d+\.\d+\.\d+$/.test(value),
);
const messages = git('log', '--format=%B%x00', tag ? `${tag}..HEAD` : 'HEAD')
  .split('\0')
  .map((value) => value.trim())
  .filter(Boolean);
const files = lines(tag ? git('diff', '--name-only', tag, 'HEAD') : git('ls-files'));
const version = nextVersion(tag?.slice(1), messages);
const versionCode = androidVersionCode(
  process.env.GITHUB_RUN_NUMBER,
  process.env.GITHUB_RUN_ATTEMPT,
  process.env.ANDROID_VERSION_CODE_BASE || '1000000',
);
const release = {
  version,
  versionCode,
  tag: `v${version}`,
  previousTag: tag ?? null,
  commit: git('rev-parse', 'HEAD'),
  // Manual builds/internal tests may repeat an already released tree; never republish it automatically.
  publish: hasAppChanges(files),
};
writeFileSync('release-plan.json', JSON.stringify(release, null, 2) + '\n');
writeFileSync(
  'release-notes.md',
  `FET3D ${version}\n\nSource: ${release.commit}\nAndroid versionCode: ${versionCode}\n\n${messages.map((message) => `- ${message.split('\n')[0]}`).join('\n')}\n`,
);
if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries({
      version,
      version_code: versionCode,
      tag: release.tag,
      publish: release.publish,
    })
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  );
console.log(JSON.stringify(release, null, 2));
