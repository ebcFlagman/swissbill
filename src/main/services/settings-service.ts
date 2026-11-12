import type Database from 'better-sqlite3';
import {
  normalizeApiKey,
  validateSettings,
  type Settings,
  type SettingsInput,
} from '../../shared/domain/settings';
import { AppException } from '../../shared/ipc/errors';
import { getKeyState, getSettings, saveSettings, writeApiKey } from '../db/settings-repository';
import type { SecretStore } from '../secret-store';

export class SettingsService {
  constructor(
    private readonly db: Database.Database,
    private readonly secrets: SecretStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Die Einstellungen ohne den API-Key, nur mit `geoapifyKeySet` und dem Zustand. */
  async get(): Promise<Settings> {
    return { ...getSettings(this.db), ...(await getKeyState(this.db, this.secrets)) };
  }

  /** Speichert die Einstellungen. Sie wirken nur auf neue Entwürfe, nie auf bestehende Rechnungen. */
  async save(input: SettingsInput): Promise<Settings> {
    const errors = validateSettings(input);
    if (errors.length > 0) {
      throw new AppException('VALIDATION', 'Bitte die markierten Felder prüfen.', errors);
    }
    const { geoapifyApiKey, ...fields } = input;
    saveSettings(this.db, fields, this.now().toISOString());
    // nicht angegeben = Key unverändert; '' = entfernen (immer möglich); sonst verschlüsselt setzen
    if (geoapifyApiKey !== undefined) await writeApiKey(this.db, this.secrets, normalizeApiKey(geoapifyApiKey));
    return this.get();
  }
}
