import type { Address } from './address';
import { normalizeIban } from './iban';
import { CURRENCY, type Invoice } from './invoice';
import type { Rappen } from './money';

export type QrReferenceType = 'QRR' | 'SCOR' | 'NON';

export interface QrPayloadData {
  iban: string;
  creditor: Address;
  amountRappen: Rappen;
  /** If the debtor is missing, its 7 lines stay empty (allowed by the standard). */
  debtor?: Address | undefined;
  referenceType: QrReferenceType;
  reference: string;
  /** Unstructured message */
  message?: string | undefined;
  /** Billing information */
  billingInfo?: string | undefined;
}

function addressLines(address: Address): string[] {
  // Address type S = structured address
  return ['S', address.name, address.street, address.houseNo, address.zip, address.city, address.country];
}

function formatAmount(rappen: Rappen): string {
  return `${Math.floor(rappen / 100)}.${String(rappen % 100).padStart(2, '0')}`;
}

/**
 * Builds the QR code content according to the Swiss Implementation Guidelines for the QR-bill (version 2.0):
 * header, creditor IBAN and address, empty ultimate creditor (7 lines), amount, currency,
 * debtor, reference, message, trailer `EPD` and billing information. Lines are separated by LF.
 */
export function buildQrPayload(data: QrPayloadData): string {
  const lines = [
    'SPC',
    '0200',
    '1',
    normalizeIban(data.iban),
    ...addressLines(data.creditor),
    ...Array<string>(7).fill(''),
    formatAmount(data.amountRappen),
    CURRENCY,
    ...(data.debtor ? addressLines(data.debtor) : Array<string>(7).fill('')),
    data.referenceType,
    data.reference.replace(/\s+/g, ''),
    data.message ?? '',
    'EPD',
    // Billing information is optional and omitted together with its line if empty.
    ...(data.billingInfo ? [data.billingInfo] : []),
  ];
  return lines.join('\n');
}

/**
 * The debtor in the QR code: the standard requires name, postal code, city and country for an address.
 * If name, postal code or city are missing, the debtor is omitted from the QR code (result undefined); a missing country counts as CH.
 */
export function qrDebtor(debtor: Address): Address | undefined {
  if (debtor.name.trim() === '' || debtor.zip.trim() === '' || debtor.city.trim() === '') return undefined;
  return { ...debtor, country: debtor.country === '' ? 'CH' : debtor.country };
}

/** QR content of an issued invoice. */
export function qrPayloadFromInvoice(invoice: Invoice): string {
  if (invoice.referenceType === null || invoice.reference === null || invoice.number === null) {
    throw new Error('Die Rechnung ist noch nicht ausgestellt.');
  }
  return buildQrPayload({
    iban: invoice.sender.iban,
    creditor: invoice.sender,
    amountRappen: invoice.totalRappen,
    debtor: qrDebtor(invoice.debtor),
    referenceType: invoice.referenceType,
    reference: invoice.reference,
    message: `Rechnung ${invoice.number}`,
  });
}
