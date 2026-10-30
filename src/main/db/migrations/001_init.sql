-- 001_init: Grundschema gemäss specs/001-swiss-qr-invoices/data-model.md
-- Beträge: ganze Rappen (INTEGER). Mengen: Tausendstel (INTEGER). Zeitpunkte: ISO-8601 (UTC).

-- ---------------------------------------------------------------------------
-- Globale Einstellungen (genau eine Zeile)
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  sender_name          TEXT NOT NULL DEFAULT '' CHECK (length(sender_name) <= 70),
  sender_street        TEXT NOT NULL DEFAULT '' CHECK (length(sender_street) <= 70),
  sender_house_no      TEXT NOT NULL DEFAULT '' CHECK (length(sender_house_no) <= 16),
  sender_zip           TEXT NOT NULL DEFAULT '' CHECK (length(sender_zip) <= 16),
  sender_city          TEXT NOT NULL DEFAULT '' CHECK (length(sender_city) <= 35),
  sender_country       TEXT NOT NULL DEFAULT 'CH' CHECK (length(sender_country) = 2),
  sender_iban          TEXT NOT NULL DEFAULT '' CHECK (length(sender_iban) <= 21),
  invoice_prefix       TEXT NOT NULL DEFAULT 'RE'
                       CHECK (length(invoice_prefix) BETWEEN 1 AND 10
                              AND invoice_prefix NOT GLOB '*[^A-Z0-9-]*'),
  default_closing_text TEXT,
  default_payment_days INTEGER NOT NULL DEFAULT 30 CHECK (default_payment_days BETWEEN 0 AND 365),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO settings (id) VALUES (1);

-- ---------------------------------------------------------------------------
-- Kunden
-- ---------------------------------------------------------------------------
CREATE TABLE customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 70),
  street     TEXT NOT NULL DEFAULT '' CHECK (length(street) <= 70),
  house_no   TEXT NOT NULL DEFAULT '' CHECK (length(house_no) <= 16),
  zip        TEXT NOT NULL CHECK (length(zip) BETWEEN 1 AND 16),
  city       TEXT NOT NULL CHECK (length(city) BETWEEN 1 AND 35),
  country    TEXT NOT NULL DEFAULT 'CH' CHECK (length(country) = 2),
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Rechnungen (jede Rechnung trägt ihre eigene Momentaufnahme von Absender, Schuldner, Schlusstext)
-- Bei Entwürfen dürfen sender_*, debtor_* und closing_text leer/NULL sein und total_rappen 0 sein;
-- die Pflichtprüfung läuft beim Ausstellen.
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'issued', 'paid', 'cancelled')),
  number          TEXT UNIQUE,
  number_year     INTEGER,
  number_seq      INTEGER,
  invoice_date    TEXT NOT NULL,
  due_date        TEXT NOT NULL,
  customer_id     INTEGER REFERENCES customers (id) ON DELETE SET NULL,

  sender_name     TEXT CHECK (sender_name IS NULL OR length(sender_name) <= 70),
  sender_street   TEXT CHECK (sender_street IS NULL OR length(sender_street) <= 70),
  sender_house_no TEXT CHECK (sender_house_no IS NULL OR length(sender_house_no) <= 16),
  sender_zip      TEXT CHECK (sender_zip IS NULL OR length(sender_zip) <= 16),
  sender_city     TEXT CHECK (sender_city IS NULL OR length(sender_city) <= 35),
  sender_country  TEXT DEFAULT 'CH' CHECK (sender_country IS NULL OR length(sender_country) = 2),
  sender_iban     TEXT CHECK (sender_iban IS NULL OR length(sender_iban) <= 21),

  debtor_name     TEXT CHECK (debtor_name IS NULL OR length(debtor_name) <= 70),
  debtor_street   TEXT CHECK (debtor_street IS NULL OR length(debtor_street) <= 70),
  debtor_house_no TEXT CHECK (debtor_house_no IS NULL OR length(debtor_house_no) <= 16),
  debtor_zip      TEXT CHECK (debtor_zip IS NULL OR length(debtor_zip) <= 16),
  debtor_city     TEXT CHECK (debtor_city IS NULL OR length(debtor_city) <= 35),
  debtor_country  TEXT DEFAULT 'CH' CHECK (debtor_country IS NULL OR length(debtor_country) = 2),

  closing_text    TEXT,
  reference_type  TEXT CHECK (reference_type IS NULL OR reference_type IN ('QRR', 'SCOR')),
  reference       TEXT,
  total_rappen    INTEGER NOT NULL DEFAULT 0 CHECK (total_rappen >= 0),
  layout_version  INTEGER,
  issued_at       TEXT,
  paid_at         TEXT,
  cancelled_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  CHECK (due_date >= invoice_date),
  -- Entwürfe haben keine Nummer; alle anderen Rechnungen sind vollständig festgeschrieben.
  CHECK (status <> 'draft' OR number IS NULL),
  CHECK (status = 'draft' OR (number IS NOT NULL AND number_year IS NOT NULL
                              AND number_seq IS NOT NULL AND reference IS NOT NULL
                              AND reference_type IS NOT NULL AND issued_at IS NOT NULL
                              AND total_rappen > 0))
);

CREATE INDEX idx_invoices_status_date ON invoices (status, invoice_date);
CREATE INDEX idx_invoices_debtor_name ON invoices (debtor_name);

