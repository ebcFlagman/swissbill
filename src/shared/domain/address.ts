import type { FieldError } from '../ipc/errors';

export interface Address {
  name: string;
  street: string;
  houseNo: string;
  zip: string;
  city: string;
  /** ISO 3166 alpha-2, default `CH` */
  country: string;
}

export const ADDRESS_LIMITS = {
  name: 70,
  street: 70,
  houseNo: 16,
  zip: 16,
  city: 35,
} as const;

const LABELS: Record<keyof typeof ADDRESS_LIMITS, string> = {
  name: 'Name',
  street: 'Strasse',
  houseNo: 'Hausnummer',
  zip: 'PLZ',
  city: 'Ort',
};

const REQUIRED = new Set<keyof typeof ADDRESS_LIMITS>(['name', 'zip', 'city']);

/** Latin character set of the Swiss QR standard: Basic Latin, Latin-1 and Latin Extended-A. */
const ALLOWED_CHARS = /^[ -~¡-ſ]*$/;

export function isAllowedText(value: string): boolean {
  return ALLOWED_CHARS.test(value);
}

/**
 * Checks an address against the field limits and the character set of the Swiss QR standard.
 * `prefix` determines the field name in the errors (e.g. `sender` → `sender.name`).
 * At most one error is reported per field. With `partial` (draft) required fields may still be empty;
 * length and character set are checked anyway.
 */
export function validateAddress(
  address: Address,
  prefix: string,
  options: { partial?: boolean } = {},
): FieldError[] {
  const errors: FieldError[] = [];

  for (const key of Object.keys(ADDRESS_LIMITS) as (keyof typeof ADDRESS_LIMITS)[]) {
    const value = address[key];
    const label = LABELS[key];
    const limit = ADDRESS_LIMITS[key];
    const field = `${prefix}.${key}`;

    if (value.trim() === '') {
      if (REQUIRED.has(key) && !options.partial) {
        errors.push({ field, message: `${label} ist erforderlich.` });
      }
      continue;
    }
    if ([...value].length > limit) {
      errors.push({ field, message: `${label} darf höchstens ${limit} Zeichen lang sein.` });
    } else if (!isAllowedText(value)) {
      errors.push({ field, message: `${label} enthält unzulässige Zeichen.` });
    }
  }

  if (!/^[A-Z]{2}$/.test(address.country)) {
    errors.push({
      field: `${prefix}.country`,
      message: 'Land muss ein zweistelliger Ländercode sein (z. B. CH).',
    });
  }

  return errors;
}

/**
 * Checks the debtor: only the name is required (not even that in a draft),
 * street, number, postal code, city and country are optional. Given values are checked for length and character set,
 * a given country must be a two-letter country code.
 *
 * Note: the Swiss QR standard requires postal code and city for an address. If they are missing, the debtor is
 * omitted from the QR code (see qrDebtor), but still appears on the invoice.
 */
export function validateDebtor(
  address: Address,
  prefix: string,
  options: { requireName?: boolean } = {},
): FieldError[] {
  const requireName = options.requireName ?? true;
  // An empty country is allowed; validateAddress only checks a given one.
  const errors = validateAddress({ ...address, country: address.country === '' ? 'CH' : address.country }, prefix, {
    partial: true,
  });
  if (requireName && address.name.trim() === '') {
    errors.unshift({ field: `${prefix}.name`, message: 'Name ist erforderlich.' });
  }
  return errors;
}
