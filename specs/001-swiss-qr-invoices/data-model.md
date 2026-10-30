# Datenmodell: Swiss QR-Rechnungen erstellen

SQLite, Einzeldatei. Beträge in Rappen (`INTEGER`), Mengen in Tausendsteln (`INTEGER`), Zeitpunkte als
ISO-8601-Text (UTC), Daten ohne Uhrzeit als `YYYY-MM-DD`. Schema-Version in `PRAGMA user_version`.

## Entitäten

### settings (genau eine Zeile, `id = 1`)

Globale Vorgaben. Der Absender hier ist die Vorlage für neue Rechnungen (FR-011, FR-017).

| Feld | Typ | Regel |
|------|-----|-------|
| sender_name | TEXT | Pflicht, max. 70 |
| sender_street, sender_house_no | TEXT | Strasse max. 70, Hausnummer max. 16 |
| sender_zip, sender_city | TEXT | PLZ max. 16, Ort max. 35, Pflicht |
| sender_country | TEXT | ISO-Code, Standard `CH` |
| sender_iban | TEXT | Pflicht, gültige IBAN (CH/LI), ohne Leerzeichen gespeichert |
| invoice_prefix | TEXT | Pflicht, 1–10 Zeichen `A-Z0-9-`, Standard `RE` |
| default_closing_text | TEXT | optional, z. B. Zahlungsbedingungen (FR-022) |
| default_payment_days | INTEGER | Standard 30, Basis für die Zahlungsfrist |
| updated_at | TEXT | |

Die Zeile `id = 1` wird von Migration 001 mit leeren Absenderfeldern, `invoice_prefix = 'RE'` und
`default_payment_days = 30` angelegt. «Pflicht» bedeutet hier: Pflicht beim Speichern der Einstellungen, nicht
im Anfangszustand. Bis zur ersten Einrichtung sind die Absenderfelder leer.

Der Referenztyp ist **abgeleitet**: QR-IBAN → QRR, sonst SCOR (kein eigenes Feld).

### customers

| Feld | Typ | Regel |
|------|-----|-------|
| id | INTEGER PK | |
| name | TEXT | Pflicht, max. 70 |
| street, house_no, zip, city | TEXT | wie beim Absender, Ort und PLZ Pflicht |
| country | TEXT | Standard `CH` |
| notes | TEXT | optional |
| created_at, updated_at | TEXT | |

### invoices

Jede Rechnung trägt ihre eigene Momentaufnahme von Absender, Schuldner und Schlusstext. Änderungen an
`settings` oder `customers` wirken sich deshalb nie auf bestehende Rechnungen aus (User Story 3, Szenarien 3 und 5).

| Feld | Typ | Regel |
|------|-----|-------|
| id | INTEGER PK | |
| status | TEXT | `draft` \| `issued` \| `paid` \| `cancelled` |
| number | TEXT UNIQUE NULL | `PRÄFIX-JAHR-ZÄHLER`; `NULL` solange Entwurf |
| number_year, number_seq | INTEGER NULL | gesetzt mit `number`; `number_year` ist das Jahr der Ausstellung, nicht des Rechnungsdatums |
| invoice_date | TEXT | Rechnungsdatum |
| due_date | TEXT | ≥ `invoice_date` |
| customer_id | INTEGER NULL | FK `customers`, `ON DELETE SET NULL`, nur Herkunftshinweis |
| sender_* | TEXT NULL | Name, Strasse, Hausnummer, PLZ, Ort, Land, IBAN (vorausgefüllt aus `settings`, überschreibbar). Bei Entwürfen dürfen die Felder leer sein; Pflicht gilt beim Ausstellen |
| debtor_* | TEXT NULL | Name, Strasse, Hausnummer, PLZ, Ort, Land (kopiert aus `customers`). Bei Entwürfen leer erlaubt; Pflicht gilt beim Ausstellen |
| closing_text | TEXT NULL | vorausgefüllt aus `settings`, überschreibbar |
| reference_type | TEXT NULL | `QRR` \| `SCOR`, gesetzt beim Ausstellen |
| reference | TEXT NULL | abgeleitet beim Ausstellen (FR-019, FR-020) |
| total_rappen | INTEGER NOT NULL DEFAULT 0 | Summe der Positionen; bei Entwürfen 0 erlaubt, > 0 beim Ausstellen |
| layout_version | INTEGER NULL | Version des PDF-Layouts beim Ausstellen |
| issued_at, paid_at, cancelled_at | TEXT NULL | Zeitpunkte der Statuswechsel |
| created_at, updated_at | TEXT | |

