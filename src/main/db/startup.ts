import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { openDatabase } from './connection';
import { loadMigrations, migrate, type Migration } from './migrate';

export type StartupErrorKind = 'corrupt' | 'unreadable' | 'too-new' | 'migration';

/** Die Datenbank kann nicht gestartet werden. Die Meldung ist für den Benutzer bestimmt (Deutsch). */
export class DatabaseStartupError extends Error {
  constructor(
    readonly kind: StartupErrorKind,
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'DatabaseStartupError';
  }
}

const UNTOUCHED = 'Es wurde nichts verändert und nichts überschrieben.';

function isCorruption(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^SQLITE_(NOTADB|CORRUPT)/.test(code);
}

/** Prüft eine bestehende Datei schreibgeschützt, bevor irgendetwas an ihr geändert wird. */
function verifyIntegrity(path: string): void {
  let probe: Database.Database | null = null;
  try {
    probe = new Database(path, { readonly: true, fileMustExist: true });
    const result = probe.pragma('quick_check', { simple: true });
    if (result !== 'ok') throw Object.assign(new Error(String(result)), { code: 'SQLITE_CORRUPT' });
  } catch (error) {
    if (isCorruption(error)) {
      throw new DatabaseStartupError(
        'corrupt',
        path,
        `Die Datenbank ist beschädigt oder keine gültige SwissBill-Datenbank:\n${path}\n\n${UNTOUCHED} ` +
          'Stellen Sie die Datei aus einer Sicherung wieder her (Datei swissbill.db ersetzen) oder wenden Sie ' +
          'sich an den Support.',
      );
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new DatabaseStartupError(
      'unreadable',
      path,
      `Die Datenbankdatei kann nicht gelesen werden:\n${path}\n(${reason})\n\n${UNTOUCHED}`,
    );
  } finally {
    probe?.close();
  }
}

/**
 * Öffnet die Datenbank und wendet ausstehende Migrationen an.
 * - Fehlt die Datei, ist es der erste Start: es wird eine neue Datenbank angelegt.
 * - Eine beschädigte, nicht lesbare oder zu neue Datei wird nie verändert oder überschrieben.
 */
export function openAndMigrate(path: string, migrations: readonly Migration[] = loadMigrations()): Database.Database {
  if (existsSync(path)) verifyIntegrity(path);

  const db = openDatabase(path);
  try {
    migrate(db, migrations);
    return db;
  } catch (error) {
    db.close();
    const reason = error instanceof Error ? error.message : String(error);
    if (/neuer als/.test(reason)) {
      throw new DatabaseStartupError(
        'too-new',
        path,
        `${reason}\n\n${path}\n${UNTOUCHED}`,
      );
    }
    throw new DatabaseStartupError(
      'migration',
      path,
      `Die Datenbank konnte nicht aktualisiert werden (${reason}).\n\n${path}\n` +
        'Die Änderungen wurden zurückgerollt. Vor jeder Aktualisierung wird eine Kopie (swissbill.db.bak-<Version>) angelegt.',
    );
  }
}
