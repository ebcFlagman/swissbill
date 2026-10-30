# Implementation Plan: CI-Build-Pipeline

**Branch**: `002-ci-build-pipeline` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-ci-build-pipeline/spec.md`

## Summary

Eine GitHub-Actions-Pipeline (`.github/workflows/ci.yml`) prüft jeden Push und Pull Request: reproduzierbare Installation
(`npm ci`), Lint, Typprüfung, Unit-/Integrationstests, Build und Windows-Paketierung. Das Paket (`release/win-unpacked/`)
wird als Artefakt hochgeladen. Ein zweiter, von der Qualitätsprüfung abhängiger Job führt die optionalen Playwright-E2E-Tests (inkl.
verpackter App) auf Windows aus und lädt bei Fehlern Berichte hoch; er ist kein Pflicht-Check, färbt den Lauf bei Fehlern aber rot.
Bleibt er instabil, wird er entfernt. Es werden ausschliesslich bestehende npm-Skripte genutzt;
am Anwendungscode ändert sich nichts. Details: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 6 auf Node.js 24 (Workflow-YAML als neue Artefakte)

**Primary Dependencies**: GitHub Actions (`actions/checkout`, `actions/setup-node` mit npm-Cache, `actions/upload-artifact`); bestehend: electron-vite, electron-builder, Vitest, Playwright

**Storage**: N/A (Artefakte im Speicher von GitHub Actions, begrenzte Aufbewahrung)

**Testing**: Bestehende Suiten (`npm test`, `npm run test:e2e`); die Pipeline selbst wird per Test-Branch mit absichtlichen Fehlern validiert ([quickstart.md](quickstart.md))

**Target Platform**: Windows-Runner (`windows-latest`), da Zielplattform Windows ist und `better-sqlite3`-Binaries sowie das `win-unpacked`-Paket windowsspezifisch sind; die optionalen E2E-Tests laufen dort ohne zusätzliche Display-Einrichtung (Windows-Runner haben eine interaktive Sitzung)

**Project Type**: Desktop-App (Electron); Feature betrifft nur die Build-Infrastruktur

**Performance Goals**: Qualitäts-Job < 10 Min. (SC-002); Cache bringt ≥ 30 % (SC-005)

**Constraints**: Keine Telemetrie/echten Daten; Lizenzschlüssel nur über Repository-Secret; Forks ohne Secrets; Job-Timeouts gesetzt

**Scale/Scope**: Eine Workflow-Datei, zwei Jobs, ein Artefakt, README-Abschnitt

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Prinzip | Bewertung |
|---|---|
| I. QR-Rechnungs-Konformität | Nicht berührt. Die Pipeline führt die bestehenden Konformitätstests bei jeder Änderung aus und stärkt das Prinzip. ✅ |
| II. Local-First / Offline | Betrifft nur die Entwicklungsinfrastruktur, nicht die App. Die App erhält keine Cloud-Abhängigkeit, keine Telemetrie; Artefakte enthalten keine Daten. ✅ |
| III. Datenintegrität | Nicht berührt. Keine Datenbank im Artefakt (FR-012); E2E nutzen temporäre Datenordner. ✅ |
| IV. Test-First | Pipeline erzwingt Tests inkl. E2E für kritische Abläufe (Create → Save → PDF). ✅ |
| V. Einfachheit & Electron-Security | Nur bestehende Skripte, keine neuen Abhängigkeiten, keine Anwendungsänderung. ✅ |
| Workflow-Gates | «Lint, Typprüfung, Tests vor Merge» wird automatisiert. ✅ |
| Datenschutz | Keine echten Daten/Geheimnisse im Repository; Lizenzschlüssel nur als Secret. ✅ |

Keine Verstösse; Complexity Tracking entfällt. **Re-Check nach Phase 1**: unverändert bestanden (Design fügt keine Abhängigkeiten oder Daten hinzu).

## Project Structure

### Documentation (this feature)

```text
specs/002-ci-build-pipeline/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ci-workflow.md
└── tasks.md             # /speckit-tasks (nicht Teil von /speckit-plan)
```

### Source Code (repository root)

```text
.github/
└── workflows/
    └── ci.yml           # neu: Jobs «verify» und «e2e»
README.md                # ergänzt: Abschnitt «Continuous Integration» (FR-014), Status-Badge
```

**Structure Decision**: Bestehende Einzelprojekt-Struktur bleibt unverändert; neu ist nur `.github/workflows/ci.yml` plus
Dokumentation. Kein Anwendungscode, keine Tests und keine `package.json`-Änderung nötig.

## Complexity Tracking

Keine Verstösse gegen die Verfassung.
