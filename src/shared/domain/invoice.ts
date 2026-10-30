import type { FieldError } from '../ipc/errors';
import { isAllowedText, validateAddress, validateDebtor, type Address } from './address';
import { normalizeIban, validateIban } from './iban';
import { lineAmount, sumAmounts, type Milli, type Rappen } from './money';
import type { ReferenceType } from './reference';

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'cancelled';

/** Die Währung ist fest CHF (Constitution). */
export const CURRENCY = 'CHF';

/** Höchstbetrag laut Swiss-QR-Standard: 999'999'999.99 */
export const MAX_TOTAL_RAPPEN: Rappen = 99_999_999_999;

/** Version des PDF-Layouts; wird beim Ausstellen festgehalten. */
export const LAYOUT_VERSION = 1;

export const DESCRIPTION_MAX = 500;
export const CLOSING_TEXT_MAX = 2000;

export interface Sender extends Address {
  iban: string;
}

export interface InvoiceItemInput {
  description: string;
  quantityMilli: Milli;
  unitPriceRappen: Rappen;
}

export interface InvoiceItem extends InvoiceItemInput {
  amountRappen: Rappen;
}

export interface Invoice {
  id: number;
  status: InvoiceStatus;
  /** `null` solange Entwurf */
  number: string | null;
  numberYear: number | null;
  numberSeq: number | null;
  /** `YYYY-MM-DD` */
  invoiceDate: string;
  dueDate: string;
  customerId: number | null;
  /** Momentaufnahme; bei Entwürfen vorausgefüllt aus den Einstellungen und überschreibbar */
  sender: Sender;
  /** Momentaufnahme; kopiert aus dem Kunden */
  debtor: Address;
  closingText: string | null;
  referenceType: ReferenceType | null;
  reference: string | null;
  totalRappen: Rappen;
  layoutVersion: number | null;
  issuedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: InvoiceItem[];
}

/** Zeile der Rechnungsliste. */
export interface InvoiceSummary {
  id: number;
  /** `null` solange Entwurf */
  number: string | null;
  status: InvoiceStatus;
  invoiceDate: string;
  dueDate: string;
  debtorName: string;
  totalRappen: Rappen;
}

export interface InvoiceFilter {
  /** Sucht ohne Beachtung der Gross-/Kleinschreibung in Rechnungsnummer und Kundenname */
  search?: string | undefined;
  /** Leer oder fehlend: alle Status */
  status?: InvoiceStatus[] | undefined;
}

