import type { DataSource } from 'typeorm';
import { normalizeIban } from '@shared/domain/iban';
import {
  type GeoapifyKeyStatus,
  type SettingsFields,
  validateSettings,
} from '@shared/domain/settings';
import { AppException } from '@shared/ipc/errors';
import type { SecretStore } from '../secret-store';
import { SettingsEntity } from './entities/settings.entity';
import { unitOfWorkFor } from './unit-of-work';

export type { SettingsFields };

const SETTINGS_ID = 1;

/**
 * Reads the global settings (row `id = 1`, created by the first migration).
 * The API key deliberately is not part of it: it is only read in main via `readApiKey`.
 */
export async function getSettings(dataSource: DataSource): Promise<SettingsFields> {
  const row = await dataSource.getRepository(SettingsEntity).findOneBy({ id: SETTINGS_ID });
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

/** Writes the settings (validation takes place in the service). */
export async function saveSettings(
  dataSource: DataSource,
  settings: SettingsFields,
  now: string,
): Promise<void> {
  const errors = validateSettings(settings);
  if (errors.length > 0)
    throw new AppException('VALIDATION', 'Bitte die markierten Felder prüfen.', errors);
  const closing = settings.defaultClosingText;
  await unitOfWorkFor(dataSource).run((manager) =>
    manager.update(
      SettingsEntity,
      { id: SETTINGS_ID },
      {
        sender_name: settings.sender.name,
        sender_street: settings.sender.street,
        sender_house_no: settings.sender.houseNo,
        sender_zip: settings.sender.zip,
        sender_city: settings.sender.city,
        sender_country: settings.sender.country,
        sender_iban: normalizeIban(settings.sender.iban),
        invoice_prefix: settings.invoicePrefix,
        default_closing_text: closing === null || closing.trim() === '' ? null : closing,
        default_payment_days: settings.defaultPaymentDays,
        updated_at: now,
      },
    ),
  );
}

async function readKeyBlob(dataSource: DataSource): Promise<Buffer | null> {
  const row = await dataSource.getRepository(SettingsEntity).findOneBy({ id: SETTINGS_ID });
  return row?.geoapify_api_key ?? null;
}

/** Plain text of the API key, only in main. `null` if none is stored or it cannot be decrypted. */
export async function readApiKey(
  dataSource: DataSource,
  secrets: SecretStore,
): Promise<string | null> {
  const blob = await readKeyBlob(dataSource);
  if (blob === null) return null;
  const key = await secrets.decrypt(blob);
  return key !== null && key !== '' ? key : null;
}

/** Whether and in which state a key is stored (without revealing the key). */
export async function getKeyState(
  dataSource: DataSource,
  secrets: SecretStore,
): Promise<{ geoapifyKeySet: boolean; geoapifyKeyStatus: GeoapifyKeyStatus }> {
  const blob = await readKeyBlob(dataSource);
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
 * Sets (encrypted) or removes (`''`) the API key. Removing always works; setting requires available
 * encryption. Returns `false` if nothing was stored because no encryption is available.
 */
export async function writeApiKey(
  dataSource: DataSource,
  secrets: SecretStore,
  key: string,
): Promise<boolean> {
  if (key === '') {
    await unitOfWorkFor(dataSource).run((manager) =>
      manager.update(SettingsEntity, { id: SETTINGS_ID }, { geoapify_api_key: null }),
    );
    return true;
  }
  if (!(await secrets.isAvailable())) return false;
  const encrypted = await secrets.encrypt(key);
  await unitOfWorkFor(dataSource).run((manager) =>
    manager.update(SettingsEntity, { id: SETTINGS_ID }, { geoapify_api_key: encrypted }),
  );
  return true;
}
