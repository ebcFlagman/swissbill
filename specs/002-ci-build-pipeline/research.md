# Research: CI-Build-Pipeline

Keine offenen «NEEDS CLARIFICATION»-Punkte; unten stehen die Entscheidungen.

## 1. CI-Dienst

- **Decision**: GitHub Actions.
- **Rationale**: Das Repository liegt auf GitHub (`origin`); keine zusätzliche Infrastruktur, Status erscheint direkt am Commit/PR (FR-008).
- **Alternatives**: Externe CI (CircleCI, Jenkins) – zusätzlicher Betrieb und Konten, verstösst gegen Einfachheit (Prinzip V).

## 2. Runner

- **Decision**: `windows-latest` für beide Jobs.
- **Rationale**: Zielplattform Windows (`electron-builder --win`, `win-unpacked/SwissBill.exe`); `tests/e2e/packaged.e2e.ts` benötigt die `.exe`;
  Electron-E2E brauchen eine Desktop-Sitzung, die Windows-Runner bereitstellen (unter Linux wäre ein virtueller Bildschirm nötig).
- **Alternatives**: Linux für Lint/Typecheck/Unit (schneller, billiger) – verworfen für Version 1, weil `better-sqlite3`-Binaries
  plattformspezifisch sind und die Ergebnisse sonst von der Zielumgebung abweichen. Matrix mit mehreren Betriebssystemen ist ausser Umfang.

## 3. Job-Aufteilung

- **Decision**: Job `verify` (Install, Lint, Typecheck, Vitest, Build, Paketierung, Artefakt-Upload) und Job `e2e` (`needs: verify`).
  `e2e` lädt das Artefakt bzw. baut neu und startet `npm run test:e2e`.
- **Rationale**: Schnelles Feedback (US1) getrennt von langsamen E2E-Tests (US3); getrennte Ergebnisse (FR-009).
  `test:e2e` baut selbst (`npm run build`); die verpackte App wird nur geprüft, wenn `release/win-unpacked` vorhanden ist,
  daher lädt `e2e` das Paket aus `verify` herunter, statt neu zu paketieren.
- **Klärung (2026-10-30)**: E2E sind optional und dürfen nie blockieren. `e2e` läuft deshalb ohne eigene Display-Einrichtung auf dem Standard-Windows-Runner
  (dieser hat eine interaktive Sitzung, Playwright startet Electron direkt) und wird als eigener, nicht-blockierender Job ausgewiesen
  (`needs: verify` nur für das Paket; Artefakt-Upload geschieht bereits in `verify`). Ein E2E-Fehler färbt den Lauf bewusst rot
  (kein `continue-on-error`), ist aber kein Pflicht-Check und beeinflusst `verify` und das Artefakt nicht. Zeigt sich der Job als instabil, wird er entfernt statt repariert.
- **Alternatives**: Ein einziger Job – einfacher, aber E2E-Fehler und -Dauer verdecken das schnelle Ergebnis.

## 4. Abhängigkeiten & Cache

- **Decision**: `actions/setup-node` mit `node-version: 24` und `cache: npm`; Installation mit `npm ci --ignore-scripts` plus `node node_modules/electron/install.js` (ohne das Flag versucht npm lokal `node-gyp rebuild` für better-sqlite3 und scheitert ohne Visual Studio; Prebuilds sind im Paket enthalten). Playwright wird nicht mit Browsern
  installiert (nur Electron wird gestartet).
- **Rationale**: Reproduzierbar aus `package-lock.json` (FR-002), Cache beschleunigt (FR-010).
  `better-sqlite3` liefert Prebuilds (README), `npmRebuild: false` – kein Compiler nötig. Die Electron-Binärdatei lädt das `electron`-Postinstall.
- **Alternatives**: `npm install` – nicht reproduzierbar. Eigener `node_modules`-Cache – anfällig bei nativen Modulen.

## 5. Auslöser und Nebenläufigkeit

- **Decision**: `on: push` (alle Branches) und `pull_request` gegen `main`; `concurrency` pro Workflow und Ref mit `cancel-in-progress: true`;
  `workflow_dispatch` für manuelle Wiederholung; Job-`timeout-minutes` (verify 15, e2e 20).
- **Rationale**: FR-001, FR-011, FR-013 und Edge Case «flackernde Tests». Bei Branches mit offenem PR im selben Repo laufen
  ein Push- und ein PR-Lauf parallel (die `concurrency`-Gruppen unterscheiden sich: `refs/heads/…` vs. `refs/pull/…`); das wird bewusst akzeptiert.
  `concurrency` bricht nur veraltete Läufe derselben Ref ab. Doku-only-Änderungen laufen mit (einfach, kein `paths-ignore`).
- **Alternatives**: `paths-ignore` für Doku – spart Minuten, riskiert aber fehlende Pflicht-Statusprüfungen bei Branch-Protection.

## 6. Artefakte

- **Decision**: `actions/upload-artifact` lädt `release/win-unpacked/` als `swissbill-win-unpacked-<sha>` hoch, Aufbewahrung 14 Tage,
  nur bei Erfolg des Schrittes. E2E-Berichte (`test-results/`, `playwright-report/`) werden `if: failure()` hochgeladen.
- **Rationale**: FR-007, FR-009, US2. Das entpackte Verzeichnis genügt zum Ausprobieren; ein NSIS-Installer wäre grösser und ohne Signierung ohnehin
  mit SmartScreen-Warnung. `npm run package` erzeugt bereits `--dir`.
- **Alternatives**: NSIS-Installer – Signierung ausser Umfang. GitHub Release – ausser Umfang.

## 7. PrimeUI-Lizenzschlüssel

- **Decision**: Der Schlüssel wird als Repository-Secret `PRIMEUI_LICENSE` hinterlegt und beim Build als `VITE_PRIMEUI_LICENSE` gesetzt.
  Fehlt er (Forks, kein Secret), baut die Pipeline trotzdem; die App zeigt dann das Lizenz-Banner.
- **Rationale**: `src/renderer/main.tsx` liest den Schlüssel zur Bauzeit; `.env.local` ist nicht versioniert. Der Schlüssel wird ins
  Renderer-Bundle eingebettet (Offline-Prüfung); das Artefakt ist daher nur für Personen mit Repository-Zugriff gedacht
  (Artefakt-Downloads erfordern Anmeldung). Lizenzprüfung ist unabhängig von Daten (Prinzip II bleibt gewahrt).
- **Risiko / Offene Prüfung**: Falls E2E-Tests das Banner nicht erwarten, sind sie ohne Schlüssel trotzdem grün; dies wird in Quickstart Szenario 5 geprüft.
- **Alternatives**: Schlüssel committen – verboten (Datenschutz-/Geheimnis-Regel). Banner akzeptieren und nie Schlüssel nutzen – Artefakt unbrauchbar für Tests.

## 8. Sicherheit des Workflows

- **Decision**: `permissions: contents: read`, keine `pull_request_target`, Actions auf feste Hauptversionen (`@v4`) gepinnt.
  Secrets stehen für Fork-PRs nicht zur Verfügung (GitHub-Standard).
- **Rationale**: Minimale Rechte; FR-012.
