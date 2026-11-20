import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { isServerType, type DbConnectionSettings } from '@shared/domain/db-connection';
import type { DbConnectionTestResult, FailedStage, SchemaState } from '@shared/ipc/db-connection';
import { adapterFor, type DbAdapter, type DbTarget } from './adapters';
import { readConnectionConfig } from './connection-config';
import { DB_FILENAME, loadMigrations } from './data-source';
import { DatabaseStartupError, describeTarget, executedMigrations, openDatabase } from './startup';

/** The opened database and what it is. */
export interface ActiveDatabase {
  dataSource: DataSource;
  adapter: DbAdapter;
  kind: 'local' | 'server';
  /** Full file path for the local database, `host:port/database` for a server (no credentials) */
  place: string;
}

export interface OpenActiveDeps {
  /** The Electron `userData` folder: holds `db-connection.json` and the local database file */
  dir: string;
  /** The password from the OS keychain, only called for a server connection that expects one */
  resolvePassword: () => Promise<string | null>;
}

/**
 * Opens the database the user configured: the server from `db-connection.json` (password from the keychain)
 * or, without a connection file, the local SQLite database. Without a configuration no server driver is loaded
 * and no network connection is made (FR-002). A broken connection file or a missing password never falls back
 * silently to another database: the caller gets a `DatabaseStartupError`.
 */
export async function openActiveDatabase(deps: OpenActiveDeps): Promise<ActiveDatabase> {
  const config = readConnectionConfig(deps.dir);

  if (config.kind === 'unsupported-version' || config.kind === 'invalid') {
    throw new DatabaseStartupError(
      'connection',
      join(deps.dir, 'db-connection.json'),
      config.kind === 'unsupported-version'
        ? `Die Verbindungsdatei (db-connection.json) stammt aus einer neueren Programmversion (Version ${config.version}). Bitte die Anwendung aktualisieren.`
        : 'Die Verbindungsdatei (db-connection.json) ist beschädigt. Bitte die Verbindung in den Einstellungen neu eingeben.',
    );
  }

  if (config.kind === 'none' || !isServerType(config.settings.type)) {
    return openLocal(deps.dir);
  }

  const { settings } = config;
  const place = describeTarget({ kind: 'server', settings, password: null });
  let password: string | null = null;
  if (config.auth === 'keychain') {
    password = await deps.resolvePassword();
    if (password === null) {
      // never connect without the password the user stored
      throw new DatabaseStartupError(
        'connection',
        place,
        'Das Datenbankpasswort fehlt im Schlüsselbund dieses Geräts (anderer Benutzer oder Eintrag gelöscht). ' +
          'Bitte das Passwort in den Einstellungen neu eingeben.',
      );
    }
  }
  const adapter = await adapterFor(settings.type);
  const target: DbTarget = { kind: 'server', settings, password };
  const dataSource = await openDatabase(adapter, target);
  return { dataSource, adapter, kind: 'server', place };
}

/** Opens the local SQLite database in the data folder. */
export async function openLocal(dir: string): Promise<ActiveDatabase> {
  const adapter = await adapterFor('sqlite');
  const path = join(dir, DB_FILENAME);
  const dataSource = await openDatabase(adapter, { kind: 'file', path });
  return { dataSource, adapter, kind: 'local', place: path };
}

const PROBE_TABLE = 'swissbill_probe';

function failure(
  stage: FailedStage,
  message: string,
  schema: SchemaState = 'unknown',
): DbConnectionTestResult {
  return { ok: false, failedStage: stage, message, schema };
}

/** Tells how the schema of a reachable database relates to this program version. */
async function inspectSchema(adapter: DbAdapter, dataSource: DataSource): Promise<SchemaState> {
  const runner = dataSource.createQueryRunner();
  try {
    if (!(await runner.hasTable('migrations'))) {
      return (await adapter.countForeignTables(dataSource)) === 0 ? 'empty' : 'foreign';
    }
  } finally {
    await runner.release();
  }
  const known = loadMigrations().map((m) => m.name);
  const executed = await executedMigrations(dataSource);
  if (executed.some((name) => !known.includes(name))) return 'newer';
  return known.every((name) => executed.includes(name)) ? 'current' : 'older';
}

/**
 * Trial connection in five stages (reachable, login, database, permissions, schema). It changes nothing
 * permanently: the permission probe table is dropped again, and the connection is always closed. Messages never
 * contain the password or the user name.
 */
export async function testConnection(
  settings: DbConnectionSettings,
  password: string | null,
): Promise<DbConnectionTestResult> {
  if (!isServerType(settings.type)) {
    return {
      ok: true,
      failedStage: null,
      message: 'Lokale Datenbank, es wird keine Verbindung benötigt.',
      schema: 'unknown',
    };
  }
  const adapter = await adapterFor(settings.type);
  const context = { host: settings.host, database: settings.database };
  let dataSource: DataSource;
  try {
    dataSource = new DataSource({
      ...adapter.dataSourceOptions({ kind: 'server', settings, password }),
      synchronize: false,
      migrationsRun: false,
    });
  } catch (error) {
    // e.g. the CA certificate file cannot be read
    return failure(
      'reachable',
      error instanceof Error ? error.message : 'Die Verbindungsangaben sind nicht verwendbar.',
    );
  }

  // Stages 1–3: reachable, login, database
  try {
    await dataSource.initialize();
  } catch (error) {
    const { stage, message } = adapter.classifyError(error, context);
    return failure(stage, message);
  }

  try {
    // Stage 4: may the user create and drop tables?
    try {
      await dataSource.query(`CREATE TABLE ${PROBE_TABLE} (id integer)`);
    } catch (error) {
      return failure('permissions', adapter.classifyError(error, context).message);
    } finally {
      await dataSource.query(`DROP TABLE IF EXISTS ${PROBE_TABLE}`).catch(() => undefined);
    }

    // Stage 5: is the schema usable?
    const schema = await inspectSchema(adapter, dataSource);
    switch (schema) {
      case 'foreign':
        return failure(
          'schema',
          `Die Datenbank «${settings.database}» enthält Tabellen, die nicht von SwissBill stammen. Bitte eine leere Datenbank verwenden.`,
          schema,
        );
      case 'newer':
        return failure(
          'schema',
          'Die Datenbank wurde von einer neueren Programmversion angelegt. Bitte die Anwendung aktualisieren.',
          schema,
        );
      case 'empty':
        return {
          ok: true,
          failedStage: null,
          schema,
          message:
            'Verbindung erfolgreich. Die Datenbank ist leer, das Schema wird beim ersten Start angelegt.',
        };
      case 'older':
        return {
          ok: true,
          failedStage: null,
          schema,
          message:
            'Verbindung erfolgreich. Das Schema wird beim nächsten Start auf diese Programmversion aktualisiert.',
        };
      default:
        return {
          ok: true,
          failedStage: null,
          schema,
          message: 'Verbindung erfolgreich. Das Schema ist aktuell.',
        };
    }
  } catch (error) {
    return failure('reachable', adapter.classifyError(error, context).message);
  } finally {
    await dataSource.destroy().catch(() => undefined);
  }
}
