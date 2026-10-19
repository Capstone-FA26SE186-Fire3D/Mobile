/** The Fire3DUnity native module is `globalThis.__unityNative` (tests install a fake bridge before importing). */
export function requireOptionalNativeModule(name) {
  return name === 'Fire3DUnity' ? (globalThis.__unityNative ?? null) : null;
}
