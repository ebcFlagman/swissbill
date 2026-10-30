import { join } from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import type Database from 'better-sqlite3';
import { DB_FILENAME } from './db/connection';
import { DatabaseStartupError, openAndMigrate } from './db/startup';
import { registerIpc } from './ipc/register';
import { initLogger, log } from './log';
import { installMenu } from './menu';
import { createMainWindow, hardenSession } from './window';

let db: Database.Database | null = null;

function startDatabase(): Database.Database {
  const path = join(app.getPath('userData'), DB_FILENAME);
  const database = openAndMigrate(path);
  log.info(`Datenbank geöffnet (Version ${database.pragma('user_version', { simple: true })})`);
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

  void app.whenReady().then(() => {
    initLogger(join(app.getPath('userData'), 'logs'));
    hardenSession();
    try {
      db = startDatabase();
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
    registerIpc(db);
    installMenu(db.name);
    createMainWindow();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('quit', () => {
    db?.close();
  });
}
