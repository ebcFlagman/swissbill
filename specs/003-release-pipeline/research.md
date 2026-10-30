# Research: Release-Pipeline

## R1 – Auslöser und Doppel-Auslösung

- **Decision**: `workflow_dispatch` (Input `version`) und `push` auf Tags `v*`. Der manuelle Lauf legt den Tag nicht selbst per `git push` an, sondern über `gh release create` im `release`-Job. Mit dem eingebauten `GITHUB_TOKEN` erzeugte Tags lösen keine weiteren Workflows aus; eine Doppel-Auslösung (Story 4, Szenario 2) ist damit ausgeschlossen. Zusätzlich verhindert die Duplikatprüfung in `prepare` ein zweites Release derselben Version.
- **Rationale**: Ein Tag entsteht nur, wenn alles erfolgreich war (FR-013); kein verwaister Tag.
- **Alternatives**: Tag vorab pushen (hinterlässt verwaiste Tags bei Fehlschlag); `release: published`-Trigger (setzt ein bereits bestehendes Release voraus).

## R2 – Versionsvalidierung

- **Decision**: Regex für SemVer (`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$`); führendes `v` wird bei Eingabe toleriert und entfernt. Ein Tag-Push, dessen Name nicht passt, schlägt in `prepare` fehl (Filter `v*` ist grob). Vorabversion = Version enthält `-`. Logik in `scripts/resolve-release-version.mjs`, damit sie per Vitest testbar ist.
- **Rationale**: Einheitliche Regel für beide Auslöser, testbar ohne Runner (Prinzip IV).
- **Alternatives**: Inline-Bash im Workflow (nicht testbar); Tag-Glob mit Zeichenklassen (kann SemVer nicht ausdrücken).

## R3 – Duplikate und Hauptbranch

- **Decision**: `prepare` prüft per `gh release view` und `git ls-remote --tags`, ob Release bzw. (bei manueller Auslösung) Tag existiert, und bricht dann ab. Entwurfs-Releases aus einem früheren fehlgeschlagenen Lauf zählen nicht als Duplikat und werden im `release`-Job vor dem Neuanlegen entfernt. Manuelle Läufe erfordern `github.ref == refs/heads/main` (Job-Bedingung `if`).
- **Rationale**: FR-004, FR-016, Wiederholbarkeit nach Fehlschlag.

## R4 – Qualitäts-Gate

- **Decision**: Job `verify` auf `windows-latest` mit denselben Schritten wie `ci.yml` (`npm ci --ignore-scripts`, Electron-Binary, Lint, Typprüfung, `npm test`); das Gate läuft auf dem exakt zu veröffentlichenden Commit (`GITHUB_SHA`). Die E2E-Tests bleiben ausgeschlossen (Spec-Annahme).
- **Rationale**: Bewährte, in der CI laufende Konfiguration; plattformspezifische Tests laufen dort bereits grün.
- **Alternatives**: Wiederverwenden von `ci.yml` via `workflow_call` (würde die bestehende CI ändern; Spec verlangt Unverändertheit).

## R5 – Artefakte

- **Decision**: electron-builder mit `--win nsis` (x64) und `--linux AppImage` (x64), `--publish never`. Dateinamen via `nsis.artifactName` / `appImage.artifactName` (`${productName}-${version}-win-x64.${ext}` bzw. `-linux-x64.${ext}`; `${arch}` liefert beim AppImage `x86_64`) → `SwissBill-1.2.0-win-x64.exe`, `SwissBill-1.2.0-linux-x64.AppImage`. Version wird per `-c.extraMetadata.version=<version>` gesetzt, damit `package.json` unverändert bleibt und die App-Version (`app.getVersion()`) zur Release-Version passt (FR-009). Neue Skripte `dist:win` / `dist:linux` für lokale Reproduktion (`npm run build && electron-builder …`).
- **Rationale**: Bestehende Konfiguration nutzt bereits NSIS/x64; nur Linux-Block und Namen fehlen.
- **Risiken**: (a) `better-sqlite3` muss im Paket ein Linux-x64-Binary enthalten (`npmRebuild: false` bleibt) – wird im Build-Job mit einem Existenz-Check des `.node`-Binaries abgesichert; (b) AppImage unter neueren Ubuntu-Versionen kann am Chromium-Sandbox-Mechanismus scheitern – als Hinweis in die Doku (`--no-sandbox` nur als Notbehelf); (c) AppImage-Start wird in der Pipeline nicht getestet (kein Display); Smoke-Test lokal.

## R6 – Release, Notes, Prüfsummen

- **Decision**: Job `release` lädt beide Artefakte, erzeugt `SHA256SUMS.txt`, legt mit `gh release create v<version> --draft --target <sha> --title … --generate-notes --notes "<Download-Tabelle>" [--prerelease] <Dateien>` einen Entwurf an und veröffentlicht ihn danach mit `gh release edit --draft=false`. Der Tag entsteht erst beim Veröffentlichen auf `--target` (bei Tag-Auslösung existiert er bereits und bleibt unverändert). `--generate-notes` listet automatisch alle Änderungen seit dem vorherigen Release (beim ersten alle); Gruppierung nach Art über optionale `.github/release.yml` (Kategorien nach Conventional Commits/Labels).
- **Rationale**: Entwurf + spätere Veröffentlichung verhindert Teil-Releases und verwaiste Tags (FR-013); gh unterstützt alle Anforderungen ohne Drittaktionen (Prinzip V).
- **Alternatives**: `softprops/action-gh-release` (zusätzliche Abhängigkeit); manuell gepflegtes CHANGELOG (Aufwand).

## R7 – Rechte, Nebenläufigkeit, Zeitlimits

- **Decision**: Workflow-Default `permissions: contents: read`; nur `release` erhält `contents: write`. `concurrency: { group: release, cancel-in-progress: false }`. `timeout-minutes` je Job (prepare 5, verify 15, build 20, release 10).
- **Rationale**: FR-017, FR-018, FR-020; Prinzip der minimalen Rechte.

## R8 – Lizenzschlüssel

- **Decision**: `VITE_PRIMEUI_LICENSE: ${{ secrets.PRIMEUI_LICENSE }}` nur im Build-Schritt, optional wie in `ci.yml`; ohne Secret baut die App mit Lizenz-Banner (FR-019).
