export interface DbInfo {
  /** Full path of the database file (Electron `userData` folder) */
  path: string;
  sizeBytes: number;
  schemaVersion: number;
}

export type BackupResult = { path: string } | { cancelled: true };
