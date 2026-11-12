---
description: "Aufgabenliste: Adresseingabe mit Vorschlägen (Geoapify)"
---

# Tasks: Adresseingabe mit Vorschlägen (Geoapify)

**Input**: Design-Dokumente aus `/specs/004-geoapify-address-autocomplete/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc-addresses.md, quickstart.md

**Tests**: Enthalten. Die Constitution (Prinzip IV) verlangt Domänenlogik test-first und mindestens einen E2E-Test für kritische Abläufe. Tests einer Gruppe werden zuerst geschrieben und MÜSSEN fehlschlagen, bevor die Umsetzung beginnt. Kein Test spricht mit dem echten Geoapify; es gibt immer einen Fake (Fake-`fetch` bzw. lokaler Fake-Server).

**Organisation**: Nach User Stories gruppiert. Alle drei Stories haben Priorität P1. Die Reihenfolge der Phasen folgt der Abhängigkeit: US2 (Key speichern) → US1 (Vorschläge) → US3 (Fallback). Das MVP sind US2 und US1 zusammen.

## Format: `[ID] [P?] [Story] Beschreibung`

- **[P]**: parallel ausführbar (andere Dateien, keine Abhängigkeit zu offenen Aufgaben)
- **[Story]**: zugehörige User Story (US1, US2, US3)
- Pfade relativ zum Repository-Wurzelverzeichnis

## Phase 1: Setup

**Purpose**: Grundlagen klären, die später Tests und Umsetzung bestimmen

- [X] T001 Aktuelle Geoapify-Dokumentation zu «Address Autocomplete» prüfen (Parameter `text`, `lang`, `limit`, `format`, `bias`, `apiKey`, Antwortfelder `street`, `housenumber`, `postcode`, `city`, `country_code`, Statuscodes 401/403/429) und das Ergebnis in `specs/004-geoapify-address-autocomplete/research.md` (Abschnitt 2) korrigieren, falls es abweicht
- [X] T002 [P] Eine fiktive Beispielantwort (3 Schweizer Adressen, eine ohne Hausnummer, eine im Ausland, nur erfundene Daten) als `tests/fixtures/geoapify-autocomplete.json` anlegen
- [X] T003 [P] Das API von PrimeReact `AutoComplete` (`@primereact/ui/autocomplete`: Vorschlagsliste, Vervollständigungs-Callback, Auswahl-Callback, `disabled`, Tastaturbedienung) über das PrimeReact-MCP oder `node_modules/@primereact/ui/autocomplete/index.d.ts` prüfen und die gewählte Verwendung in `specs/004-geoapify-address-autocomplete/research.md` (Abschnitt 6) festhalten

---

## Phase 2: Foundational (blockiert alle User Stories)

**Purpose**: Gemeinsame Bausteine: Migration, verschlüsselte Ablage, Key-Typen, Geoapify-Client, Vorschlagstyp

**⚠️ CRITICAL**: Keine User Story darf beginnen, bevor diese Phase abgeschlossen ist

### Tests zuerst

- [X] T004 [P] Unit-Test für die Abbildung der Geoapify-Antwort auf `AddressSuggestion` (`label`, `street`, `houseNo`, `zip`, `city`, `country` als 2 Buchstaben gross; fehlende Hausnummer → leer; Auslandsadresse; nichts wird gekürzt) in `tests/unit/address-suggestion.test.ts`, Daten aus `tests/fixtures/geoapify-autocomplete.json`
- [X] T005 [P] Unit-Test für die Key-Regeln in `tests/unit/settings-key.test.ts`: getrimmt, höchstens 200 Zeichen, keine Leerzeichen oder Steuerzeichen im Inneren, leer ist erlaubt
- [X] T006 [P] Integrationstest `tests/integration/geoapify-client.test.ts` mit Fake-`fetch`: Erfolg, HTTP 401 und 403 → `invalid_key`, 429 → `quota`, Netzwerkfehler → `offline`, Abbruch nach dem Zeitlimit von 5 s → `timeout`, andere Fehler → `unavailable`; die Anfrage geht nur an `https://api.geoapify.com/` mit `limit=5`, `lang=de`, `bias=countrycode:ch` und enthält nur den Suchtext und den Key; weder geworfene Fehler noch Logzeilen enthalten den Key oder die URL
- [X] T007 [P] Migrationstest in `tests/integration/migrate.test.ts` erweitern: nach Migration 002 ist `user_version` 2, bestehende Einstellungen und Rechnungen bleiben erhalten, `geoapify_api_key` ist NULL

