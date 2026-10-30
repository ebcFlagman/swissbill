import type { Customer, CustomerInput } from '../domain/customer';
import type { DraftInput, Invoice, InvoiceFilter, InvoiceSummary } from '../domain/invoice';
import type { Settings } from '../domain/settings';
import type { CustomerIdInput, CustomerSearchInput } from './customers';
import type { BackupResult, DbInfo } from './db';
import type { Result } from './errors';
import type { MenuAction } from './menu';
import type { InvoiceIdInput, PdfRequest, PdfSaveResult } from './invoices';

/**
 * IPC-Vertrag zwischen Renderer und Main (siehe specs/001-swiss-qr-invoices/contracts/ipc-api.md).
 * Jede User Story ergänzt hier ihre Namensräume. Der Renderer erhält diese API als `window.swissbill`.
 */

export interface AppInfo {
  version: string;
  platform: string;
}

export interface SwissbillApi {
  app: {
    info(): Promise<Result<AppInfo>>;
  };
  invoices: {
    list(input: InvoiceFilter): Promise<Result<InvoiceSummary[]>>;
    createDraft(): Promise<Result<Invoice>>;
    saveDraft(input: DraftInput): Promise<Result<Invoice>>;
    get(input: InvoiceIdInput): Promise<Result<Invoice>>;
    issue(input: InvoiceIdInput): Promise<Result<Invoice>>;
    /** issued → paid */
    markPaid(input: InvoiceIdInput): Promise<Result<Invoice>>;
    /** paid → issued (Korrektur einer Fehlbuchung) */
    reopen(input: InvoiceIdInput): Promise<Result<Invoice>>;
    /** issued/paid → cancelled, endgültig; die Nummer bleibt vergeben */
    cancel(input: InvoiceIdInput): Promise<Result<Invoice>>;
    /** Nur Entwürfe (FR-021) */
    deleteDraft(input: InvoiceIdInput): Promise<Result<void>>;
    /** Neuer Entwurf aus einer bestehenden Rechnung (FR-009) */
    duplicate(input: InvoiceIdInput): Promise<Result<Invoice>>;
  };
  customers: {
    list(input: CustomerSearchInput): Promise<Result<Customer[]>>;
    /** Ohne id anlegen, mit id ändern */
    save(input: CustomerInput): Promise<Result<Customer>>;
    /** Bestehende Rechnungen bleiben unverändert */
    delete(input: CustomerIdInput): Promise<Result<void>>;
  };
  settings: {
    get(): Promise<Result<Settings>>;
    /** Wirkt nur auf neue Entwürfe */
    save(input: Settings): Promise<Result<Settings>>;
  };
  menu: {
    /** Meldet sich für Aktionen des Anwendungsmenüs an; liefert die Funktion zum Abmelden */
    onAction(callback: (action: MenuAction) => void): () => void;
  };
  db: {
    /** Speicherort, Grösse und Schemaversion der Datenbank (FR-016) */
    info(): Promise<Result<DbInfo>>;
    /** Sicherung als einzelne Datei über einen Speichern-Dialog im Main */
    backup(): Promise<Result<BackupResult>>;
  };
  pdf: {
    /** Speichern-Dialog im Main; schreibt das PDF aus der Momentaufnahme */
    save(input: PdfRequest): Promise<Result<PdfSaveResult>>;
    /** PDF als base64 für die Vorschau (Entwürfe mit Wasserzeichen, ohne Zahlteil) */
    preview(input: PdfRequest): Promise<Result<{ base64: string }>>;
    /** Öffnet das PDF im Standardprogramm zum Drucken */
    open(input: PdfRequest): Promise<Result<void>>;
  };
}

/** Kanalnamen: eine Quelle für Main (Handler) und Preload (Aufrufe). */
export const CHANNELS = {
  appInfo: 'app:info',
  invoicesList: 'invoices:list',
  invoicesCreateDraft: 'invoices:createDraft',
  invoicesSaveDraft: 'invoices:saveDraft',
  invoicesGet: 'invoices:get',
  invoicesIssue: 'invoices:issue',
  invoicesMarkPaid: 'invoices:markPaid',
  invoicesReopen: 'invoices:reopen',
  invoicesCancel: 'invoices:cancel',
  invoicesDeleteDraft: 'invoices:deleteDraft',
  invoicesDuplicate: 'invoices:duplicate',
  customersList: 'customers:list',
  customersSave: 'customers:save',
  customersDelete: 'customers:delete',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  dbInfo: 'db:info',
  dbBackup: 'db:backup',
  pdfSave: 'pdf:save',
  pdfPreview: 'pdf:preview',
  pdfOpen: 'pdf:open',
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
