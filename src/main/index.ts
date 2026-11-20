import 'reflect-metadata';
import { join } from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import type { DataSource } from 'typeorm';
import { DB_FILENAME } from './db/data-source';
import { DatabaseStartupError, openAndMigrate } from './db/startup';
import { registerIpc } from './ipc/register';
import { initLogger, log } from './log';
import { installMenu } from './menu';
import { createMainWindow, hardenSession } from './window';

let dataSource: DataSource | null = null;
let databasePath = '';

async function startDatabase(): Promise<DataSource> {
  databasePath = join(app.getPath('userData'), DB_FILENAME);
  const database = await openAndMigrate(databasePath);
  log.info(`Datenbank geöffnet (${database.migrations.length} Migrationen)`);
  return database;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(async () => {
    initLogger(join(app.getPath('userData'), 'logs'));
    hardenSession();
    try {
      dataSource = await startDatabase();
    } catch (error) {
      log.error('Datenbank konnte nicht geöffnet werden', error);
      dialog.showErrorBox(
        'SwissBill kann nicht gestartet werden',
        error instanceof DatabaseStartupError
          ? error.message
          : 'Die Datenbank konnte nicht geöffnet werden. Es wurden keine Daten verändert.\n\n' +
              (error instanceof Error ? error.message : String(error)),
      );
      app.exit(1);
      return;
    }
    registerIpc(dataSource);
    installMenu(databasePath);
    createMainWindow();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('quit', () => {
    void dataSource?.destroy();
  });
}
