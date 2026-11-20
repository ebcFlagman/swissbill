import { describe, expect, it } from 'vitest';
import { postgresAdapter } from '../../src/main/db/adapters/postgres';
import { mysqlAdapter } from '../../src/main/db/adapters/mysql';
import { sqliteAdapter } from '../../src/main/db/adapters/sqlite';

describe('Ablauf der Bearbeitungssperre: Bedingung auf der Serveruhr (FR-009a)', () => {
  it('PostgreSQL rechnet mit CURRENT_TIMESTAMP und Sekunden', () => {
    expect(postgresAdapter.expiredCondition('heartbeat_at', 300)).toBe(
      `"heartbeat_at" < CURRENT_TIMESTAMP - INTERVAL '300 seconds'`,
    );
  });

  it('MySQL und MariaDB rechnen mit CURRENT_TIMESTAMP und SECOND', () => {
    for (const type of ['mysql', 'mariadb'] as const) {
      expect(mysqlAdapter(type).expiredCondition('heartbeat_at', 300)).toBe(
        '`heartbeat_at` < (CURRENT_TIMESTAMP - INTERVAL 300 SECOND)',
      );
    }
  });

  it('SQLite rechnet mit datetime(now)', () => {
    expect(sqliteAdapter.expiredCondition('heartbeat_at', 300)).toBe(
      `"heartbeat_at" < datetime('now', '-300 seconds')`,
    );
  });

  it('nimmt nur ganze Sekunden (keine Einschleusung über die Dauer)', () => {
    expect(postgresAdapter.expiredCondition('heartbeat_at', 12.9)).toContain('12 seconds');
    expect(sqliteAdapter.expiredCondition('heartbeat_at', Number.NaN)).not.toMatch(
      /[^\w\s'"\-(),<]/,
    );
  });
});
