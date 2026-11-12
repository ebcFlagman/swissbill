import type Database from 'better-sqlite3';
import { normalizeIban } from '../../shared/domain/iban';
import type { GeoapifyKeyStatus, SettingsFields } from '../../shared/domain/settings';
import type { SecretStore } from '../secret-store';

export type { SettingsFields };

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

/**
 * Liest die globalen Einstellungen (Zeile `id = 1`, wird von Migration 001 angelegt).
 * Der API-Key gehört bewusst nicht dazu: er wird nur über `readApiKey` im Main gelesen.
 */
export function getSettings(db: Database.Database): SettingsFields {
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
export function saveSettings(db: Database.Database, settings: SettingsFields, now: string): void {
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

function readKeyBlob(db: Database.Database): Buffer | null {
  const row = db.prepare('SELECT geoapify_api_key AS key FROM settings WHERE id = 1').get() as
    | { key: Buffer | null }
    | undefined;
  return row?.key ?? null;
}

/** Klartext des API-Keys, nur im Main. `null`, wenn keiner gespeichert ist oder er sich nicht entschlüsseln lässt. */
export async function readApiKey(db: Database.Database, secrets: SecretStore): Promise<string | null> {
  const blob = readKeyBlob(db);
  if (blob === null) return null;
  const key = await secrets.decrypt(blob);
  return key !== null && key !== '' ? key : null;
}

/** Ob und in welchem Zustand ein Key gespeichert ist (ohne den Key preiszugeben). */
export async function getKeyState(
  db: Database.Database,
  secrets: SecretStore,
): Promise<{ geoapifyKeySet: boolean; geoapifyKeyStatus: GeoapifyKeyStatus }> {
  const blob = readKeyBlob(db);
  if (blob === null) {
    return {
      geoapifyKeySet: false,
      geoapifyKeyStatus: (await secrets.isAvailable()) ? 'none' : 'encryption-unavailable',
    };
  }
  const readable = (await secrets.decrypt(blob)) !== null;
  return readable
    ? { geoapifyKeySet: true, geoapifyKeyStatus: 'ok' }
    : { geoapifyKeySet: false, geoapifyKeyStatus: 'undecryptable' };
}

/**
 * Setzt (verschlüsselt) oder entfernt (`''`) den API-Key. Entfernen geht immer; Setzen setzt eine verfügbare
 * Verschlüsselung voraus. Rückgabe `false`, wenn nichts gespeichert wurde, weil keine Verschlüsselung verfügbar ist.
 */
export async function writeApiKey(db: Database.Database, secrets: SecretStore, key: string): Promise<boolean> {
  if (key === '') {
    db.prepare('UPDATE settings SET geoapify_api_key = NULL WHERE id = 1').run();
    return true;
  }
  if (!(await secrets.isAvailable())) return false;
  db.prepare('UPDATE settings SET geoapify_api_key = ? WHERE id = 1').run(await secrets.encrypt(key));
  return true;
}
