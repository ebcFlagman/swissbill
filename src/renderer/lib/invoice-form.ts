import type { Address } from '../../shared/domain/address';
import { formatIban } from '../../shared/domain/iban';
import {
  recalculate,
  validateForIssue,
  type DraftInput,
  type Invoice,
  type Sender,
} from '../../shared/domain/invoice';
import { formatChfInput, formatMilli, lineAmount, parseChf, parseMilli, type Rappen } from '../../shared/domain/money';
import type { FieldError } from '../../shared/ipc/errors';

/** Formularzustand: Zahlen bleiben als Text, damit Eingaben wie «1.» oder «» nicht verloren gehen. */
export interface ItemForm {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface InvoiceForm {
  invoiceDate: string;
  dueDate: string;
  customerId: number | null;
  sender: Sender;
  debtor: Address;
  closingText: string;
  items: ItemForm[];
}

let counter = 0;
export function newKey(): string {
  counter += 1;
  return `item-${counter}`;
}

export function emptyItem(): ItemForm {
  return { key: newKey(), description: '', quantity: '1', unitPrice: '' };
}

export function toForm(invoice: Invoice): InvoiceForm {
  return {
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    customerId: invoice.customerId,
    sender: { ...invoice.sender, iban: formatIban(invoice.sender.iban) },
    debtor: invoice.debtor,
    closingText: invoice.closingText ?? '',
    items:
      invoice.items.length > 0
        ? invoice.items.map((item) => ({
            key: newKey(),
            description: item.description,
            quantity: formatMilli(item.quantityMilli),
            unitPrice: formatChfInput(item.unitPriceRappen),
          }))
        : [emptyItem()],
  };
}

/** Wertet die Textfelder aus. Ungültige Zahlen werden als Fehler gemeldet und als 0 bzw. -1 weitergegeben. */
function parseItems(items: ItemForm[]): {
  parsed: DraftInput['items'];
  errors: FieldError[];
} {
  const errors: FieldError[] = [];
  const parsed = items.map((item, index) => {
    const quantity = parseMilli(item.quantity);
    const unitPrice = parseChf(item.unitPrice);
    if (quantity === null) {
      errors.push({
        field: `items.${index}.quantity`,
        message: 'Die Menge ist ungültig (höchstens drei Nachkommastellen).',
      });
    }
    if (unitPrice === null) {
      errors.push({
        field: `items.${index}.unitPrice`,
        message: 'Der Einzelpreis ist ungültig (höchstens zwei Nachkommastellen).',
      });
    }
    return {
      description: item.description,
      quantityMilli: quantity ?? 0,
      unitPriceRappen: unitPrice ?? 0,
    };
  });
  return { parsed, errors };
}

export function toDraftInput(id: number, form: InvoiceForm): DraftInput {
  return {
    id,
    invoiceDate: form.invoiceDate,
    dueDate: form.dueDate,
    customerId: form.customerId,
    sender: form.sender,
    debtor: form.debtor,
    closingText: form.closingText.trim() === '' ? null : form.closingText,
    items: parseItems(form.items).parsed,
  };
}

/**
 * Sofort-Feedback: dieselben Regeln wie beim Ausstellen (shared/domain), ergänzt um Zahlenformatfehler.
 * Pro Feld wird nur der erste Fehler gemeldet.
 */
export function collectErrors(form: InvoiceForm): FieldError[] {
  const { parsed, errors: parseErrors } = parseItems(form.items);
  const input = toDraftInput(0, form);
  const { items, totalRappen } = recalculate(parsed);
  const invoice: Invoice = {
    id: 0,
    status: 'draft',
    number: null,
    numberYear: null,
    numberSeq: null,
    invoiceDate: input.invoiceDate,
    dueDate: input.dueDate,
    customerId: input.customerId,
    sender: input.sender,
    debtor: input.debtor,
    closingText: input.closingText,
    referenceType: null,
    reference: null,
    totalRappen,
    layoutVersion: null,
    issuedAt: null,
    paidAt: null,
    cancelledAt: null,
    createdAt: '',
    updatedAt: '',
    items,
  };
  const seen = new Set<string>();
  const result: FieldError[] = [];
  for (const error of [...parseErrors, ...validateForIssue(invoice)]) {
    if (!seen.has(error.field)) {
      seen.add(error.field);
      result.push(error);
    }
  }
  return result;
}

/** Nur Fehler beim Lesen der Zahlenfelder (werden sofort angezeigt, die übrigen erst nach dem ersten Versuch). */
export function parseErrors(form: InvoiceForm): FieldError[] {
  return parseItems(form.items).errors;
}

/** Positionsbetrag für die Anzeige; `null`, wenn Menge oder Preis ungültig sind. */
export function itemAmount(item: ItemForm): Rappen | null {
  const quantity = parseMilli(item.quantity);
  const unitPrice = parseChf(item.unitPrice);
  if (quantity === null || unitPrice === null || quantity <= 0) return null;
  return lineAmount(quantity, unitPrice);
}

export function formTotal(form: InvoiceForm): Rappen {
  return form.items.reduce((sum, item) => sum + (itemAmount(item) ?? 0), 0);
}
