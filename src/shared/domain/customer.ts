import type { FieldError } from '../ipc/errors';
import { isAllowedText, validateAddress, type Address } from './address';

export const NOTES_MAX = 2000;

export interface CustomerInput extends Address {
  /** missing on creation */
  id?: number | undefined;
  notes: string;
}

export interface Customer extends Address {
  id: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** Checks a customer: address (required fields, lengths, character set) and notes. */
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
