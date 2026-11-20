import 'reflect-metadata';
import { DataSource, type MigrationInterface } from 'typeorm';
import { CustomerEntity } from './entities/customer.entity';
import { InvoiceEntity } from './entities/invoice.entity';
import { InvoiceItemEntity } from './entities/invoice-item.entity';
import { NumberCounterEntity } from './entities/number-counter.entity';
import { SettingsEntity } from './entities/settings.entity';
import { sqliteOptions } from './sqlite-adapter';

export const DB_FILENAME = 'swissbill.db';

type MigrationClass = new () => MigrationInterface;

const migrationModules = import.meta.glob<Record<string, unknown>>('./migrations/*.ts', { eager: true });

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
 * Creates the DataSource (without opening it). `path` is the full file path (in production the
 * Electron `userData` folder) or `:memory:` for tests. The schema never changes automatically:
 * `synchronize` and `migrationsRun` are off, changes only happen through the migrations.
 */
export function createDataSource(
  path: string,
  migrations: readonly MigrationClass[] = loadMigrations(),
): DataSource {
  return new DataSource({
    ...sqliteOptions(path),
    entities: [CustomerEntity, InvoiceEntity, InvoiceItemEntity, SettingsEntity, NumberCounterEntity],
    migrations: [...migrations],
    synchronize: false,
    migrationsRun: false,
    migrationsTransactionMode: 'each',
  });
}
