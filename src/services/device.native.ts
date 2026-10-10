import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { requestWithSession } from '@/api/auth';
import { base64Url } from './device-identity';
import { deleteDeviceBinding, putDeviceBinding } from './device-api';

const ID_KEY = 'fire3d.device.uuid.v1';
const SECRET_KEY = 'fire3d.device.installation-key.v1';
const BOUND_KEY = 'fire3d.device.bound-account.v1';
let deviceOperation: Promise<unknown> = Promise.resolve();

function inOrder<T>(action: () => Promise<T>): Promise<T> {
  const pending = deviceOperation.then(action, action);
  deviceOperation = pending.then(
    () => {},
    () => {},
  );
  return pending;
}

async function identity() {
  let deviceUuid = await SecureStore.getItemAsync(ID_KEY);
  let installationKey = await SecureStore.getItemAsync(SECRET_KEY);
  if (!deviceUuid) {
    deviceUuid = Crypto.randomUUID();
    await SecureStore.setItemAsync(ID_KEY, deviceUuid);
  }
  if (!installationKey) {
    installationKey = base64Url(await Crypto.getRandomBytesAsync(32));
    await SecureStore.setItemAsync(SECRET_KEY, installationKey);
  }
  return { deviceUuid, installationKey };
}

export async function bindDevice(accountId: string): Promise<boolean> {
  return inOrder(() => bindDeviceNow(accountId));
}

async function bindDeviceNow(accountId: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  await Notifications.setNotificationChannelAsync('fire3d', {
    name: 'Fire3D',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;
  const pushToken = await Notifications.getDevicePushTokenAsync();
  if (pushToken.type !== 'android' || typeof pushToken.data !== 'string' || !pushToken.data) {
    throw new Error('Thiết bị chưa trả FCM token hợp lệ.');
  }
  const { deviceUuid, installationKey } = await identity();
  await putDeviceBinding(
    requestWithSession,
    { deviceUuid, installationKey },
    pushToken.data,
    String(Platform.Version),
  );
  await SecureStore.setItemAsync(BOUND_KEY, accountId);
  return true;
}

export async function revokeDevice(accountId: string): Promise<void> {
  return inOrder(() => revokeDeviceNow(accountId));
}

async function revokeDeviceNow(accountId: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  if ((await SecureStore.getItemAsync(BOUND_KEY)) !== accountId) return;
  const { deviceUuid, installationKey } = await identity();
  await deleteDeviceBinding(requestWithSession, { deviceUuid, installationKey });
  await SecureStore.deleteItemAsync(BOUND_KEY);
}

export function listenForDeviceTokenChange(
  accountId: string,
  onError: (error: unknown) => void,
): () => void {
  if (Platform.OS !== 'android') return () => {};
  const subscription = Notifications.addPushTokenListener(() => {
    void bindDevice(accountId).catch(onError);
  });
  return () => subscription.remove();
}