### Umsetzung

- [X] T008 Migration `src/main/db/migrations/002_geoapify_key.sql` anlegen: `ALTER TABLE settings ADD COLUMN geoapify_api_key BLOB;` (NULL = nicht gesetzt, nur verschlüsselter Wert)
- [X] T009 [P] `src/main/secret-store.ts` anlegen: nur die Schnittstelle `SecretStore` (`isAvailable()`, `encrypt(text): Buffer`, `decrypt(data): string | null`, bei Fehler `null`), **ohne** Import von `electron` (Vitest kann `electron` nicht laden); die Umsetzung über Electron `safeStorage` (`isEncryptionAvailable()`) kommt getrennt nach `src/main/electron-secret-store.ts`; dazu der Test-Fake `tests/fixtures/secret-store.ts` (verfügbar, nicht verfügbar, nicht entschlüsselbar). Nur bei nicht verpackter App darf die Umgebungsvariable `SWISSBILL_SECRET_STORE=memory` einen Speicher-Store statt `safeStorage` wählen (für E2E-Läufe ohne Betriebssystem-Schlüsselbund, z. B. Linux)
- [X] T010 [P] `src/shared/domain/address-suggestion.ts` anlegen: Typ `AddressSuggestion`, Funktion `toSuggestions(response)` (macht T004 grün), Konstante `MIN_QUERY_LENGTH = 3`
- [X] T011 `src/shared/domain/settings.ts` erweitern: `Settings` (Ausgabe von `settings:get`) erhält nur `geoapifyKeySet: boolean` und `geoapifyKeyStatus` (`GeoapifyKeyStatus` = `'none' | 'ok' | 'undecryptable' | 'encryption-unavailable'`), **nie** den Key; Eingabetyp `SettingsInput` ohne diese beiden Felder, dafür `geoapifyApiKey?: string` (`undefined` = unverändert, `''` = entfernen, sonst setzen); Key-Regeln aus T005 in `validateSettings` (macht T005 grün)
- [X] T012 `src/shared/ipc/settings.ts` anpassen: `settingsSchema` für `SettingsInput` mit `geoapifyApiKey: text(200).optional()`; `src/shared/ipc/api.ts` und `src/preload/index.ts` auf `SettingsInput` für `settings.save` umstellen
- [X] T013 `src/main/db/settings-repository.ts` anpassen: das bestehende `getSettings(db)` bleibt ohne Key-Zugriff (Signatur unverändert, damit `InvoiceService` nicht berührt wird); neue Funktionen `getKeyState(db, secrets)` (liefert `geoapifyKeySet` und Status), `readApiKey(db, secrets)` (Klartext nur nach erfolgreicher Entschlüsselung, sonst `null`) und `writeApiKey(db, secrets, key)` (Spalte `geoapify_api_key`; `''` setzt NULL und ist immer erlaubt; Setzen ohne verfügbare Verschlüsselung schreibt nichts und meldet `encryption-unavailable`)
- [X] T014 `src/main/services/settings-service.ts` anpassen: `SecretStore` als Pflichtparameter entgegennehmen (kein Standardwert, damit Tests nie `electron` laden), `get()` ergänzt `geoapifyKeySet` und `geoapifyKeyStatus`, `save()` trimmt und verarbeitet `geoapifyApiKey` nach den Regeln aus T011/T013; `src/main/ipc/register.ts` erzeugt die Umsetzung aus `electron-secret-store.ts` (bzw. den Speicher-Store nach T009) und übergibt sie. `src/main/services/invoice-service.ts` bleibt unverändert und liest den Key nie
- [X] T015 `src/main/services/geoapify-client.ts` anlegen (macht T006 grün): `fetch`-Injektion für Tests, Zeitlimit 5 s über `AbortController`, fester Host `api.geoapify.com`, URL nur lokal gebaut, Fehler nur als Grund (`offline | invalid_key | quota | timeout | unavailable`), nie URL oder Key in Fehlern oder Logs; Basis-URL nur bei nicht verpackter App über die Umgebungsvariable `SWISSBILL_GEOAPIFY_BASE_URL` überschreibbar (für E2E mit Fake-Server)
- [X] T016 [P] Bestehende Tests und Fixtures an die neue `Settings`-Form anpassen: `tests/fixtures/db.ts` und `validSettings` in `tests/integration/customers-settings.test.ts` sowie jeden weiteren Test, der `new SettingsService(...)` aufruft (jetzt mit Fake-`SecretStore` als Pflichtparameter) (`Settings` enthält neu `geoapifyKeySet: false` und `geoapifyKeyStatus: 'none'`, die Eingabe `SettingsInput` ohne diese Felder, Fake-`SecretStore` einbinden; das `toEqual` in Zeile 205 muss die neuen Felder berücksichtigen); `npm test` und `npm run typecheck` sind danach grün

