import type { DataSource } from 'typeorm';
import { expect, it } from 'vitest';
import { describeMatrixDb } from '../helpers/db-targets';
import { AppException } from '@shared/ipc/errors';
import { buildCreditorReference, buildQrReference } from '@shared/domain/reference';
import { createFilledDraft, createService, createTestDb } from '../../fixtures/db';
import { makeDraftInput, NORMAL_IBAN } from '../../fixtures/invoice';

function counters(db: DataSource): Promise<unknown[]> {
  return db.query('SELECT year, last_seq FROM number_counters ORDER BY year');
}

describeMatrixDb('Ausstellen', () => {
  it('vergibt Nummer, Referenz und Referenztyp und schreibt die Rechnung fest', async () => {
    const db = await createTestDb();
    const { service } = createService(db);
    const draft = await createFilledDraft(service);
    expect(draft.status).toBe('draft');
    expect(draft.number).toBeNull();

    const issued = await service.issue(draft.id);
    expect(issued.status).toBe('issued');
    expect(issued.number).toBe('RE-2026-0001');
    expect(issued.numberYear).toBe(2026);
    expect(issued.numberSeq).toBe(1);
    expect(issued.referenceType).toBe('QRR'); // QR-IBAN
    expect(issued.reference).toBe(buildQrReference(2026, 1));
    expect(issued.totalRappen).toBe(2 * 15000 + 4975);
    expect(issued.issuedAt).not.toBeNull();
    expect(issued.layoutVersion).toBeGreaterThan(0);
    expect(await service.get(draft.id)).toEqual(issued);
  });

  it('verwendet SCOR (Creditor Reference) bei normaler IBAN', async () => {
    const db = await createTestDb();
    const { service } = createService(db);
    const base = makeDraftInput();
    const draft = await createFilledDraft(service, {
      sender: { ...base.sender, iban: NORMAL_IBAN },
    });
    const issued = await service.issue(draft.id);
    expect(issued.referenceType).toBe('SCOR');
    expect(issued.reference).toBe(buildCreditorReference(2026, 1));
  });

  it('vergibt lückenlose und doppelfreie Nummern über mehrere Rechnungen', async () => {
    const db = await createTestDb();
    const { service } = createService(db);
    const numbers: (string | null)[] = [];
    for (let i = 0; i < 5; i++)
      numbers.push((await service.issue((await createFilledDraft(service)).id)).number);
    expect(numbers).toEqual([
      'RE-2026-0001',
      'RE-2026-0002',
      'RE-2026-0003',
      'RE-2026-0004',
      'RE-2026-0005',
    ]);
    expect(new Set(numbers).size).toBe(5);
    expect(await counters(db)).toEqual([{ year: 2026, last_seq: 5 }]);
  });

  it('verwendet den konfigurierten Präfix', async () => {
    const db = await createTestDb();
    await db.query("UPDATE settings SET invoice_prefix = 'INV-A' WHERE id = 1");
    const { service } = createService(db);
    const issued = await service.issue((await createFilledDraft(service)).id);
    expect(issued.number).toBe('INV-A-2026-0001');
  });

  it('das Jahr der Nummer ist das Jahr der Ausstellung, nicht des Rechnungsdatums (Jahreswechsel)', async () => {
    const db = await createTestDb();
    const { service, setClock } = createService(db);

    setClock(() => new Date(2026, 11, 31, 23, 0));
    const a = await service.issue(
      (await createFilledDraft(service, { invoiceDate: '2026-12-31', dueDate: '2027-01-30' })).id,
    );
    const b = await service.issue(
      (await createFilledDraft(service, { invoiceDate: '2026-12-31', dueDate: '2027-01-30' })).id,
    );
    expect([a.number, b.number]).toEqual(['RE-2026-0001', 'RE-2026-0002']);

    setClock(() => new Date(2027, 0, 1, 8, 0));
    const c = await service.issue(
      (await createFilledDraft(service, { invoiceDate: '2026-12-31', dueDate: '2027-01-30' })).id,
    );
    expect(c.number).toBe('RE-2027-0001');
    expect(c.invoiceDate).toBe('2026-12-31');
    expect(c.reference).toBe(buildQrReference(2027, 1));
    expect(await counters(db)).toEqual([
      { year: 2026, last_seq: 2 },
      { year: 2027, last_seq: 1 },
    ]);
  });

  it('eine fehlgeschlagene Validierung ändert weder Status noch Zähler', async () => {
    const db = await createTestDb();
    const { service } = createService(db);
    const base = makeDraftInput();
    const draft = await createFilledDraft(service, { debtor: { ...base.debtor, name: '' } });

    let error: unknown;
    try {
      await service.issue(draft.id);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AppException);
    const app = error as AppException;
    expect(app.error.code).toBe('VALIDATION');
    expect(app.error.fields?.map((f) => f.field)).toEqual(['debtor.name']);

    expect((await service.get(draft.id)).status).toBe('draft');
    expect((await service.get(draft.id)).number).toBeNull();
    expect(await counters(db)).toEqual([]);
  });

  it('vergibt Nummer und Status in einer Transaktion: bei einem Konflikt bleibt der Zähler unverändert', async () => {
    const db = await createTestDb();
    // An already taken number forces an error in the middle of issuing.
    await db.query(
      `INSERT INTO invoices (status, number, number_year, number_seq, invoice_date, due_date,
                             reference_type, reference, total_rappen, issued_at, created_at, updated_at)
       VALUES ('issued', 'RE-2026-0001', 2026, 1, '2026-01-01', '2026-01-31', 'QRR', 'x', 100,
               '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    );
    const { service } = createService(db);
    const draft = await createFilledDraft(service);

    await expect(service.issue(draft.id)).rejects.toThrow();
    expect((await service.get(draft.id)).status).toBe('draft');
    expect(await counters(db)).toEqual([]);
  });

  it('stellt eine bereits ausgestellte Rechnung nicht erneut aus', async () => {
    const db = await createTestDb();
    const { service } = createService(db);
    const issued = await service.issue((await createFilledDraft(service)).id);
    await expect(service.issue(issued.id)).rejects.toThrow(/Entwurf|bereits/);
    expect(await counters(db)).toEqual([{ year: 2026, last_seq: 1 }]);
  });

  it('meldet NOT_FOUND für unbekannte Rechnungen', async () => {
    const { service } = createService(await createTestDb());
    try {
      await service.issue(999);
      expect.unreachable();
    } catch (e) {
      expect((e as AppException).error.code).toBe('NOT_FOUND');
    }
  });
});
