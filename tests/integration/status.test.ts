import { describe, expect, it } from 'vitest';
import { AppException } from '@shared/ipc/errors';
import type { Invoice } from '@shared/domain/invoice';
import { createFilledDraft, createService, createTestDb } from '../fixtures/db';

async function setup() {
  const db = await createTestDb();
  const ctx = createService(db);
  return { db, ...ctx };
}

async function code(fn: () => unknown): Promise<string> {
  try {
    await fn();
  } catch (e) {
    return e instanceof AppException ? e.error.code : 'OTHER';
  }
  return 'NONE';
}

/** Everything except status, timestamps of the status changes and updatedAt must stay the same. */
function content(invoice: Invoice) {
  const { status: _s, paidAt: _p, cancelledAt: _c, updatedAt: _u, ...rest } = invoice;
  return rest;
}

describe('Status: bezahlt und zurücksetzen', () => {
  it('markPaid ändert nur Status und paid_at', async () => {
    const { service, setClock } = await setup();
    const issued = await service.issue((await createFilledDraft(service)).id);
    setClock(() => new Date(2026, 3, 5, 12, 0));
    const paid = await service.markPaid(issued.id);

    expect(paid.status).toBe('paid');
    expect(paid.paidAt).not.toBeNull();
    expect(paid.cancelledAt).toBeNull();
    expect(content(paid)).toEqual(content(issued));
  });

  it('reopen setzt bezahlt zurück auf ausgestellt und löscht paid_at', async () => {
    const { service } = await setup();
    const issued = await service.issue((await createFilledDraft(service)).id);
    await service.markPaid(issued.id);
    const reopened = await service.reopen(issued.id);

    expect(reopened.status).toBe('issued');
    expect(reopened.paidAt).toBeNull();
    expect(content(reopened)).toEqual(content(issued));
  });

  it('lehnt ungültige Übergänge mit IMMUTABLE ab', async () => {
    const { service } = await setup();
    const draft = await createFilledDraft(service);
    expect(await code(() => service.markPaid(draft.id))).toBe('IMMUTABLE'); // draft
    expect(await code(() => service.cancel(draft.id))).toBe('IMMUTABLE'); // draft
    const issued = await service.issue(draft.id);
    expect(await code(() => service.reopen(issued.id))).toBe('IMMUTABLE'); // not paid
    await service.markPaid(issued.id);
    expect(await code(() => service.markPaid(issued.id))).toBe('IMMUTABLE'); // already paid
  });

  it('meldet NOT_FOUND für unbekannte Rechnungen', async () => {
    const { service } = await setup();
    expect(await code(() => service.markPaid(999))).toBe('NOT_FOUND');
    expect(await code(() => service.reopen(999))).toBe('NOT_FOUND');
    expect(await code(() => service.cancel(999))).toBe('NOT_FOUND');
  });
});

describe('Status: stornieren', () => {
  it('storniert ausgestellte und bezahlte Rechnungen, Inhalt und Nummer bleiben', async () => {
    const { service } = await setup();
    const a = await service.issue((await createFilledDraft(service)).id);
    const b = await service.issue((await createFilledDraft(service)).id);
    await service.markPaid(b.id);

    const cancelledA = await service.cancel(a.id);
    const cancelledB = await service.cancel(b.id);

    for (const [cancelled, original] of [[cancelledA, a], [cancelledB, b]] as const) {
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelledAt).not.toBeNull();
      expect(cancelled.number).toBe(original.number);
      expect(content(cancelled)).toEqual(content(original));
    }
    expect(cancelledB.paidAt).not.toBeNull(); // the earlier payment stays traceable
  });

  it('storniert ist endgültig', async () => {
    const { service } = await setup();
    const issued = await service.issue((await createFilledDraft(service)).id);
    await service.cancel(issued.id);
    expect(await code(() => service.markPaid(issued.id))).toBe('IMMUTABLE');
    expect(await code(() => service.reopen(issued.id))).toBe('IMMUTABLE');
    expect(await code(() => service.cancel(issued.id))).toBe('IMMUTABLE');
    expect(await code(() => service.deleteDraft(issued.id))).toBe('IMMUTABLE');
    expect((await service.get(issued.id)).status).toBe('cancelled');
  });

  it('die Nummer einer stornierten Rechnung wird nie wieder vergeben', async () => {
    const { service } = await setup();
    const first = await service.issue((await createFilledDraft(service)).id);
    const second = await service.issue((await createFilledDraft(service)).id);
    await service.cancel(second.id);
    const third = await service.issue((await createFilledDraft(service)).id);
    expect([first.number, second.number, third.number]).toEqual([
      'RE-2026-0001',
      'RE-2026-0002',
      'RE-2026-0003',
    ]);
    expect((await service.list({})).map((r) => r.number)).toContain('RE-2026-0002');
  });

  it('ein gelöschter Entwurf erzeugt keine Lücke, ein stornierter Beleg bleibt in der Liste', async () => {
    const { service } = await setup();
    const a = await service.issue((await createFilledDraft(service)).id);
    const draft = await createFilledDraft(service);
    await service.deleteDraft(draft.id);
    const b = await service.issue((await createFilledDraft(service)).id);
    await service.cancel(a.id);
    expect([a.number, b.number]).toEqual(['RE-2026-0001', 'RE-2026-0002']);
    expect((await service.list({ status: ['cancelled'] })).map((r) => r.number)).toEqual(['RE-2026-0001']);
  });

  it('die Persistenzschicht lehnt ungültige Statuswechsel weiterhin ab', async () => {
    const { service } = await setup();
    const issued = await service.issue((await createFilledDraft(service)).id);
    await service.cancel(issued.id);
    expect(await code(() => service.reopen(issued.id))).toBe('IMMUTABLE');
    expect(await code(() => service.markPaid(issued.id))).toBe('IMMUTABLE');
    expect((await service.get(issued.id)).status).toBe('cancelled');
  });
});
