import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppException } from '@shared/ipc/errors';
import { openDatabase } from '../../src/main/db/connection';
import { loadMigrations, migrate } from '../../src/main/db/migrate';
import { BackupService } from '../../src/main/services/backup-service';
import { InvoiceService } from '../../src/main/services/invoice-service';
import { createFilledDraft } from '../fixtures/db';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-backup-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const path = join(dir, 'swissbill.db');
  const db = openDatabase(path);
  migrate(db, loadMigrations());
  const invoices = new InvoiceService(db, { now: () => new Date(2026, 2, 1, 10, 0) });
  const a = invoices.issue(createFilledDraft(invoices).id);
  const b = createFilledDraft(invoices);
  return { db, path, backup: new BackupService(db), a, b };
}

describe('BackupService', () => {
  it('zeigt Speicherort, Grösse und Schemaversion', () => {
    const { db, path, backup } = setup();
    const info = backup.info();
    expect(info.path).toBe(path);
    expect(info.sizeBytes).toBe(statSync(path).size);
    expect(info.sizeBytes).toBeGreaterThan(0);
    expect(info.schemaVersion).toBe(loadMigrations().length);
    db.close();
  });

  it('erzeugt eine einzelne Datei mit allen Rechnungen', async () => {
    const { db, backup, a, b } = setup();
    const target = join(dir, 'sicherung', 'kopie.db');
    await backup.backup(target);

    // genau eine Datei, keine Zusatzdateien (-journal, -wal, -shm)
    expect(readdirSync(join(dir, 'sicherung'))).toEqual(['kopie.db']);

    const copy = new Database(target, { readonly: true });
    const rows = copy.prepare('SELECT id, status, number FROM invoices ORDER BY id').all();
    expect(rows).toEqual([
      { id: a.id, status: 'issued', number: 'RE-2026-0001' },
      { id: b.id, status: 'draft', number: null },
    ]);
    expect(copy.prepare('SELECT COUNT(*) AS n FROM invoice_items').get()).toEqual({ n: 4 });
    expect(copy.pragma('user_version', { simple: true })).toBe(loadMigrations().length);
    copy.close();
    db.close();
  });

  it('die Sicherung lässt sich als Datenbank öffnen und weiterverwenden', async () => {
    const { db, backup } = setup();
    const target = join(dir, 'kopie.db');
    await backup.backup(target);
    db.close();

    const restored = openDatabase(target);
    migrate(restored, loadMigrations());
    const service = new InvoiceService(restored, { now: () => new Date(2026, 2, 1, 10, 0) });
    expect(service.list({})).toHaveLength(2);
    expect(service.issue(createFilledDraft(service).id).number).toBe('RE-2026-0002');
    restored.close();
  });

  it('verweigert die Sicherung auf die Datenbank selbst', async () => {
    const { db, path, backup } = setup();
    await expect(backup.backup(path)).rejects.toBeInstanceOf(AppException);
    expect(existsSync(path)).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS n FROM invoices').get()).toEqual({ n: 2 });
    db.close();
  });

  it('meldet einen verständlichen IO-Fehler, wenn das Ziel nicht beschreibbar ist', async () => {
    const { db, backup } = setup();
    await expect(backup.backup(join(dir, 'nicht', 'vorhanden\0', 'x.db'))).rejects.toMatchObject({
      error: { code: 'IO' },
    });
    db.close();
  });
});
