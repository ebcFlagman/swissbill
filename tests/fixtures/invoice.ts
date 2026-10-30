import { LAYOUT_VERSION, type Invoice, type DraftInput, type InvoiceItem } from '@shared/domain/invoice';
import { lineAmount } from '@shared/domain/money';
import { buildCreditorReference, buildQrReference } from '@shared/domain/reference';

/** Nur fiktive Daten (Constitution). Die QR-IBAN stammt aus den SIX-Beispielen. */
export const QR_IBAN = 'CH4431999123000889012';
export const NORMAL_IBAN = 'CH9300762011623852957';

export function makeItem(
  description = 'Beratung',
  quantityMilli = 1000,
  unitPriceRappen = 15000,
): InvoiceItem {
  return {
    description,
    quantityMilli,
    unitPriceRappen,
    amountRappen: lineAmount(quantityMilli, unitPriceRappen),
  };
}

export function makeDraftInput(overrides: Partial<DraftInput> = {}): DraftInput {
  return {
    id: 1,
    invoiceDate: '2026-03-01',
    dueDate: '2026-03-31',
    customerId: null,
    sender: {
      name: 'Robert Schneider AG',
      street: 'Rue du Lac',
      houseNo: '1268',
      zip: '2501',
      city: 'Biel',
      country: 'CH',
      iban: QR_IBAN,
    },
    debtor: {
      name: 'Pia-Maria Rutschmann-Schnyder',
      street: 'Grosse Marktgasse',
      houseNo: '28',
      zip: '9400',
      city: 'Rorschach',
      country: 'CH',
    },
    closingText: 'Zahlbar innert 30 Tagen.',
    items: [
      { description: 'Beratung', quantityMilli: 2000, unitPriceRappen: 15000 },
      { description: 'Spesen', quantityMilli: 1000, unitPriceRappen: 4975 },
    ],
    ...overrides,
  };
}

/** Eine ausgestellte Rechnung (Momentaufnahme), ohne Datenbank. */
export function makeIssuedInvoice(overrides: Partial<Invoice> = {}): Invoice {
  const base = makeInvoice();
  const qr = (overrides.sender ?? base.sender).iban === QR_IBAN;
  return makeInvoice({
    status: 'issued',
    number: 'RE-2026-0001',
    numberYear: 2026,
    numberSeq: 1,
    referenceType: qr ? 'QRR' : 'SCOR',
    reference: qr ? buildQrReference(2026, 1) : buildCreditorReference(2026, 1),
    issuedAt: '2026-03-01T09:00:00.000Z',
    layoutVersion: LAYOUT_VERSION,
    ...overrides,
  });
}

/** Eine vollständige, gültige Rechnung (Entwurf). */
export function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  const input = makeDraftInput();
  const items = input.items.map((i) => makeItem(i.description, i.quantityMilli, i.unitPriceRappen));
  return {
    id: input.id,
    status: 'draft',
    number: null,
    numberYear: null,
    numberSeq: null,
    invoiceDate: input.invoiceDate,
    dueDate: input.dueDate,
    customerId: null,
    sender: input.sender,
    debtor: input.debtor,
    closingText: input.closingText,
    referenceType: null,
    reference: null,
    totalRappen: items.reduce((sum, i) => sum + i.amountRappen, 0),
    layoutVersion: null,
    issuedAt: null,
    paidAt: null,
    cancelledAt: null,
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
    items,
    ...overrides,
  };
}
