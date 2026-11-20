import { EntitySchema } from 'typeorm';
import type { InvoiceStatus } from '@shared/domain/invoice';
import type { ReferenceType } from '@shared/domain/reference';

/** Row of the `invoices` table (properties are named like the columns). Amounts are whole rappen. */
export interface InvoiceRow {
  id: number;
  status: InvoiceStatus;
  number: string | null;
  number_year: number | null;
  number_seq: number | null;
  invoice_date: string;
  due_date: string;
  customer_id: number | null;
  sender_name: string | null;
  sender_street: string | null;
  sender_house_no: string | null;
  sender_zip: string | null;
  sender_city: string | null;
  sender_country: string | null;
  sender_iban: string | null;
  debtor_name: string | null;
  debtor_street: string | null;
  debtor_house_no: string | null;
  debtor_zip: string | null;
  debtor_city: string | null;
  debtor_country: string | null;
  closing_text: string | null;
  reference_type: ReferenceType | null;
  reference: string | null;
  total_rappen: number;
  layout_version: number | null;
  issued_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

const text = { type: 'text', nullable: true } as const;

export const InvoiceEntity = new EntitySchema<InvoiceRow>({
  name: 'invoices',
  tableName: 'invoices',
  columns: {
    id: { type: 'integer', primary: true, generated: 'increment' },
    status: { type: 'text', default: "'draft'" },
    number: { ...text, unique: true },
    number_year: { type: 'integer', nullable: true },
    number_seq: { type: 'integer', nullable: true },
    invoice_date: { type: 'text' },
    due_date: { type: 'text' },
    customer_id: { type: 'integer', nullable: true },
    sender_name: text,
    sender_street: text,
    sender_house_no: text,
    sender_zip: text,
    sender_city: text,
    sender_country: { ...text, default: "'CH'" },
    sender_iban: text,
    debtor_name: text,
    debtor_street: text,
    debtor_house_no: text,
    debtor_zip: text,
    debtor_city: text,
    debtor_country: { ...text, default: "'CH'" },
    closing_text: text,
    reference_type: text,
    reference: text,
    total_rappen: { type: 'integer', default: 0 },
    layout_version: { type: 'integer', nullable: true },
    issued_at: text,
    paid_at: text,
    cancelled_at: text,
    created_at: { type: 'text' },
    updated_at: { type: 'text' },
  },
});
