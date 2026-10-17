import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import extract from 'extract-zip';

const root = resolve(import.meta.dirname, '..');
const lock = JSON.parse(await readFile(join(root, 'unity-artifact.lock.json'), 'utf8'));
const { version, s3Uri, sha256 } = lock;
if (
  !version ||
  !/^s3:\/\/[a-z0-9.-]+\/[A-Za-z0-9!_.*'()/+-]+\.zip$/.test(s3Uri ?? '') ||
  !/^[a-f0-9]{64}$/.test(sha256 ?? '') ||
  !s3Uri.includes(`/${version}/`)
)
  throw new Error(
    'Pin version, versioned S3 URI and SHA-256 in unity-artifact.lock.json before preparing Unity.',
  );

const vendor = join(root, 'vendor');
const target = join(vendor, 'unityLibrary');
const marker = join(target, '.unity-artifact.json');
if (existsSync(target)) {
  const previous = JSON.parse(await readFile(marker, 'utf8'));
  if (previous.version === version && previous.sha256 === sha256) {
    console.log(`Unity artifact ${version} already verified in vendor cache.`);
    process.exit(0);
  }
  throw new Error(
    'vendor/unityLibrary holds a different artifact; move it aside before preparing another version.',
  );
}

await mkdir(vendor, { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), 'fet3d-unity-'));
try {
  const zip = join(scratch, 'unityLibrary.zip');
  const download = spawnSync('aws', ['s3', 'cp', s3Uri, zip, '--only-show-errors'], {
    stdio: 'inherit',
  });
  if (download.error) throw new Error(`AWS CLI is required: ${download.error.message}`);
  if (download.status !== 0) throw new Error(`S3 download failed (exit ${download.status}).`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(zip)) hash.update(chunk);
  if (hash.digest('hex') !== sha256)
    throw new Error('unityLibrary archive SHA-256 does not match the pin.');
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
  await writeFile(
    join(library, '.unity-artifact.json'),
    JSON.stringify({ version, sha256 }) + '\n',
  );
  await rename(library, target);
  console.log(`Prepared pinned Unity artifact ${version}.`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
