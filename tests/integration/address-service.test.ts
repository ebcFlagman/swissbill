import { describe, expect, it } from 'vitest';
import { AddressService } from '../../src/main/services/address-service';
import type { GeoapifyClient, GeoapifyFailure, GeoapifyResult } from '../../src/main/services/geoapify-client';
import { SettingsService } from '../../src/main/services/settings-service';
import { createTestDb } from '../fixtures/db';
import { QR_IBAN } from '../fixtures/invoice';
import { createFakeSecretStore } from '../fixtures/secret-store';
import sample from '../fixtures/geoapify-autocomplete.json';

const KEY = 'abcdef0123456789abcdef0123456789';

interface Call {
  text: string;
  apiKey: string;
}

function fakeClient(result: GeoapifyResult | ((call: Call) => GeoapifyResult)) {
  const calls: Call[] = [];
  const client: GeoapifyClient = {
    autocomplete: async (text, apiKey) => {
      const call = { text, apiKey };
      calls.push(call);
      return typeof result === 'function' ? result(call) : result;
    },
  };
  return { client, calls };
}

async function setup(
  options: { key?: string; secrets?: ReturnType<typeof createFakeSecretStore> } = {},
  client?: GeoapifyClient,
) {
  const db = createTestDb();
  const secrets = options.secrets ?? createFakeSecretStore();
  const settings = new SettingsService(db, secrets);
  await settings.save({
    sender: { name: 'Muster AG', street: 'Weg', houseNo: '1', zip: '8000', city: 'Zürich', country: 'CH', iban: QR_IBAN },
    invoicePrefix: 'RE',
    defaultClosingText: null,
    defaultPaymentDays: 30,
    ...(options.key !== undefined ? { geoapifyApiKey: options.key } : {}),
  });
  const fake = fakeClient({ ok: true, body: sample });
  const service = new AddressService(db, secrets, client ?? fake.client);
  return { service, secrets, db, calls: fake.calls };
}

describe('AddressService.suggest', () => {
  it('ohne Key: disabled, und es wird keine Anfrage gesendet (FR-008)', async () => {
    const { service, calls } = await setup();
    expect(await service.suggest('Bahnhofstr 1')).toEqual({ status: 'disabled' });
    expect(calls).toHaveLength(0);
  });

  it('mit Key: liefert Vorschläge (höchstens 5) und sendet nur Suchtext und Key', async () => {
    const { service, calls } = await setup({ key: KEY });
    const result = await service.suggest('Bahnhofstr 1 Zür');

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeLessThanOrEqual(5);
    expect(result.suggestions[0]).toMatchObject({ street: 'Bahnhofstrasse', zip: '8001', country: 'CH' });
    expect(calls).toEqual([{ text: 'Bahnhofstr 1 Zür', apiKey: KEY }]);
  });

  it('kürzt die Liste auf höchstens 5 Vorschläge', async () => {
    const many = { results: Array.from({ length: 9 }, (_, i) => ({ street: `S${i}`, postcode: '8000', city: 'Z', country_code: 'ch' })) };
    const { client } = fakeClient({ ok: true, body: many });
    const { service } = await setup({ key: KEY }, client);
    const result = await service.suggest('abc');
    expect(result.status === 'ok' && result.suggestions.length).toBe(5);
  });

  it.each<GeoapifyFailure>(['offline', 'invalid_key', 'quota', 'timeout', 'unavailable'])(
    'meldet den Dienstfehler %s als error mit Grund',
    async (reason) => {
      const { client } = fakeClient({ ok: false, reason });
      const { service } = await setup({ key: KEY }, client);
      expect(await service.suggest('abc')).toEqual({ status: 'error', reason });
    },
  );

  it('nicht entschlüsselbarer Key: disabled ohne Netzwerkanfrage', async () => {
    const secrets = createFakeSecretStore();
    const { service, calls } = await setup({ key: KEY, secrets });
    secrets.broken = true;
    expect(await service.suggest('abc')).toEqual({ status: 'disabled' });
    expect(calls).toHaveLength(0);
  });

  it('enthält den Key nie in der Antwort', async () => {
    const { service } = await setup({ key: KEY });
    expect(JSON.stringify(await service.suggest('abc'))).not.toContain(KEY);
    const { client } = fakeClient({ ok: false, reason: 'invalid_key' });
    const failing = (await setup({ key: KEY }, client)).service;
    expect(JSON.stringify(await failing.suggest('abc'))).not.toContain(KEY);
  });
});

describe('AddressService.testKey', () => {
  it('liefert valid bei Erfolg und den Grund bei Fehlern', async () => {
    const { service } = await setup();
    expect(await service.testKey(KEY)).toBe('valid');

    for (const reason of ['invalid_key', 'quota', 'offline', 'timeout', 'unavailable'] as const) {
      const { client } = fakeClient({ ok: false, reason });
      const failing = (await setup({}, client)).service;
      expect(await failing.testKey(KEY)).toBe(reason);
    }
  });

  it('prüft den übergebenen Key und speichert ihn nicht', async () => {
    const { service, calls, db, secrets } = await setup();
    await service.testKey(`  ${KEY} `);
    expect(calls).toEqual([{ text: 'Bahnhofstrasse', apiKey: KEY }]);
    const row = db.prepare('SELECT geoapify_api_key AS key FROM settings WHERE id = 1').get() as { key: Buffer | null };
    expect(row.key).toBeNull();
    expect(await secrets.isAvailable()).toBe(true);
  });
});
