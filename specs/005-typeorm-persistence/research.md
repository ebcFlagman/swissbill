# Research: Persistenz über TypeORM

Überarbeitet nach Clarify (2026-11-20): Garantien im Code, TypeORM-Migrationen, nur SQLite ausgeliefert.

## R1 – TypeORM-Version und Treiber-Kompatibilität
- **Befund**: `typeorm` latest 1.1.3 (Peer `better-sqlite3 ^12`, Node ≥ 20.19/22.13/24.11, MIT); Projekt: `better-sqlite3` 13.1.1; Legacy-Linie 0.3.31.
- **Decision**: `typeorm@1.1.x`. Task 1 (Gate): Läuft TypeORM mit better-sqlite3 13? Ja → npm-`overrides`. Nein/Renovate-Konflikt → `better-sqlite3` auf 12.x zurückstufen.
- **Alternatives**: 0.3.31; `sql.js`-Treiber (andere Engine, widerspricht Ein-Datei/Performance).

## R2 – Entitäten ohne Decorators
- **Decision**: `EntitySchema`, explizite Spaltennamen; nur `import 'reflect-metadata'` im Main-Einstieg.
- **Rationale**: Kein Decorator-Metadaten-Support im Vite/esbuild-Build nötig.

## R3 – Kein `synchronize`, DDL nur durch Migrationen (FR-011)
- **Decision**: `synchronize: false`, `migrationsRun: false`; Start ruft `dataSource.runMigrations({ transaction: 'each' })`. Migrationsklassen werden per `import.meta.glob` (eager) in die `migrations`-Option gegeben – kein Dateipfad-Laden zur Laufzeit.
- **Rationale**: Reihenfolge und Atomarität (SQLite-DDL ist transaktional → Rollback bei Fehler, Spec Story 4).

## R4 – Portable Garantien im Code (FR-006/008)
- **Statusübergänge/Unveränderlichkeit**: `canTransition`/`canDelete` (existieren in `shared/domain/invoice-status.ts`) im Repository vor jedem Schreiben; das Schreiben selbst ist ein bedingtes `UPDATE … WHERE id=? AND status IN (erlaubte Vorstatus)`; `affected = 0` → `AppException('IMMUTABLE')`. Positionen: Schreiben nur, wenn die Rechnung im selben Transaktionsschritt `draft` ist.
- **Inhaltsfelder ausgestellter Rechnungen**: Es gibt keinen Pfad, der sie schreibt (nur `markPaid/reopen/cancel` mit fester Spaltenliste).
- **Prüfregeln**: Jede frühere CHECK-Regel (`001_init.sql`) bekommt eine Code-Regel in `shared/domain` + Test («Regel-Parität»): Längen (70/16/35/21/500), Landcode = 2 Zeichen, Präfix-Muster, Zahlungsfrist 0–365, `due_date ≥ invoice_date`, Beträge ≥ 0, Menge > 0, `total > 0` und Pflichtfelder bei nicht-Entwurf, Entwurf ohne Nummer, `position ≥ 1`.
- **Rückhalt**: Portable Constraints (PK, FK mit `ON DELETE`, `UNIQUE(number)`, `UNIQUE(invoice_id, position)`) bleiben in der Migration – sie sind datenbankübergreifend und nicht Trigger/CHECK.
- **Alternatives**: TypeORM-Subscriber (`beforeUpdate`) – umgehbar durch `update()`-QueryBuilder; nur Zusatz, nicht Hauptmechanismus.

## R5 – Kein Umgehungspfad
- **Decision**: `invoice-repository.ts` ist der einzige Schreibpfad; `EntityManager`/Entitäten werden nicht exportiert; ESLint-Regel `no-restricted-imports` verbietet Entitäten-Import ausserhalb von `src/main/db/`. Test: Architektur-Test prüft, dass ausserhalb `db/` kein `typeorm`-Import existiert.

## R6 – Transaktionen und Nebenläufigkeit
- **Befund**: TypeORM-SQLite nutzt einen `QueryRunner`; parallele async-Transaktionen kollidieren.
- **Decision**: `UnitOfWork.run(fn)` serialisiert per Promise-Kette; alle Mehrschritt-Schreibvorgänge (`issue`, `saveDraft`, `duplicate`, `markPaid` …) laufen darüber. Zusätzlich sind die bedingten Updates auch ohne Serialisierung atomar (Rückhalt für andere Engines).
- **Test**: 100 parallele `issue()` → 0 Lücken/Duplikate (SC-004).

## R7 – Nummernvergabe portabel
- **Decision**: In der Transaktion `UPDATE number_counters SET last_seq = last_seq + 1 WHERE year = ?`; 0 Treffer → `INSERT (year, 1)`; danach `SELECT`. Kein `RETURNING`/`ON CONFLICT`. Zusammen mit `UNIQUE(number)` als Rückhalt.

