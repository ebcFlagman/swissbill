import {
  isServerType,
  validateConnection,
  type DbConnectionSettings,
} from '@shared/domain/db-connection';
import type {
  DbConnectionInput,
  DbConnectionState,
  DbConnectionTestResult,
} from '@shared/ipc/db-connection';
import { AppException, type FieldError } from '@shared/ipc/errors';
import type { CredentialStore } from '../credential-store';
import {
  readConnectionConfig,
  removeConnectionConfig,
  writeConnectionConfig,
  type ConnectionAuth,
  type ConnectionConfigResult,
} from '../db/connection-config';
import { checkCaFile } from '../db/ca-file';
import { testConnection } from '../db/connect';
import { redactFromLogs } from '../log';

export const PASSWORD_MAX = 256;

export interface ConnectionServiceDeps {
  /** The Electron `userData` folder (holds `db-connection.json`) */
  dir: string;
  credentials: CredentialStore;
  /** What the app is currently running with */
  active: () => DbConnectionState['active'];
  /** Why the database could not be opened (recovery mode), else `null` */
  startupError?: () => string | null;
  /** Trial connection (replaceable in tests) */
  testConnection?: (
    settings: DbConnectionSettings,
    password: string | null,
  ) => Promise<DbConnectionTestResult>;
}

function configErrorMessage(result: ConnectionConfigResult): string | null {
  if (result.kind === 'unsupported-version') {
    return (
      `Die Verbindungsdatei (db-connection.json) stammt aus einer neueren Programmversion (Version ${result.version}). ` +
      'Bitte die Anwendung aktualisieren.'
    );
  }
  if (result.kind === 'invalid') {
    return 'Die Verbindungsdatei (db-connection.json) ist beschädigt. Bitte die Verbindung in den Einstellungen neu eingeben.';
  }
  return null;
}

/**
 * Settings and password of the database connection. The password only ever goes renderer → main → OS
 * keychain: it is never written to a file or the database, never logged and never sent back (FR-005).
 */
export class ConnectionService {
  constructor(private readonly deps: ConnectionServiceDeps) {}

  async getState(): Promise<DbConnectionState> {
    const config = readConnectionConfig(this.deps.dir);
    const keychainAvailable = await this.deps.credentials.isAvailable();
    const stored = config.kind === 'ok' ? (await this.deps.credentials.get()) !== null : false;
    return {
      settings: config.kind === 'ok' ? config.settings : null,
      passwordStored: stored,
      passwordMissing: config.kind === 'ok' && config.auth === 'keychain' && !stored,
      keychainAvailable,
      configError: configErrorMessage(config),
      active: this.deps.active(),
      startupError: this.deps.startupError?.() ?? null,
    };
  }

  /** The renderer only names the CA file; main checks that it is a readable PEM certificate. */
  private checkCa(settings: DbConnectionSettings, fields: FieldError[]): void {
    if (!isServerType(settings.type) || !settings.tls.enabled || settings.tls.caPath === null) {
      return;
    }
    const problem = checkCaFile(settings.tls.caPath);
    if (problem) fields.push({ field: 'tls.caPath', message: problem });
  }

  /** Validates and stores the connection; takes effect after a restart (FR-014). */
  async save(input: DbConnectionInput): Promise<{ restartRequired: true }> {
    const { settings, password } = input;
    const fields = validateConnection(settings);
    this.checkCa(settings, fields);
    if (
      password.action === 'set' &&
      (password.value === '' || password.value.length > PASSWORD_MAX)
    ) {
      fields.push({
        field: 'password',
        message:
          password.value === ''
            ? 'Das Passwort darf nicht leer sein. Zum Entfernen «Passwort entfernen» wählen.'
            : `Das Passwort darf höchstens ${PASSWORD_MAX} Zeichen lang sein.`,
      });
    }
    if (fields.length > 0) {
      throw new AppException('VALIDATION', 'Bitte die markierten Felder prüfen.', fields);
    }

    // Switching to the local database: nothing of the server connection stays behind
    if (!isServerType(settings.type)) {
      removeConnectionConfig(this.deps.dir);
      await this.deps.credentials.delete();
      return { restartRequired: true };
    }

    const existing = readConnectionConfig(this.deps.dir);
    let auth: ConnectionAuth = existing.kind === 'ok' ? existing.auth : 'none';
    if (password.action === 'set') {
      if (!(await this.deps.credentials.isAvailable())) {
        throw new AppException(
          'KEYCHAIN_UNAVAILABLE',
          'Auf diesem Gerät ist kein Schlüsselbund verfügbar. Das Passwort kann deshalb nicht sicher gespeichert werden.',
        );
      }
      // First the password: if the keychain refuses, nothing else is written
      await this.deps.credentials.set(password.value);
      redactFromLogs(password.value);
      auth = 'keychain';
    } else if (password.action === 'remove') {
      await this.deps.credentials.delete();
      auth = 'none';
    }
    writeConnectionConfig(this.deps.dir, settings, auth);
    return { restartRequired: true };
  }

  /**
   * Trial connection with the entered settings. A newly typed password is used as is; otherwise the stored one
   * (`keep`), or none (`remove`). Nothing is stored and the database is not changed.
   */
  async test(input: DbConnectionInput): Promise<DbConnectionTestResult> {
    const fields = validateConnection(input.settings);
    this.checkCa(input.settings, fields);
    if (fields.length > 0) {
      throw new AppException('VALIDATION', 'Bitte die markierten Felder prüfen.', fields);
    }
    let password: string | null = null;
    if (input.password.action === 'set') password = input.password.value;
    else if (input.password.action === 'keep') {
      const existing = readConnectionConfig(this.deps.dir);
      password =
        existing.kind === 'ok' && existing.auth === 'keychain'
          ? await this.resolvePassword()
          : null;
    }
    const run = this.deps.testConnection ?? testConnection;
    return run(input.settings, password);
  }

  /** The password for connecting, only for the main process. `null` if there is none. */
  async resolvePassword(): Promise<string | null> {
    const password = await this.deps.credentials.get();
    if (password !== null) redactFromLogs(password);
    return password;
  }
}
