import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const key = (accountId: string) => `fire3d.playtest.last.${accountId}`;
export async function readRecentPlaytest(accountId: string): Promise<string | null> {
  return Platform.OS === 'web' ? null : SecureStore.getItemAsync(key(accountId));
}
export async function saveRecentPlaytest(accountId: string, id: string): Promise<void> {
  if (Platform.OS !== 'web') await SecureStore.setItemAsync(key(accountId), id);
}
