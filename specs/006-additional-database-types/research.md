# Research: Weitere Datenbanktypen

Stand: 2026-11-20. Alle früheren «NEEDS CLARIFICATION» sind durch die Klärungen in der Spec beantwortet; hier stehen die technischen Entscheidungen.

## R1 – Treiber und TypeORM-Kompatibilität
- **Befund**: `typeorm` 1.1.3 hat Peer-Dependencies `pg ^8.5.1` und `mysql2 ^3.15.3`; aktuell sind `pg` 8.23.1 und `mysql2` 3.24.6. TypeORM nutzt für die Typen `mysql` und `mariadb` denselben Treiber-Code (`mysql2`).
- **Decision**: `pg` für PostgreSQL, `mysql2` für MySQL und MariaDB. Beide sind reines JavaScript (kein Electron-Rebuild).
- **Gate (Task 1)**: Kleiner Spike: `DataSource` mit `type: 'mariadb'` und `mysql2` gegen einen MariaDB-Container, Build und Packaging (`electron-builder`) enthalten beide Treiber. Falls `mariadb` den Treiber `mariadb` verlangt, wird `type: 'mysql'` mit `mysql2` auch für MariaDB verwendet.
- **Alternatives**: Treiber `mariadb` (zweite Abhängigkeit ohne Nutzen), `postgres.js` (von TypeORM nicht unterstützt).

## R2 – Portables Schema
- **Befund**: Die Basis-Migration nutzt `text` für alles, auch für `UNIQUE(number)` und Spalten mit `DEFAULT`. MySQL kann `TEXT` nicht ohne Längenangabe indizieren; `TEXT`-Defaults sind in MySQL < 8.0.13 verboten.
- **Decision**: In `InitSchema1700000000001` werden begrenzte Felder `varchar(n)` (Längen aus den bestehenden Validierungsregeln: 70/16/35/21 …), Zeitstempel `varchar(32)` (ISO-8601), unbegrenzte Freitexte (`closing_text`, `notes`) bleiben `text` ohne Default. Für SQLite ist das verhaltensgleich (Textaffinität); bestehende Dateien werden nicht angefasst, da die Migration dort bereits als ausgeführt gilt. Der `schema-parity`-Test beweist, dass das SQLite-Schema logisch gleich bleibt.
- **Alternatives**: Zweite, dialektspezifische Migrationsreihe (doppelte Pflege); alle Spalten `TEXT` mit Präfix-Indizes (nur MySQL, nicht portabel).
- **Risiko**: `integer` ist auf MySQL/MariaDB 32 Bit. Höchstbetrag pro Rechnung bleibt unter 2^31 Rappen (≈ 21 Mio. CHF); die Domänenvalidierung erhält diese Obergrenze mit Test.

## R3 – Zugangsdaten im Schlüsselbund
- **Befund**: Electron `safeStorage` schützt Daten mit einem vom OS verwalteten Schlüssel, liefert aber einen verschlüsselten Blob, der in einer Datei liegt – kein Eintrag im Schlüsselbund. `keytar` ist archiviert. `@napi-rs/keyring` (2.1.x) legt echte Einträge in Windows Credential Manager, macOS Keychain und Linux Secret Service ab und liefert vorgebaute N-API-Binaries.
- **Decision**: `@napi-rs/keyring`; Dienst `swissbill`, Konto `db-connection`. Schnittstelle `CredentialStore` (`isAvailable`, `get`, `set`, `delete`), Verfügbarkeit wird durch einen Schreib-/Lese-/Löschtest eines Probeeintrags ermittelt.
- **Ohne Schlüsselbund** (z. B. Linux ohne Secret-Service): `set` wird abgelehnt, die App verbindet sich nicht mit Passwort; kein Datei-Fallback (FR-007). Eine Verbindung ganz ohne Passwort (leeres Passwort, z. B. lokaler Server) ist erlaubt und braucht keinen Schlüsselbund.
- **Alternatives**: `safeStorage` (siehe oben, abgelehnt wegen Spec); Passwort in Umgebungsvariable (offenbart es in der Prozessumgebung).
- **Tests**: Speicher-Ersatz wie beim bestehenden `SecretStore`, nur ausserhalb der paketierten App und nur per Umgebungsvariable; Test «Passwort nirgends im Datenverzeichnis auffindbar» durchsucht alle Dateien (SC-004).

