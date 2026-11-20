import type { EntityManager, DataSource } from 'typeorm';
import { AppException } from '@shared/ipc/errors';
import type { AcquireLockResult, EditLockKey } from '@shared/ipc/db-connection';
import { isUniqueViolation, type DbAdapter } from './adapters';

/** A lock expires after this many seconds without a heartbeat (FR-009a). */
export const LOCK_TTL_SECONDS = 300;

const TABLE = 'edit_locks';

export interface LockOptions {
  /** `false` for the local database (a single device): every call succeeds and nothing is read or written. */
  enabled?: boolean;
}

/**
 * Edit locks of a server database: while a device edits a customer or a draft, other devices see it read-only.
 * Time is always the database server's clock (`CURRENT_TIMESTAMP`), never a device clock, so differing device
 * clocks cannot let a lock expire too early or too late.
 */
export class LockRepository {
  private readonly enabled: boolean;

  constructor(
    private readonly dataSource: DataSource,
    private readonly adapter: DbAdapter,
    readonly ownerId: string,
    private readonly ownerLabel: string,
    options: LockOptions = {},
  ) {
    this.enabled = options.enabled ?? true;
  }

  private get expired(): string {
    return this.adapter.expiredCondition('heartbeat_at', LOCK_TTL_SECONDS);
  }

  private keyParams(key: EditLockKey) {
    return { type: key.entityType, id: key.entityId };
  }

  /** Locks the record for this device, or reports the label of the device that holds it. */
  async acquire(key: EditLockKey): Promise<AcquireLockResult> {
    if (!this.enabled) return { acquired: true };
    const params = this.keyParams(key);
    const where = 'entity_type = :type AND entity_id = :id';
    // Drop an expired lock first; each statement stands alone so a lost race never poisons a transaction
    await this.dataSource
      .createQueryBuilder()
      .delete()
      .from(TABLE)
      .where(where, params)
      .andWhere(this.expired)
      .execute();
    try {
      await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(TABLE, ['entity_type', 'entity_id', 'owner_id', 'owner_label'])
        .values({
          entity_type: key.entityType,
          entity_id: key.entityId,
          owner_id: this.ownerId,
          owner_label: this.ownerLabel,
        })
        .execute();
      return { acquired: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const holder = (await this.dataSource
      .createQueryBuilder()
      .select('l.owner_id', 'owner_id')
      .addSelect('l.owner_label', 'owner_label')
      .from(TABLE, 'l')
      .where(where, params)
      .getRawOne()) as { owner_id: string; owner_label: string } | undefined;
    if (!holder) return this.acquire(key); // released in the meantime: try again
    if (holder.owner_id === this.ownerId) {
      await this.heartbeat(key);
      return { acquired: true };
    }
    return { acquired: false, ownerLabel: holder.owner_label };
  }

  /** Extends this device's lock. `false` if the lock is gone, expired or belongs to another device. */
  async heartbeat(key: EditLockKey): Promise<boolean> {
    if (!this.enabled) return true;
    const result = await this.dataSource
      .createQueryBuilder()
      .update(TABLE)
      .set({ heartbeat_at: () => 'CURRENT_TIMESTAMP' })
      .where('entity_type = :type AND entity_id = :id AND owner_id = :owner', {
        ...this.keyParams(key),
        owner: this.ownerId,
      })
      .andWhere(`NOT (${this.expired})`)
      .execute();
    return (result.affected ?? 0) > 0;
  }

  /** Releases this device's lock (another device's lock is left alone). */
  async release(key: EditLockKey): Promise<void> {
    if (!this.enabled) return;
    await this.dataSource
      .createQueryBuilder()
      .delete()
      .from(TABLE)
      .where('entity_type = :type AND entity_id = :id AND owner_id = :owner', {
        ...this.keyParams(key),
        owner: this.ownerId,
      })
      .execute();
  }

  /** Throws `LOCK_LOST` unless this device holds a valid lock; call inside the write transaction. */
  async assertOwned(manager: EntityManager, key: EditLockKey): Promise<void> {
    if (!this.enabled) return;
    const row = await manager
      .createQueryBuilder()
      .select('l.owner_id', 'owner_id')
      .from(TABLE, 'l')
      .where('entity_type = :type AND entity_id = :id AND owner_id = :owner', {
        ...this.keyParams(key),
        owner: this.ownerId,
      })
      .andWhere(`NOT (${this.expired})`)
      .getRawOne();
    if (!row) {
      throw new AppException(
        'LOCK_LOST',
        'Die Bearbeitung ist nicht mehr gesperrt, weil die Sperre abgelaufen ist oder ein anderes Gerät den Datensatz bearbeitet. ' +
          'Die Änderungen wurden nicht gespeichert. Bitte neu laden.',
      );
    }
  }

  /** Removes the lock row of a record that was deleted (inside the deleting transaction). */
  async forget(manager: EntityManager, key: EditLockKey): Promise<void> {
    if (!this.enabled) return;
    await manager
      .createQueryBuilder()
      .delete()
      .from(TABLE)
      .where('entity_type = :type AND entity_id = :id', this.keyParams(key))
      .execute();
  }

  /** Releases everything this device still holds (on shutdown). */
  async releaseAll(): Promise<void> {
    if (!this.enabled) return;
    await this.dataSource
      .createQueryBuilder()
      .delete()
      .from(TABLE)
      .where('owner_id = :owner', { owner: this.ownerId })
      .execute();
  }
}
