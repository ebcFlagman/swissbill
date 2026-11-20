import { isQrIban, mod97 } from './iban';

export type ReferenceType = 'QRR' | 'SCOR';

/** Table for recursive modulo 10 (ISR/QR reference). */
const MOD10_TABLE = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5] as const;

/** Check digit of a QR reference from the first 26 digits (recursive modulo 10). */
export function qrrCheckDigit(digits: string): number {
  let carry = 0;
  for (const char of digits) {
    carry = MOD10_TABLE[(carry + Number(char)) % 10] as number;
  }
  return (10 - carry) % 10;
}

function assertYearAndSeq(year: number, seq: number): void {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new RangeError('Das Jahr muss vierstellig sein.');
  }
  if (!Number.isSafeInteger(seq) || seq < 1) {
    throw new RangeError('Der Zähler muss eine ganze Zahl ab 1 sein.');
  }
}

/**
 * QR reference (27 digits): year, counter padded with zeros on the left (together 26 digits), check digit.
 * The prefix of the invoice number is not included.
 */
export function buildQrReference(year: number, seq: number): string {
  assertYearAndSeq(year, seq);
  const payload = String(year) + String(seq).padStart(22, '0');
  return payload + qrrCheckDigit(payload);
}

/** Check digits (2 digits) of a creditor reference according to ISO 11649 / mod 97-10. */
export function creditorCheckDigits(payload: string): string {
  const check = 98 - mod97(`${payload}RF00`);
  return String(check).padStart(2, '0');
}

/**
 * Creditor reference (ISO 11649): `RF` + 2 check digits + year + counter of at least four digits.
 * The prefix of the invoice number is not included.
 */
export function buildCreditorReference(year: number, seq: number): string {
  assertYearAndSeq(year, seq);
  const payload = String(year) + String(seq).padStart(4, '0');
  return `RF${creditorCheckDigits(payload)}${payload}`;
}

/** A QR-IBAN leads to a QR reference (QRR), any other IBAN to a creditor reference (SCOR). */
export function referenceTypeFor(iban: string): ReferenceType {
  return isQrIban(iban) ? 'QRR' : 'SCOR';
}

/** Returns a German error message or `null` if the reference matches the type. */
export function validateReference(type: ReferenceType, reference: string): string | null {
  const ref = reference.replace(/\s+/g, '').toUpperCase();
  if (type === 'QRR') {
    if (!/^\d+$/.test(ref)) return 'Die QR-Referenz darf nur Ziffern enthalten.';
    if (ref.length !== 27) return 'Die QR-Referenz muss 27 Ziffern lang sein.';
    if (qrrCheckDigit(ref.slice(0, 26)) !== Number(ref.slice(26))) {
      return 'Die Prüfziffer der QR-Referenz ist ungültig.';
    }
    return null;
  }
  if (!ref.startsWith('RF')) return 'Die Creditor Reference muss mit RF beginnen.';
  if (ref.length > 25) return 'Die Creditor Reference darf höchstens 25 Zeichen lang sein.';
  if (!/^RF\d{2}[A-Z0-9]+$/.test(ref)) return 'Die Creditor Reference hat ein ungültiges Format.';
  if (mod97(ref.slice(4) + ref.slice(0, 4)) !== 1) {
    return 'Die Prüfziffer der Creditor Reference ist ungültig.';
  }
  return null;
}
