# Data Model: Release-Pipeline

Keine persistenten Anwendungsdaten. Beschrieben werden die Pipeline-Begriffe der Spec.

## Release-Version

| Feld | Beschreibung | Regel |
|---|---|---|
| `version` | z. B. `1.2.0`, `1.2.0-rc.1` | SemVer; ohne führendes `v` |
| `tag` | `v<version>` | abgeleitet |
| `prerelease` | bool | `true`, wenn `version` ein `-`-Suffix enthält |
| `source` | `dispatch` \| `tag` | Auslöser |
| `sha` | Commit | bei `dispatch`: `GITHUB_SHA` (Hauptbranch); bei `tag`: Commit des Tags |

**Zustandsübergänge** (Lauf): `angefordert → validiert → geprüft → gebaut → Entwurf → veröffentlicht`. Jeder Fehler vor «veröffentlicht» lässt Tag und veröffentlichtes Release unberührt; ein Entwurf darf zurückbleiben und wird bei Wiederholung ersetzt.

## Release-Artefakt

| Feld | Windows | Linux |
|---|---|---|
| Runner | `windows-latest` | `ubuntu-latest` |
| Format | NSIS-Installer | AppImage |
| Dateiname | `SwissBill-<version>-win-x64.exe` | `SwissBill-<version>-linux-x64.AppImage` |
| Prüfsumme | Zeile in `SHA256SUMS.txt` | Zeile in `SHA256SUMS.txt` |

## Release

`tag`, `title` (`SwissBill <version>`), `notes` (generierte Änderungen + Download-Tabelle), `prerelease`, `assets` (2 Artefakte + `SHA256SUMS.txt`).
