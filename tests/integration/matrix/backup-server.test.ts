import { afterEach, beforeEach, expect, it } from 'vitest';
import { BackupService } from '../../../src/main/services/backup-service';
import { loadMigrations } from '../../../src/main/db/data-source';
import { describeMatrix, type TestDb } from '../helpers/db-targets';

describeMatrix(
  'Sicherung und Info bei Serverdatenbanken (FR-013, Annahme Sicherung)',
  (name, create) => {
    if (name === 'sqlite') {
      it('lokal sichert die Anwendung als Datei (siehe backup.test.ts)', () => {
        expect(name).toBe('sqlite');
      });
      return;
    }

    let target: TestDb;
    beforeEach(async () => {
      target = await create();
    });
    afterEach(async () => {
      await target.close();
    });

    it('die Info nennt Typ und Server ohne Zugangsdaten, keine Dateigrösse', async () => {
      const db = await target.open();
      const info = await new BackupService(db, target.adapter).info();
      if (target.target.kind !== 'server') throw new Error('Server erwartet');
      const { host, port, database, user } = target.target.settings;
      expect(info.type).toBe(name);
      expect(info.path).toBe(`${host}:${port}/${database}`);
      expect(info.sizeBytes).toBeNull();
      expect(info.schemaVersion).toBe(loadMigrations().length);
      expect(JSON.stringify(info)).not.toContain(user + ':');
      expect(JSON.stringify(info)).not.toContain(target.target.password ?? '§§§');
    });

    it('die Sicherung wird abgelehnt mit Hinweis auf den Betreiber des Servers', async () => {
      const db = await target.open();
      const error = await new BackupService(db, target.adapter)
        .backup('/tmp/sicherung.db')
        .catch((e: unknown) => e);
      expect(error).toMatchObject({ error: { code: 'IO' } });
      expect((error as Error).message).toMatch(/Betreiber/);
    });
  },
);
