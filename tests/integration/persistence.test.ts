import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppException } from '@shared/ipc/errors';
import { openDatabase } from '../../src/main/db/connection';
import { loadMigrations, migrate } from '../../src/main/db/migrate';
import { InvoiceService } from '../../src/main/services/invoice-service';
import { renderInvoicePdf } from '../../src/main/services/pdf-service';
import { createFilledDraft, createService, createTestDb } from '../fixtures/db';
import { inspectPdf } from '../fixtures/pdf-inspect';
import { makeDraftInput } from '../fixtures/invoice';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-persist-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof AppException ? e.error.code : 'OTHER';
  }
  return undefined;
}

describe('Persistenz', () => {
  it('eine ausgestellte Rechnung ist nach dem Neuöffnen der Datenbank unverändert', () => {
    const file = join(dir, 'swissbill.db');
    const first = openDatabase(file);
    migrate(first, loadMigrations());
    const service = new InvoiceService(first, { now: () => new Date(2026, 2, 1, 10, 0) });
    const issued = service.issue(createFilledDraft(service).id);
    first.close();

    const second = openDatabase(file);
    migrate(second, loadMigrations());
    const reopened = new InvoiceService(second).get(issued.id);
    expect(reopened).toEqual(issued);
    second.close();
  });

  it('das erneut erzeugte PDF aus der gespeicherten Momentaufnahme hat denselben Inhalt', async () => {
    const file = join(dir, 'swissbill.db');
    const first = openDatabase(file);
    migrate(first, loadMigrations());
    const service = new InvoiceService(first, { now: () => new Date(2026, 2, 1, 10, 0) });
    const issued = service.issue(createFilledDraft(service).id);
    const before = await inspectPdf(await renderInvoicePdf(issued));
    const textBefore = before.texts;
    await before.destroy();
    first.close();

    const second = openDatabase(file);
    // Absender und Einstellungen ändern sich später: die ausgestellte Rechnung bleibt wie sie war
    second.prepare("UPDATE settings SET sender_name = 'Neuer Name AG', invoice_prefix = 'XX' WHERE id = 1").run();
    const reopened = new InvoiceService(second).get(issued.id);
    const after = await inspectPdf(await renderInvoicePdf(reopened));
    expect(after.texts).toEqual(textBefore);
    await after.destroy();
    second.close();
  });
});

describe('Liste', () => {
  function seed() {
    const db = createTestDb();
    const { service } = createService(db);
    const a = service.issue(createFilledDraft(service, { debtor: { ...makeDraftInput().debtor, name: 'Müller AG' }, invoiceDate: '2026-01-10', dueDate: '2026-02-10' }).id);
    const b = service.issue(createFilledDraft(service, { debtor: { ...makeDraftInput().debtor, name: 'Meier & Söhne' }, invoiceDate: '2026-02-10', dueDate: '2026-03-10' }).id);
    const c = createFilledDraft(service, { debtor: { ...makeDraftInput().debtor, name: 'Müller Treuhand' }, invoiceDate: '2026-03-10', dueDate: '2026-04-10' });
    return { db, service, a, b, c };
  }

  it('liefert Nummer, Kunde, Datum, Total und Status, neueste zuerst', () => {
    const { service, a, b, c } = seed();
    const rows = service.list({});
    expect(rows.map((r) => r.id)).toEqual([c.id, b.id, a.id]);
    expect(rows[0]).toMatchObject({ number: null, status: 'draft', debtorName: 'Müller Treuhand', invoiceDate: '2026-03-10' });
    expect(rows[2]).toMatchObject({ number: 'RE-2026-0001', status: 'issued', debtorName: 'Müller AG', totalRappen: 34975 });
  });

  it('sucht in Nummer und Kundenname (ohne Beachtung der Gross-/Kleinschreibung)', () => {
    const { service, a, c } = seed();
    expect(service.list({ search: 'müller' }).map((r) => r.id).sort()).toEqual([a.id, c.id].sort());
    expect(service.list({ search: 're-2026-0002' })).toHaveLength(1);
    expect(service.list({ search: 'gibt-es-nicht' })).toEqual([]);
  });

  it('behandelt Sonderzeichen der Suche (%, _) wörtlich', () => {
    const { service } = seed();
    expect(service.list({ search: '%' })).toEqual([]);
    expect(service.list({ search: '_' })).toEqual([]);
  });

  it('filtert nach Status', () => {
    const { service, c } = seed();
    expect(service.list({ status: ['draft'] }).map((r) => r.id)).toEqual([c.id]);
    expect(service.list({ status: ['issued'] })).toHaveLength(2);
    expect(service.list({ status: ['paid', 'cancelled'] })).toEqual([]);
    expect(service.list({ search: 'Müller', status: ['issued'] })).toHaveLength(1);
  });
});

