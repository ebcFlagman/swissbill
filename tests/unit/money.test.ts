import { describe, expect, it } from 'vitest';
import {
  formatChf,
  formatChfInput,
  formatMilli,
  lineAmount,
  parseChf,
  parseMilli,
  sumAmounts,
} from '@shared/domain/money';

describe('lineAmount', () => {
  it('multipliziert Menge (Tausendstel) mit Einzelpreis (Rappen)', () => {
    expect(lineAmount(1500, 1000)).toBe(1500); // 1.5 x 10.00 = 15.00
    expect(lineAmount(1000, 12345)).toBe(12345);
    expect(lineAmount(2000, 5000)).toBe(10000);
  });

  it('rundet bei .5 aufwärts (round half up)', () => {
    expect(lineAmount(1500, 3)).toBe(5); // 4.5 -> 5
    expect(lineAmount(1500, 1)).toBe(2); // 1.5 -> 2
    expect(lineAmount(1499, 1)).toBe(1); // 1.499 -> 1
    expect(lineAmount(333, 1000)).toBe(333);
    expect(lineAmount(1, 499)).toBe(0); // 0.499 -> 0
    expect(lineAmount(1, 500)).toBe(1); // 0.5 -> 1
  });

  it('liefert 0 bei Preis 0', () => {
    expect(lineAmount(1500, 0)).toBe(0);
  });

  it('bleibt auch bei grossen Werten exakt (keine Fliesskomma-Fehler)', () => {
    expect(lineAmount(999_999_999, 99_999_999)).toBe(99_999_998_900_000);
  });

  it('lehnt Nicht-Ganzzahlen und negative Werte ab', () => {
    expect(() => lineAmount(1.5, 1000)).toThrow();
    expect(() => lineAmount(1000, 10.5)).toThrow();
    expect(() => lineAmount(-1, 1000)).toThrow();
    expect(() => lineAmount(1000, -1)).toThrow();
    expect(() => lineAmount(Number.NaN, 1000)).toThrow();
  });
});

describe('sumAmounts', () => {
  it('summiert ganze Rappen', () => {
    expect(sumAmounts([1500, 5, 2])).toBe(1507);
    expect(sumAmounts([])).toBe(0);
  });

  it('entspricht der Summe der gerundeten Positionsbeträge', () => {
    const items = [
      { qty: 1500, price: 3 },
      { qty: 1500, price: 3 },
      { qty: 1500, price: 3 },
    ];
    const amounts = items.map((i) => lineAmount(i.qty, i.price));
    expect(amounts).toEqual([5, 5, 5]);
    expect(sumAmounts(amounts)).toBe(15); // nicht round(13.5) = 14
  });

  it('lehnt Nicht-Ganzzahlen ab', () => {
    expect(() => sumAmounts([1, 2.5])).toThrow();
  });
});

describe('formatChf', () => {
  it('formatiert mit Apostroph als Tausendertrenner und zwei Nachkommastellen', () => {
    expect(formatChf(123450)).toBe("1'234.50");
    expect(formatChf(5)).toBe('0.05');
    expect(formatChf(0)).toBe('0.00');
    expect(formatChf(100000000)).toBe("1'000'000.00");
    expect(formatChf(99_999_999_999)).toBe("999'999'999.99");
  });

  it('formatiert negative Beträge', () => {
    expect(formatChf(-123450)).toBe("-1'234.50");
  });
});

describe('formatChfInput', () => {
  it('formatiert ohne Tausendertrenner für Eingabefelder', () => {
    expect(formatChfInput(123450)).toBe('1234.50');
    expect(formatChfInput(5)).toBe('0.05');
    expect(formatChfInput(100000000)).toBe('1000000.00');
    expect(parseChf(formatChfInput(4975))).toBe(4975);
  });
});

describe('parseChf', () => {
  it('liest verschiedene Schreibweisen', () => {
    expect(parseChf("1'234.50")).toBe(123450);
    expect(parseChf('1234.5')).toBe(123450);
    expect(parseChf('1234,50')).toBe(123450);
    expect(parseChf('1234')).toBe(123400);
    expect(parseChf('0.05')).toBe(5);
    expect(parseChf('  12.00 ')).toBe(1200);
  });

  it('liefert null bei ungültiger Eingabe oder mehr als zwei Nachkommastellen', () => {
    expect(parseChf('')).toBeNull();
    expect(parseChf('abc')).toBeNull();
    expect(parseChf('1.234')).toBeNull();
    expect(parseChf('1.2.3')).toBeNull();
    expect(parseChf('-5')).toBeNull();
  });
});

describe('parseMilli / formatMilli', () => {
  it('rechnet Mengen in Tausendstel um', () => {
    expect(parseMilli('1.5')).toBe(1500);
    expect(parseMilli('1,5')).toBe(1500);
    expect(parseMilli('2')).toBe(2000);
    expect(parseMilli('0.001')).toBe(1);
    expect(formatMilli(1500)).toBe('1.5');
    expect(formatMilli(2000)).toBe('2');
    expect(formatMilli(1)).toBe('0.001');
  });

  it('liefert null bei mehr als drei Nachkommastellen oder ungültiger Eingabe', () => {
    expect(parseMilli('1.0001')).toBeNull();
    expect(parseMilli('x')).toBeNull();
    expect(parseMilli('')).toBeNull();
  });
});
