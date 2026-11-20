# Persistenz

Die Anwendung speichert alles in einer eingebetteten SQLite-Datei (`swissbill.db`, Electron-`userData`-Ordner).
Der Zugriff läuft ausschliesslich im Main-Prozess über **TypeORM** (`src/main/db/`). Der Renderer sieht nur die
schmale, typisierte IPC-Schnittstelle.

## Aufbau (`src/main/db/`)

| Datei | Aufgabe |
|---|---|
| `entities/*.entity.ts` | `EntitySchema` je Tabelle (reine Abbildung; das Schema selbst entsteht durch die Migrationen) |
| `migrations/*.ts` | TypeORM-Migrationen, nur vorwärts, Klassenname endet auf den Zeitstempel |
| `data-source.ts` | `createDataSource(pfad)`; `synchronize` und `migrationsRun` sind aus |
| `startup.ts` | `openAndMigrate(pfad)`: Integritätsprüfung → öffnen → Übernahme alter Dateien → Migrationen |
| `sqlite-adapter.ts` | **einzige** SQLite-spezifische Stelle: Pragmas, Integritätsprüfung, Vorab-Kopie, Sicherung |
| `unit-of-work.ts` | führt alle Schreibvorgänge als Transaktionen nacheinander aus |
| `*-repository.ts` | einziger Schreibpfad; setzt die Regeln durch |

## Regeln leben im Code, nicht in der Datenbank

Unveränderlichkeit ausgestellter Rechnungen, erlaubte Statuswechsel, Feldlängen/Wertebereiche und die lückenlose
Nummernvergabe setzt die Persistenzschicht durch (Verfassung, Prinzip III). Dadurch gelten sie unabhängig von der
Datenbank-Engine. Änderungen an der Datei ausserhalb der App sind nicht abgedeckt – dafür gibt es die Sicherung.

- Ausgestellte Rechnungen: jede Änderung ist ein bedingtes `UPDATE … WHERE id = ? AND status = ?`; trifft es keine
  Zeile, wird abgelehnt (`IMMUTABLE`).
- Datenregeln: `src/shared/domain/*` (`validateCustomer`, `validateSettings`, `validateDraft`, `validateForIssue`); die
  Repositories rufen sie vor jedem Schreiben auf.
- Portable Rückhalte bleiben in den Migrationen: Primärschlüssel, Fremdschlüssel (`SET NULL`/`CASCADE`), `UNIQUE`.
- Test `tests/unit/architecture.test.ts` stellt sicher, dass `typeorm` und die Entitäten nur im Datenbankmodul
  vorkommen und SQLite-Spezifika nur im Adapter.

## Neue Migration anlegen

1. Datei `src/main/db/migrations/<Zeitstempel>-<Name>.ts` mit Klasse `<Name><Zeitstempel>` (13-stelliger
   Zeitstempel, grösser als der letzte) und `name` gleich dem Klassennamen. `down()` bleibt leer.
2. Nur portable TypeORM-Funktionen verwenden (`queryRunner.createTable/addColumn …`).
3. Die Entität in `entities/` anpassen; `tests/integration/schema-parity.test.ts` meldet Abweichungen.

## Dateien aus der Zeit vor TypeORM

Eine Datei mit Tabellen, aber ohne Tabelle `migrations`, wird als Version 1 oder 2 des früheren Mechanismus
(`PRAGMA user_version`) übernommen: Kopie `swissbill.db.bak-<Version>`, die ersten Migrationen werden als ausgeführt
eingetragen, die Alt-Trigger entfernt. Die Alt-CHECK-Constraints bleiben in diesen Dateien bestehen (Entfernen bräuchte
einen Tabellen-Neuaufbau) und decken sich mit den Code-Regeln.

## Sicherung

`BackupService.backup(ziel)` schreibt über den SQLite-Adapter eine konsistente Einzeldatei (kein `-wal`/`-shm`).
