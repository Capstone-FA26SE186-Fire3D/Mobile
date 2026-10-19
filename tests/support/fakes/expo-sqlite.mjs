import { DatabaseSync } from 'node:sqlite';

/** In-memory databases by name; tests may pre-create one (old schema) before the code under test opens it. */
export const databases = (globalThis.__sqlite ??= new Map());

export function sqliteFor(name) {
  if (!databases.has(name)) databases.set(name, new DatabaseSync(':memory:'));
  return databases.get(name);
}

function wrap(db) {
  const api = {
    async execAsync(sql) {
      db.exec(sql.replace(/PRAGMA journal_mode=WAL;/i, ''));
    },
    async getAllAsync(sql, ...params) {
      return db.prepare(sql).all(...params);
    },
    async getFirstAsync(sql, ...params) {
      return db.prepare(sql).get(...params) ?? null;
    },
    async runAsync(sql, ...params) {
      const result = db.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async withExclusiveTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task(api);
        db.exec('COMMIT');
      } catch (issue) {
        db.exec('ROLLBACK');
        throw issue;
      }
    },
  };
  return api;
}

export async function openDatabaseAsync(name) {
  return wrap(sqliteFor(name));
}
