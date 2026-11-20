# Datenmodell: Strukturiertes Logging

Keine Datenbankänderung. Die Daten liegen in Dateien im `userData`-Ordner des Geräts.

## Logeintrag (eine JSON-Zeile in `logs/swissbill.log`)

| Feld | Typ | Beschreibung |
|---|---|---|
| `time` | string (ISO 8601, UTC) | Zeitpunkt |
| `level` | `"debug" \| "info" \| "warn" \| "error"` | Schweregrad als Text (pino-Formatter) |
| `component` | `"app" \| "db" \| "pdf" \| "address" \| "ipc" \| "ui"` | Bereich |
| `msg` | string | technische Meldung, deutsch oder englisch, ohne Nutzerdaten |
| `err` | object, optional | `{ type, message, stack, cause? }` (pino-Serializer, verschachtelt) |
| `dropped` | number, optional | Anzahl verworfener `ui`-Meldungen wegen Ratenbegrenzung seit dem letzten Eintrag |
| `source` | string, optional | Herkunft einer Oberflächenmeldung (`ui`-Einträge) |
| weitere Felder | primitive Werte | nur technische Kennzahlen (`durationMs`, `migrations`, `kind`, interne IDs) |

Regeln: Genau eine Zeile pro Eintrag; bekannt sensible Feldnamen werden zu `***`; registrierte Geheimnisse werden in der ganzen Zeile durch `***` ersetzt; Namen, Adressen, IBANs, Beträge und Referenzen werden nicht geloggt.

## Logdateien

`logs/swissbill.log` (aktiv), `swissbill.log.1` … `.4` (ältere). Rotation bei 1 MB, ältestes wird überschrieben. Gesamtgrösse ≤ ~5 MB.

## Log-Einstellung (`log-settings.json`)

```json
{ "version": 1, "level": "info" }
```

| Feld | Regel |
|---|---|
| `version` | fest `1`; grössere Versionen werden ignoriert (Standard `info`) |
| `level` | `error`, `warn`, `info` oder `debug`; fehlt die Datei oder ist sie ungültig: `info` |

Wird atomar geschrieben (temporäre Datei, dann `rename`). Pro Gerät, nicht Teil der Datenbank und nicht des Backups.

## Geheimnisregister (nur im Speicher)

Menge der registrierten Geheimnisse (Datenbankpasswort, Geoapify-Schlüssel), jeweils mindestens 3 Zeichen. Wird nie gespeichert oder geloggt.
