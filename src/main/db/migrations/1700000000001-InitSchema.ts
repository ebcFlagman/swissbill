import {
  Table,
  TableForeignKey,
  TableIndex,
  type MigrationInterface,
  type QueryRunner,
  type TableColumnOptions,
} from 'typeorm';
import { columnType, type TypeKind } from '../schema-types';

/**
 * Base schema (equals the former schema version 2 without triggers and CHECK constraints).
 * The rules of the triggers/CHECKs apply in the application code (constitution, principle III).
 * Amounts: whole rappen, quantities: thousandths (integer). Timestamps: ISO-8601 text.
 *
 * Column types depend on the driver (see `schema-types.ts`): SQLite keeps `text`/`integer` exactly as
 * before; servers get bounded `varchar`, `bigint` amounts and `bytea`/`blob`. The migration only
 * creates what is missing, so an interrupted run (MySQL/MariaDB cannot roll back DDL) can be repeated.
 */
export class InitSchema1700000000001 implements MigrationInterface {
  name = 'InitSchema1700000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    const col = (
      name: string,
      kind: TypeKind,
      options: { length?: number; nullable?: boolean; default?: string | number } = {},
    ): TableColumnOptions => {
      const { length, nullable, default: def } = options;
      return {
        name,
        ...columnType(queryRunner, kind, length),
        ...(nullable ? { isNullable: true } : {}),
        ...(def !== undefined ? { default: def } : {}),
      };
    };
    const id: TableColumnOptions = {
      name: 'id',
      type: 'integer',
      isPrimary: true,
      isGenerated: true,
      generationStrategy: 'increment',
    };
    const address = (prefix: string, nullable: boolean, withIban = false): TableColumnOptions[] => [
      col(`${prefix}name`, 'short', {
        length: 70,
        nullable,
        ...(nullable ? {} : { default: "''" }),
      }),
      col(`${prefix}street`, 'short', {
        length: 70,
        nullable,
        ...(nullable ? {} : { default: "''" }),
      }),
      col(`${prefix}house_no`, 'short', {
        length: 16,
        nullable,
        ...(nullable ? {} : { default: "''" }),
      }),
      col(`${prefix}zip`, 'short', {
        length: 16,
        nullable,
        ...(nullable ? {} : { default: "''" }),
      }),
      col(`${prefix}city`, 'short', {
        length: 35,
        nullable,
        ...(nullable ? {} : { default: "''" }),
      }),
      col(`${prefix}country`, 'short', { length: 2, nullable, default: "'CH'" }),
      ...(withIban
        ? [
            col(`${prefix}iban`, 'short', {
              length: 21,
              nullable,
              ...(nullable ? {} : { default: "''" }),
            }),
          ]
        : []),
    ];

    if (!(await queryRunner.hasTable('settings'))) {
      await queryRunner.createTable(
        new Table({
          name: 'settings',
          columns: [
            { name: 'id', type: 'integer', isPrimary: true },
            ...address('sender_', false, true),
            col('invoice_prefix', 'short', { length: 10, default: "'RE'" }),
            col('default_closing_text', 'text', { nullable: true }),
            col('default_payment_days', 'int', { default: 30 }),
            col('updated_at', 'short', { length: 32 }),
          ],
        }),
      );
      // The one settings row; all other columns take their default values
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('settings', ['id', 'updated_at'])
        .values({ id: 1, updated_at: new Date().toISOString() })
        .execute();
    }

    if (!(await queryRunner.hasTable('customers'))) {
      await queryRunner.createTable(
        new Table({
          name: 'customers',
          columns: [
            id,
            col('name', 'short', { length: 70 }),
            col('street', 'short', { length: 70, default: "''" }),
            col('house_no', 'short', { length: 16, default: "''" }),
            col('zip', 'short', { length: 16 }),
            col('city', 'short', { length: 35 }),
            col('country', 'short', { length: 2, default: "'CH'" }),
            col('notes', 'text', { nullable: true }),
            col('created_at', 'short', { length: 32 }),
            col('updated_at', 'short', { length: 32 }),
          ],
        }),
      );
    }

    if (!(await queryRunner.hasTable('invoices'))) {
      await queryRunner.createTable(
        new Table({
          name: 'invoices',
          columns: [
            id,
            col('status', 'short', { length: 16, default: "'draft'" }),
            { ...col('number', 'short', { length: 40, nullable: true }), isUnique: true },
            col('number_year', 'int', { nullable: true }),
            col('number_seq', 'int', { nullable: true }),
            col('invoice_date', 'short', { length: 32 }),
            col('due_date', 'short', { length: 32 }),
            col('customer_id', 'int', { nullable: true }),
            ...address('sender_', true, true),
            ...address('debtor_', true),
            col('closing_text', 'text', { nullable: true }),
            col('reference_type', 'short', { length: 8, nullable: true }),
            col('reference', 'short', { length: 40, nullable: true }),
            col('total_rappen', 'bigint', { default: 0 }),
            col('layout_version', 'int', { nullable: true }),
            col('issued_at', 'short', { length: 32, nullable: true }),
            col('paid_at', 'short', { length: 32, nullable: true }),
            col('cancelled_at', 'short', { length: 32, nullable: true }),
            col('created_at', 'short', { length: 32 }),
            col('updated_at', 'short', { length: 32 }),
          ],
          foreignKeys: [
            new TableForeignKey({
              columnNames: ['customer_id'],
              referencedTableName: 'customers',
              referencedColumnNames: ['id'],
              onDelete: 'SET NULL',
            }),
          ],
          indices: [
            new TableIndex({
              name: 'idx_invoices_status_date',
              columnNames: ['status', 'invoice_date'],
            }),
            new TableIndex({ name: 'idx_invoices_debtor_name', columnNames: ['debtor_name'] }),
          ],
        }),
      );
    }

    if (!(await queryRunner.hasTable('invoice_items'))) {
      await queryRunner.createTable(
        new Table({
          name: 'invoice_items',
          columns: [
            id,
            col('invoice_id', 'int'),
            col('position', 'int'),
            col('description', 'short', { length: 500 }),
            col('quantity_milli', 'bigint'),
            col('unit_price_rappen', 'bigint'),
            col('amount_rappen', 'bigint'),
          ],
          foreignKeys: [
            new TableForeignKey({
              columnNames: ['invoice_id'],
              referencedTableName: 'invoices',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            }),
          ],
          uniques: [{ name: 'uq_invoice_items_position', columnNames: ['invoice_id', 'position'] }],
        }),
      );
    }

    if (!(await queryRunner.hasTable('number_counters'))) {
      await queryRunner.createTable(
        new Table({
          name: 'number_counters',
          columns: [{ name: 'year', type: 'integer', isPrimary: true }, col('last_seq', 'int')],
        }),
      );
    }
  }

  /** The schema only moves forward (constitution, principle III). */
  async down(): Promise<void> {}
}
