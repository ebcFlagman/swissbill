import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type SwissbillApi } from '../shared/ipc/api';
import { isMenuAction, MENU_EVENT } from '../shared/ipc/menu';

/**
 * Schmale, typisierte API für den Renderer. Es werden nur die hier aufgeführten Kanäle freigegeben;
 * `ipcRenderer` selbst wird nie exponiert.
 */
const api: SwissbillApi = {
  app: {
    info: () => ipcRenderer.invoke(CHANNELS.appInfo),
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