## R4 – Verbindungsangaben ohne Passwort
- **Decision**: `userData/db-connection.json` mit `version`, `type`, `host`, `port`, `database`, `user`, `tls { enabled, caPath? }`. Passwort ist nie Teil der Datei. Fehlt die Datei → lokales SQLite. Schreiben atomar (temp-Datei + Rename). Die Verbindung wird als einzelne Optionen übergeben, nie als URL, damit Sonderzeichen unkritisch sind (Edge Case).
- **Rationale**: Die App muss vor dem Verbinden wissen, wohin (FR-006); die lokale Datei ist pro Gerät (Spec: manuelle Einrichtung pro Gerät).

## R5 – Start, Fehler und Wiederherstellung
- **Problem**: Die Einstellungsseite liest aus der Datenbank, die bei Verbindungsfehlern nicht verfügbar ist.
- **Decision**: Die Verbindungs-Kanäle (`dbConnection:*`) werden vor dem Datenbankstart registriert und brauchen keine DataSource. Schlägt das Verbinden fehl, öffnet die App das Hauptfenster im Wiederherstellungsmodus mit Fehlertext und drei Aktionen: **Erneut versuchen**, **Einstellungen** (Verbindungsformular), **Lokal verwenden** (nur für diese Sitzung, ohne die gespeicherte Konfiguration zu ändern). Alle anderen Kanäle werden erst nach erfolgreichem Start registriert.
- **Änderung der Konfiguration** (FR-014): Speichern schreibt Datei und Schlüsselbund, danach Hinweis und `app.relaunch()`; bis dahin bleibt die bisherige Verbindung aktiv.
- **Betriebsfehler**: `UnitOfWork` bildet Verbindungsfehler auf `AppException('IO', …)` ab; Transaktionen werden zurückgerollt, nichts wird teilweise gespeichert (FR-012).

## R6 – Fehlerabbildung und Verbindungstest (FR-004)
- **Decision**: Test in fünf Stufen, jede mit eigener deutscher Meldung ohne Passwort: (1) erreichbar, (2) Anmeldung, (3) Datenbank vorhanden, (4) Rechte (Test-Tabelle anlegen/löschen in Transaktion mit Rollback, bzw. Prüfung von `CREATE`), (5) Schema kompatibel/leer.
- **Abbildung** in den Adaptern: PostgreSQL `28P01`/`28000` → Anmeldung, `3D000` → Datenbank, `42501` → Rechte; MySQL/MariaDB `ER_ACCESS_DENIED_ERROR` (1045) → Anmeldung, `ER_BAD_DB_ERROR` (1049) → Datenbank, `ER_DBACCESS_DENIED_ERROR`/`ER_TABLEACCESS_DENIED_ERROR` → Rechte; Netzwerkcodes `ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`, TLS-Fehler (`DEPTH_ZERO_SELF_SIGNED_CERT`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, …) → Erreichbarkeit/Zertifikat. Verbindungs-Timeout 10 s.

## R7 – TLS (FR-003a)
- **Decision**: `tls.enabled = true` → `ssl: { rejectUnauthorized: true, ca? }` für beide Treiber, ohne Möglichkeit zum Abschalten der Prüfung. `enabled = false` → keine SSL-Option (bei `pg` explizit `ssl: false`, damit `PGSSLMODE` aus der Umgebung nichts ändert). Unverschlüsselt zeigt im Formular eine dauerhafte Warnung.
- **CA-Zertifikat**: Pfad auf eine PEM-Datei, beim Verbinden gelesen; Datei wird nicht in die App kopiert.

