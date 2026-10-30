import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/db/connection';
import { loadMigrations, migrate } from '../../src/main/db/migrate';
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

function failure(fn: () => unknown): DatabaseStartupError {
  try {
    fn();
  } catch (e) {
    if (e instanceof DatabaseStartupError) return e;
    throw e;
  }
  throw new Error('Es wurde keine DatabaseStartupError geworfen.');
}

function makeHealthyDb(): void {
  const db = openDatabase(path);
  migrate(db, loadMigrations());
  const service = new InvoiceService(db, { now: () => new Date(2026, 2, 1, 10, 0) });
  service.issue(createFilledDraft(service).id);
  db.close();
}

describe('Start der Datenbank', () => {
  it('legt beim ersten Start (Datei fehlt) eine neue, migrierte Datenbank an', () => {
    expect(existsSync(path)).toBe(false);
    const db = openAndMigrate(path);
    expect(db.pragma('user_version', { simple: true })).toBe(loadMigrations().length);
    db.close();
    expect(existsSync(path)).toBe(true);
  });

  it('öffnet eine gesunde Datenbank mit allen Daten', () => {
    makeHealthyDb();
    const db = openAndMigrate(path);
    expect(db.prepare('SELECT COUNT(*) AS n FROM invoices').get()).toEqual({ n: 1 });
    db.close();
  });

  it('erkennt eine beschädigte Datei, meldet das verständlich und ändert nichts', () => {
    writeFileSync(path, Buffer.from('Das ist keine SQLite-Datenbank. '.repeat(200)));
    const before = sha(path);

    const error = failure(() => openAndMigrate(path));
    expect(error.kind).toBe('corrupt');
    expect(error.message).toMatch(/beschädigt/);
    expect(error.message).toContain(path);
    expect(error.message).toMatch(/nichts (verändert|überschrieben)/);

    expect(sha(path)).toBe(before);
    expect(readdirSync(dir)).toEqual(['swissbill.db']); // keine Kopie, kein Journal
  });

  it('erkennt eine abgeschnittene Datenbank', () => {
    makeHealthyDb();
    const size = readFileSync(path).length;
    truncateSync(path, Math.floor(size / 2));
    const before = sha(path);

    const error = failure(() => openAndMigrate(path));
    expect(error.kind).toBe('corrupt');
    expect(sha(path)).toBe(before);
    expect(readdirSync(dir)).toEqual(['swissbill.db']);
  });

  it('lehnt eine Datenbank einer neueren Programmversion ab, ohne sie zu verändern', () => {
    makeHealthyDb();
    const newer = openDatabase(path);
    newer.pragma(`user_version = ${loadMigrations().length + 1}`);
    newer.close();
    const before = sha(path);

    const error = failure(() => openAndMigrate(path));
    expect(error.kind).toBe('too-new');
    expect(error.message).toMatch(/neuer/);
    expect(sha(path)).toBe(before);
  });

  it('meldet fehlerhafte Migrationen und lässt die Datei unverändert (Sicherung bleibt erhalten)', () => {
    makeHealthyDb();
    const db = openDatabase(path);
    db.pragma('user_version = 0'); // zwingt zur erneuten Ausführung von 001, die an den vorhandenen Tabellen scheitert
    db.close();
    // Zustand vor dem Start: Version 0 -> Migration 001 schlägt fehl, weil die Tabellen schon existieren
    const copy = join(dir, 'vorher.db');
    copyFileSync(path, copy);

    const error = failure(() => openAndMigrate(path));
    expect(error.kind).toBe('migration');
    expect(sha(path)).toBe(sha(copy));
  });
});
