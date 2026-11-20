---
description: "Aufgabenliste: Weitere Datenbanktypen (PostgreSQL, MySQL/MariaDB)"
---

# Tasks: Weitere Datenbanktypen (PostgreSQL, MySQL/MariaDB)

**Input**: Design-Dokumente aus `/specs/006-additional-database-types/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/{connection-ipc,credential-store,db-adapter}.md, quickstart.md; Verfassung v1.4.0

**Tests**: Enthalten. Verfassung Prinzip IV (test-first) und SC-002…SC-006 verlangen Nachweise. Tests einer Gruppe werden zuerst geschrieben und MÜSSEN fehlschlagen, bevor die Umsetzung beginnt. Server-Tests laufen nur, wenn die Umgebungsvariablen aus `quickstart.md` gesetzt sind; SQLite-Tests laufen immer.

**Organisation**: Nach User Stories gruppiert. US1 und US2 sind P1 und gehören zusammen in einen Merge (ohne sichere Passwortablage darf die Serververbindung nicht ausgeliefert werden). Reihenfolge: Setup → Grundlagen → US2 (Passwort) → US1 (Verbindung, Mehrgeräte) → US3 → US4 → Polish.

## Format: `[ID] [P?] [Story] Beschreibung`

- **[P]**: parallel ausführbar (andere Dateien, keine Abhängigkeit zu offenen Aufgaben)
- **[Story]**: zugehörige User Story (US1…US4)
- Pfade relativ zum Repository-Wurzelverzeichnis

## Phase 1: Setup

**Purpose**: Abhängigkeiten klären, Testumgebung vorbereiten

- [ ] T001 `pg`, `mysql2` und `@napi-rs/keyring` mit exakten Versionen installieren (`package.json`, `package-lock.json`) und Gate R1 prüfen: Wegwerf-Skript, das mit TypeORM 1.1.x je eine `DataSource` für `type: 'postgres'`, `'mysql'` und `'mariadb'` (mysql2) gegen Test-Server initialisiert, eine Tabelle anlegt und liest; zusätzlich `@napi-rs/keyring` einen Eintrag schreiben/lesen/löschen lassen. Ergebnis in `specs/006-additional-database-types/research.md` (R1) festhalten. Falls `type: 'mariadb'` einen anderen Treiber verlangt, `type: 'mysql'` auch für MariaDB verwenden und das in R1 vermerken
- [ ] T002 [P] `docker-compose.yml` im Repository-Wurzelverzeichnis anlegen: `postgres:16` (Port 55432), `mysql:8` (53306), `mariadb:11` (53307), Benutzer/Passwort/Datenbank `swissbill`/`test`/`swissbill` gemäss `quickstart.md` (nur Testdaten)
- [ ] T003 [P] `electron-builder.yml` und `electron.vite.config.ts` prüfen: `pg`, `mysql2` und `@napi-rs/keyring` werden mitgeliefert (`@napi-rs/keyring` mit seinen plattformspezifischen Binaries, falls nötig in `asarUnpack`); `npm run package` bleibt grün. Ergebnis in `research.md` (R1) ergänzen
- [ ] T004 [P] ESLint-Regel in `eslint.config.mjs` ergänzen: `no-restricted-imports` für `pg`, `mysql2`, `better-sqlite3` und `@napi-rs/keyring` ausserhalb von `src/main/db/adapters/**`, `src/main/keyring-credential-store.ts` und `tests/**`

---

## Phase 2: Grundlagen (blockiert alle User Stories)

**Purpose**: Adapter-Schicht, portables Schema, Konfigurationsmodell, Testhelfer

- [ ] T005 [P] Test-Hilfe `tests/integration/helpers/db-targets.ts`: liefert die verfügbaren Ziele (`sqlite` immer als `:memory:`; `postgres`/`mysql`/`mariadb` nur, wenn `SWISSBILL_TEST_PG_URL` / `SWISSBILL_TEST_MYSQL_URL` / `SWISSBILL_TEST_MARIADB_URL` gesetzt sind), erzeugt pro Test ein eigenes leeres Schema/eine eigene Datenbank und räumt auf; nicht gesetzte Ziele werden als «übersprungen» gemeldet; `tests/fixtures/db.ts` nimmt ein Ziel entgegen, damit bestehende Integrationstests parametrisiert werden können
- [ ] T006 [P] Unit-Test `tests/unit/db-connection.test.ts` (zuerst, muss fehlschlagen) für `src/shared/domain/db-connection.ts`: `type` ∈ `'sqlite' | 'postgres' | 'mysql' | 'mariadb'`; Server: `host` Pflicht 1–255 Zeichen und nicht nur Leerzeichen, `port` ganzzahlig 1–65535, `database` Pflicht 1–64 Zeichen, `user` Pflicht 1–64 Zeichen; `tls.enabled` Standard `true`; `tls.caPath` nur wenn `enabled`; `version` ≠ 1 → Fehler; Standardports 5432 / 3306 / 3306; deutsche Feldfehlermeldungen; Sonderzeichen (`@ : / ß` und Leerzeichen) in `user`/`database` bleiben unverändert erlaubt
- [ ] T007 [P] `src/shared/domain/db-connection.ts` implementieren: Typen `DbType`, `DbConnectionSettings`, `defaultPort(type)`, `validateConnection(settings)` gemäss T006 und `data-model.md` Abschnitt 1
- [ ] T008 [P] `src/shared/ipc/db-connection.ts` anlegen: Typen `DbConnectionState`, `DbConnectionInput`, `DbConnectionTestResult` exakt nach `contracts/connection-ipc.md`; in `src/shared/ipc/api.ts` die Kanalnamen `dbConnection:get/test/save/useLocalOnce/retry`, `app:relaunch`, `locks:acquire/heartbeat/release` zu `CHANNELS` und die Typen zu `SwissbillApi` hinzufügen; Fehlercodes `KEYCHAIN_UNAVAILABLE`, `CONNECTION`, `SCHEMA_NEWER`, `SCHEMA_FOREIGN`, `LOCK_LOST`, `LOCKED` in `src/shared/ipc/errors.ts` ergänzen
- [ ] T009 `src/main/db/sqlite-adapter.ts` nach `src/main/db/adapters/sqlite.ts` verschieben (Inhalt unverändert, alle Importe in `src/main/db/data-source.ts`, `src/main/db/startup.ts`, `src/main/services/backup-service.ts`, `tests/unit/architecture.test.ts`, `tests/integration/settings-key.test.ts` anpassen); `npm test` bleibt grün
- [ ] T010 `src/main/db/adapters/index.ts` mit der Schnittstelle `DbAdapter` und `adapterFor(type)` nach `contracts/db-adapter.md`; `sqlite.ts` implementiert sie (`withMigrationLock` ohne Sperre, `countForeignTables` über `sqlite_master`, `file`-Teil für Integrität/Kopie/Backup). Der Server-Adapter wird nur per dynamischem Import geladen, wenn die Konfiguration einen Servertyp enthält (FR-002)
- [ ] T011 [P] Test `tests/integration/schema-parity.test.ts` erweitern (zuerst, muss fehlschlagen): SQLite-Schema bleibt unverändert (Vergleich mit dem bisherigen Schema); auf jedem Ziel aus T005 existieren nach den Migrationen logisch dieselben Tabellen, Spalten, Primär-/Fremdschlüssel und Unique-Indizes (`uq_invoice_items_position`, `UNIQUE(number)`); Betragsspalten sind 64-Bit-fähig (Wert 99 999 999 999 wird gespeichert und exakt als `number` gelesen)
- [ ] T012 In `src/main/db/migrations/1700000000001-InitSchema.ts` die Spaltentypen **nach Treiber** wählen (research R2): bei `better-sqlite3` bleiben die bisherigen Typen (`text`/`integer`) exakt erhalten (kein verändertes SQLite-Schema, keine rückwirkende Änderung); nur für Server-Treiber (`postgres`, `mysql`, `mariadb`, ermittelt über `queryRunner.connection.options.type`) gilt: begrenzte Textfelder `varchar(n)` mit den Längen der bestehenden Validierungsregeln (70/16/35/21, Status, Nummer, Referenz, Präfix), Zeitstempel und Datumsfelder `varchar(32)`, unbegrenzte Freitexte (`closing_text`, `default_closing_text`, `notes`) `text` ohne Default; Betragsspalten `total_rappen`, `unit_price_rappen`, `amount_rappen`, `quantity_milli` als `bigint`; Klassenname und Reihenfolge bleiben
- [ ] T013 Spalten-Transformer `bigintToNumber` (String → `number`, `null` bleibt `null`) in `src/main/db/entities/column-transformers.ts` und in `invoice.entity.ts` (`total_rappen`) sowie `invoice-item.entity.ts` (`quantity_milli`, `unit_price_rappen`, `amount_rappen`) verwenden (wirkt nur bei Server-Treibern, bei SQLite sind die Werte schon `number`); `settings.entity.ts` bleibt unverändert
- [ ] T014 `src/main/db/data-source.ts`: `createDataSource` nimmt einen `DbAdapter` samt Einstellungen/Passwort statt fest SQLite (`createDataSource(adapter, settings, password, migrations)`); bestehender Aufruf für SQLite bleibt als Komfortfunktion erhalten; `synchronize: false`, `migrationsRun: false` unverändert
- [ ] T015 [P] Interface `src/main/credential-store.ts` nach `contracts/credential-store.md` (`isAvailable`, `get`, `set`, `delete`) und Speicher-Ersatz `tests/fixtures/credential-store.ts` (analog `tests/fixtures/secret-store.ts`)
- [ ] T016 [P] `src/main/db/connection-config.ts`: Lesen/Schreiben von `userData/db-connection.json` (atomar über temp-Datei + Rename, `version: 1`, Passwort kommt nie vor); fehlende Datei = lokal; Datei mit höherer `version` wird nicht gelesen und führt zu einer Meldung zum Update; Test `tests/unit/connection-config.test.ts` zuerst (inkl. «Passwortfeld wird beim Schreiben verworfen, auch wenn übergeben»)
- [ ] T017 Datenbankmigration `src/main/db/migrations/1700000000004-AddEditLocks.ts` und `src/main/db/entities/edit-lock.entity.ts` nach `data-model.md` Abschnitt 3: Tabelle `edit_locks` mit `entity_type varchar(16)`, `entity_id integer` (zusammen Primärschlüssel), `owner_id varchar(36)`, `owner_label varchar(100)`, `acquired_at timestamp`, `heartbeat_at timestamp`; `down()` leer (nur vorwärts); Entität in `data-source.ts` registrieren; Schema-Parity-Test (T011) um die Tabelle erweitern

**Checkpoint**: Die App läuft unverändert mit SQLite über die Adapter-Schicht; `npm test`, `npm run typecheck`, `npm run lint` grün.

---

## Phase 3: User Story 2 – Zugangsdaten sicher im Betriebssystem ablegen (Priority: P1)

**Goal**: Passwort wird einmal eingegeben, liegt nur im Schlüsselbund und erscheint nirgends sonst.

**Independent Test**: Nach dem Speichern ist das Passwort in keiner Datei unter `userData`, keiner Sicherung und keinem Log auffindbar, aber im Schlüsselbund lesbar.

### Tests (zuerst, müssen fehlschlagen)

- [ ] T018 [P] [US2] `tests/unit/credential-store.test.ts`: `set` ohne verfügbaren Schlüsselbund wirft `KEYCHAIN_UNAVAILABLE` und schreibt nirgends hin; `delete` ist idempotent; `get` ohne Eintrag liefert `null`
- [ ] T019 [P] [US2] `tests/integration/credential-leak.test.ts`: nach `dbConnection:save` mit Passwort mit Sonderzeichen (`p@ss:w/rd ü"'`) enthält keine Datei unter dem Test-`userData`-Ordner, keine Backup-Datei, kein Log und keine Fehlermeldung das Passwort (rekursive Suche, SC-004)
- [ ] T020 [P] [US2] `tests/unit/connection-service.test.ts`: `password.action` `keep`/`set`/`remove` verhalten sich nach `contracts/connection-ipc.md`; `get()`-Zustand meldet nur `passwordStored` (nie das Passwort); fehlt der Eintrag bei bestehender Konfiguration mit Benutzer → Zustand «Passwort fehlt, bitte neu eingeben»

### Umsetzung

- [ ] T021 [US2] `src/main/keyring-credential-store.ts`: Implementierung mit `@napi-rs/keyring` (Dienst `swissbill`, Konto `db-connection`); `isAvailable()` per Probeeintrag schreiben/lesen/löschen; `set` ohne Verfügbarkeit wirft `AppException('KEYCHAIN_UNAVAILABLE', …)` mit deutscher Meldung, kein Datei-Fallback; Fabrik `createCredentialStore(env, packaged)` (der echte Schlüsselbund wird nur im Spike T001 und manuell nach `quickstart.md` geprüft, in CI läuft der Speicher-Ersatz) mit Speicher-Ersatz nur wenn `!packaged` und `SWISSBILL_CREDENTIAL_STORE=memory`
- [ ] T022 [US2] `src/main/services/connection-service.ts`: `getState()`, `save(input)` (validiert mit `validateConnection`, schreibt Konfiguration über `connection-config.ts`, setzt/entfernt Passwort über `CredentialStore`, liefert `{ restartRequired: true }`), `remove()` beim Wechsel auf lokal löscht auch den Schlüsselbund-Eintrag (FR-008); Passwort wird nie geloggt (Logger-Filter in `src/main/log.ts` maskiert bekannte Passwortwerte)
- [ ] T023 [US2] `src/main/ipc/db-connection.ts`: Kanäle `dbConnection:get` und `dbConnection:save` mit `zod`-Eingabevalidierung; zusätzlich `dbConnection:pickCaFile` (Dateidialog `.pem`/`.crt` im Main, prüft Lesbarkeit und PEM-Inhalt, Fehler als `{ error }`) und `app:relaunch` (`app.relaunch()` + `app.exit()`); Registrierung in `src/main/ipc/register.ts` als neue Funktion `registerConnectionIpc(deps)` und **Verdrahtung in `src/main/index.ts` vor dem Datenbankstart** (damit US2 ohne US1 lauffähig und testbar ist); Preload `src/preload/index.ts` um `dbConnection` und `app.relaunch` erweitern
- [ ] T024 [P] [US2] `src/renderer/components/DbConnectionForm.tsx` (Passwort-Teil): Passwortfeld leer mit Hinweis «gespeichert», Aktionen «Ersetzen» und «Entfernen», Meldung bei nicht verfügbarem Schlüsselbund (Speichern deaktiviert); Passwort wird nur beim Speichern gesendet und danach aus dem Zustand gelöscht
- [ ] T025 [US2] E2E `tests/e2e/db-connection-password.e2e.ts`: Passwort speichern → Einstellungen erneut öffnen zeigt «gespeichert» und leeres Feld; Entfernen löscht den Eintrag (Speicher-Ersatz)

**Checkpoint**: US2 abgeschlossen: Passwort sicher gespeichert; noch keine Serververbindung nutzbar.

---

## Phase 4: User Story 1 – Mit einem Datenbankserver verbinden (Priority: P1) 🎯 MVP

**Goal**: Mit PostgreSQL, MySQL oder MariaDB arbeiten, mit denselben Garantien wie lokal, auch mit mehreren Geräten.

**Independent Test**: Gegen je einen Server Verbindung einrichten, Kunde anlegen, Rechnung ausstellen, PDF erzeugen; Daten sind nach Neustart vorhanden; 100 parallele Ausstellvorgänge über mehrere simulierte Geräte ohne Lücken/Duplikate.

### Tests (zuerst, müssen fehlschlagen)

- [ ] T026 [P] [US1] `tests/integration/matrix/numbering.test.ts`: je Ziel 100 parallele `issue()` über mindestens 3 unabhängige `DataSource`-Instanzen (simulierte Geräte) → Nummern lückenlos und ohne Duplikate (SC-003); erster Vorgang des Jahres bei leerem Zähler konkurrierend → genau eine Zählerzeile, keine Fehlermeldung nach aussen (auch nicht auf PostgreSQL); künstlich erzeugte Deadlocks/Serialisierungsfehler führen nach Wiederholung zum Erfolg oder zu `IO`
- [ ] T027 [P] [US1] `tests/integration/matrix/immutability.test.ts`: die bestehenden Tests aus `tests/integration/immutability.test.ts` und `status.test.ts` laufen über alle Ziele (Änderungs-/Löschversuch ausgestellter Rechnung, ungültige Statuswechsel, Nummernvergabe nicht umgehbar)
- [ ] T028 [P] [US1] `tests/integration/matrix/search.test.ts`: Suche «müller»/«ZÜRICH» findet «Müller»/«Zürich» auf allen Zielen; `tests/integration/matrix/money.test.ts`: Rechnung mit Gesamtbetrag `MAX_TOTAL_RAPPEN` (99 999 999 999) wird exakt gespeichert und gelesen, Umlaute und Sonderzeichen in Texten bleiben unverändert (Zeichensatz), Zeitstempel unverändert (Zeitzone)
- [ ] T029 [P] [US1] `tests/integration/matrix/migration.test.ts`: leere Datenbank → Schema wird angelegt; zweiter Start ohne ausstehende Migration verändert nichts; Datenbank mit fremden Tabellen und ohne `migrations`-Tabelle → `DatabaseStartupError` Art `foreign`, nichts verändert; `migrations`-Tabelle mit unbekanntem Eintrag → Art `too-new`, nichts verändert; zwei gleichzeitig startende Geräte → jede Migration wird genau einmal ausgeführt (Migrationssperre, FR-010a)
- [ ] T030 [P] [US1] `tests/integration/matrix/settings-key.test.ts`: auf Servern wird der Geoapify-Schlüssel als UTF-8-Bytes gespeichert und gelesen (FR-006a), lokal bleibt er OS-verschlüsselt (Verhalten unverändert); alle anderen Einstellungen sind für zwei `DataSource`-Instanzen derselben Datenbank sichtbar
- [ ] T031 [P] [US1] `tests/integration/matrix/locks.test.ts` und `tests/unit/lock-expiry.test.ts`: Erwerb frei → ok; zweiter Erwerb → `{ ok: false, ownerLabel }`; Heartbeat verlängert; nach 5 Minuten ohne Heartbeat (im Test wird `heartbeat_at` per SQL auf einen Zeitpunkt > 300 s vor der Serverzeit zurückgesetzt) ist die Sperre abgelaufen und erwerbbar; Speichern mit abgelaufener/fremder Sperre wirft `LOCK_LOST` und schreibt nichts; Freigabe beim Speichern; abgelaufene Sperre blockiert nicht dauerhaft; bei lokalem SQLite sind alle Aufrufe wirkungslos `ok: true`
- [ ] T032 [P] [US1] `tests/unit/architecture.test.ts` erweitern: Treiberimporte (`pg`, `mysql2`, `better-sqlite3`, `@napi-rs/keyring`) nur in `src/main/db/adapters/` und `src/main/keyring-credential-store.ts`; ohne `db-connection.json` wird der Server-Adapter nie geladen und es entsteht keine Netzwerkverbindung (Test mit Stub-Adapter, FR-002/SC-006)

### Umsetzung

- [ ] T033 [P] [US1] `src/main/db/adapters/postgres.ts`: `dataSourceOptions` (einzelne Optionen, keine URL; TLS: `ssl: { rejectUnauthorized: true, ca? }`, ohne TLS `ssl: false`; Verbindungs-Timeout 10 s, Pool max. 4), `withMigrationLock` über `pg_advisory_lock`/`pg_advisory_unlock` (feste Schlüsselnummer) auf einem eigens gehaltenen `QueryRunner`, der während der ganzen Migration offen bleibt (Sperre gilt pro Verbindung, nicht aus dem Pool wechseln), `countForeignTables` über `information_schema.tables` des aktuellen Schemas, `lockExpiry`/`touchLock` mit `CURRENT_TIMESTAMP` und Serverzeit-Vergleich in einer Abfrage
- [ ] T034 [P] [US1] `src/main/db/adapters/mysql.ts` (bedient `mysql` und `mariadb`): wie T033 für `mysql2` (`ssl: { rejectUnauthorized: true, ca? }`, `connectTimeout` 10 s, Zeichensatz `utf8mb4`), `withMigrationLock` über `GET_LOCK` (60 s Wartezeit)/`RELEASE_LOCK` auf einem eigens gehaltenen `QueryRunner`, der während der ganzen Migration offen bleibt (Sperre gilt pro Verbindung), `countForeignTables` über `information_schema.tables` der aktuellen Datenbank, Serverzeit über `CURRENT_TIMESTAMP`
- [ ] T035 [US1] `src/main/db/startup.ts`: Migration unter `adapter.withMigrationLock`, danach Stand erneut lesen (zweites Gerät); Fremd-DB-Erkennung über `countForeignTables` (nicht leer ohne `migrations`-Tabelle → `DatabaseStartupError('foreign', …)` mit deutscher Meldung, Datenbank unverändert); `too-new` und `migration` Meldungen ohne Dateipfad für Server (stattdessen `host/database`); Vor-Migrations-Kopie und Integritätscheck nur über `adapter.file` (lokal)
- [ ] T036 [US1] Nummernvergabe in `src/main/db/invoice-repository.ts` für Server absichern: `UPDATE number_counters SET last_seq = last_seq + 1 WHERE year = ?` in der Transaktion; die Zählerzeile des Jahres wird **vorher** in einer eigenen kurzen Transaktion angelegt (`INSERT`, Schlüsselkonflikt wird ignoriert, weil in PostgreSQL ein Unique-Fehler die laufende Transaktion unbrauchbar macht, research R8); bei Deadlock/Serialisierungsfehler (PostgreSQL `40P01`/`40001`, MySQL/MariaDB `1213`/`1205`) bis zu 3 Wiederholungen mit neuer Transaktion, danach `AppException('IO', …)`; `UnitOfWork` bildet Verbindungsfehler (`ECONNRESET`, `ECONNREFUSED`, Timeout) auf `AppException('IO', …)` ab, Transaktion wird zurückgerollt (FR-012)
- [ ] T037 [US1] `src/main/db/settings-repository.ts`: `SettingsKeyCodec` (lokal: `SecretStore`-Verschlüsselung wie bisher; Server: UTF-8-Bytes im Feld `geoapify_api_key`), Auswahl über den Datenbanktyp der aktiven `DataSource`; `readApiKey`/`saveApiKey` nutzen den Codec; Schlüssel verlässt den Main-Prozess weiterhin nur Richtung Geoapify
- [ ] T038 [P] [US1] `src/main/db/lock-repository.ts` und `src/main/services/lock-service.ts`: `acquire` (Transaktion: abgelaufene Sperre des Datensatzes löschen, `INSERT`, Schlüsselkonflikt = belegt), `heartbeat` (`touchLock`), `release`, `assertOwned(manager, key, ownerId)` für Schreibpfade; `owner_id` = UUID pro App-Start, `owner_label` = Rechnername; Ablauf 300 Sekunden; bei SQLite No-Op
- [ ] T039 [US1] Schreibpfade in `src/main/db/customer-repository.ts` und `src/main/db/invoice-repository.ts` (`saveDraft`, `deleteDraft`, Kundenänderung/-löschen mit bestehender `id`): im selben Transaktionsschritt `assertOwned` aufrufen, sonst `AppException('LOCK_LOST', …)`; neue Datensätze (ohne `id`), Statuswechsel und ausgestellte Rechnungen brauchen keine Sperre; Löschen eines Datensatzes entfernt seine Sperre mit
- [ ] T040 [US1] `src/main/ipc/locks.ts`: Kanäle `locks:acquire`/`locks:heartbeat`/`locks:release` nach `contracts/connection-ipc.md`; Registrierung nach dem Datenbankstart in `src/main/ipc/register.ts`; Preload erweitern
- [ ] T041 [US1] `src/main/db/connect.ts`: `openActiveDatabase()` liest Konfiguration (`connection-config.ts`), holt das Passwort aus dem `CredentialStore` (nur hier, fehlt es bei gesetztem Benutzer → `AppException('CONNECTION', …)` «Passwort fehlt, bitte neu eingeben», nie mit leerem Passwort verbinden), wählt den Adapter und ruft `openAndMigrate` auf; ohne Datei lokal wie bisher
- [ ] T042 [US1] `src/main/index.ts`: `startDatabase()` nutzt `openActiveDatabase()`; Verbindungs-IPC vor dem Start registrieren (T023); Datenbankabhängige Kanäle erst nach Erfolg; `databasePath`/`installMenu` nur bei lokaler Datenbank
- [ ] T043 [P] [US1] `src/renderer/lib/use-edit-lock.ts`: Hook, der beim Öffnen eines Kunden/Entwurfs `locks:acquire` ruft, alle 60 s `locks:heartbeat`, beim Verlassen/Speichern `locks:release`; Ergebnis `{ readOnly, ownerLabel }`; bei `heartbeat ok:false` wird der Editor schreibgeschützt mit Hinweis und Speichern verhindert
- [ ] T044 [US1] `src/renderer/components/LockBanner.tsx` und Anbindung in `src/renderer/pages/InvoiceEditor.tsx` und `src/renderer/pages/Customers.tsx`: schreibgeschützt mit Hinweis «wird von <Rechner> bearbeitet»; `LOCK_LOST`-Fehler beim Speichern zeigt verständliche Meldung und lässt die Eingaben stehen
- [ ] T045 [US1] `src/renderer/components/DbConnectionForm.tsx` (Verbindungsteil) und Bereich «Datenbank» in `src/renderer/pages/Settings.tsx`: Typ-Auswahl (Lokal, PostgreSQL, MySQL, MariaDB) mit vorbelegtem Standardport, Felder Server/Port/Datenbank/Benutzer/TLS, optionaler CA-Zertifikatspfad (Auswahl über `dbConnection:pickCaFile`, Fehlermeldung bei ungültiger Datei), dauerhafte Warnung bei ausgeschaltetem TLS («Daten und Passwort werden unverschlüsselt übertragen», FR-003a), Speichern → Hinweis «Neustart erforderlich» und `app:relaunch` (FR-014); Validierung über `validateConnection`
- [ ] T046 [US1] Deutsche Texte und Zugänglichkeit (Beschriftungen, Fokusreihenfolge) für Formular und `LockBanner` prüfen (FR-015); E2E `tests/e2e/db-connection-server.e2e.ts` (nur wenn `SWISSBILL_TEST_PG_URL` gesetzt): Einrichten, Neustart, Kunde und Rechnung anlegen, ausstellen, PDF erzeugen

**Checkpoint**: US1 (zusammen mit US2) abgeschlossen: Serverbetrieb mit allen Garantien lauffähig, MVP.

---

## Phase 5: User Story 3 – Verbindungsprobleme verständlich behandeln (Priority: P2)

**Goal**: Verständliche Meldungen, Verbindungstest, Wiederherstellungsmodus, keine Teilspeicherung.

**Independent Test**: Falsches Passwort, falscher Host, abgeschalteter Server, fehlende Datenbank, fehlende Rechte → je passende Meldung; die gültige Konfiguration bleibt erhalten.

### Tests (zuerst, müssen fehlschlagen)

- [ ] T047 [P] [US3] `tests/unit/error-mapping.test.ts`: `classifyError` je Adapter: PostgreSQL `28P01`/`28000` → `authentication`, `3D000` → `database`, `42501` → `permissions`; MySQL/MariaDB 1045 → `authentication`, 1049 → `database`, 1044/1142 → `permissions`; `ECONNREFUSED`/`ENOTFOUND`/`ETIMEDOUT` → `reachable`; TLS-Fehler (`DEPTH_ZERO_SELF_SIGNED_CERT`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `CERT_HAS_EXPIRED`) → `reachable` mit Hinweis auf CA-Zertifikat; Meldungen enthalten weder Passwort noch Benutzer
- [ ] T048 [P] [US3] `tests/integration/matrix/connection-test.test.ts`: `dbConnection:test` gegen jeden gesetzten Server: Erfolg zeigt `schema: 'empty'` bzw. `'current'`; falsches Passwort → Stufe `authentication`; nicht existierende Datenbank → `database`; Benutzer ohne Anlegerechte → `permissions`; Server aus → `reachable`; Test verändert die Datenbank nicht (keine Tabellen angelegt) und schliesst die Verbindung; zusätzlich Verbindung mit Benutzer und Passwort aus Sonderzeichen (`@ : / ü` und Leerzeichen, auf dem Server entsprechend angelegt) gelingt
- [ ] T049 [P] [US3] `tests/unit/recovery.test.ts`: Wiederherstellungsmodus: bei Startfehler sind nur `dbConnection:*` und `app:relaunch` registriert; `useLocalOnce` startet lokal, ohne die gespeicherte Konfiguration zu ändern; `retry` führt zu erneutem Versuch

### Umsetzung

- [ ] T050 [P] [US3] `classifyError` in `src/main/db/adapters/postgres.ts` und `mysql.ts` implementieren (Zuordnung aus T047, deutsche Meldungen ohne Zugangsdaten, nur Host und Datenbankname dürfen vorkommen)
- [ ] T051 [US3] `testConnection(input)` in `src/main/db/connect.ts`: fünf Stufen (erreichbar, Anmeldung, Datenbank, Rechte durch Test-Tabelle in einer zurückgerollten Transaktion, Schema `empty|current|older|newer|foreign|unknown`), Timeout 10 s, nichts bleibt zurück; Kanal `dbConnection:test` in `src/main/ipc/db-connection.ts`; Button «Verbindung testen» mit Ergebnisanzeige in `DbConnectionForm.tsx`
- [ ] T052 [US3] Wiederherstellungsmodus in `src/main/index.ts`: bei Fehler in `openActiveDatabase()` Hauptfenster mit Parameter `recovery` öffnen (statt `dialog.showErrorBox` + `app.exit`), nur `dbConnection:*`/`app:relaunch` registrieren; Kanäle `dbConnection:retry` und `dbConnection:useLocalOnce`; `src/renderer/components/RecoveryDialog.tsx` zeigt Fehlertext und die drei Aktionen «Erneut versuchen», «Einstellungen» (öffnet `DbConnectionForm`), «Lokal verwenden»; `App.tsx` rendert im Wiederherstellungsmodus nur diesen Dialog. Übergang in den Normalbetrieb: `retry`/`useLocalOnce` öffnen die Datenbank, rufen bei Erfolg `registerIpc(dataSource)` und `installMenu` auf und laden das Fenster neu; bei Misserfolg bleibt der Modus mit der neuen Fehlermeldung bestehen (research R15)
- [ ] T053 [US3] Fehlerbehandlung im Betrieb: Verbindungsabbruch beim Speichern zeigt Meldung, Eingaben bleiben erhalten, nichts wird teilweise gespeichert (Test `tests/integration/matrix/connection-loss.test.ts`: Verbindung während `issue()` trennen → Rollback, Zähler unverändert)

**Checkpoint**: US3 abgeschlossen.

---

## Phase 6: User Story 4 – Zwischen lokal und Server wechseln (Priority: P3)

**Goal**: Wechsel ohne Datenverlust; Hinweis, dass nichts übernommen wird; Sicherung nur lokal.

**Independent Test**: Von lokal auf Server und zurück; lokale Datei und Serverdaten bleiben unverändert.

- [ ] T054 [P] [US4] `tests/integration/switch.test.ts` (zuerst): Wechsel lokal → Server → lokal ändert die lokale Datei nicht (Bytevergleich), Serverdaten bleiben; ohne Serverkonfiguration (Datei entfernt) startet die App lokal
- [ ] T055 [US4] Wechsel-Dialog in `src/renderer/components/DbConnectionForm.tsx`: Bestätigung mit Text «Vorhandene Daten werden nicht übernommen» beim Wechsel in beide Richtungen (FR-013); Wechsel auf lokal entfernt Konfigurationsdatei und Schlüsselbund-Eintrag erst nach Bestätigung
- [ ] T056 [US4] Sicherung nur lokal: `src/main/services/backup-service.ts` `info()` liefert für Server `{ type, host, database }` statt Dateipfad und Grösse (Typ `DbInfo` in `src/shared/ipc/db.ts` erweitern), `backup()` lehnt bei Server mit Hinweis auf die Sicherung durch den Betreiber ab; Menüeintrag «Datenbank sichern» in `src/main/menu.ts`/`menu-template.ts` bei Server deaktiviert; Settings-Anzeige zeigt statt «Sichern» den Hinweis; Test in `tests/integration/backup.test.ts` ergänzen

**Checkpoint**: Alle User Stories abgeschlossen.

---

## Phase 7: Polish & übergreifende Themen

- [ ] T057 [P] CI: neuer Job `db-matrix` in `.github/workflows/ci.yml` auf `ubuntu-latest` mit Service-Containern `postgres:16`, `mysql:8`, `mariadb:11`, setzt die `SWISSBILL_TEST_*_URL`-Variablen, führt `npm test` aus; Job blockiert den bestehenden Windows-Job `verify` nicht
- [ ] T058 [P] `tests/integration/perf.test.ts` und neuer `perf-server.test.ts` (nur mit gesetzten Variablen): Ausstellen < 2 s auf Servern im lokalen Netz, Liste von 10 000 Rechnungen < 1 s auf SQLite bleibt grün
- [ ] T059 [P] Dokumentation: `docs/` und README um Abschnitt «Server-Datenbank» ergänzen (unterstützte Versionen, Rechte des Datenbankbenutzers, TLS-Hinweis, Sicherung durch den Betreiber, Linux-Schlüsselbund/Secret-Service); Hinweis zu MySQL/MariaDB (Migrationen idempotent und fortsetzbar, da DDL nicht zurückgerollt werden kann, research R10) in die Dokumentation übernehmen (Spec-Anpassung ist bereits erfolgt)
- [ ] T060 Idempotente Migrationen: `InitSchema`, `AddGeoapifyKey` und `AddEditLocks` prüfen vorhandene Tabellen/Spalten (`hasTable`/`hasColumn`) vor dem Anlegen, damit eine auf MySQL/MariaDB abgebrochene Migration erneut laufen kann; Test in `tests/integration/matrix/migration.test.ts` (Migration nach halber Ausführung wiederholen)
- [ ] T061 `quickstart.md` vollständig durchgehen (Abschnitte 1–5) und Abweichungen in den Dokumenten korrigieren; `npm run lint`, `npm run typecheck`, `npm test`, `npm run package` grün; Verfassungs-Check gegen v1.4.0 erneut durchführen
- [ ] T062 Sicherheitsdurchsicht (`/security-review`): Passwort-Weg (Renderer → Main → Schlüsselbund), keine Zugangsdaten in Logs/Fehlermeldungen/IPC-Antworten, TLS-Optionen, Eingabevalidierung der Dateiauswahl für das CA-Zertifikat

---

## Abhängigkeiten und Reihenfolge

- **Setup (Phase 1)** → **Grundlagen (Phase 2)** blockiert alles Weitere.
- **US2** braucht Phase 2 (CredentialStore-Interface, Konfiguration); **US1** braucht Phase 2 und US2 (Passwort für die Verbindung).
- **US3** baut auf US1 auf (Verbindungsaufbau); **US4** auf US1 und US2.
- Innerhalb einer Phase: Tests vor Umsetzung; Adapter (T033/T034) vor `startup.ts` (T035) und `connect.ts` (T041); `connect.ts` vor `index.ts` (T042).
- T012 und T013 vor T011-Abnahme; T014 nach T010; T017 nach T012.
- T023 verdrahtet die Verbindungs-IPC bereits in `src/main/index.ts`; T042 baut darauf auf (US2-E2E T025 braucht deshalb nichts aus US1).
- T036 (Zählerzeile vorab anlegen) vor T026-Abnahme auf PostgreSQL.

## Parallele Möglichkeiten

- Phase 1: T002, T003, T004 gleichzeitig nach T001.
- Phase 2: T005, T006, T007, T008, T015, T016 parallel; danach T009 → T010 → T014.
- US2: Tests T018–T020 parallel; T021 und T024 parallel.
- US1: Tests T026–T032 parallel; Adapter T033 und T034 parallel; T038 und T043 parallel zu T035/T036.
- US3: Tests T047–T049 parallel; T050 parallel zu T052.

## Implementierungsstrategie

1. **MVP**: Phasen 1–2, dann US2 und US1 gemeinsam (PostgreSQL zuerst, MySQL/MariaDB danach im selben Phase-4-Block), Checkpoint nach US1.
2. Danach US3 (Verständlichkeit), US4 (Wechsel), Polish.
3. Jeden Checkpoint einzeln verifizieren (`npm test` mit Servern, `typecheck`, `lint`) und erst dann weiter.