## R8 – Migrationen, Baseline und «zu neu»
- **Baseline-Einträge**: Die Tabelle `migrations` hat die Spalten `id`, `timestamp`, `name` (von TypeORM erzeugt); eingetragen werden exakt die Klassennamen inkl. Zeitstempel (`InitSchema1700000000001`, `AddGeoapifyKey1700000000002`), damit `runMigrations` sie als ausgeführt erkennt. `down()` aller Migrationen bleibt leer (nur vorwärts).
- **Fälle beim Start** (nach Integritätscheck und `initialize()`):
  1. *Neue Datei*: `runMigrations` baut das Schema (InitSchema → AddGeoapifyKey → DropLegacyTriggers ist No-op).
  2. *TypeORM-Datei* (Tabelle `migrations` vorhanden): ausstehende Migrationen ausführen, vorher Kopie `<datei>.bak-<n>` (n = Anzahl ausgeführter Migrationen).
  3. *Bestandsdatei Version 2* (Tabelle `invoices` vorhanden, `migrations` fehlt): Kopie `<datei>.bak-2`; Baseline in einer Transaktion: Tabelle `migrations` anlegen und InitSchema + AddGeoapifyKey als ausgeführt eintragen; danach läuft `runMigrations` normal (DropLegacyTriggers entfernt die Alt-Trigger per `DROP TRIGGER IF EXISTS`, nur wenn Treiber = SQLite).
  4. *Zu neu*: ausgeführte Migrationsnamen enthalten unbekannte → Abbruch ohne Änderung, bisherige Meldung.
- **Konsequenz**: Alt-CHECK-Constraints bleiben in Bestandsdateien (Entfernen bräuchte Tabellen-Neuaufbau mit Datenrisiko). Sie decken sich mit den Code-Regeln und sind harmlos; Neuinstallationen haben sie nicht. Dokumentiert als bekannter Unterschied; Regel-Parität-Test läuft gegen beide Varianten (frisch/Bestand).
- **Alternatives**: Bestandsdateien per Tabellen-Neuaufbau bereinigen (Datenrisiko, kein Nutzen).

## R9 – Suche portabel
- **Decision**: Status in SQL filtern, Text (Rechnungsnummer, Debitor, Kundenname/Ort) in JS mit `toLowerCase()` über die schmalen Listenspalten; Kundenliste sortiert in JS mit `localeCompare('de')`-konformem Vergleich wie bisher (Ergebnisgleichheit im Paritätstest).
- **Rationale**: Kein datenbankspezifisches Unicode-Verhalten; Datenmenge klein (Performance-Test mit 10 000).

## R10 – SQLite-Adapter (FR-015, einzige DB-spezifische Stelle)
- `driver`-Optionen: `prepareDatabase` setzt `journal_mode=DELETE`, `synchronous=FULL`, `foreign_keys=ON`; schreibgeschützter `quick_check` vor `initialize()`; Dateikopie vor Migrationen; `backup()` über `dataSource.driver.databaseConnection`.

## R11 – Async-Umstellung
- Repos/Services liefern `Promise<T>`; IPC (`ipcMain.handle`/`wrapHandler`) ist bereits Promise-fähig; Tests erhalten `await`.

## R12 – Build und Paketierung
- `typeorm`/`reflect-metadata` bleiben via `externalizeDepsPlugin` ausserhalb des Bundles; `asarUnpack` bleibt nur für `better-sqlite3`. Verifikation: `npm run package` + `packaged.e2e.ts`.

## Umsetzungsnachweis (FR-009)

| Nr. | Fähigkeit | Umsetzung | Test |
|---|---|---|---|
| 1 | Unveränderlichkeit, Statuswechsel | `invoice-repository.ts`: bedingte Updates, `canTransition` | `tests/integration/immutability.test.ts`, `status.test.ts` |
| 2 | Prüfregeln (ehem. CHECK) | `shared/domain/*`, Aufruf in allen Repositories | `tests/integration/rule-parity.test.ts` (frisch und Bestand) |
| 3 | Umlaut-Suche | Statusfilter in SQL, Text in JS (`toLowerCase`) | `tests/integration/search-parity.test.ts`, `perf.test.ts` |
| 4 | Integritätsprüfung vor dem Öffnen | `sqlite-adapter.verifyIntegrity`, `startup.ts` | `tests/integration/corrupt-db.test.ts` |
| 5 | Ein-Datei-Sicherung | `sqlite-adapter.backupTo`, `backup-service.ts` | `tests/integration/backup.test.ts` |
| 6 | Schema-Übernahme | Baseline in `startup.ts`, `synchronize: false` | `tests/integration/baseline.test.ts`, `migrations.test.ts` |
| 7 | Speicherformate | Entitäten (`integer`/`text`), Ganzzahlen für Rappen/Mengen | `tests/integration/schema-parity.test.ts` |
| 8 | Nummernvergabe | `UPDATE`/`INSERT`/`SELECT` in einer Transaktion, `UnitOfWork` | `tests/integration/concurrency.test.ts`, `issue.test.ts` |
| – | Portabilität (FR-015, SC-006) | SQLite-Spezifika nur in `sqlite-adapter.ts` | `tests/unit/architecture.test.ts` |

Ergebnis R1: `typeorm@1.1.3` läuft mit `better-sqlite3@13.1.1`; `overrides` in `package.json` löst den
deklarierten Peer-Konflikt (^12), Rückstufung war nicht nötig.
