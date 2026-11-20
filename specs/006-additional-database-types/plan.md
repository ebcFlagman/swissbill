# Implementation Plan: Weitere Datenbanktypen (PostgreSQL, MySQL/MariaDB)

**Branch**: `claude/additional-database-types-faf303` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-additional-database-types/spec.md`

## Summary

Die Persistenz (Feature 005) läuft bereits über TypeORM, mit Garantien im Anwendungscode. Dieses Feature
macht die `DataSource` austauschbar: SQLite (Standard), PostgreSQL, MySQL und MariaDB. Kernentscheidungen
(Details in [research.md](research.md)):

1. **Adapter pro Datenbanktyp** (`src/main/db/adapters/`): Treiberoptionen, Fehlerabbildung, Migrationssperre,
   Serverzeit und Integritäts-/Sicherungsfunktionen sind die einzigen datenbankspezifischen Stellen.
2. **Portables Schema**: `InitSchema` wählt die Spaltentypen nach Treiber: SQLite behält `text`/`integer` (unverändertes Schema), Server erhalten `varchar(n)`/`bigint`, damit dieselbe Migrationsreihe auf allen vier Datenbanken läuft.
3. **Zugangsdaten**: Verbindungsangaben ohne Passwort in `db-connection.json` im `userData`-Ordner, das
   Passwort ausschliesslich im OS-Schlüsselbund (`@napi-rs/keyring`), nie in Datei, DB, Log oder Renderer.
4. **Start ohne Datenbank**: Die Verbindungs-IPC-Kanäle sind vor der Datenbank registriert; schlägt das Verbinden
   fehl, öffnet die App den Wiederherstellungsmodus (Wiederholen / Einstellungen / lokal).
5. **Mehrgeräte-Betrieb**: Nummernvergabe über Zeilensperre der Datenbank (Zählerzeile vorab angelegt, Wiederholung bei Deadlock), Bearbeitungssperren in der Tabelle
   `edit_locks` (Ablauf nach 5 Minuten, Serverzeit), automatische Migration mit Datenbank-Sperre.
6. **Einstellungen auf dem Server**: alle Einstellungen in der aktiven Datenbank; der Geoapify-Schlüssel liegt
   auf dem Server als Klartext-Bytes, lokal weiterhin OS-verschlüsselt (Codec je Datenbanktyp).

| Anforderung | Umsetzung |
|---|---|
| FR-001/002 Typen, Standard lokal | `DbConnectionConfig` (Typ `sqlite` ohne Datei = Standard); ohne Datei kein Netzwerkzugriff |
| FR-003/003a Eingabe, TLS | Einstellungsbereich «Datenbank»; TLS an = Zertifikatsprüfung immer, optionales CA-Zertifikat; TLS aus = erlaubt mit Warnung |
| FR-004 Verbindungstest | `dbConnection:test` stuft Fehler in 5 Stufen ein (erreichbar, Anmeldung, Datenbank, Rechte, Schema) |
| FR-005–008 Passwort | `CredentialStore` über `@napi-rs/keyring`; kein Schlüsselbund → Speichern abgelehnt |
| FR-006a Einstellungen/Geoapify | `SettingsKeyCodec`: lokal OS-verschlüsselt, Server UTF-8-Bytes |
| FR-009 Garantien | Bestehende Persistenzschicht; Zählerzeile wird per `UPDATE` gesperrt, Erstanlage mit Wiederholung bei Schlüsselkonflikt |
| FR-009a Sperren | `edit_locks` + `LockService`; Schreibpfade für Kunden/Entwurf prüfen die eigene gültige Sperre |
| FR-010/010a/011 Schema | TypeORM-Migrationen, Migrationssperre (Advisory Lock / `GET_LOCK`), nur leere oder eigene DB |
| FR-012/013/014 Fehler, Wechsel, Neustart | Wiederherstellungsmodus; Wechsel mit Bestätigung; Konfiguration wirkt nach Neustart (`app.relaunch`) |
| FR-015 Texte | Deutsche Meldungen, keine Zugangsdaten in Texten |

## Technical Context

**Language/Version**: TypeScript 6.0, Node im Electron-45-Main

**Primary Dependencies**: bestehend `typeorm` 1.1.x, `better-sqlite3`; neu `pg` (8.x), `mysql2` (3.x, für MySQL und MariaDB), `@napi-rs/keyring` (vorgebaute Binaries, kein Electron-Rebuild nötig). **Risiko**: Treiber-Kompatibilität mit TypeORM 1.1.x und Electron-Packaging (R1, Gate in Task 1)

**Storage**: SQLite-Datei (Standard), PostgreSQL ≥ 14, MySQL ≥ 8.0, MariaDB ≥ 10.6; Verbindungsangaben in `userData/db-connection.json`, Passwort im OS-Schlüsselbund

**Testing**: vitest; Integrationstests laufen gegen alle Ziele, die per Umgebungsvariable konfiguriert sind (`SWISSBILL_TEST_PG_URL`, `…_MYSQL_URL`, `…_MARIADB_URL`), SQLite immer; `docker-compose.yml` für lokal, neuer CI-Job auf Ubuntu mit Service-Containern; Schlüsselbund im Test durch einen Speicher-Ersatz

**Target Platform**: Windows und Linux (Electron-Desktop); macOS nicht ausgeliefert, Schlüsselbund-Anbindung trotzdem plattformneutral

**Project Type**: desktop-app

**Performance Goals**: Liste 10 000 Rechnungen < 1 s und Ausstellen < 1 s auf lokalem SQLite (unverändert); Server im LAN: Ausstellen < 2 s

**Constraints**: ohne Konfiguration keine Netzwerkverbindung; Datenbankzugriff nur im Main-Prozess; Passwort nie im Renderer; datenbankspezifischer Code nur in `db/adapters/`; kein `synchronize`; Betragsspalten `bigint` mit Zahlen-Transformer (bestehende Obergrenze `MAX_TOTAL_RAPPEN` ≈ 10^11 Rappen passt nicht in 32 Bit)

**Scale/Scope**: Kleinteam (≤ 10 Geräte), 6 Tabellen (5 bestehend + `edit_locks`) plus `migrations`, 1 neue Migration + Anpassung der Basis-Migration, ~12 neue Dateien, 1 neuer Einstellungsbereich und 1 Wiederherstellungsmodus

## Constitution Check

*GATE: vor Phase 0 geprüft, nach Phase 1 erneut geprüft. Grundlage: Verfassung v1.4.0.*

| Prinzip | Bewertung |
|---|---|
| I. QR-Bill-Konformität | Unberührt. **Pass** |
| II. Local-First/Offline | Standard bleibt lokales SQLite; Serverdatenbank nur per Opt-in (Ausnahme in v1.4.0). Ohne Konfiguration keine Verbindung (FR-002, Test). Passwort nur im OS-Schlüsselbund, kein Klartext-Fallback (FR-007). Renderer-Netzwerksperre unverändert (Verbindungen laufen im Main-Prozess). **Pass** |
| III. Integrität | Regeln bleiben im Code und gelten auf jeder DB; Migrationen nur vorwärts über TypeORM, kein `synchronize`; Nummernvergabe lückenlos auch nebenläufig (SC-003 als Test auf allen DBs). Ein-Datei-Sicherung nur lokal, Server = Betreiber. **Pass** |
| IV. Test-First | Domänenregeln (Sperren-Ablauf, Fehlerabbildung, Konfigurationsvalidierung) test-first; Matrix-Tests je DB. **Pass** |
| V. Einfachheit & Electron-Sicherheit | 3 neue Abhängigkeiten sind durch die Anforderung begründet (siehe Complexity Tracking). DB- und Schlüsselbund-Zugriff nur im Main, schmale typisierte IPC; Passwort wird nie zurück an den Renderer gesendet. **Pass** (mit Begründung) |
| Technologie | Mehrere DB-Typen werden getestet (CI-Matrix); DB-spezifischer Code in `db/adapters/`. **Pass** |

**Post-Design (nach Phase 1)**: unverändert **Pass**. Offene Risiken: R1 (Treiber), R6 (Schlüsselbund unter Linux ohne Dienst, wird bewusst abgelehnt), R10 (Zeitdifferenzen) – alle mit Test abgesichert.

## Project Structure

### Documentation (this feature)

```text
specs/006-additional-database-types/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── connection-ipc.md        # Kanäle und Typen für Einstellungen/Verbindungstest
│   ├── credential-store.md      # Schnittstelle Schlüsselbund
│   └── db-adapter.md            # Schnittstelle pro Datenbanktyp
├── checklists/requirements.md
└── tasks.md                     # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── shared/
│   ├── domain/db-connection.ts          # Konfigurationsmodell + Validierung (neu)
│   └── ipc/db-connection.ts             # IPC-Typen (neu), Kanäle in api.ts
├── main/
│   ├── credential-store.ts              # Interface (neu)
│   ├── keyring-credential-store.ts      # @napi-rs/keyring-Implementierung (neu)
│   ├── db/
│   │   ├── adapters/{index,sqlite,postgres,mysql}.ts   # neu; sqlite-adapter.ts wandert hierher
│   │   ├── connection-config.ts         # Lesen/Schreiben db-connection.json (neu)
│   │   ├── connect.ts                   # Verbindung + Test + Fehlerstufen (neu)
│   │   ├── data-source.ts               # nimmt Adapter statt festem SQLite (geändert)
│   │   ├── startup.ts                   # Migrationssperre, Fremd-DB-Erkennung (geändert)
│   │   ├── lock-repository.ts           # edit_locks (neu)
│   │   ├── entities/edit-lock.entity.ts # neu
│   │   ├── settings-repository.ts       # SettingsKeyCodec (geändert)
│   │   └── migrations/{…001 (Typen), …004-AddEditLocks}.ts
│   ├── services/connection-service.ts   # neu; Sperren: db/lock-repository.ts + db/lock-guard.ts, recovery.ts
│   ├── services/backup-service.ts       # nur lokal; Server → Hinweis (geändert)
│   ├── ipc/db-connection.ts, ipc/locks.ts              # neu
│   └── index.ts                         # Start mit Wiederherstellungsmodus (geändert)
└── renderer/
    ├── pages/Settings.tsx               # Bereich «Datenbank» (geändert)
    ├── components/{DbConnectionForm,RecoveryDialog,LockBanner}.tsx   # neu
    └── lib/                             # Hook für Sperren/Heartbeat (neu)

