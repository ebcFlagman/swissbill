# Implementation Plan: Swiss QR-Rechnungen erstellen

**Branch**: `001-swiss-qr-invoices` | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-swiss-qr-invoices/spec.md`

## Summary

Offline-Desktop-App (Electron), mit der Rechnungen in CHF erfasst, lokal gespeichert und als A4-PDF mit
Swiss-QR-Zahlteil ausgegeben werden. Ansatz: reine, gut testbare Domänenlogik in TypeScript
(IBAN-/Referenz-Validierung, Rappen-Arithmetik, Referenzableitung, Statusübergänge), SQLite als eingebettete
Datenbank im Main-Prozess, PDF-Erzeugung mit `pdfkit` und `swissqrbill`, React-UI im Renderer, die nur über
eine schmale, typisierte IPC-Schnittstelle auf Daten zugreift. Ausgestellte Rechnungen werden als
vollständige Momentaufnahme gespeichert und sind auf Datenbankebene unveränderlich. Details und
Alternativen in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (strict), Node.js 24 (Electron-Runtime), Electron 44

**Primary Dependencies**: Electron, electron-vite, React 19, PrimeReact, better-sqlite3 13, pdfkit, swissqrbill 4, zod

**Storage**: SQLite-Einzeldatei `swissbill.db` im Electron-`userData`-Ordner, versionierte Vorwärts-Migrationen

**Testing**: Vitest (Unit und Integration, DB in Memory), Playwright (Electron-E2E für den Ablauf erstellen → speichern → PDF)

**Target Platform**: Windows 11 (primär); macOS und Linux nicht ausgeschlossen, aber nicht getestet

**Project Type**: desktop-app

**Performance Goals**: PDF-Erzeugung unter 2 s bei 50 Positionen; Rechnungsliste mit 5'000 Rechnungen ohne spürbare Verzögerung (< 200 ms Filterung)

**Constraints**: vollständig offline; keine Telemetrie; Beträge ganzzahlig in Rappen; nur CHF und Deutsch; Sicherung durch Kopieren einer einzelnen Datei

**Scale/Scope**: ein Benutzer, ca. 5 Hauptansichten (Rechnungsliste, Rechnungseditor, Kunden, Einstellungen/Absender, Datenbanksicherung), bis einige tausend Rechnungen

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Prinzip | Bewertung | Nachweis |
|---------|-----------|----------|
| I. Swiss QR-Bill Compliance | Erfüllt | Eigene, getestete Validierung (IBAN-Prüfsumme, QR-IBAN-IID-Bereich, QRR-Modulo-10, ISO-11649-RF, Feldlängen). `swissqrbill` rendert nur; Ergebnis wird gegen bekannte gültige Beispiele und den SIX-Validator geprüft (SC-002). |
| II. Local-First, Offline | Erfüllt | Keine Netzwerkzugriffe, DB in `userData`, kein Konto, keine Telemetrie. Renderer-CSP verbietet externe Ressourcen. |
| III. Datenintegrität / Unveränderlichkeit | Erfüllt | Integer-Rappen, Menge in Tausendsteln; Migrationen mit `PRAGMA user_version`; DB-Trigger sperren Änderungen an ausgestellten Rechnungen (ausser Statuswechsel). |
| IV. Test-First Domänenlogik | Erfüllt | Domänenmodul `src/shared/domain` ist rein (kein Electron/DB) und wird zuerst per Vitest entwickelt; ein Playwright-E2E deckt den Hauptablauf ab. |
| V. Simplicity & Electron Security | Erfüllt | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; DB und Dateizugriff nur im Main-Prozess; IPC mit zod-Validierung. Abhängigkeiten begründet in research.md. |

Gate bestanden, keine Verstösse. Nach Phase 1 erneut geprüft: weiterhin bestanden (siehe Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/001-swiss-qr-invoices/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── ipc-api.md       # Phase 1 output: IPC-Schnittstelle Renderer ↔ Main
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── shared/                  # reiner TypeScript-Code, ohne Electron/Node-Abhängigkeit
│   ├── domain/              # Money, Iban, Reference (QRR/SCOR), InvoiceNumber, Invoice-Statusmaschine, Validierung
│   └── ipc/                 # zod-Schemas und Typen des IPC-Vertrags
├── main/                    # Electron Main-Prozess
│   ├── db/                  # Verbindung, Migrationen (SQL-Dateien), Repositories
│   ├── services/            # InvoiceService (Ausstellen, Storno), PdfService, BackupService
│   ├── ipc/                 # Handler, die den Vertrag aus shared/ipc umsetzen
│   └── index.ts
├── preload/
│   └── index.ts             # contextBridge: schmale, typisierte API
└── renderer/                # React-UI (PrimeReact)
    ├── pages/               # Rechnungen, Editor, Kunden, Einstellungen
    ├── components/
    └── main.tsx

tests/
├── unit/                    # Domäne: Money, IBAN, Referenzen, Nummern, Statusübergänge
├── integration/             # Repositories/Services gegen In-Memory-SQLite, PDF-Erzeugung
└── e2e/                     # Playwright-Electron: Rechnung erfassen → ausstellen → PDF
```

**Structure Decision**: Ein einzelnes Projekt mit der electron-vite-Aufteilung main/preload/renderer. Die
Domänenlogik liegt in `src/shared/domain` und ist von Electron und Datenbank unabhängig, damit sie
test-first entwickelt werden kann (Prinzip IV) und Main und Renderer dieselben Validierungsregeln nutzen.

## Complexity Tracking

Keine Verstösse gegen die Constitution; keine Einträge nötig.
