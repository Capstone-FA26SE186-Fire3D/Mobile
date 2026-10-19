/**
 * Fake of src/api/auth.ts: `globalThis.__be(path, options)` answers each request (throw an ApiError for problems).
 * Every call is recorded in `globalThis.__requests`.
 */
export async function requestWithSession(path, options = {}) {
  (globalThis.__requests ??= []).push({ path, options });
  if (!globalThis.__be) throw new Error(`No fake BE for ${path}`);
  return globalThis.__be(path, options);
}
