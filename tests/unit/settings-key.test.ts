import { describe, expect, it } from 'vitest';
import { normalizeApiKey, validateApiKey } from '@shared/domain/settings';

describe('API-Key', () => {
  it('entfernt führende und nachfolgende Leerzeichen', () => {
    expect(normalizeApiKey('  abc123  ')).toBe('abc123');
    expect(normalizeApiKey('\tabc\n')).toBe('abc');
  });

  it('akzeptiert einen normalen Key und einen leeren Wert (= entfernen)', () => {
    expect(validateApiKey('0123456789abcdef0123456789abcdef')).toBeNull();
    expect(validateApiKey('')).toBeNull();
  });

  it('lehnt mehr als 200 Zeichen ab', () => {
    expect(validateApiKey('a'.repeat(200))).toBeNull();
    expect(validateApiKey('a'.repeat(201))).not.toBeNull();
  });

  it('lehnt Leerzeichen und Steuerzeichen im Inneren ab', () => {
    expect(validateApiKey('abc def')).not.toBeNull();
    expect(validateApiKey('abc\u0000def')).not.toBeNull();
    expect(validateApiKey('abc\ndef')).not.toBeNull();
  });
});
