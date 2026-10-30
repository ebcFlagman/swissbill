---

description: "Task list for CI-Build-Pipeline"
---

# Tasks: CI-Build-Pipeline

**Input**: Design documents from `/specs/002-ci-build-pipeline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ci-workflow.md, quickstart.md

**Tests**: Keine neuen Testdateien (nicht angefordert). Die Pipeline wird über die Szenarien in quickstart.md validiert.

**Organization**: Nach User Story gruppiert. Alle Stories ändern dieselbe Datei `.github/workflows/ci.yml`; sie werden daher nacheinander umgesetzt (kein `[P]` innerhalb der Workflow-Datei).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallel möglich (andere Datei, keine Abhängigkeit)
- **[Story]**: zugehörige User Story (US1, US2, US3)

## Path Conventions

Einzelprojekt: Workflow unter `.github/workflows/ci.yml`, Doku in `README.md`. Kein Anwendungscode.

---

## Phase 1: Setup

**Purpose**: Ausgangslage prüfen, bevor die Workflow-Datei entsteht

- [X] T001 Lokal die Befehlsfolge `npm ci --ignore-scripts` (plus `node node_modules/electron/install.js`), `npm run lint`, `npm run typecheck`, `npm test`, `npm run package` auf einem sauberen Checkout ausführen und bestätigen, dass sie fehlerfrei durchläuft (Referenz für den Workflow; Ablauf siehe specs/002-ci-build-pipeline/quickstart.md)
- [X] T002 Verzeichnis `.github/workflows/` anlegen (leere Struktur, noch kein Workflow)

---

## Phase 2: Foundational

**Purpose**: Gemeinsames Gerüst des Workflows, das alle Stories brauchen

**⚠️ CRITICAL**: Zuerst abschliessen

- [X] T003 Gerüst von `.github/workflows/ci.yml` erstellen: Name `CI`; Auslöser `push` (alle Branches), `pull_request` (Ziel `main`) und `workflow_dispatch`; `permissions: contents: read`; `concurrency` mit Gruppe `ci-${{ github.ref }}` und `cancel-in-progress: true`; ein paralleler Push- und PR-Lauf desselben Branches ist akzeptiert (FR-001, FR-011; contracts/ci-workflow.md)

**Checkpoint**: Gerüst vorhanden, Jobs folgen in den Stories

---

## Phase 3: User Story 1 - Automatische Qualitätsprüfung (Priority: P1) 🎯 MVP

**Goal**: Jeder Push/PR installiert Abhängigkeiten, führt Lint, Typprüfung, Tests aus und baut die App; Ergebnis pro Schritt sichtbar.

**Independent Test**: Branch pushen: Workflow `CI` startet, Job `verify` grün; Lint-/Typ-/Testfehler macht ihn rot (quickstart Szenarien 1–4).

### Implementation for User Story 1

- [X] T004 [US1] Job `verify` in `.github/workflows/ci.yml` anlegen: `runs-on: windows-latest`, `timeout-minutes: 15`, Schritte `actions/checkout@v4` und `actions/setup-node@v4` mit `node-version: 24` und `cache: npm` (FR-010, FR-013)
- [X] T005 [US1] In `verify` Schritt `npm ci` ergänzen (FR-002)
- [X] T006 [US1] In `verify` einzelne, benannte Schritte `npm run lint`, `npm run typecheck` und `npm test` ergänzen, damit das Ergebnis je Schritt sichtbar ist (FR-003, FR-004, FR-005, FR-008)
- [X] T007 [US1] In `verify` den Schritt `npm run package` ergänzen (baut via `electron-vite build` und paketiert; FR-006) und `VITE_PRIMEUI_LICENSE: ${{ secrets.PRIMEUI_LICENSE }}` als Umgebungsvariable nur für diesen Schritt setzen; ohne Secret muss der Schritt trotzdem laufen (research.md §7)
- [X] T008 [US1] Workflow-Datei pushen und quickstart Szenarien 1, 2 und 4 prüfen; in Wegwerf-Branches je einen Lint-Fehler, Typfehler und fehlschlagenden Test pushen (Szenario 3) und anschliessend die Branches löschen

**Checkpoint**: Pipeline prüft jede Änderung; MVP erreicht

---

## Phase 4: User Story 2 - Build-Artefakte bereitstellen (Priority: P2)

**Goal**: Aus einem grünen Lauf lässt sich die gebaute Windows-App herunterladen und starten.

**Independent Test**: Artefakt herunterladen, entpacken, `SwissBill.exe` starten (quickstart Szenario 5).

### Implementation for User Story 2

- [X] T009 [US2] In `verify` nach `npm run package` den Schritt `actions/upload-artifact@v4` ergänzen: Name `swissbill-win-unpacked-${{ github.sha }}`, Pfad `release/win-unpacked/`, `retention-days: 14`, `if-no-files-found: error`; läuft nur nach erfolgreichen Vorschritten (FR-007, data-model.md)
- [X] T010 [US2] Sicherstellen, dass das Artefakt keine Daten enthält: im Artefakt-Pfad keine `*.db`, `*.pdf` und `.env*`-Dateien (FR-012); Inhalt eines Laufs prüfen und quickstart Szenario 5 durchführen
- [X] T011 [US2] Quickstart Szenario 8 prüfen: Lauf ohne gesetztes Secret `PRIMEUI_LICENSE` baut trotzdem und das Log enthält keinen Schlüssel

**Checkpoint**: US1 und US2 funktionieren unabhängig

---

## Phase 5: User Story 3 - Optionale End-to-End-Prüfung (Priority: P3)

**Goal**: E2E-Tests laufen headless auf dem Standard-Windows-Runner als eigener, nicht blockierender Job; scheitert das zuverlässig, entfällt der Job.

**Independent Test**: Lauf zeigt `CI / e2e` getrennt von `CI / verify` (quickstart Szenario 6).

### Implementation for User Story 3

- [X] T012 [US3] Job `e2e` in `.github/workflows/ci.yml` anlegen: `needs: verify`, `runs-on: windows-latest`, `timeout-minutes: 20`, Checkout, Node 24 mit npm-Cache, `npm ci`, Artefakt aus `verify` nach `release/win-unpacked/` herunterladen (`actions/download-artifact@v4`), danach `npm run test:e2e` ohne zusätzliche Display-Einrichtung und ohne `continue-on-error`: ein Fehlschlag färbt den Lauf rot, `verify` und das Artefakt bleiben unberührt; der Job wird nicht als Pflicht-Check geführt (FR-009, research.md §3)
- [X] T013 [US3] In `e2e` bei Fehlschlag `playwright-report/` und `test-results/` mit `actions/upload-artifact@v4` hochladen (`if: failure()`, `retention-days: 14`; FR-009)
- [X] T014 [US3] Auf einem Test-Branch prüfen, ob `e2e` ohne Desktop-Einrichtung zuverlässig grün läuft (mindestens 3 Läufe in Folge, quickstart Szenario 6 mit absichtlich gebrochenem Test). Entscheidung festhalten: bei Instabilität den Job `e2e` aus `.github/workflows/ci.yml` entfernen und den Abschnitt in README.md (T015) anpassen (Clarification 2026-10-30)

**Checkpoint**: Alle Stories umgesetzt; E2E blockieren weder Prüfung noch Artefakt

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T015 [P] Abschnitt «Continuous Integration» in `README.md` ergänzen: Auslöser, Jobs `verify`/`e2e`, lokale Entsprechung der Schritte (`npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run package`, `npm run test:e2e`), Artefakt-Download, optionales Secret `PRIMEUI_LICENSE`, Hinweis dass nur `CI / verify` Pflicht-Check ist, sowie Status-Badge (FR-014)
- [X] T016 Quickstart Szenario 7 prüfen: zwei Läufe ohne Änderung an `package-lock.json`, der zweite ist wegen des npm-Caches schneller (SC-005)
- [X] T017 Konformität gegen constitution.md abgleichen (keine Geheimnisse im Repository, keine Telemetrie, keine echten Daten) und specs/002-ci-build-pipeline/quickstart.md vollständig durchgehen

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → Stories → **Polish**
- Alle Stories bearbeiten dieselbe Datei und laufen daher sequentiell: US1 → US2 → US3

### User Story Dependencies

- **US1 (P1)**: nach Phase 2, keine Abhängigkeit
- **US2 (P2)**: erweitert Job `verify` aus US1 (T009 nach T007)
- **US3 (P3)**: benötigt das Artefakt aus US2 (T012 nach T009)

### Parallel Opportunities

- Nur T015 (README) ist parallel zu den Workflow-Aufgaben möglich, da eine andere Datei; Inhalt zu E2E erst nach T014 final.

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 und 2, dann Phase 3 abschliessen
2. **STOPP und prüfen**: Szenarien 1–4 aus quickstart.md
3. Als PR mergen; Pflicht-Check `CI / verify` in den Repository-Einstellungen manuell aktivieren

### Incremental Delivery

1. US1 → Qualitäts-Gate
2. US2 → Download der App
3. US3 → optionale E2E (bei Instabilität entfernen)
4. Polish → Dokumentation und Cache-Messung

---

## Notes

- Nur bestehende npm-Skripte verwenden; keine neuen Abhängigkeiten
- Action-Versionen auf Hauptversionen pinnen (`@v4`)
- Nach jeder Aufgabe oder logischen Gruppe committen (Conventional Commits, z. B. `ci: add verify job`)
