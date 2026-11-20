import { afterEach, beforeEach, expect, it } from 'vitest';
import { loadMigrations } from '../../../src/main/db/data-source';
import { DatabaseStartupError } from '../../../src/main/db/startup';
import { MAX_TOTAL_RAPPEN } from '@shared/domain/invoice';
import { describeMatrix, type TestDb } from '../helpers/db-targets';

const TABLES = [
  'customers',
  'edit_locks',
  'invoice_items',
  'invoices',
  'migrations',
  'number_counters',
  'settings',
];

describeMatrix('Migration und Schema', (name, create) => {
  let db: TestDb;
  beforeEach(async () => {
    db = await create();
  });
  afterEach(async () => {
    await db.close();
  });

  /** Names (of the known ones plus `stranger`) that exist. System tables of the server are ignored. */
  const tableNames = async (ds: Awaited<ReturnType<TestDb['open']>>) => {
    const runner = ds.createQueryRunner();
    try {
      const found: string[] = [];
      for (const table of [...TABLES, 'stranger']) {
        if (await runner.hasTable(table)) found.push(table);
      }
      return found.sort();
    } finally {
      await runner.release();
    }
  };

  it('legt in einer leeren Datenbank das ganze Schema und die Einstellungszeile an', async () => {
    const ds = await db.open();
    expect(await tableNames(ds)).toEqual(TABLES);
    const e = (n: string) => ds.driver.escape(n);
    const migrations = (await ds.query(`SELECT COUNT(*) AS n FROM ${e('migrations')}`)) as {
      n: string | number;
    }[];
    expect(Number(migrations[0]?.n)).toBe(loadMigrations().length);
    const settings = (await ds.query(`SELECT COUNT(*) AS n FROM ${e('settings')}`)) as {
      n: string | number;
    }[];
    expect(Number(settings[0]?.n)).toBe(1);
  });

  it('jede Entität hat genau die Spalten ihrer Tabelle, mit gleicher Nullbarkeit', async () => {
    const ds = await db.open();
    for (const meta of ds.entityMetadatas) {
      const runner = ds.createQueryRunner();
      const table = await runner.getTable(meta.tableName);
      await runner.release();
      expect(table, meta.tableName).toBeDefined();
      const columns = new Map(table!.columns.map((c) => [c.name, c]));
      expect([...columns.keys()].sort(), meta.tableName).toEqual(
        meta.columns.map((c) => c.databaseName).sort(),
      );
      for (const column of meta.columns) {
        expect(
          columns.get(column.databaseName)?.isNullable,
          `${meta.tableName}.${column.databaseName}`,
        ).toBe(column.isNullable);
      }
    }
  });

  it('speichert den Höchstbetrag exakt und liest ihn als Zahl (kein 32-Bit-Überlauf, kein String)', async () => {
    const ds = await db.open();
    const repo = ds.getRepository('invoices');
    const now = '2026-03-01T10:00:00.000Z';
    const saved = await repo.save({
      status: 'draft',
      sender_country: 'CH',
      debtor_country: 'CH',
      invoice_date: '2026-03-01',
      due_date: '2026-03-31',
      total_rappen: MAX_TOTAL_RAPPEN,
      created_at: now,
      updated_at: now,
    });
    const read = await repo.findOneByOrFail({ id: (saved as unknown as { id: number }).id });
    expect((read as { total_rappen: unknown }).total_rappen).toBe(MAX_TOTAL_RAPPEN);
    expect(typeof (read as { total_rappen: unknown }).total_rappen).toBe('number');
  });

  it('ändert beim erneuten Öffnen nichts', async () => {
    const first = await db.open();
    const before = await tableNames(first);
    await first.destroy();
    const again = await db.open();
    expect(await tableNames(again)).toEqual(before);
    const rows = (await again.query(
      `SELECT COUNT(*) AS n FROM ${again.driver.escape('migrations')}`,
    )) as { n: string | number }[];
    expect(Number(rows[0]?.n)).toBe(loadMigrations().length);
  });

  it('lehnt eine Datenbank mit fremden Tabellen ab und lässt sie unverändert', async () => {
    await db.admin(
      name === 'postgres' || name === 'sqlite'
        ? 'CREATE TABLE stranger (id integer)'
        : 'CREATE TABLE stranger (id integer)',
    );
    const error = await db.open().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DatabaseStartupError);
    expect((error as DatabaseStartupError).kind).toBe('foreign');
    const raw = await db.openRaw();
    expect(await tableNames(raw)).toEqual(['stranger']);
  });

  it('öffnet ein neueres Schema nicht und verändert es nicht', async () => {
    const first = await db.open();
    const e = (n: string) => first.driver.escape(n);
    await first.query(
      `INSERT INTO ${e('migrations')} (${e('timestamp')}, ${e('name')}) VALUES (1900000000999, 'Future1900000000999')`,
    );
    await first.destroy();
    const error = await db.open().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(DatabaseStartupError);
    expect((error as DatabaseStartupError).kind).toBe('too-new');
  });

  it('zwei gleichzeitig startende Geräte führen jede Migration genau einmal aus', async () => {
    const [a, b] = await Promise.all([db.open(), db.open()]);
    const e = (n: string) => a.driver.escape(n);
    const rows = (await b.query(
      `SELECT ${e('name')} FROM ${e('migrations')} ORDER BY ${e('id')}`,
    )) as { name: string }[];
    const names = rows.map((r) => r.name);
    expect(names).toEqual(loadMigrations().map((m) => m.name));
  });

  it('ein abgebrochener Migrationslauf kann wiederholt werden (MySQL/MariaDB können DDL nicht zurückrollen)', async () => {
    const first = await db.open();
    const e = (n: string) => first.driver.escape(n);
    // Simulate "tables created, but the run was interrupted before it was recorded, and a later table is missing"
    await first.query(`DELETE FROM ${e('migrations')}`);
    await first.query(`DROP TABLE ${e('edit_locks')}`);
    await first.destroy();

    const again = await db.open(); // runs every migration again; each only creates what is missing
    expect(await tableNames(again)).toEqual(TABLES);
    const names = (await again.query(
      `SELECT ${e('name')} FROM ${e('migrations')} ORDER BY ${e('id')}`,
    )) as { name: string }[];
    expect(names.map((r) => r.name)).toEqual(loadMigrations().map((m) => m.name));
    // the single settings row was not inserted a second time
    const settings = (await again.query(`SELECT COUNT(*) AS n FROM ${e('settings')}`)) as {
      n: string | number;
    }[];
    expect(Number(settings[0]?.n)).toBe(1);
  });
});
