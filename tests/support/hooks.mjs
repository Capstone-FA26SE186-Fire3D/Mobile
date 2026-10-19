import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';

const support = dirname(fileURLToPath(import.meta.url));
const root = resolvePath(support, '..', '..');
const fake = (name) => pathToFileURL(join(support, 'fakes', name)).href;
const FAKES = {
  'expo-sqlite': fake('expo-sqlite.mjs'),
  'expo-crypto': fake('expo-crypto.mjs'),
  'expo-modules-core': fake('expo-modules-core.mjs'),
  'expo-file-system': fake('expo-file-system.mjs'),
  'expo-secure-store': fake('expo-secure-store.mjs'),
  '@react-native-async-storage/async-storage': fake('async-storage.mjs'),
  'react-native': fake('react-native.mjs'),
};
// The session-aware HTTP client is replaced as a whole: tests script BE answers per path.
const REPLACED = { [join(root, 'src', 'api', 'auth.ts')]: fake('auth.mjs') };

export async function resolve(specifier, context, next) {
  if (FAKES[specifier]) return { url: FAKES[specifier], shortCircuit: true };
  let path = null;
  if (specifier.startsWith('@/')) path = join(root, 'src', specifier.slice(2));
  else if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    context.parentURL?.startsWith('file:')
  )
    path = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
  if (path) {
    const file = [path, `${path}.ts`, `${path}.tsx`].find(
      (candidate) => existsSync(candidate) && /\.(m?js|tsx?|json)$/.test(candidate),
    );
    if (file) {
      if (REPLACED[file]) return { url: REPLACED[file], shortCircuit: true };
      return { url: pathToFileURL(file).href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}
