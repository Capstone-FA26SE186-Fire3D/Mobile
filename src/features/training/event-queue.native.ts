import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { unityBridge } from './unity-bridge.native';

type UnityEvent = {
  eventId: string;
  sequence: number;
  schemaVersion: string;
  type: string;
  occurredAt: string;
  elapsedMs: number;
  payload: Record<string, unknown>;
};
type BridgeMessage = { type: string; sessionId: string | null; payload: unknown };
type EventRow = { event_id: string; sequence: number; json: string; state: string };
type CompletionRow = { key: string; last_sequence: number; end_reason: string; state: string };
type LaunchRow = { generation: number; expires_at: string; manifest_path: string; state: string };
type SignalRow = { native_id: number; session_id: string; payload_json: string };

let databasePromise: Promise<SQLiteDatabase> | null = null;
async function database(): Promise<SQLiteDatabase> {
  databasePromise ??= openDatabaseAsync('fire3d-training-queue.db').then(async (db) => {
    await db.execAsync(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS bridge_messages (
        native_id INTEGER PRIMARY KEY, session_id TEXT, type TEXT NOT NULL, payload_json TEXT NOT NULL,
        handled INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS unity_events (
        session_id TEXT NOT NULL, event_id TEXT NOT NULL, sequence INTEGER NOT NULL,
        json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', conflict_code TEXT,
        PRIMARY KEY(session_id,event_id), UNIQUE(session_id,sequence)
      );
      CREATE TABLE IF NOT EXISTS session_completions (
        session_id TEXT PRIMARY KEY, key TEXT NOT NULL, last_sequence INTEGER NOT NULL,
        end_reason TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending'
      );
      CREATE TABLE IF NOT EXISTS session_launches (
        session_id TEXT PRIMARY KEY, generation INTEGER NOT NULL, expires_at TEXT NOT NULL,
        manifest_path TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending'
      );`);
    return db;
  });
  return databasePromise;
}

function parseMessage(raw: string): BridgeMessage {
  const value = JSON.parse(raw) as BridgeMessage;
  if (
    !value ||
    typeof value.type !== 'string' ||
    (value.sessionId != null && typeof value.sessionId !== 'string')
  )
    throw new Error('Unity callback không đúng bridge contract.');
  return value;
}

function parseEvent(value: unknown): UnityEvent {
  const event = value as UnityEvent;
  if (
    !event ||
    !/^[0-9a-f-]{36}$/i.test(event.eventId) ||
    !Number.isSafeInteger(event.sequence) ||
    event.sequence < 1 ||
    event.schemaVersion !== '1' ||
    !event.type ||
    !event.occurredAt ||
    !Number.isSafeInteger(event.elapsedMs) ||
    event.elapsedMs < 0 ||
    !event.payload ||
    typeof event.payload !== 'object'
  )
    throw new Error('Unity event không đúng telemetry contract.');
  return event;
}

/** Native SQLite has already committed each callback; acknowledge it only after this second store commits. */
export async function ingestUnityCallbacks(): Promise<number> {
  const db = await database();
  const pending = await unityBridge.pendingCallbacks();
  for (const callback of pending) {
    const message = parseMessage(callback.payload);
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(
        'INSERT OR IGNORE INTO bridge_messages(native_id,session_id,type,payload_json) VALUES (?,?,?,?)',
        callback.id,
        message.sessionId,
        message.type,
        callback.payload,
      );
      if (message.type === 'Events') {
        if (!message.sessionId || !Array.isArray(message.payload))
          throw new Error('Unity Events thiếu session hoặc payload.');
        for (const value of message.payload) {
          const event = parseEvent(value);
          const json = JSON.stringify(event);
          await txn.runAsync(
            'INSERT OR IGNORE INTO unity_events(session_id,event_id,sequence,json) VALUES (?,?,?,?)',
            message.sessionId,
            event.eventId,
            event.sequence,
            json,
          );
          const stored = await txn.getFirstAsync<EventRow>(
            'SELECT event_id,sequence,json,state FROM unity_events WHERE session_id=? AND (event_id=? OR sequence=?)',
            message.sessionId,
            event.eventId,
            event.sequence,
          );
          if (
            !stored ||
            stored.event_id !== event.eventId ||
            stored.sequence !== event.sequence ||
            stored.json !== json
          )
            throw new Error('Unity đã dùng lại event ID hoặc sequence với nội dung khác.');
        }
      }
      if (message.type === 'Completed') {
        const completion = message.payload as { lastEventSequence: number; endReason: string };
        if (
          !message.sessionId ||
          !Number.isSafeInteger(completion?.lastEventSequence) ||
          completion.lastEventSequence < 0 ||
          !['Finished', 'TimedOut', 'Abandoned'].includes(completion.endReason)
        )
          throw new Error('Unity completion không đúng contract.');
        await txn.runAsync(
          'INSERT OR IGNORE INTO session_completions(session_id,key,last_sequence,end_reason) VALUES (?,?,?,?)',
          message.sessionId,
          Crypto.randomUUID(),
          completion.lastEventSequence,
          completion.endReason,
        );
        const stored = await txn.getFirstAsync<CompletionRow>(
          'SELECT key,last_sequence,end_reason,state FROM session_completions WHERE session_id=?',
          message.sessionId,
        );
        if (
          !stored ||
          stored.last_sequence !== completion.lastEventSequence ||
          stored.end_reason !== completion.endReason
        )
          throw new Error('Unity completion không khớp bản đã lưu.');
      }
    });
    await unityBridge.acknowledgeCallback(callback.id);
  }
  return pending.length;
}

export async function pendingEvents(sessionId: string): Promise<UnityEvent[]> {
  const rows = await (
    await database()
  ).getAllAsync<EventRow>(
    "SELECT event_id,sequence,json,state FROM unity_events WHERE session_id=? AND state='pending' ORDER BY sequence LIMIT 500",
    sessionId,
  );
  return rows.map((row) => JSON.parse(row.json) as UnityEvent);
}

export async function applyEventReceipt(
  sessionId: string,
  receipt: {
    accepted: string[];
    duplicates: string[];
    conflicts: { eventId: string; code: string }[];
  },
): Promise<void> {
  const db = await database();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const id of [...receipt.accepted, ...receipt.duplicates])
      await txn.runAsync(
        "UPDATE unity_events SET state='acknowledged' WHERE session_id=? AND event_id=?",
        sessionId,
        id,
      );
    for (const conflict of receipt.conflicts)
      await txn.runAsync(
        "UPDATE unity_events SET state='conflict', conflict_code=? WHERE session_id=? AND event_id=?",
        conflict.code,
        sessionId,
        conflict.eventId,
      );
  });
}

export async function completionFor(sessionId: string): Promise<CompletionRow | null> {
  return (await database()).getFirstAsync<CompletionRow>(
    'SELECT key,last_sequence,end_reason,state FROM session_completions WHERE session_id=?',
    sessionId,
  );
}

export async function markCompletion(
  sessionId: string,
  state: 'awaiting_sync' | 'completed',
): Promise<void> {
  await (
    await database()
  ).runAsync('UPDATE session_completions SET state=? WHERE session_id=?', state, sessionId);
}

export async function highestLocalSequence(sessionId: string): Promise<number> {
  const row = await (
    await database()
  ).getFirstAsync<{ last: number }>(
    'SELECT COALESCE(MAX(sequence),0) AS last FROM unity_events WHERE session_id=?',
    sessionId,
  );
  return row?.last ?? 0;
}

export async function requeueMissingRanges(
  sessionId: string,
  ranges: { from: number; to: number }[],
): Promise<number> {
  const db = await database();
  let count = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const range of ranges) {
      if (
        !Number.isSafeInteger(range.from) ||
        !Number.isSafeInteger(range.to) ||
        range.from < 1 ||
        range.to < range.from
      )
        throw new Error('BE trả missingRanges không hợp lệ.');
      const result = await txn.runAsync(
        "UPDATE unity_events SET state='pending' WHERE session_id=? AND sequence BETWEEN ? AND ? AND state='acknowledged'",
        sessionId,
        range.from,
        range.to,
      );
      count += result.changes;
    }
  });
  return count;
}

export async function saveLaunch(
  sessionId: string,
  generation: number,
  expiresAt: string,
  manifestPath: string,
): Promise<void> {
  await (
    await database()
  ).runAsync(
    "INSERT INTO session_launches(session_id,generation,expires_at,manifest_path,state) VALUES (?,?,?,?,'pending') ON CONFLICT(session_id) DO UPDATE SET generation=excluded.generation,expires_at=excluded.expires_at,manifest_path=excluded.manifest_path,state='pending'",
    sessionId,
    generation,
    expiresAt,
    manifestPath,
  );
}

export async function pendingLaunchedSignals(): Promise<SignalRow[]> {
  return (await database()).getAllAsync<SignalRow>(
    "SELECT native_id,session_id,payload_json FROM bridge_messages WHERE type='Launched' AND handled=0 ORDER BY native_id",
  );
}

export async function getLaunch(sessionId: string): Promise<LaunchRow | null> {
  return (await database()).getFirstAsync<LaunchRow>(
    'SELECT generation,expires_at,manifest_path,state FROM session_launches WHERE session_id=?',
    sessionId,
  );
}

export async function markLaunched(nativeId: number, sessionId: string): Promise<void> {
  const db = await database();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE bridge_messages SET handled=1 WHERE native_id=?', nativeId);
    await txn.runAsync(
      "UPDATE session_launches SET state='launched' WHERE session_id=?",
      sessionId,
    );
  });
}
