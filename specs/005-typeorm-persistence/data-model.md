# Data Model: Persistenz über TypeORM

Fachliches Modell unverändert (siehe `specs/001-swiss-qr-invoices/data-model.md`). Neu sind Abbildung, Regelort und Migrationen.

| Entität (`EntitySchema`) | Tabelle | Abbildung |
|---|---|---|
| `CustomerEntity` | `customers` | `id` auto-increment; Zeitstempel ISO-Text, vom Service gesetzt |
| `InvoiceEntity` | `invoices` | 1:n zu Items; `customer_id` nullable (FK `ON DELETE SET NULL`); Beträge `integer`; Daten/Zeitstempel `text` |
| `InvoiceItemEntity` | `invoice_items` | n:1 zu Invoice (FK `ON DELETE CASCADE`); `UNIQUE(invoice_id, position)` |
| `SettingsEntity` | `settings` | eine Zeile `id = 1` (von InitSchema angelegt); `geoapify_api_key` `blob` ↔ `Buffer` |
| `NumberCounterEntity` | `number_counters` | `year` PK, `last_seq` |

## Wo welche Regel lebt

| Regel | Früher | Neu |
|---|---|---|
| Ausgestellt ⇒ Inhalt/Positionen unveränderlich, nicht löschbar | Trigger | `invoice-repository` (Statusprüfung + bedingtes UPDATE, Positionen nur bei `draft`) |
| Erlaubte Statuswechsel | Trigger | `canTransition` in `shared/domain/invoice-status.ts` |
| Feldlängen, Landcode, Präfix-Muster, Zahlungsfrist | CHECK | Validierung in `shared/domain` (Customer/Settings/Invoice) |
| `due_date ≥ invoice_date`, Beträge ≥ 0, Menge > 0 | CHECK | Validierung in `shared/domain/invoice` |
| Entwurf ohne Nummer; ausgestellt ⇒ Nummer, Referenz, `issued_at`, Total > 0 | CHECK | `validateForIssue` + Repository-Schreibpfade |
| Rechnungsnummer eindeutig, Position eindeutig je Rechnung | UNIQUE | bleibt UNIQUE-Index (portabel) |
| Fremdschlüssel (`SET NULL`/`CASCADE`) | FK | bleibt FK (portabel) |
| Nummern lückenlos | `UPSERT … RETURNING` | Transaktion mit `UPDATE`/`INSERT`/`SELECT` (R7) |

## Migrationen (TypeORM)
1. `InitSchema` – Tabellen, Indizes, FKs, UNIQUE über die Table-API (ohne Trigger/CHECK); legt die Zeile `settings(id=1)` an.
2. `AddGeoapifyKey` – Spalte `geoapify_api_key`.
3. `DropLegacyTriggers` – `DROP TRIGGER IF EXISTS …` für die 7 Alt-Trigger (nur SQLite-Treiber; sonst No-op).

Bestandsdateien (Version 2): Baseline trägt 1 und 2 als ausgeführt ein (R8).
