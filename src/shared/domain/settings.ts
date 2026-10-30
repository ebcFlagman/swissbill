import type { FieldError } from '../ipc/errors';
import { isAllowedText, validateAddress } from './address';
import { validateIban } from './iban';
import { CLOSING_TEXT_MAX, type Sender } from './invoice';
import { validatePrefix } from './invoice-number';

export interface Settings {
  sender: Sender;
  invoicePrefix: string;
  defaultClosingText: string | null;
  defaultPaymentDays: number;
}

export const MAX_PAYMENT_DAYS = 365;

/**
 * Prüft die globalen Einstellungen beim Speichern: vollständiger Absender mit gültiger IBAN,
 * Rechnungspräfix, Schlusstext und Zahlungsfrist.
 */
export function validateSettings(settings: Settings): FieldError[] {
  const errors = validateAddress(settings.sender, 'sender');
  const ibanError = validateIban(settings.sender.iban);
  if (ibanError) errors.push({ field: 'sender.iban', message: ibanError });

  const prefixError = validatePrefix(settings.invoicePrefix);
  if (prefixError) errors.push({ field: 'invoicePrefix', message: prefixError });

  if (
    !Number.isInteger(settings.defaultPaymentDays) ||
    settings.defaultPaymentDays < 0 ||
    settings.defaultPaymentDays > MAX_PAYMENT_DAYS
  ) {
    errors.push({
      field: 'defaultPaymentDays',
      message: `Die Zahlungsfrist muss zwischen 0 und ${MAX_PAYMENT_DAYS} Tagen liegen.`,
    });
  }

  const text = settings.defaultClosingText;
  if (text !== null) {
    if ([...text].length > CLOSING_TEXT_MAX) {
      errors.push({
        field: 'defaultClosingText',
        message: `Der Schlusstext darf höchstens ${CLOSING_TEXT_MAX} Zeichen lang sein.`,
      });
    } else if (!isAllowedText(text.replace(/[\n€]/g, ' '))) {
      errors.push({ field: 'defaultClosingText', message: 'Der Schlusstext enthält unzulässige Zeichen.' });
    }
  }
  return errors;
}
