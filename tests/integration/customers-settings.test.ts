import { describe, expect, it } from 'vitest';
import { AppException } from '@shared/ipc/errors';
import type { CustomerInput } from '@shared/domain/customer';
import type { Settings } from '@shared/domain/settings';
import { CustomerService } from '../../src/main/services/customer-service';
import { SettingsService } from '../../src/main/services/settings-service';
import { createFilledDraft, createService, createTestDb } from '../fixtures/db';
import { makeDraftInput, NORMAL_IBAN, QR_IBAN } from '../fixtures/invoice';

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

const validSettings = (overrides: Partial<Settings> = {}): Settings => ({
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

function failure(fn: () => unknown): AppException {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppException) return e;
    throw e;
  }
  throw new Error('Es wurde keine AppException geworfen.');
}

describe('Kunden', () => {
  it('legt Kunden an, ändert sie und listet sie sortiert nach Name', () => {
    const customers = new CustomerService(createTestDb());
    const a = customers.save(customer({ name: 'Zeta GmbH' }));
    const b = customers.save(customer({ name: 'Alpha AG' }));
    expect(a.id).not.toBe(b.id);
    expect(customers.list().map((c) => c.name)).toEqual(['Alpha AG', 'Zeta GmbH']);

    const changed = customers.save({ ...a, city: 'Bern', notes: 'Stammkunde' });
    expect(changed).toMatchObject({ id: a.id, city: 'Bern', notes: 'Stammkunde' });
    expect(customers.get(a.id).city).toBe('Bern');
  });

  it('sucht in Name und Ort ohne Beachtung der Gross-/Kleinschreibung (auch Umlaute)', () => {
    const customers = new CustomerService(createTestDb());
    customers.save(customer({ name: 'Müller AG', city: 'Zürich' }));
    customers.save(customer({ name: 'Meier & Söhne', city: 'Bern' }));
    expect(customers.list('MÜLLER').map((c) => c.name)).toEqual(['Müller AG']);
    expect(customers.list('bern').map((c) => c.name)).toEqual(['Meier & Söhne']);
    expect(customers.list('zzz')).toEqual([]);
  });

  it('prüft Pflichtfelder, Längen und Zeichensatz feldgenau', () => {
    const customers = new CustomerService(createTestDb());
    const error = failure(() => customers.save(customer({ name: '', zip: '', city: 'x'.repeat(36) })));
    expect(error.error.code).toBe('VALIDATION');
    expect(error.error.fields?.map((f) => f.field).sort()).toEqual(['customer.city', 'customer.name', 'customer.zip']);
    expect(failure(() => customers.save(customer({ notes: 'x'.repeat(2001) }))).error.fields?.[0]?.field).toBe('customer.notes');
  });

  it('meldet NOT_FOUND für unbekannte Kunden', () => {
    const customers = new CustomerService(createTestDb());
    expect(failure(() => customers.get(999)).error.code).toBe('NOT_FOUND');
    expect(failure(() => customers.delete(999)).error.code).toBe('NOT_FOUND');
  });

  it('beim Löschen bleiben bestehende Rechnungen unverändert (customer_id wird NULL)', () => {
    const db = createTestDb();
    const customers = new CustomerService(db);
    const saved = customers.save(customer());
    const { service } = createService(db);
    const issued = service.issue(
      createFilledDraft(service, { customerId: saved.id, debtor: { ...makeDraftInput().debtor, name: saved.name } }).id,
    );
    const draft = createFilledDraft(service, { customerId: saved.id });

    customers.delete(saved.id);

    expect(service.get(issued.id)).toEqual({ ...issued, customerId: null });
    expect(service.get(draft.id).customerId).toBeNull();
    expect(service.get(draft.id).debtor.name).toBe(makeDraftInput().debtor.name);
  });

  it('eine spätere Änderung der Kundenadresse ändert ausgestellte Rechnungen nicht', () => {
    const db = createTestDb();
    const customers = new CustomerService(db);
    const saved = customers.save(customer());
    const { service } = createService(db);
    const debtor = { name: saved.name, street: saved.street, houseNo: saved.houseNo, zip: saved.zip, city: saved.city, country: saved.country };
    const issued = service.issue(createFilledDraft(service, { customerId: saved.id, debtor }).id);

    customers.save({ ...saved, street: 'Neue Strasse', zip: '3000', city: 'Bern' });

    const after = service.get(issued.id);
    expect(after.debtor).toEqual(debtor);
    expect(after).toEqual(issued);
  });
});

