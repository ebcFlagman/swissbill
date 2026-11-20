import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import { MENU_EVENT, type MenuAction } from '@shared/ipc/menu';
import { buildMenuTemplate } from './menu-template';

/** Sets the application menu (replaces the English default menu of Electron). */
export function installMenu(databasePath: string, serverDatabase = false): void {
  const send = (action: MenuAction) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    win?.webContents.send(MENU_EVENT, action);
  };

  const template = buildMenuTemplate({
    isDev: !app.isPackaged,
    send,
    showDatabaseFolder: () => shell.showItemInFolder(databasePath),
    serverDatabase,
    showAbout: () => {
      void dialog.showMessageBox({
        type: 'info',
        title: 'Über SwissBill',
        message: `SwissBill ${app.getVersion()}`,
        detail:
          'Schweizer QR-Rechnungen als PDF.\n\n' +
          `Datenbank: ${databasePath}\n` +
          `Electron ${process.versions.electron}, Chromium ${process.versions.chrome}`,
        buttons: ['OK'],
      });
    },
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
