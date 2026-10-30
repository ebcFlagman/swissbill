import type { MenuItemConstructorOptions } from 'electron';
import type { MenuAction } from '../shared/ipc/menu';

export interface MenuDeps {
  /** Entwicklungsmodus: Neu laden und Entwicklerwerkzeuge anzeigen */
  isDev: boolean;
  /** Sendet eine Aktion an das Fenster im Vordergrund */
  send: (action: MenuAction) => void;
  showAbout: () => void;
  showDatabaseFolder: () => void;
}

/**
 * Deutsches Anwendungsmenü. Die Vorlage ist frei von Electron-Laufzeitcode und damit ohne Fenster testbar.
 * Die Standard-Bearbeitungsbefehle laufen über Rollen, damit Tastenkürzel und Zwischenablage überall funktionieren.
 */
export function buildMenuTemplate(deps: MenuDeps): MenuItemConstructorOptions[] {
  const { isDev, send } = deps;

  const view: MenuItemConstructorOptions[] = [
    // Die Hauptnavigation der Anwendung (kein Menü im Fenster)
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
        { id: 'help-db-folder', label: 'Datenbank-Ordner anzeigen', click: () => deps.showDatabaseFolder() },
        { type: 'separator' },
        { id: 'help-about', label: 'Über SwissBill', click: () => deps.showAbout() },
      ],
    },
  ];
}
