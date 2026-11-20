import { existsSync } from 'node:fs';
import { Table, type DataSource } from 'typeorm';
import { createDataSource, loadMigrations, timestampOf } from './data-source';
import {
  copyBeforeMigration,
  isCorruption,
  isFileDatabase,
  readLegacyVersion,
  verifyIntegrity,
} from './sqlite-adapter';

export type StartupErrorKind = 'corrupt' | 'unreadable' | 'too-new' | 'migration';

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
function checkFile(path: string): void {
  try {
    verifyIntegrity(path);
  } catch (error) {
    if (isCorruption(error)) {
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

async function executedMigrations(dataSource: DataSource): Promise<string[]> {
  const rows = (await dataSource.query(`SELECT "name" FROM "${MIGRATIONS_TABLE}" ORDER BY "id"`)) as {
    name: string;
  }[];
  return rows.map((r) => r.name);
}

/**
 * Takes over a database from before TypeORM (tables present, but no migrations table):
 * the first migrations count as executed, the data stays untouched. A copy is made beforehand.
 */
async function adoptLegacyDatabase(dataSource: DataSource, path: string): Promise<boolean> {
  const queryRunner = dataSource.createQueryRunner();
  if ((await queryRunner.hasTable(MIGRATIONS_TABLE)) || !(await queryRunner.hasTable('invoices'))) return false;
  const version = await readLegacyVersion(dataSource);
  if (version < 1) return false; // no known state: the migrations run normally (and fail in an orderly way)
  if (version > LEGACY_BASELINE.length) {
    throw new Error(
      `Die Datenbank (Version ${version}) ist neuer als diese Programmversion (Version ${LEGACY_BASELINE.length}). ` +
        'Bitte die Anwendung aktualisieren.',
    );
  }
  copyBeforeMigration(path, version);
  await queryRunner.startTransaction();
  try {
    await queryRunner.createTable(
      new Table({
        name: MIGRATIONS_TABLE,
        columns: [
          { name: 'id', type: 'integer', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
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
}

/** Prepares an opened database and applies pending TypeORM migrations. */
async function migrate(dataSource: DataSource, path: string, existed: boolean): Promise<void> {
  const known = dataSource.migrations.map((m) => m.name ?? m.constructor.name);
  const copied = await adoptLegacyDatabase(dataSource, path);

  const hasTable = await dataSource.createQueryRunner().hasTable(MIGRATIONS_TABLE);
  const executed = hasTable ? await executedMigrations(dataSource) : [];
  if (executed.some((name) => !known.includes(name))) {
    throw new Error(
      `Die Datenbank (Version ${executed.length}) ist neuer als diese Programmversion (Version ${known.length}). ` +
        'Bitte die Anwendung aktualisieren.',
    );
  }
  const pending = known.filter((name) => !executed.includes(name));
  if (pending.length === 0) return;
  if (existed && !copied && executed.length > 0) copyBeforeMigration(path, executed.length);
  await dataSource.runMigrations({ transaction: 'each' });
}

/**
 * Opens the database and applies pending migrations.
 * - If the file is missing, it is the first start: a new database is created.
 * - A corrupt, unreadable or too new file is never changed or overwritten.
 * - A file from before TypeORM is taken over with a copy and without data loss.
 */
export async function openAndMigrate(
  path: string,
  migrations: ReturnType<typeof loadMigrations> = loadMigrations(),
): Promise<DataSource> {
  const existed = isFileDatabase(path) && existsSync(path);
  if (existed) checkFile(path);

  const dataSource = createDataSource(path, migrations);
  try {
    await dataSource.initialize();
    await migrate(dataSource, path, existed);
    return dataSource;
  } catch (error) {
    if (dataSource.isInitialized) await dataSource.destroy();
    if (error instanceof DatabaseStartupError) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    if (/neuer als/.test(reason)) {
      throw new DatabaseStartupError('too-new', path, `${reason}\n\n${path}\n${UNTOUCHED}`);
    }
    throw new DatabaseStartupError(
      'migration',
      path,
      `Die Datenbank konnte nicht aktualisiert werden (${reason}).\n\n${path}\n` +
        'Die Änderungen wurden zurückgerollt. Vor jeder Aktualisierung wird eine Kopie (swissbill.db.bak-<Version>) angelegt.',
    );
  }
}
