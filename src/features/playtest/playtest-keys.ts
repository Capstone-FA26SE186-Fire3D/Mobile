import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createPlaytestKeys } from './playtest-flow';

/**
 * Idempotency keys per (account, playtest, operation), persisted so a crash, a retry or a lost response replays the same
 * start/reissue/cancel instead of using Trial twice or minting extra grant generations. Keys are not secrets.
 */
export const playtestKeys = createPlaytestKeys(AsyncStorage, () => Crypto.randomUUID());
