# Quickstart: Release-Pipeline validieren

Siehe [contracts/release-workflow.md](contracts/release-workflow.md) und [data-model.md](data-model.md).

## Lokal

```bash
npm run dist:win       # unter Windows: release/SwissBill-<version>-win-x64.exe
npm run dist:linux     # unter Linux:   release/SwissBill-<version>-linux-x64.AppImage
npm test               # inkl. Test der Versionslogik
```

Erwartung: Dateinamen enthalten Produktname, Version und Plattform; AppImage lässt sich nach `chmod +x` starten.

## In GitHub (Testversion, Vorabversion)

1. **Erfolgsfall**: Actions → «Release» → *Run workflow* auf `main`, `version = 0.0.0-test.1`.
   Erwartet: Tag `v0.0.0-test.1`, Release als *Pre-release* mit `.exe`, `.AppImage`, `SHA256SUMS.txt`, Download-Tabelle und Änderungsliste.
2. **Prüfsummen**: Dateien herunterladen und `sha256sum -c SHA256SUMS.txt` ausführen.
3. **Ungültige Version** (`abc`, leer): Lauf bricht in `prepare` ab; kein Tag/Release.
4. **Duplikat**: Schritt 1 wiederholen; Abbruch in `prepare`, Bestehendes unverändert.
5. **Nicht-Hauptbranch**: Lauf von einem Feature-Branch; wird nicht ausgeführt.
6. **Fehlschlag Gate**: Test-Branch mit absichtlichem Lint-Fehler (Tag-Auslösung); `release` läuft nicht, kein Release.
7. **Tag-Auslösung**: `git tag v0.0.0-test.2 && git push origin v0.0.0-test.2`; erwartet Release ohne zweiten Lauf, Tag unverändert.
8. **Kein Doppel-Lauf**: Nach Schritt 1 existiert genau ein Lauf für die Version.
9. **Aufräumen**: Testreleases und -tags löschen (`gh release delete v0.0.0-test.1 --cleanup-tag --yes`).
