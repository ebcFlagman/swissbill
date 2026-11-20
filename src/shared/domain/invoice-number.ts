/** `PREFIX-YEAR-COUNTER`, e.g. `RE-2026-0001`. The counter has at least four digits and grows beyond that. */
export function formatInvoiceNumber(prefix: string, year: number, seq: number): string {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new RangeError('Das Jahr muss vierstellig sein.');
  }
  if (!Number.isSafeInteger(seq) || seq < 1) {
    throw new RangeError('Der Zähler muss eine ganze Zahl ab 1 sein.');
  }
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
}

/** Prefix: 1 to 10 characters from `A-Z`, `0-9` and `-`. Returns a German message or `null`. */
export function validatePrefix(prefix: string): string | null {
  if (prefix === '') return 'Der Präfix ist erforderlich.';
  if ([...prefix].length > 10) return 'Der Präfix darf höchstens 10 Zeichen lang sein.';
  if (!/^[A-Z0-9-]+$/.test(prefix)) {
    return 'Der Präfix darf nur Grossbuchstaben (A–Z), Ziffern und Bindestriche enthalten.';
  }
  return null;
}
