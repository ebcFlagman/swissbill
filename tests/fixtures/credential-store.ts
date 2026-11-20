import { AppException } from '@shared/ipc/errors';
import type { CredentialStore } from '../../src/main/credential-store';

export interface FakeCredentialStore extends CredentialStore {
  /** Toggles the availability of the keychain. */
  available: boolean;
  /** The stored password (for assertions only). */
  value: string | null;
}

/** Test keychain without the operating system. */
export function createFakeCredentialStore(
  options: { available?: boolean; value?: string | null } = {},
): FakeCredentialStore {
  const store: FakeCredentialStore = {
    available: options.available ?? true,
    value: options.value ?? null,
    isAvailable: async () => store.available,
    get: async () => (store.available ? store.value : null),
    set: async (password) => {
      if (!store.available) {
        throw new AppException(
          'KEYCHAIN_UNAVAILABLE',
          'Auf diesem Gerät ist kein Schlüsselbund verfügbar.',
        );
      }
      store.value = password;
    },
    delete: async () => {
      store.value = null;
    },
  };
  return store;
}
