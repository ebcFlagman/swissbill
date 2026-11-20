import type { Address } from './address';

/** From this length (after trimming) suggestions are searched. */
export const MIN_QUERY_LENGTH = 3;

/** Maximum number of suggestions shown. */
export const MAX_SUGGESTIONS = 5;

/** A temporary search result; never stored, only taken over into the address fields. */
export interface AddressSuggestion {
  /** Display line, e.g. "Bahnhofstrasse 1, 8001 Zürich, Schweiz" */
  label: string;
  street: string;
  houseNo: string;
  zip: string;
  city: string;
  /** ISO 3166 alpha-2, upper case */
  country: string;
}

export function shouldSearch(text: string): boolean {
  return [...text.trim()].length >= MIN_QUERY_LENGTH;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Maps the response of the service (`format=json`) to suggestions. Hits without postal code and city are not
 * addresses (e.g. only a country) and are discarded. Values are never shortened or corrected (constitution I).
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

/** Takes over a chosen suggestion: street, number, postal code, city and country are replaced, everything else stays. */
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
