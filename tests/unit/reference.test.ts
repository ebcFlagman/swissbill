import { describe, expect, it } from 'vitest';
import {
  buildCreditorReference,
  buildQrReference,
  creditorCheckDigits,
  qrrCheckDigit,
  referenceTypeFor,
  validateReference,
} from '@shared/domain/reference';

const QR_IBAN = 'CH4431999123000889012';
const NORMAL_IBAN = 'CH9300762011623852957';

describe('QR-Referenz (QRR)', () => {
  it('berechnet die Prüfziffer nach Modulo 10 rekursiv (SIX-Beispiel)', () => {
    expect(qrrCheckDigit('21000000000313947143000901')).toBe(7);
  });

  it('baut aus Jahr und Zähler 27 Ziffern: Jahr, links aufgefüllter Zähler, Prüfziffer', () => {
    const ref = buildQrReference(2026, 1);
    expect(ref).toBe('202600000000000000000000013');
    expect(ref).toHaveLength(27);
    expect(buildQrReference(2027, 12345)).toBe('202700000000000000000123456');
  });

  it('baut gültige Referenzen, die validateReference akzeptiert', () => {
    expect(validateReference('QRR', buildQrReference(2026, 1))).toBeNull();
    expect(validateReference('QRR', '210000000003139471430009017')).toBeNull();
  });

  it('lehnt falsche Länge, Nicht-Ziffern und falsche Prüfziffer ab', () => {
    expect(validateReference('QRR', '21000000000313947143000901')).toMatch(/27/);
    expect(validateReference('QRR', '21000000000313947143000901X')).toMatch(/Ziffern/);
    expect(validateReference('QRR', '210000000003139471430009018')).toMatch(/Prüfziffer/);
  });

  it('akzeptiert Leerzeichen in der Darstellung', () => {
    expect(validateReference('QRR', '21 00000 00003 13947 14300 09017')).toBeNull();
  });

  it('lehnt Jahr oder Zähler ausserhalb des Bereichs ab', () => {
    expect(() => buildQrReference(2026, 0)).toThrow();
    expect(() => buildQrReference(999, 1)).toThrow();
    expect(() => buildQrReference(2026, 10 ** 22)).toThrow();
  });
});

describe('Creditor Reference (SCOR, ISO 11649)', () => {
  it('berechnet die Prüfziffern nach Mod 97 (ISO-Beispiel)', () => {
    expect(creditorCheckDigits('539007547034')).toBe('18');
  });

  it('baut RF + Prüfziffern + Jahr und mindestens vierstelligen Zähler', () => {
    expect(buildCreditorReference(2026, 1)).toBe('RF3120260001');
    expect(buildCreditorReference(2026, 12345)).toBe('RF36202612345');
  });

  it('ist höchstens 25 Zeichen lang und validiert', () => {
    const ref = buildCreditorReference(2026, 1);
    expect(ref.length).toBeLessThanOrEqual(25);
    expect(validateReference('SCOR', ref)).toBeNull();
    expect(validateReference('SCOR', 'RF18 5390 0754 7034')).toBeNull();
  });

  it('lehnt falsche Prüfziffern, fehlendes RF und zu lange Referenzen ab', () => {
    expect(validateReference('SCOR', 'RF19539007547034')).toMatch(/Prüfziffer/);
    expect(validateReference('SCOR', 'XX18539007547034')).toMatch(/RF/);
    expect(validateReference('SCOR', 'RF18' + '1'.repeat(22))).toMatch(/25/);
  });
});

describe('referenceTypeFor', () => {
  it('QR-IBAN führt zu QRR, normale IBAN zu SCOR', () => {
    expect(referenceTypeFor(QR_IBAN)).toBe('QRR');
    expect(referenceTypeFor(NORMAL_IBAN)).toBe('SCOR');
  });
});
