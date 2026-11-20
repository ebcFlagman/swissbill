---
description: "Aufgabenliste: Persistenz über TypeORM"
---

# Tasks: Persistenz über TypeORM

**Input**: Design-Dokumente aus `/specs/005-typeorm-persistence/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/persistence-layer.md, quickstart.md; Verfassung v1.2.0

**Tests**: Enthalten. Verfassung Prinzip IV (test-first für Domänenlogik) und Spec SC-001…SC-007 verlangen Nachweise. Tests einer Gruppe werden zuerst geschrieben bzw. umgestellt und MÜSSEN gegen die neue Persistenz fehlschlagen, bevor die Umsetzung beginnt.

**Organisation**: Nach User Stories gruppiert. US1, US2 und US3 sind P1 und **müssen gemeinsam gemergt werden** (nach US1 allein fehlen Trigger und noch die Code-Garantien aus US3). Reihenfolge: Setup → Grundlagen → US1 → US3 → US2 → US4 → US5 → Polish.

## Format: `[ID] [P?] [Story] Beschreibung`

- **[P]**: parallel ausführbar (andere Dateien, keine Abhängigkeit zu offenen Aufgaben)
- **[Story]**: zugehörige User Story (US1…US5)
- Pfade relativ zum Repository-Wurzelverzeichnis

## Phase 1: Setup

**Purpose**: Abhängigkeit klären und Build vorbereiten

- [X] T001 `typeorm` und `reflect-metadata` mit `npm i typeorm reflect-metadata` installieren (exakte Versionen wie bei den übrigen Abhängigkeiten in `package.json`, `package-lock.json` mitcommitten) und Gate R1 prüfen: `npm ls typeorm better-sqlite3` und ein Wegwerf-Skript, das mit `better-sqlite3` 13 eine `DataSource` (`type: 'better-sqlite3'`, `:memory:`) initialisiert, eine Tabelle anlegt und liest. Ergebnis in `specs/005-typeorm-persistence/research.md` (R1) festhalten. Bei Peer-Konflikt: `overrides` in `package.json` setzen, falls das Skript läuft, sonst `better-sqlite3` auf 12.x zurückstufen und die Renovate-Konfiguration (`renovate.json`, falls vorhanden) anpassen
- [X] T002 [P] `import 'reflect-metadata'` als erste Zeile in `src/main/index.ts` und `tests/fixtures/db.ts` vorsehen; `electron.vite.config.ts` prüfen: `typeorm` und `reflect-metadata` bleiben durch `externalizeDepsPlugin()` ausserhalb des Main-Bundles; `electron-builder.yml` prüfen: nur `better-sqlite3` bleibt in `asarUnpack`, `node_modules` wird mitgeliefert
- [X] T003 [P] ESLint-Regel in `eslint.config.*` ergänzen: `no-restricted-imports` für `typeorm` und `reflect-metadata` ausserhalb von `src/main/db/**` und `tests/**` (R5)

---

## Phase 2: Foundational (blockiert alle User Stories)

**Purpose**: DataSource, Entitäten, Migrationen, SQLite-Adapter, Transaktions-Serialisierung, Fehlerabbildung

- [X] T004 [P] `src/main/db/entities/customer.entity.ts`: `EntitySchema` für `customers` mit Spalten `id` (auto-increment), `name`, `street`, `house_no`, `zip`, `city`, `country`, `notes` (nullable), `created_at`, `updated_at` (ISO-Text, vom Service gesetzt, kein `CreateDate`)
- [X] T005 [P] `src/main/db/entities/invoice.entity.ts`: `EntitySchema` für `invoices` mit allen Spalten aus `src/main/db/migrations/001_init.sql` (`status`, `number`, `number_year`, `number_seq`, `invoice_date`, `due_date`, `customer_id` nullable, `sender_*`, `debtor_*`, `closing_text`, `reference_type`, `reference`, `total_rappen` integer, `layout_version`, `issued_at`, `paid_at`, `cancelled_at`, `created_at`, `updated_at`); Beziehung 1:n zu Items; Beträge nur `integer`, nie `float`
- [X] T006 [P] `src/main/db/entities/invoice-item.entity.ts`: `EntitySchema` für `invoice_items` (`invoice_id`, `position`, `description`, `quantity_milli`, `unit_price_rappen`, `amount_rappen`), n:1 zu Invoice
- [X] T007 [P] `src/main/db/entities/settings.entity.ts`: `EntitySchema` für `settings` (Zeile `id = 1`, alle Spalten inkl. `geoapify_api_key` als `blob` ↔ `Buffer | null`)
- [X] T008 [P] `src/main/db/entities/number-counter.entity.ts`: `EntitySchema` für `number_counters` (`year` PK, `last_seq`)
- [X] T009 [P] `src/main/db/migrations/1700000000001-InitSchema.ts`: TypeORM-Migration, die Tabellen, Indizes (`idx_invoices_status_date`, `idx_invoices_debtor_name`), Fremdschlüssel (`customer_id` `ON DELETE SET NULL`, `invoice_id` `ON DELETE CASCADE`), `UNIQUE(number)`, `UNIQUE(invoice_id, position)` über die TypeORM-Table-API anlegt – **ohne Trigger und ohne CHECK** – und die Zeile `settings(id = 1)` mit den bisherigen Defaults einfügt (`sender_country 'CH'`, `invoice_prefix 'RE'`, `default_payment_days 30`)
- [X] T010 [P] `src/main/db/migrations/1700000000002-AddGeoapifyKey.ts`: Spalte `geoapify_api_key` (blob, nullable) in `settings`; `down()` bleibt leer
- [X] T011 [P] `src/main/db/migrations/1700000000003-DropLegacyTriggers.ts`: nur wenn `queryRunner.connection.options.type === 'better-sqlite3'`: `DROP TRIGGER IF EXISTS` für `invoices_immutable_update`, `invoices_immutable_delete`, `invoices_status_transition`, `invoice_items_immutable_insert`, `invoice_items_immutable_update`, `invoice_items_immutable_delete`; sonst No-op; `down()` bleibt leer (nur vorwärts, Verfassung III)
- [X] T012 `src/main/db/sqlite-adapter.ts`: einzige DB-spezifische Stelle (FR-015): `sqliteDriverOptions()` mit `prepareDatabase` (`journal_mode = DELETE`, `synchronous = FULL`, `foreign_keys = ON`), `verifyIntegrity(path)` (schreibgeschützter `quick_check`, Logik und deutsche Texte aus `src/main/db/startup.ts` übernehmen), `copyBeforeMigration(path, n)` (`<datei>.bak-<n>`), `backupTo(dataSource, target)` über `dataSource.driver.databaseConnection.backup`
- [X] T013 `src/main/db/data-source.ts`: `createDataSource(path | ':memory:')` mit `type: 'better-sqlite3'`, `synchronize: false`, `migrationsRun: false`, `entities` (T004–T008), `migrations` (per `import.meta.glob('./migrations/*.ts', { eager: true })` zu Klassen gesammelt, nach Zeitstempel sortiert), Optionen aus T012; `DB_FILENAME = 'swissbill.db'` hierher übernehmen (abhängig von T004–T012)
- [X] T014 [P] `src/main/db/unit-of-work.ts`: `UnitOfWork.run(fn)` serialisiert Transaktionen über eine Promise-Kette, nutzt `dataSource.transaction`, Rollback bei Fehler, Fehler propagiert (R6)
- [X] T015 [P] `src/main/db/errors.ts`: `toAppException(error)` übersetzt `QueryFailedError`/Regelverstoss in `AppException` mit den bisherigen deutschen Texten (`IMMUTABLE`, `VALIDATION`, `IO`) (Contract «Fehler»)
- [X] T016 `tests/fixtures/db.ts` auf asynchron umstellen: `createTestDb()` liefert eine initialisierte, migrierte `DataSource` (`:memory:`), `createService` und `createFilledDraft` werden `async` (abhängig von T013, T014)
- [X] T017 [P] Test `tests/integration/schema-parity.test.ts`: je Entität die Spalten der `EntityMetadata` gegen `PRAGMA table_info` der frisch migrierten DB vergleichen (Namen, Nullbarkeit, Typen-Affinität) (R7 in research.md/Schema-Parität)

**Checkpoint**: DataSource startet, Migrationen bauen ein frisches Schema, Parität grün.

---

## Phase 3: User Story 1 – Alltag unverändert (P1)

**Goal**: Kunden, Entwürfe, Ausstellen, Status, PDF verhalten sich wie vorher.

**Independent Test**: Bestehende Unit-/Integrationstests laufen unverändert (nur `await` ergänzt) grün gegen die neue Persistenz.

### Tests (zuerst; müssen gegen die neue Implementierung rot sein)

- [X] T018 [P] [US1] Bestehende Tests mit `await` und async-Fixtures umstellen, **ohne Erwartungen zu ändern**: `tests/integration/customers-settings.test.ts`, `debtor-optional.test.ts`, `issue.test.ts`, `status.test.ts`, `persistence.test.ts`, `settings-key.test.ts`, `address-service.test.ts`, `pdf.test.ts`, `perf.test.ts`
- [X] T019 [P] [US1] Neuer Test `tests/integration/search-parity.test.ts`: Kunden «Müller», «Zürich», «Åse» werden bei Suche nach «müller», «ZÜRICH», «åse» gefunden; Sortierung der Kundenliste identisch zum bisherigen Verhalten (Erwartungswerte aus dem bisherigen `unicode_lower`-Verhalten: `toLowerCase`); Rechnungssuche nach Nummer und Debitorname

### Umsetzung

- [X] T020 [P] [US1] `src/main/db/customer-repository.ts` auf TypeORM umschreiben (`list(search?)` mit Textsuche in JS über `toLowerCase()` auf Name/Ort und Sortierung nach kleingeschriebenem Namen, dann `id`; `get`, `insert`, `update`, `delete` mit denselben Rückgabetypen; alle Methoden `Promise`)
- [X] T021 [P] [US1] `src/main/db/settings-repository.ts` auf TypeORM umschreiben (`getSettings`, `saveSettings`, `readApiKey`, `getKeyState`, `writeApiKey`; Zeile `id = 1`; `closing === null || trim() === ''` → `null`; IBAN über `normalizeIban`; Schlüssel als `Buffer`)
- [X] T022 [US1] `src/main/db/invoice-repository.ts` auf TypeORM umschreiben: `list(filter)` (Status-Filter in SQL, Textsuche nach Nummer und Debitorname in JS, Sortierung `invoice_date DESC, id DESC`), `get` (inkl. Positionen nach `position`), `createDraft`, `saveDraft` (Rechnung aktualisieren, Positionen löschen und neu schreiben in einer `UnitOfWork`-Transaktion; `debtor_country` `''` → `NULL`), `deleteDraft`, `markPaid`, `reopen`, `cancel`, `issue(id, data)` (atomar: Nummer vergeben und festschreiben; Nummernvergabe portabel gemäss research.md R7: `UPDATE number_counters … +1`, bei 0 Treffern `INSERT (year, 1)`, danach `SELECT`); die Garantien selbst folgen in US3
- [X] T023 [US1] Services auf `async` umstellen und gegen die neuen Repositories verdrahten: `src/main/services/invoice-service.ts` (`issue` über `invoices.issue(...)`; Duplizieren/Speichern in `UnitOfWork`), `customer-service.ts`, `settings-service.ts`, `address-service.ts`; Konstruktoren erhalten `DataSource` statt `Database` (abhängig von T020–T022)
- [X] T024 [US1] `src/main/ipc/register.ts`, `src/main/ipc/*.ts` und `src/main/ipc/wrap.ts` prüfen: alle Handler awaiten die nun asynchronen Services; `registerIpc(dataSource)`; IPC-Typen in `src/shared/ipc/*` bleiben unverändert (abhängig von T023)
- [X] T025 [US1] `src/main/index.ts`: `DataSource` statt `Database` halten (`startDatabase()` wird `async`), `installMenu(path)` mit dem Dateipfad, beim Beenden `await dataSource.destroy()` (abhängig von T024; verwendet bis T037 vorläufig `createDataSource` + `runMigrations`, danach `openAndMigrate`)

**Checkpoint**: Alle Tests aus T018/T019 grün (ausser Unveränderlichkeits-/Trigger-Tests, die in US3 neu geschrieben werden).

---

## Phase 4: User Story 3 – Unveränderlichkeit im Code (P1)

**Goal**: Garantien der früheren Trigger/CHECKs gelten in der Persistenzschicht, ohne Umgehungspfad.

**Independent Test**: Jeder Schreibpfad lehnt Verstösse ab; 100 parallele Ausstellvorgänge ohne Lücken/Duplikate.

### Tests (zuerst)

- [X] T026 [P] [US3] `tests/integration/immutability.test.ts` neu schreiben: statt Roh-SQL Aufrufe der Persistenzschicht; jede bisher per Trigger abgelehnte Änderung (alle Inhaltsfelder, Löschen, Positionen einfügen/ändern/löschen, ungültiger Statuswechsel `cancelled → paid` usw.) wirft `AppException('IMMUTABLE', …)` und lässt die Daten unverändert; erlaubte Übergänge (`issued → paid`, `paid → issued`, `→ cancelled`) bleiben möglich; zusätzlich Fehlerabbildung (FR-010): doppelte Rechnungsnummer und doppelte `(invoice_id, position)` werden als `AppException` mit der bisherigen deutschen Meldung zurückgegeben, nicht als rohe `QueryFailedError`
- [X] T027 [P] [US3] `tests/integration/rule-parity.test.ts`: für **jede** frühere CHECK-Regel aus `src/main/db/migrations/001_init.sql` ein Test (Längen 70/16/35/21/500, Landcode genau 2 Zeichen, Präfix-Muster `[A-Z0-9-]` 1–10, Zahlungsfrist 0–365, `due_date >= invoice_date`, `total_rappen >= 0`, Menge `> 0`, Preise/Beträge `>= 0`, `position >= 1`, Entwurf hat keine Nummer, ausgestellt hat Nummer/Jahr/Folge/Referenz/Typ/`issued_at` und Total `> 0`); Test läuft gegen frische DB
- [X] T028 [P] [US3] `tests/integration/concurrency.test.ts`: 100 parallele `issue()`-Aufrufe auf 100 Entwürfen (zwei Jahre gemischt) → lückenlose, doppelfreie Nummern pro Jahr; parallel `issue()` + `saveDraft()` derselben Rechnung → genau ein Vorgang gewinnt, Daten konsistent; 100 aufeinanderfolgende `issue()`-Aufrufe ohne Lücken/Duplikate; Abbruchfälle: Fehler beim Speichern einer Position (z. B. Position 3 ungültig) → Rechnung und Positionen unverändert, Fehler beim Ausstellen → Zähler unverändert und Rechnung bleibt Entwurf (SC-004, FR-007)
- [X] T029 [P] [US3] `tests/unit/architecture.test.ts`: kein Import von `typeorm`/Entitäten ausserhalb `src/main/db/` und `tests/` (R5); `src/main/db/` exportiert weder `EntityManager` noch Entitäten; zusätzlich durchsucht der Test `src/` nach SQLite-Spezifika (`PRAGMA`, `sqlite_`, `RETURNING`, `ON CONFLICT`, `DROP TRIGGER`, `better-sqlite3`) und erlaubt Treffer nur in `src/main/db/sqlite-adapter.ts` und `src/main/db/migrations/1700000000003-DropLegacyTriggers.ts` (SC-006, FR-015)

### Umsetzung

- [X] T030 [P] [US3] Fehlende Prüfregeln in `src/shared/domain/` ergänzen (`customer.ts`, `settings.ts`, `invoice.ts`, `address.ts`): Feldlängen, Landcode, Präfix-Muster, Zahlungsfrist, Datumsreihenfolge, Beträge/Mengen, Positionsnummer; gleiche deutsche Meldungen wie bisher; reine Funktionen, test-first (T027)
- [X] T031 [US3] `src/main/db/invoice-repository.ts`: Garantien einbauen: `canTransition`/`canDelete` aus `src/shared/domain/invoice-status.ts` vor jedem Statuswechsel, Schreiben nur als bedingtes `UPDATE … WHERE id = ? AND status = ?` mit `affected`-Prüfung (0 → `AppException('IMMUTABLE')`), Positionen nur schreiben/löschen, wenn die Rechnung in derselben Transaktion `draft` ist, `markPaid/reopen/cancel` ändern ausschliesslich ihre festgelegten Spalten, `issue` prüft `draft` und Pflichtfelder (abhängig von T030)
- [X] T032 [US3] Repositories und Services rufen die Validierungen aus T030 vor jedem Schreiben auf (`src/main/db/customer-repository.ts`, `settings-repository.ts`, `invoice-repository.ts`); Datenbankfehler (Unique-Verletzung) laufen über `toAppException` (T015)
- [X] T033 [US3] `src/main/db/` Exporte beschränken: nur Repositories, `createDataSource`, `openAndMigrate`, `UnitOfWork`, Fehlerabbildung; Entitäten/`EntityManager` bleiben modulintern (R5, T029)

**Checkpoint**: T026–T029 grün, Alt-Trigger-Tests ersetzt.

---

## Phase 5: User Story 2 – Bestehende Datenbank bleibt nutzbar (P1)

**Goal**: Version-2-Dateien öffnen ohne Datenverlust, ab dann TypeORM-Migrationsstand.

**Independent Test**: Bestandsdatei (mit altem Stand erzeugt) wird geöffnet; alle Daten vorhanden; Nummern setzen fort; zweiter Start ohne erneute Baseline.

### Tests (zuerst)

- [X] T034 [P] [US2] Fixture-Erzeugung `tests/fixtures/legacy-db.ts`: baut eine Version-2-Datenbank mit den **alten** SQL-Dateien (001/002 aus `src/main/db/migrations/*.sql` vor Löschung nach `tests/fixtures/legacy-migrations/` kopieren), `user_version = 2`, Testdaten (Kunden, Entwurf, ausgestellte und bezahlte Rechnung, Zähler, Geoapify-Schlüssel-Blob)
- [X] T035 [P] [US2] `tests/integration/baseline.test.ts`: Bestandsdatei öffnen → alle Datensätze identisch, `swissbill.db.bak-2` vorhanden, Tabelle `migrations` enthält die ersten zwei Einträge, Alt-Trigger entfernt, nächste Rechnungsnummer = Folgenummer + 1, zweiter Start legt keine neue Kopie und keine zweite Baseline an und `runMigrations` führt danach nur `DropLegacyTriggers` bzw. nichts mehr aus (keine Meldung «Migration ausstehend»); Regel-Parität-Tests (T027) zusätzlich gegen die Bestandsvariante laufen lassen
- [X] T036 [P] [US2] `tests/integration/migrate.test.ts` und `tests/integration/corrupt-db.test.ts` umschreiben: Datei mit unbekannter ausgeführter Migration → `DatabaseStartupError('too-new')`, beschädigte/Nicht-DB-Datei → `corrupt`, nicht lesbar → `unreadable`; in allen Fällen Datei unverändert; fehlgeschlagene Migration → Rollback + Kind `migration`; Erststart legt neue Datenbank an

### Umsetzung

- [X] T037 [US2] `src/main/db/startup.ts` neu: `openAndMigrate(path)` (async) gemäss research.md R8: `existsSync` → `verifyIntegrity` (T012) → `initialize()` → Fall unterscheiden (neu / TypeORM-Datei / Bestand Version 2 / zu neu) → Bestand: Kopie `.bak-2`, Tabelle `migrations` (Spalten `id` auto-increment, `timestamp` bigint, `name` varchar – so wie TypeORM sie selbst anlegt; die Tabelle möglichst über `queryRunner.createMigrationsTableIfNotExist` bzw. denselben Mechanismus von TypeORM erzeugen) anlegen, `InitSchema1700000000001` und `AddGeoapifyKey1700000000002` (exakt die Klassennamen inkl. Zeitstempel) mit ihren Zeitstempeln als ausgeführt eintragen, alles in einer Transaktion; TypeORM-Datei mit ausstehenden Migrationen: Kopie `.bak-<n>`; dann `runMigrations({ transaction: 'each' })`; `DatabaseStartupError` und deutsche Texte unverändert; bei Fehlern `destroy()`
- [X] T038 [US2] Alte Dateien entfernen: `src/main/db/connection.ts`, `functions.ts`, `migrate.ts`, `src/main/db/migrations/*.sql` (die SQL-Dateien nur nach T034 entfernen); Referenzen bereinigen (`grep -rn "better-sqlite3\|openDatabase\|migrate'" src tests`)

---

## Phase 6: User Story 4 – Sicherung und Migrationen (P2)

**Goal**: Ein-Datei-Backup funktioniert; Migrationen nur über TypeORM, atomar.

**Independent Test**: Backup-Datei enthält alle Daten; defekte Migration hinterlässt DB unverändert.

- [X] T039 [P] [US4] `tests/integration/backup.test.ts` anpassen: Backup einer Datei-DB mit Daten → Zieldatei öffnen, alle Datensätze vorhanden, keine `-wal`/`-shm`-Dateien, Ziel gleich Datenbankdatei wird abgelehnt (SC-007)
- [X] T040 [US4] `src/main/services/backup-service.ts` auf `DataSource` umstellen: `info()` liefert Pfad, Dateigrösse und Schemastand (Anzahl ausgeführter Migrationen aus Tabelle `migrations`, `DbInfo` in `src/shared/ipc/db.ts` bleibt kompatibel), `backup()` über `backupTo` (T012); Fehlertexte unverändert (abhängig von T039)
- [X] T041 [P] [US4] `tests/integration/migrations.test.ts`: künstliche zusätzliche Migration, die mittendrin fehlschlägt → Datenbank bleibt auf altem Stand, Meldung «Die Änderungen wurden zurückgerollt»; Migrationen laufen in Reihenfolge; `synchronize` ist `false` (Test auf `dataSource.options`)

---

## Phase 7: User Story 5 – Dokumentierte Entscheidungen (P2)

**Goal**: Jede Fähigkeit aus FR-009 hat eine dokumentierte Entscheidung samt Test.

**Independent Test**: Tabelle vollständig und jede Zeile verweist auf einen existierenden Test.

- [X] T042 [US5] `specs/005-typeorm-persistence/research.md` um Abschnitt «Umsetzungsnachweis» ergänzen: Tabelle FR-009 Nr. 1–8 → Umsetzung → Testdatei; `grep` prüft, dass jede genannte Testdatei existiert
- [X] T043 [P] [US5] Kurzdokument `docs/persistence.md` (oder Abschnitt im bestehenden README unter dem Projekt-Wurzelverzeichnis): wie Entitäten, Migrationen (neue Migration anlegen) und Regeln im Code zusammenspielen, Datenbankort, Backup, bekannter Unterschied zwischen frischen und migrierten Dateien (Alt-CHECKs), Hinweis auf SQLite-Adapter

---

## Phase 8: Polish & Querschnitt

- [X] T044 `npm run typecheck && npm run lint && npm test` grün; keine Abschwächung bestehender Assertions (`git diff -- tests` prüfen)
- [X] T045 `npm run test:e2e` grün (Playwright, inkl. `persistence.e2e.ts`, `create-invoice.e2e.ts`, `packaged.e2e.ts`)
- [X] T046 `npm run package` und Start der gepackten App: TypeORM wird geladen, Datenbank öffnet (R12)
- [X] T047 Quickstart-Durchlauf `specs/005-typeorm-persistence/quickstart.md` Schritte 3–4 von Hand (Bestandsdatei mit Stand von `main` erzeugen und mit neuem Build öffnen), Ergebnis in der PR-Beschreibung festhalten
- [X] T048 [P] Ungenutzte Abhängigkeits-/Importreste bereinigen (`@types/better-sqlite3` bleibt für den Adapter), CI-Workflows unter `.github/workflows/` auf TypeORM-Installation prüfen (kein zusätzlicher manueller Schritt, FR-013)
- [X] T049 Letzter Verfassungs-Check gegen v1.2.0 (Prinzipien I–V) und Eintrag in `plan.md` («Post-Implementierung: Pass»)

---

## Dependencies & Execution Order

- Setup (T001–T003) → Foundational (T004–T017) → **US1** (T018–T025) → **US3** (T026–T033) → **US2** (T034–T038) → US4 (T039–T041) → US5 (T042–T043) → Polish (T044–T049).
- T025 braucht `openAndMigrate` aus T037 (US2); bis dahin nutzt `index.ts` vorläufig `createDataSource` + `runMigrations`; T037 ersetzt dies.
- US4 und US5 sind unabhängig voneinander und von US2 ab T037 parallel möglich.
- Gate: T001 muss grün sein, bevor weitere Tasks starten.

## Parallel Opportunities

- Foundational: T004–T008 (Entitäten), T009–T011 (Migrationen), T014, T015, T017 parallel.
- US1: T018, T019, T020, T021 parallel; T022 danach.
- US3: T026–T030 parallel (Tests und Domänenregeln), dann T031–T033.
- US2: T034–T036 parallel.

## Implementation Strategy

- **MVP**: US1 + US3 + US2 zusammen (ein Merge); einzeln wäre der Stand unsicher (US1 allein: keine Garantien; US2 allein: kein lauffähiger Datenzugriff).
- Inkrementell: Grundlagen → US1 grün (ausser Trigger-Tests) → US3 grün → US2 → Rest.
- Test-first: Jede Phase beginnt mit ihren Tests (T018/19, T026–T029, T034–T036).
