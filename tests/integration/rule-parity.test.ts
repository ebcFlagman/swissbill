import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CustomerInput } from '@shared/domain/customer';
import type { SettingsFields } from '@shared/domain/settings';
import { AppException } from '@shared/ipc/errors';
import { CustomerRepository } from '../../src/main/db/customer-repository';
import { InvoiceRepository } from '../../src/main/db/invoice-repository';
import { saveSettings } from '../../src/main/db/settings-repository';
import { openAndMigrate } from '../../src/main/db/startup';
import { createFilledDraft, createService } from '../fixtures/db';
import { createLegacyDb } from '../fixtures/legacy-db';
import { makeDraftInput, QR_IBAN } from '../fixtures/invoice';

/**
 * Every former CHECK rule of the old schema (`tests/fixtures/legacy-migrations/001_init.sql`) now applies in the
 * application code, even when the repositories are used directly (FR-008). The tests run against a fresh and
 * against a database taken over from version 2.
 */
async function rejects(promise: Promise<unknown>, field?: string): Promise<void> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(AppException);
    const app = e as AppException;
    expect(app.error.code).toBe('VALIDATION');
    if (field) expect(app.error.fields?.map((f) => f.field)).toContain(field);
    return;
  }
  throw new Error('Es wurde keine AppException geworfen.');
}

const customer = (over: Partial<CustomerInput> = {}): CustomerInput => ({
  name: 'Muster',
  street: '',
  houseNo: '',
  zip: '8000',
  city: 'Zürich',
  country: 'CH',
  notes: '',
  ...over,
});

