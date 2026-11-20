import { Table, type MigrationInterface, type QueryRunner } from 'typeorm';
import { columnType } from '../schema-types';

/**
 * Edit locks (feature 006): while a device edits a customer or a draft on a server database, the record is
 * locked for other devices. Rows carry the server clock (`CURRENT_TIMESTAMP`), never a device clock.
 * Only server databases use the table; the local database has a single device.
 */
export class AddEditLocks1700000000004 implements MigrationInterface {
  name = 'AddEditLocks1700000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('edit_locks')) return;
    await queryRunner.createTable(
      new Table({
        name: 'edit_locks',
        columns: [
          { name: 'entity_type', ...columnType(queryRunner, 'short', 16), isPrimary: true },
          { name: 'entity_id', type: 'integer', isPrimary: true },
          { name: 'owner_id', ...columnType(queryRunner, 'short', 36) },
          { name: 'owner_label', ...columnType(queryRunner, 'short', 100) },
          {
            name: 'acquired_at',
            ...columnType(queryRunner, 'timestamp'),
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'heartbeat_at',
            ...columnType(queryRunner, 'timestamp'),
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
    );
  }

  /** The schema only moves forward (constitution, principle III). */
  async down(): Promise<void> {}
}
