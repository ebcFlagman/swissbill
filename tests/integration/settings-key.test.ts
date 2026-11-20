import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import type { SettingsInput } from '@shared/domain/settings';
import { AppException } from '@shared/ipc/errors';
import { readApiKey } from '../../src/main/db/settings-repository';
import { backupTo } from '../../src/main/db/sqlite-adapter';
import { BackupService } from '../../src/main/services/backup-service';
import { SettingsService } from '../../src/main/services/settings-service';
import { createTestDb } from '../fixtures/db';
import { createFakeSecretStore } from '../fixtures/secret-store';
import { QR_IBAN } from '../fixtures/invoice';

const KEY = 'abcdef0123456789abcdef0123456789';

const input = (overrides: Partial<SettingsInput> = {}): SettingsInput => ({
  sender: {
    name: 'Robert Schneider AG',
    street: 'Rue du Lac',
    houseNo: '1268',
    zip: '2501',
    city: 'Biel',
    country: 'CH',
    iban: QR_IBAN,
  },
  invoicePrefix: 'RE',
  defaultClosingText: null,
  defaultPaymentDays: 30,
  ...overrides,
});

async function rawColumn(db: DataSource): Promise<Buffer | null> {
  const rows = (await db.query('SELECT geoapify_api_key AS key FROM settings WHERE id = 1')) as {
    key: Buffer | null;
  }[];
  return rows[0]?.key ?? null;
}

/** Whole database file as bytes (via the single-file backup). */
async function dumpOf(db: DataSource): Promise<Buffer> {
  const target = join(mkdtempSync(join(tmpdir(), 'swissbill-dump-')), 'dump.db');
  await backupTo(db, target);
  return readFileSync(target);
}

describe('API-Key in den Einstellungen', () => {
  it('speichert den Key verschlüsselt und gibt ihn nie über settings.get() heraus', async () => {
    const db = await createTestDb();
    const secrets = createFakeSecretStore();
    const service = new SettingsService(db, secrets);

    const saved = await service.save(input({ geoapifyApiKey: KEY }));

    expect(saved.geoapifyKeySet).toBe(true);
    expect(saved.geoapifyKeyStatus).toBe('ok');
    expect(JSON.stringify(await service.get())).not.toContain(KEY);
    expect(Object.keys(await service.get())).not.toContain('geoapifyApiKey');
    // Plain text exists only in main
    expect(await readApiKey(db, secrets)).toBe(KEY);
  });

  it('legt den Key weder als Text noch als Bytefolge im Klartext in der Datenbank ab', async () => {
    const db = await createTestDb();
    await new SettingsService(db, createFakeSecretStore()).save(input({ geoapifyApiKey: KEY }));

    const blob = await rawColumn(db);
    expect(blob).not.toBeNull();
    expect(blob!.includes(Buffer.from(KEY, 'utf8'))).toBe(false);
    expect((await dumpOf(db)).includes(Buffer.from(KEY, 'utf8'))).toBe(false);
  });

  it('ist auch in einer Sicherung nicht im Klartext enthalten', async () => {
    const db = await createTestDb();
    await new SettingsService(db, createFakeSecretStore()).save(input({ geoapifyApiKey: KEY }));

    const copy = await dumpOf(db);
    expect(copy.includes(Buffer.from(KEY, 'utf8'))).toBe(false);
    expect(typeof BackupService).toBe('function');
  });

  it('entfernt führende und nachfolgende Leerzeichen vor dem Speichern', async () => {
    const db = await createTestDb();
    const secrets = createFakeSecretStore();
    await new SettingsService(db, secrets).save(input({ geoapifyApiKey: `  ${KEY}\n` }));
    expect(await readApiKey(db, secrets)).toBe(KEY);
  });

  it('lässt den Key unverändert, wenn geoapifyApiKey nicht angegeben wird', async () => {
    const db = await createTestDb();
    const secrets = createFakeSecretStore();
    const service = new SettingsService(db, secrets);
    await service.save(input({ geoapifyApiKey: KEY }));

    await service.save(input({ invoicePrefix: 'XY' }));

    expect(await readApiKey(db, secrets)).toBe(KEY);
    expect((await service.get()).invoicePrefix).toBe('XY');
  });

  it('entfernt den Key mit einem leeren Wert', async () => {
    const db = await createTestDb();
    const secrets = createFakeSecretStore();
    const service = new SettingsService(db, secrets);
    await service.save(input({ geoapifyApiKey: KEY }));

    const cleared = await service.save(input({ geoapifyApiKey: '' }));

    expect(cleared.geoapifyKeySet).toBe(false);
    expect(cleared.geoapifyKeyStatus).toBe('none');
    expect(await readApiKey(db, secrets)).toBeNull();
    expect(await rawColumn(db)).toBeNull();
  });

  it('speichert ohne verfügbare Verschlüsselung nichts und meldet es', async () => {
    const db = await createTestDb();
    const secrets = createFakeSecretStore({ available: false });
    const service = new SettingsService(db, secrets);

    const saved = await service.save(input({ geoapifyApiKey: KEY }));

    expect(saved.geoapifyKeySet).toBe(false);
    expect(saved.geoapifyKeyStatus).toBe('encryption-unavailable');
    expect(await rawColumn(db)).toBeNull();
  });

  it('meldet einen nicht entschlüsselbaren Key (andere Maschine/Benutzer) und liefert keinen Klartext', async () => {
    const db = await createTestDb();
    const secrets = createFakeSecretStore();
    const service = new SettingsService(db, secrets);
    await service.save(input({ geoapifyApiKey: KEY }));

    secrets.broken = true;
    const state = await service.get();

    expect(state.geoapifyKeySet).toBe(false);
    expect(state.geoapifyKeyStatus).toBe('undecryptable');
    expect(await readApiKey(db, secrets)).toBeNull();
  });

  it('erlaubt das Entfernen auch bei nicht entschlüsselbarem Key und ohne verfügbare Verschlüsselung (FR-017)', async () => {
    const db = await createTestDb();
    const secrets = createFakeSecretStore();
    const service = new SettingsService(db, secrets);
    await service.save(input({ geoapifyApiKey: KEY }));
    secrets.broken = true;
    secrets.available = false;

    const cleared = await service.save(input({ geoapifyApiKey: '' }));

    expect(await rawColumn(db)).toBeNull();
    expect(cleared.geoapifyKeyStatus).toBe('encryption-unavailable');
  });

  it('lehnt einen Key mit Leerzeichen im Inneren oder zu grosser Länge ab', async () => {
    const service = new SettingsService(await createTestDb(), createFakeSecretStore());
    for (const bad of ['abc def', 'a'.repeat(201)]) {
      try {
        await service.save(input({ geoapifyApiKey: bad }));
        throw new Error('erwartet: AppException');
      } catch (e) {
        expect(e).toBeInstanceOf(AppException);
        expect((e as AppException).error.fields?.map((f) => f.field)).toContain('geoapifyApiKey');
      }
    }
  });
});