const settings = (over: Partial<SettingsFields> = {}): SettingsFields => ({
  sender: { name: 'Muster AG', street: 'Weg', houseNo: '1', zip: '8000', city: 'Zürich', country: 'CH', iban: QR_IBAN },
  invoicePrefix: 'RE',
  defaultClosingText: null,
  defaultPaymentDays: 30,
  ...over,
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-rules-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function fresh(): Promise<DataSource> {
  return openAndMigrate(':memory:');
}
async function migrated(): Promise<DataSource> {
  const file = join(dir, 'swissbill.db');
  createLegacyDb(file);
  return openAndMigrate(file);
}

describe.each([
  ['frische Datenbank', fresh],
  ['aus Version 2 übernommene Datenbank', migrated],
])('Regel-Parität (%s)', (_name, open) => {
  it('Kunden: Name 1–70, Strasse ≤ 70, Hausnummer ≤ 16, PLZ 1–16, Ort 1–35, Land genau 2 Zeichen', async () => {
    const repo = new CustomerRepository(await open());
    await rejects(repo.insert(customer({ name: '' }), 'x'), 'customer.name');
    await rejects(repo.insert(customer({ name: 'x'.repeat(71) }), 'x'), 'customer.name');
    await rejects(repo.insert(customer({ street: 'x'.repeat(71) }), 'x'), 'customer.street');
    await rejects(repo.insert(customer({ houseNo: 'x'.repeat(17) }), 'x'), 'customer.houseNo');
    await rejects(repo.insert(customer({ zip: '' }), 'x'), 'customer.zip');
    await rejects(repo.insert(customer({ zip: '1'.repeat(17) }), 'x'), 'customer.zip');
    await rejects(repo.insert(customer({ city: '' }), 'x'), 'customer.city');
    await rejects(repo.insert(customer({ city: 'x'.repeat(36) }), 'x'), 'customer.city');
    await rejects(repo.insert(customer({ country: 'CHE' }), 'x'), 'customer.country');
    await rejects(repo.insert(customer({ country: 'C' }), 'x'), 'customer.country');
    const id = await repo.insert(customer(), 'x');
    await rejects(repo.update(id, customer({ name: 'x'.repeat(71) }), 'y'), 'customer.name');
    expect((await repo.get(id))?.name).toBe('Muster');
  });

  it('Einstellungen: Absender-Längen, Land, IBAN, Präfix 1–10 [A-Z0-9-], Zahlungsfrist 0–365', async () => {
    const db = await open();
    const base = settings();
    const save = (s: SettingsFields) => saveSettings(db, s, 'x');
    await rejects(save({ ...base, sender: { ...base.sender, name: 'x'.repeat(71) } }), 'sender.name');
    await rejects(save({ ...base, sender: { ...base.sender, street: 'x'.repeat(71) } }), 'sender.street');
    await rejects(save({ ...base, sender: { ...base.sender, houseNo: 'x'.repeat(17) } }), 'sender.houseNo');
    await rejects(save({ ...base, sender: { ...base.sender, zip: '1'.repeat(17) } }), 'sender.zip');
    await rejects(save({ ...base, sender: { ...base.sender, city: 'x'.repeat(36) } }), 'sender.city');
    await rejects(save({ ...base, sender: { ...base.sender, country: 'CHE' } }), 'sender.country');
    await rejects(save({ ...base, sender: { ...base.sender, iban: 'CH93' + '0'.repeat(30) } }), 'sender.iban');
    await rejects(save({ ...base, invoicePrefix: '' }), 'invoicePrefix');
    await rejects(save({ ...base, invoicePrefix: 'A'.repeat(11) }), 'invoicePrefix');
    await rejects(save({ ...base, invoicePrefix: 'ab' }), 'invoicePrefix');
    await rejects(save({ ...base, invoicePrefix: 'A_B' }), 'invoicePrefix');
    await rejects(save({ ...base, defaultPaymentDays: -1 }), 'defaultPaymentDays');
    await rejects(save({ ...base, defaultPaymentDays: 366 }), 'defaultPaymentDays');
    await expect(save({ ...base, defaultPaymentDays: 0, invoicePrefix: 'A-1' })).resolves.toBeUndefined();
    await expect(save({ ...base, defaultPaymentDays: 365, invoicePrefix: 'A'.repeat(10) })).resolves.toBeUndefined();
  });

  it('Rechnung: Absender-Längen und Land beim Anlegen, Datumsreihenfolge, Positionen, Beträge', async () => {
    const db = await open();
    const repo = new InvoiceRepository(db);
    const { service } = createService(db);
    const sender = makeDraftInput().sender;
    const newDraft = (over: Partial<typeof sender>) => ({
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      sender: { ...sender, ...over },
      closingText: null,
      createdAt: 'x',
    });
    await rejects(repo.createDraft(newDraft({ name: 'x'.repeat(71) })), 'sender.name');
    await rejects(repo.createDraft(newDraft({ country: 'CHE' })), 'sender.country');

    const draft = await createFilledDraft(service);
    const save = (over: Parameters<typeof makeDraftInput>[0]) => repo.saveDraft(makeDraftInput({ id: draft.id, ...over }), 'x');
    const base = makeDraftInput();
    await rejects(save({ dueDate: '2026-02-28' }), 'dueDate'); // due_date >= invoice_date
    await rejects(save({ debtor: { ...base.debtor, name: 'x'.repeat(71) } }), 'debtor.name');
    await rejects(save({ debtor: { ...base.debtor, country: 'CHE' } }), 'debtor.country');
    await rejects(save({ sender: { ...base.sender, iban: 'CH93' + '0'.repeat(30) } }), 'sender.iban');
    await rejects(save({ items: [{ description: 'x'.repeat(501), quantityMilli: 1000, unitPriceRappen: 1 }] }), 'items.0.description');
    await rejects(save({ items: [{ description: 'x', quantityMilli: 0, unitPriceRappen: 1 }] }), 'items.0.quantity');
    await rejects(save({ items: [{ description: 'x', quantityMilli: -1000, unitPriceRappen: 1 }] }), 'items.0.quantity');
    await rejects(save({ items: [{ description: 'x', quantityMilli: 1000, unitPriceRappen: -1 }] }), 'items.0.unitPrice');
    expect(await service.get(draft.id)).toEqual(draft); // nothing was saved
  });

  it('Rechnung: ausstellen verlangt Nummer-relevante Pflichtfelder und einen Gesamtbetrag über 0', async () => {
    const db = await open();
    const repo = new InvoiceRepository(db);
    const { service } = createService(db);
    const base = makeDraftInput();
    const countersBefore = await db.query('SELECT * FROM number_counters ORDER BY year');
    const noItems = await createFilledDraft(service, { items: [] });
    await rejects(repo.issue(noItems.id, 2026, () => { throw new Error('darf nicht erreicht werden'); }), 'items');
    const zeroTotal = await createFilledDraft(service, { items: [{ description: 'Gratis', quantityMilli: 1000, unitPriceRappen: 0 }] });
    await rejects(repo.issue(zeroTotal.id, 2026, () => { throw new Error('darf nicht erreicht werden'); }), 'total');
    const noDebtor = await createFilledDraft(service, { debtor: { ...base.debtor, name: '' } });
    await rejects(repo.issue(noDebtor.id, 2026, () => { throw new Error('darf nicht erreicht werden'); }), 'debtor.name');
    for (const d of [noItems, zeroTotal, noDebtor]) {
      const unchanged = await service.get(d.id);
      expect(unchanged.status).toBe('draft');
      expect(unchanged.number).toBeNull(); // a draft has no number
    }
    expect(await db.query('SELECT * FROM number_counters ORDER BY year')).toEqual(countersBefore); // counter unchanged
  });
});
