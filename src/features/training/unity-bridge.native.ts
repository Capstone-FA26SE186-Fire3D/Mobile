import { requireOptionalNativeModule } from 'expo-modules-core';

type NativeCallback = { id: number; payload: string };
type UnityNativeModule = {
  pendingCallbacks(): Promise<NativeCallback[]>;
  acknowledgeCallback(id: number): Promise<void>;
  launch(payload: string): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  abort(reason: string): Promise<void>;
};

const native = requireOptionalNativeModule<UnityNativeModule>('Fire3DUnity');

function bridge(): UnityNativeModule {
  if (!native) throw new Error('Bản build Android chưa tích hợp Unity native module.');
  return native;
}

export const unityBridge = {
  pendingCallbacks: () => bridge().pendingCallbacks(),
  acknowledgeCallback: (id: number) => bridge().acknowledgeCallback(id),
  launch: (request: {
    protocolVersion: '1';
    sessionId: string;
    kind: 'Training' | 'Playtest';
    mode: string;
    runtimeVersion: '2.0.0';
    manifestPath: string;
    resumeFromSequence: number;
    locale: string;
  }) => bridge().launch(JSON.stringify(request)),
  pause: () => bridge().pause(),
  resume: () => bridge().resume(),
  abort: (reason: string) => bridge().abort(reason),
};
