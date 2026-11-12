import type { Address } from './address';

/** Ab dieser Länge (nach dem Trimmen) wird nach Vorschlägen gesucht. */
export const MIN_QUERY_LENGTH = 3;

/** Höchstzahl der angezeigten Vorschläge. */
export const MAX_SUGGESTIONS = 5;

/** Ein vorübergehendes Suchergebnis; wird nie gespeichert, sondern nur in die Adressfelder übernommen. */
export interface AddressSuggestion {
  /** Anzeigezeile, z. B. «Bahnhofstrasse 1, 8001 Zürich, Schweiz» */
  label: string;
  street: string;
  houseNo: string;
  zip: string;
  city: string;
  /** ISO-3166-Alpha-2, gross */
  country: string;
}

export function shouldSearch(text: string): boolean {
  return [...text.trim()].length >= MIN_QUERY_LENGTH;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Bildet die Antwort des Dienstes (`format=json`) auf Vorschläge ab. Treffer ohne PLZ und Ort sind keine
 * Adressen (z. B. nur ein Land) und werden verworfen. Werte werden nie gekürzt oder korrigiert (Constitution I).
 */
export function toSuggestions(response: unknown): AddressSuggestion[] {
  const results = (response as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];

  const suggestions: AddressSuggestion[] = [];
  for (const item of results) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const zip = str(record['postcode']);
    const city = str(record['city']);
    if (zip === '' && city === '') continue;
    suggestions.push({
      label: str(record['formatted']) || [str(record['street']), `${zip} ${city}`.trim()].filter(Boolean).join(', '),
      street: str(record['street']),
      houseNo: str(record['housenumber']),
      zip,
      city,
      country: str(record['country_code']).toUpperCase(),
    });
  }
  return suggestions;
}

/** Übernimmt einen gewählten Vorschlag: Strasse, Nr., PLZ, Ort und Land werden ersetzt, alles andere bleibt. */
export function applySuggestion<T extends Address>(address: T, suggestion: AddressSuggestion): T {
  return {
    ...address,
    street: suggestion.street,
    houseNo: suggestion.houseNo,
    zip: suggestion.zip,
    city: suggestion.city,
    country: suggestion.country || address.country,
  };
}
