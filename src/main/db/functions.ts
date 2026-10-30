import type Database from 'better-sqlite3';

/**
 * SQLite kennt nur ASCII-Kleinschreibung. Für die Suche mit Umlauten wird `unicode_lower` registriert.
 * Mehrfaches Registrieren ist unkritisch.
 */
export function registerUnicodeLower(db: Database.Database): void {
  db.function('unicode_lower', { deterministic: true }, (value) =>
    typeof value === 'string' ? value.toLowerCase() : '',
  );
}
