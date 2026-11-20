import { afterEach, beforeEach, expect, it } from 'vitest';
import type { SettingsInput } from '@shared/domain/settings';
import { readApiKey } from '../../../src/main/db/settings-repository';
import { secretStoreFor } from '../../../src/main/secret-store';
import { SettingsService } from '../../../src/main/services/settings-service';
import { createFakeSecretStore } from '../../fixtures/secret-store';
import { QR_IBAN } from '../../fixtures/invoice';
import { describeMatrix, type TestDb } from '../helpers/db-targets';

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

describeMatrix('Einstellungen und Geoapify-Schlüssel', (name, create) => {
  let target: TestDb;
  beforeEach(async () => {
    target = await create();
  });
  afterEach(async () => {
    await target.close();
  });

  const rawColumn = async (db: Awaited<ReturnType<TestDb['open']>>) => {
    const rows = (await db.query('SELECT geoapify_api_key AS k FROM settings WHERE id = 1')) as {
      k: Buffer | null;
    }[];
    return rows[0]?.k ?? null;
  };

  if (name === 'sqlite') {
    it('lokal bleibt der Schlüssel an das Gerät gebunden (nie als Klartext in der Datenbank)', async () => {
      const db = await target.open();
      const local = createFakeSecretStore();
      const service = new SettingsService(db, secretStoreFor(name, local));
      await service.save(input({ geoapifyApiKey: KEY }));
      const raw = await rawColumn(db);
      expect(raw).not.toBeNull();
      expect(raw!.includes(Buffer.from(KEY))).toBe(false);
    });
  } else {
    it('auf dem Server liegt der Schlüssel als UTF-8-Bytes und ist für jedes Gerät lesbar (FR-006a)', async () => {
      const deviceA = await target.open();
      const deviceB = await target.open();
      const localA = createFakeSecretStore();
      const serviceA = new SettingsService(deviceA, secretStoreFor(name, localA));
      const saved = await serviceA.save(input({ geoapifyApiKey: KEY }));
      expect(saved.geoapifyKeySet).toBe(true);
      expect(saved.geoapifyKeyStatus).toBe('ok');
      expect((await rawColumn(deviceA))!.toString('utf8')).toBe(KEY);

      // another device whose own OS encryption could never decrypt device A's data
      const brokenLocal = createFakeSecretStore({ broken: true });
      const storeB = secretStoreFor(name, brokenLocal);
      expect(await readApiKey(deviceB, storeB)).toBe(KEY);
      const serviceB = new SettingsService(deviceB, storeB);
      expect((await serviceB.get()).geoapifyKeySet).toBe(true);
      expect(JSON.stringify(await serviceB.get())).not.toContain(KEY);
    });

    it('der Schlüssel lässt sich auf dem Server auch ohne Betriebssystem-Verschlüsselung speichern und entfernen', async () => {
      const db = await target.open();
      const local = createFakeSecretStore({ available: false });
      const service = new SettingsService(db, secretStoreFor(name, local));
      expect((await service.save(input({ geoapifyApiKey: KEY }))).geoapifyKeySet).toBe(true);
      expect((await service.save(input({ geoapifyApiKey: '' }))).geoapifyKeySet).toBe(false);
      expect(await rawColumn(db)).toBeNull();
    });
  }

  it('alle anderen Einstellungen sind für zwei Verbindungen derselben Datenbank sichtbar', async () => {
    if (name === 'sqlite') return; // a single device by design
    const a = await target.open();
    const b = await target.open();
    const local = createFakeSecretStore();
    await new SettingsService(a, secretStoreFor(name, local)).save(
      input({ invoicePrefix: 'INV', defaultPaymentDays: 14 }),
    );
    const seen = await new SettingsService(b, secretStoreFor(name, local)).get();
    expect(seen.invoicePrefix).toBe('INV');
    expect(seen.defaultPaymentDays).toBe(14);
    expect(seen.sender.name).toBe('Robert Schneider AG');
  });
});
