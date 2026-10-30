import { mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import type { DbInfo } from '../../shared/ipc/db';
import { AppException } from '../../shared/ipc/errors';

/** Sicherung der Datenbank als einzelne, konsistente Datei (FR-016). */
export class BackupService {
  constructor(private readonly db: Database.Database) {}

  info(): DbInfo {
    return {
      path: this.db.name,
      sizeBytes: statSync(this.db.name).size,
      schemaVersion: this.db.pragma('user_version', { simple: true }) as number,
    };
  }

  /** Schreibt eine konsistente Kopie der laufenden Datenbank. Die Zieldatei wird überschrieben. */
  async backup(targetPath: string): Promise<void> {
    if (resolve(targetPath) === resolve(this.db.name)) {
      throw new AppException('IO', 'Die Sicherung darf nicht auf die Datenbank selbst geschrieben werden.');
    }
    try {
      mkdirSync(dirname(targetPath), { recursive: true });
      await this.db.backup(targetPath);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new AppException('IO', `Die Sicherung konnte nicht erstellt werden (${reason}).`);
    }
  }
}
