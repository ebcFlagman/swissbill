/** MySQL and MariaDB adapter (both use the `mysql2` driver; the only place that knows their specifics). */
import type { DataSource, DataSourceOptions } from 'typeorm';
import type { DbType } from '@shared/domain/db-connection';
import {
  classifyNetworkError,
  errorCode,
  errorNumber,
  type ClassifiedError,
  type DbAdapter,
  type DbTarget,
  type ErrorContext,
} from './index';
import { readCaFile } from '../ca-file';

const MIGRATION_LOCK_NAME = 'swissbill-migrate';
const MIGRATION_LOCK_WAIT_SECONDS = 60;
const CONNECT_TIMEOUT_MS = 10_000;
const POOL_MAX = 4;

function dataSourceOptions(type: 'mysql' | 'mariadb') {
  return (target: DbTarget): DataSourceOptions => {
    if (target.kind !== 'server') throw new Error('MySQL/MariaDB braucht eine Serververbindung.');
    const { settings, password } = target;
    const ssl = settings.tls.enabled
      ? {
          rejectUnauthorized: true,
          ...(settings.tls.caPath ? { ca: readCaFile(settings.tls.caPath) } : {}),
        }
      : undefined;
    return {
      type,
      host: settings.host,
      port: settings.port,
      username: settings.user,
      password: password ?? undefined,
      database: settings.database,
      charset: 'utf8mb4',
      connectTimeout: CONNECT_TIMEOUT_MS,
      ...(ssl ? { ssl } : {}),
      extra: { connectionLimit: POOL_MAX },
    };
  };
}

/** `GET_LOCK` belongs to one connection, so it is taken and released on the same query runner. */
async function withMigrationLock<T>(dataSource: DataSource, work: () => Promise<T>): Promise<T> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    const rows = (await runner.query('SELECT GET_LOCK(?, ?) AS l', [
      MIGRATION_LOCK_NAME,
      MIGRATION_LOCK_WAIT_SECONDS,
    ])) as { l: number | string | null }[];
    if (Number(rows[0]?.l) !== 1) {
      throw new Error(
        'Ein anderes Gerät aktualisiert die Datenbank gerade. Bitte später erneut versuchen.',
      );
    }
    try {
      return await work();
    } finally {
      await runner.query('SELECT RELEASE_LOCK(?)', [MIGRATION_LOCK_NAME]);
    }
  } finally {
    await runner.release();
  }
}

async function countForeignTables(dataSource: DataSource): Promise<number> {
  const rows = (await dataSource.query(
    `SELECT COUNT(*) AS n FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name <> 'migrations'`,
  )) as { n: string | number }[];
  return Number(rows[0]?.n ?? 0);
}

function expiredCondition(column: string, ttlSeconds: number): string {
  return `\`${column}\` < (CURRENT_TIMESTAMP - INTERVAL ${Math.trunc(ttlSeconds)} SECOND)`;
}

function classifyError(error: unknown, context?: ErrorContext): ClassifiedError {
  const host = context?.host ?? 'dem Server';
  const database = context?.database ?? 'der Datenbank';
  const code = errorCode(error);
  const network = classifyNetworkError(code, host, error instanceof Error ? error.message : '');
  if (network) return network;
  const errno = errorNumber(error);
  if (code === 'ER_ACCESS_DENIED_ERROR' || errno === 1045) {
    return {
      stage: 'authentication',
      message: 'Anmeldung fehlgeschlagen: Benutzer oder Passwort sind falsch.',
    };
  }
  if (code === 'ER_BAD_DB_ERROR' || errno === 1049) {
    return {
      stage: 'database',
      message: `Die Datenbank «${database}» existiert auf dem Server nicht.`,
    };
  }
  if (
    code === 'ER_DBACCESS_DENIED_ERROR' ||
    code === 'ER_TABLEACCESS_DENIED_ERROR' ||
    errno === 1044 ||
    errno === 1142
  ) {
    return {
      stage: 'permissions',
      message: `Dem Benutzer fehlen die Rechte, in der Datenbank «${database}» Tabellen anzulegen und zu ändern.`,
    };
  }
  return { stage: 'reachable', message: `Die Verbindung zu ${host} ist fehlgeschlagen.` };
}

/** `mysql` and `mariadb` differ only in the TypeORM type; the driver and the SQL used are the same. */
export function mysqlAdapter(type: Extract<DbType, 'mysql' | 'mariadb'>): DbAdapter {
  return {
    type,
    dataSourceOptions: dataSourceOptions(type),
    withMigrationLock,
    countForeignTables,
    expiredCondition,
    classifyError,
  };
}
