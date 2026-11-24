const store = new Map();
export const control = {
  fail: null,
  reset() {
    store.clear();
    this.fail = null;
  },
};
export async function getItemAsync(key) {
  control.fail?.('get', key);
  return store.get(key) ?? null;
}
export async function setItemAsync(key, value) {
  control.fail?.('set', key);
  store.set(key, value);
}
export async function deleteItemAsync(key) {
  control.fail?.('delete', key);
  store.delete(key);
}
