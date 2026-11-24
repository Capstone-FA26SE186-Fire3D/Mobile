export const sdk = {
  calls: [],
  handlers: {},
  listeners: new Set(),
  reset() {
    this.calls = [];
    this.handlers = {};
    this.listeners.clear();
  },
};
const call = (name, args, fallback) => {
  sdk.calls.push({ name, args });
  return sdk.handlers[name] ? sdk.handlers[name](...args) : fallback;
};
export const GoogleSignin = {
  configure: (...args) => call('configure', args),
  hasPlayServices: async (...args) => call('hasPlayServices', args, true),
  signIn: async (...args) =>
    call('signIn', args, { type: 'success', data: { idToken: 'google-id' } }),
  signOut: async (...args) => call('googleSignOut', args),
};
export const isCancelledResponse = (response) => response.type === 'cancelled';
export const getAuth = () => 'firebase-auth';
export const GoogleAuthProvider = {
  credential: (...args) => call('credential', args, 'credential'),
};
export const signInWithCredential = async (...args) =>
  call('signInWithCredential', args, {
    user: { getIdToken: async (...input) => call('getIdToken', input, 'firebase-id') },
  });
export const signOut = async (...args) => call('firebaseSignOut', args);
export const AndroidImportance = { DEFAULT: 3 };
export const setNotificationChannelAsync = async (...args) => call('channel', args);
export const getPermissionsAsync = async (...args) =>
  call('getPermissions', args, { granted: true });
export const requestPermissionsAsync = async (...args) =>
  call('requestPermissions', args, { granted: true });
export const getDevicePushTokenAsync = async (...args) =>
  call('pushToken', args, { type: 'android', data: 'fcm-test' });
export const addPushTokenListener = (listener) => {
  sdk.listeners.add(listener);
  return { remove: () => sdk.listeners.delete(listener) };
};
export const nativeApplicationVersion = 'test-app';
