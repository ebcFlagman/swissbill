import { join } from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import { z } from 'zod';
import { CHANNELS } from '../../shared/ipc/api';
import type { BackupResult, DbInfo } from '../../shared/ipc/db';
import type { BackupService } from '../services/backup-service';
import { handle } from './handle';

export function registerDbHandlers(service: BackupService): void {
  handle<undefined, DbInfo>(CHANNELS.dbInfo, z.undefined(), () => service.info());

  handle<undefined, BackupResult>(CHANNELS.dbBackup, z.undefined(), async () => {
    const today = new Date().toISOString().slice(0, 10);
    const options = {
      title: 'Datenbank sichern',
      defaultPath: join(app.getPath('documents'), `swissbill-sicherung-${today}.db`),
      filters: [{ name: 'SwissBill-Datenbank', extensions: ['db'] }],
    };
    const parent = BrowserWindow.getFocusedWindow() ?? undefined;
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { cancelled: true as const };
    await service.backup(result.filePath);
    return { path: result.filePath };
  });
}
