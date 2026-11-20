import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Invoice } from '@shared/domain/invoice';
import { AppException } from '@shared/ipc/errors';
import { InvoiceRepository } from '../../../src/main/db/invoice-repository';
import { createFilledDraft, createService } from '../../fixtures/db';
import { makeDraftInput } from '../../fixtures/invoice';
import { describeMatrix, type TestDb } from '../helpers/db-targets';

const count = async (db: Awaited<ReturnType<TestDb['open']>>, table: string) =>
  Number(
    ((await db.query(`SELECT COUNT(*) AS n FROM ${table}`)) as { n: string | number }[])[0]?.n,
  );

describeMatrix('Nummernvergabe und Gleichzeitigkeit', (_name, create) => {
  let target: TestDb;
  beforeEach(async () => {
    target = await create();
  });
  afterEach(async () => {
    await target.close();
  });

  it('100 aufeinanderfolgende Ausstellvorgänge: lückenlos und ohne Duplikate', async () => {
    const db = await target.open();
    const { service } = createService(db);
    const numbers: (string | null)[] = [];
    for (let i = 0; i < 100; i++)
      numbers.push((await service.issue((await createFilledDraft(service)).id)).number);
    expect(numbers).toEqual(
      Array.from({ length: 100 }, (_, i) => `RE-2026-${String(i + 1).padStart(4, '0')}`),
    );
  });

  it('100 gleichzeitige Ausstellvorgänge (zwei Jahre gemischt): pro Jahr lückenlos und ohne Duplikate', async () => {
    const db = await target.open();
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

  it.skipIf(_name === 'sqlite')(
    '100 Ausstellvorgänge von drei Geräten (eigene Verbindungen) zugleich: keine Lücken, keine Duplikate (SC-003)',
    async () => {
      const devices = [await target.open(), await target.open(), await target.open()];
      const services = devices.map((d) => createService(d).service);
      const drafts = [];
      for (let i = 0; i < 100; i++) {
        drafts.push(await createFilledDraft(services[i % 3]!));
      }
      const issued = await Promise.all(drafts.map((d, i) => services[i % 3]!.issue(d.id)));
      expect(issued.map((i) => i.numberSeq).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
        Array.from({ length: 100 }, (_, i) => i + 1),
      );
      expect(new Set(issued.map((i) => i.number)).size).toBe(100);
      expect(await devices[0]!.query('SELECT year, last_seq FROM number_counters')).toEqual([
        { year: 2026, last_seq: 100 },
      ]);
    },
  );

  it.skipIf(_name === 'sqlite')(
    'der erste Vorgang des Jahres von mehreren Geräten zugleich: genau eine Zählerzeile, keine Fehlermeldung',
    async () => {
      const devices = [await target.open(), await target.open(), await target.open()];
      const services = devices.map((d) => createService(d).service);
      const drafts = await Promise.all(services.map((s) => createFilledDraft(s)));
      const issued = await Promise.all(drafts.map((d, i) => services[i]!.issue(d.id)));
      expect(issued.map((i) => i.numberSeq).sort()).toEqual([1, 2, 3]);
      expect(await count(devices[0]!, 'number_counters')).toBe(1);
    },
  );

  it('Ausstellen und Speichern derselben Rechnung gleichzeitig: genau ein Vorgang gewinnt, die Daten bleiben konsistent', async () => {
    const db = await target.open();
    const { service } = createService(db);
    const draft = await createFilledDraft(service);
    const results = await Promise.allSettled([
      service.issue(draft.id),
      service.saveDraft(makeDraftInput({ id: draft.id, closingText: 'Gleichzeitig' })),
    ]);
    const final = await service.get(draft.id);
    const issueOk = results[0].status === 'fulfilled';
    const saveOk = results[1].status === 'fulfilled';
    expect(issueOk).toBe(true);
    expect(final.status).toBe('issued');
    if (!saveOk) expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(AppException);
    else expect(final.closingText).toBe('Gleichzeitig');
    expect(final.number).toBe('RE-2026-0001');
  });

  it('ein Fehler beim Speichern einer Position hinterlässt Rechnung und Positionen unverändert (alles oder nichts)', async () => {
    const db = await target.open();
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

  it('ein Fehler mitten im Ausstellen verbraucht keine Nummer und hinterlässt keine Zählerzeile', async () => {
    const db = await target.open();
    const { service } = createService(db);
    const repo = new InvoiceRepository(db);
    const draft = await createFilledDraft(service);
    await expect(
      repo.issue(draft.id, 2026, () => {
        throw new Error('Abbruch nach der Nummernvergabe');
      }),
    ).rejects.toThrow('Abbruch');
    expect(await count(db, 'number_counters')).toBe(0);
    expect((await service.get(draft.id)).status).toBe('draft');
    expect((await service.issue(draft.id)).number).toBe('RE-2026-0001');
  });
});
