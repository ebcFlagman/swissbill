---
description: "Aufgabenliste: Strukturiertes Logging mit pino"
---

# Tasks: Strukturiertes Logging mit pino

**Input**: Design-Dokumente aus `/specs/007-pino-logging/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc-log.md, quickstart.md; Verfassung v1.4.0

**Tests**: Enthalten. Verfassung Prinzip IV und SC-002/SC-003 verlangen Nachweise; Tests einer Gruppe werden zuerst geschrieben und MÜSSEN fehlschlagen, bevor die Umsetzung beginnt.

**Organisation**: Nach User Stories gruppiert. Reihenfolge: Setup → Grundlagen → US1 (Fehler nachvollziehen) → US2 (Geheimnisse) → US3 (Level, Rotation) → US4 (Einheitlich, Renderer) → Polish. US1 und US2 sind P1 und gehören in einen Merge (ohne Maskierung darf das neue Logging nicht ausgeliefert werden).

## Format: `[ID] [P?] [Story] Beschreibung`

- **[P]**: parallel ausführbar (andere Dateien, keine Abhängigkeit zu offenen Aufgaben)
- **[Story]**: zugehörige User Story (US1…US4)
- Pfade relativ zum Repository-Wurzelverzeichnis; Kommentare im Code englisch, Oberflächentexte deutsch

## Phase 1: Setup

- [X] T001 `pino` (10.x, exakte Version) installieren (`package.json`, `package-lock.json`) und Gate R9 prüfen: `npm run build` bündelt den Main-Prozess mit `pino` als externe Abhängigkeit und ein Wegwerf-Aufruf in Electron schreibt eine JSON-Zeile; Ergebnis in `specs/007-pino-logging/research.md` (R9) vermerken
- [X] T002 [P] `electron-builder.yml` prüfen: `pino` und seine Abhängigkeiten werden mitgeliefert (kein `asarUnpack` nötig, da kein Worker-Transport); Ergebnis in `research.md` (R9) ergänzen

---

## Phase 2: Grundlagen (blockiert alle User Stories)

**Purpose**: Gemeinsame Typen und Architekturregeln

- [X] T003 [P] `src/shared/ipc/log.ts` anlegen: `LogLevel = 'error' | 'warn' | 'info' | 'debug'`, `LOG_LEVELS`, zod-Schemas `setLevelSchema` (`level` ∈ vier Werte) und `reportSchema` (`message` 1–500 Zeichen, `stack` höchstens 4000 Zeichen, `source` höchstens 200 Zeichen), Typen `ReportInput`, `LogLevelState`, exakt nach `contracts/ipc-log.md`
- [X] T004 [P] Architekturtest in `tests/unit/architecture.test.ts` ergänzen (zuerst, muss fehlschlagen): `pino` wird nur in `src/main/logging/` importiert; in `src/` kommt kein `console.` vor (Kommentare ignorieren); `src/main/log.ts` existiert nicht mehr (greift ab T021a); in `src/main/logging/` kommen weder `pino.transport`, `pino-pretty`, `pino-roll` noch Netzwerk-Importe (`node:http`, `node:https`, `node:net`, `fetch`) vor (FR-014)
- [X] T005 [P] ESLint in `eslint.config.mjs` ergänzen: `no-console` (error) für `src/**`; `no-restricted-imports` für `pino` ausserhalb von `src/main/logging/**` und `tests/**`

**Checkpoint**: Typen vorhanden, Regeln gesetzt (T004 schlägt bis T021a fehl).

---

## Phase 3: User Story 1 - Fehler anhand der Logdatei nachvollziehen (Priority: P1) 🎯 MVP

**Goal**: Jeder Eintrag ist eine JSON-Zeile mit Zeit, Level, Bereich, Meldung und bei Fehlern Ursache samt Stacktrace.

**Independent Test**: Fehler provozieren (z. B. ungültige Datenbankverbindung); die Logdatei enthält einen Eintrag mit `component":"db"` und `err`-Ursache.

### Tests für US1 (zuerst schreiben, müssen fehlschlagen)

- [X] T006 [P] [US1] `tests/unit/rotating-stream.test.ts`: schreibt ein Zeilen-Ziel in ein temporäres Verzeichnis; eine Zeile pro `write`; nicht beschreibbares Verzeichnis → Zeile geht an `process.stderr`, es wird nie geworfen (FR-010); Rotation siehe T022 und T025
- [X] T007 [P] [US1] `tests/unit/logging.test.ts`: `initLogging(dir)` + `getLogger('db').error({ err }, 'msg')` erzeugt eine Zeile mit `time` (ISO), `level` als Text (`"error"`), `component":"db"`, `msg` und `err.message`, `err.stack` sowie verschachteltem `err.cause`; Logging vor `initLogging` geht an stderr und geht nicht verloren; zirkuläre Referenzen im Kontext erzeugen weiterhin gültiges JSON
- [X] T008 [P] [US1] `tests/integration/log-lifecycle.test.ts`: `app`-Start-Eintrag enthält `version`, `platform` und `dbKind` und kein Passwort; Eintrag beim Beenden vorhanden
- [X] T008a [P] [US1] `tests/unit/pdf-error-log.test.ts`: ein erzwungener Fehler in der PDF-Erzeugung (`src/main/services/pdf-service.ts`) erzeugt eine Zeile mit `component":"pdf"`, `level":"error"` und `err`-Ursache (SC-001); schlägt bis T036 fehl

### Umsetzung US1

- [X] T009 [US1] `src/main/logging/rotating-stream.ts`: `RotatingFileStream` mit `write(line)`, öffnet/schliesst die Datei pro Schreibvorgang (Append), fängt jeden Fehler ab und schreibt dann auf `process.stderr` (Rotation kommt in T025, die Klasse nimmt `maxBytes` und `maxFiles` bereits als Parameter)
- [X] T010 [US1] `src/main/logging/index.ts`: `initLogging(dir)` erzeugt den pino-Root-Logger (`timestamp` als ISO-String, `formatters.level` liefert den Text, `serializers: { err: pino.stdSerializers.err }`, Ziel `RotatingFileStream`), `getLogger(component)` liefert gecachte Child-Loggers mit Feld `component` ∈ `app | db | pdf | address | ipc | ui`, vor `initLogging` schreibt ein Standard-Logger auf stderr; Level standardmässig `info`
- [X] T011 [US1] `src/main/index.ts`: `initLogger`/`log` durch `initLogging`/`getLogger('app')` ersetzen; Start-Eintrag mit `version`, `platform`, `dbKind` (nach dem Öffnen der Datenbank, ohne Zugangsdaten), Ende-Eintrag in `app.on('quit')`, `process.on('uncaughtException')` und `process.on('unhandledRejection')` loggen `error` mit `err` (FR-011/012); Meldung beim Datenbankfehler als `getLogger('db').error({ err: … })`
- [X] T012 [P] [US1] `src/main/ipc/wrap.ts`: `getLogger('ipc').error({ err: error }, 'Unerwarteter Fehler im IPC-Handler')` statt `log.error(...)` (die bestehende deutsche Antwort an den Renderer bleibt unverändert); `tests/unit/ipc-wrap.test.ts` anpassen
- [X] T013 [US1] Altdatei: beim ersten `initLogging` wird eine vorhandene `swissbill.log`, deren erste Zeile kein JSON ist, nach `swissbill.log.1` verschoben (R7); Test in `tests/unit/logging.test.ts`

**Checkpoint**: Einträge werden strukturiert geschrieben; ein provozierter DB-Fehler ist nachvollziehbar.

---

## Phase 4: User Story 2 - Sensible Daten gelangen nie ins Log (Priority: P1)

**Goal**: Registrierte Geheimnisse und sensible Feldnamen erscheinen nie im Klartext; Rechnungsinhalte werden nicht geloggt.

**Independent Test**: Passwort und API-Schlüssel registrieren, Meldungen, Kontextfelder und Fehler damit loggen; die Datei enthält 0 Klartext-Treffer.

### Tests für US2 (zuerst schreiben, müssen fehlschlagen)

- [X] T014 [P] [US2] `tests/unit/scrubber.test.ts`: `redactFromLogs(secret)` ersetzt das Geheimnis in der ganzen Zeile durch `***`, auch in `msg`, `err.stack` und `err.cause`; Geheimnis mit `"`, `\`, `'`, Umlauten und `/` wird sowohl in Rohform als auch JSON-escapt ersetzt; Geheimnisse unter 3 Zeichen werden nicht registriert; ein nach dem Start registriertes Geheimnis gilt ab sofort
- [X] T015 [P] [US2] `tests/unit/redact-fields.test.ts`: Kontextfelder `password`, `apiKey`, `token`, `authorization`, `secret` (auch verschachtelt, z. B. `settings.password`) erscheinen als `***`, unabhängig vom Wert
- [X] T016 [P] [US2] `tests/integration/log-leak.test.ts`: legt Beispielrechnung (fiktive Daten aus `tests/fixtures/invoice.ts`) an, stellt sie aus, speichert Einstellungen mit API-Schlüssel und setzt Datenbankpasswort; durchsucht alle Dateien im Logverzeichnis nach Namen, Adresse, IBAN, Betrag, Referenz, Passwort und Schlüssel: 0 Treffer (SC-002); `tests/integration/credential-leak.test.ts` auf `initLogging`/`getLogger` umstellen

### Umsetzung US2

- [X] T017 [US2] `src/main/logging/scrubber.ts`: Register `Set<string>`, `registerSecret(secret)` (Mindestlänge 3), `scrub(line)` ersetzt jede Rohform und JSON-escapte Form (`JSON.stringify(secret).slice(1, -1)`) durch `***`
- [X] T018 [US2] `src/main/logging/rotating-stream.ts`: ruft vor dem Schreiben `scrub(line)`; `src/main/logging/index.ts`: `redact`-Pfade `password`, `*.password`, `apiKey`, `*.apiKey`, `token`, `*.token`, `authorization`, `*.authorization`, `secret`, `*.secret` mit Censor `***`; `redactFromLogs` re-exportieren
- [X] T019 [P] [US2] `src/main/services/connection-service.ts`: Import auf `../logging` umstellen (`redactFromLogs`); `src/main/services/address-service.ts`: den gelesenen und den neu gespeicherten Geoapify-Schlüssel mit `redactFromLogs` registrieren (auch in `src/main/services/settings-service.ts` beim Speichern)
- [X] T020 [US2] Meldungen prüfen: in `src/main/` keine Logzeile mit Namen, Adressen, IBANs, Beträgen oder Referenzen (nur `id`, `durationMs`, Zähler); falls ein Aufruf Nutzerdaten enthält, entfernen
- [X] T021a [US2] `src/main/log.ts` löschen (alle Aufrufer sind mit T011, T012 und T019 umgestellt); `tests/unit/architecture.test.ts` (T004) ist damit grün

**Checkpoint**: P1 komplett; Lecktest und Architekturtest grün. Auslieferbar.

---

## Phase 5: User Story 3 - Log-Level steuerbar, Datei begrenzt (Priority: P2)

**Goal**: Level in den Einstellungen wählbar (pro Gerät, lokal, sofort wirksam); Dateien rotieren mit Obergrenze.

**Independent Test**: Level auf Debug stellen: Debug-Zeilen erscheinen sofort und nach Neustart; Datei über 1 MB füllen: Rotation, höchstens 5 Dateien.

### Tests für US3 (zuerst schreiben, müssen fehlschlagen)

- [X] T021 [P] [US3] `tests/unit/log-settings.test.ts`: Datei fehlt → `info`; gültig `{ "version": 1, "level": "debug" }` → `debug`; ungültiger Inhalt, unbekannter Level oder `version` ≠ 1 → `info`; Schreiben ist atomar (temporäre Datei, dann `rename`) und schreibt nur `version` und `level`
- [X] T022 [P] [US3] `tests/unit/rotating-stream.test.ts` ergänzen: bei Überschreiten von 1 MB rotiert `swissbill.log` → `.1` → … → `.4`; ältere Dateien werden überschrieben; nie mehr als 5 Dateien; keine Zeile geht beim Rotieren verloren; 100 000 Zeilen bleiben unter 10 MB (SC-003)
- [X] T023 [P] [US3] `tests/unit/logging.test.ts` ergänzen: `setLogLevel('debug')` aktiviert `debug` auch in bereits erzeugten Child-Loggers; zurück auf `info` blendet sie aus; Standard ist `info` ohne Datei
- [X] T024 [P] [US3] `tests/unit/log-ipc.test.ts`: `log:setLevel` lehnt andere Werte mit `VALIDATION` ab, speichert und wendet an; nicht schreibbare Datei → `IO` (deutsche Meldung), Level gilt trotzdem bis zum Neustart; `log:getLevel` liefert das aktuelle Level; Kanäle funktionieren ohne geöffnete Datenbank
- [X] T024a [P] [US3] `tests/unit/log-settings.test.ts` ergänzen: `log:setLevel` schreibt ausschliesslich `userData/log-settings.json` und nichts in die Datenbank (Einstellungstabelle bleibt unverändert); zwei Geräte an derselben Serverdatenbank haben dadurch unabhängige Level (US3 Szenario 4)

### Umsetzung US3

- [X] T025 [US3] `src/main/logging/rotating-stream.ts`: Rotation mit `maxBytes` 1 000 000 und `maxFiles` 5 (aktiv plus `.1`–`.4`), ältestes wird überschrieben
- [X] T026 [P] [US3] `src/main/logging/log-settings.ts`: `readLogSettings(dir)` und `writeLogSettings(dir, level)` gemäss `data-model.md`; ungültiger Inhalt führt zu einer `warn`-Zeile und Standard `info`
- [X] T027 [US3] `src/main/logging/index.ts`: `initLogging(dir)` liest beim Start das Level; `setLogLevel(level)` setzt das Level am Root- und an allen gecachten Child-Loggers
- [X] T028 [US3] `src/main/ipc/log.ts` anlegen: `log:getLevel`, `log:setLevel` (siehe `contracts/ipc-log.md`) über `handle`; in `src/main/ipc/register.ts` in `registerPreDatabaseIpc` registrieren; `CHANNELS` und `SwissbillApi.log` in `src/shared/ipc/api.ts` ergänzen
- [X] T029 [US3] `src/preload/index.ts`: `log.getLevel` und `log.setLevel` über `ipcRenderer.invoke` bereitstellen (nur diese Kanäle, kein `ipcRenderer`)
- [X] T030 [US3] `src/renderer/pages/Settings.tsx`: Abschnitt «Protokoll» mit Auswahlfeld «Detailgrad» (Fehler, Warnungen, Information, Debug; Standard Information), liest beim Öffnen `log.getLevel`, speichert bei Änderung sofort über `log.setLevel`, deutsche Erfolgs- und Fehlermeldung über `notifySuccess`/`notifyError`; Hinweis, dass die Einstellung nur für dieses Gerät gilt
- [X] T031 [US3] `tests/e2e/logging.e2e.ts` (zusätzlich: Level im Wiederherstellungsmodus ohne Datenbank setzbar): Level in den Einstellungen auf Debug stellen → Debug-Zeile in der Logdatei; App neu starten → Level bleibt; zurück auf Information → keine Debug-Zeilen mehr
- [X] T030a [US3] Wiederherstellungsansicht (`src/renderer/` Ansicht für den Wiederherstellungsmodus, Komponente der Datenbankwiederherstellung): dieselbe Auswahl «Detailgrad» anzeigen, damit bei Startfehlern ohne Datenbank Debug aktiviert werden kann; Auswahlfeld als wiederverwendbare Komponente `src/renderer/components/LogLevelSelect.tsx` aus T030 herausziehen

**Checkpoint**: Story 3 unabhängig prüfbar.

---

## Phase 6: User Story 4 - Einheitliches Logging im gesamten Programm (Priority: P3)

**Goal**: Keine zweite Lösung, keine Konsolenausgaben; Fehler aus der Oberfläche landen in derselben Datei.

**Independent Test**: Architekturtest grün; ausgelöstes Fehlerereignis in der Oberfläche erscheint mit `component":"ui"`.

### Tests für US4 (zuerst schreiben, müssen fehlschlagen)

- [X] T032 [P] [US4] `tests/unit/log-report.test.ts`: `log:report` validiert (`message` 1–500 Zeichen, `stack` höchstens 4000, `source` höchstens 200); schreibt `error` mit `component":"ui"`; nach 20 Meldungen pro Minute werden weitere verworfen (Ergebnis bleibt `ok`) und die Zahl der verworfenen wird beim nächsten Eintrag als Feld `dropped` ausgegeben
- [X] T033 [P] [US4] `tests/unit/report-errors.test.ts`: `installErrorReporting(api)` meldet `window` `error` und `unhandledrejection` über `api.log.report` (Fehlertext und Stack, keine Formularinhalte); Fehler beim Melden werden verschluckt (keine Endlosschleife)

### Umsetzung US4

- [X] T034 [US4] `src/main/ipc/log.ts` ergänzen: `log:report` mit `reportSchema`, Ratenbegrenzung 20 pro Minute, schreibt über `getLogger('ui').error`; `src/main/ipc/register.ts`, `src/shared/ipc/api.ts` und `src/preload/index.ts` um `log.report` ergänzen
- [X] T035 [P] [US4] `src/renderer/lib/report-errors.ts` anlegen und beim Start des Renderers (`src/renderer/main.tsx`) aufrufen; falls ein React-Error-Boundary existiert, meldet er ebenfalls über `log.report`
- [X] T036 [US4] Restliche Aufrufstellen umstellen: `getLogger('pdf')` in `src/main/services/pdf-service.ts` (Fehler beim Erzeugen), `getLogger('address')` in `src/main/services/address-service.ts` (Fehlerklassen der Anfrage, ohne Suchtext), `getLogger('db')` in `src/main/db/` für Verbindungs- und Migrationsereignisse (Anzahl Migrationen, Dauer, ohne Zugangsdaten)
- [X] T037 [US4] `tests/e2e/logging.e2e.ts` ergänzen: Fehlerereignis in der Oberfläche auslösen → Zeile mit `component":"ui"`; Logverzeichnis nicht beschreibbar → App startet und bedient Rechnungen weiter (SC-006)

**Checkpoint**: Alle Stories fertig; die Regeln aus T004 und T005 gelten.

---

## Phase 7: Polish & Querschnitt

- [X] T038 [P] `docs/logging.md` (deutsch): Speicherort je Plattform, Zeilenformat, Felder, Rotation (1 MB, 5 Dateien), Level-Einstellung, Hinweis zu Daten im Log, Hinweis dass die Einzelinstanz-Sperre der App parallele Schreiber auf dieselbe Datei verhindert, Glossar «Log-Level = Detailgrad»; Verweis im `README.md`
- [X] T039 [P] `specs/007-pino-logging/quickstart.md` gegen die Umsetzung prüfen und Pfade/Befehle korrigieren
- [X] T040 Performance prüfen (SC-005): Startzeit vor/nach (Mittel aus 5 Starts, höchstens 5 % länger) und Zeit pro Logeintrag (< 1 ms im Mittel) in `specs/007-pino-logging/research.md` festhalten
- [X] T041 `npm run lint`, `npm run typecheck`, `npm test` und `npm run test:e2e` laufen grün; Constitution-Check aus `plan.md` abgleichen (kein Netzwerk, keine Zugangsdaten, Renderer nur über schmale Kanäle)

---

## Abhängigkeiten & Reihenfolge

- Phase 1 → Phase 2 → US1 → US2 (gleicher Merge wie US1) → US3 und US4 (voneinander unabhängig, beide setzen US1/US2 voraus) → Polish.
- Innerhalb einer Story: Tests (fehlschlagend) → Umsetzung. T018 baut auf T009/T010/T017 auf; T021a nach T011, T012 und T019; T027 auf T026; T028 auf T027; T030 auf T028/T029; T034 auf T028; T036 auf T010.
- Dieselbe Datei nicht parallel: `src/main/logging/index.ts` (T010, T018, T027), `src/main/logging/rotating-stream.ts` (T009, T018, T025), `src/main/ipc/log.ts` (T028, T034), `src/shared/ipc/api.ts` (T028, T034).

## Parallele Beispiele

- Phase 2: T003, T004, T005 gleichzeitig.
- US1-Tests: T006, T007, T008 gleichzeitig; danach T009 → T010 → T011 (T012 parallel zu T011).
- US2-Tests: T014, T015, T016 gleichzeitig; T019 parallel zu T018.
- US3-Tests: T021–T024 gleichzeitig; T026 parallel zu T025.
- US3 und US4 können von zwei Personen parallel bearbeitet werden, sobald US2 gemergt ist.

## Umsetzungsstrategie

1. **MVP = US1 + US2** (Phase 1–4): strukturiertes, sicheres Logging ersetzt die Eigenlösung; mit dem grünen Lecktest auslieferbar.
2. **US3** ergänzt die Level-Einstellung und die begrenzte Rotation; **US4** vereinheitlicht die restlichen Stellen und bindet die Oberfläche an.
3. Polish zuletzt; vor dem Merge Verfassungsprüfung (T041).
