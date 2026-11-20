import type { SecretStore } from '../../src/main/secret-store';

export interface FakeSecretStore extends SecretStore {
  /** Toggles the availability of the encryption. */
  available: boolean;
  /** Simulates another device/user: stored values can no longer be decrypted. */
  broken: boolean;
}

const PREFIX = 'FAKE-ENC:';

/** Test store without Electron: "encrypts" reversibly, but the plain text is not readable in the result. */
export function createFakeSecretStore(
  options: { available?: boolean; broken?: boolean } = {},
): FakeSecretStore {
  const store: FakeSecretStore = {
    available: options.available ?? true,
    broken: options.broken ?? false,
    isAvailable: async () => store.available,
    encrypt: async (text) => {
      const scrambled = Buffer.from(text, 'utf8').reverse().toString('base64');
      return Buffer.from(PREFIX + scrambled, 'utf8');
    },
    decrypt: async (data) => {
      if (store.broken) return null;
      const value = data.toString('utf8');
      if (!value.startsWith(PREFIX)) return null;
      return Buffer.from(Buffer.from(value.slice(PREFIX.length), 'base64').reverse()).toString(
        'utf8',
      );
    },
  };
  return store;
}
