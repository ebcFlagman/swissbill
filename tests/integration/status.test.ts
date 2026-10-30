import { describe, expect, it } from 'vitest';
import { AppException } from '@shared/ipc/errors';
import type { Invoice } from '@shared/domain/invoice';
import { createFilledDraft, createService, createTestDb } from '../fixtures/db';

function setup() {
  const db = createTestDb();
  const ctx = createService(db);
  return { db, ...ctx };
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof AppException ? e.error.code : 'OTHER';
  }
  return 'NONE';
}

/** Alles ausser Status, Zeitstempeln der Statuswechsel und updatedAt muss gleich bleiben. */
function content(invoice: Invoice) {
  const { status: _s, paidAt: _p, cancelledAt: _c, updatedAt: _u, ...rest } = invoice;
  return rest;
}

describe('Status: bezahlt und zurücksetzen', () => {
  it('markPaid ändert nur Status und paid_at', () => {
    const { service, setClock } = setup();
    const issued = service.issue(createFilledDraft(service).id);
    setClock(() => new Date(2026, 3, 5, 12, 0));
    const paid = service.markPaid(issued.id);

    expect(paid.status).toBe('paid');
    expect(paid.paidAt).not.toBeNull();
    expect(paid.cancelledAt).toBeNull();
    expect(content(paid)).toEqual(content(issued));
  });

  it('reopen setzt bezahlt zurück auf ausgestellt und löscht paid_at', () => {
    const { service } = setup();
    const issued = service.issue(createFilledDraft(service).id);
    service.markPaid(issued.id);
    const reopened = service.reopen(issued.id);

    expect(reopened.status).toBe('issued');
    expect(reopened.paidAt).toBeNull();
    expect(content(reopened)).toEqual(content(issued));
  });

  it('lehnt ungültige Übergänge mit IMMUTABLE ab', () => {
    const { service } = setup();
    const draft = createFilledDraft(service);
    expect(code(() => service.markPaid(draft.id))).toBe('IMMUTABLE'); // Entwurf
    expect(code(() => service.cancel(draft.id))).toBe('IMMUTABLE'); // Entwurf
    const issued = service.issue(draft.id);
    expect(code(() => service.reopen(issued.id))).toBe('IMMUTABLE'); // nicht bezahlt
    service.markPaid(issued.id);
    expect(code(() => service.markPaid(issued.id))).toBe('IMMUTABLE'); // schon bezahlt
  });

  it('meldet NOT_FOUND für unbekannte Rechnungen', () => {
    const { service } = setup();
    expect(code(() => service.markPaid(999))).toBe('NOT_FOUND');
    expect(code(() => service.reopen(999))).toBe('NOT_FOUND');
    expect(code(() => service.cancel(999))).toBe('NOT_FOUND');
  });
});

describe('Status: stornieren', () => {
  it('storniert ausgestellte und bezahlte Rechnungen, Inhalt und Nummer bleiben', () => {
    const { service } = setup();
    const a = service.issue(createFilledDraft(service).id);
    const b = service.issue(createFilledDraft(service).id);
    service.markPaid(b.id);

    const cancelledA = service.cancel(a.id);
    const cancelledB = service.cancel(b.id);

    for (const [cancelled, original] of [[cancelledA, a], [cancelledB, b]] as const) {
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelledAt).not.toBeNull();
      expect(cancelled.number).toBe(original.number);
      expect(content(cancelled)).toEqual(content(original));
    }
    expect(cancelledB.paidAt).not.toBeNull(); // die frühere Zahlung bleibt nachvollziehbar
  });

  it('storniert ist endgültig', () => {
    const { service } = setup();
    const issued = service.issue(createFilledDraft(service).id);
    service.cancel(issued.id);
    expect(code(() => service.markPaid(issued.id))).toBe('IMMUTABLE');
    expect(code(() => service.reopen(issued.id))).toBe('IMMUTABLE');
    expect(code(() => service.cancel(issued.id))).toBe('IMMUTABLE');
    expect(code(() => service.deleteDraft(issued.id))).toBe('IMMUTABLE');
    expect(service.get(issued.id).status).toBe('cancelled');
  });

  it('die Nummer einer stornierten Rechnung wird nie wieder vergeben', () => {
    const { service } = setup();
    const first = service.issue(createFilledDraft(service).id);
    const second = service.issue(createFilledDraft(service).id);
    service.cancel(second.id);
    const third = service.issue(createFilledDraft(service).id);
    expect([first.number, second.number, third.number]).toEqual([
      'RE-2026-0001',
      'RE-2026-0002',
      'RE-2026-0003',
    ]);
    expect(service.list({}).map((r) => r.number)).toContain('RE-2026-0002');
  });

  it('ein gelöschter Entwurf erzeugt keine Lücke, ein stornierter Beleg bleibt in der Liste', () => {
    const { service } = setup();
    const a = service.issue(createFilledDraft(service).id);
    const draft = createFilledDraft(service);
    service.deleteDraft(draft.id);
    const b = service.issue(createFilledDraft(service).id);
    service.cancel(a.id);
    expect([a.number, b.number]).toEqual(['RE-2026-0001', 'RE-2026-0002']);
    expect(service.list({ status: ['cancelled'] }).map((r) => r.number)).toEqual(['RE-2026-0001']);
  });

  it('die Datenbank lehnt Statuswechsel an Inhalt oder ungültige Wechsel weiterhin ab', () => {
    const { db, service } = setup();
    const issued = service.issue(createFilledDraft(service).id);
    service.cancel(issued.id);
    expect(() => db.prepare("UPDATE invoices SET status = 'issued' WHERE id = ?").run(issued.id)).toThrow(/IMMUTABLE/);
    expect(() => db.prepare("UPDATE invoices SET debtor_name = 'X' WHERE id = ?").run(issued.id)).toThrow(/IMMUTABLE/);
  });
});
