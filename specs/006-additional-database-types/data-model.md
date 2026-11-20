# Data Model: Weitere Datenbanktypen

## 1. Datenbankverbindung (lokale Datei, nicht in der Datenbank)

Datei `userData/db-connection.json`. Fehlt sie, gilt lokales SQLite.

| Feld | Typ | Regel |
|---|---|---|
| `version` | integer | aktuell `1`; höhere Version → Datei wird nicht gelesen, Hinweis zum Update |
| `type` | `'sqlite' \| 'postgres' \| 'mysql' \| 'mariadb'` | Pflicht |
| `host` | string | Server: Pflicht, 1–255 Zeichen, nicht nur Leerzeichen |
| `port` | integer | 1–65535; Vorbelegung 5432 / 3306 / 3306 |
| `database` | string | Server: Pflicht, 1–64 Zeichen |
| `user` | string | Server: Pflicht, 1–64 Zeichen |
| `tls.enabled` | boolean | Standard `true` für Server |
| `tls.caPath` | string \| null | nur wenn `enabled`; Pfad auf PEM-Datei |

- Das **Passwort** gehört zu genau dieser Verbindung und liegt ausschliesslich im OS-Schlüsselbund (Dienst `swissbill`, Konto `db-connection`). Es erscheint in keinem Feld dieser Datei.
- Genau eine Verbindung ist aktiv. Die Datei wird atomar geschrieben (temp + Rename).
- Validierung in `shared/domain/db-connection.ts` (gleiche Funktion im Main und für Formular im Renderer).

## 2. Zugangsdaten-Status (Renderer-Sicht)

Der Renderer erhält nie das Passwort, nur `{ passwordStored: boolean }` und die verfügbare Plattformfähigkeit `{ keychainAvailable: boolean }`.

## 3. Tabelle `edit_locks` (neu, Migration `AddEditLocks1700000000004`)

Wird auf allen Datenbanktypen angelegt, aber nur bei Serververbindung verwendet.

| Spalte | Typ | Regel |
|---|---|---|
| `entity_type` | varchar(16) | `'customer'` oder `'invoice'`; Teil des Primärschlüssels |
| `entity_id` | integer | Teil des Primärschlüssels |
| `owner_id` | varchar(36) | UUID pro App-Start |
| `owner_label` | varchar(100) | Rechnername für den Hinweis «wird von … bearbeitet» |
| `acquired_at` | timestamp | Serverzeit beim Erwerb |
| `heartbeat_at` | timestamp | Serverzeit des letzten Lebenszeichens |

**Zustände / Übergänge**: *frei* → (Erwerb) → *gesperrt* → (Heartbeat) → *gesperrt*; *gesperrt* → (Freigabe | Ablauf nach 5 Minuten ohne Heartbeat) → *frei*.
Ablauf bedeutet: `now_server - heartbeat_at > 300 s`. Eine abgelaufene Sperre wird beim nächsten Erwerb gelöscht.
Es gibt keinen Fremdschlüssel auf die Fachtabellen (Sperren überleben das Löschen nicht, werden aber beim Löschen des Datensatzes mitentfernt).

## 4. Bestehende Tabellen (unverändert im Inhalt)

`settings`, `customers`, `invoices`, `invoice_items`, `number_counters`, `migrations`.

Änderungen in der Basis-Migration `InitSchema1700000000001` (nur Spaltentypen, siehe research R2). **Gilt nur für Server-Treiber**; bei SQLite bleiben die bisherigen Typen unverändert:

| Bisher | Neu | Betroffene Spalten |
|---|---|---|
| `text` | `varchar(n)` | alle begrenzten Felder (Namen, Strassen, Orte, IBAN, Referenz, Präfix, Status, Nummer, Datumsfelder als ISO-Text 32) |
| `text` | `text` (ohne Default) | `closing_text`, `default_closing_text`, `notes` |
| `integer` | `bigint` (+ Transformer) | `total_rappen`, `unit_price_rappen`, `amount_rappen`, `quantity_milli` |
| `blob` | `blob` | `settings.geoapify_api_key` (Server: UTF-8-Bytes des Klartextschlüssels; lokal: OS-verschlüsselt) |

SQLite-Dateien (alt und neu) behalten dasselbe Schema wie bisher.

## 5. Einstellungen (Entität «App-Einstellungen»)

Unverändert die Zeile `settings(id = 1)`; bei Serverdatenbank von allen Geräten geteilt (letzter Speichervorgang gewinnt). Der Geoapify-Schlüssel wird je nach Datenbanktyp codiert (research R11).

## 6. Verbindungstest-Ergebnis (Übertragungsobjekt, nicht gespeichert)

| Feld | Typ |
|---|---|
| `ok` | boolean |
| `failedStage` | `'reachable' \| 'authentication' \| 'database' \| 'permissions' \| 'schema' \| null` |
| `message` | string (deutsch, ohne Passwort/Verbindungsdaten ausser Host und Datenbankname) |
| `schema` | `'empty' \| 'current' \| 'older' \| 'newer' \| 'foreign' \| 'unknown'` |

## 7. Validierungsregeln (Auszug, jede mit Test)

- Port ausserhalb 1–65535, leerer Host/Datenbank/Benutzer → Formularfehler.
- Sonderzeichen in Passwort, Benutzer und Datenbank werden unverändert übergeben (kein URL-Aufbau).
- Betragsspalten (`total_rappen`, `unit_price_rappen`, `amount_rappen`, `quantity_milli`) sind `bigint` mit Transformer nach `number`; die bestehende Obergrenze `MAX_TOTAL_RAPPEN` bleibt und wird auf allen Datenbanken getestet.
- Sperre abgelaufen oder fremd → Speichern wird mit `LOCK_LOST` abgelehnt, nichts wird geschrieben.
