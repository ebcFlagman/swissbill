import { afterEach, describe, expect, it } from 'vitest';
import { qrPayloadFromInvoice } from '@shared/domain/qr-payload';
import { renderInvoicePdf } from '../../src/main/services/pdf-service';
import { createFilledDraft, createService, createTestDb } from '../fixtures/db';
import { inspectPdf, type InspectedPdf } from '../fixtures/pdf-inspect';
import { makeDraftInput } from '../fixtures/invoice';

const nameOnly = { name: 'Pia Muster', street: '', houseNo: '', zip: '', city: '', country: '' };
const noStreet = { name: 'Pia Muster', street: '', houseNo: '', zip: '9400', city: 'Rorschach', country: '' };

let open: InspectedPdf[] = [];
afterEach(async () => {
  await Promise.all(open.map((p) => p.destroy()));
  open = [];
});
const inspect = async (buffer: Buffer) => {
  const pdf = await inspectPdf(buffer);
  open.push(pdf);
  return pdf;
};
const normalize = (text: string) => text.replace(/\r\n/g, '\n');

describe('Rechnungsempfänger: nur der Name ist Pflicht', () => {
  it('eine Rechnung nur mit Empfängername lässt sich speichern, ausstellen und neu laden', () => {
    const { service } = createService(createTestDb());
    const draft = createFilledDraft(service, { debtor: nameOnly });
    expect(service.get(draft.id).debtor).toEqual(nameOnly); // leeres Land bleibt leer (nicht CH)

    const issued = service.issue(draft.id);
    expect(issued.status).toBe('issued');
    expect(issued.debtor).toEqual(nameOnly);
    expect(service.get(issued.id)).toEqual(issued);
  });

  it('ohne Empfängername lässt sich nicht ausstellen', () => {
    const { service } = createService(createTestDb());
    const draft = createFilledDraft(service, { debtor: { ...nameOnly, name: '' } });
    expect(() => service.issue(draft.id)).toThrowError(/nicht ausgestellt/);
  });

  it('das Duplizieren übernimmt einen Empfänger ohne Adresse unverändert', () => {
    const { service } = createService(createTestDb());
    const issued = service.issue(createFilledDraft(service, { debtor: nameOnly }).id);
    expect(service.duplicate(issued.id).debtor).toEqual(nameOnly);
  });

  it('das PDF zeigt den Namen und lässt den Zahlungspflichtigen im QR-Code weg (PLZ und Ort fehlen)', async () => {
    const { service } = createService(createTestDb());
    const issued = service.issue(createFilledDraft(service, { debtor: nameOnly }).id);

    const pdf = await inspect(await renderInvoicePdf(issued));
    expect(pdf.texts[0]).toContain('Pia Muster');

    const decoded = normalize((await pdf.decodeQr(1)) as string);
    expect(decoded).toBe(qrPayloadFromInvoice(issued));
    const lines = decoded.split('\n');
    expect(lines.slice(20, 27)).toEqual(['', '', '', '', '', '', '']); // kein Zahlungspflichtiger
    expect(lines[19]).toBe('CHF');
  });

  it('mit PLZ und Ort (ohne Strasse und Land) steht der Empfänger im QR-Code, das Land wird CH', async () => {
    const { service } = createService(createTestDb());
    const issued = service.issue(createFilledDraft(service, { debtor: noStreet }).id);

    const pdf = await inspect(await renderInvoicePdf(issued));
    const lines = normalize((await pdf.decodeQr(1)) as string).split('\n');
    expect(lines.slice(20, 27)).toEqual(['S', 'Pia Muster', '', '', '9400', 'Rorschach', 'CH']);
    // Auf der Rechnung selbst erscheint kein «-9400» (kein Länderpräfix ohne Land)
    expect(pdf.texts[0]).not.toMatch(/-\s*9400/);
  });

  it('der volle Empfänger bleibt unverändert im QR-Code', async () => {
    const { service } = createService(createTestDb());
    const issued = service.issue(createFilledDraft(service, makeDraftInput()).id);
    const pdf = await inspect(await renderInvoicePdf(issued));
    const lines = normalize((await pdf.decodeQr(1)) as string).split('\n');
    expect(lines[21]).toBe('Pia-Maria Rutschmann-Schnyder');
    expect(lines[22]).toBe('Grosse Marktgasse');
  });
});
