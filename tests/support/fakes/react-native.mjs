export const Platform = { OS: 'android', Version: 35 };
export const appListeners = new Set();
export const AppState = {
  addEventListener(_event, listener) {
    appListeners.add(listener);
    return {
      remove() {
        appListeners.delete(listener);
      },
    };
  },
};
export function emitAppState(state) {
  for (const listener of appListeners) listener(state);
}