/** Eingabe zum Speichern eines Entwurfs; Beträge werden serverseitig berechnet. */
export interface DraftInput {
  id: number;
  invoiceDate: string;
  dueDate: string;
  customerId: number | null;
  sender: Sender;
  debtor: Address;
  closingText: string | null;
  items: InvoiceItemInput[];
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidItem(item: InvoiceItemInput): boolean {
  return (
    Number.isSafeInteger(item.quantityMilli) &&
    item.quantityMilli > 0 &&
    Number.isSafeInteger(item.unitPriceRappen) &&
    item.unitPriceRappen >= 0
  );
}

/** Berechnet Positionsbeträge und Gesamtbetrag. Ungültige Positionen zählen als 0 (werden separat gemeldet). */
export function recalculate(inputs: readonly InvoiceItemInput[]): {
  items: InvoiceItem[];
  totalRappen: Rappen;
} {
  const items = inputs.map((item) => ({
    ...item,
    amountRappen: isValidItem(item) ? lineAmount(item.quantityMilli, item.unitPriceRappen) : 0,
  }));
  return { items, totalRappen: sumAmounts(items.map((i) => i.amountRappen)) };
}

/** Freitext: lateinischer Zeichensatz, Zeilenumbruch und Euro-Zeichen sind erlaubt. */
function isAllowedFreeText(value: string): boolean {
  return isAllowedText(value.replace(/[\n€]/g, ''));
}

function formatMax(): string {
  return "999'999'999.99";
}

/**
 * Prüft einen Entwurf beim Speichern: Längen, Zeichensatz, Datumsformat und Mengen müssen stimmen,
 * unvollständige Pflichtfelder sind aber noch erlaubt (die verbindliche Prüfung folgt beim Ausstellen).
 */
export function validateDraft(input: DraftInput): FieldError[] {
  const errors: FieldError[] = [];
  errors.push(...validateAddress(input.sender, 'sender', { partial: true }));
  if (normalizeIban(input.sender.iban).length > 21) {
    errors.push({ field: 'sender.iban', message: 'IBAN darf höchstens 21 Zeichen lang sein.' });
  }
  errors.push(...validateDebtor(input.debtor, 'debtor', { requireName: false }));

  const invoiceDateOk = isValidIsoDate(input.invoiceDate);
  const dueDateOk = isValidIsoDate(input.dueDate);
  if (!invoiceDateOk) errors.push({ field: 'invoiceDate', message: 'Das Rechnungsdatum ist ungültig.' });
  if (!dueDateOk) {
    errors.push({ field: 'dueDate', message: 'Das Fälligkeitsdatum ist ungültig.' });
  } else if (invoiceDateOk && input.dueDate < input.invoiceDate) {
    errors.push({
      field: 'dueDate',
      message: 'Das Fälligkeitsdatum darf nicht vor dem Rechnungsdatum liegen.',
    });
  }

  input.items.forEach((item, index) => {
    const prefix = `items.${index}`;
    if ([...item.description].length > DESCRIPTION_MAX) {
      errors.push({
        field: `${prefix}.description`,
        message: `Die Beschreibung darf höchstens ${DESCRIPTION_MAX} Zeichen lang sein.`,
      });
    } else if (!isAllowedFreeText(item.description)) {
      errors.push({ field: `${prefix}.description`, message: 'Die Beschreibung enthält unzulässige Zeichen.' });
    }
    if (!Number.isSafeInteger(item.quantityMilli) || item.quantityMilli <= 0) {
      errors.push({ field: `${prefix}.quantity`, message: 'Die Menge muss grösser als 0 sein.' });
    }
    if (!Number.isSafeInteger(item.unitPriceRappen) || item.unitPriceRappen < 0) {
      errors.push({ field: `${prefix}.unitPrice`, message: 'Der Einzelpreis darf nicht negativ sein.' });
    }
  });

  if (input.closingText !== null) {
    if ([...input.closingText].length > CLOSING_TEXT_MAX) {
      errors.push({
        field: 'closingText',
        message: `Der Schlusstext darf höchstens ${CLOSING_TEXT_MAX} Zeichen lang sein.`,
      });
    } else if (!isAllowedFreeText(input.closingText)) {
      errors.push({ field: 'closingText', message: 'Der Schlusstext enthält unzulässige Zeichen.' });
    }
  }
  return errors;
}

/**
 * Prüft, ob eine Rechnung ausgestellt werden darf (alle Pflichtfelder, Zahlungsdaten, Beträge).
 * Liefert feldgenaue deutsche Fehlermeldungen; eine leere Liste bedeutet «gültig».
 */
export function validateForIssue(invoice: Invoice): FieldError[] {
  const errors: FieldError[] = [];

  errors.push(...validateAddress(invoice.sender, 'sender'));
  const ibanError = validateIban(invoice.sender.iban);
  if (ibanError) errors.push({ field: 'sender.iban', message: ibanError });
  errors.push(...validateDebtor(invoice.debtor, 'debtor'));

  const invoiceDateOk = isValidIsoDate(invoice.invoiceDate);
  const dueDateOk = isValidIsoDate(invoice.dueDate);
  if (!invoiceDateOk) errors.push({ field: 'invoiceDate', message: 'Das Rechnungsdatum ist ungültig.' });
  if (!dueDateOk) {
    errors.push({ field: 'dueDate', message: 'Das Fälligkeitsdatum ist ungültig.' });
  } else if (invoiceDateOk && invoice.dueDate < invoice.invoiceDate) {
    errors.push({
      field: 'dueDate',
      message: 'Das Fälligkeitsdatum darf nicht vor dem Rechnungsdatum liegen.',
    });
  }

  if (invoice.items.length === 0) {
    errors.push({ field: 'items', message: 'Mindestens eine Position ist erforderlich.' });
  }
  invoice.items.forEach((item, index) => {
    const prefix = `items.${index}`;
    if (item.description.trim() === '') {
      errors.push({ field: `${prefix}.description`, message: 'Die Beschreibung ist erforderlich.' });
    } else if ([...item.description].length > DESCRIPTION_MAX) {
      errors.push({
        field: `${prefix}.description`,
        message: `Die Beschreibung darf höchstens ${DESCRIPTION_MAX} Zeichen lang sein.`,
      });
    } else if (!isAllowedFreeText(item.description)) {
      errors.push({ field: `${prefix}.description`, message: 'Die Beschreibung enthält unzulässige Zeichen.' });
    }
    if (!Number.isSafeInteger(item.quantityMilli) || item.quantityMilli <= 0) {
      errors.push({ field: `${prefix}.quantity`, message: 'Die Menge muss grösser als 0 sein.' });
    }
    if (!Number.isSafeInteger(item.unitPriceRappen) || item.unitPriceRappen < 0) {
      errors.push({ field: `${prefix}.unitPrice`, message: 'Der Einzelpreis darf nicht negativ sein.' });
    }
  });

  if (invoice.closingText !== null) {
    if ([...invoice.closingText].length > CLOSING_TEXT_MAX) {
      errors.push({
        field: 'closingText',
        message: `Der Schlusstext darf höchstens ${CLOSING_TEXT_MAX} Zeichen lang sein.`,
      });
    } else if (!isAllowedFreeText(invoice.closingText)) {
      errors.push({ field: 'closingText', message: 'Der Schlusstext enthält unzulässige Zeichen.' });
    }
  }

  if (invoice.items.length > 0) {
    const { totalRappen } = recalculate(invoice.items);
    if (totalRappen <= 0) {
      errors.push({ field: 'total', message: 'Der Gesamtbetrag muss grösser als 0 sein.' });
    } else if (totalRappen > MAX_TOTAL_RAPPEN) {
      errors.push({ field: 'total', message: `Der Gesamtbetrag darf höchstens ${formatMax()} betragen.` });
    }
  }

  return errors;
}
