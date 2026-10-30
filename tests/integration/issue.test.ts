import { describe, expect, it } from 'vitest';
import { AppException } from '@shared/ipc/errors';
import { buildCreditorReference, buildQrReference } from '@shared/domain/reference';
import { createFilledDraft, createService, createTestDb } from '../fixtures/db';
import { makeDraftInput, NORMAL_IBAN } from '../fixtures/invoice';

function counters(db: ReturnType<typeof createTestDb>) {
  return db.prepare('SELECT year, last_seq FROM number_counters ORDER BY year').all();
}

describe('Ausstellen', () => {
  it('vergibt Nummer, Referenz und Referenztyp und schreibt die Rechnung fest', () => {
    const db = createTestDb();
    const { service } = createService(db);
    const draft = createFilledDraft(service);
    expect(draft.status).toBe('draft');
    expect(draft.number).toBeNull();

    const issued = service.issue(draft.id);
    expect(issued.status).toBe('issued');
    expect(issued.number).toBe('RE-2026-0001');
    expect(issued.numberYear).toBe(2026);
    expect(issued.numberSeq).toBe(1);
    expect(issued.referenceType).toBe('QRR'); // QR-IBAN
    expect(issued.reference).toBe(buildQrReference(2026, 1));
    expect(issued.totalRappen).toBe(2 * 15000 + 4975);
    expect(issued.issuedAt).not.toBeNull();
    expect(issued.layoutVersion).toBeGreaterThan(0);
    expect(service.get(draft.id)).toEqual(issued);
  });

  it('verwendet SCOR (Creditor Reference) bei normaler IBAN', () => {
    const db = createTestDb();
    const { service } = createService(db);
    const base = makeDraftInput();
    const draft = createFilledDraft(service, { sender: { ...base.sender, iban: NORMAL_IBAN } });
    const issued = service.issue(draft.id);
    expect(issued.referenceType).toBe('SCOR');
    expect(issued.reference).toBe(buildCreditorReference(2026, 1));
  });

  it('vergibt lückenlose und doppelfreie Nummern über mehrere Rechnungen', () => {
    const db = createTestDb();
    const { service } = createService(db);
    const numbers = [1, 2, 3, 4, 5].map(() => service.issue(createFilledDraft(service).id).number);
    expect(numbers).toEqual([
      'RE-2026-0001',
      'RE-2026-0002',
      'RE-2026-0003',
      'RE-2026-0004',
      'RE-2026-0005',
    ]);
    expect(new Set(numbers).size).toBe(5);
    expect(counters(db)).toEqual([{ year: 2026, last_seq: 5 }]);
  });

  it('verwendet den konfigurierten Präfix', () => {
    const db = createTestDb();
    db.prepare("UPDATE settings SET invoice_prefix = 'INV-A' WHERE id = 1").run();
    const { service } = createService(db);
    const issued = service.issue(createFilledDraft(service).id);
    expect(issued.number).toBe('INV-A-2026-0001');
  });

  it('das Jahr der Nummer ist das Jahr der Ausstellung, nicht des Rechnungsdatums (Jahreswechsel)', () => {
    const db = createTestDb();
    const { service, setClock } = createService(db);

    setClock(() => new Date(2026, 11, 31, 23, 0));
    const a = service.issue(createFilledDraft(service, { invoiceDate: '2026-12-31', dueDate: '2027-01-30' }).id);
    const b = service.issue(createFilledDraft(service, { invoiceDate: '2026-12-31', dueDate: '2027-01-30' }).id);
    expect([a.number, b.number]).toEqual(['RE-2026-0001', 'RE-2026-0002']);

    setClock(() => new Date(2027, 0, 1, 8, 0));
    const c = service.issue(createFilledDraft(service, { invoiceDate: '2026-12-31', dueDate: '2027-01-30' }).id);
    expect(c.number).toBe('RE-2027-0001');
    expect(c.invoiceDate).toBe('2026-12-31');
    expect(c.reference).toBe(buildQrReference(2027, 1));
    expect(counters(db)).toEqual([
      { year: 2026, last_seq: 2 },
      { year: 2027, last_seq: 1 },
    ]);
  });

  it('eine fehlgeschlagene Validierung ändert weder Status noch Zähler', () => {
    const db = createTestDb();
    const { service } = createService(db);
    const base = makeDraftInput();
    const draft = createFilledDraft(service, { debtor: { ...base.debtor, name: '' } });

    let error: unknown;
    try {
      service.issue(draft.id);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AppException);
    const app = error as AppException;
    expect(app.error.code).toBe('VALIDATION');
    expect(app.error.fields?.map((f) => f.field)).toEqual(['debtor.name']);

    expect(service.get(draft.id).status).toBe('draft');
    expect(service.get(draft.id).number).toBeNull();
    expect(counters(db)).toEqual([]);
  });

  it('vergibt Nummer und Status in einer Transaktion: bei einem Konflikt bleibt der Zähler unverändert', () => {
    const db = createTestDb();
    // Eine bereits belegte Nummer erzwingt einen Fehler mitten im Ausstellen.
    db.prepare(
      `INSERT INTO invoices (status, number, number_year, number_seq, invoice_date, due_date,
                             reference_type, reference, total_rappen, issued_at)
       VALUES ('issued', 'RE-2026-0001', 2026, 1, '2026-01-01', '2026-01-31', 'QRR', 'x', 100, '2026-01-01T00:00:00.000Z')`,
    ).run();
    const { service } = createService(db);
    const draft = createFilledDraft(service);

    expect(() => service.issue(draft.id)).toThrow();
    expect(service.get(draft.id).status).toBe('draft');
    expect(counters(db)).toEqual([]);
  });

  it('stellt eine bereits ausgestellte Rechnung nicht erneut aus', () => {
    const db = createTestDb();
    const { service } = createService(db);
    const issued = service.issue(createFilledDraft(service).id);
    expect(() => service.issue(issued.id)).toThrow(/Entwurf|bereits/);
    expect(counters(db)).toEqual([{ year: 2026, last_seq: 1 }]);
  });

  it('meldet NOT_FOUND für unbekannte Rechnungen', () => {
    const { service } = createService(createTestDb());
    try {
      service.issue(999);
      expect.unreachable();
    } catch (e) {
      expect((e as AppException).error.code).toBe('NOT_FOUND');
    }
  });
});
