import { app, safeStorage } from 'electron';
import type { SecretStore } from './secret-store';

/** Verschlüsselung über das Betriebssystem (Windows DPAPI, macOS Keychain, Linux Schlüsselbund). */
export const electronSecretStore: SecretStore = {
  isAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
  encrypt: (text) => safeStorage.encryptStringAsync(text),
  decrypt: async (data) => {
    try {
      return (await safeStorage.decryptStringAsync(data)).result;
    } catch {
      return null;
    }
  },
};

/** Nur für Testläufe: Speicher-Store ohne Betriebssystem. Nie in der verpackten App. */
const memoryStore: SecretStore = {
  isAvailable: async () => true,
  encrypt: async (text) => Buffer.from(`mem:${Buffer.from(text, 'utf8').toString('base64')}`, 'utf8'),
  decrypt: async (data) => {
    const value = data.toString('utf8');
    return value.startsWith('mem:') ? Buffer.from(value.slice(4), 'base64').toString('utf8') : null;
  },
};

export function createSecretStore(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = app.isPackaged,
): SecretStore {
  return !packaged && env['SWISSBILL_SECRET_STORE'] === 'memory' ? memoryStore : electronSecretStore;
}
