import { expect, it } from 'vitest';
import { describeMatrixDb } from '../helpers/db-targets';
import { AppException } from '@shared/ipc/errors';
import type { CustomerInput } from '@shared/domain/customer';
import type { SettingsInput } from '@shared/domain/settings';
import { CustomerService } from '../../../src/main/services/customer-service';
import { SettingsService } from '../../../src/main/services/settings-service';
import { createFakeSecretStore } from '../../fixtures/secret-store';
import { createFilledDraft, createService, createTestDb } from '../../fixtures/db';
import { makeDraftInput, NORMAL_IBAN, QR_IBAN } from '../../fixtures/invoice';

const customer = (overrides: Partial<CustomerInput> = {}): CustomerInput => ({
  name: 'Müller AG',
  street: 'Bahnhofstrasse',
  houseNo: '10',
  zip: '8001',
  city: 'Zürich',
  country: 'CH',
  notes: '',
  ...overrides,
});

const validSettings = (overrides: Partial<SettingsInput> = {}): SettingsInput => ({
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
  defaultClosingText: 'Zahlbar innert 30 Tagen.',
  defaultPaymentDays: 30,
  ...overrides,
});

async function failure(fn: () => unknown): Promise<AppException> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof AppException) return e;
    throw e;
  }
  throw new Error('Es wurde keine AppException geworfen.');
}

describeMatrixDb('Kunden', () => {
  it('legt Kunden an, ändert sie und listet sie sortiert nach Name', async () => {
    const customers = new CustomerService(await createTestDb());
    const a = await customers.save(customer({ name: 'Zeta GmbH' }));
    const b = await customers.save(customer({ name: 'Alpha AG' }));
    expect(a.id).not.toBe(b.id);
    expect((await customers.list()).map((c) => c.name)).toEqual(['Alpha AG', 'Zeta GmbH']);

    const changed = await customers.save({ ...a, city: 'Bern', notes: 'Stammkunde' });
    expect(changed).toMatchObject({ id: a.id, city: 'Bern', notes: 'Stammkunde' });
    expect((await customers.get(a.id)).city).toBe('Bern');
  });

  it('sucht in Name und Ort ohne Beachtung der Gross-/Kleinschreibung (auch Umlaute)', async () => {
    const customers = new CustomerService(await createTestDb());
    await customers.save(customer({ name: 'Müller AG', city: 'Zürich' }));
    await customers.save(customer({ name: 'Meier & Söhne', city: 'Bern' }));
    expect((await customers.list('MÜLLER')).map((c) => c.name)).toEqual(['Müller AG']);
    expect((await customers.list('bern')).map((c) => c.name)).toEqual(['Meier & Söhne']);
    expect(await customers.list('zzz')).toEqual([]);
  });

  it('prüft Pflichtfelder, Längen und Zeichensatz feldgenau', async () => {
    const customers = new CustomerService(await createTestDb());
    const error = await failure(() =>
      customers.save(customer({ name: '', zip: '', city: 'x'.repeat(36) })),
    );
    expect(error.error.code).toBe('VALIDATION');
    expect(error.error.fields?.map((f) => f.field).sort()).toEqual([
      'customer.city',
      'customer.name',
      'customer.zip',
    ]);
    expect(
      (await failure(() => customers.save(customer({ notes: 'x'.repeat(2001) })))).error.fields?.[0]
        ?.field,
    ).toBe('customer.notes');
  });

  it('meldet NOT_FOUND für unbekannte Kunden', async () => {
    const customers = new CustomerService(await createTestDb());
    expect((await failure(() => customers.get(999))).error.code).toBe('NOT_FOUND');
    expect((await failure(() => customers.delete(999))).error.code).toBe('NOT_FOUND');
  });

  it('beim Löschen bleiben bestehende Rechnungen unverändert (customer_id wird NULL)', async () => {
    const db = await createTestDb();
    const customers = new CustomerService(db);
    const saved = await customers.save(customer());
    const { service } = createService(db);
    const issued = await service.issue(
      (
        await createFilledDraft(service, {
          customerId: saved.id,
          debtor: { ...makeDraftInput().debtor, name: saved.name },
        })
      ).id,
    );
    const draft = await createFilledDraft(service, { customerId: saved.id });

    await customers.delete(saved.id);

    expect(await service.get(issued.id)).toEqual({ ...issued, customerId: null });
    expect((await service.get(draft.id)).customerId).toBeNull();
    expect((await service.get(draft.id)).debtor.name).toBe(makeDraftInput().debtor.name);
  });

  it('eine spätere Änderung der Kundenadresse ändert ausgestellte Rechnungen nicht', async () => {
    const db = await createTestDb();
    const customers = new CustomerService(db);
    const saved = await customers.save(customer());
    const { service } = createService(db);
    const debtor = {
      name: saved.name,
      street: saved.street,
      houseNo: saved.houseNo,
      zip: saved.zip,
      city: saved.city,
      country: saved.country,
    };
    const issued = await service.issue(
      (await createFilledDraft(service, { customerId: saved.id, debtor })).id,
    );

    await customers.save({ ...saved, street: 'Neue Strasse', zip: '3000', city: 'Bern' });

    const after = await service.get(issued.id);
    expect(after.debtor).toEqual(debtor);
    expect(after).toEqual(issued);
  });
});

