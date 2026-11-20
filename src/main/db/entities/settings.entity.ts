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
  /** encrypted with the operating system encryption; never plain text */
  geoapify_api_key: Buffer | null;
}

export const SettingsEntity = new EntitySchema<SettingsRow>({
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
    geoapify_api_key: { type: 'blob', nullable: true },
  },
});
