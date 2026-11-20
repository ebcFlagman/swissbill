# Quickstart: Logging prüfen

Voraussetzung: `npm ci`. Logdatei: `<userData>/logs/swissbill.log` (Linux: `~/.config/swissbill/logs/`, Windows: `%APPDATA%\swissbill\logs\`; im E2E-Test ein temporäres `userData`).

## Automatische Prüfung

```bash
npm run lint && npm run typecheck
npx vitest run tests/unit tests/integration/credential-leak.test.ts tests/integration/log-leak.test.ts
npx playwright test tests/e2e/logging.e2e.ts
```

Erwartet: grün; der Lecktest findet weder Passwort noch API-Schlüssel noch Rechnungsdaten in irgendeiner Logdatei (SC-002).

## Manuelle Szenarien

1. **Start (Story 1)**: App starten, Logdatei öffnen. Erwartet: JSON-Zeile mit `component":"app"`, Version, Plattform, Datenbankart.
2. **Fehler (Story 1)**: In den Einstellungen eine unerreichbare Serverdatenbank speichern und neu starten. Erwartet: `level":"error"`, `component":"db"`, `err` mit Ursache und Stacktrace, kein Passwort.
3. **Level (Story 3)**: Einstellungen → Protokoll-Detailgrad auf „Debug“ stellen. Erwartet: sofort zusätzliche `debug`-Zeilen, nach Neustart weiterhin Debug; zurück auf „Info“ blendet sie aus.
4. **Rotation (Story 3)**: Logdatei auf über 1 MB füllen und eine Aktion ausführen. Erwartet: `swissbill.log.1` entsteht; nie mehr als `.4`.
5. **Oberflächenfehler (Story 4)**: In den DevTools `window.dispatchEvent(new ErrorEvent('error', { message: 'test' }))`. Erwartet: Zeile mit `component":"ui"`.
6. **Nicht schreibbar**: Logverzeichnis schreibschützen. Erwartet: App läuft, Einträge erscheinen auf stderr.

Siehe [contracts/ipc-log.md](contracts/ipc-log.md) und [data-model.md](data-model.md).
