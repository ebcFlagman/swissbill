import type { FieldError } from '../ipc/errors';

export interface Address {
  name: string;
  street: string;
  houseNo: string;
  zip: string;
  city: string;
  /** ISO-3166-Alpha-2, Standard `CH` */
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

/** Lateinischer Zeichensatz des Swiss-QR-Standards: Basic Latin, Latin-1 und Latin Extended-A. */
const ALLOWED_CHARS = /^[ -~¡-ſ]*$/;

export function isAllowedText(value: string): boolean {
  return ALLOWED_CHARS.test(value);
}

/**
 * Prüft eine Adresse gegen die Feldgrenzen und den Zeichensatz des Swiss-QR-Standards.
 * `prefix` bestimmt den Feldnamen in den Fehlern (z. B. `sender` → `sender.name`).
 * Pro Feld wird höchstens ein Fehler gemeldet. Mit `partial` (Entwurf) sind Pflichtfelder noch leer erlaubt;
 * Länge und Zeichensatz werden trotzdem geprüft.
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
 * Prüft den Rechnungsempfänger: nur der Name ist Pflicht (im Entwurf nicht einmal der),
 * Strasse, Nr., PLZ, Ort und Land sind optional. Vorhandene Angaben werden auf Länge und Zeichensatz geprüft,
 * ein angegebenes Land muss ein zweistelliger Ländercode sein.
 *
 * Hinweis: Der Swiss-QR-Standard verlangt bei einer Adresse PLZ und Ort. Fehlen sie, wird der Empfänger im
 * QR-Code weggelassen (siehe qrDebtor), auf der Rechnung erscheint er trotzdem.
 */
export function validateDebtor(
  address: Address,
  prefix: string,
  options: { requireName?: boolean } = {},
): FieldError[] {
  const requireName = options.requireName ?? true;
  // Ein leeres Land ist erlaubt; validateAddress prüft nur ein angegebenes.
  const errors = validateAddress({ ...address, country: address.country === '' ? 'CH' : address.country }, prefix, {
    partial: true,
  });
  if (requireName && address.name.trim() === '') {
    errors.unshift({ field: `${prefix}.name`, message: 'Name ist erforderlich.' });
  }
  return errors;
}
