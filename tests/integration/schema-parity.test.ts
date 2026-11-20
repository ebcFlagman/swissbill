import { describe, expect, it } from 'vitest';
import { createTestDb } from '../fixtures/db';

/** Entity and table must not drift apart (the schema is created only by the migrations). */
describe('Schema-Parität: Entitäten ↔ migrierte Tabellen', () => {
  it('jede Entität hat genau die Spalten ihrer Tabelle, mit gleicher Nullbarkeit', async () => {
    const db = await createTestDb();
    expect(db.entityMetadatas.map((m) => m.tableName).sort()).toEqual(
      ['customers', 'invoice_items', 'invoices', 'number_counters', 'settings'],
    );
    for (const meta of db.entityMetadatas) {
      const table = await db.createQueryRunner().getTable(meta.tableName);
      expect(table, meta.tableName).toBeDefined();
      const tableColumns = new Map(table!.columns.map((c) => [c.name, c]));
      expect([...tableColumns.keys()].sort(), meta.tableName).toEqual(meta.columns.map((c) => c.databaseName).sort());
      for (const column of meta.columns) {
        expect(tableColumns.get(column.databaseName)?.isNullable, `${meta.tableName}.${column.databaseName}`).toBe(
          column.isNullable,
        );
      }
    }
  });

  it('Beträge, Mengen und Zähler sind Ganzzahlen, nie Fliesskommazahlen', async () => {
    const db = await createTestDb();
    const integerColumns: Record<string, string[]> = {
      invoices: ['total_rappen', 'number_year', 'number_seq', 'layout_version'],
      invoice_items: ['quantity_milli', 'unit_price_rappen', 'amount_rappen', 'position'],
      number_counters: ['year', 'last_seq'],
      settings: ['default_payment_days'],
    };
    for (const [tableName, columns] of Object.entries(integerColumns)) {
      const table = await db.createQueryRunner().getTable(tableName);
      for (const name of columns) {
        expect(table?.columns.find((c) => c.name === name)?.type.toLowerCase(), `${tableName}.${name}`).toBe('integer');
      }
    }
  });

  it('Neue Datenbanken haben keine Trigger und die portablen Rückhalte (UNIQUE, Fremdschlüssel) sind vorhanden', async () => {
    const db = await createTestDb();
    expect(await db.query("SELECT name FROM sqlite_master WHERE type = 'trigger'")).toEqual([]);
    const invoices = await db.createQueryRunner().getTable('invoices');
    const items = await db.createQueryRunner().getTable('invoice_items');
    expect(invoices?.foreignKeys.map((f) => f.onDelete)).toEqual(['SET NULL']);
    expect(items?.foreignKeys.map((f) => f.onDelete)).toEqual(['CASCADE']);
    expect(invoices?.uniques.length).toBeGreaterThan(0);
    expect(items?.uniques.length).toBeGreaterThan(0);
  });
});
