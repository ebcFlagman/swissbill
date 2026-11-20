import { TableColumn, type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Optional Geoapify API key for address suggestions (feature 004).
 * Only the value encrypted with the operating system encryption, never plain text; NULL = not set.
 */
export class AddGeoapifyKey1700000000002 implements MigrationInterface {
  name = 'AddGeoapifyKey1700000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'settings',
      new TableColumn({ name: 'geoapify_api_key', type: 'blob', isNullable: true }),
    );
  }

  /** The schema only moves forward (constitution, principle III). */
  async down(): Promise<void> {}
}
