import { afterEach, describe, expect, it } from 'vitest';
import { AppException } from '@shared/ipc/errors';
import { qrPayloadFromInvoice } from '@shared/domain/qr-payload';
import { renderInvoicePdf } from '../../src/main/services/pdf-service';
import { inspectPdf, type InspectedPdf } from '../fixtures/pdf-inspect';
import { makeInvoice, makeIssuedInvoice, makeItem, NORMAL_IBAN } from '../fixtures/invoice';

const A4 = { width: 595.28, height: 841.89 };
let open: InspectedPdf[] = [];

async function inspect(buffer: Buffer) {
  const pdf = await inspectPdf(buffer);
  open.push(pdf);
  return pdf;
}

afterEach(async () => {
  await Promise.all(open.map((p) => p.destroy()));
  open = [];
});

const normalize = (text: string) => text.replace(/\r\n/g, '\n');

describe('PDF mit Zahlteil', () => {
  it('erzeugt ein A4-PDF mit Rechnungsinhalt und Zahlteil', async () => {
    const invoice = makeIssuedInvoice();
    const pdf = await inspect(await renderInvoicePdf(invoice));

    expect(pdf.numPages).toBe(1);
    expect(pdf.pageSizes[0]).toEqual(A4);
    const text = pdf.texts[0] ?? '';
    for (const expected of [
      'RE-2026-0001',
      'Robert Schneider AG',
      'Pia-Maria Rutschmann-Schnyder',
      'Beratung',
      'Zahlbar innert 30 Tagen.',
      'Empfangsschein',
      'Zahlteil',
      'CHF',
    ]) {
      expect(text, expected).toContain(expected);
    }
    // Total 349.75 (2 x 150.00 + 49.75) steht auf der Rechnung und im Zahlteil
    expect(text).toContain("349.75");
  });

  it('der QR-Code enthält genau den Payload der Rechnung (Betrag, CHF, Gläubiger, Schuldner, Referenz)', async () => {
    const invoice = makeIssuedInvoice();
    const pdf = await inspect(await renderInvoicePdf(invoice));
    const decoded = await pdf.decodeQr(1);
    expect(decoded).not.toBeNull();
    expect(normalize(decoded as string)).toBe(qrPayloadFromInvoice(invoice));

    const lines = normalize(decoded as string).split('\n');
    expect(lines[18]).toBe('349.75');
    expect(lines[19]).toBe('CHF');
    expect(lines[27]).toBe('QRR');
    expect(lines[28]).toBe(invoice.reference);
  });

  it('unterstützt SCOR bei normaler IBAN', async () => {
    const base = makeIssuedInvoice();
    const invoice = makeIssuedInvoice({ sender: { ...base.sender, iban: NORMAL_IBAN } });
    expect(invoice.referenceType).toBe('SCOR');
    const pdf = await inspect(await renderInvoicePdf(invoice));
    const decoded = normalize((await pdf.decodeQr(1)) as string);
    expect(decoded).toBe(qrPayloadFromInvoice(invoice));
    expect(decoded.split('\n')[27]).toBe('SCOR');
  });

  it('60 Positionen laufen auf eine Folgeseite, der Zahlteil steht auf der letzten Seite', async () => {
    const items = Array.from({ length: 60 }, (_, i) => makeItem(`Position ${i + 1}`, 1000, 1000));
    const invoice = makeIssuedInvoice({ items, totalRappen: 60 * 1000 });
    const pdf = await inspect(await renderInvoicePdf(invoice));

    expect(pdf.numPages).toBeGreaterThanOrEqual(2);
    const last = pdf.numPages;
    expect(pdf.texts[last - 1]).toContain('Zahlteil');
    for (let n = 0; n < last - 1; n++) {
      expect(pdf.texts[n]).not.toContain('Zahlteil');
    }
    const decoded = await pdf.decodeQr(last);
    expect(normalize(decoded as string)).toBe(qrPayloadFromInvoice(invoice));
  });

  it('erzeugt aus derselben Momentaufnahme ein inhaltlich identisches PDF', async () => {
    const invoice = makeIssuedInvoice();
    const first = await inspect(await renderInvoicePdf(invoice));
    const second = await inspect(await renderInvoicePdf(invoice));
    expect(second.texts).toEqual(first.texts);
    expect(second.pageSizes).toEqual(first.pageSizes);
    expect(await second.decodeQr(1)).toBe(await first.decodeQr(1));
  });

  it('erzeugt bei ungültigen Zahlungsdaten kein PDF', async () => {
    const base = makeIssuedInvoice();
    const badIban = makeIssuedInvoice({ sender: { ...base.sender, iban: 'CH9300762011623852958' } });
    await expect(renderInvoicePdf(badIban)).rejects.toBeInstanceOf(AppException);

    const badReference = makeIssuedInvoice({ reference: '210000000003139471430009018' });
    await expect(renderInvoicePdf(badReference)).rejects.toMatchObject({
      error: { code: 'VALIDATION' },
    });

    const noDebtor = makeIssuedInvoice({ debtor: { ...base.debtor, name: '' } });
    await expect(renderInvoicePdf(noDebtor)).rejects.toMatchObject({ error: { code: 'VALIDATION' } });
  });

  it('verweigert das PDF für Entwürfe, ausser als Vorschau', async () => {
    await expect(renderInvoicePdf(makeInvoice())).rejects.toMatchObject({ error: { code: 'VALIDATION' } });
  });

  it('die Entwurf-Vorschau trägt ein ENTWURF-Wasserzeichen und hat keinen gültigen Zahlteil', async () => {
    const pdf = await inspect(await renderInvoicePdf(makeInvoice(), { preview: true }));
    const text = pdf.texts.join(' ');
    expect(text).toContain('ENTWURF');
    expect(text).not.toContain('Zahlteil');
    expect(text).not.toContain('Empfangsschein');
    expect(await pdf.decodeQr(1)).toBeNull();
  });

  it('eine stornierte Rechnung trägt das Wasserzeichen STORNIERT und hat keinen scannbaren Zahlteil', async () => {
    const invoice = makeIssuedInvoice({ status: 'cancelled', cancelledAt: '2026-03-10T08:00:00.000Z' });
    const pdf = await inspect(await renderInvoicePdf(invoice));
    const text = pdf.texts.join(' ');
    // pdf.js trennt das gedrehte Wasserzeichen teils durch Leerzeichen («STORNIER T»)
    expect(text.replace(/\s+/g, '')).toContain('STORNIERT');
    expect(text).toContain('RE-2026-0001');
    expect(text).not.toContain('Zahlteil');
    expect(await pdf.decodeQr(1)).toBeNull();
  });
});
