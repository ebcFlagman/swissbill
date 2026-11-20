import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DataSource } from 'typeorm';
import type { DbInfo } from '@shared/ipc/db';
import { AppException } from '@shared/ipc/errors';
import { backupTo } from '../db/sqlite-adapter';

/** Backup of the database as a single, consistent file (FR-016). */
export class BackupService {
  constructor(private readonly dataSource: DataSource) {}

  private get path(): string {
    return String(this.dataSource.options.database);
  }

  /** `schemaVersion` is the number of executed migrations. */
  async info(): Promise<DbInfo> {
    const rows = (await this.dataSource.query('SELECT COUNT(*) AS n FROM "migrations"')) as {
      n: number;
    }[];
    return {
      path: this.path,
      sizeBytes: statSync(this.path).size,
      schemaVersion: Number(rows[0]?.n ?? 0),
    };
  }

  /** Writes a consistent copy of the running database. The target file is overwritten. */
  async backup(targetPath: string): Promise<void> {
    if (resolve(targetPath) === resolve(this.path)) {
      throw new AppException(
        'IO',
        'Die Sicherung darf nicht auf die Datenbank selbst geschrieben werden.',
      );
    }
    try {
      await backupTo(this.dataSource, targetPath);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new AppException('IO', `Die Sicherung konnte nicht erstellt werden (${reason}).`);
    }
  }
}