**Checkpoint**: Fundament steht, User Stories können beginnen

---

## Phase 3: User Story 2 - API-Key in den Einstellungen hinterlegen (Priority: P1) 🎯 MVP

**Goal**: Der Key lässt sich eingeben, prüfen, ändern, entfernen und bleibt verschlüsselt über Neustarts erhalten.

**Independent Test**: In den Einstellungen einen Key speichern, die App neu starten, Key ist noch gesetzt; Key leeren, Funktion gilt als nicht eingerichtet; die Datenbankdatei enthält den Key nicht im Klartext.

### Tests für User Story 2 ⚠️ (zuerst, müssen fehlschlagen)

- [X] T017 [P] [US2] Integrationstest `tests/integration/settings-key.test.ts`: nach Speichern und Neuladen liefert `settings.get()` `geoapifyKeySet: true` und **nie** den Key (auch nicht in `invoices`-Daten); `readApiKey` liefert den Klartext nur im Main; `geoapifyApiKey: undefined` lässt den Key unverändert; führende und nachfolgende Leerzeichen werden entfernt; Leeren (`''`) setzt Status `none` und funktioniert auch bei Status `undecryptable` und `encryption-unavailable` (FR-017); die rohe Spalte `geoapify_api_key` enthält den Klartext nicht (weder als Text noch als Bytefolge); eine Sicherung über `BackupService` enthält ihn ebenfalls nicht im Klartext; Verschlüsselung nicht verfügbar → nichts gespeichert, Status `encryption-unavailable`; nicht entschlüsselbarer Wert → `geoapifyKeySet: false`, Status `undecryptable`, und `readApiKey` liefert `null`
- [X] T018 [P] [US2] Integrationstest für `testKey` in `tests/integration/address-service.test.ts` (Fake-Client): Ergebnisse `valid`, `invalid_key`, `quota`, `offline`, `timeout`; der geprüfte Key wird nicht gespeichert
- [X] T019 [P] [US2] E2E-Test `tests/e2e/settings-key.e2e.ts`: Key eintragen, «Key prüfen» gegen lokalen Fake-Server, speichern, App neu starten (`relaunch`), die Einstellungen zeigen «Key gespeichert» statt des Keys, danach entfernen und speichern; der Datenschutzhinweis nach FR-010 ist sichtbar; zusätzlich Hinweis «Verschlüsselung auf diesem Gerät nicht verfügbar», wenn die Umgebung das meldet

### Umsetzung für User Story 2

