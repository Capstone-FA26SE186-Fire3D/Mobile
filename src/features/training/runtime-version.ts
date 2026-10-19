/**
 * The one source of the runtime values this app sends to BE (training prepare/start, playtest start) and to Unity
 * (Launch). APP_RUNTIME_VERSION must equal Unity `RuntimeCatalog.RuntimeVersion` of the embedded export; Unity repeats
 * it in `Ready`, and a mismatch is reported by `checkUnityRuntime`. BE accepts it only while that version is an active
 * row of the runtime catalog (POST/PATCH /api/admin/runtime-catalog, see docs/unity-integration.md).
 */
export const APP_RUNTIME_VERSION = '2.0.1';
export const BRIDGE_PROTOCOL_VERSION = '1';
export const MANIFEST_SCHEMA_VERSION = '1';

/** Null when Unity's Ready matches this app; otherwise a message for logs and the support screen. */
export function checkUnityRuntime(payload: unknown): string | null {
  const ready = (payload ?? {}) as { runtimeVersion?: unknown; protocolVersion?: unknown };
  if (
    ready.runtimeVersion === APP_RUNTIME_VERSION &&
    ready.protocolVersion === BRIDGE_PROTOCOL_VERSION
  )
    return null;
  return `Unity báo runtime ${String(ready.runtimeVersion ?? '?')} (protocol ${String(ready.protocolVersion ?? '?')}), ứng dụng gửi BE ${APP_RUNTIME_VERSION} (protocol ${BRIDGE_PROTOCOL_VERSION}).`;
}
