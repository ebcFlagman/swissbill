/**
 * Storage of the database password in the operating system's keychain (Windows Credential Manager,
 * macOS Keychain, Linux Secret Service). Contract: specs/006-additional-database-types/contracts/credential-store.md
 *
 * The interface imports nothing from `electron` or a native module so that it stays replaceable in tests;
 * the implementation is in `keyring-credential-store.ts`. There is no fallback to files or the database.
 */
export interface CredentialStore {
  /** Does a keychain work on this device? (a probe entry is written, read and deleted) */
  isAvailable(): Promise<boolean>;
  /** The password, or `null` if there is no entry or it cannot be read. */
  get(): Promise<string | null>;
  /** Throws `AppException('KEYCHAIN_UNAVAILABLE')` without a keychain; never writes anywhere else. */
  set(password: string): Promise<void>;
  /** Idempotent: no entry is not an error. */
  delete(): Promise<void>;
}
