import PDFDocument from 'pdfkit';
import { SwissQRBill } from 'swissqrbill/pdf';
import { formatDateCh } from '../../shared/domain/dates';
import { LAYOUT_VERSION, CURRENCY, validateForIssue, type Invoice } from '../../shared/domain/invoice';
import { formatChf, formatMilli } from '../../shared/domain/money';
import { qrDebtor } from '../../shared/domain/qr-payload';
import { referenceTypeFor, validateReference } from '../../shared/domain/reference';
import { AppException, type FieldError } from '../../shared/ipc/errors';

/** Version of the layout; recorded in `invoices.layout_version` on issuing. */
export { LAYOUT_VERSION };

const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 56.7; // 20 mm
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const BOTTOM_LIMIT = PAGE_HEIGHT - 70;

const COLUMNS = {
  description: { x: MARGIN, width: 250 },
  quantity: { x: MARGIN + 250, width: 60 },
  unitPrice: { x: MARGIN + 310, width: 85 },
  amount: { x: MARGIN + 395, width: CONTENT_WIDTH - 395 },
};

export interface RenderOptions {
  /** Preview of a draft: "ENTWURF" watermark, no payment part */
  preview?: boolean;
}

function addressLines(a: { name: string; street: string; houseNo: string; zip: string; city: string; country: string }): string[] {
  const street = [a.street, a.houseNo].filter((p) => p !== '').join(' ');
  // Country prefix only for a specified, foreign country (the country is optional for the debtor)
  const place = `${a.country !== '' && a.country !== 'CH' ? `${a.country}-` : ''}${a.zip} ${a.city}`.trim();
  return [a.name, street, place].filter((line) => line.trim() !== '');
}

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function drawWatermark(doc: PDFKit.PDFDocument, text: string): void {
  doc.save();
  doc.rotate(-35, { origin: [PAGE_WIDTH / 2, PAGE_HEIGHT / 2] });
  doc.fillColor('#d1d5db').font('Helvetica-Bold').fontSize(110);
  doc.text(text, 0, PAGE_HEIGHT / 2 - 55, { width: PAGE_WIDTH, align: 'center', lineBreak: false });
  doc.restore();
  doc.fillColor('#000000');
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
  doc.text('Beschreibung', COLUMNS.description.x, y, { width: COLUMNS.description.width, lineBreak: false });
  doc.text('Menge', COLUMNS.quantity.x, y, { width: COLUMNS.quantity.width, align: 'right', lineBreak: false });
  doc.text('Einzelpreis', COLUMNS.unitPrice.x, y, { width: COLUMNS.unitPrice.width, align: 'right', lineBreak: false });
  doc.text(`Betrag ${CURRENCY}`, COLUMNS.amount.x, y, { width: COLUMNS.amount.width, align: 'right', lineBreak: false });
  const lineY = y + 14;
  doc.moveTo(MARGIN, lineY).lineTo(MARGIN + CONTENT_WIDTH, lineY).lineWidth(0.5).stroke('#000000');
  return lineY + 6;
}

function drawBody(doc: PDFKit.PDFDocument, invoice: Invoice, preview: boolean): number {
  // Sender top left
  const sender = addressLines(invoice.sender);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000');
  doc.text(sender[0] ?? '', MARGIN, MARGIN, { lineBreak: false });
  doc.font('Helvetica').fontSize(9);
  sender.slice(1).forEach((line, i) => doc.text(line, MARGIN, MARGIN + 18 + i * 12, { lineBreak: false }));

  // Debtor on the right (window position)
  const debtor = addressLines(invoice.debtor);
  doc.font('Helvetica').fontSize(10);
  debtor.forEach((line, i) => doc.text(line, 340, 150 + i * 13, { lineBreak: false }));

  // Title and key data
  const title = invoice.number ? `Rechnung ${invoice.number}` : 'Rechnung (Entwurf)';
  doc.font('Helvetica-Bold').fontSize(16).text(title, MARGIN, 270, { lineBreak: false });
  doc.font('Helvetica').fontSize(10);
  doc.text(`Rechnungsdatum: ${formatDateCh(invoice.invoiceDate)}`, MARGIN, 298, { lineBreak: false });
  doc.text(`Zahlbar bis: ${formatDateCh(invoice.dueDate)}`, MARGIN, 312, { lineBreak: false });
  if (preview) {
    // nothing more: drafts have no number yet
  }

  // Items
  let y = drawTableHeader(doc, 350);
  doc.font('Helvetica').fontSize(9);
  for (const item of invoice.items) {
    const descriptionHeight = doc.heightOfString(item.description, { width: COLUMNS.description.width });
    const rowHeight = Math.max(descriptionHeight, 11) + 6;
    if (y + rowHeight > BOTTOM_LIMIT) {
      doc.addPage();
      y = drawTableHeader(doc, MARGIN);
      doc.font('Helvetica').fontSize(9);
    }
    doc.text(item.description, COLUMNS.description.x, y, { width: COLUMNS.description.width });
    doc.text(formatMilli(item.quantityMilli), COLUMNS.quantity.x, y, { width: COLUMNS.quantity.width, align: 'right', lineBreak: false });
    doc.text(formatChf(item.unitPriceRappen), COLUMNS.unitPrice.x, y, { width: COLUMNS.unitPrice.width, align: 'right', lineBreak: false });
    doc.text(formatChf(item.amountRappen), COLUMNS.amount.x, y, { width: COLUMNS.amount.width, align: 'right', lineBreak: false });
    y += rowHeight;
  }

  // Total
  if (y + 40 > BOTTOM_LIMIT) {
    doc.addPage();
    y = MARGIN;
  }
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(0.5).stroke('#000000');
  y += 6;
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text(`Total ${CURRENCY}`, COLUMNS.unitPrice.x - 40, y, { width: 125, align: 'right', lineBreak: false });
  doc.text(formatChf(invoice.totalRappen), COLUMNS.amount.x, y, { width: COLUMNS.amount.width, align: 'right', lineBreak: false });
  y += 28;

  // Closing text
  if (invoice.closingText && invoice.closingText.trim() !== '') {
    doc.font('Helvetica').fontSize(9);
    const height = doc.heightOfString(invoice.closingText, { width: CONTENT_WIDTH });
    if (y + height > BOTTOM_LIMIT) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(invoice.closingText, MARGIN, y, { width: CONTENT_WIDTH });
    y += height + 10;
  }
  return y;
}

