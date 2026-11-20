import { describe, expect, it } from 'vitest';
import type { DraftInput } from '@shared/domain/invoice';
import { AppException } from '@shared/ipc/errors';
import { InvoiceRepository } from '../../src/main/db/invoice-repository';
import { createFilledDraft, createService, createTestDb } from '../fixtures/db';
import { makeDraftInput } from '../fixtures/invoice';

async function setup() {
  const db = await createTestDb();
  const { service } = createService(db);
  const draft = await createFilledDraft(service);
  return { db, service, draft, repo: new InvoiceRepository(db) };
}

async function issuedInvoice() {
  const ctx = await setup();
  const issued = await ctx.service.issue(ctx.draft.id);
  return { ...ctx, issued };
}

async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    return e instanceof AppException ? e.error.code : 'OTHER';
  }
  return 'NONE';
}

const NOW = '2026-04-01T00:00:00.000Z';

describe('Persistenzschicht: ausgestellte Rechnungen sind unveränderlich', () => {
  it('lehnt jede Änderung des Inhalts ab (Kopf, Absender, Empfänger, Schlusstext, Beträge)', async () => {
    const { repo, issued } = await issuedInvoice();
    const base = makeDraftInput({ id: issued.id });
    const attempts: Partial<DraftInput>[] = [
      { debtor: { ...base.debtor, name: 'Hacker' } },
      { sender: { ...base.sender, iban: 'CH9300762011623852957' } },
      { closingText: 'neu' },
      { dueDate: '2099-01-01' },
      { invoiceDate: '2026-03-02' },
      { items: [{ description: 'x', quantityMilli: 1000, unitPriceRappen: 1 }] },
      { customerId: null },
    ];
    for (const attempt of attempts) {
      expect(await codeOf(() => repo.saveDraft({ ...base, ...attempt }, NOW)), JSON.stringify(attempt)).toBe('IMMUTABLE');
    }
  });

  it('lehnt das Löschen ab', async () => {
    const { repo, issued } = await issuedInvoice();
    expect(await codeOf(() => repo.deleteDraft(issued.id))).toBe('IMMUTABLE');
  });

  it('lässt Nummer, Referenz, Total und Positionen nach allen Versuchen unverändert', async () => {
    const { repo, service, issued } = await issuedInvoice();
    await codeOf(() => repo.saveDraft(makeDraftInput({ id: issued.id, closingText: 'neu' }), NOW));
    await codeOf(() => repo.deleteDraft(issued.id));
    await codeOf(() => repo.issue(issued.id, 2026, () => ({ ...issued, number: 'X', numberYear: 2026, numberSeq: 9, referenceType: 'QRR', reference: 'y', totalRappen: 1, layoutVersion: 1, issuedAt: NOW })));
    expect(await service.get(issued.id)).toEqual(issued);
  });

  it('erlaubt die Statuswechsel, aber keine ungültigen Übergänge', async () => {
    const { repo, service, issued } = await issuedInvoice();
    await repo.markPaid(issued.id, NOW); // issued -> paid
    expect(await codeOf(() => repo.markPaid(issued.id, NOW))).toBe('IMMUTABLE'); // already paid
    await repo.cancel(issued.id, NOW); // paid -> cancelled
    expect(await codeOf(() => repo.reopen(issued.id, NOW))).toBe('IMMUTABLE'); // cancelled -> issued
    expect(await codeOf(() => repo.markPaid(issued.id, NOW))).toBe('IMMUTABLE'); // cancelled -> paid
    expect(await codeOf(() => repo.cancel(issued.id, NOW))).toBe('IMMUTABLE'); // cancelled -> cancelled
    expect((await service.get(issued.id)).status).toBe('cancelled');
  });

  it('kein Statuswechsel aus dem Entwurf ausser dem Ausstellen', async () => {
    const { repo, draft } = await setup();
    expect(await codeOf(() => repo.markPaid(draft.id, NOW))).toBe('IMMUTABLE');
    expect(await codeOf(() => repo.cancel(draft.id, NOW))).toBe('IMMUTABLE');
    expect(await codeOf(() => repo.reopen(draft.id, NOW))).toBe('IMMUTABLE');
  });

  it('ein Statuswechsel ändert nur Status, paid_at/cancelled_at und updated_at', async () => {
    const { repo, service, issued } = await issuedInvoice();
    await repo.markPaid(issued.id, NOW);
    const paid = await service.get(issued.id);
    const { status: _s, paidAt: _p, updatedAt: _u, ...rest } = paid;
    const { status: _s2, paidAt: _p2, updatedAt: _u2, ...before } = issued;
    expect(rest).toEqual(before);
    expect(paid.paidAt).toBe(NOW);
  });

  it('beim Löschen eines Kunden wird nur customer_id der Rechnung NULL', async () => {
    const { db, service, draft } = await setup();
    await db.query("INSERT INTO customers (name, zip, city, created_at, updated_at) VALUES ('Kunde AG', '8000', 'Zürich', 'x', 'x')");
    const customerId = ((await db.query('SELECT id FROM customers')) as { id: number }[])[0]!.id;
    await service.saveDraft(makeDraftInput({ id: draft.id, customerId }));
    const issued = await service.issue(draft.id);
    await db.query('DELETE FROM customers WHERE id = ?', [customerId]);
    expect(await service.get(draft.id)).toEqual({ ...issued, customerId: null });
  });

  it('lässt Entwürfe frei änderbar und löschbar (Positionen werden mitgelöscht)', async () => {
    const { db, service, draft } = await setup();
    const changed = await service.saveDraft(
      makeDraftInput({ id: draft.id, closingText: 'Geändert', items: [{ description: 'Neu', quantityMilli: 1000, unitPriceRappen: 500 }] }),
    );
    expect(changed.closingText).toBe('Geändert');
    expect(changed.totalRappen).toBe(500);
    expect(changed.items).toHaveLength(1);
    await service.deleteDraft(draft.id);
    expect(await db.query('SELECT COUNT(*) AS n FROM invoice_items')).toEqual([{ n: 0 }]);
  });

  it('der Übergang draft -> issued bleibt erlaubt', async () => {
    const { service, draft } = await setup();
    expect((await service.issue(draft.id)).status).toBe('issued');
  });

  it('der Service liefert IMMUTABLE und lässt die Rechnung unverändert', async () => {
    const { service, issued } = await issuedInvoice();
    expect(await codeOf(() => service.saveDraft(makeDraftInput({ id: issued.id })))).toBe('IMMUTABLE');
    expect(await service.get(issued.id)).toEqual(issued);
  });
});
