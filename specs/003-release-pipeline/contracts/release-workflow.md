# Contract: `.github/workflows/release.yml`

## Auslöser

| Auslöser | Eingabe | Bedingung |
|---|---|---|
| `workflow_dispatch` | `version` (string, Pflicht) | nur `refs/heads/main` |
| `push` Tags | `v*` | Tagname muss SemVer `v<Version>` entsprechen (Prüfung in `prepare`) |

Workflow-Rechte: `contents: read`. Nebenläufigkeit: `group: release`, `cancel-in-progress: false`.

## Jobs

| Job | Runner | Needs | Rechte | Aufgabe |
|---|---|---|---|---|
| `prepare` | ubuntu-latest | – | `contents: read` | Version validieren (`scripts/resolve-release-version.mjs`), Duplikate (Release/Tag) prüfen, Outputs `version`, `tag`, `prerelease`, `sha` |
| `verify` | windows-latest | prepare | read | `npm ci --ignore-scripts`, Electron-Binary, Lint, Typprüfung, `npm test` auf `sha` |
| `build` | Matrix: windows-latest, ubuntu-latest | prepare, verify | read | Build, Paketierung mit `-c.extraMetadata.version`, Upload des Artefakts (`release-win`, `release-linux`) |
| `release` | ubuntu-latest | prepare, build | **`contents: write`** | Artefakte laden, `SHA256SUMS.txt`, Entwurf anlegen, veröffentlichen |

## Ausgaben (Release)

- Tag `v<version>` auf `sha`.
- Assets: `SwissBill-<version>-win-x64.exe`, `SwissBill-<version>-linux-x64.AppImage`, `SHA256SUMS.txt`.
- Beschreibung: Download-Tabelle (Links auf Assets) + generierte Änderungsübersicht seit dem vorherigen Release.
- `prerelease=true` bei Versionen mit Zusatz.

## Fehlerverhalten

| Fall | Ergebnis |
|---|---|
| Ungültige Version / falscher Tagname | `prepare` schlägt fehl, nichts angelegt |
| Release oder (bei Dispatch) Tag existiert | `prepare` schlägt fehl, Bestehendes unverändert |
| Dispatch nicht von `main` | Lauf wird nicht ausgeführt / schlägt in `prepare` fehl |
| Lint/Typ/Test/Build-Fehler | `release` läuft nicht; kein Tag, kein Release |
| Fehler beim Anlegen/Veröffentlichen | Entwurf kann zurückbleiben, Tag existiert nicht; Wiederholung ersetzt den Entwurf |

## Konfigurationsänderungen

- `electron-builder.yml`: `artifactName` (`${productName}-${version}-${os}-${arch}.${ext}`), Block `linux` (Ziel `AppImage`, x64, Kategorie `Office`), `nsis` unverändert.
- `package.json`: `dist:win` = `npm run build && electron-builder --win nsis --publish never`; `dist:linux` = `npm run build && electron-builder --linux AppImage --publish never`.
- Optional `.github/release.yml`: Kategorien für Release Notes.
