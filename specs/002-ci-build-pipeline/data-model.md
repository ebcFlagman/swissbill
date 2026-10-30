# Datenmodell: CI-Build-Pipeline

Die Pipeline persistiert keine eigenen Daten; die Entitäten bilden die von GitHub Actions geführten Objekte ab.

## Pipeline-Lauf (Workflow Run)

| Attribut | Beschreibung |
|---|---|
| Auslöser | `push`, `pull_request` oder manuell (`workflow_dispatch`) |
| Commit / Ref | Geprüfter Commit-SHA und Branch bzw. PR |
| Jobs | `verify`, `e2e` |
| Gesamtergebnis | erfolgreich, fehlgeschlagen, abgebrochen (durch `concurrency` oder Timeout) |

**Zustände**: queued → in progress → success | failure | cancelled. Ein neuer Push auf dieselbe Ref setzt laufende Läufe auf cancelled.

## Pipeline-Schritt (Step)

Install → Lint → Typecheck → Unit-/Integrationstests → Build → Paketierung → Upload (Job `verify`); Download → E2E → Berichte-Upload bei Fehler (Job `e2e`).
Regel: Schlägt ein Schritt fehl, werden die folgenden Schritte desselben Jobs nicht ausgeführt; `e2e` startet nur, wenn `verify` erfolgreich war.

## Build-Artefakt

| Attribut | Beschreibung |
|---|---|
| Name | `swissbill-win-unpacked-<commit-sha>` |
| Inhalt | `release/win-unpacked/` (keine Datenbank, keine PDFs, keine `.env*`) |
| Aufbewahrung | 14 Tage |
| Bedingung | Nur bei erfolgreichem Paketierungsschritt |

Weitere Artefakte (nur bei E2E-Fehler): `playwright-report/`, `test-results/`.
