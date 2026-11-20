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
