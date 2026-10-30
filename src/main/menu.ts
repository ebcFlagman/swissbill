import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import { MENU_EVENT, type MenuAction } from '../shared/ipc/menu';
import { buildMenuTemplate } from './menu-template';

/** Setzt das Anwendungsmenü (ersetzt das englische Standardmenü von Electron). */
export function installMenu(databasePath: string): void {
  const send = (action: MenuAction) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    win?.webContents.send(MENU_EVENT, action);
  };

  const template = buildMenuTemplate({
    isDev: !app.isPackaged,
    send,
    showDatabaseFolder: () => shell.showItemInFolder(databasePath),
    showAbout: () => {
      void dialog.showMessageBox({
        type: 'info',
        title: 'Über SwissBill',
        message: `SwissBill ${app.getVersion()}`,
        detail:
          'Schweizer QR-Rechnungen als PDF, lokal und offline.\n\n' +
          `Datenbank: ${databasePath}\n` +
          `Electron ${process.versions.electron}, Chromium ${process.versions.chrome}`,
        buttons: ['OK'],
      });
    },
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