## R8 – Nummernvergabe und Nebenläufigkeit (FR-009, SC-003)
- **Befund**: `UnitOfWork` serialisiert nur innerhalb eines Prozesses. Zwischen Geräten sorgt die Datenbank für Ordnung.
- **Decision**: In der Transaktion `UPDATE number_counters SET last_seq = last_seq + 1 WHERE year = ?` sperrt die Zeile in PostgreSQL und InnoDB (MySQL/MariaDB) bis zum Commit; parallele Ausstellvorgänge warten und erhalten die nächste Nummer. Fehlt die Zeile (erster Vorgang des Jahres), `INSERT`; bei Schlüsselkonflikt (anderes Gerät war schneller) einmal wiederholen. `UNIQUE(number)` bleibt als Rückhalt. Isolationsstufe: Standard der Datenbank (Read Committed bzw. Repeatable Read); der Ablauf ist für beide korrekt, weil die Sperre am Zähler liegt.
- **Bedingte Updates** der Statuswechsel (`… WHERE id=? AND status=?`) bleiben unverändert und sind auf allen drei Servern atomar.
- **Test**: 100 parallele `issue()` über mehrere unabhängige `DataSource`-Instanzen (simulierte Geräte) je Datenbank → keine Lücken, keine Duplikate.
- **Alternatives**: Sequenz-Objekte der DB (nicht portabel, lückenbehaftet bei Rollback); Advisory Locks für die Nummernvergabe (datenbankspezifisch).

## R9 – Bearbeitungssperren (FR-009a)
- **Decision**: Tabelle `edit_locks` (`entity_type`, `entity_id`, `owner_id`, `owner_label`, `heartbeat_at`), Primärschlüssel (`entity_type`, `entity_id`). `owner_id` ist eine pro App-Start erzeugte UUID, `owner_label` der Rechnername.
  - **Erwerb** in einer Transaktion: abgelaufene Sperre des Datensatzes löschen, dann `INSERT`; Schlüsselkonflikt = belegt → schreibgeschützt mit Hinweis.
  - **Heartbeat** alle 60 s aktualisiert `heartbeat_at`; Freigabe beim Schliessen/Speichern/Beenden; Sperre gilt als abgelaufen nach 5 Minuten ohne Heartbeat.
  - **Durchsetzung**: Speichern von Kunden/Entwürfen mit bestehender `id` verlangt im selben Transaktionsschritt, dass die eigene Sperre (`owner_id`) noch existiert; sonst `AppException('LOCK_LOST', …)` (FR-009a, «nicht mehr unbemerkt speichern»).
- **Uhrzeit**: Um Uhrzeitabweichungen zwischen Geräten auszuschliessen, wird nur die **Serverzeit** verwendet: `heartbeat_at` wird per `CURRENT_TIMESTAMP` gesetzt, Ablauf in derselben Abfrage gegen `CURRENT_TIMESTAMP` berechnet. Das portable Zeitrechnen ist je Datenbank verschieden und wird im Adapter gekapselt (`serverTimeSql`); Format-Unterschiede (Date vs. Text) normalisiert der Adapter.
- **Gilt nur bei Servern**: Lokales SQLite hat nur ein Gerät (Single-Instance-Lock der App); dort sind die Sperren ausgeschaltet.
- **Ausserhalb der Sperre**: Rechnungen im Status ≠ Entwurf sind unveränderlich; Statuswechsel (bezahlt/storniert) laufen über bedingte Updates und brauchen keine Sperre. Einstellungen sind eine einzelne Zeile (letzter Speichervorgang gewinnt), das Risiko ist gering und wird als Annahme dokumentiert.
- **Alternatives**: Zeilensperren der Datenbank über die Bearbeitungsdauer (blockieren Verbindungen); optimistische Versionsnummer (im Clarify nicht gewählt).

## R10 – Migrationen auf Servern (FR-010, FR-010a, FR-011)
- **Decision**: Gleiche TypeORM-Migrationen wie lokal. Ablauf beim Verbinden:
  1. Keine Tabelle `migrations` und **andere Tabellen vorhanden** → Abbruch «fremde Datenbank» (Edge Case). Keine Tabellen → leere DB, Schema wird angelegt.
  2. Tabelle `migrations` enthält unbekannte Einträge → Schema ist neuer → unverändert lassen, Update-Hinweis (FR-010a).
  3. Ausstehende Migrationen: unter einer **Migrationssperre** ausführen (PostgreSQL `pg_advisory_lock`, MySQL/MariaDB `GET_LOCK`, adaptergekapselt), danach den Stand erneut lesen, damit ein zweites Gerät nicht doppelt migriert.
