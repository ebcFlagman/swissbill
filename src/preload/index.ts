import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type SwissbillApi } from '@shared/ipc/api';
import { isMenuAction, MENU_EVENT } from '@shared/ipc/menu';

/**
 * Narrow, typed API for the renderer. Only the channels listed here are exposed;
 * `ipcRenderer` itself is never exposed.
 */
const api: SwissbillApi = {
  app: {
    info: () => ipcRenderer.invoke(CHANNELS.appInfo),
    relaunch: () => ipcRenderer.invoke(CHANNELS.appRelaunch),
  },
  dbConnection: {
    get: () => ipcRenderer.invoke(CHANNELS.dbConnectionGet),
    test: (input) => ipcRenderer.invoke(CHANNELS.dbConnectionTest, input),
    save: (input) => ipcRenderer.invoke(CHANNELS.dbConnectionSave, input),
    pickCaFile: () => ipcRenderer.invoke(CHANNELS.dbConnectionPickCaFile),
    useLocalOnce: () => ipcRenderer.invoke(CHANNELS.dbConnectionUseLocalOnce),
    retry: () => ipcRenderer.invoke(CHANNELS.dbConnectionRetry),
  },
  locks: {
    acquire: (input) => ipcRenderer.invoke(CHANNELS.locksAcquire, input),
    heartbeat: (input) => ipcRenderer.invoke(CHANNELS.locksHeartbeat, input),
    release: (input) => ipcRenderer.invoke(CHANNELS.locksRelease, input),
  },
  invoices: {
    list: (input) => ipcRenderer.invoke(CHANNELS.invoicesList, input),
    createDraft: () => ipcRenderer.invoke(CHANNELS.invoicesCreateDraft),
    saveDraft: (input) => ipcRenderer.invoke(CHANNELS.invoicesSaveDraft, input),
    get: (input) => ipcRenderer.invoke(CHANNELS.invoicesGet, input),
    issue: (input) => ipcRenderer.invoke(CHANNELS.invoicesIssue, input),
    markPaid: (input) => ipcRenderer.invoke(CHANNELS.invoicesMarkPaid, input),
    reopen: (input) => ipcRenderer.invoke(CHANNELS.invoicesReopen, input),
    cancel: (input) => ipcRenderer.invoke(CHANNELS.invoicesCancel, input),
    deleteDraft: (input) => ipcRenderer.invoke(CHANNELS.invoicesDeleteDraft, input),
    duplicate: (input) => ipcRenderer.invoke(CHANNELS.invoicesDuplicate, input),
  },
  customers: {
    list: (input) => ipcRenderer.invoke(CHANNELS.customersList, input),
    save: (input) => ipcRenderer.invoke(CHANNELS.customersSave, input),
    delete: (input) => ipcRenderer.invoke(CHANNELS.customersDelete, input),
  },
  settings: {
    get: () => ipcRenderer.invoke(CHANNELS.settingsGet),
    save: (input) => ipcRenderer.invoke(CHANNELS.settingsSave, input),
  },
  addresses: {
    suggest: (input) => ipcRenderer.invoke(CHANNELS.addressesSuggest, input),
    testKey: (input) => ipcRenderer.invoke(CHANNELS.addressesTestKey, input),
  },
  menu: {
    onAction: (callback) => {
      const listener = (_event: unknown, action: unknown) => {
        if (isMenuAction(action)) callback(action);
      };
      ipcRenderer.on(MENU_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(MENU_EVENT, listener);
      };
    },
  },
  db: {
    info: () => ipcRenderer.invoke(CHANNELS.dbInfo),
    backup: () => ipcRenderer.invoke(CHANNELS.dbBackup),
  },
  pdf: {
    save: (input) => ipcRenderer.invoke(CHANNELS.pdfSave, input),
    preview: (input) => ipcRenderer.invoke(CHANNELS.pdfPreview, input),
    open: (input) => ipcRenderer.invoke(CHANNELS.pdfOpen, input),
  },
};

contextBridge.exposeInMainWorld('swissbill', api);
