/** Removes spaces and converts to upper case. */
export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/** ISO 7064 mod 97-10 over an arbitrarily long sequence of digits/letters (A=10 … Z=35). */
export function mod97(alphanumeric: string): number {
  let remainder = 0;
  for (const char of alphanumeric) {
    const value = /[0-9]/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of value) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder;
}

/**
 * Checks an IBAN for use in the Swiss QR-bill: character set, country (CH/LI), length 21, checksum.
 * Returns a German error message or `null` if the IBAN is valid.
 */
export function validateIban(input: string): string | null {
  const iban = normalizeIban(input);
  if (iban === '') return 'IBAN ist erforderlich.';
  if (!/^[A-Z0-9]+$/.test(iban)) return 'IBAN enthält unzulässige Zeichen.';
  const country = iban.slice(0, 2);
  if (country !== 'CH' && country !== 'LI') {
    return 'Es sind nur IBAN aus der Schweiz oder Liechtenstein zulässig.';
  }
  if (iban.length !== 21) return 'IBAN muss 21 Zeichen lang sein.';
  if (!/^[A-Z]{2}\d{2}/.test(iban)) return 'IBAN hat ein ungültiges Format.';
  if (mod97(iban.slice(4) + iban.slice(0, 4)) !== 1) return 'Die Prüfsumme der IBAN ist ungültig.';
  return null;
}

/** Display format in groups of four: `CH44 3199 9123 0008 8901 2`. The IBAN is stored without spaces. */
export function formatIban(input: string): string {
  return normalizeIban(input)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/**
 * Instant check while typing. Reports only what is already certainly wrong so that unfinished inputs do not disturb:
 * invalid characters and a wrong country (as soon as two characters exist) immediately, a too long IBAN immediately,
 * the checksum at exactly 21 characters. An incomplete IBAN is only reported when the field is left
 * (`final`). An empty field reports nothing; issuing checks the requirement.
 */
export function ibanFeedback(input: string, final: boolean): string | null {
  const iban = normalizeIban(input);
  if (iban === '') return null;
  if (!/^[A-Z0-9]+$/.test(iban)) return 'IBAN enthält unzulässige Zeichen.';
  if (iban.length >= 2 && !iban.startsWith('CH') && !iban.startsWith('LI')) {
    return 'Es sind nur IBAN aus der Schweiz oder Liechtenstein zulässig.';
  }
  if (iban.length < 21 && !final) return null;
  return validateIban(iban);
}

/**
 * QR-IBAN: institution number (IID, positions 5 to 9) in the range 30000 to 31999.
 * Checks only the IID, not the checksum (use `validateIban` for that).
 */
export function isQrIban(input: string): boolean {
  const iban = normalizeIban(input);
  const iid = iban.slice(4, 9);
  if (!/^\d{5}$/.test(iid)) return false;
  const value = Number(iid);
  return value >= 30000 && value <= 31999;
}