- **Transaktionen**: PostgreSQL macht DDL transaktional (vollständiger Rollback). MySQL/MariaDB committet DDL implizit; eine fehlgeschlagene Migration kann dort einen Teilzustand hinterlassen. **Mitigation**: Migrationen bestehen aus kleinen, einzelnen Schritten; der Fehlerhinweis nennt den Teilzustand und empfiehlt die Sicherung des Betreibers einzuspielen. Spec-Anforderung FR-010 («kein halber Zustand») wird für MySQL/MariaDB deshalb als «Migrationen idempotent und fortsetzbar» umgesetzt (`IF NOT EXISTS`-Prüfung per `hasTable`/`hasColumn`) und in den Annahmen vermerkt.
- **Vor-Migrations-Kopie** (`.bak-n`) gibt es nur lokal; bei Servern ist die Sicherung Sache des Betreibers (Hinweis im Dialog vor der ersten Migration eines nicht leeren Servers entfällt, da dort nur eigene Schemata migriert werden).

## R11 – Einstellungen und Geoapify-Schlüssel (FR-006a)
- **Decision**: Die Einstellungszeile liegt in der aktiven Datenbank. `SettingsKeyCodec` hat zwei Varianten: lokal bestehend (`SecretStore`/`safeStorage`, Blob), Server UTF-8-Bytes im selben `blob`-Feld (`bytea`/`LONGBLOB`). Wahl nach Datenbanktyp; keine Schemaänderung. Der Schlüssel verlässt den Main-Prozess weiterhin nur Richtung Geoapify.
- **Rationale**: Gerätegebundene Verschlüsselung verhindert das Teilen; vom Anwender ausdrücklich so gewünscht.

## R12 – Backup und Info
- **Decision**: `BackupService.backup()` bleibt für lokal; bei Server liefert `dbInfo` den Typ und Host (ohne Passwort) und die Oberfläche zeigt statt «Sichern» den Hinweis auf die Sicherung durch den Betreiber. Menüeintrag «Datenbank sichern» wird bei Server deaktiviert.

## R13 – Tests gegen mehrere Datenbanken
- **Decision**: `tests/integration/helpers/db-targets.ts` liefert die verfügbaren Ziele (SQLite immer; Server nur wenn `SWISSBILL_TEST_PG_URL` / `_MYSQL_URL` / `_MARIADB_URL` gesetzt). Vorhandene Integrationstests, die Garantien prüfen (Nummernvergabe, Unveränderlichkeit, Suche, Regel-Parität), werden zu Matrix-Tests über alle Ziele. Jeder Testlauf nutzt ein eigenes Schema/eine eigene Datenbank und räumt auf.
- **CI**: Neuer Job `db-matrix` auf `ubuntu-latest` mit Service-Containern (`postgres:16`, `mysql:8`, `mariadb:11`); der bestehende Windows-Job `verify` bleibt (SQLite) und blockiert nicht. Lokal: `docker-compose.yml`.
- **Alternatives**: Testcontainers (zusätzliche Abhängigkeit, Docker-Pflicht für jeden Entwickler); Mocks (beweisen die Garantien nicht, siehe SC-002).

## R14 – Netzwerksperre und Datenschutz
- **Befund**: Die bestehende Sperre (`request-filter.ts`) gilt für Anfragen des Renderers; Datenbankverbindungen laufen im Main-Prozess über TCP und sind davon nicht betroffen.
- **Decision**: Verbindungen entstehen nur in `connect.ts`, nur nach gültiger Konfiguration (Architektur-Test: Treiber-Imports ausserhalb `db/adapters/` verboten, ohne Konfiguration wird kein Adapter für Server geladen). Das Passwort wird nie geloggt: Logger-Filter und ein Test, der Logs und Fehlertexte nach dem Passwort durchsucht.
