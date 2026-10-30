/** Betrag in ganzen Rappen (CHF). Es werden nie Fliesskommawerte gespeichert oder verrechnet. */
export type Rappen = number;

/** Menge in Tausendsteln (1.5 Stück = 1500). */
export type Milli = number;

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} muss eine nicht-negative ganze Zahl sein.`);
  }
}

/**
 * Positionsbetrag = round_half_up(menge * einzelpreis / 1000), rein ganzzahlig gerechnet.
 */
export function lineAmount(quantityMilli: Milli, unitPriceRappen: Rappen): Rappen {
  assertNonNegativeInteger(quantityMilli, 'Menge');
  assertNonNegativeInteger(unitPriceRappen, 'Einzelpreis');
  const result = (BigInt(quantityMilli) * BigInt(unitPriceRappen) + 500n) / 1000n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Betrag ist zu gross.');
  }
  return Number(result);
}

export function sumAmounts(amounts: readonly Rappen[]): Rappen {
  let total = 0;
  for (const amount of amounts) {
    assertNonNegativeInteger(amount, 'Betrag');
    total += amount;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError('Betrag ist zu gross.');
    }
  }
  return total;
}

function groupThousands(integerPart: string): string {
  return integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

/** `123450` → `1'234.50` */
export function formatChf(rappen: Rappen): string {
  if (!Number.isSafeInteger(rappen)) {
    throw new RangeError('Betrag muss eine ganze Zahl in Rappen sein.');
  }
  const abs = Math.abs(rappen);
  const francs = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, '0');
  return `${rappen < 0 ? '-' : ''}${groupThousands(String(francs))}.${cents}`;
}

/** `123450` → `1234.50` (ohne Tausendertrenner, für Eingabefelder) */
export function formatChfInput(rappen: Rappen): string {
  if (!Number.isSafeInteger(rappen) || rappen < 0) {
    throw new RangeError('Betrag muss eine nicht-negative ganze Zahl in Rappen sein.');
  }
  return `${Math.floor(rappen / 100)}.${String(rappen % 100).padStart(2, '0')}`;
}

const CHF_PATTERN = /^(?:\d{1,3}(?:'\d{3})+|\d+)(?:[.,]\d{1,2})?$/;

/** Liest `1'234.50`, `1234,5`, `1234` usw. Liefert `null` bei ungültiger Eingabe. */
export function parseChf(input: string): Rappen | null {
  const text = input.trim().replace(/[’‘]/g, "'");
  if (!CHF_PATTERN.test(text)) return null;
  const [intPart = '', fracPart = ''] = text.replace(/'/g, '').split(/[.,]/);
  const result = Number(intPart) * 100 + Number(fracPart.padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : null;
}

const MILLI_PATTERN = /^\d+(?:[.,]\d{1,3})?$/;

/** `1.5` → `1500`. Liefert `null` bei ungültiger Eingabe oder mehr als drei Nachkommastellen. */
export function parseMilli(input: string): Milli | null {
  const text = input.trim();
  if (!MILLI_PATTERN.test(text)) return null;
  const [intPart = '', fracPart = ''] = text.split(/[.,]/);
  const result = Number(intPart) * 1000 + Number(fracPart.padEnd(3, '0'));
  return Number.isSafeInteger(result) ? result : null;
}

/** `1500` → `1.5`, `2000` → `2`, `1` → `0.001` */
export function formatMilli(milli: Milli): string {
  assertNonNegativeInteger(milli, 'Menge');
  const whole = Math.floor(milli / 1000);
  const frac = String(milli % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}
