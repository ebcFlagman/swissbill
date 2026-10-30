import { describe, expect, it } from 'vitest';
import { CURRENCY, MAX_TOTAL_RAPPEN, recalculate, validateForIssue } from '@shared/domain/invoice';
import { makeInvoice, makeItem, NORMAL_IBAN } from '../fixtures/invoice';

function fields(overrides: Parameters<typeof makeInvoice>[0]): string[] {
  return validateForIssue(makeInvoice(overrides)).map((e) => e.field);
}

describe('validateForIssue', () => {
  it('akzeptiert eine vollständige, gültige Rechnung (QR-IBAN und normale IBAN)', () => {
    expect(validateForIssue(makeInvoice())).toEqual([]);
    const invoice = makeInvoice();
    expect(validateForIssue({ ...invoice, sender: { ...invoice.sender, iban: NORMAL_IBAN } })).toEqual([]);
  });

  it('die Währung ist fest CHF', () => {
    expect(CURRENCY).toBe('CHF');
  });

  it('verlangt beim Absender Name, PLZ, Ort und IBAN', () => {
    const base = makeInvoice();
    const sender = { ...base.sender, name: '', zip: '', city: '', iban: '' };
    expect(fields({ sender }).sort()).toEqual(['sender.city', 'sender.iban', 'sender.name', 'sender.zip']);
  });

  it('verlangt beim Rechnungsempfänger nur den Namen', () => {
    const base = makeInvoice();
    expect(fields({ debtor: { ...base.debtor, name: '' } })).toEqual(['debtor.name']);
    const nameOnly = { name: 'Pia Muster', street: '', houseNo: '', zip: '', city: '', country: '' };
    expect(fields({ debtor: nameOnly })).toEqual([]);
  });

  it('prüft vorhandene optionale Empfängerfelder weiterhin', () => {
    const base = makeInvoice();
    expect(fields({ debtor: { ...base.debtor, country: 'CHE' } })).toEqual(['debtor.country']);
    expect(fields({ debtor: { ...base.debtor, zip: '1'.repeat(17) } })).toEqual(['debtor.zip']);
  });

  it('prüft die IBAN des Absenders inklusive Prüfsumme', () => {
    const base = makeInvoice();
    const errors = validateForIssue({ ...base, sender: { ...base.sender, iban: 'CH9300762011623852958' } });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe('sender.iban');
    expect(errors[0]?.message).toMatch(/Prüfsumme/);
  });

  it('verlangt mindestens eine Position', () => {
    const errors = validateForIssue(makeInvoice({ items: [], totalRappen: 0 }));
    expect(errors.map((e) => e.field)).toContain('items');
  });

  it('prüft Positionen: Beschreibung, Menge > 0, Einzelpreis >= 0, Beschreibung max. 500', () => {
    const items = [
      makeItem('', 1000, 100),
      { ...makeItem('A', 1000, 100), quantityMilli: 0, amountRappen: 0 },
      { ...makeItem('B', 1000, 100), unitPriceRappen: -1 },
      makeItem('x'.repeat(501), 1000, 100),
      makeItem('x'.repeat(500), 1000, 100),
    ];
    const errors = validateForIssue(makeInvoice({ items }));
    expect(errors.map((e) => e.field)).toEqual([
      'items.0.description',
      'items.1.quantity',
      'items.2.unitPrice',
      'items.3.description',
    ]);
  });

  it('verlangt ein Total grösser als 0', () => {
    const items = [makeItem('Gratis', 1000, 0)];
    const errors = validateForIssue(makeInvoice({ items, totalRappen: 0 }));
    expect(errors.map((e) => e.field)).toEqual(['total']);
    expect(errors[0]?.message).toMatch(/grösser als 0/);
  });

  it('begrenzt das Total auf 999\'999\'999.99', () => {
    expect(MAX_TOTAL_RAPPEN).toBe(99_999_999_999);
    const ok = [makeItem('Max', 1000, MAX_TOTAL_RAPPEN)];
    expect(validateForIssue(makeInvoice({ items: ok }))).toEqual([]);
    const tooMuch = [makeItem('Zuviel', 1000, MAX_TOTAL_RAPPEN + 1)];
    expect(fields({ items: tooMuch })).toEqual(['total']);
  });

  it('verlangt gültige Daten und Fälligkeit nicht vor dem Rechnungsdatum', () => {
    expect(fields({ invoiceDate: '2026-02-30' })).toContain('invoiceDate');
    expect(fields({ invoiceDate: '01.03.2026' })).toContain('invoiceDate');
    expect(fields({ dueDate: '2026-02-28' })).toEqual(['dueDate']);
    expect(fields({ invoiceDate: '2026-03-01', dueDate: '2026-03-01' })).toEqual([]);
  });

  it('prüft Adressfelder (Länge und Zeichensatz) mit Feldnamen', () => {
    const base = makeInvoice();
    const errors = validateForIssue({ ...base, debtor: { ...base.debtor, name: 'a'.repeat(71) } });
    expect(errors.map((e) => e.field)).toEqual(['debtor.name']);
  });

  it('meldet alle Fehler auf Deutsch und mit nicht leerem Text', () => {
    const errors = validateForIssue(makeInvoice({ items: [], totalRappen: 0, dueDate: '2000-01-01' }));
    expect(errors.length).toBeGreaterThan(1);
    expect(errors.every((e) => e.message.trim().length > 0)).toBe(true);
  });
});

describe('recalculate', () => {
  it('berechnet Positionsbeträge und Total neu aus Menge und Einzelpreis', () => {
    const { items, totalRappen } = recalculate([
      { description: 'A', quantityMilli: 1500, unitPriceRappen: 3 },
      { description: 'B', quantityMilli: 2000, unitPriceRappen: 15000 },
    ]);
    expect(items.map((i) => i.amountRappen)).toEqual([5, 30000]);
    expect(totalRappen).toBe(30005);
  });
});
