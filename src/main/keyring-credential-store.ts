import { AppException } from '@shared/ipc/errors';
import type { CredentialStore } from './credential-store';

const SERVICE = 'swissbill';
const ACCOUNT = 'db-connection';
const PROBE_ACCOUNT = 'availability-probe';

/** The part of the native keychain binding that is used (same shape as `Entry` of `@napi-rs/keyring`). */
export interface KeyringEntry {
  getPassword(): string | null;
  setPassword(password: string): void;
  deletePassword(): boolean;
}

export type EntryFactory = (service: string, account: string) => Promise<KeyringEntry>;

/** The native binding is loaded on first use, so a missing binary never affects users of the local database. */
const nativeEntry: EntryFactory = async (service, account) => {
  const { Entry } = await import('@napi-rs/keyring');
  return new Entry(service, account);
};

const UNAVAILABLE = new AppException(
  'KEYCHAIN_UNAVAILABLE',
  'Auf diesem Gerät ist kein Schlüsselbund verfügbar. Das Passwort kann deshalb nicht sicher gespeichert werden ' +
    '(unter Linux wird ein Dienst wie GNOME Keyring oder KWallet benötigt).',
);

/**
 * Keychain-backed password store. There is deliberately no fallback to a file or the database: without a
 * keychain, saving is refused (FR-007).
 */
export function createKeyringCredentialStore(
  newEntry: EntryFactory = nativeEntry,
): CredentialStore {
  return {
    async isAvailable() {
      try {
        const probe = await newEntry(SERVICE, PROBE_ACCOUNT);
        probe.setPassword('probe');
        const ok = probe.getPassword() === 'probe';
        probe.deletePassword();
        return ok;
      } catch {
        return false;
      }
    },
    async get() {
      try {
        return (await newEntry(SERVICE, ACCOUNT)).getPassword();
      } catch {
        return null;
      }
    },
    async set(password) {
      try {
        (await newEntry(SERVICE, ACCOUNT)).setPassword(password);
      } catch {
        throw UNAVAILABLE;
      }
    },
    async delete() {
      try {
        (await newEntry(SERVICE, ACCOUNT)).deletePassword();
      } catch {
        // no entry, or no keychain: nothing left to delete
      }
    },
  };
}

/**
 * For test runs only: memory store without the operating system. Never in the packaged app.
 * `SWISSBILL_CREDENTIAL_STORE_VALUE` presets the password (end-to-end tests of a server connection).
 */
function createMemoryCredentialStore(initial: string | null): CredentialStore {
  let value: string | null = initial;
  return {
    isAvailable: async () => true,
    get: async () => value,
    set: async (password) => {
      value = password;
    },
    delete: async () => {
      value = null;
    },
  };
}

export function createCredentialStore(
  env: NodeJS.ProcessEnv = process.env,
  packaged = false,
): CredentialStore {
  return !packaged && env['SWISSBILL_CREDENTIAL_STORE'] === 'memory'
    ? createMemoryCredentialStore(env['SWISSBILL_CREDENTIAL_STORE_VALUE'] ?? null)
    : createKeyringCredentialStore();
}
