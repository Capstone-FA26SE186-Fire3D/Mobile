process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test';
export const user = {
  id: 'user-1',
  email: 'learner@example.test',
  fullName: 'Learner',
  role: 'Trainee',
};
export const session = (overrides = {}) => ({
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  user,
  ...overrides,
});
export const json = (status, body, headers = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function mockFetch(t, answer) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const call = { url: new URL(url), ...options, headers: new Headers(options.headers) };
    calls.push(call);
    return answer(call, calls.length);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}
export async function authFixture(t) {
  const auth = await import('../../src/api/auth.ts?real');
  await auth.clearSession();
  t.after(() => auth.clearSession());
  return auth;
}
export function mockBackend(t, answer) {
  const previous = globalThis.__be;
  const previousRequests = globalThis.__requests;
  const calls = (globalThis.__requests = []);
  globalThis.__be = answer;
  t.after(() => {
    globalThis.__be = previous;
    globalThis.__requests = previousRequests;
  });
  return calls;
}
