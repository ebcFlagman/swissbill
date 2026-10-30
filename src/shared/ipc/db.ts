export interface DbInfo {
  /** Voller Pfad der Datenbankdatei (Electron-`userData`-Ordner) */
  path: string;
  sizeBytes: number;
  schemaVersion: number;
}

export type BackupResult = { path: string } | { cancelled: true };
