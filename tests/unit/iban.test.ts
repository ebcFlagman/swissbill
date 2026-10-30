import { describe, expect, it } from 'vitest';
import { formatIban, ibanFeedback, isQrIban, normalizeIban, validateIban } from '@shared/domain/iban';

const CH_IBAN = 'CH93 0076 2011 6238 5295 7';
const QR_IBAN = 'CH44 3199 9123 0008 8901 2';
const LI_IBAN = 'LI21 0881 0000 2324 013A A';

describe('normalizeIban', () => {
  it('entfernt Leerzeichen und macht Grossbuchstaben', () => {
    expect(normalizeIban(' ch93 0076 2011 6238 5295 7 ')).toBe('CH9300762011623852957');
  });
});

describe('validateIban', () => {
  it('akzeptiert gültige CH- und LI-IBAN (mit und ohne Leerzeichen)', () => {
    expect(validateIban(CH_IBAN)).toBeNull();
    expect(validateIban('CH9300762011623852957')).toBeNull();
    expect(validateIban(QR_IBAN)).toBeNull();
    expect(validateIban(LI_IBAN)).toBeNull();
  });

  it('lehnt eine falsche Prüfsumme (Mod 97) ab', () => {
    expect(validateIban('CH93 0076 2011 6238 5295 8')).toMatch(/Prüfsumme/);
  });

  it('lehnt eine falsche Länge ab', () => {
    expect(validateIban('CH93 0076 2011 6238 5295')).toMatch(/21 Zeichen/);
    expect(validateIban('CH93 0076 2011 6238 5295 77')).toMatch(/21 Zeichen/);
  });

  it('lehnt andere Länder ab, auch wenn die Prüfsumme stimmt', () => {
    expect(validateIban('DE89 3704 0044 0532 0130 00')).toMatch(/Schweiz|Liechtenstein/);
  });

  it('lehnt leere und unzulässige Eingaben ab', () => {
    expect(validateIban('')).toMatch(/erforderlich/);
    expect(validateIban('CH93 0076 2011 6238 529$ 7')).not.toBeNull();
  });
});

describe('isQrIban', () => {
  it('erkennt die QR-IID im Bereich 30000 bis 31999 (Stellen 5 bis 9)', () => {
    expect(isQrIban(QR_IBAN)).toBe(true);
    expect(isQrIban('CH44 3199 9123 0008 8901 2'.replace('3199 9', '3000 0'))).toBe(true);
    expect(isQrIban(CH_IBAN)).toBe(false); // IID 00762
  });

  it('prüft die Grenzen der IID', () => {
    expect(isQrIban('CH00 3000 0000 0000 0000 0')).toBe(true);
    expect(isQrIban('CH00 3199 9000 0000 0000 0')).toBe(true);
    expect(isQrIban('CH00 3200 0000 0000 0000 0')).toBe(false);
    expect(isQrIban('CH00 2999 9000 0000 0000 0')).toBe(false);
  });
});

describe('formatIban', () => {
  it('gruppiert in Vierergruppen und normalisiert', () => {
    expect(formatIban('ch4431999123000889012')).toBe('CH44 3199 9123 0008 8901 2');
    expect(formatIban(' CH93 0076 2011 6238 5295 7 ')).toBe('CH93 0076 2011 6238 5295 7');
  });

  it('lässt unvollständige Eingaben unverändert gruppiert stehen', () => {
    expect(formatIban('')).toBe('');
    expect(formatIban('ch4')).toBe('CH4');
    expect(formatIban('CH443199')).toBe('CH44 3199');
  });

  it('ist idempotent', () => {
    const once = formatIban('CH4431999123000889012');
    expect(formatIban(once)).toBe(once);
  });
});

describe('ibanFeedback (Sofortprüfung beim Tippen)', () => {
  it('meldet nichts, solange das Feld leer ist (Pflicht meldet erst das Ausstellen)', () => {
    expect(ibanFeedback('', false)).toBeNull();
    expect(ibanFeedback('', true)).toBeNull();
  });

  it('meldet nichts bei einer noch unvollständigen, bisher gültigen Eingabe', () => {
    expect(ibanFeedback('C', false)).toBeNull();
    expect(ibanFeedback('CH', false)).toBeNull();
    expect(ibanFeedback('CH44 3199 9123', false)).toBeNull();
    expect(ibanFeedback('LI21 0881', false)).toBeNull();
  });

  it('meldet unzulässige Zeichen sofort', () => {
    expect(ibanFeedback('CH44 3199 9$', false)).toMatch(/unzulässige Zeichen/);
  });

  it('meldet ein falsches Land sofort, sobald zwei Zeichen vorliegen', () => {
    expect(ibanFeedback('DE', false)).toMatch(/Schweiz|Liechtenstein/);
    expect(ibanFeedback('DE89 3704', false)).toMatch(/Schweiz|Liechtenstein/);
    expect(ibanFeedback('FR', false)).toMatch(/Schweiz|Liechtenstein/);
  });

  it('prüft bei 21 Zeichen sofort die Prüfsumme', () => {
    expect(ibanFeedback('CH44 3199 9123 0008 8901 2', false)).toBeNull();
    expect(ibanFeedback('CH44 3199 9123 0008 8901 3', false)).toMatch(/Prüfsumme/);
  });

  it('meldet eine zu lange IBAN sofort', () => {
    expect(ibanFeedback('CH44 3199 9123 0008 8901 22', false)).toMatch(/21 Zeichen/);
  });

  it('meldet eine unvollständige IBAN erst, wenn das Feld verlassen wird', () => {
    expect(ibanFeedback('CH44 3199 9123', false)).toBeNull();
    expect(ibanFeedback('CH44 3199 9123', true)).toMatch(/21 Zeichen/);
  });

  it('entspricht bei verlassenem Feld der vollständigen Prüfung', () => {
    for (const input of ['CH44 3199 9123 0008 8901 2', 'CH93 0076 2011 6238 5295 8', 'DE89 3704 0044 0532 0130 00', 'CH44']) {
      expect(ibanFeedback(input, true)).toBe(validateIban(input));
    }
  });
});
