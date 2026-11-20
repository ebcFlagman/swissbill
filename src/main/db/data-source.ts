import 'reflect-metadata';
import { DataSource, type MigrationInterface } from 'typeorm';
import { CustomerEntity } from './entities/customer.entity';
import { InvoiceEntity } from './entities/invoice.entity';
import { InvoiceItemEntity } from './entities/invoice-item.entity';
import { NumberCounterEntity } from './entities/number-counter.entity';
import { PostgresSettingsEntity, SettingsEntity } from './entities/settings.entity';
import type { DbAdapter, DbTarget } from './adapters';
import { sqliteAdapter } from './adapters/sqlite';

export const DB_FILENAME = 'swissbill.db';

type MigrationClass = new () => MigrationInterface;

const migrationModules = import.meta.glob<Record<string, unknown>>('./migrations/*.ts', {
  eager: true,
});

/** The bundled TypeORM migrations, sorted by the timestamp in the class name. */
export function loadMigrations(): MigrationClass[] {
  const classes = Object.values(migrationModules).flatMap((mod) =>
    Object.values(mod).filter((value): value is MigrationClass => typeof value === 'function'),
  );
  return classes.sort((a, b) => timestampOf(a.name) - timestampOf(b.name));
}

/** Timestamp at the end of the class name (`InitSchema1700000000001` → 1700000000001). */
export function timestampOf(name: string): number {
  const match = /(\d{13})$/.exec(name);
  if (!match) throw new Error(`Ungültiger Migrationsname: ${name}`);
  return Number(match[1]);
}

/**
 * Creates the DataSource for any adapter (without opening it). The schema never changes automatically:
 * `synchronize` and `migrationsRun` are off, changes only happen through the migrations.
 */
export function createDataSourceFor(
  adapter: DbAdapter,
  target: DbTarget,
  migrations: readonly MigrationClass[] = loadMigrations(),
): DataSource {
  return new DataSource({
    ...adapter.dataSourceOptions(target),
    entities: [
      CustomerEntity,
      InvoiceEntity,
      InvoiceItemEntity,
      adapter.type === 'postgres' ? PostgresSettingsEntity : SettingsEntity,
      NumberCounterEntity,
    ],
    migrations: [...migrations],
    synchronize: false,
    migrationsRun: false,
    migrationsTransactionMode: 'each',
  });
}

/**
 * Creates the local SQLite DataSource. `path` is the full file path (in production the Electron
 * `userData` folder) or `:memory:` for tests.
 */
export function createDataSource(
  path: string,
  migrations: readonly MigrationClass[] = loadMigrations(),
): DataSource {
  return createDataSourceFor(sqliteAdapter, { kind: 'file', path }, migrations);
}
