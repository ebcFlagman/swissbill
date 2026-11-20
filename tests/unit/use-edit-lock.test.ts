import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcquireLockResult, EditLockKey } from '@shared/ipc/db-connection';
import { err, ok, type Result } from '@shared/ipc/errors';
import {
  createEditLockSession,
  HEARTBEAT_MS,
  type LockApi,
  type LockSnapshot,
} from '../../src/renderer/lib/use-edit-lock';

const key: EditLockKey = { entityType: 'invoice', entityId: 7 };

function fakeApi(
  options: {
    acquire?: Result<AcquireLockResult>;
    heartbeat?: () => Result<{ held: boolean }>;
  } = {},
) {
  const calls: string[] = [];
  const api: LockApi = {
    acquire: async () => {
      calls.push('acquire');
      return options.acquire ?? ok({ acquired: true });
    },
    heartbeat: async () => {
      calls.push('heartbeat');
      return options.heartbeat?.() ?? ok({ held: true });
    },
    release: async () => {
      calls.push('release');
      return ok(undefined);
    },
  };
  return { api, calls };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Bearbeitungssperre im Editor (FR-009a)', () => {
  it('sperrt beim Öffnen, sendet jede Minute ein Lebenszeichen und gibt beim Schliessen frei', async () => {
    const { api, calls } = fakeApi();
    const snapshots: LockSnapshot[] = [];
    const session = createEditLockSession(api, key, (s) => snapshots.push(s));
    session.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshots.at(-1)).toEqual({ status: 'held', ownerLabel: null });

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);
    expect(calls).toEqual(['acquire', 'heartbeat', 'heartbeat']);

    await session.stop();
    expect(calls.at(-1)).toBe('release');
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    expect(calls.filter((c) => c === 'heartbeat')).toHaveLength(2); // timer stopped
  });

  it('speichert noch ausstehende Eingaben, bevor die Sperre freigegeben wird', async () => {
    const { api, calls } = fakeApi();
    const session = createEditLockSession(api, key, () => undefined, {
      flush: async () => {
        calls.push('flush');
      },
    });
    session.start();
    await vi.advanceTimersByTimeAsync(0);
    await session.stop();
    expect(calls).toEqual(['acquire', 'flush', 'release']);
  });

  it('ist der Datensatz belegt, bleibt er schreibgeschützt: Besitzer wird gemeldet, nichts wird freigegeben', async () => {
    const { api, calls } = fakeApi({ acquire: ok({ acquired: false, ownerLabel: 'Rechner B' }) });
    const snapshots: LockSnapshot[] = [];
    const session = createEditLockSession(api, key, (s) => snapshots.push(s), {
      flush: async () => {
        calls.push('flush');
      },
    });
    session.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshots.at(-1)).toEqual({ status: 'readonly', ownerLabel: 'Rechner B' });
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    await session.stop();
    expect(calls).toEqual(['acquire']); // no heartbeat, no flush, no release
  });

  it('meldet verlorene Sperre, wenn der Heartbeat ablehnt, und hört auf zu senden', async () => {
    const { api, calls } = fakeApi({ heartbeat: () => ok({ held: false }) });
    const snapshots: LockSnapshot[] = [];
    const session = createEditLockSession(api, key, (s) => snapshots.push(s), {
      flush: async () => {
        calls.push('flush');
      },
    });
    session.start();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(snapshots.at(-1)).toEqual({ status: 'lost', ownerLabel: null });
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    expect(calls.filter((c) => c === 'heartbeat')).toHaveLength(1);
    await session.stop();
    expect(calls).not.toContain('flush'); // saving would only be refused
  });

  it('ein Übertragungsfehler beim Heartbeat hebt die Sperre nicht auf (nächster Versuch folgt)', async () => {
    let n = 0;
    const { api } = fakeApi({
      heartbeat: () => (++n === 1 ? err('DB', 'Fehler') : ok({ held: true })),
    });
    const snapshots: LockSnapshot[] = [];
    createEditLockSession(api, key, (s) => snapshots.push(s)).start();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);
    expect(snapshots.at(-1)?.status).toBe('held');
  });

  it('ein Fehler beim Sperren (z. B. Server weg) lässt den Datensatz schreibgeschützt', async () => {
    const { api } = fakeApi({ acquire: err('IO', 'Keine Verbindung') });
    const snapshots: LockSnapshot[] = [];
    createEditLockSession(api, key, (s) => snapshots.push(s)).start();
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshots.at(-1)).toEqual({ status: 'readonly', ownerLabel: null });
  });

  it('wird stop() vor der Antwort auf das Sperren aufgerufen, wird danach sofort freigegeben', async () => {
    const { api, calls } = fakeApi();
    const session = createEditLockSession(api, key, () => undefined);
    session.start();
    await session.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['acquire', 'release']);
  });
});
