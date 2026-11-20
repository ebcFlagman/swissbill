import { expect, it } from 'vitest';
import { MAX_TOTAL_RAPPEN } from '@shared/domain/invoice';
import { CustomerService } from '../../../src/main/services/customer-service';
import { createFilledDraft, createService, createTestDb } from '../../fixtures/db';
import { describeMatrixDb } from '../helpers/db-targets';

describeMatrixDb('Beträge, Zeichen und Zeitstempel (SC-002)', () => {
  it('der Höchstbetrag wird als Rechnung ausgestellt, gespeichert und exakt als Zahl gelesen', async () => {
    const db = await createTestDb();
    const { service } = createService(db);
    const draft = await createFilledDraft(service, {
      items: [
        { description: 'Grossauftrag', quantityMilli: 1000, unitPriceRappen: MAX_TOTAL_RAPPEN },
      ],
    });
    expect(draft.totalRappen).toBe(MAX_TOTAL_RAPPEN);
    const issued = await service.issue(draft.id);
    expect(issued.totalRappen).toBe(MAX_TOTAL_RAPPEN);
    const read = await service.get(draft.id);
    expect(typeof read.totalRappen).toBe('number');
    expect(read.items[0]?.unitPriceRappen).toBe(MAX_TOTAL_RAPPEN);
    expect(read.items[0]?.amountRappen).toBe(MAX_TOTAL_RAPPEN);
    expect(read.items[0]?.quantityMilli).toBe(1000);
  });

  it('Umlaute, Akzente und volle Feldlängen in Zeichen (nicht Bytes) bleiben unverändert', async () => {
    const db = await createTestDb();
    const customers = new CustomerService(db);
    const name = 'Ä'.repeat(70); // full length, two bytes per character in UTF-8
    const saved = await customers.save({
      name,
      street: 'Rue de Genève',
      houseNo: 'ÄÖÜ-12',
      zip: '1200',
      city: 'Zürich-Örlikon Ç',
      country: 'CH',
      notes: 'Notiz mit Ümläuten: Straße, ñ, é',
    });
    const read = await customers.get(saved.id);
    expect(read.name).toBe(name);
    expect(read.street).toBe('Rue de Genève');
    expect(read.city).toBe('Zürich-Örlikon Ç');
    expect(read.notes).toBe('Notiz mit Ümläuten: Straße, ñ, é');
  });

  it('Zeitstempel und Datumsfelder bleiben exakt, unabhängig von Zeitzone und Format des Servers', async () => {
    const db = await createTestDb();
    const { service } = createService(db, () => new Date(Date.UTC(2026, 2, 1, 23, 59, 59, 123)));
    const draft = await createFilledDraft(service, {
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
    });
    const issued = await service.issue(draft.id);
    expect(issued.invoiceDate).toBe('2026-03-01');
    expect(issued.dueDate).toBe('2026-03-31');
    expect(issued.issuedAt).toBe('2026-03-01T23:59:59.123Z');
    expect((await service.get(draft.id)).issuedAt).toBe('2026-03-01T23:59:59.123Z');
  });

  it('eine zu lange Eingabe wird von der Anwendung abgelehnt, nicht von der Datenbank abgeschnitten', async () => {
    const db = await createTestDb();
    const customers = new CustomerService(db);
    await expect(
      customers.save({
        name: 'x'.repeat(71),
        street: '',
        houseNo: '',
        zip: '8000',
        city: 'Zürich',
        country: 'CH',
        notes: '',
      }),
    ).rejects.toMatchObject({ error: { code: 'VALIDATION' } });
    expect(await customers.list()).toEqual([]);
  });
});
