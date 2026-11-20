# Research: Strukturiertes Logging mit pino

## R1: Wie schreibt pino in die Datei (Transport)?

- **Decision**: pino mit eigenem synchronem Ziel (`Writable` mit `write(line)`), kein Worker-Thread-Transport.
- **Rationale**: `pino.transport()` startet einen Worker mit Modulpfad-Auflösung. Im mit electron-vite gebündelten und per asar verpackten Main-Prozess ist das fehleranfällig (Pfade, Natives). Synchrones Schreiben im Main-Prozess ist bei der geringen Logmenge unproblematisch und verliert bei einem Absturz keine Zeilen.
- **Alternatives**: `pino-roll` (stream-basiert, aber neue Abhängigkeit und datumsbasierte Dateinamen, die wir nicht brauchen); `pino/file` (`pino.destination`, keine Grössenrotation); Worker-Transport (Packaging-Risiko).

## R2: Rotation

- **Decision**: Eigener `RotatingFileStream`: vor dem Schreiben Grösse prüfen, ab 1 MB `swissbill.log` → `.1`, `.1` → `.2` … bis `.4`, ältestes wird überschrieben. Insgesamt höchstens ~5 MB (SC-003 verlangt höchstens 10 MB).
- **Rationale**: Bisher gleiche Logik (1 MB, eine Vorgängerdatei), nur erweitert; ~40 Zeilen, voll testbar. Die Datei wird pro Schreibvorgang geöffnet (Append) und wieder geschlossen; so ist `rename` auch unter Windows ohne gehaltenes Handle zuverlässig. Parallele Schreiber gibt es nicht, da die App eine Einzelinstanz-Sperre hat.
- **Alternatives**: `pino-roll`, `rotating-file-stream` (zusätzliche Abhängigkeit ohne Mehrwert).

## R3: Maskierung von Geheimnissen

- **Decision**: (a) pino `redact` mit Pfaden für bekannte Feldnamen (`password`, `*.password`, `apiKey`, `*.apiKey`, `token`, `authorization`, `secret`), Censor `***`; (b) `ScrubbingStream`: jedes registrierte Geheimnis wird in der fertigen Zeile ersetzt, sowohl in Rohform als auch in der JSON-escapten Form (`JSON.stringify(secret).slice(1, -1)`), weil Anführungszeichen und Backslashes im JSON anders aussehen.
- **Rationale**: Die Zeilenebene fängt auch Treiberfehlermeldungen und Stacktraces ab, die ein Passwort enthalten; `redact` fängt Felder auch ohne registrierten Wert. Mindestlänge 3 bleibt wie bisher.
- **Alternatives**: nur `redact` (deckt Freitext nicht ab); eigener Serializer pro Fehler (lückenhaft).

## R4: Wo wird das Log-Level gespeichert?

- **Decision**: Lokale Datei `userData/log-settings.json` (`{ "version": 1, "level": "info" }`), atomar geschrieben, ungültiger Inhalt → Standard `info` (plus Warnung). Nicht in der Datenbank.
- **Rationale**: Entscheid aus der Klärung (pro Gerät, schon beim Start gültig, auch ohne Datenbank). Gleiches Muster wie `db-connection.json`.
- **Alternatives**: Einstellungstabelle der Datenbank (bei Serverdatenbank geteilt und beim Start nicht verfügbar) – verworfen.

## R5: Level-Wechsel zur Laufzeit

- **Decision**: `logger.level = level` am Root-Logger; Child-Logger erben beim Erzeugen, pino aktualisiert Kinder bei Änderung am Eltern-Logger nicht automatisch, daher hält `getLogger` Child-Logger in einer Map und `setLogLevel` setzt das Level an allen. Der IPC-Kanal ist vor der Datenbank registriert, funktioniert also auch im Wiederherstellungsmodus.
- **Alternatives**: Neustart verlangen (widerspricht „sofort wirksam“).

## R6: Fehler aus dem Renderer

- **Decision**: Kanal `log:report` mit `{ message (≤ 500 Zeichen), stack? (≤ 4000), source? }`, Bereich fest `ui`, Level `error`; Ratenbegrenzung 20 Meldungen pro Minute, danach wird nur noch gezählt. Der Renderer loggt keine Formular- oder Rechnungsinhalte, nur Fehlertext und Stack.
- **Rationale**: Hält die IPC-Fläche schmal (V) und verhindert Log-Flut durch Fehlerschleifen.

## R7: Bestehende Logdatei im Altformat

- **Decision**: Keine Migration. Die vorhandene `swissbill.log` wird beim ersten Start mit pino einmalig nach `swissbill.log.1` verschoben (nur wenn ihre erste Zeile kein JSON ist), damit JSON-Zeilen nicht mit Textzeilen vermischt werden.

## R8: Durchsetzung „nur eine Logging-Einrichtung“

- **Decision**: ESLint `no-console` für `src/` und Architekturtest: `pino` wird nur in `src/main/logging/` importiert; keine `console.*`-Aufrufe in `src/` (Renderer-Entwicklungsausgaben eingeschlossen).
- **Rationale**: Prüft User Story 4 automatisch (analog zum bestehenden Architekturtest für Datenbanktreiber).

## R9: pino-Version und Bündelung

- **Decision**: pino 10.x (aktuell veröffentlichte Version bei der Umsetzung, exakt gepinnt). `externalizeDepsPlugin` lässt pino extern; electron-builder packt es als Produktionsabhängigkeit. Gate in Task 1: `npm run build` und Paket-E2E starten die App mit pino.
