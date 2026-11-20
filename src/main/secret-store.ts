import type { DbType } from '@shared/domain/db-connection';

/**
 * Storage of small secrets (here: the Geoapify API key) in encrypted form.
 * The interface deliberately imports nothing from `electron` so that it stays replaceable in tests;
 * the implementation via the operating system is in `electron-secret-store.ts`.
 * All operations are asynchronous because the non-deprecated Electron functions are.
 */
export interface SecretStore {
  /** Is encryption available on this device? */
  isAvailable(): Promise<boolean>;
  encrypt(text: string): Promise<Buffer>;
  /** Plain text or `null` if the value cannot be decrypted (other device/user, corrupt). */
  decrypt(data: Buffer): Promise<string | null>;
}

/**
 * Key storage for a server database (feature 006): the Geoapify key is stored as plain UTF-8 bytes so that all
 * devices sharing the database can read it. (A key encrypted by one device's operating system could not be read
 * by another device.) The database password is a different thing and never goes here.
 */
export const sharedSecretStore: SecretStore = {
  isAvailable: async () => true,
  encrypt: async (text) => Buffer.from(text, 'utf8'),
  decrypt: async (data) => data.toString('utf8'),
};

/**
 * The store for a database: local SQLite keeps the device-bound encryption `local`, server databases use the
 * shared plain store (FR-006a).
 */
export function secretStoreFor(dbType: DbType, local: SecretStore): SecretStore {
  return dbType === 'sqlite' ? local : sharedSecretStore;
}