tests/
├── unit/{db-connection,connection-config,credential-store,connection-service,lock-expiry,error-mapping,recovery}.test.ts
├── integration/                         # parametrisiert über alle DB-Ziele
│   ├── matrix/{numbering,immutability,search,money,migration,locks,settings-key,connection-test,connection-loss}.test.ts
│   ├── {switch,credential-leak}.test.ts
│   └── helpers/db-targets.ts
└── e2e/                                 # Verbindungs-Einrichtung gegen SQLite-Ersatz-Server nicht nötig
docker-compose.yml                       # Test-Server lokal (neu)
.github/workflows/ci.yml                 # neuer Job db-matrix (Ubuntu, Service-Container)
```

**Structure Decision**: Bestehende Struktur bleibt. Datenbankspezifisches wandert in `src/main/db/adapters/`;
alles andere nutzt nur die Adapter-Schnittstelle ([contracts/db-adapter.md](contracts/db-adapter.md)).

## Complexity Tracking

| Abweichung | Warum nötig | Einfachere Alternative abgelehnt, weil |
|---|---|---|
| 3 neue Abhängigkeiten (`pg`, `mysql2`, `@napi-rs/keyring`) | Treiber für die geforderten DBs; echter Schlüsselbund-Eintrag | Electron `safeStorage` legt nur eine verschlüsselte Datei ab und ist kein Schlüsselbund-Eintrag (Spec: ausschliesslich im Schlüsselbund) |
| Adapter-Schicht | Pro-DB-Unterschiede (Fehlercodes, Sperren, Serverzeit) isolieren (Verfassung: Technologie) | Verteilte `if (type === …)` verletzen die Vorgabe und sind schwer testbar |
| Eigene Sperrtabelle | Spec verlangt Bearbeitungssperren geräteübergreifend | Optimistische Konflikterkennung wurde im Clarify ausdrücklich nicht gewählt |
