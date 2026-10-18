import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { TrainingMode } from './session-contract';

/**
 * One play attempt of (account, Training, mode). The prepare key is reused until the attempt ends so a crash or retry
 * replays the same preparation; the start key is bound to the prepared session id. Keys are not secrets.
 */
export type TrainingAttempt = {
  trainingId: string;
  mode: TrainingMode;
  prepareKey: string;
  sessionId: string | null;
  startKey: string | null;
  createdAt: string;
};

const PREFIX = 'fire3d.training.attempt.v1';
const keyOf = (accountId: string, trainingId: string, mode: TrainingMode) =>
  `${PREFIX}.${accountId}.${trainingId}.${mode}`;

function parse(raw: string | null): TrainingAttempt | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as TrainingAttempt;
    return typeof value?.prepareKey === 'string' && typeof value.trainingId === 'string'
      ? value
      : null;
  } catch {
    return null;
  }
}

export async function readAttempt(
  accountId: string,
  trainingId: string,
  mode: TrainingMode,
): Promise<TrainingAttempt | null> {
  return parse(await AsyncStorage.getItem(keyOf(accountId, trainingId, mode)));
}

export async function writeAttempt(accountId: string, attempt: TrainingAttempt): Promise<void> {
  await AsyncStorage.setItem(
    keyOf(accountId, attempt.trainingId, attempt.mode),
    JSON.stringify(attempt),
  );
}

export async function getOrCreateAttempt(
  accountId: string,
  trainingId: string,
  mode: TrainingMode,
): Promise<TrainingAttempt> {
  const existing = await readAttempt(accountId, trainingId, mode);
  if (existing) return existing;
  const attempt: TrainingAttempt = {
    trainingId,
    mode,
    prepareKey: Crypto.randomUUID(),
    sessionId: null,
    startKey: null,
    createdAt: new Date().toISOString(),
  };
  await writeAttempt(accountId, attempt);
  return attempt;
}

/** Binds the prepared session to the attempt and creates its start key once. */
export async function bindPreparedSession(
  accountId: string,
  attempt: TrainingAttempt,
  sessionId: string,
): Promise<TrainingAttempt> {
  const next: TrainingAttempt =
    attempt.sessionId === sessionId && attempt.startKey
      ? attempt
      : { ...attempt, sessionId, startKey: Crypto.randomUUID() };
  if (next !== attempt) await writeAttempt(accountId, next);
  return next;
}

/** A replayed start whose grant expired before launch needs a new key (new grant generation). */
export async function rotateStartKey(
  accountId: string,
  attempt: TrainingAttempt,
): Promise<TrainingAttempt> {
  const next = { ...attempt, startKey: Crypto.randomUUID() };
  await writeAttempt(accountId, next);
  return next;
}

/** Ends the attempt (expired preparation, completed play, or the Trainee chose to play again). */
export async function clearAttempt(
  accountId: string,
  trainingId: string,
  mode: TrainingMode,
): Promise<void> {
  await AsyncStorage.removeItem(keyOf(accountId, trainingId, mode));
}
