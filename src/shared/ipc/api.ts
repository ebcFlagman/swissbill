import type { Customer, CustomerInput } from '../domain/customer';
import type { DraftInput, Invoice, InvoiceFilter, InvoiceSummary } from '../domain/invoice';
import type { Settings, SettingsInput } from '../domain/settings';
import type { CustomerIdInput, CustomerSearchInput } from './customers';
import type { KeyCheckResult, SuggestInput, SuggestResult, TestKeyInput } from './addresses';
import type { BackupResult, DbInfo } from './db';
import type {
  AcquireLockResult,
  DbConnectionInput,
  DbConnectionState,
  DbConnectionTestResult,
  EditLockKey,
  PickCaFileResult,
} from './db-connection';
import type { Result } from './errors';
import type { LogLevelState, ReportInput, SetLevelInput } from './log';
import type { MenuAction } from './menu';
import type { InvoiceIdInput, PdfRequest, PdfSaveResult } from './invoices';

/**
 * IPC contract between renderer and main (see specs/001-swiss-qr-invoices/contracts/ipc-api.md).
 * Each user story adds its namespaces here. The renderer receives this API as `window.swissbill`.
 */

export interface AppInfo {
  version: string;
  platform: string;
}

export interface SwissbillApi {
  app: {
    info(): Promise<Result<AppInfo>>;
    /** Restarts the application (after the database connection was changed) */
    relaunch(): Promise<Result<void>>;
  };
  /** Database connection (available before the database is open, also in recovery mode) */
  dbConnection: {
    get(): Promise<Result<DbConnectionState>>;
    /** Trial connection, changes nothing */
    test(input: DbConnectionInput): Promise<Result<DbConnectionTestResult>>;
    /** Stores settings and password (OS keychain); takes effect after a restart */
    save(input: DbConnectionInput): Promise<Result<{ restartRequired: true }>>;
    /** Dialog in main to choose a CA certificate file */
    pickCaFile(): Promise<Result<PickCaFileResult>>;
    /** Recovery mode only: start this session with the local database */
    useLocalOnce(): Promise<Result<void>>;
    /** Recovery mode only: try to connect again */
    retry(): Promise<Result<void>>;
  };
  /** Logging (available before the database is open, also in recovery mode) */
  log: {
    /** Log level of this device */
    getLevel(): Promise<Result<LogLevelState>>;
    /** Stores the level on this device and applies it immediately */
    setLevel(input: SetLevelInput): Promise<Result<LogLevelState>>;
    /** Reports an unexpected error of the user interface; the main process writes it to the log */
    report(input: ReportInput): Promise<Result<void>>;
  };
  /** Edit locks of a server database (no-op for the local database) */
  locks: {
    acquire(input: EditLockKey): Promise<Result<AcquireLockResult>>;
    heartbeat(input: EditLockKey): Promise<Result<{ held: boolean }>>;
    release(input: EditLockKey): Promise<Result<void>>;
  };
  invoices: {
    list(input: InvoiceFilter): Promise<Result<InvoiceSummary[]>>;
    createDraft(): Promise<Result<Invoice>>;
    saveDraft(input: DraftInput): Promise<Result<Invoice>>;
    get(input: InvoiceIdInput): Promise<Result<Invoice>>;
    issue(input: InvoiceIdInput): Promise<Result<Invoice>>;
    /** issued → paid */
    markPaid(input: InvoiceIdInput): Promise<Result<Invoice>>;
    /** paid → issued (correction of a wrong booking) */
    reopen(input: InvoiceIdInput): Promise<Result<Invoice>>;
    /** issued/paid → cancelled, final; the number stays assigned */
    cancel(input: InvoiceIdInput): Promise<Result<Invoice>>;
    /** Drafts only (FR-021) */
    deleteDraft(input: InvoiceIdInput): Promise<Result<void>>;
    /** New draft from an existing invoice (FR-009) */
    duplicate(input: InvoiceIdInput): Promise<Result<Invoice>>;
  };
  customers: {
    list(input: CustomerSearchInput): Promise<Result<Customer[]>>;
    /** Create without id, change with id */
    save(input: CustomerInput): Promise<Result<Customer>>;
    /** Existing invoices stay unchanged */
    delete(input: CustomerIdInput): Promise<Result<void>>;
  };
  settings: {
    get(): Promise<Result<Settings>>;
    /** Only affects new drafts */
    save(input: SettingsInput): Promise<Result<Settings>>;
  };
  addresses: {
    /** Address suggestions (only with a stored Geoapify key, otherwise `disabled`); the key stays in main */
    suggest(input: SuggestInput): Promise<Result<SuggestResult>>;
    /** Checks a not yet stored key with a test request */
    testKey(input: TestKeyInput): Promise<Result<KeyCheckResult>>;
  };
  menu: {
    /** Subscribes to application menu actions; returns the function to unsubscribe */
    onAction(callback: (action: MenuAction) => void): () => void;
  };
  db: {
    /** Location, size and schema version of the database (FR-016) */
    info(): Promise<Result<DbInfo>>;
    /** Backup as a single file via a save dialog in main */
    backup(): Promise<Result<BackupResult>>;
  };
  pdf: {
    /** Save dialog in main; writes the PDF from the snapshot */
    save(input: PdfRequest): Promise<Result<PdfSaveResult>>;
    /** PDF as base64 for the preview (drafts with watermark, without payment part) */
    preview(input: PdfRequest): Promise<Result<{ base64: string }>>;
    /** Opens the PDF in the default program for printing */
    open(input: PdfRequest): Promise<Result<void>>;
  };
}

/** Channel names: one source for main (handlers) and preload (calls). */
export const CHANNELS = {
  appInfo: 'app:info',
  appRelaunch: 'app:relaunch',
  dbConnectionGet: 'dbConnection:get',
  dbConnectionTest: 'dbConnection:test',
  dbConnectionSave: 'dbConnection:save',
  dbConnectionPickCaFile: 'dbConnection:pickCaFile',
  dbConnectionUseLocalOnce: 'dbConnection:useLocalOnce',
  dbConnectionRetry: 'dbConnection:retry',
  logGetLevel: 'log:getLevel',
  logSetLevel: 'log:setLevel',
  logReport: 'log:report',
  locksAcquire: 'locks:acquire',
  locksHeartbeat: 'locks:heartbeat',
  locksRelease: 'locks:release',
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
  addressesSuggest: 'addresses:suggest',
  addressesTestKey: 'addresses:testKey',
  dbInfo: 'db:info',
  dbBackup: 'db:backup',
  pdfSave: 'pdf:save',
  pdfPreview: 'pdf:preview',
  pdfOpen: 'pdf:open',
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
