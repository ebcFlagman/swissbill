import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initLogger, log } from '../../src/main/log';
import { ConnectionService } from '../../src/main/services/connection-service';
import type { DbConnectionSettings } from '@shared/domain/db-connection';
import { createFakeCredentialStore } from '../fixtures/credential-store';

const PASSWORD = 'p@ss:w/rd ü"\'-Geheim';

const settings: DbConnectionSettings = {
  type: 'mysql',
  host: 'db.example.ch',
  port: 3306,
  database: 'swissbill',
  user: 'swissbill',
  tls: { enabled: true, caPath: null },
};

function allFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? allFiles(path) : [path];
  });
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-leak-'));
  mkdirSync(join(dir, 'logs'));
  initLogger(join(dir, 'logs'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('Kein Passwort ausserhalb des Schlüsselbunds (SC-004)', () => {
  it('nach dem Speichern steht das Passwort in keiner Datei und in keinem Log', async () => {
    const credentials = createFakeCredentialStore();
    const service = new ConnectionService({ dir, credentials, active: () => 'local' });
    await service.save({ settings, password: { action: 'set', value: PASSWORD } });
    expect(credentials.value).toBe(PASSWORD);

    // a log line that accidentally contains the password is masked
    log.error(`Verbindung fehlgeschlagen mit ${PASSWORD}`);
    log.info(`Zugang ${PASSWORD}`);

    const files = allFiles(dir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(file);
      expect(content.includes(Buffer.from(PASSWORD)), file).toBe(false);
      expect(
        content.toString('base64').includes(Buffer.from(PASSWORD).toString('base64')),
        file,
      ).toBe(false);
    }
  });

  it('auch nach dem Ersetzen und Entfernen bleibt kein altes Passwort zurück', async () => {
    const credentials = createFakeCredentialStore();
    const service = new ConnectionService({ dir, credentials, active: () => 'local' });
    await service.save({ settings, password: { action: 'set', value: PASSWORD } });
    await service.save({ settings, password: { action: 'set', value: 'ganz-anders-1' } });
    await service.save({ settings, password: { action: 'remove' } });
    for (const file of allFiles(dir)) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain('ganz-anders-1');
    }
  });
});
