/** PostgreSQL adapter (the only place that knows PostgreSQL specifics). */
import type { DataSource, DataSourceOptions } from 'typeorm';
import {
  classifyNetworkError,
  errorCode,
  type ClassifiedError,
  type DbAdapter,
  type DbTarget,
  type ErrorContext,
} from './index';
import { readCaFile } from '../ca-file';

/** Fixed key of the advisory lock that serialises schema migrations. */
const MIGRATION_LOCK_KEY = 7352001;
const CONNECT_TIMEOUT_MS = 10_000;
const POOL_MAX = 4;

function dataSourceOptions(target: DbTarget): DataSourceOptions {
  if (target.kind !== 'server') throw new Error('PostgreSQL braucht eine Serververbindung.');
  const { settings, password } = target;
  const ssl = settings.tls.enabled
    ? {
        rejectUnauthorized: true,
        ...(settings.tls.caPath ? { ca: readCaFile(settings.tls.caPath) } : {}),
      }
    : false;
  return {
    type: 'postgres',
    host: settings.host,
    port: settings.port,
    username: settings.user,
    password: password ?? undefined,
    database: settings.database,
    ssl,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    extra: { max: POOL_MAX, connectionTimeoutMillis: CONNECT_TIMEOUT_MS },
  };
}

/** The advisory lock belongs to one connection, so it is taken and released on the same query runner. */
async function withMigrationLock<T>(dataSource: DataSource, work: () => Promise<T>): Promise<T> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    await runner.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      return await work();
    } finally {
      await runner.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
  } finally {
    await runner.release();
  }
}

async function countForeignTables(dataSource: DataSource): Promise<number> {
  const rows = (await dataSource.query(
    `SELECT COUNT(*) AS n FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name <> 'migrations'`,
  )) as { n: string | number }[];
  return Number(rows[0]?.n ?? 0);
}

function expiredCondition(column: string, ttlSeconds: number): string {
  return `"${column}" < CURRENT_TIMESTAMP - INTERVAL '${Math.trunc(ttlSeconds)} seconds'`;
}

function classifyError(error: unknown, context?: ErrorContext): ClassifiedError {
  const host = context?.host ?? 'dem Server';
  const database = context?.database ?? 'der Datenbank';
  const code = errorCode(error);
  const network = classifyNetworkError(code, host, error instanceof Error ? error.message : '');
  if (network) return network;
  switch (code) {
    case '28P01':
    case '28000':
      return {
        stage: 'authentication',
        message: 'Anmeldung fehlgeschlagen: Benutzer oder Passwort sind falsch.',
      };
    case '3D000':
      return {
        stage: 'database',
        message: `Die Datenbank «${database}» existiert auf dem Server nicht.`,
      };
    case '42501':
      return {
        stage: 'permissions',
        message: `Dem Benutzer fehlen die Rechte, in der Datenbank «${database}» Tabellen anzulegen und zu ändern.`,
      };
    default:
      return {
        stage: 'reachable',
        message: `Die Verbindung zu ${host} ist fehlgeschlagen.`,
      };
  }
}

export const postgresAdapter: DbAdapter = {
  type: 'postgres',
  dataSourceOptions,
  withMigrationLock,
  countForeignTables,
  expiredCondition,
  classifyError,
};