- [X] T020 [US2] `src/main/services/address-service.ts` anlegen mit `testKey(apiKey)` auf Basis von `geoapify-client.ts` (Probeanfrage «Bahnhofstrasse», Ergebnis `valid | invalid_key | quota | offline | timeout`, Key wird nicht gespeichert und nicht geloggt)
- [X] T021 [P] [US2] `src/shared/ipc/addresses.ts` anlegen: zod-Schema `testKey` (`apiKey` 1 bis 200 Zeichen nach Trimmen), Ergebnistypen `KeyCheckResult` und `SuggestResult` aus `data-model.md`; Kanäle `addresses:suggest` und `addresses:testKey` in `CHANNELS` und im Typ `SwissbillApi` (`src/shared/ipc/api.ts`) ergänzen
- [X] T022 [US2] `src/main/ipc/addresses.ts` anlegen (Handler für `testKey`; `suggest` folgt in US1), in `src/main/ipc/register.ts` registrieren und in `src/preload/index.ts` den Namensraum `addresses` freigeben
- [X] T023 [US2] `src/renderer/pages/Settings.tsx`: Feld «Geoapify-API-Key» (verdeckte Eingabe), Hilfetext zum Zweck und zum Fallback ohne Key, Datenschutzhinweis nach FR-010 (getippte Adressangaben gehen an Geoapify, nur mit Key; Sicherung enthält den Key nur verschlüsselt und ist gerätegebunden), Schaltfläche «Key prüfen» mit verständlicher Rückmeldung (gültig / ungültig / Kontingent / keine Verbindung / Zeitüberschreitung), nach dem Speichern nur «Key gespeichert» (der Key wird nie angezeigt; Neueingabe ersetzt ihn, «Key entfernen» löscht ihn), Statusmeldungen für `encryption-unavailable` und `undecryptable` («Key neu eingeben»), `SettingsForm` und `toForm` erweitern; Speichern sendet `geoapifyApiKey` nur, wenn die Person ihn geändert oder entfernt hat

**Checkpoint**: US2 ist eigenständig nutzbar und testbar

---

## Phase 4: User Story 1 - Adresse per Vorschlag übernehmen (Priority: P1)

**Goal**: Beim Tippen im Strassenfeld erscheinen Vorschläge; die Auswahl füllt Strasse, Nr., PLZ, Ort, Land.

**Independent Test**: Key hinterlegen (Fake-Server), «Bahnhofstr 1 Zür» tippen, Vorschlag wählen: alle fünf Felder sind gefüllt, Name und IBAN unverändert, alle Felder bleiben änderbar.

### Tests für User Story 1 ⚠️ (zuerst, müssen fehlschlagen)

- [X] T024 [P] [US1] Unit-Test für `applySuggestion(address, suggestion)` in `tests/unit/address-suggestion.test.ts`: überschreibt `street`, `houseNo`, `zip`, `city`, `country`; `name` und `iban` bleiben; bestehende Werte in PLZ, Ort und Land werden überschrieben; zu lange Werte werden nicht gekürzt; Suchtext unter `MIN_QUERY_LENGTH` (3 Zeichen nach Trimmen) löst keine Abfrage aus; die mit `applySuggestion` übernommenen Fixture-Adressen bestehen `validateAddress` aus `src/shared/domain/address.ts` (SC-006)
- [X] T025 [P] [US1] Integrationstest für `suggest` in `tests/integration/address-service.test.ts`: kein Key → `{ status: 'disabled' }` und der Fake-`fetch` wurde nicht aufgerufen; mit Key → höchstens 5 Vorschläge; gesendet wird nur der Suchtext (keine Namen, IBAN, Beträge)
- [X] T026 [P] [US1] E2E-Test `tests/e2e/address-suggest.e2e.ts` mit lokalem Fake-Server (Env `SWISSBILL_GEOAPIFY_BASE_URL`): Vorschläge erscheinen ab 3 Zeichen, Auswahl per Maus und per Tastatur (Pfeiltasten, Enter, Escape) füllt die Felder, Name und IBAN bleiben, Handänderung danach bleibt bestehen, Test an den Formularen Absender, Empfänger und Kunde

### Umsetzung für User Story 1

- [X] T027 [US1] `suggest(text)` in `src/main/services/address-service.ts` ergänzen (Key im Main über `readApiKey` aus T013 lesen, `disabled` ohne Key, sonst Aufruf des Clients, höchstens 5 Vorschläge) und in `src/main/ipc/addresses.ts` als Kanal `addresses:suggest` registrieren (Eingabe `text` 3 bis 200 Zeichen nach Trimmen)
- [X] T028 [P] [US1] `applySuggestion` in `src/shared/domain/address-suggestion.ts` ergänzen (macht T024 grün)
- [X] T029 [P] [US1] Zuerst den Test `tests/unit/use-address-suggestions.test.ts` schreiben (Fake-Timer: pro Tipppause von 300 ms höchstens eine Anfrage, unter 3 Zeichen keine Anfrage, bei zwei überlappenden Antworten zählt nur die letzte), dann `src/renderer/lib/use-address-suggestions.ts` anlegen: Hook mit Entprellung 300 ms, Mindestlänge 3, Anfragezähler, der veraltete Antworten verwirft (FR-013), liefert `suggestions`, `status`
- [X] T030 [US1] `src/renderer/components/AddressFields.tsx`: Strassenfeld als PrimeReact `AutoComplete` mit Vorschlägen aus dem Hook, Auswahl ruft `applySuggestion` auf und übernimmt über `onChange`; Anzeige `label`; Verhalten ohne Vorschläge identisch zum bisherigen `InputText`; bei `disabled` keine Abfrage (FR-016)

