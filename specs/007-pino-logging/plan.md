# Implementation Plan: Strukturiertes Logging mit pino

**Branch**: `claude/pino-logging-framework-09f842` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-pino-logging/spec.md`

## Summary

Die Eigenlösung `src/main/log.ts` (Textzeilen, Rotation bei 1 MB, Maskierung registrierter Geheimnisse) wird durch pino ersetzt. Kernentscheidungen (Details in [research.md](research.md)):

1. **pino im Main-Prozess, ohne Worker-Transport**: pino schreibt synchron in einen eigenen, kleinen `RotatingFileStream` (Datei nach Grösse rotieren, 5 Dateien à 1 MB, Fallback auf stderr). Keine weitere Abhängigkeit (kein `pino-roll`, kein `pino-pretty`), kein Worker-Thread (funktioniert so im gebündelten und asar-verpackten Main-Prozess).
2. **Maskierung doppelt**: pino-`redact` für bekannt sensible Feldnamen (`password`, `apiKey`, `token`, …) und ein Scrubber im Stream, der registrierte Geheimnisse (`redactFromLogs`) in der fertigen JSON-Zeile ersetzt, auch in Stacktraces und `cause`-Ketten. Die Funktion `redactFromLogs` bleibt bestehen und wird zusätzlich für den Geoapify-Schlüssel aufgerufen.
3. **Bereiche über Child-Logger**: `getLogger('db' | 'pdf' | 'address' | 'ipc' | 'app' | 'ui')` liefert einen Child-Logger mit Feld `component`. Alle Fehler tragen via pino-Standard-Serializer `err` Meldung, Stacktrace und `cause`.
4. **Log-Level pro Gerät** (auch in der Wiederherstellungsansicht einstellbar): eigene Datei `log-settings.json` im `userData`-Ordner (wie `db-connection.json`), beim Start vor der Datenbank gelesen, zur Laufzeit über zwei neue IPC-Kanäle (`log:getLevel`/`log:setLevel`) änderbar, die vor der Datenbank registriert sind. Auswahl auf der bestehenden Einstellungsseite, Level wirkt sofort (`logger.level = …`).
5. **Oberflächenfehler**: Kanal `log:report` (zod-validiert, Länge begrenzt, ratenbegrenzt) für `window.onerror`/`unhandledrejection` und den React-Error-Boundary; der Renderer schreibt nie selbst.
6. **Lebenszyklus**: Start-Eintrag (Version, Plattform, Datenbankart), Ende-Eintrag, `uncaughtException`/`unhandledRejection` im Main.

| Anforderung | Umsetzung |
|---|---|
| FR-001 eine Einrichtung | `src/main/logging/` (neu), `log.ts` entfällt; ESLint-Regel `no-console` plus Architekturtest |
| FR-002/003 Format, Fehlerursache | pino-JSON pro Zeile (`time` ISO, `level` als Text, `component`, `msg`, `err`) |
| FR-004 Bereiche | Child-Logger pro Bereich |
| FR-005/006 Maskierung | `redact`-Pfade + `ScrubbingStream` + `redactFromLogs` |
| FR-007 keine Rechnungsdaten | nur IDs/Dauer in Meldungen; Test mit Beispielrechnung (SC-002) |
| FR-008 Level in Einstellungen | `LogSettingsStore` + IPC + Auswahlfeld, Standard `info` |
| FR-009 Rotation | `RotatingFileStream`: 1 MB, `swissbill.log` plus `.1`–`.4` |
| FR-010 Fehlertoleranz | Schreibfehler → stderr, nie werfen |
| FR-011/012 Lebenszyklus, unbehandelte Fehler | `app`-Logger in `index.ts` |
| FR-013 Renderer-Fehler | `log:report` + Handler im Renderer |
| FR-014/015 lokal, dokumentiert | keine Transporte; Abschnitt in `docs/` und README |

## Technical Context

**Language/Version**: TypeScript 6.0, Node im Electron-45-Main (Renderer: React 19)

**Primary Dependencies**: neu `pino` (10.x, exakt gepinnt wie die übrigen Abhängigkeiten, Renovate aktualisiert). Bestehend: `zod`, `electron`. Bewusst **nicht**: `pino-pretty`, `pino-roll`, Worker-Transporte

**Storage**: Logdateien in `userData/logs/` (`swissbill.log`, `.1`–`.4`); Log-Level in `userData/log-settings.json`; die Datenbank bleibt unberührt (keine Migration)

**Testing**: vitest (Unit: Stream, Scrubber, Level-Store, IPC-Schema; Integration: Lecktest mit Passwort/API-Schlüssel/Rechnungsdaten, bestehender `credential-leak.test.ts` wird angepasst); Playwright-E2E für Level-Wechsel in den Einstellungen und Fehlerereignis aus der Oberfläche

**Target Platform**: Windows und Linux (Electron-Desktop)

**Project Type**: desktop-app

**Performance Goals**: Eintrag schreiben < 1 ms im Mittel; Startzeit höchstens 5 % länger (SC-005); synchrones Schreiben nur im Main-Prozess, Debug-Meldungen im `info`-Modus werden von pino ohne Aufwand verworfen

**Constraints**: nur lokal, kein Netzwerk (Verfassung II); keine Zugangsdaten und Rechnungsinhalte im Log; Renderer ohne Dateizugriff (V); Kommentare englisch, Oberflächentexte deutsch

**Scale/Scope**: ~8 neue Dateien (`logging/*`, `ipc/log.ts`, `shared/ipc/log.ts`, Renderer-Hook), 3 bestehende Aufrufstellen (`index.ts`, `wrap.ts`, `connection-service.ts`), 1 Einstellungsfeld, 1 Dokumentationsabschnitt

## Constitution Check

*GATE: vor Phase 0 geprüft, nach Phase 1 erneut geprüft. Grundlage: Verfassung v1.4.0.*

| Prinzip | Bewertung |
|---|---|
| I. Swiss QR-Bill | Nicht betroffen; Validierung und Zahlteil bleiben unverändert. ✅ |
| II. Local-First | Ausgabe ausschliesslich in lokale Datei (und stderr). Kein Transport, keine Telemetrie. Das Passwort bleibt aus Logs (Registrierung + Feldnamen + Scrubber), Level liegt lokal, nicht in der Datenbank. ✅ |
| III. Datenintegrität | Keine Schemaänderung, keine Migration. ✅ |
| IV. Test-First | Maskierung, Rotation und Level-Store werden test-first entwickelt; Lecktest ersetzt/erweitert den bestehenden. ✅ |
| V. Einfachheit & Electron-Sicherheit | Eine neue Abhängigkeit (pino), begründet: strukturierte Felder, Serializer für `cause`/Stacktrace, Level-Wechsel zur Laufzeit, redact-Pfade. Rotation bewusst als ~40 Zeilen Eigencode, ohne `pino-roll`. Renderer erhält nur den schmalen, typisierten Kanal `log:report` und `log:getLevel`/`log:setLevel`. ✅ |
| Technologie | Kommentare englisch, Texte deutsch, keine Daten im Repository. ✅ |

**Ergebnis**: keine Verstösse, kein Eintrag in der Komplexitätstabelle. Nach Phase 1 erneut geprüft: unverändert ✅.

## Project Structure

### Documentation (this feature)

```text
specs/007-pino-logging/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ipc-log.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── main/
│   ├── logging/
│   │   ├── index.ts              # initLogging(dir), getLogger(component), redactFromLogs, setLogLevel
│   │   ├── rotating-stream.ts    # size rotation, stderr fallback, scrubber hook
│   │   ├── scrubber.ts           # replaces registered secrets in a finished line
│   │   └── log-settings.ts       # read/write userData/log-settings.json (atomic)
│   ├── ipc/log.ts                # log:getLevel/setLevel, log:report (registered before the database)
│   ├── ipc/register.ts           # registerPreDatabaseIpc gets the log handlers
│   ├── index.ts                  # lifecycle entries, uncaught errors
│   ├── ipc/wrap.ts               # getLogger('ipc').error({ err }, …)
│   ├── services/connection-service.ts  # import redactFromLogs from '../logging'
│   ├── services/address-service.ts     # registers the Geoapify key for redaction
│   └── log.ts                    # removed
├── preload/index.ts              # api.log.{getLevel,setLevel,report}
├── shared/ipc/log.ts             # LogLevel, schemas, ReportInput
├── shared/ipc/api.ts             # SwissbillApi.log
└── renderer/
    ├── pages/Settings.tsx        # level select (German labels)
    └── lib/report-errors.ts      # window error / unhandledrejection → log.report

tests/
├── unit/        rotating-stream, scrubber, log-settings, log-ipc-schema, architecture (no console, no pino outside logging/)
├── integration/ credential-leak (adapted), log-leak (invoice data, API key)
└── e2e/         logging.e2e.ts

docs/logging.md                   # location, format, rotation, level (German)
```

**Structure Decision**: Einzelnes Electron-Projekt (main/preload/renderer/shared) wie bisher; das Logging ist ein neuer, in sich geschlossener Ordner im Main-Prozess. Nur `src/main/logging/` darf `pino` importieren (Architekturtest), analog zu den Datenbanktreibern.

## Complexity Tracking

Keine Verstösse gegen die Verfassung; keine Einträge.
