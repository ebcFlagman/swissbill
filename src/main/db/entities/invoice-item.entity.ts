import { EntitySchema } from 'typeorm';

/** Row of the `invoice_items` table. Quantity in thousandths, prices and amounts in rappen. */
export interface InvoiceItemRow {
  id: number;
  invoice_id: number;
  position: number;
  description: string;
  quantity_milli: number;
  unit_price_rappen: number;
  amount_rappen: number;
}

export const InvoiceItemEntity = new EntitySchema<InvoiceItemRow>({
  name: 'invoice_items',
  tableName: 'invoice_items',
  columns: {
    id: { type: 'integer', primary: true, generated: 'increment' },
    invoice_id: { type: 'integer' },
    position: { type: 'integer' },
    description: { type: 'text' },
    quantity_milli: { type: 'integer' },
    unit_price_rappen: { type: 'integer' },
    amount_rappen: { type: 'integer' },
  },
});
