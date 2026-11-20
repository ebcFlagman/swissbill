import { EntitySchema } from 'typeorm';

/** Row of the `customers` table (properties are named like the columns). */
export interface CustomerRow {
  id: number;
  name: string;
  street: string;
  house_no: string;
  zip: string;
  city: string;
  country: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const CustomerEntity = new EntitySchema<CustomerRow>({
  name: 'customers',
  tableName: 'customers',
  columns: {
    id: { type: 'integer', primary: true, generated: 'increment' },
    name: { type: 'text' },
    street: { type: 'text', default: "''" },
    house_no: { type: 'text', default: "''" },
    zip: { type: 'text' },
    city: { type: 'text' },
    country: { type: 'text', default: "'CH'" },
    notes: { type: 'text', nullable: true },
    created_at: { type: 'text' },
    updated_at: { type: 'text' },
  },
});
