import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNECTION_FILENAME, writeConnectionConfig } from '../../src/main/db/connection-config';
import { openActiveDatabase } from '../../src/main/db/connect';
import { DatabaseStartupError } from '../../src/main/db/startup';
import type { DbConnectionSettings } from '@shared/domain/db-connection';

// If anything tried to load a server driver, these mocks would throw (FR-002: no server without configuration)
const loaded = vi.hoisted(() => ({ postgres: false, mysql: false }));
vi.mock('../../src/main/db/adapters/postgres', () => {
  loaded.postgres = true;
  throw new Error('Der PostgreSQL-Adapter darf nicht geladen werden.');
});
vi.mock('../../src/main/db/adapters/mysql', () => {
  loaded.mysql = true;
  throw new Error('Der MySQL-Adapter darf nicht geladen werden.');
});

const server: DbConnectionSettings = {
  type: 'postgres',
  host: 'db.example.ch',
  port: 5432,
  database: 'swissbill',
  user: 'swissbill',
  tls: { enabled: true, caPath: null },
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-active-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const never = async () => {
  throw new Error('Das Passwort darf nicht gelesen werden.');
};

describe('Aktive Datenbank (FR-002, Story 2)', () => {
  it('ohne Verbindungsdatei öffnet die App die lokale Datenbank und lädt keinen Server-Treiber', async () => {
    const database = await openActiveDatabase({ dir, resolvePassword: never });
    expect(database.kind).toBe('local');
    expect(database.dataSource.options.type).toBe('better-sqlite3');
    expect(existsSync(join(dir, 'swissbill.db'))).toBe(true);
    expect(loaded).toEqual({ postgres: false, mysql: false });
    await database.dataSource.destroy();
  });

  it('eine Verbindungsdatei für lokales SQLite wird wie keine Datei behandelt', async () => {
    writeConnectionConfig(dir, { ...server, type: 'sqlite' });
    const database = await openActiveDatabase({ dir, resolvePassword: never });
    expect(database.kind).toBe('local');
    await database.dataSource.destroy();
  });

  it('fehlt das erwartete Passwort im Schlüsselbund, wird nicht verbunden (kein leeres Passwort)', async () => {
    writeConnectionConfig(dir, server, 'keychain');
    const error = await openActiveDatabase({ dir, resolvePassword: async () => null }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DatabaseStartupError);
    expect((error as DatabaseStartupError).kind).toBe('connection');
    expect((error as DatabaseStartupError).message).toMatch(/Passwort/);
    // nothing was opened as a fallback and no server driver was needed
    expect(existsSync(join(dir, 'swissbill.db'))).toBe(false);
    expect(loaded).toEqual({ postgres: false, mysql: false });
  });

  it('eine unbrauchbare Verbindungsdatei führt nie still zur lokalen Datenbank', async () => {
    writeFileSync(join(dir, CONNECTION_FILENAME), '{kaputt');
    const error = await openActiveDatabase({ dir, resolvePassword: never }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DatabaseStartupError);
    expect((error as DatabaseStartupError).message).toMatch(/Verbindungsdatei/);
    expect(existsSync(join(dir, 'swissbill.db'))).toBe(false);

    writeFileSync(join(dir, CONNECTION_FILENAME), JSON.stringify({ version: 9, type: 'postgres' }));
    const newer = await openActiveDatabase({ dir, resolvePassword: never }).catch(
      (e: unknown) => e,
    );
    expect((newer as DatabaseStartupError).message).toMatch(/neueren Programmversion/);
  });
});
