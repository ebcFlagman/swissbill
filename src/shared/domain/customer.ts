import type { FieldError } from '../ipc/errors';
import { isAllowedText, validateAddress, type Address } from './address';

export const NOTES_MAX = 2000;

export interface CustomerInput extends Address {
  /** fehlt beim Anlegen */
  id?: number | undefined;
  notes: string;
}

export interface Customer extends Address {
  id: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** Prüft einen Kunden: Adresse (Pflichtfelder, Längen, Zeichensatz) und Notizen. */
export function validateCustomer(input: CustomerInput): FieldError[] {
  const errors = validateAddress(input, 'customer');
  if ([...input.notes].length > NOTES_MAX) {
    errors.push({
      field: 'customer.notes',
      message: `Die Notizen dürfen höchstens ${NOTES_MAX} Zeichen lang sein.`,
    });
  } else if (!isAllowedText(input.notes.replace(/\n/g, ' '))) {
    errors.push({ field: 'customer.notes', message: 'Die Notizen enthalten unzulässige Zeichen.' });
  }
  return errors;
}