-- ---------------------------------------------------------------------------
-- Positionen
-- ---------------------------------------------------------------------------
CREATE TABLE invoice_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id        INTEGER NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  position          INTEGER NOT NULL CHECK (position >= 1),
  description       TEXT NOT NULL CHECK (length(description) <= 500),
  quantity_milli    INTEGER NOT NULL CHECK (quantity_milli > 0),
  unit_price_rappen INTEGER NOT NULL CHECK (unit_price_rappen >= 0),
  amount_rappen     INTEGER NOT NULL CHECK (amount_rappen >= 0),
  UNIQUE (invoice_id, position)
);

-- ---------------------------------------------------------------------------
-- Rechnungsnummern-Zähler pro Jahr (Jahr der Ausstellung)
-- ---------------------------------------------------------------------------
CREATE TABLE number_counters (
  year     INTEGER PRIMARY KEY,
  last_seq INTEGER NOT NULL CHECK (last_seq >= 0)
);

-- ---------------------------------------------------------------------------
-- Unveränderlichkeit (Constitution Prinzip III)
-- Die Trigger prüfen den ALTEN Status; der Übergang draft -> issued bleibt dadurch erlaubt.
-- Nach dem Ausstellen dürfen nur status, paid_at, cancelled_at, updated_at und customer_id
-- (Herkunftshinweis, wird bei Kundenlöschung auf NULL gesetzt) geändert werden.
-- ---------------------------------------------------------------------------
CREATE TRIGGER invoices_immutable_update
BEFORE UPDATE ON invoices
WHEN OLD.status <> 'draft'
 AND (NEW.id IS NOT OLD.id
   OR NEW.number IS NOT OLD.number
   OR NEW.number_year IS NOT OLD.number_year
   OR NEW.number_seq IS NOT OLD.number_seq
   OR NEW.invoice_date IS NOT OLD.invoice_date
   OR NEW.due_date IS NOT OLD.due_date
   OR NEW.sender_name IS NOT OLD.sender_name
   OR NEW.sender_street IS NOT OLD.sender_street
   OR NEW.sender_house_no IS NOT OLD.sender_house_no
   OR NEW.sender_zip IS NOT OLD.sender_zip
   OR NEW.sender_city IS NOT OLD.sender_city
   OR NEW.sender_country IS NOT OLD.sender_country
   OR NEW.sender_iban IS NOT OLD.sender_iban
   OR NEW.debtor_name IS NOT OLD.debtor_name
   OR NEW.debtor_street IS NOT OLD.debtor_street
   OR NEW.debtor_house_no IS NOT OLD.debtor_house_no
   OR NEW.debtor_zip IS NOT OLD.debtor_zip
   OR NEW.debtor_city IS NOT OLD.debtor_city
   OR NEW.debtor_country IS NOT OLD.debtor_country
   OR NEW.closing_text IS NOT OLD.closing_text
   OR NEW.reference_type IS NOT OLD.reference_type
   OR NEW.reference IS NOT OLD.reference
   OR NEW.total_rappen IS NOT OLD.total_rappen
   OR NEW.layout_version IS NOT OLD.layout_version
   OR NEW.issued_at IS NOT OLD.issued_at
   OR NEW.created_at IS NOT OLD.created_at)
BEGIN
  SELECT RAISE(ABORT, 'IMMUTABLE: Eine ausgestellte Rechnung kann nicht geändert werden.');
END;

CREATE TRIGGER invoices_immutable_delete
BEFORE DELETE ON invoices
WHEN OLD.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'IMMUTABLE: Eine ausgestellte Rechnung kann nicht gelöscht werden.');
END;

-- Erlaubte Statusübergänge: draft->issued, issued->paid, paid->issued, issued->cancelled, paid->cancelled
CREATE TRIGGER invoices_status_transition
BEFORE UPDATE OF status ON invoices
WHEN NEW.status <> OLD.status
 AND NOT ((OLD.status = 'draft'  AND NEW.status = 'issued')
       OR (OLD.status = 'issued' AND NEW.status IN ('paid', 'cancelled'))
       OR (OLD.status = 'paid'   AND NEW.status IN ('issued', 'cancelled')))
BEGIN
  SELECT RAISE(ABORT, 'IMMUTABLE: Ungültiger Statuswechsel.');
END;

CREATE TRIGGER invoice_items_immutable_insert
BEFORE INSERT ON invoice_items
WHEN (SELECT status FROM invoices WHERE id = NEW.invoice_id) <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'IMMUTABLE: Positionen einer ausgestellten Rechnung können nicht geändert werden.');
END;

CREATE TRIGGER invoice_items_immutable_update
BEFORE UPDATE ON invoice_items
WHEN (SELECT status FROM invoices WHERE id = OLD.invoice_id) <> 'draft'
  OR (SELECT status FROM invoices WHERE id = NEW.invoice_id) <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'IMMUTABLE: Positionen einer ausgestellten Rechnung können nicht geändert werden.');
END;

CREATE TRIGGER invoice_items_immutable_delete
BEFORE DELETE ON invoice_items
WHEN (SELECT status FROM invoices WHERE id = OLD.invoice_id) <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'IMMUTABLE: Positionen einer ausgestellten Rechnung können nicht gelöscht werden.');
END;
