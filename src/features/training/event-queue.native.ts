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
export type IngestedMessage = BridgeMessage & { nativeId: number; receivedAt: number | null };
type EventRow = { event_id: string; sequence: number; json: string; state: string };
type CompletionRow = { key: string; last_sequence: number; end_reason: string; state: string };
type LaunchRow = {
  kind: 'Training' | 'Playtest';
  generation: number;
  expires_at: string;
  manifest_path: string;
  state: string;
  /** Account that started the session; null for rows written before migration 2 (Trainee only). */
  account_id: string | null;
  /** 'active' while sync may still succeed; 'recovery' stops automatic retries (see recovery_code). */
  sync_state: string;
  recovery_code: string | null;
};
type SignalRow = {
  native_id: number;
  session_id: string;
  payload_json: string;
  received_at: number | null;
};
export type TrainingSyncRow = {
  session_id: string;
  kind: 'Training' | 'Playtest';
  launch_state: string;
  completion_state: string | null;
  pending_events: number;
};

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
        session_id TEXT PRIMARY KEY, kind TEXT NOT NULL, generation INTEGER NOT NULL, expires_at TEXT NOT NULL,
        manifest_path TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending'
      );`);
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(bridge_messages)');
    if (!columns.some((column) => column.name === 'received_at'))
      await db.execAsync('ALTER TABLE bridge_messages ADD COLUMN received_at INTEGER');
    // Migration 2 (additive, keeps every pending row): owner account and recovery state of each launch.
    const launchColumns = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(session_launches)',
    );
    const has = (name: string) => launchColumns.some((column) => column.name === name);
    if (!has('account_id'))
      await db.execAsync('ALTER TABLE session_launches ADD COLUMN account_id TEXT');
    if (!has('sync_state'))
      await db.execAsync(
        "ALTER TABLE session_launches ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'active'",
      );
    if (!has('recovery_code'))
      await db.execAsync('ALTER TABLE session_launches ADD COLUMN recovery_code TEXT');
    return db;
  });
  return databasePromise;
}

/** A callback that breaks the bridge contract; it is kept and acknowledged so it never blocks the queue. */
class CallbackRejected extends Error {}

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
    throw new CallbackRejected('Unity event không đúng telemetry contract.');
  return event;
}

/**
 * Native SQLite has already committed each callback; acknowledge it only after this second store commits. Returns the
 * messages moved in this call (in native order) so the runtime can react to Launched/Completed/Error/Exited.
 */
export async function ingestUnityCallbacks(): Promise<IngestedMessage[]> {
  const db = await database();
  const pending = await unityBridge.pendingCallbacks();
  const ingested: IngestedMessage[] = [];
  for (const callback of pending) {
    let message: BridgeMessage;
    try {
      message = parseMessage(callback.payload);
    } catch {
      // Unparseable JSON can never become valid; keep a copy and acknowledge so it does not block the queue.
      message = { type: 'Malformed', sessionId: null, payload: null };
    }
    const receivedAt = Number.isSafeInteger(callback.receivedAt) ? callback.receivedAt! : null;
    try {
      await storeCallback(db, callback.id, callback.payload, message, receivedAt);
    } catch (issue) {
      if (!(issue instanceof CallbackRejected)) throw issue;
      // Keep the raw callback for support, stop syncing that session (recovery) and let the other sessions continue.
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.runAsync(
          'INSERT OR IGNORE INTO bridge_messages(native_id,session_id,type,payload_json,received_at,handled) VALUES (?,?,?,?,?,1)',
          callback.id,
          message.sessionId,
          'Rejected',
          callback.payload,
          receivedAt,
        );
        if (message.sessionId)
          await txn.runAsync(
            "UPDATE session_launches SET sync_state='recovery', recovery_code='CALLBACK_REJECTED' WHERE session_id=?",
            message.sessionId,
          );
      });
      message = { type: 'Rejected', sessionId: message.sessionId, payload: issue.message };
    }
    await unityBridge.acknowledgeCallback(callback.id);
    ingested.push({ ...message, nativeId: callback.id, receivedAt });
  }
  return ingested;
}

async function storeCallback(
  db: SQLiteDatabase,
  nativeId: number,
  raw: string,
  message: BridgeMessage,
  receivedAt: number | null,
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      'INSERT OR IGNORE INTO bridge_messages(native_id,session_id,type,payload_json,received_at) VALUES (?,?,?,?,?)',
      nativeId,
      message.sessionId,
      message.type,
      raw,
      receivedAt,
    );
    if (message.type === 'Events') {
      if (!message.sessionId || !Array.isArray(message.payload))
        throw new CallbackRejected('Unity Events thiếu session hoặc payload.');
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
          throw new CallbackRejected('Unity đã dùng lại event ID hoặc sequence với nội dung khác.');
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
        throw new CallbackRejected('Unity completion không đúng contract.');
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
        throw new CallbackRejected('Unity completion không khớp bản đã lưu.');
    }
  });
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

export async function completionSummaryFor(sessionId: string): Promise<unknown | null> {
  const row = await (
    await database()
  ).getFirstAsync<{ payload_json: string }>(
    "SELECT payload_json FROM bridge_messages WHERE session_id=? AND type='Completed' ORDER BY native_id LIMIT 1",
    sessionId,
  );
  return row ? (JSON.parse(row.payload_json) as BridgeMessage).payload : null;
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

/**
 * Records a launch before Unity gets it. A playtest is relaunched only before BE confirmed `Launched` (BE refuses a launched
 * playtest), so events, completion and Launched signals of the unconfirmed earlier attempt are dropped: they can never be
 * accepted and would collide with the sequences of the new attempt.
 */
export async function saveLaunch(
  sessionId: string,
  kind: 'Training' | 'Playtest',
  generation: number,
  expiresAt: string,
  manifestPath: string,
  accountId: string | null = null,
): Promise<void> {
  const db = await database();
  await db.withExclusiveTransactionAsync(async (txn) => {
    const previous = await txn.getFirstAsync<{ state: string }>(
      'SELECT state FROM session_launches WHERE session_id=?',
      sessionId,
    );
    if (kind === 'Playtest' && previous && previous.state !== 'launched') {
      await txn.runAsync('DELETE FROM unity_events WHERE session_id=?', sessionId);
      await txn.runAsync('DELETE FROM session_completions WHERE session_id=?', sessionId);
      await txn.runAsync(
        "UPDATE bridge_messages SET handled=1 WHERE session_id=? AND type='Launched'",
        sessionId,
      );
    }
    await txn.runAsync(
      "INSERT INTO session_launches(session_id,kind,generation,expires_at,manifest_path,state,account_id,sync_state,recovery_code) VALUES (?,?,?,?,?,'pending',?,'active',NULL) ON CONFLICT(session_id) DO UPDATE SET kind=excluded.kind,generation=excluded.generation,expires_at=excluded.expires_at,manifest_path=excluded.manifest_path,state='pending',account_id=COALESCE(excluded.account_id,session_launches.account_id),sync_state='active',recovery_code=NULL",
      sessionId,
      kind,
      generation,
      expiresAt,
      manifestPath,
      accountId,
    );
  });
}

/** Stops automatic sync of one session (stale/expired grant, terminal playtest, rejected callback); others continue. */
export async function markRecovery(sessionId: string, code: string): Promise<void> {
  await (
    await database()
  ).runAsync(
    "UPDATE session_launches SET sync_state='recovery', recovery_code=? WHERE session_id=?",
    code,
    sessionId,
  );
}

export async function pendingLaunchedSignals(): Promise<SignalRow[]> {
  return (await database()).getAllAsync<SignalRow>(
    "SELECT native_id,session_id,payload_json,received_at FROM bridge_messages WHERE type='Launched' AND handled=0 ORDER BY native_id",
  );
}

export async function getLaunch(sessionId: string): Promise<LaunchRow | null> {
  return (await database()).getFirstAsync<LaunchRow>(
    'SELECT kind,generation,expires_at,manifest_path,state,account_id,sync_state,recovery_code FROM session_launches WHERE session_id=?',
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

/**
 * Sessions launched on this device by `accountId` that still have events or a completion to sync, or are still running.
 * Rows of another account wait until that account signs in again; rows in recovery are never retried automatically.
 * `includeLegacy`: rows written before migration 2 have no account and are Trainee training sessions.
 */
export async function sessionsToSync(
  accountId: string,
  includeLegacy: boolean,
): Promise<TrainingSyncRow[]> {
  return (await database()).getAllAsync<TrainingSyncRow>(
    `SELECT l.session_id, l.kind, l.state AS launch_state, c.state AS completion_state,
       (SELECT COUNT(*) FROM unity_events e WHERE e.session_id=l.session_id AND e.state='pending') AS pending_events
     FROM session_launches l LEFT JOIN session_completions c ON c.session_id=l.session_id
     WHERE l.sync_state='active'
       AND (l.account_id=? OR (? AND l.account_id IS NULL AND l.kind='Training'))
       AND (c.state IS NULL OR c.state<>'completed'
         OR EXISTS(SELECT 1 FROM unity_events e WHERE e.session_id=l.session_id AND e.state='pending'))`,
    accountId,
    includeLegacy ? 1 : 0,
  );
}

/** Local view of one session for the result screen: queued events and completion state. */
export async function localSessionState(
  sessionId: string,
): Promise<{ pendingEvents: number; completion: string | null; launched: boolean }> {
  const db = await database();
  const events = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM unity_events WHERE session_id=? AND state='pending'",
    sessionId,
  );
  const completion = await completionFor(sessionId);
  const launch = await getLaunch(sessionId);
  return {
    pendingEvents: events?.count ?? 0,
    completion: completion?.state ?? null,
    launched: launch?.state === 'launched',
  };
}

/** The most recent Unity message of the given types for a session (e.g. to restore an Error after a restart). */
export async function lastBridgeMessage(
  sessionId: string,
  types: string[],
): Promise<IngestedMessage | null> {
  const row = await (
    await database()
  ).getFirstAsync<{ native_id: number; payload_json: string; received_at: number | null }>(
    `SELECT native_id,payload_json,received_at FROM bridge_messages WHERE session_id=? AND type IN (${types
      .map(() => '?')
      .join(',')}) ORDER BY native_id DESC LIMIT 1`,
    sessionId,
    ...types,
  );
  if (!row) return null;
  const message = JSON.parse(row.payload_json) as BridgeMessage;
  return { ...message, nativeId: row.native_id, receivedAt: row.received_at };
}
