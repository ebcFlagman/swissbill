import { TableColumn, type MigrationInterface, type QueryRunner } from 'typeorm';
import { columnType } from '../schema-types';

/**
 * Optional Geoapify API key for address suggestions (feature 004). NULL = not set.
 * Local database: only the value encrypted with the operating system encryption, never plain text.
 * Server database: the UTF-8 bytes of the key, so that all devices share it (feature 006).
 * Only adds the column if it is missing, so an interrupted run can be repeated.
 */
export class AddGeoapifyKey1700000000002 implements MigrationInterface {
  name = 'AddGeoapifyKey1700000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('settings', 'geoapify_api_key')) return;
    await queryRunner.addColumn(
      'settings',
      new TableColumn({
        name: 'geoapify_api_key',
        ...columnType(queryRunner, 'blob'),
        isNullable: true,
      }),
    );
  }

  /** The schema only moves forward (constitution, principle III). */
  async down(): Promise<void> {}
}
