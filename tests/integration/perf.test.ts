import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { renderInvoicePdf } from '../../src/main/services/pdf-service';
import { InvoiceService } from '../../src/main/services/invoice-service';
import { createTestDb } from '../fixtures/db';
import { makeIssuedInvoice, makeItem } from '../fixtures/invoice';

/** Leistungsziele aus plan.md: Liste und Filter bei 5'000 Rechnungen unter 200 ms, PDF mit 50 Positionen unter 2 s. */
describe('Leistung', () => {
  it('Liste und Filter bei 5\'000 Rechnungen bleiben unter 200 ms', () => {
    const db = createTestDb();
    const insert = db.prepare(
      `INSERT INTO invoices (status, number, number_year, number_seq, invoice_date, due_date, debtor_name,
                             reference_type, reference, total_rappen, issued_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'QRR', ?, ?, ?)`,
    );
    const names = ['Müller AG', 'Meier & Söhne', 'Schneider GmbH', 'Rutschmann Treuhand', 'Keller & Partner'];
    db.transaction(() => {
      for (let i = 1; i <= 5000; i++) {
        const year = 2020 + Math.floor((i - 1) / 1000);
        const seq = ((i - 1) % 1000) + 1;
        const status = i % 10 === 0 ? 'cancelled' : i % 3 === 0 ? 'paid' : 'issued';
        const month = String((i % 12) + 1).padStart(2, '0');
        insert.run(
          status,
          `RE-${year}-${String(seq).padStart(4, '0')}`,
          year,
          seq,
          `${year}-${month}-15`,
          `${year}-${month}-28`,
          names[i % names.length],
          '210000000003139471430009017',
          1000 + i,
          `${year}-${month}-15T10:00:00.000Z`,
        );
      }
    })();

    const service = new InvoiceService(db);
    const time = (fn: () => unknown) => {
      const start = performance.now();
      fn();
      return performance.now() - start;
    };
    service.list({}); // Aufwärmen (Statement-Cache)

    const all = time(() => expect(service.list({})).toHaveLength(5000));
    const search = time(() => expect(service.list({ search: 'müller' }).length).toBeGreaterThan(900));
    const number = time(() => expect(service.list({ search: 'RE-2022-0042' })).toHaveLength(1));
    const status = time(() => expect(service.list({ status: ['paid'] }).length).toBeGreaterThan(1000));
    const combined = time(() => service.list({ search: 'meier', status: ['issued', 'paid'] }));

    for (const [name, ms] of Object.entries({ all, search, number, status, combined })) {
      expect(ms, `${name}: ${ms.toFixed(1)} ms`).toBeLessThan(200);
    }
  });

  it('ein PDF mit 50 Positionen entsteht in unter 2 Sekunden', async () => {
    const items = Array.from({ length: 50 }, (_, i) => makeItem(`Position ${i + 1} mit Beschreibung`, 1500, 2350));
    const invoice = makeIssuedInvoice({ items, totalRappen: 50 * 3525 });
    const start = performance.now();
    const pdf = await renderInvoicePdf(invoice);
    const ms = performance.now() - start;
    expect(pdf.length).toBeGreaterThan(5000);
    expect(ms, `PDF: ${ms.toFixed(0)} ms`).toBeLessThan(2000);
  });
});
