import { describe, expect, it } from 'vitest';
import { validateAddress, validateDebtor, type Address } from '@shared/domain/address';

const valid: Address = {
  name: 'Muster AG',
  street: 'Musterstrasse',
  houseNo: '7',
  zip: '8000',
  city: 'Zürich',
  country: 'CH',
};

function fieldsOf(address: Partial<Address>, prefix = 'debtor') {
  return validateAddress({ ...valid, ...address }, prefix).map((e) => e.field);
}

describe('validateAddress', () => {
  it('akzeptiert eine gültige Adresse', () => {
    expect(validateAddress(valid, 'debtor')).toEqual([]);
  });

  it('akzeptiert Strasse und Hausnummer leer (optional)', () => {
    expect(validateAddress({ ...valid, street: '', houseNo: '' }, 'debtor')).toEqual([]);
  });

  it('verlangt Name, PLZ und Ort', () => {
    const errors = validateAddress({ ...valid, name: '', zip: '', city: '' }, 'sender');
    expect(errors.map((e) => e.field).sort()).toEqual(['sender.city', 'sender.name', 'sender.zip']);
    expect(errors.every((e) => e.message.length > 0)).toBe(true);
  });

  it('prüft die Grenzen: Name 70, Strasse 70, Hausnummer 16, PLZ 16, Ort 35', () => {
    expect(fieldsOf({ name: 'a'.repeat(70) })).toEqual([]);
    expect(fieldsOf({ name: 'a'.repeat(71) })).toEqual(['debtor.name']);
    expect(fieldsOf({ street: 'a'.repeat(71) })).toEqual(['debtor.street']);
    expect(fieldsOf({ houseNo: '1'.repeat(17) })).toEqual(['debtor.houseNo']);
    expect(fieldsOf({ zip: '1'.repeat(17) })).toEqual(['debtor.zip']);
    expect(fieldsOf({ city: 'a'.repeat(36) })).toEqual(['debtor.city']);
    expect(fieldsOf({ city: 'a'.repeat(35) })).toEqual([]);
  });

  it('verlangt einen zweistelligen Ländercode (Standard CH)', () => {
    expect(fieldsOf({ country: 'CHE' })).toEqual(['debtor.country']);
    expect(fieldsOf({ country: 'ch' })).toEqual(['debtor.country']);
    expect(fieldsOf({ country: 'LI' })).toEqual([]);
    expect(fieldsOf({ country: 'DE' })).toEqual([]);
  });

  it('erlaubt Umlaute und Akzente, lehnt Steuerzeichen und fremde Schriften ab', () => {
    expect(fieldsOf({ name: 'Müller & Söhne - Café Zürich' })).toEqual([]);
    expect(fieldsOf({ name: 'Muster\nAG' })).toEqual(['debtor.name']);
    expect(fieldsOf({ name: 'Muster\tAG' })).toEqual(['debtor.name']);
    expect(fieldsOf({ name: '山田太郎' })).toEqual(['debtor.name']);
    expect(fieldsOf({ city: 'Zürich 😀' })).toEqual(['debtor.city']);
  });

  it('meldet Fehler auf Deutsch, feldgenau und mit dem Präfix', () => {
    const [error] = validateAddress({ ...valid, name: 'a'.repeat(71) }, 'sender');
    expect(error?.field).toBe('sender.name');
    expect(error?.message).toMatch(/70/);
  });
});

describe('validateDebtor (Rechnungsempfänger: nur der Name ist Pflicht)', () => {
  const nameOnly: Address = { name: 'Pia Muster', street: '', houseNo: '', zip: '', city: '', country: '' };
  const fields = (address: Partial<Address>) =>
    validateDebtor({ ...nameOnly, ...address }, 'debtor').map((e) => e.field);

  it('akzeptiert einen Empfänger nur mit Namen (Strasse, Nr., PLZ, Ort und Land leer)', () => {
    expect(validateDebtor(nameOnly, 'debtor')).toEqual([]);
  });

  it('verlangt den Namen', () => {
    expect(fields({ name: '' })).toEqual(['debtor.name']);
    expect(fields({ name: '   ' })).toEqual(['debtor.name']);
  });

  it('der Name ist im Entwurf noch nicht Pflicht', () => {
    expect(validateDebtor({ ...nameOnly, name: '' }, 'debtor', { requireName: false })).toEqual([]);
  });

  it('akzeptiert vollständige Adressen', () => {
    expect(validateDebtor(valid, 'debtor')).toEqual([]);
  });

  it('prüft vorhandene optionale Felder auf Länge und Zeichensatz', () => {
    expect(fields({ street: 'a'.repeat(71) })).toEqual(['debtor.street']);
    expect(fields({ houseNo: '1'.repeat(17) })).toEqual(['debtor.houseNo']);
    expect(fields({ zip: '1'.repeat(17) })).toEqual(['debtor.zip']);
    expect(fields({ city: 'a'.repeat(36) })).toEqual(['debtor.city']);
    expect(fields({ city: 'Zürich 😀' })).toEqual(['debtor.city']);
  });

  it('das Land ist optional, aber wenn angegeben ein zweistelliger Ländercode', () => {
    expect(fields({ country: '' })).toEqual([]);
    expect(fields({ country: 'DE' })).toEqual([]);
    expect(fields({ country: 'CHE' })).toEqual(['debtor.country']);
    expect(fields({ country: 'ch' })).toEqual(['debtor.country']);
  });
});