function validateIssued(invoice: Invoice): FieldError[] {
  const errors = validateForIssue(invoice);
  if (invoice.number === null) errors.push({ field: 'number', message: 'Die Rechnung hat keine Nummer.' });
  if (invoice.referenceType === null || invoice.reference === null) {
    errors.push({ field: 'reference', message: 'Die Zahlungsreferenz fehlt.' });
  } else {
    const referenceError = validateReference(invoice.referenceType, invoice.reference);
    if (referenceError) errors.push({ field: 'reference', message: referenceError });
    if (referenceTypeFor(invoice.sender.iban) !== invoice.referenceType) {
      errors.push({
        field: 'reference',
        message: 'Der Referenztyp passt nicht zur IBAN (QR-IBAN verlangt eine QR-Referenz).',
      });
    }
  }
  return errors;
}

/**
 * Creates the A4 PDF of an invoice from its stored snapshot: invoice content and
 * Swiss QR payment part at the bottom of the last page. Invalid payment data produces no PDF.
 * Drafts can only be output as a preview (watermark, without payment part).
 */
export async function renderInvoicePdf(invoice: Invoice, options: RenderOptions = {}): Promise<Buffer> {
  const isDraft = invoice.status === 'draft';
  if (isDraft && !options.preview) {
    throw new AppException(
      'VALIDATION',
      'Für einen Entwurf ist nur eine Vorschau möglich. Bitte die Rechnung zuerst ausstellen.',
    );
  }
  if (!isDraft) {
    const errors = validateIssued(invoice);
    if (errors.length > 0) {
      throw new AppException('VALIDATION', 'Das PDF kann nicht erzeugt werden: Zahlungsdaten ungültig.', errors);
    }
  }

  const created = invoice.issuedAt ? new Date(invoice.issuedAt) : new Date();
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: 0, left: MARGIN, right: MARGIN },
    info: {
      Title: invoice.number ? `Rechnung ${invoice.number}` : 'Rechnung (Entwurf)',
      Author: invoice.sender.name,
      Creator: 'SwissBill',
      CreationDate: created,
    },
  });
  const done = collect(doc);

  // Drafts and cancelled invoices carry a watermark and have no (scannable) payment part.
  const watermark = isDraft ? 'ENTWURF' : invoice.status === 'cancelled' ? 'STORNIERT' : null;
  if (watermark) {
    drawWatermark(doc, watermark);
    doc.on('pageAdded', () => drawWatermark(doc, watermark));
  }

  const endY = drawBody(doc, invoice, isDraft);

  if (!watermark) {
    // The payment part sits at the foot of the last page; if there is not enough room, a new A4 page follows.
    const billTop = PAGE_HEIGHT - SwissQRBill.height;
    if (endY > billTop - 12) doc.addPage();
    attachPaymentPart(doc, invoice, billTop);
  }

  doc.end();
  return done;
}

function attachPaymentPart(doc: PDFKit.PDFDocument, invoice: Invoice, billTop: number): void {
  const debtor = qrDebtor(invoice.debtor);
  try {
    const qrBill = new SwissQRBill(
      {
        currency: CURRENCY,
        amount: invoice.totalRappen / 100,
        creditor: {
          account: invoice.sender.iban,
          name: invoice.sender.name,
          address: invoice.sender.street,
          buildingNumber: invoice.sender.houseNo,
          zip: invoice.sender.zip,
          city: invoice.sender.city,
          country: invoice.sender.country,
        },
        // Without postal code and city the debtor is omitted from the QR payment part (allowed by the standard)
        ...(debtor
          ? {
              debtor: {
                name: debtor.name,
                address: debtor.street,
                buildingNumber: debtor.houseNo,
                zip: debtor.zip,
                city: debtor.city,
                country: debtor.country,
              },
            }
          : {}),
        reference: invoice.reference ?? '',
        message: `Rechnung ${invoice.number ?? ''}`.trim(),
      },
      { language: 'DE' },
    );
    qrBill.attachTo(doc, 0, billTop);
  } catch (error) {
    if (error instanceof Error && error.name === 'ValidationError') {
      throw new AppException('VALIDATION', `Der Zahlteil kann nicht erzeugt werden: ${error.message}`);
    }
    throw error;
  }
}
