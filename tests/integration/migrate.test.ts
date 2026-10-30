import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/main/db/connection';
import { loadMigrations, migrate, type Migration } from '../../src/main/db/migrate';

const m1: Migration = { version: 1, name: 'first', sql: 'CREATE TABLE a (id INTEGER PRIMARY KEY);' };
const m2: Migration = { version: 2, name: 'second', sql: 'CREATE TABLE b (id INTEGER PRIMARY KEY);' };
const broken: Migration = {
  version: 2,
  name: 'broken',
  sql: 'CREATE TABLE c (id INTEGER PRIMARY KEY); INSERT INTO does_not_exist VALUES (1);',
};

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'swissbill-migrate-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function userVersion(db: Database.Database): number {
  return db.pragma('user_version', { simple: true }) as number;
}

function tableExists(db: Database.Database, name: string): boolean {
  return (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined
  );
}

describe('migrate', () => {
  it('migriert eine leere DB auf die neueste Version', () => {
    const db = openDatabase(':memory:');
    migrate(db, [m1, m2]);
    expect(userVersion(db)).toBe(2);
    expect(tableExists(db, 'a')).toBe(true);
    expect(tableExists(db, 'b')).toBe(true);
  });

  it('ändert beim erneuten Ausführen nichts', () => {
    const db = openDatabase(':memory:');
    migrate(db, [m1, m2]);
    expect(() => migrate(db, [m1, m2])).not.toThrow();
    expect(userVersion(db)).toBe(2);
  });

  it('rollt eine fehlerhafte Migration zurück und lässt user_version unverändert', () => {
    const db = openDatabase(':memory:');
    migrate(db, [m1]);
    expect(() => migrate(db, [m1, broken])).toThrow();
    expect(userVersion(db)).toBe(1);
    expect(tableExists(db, 'c')).toBe(false);
  });

  it('legt vor einer Migration einer bestehenden Datei-DB eine Kopie an', () => {
    const file = join(dir, 'swissbill.db');
    const first = openDatabase(file);
    migrate(first, [m1]);
    first.close();

    const db = openDatabase(file);
    migrate(db, [m1, m2]);
    expect(userVersion(db)).toBe(2);
    db.close();

    const backup = `${file}.bak-1`;
    expect(existsSync(backup)).toBe(true);
    const copy = new Database(backup, { readonly: true });
    expect(userVersion(copy)).toBe(1);
    expect(tableExists(copy, 'b')).toBe(false);
    copy.close();
  });

  it('legt für eine neue DB keine Kopie an', () => {
    const file = join(dir, 'swissbill.db');
    const db = openDatabase(file);
    migrate(db, [m1, m2]);
    db.close();
    expect(existsSync(`${file}.bak-0`)).toBe(false);
  });

  it('lehnt eine DB mit neuerer Version als bekannt ab', () => {
    const db = openDatabase(':memory:');
    migrate(db, [m1, m2]);
    expect(() => migrate(db, [m1])).toThrow(/neuer/);
  });

  it('lehnt Lücken in der Versionsfolge ab', () => {
    const db = openDatabase(':memory:');
    expect(() => migrate(db, [m1, { ...m2, version: 3 }])).toThrow();
  });
});

describe('loadMigrations', () => {
  it('lädt die mitgelieferten Migrationen lückenlos und sortiert', () => {
    const migrations = loadMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    migrations.forEach((m, i) => {
      expect(m.version).toBe(i + 1);
      expect(m.sql.trim().length).toBeGreaterThan(0);
    });
  });

  it('wendet alle mitgelieferten Migrationen auf eine leere DB an', () => {
    const db = openDatabase(':memory:');
    const migrations = loadMigrations();
    migrate(db, migrations);
    expect(userVersion(db)).toBe(migrations.length);
  });
});
