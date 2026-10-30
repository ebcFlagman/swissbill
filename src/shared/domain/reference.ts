import { isQrIban, mod97 } from './iban';

export type ReferenceType = 'QRR' | 'SCOR';

/** Tabelle für Modulo 10 rekursiv (ISR/QR-Referenz). */
const MOD10_TABLE = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5] as const;

/** Prüfziffer einer QR-Referenz aus den ersten 26 Ziffern (Modulo 10 rekursiv). */
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
 * QR-Referenz (27 Ziffern): Jahr, links mit Nullen aufgefüllter Zähler (zusammen 26 Ziffern), Prüfziffer.
 * Der Präfix der Rechnungsnummer fliesst nicht ein.
 */
export function buildQrReference(year: number, seq: number): string {
  assertYearAndSeq(year, seq);
  const payload = String(year) + String(seq).padStart(22, '0');
  return payload + qrrCheckDigit(payload);
}

/** Prüfziffern (2 Stellen) einer Creditor Reference nach ISO 11649 / Mod 97-10. */
export function creditorCheckDigits(payload: string): string {
  const check = 98 - mod97(`${payload}RF00`);
  return String(check).padStart(2, '0');
}

/**
 * Creditor Reference (ISO 11649): `RF` + 2 Prüfziffern + Jahr + mindestens vierstelliger Zähler.
 * Der Präfix der Rechnungsnummer fliesst nicht ein.
 */
export function buildCreditorReference(year: number, seq: number): string {
  assertYearAndSeq(year, seq);
  const payload = String(year) + String(seq).padStart(4, '0');
  return `RF${creditorCheckDigits(payload)}${payload}`;
}

/** QR-IBAN führt zu QR-Referenz (QRR), jede andere IBAN zu Creditor Reference (SCOR). */
export function referenceTypeFor(iban: string): ReferenceType {
  return isQrIban(iban) ? 'QRR' : 'SCOR';
}

/** Liefert eine deutsche Fehlermeldung oder `null`, wenn die Referenz zum Typ passt. */
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
