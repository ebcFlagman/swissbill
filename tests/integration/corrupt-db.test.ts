import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadMigrations } from '../../src/main/db/data-source';
import { DatabaseStartupError, openAndMigrate } from '../../src/main/db/startup';
import { InvoiceService } from '../../src/main/services/invoice-service';
import { createFilledDraft } from '../fixtures/db';

let dir: string;
let path: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-startup-'));
  path = join(dir, 'swissbill.db');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

async function failure(fn: () => Promise<unknown>): Promise<DatabaseStartupError> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DatabaseStartupError) return e;
    throw e;
  }
  throw new Error('Es wurde keine DatabaseStartupError geworfen.');
}

async function makeHealthyDb(): Promise<void> {
  const db = await openAndMigrate(path);
  const service = new InvoiceService(db, { now: () => new Date(2026, 2, 1, 10, 0) });
  await service.issue((await createFilledDraft(service)).id);
  await db.destroy();
}

describe('Start der Datenbank', () => {
  it('legt beim ersten Start (Datei fehlt) eine neue, migrierte Datenbank an', async () => {
    expect(existsSync(path)).toBe(false);
    const db = await openAndMigrate(path);
    expect(await db.query('SELECT COUNT(*) AS n FROM migrations')).toEqual([{ n: loadMigrations().length }]);
    await db.destroy();
    expect(existsSync(path)).toBe(true);
    expect(readdirSync(dir)).toEqual(['swissbill.db']); // no copy for a new database
  });

  it('öffnet eine gesunde Datenbank mit allen Daten', async () => {
    await makeHealthyDb();
    const db = await openAndMigrate(path);
    expect(await db.query('SELECT COUNT(*) AS n FROM invoices')).toEqual([{ n: 1 }]);
    await db.destroy();
  });

  it('erkennt eine beschädigte Datei, meldet das verständlich und ändert nichts', async () => {
    writeFileSync(path, Buffer.from('Das ist keine SQLite-Datenbank. '.repeat(200)));
    const before = sha(path);

    const error = await failure(() => openAndMigrate(path));
    expect(error.kind).toBe('corrupt');
    expect(error.message).toMatch(/beschädigt/);
    expect(error.message).toContain(path);
    expect(error.message).toMatch(/nichts (verändert|überschrieben)/);

    expect(sha(path)).toBe(before);
    expect(readdirSync(dir)).toEqual(['swissbill.db']); // no copy, no journal
  });

  it('erkennt eine abgeschnittene Datenbank', async () => {
    await makeHealthyDb();
    const size = readFileSync(path).length;
    truncateSync(path, Math.floor(size / 2));
    const before = sha(path);

    const error = await failure(() => openAndMigrate(path));
    expect(error.kind).toBe('corrupt');
    expect(sha(path)).toBe(before);
    expect(readdirSync(dir)).toEqual(['swissbill.db']);
  });

  it('lehnt eine Datenbank einer neueren Programmversion ab, ohne sie zu verändern', async () => {
    await makeHealthyDb();
    const newer = await openAndMigrate(path);
    await newer.query("INSERT INTO migrations (timestamp, name) VALUES (1800000000000, 'FutureFeature1800000000000')");
    await newer.destroy();
    const before = sha(path);

    const error = await failure(() => openAndMigrate(path));
    expect(error.kind).toBe('too-new');
    expect(error.message).toMatch(/neuer/);
    expect(sha(path)).toBe(before);
  });

  it('meldet fehlerhafte Migrationen und lässt die Datei unverändert', async () => {
    await makeHealthyDb();
    const db = await openAndMigrate(path);
    // State "migration 1 never executed" although the tables exist: migration 1 fails
    await db.query("DELETE FROM migrations WHERE name = 'InitSchema1700000000001'");
    await db.destroy();
    const copy = join(dir, 'vorher.db');
    copyFileSync(path, copy);

    const error = await failure(() => openAndMigrate(path));
    expect(error.kind).toBe('migration');
    expect(sha(path)).toBe(sha(copy));
  });
});
