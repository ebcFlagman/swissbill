# Implementation Plan: Persistenz über TypeORM

**Branch**: `claude/typeorm-persistenz-3662b6` | **Date**: 2026-11-20 (überarbeitet nach Clarify) | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-typeorm-persistence/spec.md`

## Summary

Die drei Repositories und alle Aufrufer wechseln von handgeschriebenem `better-sqlite3`-SQL auf TypeORM
(`DataSource`, Entitäten als `EntitySchema` ohne Decorators). Gemäss Klärung gilt:

1. **Garantien im Code, nicht in der Datenbank.** Unveränderlichkeit, Statusübergänge, Feld-Prüfregeln, Nummernvergabe
   und Suche laufen in der Persistenzschicht mit portablen Mitteln (bedingte Updates, Transaktionen, Validierung in
   `shared/domain`). Trigger, CHECK-Constraints und die SQLite-Funktion `unicode_lower` entfallen.
2. **TypeORM-Migrationen.** Schema entsteht und ändert sich nur durch TypeORM-Migrationsklassen; der `user_version`-Runner
   entfällt. Bestehende Version-2-Dateien werden per Baseline übernommen (R8).
3. **Nur SQLite wird ausgeliefert und getestet**, der Code ist portabel (FR-015); SQLite-Spezifika sind auf
   `db/sqlite-adapter.ts` beschränkt (Pragmas, Integritätscheck, Dateikopie, Backup).

Details: [research.md](research.md), [data-model.md](data-model.md), [contracts/persistence-layer.md](contracts/persistence-layer.md).

| Fähigkeit (FR-009) | Umsetzung |
|---|---|
| Unveränderlichkeit, Statuswechsel | Persistenzschicht: Statusprüfung via `canTransition`, Schreiben nur als bedingtes `UPDATE … WHERE id=? AND status=?` mit Treffer-Prüfung, innerhalb einer Transaktion |
| Prüfregeln (ehem. CHECK) | Validierungsfunktionen in `shared/domain` (je Entität), vor jedem Schreiben aufgerufen; Eindeutigkeits-Indizes bleiben als portabler Rückhalt in der Migration |
| Suche mit Umlauten | Statusfilter in SQL, Textsuche in JavaScript über die Listenspalten (`toLowerCase`); bei 10 000 Rechnungen im Performance-Test abgesichert |
| Migrationen | TypeORM-Migrationsklassen, `migrationsRun: false`, Start ruft `runMigrations({ transaction: 'each' })` auf |
| Integritätscheck, Vorab-Kopie, Backup | `sqlite-adapter.ts` (bewusst DB-spezifisch, FR-015) |
| Schema-Übernahme | Baseline für Bestandsdateien (R8), `synchronize: false` |
| Spaltenformate | `text`/`integer`, Zeitstempel ISO-Text vom Service gesetzt |
| Nummernvergabe | In Transaktion: `UPDATE counter … +1`; bei 0 Treffern `INSERT`; danach lesen – ohne `RETURNING`/`ON CONFLICT` |

## Technical Context

**Language/Version**: TypeScript 6.0, Node im Electron-45-Main

**Primary Dependencies**: neu `typeorm` (1.1.x), `reflect-metadata`; bestehend `better-sqlite3`. **Risiko**: `typeorm@1.1.3` deklariert Peer `better-sqlite3 ^12`, Projekt nutzt 13.1.1 → R1 (Gate)

**Storage**: SQLite-Einzeldatei `swissbill.db` (`userData`), Schema inhaltlich = bisherige Version 2 (ohne Trigger/CHECK bei Neuinstallationen)

**Testing**: vitest (Integration mit `:memory:`-DataSource); Immutability-/Constraint-Tests werden von Roh-SQL auf Aufrufe der Persistenzschicht umgeschrieben; neue Tests: Baseline-Übernahme, Nebenläufigkeit, Schema-Parität, Regel-Parität (jede frühere CHECK-Regel hat Code-Regel + Test)

**Target Platform**: Windows und Linux (Electron-Desktop)

**Project Type**: desktop-app

**Performance Goals**: Liste 10 000 Rechnungen < 1 s, Ausstellen < 1 s (`perf.test.ts` bleibt Gate)

**Constraints**: offline; keine `-wal`/`-shm`; kein `synchronize`; kein SQLite-spezifisches SQL ausserhalb `sqlite-adapter.ts` und der Baseline-Behandlung; DB-Zugriff nur im Main

**Scale/Scope**: 5 Entitäten, 3 Repositories, 4 Services (werden `async`), 3 Migrationsklassen, Test-Fixtures

## Constitution Check

*GATE: vor Phase 0 geprüft, nach Phase 1 erneut geprüft.*

| Prinzip | Bewertung |
|---|---|
| I. QR-Bill-Konformität | Unberührt. **Pass** |
| II. Local-First/Offline | SQLite-Datei, offline, kein Netzwerk. **Pass** |
| III. Datenintegrität | «Versionierte, nur vorwärts laufende Migrationen» erfüllt (TypeORM, Rückwärts-`down` wird nicht verwendet). Rappen als Ganzzahl und Ein-Datei-Backup bleiben. «Ausgestellte Rechnung darf nicht verändert werden» wird jetzt von der Persistenzschicht statt der Datenbank garantiert: **Pass nach Verfassungs-Anpassung** (PATCH/MINOR: Garantie gilt für alle Schreibpfade der App; Dateimanipulation ausserhalb der App ist nicht abgedeckt) |
| IV. Test-First | Regel-Paritäts- und Nebenläufigkeitstests entstehen vor der Umstellung; die bestehenden Trigger-Tests werden zuerst auf die Persistenzschicht umgestellt (rot gegen neue Implementierung → grün). **Pass** |
| V. Einfachheit & Electron-Sicherheit | Neue Abhängigkeit begründet (Complexity Tracking). Entfall von Triggern, CHECKs, eigenem Runner und `unicode_lower` vereinfacht die DB-Seite. IPC/Main-Isolation unverändert. **Pass** |
| Technologie-Abschnitt | Verfassung v1.2.0 (2026-11-20) enthält bereits «Persistenz über TypeORM; Schema nur über TypeORM-Migrationen» – **erledigt** |

Post-Design: **Pass**; offenes Gate: «Peer-Version geklärt» (Task T001).

## Project Structure

### Documentation (this feature)

```text
specs/005-typeorm-persistence/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/persistence-layer.md
└── tasks.md              # /speckit-tasks
```

### Source Code (repository root)

```text
src/main/db/
├── data-source.ts            # NEU: createDataSource(path), Entities + Migrations (import.meta.glob), synchronize=false
├── sqlite-adapter.ts         # NEU: einzige DB-spezifische Stelle (Pragmas, quick_check, Vorab-Kopie, backup)
├── startup.ts                # angepasst: Integritätscheck → initialize → Baseline/Too-new → runMigrations; async
├── unit-of-work.ts           # NEU: serialisierte Transaktionen
├── errors.ts                 # NEU: QueryFailedError/Regelverstoss → AppException (gleiche Texte)
├── entities/                 # NEU: EntitySchema je Tabelle (5 Dateien)
├── migrations/               # NEU: *.ts TypeORM-Migrationen (ersetzt *.sql)
│   ├── 1700000000001-InitSchema.ts          # portabel via Table-API, ohne Trigger/CHECK
│   ├── 1700000000002-AddGeoapifyKey.ts
│   └── 1700000000003-DropLegacyTriggers.ts  # entfernt Trigger in Bestandsdateien (SQLite-Guard)
├── customer-repository.ts    # umgeschrieben
├── invoice-repository.ts     # umgeschrieben, einziger Schreibpfad auf invoices/items
├── settings-repository.ts    # umgeschrieben
├── connection.ts, functions.ts, migrate.ts   # ENTFALLEN
src/shared/domain/            # ERGÄNZT: Validierungsregeln, die früher CHECKs waren (Längen, Bereiche, Status-Konsistenz)
src/main/services/            # async; backup-service nutzt sqlite-adapter
src/main/index.ts             # DataSource halten, beim Beenden destroy()

