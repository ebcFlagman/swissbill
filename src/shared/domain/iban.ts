/** Entfernt Leerzeichen und macht Grossbuchstaben. */
export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/** ISO 7064 Mod 97-10 über eine beliebig lange Ziffern-/Buchstabenfolge (A=10 … Z=35). */
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
 * Prüft eine IBAN für den Einsatz im Swiss QR-Bill: Zeichenvorrat, Land (CH/LI), Länge 21, Prüfsumme.
 * Liefert eine deutsche Fehlermeldung oder `null`, wenn die IBAN gültig ist.
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

/** Anzeigeformat in Vierergruppen: `CH44 3199 9123 0008 8901 2`. Gespeichert wird die IBAN ohne Leerzeichen. */
export function formatIban(input: string): string {
  return normalizeIban(input)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/**
 * Sofortprüfung beim Tippen. Meldet nur, was schon sicher falsch ist, damit unfertige Eingaben nicht stören:
 * unzulässige Zeichen und ein falsches Land (sobald zwei Zeichen vorliegen) sofort, eine zu lange IBAN sofort,
 * bei genau 21 Zeichen die Prüfsumme. Eine noch unvollständige IBAN wird erst gemeldet, wenn das Feld verlassen
 * wird (`final`). Ein leeres Feld meldet nichts; die Pflicht prüft das Ausstellen.
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
 * QR-IBAN: Institutsnummer (IID, Stellen 5 bis 9) im Bereich 30000 bis 31999.
 * Prüft nur die IID, nicht die Prüfsumme (dafür `validateIban`).
 */
export function isQrIban(input: string): boolean {
  const iban = normalizeIban(input);
  const iid = iban.slice(4, 9);
  if (!/^\d{5}$/.test(iid)) return false;
  const value = Number(iid);
  return value >= 30000 && value <= 31999;
}
