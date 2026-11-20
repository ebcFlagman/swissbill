# Vertrag: DbAdapter (pro Datenbanktyp)

Einziger Ort mit datenbankspezifischem Code (Verfassung, Technologie-Abschnitt). Dateien: `src/main/db/adapters/{sqlite,postgres,mysql}.ts`; `mysql.ts` bedient `mysql` und `mariadb`.

```ts
interface DbAdapter {
  readonly type: DbType;
  /** TypeORM-Optionen aus der Konfiguration; Passwort als eigener Parameter, nie als URL. */
  dataSourceOptions(settings: DbConnectionSettings, password: string | null): DataSourceOptions;
  /** Führt `work` unter einer Datenbank-Migrationssperre aus (Advisory Lock / GET_LOCK). SQLite: ohne Sperre. */
  withMigrationLock<T>(ds: DataSource, work: () => Promise<T>): Promise<T>;
  /** Anzahl vorhandener Tabellen ausser `migrations` (für Fremd-DB-Erkennung). */
  countForeignTables(ds: DataSource): Promise<number>;
  /** Serverzeit und Ablaufprüfung für Sperren in einer Abfrage. */
  lockExpiry(ds: DataSource, owner: LockKey, ttlSeconds: number): Promise<{ expired: boolean }>;
  /** Setzt `heartbeat_at` auf die Serverzeit. */
  touchLock(manager: EntityManager, key: LockKey): Promise<void>;
  /** Treiberfehler → Verbindungsstufe + deutsche Meldung ohne Zugangsdaten. */
  classifyError(error: unknown): { stage: FailedStage; message: string };
  /** Nur SQLite: Integritätsprüfung, Kopie vor Migration, Ein-Datei-Sicherung; sonst nicht vorhanden. */
  readonly file?: { verifyIntegrity(path: string): void; copyBeforeMigration(path: string, v: number): void; backupTo(ds: DataSource, target: string): Promise<void> };
}

function adapterFor(type: DbType): DbAdapter;
```

## Regeln

- Treiber-Imports (`pg`, `mysql2`, `better-sqlite3`) nur in `adapters/`; Architektur-Test schlägt bei jedem anderen Import fehl.
- Der Adapter für Server wird nur geladen, wenn die Konfiguration einen Servertyp enthält (kein Netzwerk ohne Konfiguration, FR-002).
- TLS: `tls.enabled` ⇒ `rejectUnauthorized: true` (+ `ca`); sonst keine SSL-Option (`pg`: `ssl: false`).
- Verbindungs-Timeout 10 s, Pool klein (max. 4 Verbindungen); Fehlerabbildung gemäss research R6.
- **Konformitätstest**: dieselbe Testsuite läuft gegen jeden Adapter (`tests/integration/matrix/`).
