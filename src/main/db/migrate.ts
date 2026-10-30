import { copyFileSync, existsSync } from 'node:fs';
import type Database from 'better-sqlite3';

export interface Migration {
  /** fortlaufend ab 1, entspricht dem Wert von `PRAGMA user_version` nach der Migration */
  version: number;
  name: string;
  sql: string;
}

const files = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Lädt die mitgelieferten Migrationen `NNN_name.sql` sortiert nach Version. */
export function loadMigrations(): Migration[] {
  const migrations = Object.entries(files).map(([path, sql]) => {
    const match = /\/(\d{3})_([^/]+)\.sql$/.exec(path);
    if (!match) throw new Error(`Ungültiger Migrationsname: ${path}`);
    return { version: Number(match[1]), name: match[2] as string, sql };
  });
  return migrations.sort((a, b) => a.version - b.version);
}

function currentVersion(db: Database.Database): number {
  return db.pragma('user_version', { simple: true }) as number;
}

function assertContiguous(migrations: readonly Migration[]): void {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(
        `Migrationen müssen lückenlos ab 1 nummeriert sein (erwartet ${i + 1}, gefunden ${m.version}).`,
      );
    }
  });
}

/**
 * Wendet ausstehende Migrationen an (nur vorwärts, jede in einer Transaktion).
 * Bei einer bestehenden Datei-DB wird vor der ersten Migration eine Kopie `<datei>.bak-<version>` angelegt.
 */
export function migrate(db: Database.Database, migrations: readonly Migration[]): void {
  assertContiguous(migrations);
  const latest = migrations.length;
  const current = currentVersion(db);

  if (current > latest) {
    throw new Error(
      `Die Datenbank (Version ${current}) ist neuer als diese Programmversion (Version ${latest}). ` +
        'Bitte die Anwendung aktualisieren.',
    );
  }
  if (current === latest) return;

  if (current > 0 && db.name !== ':memory:' && existsSync(db.name)) {
    copyFileSync(db.name, `${db.name}.bak-${current}`);
  }

  for (const migration of migrations.slice(current)) {
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    });
    apply();
  }
}
