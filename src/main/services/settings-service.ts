import type { DataSource } from 'typeorm';
import {
  normalizeApiKey,
  validateSettings,
  type Settings,
  type SettingsInput,
} from '@shared/domain/settings';
import { AppException } from '@shared/ipc/errors';
import { getKeyState, getSettings, saveSettings, writeApiKey } from '../db/settings-repository';
import { redactFromLogs } from '../logging';
import type { SecretStore } from '../secret-store';

export class SettingsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly secrets: SecretStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The settings without the API key, only with `geoapifyKeySet` and the state. */
  async get(): Promise<Settings> {
    return {
      ...(await getSettings(this.dataSource)),
      ...(await getKeyState(this.dataSource, this.secrets)),
    };
  }

  /** Saves the settings. They only affect new drafts, never existing invoices. */
  async save(input: SettingsInput): Promise<Settings> {
    const errors = validateSettings(input);
    if (errors.length > 0) {
      throw new AppException('VALIDATION', 'Bitte die markierten Felder prüfen.', errors);
    }
    const { geoapifyApiKey, ...fields } = input;
    await saveSettings(this.dataSource, fields, this.now().toISOString());
    // not specified = key unchanged; '' = remove (always possible); otherwise set encrypted
    if (geoapifyApiKey !== undefined) {
      const key = normalizeApiKey(geoapifyApiKey);
      redactFromLogs(key);
      await writeApiKey(this.dataSource, this.secrets, key);
    }
    return this.get();
  }
}
