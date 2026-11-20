import { Table, TableForeignKey, TableIndex, type MigrationInterface, type QueryRunner } from 'typeorm';

const nullableText = (name: string, extra: { default?: string } = {}) => ({
  name,
  type: 'text',
  isNullable: true,
  ...extra,
});

/**
 * Base schema (equals the former schema version 2 without triggers and CHECK constraints).
 * The rules of the triggers/CHECKs apply in the application code (constitution, principle III).
 * Amounts: whole rappen, quantities: thousandths (integer). Timestamps: ISO-8601 text.
 */
export class InitSchema1700000000001 implements MigrationInterface {
  name = 'InitSchema1700000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'settings',
        columns: [
          { name: 'id', type: 'integer', isPrimary: true },
          { name: 'sender_name', type: 'text', default: "''" },
          { name: 'sender_street', type: 'text', default: "''" },
          { name: 'sender_house_no', type: 'text', default: "''" },
          { name: 'sender_zip', type: 'text', default: "''" },
          { name: 'sender_city', type: 'text', default: "''" },
          { name: 'sender_country', type: 'text', default: "'CH'" },
          { name: 'sender_iban', type: 'text', default: "''" },
          { name: 'invoice_prefix', type: 'text', default: "'RE'" },
          nullableText('default_closing_text'),
          { name: 'default_payment_days', type: 'integer', default: 30 },
          { name: 'updated_at', type: 'text' },
        ],
      }),
    );
    // The one settings row; all other columns take their default values
    await queryRunner.query(`INSERT INTO "settings" ("id", "updated_at") VALUES (1, '${new Date().toISOString()}')`);

    await queryRunner.createTable(
      new Table({
        name: 'customers',
        columns: [
          { name: 'id', type: 'integer', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'name', type: 'text' },
          { name: 'street', type: 'text', default: "''" },
          { name: 'house_no', type: 'text', default: "''" },
          { name: 'zip', type: 'text' },
          { name: 'city', type: 'text' },
          { name: 'country', type: 'text', default: "'CH'" },
          nullableText('notes'),
          { name: 'created_at', type: 'text' },
          { name: 'updated_at', type: 'text' },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'invoices',
        columns: [
          { name: 'id', type: 'integer', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'status', type: 'text', default: "'draft'" },
          { name: 'number', type: 'text', isNullable: true, isUnique: true },
          { name: 'number_year', type: 'integer', isNullable: true },
          { name: 'number_seq', type: 'integer', isNullable: true },
          { name: 'invoice_date', type: 'text' },
          { name: 'due_date', type: 'text' },
          { name: 'customer_id', type: 'integer', isNullable: true },
          nullableText('sender_name'),
          nullableText('sender_street'),
          nullableText('sender_house_no'),
          nullableText('sender_zip'),
          nullableText('sender_city'),
          nullableText('sender_country', { default: "'CH'" }),
          nullableText('sender_iban'),
          nullableText('debtor_name'),
          nullableText('debtor_street'),
          nullableText('debtor_house_no'),
          nullableText('debtor_zip'),
          nullableText('debtor_city'),
          nullableText('debtor_country', { default: "'CH'" }),
          nullableText('closing_text'),
          nullableText('reference_type'),
          nullableText('reference'),
          { name: 'total_rappen', type: 'integer', default: 0 },
          { name: 'layout_version', type: 'integer', isNullable: true },
          nullableText('issued_at'),
          nullableText('paid_at'),
          nullableText('cancelled_at'),
          { name: 'created_at', type: 'text' },
          { name: 'updated_at', type: 'text' },
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
          new TableIndex({ name: 'idx_invoices_status_date', columnNames: ['status', 'invoice_date'] }),
          new TableIndex({ name: 'idx_invoices_debtor_name', columnNames: ['debtor_name'] }),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'invoice_items',
        columns: [
          { name: 'id', type: 'integer', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'invoice_id', type: 'integer' },
          { name: 'position', type: 'integer' },
          { name: 'description', type: 'text' },
          { name: 'quantity_milli', type: 'integer' },
          { name: 'unit_price_rappen', type: 'integer' },
          { name: 'amount_rappen', type: 'integer' },
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

    await queryRunner.createTable(
      new Table({
        name: 'number_counters',
        columns: [
          { name: 'year', type: 'integer', isPrimary: true },
          { name: 'last_seq', type: 'integer' },
        ],
      }),
    );
  }

  /** The schema only moves forward (constitution, principle III). */
  async down(): Promise<void> {}
}
