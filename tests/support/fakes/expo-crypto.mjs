import { createHash, randomUUID as uuid } from 'node:crypto';
export const randomUUID = () => uuid();

export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' };

/** Native digest stand-in; `globalThis.__digests.count` counts files hashed this way; `fail` makes it throw. */
const stats = (globalThis.__digests ??= { count: 0, fail: false });
export async function digest(algorithm, data) {
  if (algorithm !== CryptoDigestAlgorithm.SHA256) throw new Error(`unsupported ${algorithm}`);
  if (stats.fail) throw new Error('digest unavailable');
  stats.count += 1;
  const out = createHash('sha256').update(data).digest();
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}
