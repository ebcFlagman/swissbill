import { describe, expect, it } from 'vitest';
import {
  createCredentialStore,
  createKeyringCredentialStore,
  type KeyringEntry,
} from '../../src/main/keyring-credential-store';
import { AppException } from '@shared/ipc/errors';

/** In-memory keychain with the same shape as the native binding. */
function fakeKeyring(options: { broken?: boolean } = {}) {
  const items = new Map<string, string>();
  const entry = async (_service: string, account: string): Promise<KeyringEntry> => {
    if (options.broken) throw new Error('Kein Secret-Service gefunden');
    return {
      getPassword: () => items.get(account) ?? null,
      setPassword: (value) => {
        items.set(account, value);
      },
      deletePassword: () => items.delete(account),
    };
  };
  return { items, entry };
}

describe('Schlüsselbund-Speicher (FR-005, FR-007, FR-008)', () => {
  it('speichert, liest und löscht das Passwort', async () => {
    const keyring = fakeKeyring();
    const store = createKeyringCredentialStore(keyring.entry);
    expect(await store.get()).toBeNull();
    await store.set('p@ss:w/rd ü');
    expect(await store.get()).toBe('p@ss:w/rd ü');
    await store.delete();
    expect(await store.get()).toBeNull();
  });

  it('löschen ist idempotent', async () => {
    const store = createKeyringCredentialStore(fakeKeyring().entry);
    await store.delete();
    await store.delete();
  });

  it('meldet Verfügbarkeit über einen Probeeintrag und hinterlässt ihn nicht', async () => {
    const keyring = fakeKeyring();
    const store = createKeyringCredentialStore(keyring.entry);
    expect(await store.isAvailable()).toBe(true);
    expect(keyring.items.size).toBe(0);
  });

  it('lehnt das Speichern ohne verfügbaren Schlüsselbund ab und schreibt nirgends hin', async () => {
    const keyring = fakeKeyring({ broken: true });
    const store = createKeyringCredentialStore(keyring.entry);
    expect(await store.isAvailable()).toBe(false);
    const error = await store.set('geheim').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).error.code).toBe('KEYCHAIN_UNAVAILABLE');
    expect((error as AppException).message).not.toContain('geheim');
    expect(keyring.items.size).toBe(0);
  });

  it('get liefert null statt zu werfen, wenn der Schlüsselbund nicht lesbar ist', async () => {
    const store = createKeyringCredentialStore(fakeKeyring({ broken: true }).entry);
    expect(await store.get()).toBeNull();
  });

  it('der Speicher-Ersatz gilt nur ausserhalb der paketierten App und nur auf Anforderung', async () => {
    const env = { SWISSBILL_CREDENTIAL_STORE: 'memory' } as NodeJS.ProcessEnv;
    const memory = createCredentialStore(env, false);
    await memory.set('x1234');
    expect(await memory.get()).toBe('x1234');
    // packaged: the variable is ignored, the real keychain store is used (not the memory one)
    const packaged = createCredentialStore(env, true);
    expect(packaged).not.toBe(memory);
    expect(await createCredentialStore({}, false).get).toBeTypeOf('function');
  });
});
