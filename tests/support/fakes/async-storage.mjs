export const memory = (globalThis.__asyncStorage ??= new Map());
export const control = {
  fail: null,
  reset() {
    memory.clear();
    this.fail = null;
  },
};
export default {
  async getItem(key) {
    control.fail?.('get', key);
    return memory.get(key) ?? null;
  },
  async setItem(key, value) {
    control.fail?.('set', key);
    memory.set(key, value);
  },
  async removeItem(key) {
    control.fail?.('delete', key);
    memory.delete(key);
  },
};
