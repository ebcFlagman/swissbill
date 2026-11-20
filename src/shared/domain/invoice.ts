import type { FieldError } from '../ipc/errors';
import { isAllowedText, validateAddress, validateDebtor, type Address } from './address';
import { normalizeIban, validateIban } from './iban';
import { lineAmount, sumAmounts, type Milli, type Rappen } from './money';
import type { ReferenceType } from './reference';

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'cancelled';

/** The currency is fixed CHF (constitution). */
export const CURRENCY = 'CHF';

/** Maximum amount according to the Swiss QR standard: 999'999'999.99 */
export const MAX_TOTAL_RAPPEN: Rappen = 99_999_999_999;

/** Version of the PDF layout; recorded on issuing. */
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
  /** `null` while draft */
  number: string | null;
  numberYear: number | null;
  numberSeq: number | null;
  /** `YYYY-MM-DD` */
  invoiceDate: string;
  dueDate: string;
  customerId: number | null;
  /** Snapshot; for drafts prefilled from the settings and overridable */
  sender: Sender;
  /** Snapshot; copied from the customer */
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

/** Row of the invoice list. */
export interface InvoiceSummary {
  id: number;
  /** `null` while draft */
  number: string | null;
  status: InvoiceStatus;
  invoiceDate: string;
  dueDate: string;
  debtorName: string;
  totalRappen: Rappen;
}

export interface InvoiceFilter {
  /** Searches case-insensitively in invoice number and customer name */
  search?: string | undefined;
  /** Empty or missing: all statuses */
  status?: InvoiceStatus[] | undefined;
}

/** Input for saving a draft; amounts are calculated server-side. */
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

/** Calculates item amounts and the total. Invalid items count as 0 (they are reported separately). */
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

/** Free text: Latin character set, line break and euro sign are allowed. */
function isAllowedFreeText(value: string): boolean {
  return isAllowedText(value.replace(/[\n€]/g, ''));
}

function formatMax(): string {
  return "999'999'999.99";
}

/**
 * Checks a draft on saving: lengths, character set, date format and quantities must be correct,
 * but incomplete required fields are still allowed (the binding check follows on issuing).
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
 * Checks whether an invoice may be issued (all required fields, payment data, amounts).
 * Returns field-specific German error messages; an empty list means "valid".
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
