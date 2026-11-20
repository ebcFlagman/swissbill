import { describe, expect, it } from 'vitest';
import {
  isRetryableTransactionError,
  isUniqueViolation,
  type ClassifiedError,
  type DbAdapter,
} from '../../src/main/db/adapters';
import { mysqlAdapter } from '../../src/main/db/adapters/mysql';
import { postgresAdapter } from '../../src/main/db/adapters/postgres';

const context = { host: 'db.example.ch', database: 'swissbill' };
const withCode = (code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(`roher Treibertext für ${code} mit Benutzer swissbill`), {
    code,
    ...extra,
  });

const adapters: [string, DbAdapter][] = [
  ['PostgreSQL', postgresAdapter],
  ['MySQL', mysqlAdapter('mysql')],
  ['MariaDB', mysqlAdapter('mariadb')],
];

/** Message must never carry credentials or the raw driver text. */
function expectClean(result: ClassifiedError) {
  expect(result.message).not.toMatch(/Benutzer swissbill|roher Treibertext|passwor[dt]\s*[:=]/i);
}

describe('Fehlerabbildung der Verbindung (FR-004, FR-012)', () => {
  describe.each(adapters)('%s: Netzwerk und Zertifikat', (_name, adapter) => {
    it.each(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH'])(
      '%s → erreichbar (Stufe 1)',
      (code) => {
        const result = adapter.classifyError(withCode(code), context);
        expect(result.stage).toBe('reachable');
        expect(result.message).toContain('db.example.ch');
        expectClean(result);
      },
    );

    it.each([
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'CERT_HAS_EXPIRED',
      'SELF_SIGNED_CERT_IN_CHAIN',
    ])('%s → Zertifikat wird nicht vertraut, mit Hinweis auf das CA-Zertifikat', (code) => {
      const result = adapter.classifyError(withCode(code), context);
      expect(result.stage).toBe('reachable');
      expect(result.message).toMatch(/CA-Zertifikat/);
      expectClean(result);
    });

    it('ein Verbindungs-Timeout ohne Fehlercode (so melden es die Treiber) → erreichbar, Zeitüberschreitung', () => {
      for (const message of [
        'timeout expired',
        'Connection terminated due to connection timeout',
        'connect ETIMEDOUT',
      ]) {
        const result = adapter.classifyError(new Error(message), context);
        expect(result.stage, message).toBe('reachable');
        expect(result.message, message).toMatch(/Zeitüberschreitung/);
      }
    });

    it('ein unbekannter Fehler bleibt allgemein und enthält nur den Server', () => {
      const result = adapter.classifyError(new Error('geheimes Detail mit Passwort: abc'), context);
      expect(result.message).toContain('db.example.ch');
      expect(result.message).not.toContain('abc');
    });

    it('ein umhüllter Treiberfehler (driverError) wird erkannt', () => {
      const result = adapter.classifyError(
        Object.assign(new Error('wrapper'), { driverError: { code: 'ECONNREFUSED' } }),
        context,
      );
      expect(result.stage).toBe('reachable');
    });
  });

  describe('PostgreSQL', () => {
    it('28P01 und 28000 → Anmeldung', () => {
      for (const code of ['28P01', '28000']) {
        const result = postgresAdapter.classifyError(withCode(code), context);
        expect(result.stage).toBe('authentication');
        expectClean(result);
      }
    });
    it('3D000 → Datenbank, mit Datenbankname', () => {
      const result = postgresAdapter.classifyError(withCode('3D000'), context);
      expect(result.stage).toBe('database');
      expect(result.message).toContain('swissbill');
    });
    it('42501 → Rechte', () => {
      expect(postgresAdapter.classifyError(withCode('42501'), context).stage).toBe('permissions');
    });
  });

  describe.each([mysqlAdapter('mysql'), mysqlAdapter('mariadb')])('MySQL/MariaDB', (adapter) => {
    it('1045 → Anmeldung', () => {
      const byCode = adapter.classifyError(withCode('ER_ACCESS_DENIED_ERROR'), context);
      const byNumber = adapter.classifyError(
        Object.assign(new Error('x'), { errno: 1045 }),
        context,
      );
      expect(byCode.stage).toBe('authentication');
      expect(byNumber.stage).toBe('authentication');
      expectClean(byCode);
    });
    it('1049 → Datenbank', () => {
      expect(adapter.classifyError(withCode('ER_BAD_DB_ERROR'), context).stage).toBe('database');
      expect(
        adapter.classifyError(Object.assign(new Error('x'), { errno: 1049 }), context).stage,
      ).toBe('database');
    });
    it('1044 und 1142 → Rechte', () => {
      expect(adapter.classifyError(withCode('ER_DBACCESS_DENIED_ERROR'), context).stage).toBe(
        'permissions',
      );
      expect(
        adapter.classifyError(Object.assign(new Error('x'), { errno: 1142 }), context).stage,
      ).toBe('permissions');
    });
  });
});

describe('Erkennung von Konflikten zwischen Geräten', () => {
  it('Deadlock, Zeitüberschreitung beim Sperren und Serialisierungsfehler sind wiederholbar', () => {
    for (const code of [
      '40P01',
      '40001',
      'ER_LOCK_DEADLOCK',
      'ER_LOCK_WAIT_TIMEOUT',
      'ER_CHECKREAD',
    ]) {
      expect(isRetryableTransactionError(withCode(code)), code).toBe(true);
    }
    for (const errno of [1213, 1205, 1020]) {
      expect(
        isRetryableTransactionError(Object.assign(new Error('x'), { errno })),
        String(errno),
      ).toBe(true);
    }
    expect(isRetryableTransactionError(withCode('23505'))).toBe(false);
    expect(isRetryableTransactionError(new Error('anderer Fehler'))).toBe(false);
  });

  it('doppelte Schlüssel aller Datenbanken werden erkannt', () => {
    expect(isUniqueViolation(withCode('23505'))).toBe(true);
    expect(isUniqueViolation(withCode('ER_DUP_ENTRY'))).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error('x'), { errno: 1062 }))).toBe(true);
    expect(isUniqueViolation(withCode('SQLITE_CONSTRAINT_UNIQUE'))).toBe(true);
    expect(isUniqueViolation(withCode('23503'))).toBe(false); // foreign key
  });
});
