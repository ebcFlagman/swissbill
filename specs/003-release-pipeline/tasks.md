# Tasks: Release-Pipeline

**Input**: Design documents from `/specs/003-release-pipeline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/release-workflow.md, quickstart.md

**Tests**: Die Versionslogik wird test-first entwickelt (Verfassung, Prinzip IV). Die Workflow-Datei selbst wird gemäss quickstart.md in GitHub validiert.

## Format: `[ID] [P?] [Story] Beschreibung`

- **[P]**: parallel ausführbar (andere Datei, keine offene Abhängigkeit)
- **[Story]**: zugehörige User Story aus spec.md

## Phase 1: Setup

- [x] T001 [P] Skripte `dist:win` (`npm run build && electron-builder --win nsis --publish never`) und `dist:linux` (`npm run build && electron-builder --linux AppImage --publish never`) in `package.json` ergänzen
- [x] T002 [P] `electron-builder.yml` erweitern: `artifactName: ${productName}-${version}-${os}-${arch}.${ext}`, Block `linux` (Ziel `AppImage`, `arch: [x64]`, `category: Office`), `nsis` unverändert; Ziel `win` bleibt x64

---

## Phase 2: Foundational (blockiert alle Stories)

**Versionslogik (test-first)**

- [x] T003 Test `tests/unit/resolve-release-version.test.ts` schreiben (muss zuerst fehlschlagen): gültig `1.2.0`, `v1.2.0` (v wird entfernt), `1.2.0-rc.1` (prerelease=true); ungültig `abc`, `1.2`, `01.2.3`, leer, `1.2.0+build`; Ausgabe `{ version, tag, prerelease }`
- [x] T004 Skript `scripts/resolve-release-version.mjs` implementieren (Regex `^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$`, Export `resolveReleaseVersion(input)`, CLI-Modus: Eingabe als Argument, schreibt `version=`, `tag=`, `prerelease=` nach `$GITHUB_OUTPUT` bzw. stdout, Exit 1 mit klarer Meldung bei ungültiger Eingabe)
- [x] T005 [P] Typdeklaration `scripts/resolve-release-version.d.mts` anlegen, damit `tsconfig.test.json` den Import im Test typprüft; `npm run lint`, `npm run typecheck`, `npm test` müssen grün sein

**Checkpoint**: Versionslogik grün; Konfiguration vorbereitet.

---

## Phase 3: User Story 1 – Release per Knopfdruck (P1) 🎯 MVP

**Ziel**: Mit einer Versionsangabe wird geprüft, gebaut, getaggt und veröffentlicht.

**Unabhängiger Test**: quickstart.md, Schritte 1, 3, 4, 5, 6.

- [x] T006 [US1] `.github/workflows/release.yml` anlegen: `name: Release`, Trigger `workflow_dispatch` (Input `version`, required) und `push` Tags `v*`, Default `permissions: contents: read`, `concurrency: { group: release, cancel-in-progress: false }`
- [x] T007 [US1] Job `prepare` (ubuntu-latest, timeout 5, `if` für Dispatch nur `github.ref == 'refs/heads/main'`): Checkout, Node 24, `scripts/resolve-release-version.mjs` mit Eingabe bzw. `GITHUB_REF_NAME` aufrufen; Duplikate prüfen (`gh release view` nur veröffentlichte Releases; bei Dispatch zusätzlich `git ls-remote --tags origin refs/tags/<tag>`); Outputs `version`, `tag`, `prerelease`, `sha` (`GITHUB_SHA`) in `.github/workflows/release.yml`
- [x] T008 [US1] Job `verify` (windows-latest, needs prepare, timeout 15) in `.github/workflows/release.yml`: Checkout auf `sha`, Node 24 mit npm-Cache, `npm ci --ignore-scripts`, `node node_modules/electron/install.js`, `npm run lint`, `npm run typecheck`, `npm test` (wie `ci.yml`)
- [x] T009 [US1] Job `release` (ubuntu-latest, needs prepare+build, timeout 10, `permissions: contents: write`) in `.github/workflows/release.yml`: Artefakte laden (`merge-multiple`), `SHA256SUMS.txt` erzeugen, vorhandenen Entwurf zur Version löschen, Entwurf per `gh release create <tag> --draft --target <sha> --title "SwissBill <version>" --generate-notes --notes <Download-Tabelle> [--prerelease] <Dateien>`, dann `gh release edit <tag> --draft=false` (Tag entsteht erst hier; bei Tag-Auslösung existiert er und bleibt unverändert)

**Checkpoint**: Release-Ablauf vollständig (sobald US2-Build existiert).

---

## Phase 4: User Story 2 – Artefakte für Windows und Linux (P1)

**Ziel**: Installer und AppImage mit Release-Version im Namen und in der App.

**Unabhängiger Test**: quickstart.md, Schritte 1–2 und lokaler Build.

- [x] T010 [US2] Job `build` (Matrix `windows-latest`→`dist:win`, `ubuntu-latest`→`dist:linux`; needs prepare+verify; timeout 20; `fail-fast: true`) in `.github/workflows/release.yml`: Checkout auf `sha`, Node 24, `npm ci --ignore-scripts`, Electron-Binary installieren, `npm run <dist-Skript> -- -c.extraMetadata.version=<version>` mit optionalem `VITE_PRIMEUI_LICENSE` aus Secret
- [x] T011 [US2] Im Job `build` prüfen, dass das `better-sqlite3`-Binary der Plattform im Paket enthalten ist (Existenz-Check der `.node`-Datei in `release/*-unpacked/resources/app.asar.unpacked/node_modules/better-sqlite3/`) und die erwartete Ausgabedatei `SwissBill-<version>-<win|linux>-x64.*` existiert; sonst Fehlschlag
- [x] T012 [US2] Im Job `build` Artefakt hochladen (`release-win` bzw. `release-linux`, nur die Installer-/AppImage-Datei, `if-no-files-found: error`, `retention-days: 7`)
- [ ] T013 [US2] Lokal `npm run dist:win` ausführen und prüfen: Dateiname `release/SwissBill-<version>-win-x64.exe`, kein Projekt-Datenmaterial enthalten (FR-018)

---

## Phase 5: User Story 3 – Änderungsübersicht (P2)

**Ziel**: Release Notes gruppiert nach Art, mit Download-Links.

**Unabhängiger Test**: quickstart.md, Schritt 1 (Änderungsliste, Download-Tabelle).

- [x] T014 [P] [US3] `.github/release.yml` anlegen: Kategorien für Release Notes (z. B. Features, Fehlerbehebungen, Dokumentation, Sonstiges) nach Labels bzw. Conventional-Commit-Typen
- [x] T015 [US3] Im Job `release` eine Download-Tabelle (Windows/Linux/Prüfsummen mit Links `https://github.com/<repo>/releases/download/<tag>/<datei>`) als `--notes` vor den generierten Notes zusammenstellen in `.github/workflows/release.yml`

---

## Phase 6: User Story 4 – Tag-Auslösung (P3)

**Unabhängiger Test**: quickstart.md, Schritte 7–8.

- [x] T016 [US4] In `.github/workflows/release.yml` sicherstellen, dass bei Tag-Auslösung `sha` dem Tag-Commit entspricht, der Tag nicht verändert wird (kein `--target` nötig, kein `git push`) und ein Tagname ausserhalb des SemVer-Musters in `prepare` abbricht
- [ ] T017 [US4] Prüfen, dass `gh release create` mit dem `GITHUB_TOKEN` angelegte Tags keinen zweiten Lauf auslösen (Kommentar im Workflow; Validierung gemäss quickstart.md Schritt 8)

---

## Phase 7: Polish & Querschnitt

- [x] T018 [P] README-Abschnitt «Release» ergänzen in `README.md`: Auslösung (manuell/Tag), Versionsregeln, Artefakte und Dateinamen, Prüfsummen, lokale Entsprechung (`dist:win`/`dist:linux`), Hinweis auf fehlende Signierung (Windows-SmartScreen) und AppImage-Sandbox-Hinweis (FR-021)
- [x] T019 `npm run lint`, `npm run typecheck`, `npm test` ausführen; `npx prettier --check .` für neue Dateien
- [ ] T020 Workflow-Syntax prüfen (z. B. `actionlint`, falls verfügbar) und quickstart.md in GitHub mit einer Testversion `0.0.0-test.1` durchlaufen; Testrelease und -tag danach löschen

---

## Abhängigkeiten & Reihenfolge

- Phase 1 und Phase 2 zuerst (T003 vor T004; T005 nach T004).
- US1 (T006–T009) und US2 (T010–T012) bilden zusammen den MVP; T009 benötigt die Artefakte aus T012. T006→T007→T008→T010 sequentiell in derselben Datei.
- US3 und US4 setzen auf `release.yml` auf; T014 ist unabhängig.
- Polish zuletzt.

## Parallele Möglichkeiten

- T001 ‖ T002; T005 ‖ T014 ‖ T018 (verschiedene Dateien).

## Implementierungsstrategie

**MVP**: Phase 1–2, US1 + US2 (manuelles Release mit beiden Artefakten); danach US3 (Notes), US4 (Tag-Auslösung), Polish. Erste Validierung immer mit Vorabversion `0.0.0-test.N`.
