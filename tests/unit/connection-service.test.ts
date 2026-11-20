import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONNECTION_FILENAME, readConnectionConfig } from '../../src/main/db/connection-config';
import { ConnectionService } from '../../src/main/services/connection-service';
import type { DbConnectionSettings } from '@shared/domain/db-connection';
import { AppException } from '@shared/ipc/errors';
import { createFakeCredentialStore, type FakeCredentialStore } from '../fixtures/credential-store';

const settings: DbConnectionSettings = {
  type: 'postgres',
  host: 'db.example.ch',
  port: 5432,
  database: 'swissbill',
  user: 'swissbill',
  tls: { enabled: true, caPath: null },
};

let dir: string;
let credentials: FakeCredentialStore;
let service: ConnectionService;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-connsvc-'));
  credentials = createFakeCredentialStore();
  service = new ConnectionService({ dir, credentials, active: () => 'local' });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const failure = async (fn: () => Promise<unknown>): Promise<AppException> => {
  try {
    await fn();
  } catch (e) {
    if (e instanceof AppException) return e;
    throw e;
  }
  throw new Error('Es wurde keine AppException geworfen.');
};

describe('Verbindungs-Service (FR-005–FR-008, Contract connection-ipc)', () => {
  it('Ausgangszustand: lokal, kein Passwort, Schlüsselbund verfügbar', async () => {
    expect(await service.getState()).toEqual({
      settings: null,
      passwordStored: false,
      passwordMissing: false,
      keychainAvailable: true,
      configError: null,
      active: 'local',
      startupError: null,
    });
  });

  it('speichert Angaben in der Datei und das Passwort nur im Schlüsselbund', async () => {
    const result = await service.save({
      settings,
      password: { action: 'set', value: 'p@ss:w/rd ü' },
    });
    expect(result).toEqual({ restartRequired: true });
    expect(credentials.value).toBe('p@ss:w/rd ü');
    expect(readConnectionConfig(dir)).toEqual({ kind: 'ok', settings, auth: 'keychain' });
    const state = await service.getState();
    expect(state.settings).toEqual(settings);
    expect(state.passwordStored).toBe(true);
    expect(state.passwordMissing).toBe(false);
  });

  it('gibt das Passwort nie über den Zustand heraus', async () => {
    await service.save({ settings, password: { action: 'set', value: 'geheim-123' } });
    expect(JSON.stringify(await service.getState())).not.toContain('geheim-123');
  });

  it('«keep» behält Passwort und Art der Anmeldung', async () => {
    await service.save({ settings, password: { action: 'set', value: 'geheim-123' } });
    await service.save({
      settings: { ...settings, host: 'neu.example.ch' },
      password: { action: 'keep' },
    });
    expect(credentials.value).toBe('geheim-123');
    expect(readConnectionConfig(dir)).toMatchObject({ kind: 'ok', auth: 'keychain' });
  });

  it('«remove» löscht den Schlüsselbund-Eintrag und die Anmeldung', async () => {
    await service.save({ settings, password: { action: 'set', value: 'geheim-123' } });
    await service.save({ settings, password: { action: 'remove' } });
    expect(credentials.value).toBeNull();
    expect(readConnectionConfig(dir)).toMatchObject({ kind: 'ok', auth: 'none' });
    expect((await service.getState()).passwordStored).toBe(false);
  });

  it('meldet ein fehlendes Passwort, wenn der Schlüsselbund-Eintrag verloren ging', async () => {
    await service.save({ settings, password: { action: 'set', value: 'geheim-123' } });
    credentials.value = null;
    const state = await service.getState();
    expect(state.passwordStored).toBe(false);
    expect(state.passwordMissing).toBe(true);
  });

  it('lehnt das Speichern eines Passworts ohne Schlüsselbund ab und schreibt nichts', async () => {
    credentials.available = false;
    const error = await failure(() =>
      service.save({ settings, password: { action: 'set', value: 'geheim-123' } }),
    );
    expect(error.error.code).toBe('KEYCHAIN_UNAVAILABLE');
    expect(error.message).not.toContain('geheim-123');
    expect(existsSync(join(dir, CONNECTION_FILENAME))).toBe(false);
    expect(credentials.value).toBeNull();
    expect((await service.getState()).keychainAvailable).toBe(false);
  });

  it('erlaubt eine Verbindung ohne Passwort auch ohne Schlüsselbund', async () => {
    credentials.available = false;
    await service.save({ settings, password: { action: 'remove' } });
    expect(readConnectionConfig(dir)).toMatchObject({ kind: 'ok', auth: 'none' });
  });

  it('weist ungültige Angaben und ein leeres Passwort mit Feldfehlern zurück', async () => {
    const invalid = await failure(() =>
      service.save({ settings: { ...settings, host: '' }, password: { action: 'keep' } }),
    );
    expect(invalid.error.code).toBe('VALIDATION');
    expect(invalid.error.fields?.map((f) => f.field)).toContain('host');
    const empty = await failure(() =>
      service.save({ settings, password: { action: 'set', value: '' } }),
    );
    expect(empty.error.code).toBe('VALIDATION');
    expect(empty.error.fields?.map((f) => f.field)).toContain('password');
  });

  it('der Wechsel auf lokal entfernt Datei und Schlüsselbund-Eintrag', async () => {
    await service.save({ settings, password: { action: 'set', value: 'geheim-123' } });
    await service.save({
      settings: { ...settings, type: 'sqlite' },
      password: { action: 'keep' },
    });
    expect(existsSync(join(dir, CONNECTION_FILENAME))).toBe(false);
    expect(credentials.value).toBeNull();
    expect((await service.getState()).settings).toBeNull();
  });

  it('meldet eine unbrauchbare Verbindungsdatei als Konfigurationsfehler', async () => {
    writeFileSync(join(dir, CONNECTION_FILENAME), '{kaputt');
    const state = await service.getState();
    expect(state.settings).toBeNull();
    expect(state.configError).toMatch(/Verbindungsdatei/);
  });

  it('liefert das Passwort nur dem Main-Prozess (resolvePassword)', async () => {
    await service.save({ settings, password: { action: 'set', value: 'geheim-123' } });
    expect(await service.resolvePassword()).toBe('geheim-123');
  });

  describe('Verbindungstest', () => {
    const okResult = {
      ok: true,
      failedStage: null,
      message: 'Verbindung erfolgreich.',
      schema: 'empty',
    } as const;
    const withTester = () => {
      const calls: { settings: DbConnectionSettings; password: string | null }[] = [];
      const tested = new ConnectionService({
        dir,
        credentials,
        active: () => 'local',
        testConnection: async (settings, password) => {
          calls.push({ settings, password });
          return okResult;
        },
      });
      return { tested, calls };
    };

    it('verwendet ein neu eingegebenes Passwort, speichert aber nichts', async () => {
      const { tested, calls } = withTester();
      expect(
        await tested.test({ settings, password: { action: 'set', value: 'neu-123' } }),
      ).toEqual(okResult);
      expect(calls[0]?.password).toBe('neu-123');
      expect(credentials.value).toBeNull();
      expect(existsSync(join(dir, CONNECTION_FILENAME))).toBe(false);
    });

    it('«keep» nimmt das gespeicherte Passwort aus dem Schlüsselbund, «remove» keines', async () => {
      const { tested, calls } = withTester();
      await tested.save({ settings, password: { action: 'set', value: 'gespeichert-1' } });
      await tested.test({ settings, password: { action: 'keep' } });
      await tested.test({ settings, password: { action: 'remove' } });
      expect(calls.map((c) => c.password)).toEqual(['gespeichert-1', null]);
    });

    it('prüft die Eingaben zuerst und verbindet bei Fehlern nicht', async () => {
      const { tested, calls } = withTester();
      const error = await failure(() =>
        tested.test({ settings: { ...settings, host: '' }, password: { action: 'keep' } }),
      );
      expect(error.error.code).toBe('VALIDATION');
      expect(calls).toEqual([]);
    });
  });

  describe('CA-Zertifikat (FR-003a)', () => {
    it('Main prüft die vom Renderer genannte Datei: nur lesbare PEM-Zertifikate werden gespeichert', async () => {
      const bad = join(dir, 'kein-zertifikat.pem');
      writeFileSync(bad, 'das ist kein Zertifikat');
      const missing = await failure(() =>
        service.save({
          settings: { ...settings, tls: { enabled: true, caPath: join(dir, 'fehlt.pem') } },
          password: { action: 'keep' },
        }),
      );
      expect(missing.error.fields?.map((f) => f.field)).toContain('tls.caPath');
      const notPem = await failure(() =>
        service.save({
          settings: { ...settings, tls: { enabled: true, caPath: bad } },
          password: { action: 'keep' },
        }),
      );
      expect(notPem.error.fields?.[0]?.message).toMatch(/PEM/);
      expect(existsSync(join(dir, CONNECTION_FILENAME))).toBe(false);

      const good = join(dir, 'ca.pem');
      writeFileSync(good, '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n');
      await service.save({
        settings: { ...settings, tls: { enabled: true, caPath: good } },
        password: { action: 'keep' },
      });
      expect(readConnectionConfig(dir)).toMatchObject({
        kind: 'ok',
        settings: { tls: { enabled: true, caPath: good } },
      });
    });
  });
});
