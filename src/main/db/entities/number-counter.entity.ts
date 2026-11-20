import { EntitySchema } from 'typeorm';

/** Last assigned invoice number sequence per calendar year. */
export interface NumberCounterRow {
  year: number;
  last_seq: number;
}

export const NumberCounterEntity = new EntitySchema<NumberCounterRow>({
  name: 'number_counters',
  tableName: 'number_counters',
  columns: {
    year: { type: 'integer', primary: true },
    last_seq: { type: 'integer' },
  },
});
