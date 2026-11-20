import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { Client } from 'pg';
import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe } from 'vitest';
import type { DbAdapter, DbTarget } from '../../../src/main/db/adapters';
import { adapterFor } from '../../../src/main/db/adapters';
import { createDataSourceFor } from '../../../src/main/db/data-source';
import { openDatabase } from '../../../src/main/db/startup';
import type { DbConnectionSettings, DbType } from '@shared/domain/db-connection';
import { setTestDbProvider } from '../../fixtures/db';

/**
 * Database targets for the matrix tests. SQLite always runs; a server runs only when its admin URL is set
 * (the user must be allowed to create databases; every test gets its own fresh database):
 *
 *   SWISSBILL_TEST_PG_URL=postgres://swissbill:test@localhost:55432/swissbill
 *   SWISSBILL_TEST_MYSQL_URL=mysql://root:root@localhost:53306/
 *   SWISSBILL_TEST_MARIADB_URL=mysql://root:root@localhost:53307/
 */
export const TARGET_NAMES: readonly DbType[] = ['sqlite', 'postgres', 'mysql', 'mariadb'];

const ENV: Record<Exclude<DbType, 'sqlite'>, string> = {
  postgres: 'SWISSBILL_TEST_PG_URL',
  mysql: 'SWISSBILL_TEST_MYSQL_URL',
  mariadb: 'SWISSBILL_TEST_MARIADB_URL',
};

export function adminUrl(name: DbType): string | undefined {
  return name === 'sqlite' ? undefined : process.env[ENV[name]] || undefined;
}

export function isAvailable(name: DbType): boolean {
  return name === 'sqlite' || adminUrl(name) !== undefined;
}

/** A fresh, empty and unmigrated database plus ways to open it as several "devices". */
export interface TestDb {
  name: DbType;
  adapter: DbAdapter;
  target: DbTarget;
  /** Fresh migrated connection (a device). Closed by `close()`. */
  open(): Promise<DataSource>;
  /** Opens without migrating anything (to test failures); throws `DatabaseStartupError`. */
  openRaw(): Promise<DataSource>;
  /** Runs SQL as the database administrator inside the test database (for setup such as foreign tables). */
  admin(sql: string): Promise<void>;
  /** Runs SQL as the administrator on the server, outside the test database (users, roles). Servers only. */
  serverAdmin(sql: string): Promise<void>;
  /** Server only: the server drops every open connection to the test database (like a network failure). */
  killConnections(): Promise<void>;
  /** Closes all connections and removes the database. */
  close(): Promise<void>;
}

function settingsFor(name: DbType, url: URL, database: string): DbConnectionSettings {
  return {
    type: name,
    host: url.hostname,
    port: Number(url.port) || (name === 'postgres' ? 5432 : 3306),
    database,
    user: decodeURIComponent(url.username),
    tls: { enabled: false, caPath: null },
  };
}

export async function createTestDatabase(name: DbType): Promise<TestDb> {
  const adapter = await adapterFor(name);
  const opened: DataSource[] = [];
  const open = async (migrate: boolean, target: DbTarget) => {
    // Raw: only connect, no schema checks and no migrations (to inspect or break things)
    const dataSource = migrate
      ? await openDatabase(adapter, target)
      : await createDataSourceFor(adapter, target, []).initialize();
    opened.push(dataSource);
    return dataSource;
  };

  if (name === 'sqlite') {
    const dir = mkdtempSync(join(tmpdir(), 'swissbill-matrix-'));
    const target: DbTarget = { kind: 'file', path: join(dir, 'swissbill.db') };
    return {
      name,
      adapter,
      target,
      open: () => open(true, target),
      openRaw: () => open(false, target),
      admin: async (sql) => {
        const ds = opened[0] ?? (await open(false, target));
        await ds.query(sql);
      },
      serverAdmin: async () => {
        throw new Error('SQLite hat keinen Server.');
      },
      killConnections: async () => {
        throw new Error('SQLite hat keinen Server.');
      },
      close: async () => {
        await Promise.all(opened.map((d) => (d.isInitialized ? d.destroy() : undefined)));
        rmSync(dir, { recursive: true, force: true });
      },
    };
  }

  const url = new URL(adminUrl(name) as string);
  const password = decodeURIComponent(url.password);
  const database = `swissbill_t_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const admin = async (sql: string, db?: string) => {
    if (name === 'postgres') {
      const client = new Client({
        host: url.hostname,
        port: Number(url.port) || 5432,
        user: decodeURIComponent(url.username),
        password,
        database: db ?? (url.pathname.slice(1) || 'postgres'),
      });
      await client.connect();
      try {
        await client.query(sql);
      } finally {
        await client.end();
      }
    } else {
      const connection = await mysql.createConnection({
        host: url.hostname,
        port: Number(url.port) || 3306,
        user: decodeURIComponent(url.username),
        password,
        ...(db ? { database: db } : {}),
      });
      try {
        await connection.query(sql);
      } finally {
        await connection.end();
      }
    }
  };
  await admin(`CREATE DATABASE ${name === 'postgres' ? `"${database}"` : `\`${database}\``}`);
  const target: DbTarget = {
    kind: 'server',
    settings: settingsFor(name, url, database),
    password,
  };
  return {
    name,
    adapter,
    target,
    open: () => open(true, target),
    openRaw: () => open(false, target),
    admin: (sql) => admin(sql, database),
    serverAdmin: (sql) => admin(sql),
    killConnections: async () => {
      if (name === 'postgres') {
        await admin(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${database}' AND pid <> pg_backend_pid()`,
        );
        return;
      }
      const connection = await mysql.createConnection({
        host: url.hostname,
        port: Number(url.port) || 3306,
        user: decodeURIComponent(url.username),
        password,
      });
      try {
        const [rows] = await connection.query(
          'SELECT ID AS id FROM information_schema.PROCESSLIST WHERE DB = ?',
          [database],
        );
        for (const row of rows as { id: number }[]) {
          await connection.query(`KILL ${Number(row.id)}`).catch(() => undefined);
        }
      } finally {
        await connection.end();
      }
    },
    close: async () => {
      await Promise.all(opened.map((d) => (d.isInitialized ? d.destroy() : undefined)));
      await admin(
        name === 'postgres'
          ? `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`
          : `DROP DATABASE IF EXISTS \`${database}\``,
      );
    },
  };
}

/**
 * Runs the tests once per database type; types without a configured server are reported as skipped.
 * `fn` receives the type and a factory for fresh databases (closed automatically by the caller).
 */
export function describeMatrix(
  title: string,
  fn: (name: DbType, create: () => Promise<TestDb>) => void,
): void {
  for (const name of TARGET_NAMES) {
    describe.skipIf(!isAvailable(name))(`${title} [${name}]`, () => {
      fn(name, () => createTestDatabase(name));
    });
  }
}

/**
 * For tests written against `createTestDb()`: runs them once per database type. Inside, `createTestDb()` returns
 * a fresh database of the current type (SQLite stays in memory, servers get their own database per call).
 */
export function describeMatrixDb(title: string, fn: (name: DbType) => void): void {
  for (const name of TARGET_NAMES) {
    describe.skipIf(!isAvailable(name))(`${title} [${name}]`, () => {
      const created: TestDb[] = [];
      beforeEach(() => {
        if (name === 'sqlite') return;
        setTestDbProvider(async () => {
          const target = await createTestDatabase(name);
          created.push(target);
          return target.open();
        });
      });
      afterEach(async () => {
        setTestDbProvider(null);
        await Promise.all(created.splice(0).map((target) => target.close()));
      });
      fn(name);
    });
  }
}
