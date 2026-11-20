import { z } from 'zod';
import { CHANNELS } from '@shared/ipc/api';
import type { AcquireLockResult, EditLockKey } from '@shared/ipc/db-connection';
import type { LockRepository } from '../db/lock-repository';
import { handle } from './handle';

const keySchema: z.ZodType<EditLockKey> = z.object({
  entityType: z.enum(['customer', 'invoice']),
  entityId: z.number().int().positive(),
});

/** Edit locks (server database); with the local database the repository answers `ok` without touching anything. */
export function registerLockHandlers(locks: LockRepository): void {
  handle<EditLockKey, AcquireLockResult>(CHANNELS.locksAcquire, keySchema, (key) =>
    locks.acquire(key),
  );
  handle<EditLockKey, { held: boolean }>(CHANNELS.locksHeartbeat, keySchema, async (key) => ({
    held: await locks.heartbeat(key),
  }));
  handle<EditLockKey, void>(CHANNELS.locksRelease, keySchema, (key) => locks.release(key));
}
