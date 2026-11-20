/**
 * Database adapters (contract: specs/006-additional-database-types/contracts/db-adapter.md).
 * Everything that differs between SQLite, PostgreSQL and MySQL/MariaDB lives behind this interface;
 * the rest of `src/` is database independent (constitution, technology section).
 */
import type { DataSource, DataSourceOptions } from 'typeorm';
import type { DbConnectionSettings, DbType } from '@shared/domain/db-connection';
import type { FailedStage } from '@shared/ipc/db-connection';

/** Where to connect: a local file (or `:memory:` in tests) or a configured server. */
export type DbTarget =
  | { kind: 'file'; path: string }
  | { kind: 'server'; settings: DbConnectionSettings; password: string | null };

/** A driver error turned into a connection stage and a German message without credentials. */
export interface ClassifiedError {
  stage: FailedStage;
  message: string;
}

/** Non-secret details that may appear in messages. Never the user name or password. */
export interface ErrorContext {
  host: string;
  database: string;
}

/** The driver error code, also when the driver error is wrapped (e.g. by TypeORM). */
export function errorCode(error: unknown): string | undefined {
  const e = error as { code?: unknown; driverError?: { code?: unknown } } | null;
  const code = e?.code ?? e?.driverError?.code;
  return typeof code === 'string' ? code : undefined;
}

/** The driver error number (MySQL/MariaDB `errno`), also when wrapped. */
export function errorNumber(error: unknown): number | undefined {
  const e = error as { errno?: unknown; driverError?: { errno?: unknown } } | null;
  const n = e?.errno ?? e?.driverError?.errno;
  return typeof n === 'number' ? n : undefined;
}

/** Operations that only exist for a single database file (integrity check, copy, backup). */
export interface FileOperations {
  isFileDatabase(path: string): boolean;
  verifyIntegrity(path: string): void;
  isCorruption(error: unknown): boolean;
  copyBeforeMigration(path: string, version: number): void;
  backupTo(dataSource: DataSource, targetPath: string): Promise<void>;
}

export interface DbAdapter {
  readonly type: DbType;
  /** TypeORM options for the target. The password is its own option, never part of a URL. */
  dataSourceOptions(target: DbTarget): DataSourceOptions;
  /** Runs `work` while holding a database-wide migration lock (so two devices never migrate at once). */
  withMigrationLock<T>(dataSource: DataSource, work: () => Promise<T>): Promise<T>;
  /** Number of tables other than `migrations` (used to recognise a foreign, non-empty database). */
  countForeignTables(dataSource: DataSource): Promise<number>;
  /** SQL condition (server clock) that is true when `column` is older than `ttlSeconds`. */
  expiredCondition(column: string, ttlSeconds: number): string;
  /** Driver error → connection stage and German message (no credentials, no raw driver text). */
  classifyError(error: unknown, context?: ErrorContext): ClassifiedError;
  /** Only the local SQLite adapter has file operations. */
  readonly file?: FileOperations;
}

/**
 * The adapter for a database type. Server adapters are loaded only when needed, so the app never
 * touches a server driver (and never opens a connection) without a configured server (FR-002).
 */
export async function adapterFor(type: DbType): Promise<DbAdapter> {
  switch (type) {
    case 'sqlite':
      return (await import('./sqlite')).sqliteAdapter;
    case 'postgres':
      return (await import('./postgres')).postgresAdapter;
    case 'mysql':
    case 'mariadb':
      return (await import('./mysql')).mysqlAdapter(type);
  }
}

/**
 * Is this a transient concurrency failure (deadlock, lock wait timeout, serialisation failure)? The whole
 * transaction was rolled back by the server, so running it again is safe.
 */
export function isRetryableTransactionError(error: unknown): boolean {
  const code = errorCode(error);
  const errno = errorNumber(error);
  return (
    code === '40P01' || // PostgreSQL deadlock_detected
    code === '40001' || // PostgreSQL serialization_failure
    code === 'ER_LOCK_DEADLOCK' ||
    code === 'ER_LOCK_WAIT_TIMEOUT' ||
    code === 'ER_CHECKREAD' || // MariaDB 11.6+ snapshot isolation: row changed since the snapshot
    errno === 1213 ||
    errno === 1205 ||
    errno === 1020
  );
}

/** What the user sees when the server connection broke while an action ran (FR-012). */
export const CONNECTION_LOST_MESSAGE =
  'Die Verbindung zum Datenbankserver wurde unterbrochen. Die Änderung wurde nicht gespeichert. Bitte erneut versuchen.';

/**
 * Did the connection to the server break (network failure, server restart, killed session)? The server rolls
 * the running transaction back, so nothing was saved partially.
 */
export function isConnectionLost(error: unknown): boolean {
  const code = errorCode(error);
  const errno = errorNumber(error);
  if (
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'ETIMEDOUT' ||
    code === 'PROTOCOL_CONNECTION_LOST' ||
    code === 'ER_SERVER_SHUTDOWN' ||
    code === 'ER_CONNECTION_KILLED' ||
    code === '57P01' || // PostgreSQL admin_shutdown
    code === '57P02' || // crash_shutdown
    code === '57P03' || // cannot_connect_now
    code === '08006' || // connection_failure
    code === '08003' || // connection_does_not_exist
    code === '08001' ||
    errno === 1927 ||
    errno === 1053 ||
    errno === 2013 ||
    errno === 2006
  ) {
    return true;
  }
  const message = error instanceof Error ? error.message : '';
  const name = error instanceof Error ? error.name : '';
  // TypeORM releases the query runner of a broken connection; later statements fail with this
  if (/QueryRunner.*AlreadyReleased/.test(name)) return true;
  return /connection terminated|connection.*(closed|lost|reset)|can't add new command|terminating connection|server has gone away/i.test(
    message,
  );
}

/** Is this a unique-key violation (duplicate key)? */
export function isUniqueViolation(error: unknown): boolean {
  const code = errorCode(error);
  return (
    code === '23505' || // PostgreSQL unique_violation
    code === 'ER_DUP_ENTRY' ||
    errorNumber(error) === 1062 ||
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
  );
}

/** Network-level failures shared by all server drivers (Node error codes). */
export function classifyNetworkError(
  code: string | undefined,
  host: string,
  message = '',
): ClassifiedError | null {
  // the drivers report a connect timeout without a code ("timeout expired", "connection timeout")
  if (code === undefined && /time(d)? ?out/i.test(message)) code = 'ETIMEDOUT';
  switch (code) {
    case 'ECONNREFUSED':
      return {
        stage: 'reachable',
        message: `Der Server ${host} nimmt keine Verbindung an. Läuft der Datenbankserver, und stimmen Adresse und Port?`,
      };
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return {
        stage: 'reachable',
        message: `Der Server ${host} wurde nicht gefunden. Bitte die Adresse prüfen.`,
      };
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return {
        stage: 'reachable',
        message: `Der Server ${host} antwortet nicht (Zeitüberschreitung). Netzwerk oder Firewall prüfen.`,
      };
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY':
    case 'CERT_HAS_EXPIRED':
    case 'CERT_NOT_YET_VALID':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return {
        stage: 'reachable',
        message:
          `Dem Zertifikat des Servers ${host} wird nicht vertraut (unbekannte Stelle, abgelaufen oder falscher Name). ` +
          'Hinterlegen Sie in den Einstellungen das CA-Zertifikat Ihres Servers.',
      };
    default:
      return null;
  }
}
