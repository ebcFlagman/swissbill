import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DataSource } from 'typeorm';
import type { DbAdapter } from '../db/adapters';
import type { DbInfo } from '@shared/ipc/db';
import { AppException } from '@shared/ipc/errors';

/** Backup of the database as a single, consistent file (FR-016). */
export class BackupService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly adapter: DbAdapter,
  ) {}

  /** The file path of the local database, or `host:port/database` of a server (never credentials). */
  private get path(): string {
    const options = this.dataSource.options as {
      host?: string;
      port?: number;
      database?: unknown;
    };
    return this.adapter.file
      ? String(options.database)
      : `${options.host ?? ''}:${options.port ?? ''}/${String(options.database)}`;
  }

  /** `schemaVersion` is the number of executed migrations. */
  async info(): Promise<DbInfo> {
    const rows = (await this.dataSource.query(
      `SELECT COUNT(*) AS n FROM ${this.dataSource.driver.escape('migrations')}`,
    )) as { n: number }[];
    return {
      type: this.adapter.type,
      path: this.path,
      sizeBytes: this.adapter.file ? statSync(this.path).size : null,
      schemaVersion: Number(rows[0]?.n ?? 0),
    };
  }

  /** Writes a consistent copy of the running database. The target file is overwritten. */
  async backup(targetPath: string): Promise<void> {
    const file = this.adapter.file;
    if (!file) {
      // A server database is backed up by whoever runs the server (the app has no access to its files)
      throw new AppException(
        'IO',
        'Eine Serverdatenbank sichert der Betreiber des Servers (z. B. mit den Werkzeugen der Datenbank). ' +
          'Die Anwendung kann sie nicht als Datei sichern.',
      );
    }
    if (resolve(targetPath) === resolve(this.path)) {
      throw new AppException(
        'IO',
        'Die Sicherung darf nicht auf die Datenbank selbst geschrieben werden.',
      );
    }
    try {
      await file.backupTo(this.dataSource, targetPath);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new AppException('IO', `Die Sicherung konnte nicht erstellt werden (${reason}).`);
    }
  }
}
