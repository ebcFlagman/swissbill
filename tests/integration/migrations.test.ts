import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MigrationInterface, QueryRunner } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDataSource, loadMigrations } from '../../src/main/db/data-source';
import { DatabaseStartupError, openAndMigrate } from '../../src/main/db/startup';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-migrations-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

class AddNotes1700000000100 implements MigrationInterface {
  name = 'AddNotes1700000000100';
  async up(runner: QueryRunner) {
    await runner.query('CREATE TABLE extra_a (id INTEGER PRIMARY KEY)');
  }
  async down() {}
}

class Broken1700000000200 implements MigrationInterface {
  name = 'Broken1700000000200';
  async up(runner: QueryRunner) {
    await runner.query('CREATE TABLE extra_b (id INTEGER PRIMARY KEY)');
    await runner.query('INSERT INTO does_not_exist VALUES (1)');
  }
  async down() {}
}

const hasTable = async (ds: Awaited<ReturnType<typeof openAndMigrate>>, name: string) =>
  ds.createQueryRunner().hasTable(name);

describe('TypeORM-Migrationen', () => {
  it('die mitgelieferten Migrationen sind nach Zeitstempel sortiert und eindeutig benannt', () => {
    const names = loadMigrations().map((m) => m.name);
    expect(names).toEqual([
      'InitSchema1700000000001',
      'AddGeoapifyKey1700000000002',
      'DropLegacyTriggers1700000000003',
      'AddEditLocks1700000000004',
    ]);
  });

  it('Schemaänderungen laufen nie automatisch (synchronize und migrationsRun sind aus)', () => {
    const ds = createDataSource(':memory:');
    expect(ds.options.synchronize).toBe(false);
    expect(ds.options.migrationsRun).toBe(false);
  });

  it('wendet alle Migrationen auf eine leere Datenbank an und legt die Einstellungszeile an', async () => {
    const db = await openAndMigrate(':memory:');
    expect(await db.query('SELECT COUNT(*) AS n FROM migrations')).toEqual([{ n: 4 }]);
    expect(
      await db.query(
        'SELECT id, sender_country, invoice_prefix, default_payment_days, geoapify_api_key FROM settings',
      ),
    ).toEqual([
      {
        id: 1,
        sender_country: 'CH',
        invoice_prefix: 'RE',
        default_payment_days: 30,
        geoapify_api_key: null,
      },
    ]);
    await db.destroy();
  });

  it('ändert beim erneuten Öffnen nichts und legt keine Kopie an', async () => {
    const file = join(dir, 'swissbill.db');
    await (await openAndMigrate(file)).destroy();
    const again = await openAndMigrate(file);
    expect(await again.query('SELECT COUNT(*) AS n FROM migrations')).toEqual([{ n: 4 }]);
    await again.destroy();
    expect(existsSync(`${file}.bak-4`)).toBe(false);
  });

  it('legt vor einer neuen Migration einer bestehenden Datei eine Kopie mit dem alten Stand an', async () => {
    const file = join(dir, 'swissbill.db');
    await (await openAndMigrate(file)).destroy();

    const db = await openAndMigrate(file, [...loadMigrations(), AddNotes1700000000100]);
    expect(await hasTable(db, 'extra_a')).toBe(true);
    await db.destroy();

    expect(existsSync(`${file}.bak-4`)).toBe(true);
    const copy = await openAndMigrate(`${file}.bak-4`);
    expect(await hasTable(copy, 'extra_a')).toBe(false);
    await copy.destroy();
  });

  it('rollt eine fehlerhafte Migration vollständig zurück', async () => {
    const file = join(dir, 'swissbill.db');
    await (await openAndMigrate(file)).destroy();

    await expect(
      openAndMigrate(file, [...loadMigrations(), Broken1700000000200]),
    ).rejects.toMatchObject({
      kind: 'migration',
    });
    const db = await openAndMigrate(file);
    expect(await hasTable(db, 'extra_b')).toBe(false);
    expect(await db.query('SELECT COUNT(*) AS n FROM migrations')).toEqual([{ n: 4 }]);
    await db.destroy();
  });

  it('lehnt eine Datenbank mit unbekannter Migration als zu neu ab', async () => {
    const file = join(dir, 'swissbill.db');
    await (await openAndMigrate(file, [...loadMigrations(), AddNotes1700000000100])).destroy();
    const error = await openAndMigrate(file).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DatabaseStartupError);
    expect((error as DatabaseStartupError).kind).toBe('too-new');
  });
});
