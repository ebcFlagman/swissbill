import { describe, expect, it } from 'vitest';
import { formatInvoiceNumber, validatePrefix } from '@shared/domain/invoice-number';

describe('formatInvoiceNumber', () => {
  it('formatiert PRÄFIX-JAHR-ZÄHLER mit mindestens vierstelligem Zähler', () => {
    expect(formatInvoiceNumber('RE', 2026, 1)).toBe('RE-2026-0001');
    expect(formatInvoiceNumber('RE', 2026, 42)).toBe('RE-2026-0042');
    expect(formatInvoiceNumber('INV-A', 2027, 9999)).toBe('INV-A-2027-9999');
  });

  it('lässt den Zähler über 9999 hinaus wachsen', () => {
    expect(formatInvoiceNumber('RE', 2026, 10000)).toBe('RE-2026-10000');
    expect(formatInvoiceNumber('RE', 2026, 123456)).toBe('RE-2026-123456');
  });

  it('lehnt Zähler unter 1 und ungültige Jahre ab', () => {
    expect(() => formatInvoiceNumber('RE', 2026, 0)).toThrow();
    expect(() => formatInvoiceNumber('RE', 2026, 1.5)).toThrow();
    expect(() => formatInvoiceNumber('RE', 26, 1)).toThrow();
  });
});

describe('validatePrefix', () => {
  it('akzeptiert 1 bis 10 Zeichen aus A-Z, 0-9 und Bindestrich', () => {
    expect(validatePrefix('RE')).toBeNull();
    expect(validatePrefix('R')).toBeNull();
    expect(validatePrefix('INV-2026')).toBeNull();
    expect(validatePrefix('ABCDEFGHIJ')).toBeNull();
  });

  it('lehnt leere, zu lange und unzulässige Präfixe ab', () => {
    expect(validatePrefix('')).toMatch(/erforderlich/);
    expect(validatePrefix('ABCDEFGHIJK')).toMatch(/10/);
    expect(validatePrefix('re')).toMatch(/Grossbuchstaben/);
    expect(validatePrefix('R E')).not.toBeNull();
    expect(validatePrefix('R_E')).not.toBeNull();
    expect(validatePrefix('RÉ')).not.toBeNull();
  });
});
