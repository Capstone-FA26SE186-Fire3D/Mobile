import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import extract from 'extract-zip';
import portable from '../plugins/unity-portable.js';

// Two sources for vendor/unityLibrary:
// - pinned (default): the GitHub Release or S3 artifact in unity-artifact.lock.json, for CI and release builds;
// - local: `pnpm unity:prepare --zip <fet3d-unityLibrary-*.zip>` from Unity's "Export Unity Library for Mobile"
//   (its <zip>.json gives version and SHA-256). The lock file is not touched; the marker records source "local".
const root = resolve(import.meta.dirname, '..');
const vendor = join(root, 'vendor');
const target = join(vendor, 'unityLibrary');
const marker = join(target, '.unity-artifact.json');
const zipFlag = process.argv.indexOf('--zip');
const localZip = zipFlag >= 0 ? process.argv[zipFlag + 1] : undefined;
if (zipFlag >= 0 && !localZip)
  throw new Error('Usage: pnpm unity:prepare --zip <fet3d-unityLibrary-*.zip>');

const sha256Of = async (file) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};

const readMarker = async () =>
  existsSync(marker) ? JSON.parse(await readFile(marker, 'utf8')) : undefined;

const install = async (zip, version, sha256, source) => {
  // Extract next to the target: a rename from the OS temp folder fails across drives (EXDEV on Windows).
  await mkdir(vendor, { recursive: true });
  const scratch = await mkdtemp(join(vendor, '.unity-'));
  try {
    const extracted = join(scratch, 'extracted');
    await mkdir(extracted);
    await extract(zip, { dir: extracted });
    const entries = await readdir(extracted);
    const library =
      entries.length === 1 && entries[0] === 'unityLibrary'
        ? join(extracted, 'unityLibrary')
        : extracted;
    if (
      !existsSync(join(library, 'build.gradle')) ||
      !existsSync(join(library, 'src', 'main', 'AndroidManifest.xml'))
    )
      throw new Error('Archive is not a Unity Android unityLibrary Gradle export.');
    const walk = async (folder) => {
      for (const name of await readdir(folder)) {
        const candidate = join(folder, name);
        const info = await lstat(candidate);
        if (info.isSymbolicLink()) throw new Error('Unity artifact contains a symbolic link.');
        if (info.isDirectory()) await walk(candidate);
      }
    };
    await walk(library);
    portable.verifyPortableRuntime(library, version);
    await writeFile(
      join(library, '.unity-artifact.json'),
      JSON.stringify({ version, sha256, source }) + '\n',
    );
    await rm(target, { recursive: true, force: true });
    await rename(library, target);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

const lock = JSON.parse(await readFile(join(root, 'unity-artifact.lock.json'), 'utf8'));
const pinned = Boolean(lock.version || lock.s3Uri || lock.sha256);
if (pinned && (!lock.version || !/^[a-f0-9]{64}$/.test(lock.sha256 ?? '')))
  throw new Error('Pin both version and SHA-256 in unity-artifact.lock.json.');

if (localZip) {
  const zip = resolve(localZip);
  if (!existsSync(zip)) throw new Error(`Unity archive not found: ${zip}`);
  const sha256 = await sha256Of(zip);
  const info = existsSync(`${zip}.json`) ? JSON.parse(await readFile(`${zip}.json`, 'utf8')) : {};
  if (info.sha256 && info.sha256 !== sha256)
    throw new Error(`${basename(zip)} does not match the SHA-256 in ${basename(zip)}.json.`);
  const version =
    info.version ??
    basename(zip)
      .replace(/^fet3d-unityLibrary-/, '')
      .replace(/\.zip$/, '');
  if (pinned && (version !== lock.version || sha256 !== lock.sha256))
    throw new Error('Local Unity archive differs from unity-artifact.lock.json.');
  await install(zip, version, sha256, 'local');
  console.log(`Prepared local Unity artifact ${version} (sha256 ${sha256}).`);
  process.exit(0);
}

const { version, sha256 } = lock;
// Storage location is deployment configuration; version and digest stay under review in Git.
const s3Uri = process.env.UNITY_ARTIFACT_S3_URI || lock.s3Uri;
if (!pinned) {
  const previous = await readMarker();
  if (previous?.source === 'local') {
    console.log(`Using local Unity artifact ${previous.version} (lock is not pinned).`);
    process.exit(0);
  }
  throw new Error(
    'Pin version, versioned S3 URI and SHA-256 in unity-artifact.lock.json, or run pnpm unity:prepare --zip <archive>.',
  );
}
const previous = await readMarker();
if (previous && previous.version === version && previous.sha256 === sha256) {
  console.log(`Unity artifact ${version} already verified in vendor cache.`);
  process.exit(0);
}
if (previous && previous.source !== 'local')
  throw new Error(
    'vendor/unityLibrary holds a different pinned artifact; move it aside before preparing another version.',
  );

if (
  !lock.githubRelease &&
  (!/^s3:\/\/[a-z0-9.-]+\/[A-Za-z0-9!_.*'()/+-]+\.zip$/.test(s3Uri ?? '') ||
    !s3Uri.includes(`/${version}/`))
)
  throw new Error(
    'Set UNITY_ARTIFACT_S3_URI (or lock.s3Uri) to a versioned S3 ZIP matching the pinned version.',
  );

await mkdir(vendor, { recursive: true });
const scratch = await mkdtemp(join(vendor, '.unity-download-'));
try {
  const zip = join(scratch, 'unityLibrary.zip');
  const release = lock.githubRelease;
  if (
    release &&
    (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(release.repository ?? '') ||
      release.tag !== `unity-runtime-${version}` ||
      release.asset !== `fet3d-unityLibrary-${version}.zip`)
  )
    throw new Error('Invalid pinned GitHub runtime release identity.');
  const command = release ? 'gh' : 'aws';
  const args = release
    ? [
        'release',
        'download',
        release.tag,
        '--repo',
        release.repository,
        '--pattern',
        release.asset,
        '--output',
        zip,
      ]
    : ['s3', 'cp', s3Uri, zip, '--only-show-errors'];
  const download = spawnSync(command, args, { stdio: 'inherit' });
  if (download.error) throw new Error(`${command} CLI is required: ${download.error.message}`);
  if (download.status !== 0) throw new Error(`Runtime download failed (exit ${download.status}).`);
  if ((await sha256Of(zip)) !== sha256)
    throw new Error('unityLibrary archive SHA-256 does not match the pin.');
  await install(zip, version, sha256, 'pinned');
  console.log(`Prepared pinned Unity artifact ${version}.`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
