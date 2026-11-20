import { describe, expect, it } from 'vitest';
import type { Invoice } from '@shared/domain/invoice';
import { AppException } from '@shared/ipc/errors';
import { InvoiceRepository } from '../../src/main/db/invoice-repository';
import { createFilledDraft, createService, createTestDb } from '../fixtures/db';
import { makeDraftInput } from '../fixtures/invoice';

describe('Nummernvergabe und Gleichzeitigkeit', () => {
  it('100 aufeinanderfolgende Ausstellvorgänge: lückenlos und ohne Duplikate', async () => {
    const db = await createTestDb();
    const { service } = createService(db);
    const numbers: (string | null)[] = [];
    for (let i = 0; i < 100; i++)
      numbers.push((await service.issue((await createFilledDraft(service)).id)).number);
    expect(numbers).toEqual(
      Array.from({ length: 100 }, (_, i) => `RE-2026-${String(i + 1).padStart(4, '0')}`),
    );
  });

  it('100 gleichzeitige Ausstellvorgänge (zwei Jahre gemischt): pro Jahr lückenlos und ohne Duplikate', async () => {
    const db = await createTestDb();
    // Two services with their own clock (2026 and 2027) work on the same database
    const y2026 = createService(db, () => new Date(2026, 5, 1, 10, 0)).service;
    const y2027 = createService(db, () => new Date(2027, 5, 1, 10, 0)).service;
    const jobs: Promise<Invoice>[] = [];
    for (let i = 0; i < 100; i++) {
      const service = i % 2 === 0 ? y2026 : y2027;
      const draft = await createFilledDraft(service);
      jobs.push(service.issue(draft.id));
    }
    const issued = await Promise.all(jobs);
    const byYear = (year: number) =>
      issued
        .filter((i) => i.numberYear === year)
        .map((i) => i.numberSeq)
        .sort((a, b) => (a ?? 0) - (b ?? 0));
    for (const year of [2026, 2027]) {
      expect(byYear(year)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    }
    expect(new Set(issued.map((i) => i.number)).size).toBe(100);
    expect(await db.query('SELECT year, last_seq FROM number_counters ORDER BY year')).toEqual([
      { year: 2026, last_seq: 50 },
      { year: 2027, last_seq: 50 },
    ]);
  });

  it('Ausstellen und Speichern derselben Rechnung gleichzeitig: genau ein Vorgang gewinnt, die Daten bleiben konsistent', async () => {
    const db = await createTestDb();
    const { service } = createService(db);
    const draft = await createFilledDraft(service);
    const results = await Promise.allSettled([
      service.issue(draft.id),
      service.saveDraft(makeDraftInput({ id: draft.id, closingText: 'Gleichzeitig' })),
    ]);
    const final = await service.get(draft.id);
    const issueOk = results[0].status === 'fulfilled';
    const saveOk = results[1].status === 'fulfilled';
    // Order issue → save: saving is rejected. The other way round: both succeed, the content is the saved one.
    expect(issueOk).toBe(true);
    expect(final.status).toBe('issued');
    if (!saveOk) expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(AppException);
    else expect(final.closingText).toBe('Gleichzeitig');
    expect(final.number).toBe('RE-2026-0001');
  });

  it('ein Fehler beim Speichern einer Position hinterlässt Rechnung und Positionen unverändert (alles oder nichts)', async () => {
    const db = await createTestDb();
    const { service } = createService(db);
    const draft = await createFilledDraft(service);
    const bad = makeDraftInput({
      id: draft.id,
      closingText: 'Neu',
      items: [
        { description: 'Position 1', quantityMilli: 1000, unitPriceRappen: 100 },
        { description: 'Position 2', quantityMilli: 1000, unitPriceRappen: 100 },
        { description: 'Position 3', quantityMilli: 0, unitPriceRappen: 100 }, // invalid
      ],
    });
    await expect(service.saveDraft(bad)).rejects.toBeInstanceOf(AppException);
    expect(await service.get(draft.id)).toEqual(draft);
  });

  it('ein Fehler mitten im Ausstellen verbraucht keine Nummer', async () => {
    const db = await createTestDb();
    const { service } = createService(db);
    const repo = new InvoiceRepository(db);
    const draft = await createFilledDraft(service);
    await expect(
      repo.issue(draft.id, 2026, () => {
        throw new Error('Abbruch nach der Nummernvergabe');
      }),
    ).rejects.toThrow('Abbruch');
    expect(await db.query('SELECT COUNT(*) AS n FROM number_counters')).toEqual([{ n: 0 }]);
    expect((await service.get(draft.id)).status).toBe('draft');
    expect((await service.issue(draft.id)).number).toBe('RE-2026-0001');
  });
});
