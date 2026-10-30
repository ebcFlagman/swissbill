import { z } from 'zod';
import { CHANNELS } from '../../shared/ipc/api';
import type { Settings } from '../../shared/domain/settings';
import { settingsSchema } from '../../shared/ipc/settings';
import type { SettingsService } from '../services/settings-service';
import { handle } from './handle';

export function registerSettingsHandlers(service: SettingsService): void {
  handle<undefined, Settings>(CHANNELS.settingsGet, z.undefined(), () => service.get());
  handle<Settings, Settings>(CHANNELS.settingsSave, settingsSchema, (input) => service.save(input));
}
