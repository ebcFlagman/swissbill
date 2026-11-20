import type { DbType } from '../domain/db-connection';

export interface DbInfo {
  type: DbType;
  /** Local database: full path of the file (Electron `userData` folder). Server: `host:port/database`. */
  path: string;
  /** Size of the database file; `null` for a server database (its operator looks after it) */
  sizeBytes: number | null;
  schemaVersion: number;
}

export type BackupResult = { path: string } | { cancelled: true };