**Checkpoint**: US1 und US2 zusammen bilden das MVP

---

## Phase 5: User Story 3 - Fallback auf die bisherige Eingabe (Priority: P1)

**Goal**: Ohne Key oder bei jedem Dienstfehler läuft die Eingabe unverändert und ungestört weiter.

**Independent Test**: Ohne Key null Anfragen am Fake-Server; mit Key und Fehlerantworten (401, 429, Timeout, nicht erreichbar) bleibt die Handeingabe möglich und es erscheint höchstens ein dezenter Hinweis.

### Tests für User Story 3 ⚠️ (zuerst, müssen fehlschlagen)

- [X] T031 [P] [US3] Integrationstest in `tests/integration/address-service.test.ts` ergänzen: Dienstfehler ergeben `{ status: 'error', reason }` mit den Gründen `offline`, `invalid_key`, `quota`, `timeout`, `unavailable` (der `Result` bleibt `ok: true`); nicht entschlüsselbarer oder nicht verfügbarer Key → `disabled` ohne Netzwerkanfrage
- [X] T032 [P] [US3] E2E-Test `tests/e2e/address-fallback.e2e.ts`: (a) ohne Key zählt der Fake-Server null Anfragen und das Formular funktioniert wie zuvor (SC-005); (b) Fake antwortet 401, 429, langsam oder ist nicht erreichbar: Eingabe, Speichern und Ausstellen bleiben möglich, nur ein dezenter Hinweis erscheint; (c) gesperrtes Formular (ausgestellte Rechnung) sendet keine Anfrage
- [X] T033 [P] [US3] E2E-Zusatz in `tests/e2e/security.e2e.ts`: Der Renderer bleibt netzlos (Anfragen an `api.geoapify.com` aus dem Renderer werden weiterhin blockiert), auch wenn ein Key gespeichert ist

### Umsetzung für User Story 3

- [X] T034 [US3] `suggest` in `src/main/services/address-service.ts` um die Fehlerabbildung erweitern (Client-Grund → `{ status: 'error', reason }`, nicht entschlüsselbarer oder nicht verfügbarer Key → `disabled`) (macht T031 grün)
- [X] T035 [US3] `src/renderer/components/AddressFields.tsx` und `src/renderer/lib/use-address-suggestions.ts`: bei `error` nur dezenter Hinweis unter dem Strassenfeld mit festen deutschen Texten pro Grund («Vorschläge momentan nicht verfügbar», «Geoapify-Schlüssel ungültig», «Kontingent erschöpft»), die Eingabe wird nie blockiert, Speichern und Ausstellen bleiben unberührt (FR-009)

**Checkpoint**: Alle drei Stories sind eigenständig funktionsfähig

---

## Phase 6: Polish & Querschnitt

