import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONNECTION_FILENAME,
  readConnectionConfig,
  removeConnectionConfig,
  writeConnectionConfig,
} from '../../src/main/db/connection-config';
import type { DbConnectionSettings } from '@shared/domain/db-connection';

const settings: DbConnectionSettings = {
  type: 'postgres',
  host: 'db.example.ch',
  port: 5432,
  database: 'swissbill',
  user: 'swissbill',
  tls: { enabled: true, caPath: null },
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-conn-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('Verbindungsdatei (FR-006)', () => {
  it('fehlende Datei bedeutet lokale Datenbank', () => {
    expect(readConnectionConfig(dir)).toEqual({ kind: 'none' });
  });

  it('schreibt und liest die Verbindungsangaben', () => {
    writeConnectionConfig(dir, settings);
    expect(readConnectionConfig(dir)).toEqual({ kind: 'ok', settings, auth: 'none' });
    writeConnectionConfig(dir, settings, 'keychain');
    expect(readConnectionConfig(dir)).toEqual({ kind: 'ok', settings, auth: 'keychain' });
  });

  it('schreibt atomar: keine temporären Dateien bleiben übrig', () => {
    writeConnectionConfig(dir, settings);
    writeConnectionConfig(dir, { ...settings, host: 'other.example.ch' });
    expect(readdirSync(dir)).toEqual([CONNECTION_FILENAME]);
  });

  it('speichert nie ein Passwort, auch wenn es versehentlich übergeben wird', () => {
    writeConnectionConfig(dir, { ...settings, password: 'geheim-123' } as DbConnectionSettings);
    const text = readFileSync(join(dir, CONNECTION_FILENAME), 'utf8');
    expect(text).not.toContain('geheim-123');
    expect(text).not.toMatch(/password|passwort/i);
  });

  it('lokales SQLite wird als fehlende Datei abgebildet', () => {
    writeConnectionConfig(dir, settings);
    writeConnectionConfig(dir, { ...settings, type: 'sqlite' });
    expect(readdirSync(dir)).toEqual([]);
    expect(readConnectionConfig(dir)).toEqual({ kind: 'none' });
  });

  it('entfernt die Datei', () => {
    writeConnectionConfig(dir, settings);
    removeConnectionConfig(dir);
    expect(readConnectionConfig(dir)).toEqual({ kind: 'none' });
    removeConnectionConfig(dir); // idempotent
  });

  it('liest eine Datei mit höherer Version nicht und meldet das', () => {
    writeFileSync(join(dir, CONNECTION_FILENAME), JSON.stringify({ version: 2, type: 'postgres' }));
    expect(readConnectionConfig(dir)).toEqual({ kind: 'unsupported-version', version: 2 });
  });

  it('meldet eine beschädigte oder unvollständige Datei, ohne sie zu ändern', () => {
    writeFileSync(join(dir, CONNECTION_FILENAME), '{kaputt');
    expect(readConnectionConfig(dir).kind).toBe('invalid');
    writeFileSync(join(dir, CONNECTION_FILENAME), JSON.stringify({ version: 1, type: 'oracle' }));
    expect(readConnectionConfig(dir).kind).toBe('invalid');
    expect(readFileSync(join(dir, CONNECTION_FILENAME), 'utf8')).toContain('oracle');
  });
});
