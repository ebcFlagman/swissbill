import { existsSync } from 'node:fs';
import { Table, type DataSource } from 'typeorm';
import type { DbAdapter, DbTarget } from './adapters';
import { sqliteAdapter, readLegacyVersion } from './adapters/sqlite';
import { createDataSourceFor, loadMigrations, timestampOf } from './data-source';

export type StartupErrorKind =
  | 'corrupt'
  | 'unreadable'
  | 'too-new'
  | 'migration'
  // Server databases (feature 006)
  | 'foreign'
  | 'connection';

/** The database cannot be started. The message is meant for the user (German). */
export class DatabaseStartupError extends Error {
  constructor(
    readonly kind: StartupErrorKind,
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'DatabaseStartupError';
  }
}

const UNTOUCHED = 'Es wurde nichts verändert und nichts überschrieben.';
const MIGRATIONS_TABLE = 'migrations';
/** Databases from before the switch to TypeORM: migration 001 (base schema) and 002 (Geoapify key). */
const LEGACY_BASELINE = ['InitSchema1700000000001', 'AddGeoapifyKey1700000000002'];

/** Checks an existing file read-only before anything about it is changed. */
function checkFile(adapter: DbAdapter, path: string): void {
  const file = adapter.file;
  if (!file) return;
  try {
    file.verifyIntegrity(path);
  } catch (error) {
    if (file.isCorruption(error)) {
      throw new DatabaseStartupError(
        'corrupt',
        path,
        `Die Datenbank ist beschädigt oder keine gültige SwissBill-Datenbank:\n${path}\n\n${UNTOUCHED} ` +
          'Stellen Sie die Datei aus einer Sicherung wieder her (Datei swissbill.db ersetzen) oder wenden Sie ' +
          'sich an den Support.',
      );
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new DatabaseStartupError(
      'unreadable',
      path,
      `Die Datenbankdatei kann nicht gelesen werden:\n${path}\n(${reason})\n\n${UNTOUCHED}`,
    );
  }
}

export async function executedMigrations(dataSource: DataSource): Promise<string[]> {
  const escape = (name: string) => dataSource.driver.escape(name);
  const rows = (await dataSource.query(
    `SELECT ${escape('name')} FROM ${escape(MIGRATIONS_TABLE)} ORDER BY ${escape('id')}`,
  )) as { name: string }[];
  return rows.map((r) => r.name);
}

/**
 * Takes over a database from before TypeORM (tables present, but no migrations table):
 * the first migrations count as executed, the data stays untouched. A copy is made beforehand.
 * Only exists for local SQLite files.
 */
async function adoptLegacyDatabase(
  adapter: DbAdapter,
  dataSource: DataSource,
  path: string,
): Promise<boolean> {
  const queryRunner = dataSource.createQueryRunner();
  try {
    if ((await queryRunner.hasTable(MIGRATIONS_TABLE)) || !(await queryRunner.hasTable('invoices')))
      return false;
    const version = await readLegacyVersion(dataSource);
    if (version < 1) return false; // no known state: the foreign-database check decides
    if (version > LEGACY_BASELINE.length) {
      throw new Error(
        `Die Datenbank (Version ${version}) ist neuer als diese Programmversion (Version ${LEGACY_BASELINE.length}). ` +
          'Bitte die Anwendung aktualisieren.',
      );
    }
    adapter.file?.copyBeforeMigration(path, version);
    await queryRunner.startTransaction();
    try {
      await queryRunner.createTable(
        new Table({
          name: MIGRATIONS_TABLE,
          columns: [
            {
              name: 'id',
              type: 'integer',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            { name: 'timestamp', type: 'bigint' },
            { name: 'name', type: 'varchar' },
          ],
        }),
      );
      for (const name of LEGACY_BASELINE.slice(0, version)) {
        await queryRunner.manager
          .createQueryBuilder()
          .insert()
          .into(MIGRATIONS_TABLE, ['timestamp', 'name'])
          .values({ timestamp: timestampOf(name), name })
          .execute();
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
    return true;
  } finally {
    await queryRunner.release();
  }
}

/** Raised inside the migration step; mapped to a `DatabaseStartupError` by `openDatabase`. */
class ForeignDatabaseError extends Error {}

/** Prepares an opened database and applies pending TypeORM migrations (under the adapter's lock). */
async function migrate(
  adapter: DbAdapter,
  dataSource: DataSource,
  target: DbTarget,
  existed: boolean,
): Promise<void> {
  await adapter.withMigrationLock(dataSource, async () => {
    const known = dataSource.migrations.map((m) => m.name ?? m.constructor.name);
    const path = target.kind === 'file' ? target.path : '';
    const copied =
      target.kind === 'file' ? await adoptLegacyDatabase(adapter, dataSource, path) : false;

    const hasTable = await dataSource.createQueryRunner().hasTable(MIGRATIONS_TABLE);
    if (!hasTable && (await adapter.countForeignTables(dataSource)) > 0) {
      throw new ForeignDatabaseError('Die Datenbank enthält fremde Tabellen.');
    }
    // Read the state again under the lock: another device may just have migrated (FR-010a)
    const executed = hasTable ? await executedMigrations(dataSource) : [];
    if (executed.some((name) => !known.includes(name))) {
      throw new Error(
        `Die Datenbank (Version ${executed.length}) ist neuer als diese Programmversion (Version ${known.length}). ` +
          'Bitte die Anwendung aktualisieren.',
      );
    }
    const pending = known.filter((name) => !executed.includes(name));
    if (pending.length === 0) return;
    if (existed && !copied && executed.length > 0) {
      adapter.file?.copyBeforeMigration(path, executed.length);
    }
    await dataSource.runMigrations({ transaction: 'each' });
  });
}

/** Human-readable place of the database for messages: the file path, or `host/database` for a server. */
export function describeTarget(target: DbTarget): string {
  return target.kind === 'file'
    ? target.path
    : `${target.settings.host}:${target.settings.port}/${target.settings.database}`;
}

/**
 * Opens the database of any adapter and applies pending migrations.
 * - If a local file is missing, it is the first start: a new database is created. An empty server
 *   database gets the schema.
 * - A corrupt, unreadable, too new or foreign (non-empty, not ours) database is never changed.
 * - A file from before TypeORM is taken over with a copy and without data loss.
 * - Connection problems on a server are reported as `connection` with a message without credentials.
 */
export async function openDatabase(
  adapter: DbAdapter,
  target: DbTarget,
  migrations: ReturnType<typeof loadMigrations> = loadMigrations(),
): Promise<DataSource> {
  const place = describeTarget(target);
  const existed =
    target.kind === 'file' &&
    !!adapter.file?.isFileDatabase(target.path) &&
    existsSync(target.path);
  if (existed && target.kind === 'file') checkFile(adapter, target.path);

  let dataSource: DataSource;
  try {
    dataSource = createDataSourceFor(adapter, target, migrations);
  } catch (error) {
    // e.g. the CA certificate file is gone: a clear message instead of a raw error
    throw new DatabaseStartupError('connection', place, reasonOfOptions(error));
  }
  try {
    await dataSource.initialize();
  } catch (error) {
    const context =
      target.kind === 'server'
        ? { host: target.settings.host, database: target.settings.database }
        : undefined;
    const classified = adapter.classifyError(error, context);
    throw new DatabaseStartupError('connection', place, classified.message);
  }
  try {
    await migrate(adapter, dataSource, target, existed);
    return dataSource;
  } catch (error) {
    if (dataSource.isInitialized) await dataSource.destroy();
    if (error instanceof DatabaseStartupError) throw error;
    if (error instanceof ForeignDatabaseError) {
      throw new DatabaseStartupError(
        'foreign',
        place,
        `Die Datenbank enthält Tabellen, die nicht von SwissBill stammen:\n${place}\n\n${UNTOUCHED} ` +
          'Bitte eine leere Datenbank verwenden.',
      );
    }
    const reason = error instanceof Error ? error.message : String(error);
    if (/neuer als/.test(reason)) {
      throw new DatabaseStartupError('too-new', place, `${reason}\n\n${place}\n${UNTOUCHED}`);
    }
    const detail =
      target.kind === 'file'
        ? 'Die Änderungen wurden zurückgerollt. Vor jeder Aktualisierung wird eine Kopie (swissbill.db.bak-<Version>) angelegt.'
        : 'Die Aktualisierung kann beim nächsten Start fortgesetzt werden. Bitte das Problem beheben und die App neu starten.';
    throw new DatabaseStartupError(
      'migration',
      place,
      `Die Datenbank konnte nicht aktualisiert werden (${reason}).\n\n${place}\n${detail}`,
    );
  }
}

/** The user-facing reason when the connection options cannot be built. */
function reasonOfOptions(error: unknown): string {
  return error instanceof Error ? error.message : 'Die Verbindungsangaben sind nicht verwendbar.';
}

/** Opens the local SQLite database at `path` (or `:memory:` in tests). */
export function openAndMigrate(
  path: string,
  migrations: ReturnType<typeof loadMigrations> = loadMigrations(),
): Promise<DataSource> {
  return openDatabase(sqliteAdapter, { kind: 'file', path }, migrations);
}
