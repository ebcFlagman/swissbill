import Database from 'better-sqlite3';

export const DB_FILENAME = 'swissbill.db';

/**
 * Öffnet die SQLite-Datenbank. `path` ist der volle Dateipfad (im Betrieb der Electron-`userData`-Ordner)
 * oder `:memory:` für Tests.
 *
 * - `journal_mode = DELETE`: keine `-wal`/`-shm`-Zusatzdateien, die Sicherung ist genau eine Datei (FR-016).
 * - `synchronous = FULL`: ausgestellte Rechnungen gehen auch bei Stromausfall nicht verloren.
 * - `foreign_keys = ON`: Fremdschlüssel werden durchgesetzt.
 */
export function openDatabase(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = DELETE');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  return db;
}
