# Contract: Persistenzschicht (intern, Main-Prozess)

IPC-Vertrag zur Oberfläche (`src/shared/ipc/*`) bleibt **unverändert**.

## Start
- `openAndMigrate(path): Promise<DataSource>` – `existsSync` → Integritätscheck (SQLite-Adapter) → `initialize()` → Fall 1–4 aus research.md R8 → `runMigrations({ transaction: 'each' })`.
- Wirft `DatabaseStartupError` (`corrupt | unreadable | too-new | migration`) mit unveränderten deutschen Texten; bei `corrupt`/`unreadable`/`too-new` bleibt die Datei unverändert.

## DataSource
- `createDataSource(path | ':memory:')`: `type: 'better-sqlite3'`, `synchronize: false`, `migrationsRun: false`, Entitäten und Migrationsklassen explizit, Pragmas via `prepareDatabase`.

## Repositories (alle `Promise`, Namen/Semantik wie heute)
- `CustomerRepository`: `list(search?)`, `get`, `insert`, `update`, `delete`
- `InvoiceRepository`: `list(filter)`, `get`, `createDraft`, `saveDraft`, `deleteDraft`, `issue(id, data)` (ersetzt `nextSequence` + `markIssued`, atomar), `markPaid`, `reopen`, `cancel`
- Einstellungen: `getSettings`, `saveSettings`, `readApiKey`, `getKeyState`, `writeApiKey`

## Garantien (Verhalten, testbar)
- Jede Mutation einer nicht-Entwurf-Rechnung ausser `markPaid/reopen/cancel` wirft `AppException('IMMUTABLE', …)`; Daten bleiben unverändert.
- Ungültiger Statuswechsel wirft `AppException('IMMUTABLE', 'Ungültiger Statuswechsel.')`.
- Verletzung einer Datenregel wirft `AppException('VALIDATION', …)` mit den bisherigen Feldmeldungen.
- Mehrschritt-Schreibvorgänge laufen in `UnitOfWork.run` (serialisiert, Rollback bei Fehler).

## Backup
- `BackupService.backup(target)` über den SQLite-Adapter; Ziel ≠ Datenbankdatei; Ergebnis ist eine einzelne konsistente Datei.

## Nicht Teil des Vertrags
- Schutz gegen Änderungen an der Datei ausserhalb der App; andere Datenbank-Engines als SQLite.
