/**
 * The only place with SQLite-specific code (constitution, technology section; FR-015):
 * connection pragmas, integrity check, pre-migration copy, single-file backup and the state of the former
 * migration mechanism (`user_version`). Everything else in `src/` is database independent.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { DataSource, DataSourceOptions } from 'typeorm';
import type { BetterSqlite3DataSourceOptions } from 'typeorm/driver/better-sqlite3/BetterSqlite3DataSourceOptions.js';
import type { ClassifiedError, DbAdapter, DbTarget } from './index';

/** Driver options: a single file without `-wal`/`-shm`, full durability, foreign keys on. */
export function sqliteOptions(path: string): BetterSqlite3DataSourceOptions {
  return {
    type: 'better-sqlite3',
    database: path,
    prepareDatabase: (db) => {
      db.pragma('journal_mode = DELETE');
      db.pragma('synchronous = FULL');
      db.pragma('foreign_keys = ON');
    },
  };
}

export function isFileDatabase(path: string): boolean {
  return path !== ':memory:';
}

/** Throws with `code` `SQLITE_CORRUPT`/`SQLITE_NOTADB` if the file is not an intact database. Changes nothing. */
export function verifyIntegrity(path: string): void {
  let probe: Database.Database | null = null;
  try {
    probe = new Database(path, { readonly: true, fileMustExist: true });
    const result = probe.pragma('quick_check', { simple: true });
    if (result !== 'ok') throw Object.assign(new Error(String(result)), { code: 'SQLITE_CORRUPT' });
  } finally {
    probe?.close();
  }
}

export function isCorruption(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^SQLITE_(NOTADB|CORRUPT)/.test(code);
}

/** Copy `<file>.bak-<version>` before schema changes. Has no effect for a new or in-memory database. */
export function copyBeforeMigration(path: string, version: number): void {
  if (isFileDatabase(path) && existsSync(path)) copyFileSync(path, `${path}.bak-${version}`);
}

/** State of the former migration mechanism (`PRAGMA user_version`); 0 for files without a state. */
export async function readLegacyVersion(dataSource: DataSource): Promise<number> {
  const rows = (await dataSource.query('PRAGMA user_version')) as { user_version: number }[];
  return rows[0]?.user_version ?? 0;
}

/** Writes a consistent single file with the current state of the running database. */
export async function backupTo(dataSource: DataSource, targetPath: string): Promise<void> {
  const connection = (dataSource.driver as unknown as { databaseConnection: Database.Database })
    .databaseConnection;
  mkdirSync(dirname(targetPath), { recursive: true });
  await connection.backup(targetPath);
}

/** Seconds-based expiry against the SQLite clock (UTC, same format as `CURRENT_TIMESTAMP`). */
function expiredCondition(column: string, ttlSeconds: number): string {
  return `"${column}" < datetime('now', '-${Math.trunc(ttlSeconds)} seconds')`;
}

function classifyError(error: unknown): ClassifiedError {
  const reason = error instanceof Error ? error.message : String(error);
  return {
    stage: 'reachable',
    message: `Die lokale Datenbank konnte nicht geöffnet werden (${reason}).`,
  };
}

/** Local single-file database: the default. No migration lock is needed (one device, one app instance). */
export const sqliteAdapter: DbAdapter = {
  type: 'sqlite',
  dataSourceOptions(target: DbTarget): DataSourceOptions {
    if (target.kind !== 'file') throw new Error('SQLite braucht einen Dateipfad.');
    return sqliteOptions(target.path);
  },
  withMigrationLock: (_dataSource, work) => work(),
  async countForeignTables(dataSource) {
    const rows = (await dataSource.query(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'migrations'",
    )) as { n: number }[];
    return Number(rows[0]?.n ?? 0);
  },
  expiredCondition,
  classifyError,
  file: { isFileDatabase, verifyIntegrity, isCorruption, copyBeforeMigration, backupTo },
};
