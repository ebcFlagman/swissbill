import { describe, expect, it } from 'vitest';
import {
  defaultPort,
  isServerType,
  isDifferentDatabase,
  validateConnection,
  type DbConnectionSettings,
} from '@shared/domain/db-connection';

const valid: DbConnectionSettings = {
  type: 'postgres',
  host: 'db.example.ch',
  port: 5432,
  database: 'swissbill',
  user: 'swissbill',
  tls: { enabled: true, caPath: null },
};

const fieldsOf = (s: DbConnectionSettings) => validateConnection(s).map((e) => e.field);

describe('Datenbankverbindung (FR-003)', () => {
  it('akzeptiert eine gültige Serververbindung', () => {
    expect(validateConnection(valid)).toEqual([]);
  });

  it('kennt Standardports je Typ', () => {
    expect(defaultPort('postgres')).toBe(5432);
    expect(defaultPort('mysql')).toBe(3306);
    expect(defaultPort('mariadb')).toBe(3306);
  });

  it('unterscheidet Server- von lokalen Typen', () => {
    expect(isServerType('sqlite')).toBe(false);
    expect(isServerType('postgres')).toBe(true);
    expect(isServerType('mysql')).toBe(true);
    expect(isServerType('mariadb')).toBe(true);
  });

  it('verlangt Host, Datenbank und Benutzer', () => {
    expect(fieldsOf({ ...valid, host: '   ' })).toContain('host');
    expect(fieldsOf({ ...valid, database: '' })).toContain('database');
    expect(fieldsOf({ ...valid, user: '' })).toContain('user');
  });

  it('begrenzt die Längen (Host 255, Datenbank 64, Benutzer 64)', () => {
    expect(fieldsOf({ ...valid, host: 'h'.repeat(255) })).toEqual([]);
    expect(fieldsOf({ ...valid, host: 'h'.repeat(256) })).toContain('host');
    expect(fieldsOf({ ...valid, database: 'd'.repeat(65) })).toContain('database');
    expect(fieldsOf({ ...valid, user: 'u'.repeat(65) })).toContain('user');
  });

  it('verlangt einen ganzzahligen Port von 1 bis 65535', () => {
    expect(fieldsOf({ ...valid, port: 0 })).toContain('port');
    expect(fieldsOf({ ...valid, port: 65536 })).toContain('port');
    expect(fieldsOf({ ...valid, port: 5432.5 })).toContain('port');
    expect(fieldsOf({ ...valid, port: 1 })).toEqual([]);
    expect(fieldsOf({ ...valid, port: 65535 })).toEqual([]);
  });

  it('erlaubt ein CA-Zertifikat nur bei aktiviertem TLS', () => {
    expect(fieldsOf({ ...valid, tls: { enabled: false, caPath: '/etc/ca.pem' } })).toContain(
      'tls.caPath',
    );
    expect(fieldsOf({ ...valid, tls: { enabled: true, caPath: '/etc/ca.pem' } })).toEqual([]);
  });

  it('lässt Sonderzeichen in Benutzer und Datenbank unverändert zu', () => {
    expect(fieldsOf({ ...valid, user: 'a@b:c/d ü', database: 'db name/ß' })).toEqual([]);
  });

  it('prüft für lokales SQLite keine Serverfelder', () => {
    expect(
      validateConnection({
        type: 'sqlite',
        host: '',
        port: 0,
        database: '',
        user: '',
        tls: { enabled: false, caPath: null },
      }),
    ).toEqual([]);
  });

  it('liefert deutsche Meldungen', () => {
    const [first] = validateConnection({ ...valid, host: '' });
    expect(first?.message).toMatch(/Server/);
  });
});

describe('Wechsel der Datenbank (FR-013)', () => {
  const local = null;
  it('lokal ↔ Server ist ein Wechsel, lokal → lokal nicht', () => {
    expect(isDifferentDatabase(local, valid)).toBe(true);
    expect(isDifferentDatabase(valid, { ...valid, type: 'sqlite' })).toBe(true);
    expect(isDifferentDatabase(local, { ...valid, type: 'sqlite' })).toBe(false);
  });
  it('anderer Typ, Server, Port oder Datenbankname ist ein Wechsel', () => {
    expect(isDifferentDatabase(valid, { ...valid, type: 'mysql' })).toBe(true);
    expect(isDifferentDatabase(valid, { ...valid, host: 'other.example.ch' })).toBe(true);
    expect(isDifferentDatabase(valid, { ...valid, port: 5433 })).toBe(true);
    expect(isDifferentDatabase(valid, { ...valid, database: 'andere' })).toBe(true);
  });
  it('Benutzer, TLS und Schreibweise des Servers sind kein Wechsel', () => {
    expect(isDifferentDatabase(valid, { ...valid, user: 'anderer' })).toBe(false);
    expect(isDifferentDatabase(valid, { ...valid, tls: { enabled: false, caPath: null } })).toBe(
      false,
    );
    expect(isDifferentDatabase(valid, { ...valid, host: ' DB.example.ch ' })).toBe(false);
  });
});