describe('Entwürfe löschen', () => {
  it('löscht einen Entwurf samt Positionen und erzeugt keine Lücke in der Nummernfolge', () => {
    const db = createTestDb();
    const { service } = createService(db);
    const first = service.issue(createFilledDraft(service).id);
    const draft = createFilledDraft(service);
    service.deleteDraft(draft.id);
    expect(db.prepare('SELECT COUNT(*) AS n FROM invoice_items WHERE invoice_id = ?').get(draft.id)).toEqual({ n: 0 });
    expect(codeOf(() => service.get(draft.id))).toBe('NOT_FOUND');
    const second = service.issue(createFilledDraft(service).id);
    expect([first.number, second.number]).toEqual(['RE-2026-0001', 'RE-2026-0002']);
  });

  it('lehnt das Löschen ausgestellter Rechnungen mit IMMUTABLE ab', () => {
    const { service } = createService(createTestDb());
    const issued = service.issue(createFilledDraft(service).id);
    expect(codeOf(() => service.deleteDraft(issued.id))).toBe('IMMUTABLE');
    expect(service.get(issued.id)).toEqual(issued);
  });

  it('meldet NOT_FOUND für unbekannte Rechnungen', () => {
    const { service } = createService(createTestDb());
    expect(codeOf(() => service.deleteDraft(999))).toBe('NOT_FOUND');
  });
});

describe('Duplizieren', () => {
  it('erzeugt aus einer ausgestellten Rechnung einen neuen Entwurf ohne Nummer und Referenz', () => {
    const db = createTestDb();
    db.prepare('UPDATE settings SET default_payment_days = 14 WHERE id = 1').run();
    const { service, setClock } = createService(db);
    const issued = service.issue(createFilledDraft(service).id);

    setClock(() => new Date(2026, 5, 15, 9, 0));
    const copy = service.duplicate(issued.id);

    expect(copy.id).not.toBe(issued.id);
    expect(copy.status).toBe('draft');
    expect(copy.number).toBeNull();
    expect(copy.reference).toBeNull();
    expect(copy.referenceType).toBeNull();
    expect(copy.issuedAt).toBeNull();
    expect(copy.invoiceDate).toBe('2026-06-15');
    expect(copy.dueDate).toBe('2026-06-29');
    expect(copy.sender).toEqual(issued.sender);
    expect(copy.debtor).toEqual(issued.debtor);
    expect(copy.closingText).toBe(issued.closingText);
    expect(copy.items).toEqual(issued.items);
    expect(copy.totalRappen).toBe(issued.totalRappen);
    // Das Original bleibt unverändert
    expect(service.get(issued.id)).toEqual(issued);
  });

  it('der Entwurf-Duplikat lässt sich bearbeiten und ausstellen (nächste Nummer)', () => {
    const { service } = createService(createTestDb());
    const issued = service.issue(createFilledDraft(service).id);
    const copy = service.duplicate(issued.id);
    const saved = service.saveDraft(makeDraftInput({ id: copy.id, closingText: 'Neu' }));
    expect(saved.closingText).toBe('Neu');
    expect(service.issue(copy.id).number).toBe('RE-2026-0002');
  });

  it('meldet NOT_FOUND für unbekannte Rechnungen', () => {
    const { service } = createService(createTestDb());
    expect(codeOf(() => service.duplicate(999))).toBe('NOT_FOUND');
  });
});
