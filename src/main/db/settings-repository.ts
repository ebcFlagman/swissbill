import type Database from 'better-sqlite3';
import { normalizeIban } from '../../shared/domain/iban';
import type { Settings } from '../../shared/domain/settings';

export type { Settings };

interface SettingsRow {
  sender_name: string;
  sender_street: string;
  sender_house_no: string;
  sender_zip: string;
  sender_city: string;
  sender_country: string;
  sender_iban: string;
  invoice_prefix: string;
  default_closing_text: string | null;
  default_payment_days: number;
}

/** Liest die globalen Einstellungen (Zeile `id = 1`, wird von Migration 001 angelegt). */
export function getSettings(db: Database.Database): Settings {
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as SettingsRow | undefined;
  if (!row) throw new Error('Die Einstellungen fehlen in der Datenbank.');
  return {
    sender: {
      name: row.sender_name,
      street: row.sender_street,
      houseNo: row.sender_house_no,
      zip: row.sender_zip,
      city: row.sender_city,
      country: row.sender_country,
      iban: row.sender_iban,
    },
    invoicePrefix: row.invoice_prefix,
    defaultClosingText: row.default_closing_text,
    defaultPaymentDays: row.default_payment_days,
  };
}

/** Schreibt die Einstellungen (die Validierung erfolgt im Service). */
export function saveSettings(db: Database.Database, settings: Settings, now: string): void {
  const closing = settings.defaultClosingText;
  db.prepare(
    `UPDATE settings SET sender_name = ?, sender_street = ?, sender_house_no = ?, sender_zip = ?,
       sender_city = ?, sender_country = ?, sender_iban = ?, invoice_prefix = ?,
       default_closing_text = ?, default_payment_days = ?, updated_at = ?
     WHERE id = 1`,
  ).run(
    settings.sender.name,
    settings.sender.street,
    settings.sender.houseNo,
    settings.sender.zip,
    settings.sender.city,
    settings.sender.country,
    normalizeIban(settings.sender.iban),
    settings.invoicePrefix,
    closing === null || closing.trim() === '' ? null : closing,
    settings.defaultPaymentDays,
    now,
  );
}
