import { afterEach, describe, expect, it } from 'vitest';
import { clearSecrets, registerSecret, scrub } from '../../src/main/logging/scrubber';

afterEach(() => clearSecrets());

describe('Scrubber', () => {
  it('ersetzt ein registriertes Geheimnis in der ganzen Zeile', () => {
    registerSecret('geheim123');
    const line = JSON.stringify({ msg: 'Zugang geheim123', err: { stack: 'at geheim123 (x)' } });
    expect(scrub(line)).not.toContain('geheim123');
    expect(scrub(line)).toContain('***');
  });

  it('ersetzt auch die JSON-escapte Form (Anführungszeichen, Backslash, Umlaute)', () => {
    const secret = 'p@ss:w/rd ü"\'-\\Geheim';
    registerSecret(secret);
    const line = JSON.stringify({ msg: `Verbindung mit ${secret}` });
    const out = scrub(line);
    expect(out).not.toContain(JSON.stringify(secret).slice(1, -1));
    expect(out).not.toContain(secret);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('registriert keine Geheimnisse unter 3 Zeichen', () => {
    registerSecret('ab');
    expect(scrub('abc ab')).toBe('abc ab');
  });

  it('wirkt für ein erst später registriertes Geheimnis ab sofort', () => {
    expect(scrub('spaet99')).toBe('spaet99');
    registerSecret('spaet99');
    expect(scrub('spaet99')).toBe('***');
  });
});
