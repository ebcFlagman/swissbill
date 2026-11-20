import type { MenuItemConstructorOptions } from 'electron';
import type { MenuAction } from '@shared/ipc/menu';

export interface MenuDeps {
  /** Development mode: reload and show developer tools */
  isDev: boolean;
  /** Sends an action to the foreground window */
  send: (action: MenuAction) => void;
  showAbout: () => void;
  showDatabaseFolder: () => void;
  /** A server database has no file to back up or show: those entries are disabled */
  serverDatabase?: boolean;
}

/**
 * German application menu. The template is free of Electron runtime code and thus testable without a window.
 * The standard edit commands use roles so that shortcuts and clipboard work everywhere.
 */
export function buildMenuTemplate(deps: MenuDeps): MenuItemConstructorOptions[] {
  const { isDev, send } = deps;

  const view: MenuItemConstructorOptions[] = [
    // The main navigation of the application (no menu in the window)
    {
      id: 'nav-invoices',
      label: 'Rechnungen',
      accelerator: 'CmdOrCtrl+1',
      click: () => send({ type: 'navigate', page: 'invoices' }),
    },
    {
      id: 'nav-customers',
      label: 'Kunden',
      accelerator: 'CmdOrCtrl+2',
      click: () => send({ type: 'navigate', page: 'customers' }),
    },
    {
      id: 'nav-settings',
      label: 'Einstellungen',
      accelerator: 'CmdOrCtrl+3',
      click: () => send({ type: 'navigate', page: 'settings' }),
    },
    { type: 'separator' },
    { label: 'Normale Grösse', role: 'resetZoom' },
    { label: 'Vergrössern', role: 'zoomIn' },
    { label: 'Verkleinern', role: 'zoomOut' },
    { type: 'separator' },
    { label: 'Vollbild', role: 'togglefullscreen' },
  ];
  if (isDev) {
    view.push(
      { type: 'separator' },
      { label: 'Neu laden', role: 'reload' },
      { label: 'Entwicklerwerkzeuge', role: 'toggleDevTools' },
    );
  }

  return [
    {
      label: 'Datei',
      submenu: [
        {
          id: 'file-new-invoice',
          label: 'Neue Rechnung',
          accelerator: 'CmdOrCtrl+N',
          click: () => send({ type: 'newInvoice' }),
        },
        { type: 'separator' },
        {
          id: 'file-backup',
          label: 'Datenbank sichern …',
          enabled: !deps.serverDatabase,
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => send({ type: 'backup' }),
        },
        { type: 'separator' },
        { label: 'Beenden', role: 'quit' },
      ],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { label: 'Rückgängig', role: 'undo' },
        { label: 'Wiederholen', role: 'redo' },
        { type: 'separator' },
        { label: 'Ausschneiden', role: 'cut' },
        { label: 'Kopieren', role: 'copy' },
        { label: 'Einfügen', role: 'paste' },
        { label: 'Alles auswählen', role: 'selectAll' },
      ],
    },
    { label: 'Ansicht', submenu: view },
    {
      label: 'Hilfe',
      submenu: [
        {
          id: 'help-db-folder',
          label: 'Datenbank-Ordner anzeigen',
          enabled: !deps.serverDatabase,
          click: () => deps.showDatabaseFolder(),
        },
        { type: 'separator' },
        { id: 'help-about', label: 'Über SwissBill', click: () => deps.showAbout() },
      ],
    },
  ];
}
