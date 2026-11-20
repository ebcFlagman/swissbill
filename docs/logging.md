# Protokoll (Logging)

SwissBill schreibt technische Meldungen mit **pino** in eine lokale Datei. Es gibt keine Telemetrie und keinen
Versand an Dritte. Die gesamte Einrichtung liegt in `src/main/logging/`; ausserhalb davon wird weder `pino` importiert
noch `console` verwendet (Architekturtest `tests/unit/architecture.test.ts`).

## Speicherort

Im `userData`-Ordner der Anwendung, Unterordner `logs/`:

| Plattform | Ordner                      |
| --------- | --------------------------- |
| Linux     | `~/.config/SwissBill/logs/` |
| Windows   | `%APPDATA%\SwissBill\logs\` |

Die aktive Datei heisst `swissbill.log`. Bei 1 MB wird rotiert: `swissbill.log.1` … `swissbill.log.4` sind die
älteren Dateien, die älteste wird überschrieben. Insgesamt belegen die Protokolle höchstens etwa 5 MB. Eine Datei im
alten Textformat (vor Feature 007) wird beim ersten Start nach `swissbill.log.1` verschoben. Die Einzelinstanz-Sperre der
App verhindert, dass zwei Prozesse gleichzeitig in dieselbe Datei schreiben.

## Format

Eine JSON-Zeile pro Eintrag:

```json
{
  "level": "error",
  "time": "2026-11-20T13:05:55.377Z",
  "component": "db",
  "err": { "type": "Error", "message": "…", "stack": "…" },
  "msg": "Datenbank konnte nicht geöffnet werden"
}
```

| Feld        | Bedeutung                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------- |
| `level`     | `debug`, `info`, `warn` oder `error`                                                         |
| `time`      | Zeitpunkt, ISO 8601 (UTC)                                                                    |
| `component` | Bereich: `app` (Start/Ende), `db`, `pdf`, `address`, `ipc`, `ui` (Fehler der Oberfläche)     |
| `msg`       | technische Meldung                                                                           |
| `err`       | bei Fehlern: Typ, Meldung, Stacktrace und verschachtelte Ursache                             |
| weitere     | technische Kennzahlen (z. B. `dbKind`, `migrations`); bei `ui`: `stack`, `source`, `dropped` |

Filtern geht mit jedem JSON-Werkzeug, z. B. `jq 'select(.level=="error")' swissbill.log`.

## Detailgrad (Log-Level)

In den **Einstellungen → Protokoll** (im Wiederherstellungsmodus unter «Einstellungen») kann der Detailgrad gewählt
werden. «Log-Level» und «Detailgrad» bezeichnen dasselbe. Standard ist `info`. Die Wahl gilt **nur für dieses Gerät**,
wirkt sofort und bleibt nach dem Neustart erhalten. Sie liegt in `log-settings.json` im `userData`-Ordner und nicht
in der Datenbank, damit sie auch bei Datenbankfehlern beim Start gilt.

## Was nicht im Protokoll steht

- Passwörter und der Geoapify-Schlüssel: bekannte Geheimnisse werden in der ganzen Zeile (auch in Stacktraces) durch
  `***` ersetzt, Felder wie `password`, `apiKey`, `token`, `authorization`, `secret` immer.
- Rechnungsinhalte (Namen, Adressen, IBANs, Beträge, Referenzen): es werden nur technische Angaben geloggt.

Ist die Protokolldatei nicht beschreibbar, läuft die App weiter; die Meldungen gehen dann an die Standardfehlerausgabe.
