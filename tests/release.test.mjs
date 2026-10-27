import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { androidVersionCode, hasAppChanges, nextVersion } from '../scripts/release/version.mjs';

const require = createRequire(import.meta.url);
const { relocateUnityLibrary } = require('../plugins/unity-gradle-paths.js');
const project = fileURLToPath(new URL('../', import.meta.url));

test('release version starts at 1.0.0 and uses the strongest change in a batch', () => {
  assert.equal(nextVersion(undefined, ['feat: initial app']), '1.0.0');
  assert.equal(
    nextVersion('1.4.9', ['fix(auth): retry login', 'perf: reduce allocations']),
    '1.4.10',
  );
  assert.equal(nextVersion('1.4.9', ['feat(home): dashboard', 'fix: null response']), '1.5.0');
  assert.equal(
    nextVersion('1.4.9', ['feat: dashboard', 'refactor(api)!: change contract']),
    '2.0.0',
  );
  assert.equal(
    nextVersion('1.4.9', ['fix: parser\n\nBREAKING CHANGE: old input is removed']),
    '2.0.0',
  );
  assert.equal(nextVersion('1.4.9', ['Merge pull request #42', 'Update app icon']), '1.4.10');
});

test('documentation/test-only batches do not publish; native/config changes do', () => {
  assert.equal(
    hasAppChanges(['README.md', 'docs/release.md', '.codex/context.md', 'tests/auth.test.mjs']),
    false,
  );
  assert.equal(hasAppChanges(['plugins/withUnityLibrary.js']), true);
  assert.equal(hasAppChanges(['unity-artifact.lock.json']), true);
  assert.equal(hasAppChanges(['.github/workflows/google-play.yml']), true);
});

test('build counters increase on both a new workflow and a rerun, and reject overflow', () => {
  assert.equal(androidVersionCode('10', '1'), 1001001);
  assert.equal(androidVersionCode('10', '2'), 1001002);
  assert.equal(androidVersionCode('11', '1'), 1001101);
  for (const args of [
    ['0', '1'],
    ['1', '0'],
    ['1', '100'],
    ['oops', '1'],
    ['99999999', '1'],
  ])
    assert.throws(() => androidVersionCode(...args));
});

test('planner uses real reachable release tags, skips a released tree and reads feature commits under merges', (t) => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'fet3d-release-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: folder, encoding: 'utf8' }).trim();
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'core.autocrlf', 'false');
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'release-test@example.invalid');
  const commit = (file, message) => {
    writeFileSync(path.join(folder, file), message + '\n');
    git('add', file);
    git('commit', '--quiet', '-m', message);
  };
  const plan = () => {
    execFileSync(process.execPath, [path.join(project, 'scripts/release/plan.mjs')], {
      cwd: folder,
      env: {
        ...process.env,
        GITHUB_RUN_NUMBER: '10',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_OUTPUT: '',
        ANDROID_VERSION_CODE_BASE: '',
      },
    });
    return JSON.parse(readFileSync(path.join(folder, 'release-plan.json'), 'utf8'));
  };
  commit('app.js', 'feat: initial app');
  assert.equal(plan().version, '1.0.0');
  git('tag', 'v1.0.0');
  assert.equal(plan().publish, false);
  commit('README.md', 'docs: setup');
  assert.equal(plan().publish, false);
  commit('app.js', 'fix: login');
  assert.equal(plan().version, '1.0.1');
  git('switch', '--quiet', '-c', 'feature');
  commit('screen.js', 'feat(screen): add dashboard');
  git('switch', '--quiet', 'main');
  git('merge', '--quiet', '--no-ff', 'feature', '-m', 'Merge feature PR');
  assert.equal(plan().version, '1.1.0');
  git('branch', 'unreleased');
  git('switch', '--quiet', 'unreleased');
  commit('future.js', 'feat!: future breaking API');
  git('tag', 'v99.0.0');
  git('switch', '--quiet', 'main');
  assert.equal(plan().version, '1.1.0');
});

