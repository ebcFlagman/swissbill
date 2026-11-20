import type { DbConnectionSettings } from '../domain/db-connection';

/** Contract: specs/006-additional-database-types/contracts/connection-ipc.md */

export type { DbConnectionSettings, DbType } from '../domain/db-connection';

export type FailedStage = 'reachable' | 'authentication' | 'database' | 'permissions' | 'schema';

export type SchemaState = 'empty' | 'current' | 'older' | 'newer' | 'foreign' | 'unknown';

export interface DbConnectionState {
  /** `null` = local default (no connection file) */
  settings: DbConnectionSettings | null;
  /** A password entry exists in the OS keychain */
  passwordStored: boolean;
  /** The connection expects a password from the keychain, but there is none (lost entry): ask again */
  passwordMissing: boolean;
  keychainAvailable: boolean;
  /** The connection file exists but cannot be used (damaged, newer version); German message */
  configError: string | null;
  /** What the app is currently running with */
  active: 'local' | 'server' | 'recovery';
  /** Why the database could not be opened (only in recovery mode); German, no credentials */
  startupError: string | null;
}

/** What to do with the stored password when saving. The password is only ever sent renderer → main. */
export type PasswordAction =
  { action: 'keep' } | { action: 'set'; value: string } | { action: 'remove' };

export interface DbConnectionInput {
  settings: DbConnectionSettings;
  password: PasswordAction;
}

export interface DbConnectionTestResult {
  ok: boolean;
  failedStage: FailedStage | null;
  /** German, never contains the password */
  message: string;
  schema: SchemaState;
}

export type PickCaFileResult = { path: string } | { cancelled: true } | { error: string };

export type EditEntityType = 'customer' | 'invoice';

export interface EditLockKey {
  entityType: EditEntityType;
  entityId: number;
}

/**
 * Result of locking a record. The flag is called `acquired`, not `ok`: the IPC layer treats any object with a
 * boolean `ok` as an already wrapped `Result`.
 */
export type AcquireLockResult = { acquired: true } | { acquired: false; ownerLabel: string };
