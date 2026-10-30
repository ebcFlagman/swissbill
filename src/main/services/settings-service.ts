import type Database from 'better-sqlite3';
import { validateSettings, type Settings } from '../../shared/domain/settings';
import { AppException } from '../../shared/ipc/errors';
import { getSettings, saveSettings } from '../db/settings-repository';

export class SettingsService {
  constructor(
    private readonly db: Database.Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get(): Settings {
    return getSettings(this.db);
  }

  /** Speichert die Einstellungen. Sie wirken nur auf neue Entwürfe, nie auf bestehende Rechnungen. */
  save(settings: Settings): Settings {
    const errors = validateSettings(settings);
    if (errors.length > 0) {
      throw new AppException('VALIDATION', 'Bitte die markierten Felder prüfen.', errors);
    }
    saveSettings(this.db, settings, this.now().toISOString());
    return this.get();
  }
}
