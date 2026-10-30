import { describe, expect, it } from 'vitest';
import {
  collectErrors,
  emptyItem,
  formTotal,
  itemAmount,
  toDraftInput,
  toForm,
  type InvoiceForm,
} from '../../src/renderer/lib/invoice-form';
import { makeInvoice } from '../fixtures/invoice';

function validForm(): InvoiceForm {
  return toForm(makeInvoice());
}

describe('toForm / toDraftInput', () => {
  it('wandelt eine Rechnung in Textfelder und zurück', () => {
    const invoice = makeInvoice();
    const form = toForm(invoice);
    expect(form.items.map((i) => [i.description, i.quantity, i.unitPrice])).toEqual([
      ['Beratung', '2', '150.00'],
      ['Spesen', '1', '49.75'],
    ]);
    const input = toDraftInput(invoice.id, form);
    expect(input.items).toEqual([
      { description: 'Beratung', quantityMilli: 2000, unitPriceRappen: 15000 },
      { description: 'Spesen', quantityMilli: 1000, unitPriceRappen: 4975 },
    ]);
    expect(input.closingText).toBe('Zahlbar innert 30 Tagen.');
  });

  it('beginnt bei einer leeren Rechnung mit einer leeren Position (Menge 1)', () => {
    const form = toForm(makeInvoice({ items: [] }));
    expect(form.items).toHaveLength(1);
    expect(form.items[0]).toMatchObject({ description: '', quantity: '1', unitPrice: '' });
  });

  it('speichert einen leeren Schlusstext als null', () => {
    const form = { ...validForm(), closingText: '   ' };
    expect(toDraftInput(1, form).closingText).toBeNull();
  });
});

describe('collectErrors', () => {
  it('meldet für eine gültige Rechnung keine Fehler', () => {
    expect(collectErrors(validForm())).toEqual([]);
  });

  it('meldet ungültige Zahlen feldgenau und nur einmal pro Feld', () => {
    const form = validForm();
    form.items[0] = { ...form.items[0]!, quantity: 'abc', unitPrice: '1.234' };
    const errors = collectErrors(form);
    expect(errors.map((e) => e.field)).toEqual(['items.0.quantity', 'items.0.unitPrice']);
    expect(errors[0]?.message).toMatch(/Menge ist ungültig/);
  });

  it('übernimmt die Regeln des Ausstellens (z. B. Pflichtfelder, Total)', () => {
    const form = validForm();
    form.debtor = { ...form.debtor, name: '' };
    form.items = [emptyItem()];
    const fields = collectErrors(form).map((e) => e.field);
    expect(fields).toContain('debtor.name');
    expect(fields).toContain('items.0.description');
    expect(fields).toContain('total');
  });
});

describe('itemAmount / formTotal', () => {
  it('berechnet Positionsbetrag und Total in Rappen', () => {
    const form = validForm();
    expect(itemAmount(form.items[0]!)).toBe(30000);
    expect(formTotal(form)).toBe(34975);
  });

  it('liefert null bzw. ignoriert Positionen mit ungültigen Zahlen', () => {
    const form = validForm();
    form.items[1] = { ...form.items[1]!, unitPrice: 'x' };
    expect(itemAmount(form.items[1]!)).toBeNull();
    expect(formTotal(form)).toBe(30000);
  });
});