describe('Einstellungen', () => {
  it('liefert zu Beginn leere Absenderfelder und die Standardwerte', () => {
    const settings = new SettingsService(createTestDb()).get();
    expect(settings.sender.name).toBe('');
    expect(settings.sender.country).toBe('CH');
    expect(settings.invoicePrefix).toBe('RE');
    expect(settings.defaultPaymentDays).toBe(30);
    expect(settings.defaultClosingText).toBeNull();
  });

  it('speichert Absender, Präfix, Schlusstext und Zahlungsfrist (IBAN ohne Leerzeichen)', () => {
    const service = new SettingsService(createTestDb());
    const saved = service.save(
      validSettings({ sender: { ...validSettings().sender, iban: 'ch93 0076 2011 6238 5295 7' }, invoicePrefix: 'INV-A', defaultPaymentDays: 14 }),
    );
    expect(saved.sender.iban).toBe(NORMAL_IBAN);
    expect(saved.invoicePrefix).toBe('INV-A');
    expect(service.get()).toEqual(saved);
  });

  it('validiert IBAN, Adresse, Präfix, Schlusstext und Zahlungsfrist feldgenau', () => {
    const service = new SettingsService(createTestDb());
    const base = validSettings();
    const fieldsFor = (s: Settings) => failure(() => service.save(s)).error.fields?.map((f) => f.field);

    expect(fieldsFor({ ...base, sender: { ...base.sender, iban: 'CH9300762011623852958' } })).toEqual(['sender.iban']);
    expect(fieldsFor({ ...base, sender: { ...base.sender, name: '' } })).toEqual(['sender.name']);
    expect(fieldsFor({ ...base, invoicePrefix: 're' })).toEqual(['invoicePrefix']);
    expect(fieldsFor({ ...base, invoicePrefix: 'ABCDEFGHIJK' })).toEqual(['invoicePrefix']);
    expect(fieldsFor({ ...base, defaultPaymentDays: -1 })).toEqual(['defaultPaymentDays']);
    expect(fieldsFor({ ...base, defaultPaymentDays: 366 })).toEqual(['defaultPaymentDays']);
    expect(fieldsFor({ ...base, defaultClosingText: 'x'.repeat(2001) })).toEqual(['defaultClosingText']);
    // Nichts wurde gespeichert
    expect(service.get().sender.name).toBe('');
  });

  it('eine Änderung der Einstellungen wirkt nicht auf bestehende Rechnungen, aber auf neue Entwürfe', () => {
    const db = createTestDb();
    const settings = new SettingsService(db);
    settings.save(validSettings());
    const { service } = createService(db);

    const issued = service.issue(createFilledDraft(service).id);
    const before = service.get(issued.id);

    settings.save(
      validSettings({
        sender: { ...validSettings().sender, name: 'Neue Firma AG', iban: NORMAL_IBAN },
        invoicePrefix: 'XX',
        defaultClosingText: 'Neuer Text',
        defaultPaymentDays: 10,
      }),
    );

    expect(service.get(issued.id)).toEqual(before);
    expect(service.get(issued.id).sender.name).toBe('Robert Schneider AG');

    const draft = service.createDraft();
    expect(draft.sender.name).toBe('Neue Firma AG');
    expect(draft.sender.iban).toBe(NORMAL_IBAN);
    expect(draft.closingText).toBe('Neuer Text');
    expect(draft.dueDate > draft.invoiceDate).toBe(true);

    // Der neue Präfix gilt für neue Rechnungen; die Zählerfolge läuft weiter
    const second = service.issue(createFilledDraft(service).id);
    expect(second.number).toBe('XX-2026-0002');
    expect(service.get(issued.id).number).toBe('RE-2026-0001');
  });

  it('das Überschreiben von Absender und Schlusstext in einer Rechnung ändert die Einstellungen nicht', () => {
    const db = createTestDb();
    const settings = new SettingsService(db);
    settings.save(validSettings());
    const { service } = createService(db);

    const draft = service.createDraft();
    expect(draft.sender).toEqual(validSettings().sender);
    expect(draft.closingText).toBe('Zahlbar innert 30 Tagen.');

    const overridden = service.saveDraft(
      makeDraftInput({
        id: draft.id,
        sender: { ...validSettings().sender, name: 'Andere Firma GmbH', iban: NORMAL_IBAN },
        closingText: 'Nur für diese Rechnung',
      }),
    );
    expect(overridden.sender.name).toBe('Andere Firma GmbH');
    expect(overridden.closingText).toBe('Nur für diese Rechnung');

    expect(settings.get()).toEqual(validSettings());
    const issued = service.issue(draft.id);
    expect(issued.sender.name).toBe('Andere Firma GmbH');
    expect(issued.referenceType).toBe('SCOR'); // überschriebene normale IBAN
  });
});
