import { useEffect, useRef, useState } from 'react';
import type { AcquireLockResult, EditEntityType, EditLockKey } from '@shared/ipc/db-connection';
import type { Result } from '@shared/ipc/errors';

/** A device sends a sign of life this often; the server drops the lock after 5 minutes without one. */
export const HEARTBEAT_MS = 60_000;

/**
 * - `off`: no lock needed (local database, new record, issued invoice)
 * - `pending`: locking in progress
 * - `held`: this device may edit
 * - `readonly`: another device edits (or the lock could not be taken): view only
 * - `lost`: the lock expired or was taken over: unsaved input can no longer be saved
 */
export type LockStatus = 'off' | 'pending' | 'held' | 'readonly' | 'lost';

export interface LockSnapshot {
  status: LockStatus;
  /** Name of the device that holds the lock (only for `readonly`) */
  ownerLabel: string | null;
}

export interface LockApi {
  acquire(key: EditLockKey): Promise<Result<AcquireLockResult>>;
  heartbeat(key: EditLockKey): Promise<Result<{ held: boolean }>>;
  release(key: EditLockKey): Promise<Result<void>>;
}

export interface EditLockSession {
  start(): void;
  /** Saves pending input (`flush`), then releases the lock. */
  stop(): Promise<void>;
}

/**
 * The lifecycle of one lock: take it, keep it alive, give it back. Pure (no React) so it can be tested with
 * fake timers. `flush` runs before the release so that pending input is saved while the lock is still held.
 */
export function createEditLockSession(
  api: LockApi,
  key: EditLockKey,
  onChange: (snapshot: LockSnapshot) => void,
  options: { flush?: () => Promise<unknown> | void } = {},
): EditLockSession {
  let timer: ReturnType<typeof setInterval> | null = null;
  let status: LockStatus = 'pending';
  let stopped = false;
  let starting: Promise<void> = Promise.resolve();

  const set = (next: LockStatus, ownerLabel: string | null = null) => {
    status = next;
    if (!stopped) onChange({ status: next, ownerLabel });
  };
  const clearTimer = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  return {
    start() {
      set('pending');
      starting = (async () => {
        const result = await api.acquire(key).catch(() => null);
        if (!result || !result.ok) return set('readonly');
        if (!result.value.acquired) return set('readonly', result.value.ownerLabel);
        set('held');
        if (stopped) return;
        timer = setInterval(() => {
          void api.heartbeat(key).then(
            (beat) => {
              // a transmission error is not a lost lock: the next beat tries again
              if (beat.ok && !beat.value.held) {
                clearTimer();
                set('lost');
              }
            },
            () => undefined,
          );
        }, HEARTBEAT_MS);
      })();
    },
    async stop() {
      stopped = true;
      clearTimer();
      await starting; // the answer to a pending acquire decides whether there is something to release
      if (status === 'held') {
        try {
          await options.flush?.();
        } catch {
          // saving failed: the message already reached the user, the lock must still be released
        }
        await api.release(key).catch(() => undefined);
      }
    },
  };
}

/**
 * Locks the record while the editor is open (server database). `enabled` is false for new records and issued
 * invoices. `flush` saves pending input just before the lock is released. `retry` tries to lock again.
 */
export function useEditLock(
  entityType: EditEntityType,
  entityId: number | null,
  enabled: boolean,
  flush?: () => Promise<unknown> | void,
): LockSnapshot & { retry: () => void } {
  const [snapshot, setSnapshot] = useState<LockSnapshot>({ status: 'off', ownerLabel: null });
  const [attempt, setAttempt] = useState(0);
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  const active = enabled && entityId !== null;
  useEffect(() => {
    if (!active) return;
    const session = createEditLockSession(
      window.swissbill.locks,
      { entityType, entityId },
      setSnapshot,
      { flush: () => flushRef.current?.() },
    );
    session.start();
    return () => {
      void session.stop();
    };
  }, [entityType, entityId, active, attempt]);

  const current: LockSnapshot = active ? snapshot : { status: 'off', ownerLabel: null };
  return { ...current, retry: () => setAttempt((n) => n + 1) };
}

/**
 * For actions that change a record without opening it (deleting): takes the lock for the duration of the action.
 * Returns the label of the other device if the record is locked by it, otherwise runs `action`.
 */
export async function withLock<T>(
  key: EditLockKey,
  action: () => Promise<T>,
): Promise<{ locked: string | null } | { value: T }> {
  const result = await window.swissbill.locks.acquire(key);
  if (result.ok && !result.value.acquired) return { locked: result.value.ownerLabel };
  try {
    return { value: await action() };
  } finally {
    void window.swissbill.locks.release(key);
  }
}
