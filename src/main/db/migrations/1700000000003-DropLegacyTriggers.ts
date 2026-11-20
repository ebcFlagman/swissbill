import type { MigrationInterface, QueryRunner } from 'typeorm';

const LEGACY_TRIGGERS = [
  'invoices_immutable_update',
  'invoices_immutable_delete',
  'invoices_status_transition',
  'invoice_items_immutable_insert',
  'invoice_items_immutable_update',
  'invoice_items_immutable_delete',
];

/**
 * Removes the triggers from databases created before the switch to TypeORM. Their rules
 * (immutability, status changes) are now enforced by the persistence layer. New databases never have them.
 * Only SQLite knows these triggers; with other drivers the migration has no effect.
 */
export class DropLegacyTriggers1700000000003 implements MigrationInterface {
  name = 'DropLegacyTriggers1700000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'better-sqlite3') return;
    for (const trigger of LEGACY_TRIGGERS) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS "${trigger}"`);
    }
  }

  /** The schema only moves forward (constitution, principle III). */
  async down(): Promise<void> {}
}
