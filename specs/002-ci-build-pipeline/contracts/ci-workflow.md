# Vertrag: CI-Workflow

Schnittstellen der Pipeline nach aussen (zu Entwicklern, Branch-Protection und Repository-Einstellungen).

## Datei

`.github/workflows/ci.yml`, Workflow-Name `CI`.

## Auslöser

| Ereignis | Bedingung |
|---|---|
| `push` | alle Branches |
| `pull_request` | Ziel `main` |
| `workflow_dispatch` | manuell, ohne Eingaben |

## Jobs und Statusprüfungen

| Job-ID | Name der Statusprüfung | Inhalt | Timeout |
|---|---|---|---|
| `verify` | `CI / verify` | `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run package` (enthält Build), Artefakt-Upload | 15 Min. |
| `e2e` | `CI / e2e` | `needs: verify`; Paket herunterladen, `npm run test:e2e`; bei Fehler Berichte hochladen | 20 Min. |

Nur `CI / verify` ist als «Required status check» der Branch-Protection vorgesehen (manuell in den Repository-Einstellungen zu setzen, nicht Teil dieses Features).
`CI / e2e` ist optional und nicht erforderlich: ein Fehlschlag blockiert weder Merge noch Artefakt, färbt den Gesamtstatus des Laufs aber rot (Clarification 2026-10-30).
Doppelte Läufe (Push und Pull Request desselben Branches) sind möglich und akzeptiert.

## Eingaben

| Name | Art | Pflicht | Verwendung |
|---|---|---|---|
| `PRIMEUI_LICENSE` | Repository-Secret | nein | wird beim Build als `VITE_PRIMEUI_LICENSE` gesetzt; fehlt es, baut die Pipeline trotzdem |

## Ausgaben

| Artefakt | Bedingung | Aufbewahrung |
|---|---|---|
| `swissbill-win-unpacked-<sha>` | `verify` erfolgreich | 14 Tage |
| `playwright-report`, `test-results` | `e2e` fehlgeschlagen | 14 Tage |

## Berechtigungen und Garantien

- `permissions: contents: read`
- `concurrency`: Gruppe `ci-${{ github.ref }}`, `cancel-in-progress: true`
- Kein `pull_request_target`; keine Telemetrie, keine Veröffentlichung, keine Schreibzugriffe auf das Repository
