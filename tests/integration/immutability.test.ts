import { describe, expect, it } from 'vitest';
import { AppException } from '@shared/ipc/errors';
import { createFilledDraft, createService, createTestDb } from '../fixtures/db';
import { makeDraftInput } from '../fixtures/invoice';

function setup() {
  const db = createTestDb();
  const { service } = createService(db);
  const draft = createFilledDraft(service);
  return { db, service, draft };
}

function issuedInvoice() {
  const ctx = setup();
  const issued = ctx.service.issue(ctx.draft.id);
  return { ...ctx, issued };
}

describe('Datenbank-Trigger: ausgestellte Rechnungen sind unveränderlich', () => {
  it('lehnt Änderungen an Inhaltsspalten ab', () => {
    const { db, issued } = issuedInvoice();
    const attempts = [
      "UPDATE invoices SET debtor_name = 'Hacker' WHERE id = ?",
      "UPDATE invoices SET sender_iban = 'CH0000000000000000000' WHERE id = ?",
      'UPDATE invoices SET total_rappen = 1 WHERE id = ?',
      "UPDATE invoices SET number = 'RE-2026-9999' WHERE id = ?",
      "UPDATE invoices SET reference = 'x' WHERE id = ?",
      "UPDATE invoices SET closing_text = 'neu' WHERE id = ?",
      "UPDATE invoices SET due_date = '2099-01-01' WHERE id = ?",
    ];
    for (const sql of attempts) {
      expect(() => db.prepare(sql).run(issued.id), sql).toThrow(/IMMUTABLE/);
    }
  });

  it('lehnt das Löschen ab', () => {
    const { db, issued } = issuedInvoice();
    expect(() => db.prepare('DELETE FROM invoices WHERE id = ?').run(issued.id)).toThrow(/IMMUTABLE/);
  });

  it('lehnt Einfügen, Ändern und Löschen von Positionen ab', () => {
    const { db, issued } = issuedInvoice();
    expect(() =>
      db
        .prepare(
          `INSERT INTO invoice_items (invoice_id, position, description, quantity_milli, unit_price_rappen, amount_rappen)
           VALUES (?, 99, 'neu', 1000, 100, 100)`,
        )
        .run(issued.id),
    ).toThrow(/IMMUTABLE/);
    expect(() =>
      db.prepare("UPDATE invoice_items SET description = 'x' WHERE invoice_id = ?").run(issued.id),
    ).toThrow(/IMMUTABLE/);
    expect(() => db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(issued.id)).toThrow(
      /IMMUTABLE/,
    );
  });

  it('erlaubt Statuswechsel, aber keine ungültigen Übergänge', () => {
    const { db, issued } = issuedInvoice();
    expect(() => db.prepare("UPDATE invoices SET status = 'paid', paid_at = '2026-04-01T00:00:00Z' WHERE id = ?").run(issued.id)).not.toThrow();
    expect(() => db.prepare("UPDATE invoices SET status = 'draft' WHERE id = ?").run(issued.id)).toThrow(/IMMUTABLE/);
    expect(() => db.prepare("UPDATE invoices SET status = 'cancelled', cancelled_at = '2026-04-02T00:00:00Z' WHERE id = ?").run(issued.id)).not.toThrow();
    expect(() => db.prepare("UPDATE invoices SET status = 'issued' WHERE id = ?").run(issued.id)).toThrow(/IMMUTABLE/);
  });

  it('erlaubt das Setzen von customer_id auf NULL beim Löschen eines Kunden', () => {
    const { db, draft, service } = setup();
    db.prepare("INSERT INTO customers (name, zip, city) VALUES ('Kunde AG', '8000', 'Zürich')").run();
    const customerId = (db.prepare('SELECT id FROM customers').get() as { id: number }).id;
    service.saveDraft(makeDraftInput({ id: draft.id, customerId }));
    service.issue(draft.id);
    expect(() => db.prepare('DELETE FROM customers WHERE id = ?').run(customerId)).not.toThrow();
    expect(service.get(draft.id).customerId).toBeNull();
  });

  it('lässt Entwürfe frei änderbar und löschbar', () => {
    const { db, draft } = setup();
    expect(() => db.prepare("UPDATE invoices SET debtor_name = 'Neu' WHERE id = ?").run(draft.id)).not.toThrow();
    expect(() => db.prepare('DELETE FROM invoices WHERE id = ?').run(draft.id)).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM invoice_items').get()).toEqual({ n: 0 });
  });

  it('der Übergang draft -> issued bleibt erlaubt', () => {
    const { service, draft } = setup();
    expect(service.issue(draft.id).status).toBe('issued');
  });
});

describe('Service: ausgestellte Rechnungen sind unveränderlich', () => {
  it('saveDraft liefert IMMUTABLE für Rechnungen ausser Entwürfen', () => {
    const { service, issued } = issuedInvoice();
    try {
      service.saveDraft(makeDraftInput({ id: issued.id }));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppException);
      expect((e as AppException).error.code).toBe('IMMUTABLE');
    }
    expect(service.get(issued.id)).toEqual(issued);
  });

  it('Entwürfe bleiben mit dem Service änderbar', () => {
    const { service, draft } = setup();
    const changed = service.saveDraft(
      makeDraftInput({ id: draft.id, closingText: 'Geändert', items: [{ description: 'Neu', quantityMilli: 1000, unitPriceRappen: 500 }] }),
    );
    expect(changed.closingText).toBe('Geändert');
    expect(changed.totalRappen).toBe(500);
    expect(changed.items).toHaveLength(1);
  });
});