test('release config validates versions and retains the Android and EAS identities', () => {
  const configFile = path.join(project, 'app.config.js');
  const baseFile = path.join(project, 'app.json');
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `const base=require(${JSON.stringify(baseFile)}).expo; console.log(JSON.stringify(require(${JSON.stringify(configFile)})({config:base})))`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPO_OWNER: '',
        EXPO_PROJECT_SLUG: '',
        FET3D_APP_VERSION: '1.2.3',
        FET3D_ANDROID_VERSION_CODE: '1001001',
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.version, '1.2.3');
  assert.equal(config.android.versionCode, 1001001);
  assert.equal(config.android.package, 'com.fet3d.app');
  assert.equal(config.owner, 'lazzymoney');
  assert.equal(config.slug, 'fet3d');
  assert.equal(config.extra.eas.projectId, '98768196-bf44-40f1-b245-0839c97e5056');
  for (const rawCode of ['1.2', 'NaN', '-1', '2100000001']) {
    const invalid = spawnSync(
      process.execPath,
      [
        '-e',
        `require(${JSON.stringify(configFile)})({config:require(${JSON.stringify(baseFile)}).expo})`,
      ],
      {
        env: { ...process.env, FET3D_ANDROID_VERSION_CODE: rawCode },
        encoding: 'utf8',
      },
    );
    assert.notEqual(invalid.status, 0);
  }
});

test('generated Unity paths relocate to this host and refuse an incompatible NDK', (t) => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'fet3d-unity-paths-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const sdk = path.join(folder, 'sdk');
  const ndk = path.join(sdk, 'ndk', '27.2.12479018');
  const library = path.join(folder, 'unityLibrary');
  mkdirSync(ndk, { recursive: true });
  mkdirSync(library);
  writeFileSync(path.join(ndk, 'source.properties'), 'Pkg.Revision = 27.2.12479018\n');
  writeFileSync(
    path.join(library, 'build.gradle'),
    'android {\n ndkPath "D:/old/NDK"\n ndkVersion "27.2.12479018"\n}\n',
  );
  writeFileSync(
    path.join(library, 'gradle.properties'),
    'unity.androidSdkPath=D:/old/SDK\nunity.androidNdkPath=D:/old/NDK\nunity.versionName=2.0.2\n',
  );
  const env = { FET3D_UNITY_SDK_PATH: sdk, FET3D_UNITY_NDK_PATH: ndk };
  relocateUnityLibrary(library, env);
  assert.ok(
    readFileSync(path.join(library, 'build.gradle'), 'utf8').includes(ndk.replace(/\\/g, '/')),
  );
  const properties = readFileSync(path.join(library, 'gradle.properties'), 'utf8');
  assert.ok(!properties.includes('D:/old'));
  assert.ok(properties.includes('unity.versionName=2.0.2'));
  const first = readFileSync(path.join(library, 'build.gradle'), 'utf8');
  relocateUnityLibrary(library, env);
  assert.equal(readFileSync(path.join(library, 'build.gradle'), 'utf8'), first);
  writeFileSync(path.join(ndk, 'source.properties'), 'Pkg.Revision = 28.0.0\n');
  assert.throws(() => relocateUnityLibrary(library, env), /NDK versions differ/);
  assert.throws(() => relocateUnityLibrary(library, { FET3D_UNITY_SDK_PATH: sdk }), /Set both/);
});

test('missing deployment configuration fails with variable names and never secret values', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(project, 'scripts/release/check-environment.mjs')],
    {
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        EXPO_TOKEN: 'secret-that-must-not-be-printed',
      },
      encoding: 'utf8',
    },
  );
  assert.notEqual(result.status, 0);
  assert.ok(!result.stderr.includes('UNITY_ARTIFACT_S3_URI'));
  assert.ok(!result.stderr.includes('AWS_ROLE_ARN'));
  assert.ok(!result.stderr.includes('secret-that-must-not-be-printed'));
  assert.match(result.stderr, /ANDROID_UPLOAD_KEYSTORE_PASSWORD/);
  const withoutToken = spawnSync(
    process.execPath,
    [path.join(project, 'scripts/release/check-environment.mjs')],
    { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, encoding: 'utf8' },
  );
  assert.notEqual(withoutToken.status, 0);
  assert.match(withoutToken.stderr, /EXPO_TOKEN_FET3D/);
});