- [X] T036 [P] Kommentar in `src/main/request-filter.ts` anpassen (Renderer bleibt netzlos; der einzige Netzwerkzugriff ist der Main-Dienst mit Key, siehe Constitution Prinzip II)
- [X] T037 [P] `README.md` anpassen (Zeilen zu «vollständig offline» und «Netzwerkzugriffe»: Ausnahme optionale Adressvorschläge mit eigenem Geoapify-Key, verschlüsselt gespeichert) und kurze Anleitung zum Key
- [X] T038 Prüfen, dass der Key nirgends geloggt oder in Fehlermeldungen, PDFs und QR-Daten erscheint (`src/main/log.ts`, `src/main/services/pdf-service.ts`, `src/shared/domain/qr-payload.ts`), und bei Bedarf einen Test in `tests/integration/address-service.test.ts` ergänzen
- [X] T039 `npm run typecheck`, `npm run lint` und `npm test` ausführen und alle Meldungen beheben
- [X] T040 `npm run test:e2e` ausführen
- [ ] T041 Validierung nach `specs/004-geoapify-address-autocomplete/quickstart.md` durchführen; die manuelle Prüfung mit echtem Key und den 10 Testadressen gehört dazu, weil SC-001 (unter 10 Sekunden) und SC-002 (mindestens 90 % unter den ersten 5 Vorschlägen) nur so geprüft werden können, und das Ergebnis wird in `docs/validation-log.md` festgehalten
- [ ] T042 `.specify/memory/constitution.md` (v1.1.0) mit dem ersten Commit dieser Funktion committen (`docs: amend constitution to v1.1.0 (opt-in Geoapify address suggestions)`) und danach den Constitution-Check gegen v1.1.0 festhalten: Ausnahme von Prinzip II wird eingehalten (kein Netzwerk ohne Key, nur Host `api.geoapify.com`, nur Suchtext und Key, Fallback bei jedem Fehler)

---

## Dependencies & Execution Order

### Phase-Abhängigkeiten

- **Setup (Phase 1)**: keine Abhängigkeit
- **Foundational (Phase 2)**: nach Setup; blockiert alle Stories
- **US2 (Phase 3)**: nach Foundational
- **US1 (Phase 4)**: nach Foundational; für den E2E-Test wird der Key über US2 oder direkt über den Service gesetzt
- **US3 (Phase 5)**: nach Foundational; Hinweise im UI bauen auf dem Hook aus US1 auf (T035 nach T029 und T030)
- **Polish (Phase 6)**: nach allen gewünschten Stories

### Innerhalb der Gruppen

- Tests zuerst, müssen fehlschlagen
- T008 (Migration) vor T013; T009 vor T013 und T014; T011 vor T012, T013, T014; T015 vor T020
- T020 vor T022; T021 vor T022; T027 nach T022 und T020
- T029 und T028 vor T030

### Parallele Möglichkeiten

- Setup: T002 und T003
- Foundational-Tests: T004, T005, T006, T007 gleichzeitig; Umsetzung T009, T010 gleichzeitig, danach T011 bis T014 der Reihe nach, T015 und T016 gleichzeitig dazu
- US2-Tests T017, T018, T019 gleichzeitig; T021 parallel zu T020
- US1-Tests T024, T025, T026 gleichzeitig; T028 und T029 gleichzeitig
- US3-Tests T031, T032, T033 gleichzeitig
- Polish: T036 und T037 gleichzeitig

### Beispiel: Foundational-Tests

```text
Task: "Unit-Test Abbildung Geoapify-Antwort in tests/unit/address-suggestion.test.ts"
Task: "Unit-Test Key-Regeln in tests/unit/settings-key.test.ts"
Task: "Integrationstest Client in tests/integration/geoapify-client.test.ts"
Task: "Migrationstest in tests/integration/migrate.test.ts"
```

---

## Implementation Strategy

### MVP zuerst (US2 + US1)

1. Phase 1 und Phase 2 abschliessen
2. Phase 3 (US2): Key speichern und prüfen
3. Phase 4 (US1): Vorschläge anzeigen und übernehmen
4. **Stopp und prüfen**: Quickstart-Schritte 1 bis 4 mit Fake-Server
5. Danach Phase 5 (US3) für die vollständige Fallback-Hinweise, dann Phase 6

### Inkrementelle Lieferung

1. Fundament → US2 (Key) → US1 (Vorschläge) → US3 (Fallback-Hinweise) → Polish
2. Jede Stufe lässt die App ohne Key unverändert funktionieren (SC-003)

## Notes

- [P] = andere Dateien, keine Abhängigkeit
- Commit nach jeder Aufgabe oder logischen Gruppe (Conventional Commits, z. B. `feat(address): …`)
- Kein Test benutzt den echten Geoapify-Dienst oder einen echten Key; Beispieldaten sind fiktiv (Constitution, Datenschutz)
- Vermeiden: Key in Logs oder Fehlern, Klartext-Ablage, Netzwerkzugriff im Renderer
