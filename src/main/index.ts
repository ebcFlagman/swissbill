import 'reflect-metadata';
import { app, BrowserWindow } from 'electron';
import type { DataSource } from 'typeorm';
import { openActiveDatabase, openLocal, type ActiveDatabase } from './db/connect';
import type { LockRepository } from './db/lock-repository';
import { createCredentialStore } from './keyring-credential-store';
import { registerIpc, registerPreDatabaseIpc } from './ipc/register';
import { getLogger, initLogging } from './logging';
import { installMenu } from './menu';
import { createRecovery } from './recovery';
import { ConnectionService } from './services/connection-service';
import { createMainWindow, hardenSession } from './window';

const log = getLogger('app');
const dbLog = getLogger('db');

let dataSource: DataSource | null = null;
let locks: LockRepository | null = null;

process.on('uncaughtException', (error) => {
  log.error({ err: error }, 'Unbehandelter Fehler');
});
process.on('unhandledRejection', (reason) => {
  log.error({ err: reason }, 'Unbehandelte abgelehnte Zusage');
});

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
    initLogging(userData);
    log.info(`SwissBill ${app.getVersion()} gestartet (${process.platform})`);
    hardenSession();

    // A database is open: register the data channels, install the menu
    const onReady = (database: ActiveDatabase) => {
      dataSource = database.dataSource;
      dbLog.info(
        { dbKind: database.kind, migrations: database.dataSource.migrations.length },
        'Datenbank geöffnet',
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
      dbLog.error(
        { reason: recovery.state().startupError ?? '' },
        'Datenbank konnte nicht geöffnet werden',
      );
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
    log.info('SwissBill beendet');
    void dataSource?.destroy();
  });
}
