# Implementation Plan: Release-Pipeline

**Branch**: `003-release-pipeline` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-release-pipeline/spec.md`

## Summary

Ein eigenständiger GitHub-Actions-Workflow (`.github/workflows/release.yml`) veröffentlicht Releases. Auslöser sind
`workflow_dispatch` mit Eingabe `version` (nur vom Hauptbranch) oder ein gepushter Tag `v*`. Der Ablauf besteht aus vier Jobs:
`prepare` (Version validieren, Duplikate erkennen) → `verify` (Lint, Typprüfung, Unit-Tests) → `build` (Matrix Windows/Linux:
NSIS-Installer und AppImage mit electron-builder, Version per `extraMetadata.version`) → `release` (Prüfsummen, GitHub-Release als
Entwurf mit generierten Release Notes und Artefakten, dann Veröffentlichung; der Tag entsteht erst beim Veröffentlichen). Nur der
`release`-Job erhält Schreibrechte. `electron-builder.yml` und `package.json` werden um Linux-Ziel, Artefaktnamen und Skripte ergänzt;
am Anwendungscode ändert sich nichts. Details: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 6 auf Node.js 24 (Workflow-YAML und Konfigurationsänderungen als neue Artefakte)

**Primary Dependencies**: GitHub Actions (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, `actions/download-artifact`), `gh` CLI (auf Runnern vorinstalliert); bestehend: electron-vite, electron-builder 26 (NSIS, AppImage)

**Storage**: N/A (Artefakte kurzzeitig als Workflow-Artefakte, danach als Release-Dateien)

**Testing**: Bestehende Suiten (`npm test`) als Gate; die Pipeline selbst wird mit Testversionen (Vorabversion `0.0.0-test.N`) und absichtlichen Fehlerfällen validiert ([quickstart.md](quickstart.md)); die Versionslogik liegt in einem kleinen, per Vitest testbaren Skript

**Target Platform**: Build auf `windows-latest` (Windows x64, NSIS) und `ubuntu-latest` (Linux x64, AppImage); Prüfschritte auf `windows-latest` wie in der CI

**Project Type**: Desktop-App (Electron); Feature betrifft nur Build-/Release-Infrastruktur

**Performance Goals**: Auslösung bis Release ≤ 30 Min. (SC-002)

**Constraints**: Keine Telemetrie/echten Daten; Lizenzschlüssel optional per Secret; Schreibrechte nur im `release`-Job; kein Abbruch laufender Releases; Job-Timeouts gesetzt

**Scale/Scope**: Eine neue Workflow-Datei (4 Jobs), ein kleines Versions-Skript mit Test, Anpassung von `electron-builder.yml` und `package.json`, README-Abschnitt

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Prinzip | Bewertung |
|---|---|
| I. QR-Rechnungs-Konformität | Nicht berührt; die Konformitätstests laufen als Gate vor jedem Release. ✅ |
| II. Local-First / Offline | Betrifft nur die Infrastruktur. Keine Cloud-Abhängigkeit, keine Telemetrie in der App; Artefakte enthalten keine Daten. ✅ |
| III. Datenintegrität | Nicht berührt; Artefakte enthalten keine Datenbank (FR-018). ✅ |
| IV. Test-First | Lint, Typprüfung und Tests blockieren das Release (FR-005); die Versionslogik wird test-first entwickelt. ✅ |
| V. Einfachheit & Electron-Security | Nur bestehende Werkzeuge (electron-builder, `gh`), keine neuen Abhängigkeiten, keine Änderung an Renderer-/IPC-Sicherheit. ✅ |
| Workflow-Gates | Conventional Commits speisen die Release Notes; Tests vor Release. ✅ |
| Datenschutz | Keine echten Daten/Geheimnisse im Repository. ✅ |

Keine Verstösse; Complexity Tracking entfällt. **Re-Check nach Phase 1**: unverändert bestanden.

## Project Structure

### Documentation (this feature)

```text
specs/003-release-pipeline/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── release-workflow.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
.github/workflows/
├── ci.yml                          # unverändert
└── release.yml                     # NEU: Release-Pipeline
scripts/
└── resolve-release-version.mjs     # NEU: Versions-Validierung/-Ableitung
tests/unit/ (gemäss vorhandener Vitest-Struktur)
└── resolve-release-version.test.ts # NEU
electron-builder.yml                # ERWEITERT: artifactName, Linux/AppImage
package.json                        # ERWEITERT: Skripte dist:win, dist:linux
README.md                           # ERWEITERT: Abschnitt «Release»
```

**Structure Decision**: Bestehende Einzelprojekt-Struktur; neu sind nur Workflow, ein kleines Skript und Konfigurationsergänzungen.
