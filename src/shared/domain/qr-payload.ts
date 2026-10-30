import type { Address } from './address';
import { normalizeIban } from './iban';
import { CURRENCY, type Invoice } from './invoice';
import type { Rappen } from './money';

export type QrReferenceType = 'QRR' | 'SCOR' | 'NON';

export interface QrPayloadData {
  iban: string;
  creditor: Address;
  amountRappen: Rappen;
  /** Fehlt der Zahlungspflichtige, bleiben seine 7 Zeilen leer (vom Standard erlaubt). */
  debtor?: Address | undefined;
  referenceType: QrReferenceType;
  reference: string;
  /** Unstrukturierte Mitteilung */
  message?: string | undefined;
  /** Rechnungsinformationen (Billing Information) */
  billingInfo?: string | undefined;
}

function addressLines(address: Address): string[] {
  // Adresstyp S = strukturierte Adresse
  return ['S', address.name, address.street, address.houseNo, address.zip, address.city, address.country];
}

function formatAmount(rappen: Rappen): string {
  return `${Math.floor(rappen / 100)}.${String(rappen % 100).padStart(2, '0')}`;
}

/**
 * Baut den QR-Code-Inhalt nach den Swiss Implementation Guidelines for the QR-bill (Version 2.0):
 * Header, Gläubiger-IBAN und -Adresse, leerer Ultimate Creditor (7 Zeilen), Betrag, Währung,
 * Zahlungspflichtiger, Referenz, Mitteilung, Trailer `EPD` und Rechnungsinformationen. Zeilen sind durch LF getrennt.
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
    // Rechnungsinformationen sind optional und entfallen samt Zeile, wenn leer.
    ...(data.billingInfo ? [data.billingInfo] : []),
  ];
  return lines.join('\n');
}

/**
 * Der Zahlungspflichtige im QR-Code: Der Standard verlangt bei einer Adresse Name, PLZ, Ort und Land.
 * Fehlen Name, PLZ oder Ort, entfällt der Empfänger im QR-Code (Ergebnis undefined); ein fehlendes Land gilt als CH.
 */
export function qrDebtor(debtor: Address): Address | undefined {
  if (debtor.name.trim() === '' || debtor.zip.trim() === '' || debtor.city.trim() === '') return undefined;
  return { ...debtor, country: debtor.country === '' ? 'CH' : debtor.country };
}

/** QR-Inhalt einer ausgestellten Rechnung. */
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
