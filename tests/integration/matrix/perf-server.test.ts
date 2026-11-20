import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { InvoiceEntity } from '../../../src/main/db/entities/invoice.entity';
import { InvoiceService } from '../../../src/main/services/invoice-service';
import { createFilledDraft, createService } from '../../fixtures/db';
import { describeMatrix, type TestDb } from '../helpers/db-targets';

/** Performance goal of plan.md for servers in the local network: issuing under 2 s; list stays fast. */
describeMatrix('Leistung bei Serverdatenbanken', (name, create) => {
  if (name === 'sqlite') {
    it('lokal siehe perf.test.ts', () => {
      expect(name).toBe('sqlite');
    });
    return;
  }

  let target: TestDb;
  beforeEach(async () => {
    target = await create();
  });
  afterEach(async () => {
    await target.close();
  });

  it('Ausstellen dauert unter 2 s, Listen und Suche bei 3000 Rechnungen unter 1 s', async () => {
    const db = await target.open();
    const { service } = createService(db);

    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      const draft = await createFilledDraft(service);
      const start = performance.now();
      await service.issue(draft.id);
      times.push(performance.now() - start);
    }
    for (const ms of times) expect(ms, `Ausstellen: ${ms.toFixed(0)} ms`).toBeLessThan(2000);

    const rows = Array.from({ length: 3000 }, (_, i) => {
      const year = 2020 + Math.floor(i / 1000);
      const seq = (i % 1000) + 1;
      const now = `${year}-06-15T10:00:00.000Z`;
      return {
        status: (i % 3 === 0 ? 'paid' : 'issued') as 'paid' | 'issued',
        number: `X-${year}-${String(seq).padStart(4, '0')}`,
        number_year: year,
        number_seq: seq,
        invoice_date: `${year}-06-15`,
        due_date: `${year}-07-15`,
        debtor_name: i % 2 === 0 ? 'Müller AG' : 'Meier & Söhne',
        sender_country: 'CH',
        debtor_country: 'CH',
        reference_type: 'QRR' as const,
        reference: '210000000003139471430009017',
        total_rappen: 1000 + i,
        issued_at: now,
        created_at: now,
        updated_at: now,
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      await db.getRepository(InvoiceEntity).insert(rows.slice(i, i + 500));
    }

    const list = new InvoiceService(db);
    await list.list({}); // warm up
    const time = async (fn: () => Promise<unknown>) => {
      const start = performance.now();
      await fn();
      return performance.now() - start;
    };
    const all = await time(async () => expect((await list.list({})).length).toBeGreaterThan(3000));
    const search = await time(async () =>
      expect((await list.list({ search: 'müller' })).length).toBeGreaterThan(1000),
    );
    expect(all, `Liste: ${all.toFixed(0)} ms`).toBeLessThan(1000);
    expect(search, `Suche: ${search.toFixed(0)} ms`).toBeLessThan(1000);
  });
});
