import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildQrPayload, qrDebtor, type QrPayloadData } from '@shared/domain/qr-payload';

// Beispiel nach den Swiss Implementation Guidelines for the QR-bill (SIX). Die Fixture wurde nach dem
// SIX-Beispiel nachgebaut und ist beim Abnahmetest (SIX-Validator) gegen das Original zu prüfen.
const fixture = readFileSync(resolve(__dirname, '../fixtures/six-example-payload.txt'), 'utf8').replace(
  /\r?\n$/,
  '',
);

const sixExample: QrPayloadData = {
  iban: 'CH4431999123000889012',
  creditor: {
    name: 'Robert Schneider AG',
    street: 'Rue du Lac',
    houseNo: '1268',
    zip: '2501',
    city: 'Biel',
    country: 'CH',
  },
  amountRappen: 194975,
  debtor: {
    name: 'Pia-Maria Rutschmann-Schnyder',
    street: 'Grosse Marktgasse',
    houseNo: '28',
    zip: '9400',
    city: 'Rorschach',
    country: 'CH',
  },
  referenceType: 'QRR',
  reference: '210000000003139471430009017',
  message: 'Order of 15 June 2020',
  billingInfo: '//S1/10/10201409/11/200701/20/140.000-53/30/102673386/31/200701/32/7.7/40/2:10;0:30',
};

describe('buildQrPayload', () => {
  it('stimmt Zeichen für Zeichen mit dem SIX-Beispiel überein', () => {
    expect(buildQrPayload(sixExample)).toBe(fixture);
  });

  it('beginnt mit Header SPC, Version 0200, Coding 1 und der IBAN ohne Leerzeichen', () => {
    const lines = buildQrPayload({ ...sixExample, iban: 'CH44 3199 9123 0008 8901 2' }).split('\n');
    expect(lines.slice(0, 5)).toEqual(['SPC', '0200', '1', 'CH4431999123000889012', 'S']);
  });

  it('hat die vorgeschriebene Anzahl Zeilen mit leerem Ultimate Creditor (7 Zeilen)', () => {
    const lines = buildQrPayload(sixExample).split('\n');
    expect(lines.slice(11, 18)).toEqual(['', '', '', '', '', '', '']);
    expect(lines[18]).toBe('1949.75');
    expect(lines[19]).toBe('CHF');
    expect(lines[20]).toBe('S');
    expect(lines[27]).toBe('QRR');
    expect(lines[30]).toBe('EPD');
  });

  it('formatiert den Betrag mit Punkt, zwei Nachkommastellen und ohne Tausendertrenner', () => {
    const amount = (amountRappen: number) =>
      buildQrPayload({ ...sixExample, amountRappen }).split('\n')[18];
    expect(amount(5)).toBe('0.05');
    expect(amount(123450)).toBe('1234.50');
    expect(amount(100000000)).toBe('1000000.00');
  });

  it('unterstützt SCOR und lässt optionale Felder leer', () => {
    const payload = buildQrPayload({
      ...sixExample,
      referenceType: 'SCOR',
      reference: 'RF3120260001',
      message: undefined,
      billingInfo: undefined,
    });
    const lines = payload.split('\n');
    expect(lines[27]).toBe('SCOR');
    expect(lines[28]).toBe('RF3120260001');
    expect(lines[29]).toBe('');
    expect(lines[30]).toBe('EPD');
    // Ohne Rechnungsinformationen endet der Payload mit dem Trailer EPD.
    expect(lines).toHaveLength(31);
  });

  it('verwendet NON mit leerer Referenz, wenn keine Referenz angegeben ist', () => {
    const lines = buildQrPayload({ ...sixExample, referenceType: 'NON', reference: '' }).split('\n');
    expect(lines[27]).toBe('NON');
    expect(lines[28]).toBe('');
  });

  it('ohne Zahlungspflichtigen bleiben dessen 7 Zeilen leer (der Standard erlaubt das)', () => {
    const lines = buildQrPayload({ ...sixExample, debtor: undefined }).split('\n');
    expect(lines.slice(20, 27)).toEqual(['', '', '', '', '', '', '']);
    expect(lines[27]).toBe('QRR');
    expect(lines).toHaveLength(32);
  });

  it('lässt Strasse und Hausnummer leer, wenn sie fehlen', () => {
    const payload = buildQrPayload({
      ...sixExample,
      debtor: { ...sixExample.debtor!, street: '', houseNo: '' },
    });
    const lines = payload.split('\n');
    expect(lines.slice(20, 27)).toEqual(['S', 'Pia-Maria Rutschmann-Schnyder', '', '', '9400', 'Rorschach', 'CH']);
  });
});

describe('qrDebtor (wann steht der Zahlungspflichtige im QR-Code?)', () => {
  const full = { name: 'Pia Muster', street: 'Weg', houseNo: '1', zip: '9400', city: 'Rorschach', country: 'CH' };

  it('übernimmt einen vollständigen Empfänger', () => {
    expect(qrDebtor(full)).toEqual(full);
  });

  it('der Standard verlangt bei einer Adresse PLZ und Ort: sonst entfällt der Empfänger im QR-Code', () => {
    expect(qrDebtor({ ...full, zip: '' })).toBeUndefined();
    expect(qrDebtor({ ...full, city: '' })).toBeUndefined();
    expect(qrDebtor({ ...full, name: '' })).toBeUndefined();
    expect(qrDebtor({ name: 'Pia Muster', street: '', houseNo: '', zip: '', city: '', country: '' })).toBeUndefined();
  });

  it('Strasse und Nr. sind optional; ein fehlendes Land wird zu CH', () => {
    expect(qrDebtor({ ...full, street: '', houseNo: '', country: '' })).toEqual({
      name: 'Pia Muster',
      street: '',
      houseNo: '',
      zip: '9400',
      city: 'Rorschach',
      country: 'CH',
    });
  });
});
