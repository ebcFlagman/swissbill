import { join } from 'node:path';
import { app, BrowserWindow, nativeTheme, session } from 'electron';
import { isAllowedRequest, readDevOrigin } from './request-filter';

export function hardenSession(): void {
  const devOrigin = readDevOrigin();
  const ses = session.defaultSession;
  ses.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedRequest(details.url, devOrigin) });
  });
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}

/** Seitenhintergrund passend zu `--page-bg` in styles.css (verhindert Aufblitzen vor dem ersten Rendern). */
function backgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? '#09090b' : '#f8fafc';
}

export function createMainWindow(): BrowserWindow {
  // Hell/Dunkel folgt dem System (Standardverhalten ausdrücklich festhalten)
  nativeTheme.themeSource = 'system';

  const win = new BrowserWindow({
    backgroundColor: backgroundColor(),
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'SwissBill',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // Entwicklerwerkzeuge nur im Entwicklungsmodus
      devTools: !app.isPackaged,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Wechselt das System zwischen hell und dunkel, folgt auch der Fensterhintergrund.
  const onThemeChanged = () => win.setBackgroundColor(backgroundColor());
  nativeTheme.on('updated', onThemeChanged);
  win.on('closed', () => nativeTheme.removeListener('updated', onThemeChanged));

  // Keine Navigation weg von der App und keine neuen Fenster.
  const devOrigin = readDevOrigin();
  win.webContents.on('will-navigate', (event, url) => {
    if (!(devOrigin && url.startsWith(devOrigin))) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (devOrigin) {
    void win.loadURL(devOrigin);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}
