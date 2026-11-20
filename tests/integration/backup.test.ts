import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppException } from '@shared/ipc/errors';
import { loadMigrations } from '../../src/main/db/data-source';
import { openAndMigrate } from '../../src/main/db/startup';
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

async function setup() {
  const path = join(dir, 'swissbill.db');
  const db = await openAndMigrate(path);
  const invoices = new InvoiceService(db, { now: () => new Date(2026, 2, 1, 10, 0) });
  const a = await invoices.issue((await createFilledDraft(invoices)).id);
  const b = await createFilledDraft(invoices);
  return { db, path, backup: new BackupService(db), a, b };
}

describe('BackupService', () => {
  it('zeigt Speicherort, Grösse und Schemastand (Anzahl Migrationen)', async () => {
    const { db, path, backup } = await setup();
    const info = await backup.info();
    expect(info.path).toBe(path);
    expect(info.sizeBytes).toBe(statSync(path).size);
    expect(info.sizeBytes).toBeGreaterThan(0);
    expect(info.schemaVersion).toBe(loadMigrations().length);
    await db.destroy();
  });

  it('erzeugt eine einzelne Datei mit allen Rechnungen', async () => {
    const { db, backup, a, b } = await setup();
    const target = join(dir, 'sicherung', 'kopie.db');
    await backup.backup(target);

    // exactly one file, no additional files (-journal, -wal, -shm)
    expect(readdirSync(join(dir, 'sicherung'))).toEqual(['kopie.db']);

    const copy = await openAndMigrate(target);
    expect(await copy.query('SELECT id, status, number FROM invoices ORDER BY id')).toEqual([
      { id: a.id, status: 'issued', number: 'RE-2026-0001' },
      { id: b.id, status: 'draft', number: null },
    ]);
    expect(await copy.query('SELECT COUNT(*) AS n FROM invoice_items')).toEqual([{ n: 4 }]);
    await copy.destroy();
    await db.destroy();
  });

  it('die Sicherung lässt sich als Datenbank öffnen und weiterverwenden', async () => {
    const { db, backup } = await setup();
    const target = join(dir, 'kopie.db');
    await backup.backup(target);
    await db.destroy();

    const restored = await openAndMigrate(target);
    const service = new InvoiceService(restored, { now: () => new Date(2026, 2, 1, 10, 0) });
    expect(await service.list({})).toHaveLength(2);
    expect((await service.issue((await createFilledDraft(service)).id)).number).toBe('RE-2026-0002');
    await restored.destroy();
  });

  it('verweigert die Sicherung auf die Datenbank selbst', async () => {
    const { db, path, backup } = await setup();
    await expect(backup.backup(path)).rejects.toBeInstanceOf(AppException);
    expect(existsSync(path)).toBe(true);
    expect(await db.query('SELECT COUNT(*) AS n FROM invoices')).toEqual([{ n: 2 }]);
    await db.destroy();
  });

  it('meldet einen verständlichen IO-Fehler, wenn das Ziel nicht beschreibbar ist', async () => {
    const { db, backup } = await setup();
    await expect(backup.backup(join(dir, 'nicht', 'vorhanden\0', 'x.db'))).rejects.toMatchObject({
      error: { code: 'IO' },
    });
    await db.destroy();
  });
});