### invoice_items

| Feld | Typ | Regel |
|------|-----|-------|
| id | INTEGER PK | |
| invoice_id | INTEGER | FK `invoices`, `ON DELETE CASCADE` (nur bei Entwürfen möglich) |
| position | INTEGER | Reihenfolge, ab 1 |
| description | TEXT | NOT NULL, max. 500 (leer nur im Entwurf; Pflicht beim Ausstellen) |
| quantity_milli | INTEGER | > 0, Tausendstel (1.5 → 1500) |
| unit_price_rappen | INTEGER | ≥ 0 |
| amount_rappen | INTEGER | `round_half_up(quantity_milli * unit_price_rappen / 1000)` |

### number_counters

| Feld | Typ | Regel |
|------|-----|-------|
| year | INTEGER PK | |
| last_seq | INTEGER | zuletzt vergebene Nummer des Jahres |

## Beziehungen

- `invoices` 1 — n `invoice_items`
- `customers` 1 — n `invoices` (lose, nur Herkunft)
- `number_counters` wird beim Ausstellen pro Jahr erhöht

## Zustandsübergänge

```text
draft ──issue──▶ issued ──markPaid──▶ paid
  │                │  ▲                │
delete             │  └─────reopen─────┘   (Korrektur einer Fehlbuchung)
(nur Entwurf)      └──cancel──▶ cancelled   (endgültig)
```

- `issue` (Entwurf → ausgestellt): in **einer** Transaktion Nummer vergeben, Referenz ableiten, Gesamtbetrag
  und Momentaufnahme festschreiben, Status setzen. Voraussetzung: alle Validierungen aus research.md Abschnitt 5 bestehen.
- `markPaid` und `reopen` ändern nur Status und `paid_at`.
- `cancel` ist von `issued` und `paid` möglich und endgültig; die Nummer bleibt vergeben (FR-013).
- `delete` ist nur für `draft` zulässig (FR-021).
- `duplicate` erzeugt aus jeder Rechnung einen neuen Entwurf (ohne Nummer, Datum heute, Fälligkeit neu berechnet).

## Unveränderlichkeit (durchgesetzt in Service und Datenbank)

SQLite-Trigger (Teil der Migration 001, damit sie vom ersten Ausstellen an gelten) prüfen den **alten** Status
(`OLD.status`); der Übergang `draft → issued` bleibt dadurch erlaubt. Sie verhindern, dass bei Rechnungen mit Status ≠ `draft`:

- `invoice_items` eingefügt, geändert oder gelöscht werden,
- Spalten der Rechnung ausser `status`, `paid_at`, `cancelled_at`, `updated_at` und `customer_id` (Herkunftshinweis, wird beim Löschen eines Kunden auf `NULL` gesetzt) geändert werden,
- die Rechnung gelöscht wird.

## Indizes

- `invoices(number)` UNIQUE
- `invoices(status, invoice_date)` für Liste und Filter
- `invoices(debtor_name)` für die Suche
- `invoice_items(invoice_id, position)`

## Validierung (Auszug, Details in research.md)

- Pflichtfelder vor dem Ausstellen: Absender (Name, PLZ, Ort, IBAN), Rechnungsempfänger (nur Name; Strasse, Nr., PLZ, Ort und Land sind optional, `debtor_country` ist bei «nicht angegeben» `NULL`), mindestens eine Position, Total > 0. Im QR-Code steht der Empfänger nur mit Name, PLZ und Ort, sonst entfällt er.
- Feldlängen und Zeichenvorrat gemäss Swiss-QR-Standard für alle Adressfelder.
- Die Validierung läuft in `src/shared/domain` und wird im Renderer (Sofort-Feedback) und im Main (verbindlich) verwendet.
