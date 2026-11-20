# Quickstart: Validierung der Server-Datenbanken

## Voraussetzungen

- Node-Abhängigkeiten installiert (`npm ci`), Docker für die Test-Server.
- Test-Server starten (PostgreSQL 16, MySQL 8, MariaDB 11):

```bash
docker compose up -d
```

- Zugangs-URLs für die Matrix-Tests (nur Testdaten):

```bash
export SWISSBILL_TEST_PG_URL=postgres://swissbill:test@localhost:55432/swissbill
export SWISSBILL_TEST_MYSQL_URL=mysql://swissbill:test@localhost:53306/swissbill
export SWISSBILL_TEST_MARIADB_URL=mysql://swissbill:test@localhost:53307/swissbill
```

## 1. Automatische Prüfung (SC-002, SC-003, SC-004)

```bash
npm test
```

Erwartung: alle Matrix-Tests grün für SQLite und jeden gesetzten Server; ohne die Variablen laufen nur SQLite-Tests, Server-Tests werden als «übersprungen» gemeldet. Enthalten: Nummernvergabe mit 100 parallelen Ausstellvorgängen über mehrere simulierte Geräte (0 Lücken, 0 Duplikate), Unveränderlichkeit, Suche mit Umlauten, Fremd-DB-/Neuer-Schema-Erkennung, Sperrenablauf, Passwort-Leck-Suche in Dateien und Logs.

## 2. Manuelle Prüfung der Einrichtung (Story 1, 2)

1. `npm run dev`, Einstellungen → «Datenbank» → Typ PostgreSQL, `localhost`, Port `55432`, Datenbank `swissbill`, Benutzer `swissbill`, Passwort `test`, TLS aus.
2. «Verbindung testen» → Erwartung: alle Stufen grün, Hinweis «Datenbank leer, Schema wird angelegt», Warnung zur unverschlüsselten Verbindung.
3. Speichern → App startet neu → Kunde anlegen, Rechnung ausstellen, PDF erzeugen.
4. Passwort im Schlüsselbund prüfen (Linux: `secret-tool lookup service swissbill`), und prüfen, dass es nirgends im Datenverzeichnis steht:

```bash
grep -r "test" ~/.config/swissbill --include=* -l | head
```

Erwartung: keine Datei enthält das Passwort; Einstellungen zeigen das Passwortfeld leer mit «gespeichert».

## 3. Fehlerfälle (Story 3)

- Falsches Passwort → Stufe «Anmeldung» schlägt fehl, Meldung ohne Passwort.
- Falscher Host / Server gestoppt (`docker compose stop`) → «nicht erreichbar»; beim Start erscheint das Wiederherstellungsfenster mit «Erneut versuchen», «Einstellungen», «Lokal verwenden».
- Nicht existierende Datenbank → Stufe «Datenbank».
- Nicht leere Fremd-Datenbank → Abbruch «fremde Datenbank», nichts verändert.

## 4. Mehrgeräte (FR-009a, SC-003)

Zwei App-Instanzen mit getrennten `--user-data-dir` auf denselben Server richten; denselben Entwurf in beiden öffnen → die zweite zeigt ihn schreibgeschützt mit «wird von … bearbeitet». Erste Instanz beenden (Prozess beenden) → nach 5 Minuten lässt sich der Entwurf in der zweiten bearbeiten.

## 5. Wechsel (Story 4)

Auf lokal zurückstellen → Warnung «Daten werden nicht übernommen», nach Neustart sind die lokalen Daten sichtbar, die Serverdaten unverändert.

Verweise: Datenmodell [data-model.md](data-model.md), Verträge [contracts/](contracts/).
