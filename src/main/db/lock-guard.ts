import type { DataSource, EntityManager } from 'typeorm';
import type { EditLockKey } from '@shared/ipc/db-connection';
import type { LockRepository } from './lock-repository';

/**
 * Write paths of customers and drafts ask the guard of their database whether this device may write.
 * Without an installed guard (local database) nothing is checked, like `unitOfWorkFor` it is one per DataSource.
 */
const guards = new WeakMap<DataSource, LockRepository>();

export function installLockGuard(dataSource: DataSource, locks: LockRepository): void {
  guards.set(dataSource, locks);
}

/** Throws `LOCK_LOST` if this device does not hold the lock; no-op without a guard. */
export async function assertLockOwned(
  dataSource: DataSource,
  manager: EntityManager,
  key: EditLockKey,
): Promise<void> {
  await guards.get(dataSource)?.assertOwned(manager, key);
}

/** Drops the lock row of a deleted record; no-op without a guard. */
export async function forgetLock(
  dataSource: DataSource,
  manager: EntityManager,
  key: EditLockKey,
): Promise<void> {
  await guards.get(dataSource)?.forget(manager, key);
}
