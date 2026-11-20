import { EntitySchema } from 'typeorm';

/** The single row (`id = 1`) of the `settings` table. */
export interface SettingsRow {
  id: number;
  sender_name: string;
  sender_street: string;
  sender_house_no: string;
  sender_zip: string;
  sender_city: string;
  sender_country: string;
  sender_iban: string;
  invoice_prefix: string;
  default_closing_text: string | null;
  default_payment_days: number;
  updated_at: string;
  /** local database: encrypted with the operating system encryption; server database: UTF-8 bytes (shared across devices) */
  geoapify_api_key: Buffer | null;
}

/**
 * The binary column type differs per database (`blob` vs. PostgreSQL `bytea`). Both schemas share the
 * name `settings`, so repositories can use `SettingsEntity` with every database.
 */
function createSettingsEntity(blobType: 'blob' | 'bytea'): EntitySchema<SettingsRow> {
  return new EntitySchema<SettingsRow>({
    name: 'settings',
    tableName: 'settings',
    columns: {
      id: { type: 'integer', primary: true },
      sender_name: { type: 'text', default: "''" },
      sender_street: { type: 'text', default: "''" },
      sender_house_no: { type: 'text', default: "''" },
      sender_zip: { type: 'text', default: "''" },
      sender_city: { type: 'text', default: "''" },
      sender_country: { type: 'text', default: "'CH'" },
      sender_iban: { type: 'text', default: "''" },
      invoice_prefix: { type: 'text', default: "'RE'" },
      default_closing_text: { type: 'text', nullable: true },
      default_payment_days: { type: 'integer', default: 30 },
      updated_at: { type: 'text' },
      geoapify_api_key: { type: blobType, nullable: true },
    },
  });
}

export const SettingsEntity = createSettingsEntity('blob');
/** For PostgreSQL (registered instead of `SettingsEntity`). */
export const PostgresSettingsEntity = createSettingsEntity('bytea');