tests/fixtures/db.ts          # createTestDb() async
tests/integration/            # immutability/status/migrate/corrupt-db/backup angepasst; neu: baseline, concurrency, rule-parity, schema-parity
electron.vite.config.ts, electron-builder.yml     # typeorm/reflect-metadata externalisiert, mitgeliefert
```

**Structure Decision**: Schichtung `db/` → `services/` → `ipc/` bleibt. `invoice-repository` ist der einzige Schreibpfad auf Rechnungen; Entitäten und `EntityManager` werden nicht über das Modul hinaus exportiert (R5), damit die Code-Garantie keinen Umgehungspfad hat.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Neue Abhängigkeit TypeORM (+ reflect-metadata) (Prinzip V) | Ausdrücklicher Auftraggeber-Wunsch, Portabilität | Roh-SQL: nicht gewünscht |
| `UnitOfWork` (Transaktions-Serialisierung) | TypeORM-SQLite hat eine Verbindung; parallele Transaktionen kollidieren | Keine |
| Baseline-Logik für Bestandsdateien | Version-2-Dateien haben Tabellen, aber keine TypeORM-`migrations`-Tabelle | InitSchema blind ausführen würde fehlschlagen oder Daten gefährden |
| `sqlite-adapter.ts` | Integritätscheck, Vorab-Kopie und Backup sind dateibasiert | Sie portabel zu machen, ist ohne zweite Engine nicht sinnvoll (Klärung: nur SQLite ausgeliefert) |
