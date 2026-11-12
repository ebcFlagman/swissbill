import type { FieldError } from '../ipc/errors';
import { isAllowedText, validateAddress } from './address';
import { validateIban } from './iban';
import { CLOSING_TEXT_MAX, type Sender } from './invoice';
import { validatePrefix } from './invoice-number';

/**
 * Zustand des Geoapify-API-Keys (der Key selbst verlässt den Main nie):
 * - `none`: kein Key gespeichert
 * - `ok`: Key gespeichert und lesbar
 * - `undecryptable`: gespeichert, aber auf diesem Gerät/Benutzer nicht entschlüsselbar (z. B. Sicherung eingespielt)
 * - `encryption-unavailable`: auf diesem Gerät keine Verschlüsselung, ein Key wird nicht gespeichert
 */
export type GeoapifyKeyStatus = 'none' | 'ok' | 'undecryptable' | 'encryption-unavailable';

export interface SettingsFields {
  sender: Sender;
  invoicePrefix: string;
  defaultClosingText: string | null;
  defaultPaymentDays: number;
}

/** Ausgabe von `settings:get`: enthält den API-Key nie, nur ob und in welchem Zustand er gespeichert ist. */
export interface Settings extends SettingsFields {
  geoapifyKeySet: boolean;
  geoapifyKeyStatus: GeoapifyKeyStatus;
}

/**
 * Eingabe von `settings:save`. `geoapifyApiKey`: nicht angegeben = Key unverändert, `''` = Key entfernen,
 * sonst Key setzen.
 */
export interface SettingsInput extends SettingsFields {
  geoapifyApiKey?: string;
}

export const MAX_PAYMENT_DAYS = 365;
export const API_KEY_MAX = 200;

export function normalizeApiKey(key: string): string {
  return key.trim();
}

/** Prüft einen API-Key (nach dem Trimmen): höchstens 200 Zeichen, innen keine Leer- oder Steuerzeichen. */
export function validateApiKey(key: string): string | null {
  const value = normalizeApiKey(key);
  if ([...value].length > API_KEY_MAX) return `Der API-Key darf höchstens ${API_KEY_MAX} Zeichen lang sein.`;
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return 'Der API-Key darf keine Leer- oder Steuerzeichen enthalten.';
  return null;
}

/**
 * Prüft die globalen Einstellungen beim Speichern: vollständiger Absender mit gültiger IBAN,
 * Rechnungspräfix, Schlusstext und Zahlungsfrist.
 */
export function validateSettings(settings: SettingsInput): FieldError[] {
  const errors = validateAddress(settings.sender, 'sender');
  if (settings.geoapifyApiKey !== undefined) {
    const keyError = validateApiKey(settings.geoapifyApiKey);
    if (keyError) errors.push({ field: 'geoapifyApiKey', message: keyError });
  }
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
