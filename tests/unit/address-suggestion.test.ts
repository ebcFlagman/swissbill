import { describe, expect, it } from 'vitest';
import { validateAddress, type Address } from '@shared/domain/address';
import {
  applySuggestion,
  MIN_QUERY_LENGTH,
  shouldSearch,
  toSuggestions,
} from '@shared/domain/address-suggestion';
import sample from '../fixtures/geoapify-autocomplete.json';

const base: Address & { iban: string } = {
  name: 'Muster AG',
  street: '',
  houseNo: '',
  zip: '',
  city: '',
  country: 'CH',
  iban: 'CH93 0076 2011 6238 5295 7',
};

describe('toSuggestions (Antwort von Geoapify → Vorschläge)', () => {
  const suggestions = toSuggestions(sample);

  it('bildet Strasse, Hausnummer, PLZ, Ort und Land ab, das Land als grosser Zweibuchstaben-Code', () => {
    expect(suggestions[0]).toEqual({
      label: 'Bahnhofstrasse 1, 8001 Zürich, Schweiz',
      street: 'Bahnhofstrasse',
      houseNo: '1',
      zip: '8001',
      city: 'Zürich',
      country: 'CH',
    });
  });

  it('lässt eine fehlende Hausnummer leer', () => {
    expect(suggestions[1]).toMatchObject({ street: 'Beispielgasse', houseNo: '', zip: '3011', city: 'Bern' });
  });

  it('übernimmt Auslandsadressen mit ihrem Ländercode', () => {
    expect(suggestions[2]).toMatchObject({ country: 'DE', zip: '78462', houseNo: '7a' });
  });

  it('verwirft Treffer ohne Ort und PLZ (kein Adressvorschlag)', () => {
    expect(suggestions).toHaveLength(3);
  });

  it('liefert bei unbrauchbarer Antwort eine leere Liste', () => {
    expect(toSuggestions(null)).toEqual([]);
    expect(toSuggestions({})).toEqual([]);
    expect(toSuggestions({ results: 'x' })).toEqual([]);
  });

  it('kürzt nichts', () => {
    const long = 'A'.repeat(100);
    const [one] = toSuggestions({ results: [{ street: long, postcode: '1', city: 'B', country_code: 'ch' }] });
    expect(one?.street).toBe(long);
  });
});

describe('applySuggestion', () => {
  const [first] = toSuggestions(sample);

  it('überschreibt Strasse, Nr., PLZ, Ort und Land und lässt Name und IBAN stehen', () => {
    const result = applySuggestion({ ...base, zip: '9999', city: 'Alt', country: 'FR' }, first!);
    expect(result).toEqual({
      ...base,
      street: 'Bahnhofstrasse',
      houseNo: '1',
      zip: '8001',
      city: 'Zürich',
      country: 'CH',
    });
  });

  it('kürzt zu lange Werte nicht, die bestehende Prüfung meldet sie', () => {
    const [long] = toSuggestions({
      results: [{ street: 'S'.repeat(80), postcode: '8001', city: 'Zürich', country_code: 'ch' }],
    });
    const result = applySuggestion(base, long!);
    expect(result.street).toHaveLength(80);
    expect(validateAddress(result, 'debtor').map((e) => e.field)).toContain('debtor.street');
  });

  it('übernommene Beispieladressen bestehen die Adressprüfung für den QR-Zahlteil (SC-006)', () => {
    for (const suggestion of toSuggestions(sample)) {
      expect(validateAddress(applySuggestion(base, suggestion), 'sender')).toEqual([]);
    }
  });
});

describe('shouldSearch', () => {
  it('sucht erst ab der Mindestlänge nach dem Trimmen', () => {
    expect(MIN_QUERY_LENGTH).toBe(3);
    expect(shouldSearch('ab')).toBe(false);
    expect(shouldSearch('  ab  ')).toBe(false);
    expect(shouldSearch('abc')).toBe(true);
    expect(shouldSearch('')).toBe(false);
  });
});
