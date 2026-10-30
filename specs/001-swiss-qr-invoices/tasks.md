---

description: "Aufgabenliste für Swiss QR-Rechnungen erstellen"
---

# Tasks: Swiss QR-Rechnungen erstellen

**Input**: Design documents from `/specs/001-swiss-qr-invoices/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc-api.md, quickstart.md

**Tests**: Enthalten. Die Constitution (Prinzip IV) verlangt Test-First für die Domänenlogik und mindestens einen E2E-Test für den Hauptablauf. Tests MÜSSEN zuerst geschrieben werden und fehlschlagen, bevor die Implementierung beginnt.

**Organization**: Aufgaben sind nach User Story gruppiert, damit jede Story einzeln umgesetzt und getestet werden kann.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Kann parallel laufen (andere Dateien, keine Abhängigkeit zu unfertigen Aufgaben)
- **[Story]**: US1 bis US4 gemäss spec.md
- Alle Pfade sind relativ zum Repository-Root

## Path Conventions

Einzelprojekt mit electron-vite-Aufteilung gemäss plan.md: `src/shared/`, `src/main/`, `src/preload/`, `src/renderer/`, `tests/unit/`, `tests/integration/`, `tests/e2e/`.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Projektgerüst, Werkzeuge und die frühe Absicherung des grössten technischen Risikos

- [X] T001 Electron-Projekt mit electron-vite, TypeScript und React anlegen (`package.json`, `electron.vite.config.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`) und die Ordner `src/shared/domain/`, `src/shared/ipc/`, `src/main/db/`, `src/main/services/`, `src/main/ipc/`, `src/renderer/pages/`, `src/renderer/components/`, `tests/unit/`, `tests/integration/`, `tests/e2e/` gemäss plan.md erstellen
- [X] T002 Abhängigkeiten installieren: `electron@44`, `electron-vite`, `electron-builder`, `react@19`, `react-dom`, `primereact@11`, `primeicons`, `better-sqlite3@13`, `pdfkit`, `swissqrbill@4`, `zod`, `typescript`, `vitest`, `@playwright/test`, `pdfjs-dist`, `@napi-rs/canvas`, `jsqr` (nur Dev, für den QR-Test), sowie die `@types/*`-Pakete (in `package.json`, Versionen festpinnen)
- [X] T003 [P] TypeScript `strict` aktivieren (`tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`), ESLint und Prettier konfigurieren (Einstellungen wie in `.editorconfig`: LF, 2 Leerzeichen), npm-Skripte `typecheck` und `lint` anlegen
- [X] T004 [P] Testwerkzeuge konfigurieren: `vitest.config.ts` (Unit und Integration, getrennte Projekte, DB `:memory:`), `playwright.config.ts` (Electron-E2E gegen die gebaute App), npm-Skripte `test` und `test:e2e`
- [X] T005 [P] Packaging konfigurieren: `electron-builder.yml` (Windows-Ziel, `better-sqlite3` aus `asar` entpackt via `asarUnpack`) und npm-Skripte `build` und `package`
- [X] T006 Risiko-Spike: im verpackten Windows-Build prüfen, dass `better-sqlite3` ohne Rebuild lädt (eine `:memory:`-DB öffnen und `SELECT 1` ausführen). Ergebnis in `specs/001-swiss-qr-invoices/research.md` Abschnitt 2 festhalten. Falls es scheitert: `@electron/rebuild` ergänzen und den Befehl in `package.json` (`postinstall`) eintragen

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Kerninfrastruktur, die ALLE User Stories brauchen

**⚠️ CRITICAL**: Keine User Story darf vor Abschluss dieser Phase beginnen

- [X] T007 [P] Test schreiben (muss fehlschlagen): `tests/unit/money.test.ts`. Fälle: Positionsbetrag = `round_half_up(quantity_milli * unit_price_rappen / 1000)`, Menge 1500 (=1.5) mal 1000 Rappen = 1500, Rundung bei .5 aufwärts, Summe der Positionsbeträge = Gesamtbetrag, nur ganze Zahlen (keine Fliesskommawerte), Formatierung `1'234.50` für CHF
- [X] T008 [P] `src/shared/domain/money.ts` implementieren: Typen `Rappen` und `Milli` (ganze Zahlen), `lineAmount()`, `sumAmounts()`, `formatChf()`, `parseChf()` ohne Fliesskommaarithmetik
- [X] T009 [P] `src/shared/ipc/errors.ts` erstellen: `AppError` mit `code` (`'VALIDATION' | 'NOT_FOUND' | 'IMMUTABLE' | 'IO' | 'DB'`), deutscher `message` und optionalem `fields?: {field, message}[]`, dazu `Result<T>`, `ok()`, `err()` gemäss contracts/ipc-api.md
- [X] T010 [P] Test schreiben (muss fehlschlagen): `tests/unit/address.test.ts`. Grenzen: Name max. 70, Strasse max. 70, Hausnummer max. 16, PLZ max. 16, Ort max. 35, Land ISO-Code mit Standard `CH`; PLZ und Ort Pflicht; Zeichenvorrat des Swiss-QR-Standards (lateinischer Zeichensatz, Umlaute erlaubt, Steuerzeichen abgelehnt); feldgenaue Fehlermeldungen auf Deutsch
- [X] T011 [P] `src/shared/domain/address.ts` implementieren: `validateAddress()` mit den Grenzen aus T010 und einem `Address`-Typ (name, street, houseNo, zip, city, country)
- [X] T012 Test schreiben (muss fehlschlagen): `tests/integration/migrate.test.ts`. Fälle: leere DB wird auf neueste Version migriert (`PRAGMA user_version`), erneutes Ausführen ändert nichts, fehlerhafte Migration wird zurückgerollt und `user_version` bleibt, vor einer Migration einer bestehenden Datei-DB wird eine Kopie `swissbill.db.bak-<version>` angelegt
- [X] T013 `src/main/db/connection.ts` implementieren: öffnet `swissbill.db` im Electron-`userData`-Ordner (Pfad injizierbar für Tests), `journal_mode = DELETE`, `synchronous = FULL`, `foreign_keys = ON`
- [X] T014 `src/main/db/migrate.ts` implementieren: Runner für `src/main/db/migrations/NNN_name.sql`, nur vorwärts, jede Migration in einer Transaktion, Version in `PRAGMA user_version`, automatische Kopie der Datei vor jeder Migration (macht T012 grün)
- [X] T015 `src/main/db/migrations/001_init.sql` erstellen gemäss data-model.md: Tabellen `settings` (genau eine Zeile, `id = 1`), `customers`, `invoices`, `invoice_items`, `number_counters`, Indizes `invoices(number)` UNIQUE, `invoices(status, invoice_date)`, `invoices(debtor_name)`, `invoice_items(invoice_id, position)`. Constraints verbatim: `invoices.status` ∈ `draft|issued|paid|cancelled`; `invoices.number` UNIQUE und NULL solange Entwurf; `due_date` ≥ `invoice_date`; `invoices.customer_id` FK `customers` mit `ON DELETE SET NULL`; `invoice_items.invoice_id` FK mit `ON DELETE CASCADE`; `description` Pflicht, max. 500; `quantity_milli` > 0; `unit_price_rappen` ≥ 0; Beträge und Mengen `INTEGER`; Name max. 70, Strasse max. 70, Hausnummer max. 16, PLZ max. 16, Ort max. 35 (CHECK-Constraints); bei Entwürfen sind `sender_*`, `debtor_*` und `closing_text` leer/NULL erlaubt und `total_rappen` hat `DEFAULT 0` (Pflicht gilt erst beim Ausstellen); die Zeile `settings` mit `id = 1` wird per `INSERT` angelegt (Absenderfelder leer, `invoice_prefix = 'RE'`, `default_payment_days = 30`); `invoice_prefix` 1–10 Zeichen `A-Z0-9-`, Standard `RE`; `default_payment_days` Standard 30; `reference_type` ∈ `QRR|SCOR`. Zusätzlich SQLite-Trigger, die anhand von `OLD.status` bei Rechnungen mit Status ≠ `draft` Änderungen und Löschen der Rechnung (ausser `status`, `paid_at`, `cancelled_at`, `updated_at`) sowie Einfügen, Ändern und Löschen von `invoice_items` verhindern; der Übergang `draft → issued` bleibt erlaubt
- [X] T016 `src/main/index.ts` absichern: `BrowserWindow` mit `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; Navigation und neue Fenster blockieren (`will-navigate`, `setWindowOpenHandler`); Content-Security-Policy `default-src 'self'` im Renderer (`src/renderer/index.html`); keine Netzwerkzugriffe
- [X] T017 IPC-Grundgerüst: `src/main/ipc/register.ts` (Hilfsfunktion, die `ipcMain.handle`-Kanäle mit zod-Validierung registriert und Ausnahmen in `Result` umwandelt), `src/preload/index.ts` (`contextBridge.exposeInMainWorld('swissbill', …)` mit typisierter API gemäss contracts/ipc-api.md), `src/shared/ipc/api.ts` (gemeinsame Typen, `window.swissbill`-Deklaration für den Renderer)
- [X] T018 [P] Renderer-Gerüst: `src/renderer/App.tsx` mit PrimeReact-Provider, deutscher Lokalisierung, Navigation (Rechnungen, Kunden, Einstellungen) und globalem Fehler-Toast für `AppError`; Routing nach `src/renderer/pages/`
- [X] T019 [P] `src/main/log.ts` erstellen: lokales Logging in eine Datei im `userData`-Ordner (Level, Zeit, Nachricht), ohne Telemetrie und ohne personenbezogene Rechnungsinhalte

**Checkpoint**: Foundation steht, User Stories können beginnen

---

## Phase 3: User Story 1 - Rechnung mit QR-Zahlteil als PDF erstellen (Priority: P1) 🎯 MVP

**Goal**: Eine Rechnung erfassen, ausstellen (Nummer und Referenz vergeben) und als A4-PDF mit gültigem Swiss-QR-Zahlteil speichern.

**Independent Test**: Rechnung mit fiktiven Daten erfassen (Absender und Schuldner direkt in der Rechnung), ausstellen, PDF erzeugen und mit dem SIX-Validator prüfen. Ungültige Zahlungsdaten verhindern das Ausstellen mit feldgenauer Meldung.

### Tests for User Story 1 ⚠️

> **NOTE: Zuerst schreiben, Fehlschlag bestätigen, dann implementieren**

- [X] T020 [P] [US1] `tests/unit/iban.test.ts`: gültige CH- und LI-IBAN, falsche Prüfsumme (Mod 97), falsche Länge, andere Länder abgelehnt, Leerzeichen toleriert und normalisiert; QR-IBAN-Erkennung über IID (Stellen 5–9) im Bereich 30000–31999 (`CH44 3199 9123 0008 8901 2` ist eine QR-IBAN, `CH93 0076 2011 6238 5295 7` nicht)
- [X] T021 [P] [US1] `tests/unit/reference.test.ts`: QR-Referenz = 27 Ziffern, 26 Nutzdaten plus Prüfziffer nach Modulo 10 rekursiv (bekanntes gültiges Beispiel `21 00000 00003 13947 14300 09017`); Creditor Reference `RF` + 2 Prüfziffern (ISO 11649, Mod 97) + Nutzdaten, maximal 25 Zeichen; Ableitung aus Jahr und Zähler links mit Nullen aufgefüllt, Präfix fliesst nicht ein; Referenztyp: QR-IBAN → `QRR`, sonst `SCOR`
- [X] T022 [P] [US1] `tests/unit/invoice-number.test.ts`: Format `PRÄFIX-JAHR-ZÄHLER` (z. B. `RE-2026-0001`), Präfix 1–10 Zeichen aus `A-Z0-9-`, Zähler mindestens vierstellig und wächst über 9999 hinaus, Zähler beginnt pro Jahr bei 1
- [X] T023 [P] [US1] `tests/unit/invoice-validation.test.ts`: Pflichtfelder vor dem Ausstellen (Absender: Name, PLZ, Ort, IBAN; Schuldner: Name, PLZ, Ort; mindestens eine Position), `quantity_milli` > 0, `unit_price_rappen` ≥ 0, Beschreibung max. 500, Total > 0 und höchstens 999'999'999.99, `due_date` ≥ `invoice_date`, Währung fest CHF, Fehler feldgenau mit deutscher Meldung (FR-005)
- [X] T024 [P] [US1] `tests/integration/issue.test.ts` (DB `:memory:`): Ausstellen vergibt Nummer, Referenz und Referenztyp in **einer** Transaktion; mehrere Ausstellungen sind lückenlos und doppelfrei; das Jahr der Nummer ist das Jahr der Ausstellung (nicht des Rechnungsdatums), geprüft mit einer injizierbaren Uhr: Ausstellung am 31.12. ergibt `…-2026-000N`, am 1.1. danach `…-2027-0001`; fehlgeschlagene Validierung ändert weder Status noch Zähler
- [X] T025 [P] [US1] `tests/integration/pdf.test.ts`: gültige Rechnung ergibt ein A4-PDF mit Zahlteil (Betrag, Währung CHF, Gläubiger, Schuldner, Referenz stimmen mit dem QR-Payload überein; der QR-Code des PDFs wird rasterisiert (`pdfjs-dist`, `@napi-rs/canvas`), mit `jsqr` dekodiert und mit dem Ergebnis von `qr-payload.ts` verglichen; ist die Rasterisierung zu aufwendig, wird der Payload ersatzweise über die API von `swissqrbill` ausgelesen und der Entscheid im Test kommentiert); ungültige Zahlungsdaten erzeugen kein PDF; 60 Positionen laufen auf eine Folgeseite, der Zahlteil steht auf der letzten Seite; Entwurf-Vorschau trägt ein «ENTWURF»-Wasserzeichen und keinen gültigen Zahlteil
- [X] T026 [P] [US1] `tests/unit/qr-payload.test.ts`: Der Builder erzeugt den QR-Text nach SIX-Spezifikation (Feldreihenfolge, Zeilenumbrüche, Header `SPC`/`0200`/`1`, Adresstyp `S`, Währung CHF, Betrag mit zwei Nachkommastellen, Referenztyp QRR/SCOR) und stimmt Zeichen für Zeichen mit einem Beispiel aus den SIX-Richtlinien überein (Fixture `tests/fixtures/six-example-payload.txt`)
- [X] T027 [P] [US1] `tests/integration/immutability.test.ts`: Bei Status ≠ `draft` werden (durch die Trigger aus T015) `UPDATE`/`DELETE` auf der Rechnung (ausser `status`, `paid_at`, `cancelled_at`, `updated_at`, `customer_id`) und auf `invoice_items` von der Datenbank abgelehnt; der Service liefert `IMMUTABLE`; Entwürfe bleiben änderbar Der Übergang `draft → issued` bleibt erlaubt.

### Implementation for User Story 1

- [X] T028 [P] [US1] `src/shared/domain/iban.ts`: `normalizeIban()`, `validateIban()` (nur CH/LI, Mod 97), `isQrIban()` (macht T020 grün)
- [X] T029 [P] [US1] `src/shared/domain/reference.ts`: `referenceTypeFor(iban)`, `buildQrReference(year, seq)`, `buildCreditorReference(year, seq)`, `validateReference()` (macht T021 grün)
- [X] T030 [P] [US1] `src/shared/domain/invoice-number.ts`: `formatInvoiceNumber(prefix, year, seq)`, `validatePrefix()` (das Jahr ist das Jahr der Ausstellung) (macht T022 grün)
- [X] T031 [P] [US1] `src/shared/domain/qr-payload.ts`: `buildQrPayload(invoice)` erzeugt den QR-Text nach SIX-Spezifikation aus Absender, Schuldner, Betrag, Referenz und Zusatzangaben (macht T026 grün)
- [X] T032 [US1] `src/shared/domain/invoice.ts`: Typen `Invoice`, `InvoiceItem`, `InvoiceStatus` und `validateForIssue(invoice)` mit allen Regeln aus T023, nutzt `money.ts`, `address.ts`, `iban.ts`, `reference.ts` (macht T023 grün)
- [X] T033 [US1] `src/main/db/settings-repository.ts`: `getSettings()` für Absender, Präfix, Standard-Schlusstext und Zahlungsfrist (wird beim Erstellen von Entwürfen als Vorgabe gelesen; Bearbeiten folgt in US3)
- [X] T034 [US1] `src/main/db/invoice-repository.ts`: `createDraft()`, `saveDraft()`, `getInvoice()` inklusive Positionen, Momentaufnahme-Spalten `sender_*`, `debtor_*`, `closing_text`, Beträge in Rappen; `saveDraft()` liefert für Rechnungen mit Status ≠ `draft` `IMMUTABLE`
- [X] T035 [US1] `src/main/services/invoice-service.ts`: `createDraft()` (Absender, Schlusstext und Fälligkeit aus den Einstellungen vorausfüllen), `saveDraft()` (nur Entwürfe, sonst `IMMUTABLE`), `issue()` mit injizierbarer Uhr `now()` (validieren, in einer Transaktion `number_counters` erhöhen, Nummer und Referenz setzen, `total_rappen` und `layout_version` festschreiben, Status `issued`, `issued_at` setzen); Jahr der Nummer = Jahr von `now()`; macht T024 grün
- [X] T036 [US1] `src/main/services/pdf-service.ts`: A4-PDF mit `pdfkit` (Kopf mit Absender und Schuldner, Rechnungsnummer und Daten, Positionstabelle mit Menge, Einzelpreis, Betrag, Total, Schlusstext, mehrseitig) und `swissqrbill` (`attachTo`) für den Zahlteil, alles aus der gespeicherten Momentaufnahme; Texte auf Deutsch; Entwurfs-Vorschau mit Wasserzeichen und ohne Zahlteil; `LAYOUT_VERSION`-Konstante (macht T025 grün)
- [X] T037 [US1] IPC für US1: Schemas in `src/shared/ipc/invoices.ts` (zod), Handler in `src/main/ipc/invoices.ts` (`invoices.createDraft`, `invoices.saveDraft`, `invoices.get`, `invoices.validate`, `invoices.issue`) und `src/main/ipc/pdf.ts` (`pdf.save` mit Speichern-Dialog im Main, `pdf.preview` als base64, `pdf.open` öffnet das PDF im Standardprogramm zum Drucken per `shell.openPath`, FR-014); Schreibfehler beim Speichern liefern `IO`, die Rechnung bleibt ausgestellt; Preload-API ergänzen
- [X] T038 [US1] `src/renderer/pages/InvoiceEditor.tsx`: Formular für Absender, Schuldner, Rechnungsdatum, Zahlungsfrist, Positionen (hinzufügen, entfernen, Menge, Einzelpreis, Betrag je Position), Gesamtbetrag live, Schlusstext; Sofort-Feedback über `invoices.validate` mit Fehlern direkt am Feld
- [X] T039 [US1] `src/renderer/components/IssueDialog.tsx` und `src/renderer/components/PdfPreviewDialog.tsx`: Button «Ausstellen» mit Bestätigung («Danach ist die Rechnung unveränderlich»), nach Erfolg Nummer anzeigen, PDF-Vorschau und «PDF speichern» und «PDF öffnen / drucken»
- [X] T040 [US1] `tests/e2e/create-invoice.e2e.ts` (Playwright, Electron): Rechnung mit drei Positionen erfassen, ausstellen, PDF speichern; Datei existiert; ungültige IBAN verhindert das Ausstellen mit Fehlermeldung am Feld

**Checkpoint**: User Story 1 ist eigenständig lauffähig und testbar (MVP)

---

## Phase 4: User Story 2 - Rechnungen lokal speichern, wiederfinden und bearbeiten (Priority: P2)

**Goal**: Rechnungsliste, Entwürfe bearbeiten, ausgestellte Rechnungen schreibgeschützt, PDF erneut erzeugen, Entwürfe löschen, Rechnungen duplizieren.

**Independent Test**: Rechnung erfassen, App schliessen und neu starten: Rechnung steht in der Liste, ist unverändert, das neu erzeugte PDF ist inhaltlich identisch. Ausgestellte Rechnungen lassen sich weder ändern noch löschen.

### Tests for User Story 2 ⚠️

- [X] T041 [P] [US2] `tests/integration/persistence.test.ts`: DB-Datei schliessen und neu öffnen, Rechnung unverändert; `list()` mit Suche (Nummer, Kunde) und Statusfilter; Duplizieren erzeugt einen Entwurf ohne Nummer, Datum heute, neu berechnete Fälligkeit; erneut erzeugtes PDF aus der Momentaufnahme hat denselben Inhalt (Nummer, Beträge, Referenz, Daten)

### Implementation for User Story 2

- [X] T042 [US2] `src/main/db/invoice-repository.ts` erweitern: `list({search, status})` mit Nummer, Kunde, Datum, Total, Status, `deleteDraft()`, `duplicate()`
- [X] T043 [US2] `src/main/services/invoice-service.ts` erweitern: `deleteDraft()` nur für Entwürfe (sonst `IMMUTABLE`; der Guard für `saveDraft()` besteht seit T035), `duplicate()` für jede Rechnung; `pdf-service.ts` rendert ausgestellte Rechnungen ausschliesslich aus der Momentaufnahme (macht T041 grün)
- [X] T044 [US2] IPC erweitern: `invoices.list`, `invoices.deleteDraft`, `invoices.duplicate` in `src/shared/ipc/invoices.ts`, `src/main/ipc/invoices.ts` und Preload
- [X] T045 [US2] `src/renderer/pages/InvoiceList.tsx`: Tabelle mit Nummer, Kunde, Datum, Betrag, Status; Suche und Statusfilter (FR-007); Zeilenklick öffnet die Rechnung; Aktionen «Neu», «Duplizieren», «Löschen» (nur Entwurf, mit Bestätigung)
- [X] T046 [US2] `src/renderer/pages/InvoiceEditor.tsx` erweitern: schreibgeschützte Ansicht für Rechnungen ≠ Entwurf mit Hinweis, Aktionen «Duplizieren» und «PDF erneut speichern»; Entwürfe werden automatisch gespeichert
- [X] T047 [US2] `tests/e2e/persistence.e2e.ts`: Rechnung erstellen und ausstellen, App neu starten, Rechnung in Liste vorhanden und schreibgeschützt, Duplizieren erzeugt Entwurf, Entwurf löschen

**Checkpoint**: User Stories 1 und 2 funktionieren unabhängig

---

## Phase 5: User Story 3 - Eigene Zahlungsinformationen und Kunden verwalten (Priority: P3)

**Goal**: Globaler Absender, Präfix und Standard-Schlusstext einmalig hinterlegen, Kunden pflegen und in Rechnungen wiederverwenden. Pro Rechnung kann der Absender überschrieben werden.

**Independent Test**: Absender und Kunde einmal erfassen und in zwei Rechnungen wiederverwenden. Eine spätere Änderung von Kunde oder Absender ändert bestehende Rechnungen nicht; Überschreiben pro Rechnung lässt den globalen Absender unberührt.

### Tests for User Story 3 ⚠️

- [X] T048 [P] [US3] `tests/integration/customers-settings.test.ts`: Kunden anlegen, ändern, löschen (bestehende Rechnungen bleiben unverändert, `customer_id` wird `NULL`); Änderung von Kunde oder Einstellungen wirkt nicht auf bestehende Rechnungen; Überschreiben des Absenders oder Schlusstexts in einer Rechnung ändert `settings` nicht; Einstellungen validieren IBAN und Adresse sowie Präfix (1–10 Zeichen `A-Z0-9-`)

### Implementation for User Story 3

- [X] T049 [US3] `src/main/db/customer-repository.ts` (CRUD, Suche) und `src/main/db/settings-repository.ts` erweitern: `saveSettings()` mit Validierung über `address.ts` und `iban.ts` (macht T048 grün)
- [X] T050 [US3] IPC: `customers.list`, `customers.save`, `customers.delete`, `settings.get`, `settings.save` in `src/shared/ipc/customers.ts`, `src/shared/ipc/settings.ts`, `src/main/ipc/customers.ts`, `src/main/ipc/settings.ts` und Preload
- [X] T051 [P] [US3] `src/renderer/pages/Customers.tsx`: Liste mit Suche, Dialog zum Anlegen und Bearbeiten, Löschen mit Bestätigung
- [X] T052 [P] [US3] `src/renderer/pages/Settings.tsx`: Absender (Name, Adresse, IBAN oder QR-IBAN mit Anzeige des abgeleiteten Referenztyps), Rechnungspräfix (Standard `RE`), Standard-Schlusstext, Standard-Zahlungsfrist (Standard 30 Tage); Hinweis beim ersten Start, wenn der Absender fehlt
- [X] T053 [US3] `src/renderer/pages/InvoiceEditor.tsx` erweitern: Kundenauswahl kopiert die Adresse in die Schuldner-Felder der Rechnung; Absender und Schlusstext vorausgefüllt und überschreibbar («Auf Standard zurücksetzen»), ohne den globalen Wert zu ändern
- [X] T054 [US3] `tests/e2e/settings-customers.e2e.ts`: Absender und Kunde erfassen, zwei Rechnungen daraus erstellen, Absender pro Rechnung überschreiben, globalen Absender ändern: bereits ausgestellte Rechnung zeigt den alten Absender

**Checkpoint**: User Stories 1 bis 3 funktionieren unabhängig

---

## Phase 6: User Story 4 - Rechnungsnummern und Status (Priority: P3)

**Goal**: Status nachführen (ausgestellt, bezahlt, storniert), Stornierung ohne Nummernlücken, Statusfilter in der Liste.

**Independent Test**: Drei Rechnungen ausstellen, eine als bezahlt markieren, eine stornieren: Nummern bleiben lückenlos und unverändert vergeben, der Statusfilter zeigt das korrekte Ergebnis, ein gelöschter Entwurf erzeugt keine Lücke.

### Tests for User Story 4 ⚠️

- [X] T055 [P] [US4] `tests/unit/invoice-status.test.ts`: erlaubte Übergänge `draft→issued`, `issued→paid`, `paid→issued`, `issued→cancelled`, `paid→cancelled`; `cancelled` ist endgültig; Löschen nur im Status `draft`; alle übrigen Übergänge werden abgelehnt
- [X] T056 [P] [US4] `tests/integration/status.test.ts`: `markPaid` und `reopen` ändern nur Status und `paid_at`; `cancel` lässt die Nummer vergeben und der Zähler vergibt sie nie wieder; gelöschter Entwurf erzeugt keine Lücke; Inhalt bleibt in allen Fällen unverändert

### Implementation for User Story 4

- [X] T057 [P] [US4] `src/shared/domain/invoice-status.ts`: Zustandsmaschine mit `canTransition()` und `canDelete()` (macht T055 grün)
- [X] T058 [US4] `src/main/services/invoice-service.ts` und `src/main/db/invoice-repository.ts` erweitern: `markPaid()`, `reopen()`, `cancel()` mit Zeitstempeln `paid_at` und `cancelled_at` (macht T056 grün)
- [X] T059 [US4] IPC: `invoices.markPaid`, `invoices.reopen`, `invoices.cancel` in `src/shared/ipc/invoices.ts`, `src/main/ipc/invoices.ts` und Preload
- [X] T060 [US4] Renderer: Status-Badge und Aktionen «Als bezahlt markieren», «Zurücksetzen», «Stornieren» (mit Bestätigung) in `src/renderer/pages/InvoiceList.tsx` und `src/renderer/pages/InvoiceEditor.tsx`; Statusfilter enthält «storniert»
- [X] T061 [US4] `tests/e2e/status.e2e.ts`: drei Rechnungen ausstellen, eine bezahlt, eine storniert; Statusfilter und Nummernfolge prüfen

**Checkpoint**: Alle User Stories sind eigenständig funktionsfähig

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Querschnittsthemen und Abnahme

- [X] T062 [P] Datenbank-Info und Sicherung (FR-016): `src/main/services/backup-service.ts` (`db.backup()` von better-sqlite3 in eine einzelne Datei), IPC `db.info` und `db.backup` in `src/main/ipc/db.ts`, Anzeige von Speicherort, Grösse und Schemaversion sowie Button «Datenbank sichern» in `src/renderer/pages/Settings.tsx`; Test `tests/integration/backup.test.ts` (Kopie ist genau eine Datei und enthält alle Rechnungen)
- [X] T063 Fehlerfall Datenbank: fehlende oder beschädigte Datei beim Start in `src/main/db/connection.ts` erkennen, verständlichen Dialog anzeigen, nichts stillschweigend überschreiben; Test in `tests/integration/corrupt-db.test.ts`
- [X] T064 [P] Sicherheitsprüfung: `tests/e2e/security.e2e.ts` bestätigt `nodeIntegration` aus, `contextIsolation` an, `require` im Renderer nicht verfügbar, keine Netzwerkanfragen; Checkliste in `specs/001-swiss-qr-invoices/quickstart.md` abgleichen
- [X] T065 [P] Leistungstests: `tests/integration/perf.test.ts` mit 5'000 Rechnungen (Liste und Filter unter 200 ms) und PDF mit 50 Positionen (unter 2 s)
- [X] T066 Manuelle Abnahme des Zahlteils: erzeugtes PDF im SIX-Validator prüfen und QR-Code mit mindestens zwei Banking-Apps scannen (SC-002, SC-003); Ergebnis in `docs/validation-log.md` festhalten. **Erledigt am 2026-10-30:** SIX-Validator (Standard QR 2.3 CH) ohne Fehler, Raiffeisen- und PostFinance-App bestanden. Geprüft wurde die Variante QR-IBAN + QRR; die Varianten SCOR und «ohne Zahlungspflichtigen im QR-Code» sind nur automatisch getestet (Empfehlung im Protokoll)
- [X] T067 [P] `README.md` ergänzen: Zweck, Voraussetzungen, Start (`npm run dev`), Tests, Paketierung, Speicherort der Datenbank, Hinweis zur Sicherung
- [X] T068 `quickstart.md` komplett durchlaufen und Abweichungen in den Specs oder im Code korrigieren

---

## Phase 8: Natives Anwendungsmenü (FR-023)

**Purpose**: Deutsches Menü statt des englischen Electron-Standardmenüs; Entwicklerwerkzeuge nur im Entwicklungsmodus.

- [X] T069 [P] Test `tests/unit/menu.test.ts`: deutsche Hauptmenüs, Aktionen und Tastenkürzel (`CmdOrCtrl+N`, `CmdOrCtrl+1/2/3`, `CmdOrCtrl+Shift+S`), Bearbeiten über Rollen, Entwicklerwerkzeuge nur im Entwicklungsmodus, Prüfung eingehender Menü-Nachrichten
- [X] T070 [P] `src/shared/ipc/menu.ts` (Ereignis `menu:action`, Typ `MenuAction`, `isMenuAction`) und `src/main/menu-template.ts` (reine Menüvorlage ohne Electron-Laufzeitcode)
- [X] T071 `src/main/menu.ts` (Menü setzen, «Über SwissBill», Datenbank-Ordner anzeigen), Einbau in `src/main/index.ts`, `devTools: !app.isPackaged` in `src/main/window.ts`
- [X] T072 Preload `menu.onAction` (nur geprüfte Nachrichten) und Renderer: `src/renderer/App.tsx` (Navigation, «Neue Rechnung» genau einmal, Sicherung über `src/renderer/lib/backup.ts`), `src/renderer/pages/Invoices.tsx`; der Editor sichert nicht gespeicherte Eingaben beim Verlassen
- [X] T073 `tests/e2e/menu.e2e.ts` (Menüpunkte auslösen: Navigation, neue Rechnung, Sicherung) und Anpassung von `tests/e2e/security.e2e.ts`
- [X] T074 Navigation nur über das native Menü: Navigationseinträge nach «Ansicht» verschoben (`src/main/menu-template.ts`), Kopfzeile mit Schaltflächen aus `src/renderer/App.tsx` und `src/renderer/styles.css` entfernt, E2E-Tests über `goTo()` und `clickMenu()` in `tests/e2e/helpers.ts`
- [X] T075 Rechnungsempfänger: nur der Name ist Pflicht (FR-024): `validateDebtor` in `src/shared/domain/address.ts`, `qrDebtor` und optionaler Zahlungspflichtiger in `src/shared/domain/qr-payload.ts`, `NULL` für leeres Land in `src/main/db/invoice-repository.ts`, Länderpräfix und QR-Empfänger in `src/main/services/pdf-service.ts`, Hinweis zum QR-Zahlteil in `src/renderer/components/AddressFields.tsx` und `src/renderer/pages/InvoiceEditor.tsx`; Tests `tests/unit/address.test.ts`, `tests/unit/qr-payload.test.ts`, `tests/integration/debtor-optional.test.ts`, `tests/e2e/debtor-optional.e2e.ts`
- [X] T076 Erscheinungsbild folgt dem System (FR-025): eigene Farben über `light-dark()`-Tokens in `src/renderer/styles.css`, `nativeTheme` und Fensterhintergrund in `src/main/window.ts`; Test `tests/e2e/theme.e2e.ts` (Kontrast mindestens 4.5:1 in hell und dunkel)
- [X] T077 Vorschau in der verpackten App (schwarzes Feld): Die Netzwerksperre blockierte `chrome://resources/…` des PDF-Betrachters. Regel in `src/main/request-filter.ts` (erlaubt nur lokale Quellen und diese Betrachter-Ressourcen), eine leere `ELECTRON_RENDERER_URL` bedeutet «kein Entwicklungsserver»; Test-Setup startet die App ohne die Variable (`tests/e2e/helpers.ts`); Tests `tests/unit/request-filter.test.ts`, `tests/e2e/security.e2e.ts` (keine blockierten Anfragen während der Vorschau), `tests/e2e/packaged.e2e.ts` (Vorschau in der verpackten App); Kopfzeile des Editors bricht bei vielen Aktionen nicht mehr um (`src/renderer/styles.css`)
- [X] T078 Sofortprüfung der IBAN (FR-026): `ibanFeedback` und `formatIban` in `src/shared/domain/iban.ts`, Anzeige in `src/renderer/components/AddressFields.tsx`, Darstellung in Vierergruppen beim Laden (`src/renderer/lib/invoice-form.ts`, `src/renderer/pages/Settings.tsx`, `src/renderer/pages/InvoiceEditor.tsx`); Tests `tests/unit/iban.test.ts`, `tests/e2e/iban-live.e2e.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: keine Abhängigkeiten, sofort startbar. T006 (Spike) braucht T001, T002 und T005
- **Foundational (Phase 2)**: hängt von Setup ab und BLOCKIERT alle User Stories
- **User Stories (Phase 3 bis 6)**: hängen alle von Phase 2 ab
  - US1 zuerst (MVP). US2 baut auf den Repositories und dem Service aus US1 auf
  - US3 und US4 können nach US1 parallel zu US2 laufen, berühren aber dieselben Dateien (`invoice-service.ts`, `InvoiceEditor.tsx`), daher bei einem Entwickler sequentiell in der Reihenfolge P2, P3, P3
- **Polish (Phase 7)**: nach den gewünschten Stories

### User Story Dependencies

- **US1 (P1)**: nach Phase 2, keine Abhängigkeit zu anderen Stories. Absender und Schuldner werden direkt in der Rechnung erfasst
- **US2 (P2)**: nutzt Repository, Service und PDF aus US1
- **US3 (P3)**: ergänzt Vorbefüllung für den Editor aus US1; `settings-repository.ts` startet in US1 (T033)
- **US4 (P3)**: nutzt Service und Liste aus US1 und US2

### Within Each User Story

- Tests zuerst schreiben und fehlschlagen sehen
- Domäne vor Repository, Repository vor Service, Service vor IPC, IPC vor UI
- E2E-Test am Ende der Story

### Parallel Opportunities

- Setup: T003, T004, T005
- Foundational: T007 mit T009, T010; T008 mit T011; T018, T019
- US1: alle Tests T020 bis T027 gemeinsam; danach T028, T029, T030, T031
- US3: T051 und T052
- Polish: T062, T064, T065, T067

---

## Parallel Example: User Story 1

```bash
# Alle Tests für User Story 1 gemeinsam schreiben:
Task: "tests/unit/iban.test.ts"
Task: "tests/unit/reference.test.ts"
Task: "tests/unit/invoice-number.test.ts"
Task: "tests/unit/invoice-validation.test.ts"

# Domänenmodule gemeinsam implementieren:
Task: "src/shared/domain/iban.ts"
Task: "src/shared/domain/reference.ts"
Task: "src/shared/domain/invoice-number.ts"
Task: "src/shared/domain/qr-payload.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup (inklusive Spike T006 für `better-sqlite3`)
2. Phase 2: Foundational
3. Phase 3: User Story 1
4. **STOPP und prüfen**: Rechnung erstellen, ausstellen, PDF mit SIX-Validator prüfen (T066 vorziehen)
5. Erst danach weiter

### Incremental Delivery

1. Setup + Foundational → Fundament steht
2. US1 → Test → MVP: versandfähige Rechnung
3. US2 → Test → Rechnungen speichern und wiederfinden (Minimalprodukt)
4. US3 → Test → Absender und Kunden wiederverwenden
5. US4 → Test → Status und Storno
6. Polish → Sicherung, Fehlerfälle, Abnahme

---

## Notes

- [P] = andere Dateien, keine Abhängigkeiten
- [Story]-Label ordnet jede Aufgabe einer User Story zu
- Pro Aufgabe oder logischer Gruppe committen (Conventional Commits)
- Tests müssen vor der Implementierung fehlschlagen (Constitution Prinzip IV)
- Nur fiktive Testdaten verwenden, keine echten Kunden oder IBANs (Constitution)
- Vermeiden: unklare Aufgaben, Dateikonflikte, Abhängigkeiten zwischen Stories, die die Unabhängigkeit brechen
