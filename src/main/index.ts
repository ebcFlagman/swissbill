import 'reflect-metadata';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import type { DataSource } from 'typeorm';
import { openActiveDatabase, openLocal, type ActiveDatabase } from './db/connect';
import type { LockRepository } from './db/lock-repository';
import { createCredentialStore } from './keyring-credential-store';
import { registerIpc, registerPreDatabaseIpc } from './ipc/register';
import { initLogger, log } from './log';
import { installMenu } from './menu';
import { createRecovery } from './recovery';
import { ConnectionService } from './services/connection-service';
import { createMainWindow, hardenSession } from './window';

let dataSource: DataSource | null = null;
let locks: LockRepository | null = null;

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
    const userData = app.getPath('userData');
    initLogger(join(userData, 'logs'));
    hardenSession();

    // A database is open: register the data channels, install the menu
    const onReady = (database: ActiveDatabase) => {
      dataSource = database.dataSource;
      log.info(
        `Datenbank geöffnet (${database.kind}, ${database.dataSource.migrations.length} Migrationen)`,
      );
      locks = registerIpc(database.dataSource, database.adapter);
      installMenu(database.place, database.kind === 'server');
      // In recovery mode the window already exists and shows the recovery view; the renderer reloads itself
    };

    const connection: ConnectionService = new ConnectionService({
      dir: userData,
      credentials: createCredentialStore(process.env, app.isPackaged),
      active: () => recovery.state().active,
      startupError: () => recovery.state().startupError,
    });
    const recovery = createRecovery({
      open: () =>
        openActiveDatabase({ dir: userData, resolvePassword: () => connection.resolvePassword() }),
      openLocal: () => openLocal(userData),
      onReady,
    });

    // The connection settings and the recovery actions work without a database
    registerPreDatabaseIpc(connection, recovery);
    await recovery.start();
    if (recovery.state().active === 'recovery') {
      log.error(`Datenbank konnte nicht geöffnet werden: ${recovery.state().startupError ?? ''}`);
    }
    createMainWindow();
  });

  // Give the edit locks of this device back before leaving (they would also expire on their own)
  app.on('window-all-closed', () => {
    void (locks?.releaseAll() ?? Promise.resolve())
      .catch(() => undefined)
      .finally(() => app.quit());
  });

  app.on('quit', () => {
    void dataSource?.destroy();
  });
}
