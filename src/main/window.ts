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

/** Page background matching `--page-bg` in styles.css (prevents a flash before the first render). */
function backgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? '#09090b' : '#f8fafc';
}

export function createMainWindow(): BrowserWindow {
  // Light/dark follows the system (explicitly record the default behavior)
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
      // Developer tools only in development mode
      devTools: !app.isPackaged,
    },
  });

  win.once('ready-to-show', () => win.show());

  // When the system switches between light and dark, the window background follows too.
  const onThemeChanged = () => win.setBackgroundColor(backgroundColor());
  nativeTheme.on('updated', onThemeChanged);
  win.on('closed', () => nativeTheme.removeListener('updated', onThemeChanged));

  // No navigation away from the app and no new windows.
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
