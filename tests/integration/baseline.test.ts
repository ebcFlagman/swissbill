import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openAndMigrate } from '../../src/main/db/startup';
import { InvoiceService } from '../../src/main/services/invoice-service';
import { createFilledDraft } from '../fixtures/db';
import { createLegacyDb } from '../fixtures/legacy-db';

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-baseline-'));
  file = join(dir, 'swissbill.db');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const TABLES = ['customers', 'invoices', 'invoice_items', 'number_counters', 'settings'];

async function snapshot(path: string): Promise<Record<string, unknown[]>> {
  const db = await openAndMigrate(path);
  const result: Record<string, unknown[]> = {};
  for (const table of TABLES) result[table] = await db.query(`SELECT * FROM "${table}" ORDER BY 1`);
  await db.destroy();
  return result;
}

function legacySnapshot(path: string): Record<string, unknown[]> {
  const db = new Database(path, { readonly: true });
  const result: Record<string, unknown[]> = {};
  for (const table of TABLES) result[table] = db.prepare(`SELECT * FROM "${table}" ORDER BY 1`).all();
  db.close();
  return result;
}

describe('Übernahme einer Datenbank aus der Zeit vor TypeORM (Version 2)', () => {
  it('behält alle Datensätze unverändert, legt eine Kopie an und entfernt die Alt-Trigger', async () => {
    createLegacyDb(file);
    const before = legacySnapshot(file);

    const migrated = await snapshot(file);
    expect(migrated).toEqual(before);
    expect(existsSync(`${file}.bak-2`)).toBe(true);
    expect(legacySnapshot(`${file}.bak-2`)).toEqual(before);

    const db = await openAndMigrate(file);
    expect(await db.query("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'")).toEqual([{ n: 0 }]);
    expect((await db.query('SELECT name FROM migrations ORDER BY id')).map((r: { name: string }) => r.name)).toEqual([
      'InitSchema1700000000001',
      'AddGeoapifyKey1700000000002',
      'DropLegacyTriggers1700000000003',
    ]);
    await db.destroy();
  });

  it('der API-Key-Blob und die Einstellungen bleiben erhalten', async () => {
    const { keyBlob } = createLegacyDb(file);
    const db = await openAndMigrate(file);
    const [row] = (await db.query('SELECT sender_name, invoice_prefix, geoapify_api_key AS key FROM settings WHERE id = 1')) as {
      sender_name: string;
      invoice_prefix: string;
      key: Buffer;
    }[];
    expect(row?.sender_name).toBe('Muster AG');
    expect(row?.invoice_prefix).toBe('XY');
    expect(Buffer.from(row!.key).equals(keyBlob)).toBe(true);
    await db.destroy();
  });

  it('die nächste Rechnungsnummer setzt die Folge fort', async () => {
    createLegacyDb(file);
    const db = await openAndMigrate(file);
    const service = new InvoiceService(db, { now: () => new Date(2026, 2, 1, 10, 0) });
    const issued = await service.issue((await createFilledDraft(service)).id);
    expect(issued.number).toBe('XY-2026-0003');
    await db.destroy();
  });

  it('der zweite Start führt keine Baseline und keine Migration erneut aus und legt keine zweite Kopie an', async () => {
    createLegacyDb(file);
    await (await openAndMigrate(file)).destroy();
    const filesAfterFirst = readdirSync(dir).sort();
    await (await openAndMigrate(file)).destroy();
    expect(readdirSync(dir).sort()).toEqual(filesAfterFirst);
    expect(filesAfterFirst).toEqual(['swissbill.db', 'swissbill.db.bak-2']);
  });

  it('übernimmt auch eine Datenbank der Version 1 (ohne Geoapify-Key) und ergänzt die Spalte', async () => {
    createLegacyDb(file, 1);
    const db = await openAndMigrate(file);
    expect(existsSync(`${file}.bak-1`)).toBe(true);
    expect(await db.query('SELECT geoapify_api_key AS key FROM settings WHERE id = 1')).toEqual([{ key: null }]);
    expect(await db.query('SELECT COUNT(*) AS n FROM invoices')).toEqual([{ n: 3 }]);
    await db.destroy();
  });

  it('eine Datenbank mit neuerem Stand als Version 2 wird nicht verändert', async () => {
    createLegacyDb(file);
    const raw = new Database(file);
    raw.pragma('user_version = 9');
    raw.close();
    await expect(openAndMigrate(file)).rejects.toMatchObject({ kind: 'too-new' });
    expect(readdirSync(dir)).toEqual(['swissbill.db']);
  });
});