test('portable runtime verifies every ARM64 library and rejects tampering or a different version', (t) => {
  const { verifyPortableRuntime } = require('../plugins/unity-portable.js');
  const folder = mkdtempSync(path.join(os.tmpdir(), 'fet3d-portable-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const files = {};
  const names = [
    'build.gradle',
    'src/main/AndroidManifest.xml',
    ...[
      'lib_burst_generated.so',
      'libc++_shared.so',
      'libil2cpp.so',
      'libmain.so',
      'libswappywrapper.so',
      'libunity.so',
    ].map((name) => `src/main/jniLibs/arm64-v8a/${name}`),
  ];
  for (const name of names) {
    const bytes = Buffer.alloc(32);
    if (name.endsWith('.so')) {
      Buffer.from('7f454c4602', 'hex').copy(bytes);
      bytes.writeUInt16LE(183, 18);
    }
    const file = path.join(folder, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    files[name] = createHash('sha256').update(bytes).digest('hex');
  }
  const manifest = { format: 'fet3d.unity-portable/1', version: '2.0.2-portable.1', files };
  writeFileSync(path.join(folder, 'portable-runtime.json'), JSON.stringify(manifest));
  assert.equal(verifyPortableRuntime(folder, manifest.version), true);
  assert.throws(() => verifyPortableRuntime(folder, 'other'), /identity/);
  writeFileSync(path.join(folder, names.at(-1)), 'corrupted');
  assert.throws(() => verifyPortableRuntime(folder), /integrity/);
});

test('EAS configuration forwards the planned version and public settings without secrets', (t) => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'fet3d-eas-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  writeFileSync(
    path.join(folder, 'eas.json'),
    JSON.stringify({ build: { production: { credentialsSource: 'remote' } } }),
  );
  const result = spawnSync(
    process.execPath,
    [path.join(project, 'scripts/release/configure-eas.mjs')],
    {
      cwd: folder,
      encoding: 'utf8',
      env: {
        ...process.env,
        FET3D_APP_VERSION: '1.2.3',
        FET3D_ANDROID_VERSION_CODE: '1000101',
        EXPO_PUBLIC_API_BASE_URL: 'https://api.example.com/',
        EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'test.apps.googleusercontent.com',
        EXPO_TOKEN: 'private-test-token',
        FET3D_RELEASE_STORE_PASSWORD: 'private-test-password',
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const raw = readFileSync(path.join(folder, 'eas.json'), 'utf8');
  const profile = JSON.parse(raw).build.production;
  assert.equal(profile.credentialsSource, 'remote');
  assert.equal(profile.env.FET3D_APP_VERSION, '1.2.3');
  assert.equal(profile.env.FET3D_ANDROID_VERSION_CODE, '1000101');
  assert.ok(!raw.includes('private-test'));
  assert.equal(Object.keys(profile.env).length, 4);
});

test('EAS archive ignore rules include prepared Unity but exclude private/generated files', (t) => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'fet3d-eas-ignore-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', folder]);
  writeFileSync(path.join(folder, '.gitignore'), readFileSync(path.join(project, '.easignore')));
  const include = [
    'vendor/unityLibrary/.unity-artifact.json',
    'vendor/unityLibrary/build.gradle',
    'vendor/unityLibrary/src/main/jniLibs/arm64-v8a/libil2cpp.so',
  ];
  const exclude = [
    'fet3d-upload.jks',
    '.env',
    '.codex/local/handoff.md',
    'android/app/build.gradle',
    'fire3d-e6b00-private.json',
    'node_modules/example/index.js',
  ];
  const result = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {
    cwd: folder,
    encoding: 'utf8',
    input: [...include, ...exclude].join('\n') + '\n',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/).sort(), exclude.sort());
});
