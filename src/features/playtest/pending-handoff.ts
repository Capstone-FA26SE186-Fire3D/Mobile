import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'fire3d.pending-playtest-handoff.v1';
export const validHandoffCode = (value: string): boolean => /^[A-Za-z0-9_-]{43}$/.test(value);

export async function readPendingHandoff(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const code = await SecureStore.getItemAsync(KEY);
  return code && validHandoffCode(code) ? code : null;
}

export async function writePendingHandoff(code: string | null): Promise<void> {
  if (code && !validHandoffCode(code)) throw new Error('Mã handoff playtest không hợp lệ.');
  if (Platform.OS === 'web') return;
  if (code) await SecureStore.setItemAsync(KEY, code);
  else await SecureStore.deleteItemAsync(KEY);
}
