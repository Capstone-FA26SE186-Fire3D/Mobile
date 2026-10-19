import { requireOptionalNativeModule } from 'expo-modules-core';
import { APP_RUNTIME_VERSION, BRIDGE_PROTOCOL_VERSION } from './runtime-version.ts';

export type NativeCallback = { id: number; payload: string; receivedAt?: number };
type Subscription = { remove(): void };
type UnityNativeModule = {
  pendingCallbacks(): Promise<NativeCallback[]>;
  acknowledgeCallback(id: number): Promise<void>;
  launch(payload: string): Promise<void>;
  show(): Promise<boolean>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  abort(reason: string): Promise<void>;
  addListener?(event: 'onCallback', listener: (event: { id: number }) => void): Subscription;
};

/** Null on web, Expo Go and Android builds without the Unity export: callers must degrade, not crash. */
const native = requireOptionalNativeModule<UnityNativeModule>('Fire3DUnity');

export const UNITY_UNAVAILABLE_MESSAGE =
  'Cần ứng dụng Fire3D cho Android có tích hợp Unity để tải gói và vào phiên tập huấn. Trên web hoặc bản build chưa có Unity, bạn chỉ xem được bài tập và kết quả.';

function bridge(): UnityNativeModule {
  if (!native) throw new Error(UNITY_UNAVAILABLE_MESSAGE);
  return native;
}

export type LaunchRequest = {
  protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
  sessionId: string;
  kind: 'Training' | 'Playtest';
  mode: string;
  runtimeVersion: typeof APP_RUNTIME_VERSION;
  manifestPath: string;
  resumeFromSequence: number;
  locale: string;
};

export const unityBridge = {
  available: native !== null,
  pendingCallbacks: () => bridge().pendingCallbacks(),
  acknowledgeCallback: (id: number) => bridge().acknowledgeCallback(id),
  launch: (request: LaunchRequest) => bridge().launch(JSON.stringify(request)),
  /** Brings an already running Unity session back to the front; false when Unity is not alive in this process. */
  show: () => bridge().show(),
  pause: () => bridge().pause(),
  resume: () => bridge().resume(),
  abort: (reason: string) => bridge().abort(JSON.stringify({ reason })),
  /** Fires after native SQLite committed a Unity callback; call ingestUnityCallbacks to move it into the JS queue. */
  onCallback(listener: () => void): () => void {
    const subscription = native?.addListener?.('onCallback', () => listener());
    return () => subscription?.remove();
  },
};