describeMatrixDb('Einstellungen', () => {
  it('liefert zu Beginn leere Absenderfelder und die Standardwerte', async () => {
    const settings = await new SettingsService(await createTestDb(), createFakeSecretStore()).get();
    expect(settings.sender.name).toBe('');
    expect(settings.sender.country).toBe('CH');
    expect(settings.invoicePrefix).toBe('RE');
    expect(settings.defaultPaymentDays).toBe(30);
    expect(settings.defaultClosingText).toBeNull();
  });

  it('speichert Absender, Präfix, Schlusstext und Zahlungsfrist (IBAN ohne Leerzeichen)', async () => {
    const service = new SettingsService(await createTestDb(), createFakeSecretStore());
    const saved = await service.save(
      validSettings({
        sender: { ...validSettings().sender, iban: 'ch93 0076 2011 6238 5295 7' },
        invoicePrefix: 'INV-A',
        defaultPaymentDays: 14,
      }),
    );
    expect(saved.sender.iban).toBe(NORMAL_IBAN);
    expect(saved.invoicePrefix).toBe('INV-A');
    expect(await service.get()).toEqual(saved);
  });

  it('validiert IBAN, Adresse, Präfix, Schlusstext und Zahlungsfrist feldgenau', async () => {
    const service = new SettingsService(await createTestDb(), createFakeSecretStore());
    const base = validSettings();
    const fieldsFor = async (s: SettingsInput) => {
      try {
        await service.save(s);
      } catch (e) {
        if (e instanceof AppException) return e.error.fields?.map((f) => f.field);
        throw e;
      }
      throw new Error('Es wurde keine AppException geworfen.');
    };

    expect(
      await fieldsFor({ ...base, sender: { ...base.sender, iban: 'CH9300762011623852958' } }),
    ).toEqual(['sender.iban']);
    expect(await fieldsFor({ ...base, sender: { ...base.sender, name: '' } })).toEqual([
      'sender.name',
    ]);
    expect(await fieldsFor({ ...base, invoicePrefix: 're' })).toEqual(['invoicePrefix']);
    expect(await fieldsFor({ ...base, invoicePrefix: 'ABCDEFGHIJK' })).toEqual(['invoicePrefix']);
    expect(await fieldsFor({ ...base, defaultPaymentDays: -1 })).toEqual(['defaultPaymentDays']);
    expect(await fieldsFor({ ...base, defaultPaymentDays: 366 })).toEqual(['defaultPaymentDays']);
    expect(await fieldsFor({ ...base, defaultClosingText: 'x'.repeat(2001) })).toEqual([
      'defaultClosingText',
    ]);
    // Nothing was saved
    expect((await service.get()).sender.name).toBe('');
  });

  it('eine Änderung der Einstellungen wirkt nicht auf bestehende Rechnungen, aber auf neue Entwürfe', async () => {
    const db = await createTestDb();
    const settings = new SettingsService(db, createFakeSecretStore());
    await settings.save(validSettings());
    const { service } = createService(db);

    const issued = await service.issue((await createFilledDraft(service)).id);
    const before = await service.get(issued.id);

    await settings.save(
      validSettings({
        sender: { ...validSettings().sender, name: 'Neue Firma AG', iban: NORMAL_IBAN },
        invoicePrefix: 'XX',
        defaultClosingText: 'Neuer Text',
        defaultPaymentDays: 10,
      }),
    );

    expect(await service.get(issued.id)).toEqual(before);
    expect((await service.get(issued.id)).sender.name).toBe('Robert Schneider AG');

    const draft = await service.createDraft();
    expect(draft.sender.name).toBe('Neue Firma AG');
    expect(draft.sender.iban).toBe(NORMAL_IBAN);
    expect(draft.closingText).toBe('Neuer Text');
    expect(draft.dueDate > draft.invoiceDate).toBe(true);

    // The new prefix applies to new invoices; the counter sequence continues
    const second = await service.issue((await createFilledDraft(service)).id);
    expect(second.number).toBe('XX-2026-0002');
    expect((await service.get(issued.id)).number).toBe('RE-2026-0001');
  });

  it('das Überschreiben von Absender und Schlusstext in einer Rechnung ändert die Einstellungen nicht', async () => {
    const db = await createTestDb();
    const settings = new SettingsService(db, createFakeSecretStore());
    await settings.save(validSettings());
    const { service } = createService(db);

    const draft = await service.createDraft();
    expect(draft.sender).toEqual(validSettings().sender);
    expect(draft.closingText).toBe('Zahlbar innert 30 Tagen.');

    const overridden = await service.saveDraft(
      makeDraftInput({
        id: draft.id,
        sender: { ...validSettings().sender, name: 'Andere Firma GmbH', iban: NORMAL_IBAN },
        closingText: 'Nur für diese Rechnung',
      }),
    );
    expect(overridden.sender.name).toBe('Andere Firma GmbH');
    expect(overridden.closingText).toBe('Nur für diese Rechnung');

    expect(await settings.get()).toEqual({
      ...validSettings(),
      geoapifyKeySet: false,
      geoapifyKeyStatus: 'none',
    });
    const issued = await service.issue(draft.id);
    expect(issued.sender.name).toBe('Andere Firma GmbH');
    expect(issued.referenceType).toBe('SCOR'); // overridden normal IBAN
  });
});
